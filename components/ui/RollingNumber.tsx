'use client';

import { useRef } from 'react';
import { useInView } from '@/lib/hooks';
import styles from './RollingNumber.module.css';

const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

/** Odometer-style number: each digit rolls into place, and rolls again whenever the value changes. */
export default function RollingNumber({ value, className, delay = 0 }: { value: string; className?: string; delay?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { threshold: 0 });

  return (
    <span ref={ref} className={`${styles.roll} ${inView ? '' : styles.idle} ${className ?? ''}`}>
      <span className="sr-only">{value}</span>
      {value.split('').map((ch, i) => {
        if (!/\d/.test(ch)) {
          return (
            <span key={i} aria-hidden="true">
              {ch}
            </span>
          );
        }
        const d = Number(ch);
        const shown = inView ? d : 0;
        return (
          <span key={i} className={styles.col} aria-hidden="true">
            <span
              className={styles.strip}
              style={{ transform: `translateY(${-shown * 10}%)`, transitionDelay: `${delay + i * 0.09}s` }}
            >
              {DIGITS.map((n) => (
                <span key={n}>{n}</span>
              ))}
            </span>
          </span>
        );
      })}
    </span>
  );
}
