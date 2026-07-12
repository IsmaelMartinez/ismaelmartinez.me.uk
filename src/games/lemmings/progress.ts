/**
 * Level-unlock and level-select logic for Critter Rescue.
 *
 * Progress has a single source of truth: the "highest level reached" value the
 * game already persists through the shared scoreboard (see game.ts and
 * engine/scoreboard.ts, backed by engine/storage.ts). This module derives the
 * level-select state from that number rather than storing a competing copy —
 * levels 1..N are unlocked where N is the highest level reached, and level 1 is
 * always available even from a cold start.
 *
 * It is intentionally DOM-free so the rules are unit-testable without a canvas.
 */

/**
 * How many levels are unlocked given the highest level reached so far.
 * Level 1 is always available; the count never exceeds the number of levels.
 */
export function unlockedCount(highestReached: number, totalLevels: number): number {
  if (totalLevels <= 0) return 0;
  const reached = Number.isFinite(highestReached) ? Math.floor(highestReached) : 0;
  return Math.max(1, Math.min(reached, totalLevels));
}

/** Whether a given 0-based level index can be selected yet. */
export function isLevelUnlocked(
  levelIndex: number,
  highestReached: number,
  totalLevels: number
): boolean {
  return (
    Number.isInteger(levelIndex) &&
    levelIndex >= 0 &&
    levelIndex < unlockedCount(highestReached, totalLevels)
  );
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
  highestReached: number
): LevelSelectItem[] {
  const unlocked = unlockedCount(highestReached, totalLevels);
  const items: LevelSelectItem[] = [];
  for (let i = 0; i < totalLevels; i++) {
    items.push({ index: i, number: i + 1, unlocked: i < unlocked });
  }
  return items;
}
