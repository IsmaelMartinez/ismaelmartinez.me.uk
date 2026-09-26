import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import { connectAnchorPath } from './src/data/links.ts';

/**
 * Development-only pages, injected under `astro dev` and nowhere else.
 *
 * The arcade jukebox (#367) is a tool for auditioning scores, not a page of the
 * site, so it must never reach ./dist or the sitemap. Injecting its route only
 * when `command === 'dev'` means `astro build` never sees the file at all: no
 * page, no bundle, no sitemap entry, and no reliance on a runtime flag that a
 * later edit could flip. The alternative, a page under src/pages whose
 * getStaticPaths returns nothing in production, would still be compiled by
 * every build and stay out of it only while that return stays right.
 * It sits under /en/ because the i18n routing (`prefixDefaultLocale`) answers
 * 404 to any page path without a locale segment, dev server included; it is
 * English-only, so there is one copy rather than one per locale.
 * `tests/build/output.test.ts` asserts the page stays out of the build.
 */
const devOnlyRoutes = {
  name: 'dev-only-routes',
  hooks: {
    'astro:config:setup': ({ command, injectRoute }) => {
      if (command !== 'dev') return;
      injectRoute({ pattern: '/en/dev/jukebox', entrypoint: './src/dev/jukebox.astro' });
    }
  }
};

export default defineConfig({
  site: 'https://ismaelmartinez.me.uk',
  integrations: [
    devOnlyRoutes,
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
