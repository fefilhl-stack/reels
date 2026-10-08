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
import { fetchSheet, importPassportGrid, importPlanGrid, previewGrid, type ImportPreview } from '@/lib/import';
import { normalizeStatus, parseDateCell, parseRubrics, parseTimeCell, slotTimeFor } from '@/lib/plan';
import { nextNumber, nextSlot, plannedAt, recomputeDates, syncScheduledPosts } from '@/lib/planner';
import { extractFrame, probeFile } from '@/lib/probe';
import type { Grid } from '@/lib/tabular';
import { removeFile, safePath } from '@/lib/storage';
import { importRecent, syncAccount } from '@/lib/sync';
import { appTz, parseLocal, toLocalInput } from '@/lib/time';
import { accessToken } from '@/lib/tokens';
import { PLATFORMS, type Account, type Platform, type PostOptions, type Project, type Video } from '@/lib/types';
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
    'INSERT INTO projects (name, color, description, posts_per_week, frequency, start_date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    name,
    color,
    str(form, 'description'),
    Math.min(7, Math.max(1, num(form, 'posts_per_week') || 7)),
    str(form, 'frequency') || 'Один ролик в день',
    str(form, 'start_date') || null,
    nowIso(),
  ).id;
  const jar = await cookies();
  jar.set(SCOPE_COOKIE, String(id), { path: '/', sameSite: 'lax', maxAge: 60 * 60 * 24 * 365 });
  refreshAll();
  redirect(`/projects/${id}`);
}

const PASSPORT_TEXT = [
  'description',
  'promise',
  'goal_text',
  'audience',
  'format',
  'video_length',
  'words_norm',
  'frequency',
  'address_form',
  'rubrics_text',
  'ctas',
  'facts',
  'exclusions',
  'specialist',
  'open_questions',
  'checks',
  'hashtags',
  'caption_footer',
] as const;

/** Saves the project passport; schedule changes re-count plan dates when asked to. */
/** Creates a project without leaving the page (import into a new project). */
export async function createProjectQuick(name: string): Promise<number | null> {
  await requireAuth();
  const n = name.trim();
  if (!n) return null;
  const existing = get<{ id: number }>('SELECT id FROM projects WHERE archived = 0 AND lower(name) = lower(?)', n);
  if (existing) return existing.id;
  const used = all<{ color: number }>('SELECT color FROM projects WHERE archived = 0').map((r) => r.color);
  const color = [0, 1, 2, 3, 4, 5, 6, 7].find((c) => !used.includes(c)) ?? used.length % 8;
  const id = run(
    "INSERT INTO projects (name, color, posts_per_week, frequency, created_at) VALUES (?, ?, 7, 'Один ролик в день', ?)",
    n,
    color,
    nowIso(),
  ).id;
  refreshAll();
  return id;
}

export async function updateProject(id: number, form: FormData) {
  await requireAuth();
  const before = get<Project>('SELECT * FROM projects WHERE id = ?', id);
  if (!before) return;
  const time = (k: string, fallback: string) => parseTimeCell(str(form, k)) ?? fallback;
  const startDate = str(form, 'start_date') ? parseDateCell(str(form, 'start_date')) : null;
  run(
    `UPDATE projects SET name = ?, color = ?, ${PASSPORT_TEXT.map((f) => `${f} = ?`).join(', ')}, posts_per_week = ?, start_date = ?,
       time_weekday = ?, time_weekend = ?, followers_goal = ?, goal_deadline = ? WHERE id = ?`,
    str(form, 'name') || before.name,
    Math.max(0, Math.min(7, num(form, 'color'))),
    ...PASSPORT_TEXT.map((f) => str(form, f)),
    Math.max(1, Math.min(7, num(form, 'posts_per_week') || before.posts_per_week)),
    startDate,
    time('time_weekday', before.time_weekday),
    time('time_weekend', before.time_weekend),
    num(form, 'followers_goal') || null,
    str(form, 'goal_deadline') || null,
    id,
  );
  // Target shares stated in «Рубрики», e.g. "Ошибки с прогрессом (25%)".
  const rubrics = parseRubrics(str(form, 'rubrics_text')).filter((r) => r.share != null);
  for (const r of rubrics) {
    const match = get<{ id: number }>('SELECT id FROM rubrics WHERE project_id = ? AND lower(name) = lower(?)', id, r.name);
    if (match) run('UPDATE rubrics SET share = ? WHERE id = ?', r.share, match.id);
    else run('INSERT INTO rubrics (project_id, name, share) VALUES (?, ?, ?)', id, r.name, r.share);
  }
  if (form.get('recompute') === 'on') recomputeDates(get<Project>('SELECT * FROM projects WHERE id = ?', id)!);
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

// --- Content plan (scripts) ------------------------------------------------------

/** Appends a script to the end of the plan: next №, next posting day and time. */
export async function createScript(projectId: number, title = ''): Promise<number | null> {
  await requireAuth();
  const project = get<Project>('SELECT * FROM projects WHERE id = ?', projectId);
  if (!project) return null;
  const slot = nextSlot(project);
  const now = nowIso();
  const id = run(
    `INSERT INTO videos (project_id, number, plan_date, plan_time, title, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'Не начат', ?, ?)`,
    projectId,
    nextNumber(projectId),
    slot.date,
    slot.time,
    title.trim() || 'Новая тема',
    now,
    now,
  ).id;
  refreshAll();
  return id;
}

const EDITABLE = ['title', 'hook', 'cover_text', 'shot', 'script', 'cta', 'caption', 'hashtags', 'notes'] as const;
export type ScriptField = (typeof EDITABLE)[number] | 'rubric' | 'status' | 'plan_date' | 'plan_time' | 'number';

/** Inline edit of one cell of the plan table. */
export async function updateScriptField(id: number, field: ScriptField, value: string): Promise<{ ok: boolean; message?: string }> {
  await requireAuth();
  const v = get<Video>('SELECT * FROM videos WHERE id = ?', id);
  if (!v) return { ok: false, message: 'Сценарий не найден' };
  const now = nowIso();
  const text = value.trim();
  if ((EDITABLE as readonly string[]).includes(field)) {
    run(`UPDATE videos SET ${field} = ?, updated_at = ? WHERE id = ?`, field === 'title' ? text || v.title : value, now, id);
  } else if (field === 'rubric') {
    let rubricId: number | null = null;
    if (text) {
      rubricId =
        get<{ id: number }>('SELECT id FROM rubrics WHERE project_id = ? AND lower(name) = lower(?)', v.project_id, text)?.id ??
        run('INSERT INTO rubrics (project_id, name) VALUES (?, ?)', v.project_id, text).id;
    }
    run('UPDATE videos SET rubric_id = ?, updated_at = ? WHERE id = ?', rubricId, now, id);
  } else if (field === 'status') {
    const status = normalizeStatus(text);
    if (!status) return { ok: false, message: 'Неизвестный статус' };
    run('UPDATE videos SET status = ?, updated_at = ? WHERE id = ?', status, now, id);
  } else if (field === 'plan_date') {
    const date = text ? parseDateCell(text) : null;
    if (text && !date) return { ok: false, message: 'Дата в формате ДД.ММ.ГГГГ' };
    const project = get<Project>('SELECT * FROM projects WHERE id = ?', v.project_id)!;
    // Keep the template rule (weekday/weekend time) unless the time was set by hand.
    const ruled = v.plan_date ? slotTimeFor(v.plan_date, project.time_weekday, project.time_weekend) : null;
    const time = date && (!v.plan_time || v.plan_time === ruled) ? slotTimeFor(date, project.time_weekday, project.time_weekend) : v.plan_time;
    run('UPDATE videos SET plan_date = ?, plan_time = ?, updated_at = ? WHERE id = ?', date, time, now, id);
    syncScheduledPosts(id);
  } else if (field === 'plan_time') {
    const time = text ? parseTimeCell(text) : null;
    if (text && !time) return { ok: false, message: 'Время в формате ЧЧ:ММ' };
    run('UPDATE videos SET plan_time = ?, updated_at = ? WHERE id = ?', time, now, id);
    syncScheduledPosts(id);
  } else if (field === 'number') {
    const n = Number.parseInt(text, 10);
    if (!n || n < 1) return { ok: false, message: 'Номер — целое число' };
    // Taking a number that's in use swaps the two rows.
    tx(() => {
      run('UPDATE videos SET number = ? WHERE project_id = ? AND number = ? AND id != ?', v.number, v.project_id, n, id);
      run('UPDATE videos SET number = ?, updated_at = ? WHERE id = ?', n, now, id);
    });
  }
  refreshAll();
  return { ok: true };
}

/** Full save from the script page. */
export async function updateScript(id: number, form: FormData): Promise<{ ok: boolean; message?: string }> {
  await requireAuth();
  const v = get<Video>('SELECT * FROM videos WHERE id = ?', id);
  if (!v) return { ok: false, message: 'Сценарий не найден' };
  for (const f of EDITABLE) {
    if (form.has(f)) run(`UPDATE videos SET ${f} = ? WHERE id = ?`, f === 'title' ? str(form, f) || v.title : String(form.get(f) ?? ''), id);
  }
  for (const f of ['rubric', 'status', 'plan_date', 'plan_time'] as const) {
    if (!form.has(f)) continue;
    const r = await updateScriptField(id, f, str(form, f));
    if (!r.ok) return r;
  }
  run('UPDATE videos SET updated_at = ? WHERE id = ?', nowIso(), id);
  refreshAll();
  return { ok: true };
}

/** Calendar drag & drop: new plan date, scheduled posts follow. */
export async function moveScript(id: number, ymd: string) {
  await requireAuth();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return;
  await updateScriptField(id, 'plan_date', ymd);
}

export async function recomputePlanDates(projectId: number): Promise<string> {
  await requireAuth();
  const project = get<Project>('SELECT * FROM projects WHERE id = ?', projectId);
  if (!project) return 'Проект не найден';
  const n = recomputeDates(project);
  refreshAll();
  return n ? `Даты пересчитаны: изменено ${n}` : 'Даты уже совпадают с расписанием';
}

// --- Import from Google Sheets ------------------------------------------------

export async function previewImport(grid: Grid): Promise<ImportPreview | { error: string }> {
  await requireAuth();
  return previewGrid(grid);
}

export async function fetchSheetGrid(link: string): Promise<{ ok: true; grid: Grid } | { ok: false; error: string }> {
  await requireAuth();
  try {
    return { ok: true, grid: await fetchSheet(link) };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function runImport(grid: Grid, projectId: number | null): Promise<{ ok: boolean; message: string }> {
  await requireAuth();
  try {
    const preview = previewGrid(grid);
    if ('error' in preview) return { ok: false, message: preview.error };
    if (preview.kind === 'passport') {
      const r = importPassportGrid(grid);
      refreshAll();
      return {
        ok: true,
        message: [r.created.length && `Новые проекты: ${r.created.join(', ')}`, r.updated.length && `Обновлены паспорта: ${r.updated.join(', ')}`]
          .filter(Boolean)
          .join('. '),
      };
    }
    if (!projectId) return { ok: false, message: 'Выберите проект, в который импортировать контент-план' };
    const r = importPlanGrid(projectId, grid);
    refreshAll();
    return { ok: true, message: `Сценариев добавлено: ${r.created}, обновлено: ${r.updated}${r.skipped ? `, пропущено строк: ${r.skipped}` : ''}` };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
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

export async function attachFile(videoId: number, upload: UploadedVideo) {
  await requireAuth();
  const f = await completeMeta(upload);
  const v = get<Video>('SELECT * FROM videos WHERE id = ?', videoId);
  if (!v) return;
  removeFile(v.file_name);
  removeFile(v.thumb_name);
  run(
    `UPDATE videos SET file_name = ?, original_name = ?, file_size = ?, mime = ?, duration = ?, width = ?, height = ?, thumb_name = ?,
       cover_ms = ?, status = CASE WHEN status IN ('Не начат','Озвучен') THEN 'Смонтирован' ELSE status END, updated_at = ? WHERE id = ?`,
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
  redirect(`/content?p=${v.project_id}`);
}

/** «Сделать часть 2»: a new script at the end of the plan with the same rubric and hook. */
export async function makeSequel(id: number) {
  await requireAuth();
  const v = get<Video>('SELECT * FROM videos WHERE id = ?', id);
  if (!v) return;
  const project = get<Project>('SELECT * FROM projects WHERE id = ?', v.project_id)!;
  const slot = nextSlot(project);
  const now = nowIso();
  const part = (v.title.match(/часть (\d+)/i)?.[1] ? Number(v.title.match(/часть (\d+)/i)![1]) : 1) + 1;
  const base = v.title.replace(/\s*[—-]\s*часть \d+$/i, '');
  const newId = run(
    `INSERT INTO videos (project_id, rubric_id, parent_id, number, plan_date, plan_time, title, hook, cta, hashtags, notes, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Не начат', ?, ?)`,
    v.project_id,
    v.rubric_id,
    v.id,
    nextNumber(v.project_id),
    slot.date,
    slot.time,
    `${base} — часть ${part}`,
    v.hook,
    v.cta,
    v.hashtags,
    `Продолжение №${v.number} «${v.title}». Сохраните хук и подачу, ответьте на вопросы из комментариев.`,
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

export type When = { mode: 'now' } | { mode: 'at'; at: string };

export async function schedulePublish(videoId: number, targets: PublishTarget[], when: When): Promise<{ ok: boolean; message: string }> {
  await requireAuth();
  const video = get<Video>('SELECT * FROM videos WHERE id = ?', videoId);
  if (!video) return { ok: false, message: 'Ролик не найден' };
  if (!targets.length) return { ok: false, message: 'Выберите хотя бы один аккаунт' };
  const accounts = targets.map((t) => get<Account>('SELECT * FROM accounts WHERE id = ?', t.accountId)).filter(Boolean) as Account[];
  if (!video.file_name && accounts.some((a) => !a.is_demo)) return { ok: false, message: 'Сначала загрузите ролик' };
  for (const t of targets) {
    const a = accounts.find((x) => x.id === t.accountId);
    if (a?.platform === 'tiktok' && !t.options.privacy) return { ok: false, message: 'TikTok: выберите, кто сможет смотреть ролик' };
  }

  let at: Date;
  if (when.mode === 'now') at = new Date();
  else {
    const parsed = parseLocal(when.at);
    if (!parsed) return { ok: false, message: 'Неверная дата' };
    at = parsed;
  }

  const now = nowIso();
  // The plan follows the actual publication time, so the table and calendar stay truthful.
  const local = when.mode === 'at' ? when.at : toLocalInput(at, appTz());
  run('UPDATE videos SET plan_date = ?, plan_time = ?, updated_at = ? WHERE id = ?', local.slice(0, 10), local.slice(11, 16), now, videoId);
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

function defaultTargets(video: Video, project: Project, accounts: Account[]): PublishTarget[] {
  return accounts.map((a) => ({
    accountId: a.id,
    title: (video.cover_text || video.title).slice(0, 100),
    caption: buildCaption(a.platform, video, project),
    options:
      a.platform === 'tiktok'
        ? { privacy: a.is_demo ? 'PUBLIC_TO_EVERYONE' : 'SELF_ONLY' }
        : a.platform === 'youtube'
          ? { privacy: 'public', madeForKids: false }
          : { shareToFeed: true },
  }));
}

/**
 * One click from the plan: every active account of the project, captions from «Подпись» + «Хэштеги»,
 * at the plan's date and time ('plan') or right away ('now').
 */
export async function scheduleScript(videoId: number, mode: 'plan' | 'now' = 'plan'): Promise<{ ok: boolean; message: string }> {
  await requireAuth();
  const video = get<Video>('SELECT * FROM videos WHERE id = ?', videoId);
  if (!video) return { ok: false, message: 'Сценарий не найден' };
  const project = get<Project>('SELECT * FROM projects WHERE id = ?', video.project_id)!;
  const accounts = all<Account>("SELECT * FROM accounts WHERE project_id = ? AND status = 'active'", project.id);
  if (!accounts.length) return { ok: false, message: 'У проекта нет подключённых аккаунтов' };
  const at = plannedAt(video);
  if (mode === 'plan' && (!at || at.getTime() < Date.now())) {
    return { ok: false, message: 'Дата по плану уже прошла — поставьте новую дату или опубликуйте сейчас' };
  }
  const when: When =
    mode === 'now' ? { mode: 'now' } : { mode: 'at', at: `${video.plan_date}T${video.plan_time || slotTimeFor(video.plan_date!, project.time_weekday, project.time_weekend)}` };
  return schedulePublish(videoId, defaultTargets(video, project, accounts), when);
}

/** Schedules every script that has a video, a future plan date and no posts yet. */
export async function scheduleAllReady(projectId: number): Promise<{ ok: boolean; message: string }> {
  await requireAuth();
  const demoOnly = !all<{ id: number }>("SELECT id FROM accounts WHERE project_id = ? AND status = 'active' AND is_demo = 0", projectId).length;
  const rows = all<Video>(
    `SELECT * FROM videos v WHERE v.project_id = ? AND v.number > 0 AND v.plan_date IS NOT NULL
       AND ${demoOnly ? "(v.file_name IS NOT NULL OR v.status = 'Смонтирован')" : 'v.file_name IS NOT NULL'}
       AND NOT EXISTS (SELECT 1 FROM posts p WHERE p.video_id = v.id AND p.status IN ('scheduled','publishing','processing','published'))
     ORDER BY v.number`,
    projectId,
  ).filter((v) => (plannedAt(v)?.getTime() ?? 0) > Date.now());
  let done = 0;
  for (const v of rows) if ((await scheduleScript(v.id, 'plan')).ok) done++;
  refreshAll();
  return { ok: true, message: done ? `Запланировано роликов: ${done}` : 'Нечего планировать: нет загруженных роликов с будущей датой' };
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
