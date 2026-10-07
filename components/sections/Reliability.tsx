import type { CSSProperties } from 'react';
import SectionHead from '../ui/SectionHead';
import Typewriter from '../ui/Typewriter';
import Hub from './Hub';
import Regions from './Regions';
import styles from './Reliability.module.css';

export default function Reliability() {
  return (
    <section id="how" className={`section ${styles.reliability}`} data-scene="edge">
      <div className="container">
        <SectionHead
          eyebrow="reliability"
          title={
            <>
              <em>Boring</em> in the ways that matter.
            </>
          }
          aside="Credentials, retries, rate limits, residency. The parts nobody demos, and the parts that decide the year."
        />

        <div className={styles.grid}>
          <article className={`card ${styles.card}`} data-reveal>
            <h3>One runtime, every app</h3>
            <p>Relay holds the credentials, retries and rate limits, so a step behaves the same on Stripe or on the API you wrote last week.</p>
            <p className="card-label">
              <Typewriter text="one runtime, every connection" />
            </p>
            <Hub />
            <p className={`card-label ${styles.foot}`}>
              <Typewriter text="credentials, retries, rate limits, replays" delay={0.6} />
            </p>
          </article>

          <article className={`card ${styles.card}`} data-reveal style={{ '--d': '0.1s' } as CSSProperties}>
            <h3>Runs where your data lives</h3>
            <p>Pick Frankfurt, Virginia or Sydney. Payloads and logs stay in the region you chose, and the audit trail says so in writing.</p>
            <Regions />
          </article>
        </div>
      </div>
    </section>
  );
}
