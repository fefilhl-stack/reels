'use client';

import { useState, type CSSProperties, type FormEvent } from 'react';
import { TurboMark } from '../ui/Icons';
import { EMAIL, PHONE_HREF, TELEGRAM, YOUTUBE } from './content';
import styles from '../sections/FinalCta.module.css';

const CONTACTS = [
  { label: 'tg', name: 'Telegram-канал ТУРБО live', href: TELEGRAM },
  { label: 'yt', name: 'YouTube-канал ТУРБО', href: YOUTUBE },
  { label: '@', name: `Почта ${EMAIL}`, href: `mailto:${EMAIL}` },
  { label: 'тел', name: 'Позвонить', href: PHONE_HREF },
];

export default function Demo() {
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
    <section id="demo" className={styles.final} data-scene="finale">
      <div className={`container ${styles.grid}`}>
        <div className={`card ${styles.brand}`} data-reveal>
          <a className={styles.logo} href="#top" aria-label="ТУРБО, наверх">
            <span className={styles.mark}>
              <TurboMark tone="onLime" />
            </span>
            ТУРБО
          </a>
          <svg className={styles.bigMark} viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M3.2 11h3.6M4.6 14.6h3M8.4 6.4h11.2M14.4 6.4 12 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <p className={styles.tagline}>Российская платформа для систем управления бизнесом.</p>
          <div className={styles.touch}>
            <span className="card-label">на связи</span>
            <nav aria-label="Контакты">
              {CONTACTS.map((s) => (
                <a key={s.label} href={s.href} aria-label={s.name} {...(s.href.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
                  {s.label}
                </a>
              ))}
            </nav>
          </div>
        </div>

        <div className={styles.cta} data-reveal style={{ '--d': '0.1s' } as CSSProperties}>
          <span className={styles.kicker}>что дальше</span>
          <h2>
            Покажем ТУРБО <em>на ваших</em> данных.
          </h2>
          <p>Расскажите, какой процесс тормозит сильнее всего. Мы предложим решение и покажем его в работе.</p>
          {state === 'sent' ? (
            <p className={styles.sent} role="status">
              Спасибо! Мы свяжемся с вами по адресу {email.trim()}.
            </p>
          ) : (
            <form className={styles.form} onSubmit={submit} noValidate>
              <label htmlFor="work-email" className="sr-only">
                Рабочая почта
              </label>
              <input
                id="work-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="Рабочая почта"
                value={email}
                aria-invalid={state === 'error'}
                aria-describedby={state === 'error' ? 'email-error' : undefined}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (state === 'error') setState('idle');
                }}
              />
              <button type="submit">Запросить демо</button>
            </form>
          )}
          {state === 'error' && (
            <p id="email-error" className={styles.error} role="alert">
              Похоже, в адресе ошибка.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
