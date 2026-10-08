// Content-plan helpers shared by server and client (no Node imports).
// They reproduce the Google Sheets template: dates count from the project's start date,
// the time is 18:00 on weekdays and 17:00 on weekends, «Слов» is the word count of the voiceover.

import { STATUSES, type ScriptStatus } from './types';

/** Same as the sheet formula =COUNTA(SPLIT(text; " ")). */
export function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/** "100–120", "40–60 секунд", "30-45 с" → {min, max}. A single number gives min = max. */
export function parseRange(text: string): { min: number; max: number } | null {
  const m = /(\d+)\s*[–—-]\s*(\d+)/.exec(text);
  if (m) return { min: Math.min(+m[1], +m[2]), max: Math.max(+m[1], +m[2]) };
  const one = /(\d+)/.exec(text);
  return one ? { min: +one[1], max: +one[1] } : null;
}

export function rangeState(n: number, r: { min: number; max: number } | null): 'ok' | 'low' | 'high' | null {
  if (!r || !n) return null;
  if (n < r.min) return 'low';
  if (n > r.max) return 'high';
  return 'ok';
}

/** "18:00 в будни, 17:00 в выходные, по Москве" → {weekday: "18:00", weekend: "17:00"}. */
export function parseTimes(text: string): { weekday: string | null; weekend: string | null } {
  const found = [...text.matchAll(/(\d{1,2})[:.](\d{2})([^\d]*)/g)];
  let weekday: string | null = null;
  let weekend: string | null = null;
  for (const m of found) {
    const t = `${m[1].padStart(2, '0')}:${m[2]}`;
    const tail = m[3].toLowerCase();
    if (/выходн|сб|вс|суб|воскр/.test(tail)) weekend = t;
    else if (/будн|пн|раб/.test(tail)) weekday = t;
    else if (!weekday) weekday = t;
  }
  if (found.length === 1) weekend = weekend ?? weekday;
  return { weekday, weekend: weekend ?? weekday };
}

const NUM_WORDS: Record<string, number> = {
  один: 1, одна: 1, одно: 1, два: 2, две: 2, три: 3, четыре: 4, пять: 5, шесть: 6, семь: 7,
};

/** "Один ролик в день" → 7, "3 ролика в неделю" → 3, "два в день" → 14, "через день" → 4. */
export function parsePerWeek(text: string): number | null {
  const t = text.toLowerCase();
  if (/через день/.test(t)) return 4;
  if (/ежедневн|каждый день/.test(t)) return 7;
  const m = /(\d+)/.exec(t);
  let n = m ? +m[1] : null;
  if (n == null) for (const [w, v] of Object.entries(NUM_WORDS)) if (new RegExp(`(^|\\s)${w}(\\s|$)`).test(t)) n = v;
  if (n == null) return /день|недел/.test(t) ? (/день/.test(t) ? 7 : 1) : null;
  if (/день|сутки/.test(t)) return n * 7;
  if (/месяц/.test(t)) return Math.max(1, Math.round((n * 12) / 52));
  return n;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Cell value → YYYY-MM-DD. Accepts 08.10.2026, 8.10.26, 2026-10-08, 10/8/2026 (US) and sheet serials. */
export function parseDateCell(text: string): string | null {
  const s = text.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
  m = /^(\d{1,2})\.(\d{1,2})\.(\d{2,4})/.exec(s);
  if (m) return `${m[3].length === 2 ? `20${m[3]}` : m[3]}-${pad(+m[2])}-${pad(+m[1])}`;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
  if (m) return `${m[3]}-${pad(+m[1])}-${pad(+m[2])}`;
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    // Sheets/Excel serial day number (1899-12-30 epoch).
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(+s) * 86_400_000);
    return d.toISOString().slice(0, 10);
  }
  return null;
}

/** "18:00", "18:00:00", "9.30" → HH:MM. */
export function parseTimeCell(text: string): string | null {
  const m = /(\d{1,2})[:.](\d{2})/.exec(text);
  if (!m || +m[1] > 23 || +m[2] > 59) return null;
  return `${pad(+m[1])}:${m[2]}`;
}

export function ruDate(ymd: string | null): string {
  if (!ymd) return '';
  const [y, m, d] = ymd.split('-');
  return `${d}.${m}.${y}`;
}

const toUtc = (ymd: string) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};

export function addDaysYmd(ymd: string, days: number): string {
  return new Date(toUtc(ymd) + days * 86_400_000).toISOString().slice(0, 10);
}

/** 1 = Monday … 7 = Sunday. */
export function weekdayOf(ymd: string): number {
  return ((new Date(toUtc(ymd)).getUTCDay() + 6) % 7) + 1;
}

export function slotTimeFor(ymd: string, weekday: string, weekend: string): string {
  return weekdayOf(ymd) > 5 ? weekend || weekday : weekday;
}

/** Posting days of the week for a frequency: daily, or spread evenly (3/week → Mon, Wed, Fri). */
export function postingDays(perWeek: number): number[] {
  const n = Math.max(1, Math.min(7, Math.round(perWeek)));
  if (n === 7) return [1, 2, 3, 4, 5, 6, 7];
  return Array.from({ length: n }, (_, i) => 1 + Math.floor((i * 7) / n));
}

/** The first `count` plan dates starting at `start` (inclusive). */
export function planSequence(start: string, perWeek: number, count: number): string[] {
  const days = new Set(postingDays(perWeek));
  const out: string[] = [];
  for (let d = start; out.length < count; d = addDaysYmd(d, 1)) if (days.has(weekdayOf(d))) out.push(d);
  return out;
}

/** The next posting date strictly after `after`. */
export function nextPlanDate(after: string, perWeek: number): string {
  return planSequence(addDaysYmd(after, 1), perWeek, 1)[0];
}

/**
 * «Рубрики» → names and target shares. Understands
 * "Ошибки с прогрессом (25%). Разборы исследований (25%)." and "A. Признаки. B. Ошибки, …".
 */
export function parseRubrics(text: string): { name: string; share: number | null }[] {
  const withShare = [...text.matchAll(/([^.;()\n]+?)\s*\((\d+(?:[.,]\d+)?)\s*%\)/g)].map((m) => ({
    name: m[1].trim().replace(/^[A-ZА-Я]\)\s*/, ''),
    share: Number(m[2].replace(',', '.')) / 100,
  }));
  if (withShare.length) return withShare;
  const lettered = [...text.matchAll(/(?:^|[.;]\s*)[A-ZА-Я]\.\s+([^.;\n]+)/g)].map((m) => ({ name: m[1].trim(), share: null }));
  return lettered;
}

/** «Призывы» → individual options ("Сохранить, отправить коллеге" → ["Сохранить", "Отправить коллеге"]). */
export function parseCtas(text: string): string[] {
  return text
    .split(/[,;\n]|\.\s/)
    .map((s) => s.trim().replace(/\.$/, ''))
    .filter((s) => s && s.length < 40)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1));
}

/** Groups free-form CTA texts into the main actions they ask for. */
export function ctaKind(text: string): string | null {
  const t = text.toLowerCase();
  if (!t.trim()) return null;
  if (/сохран/.test(t)) return 'Сохранить';
  if (/отправ|перешл|поделит|скинь/.test(t)) return 'Отправить';
  if (/коммент|напиш/.test(t)) return 'Комментарий';
  if (/подпис/.test(t)) return 'Подписаться';
  if (/директ|запис|ссылк/.test(t)) return 'Заявка / директ';
  return text.trim();
}

export function normalizeStatus(text: string): ScriptStatus | null {
  const t = text.trim().toLowerCase();
  if (!t) return null;
  return STATUSES.find((s) => s.toLowerCase() === t || t.startsWith(s.toLowerCase().slice(0, 5))) ?? null;
}

export const STATUS_TONE: Record<ScriptStatus, 'info' | 'warning' | 'opportunity' | 'good'> = {
  'Не начат': 'info',
  Озвучен: 'warning',
  Смонтирован: 'opportunity',
  Опубликован: 'good',
};
