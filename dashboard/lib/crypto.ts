import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { appSecret } from './env';

function key(): Buffer {
  return createHash('sha256').update(`tokens:${appSecret()}`).digest();
}

/** AES-256-GCM for platform tokens at rest. Empty strings stay empty. */
export function encrypt(plain: string): string {
  if (!plain) return '';
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return `v1:${Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64url')}`;
}

export function decrypt(stored: string): string {
  if (!stored) return '';
  if (!stored.startsWith('v1:')) return stored;
  const raw = Buffer.from(stored.slice(3), 'base64url');
  const decipher = createDecipheriv('aes-256-gcm', key(), raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
}

export function sign(value: string): string {
  return createHmac('sha256', appSecret()).update(value).digest('base64url');
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Signed, expiring payload for OAuth `state`. */
export function sealState(payload: object, ttlSec = 900): string {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + ttlSec * 1000 })).toString('base64url');
  return `${body}.${sign(`state:${body}`)}`;
}

export function openState<T>(state: string): T | null {
  const [body, mac] = state.split('.');
  if (!body || !mac || !safeEqual(mac, sign(`state:${body}`))) return null;
  const data = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  if (typeof data.exp !== 'number' || data.exp < Date.now()) return null;
  return data as T;
}
