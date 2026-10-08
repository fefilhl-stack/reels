'use client';

import { useTransition } from 'react';
import { deleteVideo, makeSequel } from '@/app/actions';

export function VideoActions({ videoId }: { videoId: number }) {
  const [pending, start] = useTransition();
  return (
    <div className="row" style={{ opacity: pending ? 0.6 : 1 }}>
      <button className="btn" disabled={pending} onClick={() => start(() => makeSequel(videoId))} title="Создать карточку-продолжение в идеях">
        Сделать часть 2
      </button>
      <button
        className="btn btn-ghost btn-danger"
        disabled={pending}
        onClick={() => {
          if (confirm('Удалить ролик, его файл и историю публикаций в дашборде? На площадках ролики останутся.')) start(() => deleteVideo(videoId));
        }}
      >
        Удалить
      </button>
    </div>
  );
}
