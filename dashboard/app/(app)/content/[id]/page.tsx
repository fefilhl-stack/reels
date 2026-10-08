import Link from 'next/link';
import { notFound } from 'next/navigation';
import { aiEnabled } from '@/lib/ai';
import { loadFacts, valueAt } from '@/lib/analytics';
import { buildCaption, specChecks } from '@/lib/captions';
import { all, get } from '@/lib/db';
import { fmtBytes, fmtDate, fmtDuration, fmtNum, fmtPct } from '@/lib/format';
import { countWords, parseCtas, parseRange, rangeState, ruDate } from '@/lib/plan';
import { plannedAt } from '@/lib/planner';
import { appTz, dayRange, toLocalInput, zonedToUtc } from '@/lib/time';
import { PLATFORM_LABEL, PLATFORMS, type Account, type Platform, type Post, type Project, type Snippet, type Video } from '@/lib/types';
import { IconCheck, IconExternal, IconX } from '@/components/Icons';
import { LineChart } from '@/components/charts/LineChart';
import { Empty, PlatformTag, platformColor, ProjectTag, ScoreBadge, StatusBadge } from '@/components/ui';
import { AttachFile, CoverPicker } from './MediaTools';
import { PostActions } from './PostActions';
import { PublishPanel } from './PublishPanel';
import { VideoActions } from './VideoActions';
import { ScriptEditor } from './ScriptEditor';

export const metadata = { title: 'Сценарий' };

export default async function VideoPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const video = get<Video>('SELECT * FROM videos WHERE id = ?', id);
  if (!video) notFound();
  const tz = appTz();
  const project = get<Project>('SELECT * FROM projects WHERE id = ?', video.project_id)!;
  const rubrics = all<{ name: string }>('SELECT name FROM rubrics WHERE project_id = ? ORDER BY name', project.id).map((r) => r.name);
  const rubric = video.rubric_id ? (get<{ name: string }>('SELECT name FROM rubrics WHERE id = ?', video.rubric_id)?.name ?? '') : '';
  const ctas = [...new Set([...parseCtas(project.ctas), ...all<{ cta: string }>("SELECT DISTINCT cta FROM videos WHERE project_id = ? AND cta != ''", project.id).map((r) => r.cta)])];
  const prev = get<{ id: number; number: number }>('SELECT id, number FROM videos WHERE project_id = ? AND number > 0 AND number < ? ORDER BY number DESC LIMIT 1', project.id, video.number);
  const next = get<{ id: number; number: number }>('SELECT id, number FROM videos WHERE project_id = ? AND number > ? ORDER BY number LIMIT 1', project.id, video.number);
  const lengthNorm = parseRange(project.video_length);
  const lengthState = video.file_name ? rangeState(video.duration, lengthNorm) : null;
  const accounts = all<Account>('SELECT * FROM accounts WHERE project_id = ? ORDER BY platform, id', project.id);
  const posts = all<Post & { username: string }>(
    'SELECT p.*, a.username FROM posts p JOIN accounts a ON a.id = p.account_id WHERE p.video_id = ? ORDER BY p.created_at DESC',
    id,
  );
  const snippets = all<Snippet>('SELECT * FROM snippets WHERE project_id = ? OR project_id IS NULL ORDER BY kind, id', project.id);
  const parent = video.parent_id ? get<{ id: number; title: string }>('SELECT id, title FROM videos WHERE id = ?', video.parent_id) : undefined;
  const sequels = all<{ id: number; title: string }>('SELECT id, title FROM videos WHERE parent_id = ?', id);
  const planned = plannedAt(video);

  // Analytics for this video's published posts.
  const set = loadFacts(project.id);
  const facts = set.facts.filter((f) => f.videoId === id);
  let chart: { days: string[]; series: { key: string; label: string; color: string; values: number[] }[] } | null = null;
  if (facts.length) {
    const first = Math.min(...facts.map((f) => f.publishedAt));
    const span = Math.min(30, Math.max(2, Math.ceil((Date.now() - first) / 86_400_000) + 1));
    const days = dayRange(span, new Date(), tz);
    const ends = days.map((d) => {
      const [y, m, dd] = d.split('-').map(Number);
      return Math.min(Date.now(), zonedToUtc(y, m, dd + 1, 0, 0, tz).getTime());
    });
    chart = {
      days,
      series: facts.map((f) => ({
        key: f.platform,
        label: PLATFORM_LABEL[f.platform],
        color: platformColor(f.platform),
        values: ends.map((t) => Math.round(valueAt(set.curves.get(f.id)!, t))),
      })),
    };
  }
  const totalViews = facts.reduce((s, f) => s + f.views, 0);
  const postedPlatforms = new Set(posts.filter((p) => p.status !== 'canceled').map((p) => p.platform));
  const missing = [...new Set(accounts.filter((a) => a.status === 'active').map((a) => a.platform))].filter((p) => !postedPlatforms.has(p));
  const winner = facts.some((f) => (f.score ?? 0) >= 2);

  const defaults = Object.fromEntries(PLATFORMS.map((p) => [p, buildCaption(p, video, project)])) as Record<Platform, string>;

  return (
    <>
      <div className="page-head">
        <div style={{ minWidth: 0 }}>
          <div className="row small muted" style={{ marginBottom: 6 }}>
            <Link href={`/content?p=${project.id}`} className="link">
              Контент-план
            </Link>
            <span>/</span>
            <ProjectTag name={project.name} color={project.color} />
            {video.number > 0 && (
              <>
                <span>/</span>
                {prev ? (
                  <Link href={`/content/${prev.id}`} className="link">
                    ← №{prev.number}
                  </Link>
                ) : null}
                <span>№{video.number}</span>
                {next ? (
                  <Link href={`/content/${next.id}`} className="link">
                    №{next.number} →
                  </Link>
                ) : null}
              </>
            )}
          </div>
          <h1>{video.title}</h1>
          <p className="small">
            {video.plan_date ? `По плану: ${ruDate(video.plan_date)}${video.plan_time ? `, ${video.plan_time}` : ''}` : 'Дата не назначена'}
            {rubric ? ` · ${rubric}` : ''} · {video.status}
            {video.script ? ` · ${countWords(video.script)} слов${project.words_norm ? ` (норма ${project.words_norm})` : ''}` : ''}
          </p>
          {parent && (
            <p className="small">
              Продолжение ролика{' '}
              <Link href={`/content/${parent.id}`} className="link">
                «{parent.title}»
              </Link>
            </p>
          )}
        </div>
        <VideoActions videoId={id} />
      </div>

      {winner && (
        <div className="notice notice-info">
          <span>
            <b>Ролик залетел.</b>{' '}
            {missing.length
              ? `Опубликуйте его в ${missing.map((m) => PLATFORM_LABEL[m]).join(', ')}, пока тема горячая, и снимите продолжение.`
              : 'Снимите продолжение с тем же хуком — кнопка «Сделать часть 2» добавит сценарий в конец плана.'}
          </span>
        </div>
      )}

      <div className="grid-video">
        <aside className="stack">
          {video.file_name ? (
            <CoverPicker videoId={id} src={`/api/media/${video.file_name}`} coverMs={video.cover_ms} />
          ) : (
            <AttachFile videoId={id} />
          )}
          {video.file_name && (
            <div className="card card-pad stack-sm small">
              <div className="spread">
                <span className="muted">Файл</span>
                <span className="ellipsis" style={{ maxWidth: 180 }} title={video.original_name}>
                  {video.original_name}
                </span>
              </div>
              <div className="spread">
                <span className="muted">Размер</span>
                <span>{fmtBytes(video.file_size)}</span>
              </div>
              <div className="spread">
                <span className="muted">Длительность</span>
                <span style={{ color: lengthState && lengthState !== 'ok' ? 'var(--critical-ink)' : undefined }}>
                  {fmtDuration(video.duration)}
                  {lengthNorm ? ` · норма ${lengthNorm.min}–${lengthNorm.max} с` : ''}
                </span>
              </div>
              <div className="spread">
                <span className="muted">Разрешение</span>
                <span>{video.width && video.height ? `${video.width}×${video.height}` : '—'}</span>
              </div>
              <hr className="divider" style={{ margin: '6px 0' }} />
              {PLATFORMS.map((p) => (
                <div key={p} className="stack-sm" style={{ gap: 2 }}>
                  <PlatformTag platform={p} />
                  {specChecks(p, video).map((c, i) => (
                    <span key={i} className="row" style={{ gap: 6, flexWrap: 'nowrap', color: c.ok ? 'var(--ink-2)' : 'var(--critical-ink)' }}>
                      {c.ok ? <IconCheck size={13} /> : <IconX size={13} />} {c.text}
                    </span>
                  ))}
                </div>
              ))}
            </div>
          )}
        </aside>

        <div className="stack" style={{ gap: 16 }}>
          <ScriptEditor
            video={video}
            rubric={rubric}
            rubrics={rubrics}
            ctas={ctas}
            snippets={snippets}
            wordsNorm={parseRange(project.words_norm)}
            ai={aiEnabled()}
            sequels={sequels}
          />

          <PublishPanel
            videoId={id}
            hasFile={!!video.file_name}
            title={video.cover_text || video.title}
            duration={video.duration}
            accounts={accounts.map((a) => ({
              id: a.id,
              platform: a.platform,
              username: a.username,
              displayName: a.display_name,
              status: a.status,
              isDemo: !!a.is_demo,
              posted: posts.some((p) => p.account_id === a.id && ['scheduled', 'publishing', 'processing', 'published'].includes(p.status)),
            }))}
            defaults={defaults}
            planned={planned && planned.getTime() > Date.now() ? { local: toLocalInput(planned, tz), label: fmtDate(planned.toISOString(), tz) } : null}
            defaultAt={toLocalInput(planned && planned.getTime() > Date.now() ? planned : new Date(Date.now() + 3_600_000), tz)}
            ai={aiEnabled()}
            tz={tz}
          />

          <section className="card">
            <div className="card-head">
              <h2>Публикации</h2>
              {totalViews > 0 && <span className="chip">{fmtNum(totalViews)} просмотров всего</span>}
            </div>
            <div className="card-body table-wrap">
              {posts.length ? (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Площадка</th>
                      <th>Статус</th>
                      <th>Когда</th>
                      <th className="num">Просмотры</th>
                      <th className="num">ER</th>
                      <th>Результат</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {posts.map((p) => {
                      const f = facts.find((x) => x.id === p.id);
                      return (
                        <tr key={p.id}>
                          <td>
                            <PlatformTag platform={p.platform} />
                            <div className="small muted">@{p.username}</div>
                          </td>
                          <td>
                            <StatusBadge status={p.status} />
                            {p.last_error && (
                              <div className="small" style={{ color: p.status === 'failed' ? 'var(--critical-ink)' : 'var(--muted)', maxWidth: 260 }}>
                                {p.last_error}
                              </div>
                            )}
                            {p.status === 'processing' && <div className="small muted">{String(JSON.parse(p.state || '{}').tiktokStatus ?? JSON.parse(p.state || '{}').igStatus ?? 'площадка обрабатывает видео')}</div>}
                          </td>
                          <td className="small">{fmtDate(p.published_at ?? p.scheduled_at, tz)}</td>
                          <td className="num">{p.status === 'published' ? fmtNum(p.views) : '—'}</td>
                          <td className="num">{f ? fmtPct(f.er) : '—'}</td>
                          <td>{p.status === 'published' ? <ScoreBadge score={f?.score ?? null} /> : null}</td>
                          <td>
                            <div className="row" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                              {p.url && (
                                <a href={p.url} target="_blank" rel="noreferrer" className="btn btn-sm btn-ghost" title="Открыть на площадке">
                                  <IconExternal size={14} />
                                </a>
                              )}
                              <PostActions id={p.id} status={p.status} scheduledLocal={p.scheduled_at ? toLocalInput(p.scheduled_at, tz) : ''} />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <Empty title="Ролик ещё не публиковался">Выберите площадки выше и нажмите «Запланировать» или «Опубликовать сейчас».</Empty>
              )}
            </div>
          </section>

          {chart && (
            <section className="card">
              <div className="card-head">
                <div>
                  <h2>Набор просмотров</h2>
                  <p>Накопленные просмотры по дням с момента публикации</p>
                </div>
              </div>
              <div className="card-body">
                <LineChart days={chart.days} series={chart.series} height={200} />
                <div className="table-wrap" style={{ marginTop: 12 }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Площадка</th>
                        <th className="num">Лайки</th>
                        <th className="num">Комменты</th>
                        <th className="num">Репосты</th>
                        <th className="num">Сохранения</th>
                        <th className="num">Досмотр</th>
                      </tr>
                    </thead>
                    <tbody>
                      {facts.map((f) => (
                        <tr key={f.id}>
                          <td>
                            <PlatformTag platform={f.platform} />
                          </td>
                          <td className="num">{fmtNum(f.likes)}</td>
                          <td className="num">{fmtNum(f.comments)}</td>
                          <td className="num">{fmtNum(f.shares)}</td>
                          <td className="num">{f.platform === 'instagram' ? fmtNum(f.saves) : '—'}</td>
                          <td className="num">{fmtPct(f.avgViewPct, 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          )}


        </div>
      </div>
    </>
  );
}

