'use client';

import Link from 'next/link';
import { useOptimistic, useState, useTransition } from 'react';
import { createIdea, queueVideo, setStage } from '@/app/actions';
import { fmtDate, fmtDuration, fmtNum } from '@/lib/format';
import type { BoardCard } from '@/lib/queries';
import { COLUMN_LABEL, type Column, type Rubric, type Stage } from '@/lib/types';
import { IconPlus, IconQueue } from '@/components/Icons';
import { PlatformTag, ProjectTag, Thumb } from '@/components/ui';

const COLUMNS: Column[] = ['idea', 'script', 'production', 'ready', 'scheduled', 'published'];
const DROPPABLE: Column[] = ['idea', 'script', 'production', 'ready'];

export function Board({
  cards,
  projects,
  rubrics,
  tz,
}: {
  cards: BoardCard[];
  projects: { id: number; name: string; color: number }[];
  rubrics: Rubric[];
  tz: string;
}) {
  const [optimistic, move] = useOptimistic(cards, (state, { id, stage }: { id: number; stage: Stage }) =>
    state.map((c) => (c.id === id ? { ...c, stage, column: stage } : c)),
  );
  const [, start] = useTransition();
  const [dragId, setDragId] = useState<number | null>(null);
  const [over, setOver] = useState<Column | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const multi = projects.length > 1;

  function drop(col: Column) {
    setOver(null);
    const card = optimistic.find((c) => c.id === dragId);
    setDragId(null);
    if (!card || !DROPPABLE.includes(col) || card.column === col) return;
    if (card.column === 'scheduled' || card.column === 'published') return;
    start(async () => {
      move({ id: card.id, stage: col as Stage });
      await setStage(card.id, col as Stage);
    });
  }

  function queue(id: number) {
    start(async () => {
      const r = await queueVideo(id);
      setToast(r.message);
      setTimeout(() => setToast(null), 4000);
    });
  }

  return (
    <>
      {toast && <div className="notice notice-info">{toast}</div>}
      <div className="board">
        {COLUMNS.map((col) => {
          const list = optimistic
            .filter((c) => c.column === col)
            .sort((a, b) =>
              col === 'scheduled' ? (a.nextAt ?? '').localeCompare(b.nextAt ?? '') : col === 'published' ? 0 : b.updatedAt.localeCompare(a.updatedAt),
            );
          return (
            <section
              key={col}
              className="column"
              data-over={over === col && DROPPABLE.includes(col)}
              onDragOver={(e) => {
                if (DROPPABLE.includes(col)) {
                  e.preventDefault();
                  setOver(col);
                }
              }}
              onDragLeave={() => setOver((o) => (o === col ? null : o))}
              onDrop={() => drop(col)}
              aria-label={COLUMN_LABEL[col]}
            >
              <div className="column-head">
                <span>{COLUMN_LABEL[col]}</span>
                <span className="chip">{list.length}</span>
              </div>
              {col === 'idea' && <QuickIdea projects={projects} rubrics={rubrics} />}
              {list.map((c) => (
                <article
                  key={c.id}
                  className="vcard"
                  draggable={DROPPABLE.includes(c.column)}
                  data-dragging={dragId === c.id}
                  onDragStart={() => setDragId(c.id)}
                  onDragEnd={() => setDragId(null)}
                >
                  <Link href={`/content/${c.id}`}>
                    <Thumb thumb={c.thumb} title={c.title} color={c.color} width={34} />
                  </Link>
                  <div className="stack-sm" style={{ minWidth: 0, gap: 4 }}>
                    <Link href={`/content/${c.id}`} className="vcard-title">
                      {c.title}
                    </Link>
                    {multi && (
                      <span className="small muted">
                        <ProjectTag name={c.projectName} color={c.color} />
                      </span>
                    )}
                    <div className="row small muted" style={{ gap: 6 }}>
                      {c.rubric && <span className="chip">{c.rubric}</span>}
                      {c.duration > 0 && <span>{fmtDuration(c.duration)}</span>}
                      {c.column === 'ready' && !c.hasFile && (
                        <span className="badge badge-warning">нет файла</span>
                      )}
                    </div>
                    {c.posts.length > 0 && (
                      <div className="row small" style={{ gap: 8 }}>
                        {c.posts.map((p, i) => (
                          <span key={i} className="row" style={{ gap: 3 }} title={p.status}>
                            <PlatformTag platform={p.platform} label={false} />
                            {p.status === 'failed' && <span className="badge badge-critical">ошибка</span>}
                          </span>
                        ))}
                        {c.column === 'published' && <span className="muted num">{fmtNum(c.views)} просм.</span>}
                      </div>
                    )}
                    {c.column === 'scheduled' && c.nextAt && <span className="small ink-2">{fmtDate(c.nextAt, tz)}</span>}
                    {c.column === 'ready' && (
                      <button className="btn btn-sm" style={{ justifySelf: 'start' }} onClick={() => queue(c.id)}>
                        <IconQueue size={14} /> В очередь
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </section>
          );
        })}
      </div>
    </>
  );
}

function QuickIdea({ projects, rubrics }: { projects: { id: number; name: string }[]; rubrics: Rubric[] }) {
  const [open, setOpen] = useState(false);
  const [projectId, setProjectId] = useState(projects[0]?.id ?? 0);
  if (!open) {
    return (
      <button className="btn btn-sm btn-ghost" style={{ justifyContent: 'flex-start' }} onClick={() => setOpen(true)}>
        <IconPlus size={14} /> Идея
      </button>
    );
  }
  const projectRubrics = rubrics.filter((r) => r.project_id === projectId);
  return (
    <form
      className="card stack"
      style={{ padding: 10, gap: 8 }}
      action={async (fd) => {
        await createIdea(fd);
        setOpen(false);
      }}
    >
      <input className="input" name="title" placeholder="О чём ролик?" autoFocus required />
      <input className="input" name="hook" placeholder="Хук (первая фраза), необязательно" />
      {projects.length > 1 ? (
        <select className="select" name="project_id" value={projectId} onChange={(e) => setProjectId(Number(e.target.value))}>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      ) : (
        <input type="hidden" name="project_id" value={projectId} />
      )}
      {projectRubrics.length > 0 && (
        <select className="select" name="rubric_id" defaultValue="">
          <option value="">Без рубрики</option>
          {projectRubrics.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      )}
      <div className="row">
        <button className="btn btn-primary btn-sm">Добавить</button>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => setOpen(false)}>
          Отмена
        </button>
      </div>
    </form>
  );
}
