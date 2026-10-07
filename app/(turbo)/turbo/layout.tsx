import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import '../../globals.css';

// Instrument Serif has no Cyrillic, so the Russian page sets its italics in Playfair Display
const serif = localFont({
  src: '../../fonts/PlayfairDisplay-Italic.woff2',
  style: 'italic',
  weight: '400',
  display: 'swap',
  variable: '--font-serif',
});

const title = 'ТУРБО — российская платформа для бизнес-приложений';
const description =
  'Платформа ТУРБО X и готовые решения на ней: ERP, бюджетирование, ТОРО, управление недвижимостью и отелями. Для высоконагруженных систем и критичных процессов.';

export const metadata: Metadata = {
  title,
  description,
  openGraph: { title, description, type: 'website', locale: 'ru_RU' },
  twitter: { card: 'summary', title, description },
};

export const viewport: Viewport = {
  themeColor: '#000000',
  colorScheme: 'dark',
};

// same early flag + failsafe as the Relay layout
const bootScript = `(function(d){d.classList.add('js');setTimeout(function(){if(!d.classList.contains('is-ready'))d.classList.remove('js','is-locked');},10000);})(document.documentElement);`;

export default function TurboLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={`${GeistSans.variable} ${GeistMono.variable} ${serif.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: bootScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
