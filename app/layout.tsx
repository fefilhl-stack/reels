import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import './globals.css';

const serif = localFont({
  src: './fonts/InstrumentSerif-Italic.woff2',
  style: 'italic',
  weight: '400',
  display: 'swap',
  variable: '--font-serif',
});

const title = 'Relay — The handoffs run themselves';
const description = 'Relay runs the steps between your apps and only pings a person when it matters.';

export const metadata: Metadata = {
  title,
  description,
  openGraph: { title, description, type: 'website' },
  twitter: { card: 'summary', title, description },
};

export const viewport: Viewport = {
  themeColor: '#000000',
  colorScheme: 'dark',
};

// Runs before first paint: marks that JS is on, so content that animates in
// starts hidden only when something is there to reveal it. If the app never
// takes over (blocked or failed scripts), drop the flag so the page shows as is.
const bootScript = `(function(d){d.classList.add('js');setTimeout(function(){if(!d.classList.contains('is-ready'))d.classList.remove('js','is-locked');},10000);})(document.documentElement);`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable} ${serif.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: bootScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
