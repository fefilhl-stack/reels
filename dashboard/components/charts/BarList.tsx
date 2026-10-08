'use client';

import { useState } from 'react';

export interface BarRow {
  key: string;
  label: string;
  value: number;
  display: string;
  detail?: string;
}

/** Horizontal bars, one series → one color; value at the bar tip, details on hover/focus. */
export function BarList({ rows, color = 'var(--s1)', baseline }: { rows: BarRow[]; color?: string; baseline?: { value: number; label: string } }) {
  const [active, setActive] = useState<string | null>(null);
  const max = Math.max(...rows.map((r) => r.value), baseline?.value ?? 0, 0.0001);
  return (
    <div className="stack" style={{ gap: 8 }}>
      {rows.map((r) => {
        const pct = (r.value / max) * 100;
        return (
          <div
            key={r.key}
            tabIndex={0}
            onPointerEnter={() => setActive(r.key)}
            onPointerLeave={() => setActive(null)}
            onFocus={() => setActive(r.key)}
            onBlur={() => setActive(null)}
            style={{ display: 'grid', gridTemplateColumns: 'minmax(90px, 34%) minmax(0, 1fr)', gap: 10, alignItems: 'center', outline: 'none' }}
          >
            <span className="ellipsis small ink-2" title={r.label}>
              {r.label}
            </span>
            <span style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8, minHeight: 20 }}>
              <span
                style={{
                  width: `${Math.max(pct, 1.5)}%`,
                  height: 14,
                  borderRadius: '0 4px 4px 0',
                  background: color,
                  opacity: active && active !== r.key ? 0.45 : 1,
                  transition: 'opacity .12s',
                }}
              />
              {baseline && (
                <span
                  aria-hidden
                  style={{ position: 'absolute', left: `${(baseline.value / max) * 100}%`, top: -2, bottom: -2, width: 1, background: 'var(--ink-2)' }}
                />
              )}
              <span className="small num" style={{ whiteSpace: 'nowrap', fontWeight: 550 }}>
                {r.display}
              </span>
              {active === r.key && r.detail && (
                <span className="tooltip" style={{ left: 0, bottom: 'calc(100% + 6px)' }}>
                  <span className="tooltip-title">{r.label}</span>
                  <span>{r.detail}</span>
                </span>
              )}
            </span>
          </div>
        );
      })}
      {baseline && (
        <div className="hint row" style={{ gap: 6 }}>
          <span style={{ width: 1, height: 12, background: 'var(--ink-2)', display: 'inline-block' }} /> {baseline.label}
        </div>
      )}
    </div>
  );
}
