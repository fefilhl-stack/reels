import Link from 'next/link';
import { all } from '@/lib/db';
import { fmtDuration } from '@/lib/format';
import { getScope } from '@/lib/scope';
import { projectSlots } from '@/lib/slots';
import { appTz, dayKey, zonedParts, zonedToUtc } from '@/lib/time';
import type { Platform, PostStatus, Project } from '@/lib/types';
import { Thumb } from '@/components/ui';
import { CalendarGrid, type CalItem, type SlotMark } from './CalendarGrid';
import { QueueButton } from './QueueButton';

export const metadata = { title: 'Календарь' };

const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const tz = appTz();
  const scope = await getScope();
  const now = zonedParts(new Date(), tz);
  const m = /^(\d{4})-(\d{2})$/.exec((await searchParams).month ?? '');
  const year = m ? +m[1] : now.y;
  const month = m ? +m[2] : now.m;

  // Grid: Monday before the 1st … 6 weeks.
  const first = zonedToUtc(year, month, 1, 12, 0, tz);
  const lead = zonedParts(first, tz).wd - 1;
  const days: string[] = [];
  for (let i = 0; i < 42; i++) days.push(dayKey(zonedToUtc(year, month, 1 - lead + i, 12, 0, tz), tz));
  const from = zonedToUtc(year, month, 1 - lead, 0, 0, tz).toISOString();
  const to = zonedToUtc(year, month, 1 - lead + 42, 0, 0, tz).toISOString();

  const rows = all<{ id: number; video_id: number; title: string; platform: Platform; status: PostStatus; at: string; color: number; project_id: number }>(
    `SELECT p.id, p.video_id, v.title, p.platform, p.status, COALESCE(p.published_at, p.scheduled_at) AS at, pr.color, pr.id AS project_id
       FROM posts p JOIN videos v ON v.id = p.video_id JOIN projects pr ON pr.id = v.project_id
      WHERE pr.archived = 0 AND p.status != 'canceled' ${scope ? 'AND pr.id = ?' : ''}
        AND COALESCE(p.published_at, p.scheduled_at) >= ? AND COALESCE(p.published_at, p.scheduled_at) < ?
      ORDER BY at`,
    ...(scope ? [scope.id] : []),
    from,
    to,
  );

  // One chip per video per slot; platforms listed inside.
  const items = new Map<string, CalItem>();
  for (const r of rows) {
    const minute = r.at.slice(0, 16);
    const key = `${r.video_id}:${r.status === 'published' ? dayKey(r.at, tz) : minute}`;
    const cur = items.get(key);
    const timeStr = new Intl.DateTimeFormat('ru-RU', { timeZone: tz, hour: '2-digit', minute: '2-digit' }).format(new Date(r.at));
    if (cur) {
      if (!cur.platforms.includes(r.platform)) cur.platforms.push(r.platform);
      if (r.status === 'failed') cur.status = 'failed';
      if (r.status === 'scheduled' && cur.status === 'published') cur.status = 'scheduled';
    } else {
      items.set(key, { postId: r.id, videoId: r.video_id, title: r.title, day: dayKey(r.at, tz), time: timeStr, platforms: [r.platform], status: r.status, color: r.color });
    }
  }

  // Free posting slots for the selected project (future days only).
  const slots: SlotMark[] = [];
  if (scope) {
    const today = dayKey(new Date(), tz);
    const ps = projectSlots(scope);
    for (const d of days) {
      if (d < today) continue;
      const [y, mo, dd] = d.split('-').map(Number);
      const wd = zonedParts(zonedToUtc(y, mo, dd, 12, 0, tz), tz).wd;
      for (const s of ps.filter((x) => x.d === wd)) {
        const taken = [...items.values()].some((it) => it.day === d);
        if (!taken) slots.push({ day: d, time: s.t });
      }
    }
  }

  const ready = all<{ id: number; title: string; color: number; thumb_name: string | null; duration: number; project_name: string }>(
    `SELECT v.id, v.title, pr.color, v.thumb_name, v.duration, pr.name AS project_name FROM videos v JOIN projects pr ON pr.id = v.project_id
      WHERE pr.archived = 0 AND v.stage = 'ready' ${scope ? 'AND pr.id = ?' : ''}
        AND NOT EXISTS (SELECT 1 FROM posts p WHERE p.video_id = v.id AND p.status != 'canceled')
      ORDER BY v.created_at`,
    ...(scope ? [scope.id] : []),
  );

  const projects: Project[] = scope ? [scope] : all<Project>('SELECT * FROM projects WHERE archived = 0');
  const prev = month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, '0')}`;
  const next = month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, '0')}`;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Календарь</h1>
          <p>
            Перетащите запланированный ролик на другой день — время сохранится.{' '}
            {scope ? 'Пунктиром показаны свободные слоты очереди проекта.' : 'Выберите проект вверху, чтобы увидеть свободные слоты.'}
          </p>
        </div>
        <div className="row">
          <Link href={`/calendar?month=${prev}`} className="btn btn-icon" aria-label="Предыдущий месяц">
            ‹
          </Link>
          <strong style={{ minWidth: 130, textAlign: 'center' }}>
            {MONTHS[month - 1]} {year}
          </strong>
          <Link href={`/calendar?month=${next}`} className="btn btn-icon" aria-label="Следующий месяц">
            ›
          </Link>
          <Link href="/calendar" className="btn btn-sm">
            Сегодня
          </Link>
        </div>
      </div>
      <div className="grid-calendar">
        <div className="card" style={{ overflow: 'hidden' }}>
          <CalendarGrid days={days} month={`${year}-${String(month).padStart(2, '0')}`} today={dayKey(new Date(), tz)} items={[...items.values()]} slots={slots} />
        </div>
        <aside className="stack">
          <div className="card">
            <div className="card-head">
              <h2>Готовы к публикации</h2>
              <span className="chip">{ready.length}</span>
            </div>
            <div className="card-body stack" style={{ gap: 10 }}>
              {ready.length ? (
                ready.map((v) => (
                  <div key={v.id} className="row" style={{ flexWrap: 'nowrap', gap: 10 }}>
                    <Thumb thumb={v.thumb_name} title={v.title} color={v.color} width={26} />
                    <Link href={`/content/${v.id}`} style={{ minWidth: 0, flex: 1 }}>
                      <span className="ellipsis" style={{ display: 'block', fontWeight: 550, fontSize: 13 }}>
                        {v.title}
                      </span>
                      <span className="small muted">{scope ? fmtDuration(v.duration) : v.project_name}</span>
                    </Link>
                    <QueueButton videoId={v.id} />
                  </div>
                ))
              ) : (
                <div className="muted small">
                  Запаса нет. Загрузите новые ролики или переведите карточки из «Съёмки» в «Готово».
                </div>
              )}
            </div>
          </div>
          <div className="card card-pad stack-sm small">
            <h2 style={{ marginBottom: 4 }}>План по неделям</h2>
            {projects.map((p) => (
              <div key={p.id} className="spread">
                <span className="row" style={{ gap: 6 }}>
                  <span className="dot" style={{ background: `var(--s${(p.color % 8) + 1})` }} />
                  {p.name}
                </span>
                <span className="muted">{p.posts_per_week} в неделю</span>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </>
  );
}
