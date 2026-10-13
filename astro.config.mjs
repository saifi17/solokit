// Astro config: a fully static site (plain HTML files), served from
// https://saifi17.github.io/solokit until we buy a domain.
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://saifi17.github.io',
  base: '/solokit',
  trailingSlash: 'always',
  integrations: [sitemap()],
});
