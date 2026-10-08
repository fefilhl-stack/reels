import Link from 'next/link';
import { loadFacts, weeklyCadence } from '@/lib/analytics';
import { createProject } from '@/app/actions';
import { all } from '@/lib/db';
import { fmtNum } from '@/lib/format';
import { PLATFORMS, type Platform, type Project } from '@/lib/types';
import { LoadDemoButton } from '@/components/DemoButtons';
import { PlatformTag, projectColor } from '@/components/ui';

export const metadata = { title: 'Проекты' };

export default async function ProjectsPage() {
  const projects = all<Project>('SELECT * FROM projects WHERE archived = 0 ORDER BY id');
  const set = loadFacts(null);
  const accounts = all<{ project_id: number; platform: Platform; followers: number }>('SELECT project_id, platform, followers FROM accounts');
  const counts = all<{ project_id: number; stage: string; n: number }>(
    `SELECT v.project_id, v.stage, COUNT(*) AS n FROM videos v
      WHERE NOT EXISTS (SELECT 1 FROM posts p WHERE p.video_id = v.id AND p.status != 'canceled') GROUP BY v.project_id, v.stage`,
  );

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Проекты</h1>
          <p>У каждого проекта свои аккаунты, рубрики, слоты публикаций и цели.</p>
        </div>
      </div>
      <div className="grid-3">
        {projects.map((p) => {
          const acc = accounts.filter((a) => a.project_id === p.id);
          const facts = set.facts.filter((f) => f.projectId === p.id);
          const cadence = weeklyCadence(facts, 4);
          const n = (stage: string) => counts.find((c) => c.project_id === p.id && c.stage === stage)?.n ?? 0;
          return (
            <Link key={p.id} href={`/projects/${p.id}`} className="card card-pad stack" style={{ borderTop: `3px solid ${projectColor(p.color)}` }}>
              <div className="spread">
                <h2>{p.name}</h2>
                {p.is_demo ? <span className="badge badge-info">демо</span> : null}
              </div>
              {p.description && <p className="small ink-2">{p.description}</p>}
              <div className="row" style={{ gap: 12 }}>
                {PLATFORMS.map((pl) => {
                  const a = acc.find((x) => x.platform === pl);
                  return (
                    <span key={pl} className="row small" style={{ gap: 4, opacity: a ? 1 : 0.35 }}>
                      <PlatformTag platform={pl} label={false} />
                      {a ? fmtNum(a.followers) : '—'}
                    </span>
                  );
                })}
              </div>
              <div className="small muted">
                Идей {n('idea')} · в работе {n('script') + n('production')} · готово {n('ready')}
              </div>
              <div className="stack-sm">
                <div className="spread small">
                  <span className="muted">Ритм за 4 недели (план {p.posts_per_week}/нед.)</span>
                </div>
                <div className="row" style={{ gap: 4, flexWrap: 'nowrap', alignItems: 'flex-end', height: 34 }}>
                  {cadence.map((c, i) => (
                    <span
                      key={i}
                      title={`${c} из ${p.posts_per_week}`}
                      style={{
                        flex: 1,
                        height: `${Math.max(8, Math.min(100, (c / p.posts_per_week) * 100))}%`,
                        borderRadius: '4px 4px 0 0',
                        background: c >= p.posts_per_week ? 'var(--s1)' : 'var(--seq-2)',
                      }}
                    />
                  ))}
                </div>
              </div>
            </Link>
          );
        })}
        <form action={createProject} className="card card-pad stack">
          <h2>Новый проект</h2>
          <input className="input" name="name" placeholder="Название" required />
          <input className="input" name="description" placeholder="О чём проект (необязательно)" />
          <label className="field">
            <span>Роликов в неделю</span>
            <input className="input" name="posts_per_week" type="number" min={1} max={21} defaultValue={3} />
          </label>
          <button className="btn btn-primary">Создать</button>
          {!projects.some((p) => p.is_demo) && (
            <>
              <hr className="divider" />
              <p className="small muted">Хотите сначала посмотреть на пример?</p>
              <LoadDemoButton />
            </>
          )}
        </form>
      </div>
    </>
  );
}
