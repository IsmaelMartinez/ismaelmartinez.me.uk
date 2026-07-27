/**
 * Pure scoring rules for Critter Rescue.
 *
 * A run accumulates points across consecutive levels: every rescue banks a
 * base amount, rapid back-to-back rescues chain into a combo that pays a
 * little more per link, and clearing a level adds three end-of-level bonuses
 * (beating the level's par time, bringing every critter home, and rescues
 * beyond the quota). The game layer (game.ts) owns the tick counter and the
 * HUD; everything here is DOM-free maths so the rules are unit-testable.
 */

/** Base points banked for every rescued critter. */
export const RESCUE_POINTS = 100;
/** Ticks (60/s) after a rescue within which the next one extends the combo. */
export const COMBO_WINDOW = 90;
/** Extra points per combo link beyond the first. */
export const COMBO_STEP = 25;
/** Combo links stop paying more beyond this streak length. */
export const COMBO_MAX_STREAK = 6;
/** Points per rescue beyond the level quota. */
export const OVER_QUOTA_POINTS = 50;
/** Bonus for bringing every spawned critter home. */
export const PERFECT_BONUS = 300;
/** Ceiling of the par-time bonus (paid in full only at instant clears). */
export const TIME_BONUS_MAX = 400;

export interface ComboState {
  /** Consecutive rescues each within COMBO_WINDOW of the previous one. */
  streak: number;
  /** Tick of the most recent rescue; -Infinity before the first. */
  lastRescueTick: number;
}

export function newCombo(): ComboState {
  return { streak: 0, lastRescueTick: -Infinity };
}

/** Advances the combo for a rescue landing at `tick`. */
export function comboOnRescue(state: ComboState, tick: number): ComboState {
  const chained = tick - state.lastRescueTick <= COMBO_WINDOW;
  return { streak: chained ? state.streak + 1 : 1, lastRescueTick: tick };
}

/** Points paid for a rescue at the given streak position (1 = no combo). */
export function rescuePoints(streak: number): number {
  const links = Math.max(1, Math.min(streak, COMBO_MAX_STREAK));
  return RESCUE_POINTS + (links - 1) * COMBO_STEP;
}

export interface LevelOutcome {
  saved: number;
  needed: number;
  spawnCount: number;
  /** Ticks the level took, from first spawn to resolution. */
  ticks: number;
  /** The level's par time in ticks; the time bonus fades to zero here. */
  par: number;
}

export interface BonusBreakdown {
  /** Under-par speed bonus, linear from TIME_BONUS_MAX at 0 ticks to 0 at par. */
  time: number;
  /** PERFECT_BONUS when every spawned critter was rescued. */
  perfect: number;
  /** OVER_QUOTA_POINTS per rescue beyond the level quota. */
  overQuota: number;
  total: number;
}

const NO_BONUS: BonusBreakdown = { time: 0, perfect: 0, overQuota: 0, total: 0 };

/**
 * End-of-level bonuses. A failed level (quota missed) pays nothing — the
 * per-rescue points already banked are all it earns.
 */
export function levelBonuses(o: LevelOutcome): BonusBreakdown {
  if (o.saved < o.needed) return NO_BONUS;
  const time =
    o.par > 0 ? Math.max(0, Math.round((TIME_BONUS_MAX * (o.par - o.ticks)) / o.par)) : 0;
  const perfect = o.spawnCount > 0 && o.saved >= o.spawnCount ? PERFECT_BONUS : 0;
  const overQuota = Math.max(0, o.saved - o.needed) * OVER_QUOTA_POINTS;
  return { time, perfect, overQuota, total: time + perfect + overQuota };
}
