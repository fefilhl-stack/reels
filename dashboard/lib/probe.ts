import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { promisify } from 'node:util';
import { UPLOAD_DIR } from './env';

const run = promisify(execFile);

// Server-side fallback when the browser can't decode the file (e.g. HEVC in Chrome on Windows):
// uses ffprobe/ffmpeg if they are installed, otherwise quietly does nothing.

export async function probeFile(file: string): Promise<{ duration: number; width: number; height: number } | null> {
  try {
    const { stdout } = await run(
      'ffprobe',
      ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:stream_tags=rotate:format=duration', '-of', 'json', file],
      { timeout: 20_000 },
    );
    const j = JSON.parse(stdout) as { streams?: { width?: number; height?: number; tags?: { rotate?: string } }[]; format?: { duration?: string } };
    const s = j.streams?.[0];
    const rotated = Math.abs(Number(s?.tags?.rotate ?? 0)) % 180 === 90;
    return {
      duration: Number(j.format?.duration ?? 0),
      width: (rotated ? s?.height : s?.width) ?? 0,
      height: (rotated ? s?.width : s?.height) ?? 0,
    };
  } catch {
    return null;
  }
}

export async function extractFrame(file: string, atSec: number): Promise<string | null> {
  const name = `${randomUUID()}.jpg`;
  try {
    await run('ffmpeg', ['-v', 'error', '-y', '-ss', String(Math.max(0, atSec)), '-i', file, '-frames:v', '1', '-vf', 'scale=540:-2', path.join(UPLOAD_DIR, name)], {
      timeout: 30_000,
    });
    return name;
  } catch {
    return null;
  }
}
