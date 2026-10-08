import { randomUUID } from 'node:crypto';
import { existsSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { UPLOAD_DIR } from './env';

export const VIDEO_EXT = ['mp4', 'mov', 'm4v', 'webm'];
export const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'webp'];

const MIME: Record<string, string> = {
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

export function mimeOf(name: string): string {
  return MIME[path.extname(name).slice(1).toLowerCase()] ?? 'application/octet-stream';
}

export function newFileName(original: string, allowed: string[]): string | null {
  const ext = path.extname(original).slice(1).toLowerCase();
  if (!allowed.includes(ext)) return null;
  return `${randomUUID()}.${ext}`;
}

/** Only names we generated ourselves are ever resolved, so paths can't escape the upload dir. */
export function safePath(name: string): string | null {
  if (!/^[0-9a-f-]{36}\.(mp4|mov|m4v|webm|jpg|jpeg|png|webp)$/.test(name)) return null;
  return path.join(UPLOAD_DIR, name);
}

export function removeFile(name: string | null | undefined) {
  if (!name) return;
  const p = safePath(name);
  if (p && existsSync(/*turbopackIgnore: true*/ p)) unlinkSync(/*turbopackIgnore: true*/ p);
}
