import Anthropic from '@anthropic-ai/sdk';
import { env } from './env';

// Optional AI assistant on Claude. It works from the project passport (audience, word norm,
// form of address, fact sources, what must not be in videos) and the project's own scripts,
// so drafts follow the same template as the content plan. Enabled when ANTHROPIC_API_KEY is set.

export function aiEnabled(): boolean {
  return !!env.anthropic().key;
}

const SYSTEM = `Ты продюсер и сценарист коротких вертикальных видео (TikTok, Instagram Reels, YouTube Shorts) для экспертных и продуктовых аккаунтов.
Пишешь по-русски, живым разговорным языком, без канцелярита, штампов и обманного кликбейта.
Строго следуй паспорту проекта: обращение, норма слов, формат, рубрики, призывы, «Чего в роликах нет», «Где нужна фраза о специалисте».
Факты, цифры и исследования бери только из раздела «На чём основаны факты» и из данных строки. Если для темы нужен факт, которого там нет, пиши без конкретных цифр и исследований и укажи это в поле check.
Хук — первая фраза ролика (до 3 секунд): конкретная, с напряжением или пользой, понятная без контекста. Текст озвучки начинается с хука.`;

let client: Anthropic | null = null;

async function ask<T>(prompt: string, schema: Record<string, unknown>): Promise<T> {
  const { key, model } = env.anthropic();
  if (!key) throw new Error('ИИ-помощник выключен: задайте ANTHROPIC_API_KEY');
  client ??= new Anthropic({ apiKey: key });
  const response = await client.beta.messages.create({
    model: model || 'claude-opus-5-5',
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'medium', format: { type: 'json_schema', schema } },
    system: SYSTEM,
    messages: [{ role: 'user', content: prompt }],
  });
  if (response.stop_reason === 'refusal') throw new Error('Модель отказалась отвечать на этот запрос — переформулируйте тему');
  if (response.stop_reason === 'max_tokens') throw new Error('Ответ модели оборвался — попробуйте ещё раз');
  const text = response.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
  return JSON.parse(text) as T;
}

const obj = (properties: Record<string, unknown>) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const str = { type: 'string' };

export interface ScriptExample {
  title: string;
  hook: string;
  script: string;
  cta: string;
  caption: string;
  views?: number;
  score?: number | null;
  rubric?: string | null;
}

export interface ProjectContext {
  name: string;
  /** Тема аккаунта */
  topic: string;
  promise: string;
  goal: string;
  audience: string;
  format: string;
  length: string;
  wordsNorm: string;
  addressForm: string;
  rubrics: string;
  ctas: string;
  facts: string;
  exclusions: string;
  specialist: string;
  hashtags: string;
  /** Scripts that beat the account median, best first */
  winners: ScriptExample[];
  /** Scripts below the median */
  losers: ScriptExample[];
  /** Recent scripts for tone and structure */
  examples: ScriptExample[];
}

function projectBlock(p: ProjectContext): string {
  const stat = (v: ScriptExample) =>
    `- «${v.title}»${v.hook ? ` | хук: «${v.hook}»` : ''}${v.rubric ? ` | рубрика: ${v.rubric}` : ''}${v.views != null ? ` | ${v.views} просмотров` : ''}${v.score ? ` | ${v.score.toFixed(1)}× медианы` : ''}`;
  const field = (label: string, value: string) => (value.trim() ? `${label}: ${value.trim()}` : '');
  return [
    `Проект: ${p.name}`,
    field('Тема аккаунта', p.topic),
    field('Обещание зрителю', p.promise),
    field('Цель', p.goal),
    field('Аудитория', p.audience),
    field('Формат', p.format),
    field('Длина ролика', p.length),
    field('Норма слов в тексте озвучки', p.wordsNorm),
    field('Обращение', p.addressForm),
    field('Рубрики', p.rubrics),
    field('Призывы', p.ctas),
    field('На чём основаны факты', p.facts),
    field('Чего в роликах нет', p.exclusions),
    field('Где нужна фраза о специалисте', p.specialist),
    field('Хэштеги проекта', p.hashtags),
    p.winners.length ? `Лучшие ролики (выше медианы аккаунта):\n${p.winners.map(stat).join('\n')}` : '',
    p.losers.length ? `Слабые ролики (ниже медианы):\n${p.losers.map(stat).join('\n')}` : '',
    p.examples.length
      ? `Примеры сценариев проекта (стиль и структура):\n${p.examples
          .map((e) => `### ${e.title}\nХук: ${e.hook}\nТекст озвучки: ${e.script}\nПризыв: ${e.cta}\nПодпись: ${e.caption}`)
          .join('\n\n')}`
      : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export interface ScriptContext {
  number: number;
  title: string;
  rubric: string | null;
  hook: string;
  coverText: string;
  shot: string;
  script: string;
  cta: string;
  caption: string;
  hashtags: string;
  notes: string;
  duration: number;
}

function scriptBlock(v: ScriptContext): string {
  const field = (label: string, value: string) => (value.trim() ? `${label}: ${value.trim()}` : '');
  return [
    `Сценарий №${v.number}. Тема: ${v.title}`,
    v.rubric ? `Рубрика: ${v.rubric}` : '',
    field('Хук', v.hook),
    field('Обложка', v.coverText),
    field('Кадр', v.shot),
    field('Текст озвучки', v.script),
    field('Призыв', v.cta),
    field('Подпись', v.caption),
    field('Хэштеги', v.hashtags),
    field('Заметки', v.notes),
    v.duration ? `Длительность готового ролика: ${Math.round(v.duration)} с` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export interface ScriptDraft {
  hook: string;
  cover_text: string;
  shot: string;
  script: string;
  cta: string;
  caption: string;
  hashtags: string;
  check: string;
}

/** A full row of the content plan for the given topic. Filled fields are kept as the author's intent. */
export function generateScript(p: ProjectContext, v: ScriptContext): Promise<ScriptDraft> {
  return ask<ScriptDraft>(
    `${projectBlock(p)}\n\n${scriptBlock(v)}\n\nНапиши этот сценарий целиком по шаблону контент-плана. Уже заполненные поля — замысел автора: сохрани их смысл, можно улучшить формулировку.
- hook: первая фраза ролика.
- cover_text: текст на обложке, до 5 слов.
- shot: что в кадре, одной строкой.
- script: текст озвучки, начинается с хука, укладывается в норму слов; цифры пиши словами, как их произносят.
- cta: короткий призыв из списка «Призывы» (например «Сохранить»), и этот призыв должен звучать в конце текста озвучки.
- caption: подпись к посту, 1–2 предложения.
- hashtags: 4–5 хэштегов через пробел.
- check: что проверить перед публикацией (источник, цифра, фраза о специалисте); пусто, если нечего.`,
    obj({ hook: str, cover_text: str, shot: str, script: str, cta: str, caption: str, hashtags: str, check: str }),
  );
}

export interface CaptionSet {
  tiktok: string;
  instagram: string;
  youtube_title: string;
  youtube_description: string;
  hashtags: string[];
}

export function generateCaptions(p: ProjectContext, v: ScriptContext): Promise<CaptionSet> {
  return ask<CaptionSet>(
    `${projectBlock(p)}\n\n${scriptBlock(v)}\n\nНапиши подписи к этому ролику для каждой площадки на основе «Подписи» и текста озвучки. Хэштеги верни отдельным списком (с символом #), в подписи их не вставляй.`,
    obj({
      tiktok: str,
      instagram: str,
      youtube_title: str,
      youtube_description: str,
      hashtags: { type: 'array', items: str },
    }),
  );
}

export interface HookIdea {
  text: string;
  why: string;
}

export function generateHooks(p: ProjectContext, v: ScriptContext): Promise<{ hooks: HookIdea[] }> {
  return ask<{ hooks: HookIdea[] }>(
    `${projectBlock(p)}\n\n${scriptBlock(v)}\n\nПредложи 6 разных хуков для этого ролика (разные приёмы: вопрос, ошибка, цифра, спор, обещание результата, личная история). Для каждого — коротко, почему он сработает, со ссылкой на то, что заходило в этом проекте.`,
    obj({ hooks: { type: 'array', items: obj({ text: str, why: str }) } }),
  );
}

export interface ContentIdea {
  title: string;
  hook: string;
  rubric: string;
  why: string;
}

export function generateIdeas(p: ProjectContext, existingTitles: string[], count = 10): Promise<{ ideas: ContentIdea[] }> {
  return ask<{ ideas: ContentIdea[] }>(
    `${projectBlock(p)}\n\nТемы, которые уже есть в плане (не повторяй их):\n${existingTitles.slice(-80).map((t) => `- ${t}`).join('\n')}\n\nПредложи ${count} новых тем для контент-плана. Опирайся на то, что уже залетело (продолжения, вариации, смежные темы), и избегай того, что проседает. Рубрику выбирай из рубрик проекта. В поле why — одно предложение, на какой ролик или закономерность опирается идея.`,
    obj({ ideas: { type: 'array', items: obj({ title: str, hook: str, rubric: str, why: str }) } }),
  );
}
