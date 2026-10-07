'use client';

import { useEffect, useState } from 'react';
import { MARKS, type MarkName } from './ui/Icons';
import styles from './Header.module.css';

type Link = { href: string; label: string };

export type HeaderContent = {
  brand: string;
  brandLabel: string;
  mark: MarkName;
  links: Link[];
  cta: Link;
  status: string;
  navLabel: string;
  menu: [open: string, close: string];
};

const RELAY: HeaderContent = {
  brand: 'Relay',
  brandLabel: 'Relay, back to top',
  mark: 'relay',
  links: [
    { href: '#product', label: 'Product' },
    { href: '#how', label: 'How it works' },
    { href: '#customers', label: 'Customers' },
    { href: '#pricing', label: 'Pricing' },
  ],
  cta: { href: '#start', label: 'Start free' },
  status: 'all systems normal',
  navLabel: 'Primary',
  menu: ['Open menu', 'Close menu'],
};

export default function Header({ content = RELAY }: { content?: HeaderContent }) {
  const { brand, brandLabel, links: LINKS, cta, status, navLabel, menu } = content;
  const BrandMark = MARKS[content.mark];
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState('');
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    let raf = 0;
    const targets = LINKS.map((l) => ({ href: l.href, el: document.querySelector<HTMLElement>(l.href) }));
    const update = () => {
      raf = 0;
      setScrolled(window.scrollY > 8);
      const probe = window.innerHeight * 0.4;
      const hit = targets.find(({ el }) => {
        if (!el) return false;
        const r = el.getBoundingClientRect();
        return r.top <= probe && r.bottom > probe;
      });
      setActive(hit?.href ?? '');
    };
    const request = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', request, { passive: true });
    window.addEventListener('resize', request);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', request);
      window.removeEventListener('resize', request);
    };
  }, [LINKS]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <header className={`${styles.header} ${scrolled ? styles.scrolled : ''}`}>
      <div className={styles.inner}>
        <a className={styles.brand} href="#top" aria-label={brandLabel}>
          <span className={styles.mark} data-brand-mark>
            <BrandMark tone="onLime" />
          </span>
          <span>{brand}</span>
        </a>

        <nav id="site-nav" className={`${styles.nav} ${open ? styles.open : ''}`} aria-label={navLabel}>
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className={active === l.href ? styles.active : undefined}
              aria-current={active === l.href ? 'true' : undefined}
              onClick={() => setOpen(false)}
            >
              {l.label}
            </a>
          ))}
          <a className={`btn btn-lime ${styles.navCta}`} href={cta.href} onClick={() => setOpen(false)}>
            {cta.label}
          </a>
        </nav>

        <div className={styles.actions}>
          <span className={styles.status}>
            <i className="status-dot" />
            {status}
          </span>
          <a className={`btn btn-lime btn-sm ${styles.cta}`} href={cta.href}>
            {cta.label}
          </a>
          <button
            type="button"
            className={styles.toggle}
            aria-controls="site-nav"
            aria-expanded={open}
            aria-label={open ? menu[1] : menu[0]}
            onClick={() => setOpen((v) => !v)}
          >
            <span />
            <span />
          </button>
        </div>
      </div>
    </header>
  );
}
