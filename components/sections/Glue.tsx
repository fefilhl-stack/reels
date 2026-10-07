import type { CSSProperties } from 'react';
import SectionHead from '../ui/SectionHead';
import RollingNumber from '../ui/RollingNumber';
import RunTimeline from './RunTimeline';
import SlackCard from './SlackCard';
import IsoBarsCard from './IsoBarsCard';
import styles from './Glue.module.css';

const d = (s: number) => ({ '--d': `${s}s` }) as CSSProperties;

const FEATURES = [
  {
    num: '01',
    title: 'One canvas, every branch',
    text: ['Drop a trigger, add a condition, split the path.', 'A step that fails at 3am is retried four times.'],
    visual: <RunTimeline />,
  },
  {
    num: '02',
    title: 'Approvals where people already are',
    text: ['Send a step to Slack, get a yes or a no, keep moving.', 'Nobody learns another dashboard.'],
    visual: <SlackCard />,
    flip: true,
  },
  {
    num: '03',
    title: 'Every run is on the record',
    text: ['Inputs, outputs and timings for 90 days.', 'Replay any run before you trust it with money.'],
    visual: <IsoBarsCard />,
  },
];

export default function Glue() {
  return (
    <section id="product" className={`section ${styles.glue}`} data-scene="sweep">
      <div className="container">
        <SectionHead
          eyebrow="content service"
          title={
            <>
              Most of a process is <em>glue.</em>
            </>
          }
          aside="Copy this into that. Check it went through. Ask Dana if it is fine. Relay takes the glue and leaves you the decisions."
        />

        <div className={styles.features}>
          {FEATURES.map((f) => (
            <article key={f.num} className={`${styles.feature} ${f.flip ? styles.flip : ''}`}>
              <div className={styles.copy}>
                <RollingNumber value={f.num} className={styles.num} />
                <h3 data-reveal="wipe">{f.title}</h3>
                <p data-reveal style={d(0.12)}>
                  {f.text[0]}{' '}
                  <br />
                  {f.text[1]}
                </p>
              </div>
              <div className={styles.visual} data-reveal style={d(0.06)}>
                {f.visual}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
