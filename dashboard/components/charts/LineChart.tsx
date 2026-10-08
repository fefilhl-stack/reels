'use client';

import { useMemo, useRef, useState } from 'react';
import { axisNum, dayLabel, niceTicks } from './scale';

export interface LineSeries {
  key: string;
  label: string;
  color: string;
  values: number[];
}

const fmt = new Intl.NumberFormat('ru-RU');

/** Multi-series line chart with crosshair + one tooltip listing every series at the hovered day. */
export function LineChart({
  days,
  series,
  height = 220,
  unit = '',
}: {
  days: string[];
  series: LineSeries[];
  height?: number;
  unit?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const W = 720;
  const H = height;
  const pad = { l: 44, r: 12, t: 10, b: 24 };
  const visible = series.filter((s) => s.values.some((v) => v > 0));
  const shown = visible.length ? visible : series.slice(0, 1);
  const max = Math.max(1, ...shown.flatMap((s) => s.values));
  const ticks = useMemo(() => niceTicks(max), [max]);
  const top = ticks[ticks.length - 1];
  const n = days.length;
  const x = (i: number) => pad.l + (n <= 1 ? 0 : (i / (n - 1)) * (W - pad.l - pad.r));
  const y = (v: number) => H - pad.b - (v / top) * (H - pad.t - pad.b);
  const labelEvery = Math.max(1, Math.ceil(n / 7));

  function onMove(e: React.PointerEvent) {
    const box = ref.current!.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * W;
    const i = Math.round(((px - pad.l) / (W - pad.l - pad.r)) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  }

  const single = shown.length === 1;
  const hx = hover != null ? (x(hover) / W) * 100 : 0;

  return (
    <div className="stack" style={{ gap: 10 }}>
      {shown.length > 1 && (
        <div className="legend">
          {shown.map((s) => (
            <span key={s.key} className="legend-item">
              <span className="legend-line" style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
      )}
      <div className="chart" ref={ref} onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="График по дням">
          <g className="axis">
            {ticks.map((t) => (
              <g key={t}>
                <line className={t === 0 ? 'baseline' : 'gridline'} x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} />
                <text x={pad.l - 8} y={y(t) + 4} textAnchor="end">
                  {axisNum(t)}
                </text>
              </g>
            ))}
            {days.map((d, i) =>
              i % labelEvery === 0 || i === n - 1 ? (
                <text key={d} x={x(i)} y={H - 6} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}>
                  {dayLabel(d)}
                </text>
              ) : null,
            )}
          </g>
          {single && (
            <path
              d={`M${x(0)},${y(0)} ${shown[0].values.map((v, i) => `L${x(i)},${y(v)}`).join(' ')} L${x(n - 1)},${y(0)} Z`}
              fill={shown[0].color}
              opacity={0.1}
            />
          )}
          {shown.map((s) => (
            <polyline
              key={s.key}
              points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ')}
              fill="none"
              stroke={s.color}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {shown.length <= 4 &&
            shown.map((s) => (
              <circle key={s.key} cx={x(n - 1)} cy={y(s.values[n - 1] ?? 0)} r={4} fill={s.color} stroke="var(--surface)" strokeWidth={2} />
            ))}
          {hover != null && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} stroke="var(--line-strong)" strokeWidth={1} />
              {shown.map((s) => (
                <circle key={s.key} cx={x(hover)} cy={y(s.values[hover] ?? 0)} r={4} fill={s.color} stroke="var(--surface)" strokeWidth={2} />
              ))}
            </g>
          )}
        </svg>
        {hover != null && (
          <div
            className="tooltip"
            style={{
              top: 8,
              left: hx > 60 ? undefined : `calc(${hx}% + 12px)`,
              right: hx > 60 ? `calc(${100 - hx}% + 12px)` : undefined,
            }}
          >
            <div className="tooltip-title">{dayLabel(days[hover])}</div>
            {shown.map((s) => (
              <div key={s.key} className="tooltip-row">
                <span className="key" style={{ background: s.color }} />
                <span className="ink-2">{s.label}</span>
                <b>
                  {fmt.format(s.values[hover] ?? 0)}
                  {unit}
                </b>
              </div>
            ))}
            {shown.length > 1 && (
              <div className="tooltip-row">
                <span />
                <span className="muted">Всего</span>
                <b>{fmt.format(shown.reduce((a, s) => a + (s.values[hover] ?? 0), 0))}</b>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
