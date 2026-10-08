'use client';

import type { UploadedVideo } from '@/app/actions';

/** Reads duration/size in the browser and grabs a JPEG frame for the cover (no ffmpeg on the server). */
export async function probeVideo(file: File, atSec?: number): Promise<{ duration: number; width: number; height: number; cover: Blob | null }> {
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    video.src = url;
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('Браузер не смог прочитать видео'));
    });
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    const width = video.videoWidth;
    const height = video.videoHeight;
    const cover = await grabFrame(video, atSec ?? Math.min(1, duration / 2)).catch(() => null);
    return { duration, width, height, cover };
  } catch {
    return { duration: 0, width: 0, height: 0, cover: null };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function grabFrame(video: HTMLVideoElement, atSec: number): Promise<Blob | null> {
  if (Math.abs(video.currentTime - atSec) > 0.01) {
    await new Promise<void>((resolve) => {
      video.onseeked = () => resolve();
      video.currentTime = atSec;
    });
  }
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) return null;
  const scale = Math.min(1, 540 / w);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  canvas.getContext('2d')!.drawImage(video, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.82));
}

/** PUT the raw file to /api/upload with progress (XHR, since fetch has no upload progress). */
export function putFile(body: Blob, name: string, kind: 'video' | 'image', onProgress?: (p: number) => void): Promise<{ fileName: string; size: number }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', `/api/upload?kind=${kind}&name=${encodeURIComponent(name)}`);
    xhr.setRequestHeader('Content-Type', body.type || 'application/octet-stream');
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) resolve(data);
        else reject(new Error(data.error || `Ошибка загрузки (${xhr.status})`));
      } catch {
        reject(new Error(`Ошибка загрузки (${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error('Сеть недоступна'));
    xhr.send(body);
  });
}

export async function uploadVideo(file: File, onProgress?: (p: number) => void): Promise<UploadedVideo> {
  const meta = await probeVideo(file);
  const { fileName, size } = await putFile(file, file.name, 'video', onProgress);
  let thumbName: string | null = null;
  if (meta.cover) thumbName = (await putFile(meta.cover, 'cover.jpg', 'image')).fileName;
  return {
    fileName,
    originalName: file.name,
    size,
    mime: file.type || 'video/mp4',
    duration: meta.duration,
    width: meta.width,
    height: meta.height,
    thumbName,
  };
}
