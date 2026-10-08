'use client';

import { useTransition } from 'react';
import { runTickNow, syncAllNow } from '@/app/actions';

export function SystemButtons() {
  const [pending, start] = useTransition();
  return (
    <div className="row" style={{ opacity: pending ? 0.6 : 1 }}>
      <button className="btn btn-sm" disabled={pending} onClick={() => start(() => runTickNow())}>
        Проверить очередь сейчас
      </button>
      <button className="btn btn-sm" disabled={pending} onClick={() => start(() => syncAllNow())}>
        Обновить статистику
      </button>
    </div>
  );
}
