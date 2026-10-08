'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { updateVideo } from '@/app/actions';
import { aiHooks } from '@/app/ai-actions';
import type { HookIdea } from '@/lib/ai';
import { COLUMN_LABEL, type Rubric, type Snippet, type Stage, type Video } from '@/lib/types';
import { IconSpark } from '@/components/Icons';

const STAGES: Stage[] = ['idea', 'script', 'production', 'ready'];

export function VideoEditor({
  video,
  projects,
  rubrics,
  snippets,
  ai,
  sequels,
}: {
  video: Video;
  projects: { id: number; name: string }[];
  rubrics: Rubric[];
  snippets: Snippet[];
  ai: boolean;
  sequels: { id: number; title: string }[];
}) {
  const [projectId, setProjectId] = useState(video.project_id);
  const [hook, setHook] = useState(video.hook);
  const [caption, setCaption] = useState(video.caption);
  const [hashtags, setHashtags] = useState(video.hashtags);
  const [hooks, setHooks] = useState<HookIdea[] | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const [aiPending, startAi] = useTransition();
  const projectRubrics = rubrics.filter((r) => r.project_id === projectId);
  const byKind = (k: Snippet['kind']) => snippets.filter((s) => s.kind === k);

  return (
    <section className="card">
      <div className="card-head">
        <div>
          <h2>Карточка ролика</h2>
          <p>Хук, сценарий и подпись по умолчанию — из неё собираются подписи для площадок</p>
        </div>
      </div>
      <form
        className="card-body stack"
        action={(fd) =>
          start(async () => {
            await updateVideo(video.id, fd);
            setSaved(true);
            setTimeout(() => setSaved(false), 2500);
          })
        }
      >
        <div className="grid-2">
          <label className="field" style={{ gridColumn: '1 / -1' }}>
            <span>Название (для себя и заголовка YouTube)</span>
            <input className="input" name="title" defaultValue={video.title} required />
          </label>
          <label className="field">
            <span>Проект</span>
            <select className="select" name="project_id" value={projectId} onChange={(e) => setProjectId(Number(e.target.value))}>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Рубрика</span>
            <select className="select" name="rubric_id" defaultValue={video.rubric_id ?? ''} key={projectId}>
              <option value="">Без рубрики</option>
              {projectRubrics.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Этап</span>
            <select className="select" name="stage" defaultValue={video.stage}>
              {STAGES.map((s) => (
                <option key={s} value={s}>
                  {COLUMN_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="field">
          <div className="spread">
            <span className="label">Хук — первая фраза (до 3 секунд)</span>
            {ai && (
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                disabled={aiPending}
                onClick={() =>
                  startAi(async () => {
                    setAiError(null);
                    const r = await aiHooks(video.id);
                    if (r.ok) setHooks(r.data);
                    else setAiError(r.error);
                  })
                }
              >
                <IconSpark size={14} /> {aiPending ? 'Думаю…' : 'Варианты хука'}
              </button>
            )}
          </div>
          <input className="input" name="hook" value={hook} onChange={(e) => setHook(e.target.value)} placeholder="Например: «Банк не скажет вам про это»" />
          {byKind('hook').length > 0 && (
            <div className="row small">
              <span className="muted">Шаблоны:</span>
              {byKind('hook').map((s) => (
                <button key={s.id} type="button" className="chip" style={{ border: 0, cursor: 'pointer' }} onClick={() => setHook(s.text)}>
                  {s.text.length > 40 ? `${s.text.slice(0, 40)}…` : s.text}
                </button>
              ))}
            </div>
          )}
          {aiError && <div className="notice notice-error">{aiError}</div>}
          {hooks && (
            <div className="stack-sm" style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 10 }}>
              {hooks.map((h, i) => (
                <button
                  key={i}
                  type="button"
                  className="btn btn-ghost"
                  style={{ height: 'auto', padding: '6px 8px', justifyContent: 'flex-start', textAlign: 'left', whiteSpace: 'normal', display: 'block' }}
                  onClick={() => setHook(h.text)}
                >
                  <div style={{ fontWeight: 600 }}>«{h.text}»</div>
                  <div className="small muted" style={{ fontWeight: 400 }}>
                    {h.why}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <label className="field">
          <span>Сценарий</span>
          <textarea className="textarea" name="script" rows={5} defaultValue={video.script} placeholder={'0–3 с: хук\n3–20 с: суть, один пример\n20–30 с: вывод и призыв'} />
        </label>

        <div className="field">
          <span className="label">Подпись по умолчанию</span>
          <textarea className="textarea" name="caption" rows={3} value={caption} onChange={(e) => setCaption(e.target.value)} />
          {byKind('cta').length > 0 && (
            <div className="row small">
              <span className="muted">Призывы:</span>
              {byKind('cta').map((s) => (
                <button key={s.id} type="button" className="chip" style={{ border: 0, cursor: 'pointer' }} onClick={() => setCaption((c) => `${c.trim()}\n\n${s.text}`.trim())}>
                  + {s.text.length > 36 ? `${s.text.slice(0, 36)}…` : s.text}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="field">
          <span className="label">Хештеги ролика</span>
          <input className="input" name="hashtags" value={hashtags} onChange={(e) => setHashtags(e.target.value)} placeholder="#тема #ниша" />
          {byKind('hashtags').length > 0 && (
            <div className="row small">
              <span className="muted">Наборы:</span>
              {byKind('hashtags').map((s) => (
                <button key={s.id} type="button" className="chip" style={{ border: 0, cursor: 'pointer' }} onClick={() => setHashtags((h) => `${h} ${s.text}`.trim())}>
                  + {s.text.length > 36 ? `${s.text.slice(0, 36)}…` : s.text}
                </button>
              ))}
            </div>
          )}
          <span className="hint">К ним добавятся хештеги проекта. YouTube получит #shorts автоматически.</span>
        </div>

        <label className="field">
          <span>Заметки</span>
          <textarea className="textarea" name="notes" rows={2} defaultValue={video.notes} placeholder="Реквизит, локация, референсы, вопросы из комментариев…" />
        </label>

        {sequels.length > 0 && (
          <div className="small">
            <span className="muted">Продолжения: </span>
            {sequels.map((s, i) => (
              <span key={s.id}>
                {i > 0 && ', '}
                <Link href={`/content/${s.id}`} className="link">
                  {s.title}
                </Link>
              </span>
            ))}
          </div>
        )}

        <div className="row">
          <button className="btn btn-primary" disabled={pending}>
            {pending ? 'Сохраняем…' : 'Сохранить'}
          </button>
          {saved && <span className="small" style={{ color: 'var(--good-ink)' }}>Сохранено</span>}
        </div>
      </form>
    </section>
  );
}
