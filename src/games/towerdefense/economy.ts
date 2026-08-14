/**
 * Line Hold — currency, lives, interest, and score. Score follows the design
 * doc's formula: waves held × base + kill bonus, where each kill's bounty
 * doubles as its score value. Every finished wave pays interest on banked
 * cash (capped, so hoarding never beats building). Surviving a wave is not
 * the same as holding it: a wave that let anything through still pays and
 * still advances the run, but scores nothing.
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
  /**
   * Leaks so far in the wave in progress. Owned here rather than by the
   * caller: `leak` is the one door every marcher that reaches the keep goes
   * through, so counting behind it means the game loop and the headless
   * harness cannot disagree about which waves were held.
   */
  leakedThisWave: number;
}

export function createEconomy(): Economy {
  return {
    money: START_MONEY,
    lives: START_LIVES,
    wavesCleared: 0,
    wavesHeld: 0,
    killScore: 0,
    leakedThisWave: 0
  };
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

/**
 * A leaked enemy costs its lives toll and marks the wave in progress as no
 * longer held; returns the lives remaining.
 */
export function leak(eco: Economy, livesCost: number): number {
  eco.leakedThisWave++;
  eco.lives = Math.max(0, eco.lives - livesCost);
  return eco.lives;
}

/**
 * Banks a finished wave and opens the next one's leak count. A wave that let
 * anything into the keep was survived but not held: the run still advances,
 * but the wave pays no score, so an undefended line earns nothing. Interest
 * is paid on every finished wave — withholding it too would compound a
 * scoring rule into a difficulty spiral (see issue #254).
 */
export function clearWave(eco: Economy): { held: boolean; interest: number } {
  const held = eco.leakedThisWave === 0;
  eco.leakedThisWave = 0;
  eco.wavesCleared++;
  if (held) eco.wavesHeld++;
  const interest = Math.min(INTEREST_CAP, Math.floor(eco.money * INTEREST_RATE));
  eco.money += interest;
  return { held, interest };
}

/** The run's score: waves held × base + kill bonus. */
export function score(eco: Economy): number {
  return eco.wavesHeld * WAVE_BASE + eco.killScore;
}
