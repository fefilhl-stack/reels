'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { logout } from '@/app/actions';
import { IconBoard, IconCalendar, IconChart, IconFolder, IconHome, IconLink, IconSettings } from './Icons';

const NAV = [
  { href: '/', label: 'Обзор', Icon: IconHome },
  { href: '/content', label: 'Контент', Icon: IconBoard },
  { href: '/calendar', label: 'Календарь', Icon: IconCalendar },
  { href: '/analytics', label: 'Аналитика', Icon: IconChart },
  { href: '/projects', label: 'Проекты', Icon: IconFolder },
  { href: '/accounts', label: 'Аккаунты', Icon: IconLink },
  { href: '/settings', label: 'Настройки', Icon: IconSettings },
];

export function Sidebar({ alerts, hasPassword, workerText }: { alerts: number; hasPassword: boolean; workerText: string }) {
  const path = usePathname();
  return (
    <aside className="sidebar">
      <Link href="/" className="brand">
        <span className="brand-mark">
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
            <rect x="6" y="3" width="12" height="18" rx="3" fill="none" stroke="currentColor" strokeWidth="2" />
            <path d="m10.5 9 4.5 3-4.5 3z" fill="currentColor" />
          </svg>
        </span>
        <span>Reels Hub</span>
      </Link>
      <nav className="nav">
        {NAV.map(({ href, label, Icon }) => {
          const active = href === '/' ? path === '/' : path.startsWith(href);
          return (
            <Link key={href} href={href} aria-current={active ? 'page' : undefined} title={label}>
              <Icon />
              <span className="nav-text">{label}</span>
              {href === '/' && alerts > 0 && <span className="nav-badge">{alerts}</span>}
            </Link>
          );
        })}
      </nav>
      <div className="sidebar-foot">
        <span>{workerText}</span>
        {hasPassword && (
          <form action={logout}>
            <button className="btn btn-ghost btn-sm" style={{ padding: 0 }}>
              Выйти
            </button>
          </form>
        )}
      </div>
    </aside>
  );
}
