import type { CSSProperties, ReactNode } from 'react';

/** Eyebrow pill + big heading on the left, a short paragraph on the right. */
export default function SectionHead({ eyebrow, title, aside }: { eyebrow: string; title: ReactNode; aside: ReactNode }) {
  return (
    <header className="section-head">
      <div>
        <p className="eyebrow" data-reveal>
          <i aria-hidden="true" />
          {eyebrow}
        </p>
        <h2 data-reveal="wipe" style={{ '--d': '0.08s' } as CSSProperties}>
          {title}
        </h2>
      </div>
      <p className="section-aside" data-reveal style={{ '--d': '0.2s' } as CSSProperties}>
        {aside}
      </p>
    </header>
  );
}
