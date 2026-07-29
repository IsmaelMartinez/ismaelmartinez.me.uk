/**
 * Arcade scoring rules, plus the little state a device genuinely owns.
 *
 * Every cabinet used to keep its own ten-row table in localStorage alongside
 * the shared board. That second table is gone (see ADR 002): the panel now
 * shows one board, the world one in `globalScores.ts`, so a score means the
 * same thing wherever it is read. What stays on the device is only what is
 * local by nature — the initials the player last typed, and their personal
 * best per game, which drives the HUD "best" readouts, the one-time record
 * toast, and the attract-screen numbers on the arcade floor.
 *
 * The pure rules (sanitise, qualify, format) are separated from the guarded
 * storage layer so they stay unit-testable without a DOM.
 */

import { loadScore, saveScore } from './storage';

export interface ScoreEntry {
  initials: string;
  score: number;
}

/** Rows on the published board. `qualifies` measures against this. */
export const MAX_ENTRIES = 10;
export const INITIALS_LENGTH = 3;
export const DEFAULT_INITIALS = 'AAA';

const BEST_PREFIX = 'arcade-best-';
const INITIALS_KEY = 'arcade-initials';

/**
 * The retired per-device tables. Still read once, to seed a personal best for
 * players who have one, and deliberately not deleted: leaving the rows in
 * place keeps this change reversible and costs a few hundred bytes.
 */
const TABLE_PREFIX = 'arcade-hs-';

/**
 * Single-number keys the games used before either board existed. Tank Duel is
 * absent on purpose: its legacy key counted matches won, which is not
 * comparable with the per-match score it reports now.
 */
const LEGACY_KEYS: Record<string, string> = {
  snake: 'snake-high-score',
  'poo-poo-land': 'poo-land-high-score',
  park: 'park-record-guests',
  city: 'city-record-pop',
  syndicate: 'syndicate-record-cash'
};

export const bestKey = (gameId: string): string => `${BEST_PREFIX}${gameId}`;

/** Classic six-digit arcade readout, e.g. 340 → "000340". */
export const formatScore = (score: number): string => score.toString().padStart(6, '0');

/** The typeable initials alphabet: uppercase A–Z/0–9, at most three characters. */
export function filterInitials(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, INITIALS_LENGTH);
}

/** Like filterInitials, but empty becomes "AAA" so an entry always has a name. */
export function sanitizeInitials(raw: string): string {
  return filterInitials(raw) || DEFAULT_INITIALS;
}

/**
 * True when `score` would earn a spot on `table`, which is now always the
 * world board. Used only to decide whether to interrupt the player for
 * initials — a run is offered to the board either way, so a stale or
 * unreachable board can never cost someone a score.
 */
export function qualifies(table: ScoreEntry[], score: number): boolean {
  if (score <= 0) return false;
  return table.length < MAX_ENTRIES || score > table[table.length - 1].score;
}

/** The best score a retired per-device table holds, or 0 if there is none. */
function retiredTableBest(gameId: string): number {
  try {
    const raw = localStorage.getItem(`${TABLE_PREFIX}${gameId}`);
    if (!raw) return 0;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return 0;
    return parsed.reduce<number>((best, entry) => {
      const score = (entry as ScoreEntry | null)?.score;
      return typeof score === 'number' && Number.isFinite(score) && score > best ? score : best;
    }, 0);
  } catch {
    return 0;
  }
}

/**
 * This device's best run at a game.
 *
 * Migrates on first read, newest source first: the dedicated key, then the
 * retired table's best row, then the single-number key that predated both. A
 * migrated value is written through, so the older sources are consulted once
 * per game and never again.
 */
export function loadBest(gameId: string): number {
  const stored = loadScore(bestKey(gameId));
  if (stored > 0) return stored;
  const legacyKey = LEGACY_KEYS[gameId];
  const migrated = Math.max(retiredTableBest(gameId), legacyKey ? loadScore(legacyKey) : 0);
  if (migrated > 0) saveScore(bestKey(gameId), migrated);
  return migrated;
}

/** Records a personal best, ignoring anything that does not beat the old one. */
export function saveBest(gameId: string, score: number): void {
  if (score > loadBest(gameId)) saveScore(bestKey(gameId), score);
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
