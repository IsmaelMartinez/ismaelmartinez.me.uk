import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  UNLOCK_CHAIN,
  doneKey,
  markDone,
  completedGames,
  visibleCabinets
} from '../../src/games/engine/progress';
import { bestKey } from '../../src/games/engine/highscores';

/** Minimal in-memory localStorage stand-in (the suite runs under node by default). */
function installLocalStorage(): Record<string, string> {
  const store: Record<string, string> = {};
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => {
      store[k] = String(v);
    },
    removeItem: (k: string) => {
      delete store[k];
    },
    clear: () => {
      for (const k of Object.keys(store)) delete store[k];
    }
  });
  return store;
}

const chain: readonly string[] = ['first', 'second', 'third', 'fourth'];
const done = (...ids: string[]) => new Set(ids);

describe('visibleCabinets', () => {
  it('opens only the first cabinet on a fresh floor, shrouding the second', () => {
    expect(visibleCabinets(chain, done())).toEqual({
      unlocked: ['first'],
      next: 'second'
    });
  });

  it('reveals the next cabinet once the newest unlocked one is finished', () => {
    expect(visibleCabinets(chain, done('first'))).toEqual({
      unlocked: ['first', 'second'],
      next: 'third'
    });
    expect(visibleCabinets(chain, done('first', 'second'))).toEqual({
      unlocked: ['first', 'second', 'third'],
      next: 'fourth'
    });
  });

  it('measures progress from the deepest finished cabinet, so gaps never shrink the floor', () => {
    // A returning player seeded from an old personal best on a later cabinet
    // keeps everything up to and past it, plus the next reveal.
    expect(visibleCabinets(chain, done('third'))).toEqual({
      unlocked: ['first', 'second', 'third', 'fourth'],
      next: null
    });
  });

  it('leaves no shroud once the chain is fully open', () => {
    expect(visibleCabinets(chain, done(...chain))).toEqual({
      unlocked: [...chain],
      next: null
    });
  });

  it('ignores games outside the chain', () => {
    expect(visibleCabinets(chain, done('elsewhere'))).toEqual({
      unlocked: ['first'],
      next: 'second'
    });
  });

  it('the shroud is always powered by its immediate predecessor', () => {
    // The floor's hint copy relies on this: whatever the done set, the game
    // that powers the shrouded cabinet is the one right before it in chain
    // order.
    for (const doneSet of [done(), done('first'), done('second'), done('first', 'third')]) {
      const { unlocked, next } = visibleCabinets(chain, doneSet);
      if (next !== null) {
        expect(chain.indexOf(next)).toBe(chain.indexOf(unlocked[unlocked.length - 1]) + 1);
      }
    }
  });
});

describe('completedGames', () => {
  beforeEach(() => {
    installLocalStorage();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('starts empty on a fresh device', () => {
    expect(completedGames().size).toBe(0);
  });

  it('contains games marked done', () => {
    markDone('towerdefense');
    expect(completedGames().has('towerdefense')).toBe(true);
    expect(localStorage.getItem(doneKey('towerdefense'))).toBe('1');
  });

  it('seeds from an existing personal best, so returning players keep their floor', () => {
    localStorage.setItem(bestKey('snake'), '120');
    expect(completedGames().has('snake')).toBe(true);
  });

  it('ignores a zero personal best', () => {
    localStorage.setItem(bestKey('snake'), '0');
    expect(completedGames().has('snake')).toBe(false);
  });

  it('only consults the games in the chain it is asked about', () => {
    markDone('towerdefense');
    expect(completedGames(['snake']).has('towerdefense')).toBe(false);
  });

  it('defaults to the floor chain', () => {
    for (const id of UNLOCK_CHAIN) markDone(id);
    expect(completedGames()).toEqual(new Set(UNLOCK_CHAIN));
  });
});

describe('storage resilience', () => {
  it('treats an unavailable localStorage as a fresh floor and never throws', () => {
    vi.stubGlobal('localStorage', undefined);
    try {
      expect(() => markDone('snake')).not.toThrow();
      expect(completedGames().size).toBe(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
