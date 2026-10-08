'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { checkPassword, requireAuth, SESSION_COOKIE, sessionToken } from '@/lib/auth';
import { buildCaption } from '@/lib/captions';
import { all, get, log, nowIso, run, tx } from '@/lib/db';
import { clearDemo, loadDemo } from '@/lib/demo';
import { adapterFor } from '@/lib/platforms';
import { publishPost } from '@/lib/publisher';
import { SCOPE_COOKIE } from '@/lib/scope';
import { nextFreeSlots } from '@/lib/slots';
import { extractFrame, probeFile } from '@/lib/probe';
import { removeFile, safePath } from '@/lib/storage';
import { importRecent, syncAccount } from '@/lib/sync';
import { appTz, parseLocal, zonedParts, zonedToUtc } from '@/lib/time';
import { accessToken } from '@/lib/tokens';
import { PLATFORMS, type Account, type Platform, type PostOptions, type Project, type Slot, type Stage, type Video } from '@/lib/types';
import { tick } from '@/lib/worker';

const refreshAll = () => revalidatePath('/', 'layout');
const str = (f: FormData, k: string) => String(f.get(k) ?? '').trim();
const num = (f: FormData, k: string) => {
  const v = Number(f.get(k));
  return Number.isFinite(v) ? v : 0;
};

// --- Session ------------------------------------------------------------------

export async function login(_prev: string | null, form: FormData): Promise<string | null> {
  if (!checkPassword(str(form, 'password'))) return 'Неверный пароль';
  const jar = await cookies();
  jar.set(SESSION_COOKIE, sessionToken(), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.APP_URL?.startsWith('https://') ?? false,
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
  redirect('/');
}

export async function logout() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  redirect('/login');
}

export async function setScope(projectId: number) {
  await requireAuth();
  const jar = await cookies();
  if (projectId) jar.set(SCOPE_COOKIE, String(projectId), { path: '/', sameSite: 'lax', maxAge: 60 * 60 * 24 * 365 });
  else jar.delete(SCOPE_COOKIE);
  refreshAll();
}

// --- Projects -----------------------------------------------------------------

export async function createProject(form: FormData) {
  await requireAuth();
  const name = str(form, 'name');
  if (!name) return;
  const used = all<{ color: number }>('SELECT color FROM projects WHERE archived = 0').map((r) => r.color);
  const color = [0, 1, 2, 3, 4, 5, 6, 7].find((c) => !used.includes(c)) ?? used.length % 8;
  const id = run(
    'INSERT INTO projects (name, color, description, posts_per_week, created_at) VALUES (?, ?, ?, ?, ?)',
    name,
    color,
    str(form, 'description'),
    Math.max(1, num(form, 'posts_per_week') || 3),
    nowIso(),
  ).id;
  const jar = await cookies();
  jar.set(SCOPE_COOKIE, String(id), { path: '/', sameSite: 'lax', maxAge: 60 * 60 * 24 * 365 });
  refreshAll();
  redirect(`/projects/${id}`);
}

export async function updateProject(id: number, form: FormData) {
  await requireAuth();
  const slots: Slot[] = [];
  for (const d of [1, 2, 3, 4, 5, 6, 7]) {
    const times = str(form, `slot_${d}`)
      .split(/[,\s]+/)
      .map((t) => t.trim())
      .filter((t) => /^\d{1,2}:\d{2}$/.test(t));
    for (const t of times) slots.push({ d, t: t.padStart(5, '0') });
  }
  run(
    `UPDATE projects SET name = ?, color = ?, description = ?, audience = ?, posts_per_week = ?, followers_goal = ?, goal_deadline = ?,
       slots = ?, hashtags = ?, caption_footer = ? WHERE id = ?`,
    str(form, 'name') || 'Без названия',
    Math.max(0, Math.min(7, num(form, 'color'))),
    str(form, 'description'),
    str(form, 'audience'),
    Math.max(1, num(form, 'posts_per_week') || 1),
    num(form, 'followers_goal') || null,
    str(form, 'goal_deadline') || null,
    JSON.stringify(slots),
    str(form, 'hashtags'),
    str(form, 'caption_footer'),
    id,
  );
  refreshAll();
}

export async function archiveProject(id: number) {
  await requireAuth();
  run('UPDATE projects SET archived = 1 WHERE id = ?', id);
  const jar = await cookies();
  jar.delete(SCOPE_COOKIE);
  refreshAll();
  redirect('/projects');
}

export async function addRubric(projectId: number, form: FormData) {
  await requireAuth();
  const name = str(form, 'name');
  if (name) run('INSERT INTO rubrics (project_id, name, description) VALUES (?, ?, ?)', projectId, name, str(form, 'description'));
  refreshAll();
}

export async function deleteRubric(id: number) {
  await requireAuth();
  run('DELETE FROM rubrics WHERE id = ?', id);
  refreshAll();
}

export async function addSnippet(projectId: number, form: FormData) {
  await requireAuth();
  const text = str(form, 'text');
  const kind = str(form, 'kind');
  if (text && ['hook', 'cta', 'hashtags'].includes(kind)) {
    run('INSERT INTO snippets (project_id, kind, text) VALUES (?, ?, ?)', projectId, kind, text);
  }
  refreshAll();
}

export async function deleteSnippet(id: number) {
  await requireAuth();
  run('DELETE FROM snippets WHERE id = ?', id);
  refreshAll();
}

// --- Accounts -----------------------------------------------------------------

export async function addDemoAccount(projectId: number, platform: Platform) {
  await requireAuth();
  if (!PLATFORMS.includes(platform)) return;
  const n = all<{ n: number }>('SELECT COUNT(*) AS n FROM accounts WHERE project_id = ? AND platform = ?', projectId, platform)[0].n;
  const project = get<Project>('SELECT * FROM projects WHERE id = ?', projectId);
  if (!project) return;
  const username = `demo_${platform}${n ? `_${n + 1}` : ''}`;
  run(
    `INSERT INTO accounts (project_id, platform, external_id, username, display_name, access_token, followers, is_demo, created_at)
     VALUES (?, ?, ?, ?, ?, 'demo', 1000, 1, ?)`,
    projectId,
    platform,
    `demo-${Date.now()}`,
    username,
    project.name,
    nowIso(),
  );
  refreshAll();
}

export async function syncAccountNow(id: number) {
  await requireAuth();
  await syncAccount(id, true);
  refreshAll();
}

export async function importAccountVideos(id: number): Promise<string> {
  await requireAuth();
  try {
    const n = await importRecent(id);
    refreshAll();
    return `Импортировано: ${n}`;
  } catch (e) {
    return `Ошибка: ${(e as Error).message}`;
  }
}

export async function disconnectAccount(id: number) {
  await requireAuth();
  const a = get<Account>('SELECT * FROM accounts WHERE id = ?', id);
  if (!a) return;
  run('DELETE FROM accounts WHERE id = ?', id);
  log('info', `Отключён ${a.platform} @${a.username}`);
  refreshAll();
}

export async function tiktokCreatorInfo(accountId: number) {
  await requireAuth();
  const a = get<Account>('SELECT * FROM accounts WHERE id = ?', accountId);
  if (!a || a.platform !== 'tiktok') return null;
  try {
    const adapter = adapterFor(a);
    return (await adapter.creatorInfo?.(a, await accessToken(a))) ?? null;
  } catch (e) {
    return { error: (e as Error).message };
  }
}

// --- Videos -------------------------------------------------------------------

export async function createIdea(form: FormData) {
  await requireAuth();
  const title = str(form, 'title');
  const projectId = num(form, 'project_id');
  if (!title || !projectId) return;
  const now = nowIso();
  const stage = (str(form, 'stage') || 'idea') as Stage;
  run(
    'INSERT INTO videos (project_id, rubric_id, title, stage, hook, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    projectId,
    num(form, 'rubric_id') || null,
    title,
    stage,
    str(form, 'hook'),
    now,
    now,
  );
  refreshAll();
}

export interface UploadedVideo {
  fileName: string;
  originalName: string;
  size: number;
  mime: string;
  duration: number;
  width: number;
  height: number;
  thumbName: string | null;
}

/** Fills duration/size/cover on the server when the browser couldn't read the file. */
async function completeMeta(f: UploadedVideo): Promise<UploadedVideo> {
  const file = safePath(f.fileName);
  if (!file || (f.duration && f.width && f.thumbName)) return f;
  const meta = f.duration && f.width ? null : await probeFile(file);
  const out = { ...f, ...(meta ?? {}) };
  if (!out.thumbName) out.thumbName = await extractFrame(file, Math.min(1, (out.duration || 2) / 2));
  return out;
}

export async function createVideosFromUploads(projectId: number, rubricId: number | null, uploads: UploadedVideo[]): Promise<number[]> {
  await requireAuth();
  const files = await Promise.all(uploads.map(completeMeta));
  const now = nowIso();
  const ids = tx(() =>
    files.map(
      (f) =>
        run(
          `INSERT INTO videos (project_id, rubric_id, title, stage, file_name, original_name, file_size, mime, duration, width, height,
             cover_ms, thumb_name, created_at, updated_at) VALUES (?, ?, ?, 'ready', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          projectId,
          rubricId,
          f.originalName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || 'Новый ролик',
          f.fileName,
          f.originalName,
          f.size,
          f.mime,
          f.duration,
          f.width,
          f.height,
          Math.round(Math.min(1, f.duration / 2) * 1000),
          f.thumbName,
          now,
          now,
        ).id,
    ),
  );
  refreshAll();
  return ids;
}

export async function attachFile(videoId: number, upload: UploadedVideo) {
  await requireAuth();
  const f = await completeMeta(upload);
  const v = get<Video>('SELECT * FROM videos WHERE id = ?', videoId);
  if (!v) return;
  removeFile(v.file_name);
  removeFile(v.thumb_name);
  run(
    `UPDATE videos SET file_name = ?, original_name = ?, file_size = ?, mime = ?, duration = ?, width = ?, height = ?, thumb_name = ?,
       cover_ms = ?, stage = CASE WHEN stage IN ('idea','script','production') THEN 'ready' ELSE stage END, updated_at = ? WHERE id = ?`,
    f.fileName,
    f.originalName,
    f.size,
    f.mime,
    f.duration,
    f.width,
    f.height,
    f.thumbName,
    Math.round(Math.min(1, f.duration / 2) * 1000),
    nowIso(),
    videoId,
  );
  refreshAll();
}

export async function setCover(videoId: number, coverMs: number, thumbName: string | null) {
  await requireAuth();
  const v = get<Video>('SELECT * FROM videos WHERE id = ?', videoId);
  if (!v) return;
  if (thumbName && thumbName !== v.thumb_name) removeFile(v.thumb_name);
  run('UPDATE videos SET cover_ms = ?, thumb_name = COALESCE(?, thumb_name), updated_at = ? WHERE id = ?', Math.round(coverMs), thumbName, nowIso(), videoId);
  refreshAll();
}

export async function updateVideo(id: number, form: FormData) {
  await requireAuth();
  run(
    `UPDATE videos SET title = ?, project_id = ?, rubric_id = ?, stage = ?, hook = ?, script = ?, notes = ?, caption = ?, hashtags = ?, updated_at = ?
      WHERE id = ?`,
    str(form, 'title') || 'Без названия',
    num(form, 'project_id'),
    num(form, 'rubric_id') || null,
    str(form, 'stage') || 'idea',
    str(form, 'hook'),
    str(form, 'script'),
    str(form, 'notes'),
    str(form, 'caption'),
    str(form, 'hashtags'),
    nowIso(),
    id,
  );
  refreshAll();
}

export async function setStage(id: number, stage: Stage) {
  await requireAuth();
  if (!['idea', 'script', 'production', 'ready'].includes(stage)) return;
  run('UPDATE videos SET stage = ?, updated_at = ? WHERE id = ?', stage, nowIso(), id);
  refreshAll();
}

export async function deleteVideo(id: number) {
  await requireAuth();
  const v = get<Video>('SELECT * FROM videos WHERE id = ?', id);
  if (!v) return;
  const live = get<{ n: number }>("SELECT COUNT(*) AS n FROM posts WHERE video_id = ? AND status IN ('publishing','processing')", id);
  if (live?.n) return;
  run('DELETE FROM videos WHERE id = ?', id);
  removeFile(v.file_name);
  removeFile(v.thumb_name);
  refreshAll();
  redirect('/content');
}

export async function makeSequel(id: number) {
  await requireAuth();
  const v = get<Video>('SELECT * FROM videos WHERE id = ?', id);
  if (!v) return;
  const now = nowIso();
  const part = (v.title.match(/часть (\d+)/i)?.[1] ? Number(v.title.match(/часть (\d+)/i)![1]) : 1) + 1;
  const base = v.title.replace(/\s*[—-]\s*часть \d+$/i, '');
  const newId = run(
    `INSERT INTO videos (project_id, rubric_id, parent_id, title, stage, hook, notes, hashtags, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'idea', ?, ?, ?, ?, ?)`,
    v.project_id,
    v.rubric_id,
    v.id,
    `${base} — часть ${part}`,
    v.hook,
    `Продолжение ролика «${v.title}». Сохраните хук и подачу, раскройте вопрос из комментариев.`,
    v.hashtags,
    now,
    now,
  ).id;
  refreshAll();
  redirect(`/content/${newId}`);
}

// --- Publishing ---------------------------------------------------------------

export interface PublishTarget {
  accountId: number;
  title: string;
  caption: string;
  options: PostOptions;
}

export type When = { mode: 'now' } | { mode: 'queue' } | { mode: 'at'; at: string };

export async function schedulePublish(videoId: number, targets: PublishTarget[], when: When): Promise<{ ok: boolean; message: string }> {
  await requireAuth();
  const video = get<Video>('SELECT * FROM videos WHERE id = ?', videoId);
  if (!video) return { ok: false, message: 'Ролик не найден' };
  if (!targets.length) return { ok: false, message: 'Выберите хотя бы один аккаунт' };
  const project = get<Project>('SELECT * FROM projects WHERE id = ?', video.project_id)!;
  const accounts = targets.map((t) => get<Account>('SELECT * FROM accounts WHERE id = ?', t.accountId)).filter(Boolean) as Account[];
  if (!video.file_name && accounts.some((a) => !a.is_demo)) return { ok: false, message: 'Сначала прикрепите видеофайл' };
  for (const t of targets) {
    const a = accounts.find((x) => x.id === t.accountId);
    if (a?.platform === 'tiktok' && !t.options.privacy) return { ok: false, message: 'TikTok: выберите, кто сможет смотреть ролик' };
  }

  let at: Date;
  if (when.mode === 'now') at = new Date();
  else if (when.mode === 'queue') at = nextFreeSlots(project, 1)[0] ?? new Date(Date.now() + 86_400_000);
  else {
    const parsed = parseLocal(when.at);
    if (!parsed) return { ok: false, message: 'Неверная дата' };
    at = parsed;
  }

  const now = nowIso();
  const ids = tx(() =>
    targets.map((t) => {
      const a = accounts.find((x) => x.id === t.accountId)!;
      // Replace an existing pending post to the same account instead of duplicating it.
      run("DELETE FROM posts WHERE video_id = ? AND account_id = ? AND status IN ('scheduled','failed','canceled')", videoId, a.id);
      return run(
        `INSERT INTO posts (video_id, account_id, platform, status, scheduled_at, title, caption, options, is_demo, created_at, updated_at)
         VALUES (?, ?, ?, 'scheduled', ?, ?, ?, ?, ?, ?, ?)`,
        videoId,
        a.id,
        a.platform,
        at.toISOString(),
        t.title,
        t.caption,
        JSON.stringify(t.options),
        a.is_demo,
        now,
        now,
      ).id;
    }),
  );
  if (when.mode === 'now') {
    // Fire and forget: uploads can take minutes; the post page shows progress.
    for (const id of ids) void publishPost(id);
  }
  refreshAll();
  const whenText =
    when.mode === 'now'
      ? 'Публикация запущена'
      : `Запланировано на ${new Intl.DateTimeFormat('ru-RU', { timeZone: appTz(), day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(at)}`;
  return { ok: true, message: whenText };
}

/** One click from the calendar/board: next free slot, every active account, default captions. */
export async function queueVideo(videoId: number): Promise<{ ok: boolean; message: string }> {
  await requireAuth();
  const video = get<Video>('SELECT * FROM videos WHERE id = ?', videoId);
  if (!video) return { ok: false, message: 'Ролик не найден' };
  const project = get<Project>('SELECT * FROM projects WHERE id = ?', video.project_id)!;
  const accounts = all<Account>("SELECT * FROM accounts WHERE project_id = ? AND status = 'active'", project.id);
  if (!accounts.length) return { ok: false, message: 'У проекта нет подключённых аккаунтов' };
  return schedulePublish(
    videoId,
    accounts.map((a) => ({
      accountId: a.id,
      title: video.title.slice(0, 100),
      caption: buildCaption(a.platform, video, project),
      options:
        a.platform === 'tiktok'
          ? { privacy: a.is_demo ? 'PUBLIC_TO_EVERYONE' : 'SELF_ONLY' }
          : a.platform === 'youtube'
            ? { privacy: 'public', madeForKids: false }
            : { shareToFeed: true },
    })),
    { mode: 'queue' },
  );
}

export async function cancelPost(id: number) {
  await requireAuth();
  run("UPDATE posts SET status = 'canceled', updated_at = ? WHERE id = ? AND status IN ('scheduled','failed')", nowIso(), id);
  refreshAll();
}

export async function deletePost(id: number) {
  await requireAuth();
  run("DELETE FROM posts WHERE id = ? AND status IN ('scheduled','failed','canceled')", id);
  refreshAll();
}

export async function retryPost(id: number) {
  await requireAuth();
  run(
    "UPDATE posts SET status = 'scheduled', scheduled_at = ?, attempts = 0, last_error = '', updated_at = ? WHERE id = ? AND status IN ('failed','canceled')",
    nowIso(),
    nowIso(),
    id,
  );
  void publishPost(id);
  refreshAll();
}

/** Calendar drag & drop: keep the time of day, move to another date (app time zone). */
export async function movePostToDay(id: number, ymd: string) {
  await requireAuth();
  const post = get<{ scheduled_at: string; video_id: number }>("SELECT scheduled_at, video_id FROM posts WHERE id = ? AND status = 'scheduled'", id);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!post || !m) return;
  const tz = appTz();
  const p = zonedParts(post.scheduled_at, tz);
  let at = zonedToUtc(+m[1], +m[2], +m[3], p.h, p.min, tz);
  if (at.getTime() < Date.now()) at = new Date(Date.now() + 5 * 60_000);
  // Move every scheduled post of the same video that shared the old slot.
  run(
    "UPDATE posts SET scheduled_at = ?, updated_at = ? WHERE video_id = ? AND status = 'scheduled' AND scheduled_at = ?",
    at.toISOString(),
    nowIso(),
    post.video_id,
    post.scheduled_at,
  );
  refreshAll();
}

export async function reschedulePost(id: number, local: string) {
  await requireAuth();
  const at = parseLocal(local);
  if (!at) return;
  run("UPDATE posts SET scheduled_at = ?, updated_at = ? WHERE id = ? AND status = 'scheduled'", at.toISOString(), nowIso(), id);
  refreshAll();
}

// --- System -------------------------------------------------------------------

export async function runTickNow() {
  await requireAuth();
  await tick({ sync: true });
  refreshAll();
}

export async function syncAllNow() {
  await requireAuth();
  const ids = all<{ id: number }>("SELECT id FROM accounts WHERE status != 'reauth'");
  for (const { id } of ids) await syncAccount(id, true);
  refreshAll();
}

export async function loadDemoData() {
  await requireAuth();
  loadDemo();
  refreshAll();
}

export async function clearDemoData() {
  await requireAuth();
  clearDemo();
  const jar = await cookies();
  jar.delete(SCOPE_COOKIE);
  refreshAll();
}
