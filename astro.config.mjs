// Astro config: a fully static site (plain HTML files) with small Preact
// "islands" for the interactive tools. Served from
// https://saifi17.github.io/solokit until we buy a domain.
import { defineConfig } from 'astro/config';
import preact from '@astrojs/preact';
import sitemap from '@astrojs/sitemap';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const BASE = '/solokit/';

// After each build, write a service worker that caches every page and the
// files they need, so the tools work offline.
function serviceWorker() {
  return {
    name: 'solokit-service-worker',
    hooks: {
      'astro:build:done': ({ dir }) => {
        const root = fileURLToPath(dir);
        const files = [];
        const walk = (d) => {
          for (const f of readdirSync(d)) {
            const p = join(d, f);
            if (statSync(p).isDirectory()) walk(p);
            else files.push(relative(root, p).split('\\').join('/'));
          }
        };
        walk(root);
        // Astro puts a tiny <style> for its island wrappers in the page body,
        // which isn't valid HTML. The same rule lives in global.css, so drop it.
        const islandStyle = '<style>astro-island,astro-slot,astro-static-slot{display:contents}</style>';
        for (const f of files.filter((x) => x.endsWith('.html'))) {
          const html = readFileSync(join(root, f), 'utf8');
          if (html.includes(islandStyle)) writeFileSync(join(root, f), html.replace(islandStyle, ''));
        }
        const pages = files.filter((f) => f.endsWith('index.html')).map((f) => BASE + f.replace(/index\.html$/, ''));
        const assets = files
          .filter((f) => /^_astro\/.+\.(js|css)$/.test(f) || (/^_astro\/.+\.woff2$/.test(f) && /-latin-/.test(f)))
          .map((f) => BASE + f);
        const extra = ['favicon.svg', 'manifest.webmanifest', 'icons/icon-192.png'].map((f) => BASE + f);
        const precache = [...pages, ...assets, ...extra];
        const version = createHash('sha1').update(precache.join('|') + Date.now()).digest('hex').slice(0, 10);
        const sw = `// SoloKit service worker (generated at build time)
const CACHE = 'solokit-${version}';
const BASE = '${BASE}';
const PRECACHE = ${JSON.stringify(precache)};

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('solokit-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(BASE)) return;

  // Pages: try the network first so updates show up, fall back to the cache offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(url.pathname, copy)); return res; })
        .catch(() => caches.match(url.pathname).then((r) => r || caches.match(BASE)))
    );
    return;
  }
  // Files: cache first (their names change whenever their content changes).
  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }))
  );
});
`;
        writeFileSync(join(root, 'sw.js'), sw);
      },
    },
  };
}

export default defineConfig({
  site: 'https://saifi17.github.io',
  base: '/solokit',
  trailingSlash: 'always',
  integrations: [preact(), sitemap({ filter: (page) => !page.includes('/workspace/') }), serviceWorker()],
});
