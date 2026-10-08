import Link from 'next/link';
import { redirect } from 'next/navigation';
import { isAuthed } from '@/lib/auth';
import { all, getSetting } from '@/lib/db';
import { env } from '@/lib/env';
import { fmtRelative } from '@/lib/format';
import { getScope } from '@/lib/scope';
import { IconUpload } from '@/components/Icons';
import { ScopeSwitcher } from '@/components/ScopeSwitcher';
import { Sidebar } from '@/components/Sidebar';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  if (!(await isAuthed())) redirect('/login');
  const scope = await getScope();
  const projects = all<{ id: number; name: string; color: number }>('SELECT id, name, color FROM projects WHERE archived = 0 ORDER BY id');
  const alerts =
    all<{ n: number }>(
      `SELECT (SELECT COUNT(*) FROM posts WHERE status = 'failed' AND updated_at > datetime('now', '-14 days'))
            + (SELECT COUNT(*) FROM accounts WHERE status = 'reauth') AS n`,
    )[0]?.n ?? 0;
  const lastTick = getSetting('worker.last_tick');
  const workerOk = lastTick && Date.now() - new Date(lastTick).getTime() < 5 * 60_000;
  const workerText = !env.workerEnabled()
    ? 'Планировщик выключен'
    : workerOk
      ? `Планировщик: ${fmtRelative(lastTick)}`
      : 'Планировщик запускается…';

  return (
    <div className="shell">
      <Sidebar alerts={alerts} hasPassword={!!env.password()} workerText={workerText} />
      <div className="main">
        <header className="topbar">
          <ScopeSwitcher projects={projects} current={scope?.id ?? 0} />
          <div style={{ flex: 1 }} />
          <Link href="/content/new" className="btn btn-primary">
            <IconUpload /> <span className="btn-text">Загрузить ролик</span>
          </Link>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
