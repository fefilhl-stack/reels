import { all, get, nowIso, run, tx } from './db';
import { nextPlanDate, planSequence, slotTimeFor } from './plan';
import { appTz, dayKey, parseLocal } from './time';
import type { Project, Video } from './types';

// Server-side plan operations: numbering, dates, and keeping scheduled posts in step
// with the plan (the plan's date and time are the publication time).

export function today(): string {
  return dayKey(new Date(), appTz());
}

export function plannedAt(v: Pick<Video, 'plan_date' | 'plan_time'>): Date | null {
  if (!v.plan_date) return null;
  return parseLocal(`${v.plan_date}T${v.plan_time || '12:00'}`);
}

export function nextNumber(projectId: number): number {
  return (get<{ n: number | null }>('SELECT MAX(number) AS n FROM videos WHERE project_id = ?', projectId)?.n ?? 0) + 1;
}

/** Date and time for a script appended to the end of the plan. */
export function nextSlot(project: Project): { date: string; time: string } {
  const last = get<{ d: string | null }>('SELECT MAX(plan_date) AS d FROM videos WHERE project_id = ?', project.id)?.d;
  const start = project.start_date && project.start_date > today() ? project.start_date : today();
  const date = last ? nextPlanDate(last, project.posts_per_week) : planSequence(start, project.posts_per_week, 1)[0];
  return { date, time: slotTimeFor(date, project.time_weekday, project.time_weekend) };
}

/** Moves the video's not-yet-published posts to its plan date and time. */
export function syncScheduledPosts(videoId: number) {
  const v = get<Video>('SELECT * FROM videos WHERE id = ?', videoId);
  if (!v) return;
  let at = plannedAt(v);
  if (!at) return;
  if (at.getTime() < Date.now()) at = new Date(Date.now() + 2 * 60_000);
  run("UPDATE posts SET scheduled_at = ?, updated_at = ? WHERE video_id = ? AND status = 'scheduled'", at.toISOString(), nowIso(), videoId);
}

/**
 * Re-counts plan dates from the start date in № order, like the template's formulas
 * (row 1 = start date, every next row = the next posting day; 18:00 weekdays, 17:00 weekends).
 */
export function recomputeDates(project: Project): number {
  const rows = all<{ id: number; plan_date: string | null; plan_time: string | null }>(
    'SELECT id, plan_date, plan_time FROM videos WHERE project_id = ? ORDER BY number, id',
    project.id,
  );
  if (!rows.length) return 0;
  const start = project.start_date || today();
  const dates = planSequence(start, project.posts_per_week, rows.length);
  let changed = 0;
  tx(() => {
    rows.forEach((r, i) => {
      const date = dates[i];
      const time = slotTimeFor(date, project.time_weekday, project.time_weekend);
      if (r.plan_date === date && r.plan_time === time) return;
      run('UPDATE videos SET plan_date = ?, plan_time = ?, updated_at = ? WHERE id = ?', date, time, nowIso(), r.id);
      changed++;
    });
  });
  for (const r of rows) syncScheduledPosts(r.id);
  return changed;
}

/** Renumbers a project's scripts 1..n keeping their current order. */
export function renumber(projectId: number) {
  const rows = all<{ id: number }>('SELECT id FROM videos WHERE project_id = ? ORDER BY number, plan_date, id', projectId);
  tx(() => rows.forEach((r, i) => run('UPDATE videos SET number = ? WHERE id = ?', i + 1, r.id)));
}
