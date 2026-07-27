/**
 * Line Hold — currency, lives, interest, and score. Score follows the design
 * doc's formula: waves cleared × base + kill bonus, where each kill's bounty
 * doubles as its score value. Cleared waves pay interest on banked cash
 * (capped, so hoarding never beats building).
 */

export const START_MONEY = 200;
export const START_LIVES = 20;
/** Score per cleared wave. */
export const WAVE_BASE = 100;
export const INTEREST_RATE = 0.1;
export const INTEREST_CAP = 60;

export interface Economy {
  money: number;
  lives: number;
  wavesCleared: number;
  /** Accumulated kill bounties — the score's kill-bonus term. */
  killScore: number;
}

export function createEconomy(): Economy {
  return { money: START_MONEY, lives: START_LIVES, wavesCleared: 0, killScore: 0 };
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

/** Banks a cleared wave and pays interest on the cash in hand; returns the interest. */
export function clearWave(eco: Economy): number {
  eco.wavesCleared++;
  const interest = Math.min(INTEREST_CAP, Math.floor(eco.money * INTEREST_RATE));
  eco.money += interest;
  return interest;
}

/** The run's score: waves cleared × base + kill bonus. */
export function score(eco: Economy): number {
  return eco.wavesCleared * WAVE_BASE + eco.killScore;
}
