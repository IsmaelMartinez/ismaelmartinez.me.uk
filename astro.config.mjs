import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import { connectAnchorPath } from './src/data/links.ts';

export default defineConfig({
  site: 'https://ismaelmartinez.me.uk',
  integrations: [
    mdx(),
    sitemap({
      i18n: {
        defaultLocale: 'en',
        locales: { en: 'en', es: 'es', cat: 'ca' }
      }
    })
  ],
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'es', 'cat'],
    routing: {
      prefixDefaultLocale: true,
      redirectToDefaultLocale: true
    }
  },
  // The Connect page was merged into About (see CLAUDE.md); these keep old
  // bookmarks and inbound links landing on the section that replaced it.
  redirects: {
    '/en/connect': `/en${connectAnchorPath}`,
    '/es/connect': `/es${connectAnchorPath}`,
    '/cat/connect': `/cat${connectAnchorPath}`
  }
});
