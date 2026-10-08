import { all, nowIso, run, tx } from './db';
import { demoMetricsAt, demoModel, hash } from './platforms/demo';
import { appTz, DAY_MS, dayKey, zonedParts, zonedToUtc } from './time';
import type { Platform } from './types';

// Demo workspace: three projects with ~8 weeks of history, a content pipeline,
// scheduled posts and a failed upload. Patterns are baked in on purpose
// (a strong rubric, an evening time window, a sweet-spot duration) so the
// analytics and recommendations have something real to find.

interface DemoProject {
  name: string;
  color: number;
  description: string;
  audience: string;
  perWeek: number;
  goal: number;
  hashtags: string;
  footer: string;
  accounts: { platform: Platform; username: string; followers: number }[];
  rubrics: { name: string; mult: number; titles: [string, string][] }[];
  ideas: string[];
  hooks: string[];
  ctas: string[];
}

const PROJECTS: DemoProject[] = [
  {
    name: 'Деньги без паники',
    color: 0,
    description: 'Личные финансы простым языком: бюджет, подушка, первые инвестиции.',
    audience: '25–35 лет, первая стабильная работа, хотят перестать жить от зарплаты до зарплаты',
    perWeek: 4,
    goal: 60000,
    hashtags: '#финансы #деньги #бюджет #инвестиции',
    footer: 'Сохрани, чтобы не потерять. Больше разборов — в профиле.',
    accounts: [
      { platform: 'tiktok', username: 'dengi.bez.paniki', followers: 18400 },
      { platform: 'instagram', username: 'dengi_bez_paniki', followers: 9100 },
      { platform: 'youtube', username: 'DengiBezPaniki', followers: 6300 },
    ],
    rubrics: [
      {
        name: 'Ошибки с деньгами',
        mult: 1.9,
        titles: [
          ['Кредитка, которая съела мою зарплату', 'Я потерял 40 000 ₽ на одной галочке в договоре'],
          ['Ошибка, из-за которой нет подушки', 'Если откладываешь «что останется» — у тебя никогда ничего не останется'],
          ['Почему рассрочка дороже, чем кажется', 'Рассрочка 0 % — это не 0 %. Показываю на чеке'],
          ['Три подписки, которые вы забыли отменить', 'Проверь это прямо сейчас — у 8 из 10 есть хотя бы одна'],
          ['Ипотека: ошибка первого года', 'Банк не скажет вам про это в первый год ипотеки'],
          ['Кэшбэк, который делает вас беднее', 'Кэшбэк 5 % заставляет тратить на 30 % больше'],
          ['Вклад или накопительный: где теряют деньги', 'Держишь деньги на накопительном? Вот сколько ты теряешь'],
          ['Займ у друга: как испортить всё', 'Никогда не одалживай деньги так, как это делают все'],
        ],
      },
      {
        name: 'Лайфхак за 30 секунд',
        mult: 1.1,
        titles: [
          ['Правило 24 часов для покупок', 'Хочешь купить — подожди 24 часа. Вот что произойдёт'],
          ['Бюджет в заметках за 5 минут', 'Самый ленивый способ вести бюджет'],
          ['Как откладывать 10 % без боли', 'Отложи деньги до того, как их увидишь'],
          ['Конверты 2.0', 'Метод конвертов, но в банковском приложении'],
          ['Налоговый вычет за спорт', 'Государство вернёт тебе деньги за абонемент в зал'],
          ['Чек-лист перед крупной покупкой', 'Пять вопросов перед покупкой дороже 10 000 ₽'],
        ],
      },
      {
        name: 'Разбор подписчика',
        mult: 0.9,
        titles: [
          ['Зарплата 80 тысяч, а денег нет', 'Разбираю бюджет подписчицы: куда утекают 80 тысяч'],
          ['Разбор: долг 300 000 ₽', 'Как закрыть 300 тысяч долга за год без второй работы'],
          ['Семья из трёх: бюджет на месяц', 'Разбираю бюджет семьи из трёх человек'],
          ['Студент и 25 000 ₽ в месяц', 'Можно ли откладывать со стипендии и подработки'],
        ],
      },
      {
        name: 'Мифы об инвестициях',
        mult: 0.62,
        titles: [
          ['Миф: инвестировать нужно с миллиона', 'Нет, для старта не нужен миллион'],
          ['Миф: золото всегда растёт', 'Золото не всегда растёт. Вот график, который это доказывает'],
          ['Миф: акции — это казино', 'Акции — не казино, если не играть в казино'],
          ['Миф: облигации для пенсионеров', 'Облигации — это скучно? Посмотри на доходность'],
        ],
      },
    ],
    ideas: [
      'Как я считаю «стоимость часа» перед покупкой',
      'Сколько стоит завести собаку на самом деле',
      'Разбор: бюджет на отпуск без кредита',
      'Ошибка с вычетом за лечение',
      'ИИС третьего типа простыми словами',
      'Сколько нужно на подушку безопасности',
    ],
    hooks: [
      'Я потерял {сумма} на одной ошибке — проверь, не делаешь ли ты так же',
      'Банк не скажет вам про это',
      'Если ты делаешь {действие} — остановись',
      'Сохрани, пока не удалили',
    ],
    ctas: ['Сохрани, чтобы не потерять', 'Напиши в комментариях свою ситуацию — разберу', 'Подпишись: завтра часть 2'],
  },
  {
    name: 'Ужин за 15 минут',
    color: 1,
    description: 'Быстрые ужины из обычных продуктов, без сложной техники.',
    audience: 'Работающие люди 25–40, готовят вечером на себя или семью',
    perWeek: 5,
    goal: 120000,
    hashtags: '#рецепт #ужин #быстрыйужин #чтоприготовить',
    footer: 'Рецепт целиком — в описании профиля.',
    accounts: [
      { platform: 'tiktok', username: 'uzhin15', followers: 42000 },
      { platform: 'instagram', username: 'uzhin.za.15', followers: 27300 },
      { platform: 'youtube', username: 'Uzhin15min', followers: 11200 },
    ],
    rubrics: [
      {
        name: 'Из того, что в холодильнике',
        mult: 1.6,
        titles: [
          ['Ужин из трёх яиц и вчерашнего риса', 'Не выбрасывай вчерашний рис — сделай это'],
          ['Остатки курицы → тако', 'Из остатков курицы за 10 минут'],
          ['Паста из последнего помидора', 'Один помидор, паста и 12 минут'],
          ['Картошка, сыр, яйцо — и всё', 'Три продукта, которые есть у всех'],
          ['Лаваш, который спасёт вечер', 'Лаваш в холодильнике? Ужин готов'],
          ['Гречка, которую захочется доесть', 'Гречка может быть вкусной. Доказываю'],
          ['Шакшука из всего подряд', 'Шакшука, когда в холодильнике пусто'],
        ],
      },
      {
        name: 'Одна сковорода',
        mult: 1.15,
        titles: [
          ['Курица с овощами на одной сковороде', 'Одна сковорода — минимум посуды'],
          ['Сливочная паста без кастрюли', 'Паста варится прямо в соусе'],
          ['Фунчоза с овощами', 'Как в ресторане, но за 15 минут'],
          ['Омлет-ролл с начинкой', 'Омлет, который сворачивается как ролл'],
          ['Тефтели в томатном соусе', 'Тефтели без духовки'],
        ],
      },
      {
        name: 'Повторяю тренд',
        mult: 0.75,
        titles: [
          ['Тот самый огуречный салат', 'Проверяю салат, который набрал 50 млн'],
          ['Хлеб из двух ингредиентов', 'Повторяю тренд: хлеб из двух ингредиентов'],
          ['Запечённая фета с пастой', 'Тренд прошёл, а рецепт хороший'],
          ['Пицца на лаваше', 'Пицца без теста — проверяю тренд'],
        ],
      },
    ],
    ideas: [
      'Неделя ужинов на 2000 ₽',
      'Соусы, которые спасают любую курицу',
      'Ужин в микроволновке — честно',
      'Что приготовить из кабачка, кроме оладий',
    ],
    hooks: ['Не выбрасывай {продукт} — сделай это', 'Ужин, пока закипает чайник', 'Три продукта, которые есть у всех'],
    ctas: ['Сохрани на вечер', 'Какой продукт разобрать следующим? Пиши', 'Подпишись — завтра ещё ужин'],
  },
  {
    name: 'Английский в метро',
    color: 2,
    description: 'Короткие уроки английского, которые можно посмотреть между станциями.',
    audience: 'Взрослые 22–40, учили в школе, но не говорят',
    perWeek: 3,
    goal: 25000,
    hashtags: '#английский #english #английскийязык',
    footer: 'Повтори вслух три раза — так запомнится.',
    accounts: [
      { platform: 'tiktok', username: 'english.metro', followers: 7200 },
      { platform: 'youtube', username: 'EnglishMetro', followers: 3900 },
    ],
    rubrics: [
      {
        name: 'Ошибки русских',
        mult: 1.7,
        titles: [
          ['Never say «I am agree»', 'Эту ошибку делают 9 из 10 русских'],
          ['Почему нельзя говорить «open the light»', 'Не говори так в Лондоне'],
          ['«How do you do» — это не «как дела»', 'Ты неправильно понимаешь эту фразу'],
          ['Ошибка с «actual»', 'Actual не значит «актуальный»'],
          ['«Make a photo» — неправильно', 'Так говорят только русские'],
        ],
      },
      {
        name: 'Сленг из сериалов',
        mult: 1.15,
        titles: [
          ['Что значит «no cap»', 'Услышал в сериале и не понял? Объясняю'],
          ['«Spill the tea» — это не про чай', 'Это не про чай'],
          ['Сленг из «Друзей», который жив до сих пор', 'Эти фразы из «Друзей» говорят до сих пор'],
        ],
      },
      {
        name: 'Слово дня',
        mult: 0.8,
        titles: [
          ['Слово дня: serendipity', 'Слово, которого нет в русском'],
          ['Слово дня: procrastinate', 'Ты делаешь это прямо сейчас'],
          ['Слово дня: awkward', 'Самое неловкое слово'],
          ['Слово дня: cozy', 'Слово для осени'],
        ],
      },
    ],
    ideas: ['Фразовые глаголы с get за минуту', 'Как заказать кофе и не растеряться', 'British vs American: 5 слов'],
    hooks: ['Эту ошибку делают 9 из 10 русских', 'Не говори так в Лондоне', 'Ты неправильно понимаешь эту фразу'],
    ctas: ['Напиши пример в комментариях', 'Подпишись — новое слово каждый день'],
  },
];

const TIMES: [number, number][] = [
  [9, 0],
  [12, 30],
  [15, 0],
  [18, 30],
  [19, 30],
  [20, 30],
  [21, 30],
];
const DURATIONS = [11, 18, 23, 27, 34, 46, 58, 74, 95];

function timeMult(h: number) {
  if (h >= 18 && h < 21) return 1.4;
  if (h >= 21) return 1.1;
  if (h < 12) return 0.75;
  if (h < 15) return 0.9;
  return 1;
}
function durMult(s: number) {
  if (s < 15) return 1;
  if (s < 30) return 1.3;
  if (s < 60) return 0.95;
  return 0.7;
}
function pick<T>(list: T[], seed: string): T {
  return list[Math.floor(hash(seed) * list.length) % list.length];
}

export function hasDemo(): boolean {
  return all<{ n: number }>('SELECT COUNT(*) AS n FROM projects WHERE is_demo = 1')[0].n > 0;
}

export function clearDemo() {
  tx(() => {
    run('DELETE FROM projects WHERE is_demo = 1');
    run('DELETE FROM snippets WHERE is_demo = 1');
  });
}

export function loadDemo() {
  if (hasDemo()) return;
  const tz = appTz();
  const now = new Date();
  const nowMs = now.getTime();
  const created = nowIso();
  const HISTORY_DAYS = 56;
  const today = zonedParts(now, tz);

  tx(() => {
    PROJECTS.forEach((P, pi) => {
      const projectId = run(
        `INSERT INTO projects (name, color, description, audience, posts_per_week, followers_goal, goal_deadline, slots, hashtags, caption_footer, is_demo, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
        P.name,
        P.color,
        P.description,
        P.audience,
        P.perWeek,
        P.goal,
        new Date(nowMs + 120 * DAY_MS).toISOString().slice(0, 10),
        JSON.stringify(
          P.perWeek === 5
            ? [1, 2, 3, 4, 5].map((d) => ({ d, t: '19:00' }))
            : P.perWeek === 4
              ? [1, 3, 5, 6].map((d) => ({ d, t: d === 6 ? '12:00' : '19:30' }))
              : [2, 4, 6].map((d) => ({ d, t: '18:30' })),
        ),
        P.hashtags,
        P.footer,
        created,
      ).id;

      const rubricIds = P.rubrics.map((r) => run('INSERT INTO rubrics (project_id, name) VALUES (?, ?)', projectId, r.name).id);
      for (const h of P.hooks) run("INSERT INTO snippets (project_id, kind, text, is_demo) VALUES (?, 'hook', ?, 1)", projectId, h);
      for (const c of P.ctas) run("INSERT INTO snippets (project_id, kind, text, is_demo) VALUES (?, 'cta', ?, 1)", projectId, c);
      run("INSERT INTO snippets (project_id, kind, text, is_demo) VALUES (?, 'hashtags', ?, 1)", projectId, P.hashtags);

      const accounts = P.accounts.map((a, ai) => {
        const id = run(
          `INSERT INTO accounts (project_id, platform, external_id, username, display_name, access_token, followers, is_demo, created_at, last_synced_at)
           VALUES (?, ?, ?, ?, ?, 'demo', ?, 1, ?, ?)`,
          projectId,
          a.platform,
          `demo-${pi}-${ai}`,
          a.username,
          P.name,
          a.followers,
          created,
          created,
        ).id;
        // Followers history: steady growth with a little noise.
        for (let d = HISTORY_DAYS; d >= 0; d--) {
          const day = dayKey(new Date(nowMs - d * DAY_MS), tz);
          const f = Math.round(a.followers * (1 - 0.32 * (d / HISTORY_DAYS)) * (1 + (hash(`${id}:${d}`) - 0.5) * 0.004));
          run('INSERT OR REPLACE INTO account_snapshots (account_id, day, followers) VALUES (?, ?, ?)', id, day, d === 0 ? a.followers : f);
        }
        return { ...a, id };
      });

      // Published history: walk day by day and post on the project's cadence.
      const titles = P.rubrics.flatMap((r, ri) => r.titles.map(([title, hook]) => ({ title, hook, ri })));
      let t = 0;
      for (let d = HISTORY_DAYS; d >= 1; d--) {
        const dayStart = zonedToUtc(today.y, today.m, today.d - d, 0, 0, tz);
        const wd = zonedParts(new Date(dayStart.getTime() + 12 * 3_600_000), tz).wd;
        const chance = P.perWeek / 7;
        // Project 3 slacks off in the last 10 days to trigger the cadence insight.
        const slack = pi === 2 && d < 10 ? 0.35 : 1;
        if (hash(`${pi}:day:${d}`) > chance * slack * (wd === 7 ? 0.6 : 1.1)) continue;
        const item = titles[t % titles.length];
        const round = Math.floor(t / titles.length);
        t++;
        const [h, mi] = pick(TIMES, `${pi}:${d}:time`);
        const at = zonedToUtc(today.y, today.m, today.d - d, h, mi, tz);
        const duration = pick(DURATIONS, `${pi}:${d}:dur`);
        const rubric = P.rubrics[item.ri];
        const title = round ? `${item.title} — часть ${round + 1}` : item.title;
        const videoId = run(
          `INSERT INTO videos (project_id, rubric_id, title, stage, hook, caption, hashtags, duration, width, height, original_name, is_demo, created_at, updated_at)
           VALUES (?, ?, ?, 'ready', ?, ?, ?, ?, 1080, 1920, 'demo.mp4', 1, ?, ?)`,
          projectId,
          rubricIds[item.ri],
          title,
          item.hook,
          `${item.hook}\n\n${P.footer}`,
          P.hashtags,
          duration,
          new Date(at.getTime() - 3 * DAY_MS).toISOString(),
          created,
        ).id;
        const satWeekend = wd === 6 ? 0.85 : 1;
        const mult = rubric.mult * timeMult(h) * durMult(duration) * satWeekend;
        for (const a of accounts) {
          if (a.platform === 'instagram' && hash(`${videoId}:ig`) > 0.85) continue;
          if (a.platform === 'youtube' && hash(`${videoId}:yt`) > 0.75) continue;
          const offset = a.platform === 'tiktok' ? 0 : a.platform === 'instagram' ? 25 : 50;
          const pub = new Date(at.getTime() + offset * 60_000);
          const model = demoModel(`v${videoId}:${a.platform}`, a.platform, mult, a.followers);
          const ageDays = (nowMs - pub.getTime()) / DAY_MS;
          const m = demoMetricsAt(model, ageDays);
          const postId = run(
            `INSERT INTO posts (video_id, account_id, platform, status, scheduled_at, published_at, title, caption, options, external_id, state,
               views, likes, comments, shares, saves, avg_view_pct, metrics_at, is_demo, created_at, updated_at)
             VALUES (?, ?, ?, 'published', ?, ?, ?, ?, '{}', ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
            videoId,
            a.id,
            a.platform,
            pub.toISOString(),
            pub.toISOString(),
            title,
            `${item.hook}\n\n${P.footer}\n\n${P.hashtags}`,
            null,
            JSON.stringify({ demo: model }),
            m.views,
            m.likes,
            m.comments,
            m.shares,
            m.saves,
            m.avgViewPct ?? null,
            created,
            created,
            created,
          ).id;
          run('UPDATE posts SET external_id = ? WHERE id = ?', `demo_${postId}`, postId);
          const marks = [1 / 24, 3 / 24, 6 / 24, 12 / 24];
          for (let k = 1; k <= Math.floor(ageDays); k++) marks.push(k);
          for (const mk of marks) {
            if (mk > ageDays) continue;
            const s = demoMetricsAt(model, mk);
            run(
              'INSERT OR IGNORE INTO post_snapshots (post_id, at, views, likes, comments, shares, saves) VALUES (?, ?, ?, ?, ?, ?, ?)',
              postId,
              new Date(pub.getTime() + mk * DAY_MS).toISOString(),
              s.views,
              s.likes,
              s.comments,
              s.shares,
              s.saves,
            );
          }
        }
      }

      // Pipeline: ideas, scripts, production, ready.
      const stageOf = (i: number) => (i < 2 ? 'script' : i < 3 ? 'production' : 'ready');
      const leftovers = Array.from({ length: pi === 2 ? 3 : 6 }, (_, i) => titles[(t + i) % titles.length]);
      leftovers.forEach((item, i) => {
        const stage = pi === 2 ? (i === 0 ? 'script' : 'production') : stageOf(i);
        run(
          `INSERT INTO videos (project_id, rubric_id, title, stage, hook, script, caption, hashtags, duration, width, height, original_name, is_demo, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1080, 1920, ?, 1, ?, ?)`,
          projectId,
          rubricIds[item.ri],
          `${item.title} (новая версия)`,
          stage,
          item.hook,
          stage === 'script' || stage === 'production' ? `0–3 с: ${item.hook}\n3–20 с: суть, один пример\n20–30 с: вывод + призыв` : '',
          stage === 'ready' ? `${item.hook}\n\n${P.footer}` : '',
          P.hashtags,
          stage === 'ready' ? pick(DURATIONS.slice(1, 5), `${pi}:${i}:rd`) : 0,
          stage === 'ready' ? 'demo.mp4' : '',
          created,
          created,
        );
      });
      for (const idea of P.ideas) {
        run(
          `INSERT INTO videos (project_id, title, stage, is_demo, created_at, updated_at) VALUES (?, ?, 'idea', 1, ?, ?)`,
          projectId,
          idea,
          created,
          created,
        );
      }

      // Upcoming: a couple of scheduled posts (the worker publishes them when due) and one failed upload.
      if (pi < 2) {
        const ready = all<{ id: number; title: string; hook: string }>(
          "SELECT id, title, hook FROM videos WHERE project_id = ? AND stage = 'ready' AND NOT EXISTS (SELECT 1 FROM posts WHERE video_id = videos.id) ORDER BY id LIMIT 2",
          projectId,
        );
        ready.forEach((v, i) => {
          const at = zonedToUtc(today.y, today.m, today.d + 1 + i * 2, 19, 0, tz);
          for (const a of accounts) {
            run(
              `INSERT INTO posts (video_id, account_id, platform, status, scheduled_at, title, caption, options, is_demo, created_at, updated_at)
               VALUES (?, ?, ?, 'scheduled', ?, ?, ?, ?, 1, ?, ?)`,
              v.id,
              a.id,
              a.platform,
              at.toISOString(),
              v.title,
              `${v.hook}\n\n${P.footer}\n\n${P.hashtags}`,
              JSON.stringify(a.platform === 'tiktok' ? { privacy: 'PUBLIC_TO_EVERYONE' } : a.platform === 'youtube' ? { privacy: 'public' } : { shareToFeed: true }),
              created,
              created,
            );
          }
        });
      }
      if (pi === 1) {
        const v = all<{ id: number; title: string }>(
          "SELECT id, title FROM videos WHERE project_id = ? AND stage = 'ready' AND NOT EXISTS (SELECT 1 FROM posts WHERE video_id = videos.id) LIMIT 1",
          projectId,
        )[0];
        const ig = accounts.find((a) => a.platform === 'instagram');
        if (v && ig) {
          run(
            `INSERT INTO posts (video_id, account_id, platform, status, scheduled_at, title, caption, options, attempts, last_error, is_demo, created_at, updated_at)
             VALUES (?, ?, 'instagram', 'failed', ?, ?, '', '{}', 3, ?, 1, ?, ?)`,
            v.id,
            ig.id,
            new Date(nowMs - 20 * 3_600_000).toISOString(),
            v.title,
            'Instagram не обработал видео: ERROR. Проверьте формат: MP4/MOV, H.264, 9:16, 3 с – 15 мин. (демо)',
            created,
            created,
          );
        }
      }
    });
  });
}
