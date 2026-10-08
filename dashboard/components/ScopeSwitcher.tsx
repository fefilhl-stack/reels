'use client';

import { useTransition } from 'react';
import { setScope } from '@/app/actions';
import { projectColor } from './ui';

export function ScopeSwitcher({ projects, current }: { projects: { id: number; name: string; color: number }[]; current: number }) {
  const [pending, start] = useTransition();
  const active = projects.find((p) => p.id === current);
  return (
    <label className="row" style={{ gap: 8, flexWrap: 'nowrap', opacity: pending ? 0.6 : 1 }}>
      <span className="dot" style={{ background: active ? projectColor(active.color) : 'var(--line-strong)', width: 10, height: 10 }} />
      <select
        className="select"
        aria-label="Проект"
        style={{ width: 'auto', minWidth: 180, fontWeight: 550 }}
        value={current}
        onChange={(e) => start(() => setScope(Number(e.target.value)))}
      >
        <option value={0}>Все проекты</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </label>
  );
}
