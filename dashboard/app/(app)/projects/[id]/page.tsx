import Link from 'next/link';
import { notFound } from 'next/navigation';
import { addRubric, addSnippet, updateProject } from '@/app/actions';
import { bestSlot, groupStats, HOUR_BUCKETS, loadFacts, postingHeatmap } from '@/lib/analytics';
import { all, get } from '@/lib/db';
import { fmtMultiple, fmtNum, fmtPct } from '@/lib/format';
import { ruDate } from '@/lib/plan';
import { weekdayShort } from '@/lib/time';
import { PLATFORMS, STATUSES, type Account, type Project, type Rubric, type Snippet } from '@/lib/types';
import { PlatformTag, projectColor } from '@/components/ui';
import { ArchiveButton, DeleteRubric, DeleteSnippet } from './ProjectButtons';

export const metadata = { title: 'Паспорт проекта' };

const COLORS = ['Синий', 'Оранжевый', 'Бирюзовый', 'Жёлтый', 'Розовый', 'Зелёный', 'Фиолетовый', 'Красный'];
const KIND_LABEL: Record<Snippet['kind'], string> = { hook: 'Хуки', cta: 'Призывы', hashtags: 'Наборы хэштегов' };

function Area({ name, label, value, rows = 2, hint, placeholder }: { name: string; label: string; value: string; rows?: number; hint?: string; placeholder?: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      <textarea className="textarea" name={name} rows={rows} defaultValue={value} placeholder={placeholder} style={{ minHeight: 0 }} />
      {hint && <span className="hint">{hint}</span>}
    </label>
  );
}

function Line({ name, label, value, placeholder, type = 'text' }: { name: string; label: string; value: string; placeholder?: string; type?: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input className="input" name={name} type={type} defaultValue={value} placeholder={placeholder} />
    </label>
  );
}

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const p = get<Project>('SELECT * FROM projects WHERE id = ?', id);
  if (!p) notFound();
  const rubrics = all<Rubric>('SELECT * FROM rubrics WHERE project_id = ? ORDER BY name', id);
  const snippets = all<Snippet>('SELECT * FROM snippets WHERE project_id = ? ORDER BY kind, id', id);
  const accounts = all<Account>('SELECT * FROM accounts WHERE project_id = ? ORDER BY platform', id);
  const facts = loadFacts(id).facts;
  const rubricStats = groupStats(facts, (f) => (f.rubricId ? String(f.rubricId) : null), (f) => f.rubric ?? '');
  const best = bestSlot(postingHeatmap(facts));
  const followers = accounts.reduce((s, a) => s + a.followers, 0);
  const goalPct = p.followers_goal ? Math.min(1, followers / p.followers_goal) : 0;
  const plan = all<{ status: string; n: number }>('SELECT status, COUNT(*) AS n FROM videos WHERE project_id = ? AND number > 0 GROUP BY status', id);
  const total = plan.reduce((s, x) => s + x.n, 0);
  const byStatus = (s: string) => plan.find((x) => x.status === s)?.n ?? 0;
  const lastDate = get<{ d: string | null }>('SELECT MAX(plan_date) AS d FROM videos WHERE project_id = ? AND number > 0', id)?.d ?? null;
  const rubricCounts = all<{ rubric_id: number | null; n: number }>('SELECT rubric_id, COUNT(*) AS n FROM videos WHERE project_id = ? AND number > 0 GROUP BY rubric_id', id);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="row small muted" style={{ marginBottom: 6 }}>
            <Link href="/projects" className="link">
              Проекты
            </Link>
            <span>/</span>
            <span>Паспорт</span>
          </div>
          <h1 className="row" style={{ gap: 10 }}>
            <span className="dot" style={{ width: 12, height: 12, background: projectColor(p.color) }} />
            {p.name}
          </h1>
        </div>
        <div className="row">
          <Link href={`/content?p=${id}`} className="btn btn-primary">
            Контент-план
          </Link>
          <ArchiveButton id={id} />
        </div>
      </div>

      <div className="grid-main">
        <form action={updateProject.bind(null, id)} className="card">
          <div className="card-head">
            <div>
              <h2>Паспорт проекта</h2>
              <p>Как лист «Проекты» в таблице. Из него считаются даты плана, проверяются норма слов и длина роликов, по нему пишет ИИ.</p>
            </div>
          </div>
          <div className="card-body stack">
            <div className="grid-2">
              <Line name="name" label="Название" value={p.name} />
              <label className="field">
                <span>Цвет на графиках</span>
                <select className="select" name="color" defaultValue={p.color}>
                  {COLORS.map((c, i) => (
                    <option key={i} value={i}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <Area name="description" label="Тема аккаунта" value={p.description} rows={1} />
            <Area name="promise" label="Обещание зрителю" value={p.promise} />
            <Area name="goal_text" label="Цель" value={p.goal_text} rows={1} />
            <Area name="audience" label="Аудитория" value={p.audience} />

            <hr className="divider" />
            <div className="grid-2">
              <Area name="format" label="Формат" value={p.format} rows={2} placeholder="Закадровый голос, субтитры" />
              <Line name="address_form" label="Обращение" value={p.address_form} placeholder="На «ты» / на «вы»" />
              <Line name="video_length" label="Длина ролика" value={p.video_length} placeholder="40–60 секунд" />
              <Line name="words_norm" label="Норма слов" value={p.words_norm} placeholder="100–120" />
            </div>

            <hr className="divider" />
            <div className="grid-2">
              <Line name="frequency" label="Частота" value={p.frequency} placeholder="Один ролик в день" />
              <label className="field">
                <span>Роликов в неделю (для дат плана)</span>
                <input className="input" type="number" name="posts_per_week" min={1} max={7} defaultValue={p.posts_per_week} />
              </label>
              <Line name="start_date" label="Дата старта" value={p.start_date ?? ''} type="date" />
              <div className="grid-2" style={{ gap: 8 }}>
                <Line name="time_weekday" label="Время в будни" value={p.time_weekday} type="time" />
                <Line name="time_weekend" label="Время в выходные" value={p.time_weekend} type="time" />
              </div>
            </div>
            <label className="check">
              <input type="checkbox" name="recompute" />
              <span>
                Пересчитать даты всех сценариев от даты старта
                <span className="hint" style={{ display: 'block' }}>
                  Как формулы в таблице: №1 — дата старта, каждый следующий — в следующий день публикации; запланированные публикации переедут вместе с датами.
                </span>
              </span>
            </label>

            <hr className="divider" />
            <Area
              name="rubrics_text"
              label="Рубрики"
              value={p.rubrics_text}
              rows={2}
              hint="Доли в скобках, например «Ошибки с прогрессом (25%)», попадут в аналитику: план по рубрикам против факта."
            />
            <Area name="ctas" label="Призывы" value={p.ctas} rows={1} hint="Через запятую — станут подсказками в столбце «Призыв»." />
            <Area name="facts" label="На чём основаны факты" value={p.facts} rows={3} />
            <Area name="exclusions" label="Чего в роликах нет" value={p.exclusions} />
            <Area name="specialist" label="Где нужна фраза о специалисте" value={p.specialist} />
            <Area name="open_questions" label="Открытые вопросы" value={p.open_questions} />
            <Area name="checks" label="Что проверить перед публикацией" value={p.checks} />

            <hr className="divider" />
            <div className="grid-2">
              <Line name="hashtags" label="Хэштеги проекта (добавляются к подписи)" value={p.hashtags} placeholder="#ниша #тема" />
              <Line name="caption_footer" label="Приписка в конце подписи" value={p.caption_footer} placeholder="необязательно" />
              <label className="field">
                <span>Цель по подписчикам</span>
                <input className="input" type="number" name="followers_goal" min={0} defaultValue={p.followers_goal ?? ''} placeholder="например, 50000" />
              </label>
              <Line name="goal_deadline" label="Срок цели" value={p.goal_deadline ?? ''} type="date" />
            </div>
            <div>
              <button className="btn btn-primary">Сохранить паспорт</button>
            </div>
          </div>
        </form>

        <div className="stack">
          <section className="card card-pad stack-sm">
            <h2>План</h2>
            <div className="spread small">
              <span className="muted">Сценариев в плане</span>
              <b>{total}</b>
            </div>
            {STATUSES.map((s) => (
              <div key={s} className="spread small">
                <span className="muted">{s}</span>
                <span>{byStatus(s)}</span>
              </div>
            ))}
            <div className="spread small">
              <span className="muted">Даты</span>
              <span>
                {p.start_date ? `с ${ruDate(p.start_date)}` : 'старт не задан'}
                {lastDate ? ` по ${ruDate(lastDate)}` : ''}
              </span>
            </div>
            {best && (
              <span className="hint">
                По статистике лучшее окно — {weekdayShort(best.wd)}, {HOUR_BUCKETS[best.bucket]} ч ({fmtMultiple(best.score)} от обычного).
              </span>
            )}
          </section>

          <section className="card card-pad stack-sm">
            <h2>Цель по подписчикам</h2>
            {p.followers_goal ? (
              <>
                <div className="tile-value">
                  {fmtNum(followers)} <span className="muted" style={{ fontSize: 15, fontWeight: 500 }}>из {fmtNum(p.followers_goal)}</span>
                </div>
                <div className="meter">
                  <span style={{ width: `${goalPct * 100}%` }} />
                </div>
                {p.goal_deadline && <span className="small muted">до {ruDate(p.goal_deadline)}</span>}
              </>
            ) : (
              <span className="small muted">Задайте цель — на обзоре появится контроль темпа роста.</span>
            )}
          </section>

          <section className="card">
            <div className="card-head">
              <h2>Аккаунты</h2>
              <Link href="/accounts" className="btn btn-sm">
                Управлять
              </Link>
            </div>
            <div className="card-body stack-sm">
              {PLATFORMS.map((pl) => {
                const list = accounts.filter((a) => a.platform === pl);
                return (
                  <div key={pl} className="spread small">
                    <PlatformTag platform={pl} />
                    <span className={list.length ? '' : 'muted'}>{list.length ? list.map((a) => `@${a.username}`).join(', ') : 'не подключён'}</span>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="card">
            <div className="card-head">
              <div>
                <h2>Рубрики</h2>
                <p>Доля в плане и результат опубликованных</p>
              </div>
            </div>
            <div className="card-body stack-sm">
              {rubrics.map((r) => {
                const st = rubricStats.find((x) => x.key === String(r.id));
                const count = rubricCounts.find((x) => x.rubric_id === r.id)?.n ?? 0;
                return (
                  <div key={r.id} className="spread small">
                    <span>
                      {r.name}
                      {r.share != null && <span className="muted"> · план {fmtPct(r.share, 0)}</span>}
                    </span>
                    <span className="row" style={{ gap: 8 }}>
                      <span className="muted">
                        {count} сцен.{total ? ` (${fmtPct(count / total, 0)})` : ''}
                        {st ? ` · ${fmtMultiple(st.medianScore)}` : ''}
                      </span>
                      <DeleteRubric id={r.id} />
                    </span>
                  </div>
                );
              })}
              <form action={addRubric.bind(null, id)} className="row" style={{ flexWrap: 'nowrap', marginTop: 6 }}>
                <input className="input" name="name" placeholder="Новая рубрика" required />
                <button className="btn">Добавить</button>
              </form>
            </div>
          </section>

          <section className="card">
            <div className="card-head">
              <div>
                <h2>Шаблоны</h2>
                <p>Подставляются в сценарий одним кликом</p>
              </div>
            </div>
            <div className="card-body stack">
              {(['hook', 'cta', 'hashtags'] as const).map((k) => (
                <div key={k} className="stack-sm">
                  <span className="label">{KIND_LABEL[k]}</span>
                  {snippets
                    .filter((s) => s.kind === k)
                    .map((s) => (
                      <div key={s.id} className="spread small">
                        <span style={{ minWidth: 0 }} className="ellipsis">
                          {s.text}
                        </span>
                        <DeleteSnippet id={s.id} />
                      </div>
                    ))}
                </div>
              ))}
              <form action={addSnippet.bind(null, id)} className="stack-sm">
                <div className="row" style={{ flexWrap: 'nowrap' }}>
                  <select className="select" name="kind" style={{ width: 150 }}>
                    <option value="hook">Хук</option>
                    <option value="cta">Призыв</option>
                    <option value="hashtags">Хэштеги</option>
                  </select>
                  <input className="input" name="text" placeholder="Текст шаблона" required />
                </div>
                <button className="btn" style={{ justifySelf: 'start' }}>
                  Добавить шаблон
                </button>
              </form>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
