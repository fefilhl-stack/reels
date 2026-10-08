import Link from 'next/link';
import type { Insight, Severity } from '@/lib/insights';
import { IconAlert, IconInfo, IconTrend } from './Icons';

const META: Record<Severity, { label: string; cls: string; bg: string; fg: string; Icon: typeof IconAlert }> = {
  critical: { label: 'Срочно', cls: 'badge-critical', bg: 'var(--critical-bg)', fg: 'var(--critical-ink)', Icon: IconAlert },
  warning: { label: 'Внимание', cls: 'badge-warning', bg: 'var(--warning-bg)', fg: 'color-mix(in srgb, var(--warning) 50%, var(--ink))', Icon: IconAlert },
  opportunity: { label: 'Возможность', cls: 'badge-opportunity', bg: 'var(--opportunity-bg)', fg: 'var(--accent)', Icon: IconTrend },
  info: { label: 'Совет', cls: 'badge-info', bg: 'var(--sunken)', fg: 'var(--ink-2)', Icon: IconInfo },
};

export function InsightList({ items, limit }: { items: Insight[]; limit?: number }) {
  const list = limit ? items.slice(0, limit) : items;
  if (!list.length) return <div className="empty">Всё по плану — новых рекомендаций нет.</div>;
  return (
    <div>
      {list.map((i) => {
        const m = META[i.severity];
        return (
          <div key={i.id} className="insight">
            <span className="insight-icon" style={{ background: m.bg, color: m.fg }}>
              <m.Icon size={15} />
            </span>
            <div style={{ minWidth: 0 }}>
              <div className="row" style={{ gap: 6 }}>
                <span className={`badge ${m.cls}`}>{m.label}</span>
              </div>
              <h3 style={{ marginTop: 4 }}>{i.title}</h3>
              <p>{i.detail}</p>
              {i.href && (
                <Link href={i.href} className="btn btn-sm">
                  {i.action ?? 'Открыть'}
                </Link>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
