import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import {
  TOWERS,
  TOWER_KINDS,
  createTower,
  towerDps,
  towerRange
} from '../../src/games/towerdefense/towers';

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

  // The tool bar used to carry `70`, `110` and `90` typed straight into the
  // markup and nothing else — no damage, no reach, no splash — which is how a
  // player came to rank three towers by price when price ranks them the wrong
  // way round (#263). It is rendered from the tower table now, and this is the
  // guard that keeps it that way: the numbers are computed here from the same
  // TOWERS the game fires with, so putting a literal back in the page turns
  // this red the moment anyone retunes a tower.
  describe('Line Hold tool bar carries the tower table\u2019s own numbers', () => {
    for (const locale of locales) {
      it(`${locale} tool bar shows dps, range and splash from TOWERS`, () => {
        const html = readFileSync(`dist/${locale}/fun/towerdefense/index.html`, 'utf-8');
        for (const kind of TOWER_KINDS) {
          const fresh = createTower(kind, 0);
          expect(html, `${kind} cost`).toContain(`>${TOWERS[kind].cost}<`);
          expect(html, `${kind} dps`).toContain(`\u2694 ${Math.round(towerDps(fresh))}`);
          expect(html, `${kind} range`).toContain(`\u25ce ${towerRange(fresh)}`);
          if (TOWERS[kind].splash > 0) {
            expect(html, `${kind} splash`).toContain(`\ud83d\udca5 ${TOWERS[kind].splash}`);
          }
          if (TOWERS[kind].slow > 0) {
            expect(html, `${kind} slow`).toContain(`\u2744 ${TOWERS[kind].slow}`);
          }
        }
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

  /**
   * Asserted against the built page rather than a test fixture, because the
   * defect is in the markup the server renders and a hand-written skeleton
   * could not have caught it. Microcity's Retire button once carried an
   * aria-label holding the *hint*, which replaced the visible "Retire" as the
   * accessible name: voice control had nothing to match on and screen readers
   * announced a name that did not contain the label (WCAG 2.5.3). The hint
   * belongs in `title`, which is a description, not a name.
   */
  describe('Microcity retire controls keep their visible label as their name', () => {
    for (const locale of locales) {
      it(`${locale}/fun/city keeps the label in the name and guards the run`, () => {
        const html = readFileSync(`dist/${locale}/fun/city/index.html`, 'utf-8');
        const buttons = html.match(/<button[^>]*id="retire[^"]*"[^>]*>/g) ?? [];
        // The control itself plus the two answers on its confirmation.
        expect(buttons).toHaveLength(3);
        for (const button of buttons) expect(button).not.toContain('aria-label');
        expect(html).toContain('id="retire-btn"');
        expect(html).toContain('id="retire-overlay"');
        expect(html).toContain('role="alertdialog"');
      });
    }
  });
});
