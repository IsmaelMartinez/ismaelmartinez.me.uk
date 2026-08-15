/**
 * Tank Duel scoring — the pure rules, kept out of the DOM wiring in game.ts.
 *
 * The cabinet used to have no running score at all: a single `matchScore`
 * number (round margin × 100 + armour) existed only at match end, was negative
 * for most of a match's life, and was hidden unless the player beat the CPU.
 * The rules here replace it with a score that only ever grows and is awarded
 * the moment the player earns it, so the number on the header is the number
 * the run submits.
 *
 * Both modes score identically; only submission differs (`submitsToBoard`).
 * Nothing is ever subtracted — a negative running total was the old bug in
 * miniature — so `add` drops any non-positive award instead of banking it.
 */

export type TankMode = 'cpu' | '2p';

/** Points per hp of damage landed on the opponent. */
export const DAMAGE_POINTS = 1;
/** Bonus for detonating a shell on the enemy tank itself. */
export const DIRECT_HIT_POINTS = 25;
/** Bonus for taking a round. */
export const ROUND_WIN_POINTS = 250;

export interface ScoreLedger {
  /**
   * Damage that just landed. Awards the shooter 1 point per hp actually
   * removed; self-damage and fall damage (`shooter` null) are worth nothing.
   * Returns the points awarded, so the caller can float exactly that number.
   */
  damage(shooter: number | null, target: number, hp: number): number;
  /**
   * A shell detonated on a tank. Worth nothing when it was the shooter's own,
   * and nothing on a wreck: `targetHp` is the armour the tank had when the
   * shell arrived, and a tank already at zero pays no bonus (a MIRV's later
   * warheads would otherwise each collect one off a tank that is already dead).
   */
  directHit(shooter: number, target: number, targetHp: number): number;
  /** The round's winner takes a flat bonus; a mutual kill (null) takes none. */
  roundWin(winner: number | null): number;
  /** Surviving armour, folded in once when the match ends. */
  survivingArmour(player: number, hp: number): number;
  /** Running total for a player. */
  total(player: number): number;
  /** Clear both totals (a new match). */
  reset(): void;
}

export function createScoreLedger(): ScoreLedger {
  const totals = [0, 0];
  /** The one write path: a non-positive award changes nothing and floats nothing. */
  const add = (player: number, points: number): number => {
    if (!(points > 0)) return 0;
    totals[player] += points;
    return points;
  };
  return {
    damage(shooter, target, hp) {
      if (shooter === null || shooter === target) return 0;
      return add(shooter, Math.round(hp) * DAMAGE_POINTS);
    },
    directHit(shooter, target, targetHp) {
      // The same guard `damage` applies through the hp actually removed: a
      // wreck has no armour left to take, so shelling it earns nothing.
      if (shooter === target || targetHp <= 0) return 0;
      return add(shooter, DIRECT_HIT_POINTS);
    },
    roundWin(winner) {
      if (winner === null) return 0;
      return add(winner, ROUND_WIN_POINTS);
    },
    survivingArmour(player, hp) {
      return add(player, Math.round(hp));
    },
    total: player => totals[player],
    reset() {
      totals[0] = 0;
      totals[1] = 0;
    }
  };
}

/**
 * Whether a finished match may be offered to the shared leaderboard.
 *
 * Vs-CPU only, and deliberately so: in two-player both tanks are driven from
 * the same keyboard, so one person can farm any score they like by lining a
 * defenceless second tank up and shelling it. A 2P match still scores on
 * screen, but it reaches neither the world board nor the personal best that
 * feeds the arcade floor's attract screens. Do not widen this gate.
 */
export function submitsToBoard(mode: TankMode): boolean {
  return mode === 'cpu';
}
