'use client';

import { useRef, type CSSProperties } from 'react';
import Typewriter from '../ui/Typewriter';
import { IconLock } from '../ui/Icons';
import { useCountUp, useInView } from '@/lib/hooks';
import styles from './Regions.module.css';

type Region = { code: string; city: string; value: number; lime: boolean };

export type RegionsContent = { label: string; foot: string; regions: Region[] };

const RELAY: RegionsContent = {
  label: 'where runs executed, last 24 hours',
  foot: 'a payload never leaves its region',
  regions: [
    { code: 'eu-central-1', city: 'Frankfurt', value: 46, lime: true },
    { code: 'us-east-1', city: 'Virginia', value: 38, lime: false },
    { code: 'ap-southeast-2', city: 'Sydney', value: 16, lime: false },
  ],
};

function Row({ code, city, value, lime, active }: Region & { active: boolean }) {
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

export default function Regions({ content = RELAY }: { content?: RegionsContent }) {
  const ref = useRef<HTMLUListElement>(null);
  const inView = useInView(ref, { threshold: 0.3 });
  return (
    <>
      <p className="card-label">
        <Typewriter text={content.label} />
      </p>
      <ul ref={ref} className={styles.list}>
        {content.regions.map((r) => (
          <Row key={r.code} {...r} active={inView} />
        ))}
      </ul>
      <p className={`card-label ${styles.foot}`}>
        <IconLock />
        <Typewriter text={content.foot} delay={0.8} />
      </p>
    </>
  );
}
