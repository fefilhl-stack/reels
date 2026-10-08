export type Platform = 'tiktok' | 'instagram' | 'youtube';
export const PLATFORMS: Platform[] = ['tiktok', 'instagram', 'youtube'];

export const PLATFORM_LABEL: Record<Platform, string> = {
  tiktok: 'TikTok',
  instagram: 'Instagram',
  youtube: 'YouTube',
};

/** Stored production stage. "scheduled" and "published" are derived from posts. */
export type Stage = 'idea' | 'script' | 'production' | 'ready';
export type Column = Stage | 'scheduled' | 'published';

export const COLUMN_LABEL: Record<Column, string> = {
  idea: 'Идеи',
  script: 'Сценарий',
  production: 'Съёмка и монтаж',
  ready: 'Готово',
  scheduled: 'Запланировано',
  published: 'Опубликовано',
};

export type PostStatus = 'scheduled' | 'publishing' | 'processing' | 'published' | 'failed' | 'canceled';

export const POST_STATUS_LABEL: Record<PostStatus, string> = {
  scheduled: 'Запланирован',
  publishing: 'Загружается',
  processing: 'Обрабатывается',
  published: 'Опубликован',
  failed: 'Ошибка',
  canceled: 'Отменён',
};

export type Slot = { d: number; t: string }; // d: 1 = Monday … 7 = Sunday, t: "HH:MM"

export interface Project {
  id: number;
  name: string;
  color: number;
  description: string;
  audience: string;
  posts_per_week: number;
  followers_goal: number | null;
  goal_deadline: string | null;
  slots: string;
  hashtags: string;
  caption_footer: string;
  archived: number;
  is_demo: number;
  created_at: string;
}

export interface Rubric {
  id: number;
  project_id: number;
  name: string;
  description: string;
}

export type AccountStatus = 'active' | 'reauth' | 'error';

export interface Account {
  id: number;
  project_id: number;
  platform: Platform;
  external_id: string;
  username: string;
  display_name: string;
  avatar_url: string;
  access_token: string;
  refresh_token: string;
  token_expires_at: string | null;
  refresh_expires_at: string | null;
  scopes: string;
  status: AccountStatus;
  status_message: string;
  followers: number;
  is_demo: number;
  created_at: string;
  last_synced_at: string | null;
}

export interface Video {
  id: number;
  project_id: number;
  rubric_id: number | null;
  parent_id: number | null;
  title: string;
  stage: Stage;
  hook: string;
  script: string;
  notes: string;
  caption: string;
  hashtags: string;
  file_name: string | null;
  original_name: string;
  file_size: number;
  mime: string;
  duration: number;
  width: number;
  height: number;
  cover_ms: number;
  thumb_name: string | null;
  is_demo: number;
  created_at: string;
  updated_at: string;
}

export interface PostOptions {
  privacy?: string;
  // TikTok
  disableComment?: boolean;
  disableDuet?: boolean;
  disableStitch?: boolean;
  brandOrganic?: boolean;
  brandContent?: boolean;
  aigc?: boolean;
  // Instagram
  shareToFeed?: boolean;
  // YouTube
  madeForKids?: boolean;
  categoryId?: string;
  tags?: string[];
}

export interface Post {
  id: number;
  video_id: number;
  account_id: number;
  platform: Platform;
  status: PostStatus;
  scheduled_at: string | null;
  published_at: string | null;
  title: string;
  caption: string;
  options: string;
  external_id: string | null;
  url: string | null;
  state: string;
  attempts: number;
  last_error: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  avg_watch_sec: number | null;
  avg_view_pct: number | null;
  metrics_at: string | null;
  is_demo: number;
  created_at: string;
  updated_at: string;
}

export interface Snippet {
  id: number;
  project_id: number | null;
  kind: 'hook' | 'cta' | 'hashtags';
  text: string;
}
