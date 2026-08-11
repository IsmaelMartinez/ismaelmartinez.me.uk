/**
 * The CALCIO '90 knockout ladder: four rounds against CPU teams of rising
 * difficulty, from the round of 16 to the final. A win advances, a loss (or
 * a scoreless golden-goal minute) ends the run.
 *
 * Scoring, per the arcade's higher-is-better contract: every goal scored is
 * worth 100 and every round won 500, so `ladderScore` grows monotonically —
 * game.ts banks it on each goal and each round win.
 */

export const ROUND_KEYS = ['r16', 'quarter', 'semi', 'final'] as const;
export type RoundKey = (typeof ROUND_KEYS)[number];
export const ROUNDS = ROUND_KEYS.length;

export const GOAL_POINTS = 100;
export const ROUND_POINTS = 500;

/**
 * The opposition, one team per round. Original Italian-flavoured nicknames
 * (eagles, bulls, wolves, lions) — an Italia-'90 homage without anyone's
 * trademark. Proper nouns, so they read the same in all three locales.
 */
export const OPPONENTS: ReadonlyArray<{ name: string; color: string }> = [
  { name: 'Aquile', color: '#f97316' },
  { name: 'Tori', color: '#dc2626' },
  { name: 'Lupi', color: '#a855f7' },
  { name: 'Leoni', color: '#facc15' }
];

export interface Ladder {
  /** Index into ROUND_KEYS of the round about to be (or being) played. */
  round: number;
  /** Goals scored by the player across the whole run. */
  goals: number;
  roundsWon: number;
  over: boolean;
  /** True when the final was won. */
  champion: boolean;
}

export function createLadder(): Ladder {
  return { round: 0, goals: 0, roundsWon: 0, over: false, champion: false };
}

/** CPU difficulty 0..1 for a round index; the final plays at full tilt. */
export function difficultyFor(round: number): number {
  return ROUNDS > 1 ? Math.min(1, round / (ROUNDS - 1)) : 1;
}

/** Fold a finished match into the ladder. `won` false covers golden-goal draws too. */
export function recordMatch(ladder: Ladder, won: boolean, goalsScored: number): void {
  ladder.goals += goalsScored;
  if (!won) {
    ladder.over = true;
    return;
  }
  ladder.roundsWon++;
  ladder.round++;
  if (ladder.round >= ROUNDS) {
    ladder.over = true;
    ladder.champion = true;
  }
}

/** The run's submittable score as it stands. */
export function ladderScore(ladder: Ladder): number {
  return ladder.goals * GOAL_POINTS + ladder.roundsWon * ROUND_POINTS;
}
