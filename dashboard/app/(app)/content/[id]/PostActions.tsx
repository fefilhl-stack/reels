'use client';

import { useState, useTransition } from 'react';
import { cancelPost, deletePost, reschedulePost, retryPost } from '@/app/actions';
import type { PostStatus } from '@/lib/types';

export function PostActions({ id, status, scheduledLocal }: { id: number; status: PostStatus; scheduledLocal: string }) {
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [at, setAt] = useState(scheduledLocal);
  if (status === 'scheduled' && editing) {
    return (
      <span className="row" style={{ flexWrap: 'nowrap' }}>
        <input type="datetime-local" className="input" style={{ width: 190 }} value={at} onChange={(e) => setAt(e.target.value)} />
        <button className="btn btn-sm btn-primary" disabled={pending} onClick={() => start(async () => (await reschedulePost(id, at), setEditing(false)))}>
          OK
        </button>
      </span>
    );
  }
  return (
    <span className="row" style={{ flexWrap: 'nowrap', opacity: pending ? 0.5 : 1 }}>
      {status === 'scheduled' && (
        <>
          <button className="btn btn-sm btn-ghost" onClick={() => setEditing(true)}>
            Перенести
          </button>
          <button className="btn btn-sm btn-ghost btn-danger" onClick={() => start(() => cancelPost(id))}>
            Отменить
          </button>
        </>
      )}
      {(status === 'failed' || status === 'canceled') && (
        <>
          <button className="btn btn-sm" onClick={() => start(() => retryPost(id))}>
            Повторить
          </button>
          <button className="btn btn-sm btn-ghost btn-danger" onClick={() => start(() => deletePost(id))}>
            Удалить
          </button>
        </>
      )}
    </span>
  );
}
