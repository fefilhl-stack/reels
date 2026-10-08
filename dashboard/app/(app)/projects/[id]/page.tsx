import Link from 'next/link';
import { notFound } from 'next/navigation';
import { addRubric, addSnippet, updateProject } from '@/app/actions';
import { bestSlot, groupStats, loadFacts, postingHeatmap, HOUR_BUCKETS } from '@/lib/analytics';
import { all, get } from '@/lib/db';
import { fmtMultiple, fmtNum } from '@/lib/format';
import { projectSlots } from '@/lib/slots';
import { weekdayShort } from '@/lib/time';
import { PLATFORMS, type Account, type Project, type Rubric, type Snippet } from '@/lib/types';
import { PlatformTag, projectColor } from '@/components/ui';
import { ArchiveButton, DeleteRubric, DeleteSnippet } from './ProjectButtons';

export const metadata = { title: 'Проект' };

const COLORS = ['Синий', 'Оранжевый', 'Бирюзовый', 'Жёлтый', 'Розовый', 'Зелёный', 'Фиолетовый', 'Красный'];
const KIND_LABEL: Record<Snippet['kind'], string> = { hook: 'Хуки', cta: 'Призывы', hashtags: 'Наборы хештегов' };

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const p = get<Project>('SELECT * FROM projects WHERE id = ?', id);
  if (!p) notFound();
  const rubrics = all<Rubric>('SELECT * FROM rubrics WHERE project_id = ? ORDER BY name', id);
  const snippets = all<Snippet>('SELECT * FROM snippets WHERE project_id = ? ORDER BY kind, id', id);
  const accounts = all<Account>('SELECT * FROM accounts WHERE project_id = ? ORDER BY platform', id);
  const facts = loadFacts(id).facts;
  const rubricStats = groupStats(facts, (f) => (f.rubricId ? String(f.rubricId) : null), (f) => f.rubric ?? '');
  const slots = projectSlots(p);
  const best = bestSlot(postingHeatmap(facts));
  const followers = accounts.reduce((s, a) => s + a.followers, 0);
  const goalPct = p.followers_goal ? Math.min(1, followers / p.followers_goal) : 0;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="row small muted" style={{ marginBottom: 6 }}>
            <Link href="/projects" className="link">
              Проекты
            </Link>
          </div>
          <h1 className="row" style={{ gap: 10 }}>
            <span className="dot" style={{ width: 12, height: 12, background: projectColor(p.color) }} />
            {p.name}
          </h1>
        </div>
        <ArchiveButton id={id} />
      </div>

      <div className="grid-main">
        <form action={updateProject.bind(null, id)} className="card">
          <div className="card-head">
            <h2>Настройки</h2>
          </div>
          <div className="card-body stack">
            <div className="grid-2">
              <label className="field">
                <span>Название</span>
                <input className="input" name="name" defaultValue={p.name} required />
              </label>
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
            <label className="field">
              <span>О проекте</span>
              <textarea className="textarea" name="description" rows={2} defaultValue={p.description} placeholder="Тема, позиционирование, продукт" />
            </label>
            <label className="field">
              <span>Аудитория</span>
              <textarea className="textarea" name="audience" rows={2} defaultValue={p.audience} placeholder="Кто смотрит, какие у них боли и желания" />
              <span className="hint">Используется ИИ-помощником, чтобы писать подписи и идеи под ваших зрителей.</span>
            </label>
            <div className="grid-2">
              <label className="field">
                <span>Роликов в неделю (план)</span>
                <input className="input" type="number" name="posts_per_week" min={1} max={21} defaultValue={p.posts_per_week} />
              </label>
              <div />
              <label className="field">
                <span>Цель по подписчикам</span>
                <input className="input" type="number" name="followers_goal" min={0} defaultValue={p.followers_goal ?? ''} placeholder="например, 50000" />
              </label>
              <label className="field">
                <span>Срок цели</span>
                <input className="input" type="date" name="goal_deadline" defaultValue={p.goal_deadline ?? ''} />
              </label>
            </div>
            <div className="field">
              <span className="label">Слоты очереди</span>
              <span className="hint">Время через запятую. Кнопка «В очередь» ставит ролик в ближайший свободный слот.</span>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 6 }}>
                {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                  <label key={d} className="field">
                    <span>{weekdayShort(d)}</span>
                    <input
                      className="input"
                      name={`slot_${d}`}
                      placeholder="—"
                      defaultValue={slots
                        .filter((s) => s.d === d)
                        .map((s) => s.t)
                        .join(', ')}
                    />
                  </label>
                ))}
              </div>
              {best && (
                <span className="hint">
                  По статистике лучшее окно — {weekdayShort(best.wd)}, {HOUR_BUCKETS[best.bucket]} ч ({fmtMultiple(best.score)} от обычного).
                </span>
              )}
            </div>
            <label className="field">
              <span>Хештеги проекта</span>
              <input className="input" name="hashtags" defaultValue={p.hashtags} placeholder="#ниша #тема" />
            </label>
            <label className="field">
              <span>Призыв в конце подписи</span>
              <input className="input" name="caption_footer" defaultValue={p.caption_footer} placeholder="Сохрани, чтобы не потерять" />
            </label>
            <div>
              <button className="btn btn-primary">Сохранить</button>
            </div>
          </div>
        </form>

        <div className="stack">
          <section className="card card-pad stack-sm">
            <h2>Цель</h2>
            {p.followers_goal ? (
              <>
                <div className="tile-value">
                  {fmtNum(followers)} <span className="muted" style={{ fontSize: 15, fontWeight: 500 }}>из {fmtNum(p.followers_goal)}</span>
                </div>
                <div className="meter">
                  <span style={{ width: `${goalPct * 100}%` }} />
                </div>
                {p.goal_deadline && <span className="small muted">до {new Date(p.goal_deadline).toLocaleDateString('ru-RU')}</span>}
              </>
            ) : (
              <span className="small muted">Задайте цель по подписчикам — на обзоре появится контроль темпа.</span>
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
                <p>Повторяющиеся форматы проекта</p>
              </div>
            </div>
            <div className="card-body stack-sm">
              {rubrics.map((r) => {
                const st = rubricStats.find((x) => x.key === String(r.id));
                return (
                  <div key={r.id} className="spread small">
                    <span>{r.name}</span>
                    <span className="row" style={{ gap: 8 }}>
                      {st && <span className="muted">{st.videos} рол. · {fmtMultiple(st.medianScore)}</span>}
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
                <p>Подставляются в карточке ролика одним кликом</p>
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
                    <option value="hashtags">Хештеги</option>
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
