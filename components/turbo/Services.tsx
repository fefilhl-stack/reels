'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import SectionHead from '../ui/SectionHead';
import { IconCheck } from '../ui/Icons';
import { useInView } from '@/lib/hooks';
import { clamp, easeInOut, prefersReducedMotion } from '@/lib/motion';
import styles from '../sections/Pricing.module.css';

const MIN = 10;
const MAX = 10000; // log scale
const STEPS = 1000;
const DEFAULT_USERS = 300;
const TICKS = [50, 500, 5000];

// цен на сайте нет, поэтому вместо тарифов форматы работы
const FORMATS = [
  {
    key: 'pilot',
    name: 'Пилот',
    upTo: 50,
    audience: 'до 50 человек',
    per: 'один процесс на ваших данных',
    cta: 'Обсудить пилот',
    features: ['демо на ваших данных', 'процесс от начала до конца', 'методология ТУРБО Старт', 'обучение ключевых пользователей'],
  },
  {
    key: 'project',
    name: 'Внедрение',
    upTo: 1000,
    audience: 'до 1 000 человек',
    per: 'проект под ключ',
    cta: 'Обсудить проект',
    badge: 'основной',
    features: ['предпроектный и проектный консалтинг', 'ERP, бюджетирование или ТОРО', 'миграция данных и интеграции', 'техподдержка и база знаний'],
  },
  {
    key: 'group',
    name: 'Холдинг',
    upTo: Infinity,
    audience: 'от 1 000 человек',
    per: 'группа компаний и высокая нагрузка',
    cta: 'Связаться с нами',
    features: ['высоконагруженный контур на ТУРБО X', 'консолидация группы компаний', 'свои приложения на платформе', 'поддержка партнёров по всей России'],
  },
] as const;

const ru = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
function users(n: number) {
  const m10 = n % 10;
  const m100 = n % 100;
  const word = m10 === 1 && m100 !== 11 ? 'пользователь' : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? 'пользователя' : 'пользователей';
  return `${ru(n)} ${word}`;
}

const toPos = (n: number) => (Math.log(n / MIN) / Math.log(MAX / MIN)) * STEPS;
function toUsers(pos: number) {
  const v = MIN * Math.pow(MAX / MIN, pos / STEPS);
  const step = v < 100 ? 5 : v < 1000 ? 10 : 100;
  return clamp(Math.round(v / step) * step, MIN, MAX);
}

export default function Services() {
  const boxRef = useRef<HTMLDivElement>(null);
  const inView = useInView(boxRef, { threshold: 0.35 });
  const [pos, setPos] = useState(toPos(DEFAULT_USERS));
  const touched = useRef(false);

  useEffect(() => {
    if (!prefersReducedMotion()) setPos(0);
  }, []);

  // при первом показе ползунок доезжает до значения по умолчанию
  useEffect(() => {
    if (!inView || touched.current || prefersReducedMotion()) return;
    const to = toPos(DEFAULT_USERS);
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      if (touched.current) return;
      const p = Math.min(1, (now - t0) / 1600);
      setPos(to * easeInOut(p));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView]);

  const n = toUsers(pos);
  const format = FORMATS.find((f) => n <= f.upTo) ?? FORMATS[2];
  const f = pos / STEPS;
  const nearest = TICKS.reduce((a, b) => (Math.abs(toPos(b) - pos) < Math.abs(toPos(a) - pos) ? b : a));

  return (
    <section id="services" className={`section ${styles.pricing}`} data-scene="wave">
      <div className="container">
        <SectionHead
          eyebrow="внедрение"
          title={
            <>
              Начните с одного процесса, <em>а не с ТЗ на год.</em>
            </>
          }
          aside="Консалтинг, внедрение по методологии ТУРБО Старт, обучение и поддержка. Работаем сами и вместе с партнёрами по всей России."
        />

        <div ref={boxRef} className={`card ${styles.estimate}`} data-reveal>
          <div className={styles.control}>
            <span className="card-label">подбор формата</span>
            <label htmlFor="users" className={styles.question}>
              Сколько человек будет работать в системе?
            </label>
            <div className={styles.range} style={{ '--p': f } as CSSProperties}>
              <input
                id="users"
                type="range"
                min={0}
                max={STEPS}
                step={1}
                value={Math.round(pos)}
                aria-valuetext={users(n)}
                onChange={(e) => {
                  touched.current = true;
                  setPos(Number(e.target.value));
                }}
              />
              <div className={styles.scale} aria-hidden="true">
                {TICKS.map((t) => (
                  <span key={t} className={t === nearest ? styles.near : undefined} style={{ left: `${(toPos(t) / STEPS) * 100}%` }}>
                    {ru(t)}
                  </span>
                ))}
              </div>
            </div>
            <output htmlFor="users" className={styles.runs}>
              {users(n)}
            </output>
          </div>

          <div className={styles.result} aria-live="polite">
            <span className="card-label">подойдёт формат</span>
            <p className={styles.price}>
              <b>{format.name}</b>
            </p>
            <p className={styles.included}>{format.per}</p>
            <a className="btn btn-lime btn-block" href="#demo">
              {format.cta}
            </a>
          </div>
        </div>

        <div className={styles.plans}>
          {FORMATS.map((p, i) => (
            <article key={p.key} className={styles.planWrap} data-reveal style={{ '--d': `${0.06 + i * 0.08}s` } as CSSProperties}>
              <div className={`card ${styles.plan}`} data-active={p.key === format.key}>
                {'badge' in p && <span className={styles.badge}>{p.badge}</span>}
                <span className={styles.planLabel}>{p.audience}</span>
                <p className={styles.planPrice}>{p.name}</p>
                <span className={styles.per}>{p.per}</span>
                <ul>
                  {p.features.map((x) => (
                    <li key={x}>
                      <IconCheck />
                      {x}
                    </li>
                  ))}
                </ul>
                <a className={`btn btn-block ${p.key === format.key ? 'btn-lime' : 'btn-dark'}`} href="#demo">
                  {p.cta}
                </a>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
