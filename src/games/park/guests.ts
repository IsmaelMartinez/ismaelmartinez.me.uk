/**
 * Guest needs model. Each need sits on a 0–100 scale where 100 is fully
 * satisfied; needs decay over time and buildings restore them.
 */
import type { NeedKey } from './grid';

export interface Needs {
  fun: number;
  hunger: number;
  thirst: number;
  bladder: number;
}

export const NEED_KEYS: NeedKey[] = ['fun', 'hunger', 'thirst', 'bladder'];

/** Points lost per second per need. Fun decays fastest — it's a theme park. */
export const NEED_DECAY: Record<NeedKey, number> = {
  fun: 3,
  hunger: 1.6,
  thirst: 2,
  bladder: 1.2
};

/** A need below this starts driving guest decisions. */
export const URGENT_THRESHOLD = 55;

export function createNeeds(random: () => number = Math.random): Needs {
  return {
    fun: 55 + random() * 25,
    hunger: 70 + random() * 30,
    thirst: 70 + random() * 30,
    bladder: 80 + random() * 20
  };
}

export function decayNeeds(needs: Needs, dt: number): void {
  for (const key of NEED_KEYS) {
    needs[key] = Math.max(0, needs[key] - NEED_DECAY[key] * dt);
  }
}

/** The lowest need below the urgency threshold, or null if all are fine. */
export function mostUrgentNeed(needs: Needs): NeedKey | null {
  let worst: NeedKey | null = null;
  for (const key of NEED_KEYS) {
    if (needs[key] < URGENT_THRESHOLD && (worst === null || needs[key] < needs[worst])) {
      worst = key;
    }
  }
  return worst;
}

export function satisfyNeed(needs: Needs, key: NeedKey, boost: number): void {
  needs[key] = Math.min(100, needs[key] + boost);
}

/** Overall guest happiness, 0–100. */
export function happiness(needs: Needs): number {
  return (needs.fun + needs.hunger + needs.thirst + needs.bladder) / 4;
}
