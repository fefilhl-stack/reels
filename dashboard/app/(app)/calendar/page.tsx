import Link from 'next/link';
import { all } from '@/lib/db';
import { ruDate } from '@/lib/plan';
import { today } from '@/lib/planner';
import { getScope } from '@/lib/scope';
import { appTz, dayKey, zonedParts, zonedToUtc } from '@/lib/time';
import type { Platform, PostStatus, Project, ScriptStatus } from '@/lib/types';
import { Thumb } from '@/components/ui';
import { CalendarGrid, type CalItem } from './CalendarGrid';

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

  const scripts = all<{ id: number; number: number; title: string; plan_date: string; plan_time: string | null; status: ScriptStatus; file_name: string | null; color: number; project_name: string }>(
    `SELECT v.id, v.number, v.title, v.plan_date, v.plan_time, v.status, v.file_name, pr.color, pr.name AS project_name
       FROM videos v JOIN projects pr ON pr.id = v.project_id
      WHERE pr.archived = 0 AND v.plan_date BETWEEN ? AND ? ${scope ? 'AND pr.id = ?' : ''}
      ORDER BY v.plan_date, v.plan_time`,
    days[0],
    days[days.length - 1],
    ...(scope ? [scope.id] : []),
  );
  const posts = all<{ video_id: number; platform: Platform; status: PostStatus }>(
    `SELECT p.video_id, p.platform, p.status FROM posts p JOIN videos v ON v.id = p.video_id
      WHERE p.status != 'canceled' AND v.plan_date BETWEEN ? AND ?`,
    days[0],
    days[days.length - 1],
  );
  const items: CalItem[] = scripts.map((s) => {
    const ps = posts.filter((p) => p.video_id === s.id);
    const state: CalItem['state'] = ps.some((p) => p.status === 'published')
      ? 'published'
      : ps.some((p) => p.status === 'failed')
        ? 'failed'
        : ps.length
          ? 'scheduled'
          : s.file_name
            ? 'ready'
            : 'empty';
    return {
      id: s.id,
      number: s.number,
      title: s.title,
      day: s.plan_date,
      time: s.plan_time ?? '',
      status: s.status,
      state,
      platforms: [...new Set(ps.map((p) => p.platform))],
      color: s.color,
      project: s.project_name,
    };
  });

  // Next 7 days without a video — what to film and edit first.
  const t = today();
  const missing = all<{ id: number; number: number; title: string; plan_date: string; plan_time: string | null; color: number; thumb_name: string | null; project_name: string }>(
    `SELECT v.id, v.number, v.title, v.plan_date, v.plan_time, pr.color, v.thumb_name, pr.name AS project_name
       FROM videos v JOIN projects pr ON pr.id = v.project_id
      WHERE pr.archived = 0 AND v.file_name IS NULL AND v.status != 'Опубликован' AND v.number > 0
        AND v.plan_date >= ? AND v.plan_date <= date(?, '+7 day') ${scope ? 'AND pr.id = ?' : ''}
        AND NOT EXISTS (SELECT 1 FROM posts p WHERE p.video_id = v.id AND p.status != 'canceled')
      ORDER BY v.plan_date, v.plan_time LIMIT 20`,
    t,
    t,
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
          <p>Контент-план по датам. Перетащите сценарий на другой день — дата в плане и запланированные публикации изменятся вместе.</p>
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
      <div className="row small ink-2" style={{ gap: 14 }}>
        <span className="row" style={{ gap: 6 }}>
          <span className="cal-state" data-state="empty" /> нет ролика
        </span>
        <span className="row" style={{ gap: 6 }}>
          <span className="cal-state" data-state="ready" /> ролик загружен
        </span>
        <span className="row" style={{ gap: 6 }}>
          <span className="cal-state" data-state="scheduled" /> запланирован
        </span>
        <span className="row" style={{ gap: 6 }}>
          <span className="cal-state" data-state="published" /> опубликован
        </span>
        <span className="row" style={{ gap: 6 }}>
          <span className="cal-state" data-state="failed" /> ошибка
        </span>
      </div>
      <div className="grid-calendar">
        <div className="card" style={{ overflow: 'hidden' }}>
          <CalendarGrid days={days} month={`${year}-${String(month).padStart(2, '0')}`} today={t} items={items} multi={!scope && projects.length > 1} />
        </div>
        <aside className="stack">
          <div className="card">
            <div className="card-head">
              <div>
                <h2>Ближайшие без ролика</h2>
                <p>7 дней вперёд</p>
              </div>
              <span className="chip">{missing.length}</span>
            </div>
            <div className="card-body stack" style={{ gap: 10 }}>
              {missing.length ? (
                missing.map((v) => (
                  <Link key={v.id} href={`/content/${v.id}`} className="row" style={{ flexWrap: 'nowrap', gap: 10 }}>
                    <Thumb thumb={v.thumb_name} title={v.title} color={v.color} width={24} />
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span className="ellipsis" style={{ display: 'block', fontWeight: 550, fontSize: 13 }}>
                        №{v.number} {v.title}
                      </span>
                      <span className="small muted">
                        {ruDate(v.plan_date).slice(0, 5)}
                        {v.plan_time ? `, ${v.plan_time}` : ''}
                        {scope ? '' : ` · ${v.project_name}`}
                      </span>
                    </span>
                  </Link>
                ))
              ) : (
                <div className="muted small">На неделю вперёд все ролики загружены.</div>
              )}
            </div>
          </div>
          <div className="card card-pad stack-sm small">
            <h2 style={{ marginBottom: 4 }}>Расписание</h2>
            {projects.map((p) => (
              <div key={p.id} className="spread">
                <span className="row" style={{ gap: 6 }}>
                  <span className="dot" style={{ background: `var(--s${(p.color % 8) + 1})` }} />
                  {p.name}
                </span>
                <span className="muted">
                  {p.posts_per_week >= 7 ? 'каждый день' : `${p.posts_per_week} в неделю`}, {p.time_weekday}/{p.time_weekend}
                </span>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </>
  );
}
