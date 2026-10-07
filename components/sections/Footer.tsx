import { Chevrons } from '../ui/Icons';
import styles from './Footer.module.css';

const COLUMNS = [
  { title: 'product', links: [['Canvas', '#product'], ['Apps', '#top'], ['Run history', '#product'], ['Pricing', '#pricing']] },
  { title: 'learn', links: [['Docs', '#top'], ['Templates', '#top'], ['Changelog', '#top'], ['Status', '#how']] },
  { title: 'company', links: [['About', '#top'], ['Careers', '#top'], ['Security', '#how'], ['Contact', '#start']] },
  { title: 'legal', links: [['Privacy', '#top'], ['Terms', '#top'], ['Cookies', '#top']] },
];

export default function Footer() {
  return (
    <footer className={styles.footer}>
      <div className="container">
        <ul className={styles.status}>
          <li>
            <i className="status-dot" />
            all systems normal
          </li>
          <li>
            <i />
            99% pass on the first attempt
          </li>
          <li>
            <i />
            three regions, no cross border hops
          </li>
        </ul>

        <div className={styles.main}>
          <div className={styles.about}>
            <a className={styles.logo} href="#top" aria-label="Relay Labs, back to top">
              <span className={styles.mark}>
                <Chevrons tone="onLime" />
              </span>
              Relay Labs
            </a>
            <p>Independent, profitable, and boring on purpose since 2024.</p>
            <p className={styles.badges}>SOC 2 Type II / audit log / data residency</p>
          </div>
          <nav className={styles.cols} aria-label="Footer">
            {COLUMNS.map((c) => (
              <div key={c.title}>
                <p>{c.title}</p>
                {c.links.map(([label, href]) => (
                  <a key={label} href={href}>
                    {label}
                  </a>
                ))}
              </div>
            ))}
          </nav>
        </div>

        <div className={styles.bottom}>
          <span>2026, all rights reserved</span>
          <span>built in Lisbon and Kraków</span>
        </div>
      </div>
    </footer>
  );
}
