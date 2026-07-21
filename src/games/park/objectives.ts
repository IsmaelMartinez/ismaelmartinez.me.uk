/**
 * Pixel Park objectives: a paced milestone chain that pays cash on completion
 * and ends in an "established" prestige win, after which play continues endless
 * (the run still ends only on bankruptcy). Rewards inject capital that offsets
 * the rising wage bill — the intended economic loop. Pure and DOM-free so the
 * ladder is testable.
 */

/** Which live figure an objective is measured against. */
export type ParkMetric = 'welcomed' | 'rating' | 'peak';

export interface ParkProgress {
  /** Lifetime guests admitted through the gate — the banked score. */
  welcomed: number;
  /** Best concurrent crowd so far. */
  peak: number;
  /** Current park rating, 0–100. */
  rating: number;
}

export interface ParkObjective {
  metric: ParkMetric;
  target: number;
  /** Cash paid when the objective is met. */
  reward: number;
  /** i18n key suffix for the templated goal text ('{n}' → target). */
  labelKey: 'objWelcome' | 'objRating' | 'objCrowd';
  /** The final objective is the prestige win — completing it flips endless. */
  win?: boolean;
}

/**
 * The ladder, in order. Metrics chosen so every rung is checkable from a
 * compact progress snapshot; targets rise; the last rung is the crowning
 * "flagship park" with no cash (it is the finish, not a payout).
 */
export const PARK_OBJECTIVES: ParkObjective[] = [
  { metric: 'welcomed', target: 10, reward: 250, labelKey: 'objWelcome' },
  { metric: 'rating', target: 60, reward: 500, labelKey: 'objRating' },
  { metric: 'peak', target: 45, reward: 700, labelKey: 'objCrowd' },
  { metric: 'welcomed', target: 400, reward: 900, labelKey: 'objWelcome' },
  { metric: 'peak', target: 90, reward: 0, labelKey: 'objCrowd', win: true }
];

/** Whether `progress` satisfies objective `obj`. */
export function objectiveMet(obj: ParkObjective, progress: ParkProgress): boolean {
  return progress[obj.metric] >= obj.target;
}

/** The metric value toward an objective, clamped to its target — for the HUD readout. */
export function objectiveProgress(obj: ParkObjective, progress: ParkProgress): number {
  return Math.min(progress[obj.metric], obj.target);
}
