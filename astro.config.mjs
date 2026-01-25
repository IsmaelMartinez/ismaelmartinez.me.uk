import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';

export default defineConfig({
  site: 'https://ismaelmartinez.me.uk',
  integrations: [mdx()],
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'es', 'cat'],
    routing: {
      prefixDefaultLocale: true
    }
  }
});
