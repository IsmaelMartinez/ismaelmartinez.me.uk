import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  MAX_ENTRIES,
  sanitizeInitials,
  qualifies,
  insertScore,
  loadTable,
  saveTable,
  submitScore,
  topEntry,
  loadInitials,
  saveInitials,
  tableKey,
  type ScoreEntry
} from '../../src/games/engine/highscores';

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
const fullTable = (): ScoreEntry[] =>
  Array.from({ length: MAX_ENTRIES }, (_, i) => entry('AAA', (MAX_ENTRIES - i) * 100));

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
});

describe('qualifies', () => {
  it('rejects non-positive scores', () => {
    expect(qualifies([], 0)).toBe(false);
    expect(qualifies([], -5)).toBe(false);
  });

  it('accepts any positive score while the table has room', () => {
    expect(qualifies([], 1)).toBe(true);
    expect(qualifies([entry('AAA', 999)], 1)).toBe(true);
  });

  it('requires beating the last entry once the table is full', () => {
    const table = fullTable(); // scores 1000..100
    expect(qualifies(table, 100)).toBe(false);
    expect(qualifies(table, 101)).toBe(true);
  });
});

describe('insertScore', () => {
  it('places the entry by score and reports its 1-based rank', () => {
    const table = [entry('AAA', 300), entry('BBB', 100)];
    const result = insertScore(table, 'ccc', 200);
    expect(result.rank).toBe(2);
    expect(result.table.map(e => e.initials)).toEqual(['AAA', 'CCC', 'BBB']);
  });

  it('keeps older entries above ties', () => {
    const table = [entry('OLD', 200)];
    const result = insertScore(table, 'NEW', 200);
    expect(result.rank).toBe(2);
    expect(result.table[0].initials).toBe('OLD');
  });

  it('drops the last entry when a full table gains a better score', () => {
    const result = insertScore(fullTable(), 'ZZZ', 950);
    expect(result.rank).toBe(2);
    expect(result.table).toHaveLength(MAX_ENTRIES);
    expect(result.table.some(e => e.score === 100)).toBe(false);
  });

  it('returns rank 0 and the untouched table for a non-qualifying score', () => {
    const table = fullTable();
    const result = insertScore(table, 'ZZZ', 50);
    expect(result.rank).toBe(0);
    expect(result.table).toBe(table);
  });
});

describe('storage-backed tables', () => {
  let store: Record<string, string>;

  beforeEach(() => {
    store = installLocalStorage();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns an empty table when nothing is stored', () => {
    expect(loadTable('snake')).toEqual([]);
  });

  it('round-trips a table through save and load', () => {
    saveTable('snake', [entry('ISM', 420)]);
    expect(loadTable('snake')).toEqual([entry('ISM', 420)]);
  });

  it('migrates the legacy single-number high score as entry #1', () => {
    store['snake-high-score'] = '340';
    expect(loadTable('snake')).toEqual([entry('---', 340)]);
    // Seeding persists, so it survives the legacy key being cleared later.
    delete store['snake-high-score'];
    expect(loadTable('snake')).toEqual([entry('---', 340)]);
  });

  it('does not migrate a legacy key for tanks (different metric)', () => {
    store['tanks-victories'] = '7';
    expect(loadTable('tanks')).toEqual([]);
  });

  it('survives corrupt stored JSON', () => {
    store[tableKey('snake')] = '{nope';
    expect(loadTable('snake')).toEqual([]);
  });

  it('filters malformed entries out of stored tables', () => {
    store[tableKey('snake')] = JSON.stringify([entry('ISM', 10), { initials: 5 }, 'x', null]);
    expect(loadTable('snake')).toEqual([entry('ISM', 10)]);
  });

  it('submitScore records qualifying runs and reports the rank', () => {
    expect(submitScore('snake', 'ism', 200)).toBe(1);
    expect(submitScore('snake', 'bbb', 300)).toBe(1);
    expect(submitScore('snake', 'ccc', 250)).toBe(2);
    expect(loadTable('snake').map(e => e.score)).toEqual([300, 250, 200]);
    expect(topEntry('snake')).toEqual(entry('BBB', 300));
  });

  it('submitScore ignores non-qualifying runs', () => {
    saveTable('snake', fullTable());
    expect(submitScore('snake', 'ZZZ', 5)).toBe(0);
    expect(loadTable('snake')).toEqual(fullTable());
  });

  it('remembers the last initials used, sanitised', () => {
    expect(loadInitials()).toBe('AAA');
    saveInitials('izzy');
    expect(loadInitials()).toBe('IZZ');
  });

  it('works without localStorage at all', () => {
    vi.unstubAllGlobals();
    vi.stubGlobal('localStorage', undefined);
    expect(loadTable('snake')).toEqual([]);
    expect(submitScore('snake', 'ISM', 100)).toBe(1); // insert works, persistence is skipped
    expect(loadInitials()).toBe('AAA');
    expect(() => saveInitials('ISM')).not.toThrow();
  });
});
