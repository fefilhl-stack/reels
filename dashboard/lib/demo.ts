import { all, nowIso, run, tx } from './db';
import { countWords, planSequence, slotTimeFor } from './plan';
import { demoMetricsAt, demoModel, hash } from './platforms/demo';
import { appTz, DAY_MS, dayKey, parseLocal } from './time';
import type { Platform, ScriptStatus } from './types';

// Demo workspace in the shape of the Google Sheets template: three projects with
// passports and numbered content plans (date, time, rubric, topic, hook, cover, shot,
// voiceover, CTA, caption, hashtags, status). Past rows are published with stats;
// patterns are baked in on purpose (a strong rubric, an evening window, a word-count
// sweet spot, CTAs that work) so analytics and recommendations have something to find.

interface DemoProject {
  name: string;
  color: number;
  topic: string;
  promise: string;
  goal: string;
  audience: string;
  format: string;
  length: string;
  wordsNorm: string;
  frequency: string;
  perWeek: number;
  times: [string, string];
  address: string;
  ctasText: string;
  facts: string;
  exclusions: string;
  specialist: string;
  openQuestions: string;
  checks: string;
  followersGoal: number;
  hashtags: string;
  startDaysAgo: number;
  futureCount: number;
  accounts: { platform: Platform; username: string; followers: number }[];
  rubrics: { name: string; share: number; mult: number; titles: [string, string][] }[];
  body: string[];
  shots: string[];
  ctaLines: Record<string, string>;
  ideas: [string, string, number][];
  hooks: string[];
}

const PROJECTS: DemoProject[] = [
  {
    name: 'Деньги без паники',
    color: 0,
    topic: 'Личные финансы простым языком',
    promise: 'Как перестать жить от зарплаты до зарплаты без жёсткой экономии',
    goal: 'Подписчики, затем продажи гайда по бюджету',
    audience: '25–35 лет, первая стабильная работа, кредитка и отсутствие подушки',
    format: 'Закадровый голос, субтитры, графика с цифрами',
    length: '40–55 секунд',
    wordsNorm: '100–120',
    frequency: 'Один ролик в день',
    perWeek: 7,
    times: ['18:00', '17:00'],
    address: 'На «ты»',
    ctasText: 'Сохранить, отправить другу, написать в комментариях, подписаться',
    facts: 'Данные ЦБ РФ о ставках, условия банковских продуктов из открытых тарифов, расчёты автора',
    exclusions: 'Индивидуальных инвестиционных рекомендаций, названий конкретных банков и брокеров, обещаний дохода',
    specialist: 'Ролики про долги: фраза о финансовом консультанте',
    openQuestions: 'Делать ли рубрику с разборами подписчиков чаще?',
    checks: 'Ставки и лимиты сверить с актуальными тарифами в день публикации',
    followersGoal: 60000,
    hashtags: '#финансы #деньги #бюджет',
    startDaysAgo: 34,
    futureCount: 14,
    accounts: [
      { platform: 'tiktok', username: 'dengi.bez.paniki', followers: 18400 },
      { platform: 'instagram', username: 'dengi_bez_paniki', followers: 9100 },
      { platform: 'youtube', username: 'DengiBezPaniki', followers: 6300 },
    ],
    rubrics: [
      {
        name: 'Ошибки с деньгами',
        share: 0.35,
        mult: 1.9,
        titles: [
          ['Кредитка, которая съела зарплату', 'Я потерял сорок тысяч на одной галочке в договоре.'],
          ['Ошибка, из-за которой нет подушки', 'Если откладываешь «что останется», у тебя ничего не останется.'],
          ['Почему рассрочка дороже, чем кажется', 'Рассрочка ноль процентов — это не ноль процентов.'],
          ['Подписки, которые ты забыл отменить', 'Проверь это прямо сейчас — у восьми из десяти есть хотя бы одна.'],
          ['Кэшбэк, который делает беднее', 'Кэшбэк пять процентов заставляет тратить больше.'],
          ['Где теряют деньги на накопительном счёте', 'Держишь деньги на накопительном? Вот сколько ты теряешь.'],
        ],
      },
      {
        name: 'Лайфхак за 30 секунд',
        share: 0.3,
        mult: 1.1,
        titles: [
          ['Правило 24 часов для покупок', 'Хочешь купить — подожди сутки. Вот что произойдёт.'],
          ['Бюджет в заметках за 5 минут', 'Самый ленивый способ вести бюджет.'],
          ['Как откладывать 10% без боли', 'Отложи деньги до того, как их увидишь.'],
          ['Конверты в банковском приложении', 'Метод конвертов, но без конвертов.'],
          ['Чек-лист перед крупной покупкой', 'Пять вопросов перед покупкой дороже десяти тысяч.'],
        ],
      },
      {
        name: 'Разбор подписчика',
        share: 0.2,
        mult: 0.9,
        titles: [
          ['Зарплата 80 тысяч, а денег нет', 'Разбираю бюджет подписчицы: куда утекают восемьдесят тысяч.'],
          ['Долг 300 тысяч за год', 'Как закрыть триста тысяч долга без второй работы.'],
          ['Бюджет семьи из трёх', 'Разбираю бюджет семьи из трёх человек.'],
        ],
      },
      {
        name: 'Мифы',
        share: 0.15,
        mult: 0.62,
        titles: [
          ['Миф: копить нужно с большой зарплаты', 'Нет, для старта не нужна большая зарплата.'],
          ['Миф: кредитка — это всегда плохо', 'Кредитка не враг, если знать одно правило.'],
          ['Миф: бюджет — это скучно', 'Бюджет — это не таблица на сорок строк.'],
        ],
      },
    ],
    body: [
      'Вот что происходит на самом деле.',
      'Посчитаем на простом примере с зарплатой в шестьдесят тысяч.',
      'Первая ошибка — не видеть, куда уходят мелкие траты.',
      'За месяц из кофе и доставки набегает больше, чем кажется.',
      'Вторая — откладывать в конце месяца, а не в день зарплаты.',
      'Банк считает проценты каждый день, и это работает против тебя.',
      'Решение занимает пять минут, и его можно сделать сегодня.',
      'Открой приложение банка и посмотри траты за прошлый месяц.',
      'Раздели их на три группы: обязательные, желательные и случайные.',
      'Случайные — это и есть твоя будущая подушка.',
      'Поставь автоперевод десяти процентов в день зарплаты.',
      'Через полгода у тебя будет запас, о котором ты даже не думал.',
      'Главное — не идеальность, а регулярность.',
    ],
    shots: ['Экран банковского приложения, цифры крупно', 'Чек и калькулятор, затем график', 'Карта на столе, стрелки с суммами', 'Таблица бюджета на телефоне'],
    ctaLines: {
      Сохранить: 'Сохрани, чтобы проверить свои траты вечером.',
      Отправить: 'Отправь другу, который живёт от зарплаты до зарплаты.',
      Комментарий: 'Напиши в комментариях, какая ошибка про тебя.',
      Подписаться: 'Подпишись — завтра разберу следующую ошибку.',
    },
    ideas: [
      ['Сколько нужно на подушку безопасности', 'Подушка — это не три зарплаты. Посчитаем точнее.', 0],
      ['Стоимость часа перед покупкой', 'Переведи покупку в часы работы — и половина отпадёт.', 1],
      ['Отпуск без кредита', 'Отпуск в кредит стоит на треть дороже. Вот как без него.', 2],
      ['Налоговый вычет за спорт', 'Государство вернёт тебе часть денег за абонемент.', 1],
      ['Миф: инвестировать нужно с миллиона', 'Для старта не нужен миллион.', 3],
    ],
    hooks: ['Я потерял деньги на одной ошибке — проверь, не делаешь ли ты так же.', 'Банк не скажет тебе про это.', 'Если ты делаешь так — остановись.'],
  },
  {
    name: 'Ужин за 15 минут',
    color: 1,
    topic: 'Быстрые ужины из обычных продуктов',
    promise: 'Вкусный ужин за 15 минут из того, что уже есть дома',
    goal: 'Охват и подписчики',
    audience: 'Работающие люди 25–40, готовят вечером на себя или семью',
    format: 'Съёмка сверху, голос за кадром, субтитры',
    length: '30–45 секунд',
    wordsNorm: '70–100',
    frequency: 'Пять роликов в неделю',
    perWeek: 5,
    times: ['19:00', '12:00'],
    address: 'На «ты»',
    ctasText: 'Сохранить, отправить, подписаться',
    facts: 'Рецепты и время приготовления проверены автором',
    exclusions: 'Диет, подсчёта калорий, сложной техники',
    specialist: '—',
    openQuestions: 'Пробовать ли рубрику «Ужин на неделю»?',
    checks: 'Время приготовления в ролике должно совпадать с реальным',
    followersGoal: 120000,
    hashtags: '#рецепт #ужин #быстрыйужин',
    startDaysAgo: 46,
    futureCount: 10,
    accounts: [
      { platform: 'tiktok', username: 'uzhin15', followers: 42000 },
      { platform: 'instagram', username: 'uzhin.za.15', followers: 27300 },
      { platform: 'youtube', username: 'Uzhin15min', followers: 11200 },
    ],
    rubrics: [
      {
        name: 'Из того, что в холодильнике',
        share: 0.5,
        mult: 1.6,
        titles: [
          ['Ужин из трёх яиц и вчерашнего риса', 'Не выбрасывай вчерашний рис — сделай это.'],
          ['Остатки курицы — в тако', 'Из остатков курицы за десять минут.'],
          ['Паста из последнего помидора', 'Один помидор, паста и двенадцать минут.'],
          ['Картошка, сыр, яйцо — и всё', 'Три продукта, которые есть у всех.'],
          ['Лаваш, который спасёт вечер', 'Лаваш в холодильнике? Ужин готов.'],
          ['Шакшука из всего подряд', 'Шакшука, когда в холодильнике пусто.'],
        ],
      },
      {
        name: 'Одна сковорода',
        share: 0.3,
        mult: 1.15,
        titles: [
          ['Курица с овощами на одной сковороде', 'Одна сковорода — минимум посуды.'],
          ['Сливочная паста без кастрюли', 'Паста варится прямо в соусе.'],
          ['Фунчоза с овощами', 'Как в ресторане, но за пятнадцать минут.'],
          ['Тефтели в томатном соусе', 'Тефтели без духовки.'],
        ],
      },
      {
        name: 'Повторяю тренд',
        share: 0.2,
        mult: 0.75,
        titles: [
          ['Тот самый огуречный салат', 'Проверяю салат, который набрал пятьдесят миллионов.'],
          ['Хлеб из двух ингредиентов', 'Повторяю тренд: хлеб из двух ингредиентов.'],
          ['Пицца на лаваше', 'Пицца без теста — проверяю тренд.'],
        ],
      },
    ],
    body: [
      'Разогрей сковороду с ложкой масла.',
      'Пока она греется, нарежь всё, что есть, небольшими кубиками.',
      'Обжарь лук две минуты до золотистого цвета.',
      'Добавь остальное и не мешай первые три минуты.',
      'Посоли в конце, так овощи останутся хрустящими.',
      'Секрет — щепотка сахара и капля соевого соуса.',
      'Накрой крышкой на пару минут, чтобы всё прогрелось.',
      'Подавай сразу, пока горячее.',
      'Посуды — одна сковорода и одна доска.',
    ],
    shots: ['Сковорода сверху, руки в кадре', 'Продукты на доске, быстрые нарезки', 'Готовое блюдо крупным планом, пар'],
    ctaLines: {
      Сохранить: 'Сохрани на вечер, когда не знаешь, что приготовить.',
      Отправить: 'Отправь тому, кто опять заказывает доставку.',
      Подписаться: 'Подпишись — завтра ещё один ужин за пятнадцать минут.',
    },
    ideas: [
      ['Неделя ужинов на 2000 рублей', 'Пять ужинов на две тысячи. Показываю чек.', 0],
      ['Соусы, которые спасают курицу', 'Три соуса, после которых курица перестанет быть скучной.', 1],
      ['Ужин в микроволновке — честно', 'Нормальный ужин в микроволновке существует.', 2],
    ],
    hooks: ['Не выбрасывай этот продукт — сделай это.', 'Ужин, пока закипает чайник.', 'Три продукта, которые есть у всех.'],
  },
  {
    name: 'Английский в метро',
    color: 2,
    topic: 'Короткие уроки английского между станциями',
    promise: 'Одна фраза в день, которую ты реально будешь говорить',
    goal: 'Подписчики, затем запись на разговорный клуб',
    audience: 'Взрослые 22–40, учили в школе, но не говорят',
    format: 'Говорящая голова, субтитры на двух языках',
    length: '20–35 секунд',
    wordsNorm: '50–80',
    frequency: 'Три ролика в неделю',
    perWeek: 3,
    times: ['08:30', '11:00'],
    address: 'На «ты»',
    ctasText: 'Написать пример в комментариях, сохранить, подписаться',
    facts: 'Словари Oxford и Cambridge, примеры из сериалов',
    exclusions: 'Грамматических терминов без объяснения, «правильного британского акцента» как цели',
    specialist: '—',
    openQuestions: 'Запускать ли разговорный клуб уже в этом месяце?',
    checks: 'Произношение сверить со словарём',
    followersGoal: 25000,
    hashtags: '#английский #english #английскийязык',
    startDaysAgo: 55,
    futureCount: 2,
    accounts: [
      { platform: 'tiktok', username: 'english.metro', followers: 7200 },
      { platform: 'youtube', username: 'EnglishMetro', followers: 3900 },
    ],
    rubrics: [
      {
        name: 'Ошибки русских',
        share: 0.4,
        mult: 1.7,
        titles: [
          ['Never say «I am agree»', 'Эту ошибку делают девять из десяти русских.'],
          ['Почему нельзя говорить «open the light»', 'Не говори так в Лондоне.'],
          ['«How do you do» — это не «как дела»', 'Ты неправильно понимаешь эту фразу.'],
          ['Ошибка с «actual»', 'Actual не значит «актуальный».'],
        ],
      },
      {
        name: 'Сленг из сериалов',
        share: 0.3,
        mult: 1.15,
        titles: [
          ['Что значит «no cap»', 'Услышал в сериале и не понял? Объясняю.'],
          ['«Spill the tea» — это не про чай', 'Это вообще не про чай.'],
        ],
      },
      {
        name: 'Слово дня',
        share: 0.3,
        mult: 0.8,
        titles: [
          ['Слово дня: serendipity', 'Слово, которого нет в русском.'],
          ['Слово дня: awkward', 'Самое неловкое слово.'],
          ['Слово дня: cozy', 'Слово для осени.'],
        ],
      },
    ],
    body: [
      'Носители так не говорят.',
      'Правильно звучит вот так — повтори за мной.',
      'Запомни по картинке: представь сцену из сериала.',
      'Это слово часто путают с похожим.',
      'Вот три примера из жизни.',
    ],
    shots: ['Говорящая голова в вагоне метро', 'Субтитры крупно, слово по слогам'],
    ctaLines: {
      Комментарий: 'Напиши свой пример в комментариях.',
      Сохранить: 'Сохрани и повтори вслух три раза.',
      Подписаться: 'Подпишись — в четверг новая фраза.',
    },
    ideas: [],
    hooks: ['Эту ошибку делают девять из десяти русских.', 'Не говори так в Лондоне.'],
  },
];

const CTA_EFFECT: Record<string, Partial<Record<'save' | 'share' | 'comment', number>>> = {
  Сохранить: { save: 1.9 },
  Отправить: { share: 2 },
  Комментарий: { comment: 2.3 },
};

function timeMult(h: number) {
  if (h >= 18 && h < 21) return 1.4;
  if (h >= 21) return 1.1;
  if (h < 10) return 0.85;
  if (h < 15) return 0.95;
  return 1;
}
function wordsMult(words: number, norm: [number, number]) {
  if (words >= norm[0] && words <= norm[1]) return 1.2;
  if (words > norm[1] + 20) return 0.75;
  return 0.95;
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
  const nowMs = Date.now();
  const created = nowIso();
  const today = dayKey(new Date(), tz);

  tx(() => {
    PROJECTS.forEach((P, pi) => {
      const start = dayKey(new Date(nowMs - P.startDaysAgo * DAY_MS), tz);
      const projectId = run(
        `INSERT INTO projects (name, color, description, promise, goal_text, audience, format, video_length, words_norm, frequency, posts_per_week,
           start_date, time_weekday, time_weekend, address_form, rubrics_text, ctas, facts, exclusions, specialist, open_questions, checks,
           followers_goal, goal_deadline, hashtags, is_demo, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
        P.name,
        P.color,
        P.topic,
        P.promise,
        P.goal,
        P.audience,
        P.format,
        P.length,
        P.wordsNorm,
        P.frequency,
        P.perWeek,
        start,
        P.times[0],
        P.times[1],
        P.address,
        P.rubrics.map((r) => `${r.name} (${Math.round(r.share * 100)}%)`).join('. ') + '.',
        P.ctasText,
        P.facts,
        P.exclusions,
        P.specialist,
        P.openQuestions,
        P.checks,
        P.followersGoal,
        new Date(nowMs + 120 * DAY_MS).toISOString().slice(0, 10),
        P.hashtags,
        created,
      ).id;

      const rubricIds = P.rubrics.map((r) => run('INSERT INTO rubrics (project_id, name, share) VALUES (?, ?, ?)', projectId, r.name, r.share).id);
      for (const h of P.hooks) run("INSERT INTO snippets (project_id, kind, text, is_demo) VALUES (?, 'hook', ?, 1)", projectId, h);
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
        for (let d = P.startDaysAgo + 3; d >= 0; d--) {
          const day = dayKey(new Date(nowMs - d * DAY_MS), tz);
          const f = Math.round(a.followers * (1 - 0.3 * (d / (P.startDaysAgo + 3))) * (1 + (hash(`${id}:${d}`) - 0.5) * 0.004));
          run('INSERT OR REPLACE INTO account_snapshots (account_id, day, followers) VALUES (?, ?, ?)', id, day, d === 0 ? a.followers : f);
        }
        return { ...a, id };
      });

      // The plan: every posting day from the start date, the history plus some days ahead.
      const past = planSequence(start, P.perWeek, 400).filter((d) => d < today).length;
      const dates = planSequence(start, P.perWeek, past + P.futureCount);
      const topics = P.rubrics.flatMap((r, ri) => r.titles.map(([title, hook]) => ({ title, hook, ri })));
      const norm = (P.wordsNorm.match(/\d+/g) ?? ['80', '120']).map(Number) as [number, number];
      const ctaKinds = Object.keys(P.ctaLines);

      dates.forEach((date, i) => {
        const number = i + 1;
        const isPast = date < today;
        const futureIdx = i - past;
        const idea = !isPast && futureIdx < P.ideas.length ? P.ideas[futureIdx] : null;
        const t = idea ? { title: idea[0], hook: idea[1], ri: idea[2] } : topics[i % topics.length];
        const round = idea ? 0 : Math.floor(i / topics.length);
        const title = round ? `${t.title} — часть ${round + 1}` : t.title;
        const rubric = P.rubrics[t.ri];
        const time = slotTimeFor(date, P.times[0], P.times[1]);
        const cta = pick(ctaKinds, `${pi}:${number}:cta`);
        const n = 3 + Math.floor(hash(`${pi}:${number}:len`) * (P.body.length - 2));
        const sentences = [...P.body].sort((a, b) => hash(`${number}:${a}`) - hash(`${number}:${b}`)).slice(0, n);
        const script = [t.hook, ...sentences, P.ctaLines[cta]].join(' ');
        const words = countWords(script);
        const coverWords = title.replace(/[«»—:]/g, ' ').split(/\s+/).filter(Boolean);
        const cover = coverWords.slice(0, 5).join(' ');
        // Missed yesterday (project 1), next days in production, the rest not started.
        const missed = pi === 0 && i === past - 1;
        let status: ScriptStatus = 'Опубликован';
        if (!isPast || missed) {
          status = missed || futureIdx < 3 ? 'Смонтирован' : futureIdx < 5 ? 'Озвучен' : 'Не начат';
          if (pi === 2) status = futureIdx < 1 ? 'Озвучен' : 'Не начат';
        }
        const duration = Math.round((words / 2.3) * (0.92 + hash(`${pi}:${number}:d`) * 0.16));
        const videoId = run(
          `INSERT INTO videos (project_id, rubric_id, number, plan_date, plan_time, title, hook, cover_text, shot, script, cta, caption, hashtags,
             status, duration, width, height, is_demo, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1080, 1920, 1, ?, ?)`,
          projectId,
          rubricIds[t.ri],
          number,
          date,
          time,
          title,
          t.hook,
          cover,
          pick(P.shots, `${pi}:${number}:shot`),
          script,
          cta,
          `${title}. ${pick(['Какой пункт про тебя?', 'Проверь на себе сегодня.', 'Пиши, что разобрать дальше.'], `${number}:cap`)}`,
          P.hashtags,
          status,
          status === 'Не начат' || status === 'Озвучен' ? 0 : duration,
          created,
          created,
        ).id;

        const at = parseLocal(`${date}T${time}`)!;
        if (isPast && !missed) {
          const h = Number(time.slice(0, 2));
          const mult = rubric.mult * timeMult(h) * wordsMult(words, norm);
          const failedIg = pi === 1 && i === past - 1;
          for (const a of accounts) {
            if (a.platform === 'instagram' && hash(`${videoId}:ig`) > 0.85) continue;
            if (a.platform === 'youtube' && hash(`${videoId}:yt`) > 0.75) continue;
            const offset = a.platform === 'tiktok' ? 0 : a.platform === 'instagram' ? 20 : 40;
            const pub = new Date(at.getTime() + offset * 60_000);
            if (failedIg && a.platform === 'instagram') {
              run(
                `INSERT INTO posts (video_id, account_id, platform, status, scheduled_at, title, caption, options, attempts, last_error, is_demo, created_at, updated_at)
                 VALUES (?, ?, 'instagram', 'failed', ?, ?, '', '{}', 3, ?, 1, ?, ?)`,
                videoId,
                a.id,
                pub.toISOString(),
                title,
                'Instagram не обработал видео: ERROR. Проверьте формат: MP4/MOV, H.264, 9:16, 3 с – 15 мин. (демо)',
                created,
                created,
              );
              continue;
            }
            const model = demoModel(`v${videoId}:${a.platform}`, a.platform, mult, a.followers);
            const eff = CTA_EFFECT[cta] ?? {};
            model.save *= eff.save ?? 1;
            model.share *= eff.share ?? 1;
            model.comment *= eff.comment ?? 1;
            const ageDays = (nowMs - pub.getTime()) / DAY_MS;
            const m = demoMetricsAt(model, ageDays);
            const postId = run(
              `INSERT INTO posts (video_id, account_id, platform, status, scheduled_at, published_at, title, caption, options, external_id, state,
                 views, likes, comments, shares, saves, avg_view_pct, metrics_at, is_demo, created_at, updated_at)
               VALUES (?, ?, ?, 'published', ?, ?, ?, ?, '{}', NULL, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
              videoId,
              a.id,
              a.platform,
              pub.toISOString(),
              pub.toISOString(),
              title,
              `${title}\n\n${P.hashtags}`,
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
              const snap = demoMetricsAt(model, mk);
              run(
                'INSERT OR IGNORE INTO post_snapshots (post_id, at, views, likes, comments, shares, saves) VALUES (?, ?, ?, ?, ?, ?, ?)',
                postId,
                new Date(pub.getTime() + mk * DAY_MS).toISOString(),
                snap.views,
                snap.likes,
                snap.comments,
                snap.shares,
                snap.saves,
              );
            }
          }
        } else if (!isPast && pi < 2 && futureIdx < 2) {
          // The next two videos are already scheduled for their plan date and time.
          for (const a of accounts) {
            run(
              `INSERT INTO posts (video_id, account_id, platform, status, scheduled_at, title, caption, options, is_demo, created_at, updated_at)
               VALUES (?, ?, ?, 'scheduled', ?, ?, ?, ?, 1, ?, ?)`,
              videoId,
              a.id,
              a.platform,
              at.toISOString(),
              cover,
              `${title}\n\n${P.hashtags}`,
              JSON.stringify(a.platform === 'tiktok' ? { privacy: 'PUBLIC_TO_EVERYONE' } : a.platform === 'youtube' ? { privacy: 'public' } : { shareToFeed: true }),
              created,
              created,
            );
          }
        }
      });
    });
  });
}
