import { describe, it, expect, vi, afterEach } from 'vitest';
import { RELEASED, releasedChain, isReleased, arcadeOpen, arcadePaths } from '../../src/data/release';
import { UNLOCK_CHAIN } from '../../src/games/engine/progress';
import { locales } from '../../src/i18n/translations';

// The production build has neither DEV nor a Vercel preview env.
const production = { DEV: false };

describe('the arcade release gate', () => {
  it('releases a prefix of the unlock chain, never a cabinet out of order', () => {
    for (let count = 0; count <= UNLOCK_CHAIN.length; count++) {
      expect(releasedChain(production, count)).toEqual(UNLOCK_CHAIN.slice(0, count));
    }
  });

  it('keeps RELEASED inside the chain', () => {
    expect(RELEASED).toBeGreaterThanOrEqual(0);
    expect(RELEASED).toBeLessThanOrEqual(UNLOCK_CHAIN.length);
    expect(releasedChain(production)).toEqual(UNLOCK_CHAIN.slice(0, RELEASED));
  });

  it('shows the whole chain in dev and on a Vercel preview, like draft articles', () => {
    expect(releasedChain({ DEV: true }, 0)).toEqual(UNLOCK_CHAIN);
    expect(releasedChain({ DEV: false, VERCEL_ENV: 'preview' }, 0)).toEqual(UNLOCK_CHAIN);
    expect(releasedChain({ DEV: false, VERCEL_ENV: 'production' }, 2)).toEqual(UNLOCK_CHAIN.slice(0, 2));
  });

  it('closes the arcade while nothing is released', () => {
    expect(arcadeOpen(production)).toBe(RELEASED > 0);
    expect(arcadeOpen({ DEV: true })).toBe(true);
    expect(isReleased('tanks', production)).toBe(RELEASED > 0);
    expect(isReleased('tanks', { DEV: true })).toBe(true);
    expect(isReleased('park', { DEV: true })).toBe(false);
  });

  // The pages call these with no env at all, so the no-env path must follow
  // the build's own DEV and VERCEL_ENV. This pins only that it reads them:
  // vitest's import.meta.env is complete, so it cannot see Astro's rule that
  // a file's bare import.meta.env carries only the private keys that file
  // names. The preview build in tests/build/output.test.ts is the guard for
  // that, and the reason showsDrafts reads the keys explicitly.
  describe('with no env passed, as the pages call it', () => {
    afterEach(() => vi.unstubAllEnvs());

    it('shows the whole chain on a Vercel preview', () => {
      vi.stubEnv('DEV', false);
      vi.stubEnv('VERCEL_ENV', 'preview');
      expect(releasedChain()).toEqual(UNLOCK_CHAIN);
      expect(arcadeOpen()).toBe(true);
      expect(arcadePaths('towerdefense')).toHaveLength(locales.length);
    });

    it('gates a production build to RELEASED', () => {
      vi.stubEnv('DEV', false);
      vi.stubEnv('VERCEL_ENV', 'production');
      expect(releasedChain()).toEqual(UNLOCK_CHAIN.slice(0, RELEASED));
      expect(arcadeOpen()).toBe(RELEASED > 0);
    });
  });

  it('builds a page in every locale when released and leaves it out otherwise', () => {
    const every = locales.map(lang => ({ params: { lang } }));
    expect(arcadePaths('tanks', { DEV: true })).toEqual(every);
    expect(arcadePaths(undefined, { DEV: true })).toEqual(every);
    expect(arcadePaths('towerdefense', production)).toEqual(isReleased('towerdefense', production) ? every : []);
    expect(arcadePaths(undefined, production)).toEqual(arcadeOpen(production) ? every : []);
  });
});
