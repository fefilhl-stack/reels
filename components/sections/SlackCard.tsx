'use client';

import { useEffect, useRef, useState } from 'react';
import Avatar from '../ui/Avatar';
import { MARKS, type MarkName } from '../ui/Icons';
import { useInView } from '@/lib/hooks';
import { prefersReducedMotion } from '@/lib/motion';
import styles from './SlackCard.module.css';

type Phase = 'typing' | 'message' | 'reply';
type Decision = 'approved' | 'held';

export type ApprovalContent = {
  channel: string;
  day: string;
  bot: string;
  mark: MarkName;
  badge: string;
  typing: string;
  /** the request; `amount` is shown in bold between `before` and `after` */
  ask: { before: string; amount: string; after: string };
  payload: [string, string][];
  buttons: [approve: string, hold: string];
  hint: string;
  you: [initial: string, name: string];
  person: string;
  times: [string, string];
  replies: { approved: string; held: string };
  results: { approved: string; held: string };
};

const RELAY: ApprovalContent = {
  channel: '#finance',
  day: 'today',
  bot: 'Relay',
  mark: 'relay',
  badge: 'APP',
  typing: 'Relay is typing',
  ask: { before: 'Refund of ', amount: '$6,400', after: ' for Northwind Traders is over 5000 and needs a yes.' },
  payload: [
    ['amount', '6,400.00 usd'],
    ['reason', 'duplicate charge'],
    ['run', '#41982'],
  ],
  buttons: ['Approve', 'Hold'],
  hint: 'or reply in thread',
  you: ['Y', 'You'],
  person: 'Dana Ruiz',
  times: ['09:41', '09:43'],
  replies: { approved: 'Approved. The duplicate charge checks out.', held: 'Holding this one, I want to check with support first.' },
  results: { approved: '✓ run 41982 continued after 26 min', held: '■ run 41982 paused, support was told why' },
};

/** Relay asks #finance for a yes. It loops on its own; the buttons work too. */
export default function SlackCard({ content: c = RELAY }: { content?: ApprovalContent }) {
  const Bot = MARKS[c.mark];
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
        <b>{c.channel}</b>
        <span>{c.day}</span>
      </div>

      <div className={styles.body} aria-live="polite">
        {phase === 'typing' && (
          <div className={styles.typingRow} aria-label={c.typing}>
            <span className={styles.relay}>
              <Bot tone="onLime" />
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
              <Bot tone="onLime" />
            </span>
            <div>
              <p className={styles.meta}>
                <b>{c.bot}</b>
                <span className={styles.app}>{c.badge}</span>
                <time>{c.times[0]}</time>
              </p>
              <p>
                {c.ask.before}
                <b>{c.ask.amount}</b>
                {c.ask.after}
              </p>
              <dl className={styles.payload}>
                {c.payload.map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
              <div className={styles.actions}>
                <button
                  type="button"
                  className={`btn btn-lime ${styles.small}`}
                  disabled={phase !== 'message'}
                  data-picked={phase === 'reply' && approved}
                  onClick={() => decide('approved')}
                >
                  {c.buttons[0]}
                </button>
                <button
                  type="button"
                  className={`btn btn-dark ${styles.small}`}
                  disabled={phase !== 'message'}
                  data-picked={phase === 'reply' && !approved}
                  onClick={() => decide('held')}
                >
                  {c.buttons[1]}
                </button>
                <span className={styles.hint}>{c.hint}</span>
              </div>
            </div>
          </div>
        )}

        {phase === 'reply' && (
          <div className={`${styles.msg} ${styles.in}`}>
            {byYou ? <span className={styles.you}>{c.you[0]}</span> : <Avatar look={4} size={40} className={styles.face} />}
            <div>
              <p className={styles.meta}>
                <b>{byYou ? c.you[1] : c.person}</b>
                <time>{c.times[1]}</time>
              </p>
              <p>{approved ? c.replies.approved : c.replies.held}</p>
              <p className={`${styles.status} ${approved ? styles.ok : ''}`}>
                {approved ? c.results.approved : c.results.held}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
