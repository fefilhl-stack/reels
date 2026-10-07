'use client';

import { useEffect, useRef, useState } from 'react';
import Avatar from '../ui/Avatar';
import { Chevrons } from '../ui/Icons';
import { useInView } from '@/lib/hooks';
import { prefersReducedMotion } from '@/lib/motion';
import styles from './SlackCard.module.css';

type Phase = 'typing' | 'message' | 'reply';
type Decision = 'approved' | 'held';

/** Relay asks #finance for a yes. It loops on its own; the buttons work too. */
export default function SlackCard() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: false, threshold: 0.35 });
  const [phase, setPhase] = useState<Phase>('message');
  const [decision, setDecision] = useState<Decision>('approved');
  const [byYou, setByYou] = useState(false);

  useEffect(() => {
    if (!prefersReducedMotion()) setPhase('typing');
  }, []);

  useEffect(() => {
    if (!inView || prefersReducedMotion()) return;
    let t = 0;
    if (phase === 'typing') {
      t = window.setTimeout(() => setPhase('message'), 1600);
    } else if (phase === 'message') {
      t = window.setTimeout(() => {
        setByYou(false);
        setDecision('approved');
        setPhase('reply');
      }, 3800);
    } else {
      t = window.setTimeout(() => setPhase('typing'), byYou ? 8000 : 4600);
    }
    return () => window.clearTimeout(t);
  }, [phase, inView, byYou]);

  const decide = (d: Decision) => {
    if (phase !== 'message') return;
    setByYou(true);
    setDecision(d);
    setPhase('reply');
  };

  const approved = decision === 'approved';

  return (
    <div ref={ref} className={`card ${styles.card}`}>
      <div className={styles.head}>
        <b>#finance</b>
        <span>today</span>
      </div>

      <div className={styles.body} aria-live="polite">
        {phase === 'typing' && (
          <div className={styles.typingRow} aria-label="Relay is typing">
            <span className={styles.relay}>
              <Chevrons tone="onLime" />
            </span>
            <span className={styles.typing}>
              <i />
              <i />
              <i />
            </span>
          </div>
        )}

        {phase !== 'typing' && (
          <div className={`${styles.msg} ${styles.in}`}>
            <span className={styles.relay}>
              <Chevrons tone="onLime" />
            </span>
            <div>
              <p className={styles.meta}>
                <b>Relay</b>
                <span className={styles.app}>APP</span>
                <time>09:41</time>
              </p>
              <p>
                Refund of <b>$6,400</b> for Northwind Traders is over 5000 and needs a yes.
              </p>
              <dl className={styles.payload}>
                <div>
                  <dt>amount</dt>
                  <dd>6,400.00 usd</dd>
                </div>
                <div>
                  <dt>reason</dt>
                  <dd>duplicate charge</dd>
                </div>
                <div>
                  <dt>run</dt>
                  <dd>#41982</dd>
                </div>
              </dl>
              <div className={styles.actions}>
                <button
                  type="button"
                  className={`btn btn-lime ${styles.small}`}
                  disabled={phase !== 'message'}
                  data-picked={phase === 'reply' && approved}
                  onClick={() => decide('approved')}
                >
                  Approve
                </button>
                <button
                  type="button"
                  className={`btn btn-dark ${styles.small}`}
                  disabled={phase !== 'message'}
                  data-picked={phase === 'reply' && !approved}
                  onClick={() => decide('held')}
                >
                  Hold
                </button>
                <span className={styles.hint}>or reply in thread</span>
              </div>
            </div>
          </div>
        )}

        {phase === 'reply' && (
          <div className={`${styles.msg} ${styles.in}`}>
            {byYou ? <span className={styles.you}>Y</span> : <Avatar look={4} size={40} className={styles.face} />}
            <div>
              <p className={styles.meta}>
                <b>{byYou ? 'You' : 'Dana Ruiz'}</b>
                <time>09:43</time>
              </p>
              <p>{approved ? 'Approved. The duplicate charge checks out.' : 'Holding this one, I want to check with support first.'}</p>
              <p className={`${styles.status} ${approved ? styles.ok : ''}`}>
                {approved ? '✓ run 41982 continued after 26 min' : '■ run 41982 paused, support was told why'}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
