/**
 * Microcity population milestones and their one-time cash grants. Crossing a
 * milestone pays its grant — capital to fund the next tier of growth against
 * the per-capita economy — and the final milestone crowns the city a
 * metropolis: a prestige win after which play continues endless (the run still
 * ends only on bankruptcy). Pure so the ladder is testable.
 */

/** Population thresholds, ascending; the last is the metropolis win. */
export const POP_MILESTONES = [100, 250, 500, 1000, 2000];

/** Cash paid on crossing each milestone, parallel to POP_MILESTONES. */
export const MILESTONE_GRANTS = [400, 900, 1800, 4000, 8000];

/** Index of the milestone that crowns the city — the endless-mode threshold. */
export const METROPOLIS_INDEX = POP_MILESTONES.length - 1;
