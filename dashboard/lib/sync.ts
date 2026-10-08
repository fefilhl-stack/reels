import { all, get, log, nowIso, run, tx } from './db';
import { adapterFor } from './platforms';
import { PlatformError } from './platforms/types';
import { dayKey } from './time';
import { accessToken, markReauth, touchAccount } from './tokens';
import { PLATFORM_LABEL, type Account, type Post } from './types';

const HOUR = 3_600_000;

/** How often a post's stats are refreshed, by age: fresh posts move fast, old ones barely. */
function refreshEvery(ageMs: number): number {
  if (ageMs < 2 * 24 * HOUR) return HOUR;
  if (ageMs < 7 * 24 * HOUR) return 6 * HOUR;
  if (ageMs < 30 * 24 * HOUR) return 24 * HOUR;
  return 7 * 24 * HOUR;
}

export async function syncAccount(accountId: number, force = false): Promise<{ updated: number }> {
  const account = get<Account>('SELECT * FROM accounts WHERE id = ?', accountId);
  if (!account || account.status === 'reauth') return { updated: 0 };
  const adapter = adapterFor(account);
  try {
    const token = await accessToken(account);
    const profile = await adapter.fetchProfile(account, token);
    run(
      `UPDATE accounts SET followers = ?, username = COALESCE(NULLIF(?, ''), username), display_name = COALESCE(NULLIF(?, ''), display_name),
         avatar_url = COALESCE(NULLIF(?, ''), avatar_url), status = 'active', status_message = '' WHERE id = ?`,
      profile.followers,
      profile.username,
      profile.displayName,
      profile.avatarUrl,
      account.id,
    );
    run(
      'INSERT INTO account_snapshots (account_id, day, followers) VALUES (?, ?, ?) ON CONFLICT(account_id, day) DO UPDATE SET followers = excluded.followers',
      account.id,
      dayKey(new Date()),
      profile.followers,
    );

    const now = Date.now();
    const posts = all<Post>(
      "SELECT * FROM posts WHERE account_id = ? AND status = 'published' AND external_id IS NOT NULL",
      account.id,
    ).filter((p) => {
      if (force || !p.metrics_at) return true;
      const age = now - new Date(p.published_at ?? p.created_at).getTime();
      return now - new Date(p.metrics_at).getTime() >= refreshEvery(age) * 0.95;
    });
    let updated = 0;
    for (let i = 0; i < posts.length; i += 20) {
      const batch = posts.slice(i, i + 20);
      const metrics = await adapter.fetchMetrics(account, token, batch.map((p) => p.external_id!));
      const at = nowIso();
      tx(() => {
        for (const m of metrics) {
          const post = batch.find((p) => p.external_id === m.externalId);
          if (!post) continue;
          if (m.newExternalId) {
            run('UPDATE posts SET external_id = ?, url = COALESCE(?, url) WHERE id = ?', m.newExternalId, m.url ?? null, post.id);
          }
          run(
            `UPDATE posts SET views = ?, likes = ?, comments = ?, shares = ?, saves = ?,
               avg_watch_sec = COALESCE(?, avg_watch_sec), avg_view_pct = COALESCE(?, avg_view_pct), metrics_at = ? WHERE id = ?`,
            m.views,
            m.likes,
            m.comments,
            m.shares,
            m.saves,
            m.avgWatchSec ?? null,
            m.avgViewPct ?? null,
            at,
            post.id,
          );
          run(
            'INSERT OR REPLACE INTO post_snapshots (post_id, at, views, likes, comments, shares, saves) VALUES (?, ?, ?, ?, ?, ?, ?)',
            post.id,
            at,
            m.views,
            m.likes,
            m.comments,
            m.shares,
            m.saves,
          );
          updated++;
        }
      });
    }
    touchAccount(account.id);
    return { updated };
  } catch (e) {
    const err = e as PlatformError;
    if (err.reauth) markReauth(account, err.message);
    else {
      run("UPDATE accounts SET status = 'error', status_message = ? WHERE id = ?", err.message, account.id);
      log('error', `Статистика @${account.username} (${PLATFORM_LABEL[account.platform]}): ${err.message}`, { accountId: account.id });
    }
    touchAccount(account.id);
    return { updated: 0 };
  }
}

/** Syncs every account that hasn't been synced for `everyMin` minutes. */
export async function syncDue(everyMin = 30) {
  const cutoff = new Date(Date.now() - everyMin * 60_000).toISOString();
  const due = all<Account>(
    "SELECT * FROM accounts WHERE status != 'reauth' AND (last_synced_at IS NULL OR last_synced_at < ?) ORDER BY last_synced_at LIMIT 10",
    cutoff,
  );
  for (const a of due) await syncAccount(a.id);
}

/** Pulls the account's recent videos so analytics include what was posted outside the dashboard. */
export async function importRecent(accountId: number, limit = 30): Promise<number> {
  const account = get<Account>('SELECT * FROM accounts WHERE id = ?', accountId);
  if (!account) return 0;
  const adapter = adapterFor(account);
  const token = await accessToken(account);
  const items = await adapter.listRecent(account, token, limit);
  let created = 0;
  const now = nowIso();
  tx(() => {
    for (const it of items) {
      const exists = get<{ id: number }>('SELECT id FROM posts WHERE account_id = ? AND external_id = ?', account.id, it.externalId);
      if (exists) continue;
      const title = (it.title || it.caption || 'Без названия').split('\n')[0].slice(0, 120);
      const video = run(
        `INSERT INTO videos (project_id, title, stage, caption, duration, original_name, created_at, updated_at)
         VALUES (?, ?, 'ready', ?, ?, 'импорт', ?, ?)`,
        account.project_id,
        title,
        it.caption,
        it.duration,
        it.publishedAt,
        now,
      );
      const post = run(
        `INSERT INTO posts (video_id, account_id, platform, status, published_at, title, caption, external_id, url,
            views, likes, comments, shares, saves, metrics_at, created_at, updated_at)
         VALUES (?, ?, ?, 'published', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        video.id,
        account.id,
        account.platform,
        it.publishedAt,
        it.title,
        it.caption,
        it.externalId,
        it.url,
        it.metrics.views,
        it.metrics.likes,
        it.metrics.comments,
        it.metrics.shares,
        it.metrics.saves,
        now,
        now,
        now,
      );
      run(
        'INSERT OR IGNORE INTO post_snapshots (post_id, at, views, likes, comments, shares, saves) VALUES (?, ?, ?, ?, ?, ?, ?)',
        post.id,
        now,
        it.metrics.views,
        it.metrics.likes,
        it.metrics.comments,
        it.metrics.shares,
        it.metrics.saves,
      );
      created++;
    }
  });
  log('info', `Импортировано ${created} роликов из @${account.username} (${PLATFORM_LABEL[account.platform]})`, { accountId });
  return created;
}
