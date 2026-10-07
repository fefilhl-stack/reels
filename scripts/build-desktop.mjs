// Builds a self-contained copy of the site that opens with a double click:
// one index.html with all scripts, styles, fonts and the icon inlined.
// Usage: npm run build:desktop  ->  desktop-build/Relay/index.html and desktop-build/Turbo/index.html
//        npm run build:desktop -- turbo  ->  only one of them
import { build } from 'esbuild';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SITES = [
  {
    folder: 'Relay',
    entry: 'desktop/main.tsx',
    icon: 'app/(relay)/icon.svg',
    lang: 'en',
    title: 'Relay — The handoffs run themselves',
    description: 'Relay runs the steps between your apps and only pings a person when it matters.',
  },
  {
    folder: 'Turbo',
    entry: 'desktop/turbo.tsx',
    icon: 'app/(turbo)/turbo/icon.svg',
    lang: 'ru',
    title: 'ТУРБО — российская платформа для бизнес-приложений',
    description:
      'Платформа ТУРБО X и готовые решения на ней: ERP, бюджетирование, ТОРО, управление недвижимостью и отелями.',
  },
];

// same early flag + failsafe as the layouts in app/
const boot = `(function(d){d.classList.add('js');setTimeout(function(){if(!d.classList.contains('is-ready'))d.classList.remove('js','is-locked');},10000);})(document.documentElement);`;

const only = process.argv[2]?.toLowerCase();
for (const site of SITES) {
  if (only && site.folder.toLowerCase() !== only) continue;
  const outDir = path.join(root, 'desktop-build', site.folder);

  const result = await build({
    entryPoints: [path.join(root, site.entry)],
    bundle: true,
    minify: true,
    write: false,
    outdir: 'out',
    format: 'iife',
    target: ['es2020', 'chrome90', 'firefox90', 'safari14'],
    jsx: 'automatic',
    loader: { '.woff2': 'dataurl' },
    define: { 'process.env.NODE_ENV': '"production"' },
    legalComments: 'none',
    logLevel: 'warning',
  });

  const js = result.outputFiles.find((f) => f.path.endsWith('.js')).text;
  const css = result.outputFiles.find((f) => f.path.endsWith('.css')).text;

  // inline <script>/<style> must not contain a closing tag
  const safeJs = js.replace(/<\/script/gi, '<\\/script');
  const safeCss = css.replace(/<\/style/gi, '<\\/style');

  const icon = await readFile(path.join(root, site.icon), 'utf8');
  const iconUri = `data:image/svg+xml,${encodeURIComponent(icon.trim())}`;

  const html = `<!doctype html>
<html lang="${site.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${site.title}</title>
<meta name="description" content="${site.description}">
<meta name="theme-color" content="#000000">
<meta name="color-scheme" content="dark">
<link rel="icon" type="image/svg+xml" href="${iconUri}">
<script>${boot}</script>
<style>${safeCss}</style>
</head>
<body>
<noscript><p style="padding:40px;font:16px system-ui;color:#f2f3ee">Включите JavaScript, чтобы увидеть страницу.</p></noscript>
<div id="root"></div>
<script>${safeJs}</script>
</body>
</html>
`;

  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, 'index.html'), html);
  await writeFile(
    path.join(outDir, 'Как открыть.txt'),
    'Откройте файл index.html двойным кликом — сайт запустится в браузере.\r\n' +
      'Интернет и сервер не нужны: всё, включая шрифты и графику, лежит внутри index.html.\r\n',
  );
  console.log(`desktop build: ${path.relative(root, outDir)}/index.html (${(html.length / 1024).toFixed(0)} KB)`);
}
