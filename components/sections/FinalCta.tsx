'use client';

import { useState, type CSSProperties, type FormEvent } from 'react';
import { Chevrons } from '../ui/Icons';
import styles from './FinalCta.module.css';

const SOCIAL = [
  { label: 'in', name: 'LinkedIn' },
  { label: 'x', name: 'X' },
  { label: 'gh', name: 'GitHub' },
  { label: 'dc', name: 'Discord' },
];

export default function FinalCta() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'error' | 'sent'>('idle');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setState('error');
      return;
    }
    setState('sent');
  };

  return (
    <section id="start" className={styles.final} data-scene="finale">
      <div className={`container ${styles.grid}`}>
        <div className={`card ${styles.brand}`} data-reveal>
          <a className={styles.logo} href="#top" aria-label="Relay, back to top">
            <span className={styles.mark}>
              <Chevrons tone="onLime" />
            </span>
            Relay
          </a>
          <svg className={styles.bigMark} viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M5.4 5.6 11.6 12l-6.2 6.4M11.6 5.6 17.8 12l-6.2 6.4" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <p className={styles.tagline}>Automation for the work that lives between your tools.</p>
          <div className={styles.touch}>
            <span className="card-label">stay in touch</span>
            <nav aria-label="Social">
              {SOCIAL.map((s) => (
                <a key={s.label} href="#start" aria-label={s.name}>
                  {s.label}
                </a>
              ))}
            </nav>
          </div>
        </div>

        <div className={styles.cta} data-reveal style={{ '--d': '0.1s' } as CSSProperties}>
          <span className={styles.kicker}>what now</span>
          <h2>
            Pick the task you <em>hate</em> most.
          </h2>
          <p>Bring one job nobody enjoys doing by hand. If Relay cannot run it by the end of the trial, we will tell you so.</p>
          {state === 'sent' ? (
            <p className={styles.sent} role="status">
              Check {email.trim()} for a link. Your workspace is ready when you are.
            </p>
          ) : (
            <form className={styles.form} onSubmit={submit} noValidate>
              <label htmlFor="work-email" className="sr-only">
                Work email
              </label>
              <input
                id="work-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="Work email"
                value={email}
                aria-invalid={state === 'error'}
                aria-describedby={state === 'error' ? 'email-error' : undefined}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (state === 'error') setState('idle');
                }}
              />
              <button type="submit">Start free</button>
            </form>
          )}
          {state === 'error' && (
            <p id="email-error" className={styles.error} role="alert">
              That does not look like an email address yet.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
