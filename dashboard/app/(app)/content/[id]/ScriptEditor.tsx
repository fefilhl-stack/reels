'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { updateScript } from '@/app/actions';
import { aiHooks, aiScriptDraft } from '@/app/ai-actions';
import type { HookIdea } from '@/lib/ai';
import { countWords, rangeState } from '@/lib/plan';
import { STATUSES, type Snippet, type Video } from '@/lib/types';
import { IconSpark } from '@/components/Icons';

type Fields = {
  title: string;
  hook: string;
  cover_text: string;
  shot: string;
  script: string;
  cta: string;
  caption: string;
  hashtags: string;
  notes: string;
};

/** The script row as a form: the same fields as the content-plan sheet. */
export function ScriptEditor({
  video,
  rubric,
  rubrics,
  ctas,
  snippets,
  wordsNorm,
  ai,
  sequels,
}: {
  video: Video;
  rubric: string;
  rubrics: string[];
  ctas: string[];
  snippets: Snippet[];
  wordsNorm: { min: number; max: number } | null;
  ai: boolean;
  sequels: { id: number; title: string }[];
}) {
  const [f, setF] = useState<Fields>({
    title: video.title,
    hook: video.hook,
    cover_text: video.cover_text,
    shot: video.shot,
    script: video.script,
    cta: video.cta,
    caption: video.caption,
    hashtags: video.hashtags,
    notes: video.notes,
  });
  const [hooks, setHooks] = useState<HookIdea[] | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [dirty, setDirty] = useState(false);
  const [pending, start] = useTransition();
  const [aiPending, startAi] = useTransition();
  const set = (k: keyof Fields) => (e: { target: { value: string } }) => {
    setF((x) => ({ ...x, [k]: e.target.value }));
    setDirty(true);
  };
  const words = countWords(f.script);
  const wordsState = rangeState(words, wordsNorm);
  const byKind = (k: Snippet['kind']) => snippets.filter((s) => s.kind === k);

  return (
    <section className="card">
      <div className="card-head">
        <div>
          <h2>Сценарий</h2>
          <p>Те же поля, что в контент-плане; из «Подписи» и «Хэштегов» собираются подписи для площадок</p>
        </div>
        {ai && (
          <button
            type="button"
            className="btn btn-sm"
            disabled={aiPending}
            onClick={() =>
              startAi(async () => {
                setMsg(null);
                const r = await aiScriptDraft(video.id);
                if (!r.ok) return setMsg({ ok: false, text: r.error });
                const d = r.data;
                setF((x) => ({
                  ...x,
                  hook: d.hook || x.hook,
                  cover_text: d.cover_text || x.cover_text,
                  shot: d.shot || x.shot,
                  script: d.script || x.script,
                  cta: d.cta || x.cta,
                  caption: d.caption || x.caption,
                  hashtags: d.hashtags || x.hashtags,
                  notes: d.check ? [x.notes, `Проверить: ${d.check}`].filter(Boolean).join('\n') : x.notes,
                }));
                setDirty(true);
                setMsg({ ok: true, text: 'Черновик от ИИ подставлен в поля — проверьте факты и нажмите «Сохранить».' });
              })
            }
          >
            <IconSpark size={14} /> {aiPending ? 'Пишу…' : 'Написать сценарий'}
          </button>
        )}
      </div>
      <form
        className="card-body stack"
        action={(fd) =>
          start(async () => {
            const r = await updateScript(video.id, fd);
            setMsg(r.ok ? { ok: true, text: 'Сохранено' } : { ok: false, text: r.message ?? 'Не сохранилось' });
            if (r.ok) setDirty(false);
          })
        }
      >
        <div className="grid-4">
          <label className="field">
            <span>Дата</span>
            <input className="input" type="date" name="plan_date" defaultValue={video.plan_date ?? ''} onChange={() => setDirty(true)} />
          </label>
          <label className="field">
            <span>Время</span>
            <input className="input" type="time" name="plan_time" defaultValue={video.plan_time ?? ''} onChange={() => setDirty(true)} />
          </label>
          <label className="field">
            <span>Рубрика</span>
            <input className="input" name="rubric" list="script-rubrics" defaultValue={rubric} onChange={() => setDirty(true)} />
            <datalist id="script-rubrics">
              {rubrics.map((r) => (
                <option key={r} value={r} />
              ))}
            </datalist>
          </label>
          <label className="field">
            <span>Статус</span>
            <select className="select" name="status" defaultValue={video.status} onChange={() => setDirty(true)}>
              {STATUSES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
        </div>

        <label className="field">
          <span>Тема</span>
          <input className="input" name="title" value={f.title} onChange={set('title')} required />
        </label>

        <div className="field">
          <div className="spread">
            <span className="label">Хук — первая фраза</span>
            {ai && (
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                disabled={aiPending}
                onClick={() =>
                  startAi(async () => {
                    const r = await aiHooks(video.id);
                    if (r.ok) setHooks(r.data);
                    else setMsg({ ok: false, text: r.error });
                  })
                }
              >
                <IconSpark size={14} /> Варианты хука
              </button>
            )}
          </div>
          <input className="input" name="hook" value={f.hook} onChange={set('hook')} />
          {byKind('hook').length > 0 && (
            <div className="row small">
              <span className="muted">Шаблоны:</span>
              {byKind('hook').map((s) => (
                <button key={s.id} type="button" className="chip chip-btn" onClick={() => (setF((x) => ({ ...x, hook: s.text })), setDirty(true))}>
                  {s.text.length > 40 ? `${s.text.slice(0, 40)}…` : s.text}
                </button>
              ))}
            </div>
          )}
          {hooks && (
            <div className="stack-sm" style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 10 }}>
              {hooks.map((h, i) => (
                <button
                  key={i}
                  type="button"
                  className="btn btn-ghost"
                  style={{ height: 'auto', padding: '6px 8px', textAlign: 'left', whiteSpace: 'normal', display: 'block' }}
                  onClick={() => (setF((x) => ({ ...x, hook: h.text })), setDirty(true))}
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

        <div className="grid-2">
          <label className="field">
            <span>Обложка — текст на обложке</span>
            <input className="input" name="cover_text" value={f.cover_text} onChange={set('cover_text')} />
          </label>
          <label className="field">
            <span>Кадр</span>
            <input className="input" name="shot" value={f.shot} onChange={set('shot')} placeholder="Что в кадре" />
          </label>
        </div>

        <label className="field">
          <span className="spread">
            <span>Текст озвучки</span>
            <span className={wordsState === 'ok' ? 'words-ok' : wordsState ? 'words-bad' : 'muted'}>
              {words} слов{wordsNorm ? ` · норма ${wordsNorm.min}–${wordsNorm.max}` : ''}
            </span>
          </span>
          <textarea className="textarea" name="script" rows={9} value={f.script} onChange={set('script')} />
        </label>

        <div className="grid-2">
          <label className="field">
            <span>Призыв</span>
            <input className="input" name="cta" list="script-ctas" value={f.cta} onChange={set('cta')} />
            <datalist id="script-ctas">
              {ctas.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </label>
          <label className="field">
            <span>Хэштеги</span>
            <input className="input" name="hashtags" value={f.hashtags} onChange={set('hashtags')} placeholder="#тема #ниша" />
          </label>
        </div>
        {byKind('hashtags').length > 0 && (
          <div className="row small">
            <span className="muted">Наборы хэштегов:</span>
            {byKind('hashtags').map((s) => (
              <button key={s.id} type="button" className="chip chip-btn" onClick={() => (setF((x) => ({ ...x, hashtags: `${x.hashtags} ${s.text}`.trim() })), setDirty(true))}>
                + {s.text.length > 36 ? `${s.text.slice(0, 36)}…` : s.text}
              </button>
            ))}
          </div>
        )}

        <label className="field">
          <span>Подпись</span>
          <textarea className="textarea" name="caption" rows={2} value={f.caption} onChange={set('caption')} />
        </label>

        <label className="field">
          <span>Заметки</span>
          <textarea className="textarea" name="notes" rows={2} value={f.notes} onChange={set('notes')} placeholder="Источники, что проверить, реквизит…" />
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

        {msg && <div className={`notice ${msg.ok ? 'notice-ok' : 'notice-error'}`}>{msg.text}</div>}
        <div className="row">
          <button className="btn btn-primary" disabled={pending}>
            {pending ? 'Сохраняем…' : 'Сохранить'}
          </button>
          {dirty && <span className="small muted">Есть несохранённые изменения</span>}
        </div>
      </form>
    </section>
  );
}
