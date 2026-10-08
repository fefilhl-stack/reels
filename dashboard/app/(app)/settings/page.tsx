import { aiEnabled } from '@/lib/ai';
import { all, getSetting } from '@/lib/db';
import { hasDemo } from '@/lib/demo';
import { appUrl, DATA_DIR, env } from '@/lib/env';
import { fmtDate, fmtRelative } from '@/lib/format';
import { appTz } from '@/lib/time';
import { ClearDemoButton, LoadDemoButton } from '@/components/DemoButtons';
import { SystemButtons } from './SystemButtons';

export const metadata = { title: 'Настройки' };

export default async function SettingsPage() {
  const tz = appTz();
  const lastTick = getSetting('worker.last_tick');
  const queue = all<{ status: string; n: number }>('SELECT status, COUNT(*) AS n FROM posts GROUP BY status');
  const n = (s: string) => queue.find((q) => q.status === s)?.n ?? 0;
  const logs = all<{ id: number; at: string; level: string; message: string }>('SELECT id, at, level, message FROM logs ORDER BY id DESC LIMIT 80');

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Настройки</h1>
          <p>Планировщик, данные и журнал событий</p>
        </div>
      </div>

      <div className="grid-3">
        <section className="card card-pad stack-sm">
          <h2>Планировщик</h2>
          <div className="small ink-2">
            {env.workerEnabled() ? `Работает внутри сервера, проверяет очередь каждые 30 секунд. Последний проход: ${fmtRelative(lastTick)}.` : 'Выключен (WORKER_ENABLED=false). Вызывайте /api/cron по расписанию.'}
          </div>
          <div className="small muted">
            В очереди {n('scheduled')} · загружается {n('publishing')} · обрабатывается {n('processing')} · ошибок {n('failed')}
          </div>
          <SystemButtons />
          <div className="hint">
            Для хостинга без постоянного процесса: <code>GET {appUrl()}/api/cron?secret=CRON_SECRET</code> раз в минуту.
          </div>
        </section>

        <section className="card card-pad stack-sm">
          <h2>Демо-данные</h2>
          <p className="small ink-2">
            Три проекта с историей за 8 недель, контент-план и запланированные публикации. Демо-аккаунты публикуют мгновенно и без сети — удобно, чтобы проверить
            весь процесс.
          </p>
          <div className="row">{hasDemo() ? <ClearDemoButton /> : <LoadDemoButton />}</div>
        </section>

        <section className="card card-pad stack-sm">
          <h2>ИИ-помощник</h2>
          <p className="small ink-2">
            {aiEnabled()
              ? `Включён (${env.anthropic().model || 'claude-opus-5-5'}): подписи под площадки, варианты хуков и идеи по лучшим роликам проекта.`
              : 'Выключен. Добавьте ANTHROPIC_API_KEY в .env, чтобы генерировать подписи, хуки и идеи на основе статистики проекта.'}
          </p>
          <div className="small muted">Часовой пояс: {tz}</div>
          <div className="small muted">Данные: {DATA_DIR}</div>
          <div className="small muted">Пароль: {env.password() ? 'задан' : 'не задан — не открывайте дашборд в интернет без DASHBOARD_PASSWORD'}</div>
        </section>
      </div>

      <section className="card">
        <div className="card-head">
          <h2>Журнал</h2>
        </div>
        <div className="card-body table-wrap">
          {logs.length ? (
            <table className="table">
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id}>
                    <td className="small muted" style={{ whiteSpace: 'nowrap' }}>
                      {fmtDate(l.at, tz)}
                    </td>
                    <td>
                      <span className={`badge ${l.level === 'error' ? 'badge-critical' : l.level === 'warn' ? 'badge-warning' : 'badge-info'}`}>{l.level}</span>
                    </td>
                    <td className="small">{l.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="muted small">Событий пока нет.</p>
          )}
        </div>
      </section>
    </>
  );
}
