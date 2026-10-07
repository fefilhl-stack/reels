import { TurboMark } from '../ui/Icons';
import { EMAIL, PHONE, PHONE_HREF, SITE } from './content';
import styles from '../sections/Footer.module.css';

const COLUMNS = [
  {
    title: 'продукты',
    links: [
      ['Платформа ТУРБО X', `${SITE}/products/x`],
      ['ТУРБО ERP', `${SITE}/products/erp`],
      ['Бюджетирование', `${SITE}/products/budget`],
      ['Все продукты', `${SITE}/products`],
    ],
  },
  {
    title: 'решения',
    links: [
      ['Имущественный комплекс', `${SITE}/products/realestate`],
      ['ТУРБО Отель', `${SITE}/products/hotel`],
      ['ТУРБО ПЛК', `${SITE}/products/plc`],
      ['Решения партнёров', `${SITE}/partners-solutions`],
    ],
  },
  {
    title: 'компания',
    links: [
      ['О ТУРБО', `${SITE}/about`],
      ['Клиенты', `${SITE}/clients`],
      ['Стать партнёром', `${SITE}/services/partners`],
      ['Обучение', `${SITE}/training`],
    ],
  },
  {
    title: 'поддержка',
    links: [
      ['Техподдержка', `${SITE}/services/support`],
      ['Документы', `${SITE}/services/docs`],
      ['Сервисы и услуги', `${SITE}/services`],
      ['Запросить демо', '#demo'],
    ],
  },
];

export default function Footer() {
  return (
    <footer className={styles.footer}>
      <div className="container">
        <ul className={styles.status}>
          <li>
            <i className="status-dot" />в реестре российского ПО
          </li>
          <li>
            <i />
            1000+ компаний-клиентов
          </li>
          <li>
            <i />
            партнёры по всей России
          </li>
        </ul>

        <div className={styles.main}>
          <div className={styles.about}>
            <a className={styles.logo} href="#top" aria-label="ТУРБО, наверх">
              <span className={styles.mark}>
                <TurboMark tone="onLime" />
              </span>
              ТУРБО
            </a>
            <p>Линейка российских решений для бизнеса на платформе ТУРБО X. С 1991 года.</p>
            <p className={styles.badges}>
              <a href={PHONE_HREF}>{PHONE}</a> / <a href={`mailto:${EMAIL}`}>{EMAIL}</a>
            </p>
          </div>
          <nav className={styles.cols} aria-label="Разделы сайта">
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
          <span>© ТУРБО, 2026</span>
          <span>разработчик платформы: «Консист Бизнес Групп»</span>
        </div>
      </div>
    </footer>
  );
}
