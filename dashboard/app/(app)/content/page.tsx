import Link from 'next/link';
import { aiEnabled } from '@/lib/ai';
import { all } from '@/lib/db';
import { parseCtas, parseRange, ruDate } from '@/lib/plan';
import { today } from '@/lib/planner';
import { planRows } from '@/lib/queries';
import { getScope } from '@/lib/scope';
import { appTz } from '@/lib/time';
import type { Account, Project } from '@/lib/types';
import { LoadDemoButton } from '@/components/DemoButtons';
import { projectColor } from '@/components/ui';
import { ImportDialog } from './ImportDialog';
import { PlanView } from './PlanView';

export const metadata = { title: 'Контент-план' };

export default async function ContentPlanPage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const sp = await searchParams;
  const scope = await getScope();
  const projects = all<Project>('SELECT * FROM projects WHERE archived = 0 ORDER BY id');

  if (!projects.length) {
    return (
      <>
        <div className="page-head">
          <div>
            <h1>Контент-план</h1>
            <p>Сценарии по шаблону: №, дата, время, рубрика, тема, хук, обложка, кадр, текст озвучки, призыв, подпись, хэштеги, статус.</p>
          </div>
        </div>
        <div className="card card-pad stack" style={{ maxWidth: 640 }}>
          <h2>С чего начать</h2>
          <p className="ink-2">
            Перенесите таблицу из Google Таблиц: сначала лист «Проекты» — появятся проекты с паспортами, затем листы с контент-планами. Или создайте проект с
            нуля.
          </p>
          <div className="row">
            <ImportDialog projects={[]} currentProjectId={null} primary />
            <Link href="/projects" className="btn">
              Создать проект
            </Link>
            <LoadDemoButton label="Посмотреть на демо" />
          </div>
        </div>
      </>
    );
  }

  const project = projects.find((p) => p.id === Number(sp.p)) ?? (scope ? projects.find((p) => p.id === scope.id) : undefined) ?? projects[0];
  const rows = planRows(project.id);
  const accounts = all<Pick<Account, 'id' | 'platform' | 'is_demo' | 'status'>>('SELECT id, platform, is_demo, status FROM accounts WHERE project_id = ?', project.id);
  const rubrics = all<{ name: string }>('SELECT name FROM rubrics WHERE project_id = ? ORDER BY name', project.id).map((r) => r.name);
  const ctas = [...new Set([...parseCtas(project.ctas), ...rows.map((r) => r.cta).filter(Boolean)])];
  const published = rows.filter((r) => r.status === 'Опубликован').length;
  const lastDate = rows.reduce<string | null>((m, r) => (r.planDate && (!m || r.planDate > m) ? r.planDate : m), null);
  const active = accounts.filter((a) => a.status === 'active');

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Контент-план</h1>
          <p>
            Сценариев: {rows.length} · опубликовано: {published}
            {lastDate ? ` · план до ${ruDate(lastDate)}` : ''}
            {project.words_norm ? ` · норма слов ${project.words_norm}` : ''}
            {project.video_length ? ` · длина ${project.video_length}` : ''}
          </p>
        </div>
        <div className="row">
          <Link href={`/projects/${project.id}`} className="btn">
            Паспорт проекта
          </Link>
          <ImportDialog projects={projects.map((p) => ({ id: p.id, name: p.name }))} currentProjectId={project.id} />
        </div>
      </div>

      <nav className="sheet-tabs" aria-label="Проекты">
        {projects.map((p) => (
          <Link key={p.id} href={`/content?p=${p.id}`} aria-current={p.id === project.id ? 'true' : undefined}>
            <span className="dot" style={{ background: projectColor(p.color) }} />
            {p.name}
          </Link>
        ))}
        <Link href="/projects" className="muted">
          + проект
        </Link>
      </nav>

      <PlanView
        projectId={project.id}
        rows={rows}
        rubrics={rubrics}
        ctas={ctas}
        wordsNorm={parseRange(project.words_norm)}
        lengthNorm={parseRange(project.video_length)}
        accounts={active.length}
        demoOnly={active.length > 0 && active.every((a) => a.is_demo)}
        today={today()}
        tz={appTz()}
        ai={aiEnabled()}
      />
    </>
  );
}
