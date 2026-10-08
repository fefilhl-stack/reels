// Time helpers. Everything is stored in UTC ISO strings and shown in the app time zone
// (APP_TIMEZONE, Europe/Moscow by default), so the schedule and the "best time to post"
// heatmap mean the same thing regardless of the server's or browser's clock.

export function appTz(): string {
  return process.env.APP_TIMEZONE || 'Europe/Moscow';
}

export const DAY_MS = 86_400_000;

type Parts = { y: number; m: number; d: number; h: number; min: number; wd: number };

const partsFmt = new Map<string, Intl.DateTimeFormat>();

export function zonedParts(date: Date | string, tz = appTz()): Parts {
  let f = partsFmt.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
      hourCycle: 'h23',
    });
    partsFmt.set(tz, f);
  }
  const p: Record<string, string> = {};
  for (const x of f.formatToParts(typeof date === 'string' ? new Date(date) : date)) p[x.type] = x.value;
  const wdMap: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour % 24, min: +p.minute, wd: wdMap[p.weekday] };
}

/** "YYYY-MM-DD" of the instant in the app time zone. */
export function dayKey(date: Date | string, tz = appTz()): string {
  const p = zonedParts(date, tz);
  return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
}

/** Converts a wall-clock time in `tz` to a UTC Date. */
export function zonedToUtc(y: number, m: number, d: number, h = 0, min = 0, tz = appTz()): Date {
  const guess = Date.UTC(y, m - 1, d, h, min);
  let ts = guess;
  for (let i = 0; i < 2; i++) {
    const p = zonedParts(new Date(ts), tz);
    const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min);
    ts += guess - asUtc;
  }
  return new Date(ts);
}

/** Parses "YYYY-MM-DDTHH:MM" (datetime-local) as app-zone wall time. */
export function parseLocal(value: string, tz = appTz()): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(value);
  if (!m) return null;
  return zonedToUtc(+m[1], +m[2], +m[3], +m[4], +m[5], tz);
}

/** Formats for a datetime-local input in the app zone. */
export function toLocalInput(date: Date | string, tz = appTz()): string {
  const p = zonedParts(date, tz);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${p.y}-${pad(p.m)}-${pad(p.d)}T${pad(p.h)}:${pad(p.min)}`;
}

/** Start (UTC) of the app-zone day containing `date`, shifted by `offsetDays`. */
export function startOfDay(date: Date, offsetDays = 0, tz = appTz()): Date {
  const p = zonedParts(date, tz);
  return zonedToUtc(p.y, p.m, p.d + offsetDays, 0, 0, tz);
}

/** Monday 00:00 (app zone) of the week containing `date`. */
export function startOfWeek(date: Date, tz = appTz()): Date {
  const p = zonedParts(date, tz);
  return zonedToUtc(p.y, p.m, p.d - (p.wd - 1), 0, 0, tz);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

/** List of day keys from `from` to `to` inclusive (app zone). */
export function dayRange(days: number, end = new Date(), tz = appTz()): string[] {
  const out: string[] = [];
  const last = zonedParts(end, tz);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(last.y, last.m - 1, last.d - i));
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

const WEEKDAYS_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
export const weekdayShort = (wd: number) => WEEKDAYS_SHORT[(wd - 1 + 7) % 7];
