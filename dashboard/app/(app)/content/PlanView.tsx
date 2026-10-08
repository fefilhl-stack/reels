'use client';

import Link from 'next/link';
import { useEffect, useMemo, useOptimistic, useRef, useState, useTransition, type ReactNode } from 'react';
import { attachFile, createScript, recomputePlanDates, scheduleAllReady, scheduleScript, updateScriptField, type ScriptField } from '@/app/actions';
import { aiFillScript, aiIdeas, saveIdea } from '@/app/ai-actions';
import type { ContentIdea } from '@/lib/ai';
import { fmtDuration, fmtNum } from '@/lib/format';
import { countWords, rangeState, ruDate, STATUS_TONE, weekdayOf } from '@/lib/plan';
import type { PlanRow } from '@/lib/queries';
import { STATUSES, type ScriptStatus } from '@/lib/types';
import { IconCheck, IconExternal, IconPlus, IconSpark, IconUpload, PlatformIcon } from '@/components/Icons';
import { Thumb } from '@/components/ui';
import { uploadVideo } from '@/components/upload';

type Range = { min: number; max: number } | null;
type Edit = { id: number; field: ScriptField; value: string };

const WD = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const FIELD_KEY: Partial<Record<ScriptField, keyof PlanRow>> = {
  title: 'title',
  hook: 'hook',
  cover_text: 'coverText',
  shot: 'shot',
  script: 'script',
  cta: 'cta',
  caption: 'caption',
  hashtags: 'hashtags',
  notes: 'notes',
  rubric: 'rubric',
  status: 'status',
  plan_date: 'planDate',
  plan_time: 'planTime',
};

function applyEdit(rows: PlanRow[], e: Edit): PlanRow[] {
  return rows.map((r) => {
    if (r.id !== e.id) return r;
    if (e.field === 'number') return { ...r, number: Number(e.value) || r.number };
    const key = FIELD_KEY[e.field];
    if (!key) return r;
    const next = { ...r, [key]: e.value } as PlanRow;
    if (e.field === 'script') next.words = countWords(e.value);
    return next;
  });
}

const isActive = (s: string) => s === 'scheduled' || s === 'publishing' || s === 'processing';

export function PlanView({
  projectId,
  rows,
  rubrics,
  ctas,
  wordsNorm,
  lengthNorm,
  accounts,
  demoOnly,
  today,
  tz,
  ai,
}: {
  projectId: number;
  rows: PlanRow[];
  rubrics: string[];
  ctas: string[];
  wordsNorm: Range;
  lengthNorm: Range;
  accounts: number;
  demoOnly: boolean;
  today: string;
  tz: string;
  ai: boolean;
}) {
  const [list, optimisticEdit] = useOptimistic(rows, applyEdit);
  const [, start] = useTransition();
  const [mode, setMode] = useState<'compact' | 'full'>('compact');
  const [filter, setFilter] = useState<'all' | 'open' | ScriptStatus>('all');
  const [query, setQuery] = useState('');
  const [uploads, setUploads] = useState<Record<number, { progress: number; error?: string }>>({});
  const [busy, setBusy] = useState<Record<number, string>>({});
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [dragRow, setDragRow] = useState<number | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const target = useRef<number | null>(null);
  const bulkInput = useRef<HTMLInputElement>(null);
  const now = Date.now();

  useEffect(() => {
    try {
      const saved = localStorage.getItem('plan.mode');
      if (saved === 'full' || saved === 'compact') setMode(saved);
    } catch {
      /* private mode */
    }
  }, []);
  const switchMode = (m: 'compact' | 'full') => {
    setMode(m);
    try {
      localStorage.setItem('plan.mode', m);
    } catch {
      /* ignore */
    }
  };

  const say = (ok: boolean, text: string) => {
    setNotice({ ok, text });
    window.setTimeout(() => setNotice((n) => (n?.text === text ? null : n)), 6000);
  };

  function save(id: number, field: ScriptField, value: string) {
    start(async () => {
      optimisticEdit({ id, field, value });
      const r = await updateScriptField(id, field, value);
      if (!r.ok) say(false, r.message ?? 'Не сохранилось');
    });
  }

  async function upload(id: number, file: File) {
    setUploads((u) => ({ ...u, [id]: { progress: 0 } }));
    try {
      const up = await uploadVideo(file, (p) => setUploads((u) => ({ ...u, [id]: { progress: p } })));
      await attachFile(id, up);
      setUploads((u) => {
        const { [id]: _, ...rest } = u;
        return rest;
      });
    } catch (e) {
      setUploads((u) => ({ ...u, [id]: { progress: 0, error: (e as Error).message } }));
    }
  }

  function pick(id: number) {
    target.current = id;
    fileInput.current?.click();
  }

  async function bulk(files: FileList | null) {
    if (!files?.length) return;
    const skipped: string[] = [];
    const jobs: [number, File][] = [];
    for (const f of Array.from(files)) {
      const n = Number(/(\d+)/.exec(f.name)?.[1]);
      const row = list.find((r) => r.number === n);
      if (row) jobs.push([row.id, f]);
      else skipped.push(f.name);
    }
    if (skipped.length) say(false, `Не нашёл сценарий по номеру в имени файла: ${skipped.join(', ')}`);
    for (const [id, f] of jobs) await upload(id, f);
    if (jobs.length) say(true, `Загружено роликов: ${jobs.length}`);
  }

  function run(id: number, label: string, fn: () => Promise<{ ok: boolean; message: string }>) {
    setBusy((b) => ({ ...b, [id]: label }));
    start(async () => {
      const r = await fn();
      say(r.ok, r.message);
      setBusy((b) => {
        const { [id]: _, ...rest } = b;
        return rest;
      });
    });
  }

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: list.length, open: 0 };
    for (const s of STATUSES) c[s] = 0;
    for (const r of list) {
      c[r.status]++;
      if (r.status !== 'Опубликован') c.open++;
    }
    return c;
  }, [list]);

  const hasVideo = (r: PlanRow) => !!r.file || (demoOnly && r.status === 'Смонтирован');
  const ready = list.filter(
    (r) => accounts > 0 && hasVideo(r) && r.planAt && new Date(r.planAt).getTime() > now && !r.posts.some((p) => isActive(p.status) || p.status === 'published'),
  ).length;

  const q = query.trim().toLowerCase();
  const shown = list.filter(
    (r) =>
      (filter === 'all' || (filter === 'open' ? r.status !== 'Опубликован' : r.status === filter)) &&
      (!q || `${r.number} ${r.title} ${r.hook} ${r.script} ${r.rubric}`.toLowerCase().includes(q)),
  );
  const full = mode === 'full';

  return (
    <section className="stack" style={{ gap: 12 }}>
      <div className="plan-toolbar">
        <button
          className="btn btn-primary"
          onClick={() =>
            start(async () => {
              await createScript(projectId);
              setFilter('all');
            })
          }
        >
          <IconPlus /> Сценарий
        </button>
        <button className="btn" onClick={() => bulkInput.current?.click()} title="Файлы с номером сценария в названии, например 12.mp4 или «12 тема.mov»">
          <IconUpload /> Ролики по номерам
        </button>
        <button className="btn" disabled={!ready} onClick={() => run(-1, 'all', () => scheduleAllReady(projectId))}>
          Запланировать загруженные{ready ? ` (${ready})` : ''}
        </button>
        <button
          className="btn btn-ghost"
          onClick={() => {
            if (confirm('Пересчитать даты всех сценариев от даты старта по расписанию проекта? Даты, изменённые вручную, тоже пересчитаются.'))
              start(async () => say(true, await recomputePlanDates(projectId)));
          }}
        >
          Пересчитать даты
        </button>
        <ExportMenu projectId={projectId} onDone={say} />
        {ai && <AiIdeas projectId={projectId} />}
        <div style={{ flex: 1 }} />
        <input className="input" style={{ width: 200 }} placeholder="Поиск по сценариям" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="segmented" aria-label="Вид таблицы">
          <button aria-current={!full ? 'true' : undefined} onClick={() => switchMode('compact')}>
            Компактно
          </button>
          <button aria-current={full ? 'true' : undefined} onClick={() => switchMode('full')}>
            Все столбцы
          </button>
        </div>
      </div>

      <div className="row" style={{ gap: 6 }}>
        {(['all', 'open', ...STATUSES] as const).map((f) => (
          <button key={f} className="chip chip-btn" aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {f === 'all' ? 'Все' : f === 'open' ? 'Не опубликованы' : f} · {counts[f]}
          </button>
        ))}
      </div>

      {notice && <div className={`notice ${notice.ok ? 'notice-ok' : 'notice-error'}`}>{notice.text}</div>}

      <input
        ref={fileInput}
        type="file"
        accept="video/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f && target.current) void upload(target.current, f);
          e.target.value = '';
        }}
      />
      <input
        ref={bulkInput}
        type="file"
        accept="video/*"
        multiple
        hidden
        onChange={(e) => {
          void bulk(e.target.files);
          e.target.value = '';
        }}
      />
      <datalist id="plan-rubrics">
        {rubrics.map((r) => (
          <option key={r} value={r} />
        ))}
      </datalist>
      <datalist id="plan-ctas">
        {ctas.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

      <div className="plan-scroll card">
        <table className={`plan ${full ? 'plan-full' : ''}`}>
          <thead>
            <tr>
              <th className="col-num">№</th>
              <th className="col-date">Дата</th>
              {full && <th className="col-time">Время</th>}
              <th className="col-rubric">Рубрика</th>
              <th className="col-title">{full ? 'Тема' : 'Тема и хук'}</th>
              {full && <th className="col-hook">Хук</th>}
              {full && <th className="col-cover">Обложка</th>}
              {full && <th className="col-shot">Кадр</th>}
              <th className="col-script">Текст озвучки</th>
              <th className="col-words" title={wordsNorm ? `Норма ${wordsNorm.min}–${wordsNorm.max}` : undefined}>
                Слов
              </th>
              {full && <th className="col-cta">Призыв</th>}
              {full && <th className="col-caption">Подпись</th>}
              {full && <th className="col-tags">Хэштеги</th>}
              <th className="col-status">Статус</th>
              <th className="col-video">Ролик</th>
              {full && <th className="col-notes">Заметки</th>}
              <th className="col-actions" />
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const at = r.planAt ? new Date(r.planAt).getTime() : null;
              const published = r.posts.some((p) => p.status === 'published');
              const overdue = !!at && at < now && r.status !== 'Опубликован' && !published;
              const words = rangeState(r.words, wordsNorm);
              return (
                <tr
                  key={r.id}
                  data-today={r.planDate === today || undefined}
                  data-overdue={overdue || undefined}
                  data-drag={dragRow === r.id || undefined}
                  onDragOver={(e) => {
                    if (e.dataTransfer.types.includes('Files')) {
                      e.preventDefault();
                      setDragRow(r.id);
                    }
                  }}
                  onDragLeave={() => setDragRow((d) => (d === r.id ? null : d))}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragRow(null);
                    const f = e.dataTransfer.files?.[0];
                    if (f) void upload(r.id, f);
                  }}
                >
                  <td className="col-num">
                    <Cell value={String(r.number)} type="number" onSave={(v) => save(r.id, 'number', v)} clamp={1} className="cell-num" />
                  </td>
                  <td className="col-date">
                    <Cell
                      value={r.planDate ?? ''}
                      type="date"
                      onSave={(v) => save(r.id, 'plan_date', v)}
                      display={
                        r.planDate ? (
                          <span>
                            {ruDate(r.planDate).slice(0, 5)} <span className="muted">{WD[weekdayOf(r.planDate) - 1]}</span>
                            {!full && r.planTime ? <span className="muted small" style={{ display: 'block' }}>{r.planTime}</span> : null}
                          </span>
                        ) : undefined
                      }
                      clamp={2}
                    />
                    {overdue && <span className="badge badge-critical">просрочен</span>}
                  </td>
                  {full && (
                    <td className="col-time">
                      <Cell value={r.planTime ?? ''} type="time" onSave={(v) => save(r.id, 'plan_time', v)} clamp={1} />
                    </td>
                  )}
                  <td className="col-rubric">
                    <Cell value={r.rubric} list="plan-rubrics" onSave={(v) => save(r.id, 'rubric', v)} clamp={2} />
                  </td>
                  <td className="col-title">
                    <Cell value={r.title} onSave={(v) => save(r.id, 'title', v)} clamp={2} className="cell-title" />
                    {!full && <Cell value={r.hook} onSave={(v) => save(r.id, 'hook', v)} multiline clamp={2} className="cell-sub" placeholder="хук…" />}
                  </td>
                  {full && (
                    <td className="col-hook">
                      <Cell value={r.hook} onSave={(v) => save(r.id, 'hook', v)} multiline clamp={3} />
                    </td>
                  )}
                  {full && (
                    <td className="col-cover">
                      <Cell value={r.coverText} onSave={(v) => save(r.id, 'cover_text', v)} multiline clamp={3} />
                    </td>
                  )}
                  {full && (
                    <td className="col-shot">
                      <Cell value={r.shot} onSave={(v) => save(r.id, 'shot', v)} multiline clamp={3} />
                    </td>
                  )}
                  <td className="col-script">
                    <Cell value={r.script} onSave={(v) => save(r.id, 'script', v)} multiline clamp={full ? 4 : 3} placeholder="текст озвучки…" />
                  </td>
                  <td className="col-words num" title={wordsNorm ? `Норма ${wordsNorm.min}–${wordsNorm.max}` : undefined}>
                    {r.words ? <span className={words === 'ok' ? 'words-ok' : words ? 'words-bad' : ''}>{r.words}</span> : <span className="muted">—</span>}
                  </td>
                  {full && (
                    <td className="col-cta">
                      <Cell value={r.cta} list="plan-ctas" onSave={(v) => save(r.id, 'cta', v)} clamp={2} />
                    </td>
                  )}
                  {full && (
                    <td className="col-caption">
                      <Cell value={r.caption} onSave={(v) => save(r.id, 'caption', v)} multiline clamp={3} />
                    </td>
                  )}
                  {full && (
                    <td className="col-tags">
                      <Cell value={r.hashtags} onSave={(v) => save(r.id, 'hashtags', v)} multiline clamp={3} />
                    </td>
                  )}
                  <td className="col-status">
                    <select className={`status-select tone-${STATUS_TONE[r.status]}`} value={r.status} aria-label="Статус" onChange={(e) => save(r.id, 'status', e.target.value)}>
                      {STATUSES.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </td>
                  <td className="col-video">
                    <VideoCell
                      row={r}
                      upload={uploads[r.id]}
                      busy={busy[r.id]}
                      lengthNorm={lengthNorm}
                      accounts={accounts}
                      demoOnly={demoOnly}
                      now={now}
                      tz={tz}
                      onPick={() => pick(r.id)}
                      onSchedule={(m) => run(r.id, m, () => scheduleScript(r.id, m))}
                    />
                  </td>
                  {full && (
                    <td className="col-notes">
                      <Cell value={r.notes} onSave={(v) => save(r.id, 'notes', v)} multiline clamp={3} />
                    </td>
                  )}
                  <td className="col-actions">
                    <div className="row" style={{ gap: 2, flexWrap: 'nowrap' }}>
                      {ai && (
                        <button
                          className="btn btn-sm btn-ghost btn-icon"
                          title="ИИ: дописать пустые поля по паспорту проекта"
                          disabled={!!busy[r.id]}
                          onClick={() =>
                            run(r.id, 'ai', async () => {
                              const res = await aiFillScript(r.id);
                              return res.ok ? { ok: true, message: res.data ? `№${r.number}: заполнено полей — ${res.data}` : `№${r.number}: все поля уже заполнены` } : { ok: false, message: res.error };
                            })
                          }
                        >
                          <IconSpark size={14} />
                        </button>
                      )}
                      <Link href={`/content/${r.id}`} className="btn btn-sm btn-ghost btn-icon" title="Открыть сценарий" aria-label="Открыть сценарий">
                        <IconExternal size={14} />
                      </Link>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!shown.length && <div className="empty">{list.length ? 'Ничего не найдено' : 'В плане пока нет сценариев — добавьте первый или импортируйте лист из Google Таблиц.'}</div>}
      </div>
      <p className="hint">
        Щёлкните по ячейке, чтобы изменить её; Ctrl+Enter или клик мимо — сохранить, Esc — отменить. Ролик можно перетащить прямо на строку сценария.
      </p>
    </section>
  );
}

function Cell({
  value,
  onSave,
  multiline = false,
  type = 'text',
  list,
  clamp = 2,
  className = '',
  placeholder = '—',
  display,
}: {
  value: string;
  onSave: (v: string) => void;
  multiline?: boolean;
  type?: 'text' | 'number' | 'date' | 'time';
  list?: string;
  clamp?: number;
  className?: string;
  placeholder?: string;
  display?: ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  if (editing) {
    const commit = () => {
      setEditing(false);
      if (draft !== value) onSave(draft);
    };
    const keys = (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDraft(value);
        setEditing(false);
      } else if (e.key === 'Enter' && (!multiline || e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        commit();
      }
    };
    return multiline ? (
      <textarea
        className="cell-input"
        autoFocus
        rows={Math.min(14, Math.max(3, Math.ceil(draft.length / 48)))}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={keys}
      />
    ) : (
      <input className="cell-input" autoFocus type={type} list={list} value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={keys} />
    );
  }
  return (
    <div
      role="button"
      tabIndex={0}
      className={`cell ${className}`}
      title={value && !display ? value : undefined}
      onClick={() => setEditing(true)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === 'F2') {
          e.preventDefault();
          setEditing(true);
        }
      }}
    >
      <div className={`cell-text clamp-${clamp}`}>{display ?? (value || <span className="muted">{placeholder}</span>)}</div>
    </div>
  );
}

function VideoCell({
  row,
  upload,
  busy,
  lengthNorm,
  accounts,
  demoOnly,
  now,
  tz,
  onPick,
  onSchedule,
}: {
  row: PlanRow;
  upload?: { progress: number; error?: string };
  busy?: string;
  lengthNorm: Range;
  accounts: number;
  demoOnly: boolean;
  now: number;
  tz: string;
  onPick: () => void;
  onSchedule: (mode: 'plan' | 'now') => void;
}) {
  if (upload && !upload.error) {
    return (
      <div className="stack-sm" style={{ minWidth: 120 }}>
        <div className="progress">
          <span style={{ width: `${upload.progress * 100}%` }} />
        </div>
        <span className="small muted">Загрузка {Math.round(upload.progress * 100)} %</span>
      </div>
    );
  }
  const published = row.posts.filter((p) => p.status === 'published');
  const pending = row.posts.filter((p) => isActive(p.status));
  const failed = row.posts.filter((p) => p.status === 'failed');
  const at = row.planAt ? new Date(row.planAt).getTime() : null;
  const canPublish = (row.file || (demoOnly && row.status === 'Смонтирован')) && accounts > 0 && !published.length && !pending.length;
  const length = row.file ? rangeState(row.file.duration, lengthNorm) : null;
  const time = (iso: string) =>
    new Intl.DateTimeFormat('ru-RU', { timeZone: tz, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
  const icons = (list: typeof row.posts) => (
    <span className="row" style={{ gap: 3, flexWrap: 'nowrap' }}>
      {list.map((p) => (
        <span key={p.id} style={{ color: `var(--${p.platform})`, display: 'inline-flex' }} title={p.platform}>
          <PlatformIcon platform={p.platform} size={12} />
        </span>
      ))}
    </span>
  );

  return (
    <div className="video-cell">
      {row.file && (
        <Link href={`/content/${row.id}`} title="Открыть ролик">
          <Thumb thumb={row.file.thumb} title={row.title} color={0} width={28} />
        </Link>
      )}
      <div className="stack-sm" style={{ gap: 4, minWidth: 0 }}>
        {published.length > 0 && (
          <span className="row small" style={{ gap: 6, flexWrap: 'nowrap' }}>
            <IconCheck size={12} /> {icons(published)} <b className="num">{fmtNum(row.views)}</b>
          </span>
        )}
        {pending.length > 0 && (
          <span className="row small" style={{ gap: 6, flexWrap: 'nowrap' }} title="Запланировано">
            ⏱ {pending[0].at ? time(pending[0].at) : ''} {icons(pending)}
          </span>
        )}
        {failed.length > 0 && (
          <Link href={`/content/${row.id}`} className="badge badge-critical" title={failed[0].error}>
            ошибка публикации
          </Link>
        )}
        {row.file && length && length !== 'ok' && lengthNorm && (
          <span className="badge badge-warning" title={`Длина по паспорту ${lengthNorm.min}–${lengthNorm.max} с`}>
            {fmtDuration(row.file.duration)} · норма {lengthNorm.min}–{lengthNorm.max} с
          </span>
        )}
        {!row.file && !published.length && row.status === 'Опубликован' && !pending.length && (
          <span className="small muted" title="Статус «Опубликован» без публикаций из дашборда">
            опубликован вне дашборда
          </span>
        )}
        {!row.file && !published.length && row.status !== 'Опубликован' && (
          <button className="btn btn-sm" onClick={onPick}>
            <IconUpload size={14} /> Загрузить
          </button>
        )}
        {canPublish &&
          (busy ? (
            <span className="small muted">Сохраняем…</span>
          ) : at && at > now ? (
            <button className="btn btn-sm btn-primary" onClick={() => onSchedule('plan')} title="Во все подключённые аккаунты проекта по дате и времени из плана">
              В публикацию {row.planDate ? ruDate(row.planDate).slice(0, 5) : ''} {row.planTime ?? ''}
            </button>
          ) : (
            <button className="btn btn-sm" onClick={() => onSchedule('now')}>
              Опубликовать сейчас
            </button>
          ))}
        {row.file && !published.length && !pending.length && (
          <button className="btn btn-sm btn-ghost" onClick={onPick} style={{ justifySelf: 'start', padding: 0, height: 'auto' }}>
            <span className="small muted">заменить файл</span>
          </button>
        )}
        {!accounts && row.file && <span className="small muted">нет аккаунтов</span>}
        {upload?.error && <span className="small" style={{ color: 'var(--critical-ink)' }}>{upload.error}</span>}
      </div>
    </div>
  );
}

function ExportMenu({ projectId, onDone }: { projectId: number; onDone: (ok: boolean, text: string) => void }) {
  return (
    <span className="row" style={{ gap: 4 }}>
      <button
        className="btn btn-ghost"
        title="Скопировать план в буфер, чтобы вставить в лист Google Таблиц"
        onClick={async () => {
          try {
            const res = await fetch(`/api/export?project=${projectId}&format=tsv`);
            await navigator.clipboard.writeText(await res.text());
            onDone(true, 'План скопирован — вставьте его в лист Google Таблиц (Ctrl+V)');
          } catch {
            onDone(false, 'Браузер не дал доступ к буферу обмена — скачайте CSV');
          }
        }}
      >
        Копировать в Таблицы
      </button>
      <a className="btn btn-ghost" href={`/api/export?project=${projectId}&format=csv`}>
        CSV
      </a>
    </span>
  );
}

function AiIdeas({ projectId }: { projectId: number }) {
  const [ideas, setIdeas] = useState<ContentIdea[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<Set<number>>(new Set());
  const [pending, start] = useTransition();
  return (
    <span style={{ position: 'relative' }}>
      <button
        className="btn"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const r = await aiIdeas(projectId);
            if (r.ok) {
              setIdeas(r.data);
              setSaved(new Set());
            } else setError(r.error);
          })
        }
      >
        <IconSpark /> {pending && !ideas ? 'Думаю…' : 'Темы по лучшим роликам'}
      </button>
      {(ideas || error) && (
        <div className="card popover">
          <div className="card-head">
            <h2>Темы от ИИ</h2>
            <button className="btn btn-sm btn-ghost" onClick={() => (setIdeas(null), setError(null))}>
              Закрыть
            </button>
          </div>
          <div className="card-body stack">
            {error && <div className="notice notice-error">{error}</div>}
            {ideas?.map((idea, i) => (
              <div key={i} className="spread" style={{ alignItems: 'flex-start', borderTop: i ? '1px solid var(--line)' : 0, paddingTop: i ? 10 : 0 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{idea.title}</div>
                  <div className="small">Хук: «{idea.hook}»</div>
                  <div className="small muted">
                    {idea.rubric} · {idea.why}
                  </div>
                </div>
                <button
                  className="btn btn-sm"
                  disabled={saved.has(i)}
                  onClick={() =>
                    start(async () => {
                      await saveIdea(projectId, idea);
                      setSaved((s) => new Set(s).add(i));
                    })
                  }
                >
                  {saved.has(i) ? <IconCheck size={14} /> : <IconPlus size={14} />}
                  {saved.has(i) ? 'В плане' : 'В план'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </span>
  );
}
