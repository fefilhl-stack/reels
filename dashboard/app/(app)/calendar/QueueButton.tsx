'use client';

import { useState, useTransition } from 'react';
import { queueVideo } from '@/app/actions';
import { IconQueue } from '@/components/Icons';

export function QueueButton({ videoId }: { videoId: number }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <button
      className="btn btn-sm"
      title={msg ?? 'Поставить в ближайший свободный слот на все аккаунты проекта'}
      disabled={pending}
      onClick={() => start(async () => setMsg((await queueVideo(videoId)).message))}
    >
      <IconQueue size={14} />
    </button>
  );
}
