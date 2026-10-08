'use client';

import { useState } from 'react';

export interface Cell {
  wd: number;
  bucket: number;
  n: number;
  score: number | null;
}

const WD = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const HOURS = ['0–3', '3–6', '6–9', '9–12', '12–15', '15–18', '18–21', '21–24'];

function step(score: number | null, n: number): number {
  if (score == null || n === 0) return 0;
  if (score < 0.6) return 1;
  if (score < 0.85) return 2;
  if (score < 1.1) return 3;
  if (score < 1.4) return 4;
  if (score < 2) return 5;
  return 6;
}

/** Weekday × time-of-day grid; sequential blue = how posts in that window perform vs. the account median. */
export function Heatmap({ cells }: { cells: Cell[] }) {
  const [active, setActive] = useState<Cell | null>(null);
  return (
    <div className="stack" style={{ gap: 10 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '28px repeat(8, minmax(0, 1fr))', gap: 3, position: 'relative' }}>
        <span />
        {HOURS.map((h) => (
          <span key={h} className="small muted" style={{ textAlign: 'center', fontSize: 10.5 }}>
            {h}
          </span>
        ))}
        {WD.map((w, wi) => (
          <div key={w} style={{ display: 'contents' }}>
            <span className="small muted" style={{ alignSelf: 'center' }}>
              {w}
            </span>
            {HOURS.map((_, b) => {
              const c = cells.find((x) => x.wd === wi + 1 && x.bucket === b) ?? { wd: wi + 1, bucket: b, n: 0, score: null };
              const s = step(c.score, c.n);
              return (
                <span
                  key={b}
                  tabIndex={0}
                  onPointerEnter={() => setActive(c)}
                  onPointerLeave={() => setActive(null)}
                  onFocus={() => setActive(c)}
                  onBlur={() => setActive(null)}
                  style={{
                    height: 22,
                    borderRadius: 4,
                    background: `var(--seq-${s})`,
                    outline: active === c ? '2px solid var(--ink)' : 'none',
                    outlineOffset: -1,
                  }}
                  aria-label={`${w} ${HOURS[b]}: ${c.n ? `${c.score?.toFixed(2)}× медианы, ${c.n} публикаций` : 'нет данных'}`}
                />
              );
            })}
          </div>
        ))}
        {active && (
          <div className="tooltip" style={{ right: 0, top: -6 }}>
            <div className="tooltip-title">
              {WD[active.wd - 1]}, {HOURS[active.bucket]} ч
            </div>
            {active.n ? (
              <>
                <div>
                  <b>{active.score?.toFixed(2).replace('.', ',')}×</b> <span className="ink-2">от обычных просмотров</span>
                </div>
                <div className="muted">публикаций: {active.n}</div>
              </>
            ) : (
              <div className="muted">нет публикаций</div>
            )}
          </div>
        )}
      </div>
      <div className="row small muted" style={{ gap: 6 }}>
        <span>хуже</span>
        {[1, 2, 3, 4, 5, 6].map((s) => (
          <span key={s} style={{ width: 18, height: 10, borderRadius: 3, background: `var(--seq-${s})` }} />
        ))}
        <span>лучше медианы</span>
        <span style={{ marginLeft: 8, width: 18, height: 10, borderRadius: 3, background: 'var(--seq-0)' }} />
        <span>нет данных</span>
      </div>
    </div>
  );
}
