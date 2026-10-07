/* Illustrated portrait avatars (no stock photos needed). */

type Look = {
  bg: [string, string];
  skin: string;
  shade: string;
  hair: string;
  shirt: string;
  style: 'short' | 'grey' | 'beard' | 'side' | 'long';
};

const LOOKS: Look[] = [
  { bg: ['#d9dbd6', '#9da19a'], skin: '#e6c3a6', shade: '#c9a283', hair: '#3a302a', shirt: '#2c3440', style: 'short' },
  { bg: ['#d6d4cf', '#a19c95'], skin: '#efd2bd', shade: '#d3b097', hair: '#c5c1ba', shirt: '#4a4f56', style: 'grey' },
  { bg: ['#cfd3d6', '#8c949b'], skin: '#d2a684', shade: '#b48765', hair: '#241d19', shirt: '#1f2328', style: 'beard' },
  { bg: ['#d7d8d4', '#999d96'], skin: '#e9c7ab', shade: '#cba68a', hair: '#1c1714', shirt: '#33393f', style: 'side' },
  { bg: ['#d8d2cf', '#a09590'], skin: '#e4bf9f', shade: '#c79f80', hair: '#2a1d17', shirt: '#22262b', style: 'long' },
];

export default function Avatar({ look = 0, size = 46, className }: { look?: number; size?: number; className?: string }) {
  const l = LOOKS[look % LOOKS.length];
  const id = `av${look}`;
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} className={className} aria-hidden="true">
      <defs>
        <linearGradient id={`${id}bg`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={l.bg[0]} />
          <stop offset="1" stopColor={l.bg[1]} />
        </linearGradient>
        <clipPath id={`${id}c`}>
          <circle cx="20" cy="20" r="20" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id}c)`}>
        <rect width="40" height="40" fill={`url(#${id}bg)`} />
        {l.style === 'long' && (
          <path d="M11.4 18C11 9.4 15 6.8 20 6.8S29 9.4 28.6 18l1.2 13c-3.6 1.6-16 1.6-19.6 0z" fill={l.hair} />
        )}
        <path d="M3 41c1.6-8.8 8.6-12.4 17-12.4S35.4 32.2 37 41z" fill={l.shirt} />
        <rect x="16.4" y="21.6" width="7.2" height="8" rx="2.6" fill={l.shade} />
        <ellipse cx="20" cy="17" rx="7" ry="8.2" fill={l.skin} />
        {l.style === 'short' && (
          <path d="M12.6 16.2C12.3 10.2 15.6 7.6 20 7.6s7.7 2.6 7.4 8.6c-1-3-3.1-4.4-7.4-4.6-4.2.2-6.4 1.6-7.4 4.6z" fill={l.hair} />
        )}
        {l.style === 'grey' && (
          <path d="M12.8 17.2c-.2-5 2.2-7.8 7.2-7.8s7.4 2.8 7.2 7.8c-.8-2.4-1.6-3.6-2.6-4-2.6-.8-6.6-.8-9.2 0-1 .4-1.8 1.6-2.6 4z" fill={l.hair} />
        )}
        {l.style === 'beard' && (
          <>
            <path d="M12.7 15.6c-.2-5.4 3-8 7.3-8s7.5 2.6 7.3 8c-1.2-2.6-3.4-3.8-7.3-3.9-3.9.1-6.1 1.3-7.3 3.9z" fill={l.hair} />
            <path d="M13.3 18.4c.4 5.2 3.2 7.4 6.7 7.4s6.3-2.2 6.7-7.4c-1.6 2.4-3.6 3.2-6.7 3.2s-5.1-.8-6.7-3.2z" fill={l.hair} opacity="0.92" />
          </>
        )}
        {l.style === 'side' && (
          <path d="M12.6 16.6c-.6-6.2 3-9.2 7.6-9.2 4.8 0 7.6 2.8 7.2 8.4-.8-2.2-1.8-3.4-3-3.8-3.4.4-7.6-.2-9.6-1.6-.6 1.6-1.4 3.6-2.2 6.2z" fill={l.hair} />
        )}
        {l.style === 'long' && (
          <path d="M12.8 15c.7-4.5 3.2-6.4 7.2-6.4s6.6 1.9 7.2 6.4c-3.2-2.8-6.2-3.5-8.2-3.2-2.6.4-4.6 1.6-6.2 3.2z" fill={l.hair} />
        )}
      </g>
    </svg>
  );
}
