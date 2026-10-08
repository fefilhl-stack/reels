import { get } from '../db';
import type { Account, Platform } from '../types';
import type { Metrics, PlatformAdapter, Profile } from './types';

// Demo accounts behave like real ones without any network: publishing succeeds
// instantly and views grow along a saturating curve, so the whole flow
// (queue → publish → stats → insights) can be tried before API keys exist.

export interface DemoModel {
  /** Views the post will saturate at. */
  v: number;
  /** Days to reach ~63 % of v. */
  tau: number;
  like: number;
  comment: number;
  share: number;
  save: number;
  watch: number;
}

const TAU: Record<Platform, number> = { tiktok: 1.2, instagram: 2.2, youtube: 4 };
const BASE: Record<Platform, number> = { tiktok: 5200, instagram: 2600, youtube: 3400 };

export function hash(n: number | string): number {
  let h = 2166136261;
  for (const ch of String(n)) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  // murmur3 finalizer: spreads small input differences across all bits
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

/** Deterministic pseudo-normal from a seed. */
export function gauss(seed: string): number {
  const u = Math.max(1e-9, hash(`${seed}:u`));
  const v = hash(`${seed}:v`);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function demoModel(seed: string, platform: Platform, multiplier = 1, followers = 10000): DemoModel {
  const lucky = hash(`${seed}:lucky`) > 0.94 ? 2.2 + hash(`${seed}:size`) * 2.3 : 1;
  const v = Math.round(BASE[platform] * (followers / 12000) ** 0.6 * Math.exp(gauss(seed) * 0.45) * multiplier * lucky);
  return {
    v: Math.max(120, v),
    tau: TAU[platform] * (0.7 + hash(`${seed}:tau`) * 0.8),
    like: 0.035 + hash(`${seed}:l`) * 0.06,
    comment: 0.002 + hash(`${seed}:c`) * 0.007,
    share: 0.002 + hash(`${seed}:s`) * 0.014 * (lucky > 1 ? 2 : 1),
    save: 0.003 + hash(`${seed}:sv`) * 0.02,
    watch: 0.35 + hash(`${seed}:w`) * 0.45,
  };
}

export function demoMetricsAt(m: DemoModel, ageDays: number): Omit<Metrics, 'externalId'> {
  const views = Math.round(m.v * (1 - Math.exp(-Math.max(0, ageDays) / m.tau)));
  return {
    views,
    likes: Math.round(views * m.like),
    comments: Math.round(views * m.comment),
    shares: Math.round(views * m.share),
    saves: Math.round(views * m.save),
    avgViewPct: m.watch,
  };
}

function modelForPost(postId: number): { model: DemoModel; publishedAt: string } | null {
  const row = get<{ state: string; published_at: string | null; platform: Platform; followers: number }>(
    'SELECT p.state, p.published_at, p.platform, a.followers FROM posts p JOIN accounts a ON a.id = p.account_id WHERE p.id = ?',
    postId,
  );
  if (!row?.published_at) return null;
  const state = JSON.parse(row.state || '{}');
  const model: DemoModel = state.demo ?? demoModel(`post:${postId}`, row.platform, 1, row.followers || 10000);
  return { model, publishedAt: row.published_at };
}

export function demoAdapter(platform: Platform): PlatformAdapter {
  const profile = (a: Account): Profile => ({
    externalId: a.external_id,
    username: a.username,
    displayName: a.display_name,
    avatarUrl: '',
    followers: a.followers,
  });
  return {
    platform,
    requiredEnv: [],
    configured: () => true,
    authorizeUrl: () => '',
    exchangeCode: async () => {
      throw new Error('demo accounts are created locally');
    },
    refresh: async (_a, refreshToken, accessToken) => ({ accessToken, refreshToken }),
    async fetchProfile(a) {
      // Followers drift up a little with every sync.
      const grow = Math.round(a.followers * (0.0015 + hash(`${a.id}:${new Date().toISOString().slice(0, 13)}`) * 0.004));
      return { ...profile(a), followers: a.followers + grow };
    },
    async publish(input) {
      return { kind: 'published', externalId: `demo_${input.post.id}`, url: null };
    },
    async poll(input) {
      return { kind: 'published', externalId: `demo_${input.post.id}`, url: null };
    },
    async fetchMetrics(_a, _t, ids) {
      const out: Metrics[] = [];
      for (const id of ids) {
        const postId = Number(id.replace(/^demo_/, ''));
        const m = modelForPost(postId);
        if (!m) continue;
        const ageDays = (Date.now() - new Date(m.publishedAt).getTime()) / 86_400_000;
        out.push({ externalId: id, ...demoMetricsAt(m.model, ageDays) });
      }
      return out;
    },
    listRecent: async () => [],
    creatorInfo: async () => ({ privacyOptions: ['PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS', 'SELF_ONLY'], maxDurationSec: 600 }),
  };
}
