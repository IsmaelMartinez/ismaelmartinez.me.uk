/**
 * Level-unlock, level-select, and progress persistence for Critter Rescue.
 *
 * Progress has a single source of truth: the highest level *cleared*, kept in
 * its own storage key (backed by engine/storage.ts). This module derives the
 * level-select state from that number rather than storing a competing copy.
 *
 * Clearing a level opens the next one (that is exactly what the game's own
 * "Next Level" button does), so with `c` levels cleared the player has reached
 * level `c + 1` and levels 1..c+1 are unlocked — capped at the number of levels,
 * and with level 1 always available even from a cold start (`c = 0`).
 *
 * Before the scoring rework the game persisted progress through the high-score
 * table itself (the "score" was the highest level cleared); the table now
 * holds run points, so `legacyClearedFromScore` recognises an old table entry
 * and `loadClearedLevels` migrates it into the dedicated key once.
 *
 * Everything except the two thin storage wrappers is DOM-free so the rules are
 * unit-testable without a canvas.
 */
import { loadScore, saveScore } from '../engine/storage';

/**
 * How many levels are unlocked given the highest level cleared so far.
 * Clearing level K unlocks level K+1; level 1 is always available and the
 * count never exceeds the number of levels.
 */
export function unlockedCount(highestCleared: number, totalLevels: number): number {
  if (totalLevels <= 0) return 0;
  const cleared = Number.isFinite(highestCleared) ? Math.floor(highestCleared) : 0;
  return Math.max(1, Math.min(cleared + 1, totalLevels));
}

export interface LevelSelectItem {
  /** 0-based index into the LEVELS array — what the game loads. */
  index: number;
  /** 1-based number shown to the player. */
  number: number;
  /** True when the player may jump to this level. */
  unlocked: boolean;
}

/**
 * Builds the ordered list the level-select grid renders, one entry per level.
 */
export function levelSelectItems(
  totalLevels: number,
  highestCleared: number
): LevelSelectItem[] {
  const unlocked = unlockedCount(highestCleared, totalLevels);
  const items: LevelSelectItem[] = [];
  for (let i = 0; i < totalLevels; i++) {
    items.push({ index: i, number: i + 1, unlocked: i < unlocked });
  }
  return items;
}

const PROGRESS_KEY = 'critter-cleared-levels';

/**
 * Interprets a high-score-table score under the pre-rework semantics, where
 * the stored "score" was the highest level cleared. Point scores are always at
 * least RESCUE_POINTS (100) — far above any level number — so a small integer
 * in range can only be a legacy progress entry. Returns 0 when the score is
 * not a legacy value.
 */
export function legacyClearedFromScore(score: number, totalLevels: number): number {
  return Number.isInteger(score) && score >= 1 && score <= totalLevels ? score : 0;
}

/**
 * Highest level cleared on this device. When the dedicated key has never been
 * written, falls back to (and migrates) a legacy table entry via
 * `legacyClearedFromScore` — pass the current table-top score.
 */
export function loadClearedLevels(legacyTopScore: number, totalLevels: number): number {
  const stored = loadScore(PROGRESS_KEY);
  if (stored > 0) return Math.min(Math.floor(stored), totalLevels);
  const migrated = legacyClearedFromScore(legacyTopScore, totalLevels);
  if (migrated > 0) saveScore(PROGRESS_KEY, migrated);
  return migrated;
}

export function saveClearedLevels(cleared: number): void {
  saveScore(PROGRESS_KEY, cleared);
}
