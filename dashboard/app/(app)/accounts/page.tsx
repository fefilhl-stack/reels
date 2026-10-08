import { all } from '@/lib/db';
import { appUrl } from '@/lib/env';
import { fmtDate, fmtNum, fmtRelative } from '@/lib/format';
import { adapters } from '@/lib/platforms';
import { getScope } from '@/lib/scope';
import { appUrlIsPublic } from '@/lib/serve';
import { appTz } from '@/lib/time';
import { PLATFORM_LABEL, PLATFORMS, type Account, type Platform, type Project } from '@/lib/types';
import { IconCheck, IconX } from '@/components/Icons';
import { PlatformTag, projectColor } from '@/components/ui';
import { AccountActions, DemoAccountButton } from './AccountActions';

export const metadata = { title: 'Аккаунты' };

const SETUP: Record<Platform, { console: string; steps: string[] }> = {
  tiktok: {
    console: 'https://developers.tiktok.com/apps',
    steps: [
      'Создайте приложение в TikTok for Developers, добавьте продукты Login Kit и Content Posting API (включите Direct Post).',
      'Scopes: user.info.basic, user.info.profile, user.info.stats, video.publish, video.list.',
      'Redirect URI — только https (localhost не принимается): используйте домен или туннель.',
      'До аудита TikTok: публикация только с видимостью «Только я», аккаунт должен быть приватным, до 5 пользователей в сутки. После аудита — публичные посты.',
    ],
  },
  instagram: {
    console: 'https://developers.facebook.com/apps',
    steps: [
      'Создайте приложение Meta (тип Business), добавьте продукт Instagram → «API setup with Instagram login».',
      'Разрешения: instagram_business_basic, instagram_business_content_publish, instagram_business_manage_insights.',
      'Аккаунт Instagram должен быть профессиональным (бизнес или автор). До App Review подключаются только аккаунты с ролью в приложении.',
      'Instagram сам скачивает ролик по ссылке, поэтому APP_URL должен быть публичным https-адресом. Лимит — около 100 публикаций через API в сутки.',
    ],
  },
  youtube: {
    console: 'https://console.cloud.google.com/apis/credentials',
    steps: [
      'В Google Cloud включите YouTube Data API v3 и YouTube Analytics API, создайте OAuth client типа «Web application».',
      'Scopes: youtube.upload, youtube.readonly, yt-analytics.readonly. Переведите OAuth consent screen в режим «In production» — в режиме Testing токены живут 7 дней.',
      'Пока проект не прошёл аудит YouTube API, загруженные ролики будут приватными. Квота по умолчанию — 100 загрузок в сутки.',
      'Shorts — вертикальные или квадратные ролики до 3 минут; #shorts в заголовке не обязателен.',
    ],
  },
};

export default async function AccountsPage({ searchParams }: { searchParams: Promise<{ error?: string; connected?: string }> }) {
  const sp = await searchParams;
  const scope = await getScope();
  const tz = appTz();
  const projects = scope ? [scope] : all<Project>('SELECT * FROM projects WHERE archived = 0 ORDER BY id');
  const accounts = all<Account>('SELECT * FROM accounts ORDER BY platform, id');

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Аккаунты</h1>
          <p>Подключите площадки к проектам. Токены хранятся в базе в зашифрованном виде и обновляются автоматически.</p>
        </div>
      </div>
      {sp.error && <div className="notice notice-error">{sp.error}</div>}
      {sp.connected && <div className="notice notice-ok">Аккаунт подключён. Импортируйте последние ролики, чтобы аналитика сразу была полной.</div>}

      {projects.map((p) => (
        <section key={p.id} className="card">
          <div className="card-head">
            <h2 className="row" style={{ gap: 8 }}>
              <span className="dot" style={{ background: projectColor(p.color) }} />
              {p.name}
            </h2>
            <div className="row">
              {PLATFORMS.map((pl) =>
                adapters[pl].configured() ? (
                  <a key={pl} href={`/api/oauth/${pl}/start?project=${p.id}`} className="btn btn-sm">
                    <PlatformTag platform={pl} /> подключить
                  </a>
                ) : (
                  <DemoAccountButton key={pl} projectId={p.id} platform={pl} />
                ),
              )}
            </div>
          </div>
          <div className="card-body table-wrap">
            {accounts.some((a) => a.project_id === p.id) ? (
              <table className="table">
                <thead>
                  <tr>
                    <th>Аккаунт</th>
                    <th>Статус</th>
                    <th className="num">Подписчики</th>
                    <th>Синхронизация</th>
                    <th>Токен до</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {accounts
                    .filter((a) => a.project_id === p.id)
                    .map((a) => (
                      <tr key={a.id}>
                        <td>
                          <span className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
                            <PlatformTag platform={a.platform} label={false} />
                            <span>
                              <span style={{ fontWeight: 550 }}>@{a.username}</span>
                              {a.display_name && a.display_name !== a.username && <span className="small muted"> · {a.display_name}</span>}
                            </span>
                            {a.is_demo ? <span className="badge badge-info">демо</span> : null}
                          </span>
                        </td>
                        <td>
                          {a.status === 'active' ? (
                            <span className="badge badge-good">
                              <IconCheck size={12} /> работает
                            </span>
                          ) : a.status === 'reauth' ? (
                            <span className="badge badge-critical">
                              <IconX size={12} /> переподключить
                            </span>
                          ) : (
                            <span className="badge badge-warning">ошибка</span>
                          )}
                          {a.status_message && <div className="small muted" style={{ maxWidth: 280 }}>{a.status_message}</div>}
                        </td>
                        <td className="num">{fmtNum(a.followers)}</td>
                        <td className="small">{fmtRelative(a.last_synced_at)}</td>
                        <td className="small">{a.is_demo ? '—' : a.token_expires_at ? fmtDate(a.token_expires_at, tz) : '—'}</td>
                        <td>
                          <AccountActions id={a.id} demo={!!a.is_demo} reconnect={adapters[a.platform].configured() ? `/api/oauth/${a.platform}/start?project=${p.id}` : null} />
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            ) : (
              <p className="muted small">Нет подключённых аккаунтов.</p>
            )}
          </div>
        </section>
      ))}

      <section className="card">
        <div className="card-head">
          <div>
            <h2>Настройка API площадок</h2>
            <p>Ключи задаются в файле .env рядом с дашбордом; после изменения перезапустите сервер.</p>
          </div>
        </div>
        <div className="card-body stack">
          {!appUrlIsPublic() && (
            <div className="notice notice-info">
              Сейчас APP_URL = {appUrl()}. Для TikTok и Instagram нужен публичный https-адрес: разверните дашборд на сервере с доменом или откройте туннель
              (например, cloudflared или ngrok) и укажите его адрес в APP_URL.
            </div>
          )}
          <div className="grid-3">
            {PLATFORMS.map((pl) => {
              const a = adapters[pl];
              return (
                <div key={pl} className="stack-sm" style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 14 }}>
                  <div className="spread">
                    <strong>
                      <PlatformTag platform={pl} />
                    </strong>
                    {a.configured() ? <span className="badge badge-good">ключи заданы</span> : <span className="badge badge-warning">нет ключей</span>}
                  </div>
                  <div className="small">
                    <span className="muted">Переменные: </span>
                    {a.requiredEnv.map((e) => (
                      <code key={e} style={{ marginRight: 6 }}>
                        {e}
                      </code>
                    ))}
                  </div>
                  <div className="small">
                    <span className="muted">Redirect URI: </span>
                    <code style={{ wordBreak: 'break-all' }}>{`${appUrl()}/api/oauth/${pl}/callback`}</code>
                  </div>
                  <ol className="small ink-2" style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 4 }}>
                    {SETUP[pl].steps.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ol>
                  <a href={SETUP[pl].console} target="_blank" rel="noreferrer" className="link small">
                    Открыть консоль разработчика {PLATFORM_LABEL[pl]} →
                  </a>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </>
  );
}
