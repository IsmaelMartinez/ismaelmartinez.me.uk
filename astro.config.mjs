import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://ismaelmartinez.me.uk',
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'es', 'cat'],
    routing: {
      prefixDefaultLocale: true
    }
  }
});
