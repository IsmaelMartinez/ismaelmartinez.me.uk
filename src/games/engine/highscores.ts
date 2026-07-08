/**
 * Old-school arcade high-score tables, one per game, kept on this device.
 *
 * Each table is a localStorage JSON array of up to MAX_ENTRIES entries sorted
 * by score (ties keep the older entry higher, like the arcades did). Pure
 * helpers (sanitise/qualify/insert) are separated from the guarded storage
 * layer so the rules are unit-testable without a DOM.
 */

export interface ScoreEntry {
  initials: string;
  score: number;
}

export const MAX_ENTRIES = 10;
export const INITIALS_LENGTH = 3;
export const DEFAULT_INITIALS = 'AAA';

const TABLE_PREFIX = 'arcade-hs-';
const INITIALS_KEY = 'arcade-initials';

/**
 * Single-number keys the games used before tables existed. A missing table
 * is seeded from these so an old personal best becomes entry #1 ("---").
 * Tank Duel is absent on purpose: its legacy key counted matches won, which
 * is not comparable with the new per-match score.
 */
const LEGACY_KEYS: Record<string, string> = {
  snake: 'snake-high-score',
  'poo-poo-land': 'poo-land-high-score',
  park: 'park-record-guests',
  city: 'city-record-pop',
  syndicate: 'syndicate-record-cash'
};

export const tableKey = (gameId: string): string => `${TABLE_PREFIX}${gameId}`;

/** Uppercase A–Z/0–9 only, at most three characters; empty becomes "AAA". */
export function sanitizeInitials(raw: string): string {
  const clean = raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, INITIALS_LENGTH);
  return clean || DEFAULT_INITIALS;
}

/** True when `score` would earn a spot on the table. */
export function qualifies(table: ScoreEntry[], score: number): boolean {
  if (score <= 0) return false;
  return table.length < MAX_ENTRIES || score > table[table.length - 1].score;
}

/**
 * Pure insertion: returns the new table (capped at MAX_ENTRIES) and the
 * 1-based rank of the inserted entry, or rank 0 when it didn't qualify.
 */
export function insertScore(
  table: ScoreEntry[],
  initials: string,
  score: number
): { table: ScoreEntry[]; rank: number } {
  if (!qualifies(table, score)) return { table, rank: 0 };
  const entry: ScoreEntry = { initials: sanitizeInitials(initials), score };
  let index = table.findIndex(e => score > e.score);
  if (index === -1) index = table.length;
  const next = [...table.slice(0, index), entry, ...table.slice(index)].slice(0, MAX_ENTRIES);
  return { table: next, rank: index + 1 };
}

function isEntry(value: unknown): value is ScoreEntry {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as ScoreEntry).initials === 'string' &&
    typeof (value as ScoreEntry).score === 'number' &&
    Number.isFinite((value as ScoreEntry).score)
  );
}

/** Loads a game's table, seeding it from the pre-table high-score key once. */
export function loadTable(gameId: string): ScoreEntry[] {
  try {
    const raw = localStorage.getItem(tableKey(gameId));
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.filter(isEntry).slice(0, MAX_ENTRIES);
      return [];
    }
    const legacyKey = LEGACY_KEYS[gameId];
    const legacy = legacyKey ? parseInt(localStorage.getItem(legacyKey) || '0', 10) || 0 : 0;
    if (legacy > 0) {
      const seeded = [{ initials: '---', score: legacy }];
      saveTable(gameId, seeded);
      return seeded;
    }
    return [];
  } catch {
    return [];
  }
}

export function saveTable(gameId: string, table: ScoreEntry[]): void {
  try {
    localStorage.setItem(tableKey(gameId), JSON.stringify(table.slice(0, MAX_ENTRIES)));
  } catch {
    // Storage unavailable; the table simply won't persist.
  }
}

/** Records a finished run. Returns the 1-based rank, or 0 if it didn't chart. */
export function submitScore(gameId: string, initials: string, score: number): number {
  const { table, rank } = insertScore(loadTable(gameId), initials, score);
  if (rank > 0) saveTable(gameId, table);
  return rank;
}

export function topEntry(gameId: string): ScoreEntry | null {
  return loadTable(gameId)[0] ?? null;
}

/** Last initials entered on this device, for prefilling the entry form. */
export function loadInitials(): string {
  try {
    return sanitizeInitials(localStorage.getItem(INITIALS_KEY) || DEFAULT_INITIALS);
  } catch {
    return DEFAULT_INITIALS;
  }
}

export function saveInitials(initials: string): void {
  try {
    localStorage.setItem(INITIALS_KEY, sanitizeInitials(initials));
  } catch {
    // Storage unavailable; initials just won't be remembered.
  }
}
