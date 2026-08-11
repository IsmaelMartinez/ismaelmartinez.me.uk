import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';

// Build tests assert on ./dist and skip when no build exists. CI always
// builds first, so there they always run; locally, `npm run build` first
// to include them (a stale dist means stale assertions).
const hasDist = existsSync('dist/en/index.html');

describe.skipIf(!hasDist)('build output', () => {

  const locales = ['en', 'es', 'cat'];

  describe('locale pages exist', () => {
    const pages = ['index.html', 'about/index.html', 'projects/index.html', 'writing/index.html', 'tags/index.html', 'health/index.html'];

    for (const locale of locales) {
      for (const page of pages) {
        it(`${locale}/${page} exists`, () => {
          expect(existsSync(`dist/${locale}/${page}`)).toBe(true);
        });
      }
    }
  });

  // The old Connect page is gone; astro.config.mjs redirects emit a stub that
  // forwards to the localized /about#connect section. If the redirects are
  // removed, this fails as a redirect regression, not as a missing page.
  describe('connect redirect stubs point at about#connect', () => {
    for (const locale of locales) {
      it(`${locale}/connect/index.html is a redirect to /${locale}/about#connect`, () => {
        const html = readFileSync(`dist/${locale}/connect/index.html`, 'utf-8');
        expect(html).toContain(`http-equiv="refresh" content="0;url=/${locale}/about#connect"`);
        expect(html).toContain(`rel="canonical" href="https://ismaelmartinez.me.uk/${locale}/about#connect"`);
      });
    }
  });

  describe('RSS feeds exist', () => {
    for (const locale of locales) {
      it(`${locale}/rss.xml exists`, () => {
        expect(existsSync(`dist/${locale}/rss.xml`)).toBe(true);
      });
    }
  });

  describe('security meta tags present', () => {
    it('en/index.html contains CSP meta tag', () => {
      const html = readFileSync('dist/en/index.html', 'utf-8');
      expect(html).toContain('Content-Security-Policy');
      expect(html).toContain("default-src 'self'");
    });

    it('en/index.html contains referrer policy', () => {
      const html = readFileSync('dist/en/index.html', 'utf-8');
      expect(html).toContain('strict-origin-when-cross-origin');
    });

    it('en/index.html contains X-Content-Type-Options', () => {
      const html = readFileSync('dist/en/index.html', 'utf-8');
      expect(html).toContain('nosniff');
    });
  });

  describe('SEO tags present', () => {
    for (const locale of locales) {
      it(`${locale}/index.html has canonical URL`, () => {
        const html = readFileSync(`dist/${locale}/index.html`, 'utf-8');
        expect(html).toContain('rel="canonical"');
      });

      it(`${locale}/index.html has hreflang tags`, () => {
        const html = readFileSync(`dist/${locale}/index.html`, 'utf-8');
        expect(html).toContain('hreflang="en"');
        expect(html).toContain('hreflang="es"');
        expect(html).toContain('hreflang="ca"');
        expect(html).toContain('hreflang="x-default"');
      });
    }
  });
});
