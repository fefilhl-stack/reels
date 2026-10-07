'use client';

import { useRef, type CSSProperties } from 'react';
import SectionHead from '../ui/SectionHead';
import { useCountUp, useInView } from '@/lib/hooks';
import { seeded } from '@/lib/motion';
import styles from '../sections/Cases.module.css';

const CLIENTS = 1000;
const YEARS = new Date().getFullYear() - 1991;
const LOCAL = 100;
const BARS = 14;

// thin space between thousands, as in Russian typesetting
const ru = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

const rnd = seeded(23);
const SPARK = Array.from({ length: 22 }, (_, i) => {
  const f = i / 21;
  return 0.18 + Math.pow(f, 1.25) * 0.66 + (rnd() - 0.5) * 0.07;
});

// публичные кейсы с turbosolution.ru, своими словами, без выдуманных цитат
const CASES = [
  {
    text: 'Консолидированная отчётность по МСФО на ТУРБО вместо Oracle HFM. Проект победил в конкурсе Global CIO и получил Национальную банковскую премию.',
    name: 'ВТБ',
    role: 'банк / консолидация по мсфо',
  },
  {
    text: 'Консолидированная отчётность на российском ПО ТУРБО. Проект миграции назван лучшим в ритейле на ComNews Awards.',
    name: 'АШАН',
    role: 'ритейл / миграция на российское по',
  },
  {
    text: 'На фондовом рынке всё нужно делать вовремя, быстро и без ошибок. С переходом на ТУРБО X эффективность сервисов вышла на новый уровень.',
    name: 'Райффайзенбанк',
    role: 'банк / фондовый рынок',
  },
];

function Sparkline({ p }: { p: number }) {
  const W = 300;
  const H = 80;
  const pts = SPARK.map((v, i) => [(i / (SPARK.length - 1)) * W, H - v * H] as const);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const area = `${line} L${W} ${H} L0 ${H} Z`;
  const reach = Math.max(0.001, p);
  const end = pts[Math.min(pts.length - 1, Math.round(reach * (pts.length - 1)))];
  return (
    <svg className={styles.spark} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="rgba(192,243,73,0.22)" />
          <stop offset="1" stopColor="rgba(192,243,73,0)" />
        </linearGradient>
        <clipPath id="sparkClip">
          <rect width={W * reach} height={H + 10} y={-5} />
        </clipPath>
      </defs>
      <g clipPath="url(#sparkClip)">
        <path d={area} fill="url(#sparkFill)" />
        <path d={line} className={styles.sparkLine} />
      </g>
      <line x1={end[0]} x2={end[0]} y1={end[1]} y2={H} className={styles.sparkDrop} />
      <circle cx={end[0]} cy={end[1]} r={3.2} className={styles.sparkDot} />
    </svg>
  );
}

export default function Clients() {
  const statsRef = useRef<HTMLDivElement>(null);
  const inView = useInView(statsRef, { threshold: 0.3 });
  const clients = useCountUp(CLIENTS, inView, 2.8);
  const years = useCountUp(YEARS, inView, 2.8);
  const local = useCountUp(LOCAL, inView, 2.8);
  const lit = Math.round((years / YEARS) * BARS);

  return (
    <section id="clients" className={`section ${styles.cases}`} data-scene="loop">
      <div className="container">
        <SectionHead
          eyebrow="клиенты"
          title={
            <>
              Цифры <em>без звёздочек.</em>
            </>
          }
          aside="ТУРБО выбрали больше тысячи российских компаний: среди них Ростелеком, Ингосстрах, концерн ВКО «Алмаз-Антей», Takeda, Gorenje и BERG."
        />

        <div ref={statsRef} className={styles.stats}>
          <div className={styles.stat} data-reveal>
            <span className="card-label">клиенты</span>
            <b>
              {ru(clients)}
              {clients >= CLIENTS && '+'}
            </b>
            <span className={styles.sub}>компаний выбрали решения ТУРБО</span>
            <Sparkline p={clients / CLIENTS} />
          </div>
          <div className={styles.stat} data-reveal style={{ '--d': '0.08s' } as CSSProperties}>
            <span className="card-label">опыт</span>
            <b>{Math.round(years)}</b>
            <span className={styles.sub}>лет: первый коммерческий ТУРБО вышел в 1991 году</span>
            <div className={styles.bars} aria-hidden="true">
              {Array.from({ length: BARS }, (_, i) => (
                <i key={i} className={i < lit ? styles.barOn : undefined} style={{ '--i': i } as CSSProperties} />
              ))}
            </div>
          </div>
          <div className={styles.stat} data-reveal style={{ '--d': '0.16s' } as CSSProperties}>
            <span className="card-label">импортонезависимость</span>
            <b>{Math.round(local)}%</b>
            <span className={styles.sub}>российская разработка, платформа в Едином реестре ПО</span>
            <div className={styles.progress} aria-hidden="true">
              <i style={{ width: `${local}%` }} />
            </div>
          </div>
        </div>

        <div className={styles.quotes}>
          {CASES.map((q, i) => (
            <figure key={q.name} className={styles.quote} data-reveal style={{ '--d': `${i * 0.1}s` } as CSSProperties}>
              <blockquote>{q.text}</blockquote>
              <figcaption>
                <b>{q.name}</b>
                <span>{q.role}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
