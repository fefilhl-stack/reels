'use client';

import { useTransition } from 'react';
import { clearDemoData, loadDemoData } from '@/app/actions';

export function LoadDemoButton({ label = 'Загрузить демо-данные', primary = false }: { label?: string; primary?: boolean }) {
  const [pending, start] = useTransition();
  return (
    <button className={`btn ${primary ? 'btn-primary' : ''}`} disabled={pending} onClick={() => start(() => loadDemoData())}>
      {pending ? 'Создаём…' : label}
    </button>
  );
}

export function ClearDemoButton() {
  const [pending, start] = useTransition();
  return (
    <button
      className="btn btn-danger"
      disabled={pending}
      onClick={() => {
        if (confirm('Удалить все демо-проекты, их аккаунты, ролики и статистику?')) start(() => clearDemoData());
      }}
    >
      {pending ? 'Удаляем…' : 'Удалить демо-данные'}
    </button>
  );
}
