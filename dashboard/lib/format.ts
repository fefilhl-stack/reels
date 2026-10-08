// Formatting shared by server and client components (no Node imports here).

const compact = new Intl.NumberFormat('ru-RU', { notation: 'compact', maximumFractionDigits: 1 });
const whole = new Intl.NumberFormat('ru-RU');

export function fmtNum(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return Math.abs(n) >= 10_000 ? compact.format(n) : whole.format(Math.round(n));
}

export function fmtFull(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return whole.format(Math.round(n));
}

export function fmtPct(x: number | null | undefined, digits = 1): string {
  if (x == null || !Number.isFinite(x)) return '—';
  return `${(x * 100).toFixed(digits).replace('.', ',')} %`;
}

export function fmtDelta(x: number | null | undefined): string {
  if (x == null || !Number.isFinite(x)) return '';
  const sign = x > 0 ? '+' : x < 0 ? '−' : '';
  return `${sign}${Math.abs(x * 100).toFixed(0)} %`;
}

export function fmtMultiple(x: number | null | undefined): string {
  if (x == null || !Number.isFinite(x)) return '—';
  return `${x.toFixed(x >= 10 ? 0 : 1).replace('.', ',')}×`;
}

export function fmtBytes(n: number): string {
  if (!n) return '—';
  const units = ['Б', 'КБ', 'МБ', 'ГБ'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1).replace('.', ',')} ${units[i]}`;
}

export function fmtDuration(sec: number): string {
  if (!sec) return '—';
  const s = Math.round(sec);
  return s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : `${s} с`;
}

export function fmtDate(iso: string | null | undefined, tz: string, withTime = true): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: tz,
    day: 'numeric',
    month: 'short',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(new Date(iso));
}

export function fmtTime(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('ru-RU', { timeZone: tz, hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

export function fmtRelative(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return 'никогда';
  const diff = new Date(iso).getTime() - now;
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat('ru', { numeric: 'auto' });
  if (abs < 60_000) return 'только что';
  if (abs < 3_600_000) return rtf.format(Math.round(diff / 60_000), 'minute');
  if (abs < 86_400_000) return rtf.format(Math.round(diff / 3_600_000), 'hour');
  return rtf.format(Math.round(diff / 86_400_000), 'day');
}

export function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

export const roliki = (n: number) => `${n} ${plural(n, 'ролик', 'ролика', 'роликов')}`;
