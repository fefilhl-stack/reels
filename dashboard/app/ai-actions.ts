'use server';

import { revalidatePath } from 'next/cache';
import {
  generateCaptions,
  generateHooks,
  generateIdeas,
  generateScript,
  type CaptionSet,
  type ContentIdea,
  type HookIdea,
  type ProjectContext,
  type ScriptContext,
  type ScriptDraft,
} from '@/lib/ai';
import { loadFacts, rollupVideos } from '@/lib/analytics';
import { requireAuth } from '@/lib/auth';
import { all, get, nowIso, run } from '@/lib/db';
import { nextNumber, nextSlot } from '@/lib/planner';
import type { Project, Video } from '@/lib/types';

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

function projectContext(projectId: number): ProjectContext {
  const p = get<Project>('SELECT * FROM projects WHERE id = ?', projectId)!;
  const rolled = rollupVideos(loadFacts(projectId).facts).filter((v) => v.bestScore != null);
  const sorted = [...rolled].sort((a, b) => (b.bestScore ?? 0) - (a.bestScore ?? 0));
  const stat = (v: (typeof rolled)[number]) => ({ title: v.title, hook: v.hook, views: v.views, score: v.bestScore, rubric: v.rubric, script: '', cta: '', caption: '' });
  // Style references: the best performers with a written voiceover, else the latest scripts.
  const written = all<Video & { rubric: string | null }>(
    `SELECT v.*, r.name AS rubric FROM videos v LEFT JOIN rubrics r ON r.id = v.rubric_id
      WHERE v.project_id = ? AND length(v.script) > 80 ORDER BY v.number DESC LIMIT 40`,
    projectId,
  );
  const winnerIds = new Set(sorted.slice(0, 10).map((v) => v.videoId));
  const examples = [...written.filter((v) => winnerIds.has(v.id)), ...written.filter((v) => !winnerIds.has(v.id))]
    .slice(0, 3)
    .map((v) => ({ title: v.title, hook: v.hook, script: v.script, cta: v.cta, caption: v.caption, rubric: v.rubric }));
  const rubricNames = all<{ name: string; share: number | null }>('SELECT name, share FROM rubrics WHERE project_id = ? ORDER BY name', projectId)
    .map((r) => (r.share ? `${r.name} (${Math.round(r.share * 100)}%)` : r.name))
    .join('. ');
  return {
    name: p.name,
    topic: p.description,
    promise: p.promise,
    goal: p.goal_text,
    audience: p.audience,
    format: p.format,
    length: p.video_length,
    wordsNorm: p.words_norm,
    addressForm: p.address_form,
    rubrics: p.rubrics_text || rubricNames,
    ctas: p.ctas,
    facts: p.facts,
    exclusions: p.exclusions,
    specialist: p.specialist,
    hashtags: p.hashtags,
    winners: sorted.slice(0, 8).filter((v) => (v.bestScore ?? 0) >= 1.2).map(stat),
    losers: sorted.slice(-5).filter((v) => (v.bestScore ?? 1) < 0.8).map(stat),
    examples,
  };
}

function scriptContext(v: Video): ScriptContext {
  const rubric = v.rubric_id ? (get<{ name: string }>('SELECT name FROM rubrics WHERE id = ?', v.rubric_id)?.name ?? null) : null;
  return {
    number: v.number,
    title: v.title,
    rubric,
    hook: v.hook,
    coverText: v.cover_text,
    shot: v.shot,
    script: v.script,
    cta: v.cta,
    caption: v.caption,
    hashtags: v.hashtags,
    notes: v.notes,
    duration: v.duration,
  };
}

async function guard<T>(fn: () => Promise<T>): Promise<Result<T>> {
  await requireAuth();
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

function video(id: number): Video {
  const v = get<Video>('SELECT * FROM videos WHERE id = ?', id);
  if (!v) throw new Error('Сценарий не найден');
  return v;
}

/** Draft for the script page form (nothing is saved until the user clicks «Сохранить»). */
export async function aiScriptDraft(videoId: number): Promise<Result<ScriptDraft>> {
  return guard(async () => {
    const v = video(videoId);
    return generateScript(projectContext(v.project_id), scriptContext(v));
  });
}

/** From the plan table: writes the script and fills only the empty cells of the row. */
export async function aiFillScript(videoId: number): Promise<Result<number>> {
  return guard(async () => {
    const v = video(videoId);
    const d = await generateScript(projectContext(v.project_id), scriptContext(v));
    const fields: [keyof ScriptDraft, keyof Video][] = [
      ['hook', 'hook'],
      ['cover_text', 'cover_text'],
      ['shot', 'shot'],
      ['script', 'script'],
      ['cta', 'cta'],
      ['caption', 'caption'],
      ['hashtags', 'hashtags'],
    ];
    let filled = 0;
    for (const [from, to] of fields) {
      if (String(v[to] ?? '').trim() || !d[from].trim()) continue;
      run(`UPDATE videos SET ${to} = ? WHERE id = ?`, d[from].trim(), videoId);
      filled++;
    }
    if (d.check.trim()) run('UPDATE videos SET notes = ? WHERE id = ?', [v.notes, `Проверить: ${d.check.trim()}`].filter(Boolean).join('\n'), videoId);
    run('UPDATE videos SET updated_at = ? WHERE id = ?', nowIso(), videoId);
    revalidatePath('/', 'layout');
    return filled;
  });
}

export async function aiCaptions(videoId: number): Promise<Result<CaptionSet>> {
  return guard(async () => {
    const v = video(videoId);
    return generateCaptions(projectContext(v.project_id), scriptContext(v));
  });
}

export async function aiHooks(videoId: number): Promise<Result<HookIdea[]>> {
  return guard(async () => {
    const v = video(videoId);
    return (await generateHooks(projectContext(v.project_id), scriptContext(v))).hooks;
  });
}

export async function aiIdeas(projectId: number): Promise<Result<ContentIdea[]>> {
  return guard(async () => {
    const titles = all<{ title: string }>('SELECT title FROM videos WHERE project_id = ? ORDER BY number', projectId).map((r) => r.title);
    return (await generateIdeas(projectContext(projectId), titles)).ideas;
  });
}

/** Adds a generated idea to the end of the content plan (next №, next posting day). */
export async function saveIdea(projectId: number, idea: ContentIdea) {
  await requireAuth();
  const project = get<Project>('SELECT * FROM projects WHERE id = ?', projectId);
  if (!project) return;
  const rubric = get<{ id: number }>('SELECT id FROM rubrics WHERE project_id = ? AND lower(name) = lower(?)', projectId, idea.rubric);
  const slot = nextSlot(project);
  const now = nowIso();
  run(
    `INSERT INTO videos (project_id, rubric_id, number, plan_date, plan_time, title, hook, notes, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Не начат', ?, ?)`,
    projectId,
    rubric?.id ?? null,
    nextNumber(projectId),
    slot.date,
    slot.time,
    idea.title,
    idea.hook,
    idea.why,
    now,
    now,
  );
  revalidatePath('/', 'layout');
}
