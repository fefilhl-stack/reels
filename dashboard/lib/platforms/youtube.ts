import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { env } from '../env';
import { dayKey } from '../time';
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

// YouTube Data API v3 (resumable upload, statistics) + YouTube Analytics API (retention, shares).
// Videos uploaded by an unverified Google Cloud project are locked to private until the
// project passes YouTube's API audit.

const SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/yt-analytics.readonly',
];
const DATA = 'https://www.googleapis.com/youtube/v3';

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

type TokenResponse = { access_token: string; expires_in: number; refresh_token?: string; scope?: string };

async function token(params: Record<string, string>): Promise<TokenResponse> {
  const { id, secret } = env.google();
  return http<TokenResponse>('https://oauth2.googleapis.com/token', {
    label: 'Google OAuth',
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form({ client_id: id, client_secret: secret, ...params }),
  });
}

function challenge(verifier: string) {
  return createHash('sha256').update(verifier).digest('base64url');
}

/** ISO 8601 duration (PT1M5S) → seconds. */
function isoDuration(s: string | undefined): number {
  const m = /P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(s ?? '');
  if (!m) return 0;
  return (+(m[1] ?? 0)) * 86400 + (+(m[2] ?? 0)) * 3600 + (+(m[3] ?? 0)) * 60 + +(m[4] ?? 0);
}

type YtVideo = {
  id: string;
  snippet?: { title: string; description: string; publishedAt: string };
  statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
  contentDetails?: { duration?: string };
};

function statMetrics(v: YtVideo): Metrics {
  return {
    externalId: v.id,
    views: Number(v.statistics?.viewCount ?? 0),
    likes: Number(v.statistics?.likeCount ?? 0),
    comments: Number(v.statistics?.commentCount ?? 0),
    shares: 0,
    saves: 0,
  };
}

/** Retention and shares come from the Analytics API (1–3 days behind, best effort). */
async function analytics(tok: string, ids: string[]): Promise<Map<string, { shares: number; avgSec: number; avgPct: number }>> {
  const out = new Map<string, { shares: number; avgSec: number; avgPct: number }>();
  const q = new URLSearchParams({
    ids: 'channel==MINE',
    startDate: '2015-01-01',
    endDate: dayKey(new Date(), 'UTC'),
    metrics: 'shares,averageViewDuration,averageViewPercentage',
    dimensions: 'video',
    filters: `video==${ids.join(',')}`,
    maxResults: String(ids.length),
    sort: '-shares',
  });
  try {
    const r = await http<{ rows?: [string, number, number, number][] }>(`https://youtubeanalytics.googleapis.com/v2/reports?${q}`, {
      label: 'YouTube Analytics',
      headers: auth(tok),
    });
    for (const [id, shares, avgSec, avgPct] of r.rows ?? []) out.set(id, { shares, avgSec, avgPct: avgPct / 100 });
  } catch (e) {
    if ((e as PlatformError).reauth) throw e;
  }
  return out;
}

export const youtube: PlatformAdapter = {
  platform: 'youtube',
  requiredEnv: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
  configured: () => !!(env.google().id && env.google().secret),

  authorizeUrl(state, redirectUri, verifier) {
    const q = new URLSearchParams({
      client_id: env.google().id,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: SCOPES.join(' '),
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
      state,
      code_challenge: challenge(verifier),
      code_challenge_method: 'S256',
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
  },

  async exchangeCode(code, redirectUri, verifier) {
    const t = await token({ code, grant_type: 'authorization_code', redirect_uri: redirectUri, code_verifier: verifier });
    const tokens = { accessToken: t.access_token, refreshToken: t.refresh_token, expiresAt: expiresIn(t.expires_in), scopes: t.scope };
    const profile = await youtube.fetchProfile({} as Account, t.access_token);
    return { tokens, profile };
  },

  async refresh(_account, refreshToken) {
    try {
      const t = await token({ grant_type: 'refresh_token', refresh_token: refreshToken });
      return { accessToken: t.access_token, refreshToken: t.refresh_token, expiresAt: expiresIn(t.expires_in), scopes: t.scope };
    } catch (e) {
      const err = e as PlatformError;
      // invalid_grant: revoked, or the OAuth app is in "Testing" mode (refresh tokens live 7 days).
      if (/invalid_grant/.test(err.message)) throw new PlatformError(`${err.message}`, { reauth: true });
      throw err;
    }
  },

  async fetchProfile(_account, tok): Promise<Profile> {
    const r = await http<{ items?: { id: string; snippet: { title: string; customUrl?: string; thumbnails?: { default?: { url: string } } }; statistics: { subscriberCount?: string } }[] }>(
      `${DATA}/channels?part=snippet,statistics&mine=true`,
      { label: 'YouTube канал', headers: auth(tok) },
    );
    const ch = r.items?.[0];
    if (!ch) throw new PlatformError('YouTube: у аккаунта нет канала');
    return {
      externalId: ch.id,
      username: (ch.snippet.customUrl ?? ch.snippet.title).replace(/^@/, ''),
      displayName: ch.snippet.title,
      avatarUrl: ch.snippet.thumbnails?.default?.url ?? '',
      followers: Number(ch.statistics.subscriberCount ?? 0),
    };
  },

  async publish(input) {
    const { video, post, options, token: tok } = input;
    const meta = {
      snippet: {
        title: (post.title || video.title).slice(0, 100),
        description: post.caption.slice(0, 5000),
        tags: options.tags?.length ? options.tags : undefined,
        categoryId: options.categoryId || '22',
      },
      status: {
        privacyStatus: options.privacy || 'public',
        selfDeclaredMadeForKids: !!options.madeForKids,
        containsSyntheticMedia: !!options.aigc,
      },
    };
    const init = await fetch(`https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status`, {
      method: 'POST',
      headers: {
        ...auth(tok),
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Length': String(video.file_size),
        'X-Upload-Content-Type': video.mime || 'video/mp4',
      },
      body: JSON.stringify(meta),
    });
    const location = init.headers.get('location');
    if (!init.ok || !location) {
      const text = (await init.text()).slice(0, 400);
      throw new PlatformError(`YouTube: старт загрузки — HTTP ${init.status} ${text}`, {
        retryable: init.status >= 500,
        reauth: init.status === 401,
      });
    }
    const body = Readable.toWeb(createReadStream(input.filePath)) as ReadableStream;
    const res = await fetch(location, {
      method: 'PUT',
      headers: { 'Content-Type': video.mime || 'video/mp4', 'Content-Length': String(video.file_size) },
      body,
      duplex: 'half',
    } as RequestInit & { duplex: 'half' });
    const text = await res.text();
    if (!res.ok) {
      throw new PlatformError(`YouTube: загрузка — HTTP ${res.status} ${text.slice(0, 400)}`, { retryable: res.status >= 500 });
    }
    const created = JSON.parse(text) as { id: string };
    return { kind: 'published', externalId: created.id, url: `https://youtube.com/shorts/${created.id}` };
  },

  async poll(input) {
    const id = String(input.state.videoId ?? input.post.external_id ?? '');
    return { kind: 'published', externalId: id, url: `https://youtube.com/shorts/${id}` };
  },

  async fetchMetrics(_account, tok, ids) {
    const out: Metrics[] = [];
    for (let i = 0; i < ids.length; i += 50) {
      const chunk = ids.slice(i, i + 50);
      const r = await http<{ items: YtVideo[] }>(`${DATA}/videos?part=statistics&id=${chunk.join(',')}`, {
        label: 'YouTube статистика',
        headers: auth(tok),
      });
      const extra = await analytics(tok, chunk);
      for (const v of r.items) {
        const m = statMetrics(v);
        const a = extra.get(v.id);
        if (a) Object.assign(m, { shares: a.shares, avgWatchSec: a.avgSec, avgViewPct: a.avgPct });
        out.push(m);
      }
    }
    return out;
  },

  async listRecent(_account, tok, limit): Promise<ImportedItem[]> {
    const ch = await http<{ items: { contentDetails: { relatedPlaylists: { uploads: string } } }[] }>(
      `${DATA}/channels?part=contentDetails&mine=true`,
      { label: 'YouTube канал', headers: auth(tok) },
    );
    const uploads = ch.items?.[0]?.contentDetails.relatedPlaylists.uploads;
    if (!uploads) return [];
    const pl = await http<{ items: { contentDetails: { videoId: string } }[] }>(
      `${DATA}/playlistItems?part=contentDetails&maxResults=${Math.min(50, limit * 2)}&playlistId=${uploads}`,
      { label: 'YouTube загрузки', headers: auth(tok) },
    );
    const ids = pl.items.map((i) => i.contentDetails.videoId);
    if (!ids.length) return [];
    const vids = await http<{ items: YtVideo[] }>(`${DATA}/videos?part=snippet,statistics,contentDetails&id=${ids.join(',')}`, {
      label: 'YouTube ролики',
      headers: auth(tok),
    });
    return vids.items
      .map((v) => ({ v, duration: isoDuration(v.contentDetails?.duration) }))
      .filter(({ duration }) => duration > 0 && duration <= 180)
      .slice(0, limit)
      .map(({ v, duration }) => ({
        externalId: v.id,
        url: `https://youtube.com/shorts/${v.id}`,
        title: v.snippet?.title ?? '',
        caption: v.snippet?.description ?? '',
        publishedAt: v.snippet?.publishedAt ?? new Date().toISOString(),
        duration,
        metrics: statMetrics(v),
      }));
  },
};
