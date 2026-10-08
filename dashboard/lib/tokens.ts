import { get, log, nowIso, run } from './db';
import { decrypt, encrypt } from './crypto';
import { adapterFor } from './platforms';
import { PlatformError, type TokenSet } from './platforms/types';
import type { Account } from './types';

export function saveTokens(accountId: number, t: TokenSet) {
  run(
    `UPDATE accounts SET access_token = ?, refresh_token = COALESCE(NULLIF(?, ''), refresh_token),
       token_expires_at = ?, refresh_expires_at = COALESCE(?, refresh_expires_at),
       scopes = COALESCE(NULLIF(?, ''), scopes), status = 'active', status_message = '' WHERE id = ?`,
    encrypt(t.accessToken),
    t.refreshToken ? encrypt(t.refreshToken) : '',
    t.expiresAt ? t.expiresAt.toISOString() : null,
    t.refreshExpiresAt ? t.refreshExpiresAt.toISOString() : null,
    t.scopes ?? '',
    accountId,
  );
}

export function markReauth(account: Account, message: string) {
  run("UPDATE accounts SET status = 'reauth', status_message = ? WHERE id = ?", message, account.id);
  log('warn', `@${account.username} (${account.platform}): нужно переподключить — ${message}`, { accountId: account.id });
}

/**
 * Returns a usable access token, refreshing it when it expires within `marginMs`.
 * Instagram long-lived tokens are refreshed when fewer than 10 days remain.
 */
export async function accessToken(account: Account, marginMs = 5 * 60_000): Promise<string> {
  const fresh = get<Account>('SELECT * FROM accounts WHERE id = ?', account.id) ?? account;
  if (fresh.status === 'reauth') throw new PlatformError('Аккаунт нужно переподключить', { reauth: true });
  const token = decrypt(fresh.access_token);
  if (fresh.is_demo) return token;
  const expires = fresh.token_expires_at ? new Date(fresh.token_expires_at).getTime() : null;
  const margin = fresh.platform === 'instagram' ? 10 * 86_400_000 : marginMs;
  if (expires == null || expires - Date.now() > margin) return token;

  const refreshToken = decrypt(fresh.refresh_token);
  if (fresh.platform !== 'instagram' && !refreshToken) {
    markReauth(fresh, 'токен истёк, а refresh-токена нет');
    throw new PlatformError('Токен истёк', { reauth: true });
  }
  try {
    const next = await adapterFor(fresh).refresh(fresh, refreshToken, token);
    saveTokens(fresh.id, next);
    return next.accessToken;
  } catch (e) {
    const err = e as PlatformError;
    // Instagram: a refresh failure while the token is still valid is not fatal.
    if (fresh.platform === 'instagram' && expires > Date.now()) return token;
    if (err.retryable) throw err;
    markReauth(fresh, err.message);
    throw new PlatformError(`Не удалось обновить токен: ${err.message}`, { reauth: true });
  }
}

export function touchAccount(accountId: number) {
  run('UPDATE accounts SET last_synced_at = ? WHERE id = ?', nowIso(), accountId);
}
