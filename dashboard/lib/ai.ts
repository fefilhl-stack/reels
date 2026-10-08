import Anthropic from '@anthropic-ai/sdk';
import { env } from './env';

// Optional AI assistant on Claude: captions per platform, hook variants and content ideas
// grounded in the project's own best and worst performers. Enabled when ANTHROPIC_API_KEY is set.

export function aiEnabled(): boolean {
  return !!env.anthropic().key;
}

const SYSTEM = `Ты продюсер коротких вертикальных видео (TikTok, Instagram Reels, YouTube Shorts) с опытом роста авторских и экспертных аккаунтов.
Пишешь по-русски, живым разговорным языком, без канцелярита, штампов и кликбейта, который обманывает зрителя.
Опирайся только на данные проекта и ролика из запроса: не придумывай факты, цифры, цены и обещания, которых там нет.
Хук — первая фраза ролика (до 3 секунд): конкретная, с напряжением или пользой, понятная без контекста.
Учитывай особенности площадок: TikTok — короткая подпись и 3–5 хештегов; Instagram — подпись с пользой и призывом сохранить/написать, до 30 хештегов, лучше 5–10;
YouTube Shorts — заголовок до 100 символов с ключевыми словами в начале и описание в 1–3 предложения.`;

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
  if (response.stop_reason === 'refusal') throw new Error('Модель отказалась отвечать на этот запрос — переформулируйте описание ролика');
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

export interface ProjectContext {
  name: string;
  description: string;
  audience: string;
  footer: string;
  hashtags: string;
  rubrics: string[];
  winners: { title: string; hook: string; views: number; score: number | null; rubric: string | null }[];
  losers: { title: string; hook: string; views: number; score: number | null; rubric: string | null }[];
}

function projectBlock(p: ProjectContext): string {
  const line = (v: ProjectContext['winners'][number]) =>
    `- «${v.title}»${v.hook ? ` | хук: «${v.hook}»` : ''}${v.rubric ? ` | рубрика: ${v.rubric}` : ''} | ${v.views} просмотров${v.score ? ` | ${v.score.toFixed(1)}× медианы` : ''}`;
  return [
    `Проект: ${p.name}`,
    p.description && `О проекте: ${p.description}`,
    p.audience && `Аудитория: ${p.audience}`,
    p.rubrics.length ? `Рубрики: ${p.rubrics.join(', ')}` : '',
    p.footer && `Обычный призыв в конце подписи: ${p.footer}`,
    p.hashtags && `Базовые хештеги проекта: ${p.hashtags}`,
    p.winners.length ? `Лучшие ролики (выше медианы аккаунта):\n${p.winners.map(line).join('\n')}` : '',
    p.losers.length ? `Слабые ролики (ниже медианы):\n${p.losers.map(line).join('\n')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export interface VideoContext {
  title: string;
  hook: string;
  script: string;
  notes: string;
  caption: string;
  rubric: string | null;
  duration: number;
}

function videoBlock(v: VideoContext): string {
  return [
    `Ролик: ${v.title}`,
    v.rubric && `Рубрика: ${v.rubric}`,
    v.duration ? `Длительность: ${Math.round(v.duration)} с` : '',
    v.hook && `Текущий хук: ${v.hook}`,
    v.script && `Сценарий:\n${v.script}`,
    v.notes && `Заметки: ${v.notes}`,
    v.caption && `Черновик подписи: ${v.caption}`,
  ]
    .filter(Boolean)
    .join('\n');
}

export interface CaptionSet {
  tiktok: string;
  instagram: string;
  youtube_title: string;
  youtube_description: string;
  hashtags: string[];
}

export function generateCaptions(p: ProjectContext, v: VideoContext): Promise<CaptionSet> {
  return ask<CaptionSet>(
    `${projectBlock(p)}\n\n${videoBlock(v)}\n\nНапиши подписи к этому ролику для каждой площадки. Хештеги верни отдельным списком (с символом #), в подписи их не вставляй.`,
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

export function generateHooks(p: ProjectContext, v: VideoContext): Promise<{ hooks: HookIdea[] }> {
  return ask<{ hooks: HookIdea[] }>(
    `${projectBlock(p)}\n\n${videoBlock(v)}\n\nПредложи 6 разных хуков для этого ролика (разные приёмы: вопрос, ошибка, цифра, спор, обещание результата, личная история). Для каждого — коротко, почему он сработает, со ссылкой на то, что заходило в этом проекте.`,
    obj({ hooks: { type: 'array', items: obj({ text: str, why: str }) } }),
  );
}

export interface ContentIdea {
  title: string;
  hook: string;
  rubric: string;
  why: string;
}

export function generateIdeas(p: ProjectContext, count = 10): Promise<{ ideas: ContentIdea[] }> {
  return ask<{ ideas: ContentIdea[] }>(
    `${projectBlock(p)}\n\nПредложи ${count} идей новых роликов для этого проекта. Опирайся на то, что уже залетело (продолжения, вариации, смежные темы), и избегай того, что проседает. Рубрику выбирай из существующих, если подходит. В поле why — одно предложение, на какой залетевший ролик или закономерность опирается идея.`,
    obj({ ideas: { type: 'array', items: obj({ title: str, hook: str, rubric: str, why: str }) } }),
  );
}
