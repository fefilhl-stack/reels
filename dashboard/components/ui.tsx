import type { ReactNode } from 'react';
import { fmtDelta, fmtNum } from '@/lib/format';
import { PLATFORM_LABEL, POST_STATUS_LABEL, type Platform, type PostStatus } from '@/lib/types';
import { PlatformIcon } from './Icons';
import { Sparkline } from './charts/Sparkline';

export const projectColor = (c: number) => `var(--s${(c % 8) + 1})`;
export const platformColor = (p: Platform) => `var(--${p})`;

export function ProjectTag({ name, color }: { name: string; color: number }) {
  return (
    <span className="row" style={{ gap: 6, flexWrap: 'nowrap', minWidth: 0 }}>
      <span className="dot" style={{ background: projectColor(color) }} />
      <span className="ellipsis">{name}</span>
    </span>
  );
}

export function PlatformTag({ platform, label = true }: { platform: Platform; label?: boolean }) {
  return (
    <span className="row" style={{ gap: 5, flexWrap: 'nowrap' }} title={PLATFORM_LABEL[platform]}>
      <span style={{ color: platformColor(platform), display: 'inline-flex' }}>
        <PlatformIcon platform={platform} />
      </span>
      {label && <span>{PLATFORM_LABEL[platform]}</span>}
    </span>
  );
}

const STATUS_CLASS: Record<PostStatus, string> = {
  scheduled: 'badge-info',
  publishing: 'badge-opportunity',
  processing: 'badge-opportunity',
  published: 'badge-good',
  failed: 'badge-critical',
  canceled: 'badge-info',
};

export function StatusBadge({ status }: { status: PostStatus }) {
  return <span className={`badge ${STATUS_CLASS[status]}`}>{POST_STATUS_LABEL[status]}</span>;
}

/** 9:16 thumbnail: uploaded cover, or a colored placeholder with the title's first letter. */
export function Thumb({ thumb, title, color, width = 40 }: { thumb: string | null; title: string; color: number; width?: number }) {
  return (
    <span className="thumb" style={{ width, background: thumb ? undefined : `color-mix(in srgb, ${projectColor(color)} 75%, #000)` }}>
      {thumb ? <img src={`/api/media/${thumb}`} alt="" loading="lazy" /> : <span>{title.trim().charAt(0).toUpperCase() || '·'}</span>}
    </span>
  );
}

export function Delta({ value, goodWhenUp = true }: { value: number | null; goodWhenUp?: boolean }) {
  if (value == null || !Number.isFinite(value) || Math.abs(value) < 0.005) return <span className="muted">без изменений</span>;
  const up = value > 0;
  const good = up === goodWhenUp;
  return (
    <span className={good ? 'delta-up' : 'delta-down'}>
      {up ? '↑' : '↓'} {fmtDelta(value).replace(/^[+−]/, '')}
    </span>
  );
}

export function StatTile({
  label,
  value,
  delta,
  compare,
  spark,
  children,
}: {
  label: string;
  value: string;
  delta?: number | null;
  compare?: string;
  spark?: number[];
  children?: ReactNode;
}) {
  return (
    <div className="card tile">
      <div className="tile-label">{label}</div>
      <div className="spread" style={{ alignItems: 'flex-end' }}>
        <div className="tile-value">{value}</div>
        {spark && spark.length > 1 && <Sparkline values={spark} />}
      </div>
      {(delta !== undefined || compare) && (
        <div className="tile-sub">
          {delta !== undefined && <Delta value={delta} />}
          {compare && <span>{compare}</span>}
        </div>
      )}
      {children}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <div style={{ color: 'var(--ink-2)', fontWeight: 550 }}>{title}</div>
      {children}
    </div>
  );
}

export function ScoreBadge({ score }: { score: number | null }) {
  if (score == null) return <span className="muted small">рано судить</span>;
  const s = score.toFixed(score >= 10 ? 0 : 1).replace('.', ',');
  if (score >= 2) return <span className="badge badge-opportunity">↑ {s}× залёт</span>;
  if (score >= 1.2) return <span className="badge badge-good">{s}×</span>;
  if (score < 0.6) return <span className="badge badge-critical">{s}×</span>;
  return <span className="badge badge-info">{s}×</span>;
}

export const views = (n: number) => fmtNum(n);
