/**
 * Shared arcade board fixtures, in the manner of `seeded-random.ts`.
 *
 * "A board with no room left" is asserted against from two directions now that
 * the per-device table is gone: `highscores.test.ts` checks the `qualifies`
 * rule itself, and `scoreboard-dom.test.ts` checks that a run which cannot
 * chart is still submitted. One definition keeps them from drifting apart from
 * `MAX_ENTRIES` independently.
 */
import { MAX_ENTRIES, type ScoreEntry } from '../../src/games/engine/highscores';

/** Ten descending entries, 1000 down to 100, so nothing cheap can chart. */
export const fullBoard = (): ScoreEntry[] =>
  Array.from({ length: MAX_ENTRIES }, (_, i) => ({
    initials: 'AAA',
    score: (MAX_ENTRIES - i) * 100
  }));
