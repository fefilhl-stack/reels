/** "Nice" axis ticks: 0 … max rounded to 1/2/2.5/5 × 10^n steps. */
export function niceTicks(max: number, count = 4): number[] {
  if (!(max > 0)) return [0, 1];
  const raw = max / count;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = 0; v <= max + step * 0.001; v += step) out.push(v);
  if (out[out.length - 1] < max) out.push(out[out.length - 1] + step);
  return out;
}

const compact = new Intl.NumberFormat('ru-RU', { notation: 'compact', maximumFractionDigits: 1 });
export const axisNum = (n: number) => (Math.abs(n) >= 1000 ? compact.format(n) : String(Math.round(n * 100) / 100).replace('.', ','));

const dayFmt = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', timeZone: 'UTC' });
export const dayLabel = (key: string) => dayFmt.format(new Date(`${key}T12:00:00Z`)).replace('.', '');
