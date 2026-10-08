import Link from 'next/link';
import { createProject } from '@/app/actions';
import { all } from '@/lib/db';
import { fmtNum } from '@/lib/format';
import { ruDate } from '@/lib/plan';
import { PLATFORMS, type Platform, type Project } from '@/lib/types';
import { LoadDemoButton } from '@/components/DemoButtons';
import { PlatformTag, projectColor } from '@/components/ui';
import { ImportDialog } from '../content/ImportDialog';

export const metadata = { title: 'Проекты' };

export default async function ProjectsPage() {
  const projects = all<Project>('SELECT * FROM projects WHERE archived = 0 ORDER BY id');
  const accounts = all<{ project_id: number; platform: Platform; followers: number }>('SELECT project_id, platform, followers FROM accounts');
  const plan = all<{ project_id: number; status: string; n: number; last: string | null }>(
    'SELECT project_id, status, COUNT(*) AS n, MAX(plan_date) AS last FROM videos WHERE number > 0 GROUP BY project_id, status',
  );

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Проекты</h1>
          <p>У каждого проекта паспорт (как лист «Проекты» в таблице), свой контент-план и аккаунты.</p>
        </div>
        <ImportDialog projects={projects.map((p) => ({ id: p.id, name: p.name }))} currentProjectId={projects[0]?.id ?? null} />
      </div>
      <div className="grid-3">
        {projects.map((p) => {
          const acc = accounts.filter((a) => a.project_id === p.id);
          const rows = plan.filter((x) => x.project_id === p.id);
          const total = rows.reduce((s, x) => s + x.n, 0);
          const done = rows.find((x) => x.status === 'Опубликован')?.n ?? 0;
          const last = rows.reduce<string | null>((m, x) => (x.last && (!m || x.last > m) ? x.last : m), null);
          return (
            <div key={p.id} className="card card-pad stack" style={{ borderTop: `3px solid ${projectColor(p.color)}` }}>
              <div className="spread">
                <h2>{p.name}</h2>
                {p.is_demo ? <span className="badge badge-info">демо</span> : null}
              </div>
              {p.description && <p className="small ink-2">{p.description}</p>}
              <div className="small muted">
                {[p.frequency || (p.posts_per_week >= 7 ? 'Каждый день' : `${p.posts_per_week} в неделю`), p.words_norm && `${p.words_norm} слов`, p.video_length].filter(Boolean).join(' · ')}
              </div>
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
              <div className="stack-sm">
                <div className="spread small">
                  <span>
                    Опубликовано {done} из {total}
                  </span>
                  <span className="muted">{last ? `план до ${ruDate(last)}` : 'план пуст'}</span>
                </div>
                <div className="meter">
                  <span style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
                </div>
              </div>
              <div className="row">
                <Link href={`/content?p=${p.id}`} className="btn btn-sm btn-primary">
                  Контент-план
                </Link>
                <Link href={`/projects/${p.id}`} className="btn btn-sm">
                  Паспорт
                </Link>
              </div>
            </div>
          );
        })}
        <form action={createProject} className="card card-pad stack">
          <h2>Новый проект</h2>
          <input className="input" name="name" placeholder="Название" required />
          <input className="input" name="description" placeholder="Тема аккаунта" />
          <div className="grid-2" style={{ gap: 8 }}>
            <label className="field">
              <span>Роликов в неделю</span>
              <input className="input" name="posts_per_week" type="number" min={1} max={7} defaultValue={7} />
            </label>
            <label className="field">
              <span>Дата старта</span>
              <input className="input" name="start_date" type="date" />
            </label>
          </div>
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
