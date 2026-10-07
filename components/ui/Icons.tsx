import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement>;

/** The Relay mark: two chevrons. `tone` picks the colors for lime or dark tiles. */
export function Chevrons({ tone = 'onLime', ...props }: P & { tone?: 'onLime' | 'onDark' }) {
  const back = tone === 'onLime' ? '#4f6b14' : '#5e7c1b';
  const front = tone === 'onLime' ? '#0b0f02' : 'url(#relay-chev)';
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      {tone === 'onDark' && (
        <defs>
          <linearGradient id="relay-chev" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#e3ff9c" />
            <stop offset="1" stopColor="#a8db2f" />
          </linearGradient>
        </defs>
      )}
      <path d="M5.4 5.6 11.6 12l-6.2 6.4" stroke={back} strokeWidth="3.1" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M11.6 5.6 17.8 12l-6.2 6.4" stroke={front} strokeWidth="3.1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export const IconPlay = (p: P) => (
  <svg viewBox="0 0 12 12" aria-hidden="true" {...p}>
    <path d="M3 1.6v8.8L10.2 6z" fill="currentColor" />
  </svg>
);

export const IconCheck = (p: P) => (
  <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" {...p}>
    <path d="m3.2 8.4 3 3L12.8 4.6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const IconClock = (p: P) => (
  <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" {...p}>
    <circle cx="8" cy="8" r="5.9" stroke="currentColor" strokeWidth="1.4" />
    <path d="M8 4.9V8l2 1.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
);

export const IconLock = (p: P) => (
  <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" {...p}>
    <rect x="3.4" y="7" width="9.2" height="6.6" rx="1.8" stroke="currentColor" strokeWidth="1.4" />
    <path d="M5.6 7V5.4a2.4 2.4 0 0 1 4.8 0V7" stroke="currentColor" strokeWidth="1.4" />
  </svg>
);

export const IconPointer = (p: P) => (
  <svg viewBox="0 0 16 16" aria-hidden="true" {...p}>
    <path d="M4 2.6 12.4 8.6l-3.8.8-2 3.6z" fill="currentColor" />
  </svg>
);

export const IconPlus = (p: P) => (
  <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" {...p}>
    <path d="M8 3.2v9.6M3.2 8h9.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

export const IconRedo = (p: P) => (
  <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" {...p}>
    <path d="M4.4 12.4V9.2a3 3 0 0 1 3-3h4.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="m9.8 3.8 2.4 2.4-2.4 2.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const IconBranch = (p: P) => (
  <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" {...p}>
    <path d="M5 3v10M5 7c0 3 6 1 6 4.5V12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

export const IconArrow = (p: P) => (
  <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" {...p}>
    <path d="M3 8h9.4M8.6 4.2 12.4 8l-3.8 3.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
