import { open } from 'node:fs/promises';
import { env } from '../env';
import type { Account } from '../types';
import {
  expiresIn,
  form,
  http,
  PlatformError,
  type ImportedItem,
  type Metrics,
  type PlatformAdapter,
  type Profile,
  type PublishInput,
  type PublishOutcome,
} from './types';

// TikTok Login Kit (web, OAuth v2) + Content Posting API (Direct Post, FILE_UPLOAD).
// Unaudited apps can only post with privacy SELF_ONLY (the TikTok account itself must be private,
// max 5 posting users per day); public posting needs TikTok's app audit. No PKCE on the web flow,
// and the redirect URI must be https (no localhost) — use a tunnel for local testing.

const API = 'https://open.tiktokapis.com/v2';
const SCOPES = ['user.info.basic', 'user.info.profile', 'user.info.stats', 'video.publish', 'video.list'];
const VIDEO_FIELDS = 'id,title,video_description,duration,share_url,view_count,like_count,comment_count,share_count,create_time';

type Envelope<T> = { data: T; error?: { code: string; message: string; log_id?: string } };

async function call<T>(path: string, token: string, label: string, body?: unknown): Promise<T> {
  const res = await http<Envelope<T>>(`${API}${path}`, {
    label: `TikTok ${label}`,
    bigIds: true,
    method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=UTF-8' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.error && res.error.code !== 'ok') {
    const code = res.error.code;
    throw new PlatformError(`TikTok ${label}: ${code} ${res.error.message}`, {
      reauth: code === 'access_token_invalid' || code === 'scope_not_authorized',
      retryable: code === 'rate_limit_exceeded' || code === 'internal_error',
    });
  }
  return res.data;
}

type TokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token: string;
  refresh_expires_in: number;
  open_id: string;
  scope: string;
  error?: string;
  error_description?: string;
};

async function token(params: Record<string, string>): Promise<TokenResponse> {
  const { key, secret } = env.tiktok();
  const res = await http<TokenResponse>(`${API}/oauth/token/`, {
    label: 'TikTok OAuth',
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form({ client_key: key, client_secret: secret, ...params }),
  });
  if (res.error || !res.access_token) {
    throw new PlatformError(`TikTok OAuth: ${res.error} ${res.error_description ?? ''}`.trim(), { reauth: true });
  }
  return res;
}

type TikTokVideo = {
  id: string;
  title?: string;
  video_description?: string;
  duration?: number;
  share_url?: string;
  view_count?: number;
  like_count?: number;
  comment_count?: number;
  share_count?: number;
  create_time?: number;
};

function toMetrics(v: TikTokVideo): Metrics {
  return {
    externalId: String(v.id),
    views: v.view_count ?? 0,
    likes: v.like_count ?? 0,
    comments: v.comment_count ?? 0,
    shares: v.share_count ?? 0,
    saves: 0,
  };
}

type PublishStatus = { status: string; fail_reason?: string; publicaly_available_post_id?: (string | number)[] };

function publishStatus(tok: string, publishId: string) {
  return call<PublishStatus>('/post/publish/status/fetch/', tok, 'статус', { publish_id: publishId });
}

function postUrl(account: Account, id: string) {
  return account.username ? `https://www.tiktok.com/@${account.username}/video/${id}` : null;
}

export const tiktok: PlatformAdapter = {
  platform: 'tiktok',
  requiredEnv: ['TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET'],
  configured: () => !!(env.tiktok().key && env.tiktok().secret),

  authorizeUrl(state, redirectUri) {
    const q = new URLSearchParams({
      client_key: env.tiktok().key,
      scope: SCOPES.join(','),
      response_type: 'code',
      redirect_uri: redirectUri,
      state,
    });
    return `https://www.tiktok.com/v2/auth/authorize/?${q}`;
  },

  async exchangeCode(code, redirectUri) {
    const t = await token({ code, grant_type: 'authorization_code', redirect_uri: redirectUri });
    const tokens = {
      accessToken: t.access_token,
      refreshToken: t.refresh_token,
      expiresAt: expiresIn(t.expires_in),
      refreshExpiresAt: expiresIn(t.refresh_expires_in),
      scopes: t.scope,
    };
    const profile = await tiktok.fetchProfile({ external_id: t.open_id } as Account, t.access_token);
    return { tokens, profile };
  },

  async refresh(_account, refreshToken) {
    const t = await token({ grant_type: 'refresh_token', refresh_token: refreshToken });
    return {
      accessToken: t.access_token,
      refreshToken: t.refresh_token,
      expiresAt: expiresIn(t.expires_in),
      refreshExpiresAt: expiresIn(t.refresh_expires_in),
      scopes: t.scope,
    };
  },

  async fetchProfile(account, tok): Promise<Profile> {
    const data = await call<{ user: Record<string, string | number> }>(
      '/user/info/?fields=open_id,avatar_url,display_name,username,follower_count',
      tok,
      'профиль',
    );
    const u = data.user;
    return {
      externalId: String(u.open_id ?? account.external_id),
      username: String(u.username ?? ''),
      displayName: String(u.display_name ?? ''),
      avatarUrl: String(u.avatar_url ?? ''),
      followers: Number(u.follower_count ?? 0),
    };
  },

  async creatorInfo(_account, tok) {
    const d = await call<{
      privacy_level_options: string[];
      max_video_post_duration_sec: number;
      comment_disabled: boolean;
      duet_disabled: boolean;
      stitch_disabled: boolean;
    }>('/post/publish/creator_info/query/', tok, 'creator_info', {});
    return {
      privacyOptions: d.privacy_level_options,
      maxDurationSec: d.max_video_post_duration_sec,
      commentDisabled: d.comment_disabled,
      duetDisabled: d.duet_disabled,
      stitchDisabled: d.stitch_disabled,
    };
  },

  async publish(input: PublishInput): Promise<PublishOutcome> {
    const { video, options, token: tok, post } = input;
    const info = await tiktok.creatorInfo!(input.account, tok);
    const privacy = options.privacy && info.privacyOptions.includes(options.privacy) ? options.privacy : null;
    if (!privacy) {
      throw new PlatformError(
        `TikTok: выберите видимость из доступных для аккаунта (${info.privacyOptions.join(', ')}). Неаудированное приложение может публиковать только SELF_ONLY.`,
      );
    }
    if (info.maxDurationSec && video.duration > info.maxDurationSec) {
      throw new PlatformError(`TikTok: ролик ${Math.round(video.duration)} с длиннее лимита аккаунта ${info.maxDurationSec} с`);
    }
    const size = video.file_size;
    const MB = 1024 * 1024;
    // Chunks of 5–64 MB; the final chunk absorbs the remainder (up to 128 MB). Small files go in one chunk.
    const chunkSize = size <= 64 * MB ? size : 32 * MB;
    const chunks = size <= 64 * MB ? 1 : Math.floor(size / chunkSize);
    const init = await call<{ publish_id: string; upload_url: string }>('/post/publish/video/init/', tok, 'init', {
      post_info: {
        title: (post.caption || video.title).slice(0, 2200),
        privacy_level: privacy,
        disable_comment: !!options.disableComment || !!info.commentDisabled,
        disable_duet: !!options.disableDuet || !!info.duetDisabled,
        disable_stitch: !!options.disableStitch || !!info.stitchDisabled,
        video_cover_timestamp_ms: video.cover_ms || 1000,
        brand_content_toggle: !!options.brandContent,
        brand_organic_toggle: !!options.brandOrganic,
        is_aigc: !!options.aigc,
      },
      source_info: { source: 'FILE_UPLOAD', video_size: size, chunk_size: chunkSize, total_chunk_count: chunks },
    });

    const fh = await open(input.filePath, 'r');
    try {
      for (let i = 0; i < chunks; i++) {
        const start = i * chunkSize;
        const end = i === chunks - 1 ? size - 1 : start + chunkSize - 1;
        const buf = Buffer.alloc(end - start + 1);
        await fh.read(buf, 0, buf.length, start);
        const res = await fetch(init.upload_url, {
          method: 'PUT',
          headers: {
            'Content-Type': video.mime || 'video/mp4',
            'Content-Length': String(buf.length),
            'Content-Range': `bytes ${start}-${end}/${size}`,
          },
          body: buf,
        });
        if (!res.ok && res.status !== 206) {
          throw new PlatformError(`TikTok: загрузка части ${i + 1}/${chunks} — HTTP ${res.status} ${await res.text()}`, {
            retryable: res.status >= 500,
          });
        }
      }
    } finally {
      await fh.close();
    }
    return { kind: 'processing', state: { publishId: init.publish_id, initAt: Date.now() } };
  },

  async poll(input) {
    const publishId = String(input.state.publishId ?? '');
    if (!publishId) throw new PlatformError('TikTok: нет publish_id');
    const d = await publishStatus(input.token, publishId);
    if (d.status === 'FAILED') throw new PlatformError(`TikTok отклонил публикацию: ${d.fail_reason ?? 'без причины'}`);
    if (d.status !== 'PUBLISH_COMPLETE') return { kind: 'processing', state: { tiktokStatus: d.status } };
    const id = d.publicaly_available_post_id?.[0];
    if (id) return { kind: 'published', externalId: String(id), url: postUrl(input.account, String(id)) };
    // The public id arrives only after moderation (and never for SELF_ONLY posts).
    // Keep the publish id; metrics sync swaps it for the real id once TikTok reports it.
    return { kind: 'published', externalId: `publish:${publishId}`, url: null };
  },

  async fetchMetrics(account, tok, ids) {
    const out: Metrics[] = [];
    const resolved = new Map<string, string>();
    for (const id of ids.filter((x) => x.startsWith('publish:'))) {
      const st = await publishStatus(tok, id.slice('publish:'.length)).catch(() => null);
      const real = st?.publicaly_available_post_id?.[0];
      if (real) resolved.set(String(real), id);
    }
    const real = [...ids.filter((id) => !id.startsWith('publish:')), ...resolved.keys()];
    for (let i = 0; i < real.length; i += 20) {
      const d = await call<{ videos: TikTokVideo[] }>(`/video/query/?fields=${VIDEO_FIELDS}`, tok, 'статистика', {
        filters: { video_ids: real.slice(i, i + 20) },
      });
      for (const v of d.videos) {
        const m = toMetrics(v);
        const pending = resolved.get(m.externalId);
        if (pending) out.push({ ...m, externalId: pending, newExternalId: m.externalId, url: v.share_url ?? postUrl(account, m.externalId) });
        else out.push(m);
      }
    }
    return out;
  },

  async listRecent(account, tok, limit): Promise<ImportedItem[]> {
    const out: ImportedItem[] = [];
    let cursor: number | undefined;
    while (out.length < limit) {
      const d = await call<{ videos: TikTokVideo[]; cursor: number; has_more: boolean }>(
        `/video/list/?fields=${VIDEO_FIELDS}`,
        tok,
        'список',
        { max_count: 20, ...(cursor ? { cursor } : {}) },
      );
      for (const v of d.videos) {
        out.push({
          externalId: String(v.id),
          url: v.share_url ?? postUrl(account, String(v.id)),
          title: v.title ?? '',
          caption: v.video_description ?? '',
          publishedAt: new Date((v.create_time ?? 0) * 1000).toISOString(),
          duration: v.duration ?? 0,
          metrics: toMetrics(v),
        });
      }
      if (!d.has_more) break;
      cursor = d.cursor;
    }
    return out.slice(0, limit);
  },
};
