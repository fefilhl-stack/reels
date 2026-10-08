'use client';

import { useActionState } from 'react';
import { login } from '@/app/actions';

export function LoginForm() {
  const [error, action, pending] = useActionState(login, null);
  return (
    <form action={action} className="stack">
      <input className="input" type="password" name="password" placeholder="Пароль" autoFocus required autoComplete="current-password" />
      {error && <div className="notice notice-error">{error}</div>}
      <button className="btn btn-primary" disabled={pending}>
        {pending ? 'Входим…' : 'Войти'}
      </button>
    </form>
  );
}
