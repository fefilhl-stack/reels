'use client';

import { useRef, type CSSProperties } from 'react';
import Typewriter from '../ui/Typewriter';
import { IconLock } from '../ui/Icons';
import { useCountUp, useInView } from '@/lib/hooks';
import styles from './Regions.module.css';

const REGIONS = [
  { code: 'eu-central-1', city: 'Frankfurt', value: 46, lime: true },
  { code: 'us-east-1', city: 'Virginia', value: 38, lime: false },
  { code: 'ap-southeast-2', city: 'Sydney', value: 16, lime: false },
];

function Row({ code, city, value, lime, active }: (typeof REGIONS)[number] & { active: boolean }) {
  const v = useCountUp(value, active, 1.8);
  return (
    <li className={styles.row}>
      <span className={styles.where}>
        <b>{code}</b>
        <small>{city}</small>
      </span>
      <span className={`${styles.bar} ${lime ? styles.lime : ''}`} style={{ '--v': v / 100 } as CSSProperties}>
        <i />
        <em />
      </span>
      <span className={styles.value}>{Math.round(v)}%</span>
    </li>
  );
}

export default function Regions() {
  const ref = useRef<HTMLUListElement>(null);
  const inView = useInView(ref, { threshold: 0.3 });
  return (
    <>
      <p className="card-label">
        <Typewriter text="where runs executed, last 24 hours" />
      </p>
      <ul ref={ref} className={styles.list}>
        {REGIONS.map((r) => (
          <Row key={r.code} {...r} active={inView} />
        ))}
      </ul>
      <p className={`card-label ${styles.foot}`}>
        <IconLock />
        <Typewriter text="a payload never leaves its region" delay={0.8} />
      </p>
    </>
  );
}
