import { aiEnabled } from '@/lib/ai';
import { all } from '@/lib/db';
import { boardCards } from '@/lib/queries';
import { getScope } from '@/lib/scope';
import { appTz } from '@/lib/time';
import type { Rubric } from '@/lib/types';
import { AiIdeas } from './AiIdeas';
import { Board } from './Board';

export const metadata = { title: 'Контент' };

export default async function ContentPage() {
  const scope = await getScope();
  const projects = scope ? [{ id: scope.id, name: scope.name, color: scope.color }] : all<{ id: number; name: string; color: number }>('SELECT id, name, color FROM projects WHERE archived = 0 ORDER BY id');
  const rubrics = all<Rubric>(`SELECT * FROM rubrics ${scope ? 'WHERE project_id = ?' : ''} ORDER BY name`, ...(scope ? [scope.id] : []));
  const cards = boardCards(scope?.id ?? null);
  const published = cards
    .filter((c) => c.column === 'published')
    .sort((a, b) => (b.lastPub ?? '').localeCompare(a.lastPub ?? ''))
    .slice(0, 12);
  const rest = cards.filter((c) => c.column !== 'published');

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Контент</h1>
          <p>Путь ролика от идеи до публикации. Перетаскивайте карточки между этапами; готовые ставьте в очередь одной кнопкой.</p>
        </div>
        {scope && aiEnabled() && <AiIdeas projectId={scope.id} />}
      </div>
      {projects.length ? (
        <Board cards={[...rest, ...published]} projects={projects} rubrics={rubrics} tz={appTz()} />
      ) : (
        <div className="card card-pad muted">Сначала создайте проект.</div>
      )}
    </>
  );
}
