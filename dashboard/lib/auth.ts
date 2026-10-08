import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { env } from './env';
import { safeEqual, sign } from './crypto';

export const SESSION_COOKIE = 'reels_session';

/** Stateless session: changing DASHBOARD_PASSWORD or APP_SECRET logs everyone out. */
export function sessionToken(): string {
  return sign(`session:${env.password()}`);
}

export function isValidSession(value: string | undefined): boolean {
  if (!env.password()) return true;
  return !!value && safeEqual(value, sessionToken());
}

export async function isAuthed(): Promise<boolean> {
  const jar = await cookies();
  return isValidSession(jar.get(SESSION_COOKIE)?.value);
}

/** Call at the top of every server action and route handler. */
export async function requireAuth() {
  if (!(await isAuthed())) redirect('/login');
}

export function checkPassword(input: string): boolean {
  const expected = env.password();
  return !expected || safeEqual(sign(`pw:${input}`), sign(`pw:${expected}`));
}
