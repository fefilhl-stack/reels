import Link from 'next/link';
import {
  dailyViews,
  DURATION_BUCKETS,
  durationBucket,
  followersSeries,
  groupStats,
  kpis,
  loadFacts,
  median,
  postingHeatmap,
  rollupVideos,
  type GroupStat,
} from '@/lib/analytics';
import { all } from '@/lib/db';
import { fmtDate, fmtMultiple, fmtNum, fmtPct } from '@/lib/format';
import { getScope } from '@/lib/scope';
import { appTz, DAY_MS, dayKey } from '@/lib/time';
import { PLATFORM_LABEL, PLATFORMS, type Platform, type Project } from '@/lib/types';
import { BarList } from '@/components/charts/BarList';
import { Heatmap } from '@/components/charts/Heatmap';
import { LineChart } from '@/components/charts/LineChart';
import { parseRange, RANGES } from '@/components/RangeTabs';
import { Empty, PlatformTag, platformColor, projectColor, ScoreBadge, StatTile, Thumb } from '@/components/ui';

export const metadata = { title: 'Аналитика' };

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

function scoreRows(stats: GroupStat[]) {
  return stats
    .filter((s) => s.medianScore != null)
    .sort((a, b) => (b.medianScore ?? 0) - (a.medianScore ?? 0))
    .map((s) => ({
      key: s.key,
      label: s.label,
      value: s.medianScore ?? 0,
      display: fmtMultiple(s.medianScore),
      detail: `${s.videos} роликов · медиана ${fmtNum(s.medianViews)} просмотров на публикацию · ER ${fmtPct(s.er)}`,
    }));
}

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const range = parseRange(sp.range);
  const platform = (PLATFORMS as string[]).includes(one(sp.platform) ?? '') ? (one(sp.platform) as Platform) : null;
  const sort = one(sp.sort) ?? 'views';
  const scope = await getScope();
  const tz = appTz();
  const projects = scope ? [scope] : all<Project>('SELECT * FROM projects WHERE archived = 0 ORDER BY id');
  const set = loadFacts(scope?.id ?? null, platform);
  const since = Date.now() - range * DAY_MS;
  const inRange = set.facts.filter((f) => f.publishedAt >= since);

  const qs = (patch: Record<string, string | null>) => {
    const p: Record<string, string> = { range: String(range), ...(platform ? { platform } : {}), sort };
    for (const [k, v] of Object.entries(patch)) {
      if (v == null) delete p[k];
      else p[k] = v;
    }
    return `/analytics?${new URLSearchParams(p)}`;
  };

  const k = kpis(set, scope?.id ?? null, range, projects.reduce((s, p) => s + p.posts_per_week, 0));
  const groupBy = platform && !scope && projects.length > 1 ? 'project' : 'platform';
  const views = dailyViews(set, range, groupBy);
  const viewSeries = views.series
    .filter((s) => groupBy === 'project' || !platform || s.key === platform)
    .map((s) => ({
      ...s,
      color: groupBy === 'project' ? projectColor(projects.find((p) => String(p.id) === s.key)?.color ?? 0) : platformColor(s.key as Platform),
    }));
  const followers = followersSeries(scope?.id ?? null, range);
  const folSeries = followers.series
    .filter((s) => (!platform || s.key === platform) && s.values.some((v) => v > 0))
    .map((s) => ({ ...s, color: platformColor(s.key as Platform) }));

  // Breakdowns use every published post (more data → steadier medians), not only the range.
  const rubrics = scoreRows(groupStats(set.facts, (f) => (f.rubricId ? String(f.rubricId) : null), (f) => (scope ? (f.rubric ?? '') : `${f.rubric} · ${f.projectName}`)));
  const durations = groupStats(
    set.facts.filter((f) => f.duration > 0),
    (f) => durationBucket(f.duration).key,
    (f) => durationBucket(f.duration).label,
  )
    .filter((s) => s.medianScore != null)
    .sort((a, b) => DURATION_BUCKETS.findIndex((x) => x.key === a.key) - DURATION_BUCKETS.findIndex((x) => x.key === b.key))
    .map((s) => ({ key: s.key, label: s.label, value: s.medianScore ?? 0, display: fmtMultiple(s.medianScore), detail: `${s.videos} роликов · медиана ${fmtNum(s.medianViews)} просмотров` }));
  const byPlatform = groupStats(set.facts, (f) => f.platform, (f) => PLATFORM_LABEL[f.platform]);
  const heat = postingHeatmap(set.facts);

  const videos = rollupVideos(inRange);
  const sorters: Record<string, (a: (typeof videos)[number], b: (typeof videos)[number]) => number> = {
    views: (a, b) => b.views - a.views,
    score: (a, b) => (b.bestScore ?? -1) - (a.bestScore ?? -1),
    er: (a, b) => (b.er ?? -1) - (a.er ?? -1),
    date: (a, b) => b.firstPublishedAt - a.firstPublishedAt,
  };
  videos.sort(sorters[sort] ?? sorters.views);
  const hooks = rollupVideos(set.facts)
    .filter((v) => v.hook && v.bestScore != null)
    .sort((a, b) => (b.bestScore ?? 0) - (a.bestScore ?? 0))
    .slice(0, 8);

  const accounts = all<{ id: number; platform: Platform; username: string; followers: number; project_name: string; color: number; is_demo: number }>(
    `SELECT a.id, a.platform, a.username, a.followers, pr.name AS project_name, pr.color, a.is_demo FROM accounts a JOIN projects pr ON pr.id = a.project_id
      WHERE pr.archived = 0 ${scope ? 'AND pr.id = ?' : ''} ${platform ? 'AND a.platform = ?' : ''} ORDER BY pr.id, a.platform`,
    ...(scope ? [scope.id] : []),
    ...(platform ? [platform] : []),
  );
  const startDay = dayKey(new Date(Date.now() - range * DAY_MS), tz);
  const followerStart = new Map(
    all<{ account_id: number; followers: number }>(
      `SELECT s.account_id, s.followers FROM account_snapshots s
        WHERE s.day = (SELECT MIN(day) FROM account_snapshots s2 WHERE s2.account_id = s.account_id AND s2.day >= ?)`,
      startDay,
    ).map((r) => [r.account_id, r.followers]),
  );

  const viewsDelta = k.viewsPrev ? k.views / k.viewsPrev - 1 : null;
  const folSpark = folSeries.length ? folSeries[0].values.map((_, i) => folSeries.reduce((s, x) => s + x.values[i], 0)) : [];
  const folNow = folSpark[folSpark.length - 1] ?? 0;
  const folDelta = folNow - (folSpark[0] ?? 0);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Аналитика</h1>
          <p>
            {scope ? scope.name : 'Все проекты'}. «×» — во сколько раз ролик набрал больше (или меньше) обычного для своего аккаунта в том же возрасте.
          </p>
        </div>
      </div>

      <div className="row" style={{ gap: 12 }}>
        <div className="segmented" aria-label="Период">
          {RANGES.map((r) => (
            <Link key={r} href={qs({ range: String(r) })} aria-current={r === range ? 'true' : undefined}>
              {r} дн.
            </Link>
          ))}
        </div>
        <div className="segmented" aria-label="Площадка">
          <Link href={qs({ platform: null })} aria-current={!platform ? 'true' : undefined}>
            Все площадки
          </Link>
          {PLATFORMS.map((p) => (
            <Link key={p} href={qs({ platform: p })} aria-current={platform === p ? 'true' : undefined}>
              {PLATFORM_LABEL[p]}
            </Link>
          ))}
        </div>
      </div>

      {!set.facts.length ? (
        <div className="card">
          <Empty title="Данных пока нет">
            Опубликуйте ролики через дашборд или импортируйте последние ролики на странице{' '}
            <Link href="/accounts" className="link">
              аккаунтов
            </Link>
            .
          </Empty>
        </div>
      ) : (
        <>
          <section className="kpis">
            <StatTile label="Просмотры" value={fmtNum(k.views)} delta={viewsDelta} compare={`к прошлым ${range} дн.`} spark={k.viewsSpark} />
            <StatTile label="Медиана просмотров на ролик" value={fmtNum(median(inRange.map((f) => f.views)) ?? 0)} compare={`публикаций: ${inRange.length}`} />
            <StatTile label="Вовлечённость" value={fmtPct(k.er)} delta={k.er != null && k.erPrev ? k.er / k.erPrev - 1 : null} compare="к прошлому периоду" />
            <StatTile
              label="Подписчики"
              value={fmtNum(folNow)}
              compare={`${folDelta >= 0 ? '+' : '−'}${fmtNum(Math.abs(folDelta))} за ${range} дн.`}
              spark={folSpark}
            />
          </section>

          <div className="grid-2">
            <section className="card">
              <div className="card-head">
                <div>
                  <h2>Просмотры по дням</h2>
                  <p>{groupBy === 'project' ? 'По проектам' : 'По площадкам'}</p>
                </div>
              </div>
              <div className="card-body">
                <LineChart days={views.days} series={viewSeries} />
              </div>
            </section>
            <section className="card">
              <div className="card-head">
                <div>
                  <h2>Подписчики</h2>
                  <p>Сумма по аккаунтам</p>
                </div>
              </div>
              <div className="card-body">
                {folSeries.length ? <LineChart days={followers.days} series={folSeries} /> : <Empty title="История подписчиков появится после первых синхронизаций" />}
              </div>
            </section>
          </div>

          <div className="grid-3">
            <section className="card">
              <div className="card-head">
                <div>
                  <h2>Рубрики</h2>
                  <p>Медиана «×» по рубрике; черта — обычный уровень</p>
                </div>
              </div>
              <div className="card-body">
                {rubrics.length ? <BarList rows={rubrics} baseline={{ value: 1, label: '1× — как обычно' }} /> : <Empty title="Назначьте роликам рубрики" />}
              </div>
            </section>
            <section className="card">
              <div className="card-head">
                <div>
                  <h2>Длительность</h2>
                  <p>Как длина ролика влияет на результат</p>
                </div>
              </div>
              <div className="card-body">
                {durations.length ? <BarList rows={durations} baseline={{ value: 1, label: '1× — как обычно' }} /> : <Empty title="Нет данных о длительности" />}
              </div>
            </section>
            <section className="card">
              <div className="card-head">
                <div>
                  <h2>Лучшее время</h2>
                  <p>День недели × время публикации ({tz})</p>
                </div>
              </div>
              <div className="card-body">
                <Heatmap cells={heat} />
              </div>
            </section>
          </div>

            <section className="card">
              <div className="card-head">
                <div>
                  <h2>Ролики за {range} дней</h2>
                  <p>Один ролик — одна строка, просмотры по площадкам</p>
                </div>
                <div className="segmented" aria-label="Сортировка">
                  {[
                    ['views', 'Просмотры'],
                    ['score', 'Залёт'],
                    ['er', 'ER'],
                    ['date', 'Дата'],
                  ].map(([key, label]) => (
                    <Link key={key} href={qs({ sort: key })} aria-current={sort === key ? 'true' : undefined}>
                      {label}
                    </Link>
                  ))}
                </div>
              </div>
              <div className="card-body table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Ролик</th>
                      {PLATFORMS.filter((p) => !platform || p === platform).map((p) => (
                        <th key={p} className="num">
                          <PlatformTag platform={p} label={false} />
                        </th>
                      ))}
                      <th className="num">Всего</th>
                      <th className="num">ER</th>
                      <th>Результат</th>
                    </tr>
                  </thead>
                  <tbody>
                    {videos.slice(0, 30).map((v) => (
                      <tr key={v.videoId}>
                        <td>
                          <Link href={`/content/${v.videoId}`} className="row row-link" style={{ flexWrap: 'nowrap' }}>
                            <Thumb thumb={v.thumb} title={v.title} color={v.projectColor} width={24} />
                            <span style={{ minWidth: 0 }}>
                              <span className="ellipsis" style={{ display: 'block', maxWidth: 280, fontWeight: 550 }}>
                                {v.title}
                              </span>
                              <span className="small muted">
                                {fmtDate(new Date(v.firstPublishedAt).toISOString(), tz, false)}
                                {v.rubric ? ` · ${v.rubric}` : ''}
                              </span>
                            </span>
                          </Link>
                        </td>
                        {PLATFORMS.filter((p) => !platform || p === platform).map((p) => (
                          <td key={p} className="num">
                            {v.byPlatform[p] ? fmtNum(v.byPlatform[p]!.views) : <span className="muted">—</span>}
                          </td>
                        ))}
                        <td className="num" style={{ fontWeight: 600 }}>
                          {fmtNum(v.views)}
                        </td>
                        <td className="num">{fmtPct(v.er)}</td>
                        <td>
                          <ScoreBadge score={v.bestScore} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!videos.length && <Empty title="За период публикаций нет" />}
              </div>
            </section>

          <div className="grid-2">
              <section className="card">
                <div className="card-head">
                  <div>
                    <h2>Хуки, которые работают</h2>
                    <p>Первые фразы роликов-лидеров</p>
                  </div>
                </div>
                <div className="card-body stack" style={{ gap: 10 }}>
                  {hooks.length ? (
                    hooks.map((h) => (
                      <Link key={h.videoId} href={`/content/${h.videoId}`} className="spread" style={{ alignItems: 'flex-start' }}>
                        <span style={{ minWidth: 0 }}>
                          <span style={{ display: 'block', fontWeight: 550 }}>«{h.hook}»</span>
                          <span className="small muted">{fmtNum(h.views)} просмотров</span>
                        </span>
                        <ScoreBadge score={h.bestScore} />
                      </Link>
                    ))
                  ) : (
                    <Empty title="Заполняйте поле «Хук» у роликов" />
                  )}
                </div>
              </section>
              <section className="card">
                <div className="card-head">
                  <h2>Площадки</h2>
                </div>
                <div className="card-body table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Площадка</th>
                        <th className="num">Медиана</th>
                        <th className="num">ER</th>
                      </tr>
                    </thead>
                    <tbody>
                      {byPlatform.map((s) => (
                        <tr key={s.key}>
                          <td>
                            <PlatformTag platform={s.key as Platform} />
                          </td>
                          <td className="num">{fmtNum(s.medianViews)}</td>
                          <td className="num">{fmtPct(s.er)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
          </div>

          <section className="card">
            <div className="card-head">
              <h2>Аккаунты</h2>
            </div>
            <div className="card-body table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Аккаунт</th>
                    {!scope && <th>Проект</th>}
                    <th className="num">Подписчики</th>
                    <th className="num">За {range} дн.</th>
                    <th className="num">Публикаций за период</th>
                    <th className="num">Медиана просмотров</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((a) => {
                    const facts = inRange.filter((f) => f.accountId === a.id);
                    const start = followerStart.get(a.id);
                    const delta = start != null ? a.followers - start : null;
                    return (
                      <tr key={a.id}>
                        <td>
                          <span className="row" style={{ gap: 8 }}>
                            <PlatformTag platform={a.platform} label={false} />@{a.username}
                            {a.is_demo ? <span className="badge badge-info">демо</span> : null}
                          </span>
                        </td>
                        {!scope && (
                          <td>
                            <span className="row" style={{ gap: 6 }}>
                              <span className="dot" style={{ background: projectColor(a.color) }} />
                              {a.project_name}
                            </span>
                          </td>
                        )}
                        <td className="num">{fmtNum(a.followers)}</td>
                        <td className="num">{delta == null ? '—' : <span className={delta >= 0 ? 'delta-up' : 'delta-down'}>{`${delta >= 0 ? '+' : '−'}${fmtNum(Math.abs(delta))}`}</span>}</td>
                        <td className="num">{facts.length}</td>
                        <td className="num">{fmtNum(median(facts.map((f) => f.views)) ?? 0)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </>
  );
}
