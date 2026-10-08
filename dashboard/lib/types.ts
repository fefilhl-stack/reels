export type Platform = 'tiktok' | 'instagram' | 'youtube';
export const PLATFORMS: Platform[] = ['tiktok', 'instagram', 'youtube'];

export const PLATFORM_LABEL: Record<Platform, string> = {
  tiktok: 'TikTok',
  instagram: 'Instagram',
  youtube: 'YouTube',
};

/** Script statuses — the same list as the «Статус» dropdown in the Google Sheets template. */
export const STATUSES = ['Не начат', 'Озвучен', 'Смонтирован', 'Опубликован'] as const;
export type ScriptStatus = (typeof STATUSES)[number];

export type PostStatus = 'scheduled' | 'publishing' | 'processing' | 'published' | 'failed' | 'canceled';

export const POST_STATUS_LABEL: Record<PostStatus, string> = {
  scheduled: 'Запланирован',
  publishing: 'Загружается',
  processing: 'Обрабатывается',
  published: 'Опубликован',
  failed: 'Ошибка',
  canceled: 'Отменён',
};

/** Project passport — mirrors the «Проекты» sheet of the template. */
export interface Project {
  id: number;
  name: string;
  color: number;
  /** Тема аккаунта */
  description: string;
  /** Обещание зрителю */
  promise: string;
  /** Цель (text) */
  goal_text: string;
  audience: string;
  /** Формат */
  format: string;
  /** Длина ролика, e.g. "40–60 секунд" */
  video_length: string;
  /** Норма слов, e.g. "100–120" */
  words_norm: string;
  /** Частота, e.g. "Один ролик в день" */
  frequency: string;
  /** Дата старта (YYYY-MM-DD) — plan dates are counted from it */
  start_date: string | null;
  /** Время публикации в будни / выходные (HH:MM) */
  time_weekday: string;
  time_weekend: string;
  /** Обращение */
  address_form: string;
  /** Рубрики — the passport text as written; structured list lives in `rubrics` */
  rubrics_text: string;
  /** Призывы */
  ctas: string;
  /** На чём основаны факты */
  facts: string;
  /** Чего в роликах нет */
  exclusions: string;
  /** Где нужна фраза о специалисте */
  specialist: string;
  /** Открытые вопросы */
  open_questions: string;
  /** Что проверить перед публикацией */
  checks: string;
  posts_per_week: number;
  followers_goal: number | null;
  goal_deadline: string | null;
  /** Legacy weekly queue slots (JSON), superseded by frequency + publication times */
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
  /** Target share of the plan, 0..1 (from «Рубрики» in the passport) */
  share: number | null;
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

/** A script row of the content plan (and its video once uploaded). */
export interface Video {
  id: number;
  project_id: number;
  rubric_id: number | null;
  parent_id: number | null;
  /** № in the plan */
  number: number;
  /** Дата / Время (YYYY-MM-DD, HH:MM, app time zone) */
  plan_date: string | null;
  plan_time: string | null;
  /** Тема */
  title: string;
  /** Хук */
  hook: string;
  /** Обложка — text on the cover */
  cover_text: string;
  /** Кадр — what's on screen */
  shot: string;
  /** Текст озвучки */
  script: string;
  /** Призыв */
  cta: string;
  /** Подпись */
  caption: string;
  /** Хэштеги */
  hashtags: string;
  status: ScriptStatus;
  notes: string;
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
