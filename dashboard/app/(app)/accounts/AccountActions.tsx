'use client';

import { useState, useTransition } from 'react';
import { addDemoAccount, disconnectAccount, importAccountVideos, syncAccountNow } from '@/app/actions';
import { PLATFORM_LABEL, type Platform } from '@/lib/types';
import { IconRefresh } from '@/components/Icons';

export function AccountActions({ id, demo, reconnect }: { id: number; demo: boolean; reconnect: string | null }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="row" style={{ justifyContent: 'flex-end', opacity: pending ? 0.6 : 1 }}>
      {msg && <span className="small muted">{msg}</span>}
      <button className="btn btn-sm btn-ghost" title="Обновить статистику" disabled={pending} onClick={() => start(() => syncAccountNow(id))}>
        <IconRefresh size={14} />
      </button>
      {!demo && (
        <button className="btn btn-sm" disabled={pending} onClick={() => start(async () => setMsg(await importAccountVideos(id)))}>
          Импорт роликов
        </button>
      )}
      {reconnect && !demo && (
        <a className="btn btn-sm btn-ghost" href={reconnect}>
          Переподключить
        </a>
      )}
      <button
        className="btn btn-sm btn-ghost btn-danger"
        disabled={pending}
        onClick={() => {
          if (confirm('Отключить аккаунт? Его публикации и статистика будут удалены из дашборда (на площадке всё останется).')) start(() => disconnectAccount(id));
        }}
      >
        Отключить
      </button>
    </div>
  );
}

export function DemoAccountButton({ projectId, platform }: { projectId: number; platform: Platform }) {
  const [pending, start] = useTransition();
  return (
    <button
      className="btn btn-sm btn-ghost"
      disabled={pending}
      title={`Ключи ${PLATFORM_LABEL[platform]} не заданы — можно добавить демо-аккаунт и проверить весь процесс`}
      onClick={() => start(() => addDemoAccount(projectId, platform))}
    >
      + демо {PLATFORM_LABEL[platform]}
    </button>
  );
}
