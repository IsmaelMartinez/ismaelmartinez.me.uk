import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  UNLOCK_CHAIN,
  doneKey,
  markDone,
  completedGames,
  visibleCabinets
} from '../../src/games/engine/progress';
import { bestKey } from '../../src/games/engine/highscores';
import { CABINETS } from '../../src/data/arcadeCabinets';

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

describe('UNLOCK_CHAIN', () => {
  it('walks gaming history in order: each cabinet homages a classic no older than the last', () => {
    // The floor's whole premise, and what makes a new cabinet's slot obvious:
    // it goes where its homaged classic falls, not on the end. Nothing else
    // enforces this, since the EST. plaques are per-cabinet data.
    const years = UNLOCK_CHAIN.map(id => CABINETS[id].estYear);
    expect(years).toEqual([...years].sort((a, b) => a - b));
  });
});

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

  it('never names anything past the one shrouded cabinet (no spoilers)', () => {
    // The floor renders straight from this return value, so its shape is the
    // spoiler boundary: whatever the progress, no chain id beyond `next` may
    // appear anywhere in it.
    //
    // The floor-wide invariant this serves is narrower than "hidden games are
    // secret": it is that no PLAINTEXT hidden-cabinet identity (marquee name,
    // icon, colour, tagline) reaches the built HTML or the floor's JS bundle.
    // The game pages stay public, sitemapped routes, and the page's base64
    // data island is trivially reversible by anyone who cares — that is
    // accepted. This guards the casual reveal, not secrecy.
    for (const doneSet of [done(), done('first'), done('second')]) {
      const state = visibleCabinets(chain, doneSet);
      const named = JSON.stringify(state);
      const boundary = state.next === null ? chain.length : chain.indexOf(state.next);
      for (const hidden of chain.slice(boundary + 1)) {
        expect(named).not.toContain(hidden);
      }
    }
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

  it('contains games marked done with a score above zero', () => {
    markDone('towerdefense', 250);
    expect(completedGames().has('towerdefense')).toBe(true);
    expect(localStorage.getItem(doneKey('towerdefense'))).toBe('1');
  });

  it('does not record a scoreless run: finishing with nothing on the board reveals nothing', () => {
    markDone('towerdefense', 0);
    markDone('snake', -5);
    expect(localStorage.getItem(doneKey('towerdefense'))).toBeNull();
    expect(completedGames().size).toBe(0);
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
    markDone('towerdefense', 10);
    expect(completedGames(['snake']).has('towerdefense')).toBe(false);
  });

  it('defaults to the floor chain', () => {
    for (const id of UNLOCK_CHAIN) markDone(id, 10);
    expect(completedGames()).toEqual(new Set(UNLOCK_CHAIN));
  });

  it("counts a Cascade countdown run toward the chain's cascade link", () => {
    // Countdown runs record under their own scoreboard gameId, which the
    // chain never reads directly.
    markDone('cascade-countdown', 900);
    expect(localStorage.getItem(doneKey('cascade'))).toBe('1');
    expect(completedGames().has('cascade')).toBe(true);
  });

  it('seeds cascade from a countdown-only personal best', () => {
    localStorage.setItem(bestKey('cascade-countdown'), '4200');
    expect(completedGames().has('cascade')).toBe(true);
  });
});

describe('storage resilience', () => {
  it('never throws when localStorage is unavailable', () => {
    vi.stubGlobal('localStorage', undefined);
    try {
      expect(() => markDone('snake', 10)).not.toThrow();
      expect(() => completedGames()).not.toThrow();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('fails OPEN when storage is unusable: the whole chain renders unlocked', () => {
    // Progress could never be recorded on such a device, so gating the floor
    // would strand the player at one cabinet behind a hint promising an
    // unlock that can never land.
    vi.stubGlobal('localStorage', undefined);
    try {
      expect(completedGames()).toEqual(new Set(UNLOCK_CHAIN));
      const { unlocked, next } = visibleCabinets(UNLOCK_CHAIN, completedGames());
      expect(unlocked).toEqual([...UNLOCK_CHAIN]);
      expect(next).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('fails OPEN when writes throw (Safari private browsing)', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => {}
    });
    try {
      expect(completedGames(['a', 'b', 'c'])).toEqual(new Set(['a', 'b', 'c']));
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
