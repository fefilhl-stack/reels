import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { env } from '../env';
import { appUrlIsPublic, publicFileUrl } from '../serve';
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
} from './types';

// Instagram API with Instagram Login (professional accounts, no Facebook Page needed).
// Limits: ~100 API posts per 24 h per account, Reels 3 s – 15 min, up to 300 MB.

const SCOPES = ['instagram_business_basic', 'instagram_business_content_publish', 'instagram_business_manage_insights'];
const graph = () => `https://graph.instagram.com/${env.instagram().version}`;

const REEL_METRICS = ['views', 'reach', 'likes', 'comments', 'shares', 'saved', 'ig_reels_avg_watch_time'];

function q(params: Record<string, string | number | boolean | undefined>): string {
  const out = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') out.set(k, String(v));
  return out.toString();
}

async function g<T>(path: string, token: string, label: string, params: Record<string, string | number | boolean | undefined> = {}, method = 'GET'): Promise<T> {
  const query = q({ ...params, access_token: token });
  return http<T>(`${graph()}${path}${method === 'GET' ? `?${query}` : ''}`, {
    label: `Instagram ${label}`,
    method,
    headers: method === 'GET' ? undefined : { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: method === 'GET' ? undefined : query,
  });
}

type InsightRow = { name: string; values?: { value: number }[]; total_value?: { value: number } };

async function reelMetrics(mediaId: string, token: string): Promise<Metrics> {
  const m: Metrics = { externalId: mediaId, views: 0, likes: 0, comments: 0, shares: 0, saves: 0 };
  const res = await g<{ data: InsightRow[] }>(`/${mediaId}/insights`, token, 'статистика', { metric: REEL_METRICS.join(',') });
  for (const row of res.data) {
    const v = row.total_value?.value ?? row.values?.[0]?.value ?? 0;
    if (row.name === 'views') m.views = v;
    else if (row.name === 'likes') m.likes = v;
    else if (row.name === 'comments') m.comments = v;
    else if (row.name === 'shares') m.shares = v;
    else if (row.name === 'saved') m.saves = v;
    else if (row.name === 'ig_reels_avg_watch_time') m.avgWatchSec = v / 1000;
  }
  return m;
}

export const instagram: PlatformAdapter = {
  platform: 'instagram',
  requiredEnv: ['INSTAGRAM_APP_ID', 'INSTAGRAM_APP_SECRET'],
  configured: () => !!(env.instagram().id && env.instagram().secret),

  authorizeUrl(state, redirectUri) {
    return `https://www.instagram.com/oauth/authorize?${q({
      client_id: env.instagram().id,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: SCOPES.join(','),
      state,
      enable_fb_login: 0,
      force_authentication: 1,
    })}`;
  },

  async exchangeCode(code, redirectUri) {
    const { id, secret } = env.instagram();
    const short = await http<{ access_token?: string; user_id?: string | number; data?: { access_token: string; user_id: string | number }[] }>(
      'https://api.instagram.com/oauth/access_token',
      {
        label: 'Instagram OAuth',
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form({
          client_id: id,
          client_secret: secret,
          grant_type: 'authorization_code',
          redirect_uri: redirectUri,
          code: code.replace(/#_$/, ''),
        }),
      },
    );
    const shortToken = short.access_token ?? short.data?.[0]?.access_token;
    if (!shortToken) throw new PlatformError('Instagram OAuth: не получен токен');
    const long = await http<{ access_token: string; expires_in: number }>(
      `https://graph.instagram.com/access_token?${q({ grant_type: 'ig_exchange_token', client_secret: secret, access_token: shortToken })}`,
      { label: 'Instagram долгий токен' },
    );
    const tokens = { accessToken: long.access_token, expiresAt: expiresIn(long.expires_in), scopes: SCOPES.join(',') };
    const profile = await instagram.fetchProfile({} as Account, long.access_token);
    return { tokens, profile };
  },

  async refresh(_account, _refresh, accessToken) {
    const r = await http<{ access_token: string; expires_in: number }>(
      `https://graph.instagram.com/refresh_access_token?${q({ grant_type: 'ig_refresh_token', access_token: accessToken })}`,
      { label: 'Instagram обновление токена' },
    );
    return { accessToken: r.access_token, expiresAt: expiresIn(r.expires_in) };
  },

  async fetchProfile(_account, token): Promise<Profile> {
    const me = await g<{ id: string; user_id?: string; username: string; name?: string; profile_picture_url?: string; followers_count?: number }>(
      '/me',
      token,
      'профиль',
      { fields: 'id,user_id,username,name,profile_picture_url,followers_count' },
    );
    return {
      externalId: String(me.user_id ?? me.id),
      username: me.username,
      displayName: me.name ?? me.username,
      avatarUrl: me.profile_picture_url ?? '',
      followers: me.followers_count ?? 0,
    };
  },

  async publish(input) {
    const { account, token, post, video, options } = input;
    const common = {
      media_type: 'REELS',
      caption: post.caption.slice(0, 2200),
      share_to_feed: options.shareToFeed !== false,
      thumb_offset: video.cover_ms || undefined,
    };
    // Documented path for Instagram Login: Meta downloads the file from a public HTTPS URL
    // (a signed, expiring link to this dashboard). Without a public APP_URL we fall back to
    // the resumable upload protocol, which Meta documents for Facebook Login.
    const mode = process.env.INSTAGRAM_UPLOAD === 'resumable' || !appUrlIsPublic() ? 'resumable' : 'url';
    if (mode === 'url') {
      const container = await g<{ id: string }>(
        `/${account.external_id}/media`,
        token,
        'контейнер',
        { ...common, video_url: publicFileUrl(video.file_name!) },
        'POST',
      );
      return { kind: 'processing', state: { containerId: container.id } };
    }
    let container: { id: string; uri?: string };
    try {
      container = await g<{ id: string; uri?: string }>(`/${account.external_id}/media`, token, 'контейнер', { ...common, upload_type: 'resumable' }, 'POST');
    } catch (e) {
      const err = e as PlatformError;
      if (err.reauth || err.retryable) throw err;
      throw new PlatformError(
        `${err.message}. Instagram скачивает видео по ссылке: укажите в APP_URL публичный https-адрес дашборда (домен или туннель).`,
      );
    }
    const uploadUri = container.uri ?? `https://rupload.facebook.com/ig-api-upload/${env.instagram().version}/${container.id}`;
    const body = Readable.toWeb(createReadStream(input.filePath)) as ReadableStream;
    const res = await fetch(uploadUri, {
      method: 'POST',
      headers: { Authorization: `OAuth ${token}`, offset: '0', file_size: String(video.file_size) },
      body,
      duplex: 'half',
    } as RequestInit & { duplex: 'half' });
    if (!res.ok) {
      throw new PlatformError(`Instagram: загрузка видео — HTTP ${res.status} ${(await res.text()).slice(0, 300)}`, {
        retryable: res.status >= 500,
      });
    }
    return { kind: 'processing', state: { containerId: container.id } };
  },

  async poll(input) {
    const containerId = String(input.state.containerId ?? '');
    if (!containerId) throw new PlatformError('Instagram: нет id контейнера');
    const st = await g<{ status_code: string; status?: string }>(`/${containerId}`, input.token, 'статус', { fields: 'status_code,status' });
    if (st.status_code === 'ERROR' || st.status_code === 'EXPIRED') {
      throw new PlatformError(`Instagram не обработал видео: ${st.status ?? st.status_code}. Проверьте формат: MP4/MOV, H.264, 9:16, 3 с – 15 мин.`);
    }
    if (st.status_code !== 'FINISHED' && st.status_code !== 'PUBLISHED') {
      return { kind: 'processing', state: { igStatus: st.status_code } };
    }
    const published = await g<{ id: string }>(`/${input.account.external_id}/media_publish`, input.token, 'публикация', { creation_id: containerId }, 'POST');
    const media = await g<{ permalink?: string }>(`/${published.id}`, input.token, 'ссылка', { fields: 'permalink' }).catch(() => ({ permalink: undefined }));
    return { kind: 'published', externalId: published.id, url: media.permalink ?? null };
  },

  async fetchMetrics(_account, token, ids) {
    const out: Metrics[] = [];
    for (const id of ids) {
      try {
        out.push(await reelMetrics(id, token));
      } catch (e) {
        // Fall back to public counters if insights are unavailable for this media.
        const err = e as PlatformError;
        if (err.reauth) throw err;
        const basic = await g<{ like_count?: number; comments_count?: number }>(`/${id}`, token, 'счётчики', { fields: 'like_count,comments_count' }).catch(() => null);
        if (basic) out.push({ externalId: id, views: 0, likes: basic.like_count ?? 0, comments: basic.comments_count ?? 0, shares: 0, saves: 0 });
      }
    }
    return out;
  },

  async listRecent(account, token, limit): Promise<ImportedItem[]> {
    const res = await g<{ data: { id: string; caption?: string; media_product_type?: string; permalink?: string; timestamp: string }[] }>(
      `/${account.external_id}/media`,
      token,
      'список',
      { fields: 'id,caption,media_type,media_product_type,permalink,timestamp', limit: Math.min(limit * 2, 100) },
    );
    const reels = res.data.filter((m) => m.media_product_type === 'REELS').slice(0, limit);
    const out: ImportedItem[] = [];
    for (const m of reels) {
      const metrics = await reelMetrics(m.id, token).catch(() => ({ externalId: m.id, views: 0, likes: 0, comments: 0, shares: 0, saves: 0 }));
      out.push({
        externalId: m.id,
        url: m.permalink ?? null,
        title: (m.caption ?? '').split('\n')[0].slice(0, 100),
        caption: m.caption ?? '',
        publishedAt: new Date(m.timestamp).toISOString(),
        duration: 0,
        metrics,
      });
    }
    return out;
  },
};
