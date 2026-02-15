import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'fs';

describe('build output', () => {
  beforeAll(() => {
    if (!existsSync('dist/en/index.html')) {
      throw new Error('dist/ not found. Run "npm run build" before running build tests.');
    }
  });

  const locales = ['en', 'es', 'cat'];

  describe('locale pages exist', () => {
    const pages = ['index.html', 'about/index.html', 'connect/index.html', 'projects/index.html', 'writing/index.html', 'uses/index.html', 'tags/index.html'];

    for (const locale of locales) {
      for (const page of pages) {
        it(`${locale}/${page} exists`, () => {
          expect(existsSync(`dist/${locale}/${page}`)).toBe(true);
        });
      }
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
