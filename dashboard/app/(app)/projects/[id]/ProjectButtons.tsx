'use client';

import { useTransition } from 'react';
import { archiveProject, deleteRubric, deleteSnippet } from '@/app/actions';
import { IconX } from '@/components/Icons';

export function ArchiveButton({ id }: { id: number }) {
  const [pending, start] = useTransition();
  return (
    <button
      className="btn btn-ghost btn-danger"
      disabled={pending}
      onClick={() => {
        if (confirm('Убрать проект в архив? Публикации по расписанию остановятся, данные сохранятся в базе.')) start(() => archiveProject(id));
      }}
    >
      В архив
    </button>
  );
}

export function DeleteRubric({ id }: { id: number }) {
  const [pending, start] = useTransition();
  return (
    <button className="btn btn-sm btn-ghost btn-icon" aria-label="Удалить рубрику" disabled={pending} onClick={() => start(() => deleteRubric(id))}>
      <IconX size={13} />
    </button>
  );
}

export function DeleteSnippet({ id }: { id: number }) {
  const [pending, start] = useTransition();
  return (
    <button className="btn btn-sm btn-ghost btn-icon" aria-label="Удалить шаблон" disabled={pending} onClick={() => start(() => deleteSnippet(id))}>
      <IconX size={13} />
    </button>
  );
}
