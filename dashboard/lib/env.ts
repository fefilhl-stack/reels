import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// Runtime data lives outside the build: tell the bundler not to trace these paths.
export const DATA_DIR = path.resolve(/*turbopackIgnore: true*/ process.env.DATA_DIR || path.join(/*turbopackIgnore: true*/ process.cwd(), 'data'));
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');

for (const dir of [DATA_DIR, UPLOAD_DIR]) {
  if (!existsSync(/*turbopackIgnore: true*/ dir)) mkdirSync(/*turbopackIgnore: true*/ dir, { recursive: true });
}

export function appUrl(): string {
  return (process.env.APP_URL || 'http://localhost:3100').replace(/\/+$/, '');
}

let secret: string | null = null;

/** Secret for cookie signing and token encryption; generated once into data/.secret when not set. */
export function appSecret(): string {
  if (secret) return secret;
  if (process.env.APP_SECRET && process.env.APP_SECRET.length >= 16) {
    secret = process.env.APP_SECRET;
    return secret;
  }
  const file = path.join(DATA_DIR, '.secret');
  if (existsSync(file)) {
    secret = readFileSync(file, 'utf8').trim();
  } else {
    secret = randomBytes(32).toString('hex');
    writeFileSync(file, secret, { mode: 0o600 });
  }
  return secret;
}

export const env = {
  password: () => process.env.DASHBOARD_PASSWORD || '',
  workerEnabled: () => process.env.WORKER_ENABLED !== 'false',
  cronSecret: () => process.env.CRON_SECRET || '',
  tiktok: () => ({ key: process.env.TIKTOK_CLIENT_KEY || '', secret: process.env.TIKTOK_CLIENT_SECRET || '' }),
  instagram: () => ({
    id: process.env.INSTAGRAM_APP_ID || '',
    secret: process.env.INSTAGRAM_APP_SECRET || '',
    version: process.env.META_GRAPH_VERSION || 'v26.0',
  }),
  google: () => ({ id: process.env.GOOGLE_CLIENT_ID || '', secret: process.env.GOOGLE_CLIENT_SECRET || '' }),
  anthropic: () => ({ key: process.env.ANTHROPIC_API_KEY || '', model: process.env.ANTHROPIC_MODEL || '' }),
};
