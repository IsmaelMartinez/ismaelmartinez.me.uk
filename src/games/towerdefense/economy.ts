/**
 * Line Hold — currency, lives, interest, and score. Score follows the design
 * doc's formula: waves held × base + kill bonus, where each kill's bounty
 * doubles as its score value. Held waves pay interest on banked cash
 * (capped, so hoarding never beats building). Surviving a wave is not the
 * same as holding it: a wave that let anything through pays neither.
 */

export const START_MONEY = 200;
export const START_LIVES = 20;
/** Score per wave held without a leak. */
export const WAVE_BASE = 100;
export const INTEREST_RATE = 0.1;
export const INTEREST_CAP = 60;

export interface Economy {
  money: number;
  lives: number;
  /** Waves the run got through, leaked or not — the run's progress. */
  wavesCleared: number;
  /** Waves that reached the keep with nothing through — the score's wave term. */
  wavesHeld: number;
  /** Accumulated kill bounties — the score's kill-bonus term. */
  killScore: number;
}

export function createEconomy(): Economy {
  return { money: START_MONEY, lives: START_LIVES, wavesCleared: 0, wavesHeld: 0, killScore: 0 };
}

/** Spends `cost` if affordable; false leaves the purse untouched. */
export function spend(eco: Economy, cost: number): boolean {
  if (cost > eco.money) return false;
  eco.money -= cost;
  return true;
}

export function awardKill(eco: Economy, bounty: number): void {
  eco.money += bounty;
  eco.killScore += bounty;
}

/** A leaked enemy costs its lives toll; returns the lives remaining. */
export function leak(eco: Economy, livesCost: number): number {
  eco.lives = Math.max(0, eco.lives - livesCost);
  return eco.lives;
}

/**
 * Banks a finished wave. `held` is false when anything walked into the keep
 * during it: the run still advances, but the wave pays no score and no
 * interest, so an undefended line earns nothing. Returns the interest paid.
 * The flag is required rather than defaulted — a caller that forgets it is a
 * compile error, not a silent free bonus.
 */
export function clearWave(eco: Economy, held: boolean): number {
  eco.wavesCleared++;
  if (!held) return 0;
  eco.wavesHeld++;
  const interest = Math.min(INTEREST_CAP, Math.floor(eco.money * INTEREST_RATE));
  eco.money += interest;
  return interest;
}

/** The run's score: waves held × base + kill bonus. */
export function score(eco: Economy): number {
  return eco.wavesHeld * WAVE_BASE + eco.killScore;
}
