import { cookies } from 'next/headers';
import { get } from './db';
import type { Project } from './types';

export const SCOPE_COOKIE = 'reels_scope';

/** The project selected in the header switcher, or null for "all projects". */
export async function getScope(): Promise<Project | null> {
  const jar = await cookies();
  const id = Number(jar.get(SCOPE_COOKIE)?.value || 0);
  if (!id) return null;
  return get<Project>('SELECT * FROM projects WHERE id = ? AND archived = 0', id) ?? null;
}
