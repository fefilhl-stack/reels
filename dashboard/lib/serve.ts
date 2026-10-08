import { createReadStream, statSync } from 'node:fs';
import { Readable } from 'node:stream';
import { sign, safeEqual } from './crypto';
import { appUrl } from './env';
import { mimeOf, safePath } from './storage';

/** Streams an uploaded file with HTTP Range support (seeking in the player, platform fetchers). */
export function serveFile(request: Request, name: string, headOnly = false): Response {
  const file = safePath(name);
  if (!file) return new Response('not found', { status: 404 });
  let size: number;
  try {
    size = statSync(file).size;
  } catch {
    return new Response('not found', { status: 404 });
  }
  const headers: Record<string, string> = {
    'Content-Type': mimeOf(name),
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, max-age=31536000, immutable',
  };
  const range = /bytes=(\d*)-(\d*)/.exec(request.headers.get('range') || '');
  if (range && (range[1] || range[2])) {
    let start = range[1] ? Number(range[1]) : size - Number(range[2]);
    let end = range[1] && range[2] ? Number(range[2]) : size - 1;
    start = Math.max(0, start);
    end = Math.min(end, size - 1);
    if (start > end) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
    const h = { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(end - start + 1) };
    if (headOnly) return new Response(null, { status: 206, headers: h });
    return new Response(Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream, { status: 206, headers: h });
  }
  const h = { ...headers, 'Content-Length': String(size) };
  if (headOnly) return new Response(null, { headers: h });
  return new Response(Readable.toWeb(createReadStream(file)) as ReadableStream, { headers: h });
}

/** Expiring signed link that lets a platform (Instagram's video_url) fetch one file without a session. */
export function publicFileUrl(name: string, ttlSec = 24 * 3600): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  return `${appUrl()}/api/public/${exp}.${sign(`public:${name}:${exp}`)}/${name}`;
}

export function checkPublicToken(token: string, name: string): boolean {
  const [exp, mac] = token.split('.');
  if (!exp || !mac || Number(exp) * 1000 < Date.now()) return false;
  return safeEqual(mac, sign(`public:${name}:${exp}`));
}

/** True when APP_URL can be reached by Meta's servers (https, not localhost or a private address). */
export function appUrlIsPublic(): boolean {
  try {
    const u = new URL(appUrl());
    return u.protocol === 'https:' && !/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(u.hostname);
  } catch {
    return false;
  }
}
