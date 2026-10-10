import { describe, it, expect } from 'vitest';
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

  it('builds a page in every locale when released and leaves it out otherwise', () => {
    const every = locales.map(lang => ({ params: { lang } }));
    expect(arcadePaths('tanks', { DEV: true })).toEqual(every);
    expect(arcadePaths(undefined, { DEV: true })).toEqual(every);
    expect(arcadePaths('towerdefense', production)).toEqual(isReleased('towerdefense', production) ? every : []);
    expect(arcadePaths(undefined, production)).toEqual(arcadeOpen(production) ? every : []);
  });
});
