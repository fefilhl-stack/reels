import Link from 'next/link';
import { notFound } from 'next/navigation';
import { aiEnabled } from '@/lib/ai';
import { loadFacts, valueAt } from '@/lib/analytics';
import { buildCaption, specChecks } from '@/lib/captions';
import { all, get } from '@/lib/db';
import { fmtBytes, fmtDate, fmtDuration, fmtNum, fmtPct } from '@/lib/format';
import { nextFreeSlots } from '@/lib/slots';
import { appTz, dayRange, toLocalInput, zonedToUtc } from '@/lib/time';
import { PLATFORM_LABEL, PLATFORMS, type Account, type Platform, type Post, type Project, type Rubric, type Snippet, type Video } from '@/lib/types';
import { IconCheck, IconExternal, IconX } from '@/components/Icons';
import { LineChart } from '@/components/charts/LineChart';
import { Empty, PlatformTag, platformColor, ProjectTag, ScoreBadge, StatusBadge } from '@/components/ui';
import { AttachFile, CoverPicker } from './MediaTools';
import { PostActions } from './PostActions';
import { PublishPanel } from './PublishPanel';
import { VideoActions } from './VideoActions';
import { VideoEditor } from './VideoEditor';

export const metadata = { title: 'Ролик' };

export default async function VideoPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const video = get<Video>('SELECT * FROM videos WHERE id = ?', id);
  if (!video) notFound();
  const tz = appTz();
  const project = get<Project>('SELECT * FROM projects WHERE id = ?', video.project_id)!;
  const projects = all<{ id: number; name: string }>('SELECT id, name FROM projects WHERE archived = 0 ORDER BY id');
  const rubrics = all<Rubric>('SELECT * FROM rubrics ORDER BY name');
  const accounts = all<Account>('SELECT * FROM accounts WHERE project_id = ? ORDER BY platform, id', project.id);
  const posts = all<Post & { username: string }>(
    'SELECT p.*, a.username FROM posts p JOIN accounts a ON a.id = p.account_id WHERE p.video_id = ? ORDER BY p.created_at DESC',
    id,
  );
  const snippets = all<Snippet>('SELECT * FROM snippets WHERE project_id = ? OR project_id IS NULL ORDER BY kind, id', project.id);
  const parent = video.parent_id ? get<{ id: number; title: string }>('SELECT id, title FROM videos WHERE id = ?', video.parent_id) : undefined;
  const sequels = all<{ id: number; title: string }>('SELECT id, title FROM videos WHERE parent_id = ?', id);
  const slot = nextFreeSlots(project, 1)[0] ?? null;

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
            <Link href="/content" className="link">
              Контент
            </Link>
            <span>/</span>
            <ProjectTag name={project.name} color={project.color} />
          </div>
          <h1>{video.title}</h1>
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
              : 'Снимите продолжение с тем же хуком — кнопка «Сделать часть 2» создаст карточку в идеях.'}
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
                <span>{fmtDuration(video.duration)}</span>
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
          <PublishPanel
            videoId={id}
            hasFile={!!video.file_name}
            title={video.title}
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
            nextSlot={slot ? { iso: slot.toISOString(), label: fmtDate(slot.toISOString(), tz) } : null}
            defaultAt={toLocalInput(slot ?? new Date(Date.now() + 3_600_000), tz)}
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

          <VideoEditor
            video={video}
            projects={projects}
            rubrics={rubrics}
            snippets={snippets}
            ai={aiEnabled()}
            sequels={sequels}
          />
        </div>
      </div>
    </>
  );
}

