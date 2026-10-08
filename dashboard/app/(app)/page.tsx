import Link from 'next/link';
import { dailyViews, kpis, loadFacts, rollupVideos, weeklyCadence } from '@/lib/analytics';
import { all } from '@/lib/db';
import { fmtDate, fmtNum, fmtPct, fmtTime } from '@/lib/format';
import { buildInsights } from '@/lib/insights';
import { getScope } from '@/lib/scope';
import { appTz, DAY_MS } from '@/lib/time';
import { PLATFORMS, type Platform, type Project } from '@/lib/types';
import { LoadDemoButton } from '@/components/DemoButtons';
import { InsightList } from '@/components/InsightList';
import { LineChart } from '@/components/charts/LineChart';
import { parseRange, RangeTabs } from '@/components/RangeTabs';
import { Empty, PlatformTag, platformColor, projectColor, ProjectTag, ScoreBadge, StatTile, Thumb } from '@/components/ui';

export const metadata = { title: 'Обзор' };

export default async function Overview({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const range = parseRange((await searchParams).range);
  const scope = await getScope();
  const projects = scope ? [scope] : all<Project>('SELECT * FROM projects WHERE archived = 0 ORDER BY id');
  const tz = appTz();

  if (!projects.length) {
    return (
      <div className="card card-pad">
        <Empty title="Здесь пока пусто">
          <p style={{ maxWidth: 520 }}>
            Создайте проект, подключите к нему аккаунты TikTok, Instagram и YouTube и загружайте ролики один раз — дашборд разошлёт их по площадкам и
            соберёт статистику. Чтобы сначала посмотреть, как всё работает, загрузите демо-данные: три проекта с историей за два месяца.
          </p>
          <div className="row">
            <Link href="/projects" className="btn btn-primary">
              Создать проект
            </Link>
            <LoadDemoButton />
          </div>
        </Empty>
      </div>
    );
  }

  const set = loadFacts(scope?.id ?? null);
  const plannedPerWeek = projects.reduce((s, p) => s + p.posts_per_week, 0);
  const k = kpis(set, scope?.id ?? null, range, plannedPerWeek);
  const byPlatform = dailyViews(set, range, 'platform');
  const insights = buildInsights(set, projects);
  const since = Date.now() - range * DAY_MS;
  const top = rollupVideos(set.facts.filter((f) => f.publishedAt >= since))
    .sort((a, b) => b.views - a.views)
    .slice(0, 6);

  const upcoming = all<{ video_id: number; title: string; scheduled_at: string; platforms: string; project_name: string; color: number; thumb_name: string | null }>(
    `SELECT p.video_id, v.title, p.scheduled_at, GROUP_CONCAT(p.platform) AS platforms, pr.name AS project_name, pr.color, v.thumb_name
       FROM posts p JOIN videos v ON v.id = p.video_id JOIN projects pr ON pr.id = v.project_id
      WHERE p.status IN ('scheduled','publishing','processing') AND pr.archived = 0 ${scope ? 'AND pr.id = ?' : ''}
      GROUP BY p.video_id, p.scheduled_at ORDER BY p.scheduled_at LIMIT 8`,
    ...(scope ? [scope.id] : []),
  );

  const perProject = !scope
    ? (() => {
        const byProj = dailyViews(set, range, 'project');
        return projects.map((p) => {
          const facts = set.facts.filter((f) => f.projectId === p.id);
          const recent = facts.filter((f) => f.publishedAt >= since);
          const views = recent.reduce((s, f) => s + f.views, 0);
          const engaged = recent.reduce((s, f) => s + f.likes + f.comments + f.shares + f.saves, 0);
          const followers = all<{ f: number }>('SELECT COALESCE(SUM(followers), 0) AS f FROM accounts WHERE project_id = ?', p.id)[0].f;
          return {
            p,
            gained: byProj.series.find((s) => s.key === String(p.id))?.values.reduce((a, b) => a + b, 0) ?? 0,
            followers,
            week: weeklyCadence(facts, 1)[0],
            er: views ? engaged / views : null,
          };
        });
      })()
    : [];

  const viewsDelta = k.viewsPrev ? k.views / k.viewsPrev - 1 : null;
  const erDelta = k.er != null && k.erPrev ? k.er / k.erPrev - 1 : null;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{scope ? scope.name : 'Все проекты'}</h1>
          <p>Сводка за {range} дней и что сделать дальше</p>
        </div>
        <RangeTabs range={range} base="/" />
      </div>

      <section className="kpis" aria-label="Ключевые показатели">
        <StatTile label="Просмотры" value={fmtNum(k.views)} delta={viewsDelta} compare={`к прошлым ${range} дн.`} spark={k.viewsSpark} />
        <StatTile
          label="Подписчики"
          value={fmtNum(k.followers)}
          compare={`${k.followersDelta >= 0 ? '+' : '−'}${fmtNum(Math.abs(k.followersDelta))} за ${range} дн.`}
          spark={k.followersSpark}
        />
        <StatTile label="Вовлечённость (ER)" value={fmtPct(k.er)} delta={erDelta} compare="к прошлому периоду" />
        <StatTile label="Опубликовано роликов" value={`${k.published} из ${k.plan}`} compare={`план ${plannedPerWeek} в неделю`}>
          <div className="meter" aria-hidden>
            <span style={{ width: `${Math.min(100, (k.published / Math.max(1, k.plan)) * 100)}%` }} />
          </div>
        </StatTile>
      </section>

      <div className="grid-main">
        <section className="card">
          <div className="card-head">
            <div>
              <h2>Просмотры по дням</h2>
              <p>Прирост просмотров всех роликов, по площадкам</p>
            </div>
          </div>
          <div className="card-body">
            {set.facts.length ? (
              <LineChart
                days={byPlatform.days}
                series={byPlatform.series.map((s) => ({ ...s, color: platformColor(s.key as Platform) }))}
              />
            ) : (
              <Empty title="Статистики пока нет">Она появится после первых публикаций или импорта роликов из аккаунтов.</Empty>
            )}
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <div>
              <h2>Что сделать</h2>
              <p>Рекомендации по данным проектов</p>
            </div>
          </div>
          <div style={{ paddingTop: 6, maxHeight: 420, overflowY: 'auto' }}>
            <InsightList items={insights} limit={8} />
          </div>
        </section>
      </div>

      <div className="grid-main">
        <section className="card">
          <div className="card-head">
            <div>
              <h2>Лучшие ролики за {range} дней</h2>
              <p>Сумма по площадкам; «×» — во сколько раз ролик обогнал обычный для аккаунта</p>
            </div>
            <Link href="/analytics" className="btn btn-sm">
              Вся аналитика
            </Link>
          </div>
          <div className="card-body table-wrap">
            {top.length ? (
              <table className="table">
                <thead>
                  <tr>
                    <th>Ролик</th>
                    <th>Площадки</th>
                    <th className="num">Просмотры</th>
                    <th className="num">ER</th>
                    <th>Результат</th>
                  </tr>
                </thead>
                <tbody>
                  {top.map((v) => (
                    <tr key={v.videoId}>
                      <td>
                        <Link href={`/content/${v.videoId}`} className="row row-link" style={{ flexWrap: 'nowrap' }}>
                          <Thumb thumb={v.thumb} title={v.title} color={v.projectColor} width={28} />
                          <span style={{ minWidth: 0 }}>
                            <span className="ellipsis" style={{ display: 'block', maxWidth: 320, fontWeight: 550 }}>
                              {v.title}
                            </span>
                            {!scope && <span className="small muted">{v.projectName}</span>}
                          </span>
                        </Link>
                      </td>
                      <td>
                        <span className="row" style={{ gap: 6 }}>
                          {PLATFORMS.filter((p) => v.byPlatform[p]).map((p) => (
                            <PlatformTag key={p} platform={p} label={false} />
                          ))}
                        </span>
                      </td>
                      <td className="num">{fmtNum(v.views)}</td>
                      <td className="num">{fmtPct(v.er)}</td>
                      <td>
                        <ScoreBadge score={v.bestScore} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <Empty title="За этот период публикаций нет" />
            )}
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <div>
              <h2>Ближайшие публикации</h2>
              <p>Очередь планировщика</p>
            </div>
            <Link href="/calendar" className="btn btn-sm">
              Календарь
            </Link>
          </div>
          <div className="card-body stack" style={{ gap: 10 }}>
            {upcoming.length ? (
              upcoming.map((u) => (
                <Link key={`${u.video_id}-${u.scheduled_at}`} href={`/content/${u.video_id}`} className="row" style={{ flexWrap: 'nowrap', gap: 10 }}>
                  <Thumb thumb={u.thumb_name} title={u.title} color={u.color} width={28} />
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span className="ellipsis" style={{ display: 'block', fontWeight: 550 }}>
                      {u.title}
                    </span>
                    <span className="small muted row" style={{ gap: 6 }}>
                      {fmtDate(u.scheduled_at, tz, false)}, {fmtTime(u.scheduled_at, tz)}
                      {(u.platforms.split(',') as Platform[]).map((p) => (
                        <PlatformTag key={p} platform={p} label={false} />
                      ))}
                    </span>
                  </span>
                  {!scope && <span className="dot" style={{ background: projectColor(u.color) }} title={u.project_name} />}
                </Link>
              ))
            ) : (
              <Empty title="Очередь пуста">
                <Link href="/content" className="btn btn-sm">
                  Запланировать готовые ролики
                </Link>
              </Empty>
            )}
          </div>
        </section>
      </div>

      {!scope && perProject.length > 0 && (
        <section className="card">
          <div className="card-head">
            <div>
              <h2>Проекты</h2>
              <p>Где растём и где отстаём от плана</p>
            </div>
          </div>
          <div className="card-body table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Проект</th>
                  <th className="num">Просмотры за {range} дн.</th>
                  <th className="num">Подписчики</th>
                  <th className="num">ER</th>
                  <th>Эта неделя</th>
                </tr>
              </thead>
              <tbody>
                {perProject.map(({ p, gained, followers, week, er }) => (
                  <tr key={p.id}>
                    <td>
                      <Link href={`/projects/${p.id}`} className="row-link">
                        <ProjectTag name={p.name} color={p.color} />
                      </Link>
                    </td>
                    <td className="num">{fmtNum(gained)}</td>
                    <td className="num">{fmtNum(followers)}</td>
                    <td className="num">{fmtPct(er)}</td>
                    <td style={{ minWidth: 160 }}>
                      <div className="spread small">
                        <span>
                          {week} из {p.posts_per_week}
                        </span>
                        {week >= p.posts_per_week ? <span className="badge badge-good">в плане</span> : <span className="badge badge-warning">отстаём</span>}
                      </div>
                      <div className="meter">
                        <span style={{ width: `${Math.min(100, (week / p.posts_per_week) * 100)}%` }} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
