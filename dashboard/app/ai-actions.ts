'use server';

import { revalidatePath } from 'next/cache';
import { generateCaptions, generateHooks, generateIdeas, type CaptionSet, type ContentIdea, type HookIdea, type ProjectContext } from '@/lib/ai';
import { loadFacts, rollupVideos } from '@/lib/analytics';
import { requireAuth } from '@/lib/auth';
import { all, get, nowIso, run } from '@/lib/db';
import type { Project, Video } from '@/lib/types';

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

function projectContext(projectId: number): ProjectContext {
  const p = get<Project>('SELECT * FROM projects WHERE id = ?', projectId)!;
  const rubrics = all<{ name: string }>('SELECT name FROM rubrics WHERE project_id = ? ORDER BY name', projectId).map((r) => r.name);
  const rolled = rollupVideos(loadFacts(projectId).facts).filter((v) => v.bestScore != null);
  const sorted = [...rolled].sort((a, b) => (b.bestScore ?? 0) - (a.bestScore ?? 0));
  const pick = (v: (typeof rolled)[number]) => ({ title: v.title, hook: v.hook, views: v.views, score: v.bestScore, rubric: v.rubric });
  return {
    name: p.name,
    description: p.description,
    audience: p.audience,
    footer: p.caption_footer,
    hashtags: p.hashtags,
    rubrics,
    winners: sorted.slice(0, 8).filter((v) => (v.bestScore ?? 0) >= 1.2).map(pick),
    losers: sorted.slice(-5).filter((v) => (v.bestScore ?? 1) < 0.8).map(pick),
  };
}

function videoContext(v: Video) {
  const rubric = v.rubric_id ? get<{ name: string }>('SELECT name FROM rubrics WHERE id = ?', v.rubric_id)?.name ?? null : null;
  return { title: v.title, hook: v.hook, script: v.script, notes: v.notes, caption: v.caption, rubric, duration: v.duration };
}

async function guard<T>(fn: () => Promise<T>): Promise<Result<T>> {
  await requireAuth();
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function aiCaptions(videoId: number): Promise<Result<CaptionSet>> {
  return guard(async () => {
    const v = get<Video>('SELECT * FROM videos WHERE id = ?', videoId);
    if (!v) throw new Error('Ролик не найден');
    return generateCaptions(projectContext(v.project_id), videoContext(v));
  });
}

export async function aiHooks(videoId: number): Promise<Result<HookIdea[]>> {
  return guard(async () => {
    const v = get<Video>('SELECT * FROM videos WHERE id = ?', videoId);
    if (!v) throw new Error('Ролик не найден');
    return (await generateHooks(projectContext(v.project_id), videoContext(v))).hooks;
  });
}

export async function aiIdeas(projectId: number): Promise<Result<ContentIdea[]>> {
  return guard(async () => (await generateIdeas(projectContext(projectId))).ideas);
}

/** Saves a generated idea to the project's idea bank (rubric matched by name). */
export async function saveIdea(projectId: number, idea: ContentIdea) {
  await requireAuth();
  const rubric = get<{ id: number }>('SELECT id FROM rubrics WHERE project_id = ? AND lower(name) = lower(?)', projectId, idea.rubric);
  const now = nowIso();
  run(
    "INSERT INTO videos (project_id, rubric_id, title, stage, hook, notes, created_at, updated_at) VALUES (?, ?, ?, 'idea', ?, ?, ?, ?)",
    projectId,
    rubric?.id ?? null,
    idea.title,
    idea.hook,
    idea.why,
    now,
    now,
  );
  revalidatePath('/', 'layout');
}
