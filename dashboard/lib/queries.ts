import { all } from './db';
import { countWords, ruDate } from './plan';
import { plannedAt } from './planner';
import type { Platform, PostStatus, ScriptStatus } from './types';

export interface PlanPost {
  id: number;
  platform: Platform;
  status: PostStatus;
  at: string | null;
  url: string | null;
  views: number;
  error: string;
}

/** One row of the content plan, shaped like the Google Sheets template. */
export interface PlanRow {
  id: number;
  number: number;
  planDate: string | null;
  planTime: string | null;
  /** Plan date + time as an instant (app time zone applied). */
  planAt: string | null;
  rubric: string;
  title: string;
  hook: string;
  coverText: string;
  shot: string;
  script: string;
  words: number;
  cta: string;
  caption: string;
  hashtags: string;
  status: ScriptStatus;
  notes: string;
  file: { thumb: string | null; duration: number; width: number; height: number } | null;
  posts: PlanPost[];
  views: number;
}

export function planRows(projectId: number): PlanRow[] {
  const videos = all<{
    id: number;
    number: number;
    plan_date: string | null;
    plan_time: string | null;
    rubric: string | null;
    title: string;
    hook: string;
    cover_text: string;
    shot: string;
    script: string;
    cta: string;
    caption: string;
    hashtags: string;
    status: ScriptStatus;
    notes: string;
    file_name: string | null;
    thumb_name: string | null;
    duration: number;
    width: number;
    height: number;
  }>(
    `SELECT v.id, v.number, v.plan_date, v.plan_time, r.name AS rubric, v.title, v.hook, v.cover_text, v.shot, v.script, v.cta, v.caption,
            v.hashtags, v.status, v.notes, v.file_name, v.thumb_name, v.duration, v.width, v.height
       FROM videos v LEFT JOIN rubrics r ON r.id = v.rubric_id
      WHERE v.project_id = ? AND v.number > 0
      ORDER BY v.number, v.id`,
    projectId,
  );
  const posts = all<{ id: number; video_id: number; platform: Platform; status: PostStatus; at: string | null; url: string | null; views: number; last_error: string }>(
    `SELECT p.id, p.video_id, p.platform, p.status, COALESCE(p.published_at, p.scheduled_at) AS at, p.url, p.views, p.last_error
       FROM posts p JOIN videos v ON v.id = p.video_id
      WHERE v.project_id = ? AND p.status != 'canceled' ORDER BY p.platform`,
    projectId,
  );
  const byVideo = new Map<number, PlanPost[]>();
  for (const p of posts) {
    const list = byVideo.get(p.video_id) ?? [];
    list.push({ id: p.id, platform: p.platform, status: p.status, at: p.at, url: p.url, views: p.views, error: p.last_error });
    byVideo.set(p.video_id, list);
  }
  return videos.map((v) => {
    const list = byVideo.get(v.id) ?? [];
    return {
      id: v.id,
      number: v.number,
      planDate: v.plan_date,
      planTime: v.plan_time,
      planAt: plannedAt(v)?.toISOString() ?? null,
      rubric: v.rubric ?? '',
      title: v.title,
      hook: v.hook,
      coverText: v.cover_text,
      shot: v.shot,
      script: v.script,
      words: countWords(v.script),
      cta: v.cta,
      caption: v.caption,
      hashtags: v.hashtags,
      status: v.status,
      notes: v.notes,
      file: v.file_name ? { thumb: v.thumb_name, duration: v.duration, width: v.width, height: v.height } : null,
      posts: list,
      views: list.reduce((s, p) => s + p.views, 0),
    };
  });
}

/** The plan in the template's column order (for CSV export and pasting back into Google Sheets). */
export function planGrid(projectId: number): string[][] {
  const header = ['№', 'Дата', 'Время', 'Рубрика', 'Тема', 'Хук', 'Обложка', 'Кадр', 'Текст озвучки', 'Слов', 'Призыв', 'Подпись', 'Хэштеги', 'Статус', 'Ссылки', 'Просмотры'];
  const rows = planRows(projectId).map((r) => [
    String(r.number),
    ruDate(r.planDate),
    r.planTime ?? '',
    r.rubric,
    r.title,
    r.hook,
    r.coverText,
    r.shot,
    r.script,
    String(r.words),
    r.cta,
    r.caption,
    r.hashtags,
    r.status,
    r.posts.map((p) => p.url).filter(Boolean).join(' '),
    r.views ? String(r.views) : '',
  ]);
  return [header, ...rows];
}
