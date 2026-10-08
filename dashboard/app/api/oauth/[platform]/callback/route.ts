import { NextResponse, type NextRequest } from 'next/server';
import { isAuthed } from '@/lib/auth';
import { encrypt, openState } from '@/lib/crypto';
import { get, log, nowIso, run } from '@/lib/db';
import { appUrl } from '@/lib/env';
import { adapters } from '@/lib/platforms';
import { dayKey } from '@/lib/time';
import { PLATFORM_LABEL, PLATFORMS, type Platform } from '@/lib/types';

function back(query: string) {
  return NextResponse.redirect(new URL(`/accounts?${query}`, appUrl()));
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ platform: string }> }) {
  if (!(await isAuthed())) return NextResponse.redirect(new URL('/login', request.url));
  const { platform } = await params;
  if (!PLATFORMS.includes(platform as Platform)) return new Response('unknown platform', { status: 404 });
  const sp = request.nextUrl.searchParams;
  const error = sp.get('error_description') || sp.get('error_message') || sp.get('error');
  if (error) return back(`error=${encodeURIComponent(`${PLATFORM_LABEL[platform as Platform]}: ${error}`)}`);

  const state = openState<{ p: string; project: number; v: string }>(sp.get('state') || '');
  const code = sp.get('code');
  if (!state || state.p !== platform || !code) return back(`error=${encodeURIComponent('Ссылка авторизации устарела, попробуйте ещё раз')}`);

  const adapter = adapters[platform as Platform];
  try {
    const { tokens, profile } = await adapter.exchangeCode(code, `${appUrl()}/api/oauth/${platform}/callback`, state.v);
    const existing = get<{ id: number }>(
      'SELECT id FROM accounts WHERE project_id = ? AND platform = ? AND external_id = ?',
      state.project,
      platform,
      profile.externalId,
    );
    const values = [
      profile.username,
      profile.displayName,
      profile.avatarUrl,
      encrypt(tokens.accessToken),
      tokens.refreshToken ? encrypt(tokens.refreshToken) : '',
      tokens.expiresAt?.toISOString() ?? null,
      tokens.refreshExpiresAt?.toISOString() ?? null,
      tokens.scopes ?? '',
      profile.followers,
    ] as const;
    let id: number;
    if (existing) {
      run(
        `UPDATE accounts SET username = ?, display_name = ?, avatar_url = ?, access_token = ?, refresh_token = ?, token_expires_at = ?,
           refresh_expires_at = ?, scopes = ?, followers = ?, status = 'active', status_message = '' WHERE id = ?`,
        ...values,
        existing.id,
      );
      id = existing.id;
    } else {
      id = run(
        `INSERT INTO accounts (username, display_name, avatar_url, access_token, refresh_token, token_expires_at, refresh_expires_at,
           scopes, followers, project_id, platform, external_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ...values,
        state.project,
        platform,
        profile.externalId,
        nowIso(),
      ).id;
    }
    run(
      'INSERT INTO account_snapshots (account_id, day, followers) VALUES (?, ?, ?) ON CONFLICT(account_id, day) DO UPDATE SET followers = excluded.followers',
      id,
      dayKey(new Date()),
      profile.followers,
    );
    log('info', `Подключён ${PLATFORM_LABEL[platform as Platform]} @${profile.username}`, { accountId: id });
    return back(`connected=${id}`);
  } catch (e) {
    log('error', `Подключение ${platform}: ${(e as Error).message}`);
    return back(`error=${encodeURIComponent((e as Error).message)}`);
  }
}
