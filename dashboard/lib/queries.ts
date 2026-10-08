import { all } from './db';
import type { Column, Platform, PostStatus, Stage } from './types';

export interface BoardCard {
  id: number;
  title: string;
  stage: Stage;
  column: Column;
  hook: string;
  projectId: number;
  projectName: string;
  color: number;
  rubric: string | null;
  thumb: string | null;
  hasFile: boolean;
  duration: number;
  views: number;
  posts: { platform: Platform; status: PostStatus }[];
  nextAt: string | null;
  lastPub: string | null;
  updatedAt: string;
}

export function boardCards(projectId: number | null): BoardCard[] {
  const rows = all<{
    id: number;
    title: string;
    stage: Stage;
    hook: string;
    project_id: number;
    project_name: string;
    color: number;
    rubric: string | null;
    thumb_name: string | null;
    file_name: string | null;
    duration: number;
    views: number | null;
    states: string | null;
    next_at: string | null;
    last_pub: string | null;
    updated_at: string;
  }>(
    `SELECT v.id, v.title, v.stage, v.hook, v.project_id, pr.name AS project_name, pr.color, r.name AS rubric, v.thumb_name, v.file_name,
            v.duration, v.updated_at,
            (SELECT SUM(views) FROM posts WHERE video_id = v.id) AS views,
            (SELECT GROUP_CONCAT(platform || ':' || status) FROM posts WHERE video_id = v.id AND status != 'canceled') AS states,
            (SELECT MIN(scheduled_at) FROM posts WHERE video_id = v.id AND status IN ('scheduled','publishing','processing')) AS next_at,
            (SELECT MAX(published_at) FROM posts WHERE video_id = v.id AND status = 'published') AS last_pub
       FROM videos v JOIN projects pr ON pr.id = v.project_id LEFT JOIN rubrics r ON r.id = v.rubric_id
      WHERE pr.archived = 0 ${projectId ? 'AND v.project_id = ?' : ''}`,
    ...(projectId ? [projectId] : []),
  );
  return rows.map((r) => {
    const posts = (r.states ? r.states.split(',') : []).map((s) => {
      const [platform, status] = s.split(':');
      return { platform: platform as Platform, status: status as PostStatus };
    });
    const column: Column = posts.some((p) => p.status === 'published')
      ? 'published'
      : posts.some((p) => ['scheduled', 'publishing', 'processing'].includes(p.status))
        ? 'scheduled'
        : r.stage;
    return {
      id: r.id,
      title: r.title,
      stage: r.stage,
      column,
      hook: r.hook,
      projectId: r.project_id,
      projectName: r.project_name,
      color: r.color,
      rubric: r.rubric,
      thumb: r.thumb_name,
      hasFile: !!r.file_name,
      duration: r.duration,
      views: r.views ?? 0,
      posts,
      nextAt: r.next_at,
      lastPub: r.last_pub,
      updatedAt: r.updated_at,
    };
  });
}
