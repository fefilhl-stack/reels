import type { Platform } from './types';

// Platform text limits and default caption assembly (shared by server and client).

export const LIMITS: Record<Platform, { caption: number; title?: number; hashtags?: number }> = {
  tiktok: { caption: 2200 },
  instagram: { caption: 2200, hashtags: 30 },
  youtube: { caption: 5000, title: 100 },
};

export function hashtagList(text: string): string[] {
  return [...new Set((text.match(/#[\p{L}\p{N}_]+/gu) ?? []).map((t) => t.toLowerCase()))];
}

export function buildCaption(
  platform: Platform,
  v: { caption: string; hook: string; title: string; hashtags: string },
  project: { caption_footer: string; hashtags: string },
): string {
  const body = (v.caption || v.hook || v.title).trim();
  const footer = project.caption_footer.trim();
  const tags = hashtagList(`${v.hashtags} ${project.hashtags}`);
  const parts = [body];
  if (footer && !body.includes(footer)) parts.push(footer);
  const limitedTags = platform === 'instagram' ? tags.slice(0, LIMITS.instagram.hashtags) : tags;
  if (platform === 'youtube' && !limitedTags.includes('#shorts')) limitedTags.push('#shorts');
  if (limitedTags.length) parts.push(limitedTags.join(' '));
  return parts.filter(Boolean).join('\n\n');
}

export interface SpecCheck {
  ok: boolean;
  text: string;
}

/** Quick pre-flight checks of a file against each platform's short-video requirements. */
export function specChecks(platform: Platform, v: { duration: number; width: number; height: number; file_size: number; mime: string }): SpecCheck[] {
  const out: SpecCheck[] = [];
  const vertical = v.width && v.height ? v.height / v.width : 0;
  if (v.width && v.height) {
    out.push({
      ok: vertical >= 1.7,
      text: vertical >= 1.7 ? 'Вертикальный 9:16' : `Соотношение ${v.width}×${v.height} — лучше 9:16 (1080×1920)`,
    });
  }
  const d = v.duration;
  if (d) {
    if (platform === 'youtube') out.push({ ok: d <= 180, text: d <= 180 ? 'До 3 минут — попадёт в Shorts' : 'Длиннее 3 минут — не будет Shorts' });
    if (platform === 'instagram') out.push({ ok: d >= 3 && d <= 900, text: d >= 3 && d <= 900 ? 'Длительность 3 с – 15 мин' : 'Reels: от 3 секунд до 15 минут' });
    if (platform === 'tiktok') out.push({ ok: d >= 3 && d <= 600, text: d >= 3 && d <= 600 ? 'Длительность подходит' : 'TikTok через API: до 10 минут (лимит зависит от аккаунта)' });
  }
  if (platform === 'instagram' && v.file_size) {
    const ok = v.file_size <= 300 * 1024 ** 2;
    out.push({ ok, text: ok ? 'Размер до 300 МБ' : 'Reels через API: файл до 300 МБ — пережмите' });
  }
  if (v.mime && !/mp4|quicktime/.test(v.mime)) out.push({ ok: false, text: 'Надёжнее всего MP4 (H.264 + AAC)' });
  return out;
}
