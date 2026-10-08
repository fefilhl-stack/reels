import { all } from './db';
import { appTz, DAY_MS, dayRange, startOfWeek, zonedParts, zonedToUtc } from './time';
import { PLATFORMS, PLATFORM_LABEL, type Platform } from './types';

// ---------------------------------------------------------------------------
// Facts: every published post with its video/project context and a normalized
// "score" = views at a given age divided by the median views other posts of the
// same account had at that age. 1.0 = typical, 2.0 = took off, 0.5 = flopped.
// Normalizing per account makes TikTok, Instagram and YouTube comparable.
// ---------------------------------------------------------------------------

export interface PostFact {
  id: number;
  videoId: number;
  accountId: number;
  projectId: number;
  platform: Platform;
  publishedAt: number;
  ageH: number;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  avgViewPct: number | null;
  url: string | null;
  title: string;
  hook: string;
  rubricId: number | null;
  rubric: string | null;
  duration: number;
  projectName: string;
  projectColor: number;
  username: string;
  thumb: string | null;
  er: number | null;
  score: number | null;
}

type Point = { t: number; v: number };

export interface FactSet {
  facts: PostFact[];
  curves: Map<number, Point[]>;
}

const BENCH_AGE_CAP = 7 * DAY_MS;

export function loadFacts(projectId: number | null, platform?: Platform | null, now = Date.now()): FactSet {
  const where: string[] = ["p.status = 'published'", 'p.published_at IS NOT NULL', 'pr.archived = 0'];
  const params: (number | string)[] = [];
  if (projectId) {
    where.push('v.project_id = ?');
    params.push(projectId);
  }
  if (platform) {
    where.push('p.platform = ?');
    params.push(platform);
  }
  const rows = all<{
    id: number;
    video_id: number;
    account_id: number;
    project_id: number;
    platform: Platform;
    published_at: string;
    views: number;
    likes: number;
    comments: number;
    shares: number;
    saves: number;
    avg_view_pct: number | null;
    url: string | null;
    title: string;
    hook: string;
    rubric_id: number | null;
    rubric: string | null;
    duration: number;
    project_name: string;
    project_color: number;
    username: string;
    thumb_name: string | null;
  }>(
    `SELECT p.id, p.video_id, p.account_id, v.project_id, p.platform, p.published_at, p.views, p.likes, p.comments,
            p.shares, p.saves, p.avg_view_pct, p.url, v.title, v.hook, v.rubric_id, r.name AS rubric, v.duration,
            pr.name AS project_name, pr.color AS project_color, a.username, v.thumb_name
       FROM posts p
       JOIN videos v ON v.id = p.video_id
       JOIN accounts a ON a.id = p.account_id
       JOIN projects pr ON pr.id = v.project_id
       LEFT JOIN rubrics r ON r.id = v.rubric_id
      WHERE ${where.join(' AND ')}
      ORDER BY p.published_at`,
    ...params,
  );

  const snaps = all<{ post_id: number; at: string; views: number }>(
    `SELECT s.post_id, s.at, s.views FROM post_snapshots s
       JOIN posts p ON p.id = s.post_id
       JOIN videos v ON v.id = p.video_id
       JOIN projects pr ON pr.id = v.project_id
      WHERE ${where.join(' AND ')}
      ORDER BY s.post_id, s.at`,
    ...params,
  );

  const curves = new Map<number, Point[]>();
  const facts: PostFact[] = rows.map((r) => {
    const publishedAt = new Date(r.published_at).getTime();
    curves.set(r.id, [{ t: publishedAt, v: 0 }]);
    const engaged = r.likes + r.comments + r.shares + r.saves;
    return {
      id: r.id,
      videoId: r.video_id,
      accountId: r.account_id,
      projectId: r.project_id,
      platform: r.platform,
      publishedAt,
      ageH: Math.max(0, (now - publishedAt) / 3_600_000),
      views: r.views,
      likes: r.likes,
      comments: r.comments,
      shares: r.shares,
      saves: r.saves,
      avgViewPct: r.avg_view_pct,
      url: r.url,
      title: r.title,
      hook: r.hook,
      rubricId: r.rubric_id,
      rubric: r.rubric,
      duration: r.duration,
      projectName: r.project_name,
      projectColor: r.project_color,
      username: r.username,
      thumb: r.thumb_name,
      er: r.views > 0 ? engaged / r.views : null,
      score: null,
    };
  });
  for (const s of snaps) {
    const c = curves.get(s.post_id);
    const t = new Date(s.at).getTime();
    if (c && t >= c[c.length - 1].t) c.push({ t, v: s.views });
  }
  for (const f of facts) {
    const c = curves.get(f.id)!;
    const last = c[c.length - 1];
    if (now > last.t && f.views >= last.v) c.push({ t: now, v: f.views });
  }

  scoreFacts(facts, curves);
  return { facts, curves };
}

/** Linear interpolation of cumulative views at time t (never extrapolates past the last point). */
export function valueAt(curve: Point[], t: number): number {
  if (!curve.length || t <= curve[0].t) return 0;
  const last = curve[curve.length - 1];
  if (t >= last.t) return last.v;
  let lo = 0;
  let hi = curve.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (curve[mid].t <= t) lo = mid;
    else hi = mid;
  }
  const a = curve[lo];
  const b = curve[hi];
  return a.v + ((b.v - a.v) * (t - a.t)) / Math.max(1, b.t - a.t);
}

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function scoreFacts(facts: PostFact[], curves: Map<number, Point[]>) {
  const byAccount = new Map<number, PostFact[]>();
  for (const f of facts) {
    const list = byAccount.get(f.accountId) ?? [];
    list.push(f);
    byAccount.set(f.accountId, list);
  }
  for (const list of byAccount.values()) {
    for (const f of list) {
      if (f.ageH < 2) continue; // too early to judge
      const age = Math.min(f.ageH * 3_600_000, BENCH_AGE_CAP);
      const own = valueAt(curves.get(f.id)!, f.publishedAt + age);
      const bench = list
        .filter((o) => o.id !== f.id && o.ageH * 3_600_000 >= age)
        .slice(-30)
        .map((o) => valueAt(curves.get(o.id)!, o.publishedAt + age));
      if (bench.length < 3) continue;
      const m = median(bench);
      if (m && m > 0) f.score = own / m;
    }
  }
}

// ---------------------------------------------------------------------------
// Time series
// ---------------------------------------------------------------------------

export interface Series {
  key: string;
  label: string;
  values: number[];
}

function dayEdges(days: number, end: Date, tz: string): { keys: string[]; edges: number[] } {
  const keys = dayRange(days, end, tz);
  const edges = keys.map((k) => {
    const [y, m, d] = k.split('-').map(Number);
    return zonedToUtc(y, m, d, 0, 0, tz).getTime();
  });
  const [y, m, d] = keys[keys.length - 1].split('-').map(Number);
  edges.push(zonedToUtc(y, m, d + 1, 0, 0, tz).getTime());
  return { keys, edges };
}

/** Views gained per day, grouped by platform (default) or project. */
export function dailyViews(set: FactSet, days: number, groupBy: 'platform' | 'project' = 'platform', end = new Date()) {
  const tz = appTz();
  const { keys, edges } = dayEdges(days, end, tz);
  const groups = new Map<string, { label: string; values: number[] }>();
  if (groupBy === 'platform') {
    for (const p of PLATFORMS) groups.set(p, { label: PLATFORM_LABEL[p], values: new Array(days).fill(0) });
  }
  for (const f of set.facts) {
    const key = groupBy === 'platform' ? f.platform : String(f.projectId);
    let g = groups.get(key);
    if (!g) {
      g = { label: f.projectName, values: new Array(days).fill(0) };
      groups.set(key, g);
    }
    const curve = set.curves.get(f.id)!;
    let prev = valueAt(curve, edges[0]);
    for (let i = 0; i < days; i++) {
      const cur = valueAt(curve, edges[i + 1]);
      g.values[i] += Math.max(0, cur - prev);
      prev = cur;
    }
  }
  const series: Series[] = [...groups.entries()].map(([key, g]) => ({
    key,
    label: g.label,
    values: g.values.map(Math.round),
  }));
  return { days: keys, series };
}

export function sumSeries(series: Series[]): number[] {
  if (!series.length) return [];
  return series[0].values.map((_, i) => series.reduce((s, x) => s + x.values[i], 0));
}

/** Followers per day (forward-filled snapshots) summed by platform for accounts in scope. */
export function followersSeries(projectId: number | null, days: number, end = new Date()) {
  const tz = appTz();
  const keys = dayRange(days, end, tz);
  const accounts = all<{ id: number; platform: Platform; followers: number }>(
    `SELECT a.id, a.platform, a.followers FROM accounts a JOIN projects pr ON pr.id = a.project_id
      WHERE pr.archived = 0 ${projectId ? 'AND a.project_id = ?' : ''}`,
    ...(projectId ? [projectId] : []),
  );
  const snaps = all<{ account_id: number; day: string; followers: number }>(
    `SELECT s.account_id, s.day, s.followers FROM account_snapshots s
       JOIN accounts a ON a.id = s.account_id JOIN projects pr ON pr.id = a.project_id
      WHERE pr.archived = 0 ${projectId ? 'AND a.project_id = ?' : ''} ORDER BY s.day`,
    ...(projectId ? [projectId] : []),
  );
  const byAcc = new Map<number, Map<string, number>>();
  for (const s of snaps) {
    const m = byAcc.get(s.account_id) ?? new Map();
    m.set(s.day, s.followers);
    byAcc.set(s.account_id, m);
  }
  const out = new Map<Platform, number[]>();
  for (const p of PLATFORMS) out.set(p, new Array(days).fill(0));
  for (const a of accounts) {
    const m = byAcc.get(a.id) ?? new Map<string, number>();
    const sortedDays = [...m.keys()].sort();
    let last: number | null = null;
    // seed with the most recent snapshot before the window
    for (const d of sortedDays) if (d < keys[0]) last = m.get(d)!;
    const arr = out.get(a.platform)!;
    keys.forEach((k, i) => {
      if (m.has(k)) last = m.get(k)!;
      if (i === keys.length - 1 && last == null) last = a.followers;
      arr[i] += last ?? 0;
    });
  }
  const series: Series[] = PLATFORMS.map((p) => ({ key: p, label: PLATFORM_LABEL[p], values: out.get(p)! }));
  return { days: keys, series, current: accounts.reduce((s, a) => s + a.followers, 0) };
}

// ---------------------------------------------------------------------------
// KPI row
// ---------------------------------------------------------------------------

export interface Kpis {
  views: number;
  viewsPrev: number;
  viewsSpark: number[];
  followers: number;
  followersDelta: number;
  followersSpark: number[];
  published: number;
  publishedPrev: number;
  plan: number;
  er: number | null;
  erPrev: number | null;
}

export function kpis(set: FactSet, projectId: number | null, days: number, plannedPerWeek: number): Kpis {
  const now = Date.now();
  const twice = dailyViews(set, days * 2, 'platform');
  const total = sumSeries(twice.series);
  const cur = total.slice(days);
  const prev = total.slice(0, days);
  const from = now - days * DAY_MS;
  const prevFrom = now - 2 * days * DAY_MS;
  const inCur = set.facts.filter((f) => f.publishedAt >= from);
  const inPrev = set.facts.filter((f) => f.publishedAt >= prevFrom && f.publishedAt < from);
  const er = (list: PostFact[]) => {
    const v = list.reduce((s, f) => s + f.views, 0);
    return v ? list.reduce((s, f) => s + f.likes + f.comments + f.shares + f.saves, 0) / v : null;
  };
  const fol = followersSeries(projectId, days + 1);
  const folTotal = sumSeries(fol.series);
  return {
    views: cur.reduce((a, b) => a + b, 0),
    viewsPrev: prev.reduce((a, b) => a + b, 0),
    viewsSpark: cur,
    followers: fol.current,
    followersDelta: folTotal.length ? folTotal[folTotal.length - 1] - folTotal[0] : 0,
    followersSpark: folTotal.slice(1),
    published: new Set(inCur.map((f) => f.videoId)).size,
    publishedPrev: new Set(inPrev.map((f) => f.videoId)).size,
    plan: Math.round((plannedPerWeek * days) / 7),
    er: er(inCur),
    erPrev: er(inPrev),
  };
}

// ---------------------------------------------------------------------------
// Breakdowns
// ---------------------------------------------------------------------------

export interface GroupStat {
  key: string;
  label: string;
  posts: number;
  videos: number;
  views: number;
  medianViews: number;
  medianScore: number | null;
  er: number | null;
}

export function groupStats(facts: PostFact[], keyOf: (f: PostFact) => string | null, labelOf: (f: PostFact) => string): GroupStat[] {
  const groups = new Map<string, PostFact[]>();
  const labels = new Map<string, string>();
  for (const f of facts) {
    const k = keyOf(f);
    if (k == null) continue;
    const list = groups.get(k) ?? [];
    list.push(f);
    groups.set(k, list);
    labels.set(k, labelOf(f));
  }
  return [...groups.entries()].map(([key, list]) => {
    const views = list.reduce((s, f) => s + f.views, 0);
    const engaged = list.reduce((s, f) => s + f.likes + f.comments + f.shares + f.saves, 0);
    const scores = list.map((f) => f.score).filter((x): x is number => x != null);
    return {
      key,
      label: labels.get(key)!,
      posts: list.length,
      videos: new Set(list.map((f) => f.videoId)).size,
      views,
      medianViews: median(list.map((f) => f.views)) ?? 0,
      medianScore: median(scores),
      er: views ? engaged / views : null,
    };
  });
}

export const DURATION_BUCKETS: { key: string; label: string; max: number }[] = [
  { key: 'a', label: 'до 15 с', max: 15 },
  { key: 'b', label: '15–30 с', max: 30 },
  { key: 'c', label: '30–60 с', max: 60 },
  { key: 'd', label: '1–3 мин', max: 180 },
  { key: 'e', label: 'больше 3 мин', max: Infinity },
];

export function durationBucket(sec: number) {
  return DURATION_BUCKETS.find((b) => sec < b.max) ?? DURATION_BUCKETS[DURATION_BUCKETS.length - 1];
}

export const HOUR_BUCKETS = ['0–3', '3–6', '6–9', '9–12', '12–15', '15–18', '18–21', '21–24'];

export interface HeatCell {
  wd: number; // 1..7
  bucket: number; // 0..7
  n: number;
  score: number | null;
}

/** Weekday × 3-hour grid of median scores for posts old enough to judge. */
export function postingHeatmap(facts: PostFact[]): HeatCell[] {
  const tz = appTz();
  const cells = new Map<string, number[]>();
  for (const f of facts) {
    if (f.score == null || f.ageH < 24) continue;
    const p = zonedParts(new Date(f.publishedAt), tz);
    const k = `${p.wd}:${Math.floor(p.h / 3)}`;
    const list = cells.get(k) ?? [];
    list.push(f.score);
    cells.set(k, list);
  }
  const out: HeatCell[] = [];
  for (let wd = 1; wd <= 7; wd++) {
    for (let b = 0; b < 8; b++) {
      const list = cells.get(`${wd}:${b}`) ?? [];
      out.push({ wd, bucket: b, n: list.length, score: median(list) });
    }
  }
  return out;
}

export function bestSlot(cells: HeatCell[], minN = 2): HeatCell | null {
  const ok = cells.filter((c) => c.n >= minN && c.score != null);
  if (ok.length < 3) return null;
  return ok.sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
}

/** Distinct videos first published per week (Mon–Sun) for the last `weeks` weeks. */
export function weeklyCadence(facts: PostFact[], weeks: number, now = new Date()) {
  const tz = appTz();
  const start = startOfWeek(now, tz).getTime();
  const firstPub = new Map<number, number>();
  for (const f of facts) {
    const cur = firstPub.get(f.videoId);
    if (cur == null || f.publishedAt < cur) firstPub.set(f.videoId, f.publishedAt);
  }
  const counts = new Array(weeks).fill(0);
  for (const t of firstPub.values()) {
    const weeksAgo = t >= start ? 0 : Math.floor((start - t - 1) / (7 * DAY_MS)) + 1;
    const w = weeks - 1 - weeksAgo;
    if (w >= 0) counts[w]++;
  }
  return counts;
}

/** Per-video totals across platforms. */
export interface VideoRollup {
  videoId: number;
  title: string;
  hook: string;
  projectId: number;
  projectName: string;
  projectColor: number;
  rubric: string | null;
  duration: number;
  thumb: string | null;
  firstPublishedAt: number;
  views: number;
  er: number | null;
  bestScore: number | null;
  byPlatform: Partial<Record<Platform, PostFact>>;
}

export function rollupVideos(facts: PostFact[]): VideoRollup[] {
  const map = new Map<number, VideoRollup>();
  for (const f of facts) {
    let r = map.get(f.videoId);
    if (!r) {
      r = {
        videoId: f.videoId,
        title: f.title,
        hook: f.hook,
        projectId: f.projectId,
        projectName: f.projectName,
        projectColor: f.projectColor,
        rubric: f.rubric,
        duration: f.duration,
        thumb: f.thumb,
        firstPublishedAt: f.publishedAt,
        views: 0,
        er: null,
        bestScore: null,
        byPlatform: {},
      };
      map.set(f.videoId, r);
    }
    r.views += f.views;
    r.firstPublishedAt = Math.min(r.firstPublishedAt, f.publishedAt);
    if (f.score != null) r.bestScore = Math.max(r.bestScore ?? 0, f.score);
    r.byPlatform[f.platform] = f;
  }
  for (const r of map.values()) {
    const list = Object.values(r.byPlatform) as PostFact[];
    const views = list.reduce((s, f) => s + f.views, 0);
    r.er = views ? list.reduce((s, f) => s + f.likes + f.comments + f.shares + f.saves, 0) / views : null;
  }
  return [...map.values()];
}
