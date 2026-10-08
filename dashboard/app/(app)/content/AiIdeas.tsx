'use client';

import { useState, useTransition } from 'react';
import { aiIdeas, saveIdea } from '@/app/ai-actions';
import type { ContentIdea } from '@/lib/ai';
import { IconCheck, IconPlus, IconSpark } from '@/components/Icons';

/** Generates ideas from the project's winners and losers; each can be saved to the idea bank. */
export function AiIdeas({ projectId }: { projectId: number }) {
  const [ideas, setIdeas] = useState<ContentIdea[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<Set<number>>(new Set());
  const [pending, start] = useTransition();

  return (
    <div style={{ position: 'relative' }}>
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
        <IconSpark /> {pending ? 'Думаю…' : 'Идеи по лучшим роликам'}
      </button>
      {(ideas || error) && (
        <div className="card" style={{ position: 'absolute', right: 0, top: 42, width: 'min(520px, 92vw)', zIndex: 30, maxHeight: 520, overflowY: 'auto' }}>
          <div className="card-head">
            <h2>Идеи от ИИ</h2>
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
                  {saved.has(i) ? 'В банке' : 'В идеи'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
