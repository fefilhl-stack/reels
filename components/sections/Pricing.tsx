'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import SectionHead from '../ui/SectionHead';
import { IconCheck } from '../ui/Icons';
import { useInView } from '@/lib/hooks';
import { clamp, easeInOut, formatNumber, prefersReducedMotion } from '@/lib/motion';
import styles from './Pricing.module.css';

const MIN = 3000;
const MAX = 600000; // log scale: 3k, 30k and 300k land at 0%, 43% and 87%
const STEPS = 1000;
const DEFAULT_RUNS = 30000;
const TICKS = [3000, 30000, 300000];

const PLANS = [
  {
    key: 'starter',
    name: 'Starter',
    price: 29,
    included: 3000,
    cta: 'Start free',
    features: ['3,000 runs a month', '10 workflows', '7 days of run history', 'email support'],
  },
  {
    key: 'team',
    name: 'Team',
    price: 89,
    included: 30000,
    cta: 'Start free',
    badge: 'most picked',
    features: ['30,000 runs a month', 'unlimited workflows', '90 days of run history', 'Slack approvals and code steps'],
  },
  {
    key: 'scale',
    name: 'Scale',
    price: 290,
    included: 300000,
    cta: 'Talk to us',
    features: ['300,000 runs a month', 'single sign on and audit log', '1 year of run history', 'named engineer, 4 hour response'],
  },
] as const;

const toPos = (runs: number) => (Math.log(runs / MIN) / Math.log(MAX / MIN)) * STEPS;
function toRuns(pos: number) {
  const v = MIN * Math.pow(MAX / MIN, pos / STEPS);
  const step = v < 10000 ? 500 : v < 100000 ? 1000 : 5000;
  return clamp(Math.round(v / step) * step, MIN, MAX);
}

function estimate(runs: number) {
  const plan = PLANS.find((p) => runs <= p.included) ?? PLANS[2];
  const extra = Math.max(0, runs - plan.included);
  return { plan, extra, price: plan.price + Math.ceil(extra / 1000) };
}

export default function Pricing() {
  const boxRef = useRef<HTMLDivElement>(null);
  const inView = useInView(boxRef, { threshold: 0.35 });
  const [pos, setPos] = useState(toPos(DEFAULT_RUNS));
  const touched = useRef(false);

  useEffect(() => {
    if (!prefersReducedMotion()) setPos(0);
  }, []);

  // on first view, the knob slides from the start to the default estimate
  useEffect(() => {
    if (!inView || touched.current || prefersReducedMotion()) return;
    const to = toPos(DEFAULT_RUNS);
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

  const runs = toRuns(pos);
  const { plan, extra, price } = estimate(runs);
  const f = pos / STEPS;
  const nearest = TICKS.reduce((a, b) => (Math.abs(toPos(b) - pos) < Math.abs(toPos(a) - pos) ? b : a));

  return (
    <section id="pricing" className={`section ${styles.pricing}`} data-scene="wave">
      <div className="container">
        <SectionHead
          eyebrow="pricing"
          title={
            <>
              You pay for runs, not <em>for seats.</em>
            </>
          }
          aside="Invite the whole company on any plan. Nobody should ask permission to automate their own job."
        />

        <div ref={boxRef} className={`card ${styles.estimate}`} data-reveal>
          <div className={styles.control}>
            <span className="card-label">estimate</span>
            <label htmlFor="runs" className={styles.question}>
              How many runs do you expect a month?
            </label>
            <div className={styles.range} style={{ '--p': f } as CSSProperties}>
              <input
                id="runs"
                type="range"
                min={0}
                max={STEPS}
                step={1}
                value={Math.round(pos)}
                aria-valuetext={`${formatNumber(runs)} runs a month`}
                onChange={(e) => {
                  touched.current = true;
                  setPos(Number(e.target.value));
                }}
              />
              <div className={styles.scale} aria-hidden="true">
                {TICKS.map((t) => (
                  <span key={t} className={t === nearest ? styles.near : undefined} style={{ left: `${(toPos(t) / STEPS) * 100}%` }}>
                    {formatNumber(t)}
                  </span>
                ))}
              </div>
            </div>
            <output htmlFor="runs" className={styles.runs}>
              {formatNumber(runs)} runs a month
            </output>
          </div>

          <div className={styles.result} aria-live="polite">
            <span className="card-label">your plan</span>
            <p className={styles.planName}>{plan.name}</p>
            <p className={styles.price}>
              <b>${formatNumber(price)}</b>
              <span>a month</span>
            </p>
            <p className={styles.included}>
              {formatNumber(plan.included)} runs included
              {extra > 0 && <> + {formatNumber(extra)} at $1 per thousand</>}
            </p>
            <a className="btn btn-lime btn-block" href="#start">
              Start free
            </a>
          </div>
        </div>

        <div className={styles.plans}>
          {PLANS.map((p, i) => (
            <article key={p.key} className={styles.planWrap} data-reveal style={{ '--d': `${0.06 + i * 0.08}s` } as CSSProperties}>
              <div className={`card ${styles.plan}`} data-active={p.key === plan.key}>
                {'badge' in p && <span className={styles.badge}>{p.badge}</span>}
                <span className={styles.planLabel}>{p.name}</span>
                <p className={styles.planPrice}>${p.price}</p>
                <span className={styles.per}>a month</span>
                <ul>
                  {p.features.map((x) => (
                    <li key={x}>
                      <IconCheck />
                      {x}
                    </li>
                  ))}
                </ul>
                <a className={`btn btn-block ${p.key === plan.key ? 'btn-lime' : 'btn-dark'}`} href="#start">
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
