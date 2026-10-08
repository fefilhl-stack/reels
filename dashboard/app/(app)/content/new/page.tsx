import Link from 'next/link';
import { all } from '@/lib/db';
import { getScope } from '@/lib/scope';
import type { Rubric } from '@/lib/types';
import { UploadForm } from './UploadForm';

export const metadata = { title: 'Загрузка роликов' };

export default async function NewVideoPage() {
  const scope = await getScope();
  const projects = all<{ id: number; name: string }>('SELECT id, name FROM projects WHERE archived = 0 ORDER BY id');
  const rubrics = all<Rubric>('SELECT * FROM rubrics ORDER BY name');
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Загрузка роликов</h1>
          <p>Загрузите один или несколько вертикальных роликов. Затем на странице ролика выберите площадки и время публикации — или поставьте в очередь.</p>
        </div>
      </div>
      {projects.length ? (
        <UploadForm projects={projects} rubrics={rubrics} defaultProject={scope?.id ?? projects[0].id} />
      ) : (
        <div className="card card-pad">
          Сначала{' '}
          <Link href="/projects" className="link">
            создайте проект
          </Link>
          .
        </div>
      )}
    </>
  );
}
