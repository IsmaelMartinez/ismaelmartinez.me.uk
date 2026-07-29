import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  sanitizeInitials,
  filterInitials,
  formatScore,
  qualifies,
  loadBest,
  saveBest,
  loadInitials,
  saveInitials,
  bestKey,
  type ScoreEntry
} from '../../src/games/engine/highscores';
import { fullBoard } from './board-fixtures';

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

const entry = (initials: string, score: number): ScoreEntry => ({ initials, score });

describe('sanitizeInitials', () => {
  it('uppercases and trims to three characters', () => {
    expect(sanitizeInitials('ismael')).toBe('ISM');
  });

  it('strips anything outside A-Z and 0-9', () => {
    expect(sanitizeInitials(' i-2! ')).toBe('I2');
  });

  it('falls back to AAA when nothing usable remains', () => {
    expect(sanitizeInitials('')).toBe('AAA');
    expect(sanitizeInitials('···')).toBe('AAA');
  });

  it('filterInitials applies the same alphabet without the AAA fallback', () => {
    expect(filterInitials(' i-2! ')).toBe('I2');
    expect(filterInitials('')).toBe('');
  });
});

describe('formatScore', () => {
  it('pads to the classic six digits without truncating larger scores', () => {
    expect(formatScore(340)).toBe('000340');
    expect(formatScore(1234567)).toBe('1234567');
  });
});

/**
 * `qualifies` is measured against the world board now, and only decides
 * whether the player is interrupted for initials — never whether the run is
 * offered to the board. The rule itself is unchanged.
 */
describe('qualifies', () => {
  it('rejects non-positive scores', () => {
    expect(qualifies([], 0)).toBe(false);
    expect(qualifies([], -5)).toBe(false);
  });

  it('accepts any positive score while the board has room', () => {
    expect(qualifies([], 1)).toBe(true);
    expect(qualifies([entry('AAA', 999)], 1)).toBe(true);
  });

  it('requires beating the last entry once the board is full', () => {
    const table = fullBoard(); // scores 1000..100
    expect(qualifies(table, 100)).toBe(false);
    expect(qualifies(table, 101)).toBe(true);
  });
});

describe('personal best', () => {
  let store: Record<string, string>;

  beforeEach(() => {
    store = installLocalStorage();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is zero until something is recorded', () => {
    expect(loadBest('snake')).toBe(0);
  });

  it('round-trips through save and load', () => {
    saveBest('snake', 420);
    expect(loadBest('snake')).toBe(420);
  });

  it('ignores a score that does not beat the stored best', () => {
    saveBest('snake', 420);
    saveBest('snake', 419);
    expect(loadBest('snake')).toBe(420);
    saveBest('snake', 421);
    expect(loadBest('snake')).toBe(421);
  });

  it('keeps a cabinet\'s two mode bests apart', () => {
    // Cascade fields one board per mode, so the ids must not share storage:
    // a countdown score has no business ranking against a marathon one.
    saveBest('cascade', 5000);
    saveBest('cascade-countdown', 900);
    expect(loadBest('cascade')).toBe(5000);
    expect(loadBest('cascade-countdown')).toBe(900);
  });

  it('migrates the best row of a retired per-device table', () => {
    store['arcade-hs-snake'] = JSON.stringify([entry('ISM', 900), entry('BBB', 300)]);
    expect(loadBest('snake')).toBe(900);
    // The migration is written through, so it survives the old table going.
    delete store['arcade-hs-snake'];
    expect(loadBest('snake')).toBe(900);
  });

  it('migrates the legacy single-number high score', () => {
    store['snake-high-score'] = '340';
    expect(loadBest('snake')).toBe(340);
    delete store['snake-high-score'];
    expect(loadBest('snake')).toBe(340);
  });

  it('prefers whichever retired source is higher', () => {
    store['arcade-hs-city'] = JSON.stringify([entry('ISM', 200)]);
    store['city-record-pop'] = '750';
    expect(loadBest('city')).toBe(750);
  });

  it('does not migrate a legacy key for tanks (different metric)', () => {
    store['tanks-victories'] = '7';
    expect(loadBest('tanks')).toBe(0);
  });

  it('survives a corrupt retired table', () => {
    store['arcade-hs-snake'] = '{nope';
    expect(loadBest('snake')).toBe(0);
  });

  it('ignores malformed rows inside a retired table', () => {
    store['arcade-hs-snake'] = JSON.stringify([{ initials: 5 }, 'x', null, entry('ISM', 10)]);
    expect(loadBest('snake')).toBe(10);
  });

  it('does not consult the retired sources once a best is stored', () => {
    store[bestKey('snake')] = '10';
    store['snake-high-score'] = '999';
    expect(loadBest('snake')).toBe(10);
  });

  it('remembers the last initials used, sanitised', () => {
    expect(loadInitials()).toBe('AAA');
    saveInitials('izzy');
    expect(loadInitials()).toBe('IZZ');
  });

  it('works without localStorage at all', () => {
    vi.unstubAllGlobals();
    vi.stubGlobal('localStorage', undefined);
    expect(loadBest('snake')).toBe(0);
    expect(() => saveBest('snake', 100)).not.toThrow();
    expect(loadInitials()).toBe('AAA');
    expect(() => saveInitials('ISM')).not.toThrow();
  });
});
