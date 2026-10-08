import path from 'node:path';
import { existsSync } from 'node:fs';
import { all, get, log, nowIso, run } from './db';
import { UPLOAD_DIR } from './env';
import { adapterFor } from './platforms';
import { PlatformError, type PublishInput, type PublishOutcome } from './platforms/types';
import { accessToken, markReauth } from './tokens';
import { PLATFORM_LABEL, type Account, type Post, type Video } from './types';

const MAX_ATTEMPTS = 3;
const BACKOFF_MIN = [5, 20, 60];
const inFlight = new Set<number>();

/** Picks up scheduled posts whose time has come. */
export async function publishDue(limit = 3) {
  const due = all<Post>(
    `SELECT p.* FROM posts p JOIN videos v ON v.id = p.video_id JOIN projects pr ON pr.id = v.project_id
      WHERE p.status = 'scheduled' AND p.scheduled_at <= ? AND pr.archived = 0 ORDER BY p.scheduled_at LIMIT ?`,
    nowIso(),
    limit,
  );
  await Promise.all(due.map((p) => publishPost(p.id)));
}

export async function publishPost(postId: number) {
  if (inFlight.has(postId)) return;
  // Atomic claim so two ticks (or two processes) never upload the same post twice.
  const claimed = run(
    "UPDATE posts SET status = 'publishing', attempts = attempts + 1, updated_at = ? WHERE id = ? AND status = 'scheduled'",
    nowIso(),
    postId,
  ).changes;
  if (!claimed) return;
  inFlight.add(postId);
  try {
    const input = await buildInput(postId);
    log('info', `Публикация «${input.video.title}» в ${PLATFORM_LABEL[input.post.platform]} (@${input.account.username})`, {
      postId,
      accountId: input.account.id,
    });
    const outcome = await adapterFor(input.account).publish(input);
    applyOutcome(input.post, outcome);
  } catch (e) {
    handleFailure(postId, e);
  } finally {
    inFlight.delete(postId);
  }
}

/** Checks posts the platform is still processing (Instagram containers, TikTok publish jobs). */
export async function pollProcessing() {
  const rows = all<Post>("SELECT * FROM posts WHERE status = 'processing' ORDER BY updated_at LIMIT 10");
  for (const p of rows) {
    if (inFlight.has(p.id)) continue;
    inFlight.add(p.id);
    try {
      const input = await buildInput(p.id);
      const outcome = await adapterFor(input.account).poll(input);
      applyOutcome(input.post, outcome);
    } catch (e) {
      handleFailure(p.id, e, true);
    } finally {
      inFlight.delete(p.id);
    }
  }
}

/** After a crash or restart, uploads that were mid-flight are surfaced instead of silently re-posted. */
export function recoverInterrupted() {
  const cutoff = new Date(Date.now() - 20 * 60_000).toISOString();
  const stuck = all<Post>("SELECT * FROM posts WHERE status = 'publishing' AND updated_at < ?", cutoff);
  for (const p of stuck) {
    run(
      "UPDATE posts SET status = 'failed', last_error = ?, updated_at = ? WHERE id = ?",
      'Загрузка прервалась (перезапуск сервера). Проверьте аккаунт, чтобы не опубликовать дважды, и нажмите «Повторить».',
      nowIso(),
      p.id,
    );
  }
}

async function buildInput(postId: number): Promise<PublishInput> {
  const post = get<Post>('SELECT * FROM posts WHERE id = ?', postId);
  if (!post) throw new PlatformError('Публикация не найдена');
  const video = get<Video>('SELECT * FROM videos WHERE id = ?', post.video_id);
  const account = get<Account>('SELECT * FROM accounts WHERE id = ?', post.account_id);
  if (!video || !account) throw new PlatformError('Ролик или аккаунт удалён');
  const filePath = video.file_name ? path.join(UPLOAD_DIR, video.file_name) : '';
  if (!account.is_demo && (!filePath || !existsSync(filePath))) {
    throw new PlatformError('К ролику не прикреплён видеофайл');
  }
  const token = await accessToken(account);
  return {
    post,
    video,
    account,
    token,
    filePath,
    options: JSON.parse(post.options || '{}'),
    state: JSON.parse(post.state || '{}'),
  };
}

function applyOutcome(post: Post, outcome: PublishOutcome) {
  const now = nowIso();
  if (outcome.kind === 'processing') {
    const merged = { ...JSON.parse(post.state || '{}'), ...outcome.state };
    run("UPDATE posts SET status = 'processing', state = ?, updated_at = ? WHERE id = ?", JSON.stringify(merged), now, post.id);
    return;
  }
  run(
    `UPDATE posts SET status = 'published', external_id = ?, url = ?, published_at = COALESCE(published_at, ?),
       last_error = '', updated_at = ? WHERE id = ?`,
    outcome.externalId,
    outcome.url,
    now,
    now,
    post.id,
  );
  run('INSERT OR IGNORE INTO post_snapshots (post_id, at, views, likes, comments, shares, saves) VALUES (?, ?, 0, 0, 0, 0, 0)', post.id, now);
  run("UPDATE videos SET status = 'Опубликован', updated_at = ? WHERE id = ?", now, post.video_id);
  log('info', `Опубликовано в ${PLATFORM_LABEL[post.platform]}${outcome.url ? `: ${outcome.url}` : ''}`, {
    postId: post.id,
    accountId: post.account_id,
  });
}

function handleFailure(postId: number, e: unknown, polling = false) {
  const post = get<Post>('SELECT * FROM posts WHERE id = ?', postId);
  if (!post) return;
  const err = e instanceof PlatformError ? e : new PlatformError((e as Error)?.message || String(e));
  const now = nowIso();
  if (err.reauth) {
    const account = get<Account>('SELECT * FROM accounts WHERE id = ?', post.account_id);
    if (account) markReauth(account, err.message);
  }
  if (err.retryable && post.attempts < MAX_ATTEMPTS) {
    if (polling) {
      run('UPDATE posts SET last_error = ?, updated_at = ? WHERE id = ?', err.message, now, postId);
      return;
    }
    const retryAt = new Date(Date.now() + BACKOFF_MIN[post.attempts - 1] * 60_000).toISOString();
    run(
      "UPDATE posts SET status = 'scheduled', scheduled_at = ?, last_error = ?, updated_at = ? WHERE id = ?",
      retryAt,
      `${err.message} — повтор автоматически`,
      now,
      postId,
    );
    log('warn', `Публикация #${postId}: ${err.message}. Повтор в ${retryAt}`, { postId });
    return;
  }
  run("UPDATE posts SET status = 'failed', last_error = ?, updated_at = ? WHERE id = ?", err.message, now, postId);
  log('error', `Публикация #${postId} не удалась: ${err.message}`, { postId, accountId: post.account_id });
}
