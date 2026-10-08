import { all } from './db';
import { appTz, zonedParts, zonedToUtc } from './time';
import type { Project, Slot } from './types';

/** Evenly spread weekday slots at 18:00 when a project has none configured. */
export function defaultSlots(perWeek: number): Slot[] {
  const n = Math.max(1, Math.min(14, perWeek));
  if (n >= 7) {
    const out: Slot[] = [];
    for (let d = 1; d <= 7; d++) out.push({ d, t: '18:00' });
    if (n > 7) for (let d = 1; d <= n - 7; d++) out.push({ d, t: '12:00' });
    return out;
  }
  return Array.from({ length: n }, (_, i) => ({ d: 1 + Math.floor((i * 7) / n), t: '18:00' }));
}

export function projectSlots(p: Project): Slot[] {
  try {
    const s = JSON.parse(p.slots) as Slot[];
    if (Array.isArray(s) && s.length) return s;
  } catch {
    /* fall through */
  }
  return defaultSlots(p.posts_per_week);
}

/** Next `count` slots of the project's posting schedule that have no video booked yet. */
export function nextFreeSlots(p: Project, count = 1, from = new Date()): Date[] {
  const tz = appTz();
  const slots = projectSlots(p).sort((a, b) => a.d - b.d || a.t.localeCompare(b.t));
  const horizon = new Date(from.getTime() + 90 * 86_400_000);
  const busy = all<{ at: string }>(
    `SELECT COALESCE(p.scheduled_at, p.published_at) AS at FROM posts p JOIN videos v ON v.id = p.video_id
      WHERE v.project_id = ? AND p.status IN ('scheduled','publishing','processing','published')
        AND COALESCE(p.scheduled_at, p.published_at) BETWEEN ? AND ?`,
    p.id,
    new Date(from.getTime() - 3_600_000).toISOString(),
    horizon.toISOString(),
  ).map((r) => new Date(r.at).getTime());

  const out: Date[] = [];
  const start = zonedParts(from, tz);
  for (let i = 0; i < 90 && out.length < count; i++) {
    const day = zonedToUtc(start.y, start.m, start.d + i, 12, 0, tz);
    const wd = zonedParts(day, tz).wd;
    for (const s of slots.filter((x) => x.d === wd)) {
      const [h, m] = s.t.split(':').map(Number);
      const local = zonedParts(day, tz);
      const at = zonedToUtc(local.y, local.m, local.d, h, m, tz);
      if (at.getTime() < from.getTime() + 10 * 60_000) continue;
      if (busy.some((b) => Math.abs(b - at.getTime()) < 90 * 60_000)) continue;
      if (out.some((o) => o.getTime() === at.getTime())) continue;
      out.push(at);
      busy.push(at.getTime());
      if (out.length >= count) break;
    }
  }
  return out;
}
