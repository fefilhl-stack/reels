'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import Typewriter from '../ui/Typewriter';
import { useInView } from '@/lib/hooks';
import { prefersReducedMotion } from '@/lib/motion';
import styles from './Apps.module.css';

const RELAY_APPS: [string, string][] = [
  ['SL', 'slack'],
  ['ST', 'stripe'],
  ['PG', 'postgres'],
  ['HS', 'hubspot'],
  ['NO', 'notion'],
  ['GM', 'gmail'],
  ['WH', 'webhooks'],
];

/** Row of connected apps; a lime pulse hops along the dotted line from one to the next. */
type Props = { apps?: [code: string, name: string][]; label?: string; aria?: string };

export default function Apps({
  apps: APPS = RELAY_APPS,
  label = 'connects to 240 apps, and to whatever you wrote yourself',
  aria = 'Integrations',
}: Props) {
  const listRef = useRef<HTMLOListElement>(null);
  const inView = useInView(listRef, { once: false, threshold: 0.2 });
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (!inView || prefersReducedMotion()) return;
    const id = window.setInterval(() => setActive((a) => (a + 1) % APPS.length), 1700);
    return () => window.clearInterval(id);
  }, [inView, APPS.length]);

  return (
    <section className={styles.apps} data-scene="arc" aria-label={aria}>
      <div className="container">
        <p className={`mono ${styles.label}`}>
          <Typewriter text={label} speed={30} />
        </p>
        <ol ref={listRef} className={styles.row} style={{ '--n': APPS.length } as CSSProperties}>
          {APPS.map(([code, name], i) => (
            <li key={code} data-reveal style={{ '--d': `${0.08 + i * 0.12}s` } as CSSProperties}>
              <div className={styles.item} data-active={i === active}>
                <span className={styles.tile}>{code}</span>
                <span className={styles.name}>{name}</span>
              </div>
            </li>
          ))}
          <li key={`runner-${active}`} className={styles.runner} style={{ '--i': active } as CSSProperties} aria-hidden="true" />
        </ol>
      </div>
    </section>
  );
}
