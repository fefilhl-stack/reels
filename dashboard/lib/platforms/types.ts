import type { Account, Platform, Post, PostOptions, Video } from '../types';

export interface TokenSet {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date | null;
  refreshExpiresAt?: Date | null;
  scopes?: string;
}

export interface Profile {
  externalId: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  followers: number;
}

export interface PublishInput {
  post: Post;
  video: Video;
  account: Account;
  token: string;
  filePath: string;
  options: PostOptions;
  state: Record<string, unknown>;
}

export type PublishOutcome =
  | { kind: 'published'; externalId: string; url: string | null }
  | { kind: 'processing'; state: Record<string, unknown> };

export interface Metrics {
  externalId: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  avgWatchSec?: number | null;
  avgViewPct?: number | null;
  /** Set when the platform assigned the final id later (TikTok moderation). */
  newExternalId?: string;
  url?: string | null;
}

export interface ImportedItem {
  externalId: string;
  url: string | null;
  title: string;
  caption: string;
  publishedAt: string;
  duration: number;
  metrics: Metrics;
}

export interface CreatorInfo {
  privacyOptions: string[];
  maxDurationSec?: number;
  commentDisabled?: boolean;
  duetDisabled?: boolean;
  stitchDisabled?: boolean;
}

export interface PlatformAdapter {
  platform: Platform;
  /** Env vars that must be set before accounts can be connected. */
  requiredEnv: string[];
  configured(): boolean;
  /** Returns the provider URL to send the user to. `verifier` is a PKCE code verifier (used where supported). */
  authorizeUrl(state: string, redirectUri: string, verifier: string): string;
  exchangeCode(code: string, redirectUri: string, verifier: string): Promise<{ tokens: TokenSet; profile: Profile }>;
  refresh(account: Account, refreshToken: string, accessToken: string): Promise<TokenSet>;
  fetchProfile(account: Account, token: string): Promise<Profile>;
  publish(input: PublishInput): Promise<PublishOutcome>;
  poll(input: PublishInput): Promise<PublishOutcome>;
  fetchMetrics(account: Account, token: string, externalIds: string[]): Promise<Metrics[]>;
  listRecent(account: Account, token: string, limit: number): Promise<ImportedItem[]>;
  creatorInfo?(account: Account, token: string): Promise<CreatorInfo>;
}

/** Thrown by adapters. `retryable` → try again later; `reauth` → the account must be reconnected. */
export class PlatformError extends Error {
  retryable: boolean;
  reauth: boolean;
  constructor(message: string, opts: { retryable?: boolean; reauth?: boolean } = {}) {
    super(message);
    this.name = 'PlatformError';
    this.retryable = !!opts.retryable;
    this.reauth = !!opts.reauth;
  }
}

/** fetch + JSON with readable errors. HTTP 401 → reauth, 429/5xx/network → retryable. */
export async function http<T>(url: string, init: RequestInit & { label: string; bigIds?: boolean }): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (e) {
    throw new PlatformError(`${init.label}: сеть недоступна (${(e as Error).message})`, { retryable: true });
  }
  let text = await res.text();
  // TikTok ids are int64: quote long integer literals before JSON.parse rounds them.
  if (init.bigIds) text = text.replace(/([:\[,]\s*)(\d{16,})(?=\s*[,\]}])/g, '$1"$2"');
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    throw new PlatformError(`${init.label}: HTTP ${res.status} ${describe(body)}`.trim(), {
      retryable: res.status === 429 || res.status >= 500,
      reauth: res.status === 401,
    });
  }
  return body as T;
}

function describe(body: unknown): string {
  if (!body) return '';
  if (typeof body === 'string') return body.slice(0, 300);
  const b = body as Record<string, unknown>;
  const err = (b.error ?? b) as Record<string, unknown> | string;
  if (typeof err === 'string') return `${err} ${typeof b.error_description === 'string' ? b.error_description : ''}`.trim();
  const msg = err.message ?? err.error_user_msg ?? err.description ?? b.error_description;
  const code = err.code ?? err.status;
  return [code, msg].filter(Boolean).join(' ').slice(0, 300) || JSON.stringify(body).slice(0, 300);
}

export function form(data: Record<string, string>): URLSearchParams {
  return new URLSearchParams(data);
}

export function expiresIn(sec: number | undefined | null): Date | null {
  return sec ? new Date(Date.now() + sec * 1000) : null;
}
