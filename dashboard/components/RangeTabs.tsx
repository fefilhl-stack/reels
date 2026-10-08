import Link from 'next/link';

export const RANGES = [7, 28, 90] as const;

export function parseRange(v: string | string[] | undefined, fallback = 28): number {
  const n = Number(Array.isArray(v) ? v[0] : v);
  return (RANGES as readonly number[]).includes(n) ? n : fallback;
}

/** Date-range presets; keeps other query params. */
export function RangeTabs({ range, base, params = {} }: { range: number; base: string; params?: Record<string, string> }) {
  return (
    <div className="segmented" role="tablist" aria-label="Период">
      {RANGES.map((r) => (
        <Link key={r} href={`${base}?${new URLSearchParams({ ...params, range: String(r) })}`} aria-current={r === range ? 'true' : undefined}>
          {r} дн.
        </Link>
      ))}
    </div>
  );
}
