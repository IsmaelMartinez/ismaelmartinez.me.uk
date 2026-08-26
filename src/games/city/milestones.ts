/**
 * Microcity population milestones and their one-time cash grants. Crossing a
 * milestone pays its grant — capital to fund the next tier of growth against
 * the per-capita economy — and the final milestone crowns the city a
 * metropolis: a prestige win after which play continues endless (the run still
 * ends only on bankruptcy). Pure so the ladder is testable.
 *
 * The ladder is sized to what a city can actually reach, not to a round
 * number (issue #265). It used to top out at 2000, which nothing ever hit,
 * because `computeDemand` deadlocked: a competently built board froze and only
 * grew again when a disaster knocked buildings down. So the rungs were first
 * cut to 50/120/250/400/600 against those stalled dynamics.
 *
 * Fixing the deadlock (issue #301) moved the distribution the ladder is
 * measured against rather than the shape of it. Over the same headless sample
 * of 600 runs across twelve builder profiles — real prices, real terrain, real
 * disasters and politics — the median peak rose from 1072 to 1216, the upper
 * quartile from 1536 to 2000 and the best run seen from 1904 to 2536, while a
 * competent full-map build went from a median 1684 to 2416. A 600 top rung
 * that a competent city crossed at month 43 is now crossed at month 22, which
 * is a win handed out in the first few minutes of a run that lasts hours. So
 * the top two rungs move up with the ceiling: 500 and 1000, reached by 79% and
 * 69% of that sample against 86% and 78% at 400/600, and 1000 is about where a
 * player has to zone and service half the map. The lower three are left where
 * #304 put them — a first city is still paid for building anything at all.
 */

/** Population thresholds, ascending; the last is the metropolis win. */
export const POP_MILESTONES = [50, 120, 250, 500, 1000];

/** Cash paid on crossing each milestone, parallel to POP_MILESTONES. */
export const MILESTONE_GRANTS = [400, 900, 1800, 4000, 8000];

/** Index of the milestone that crowns the city — the endless-mode threshold. */
export const METROPOLIS_INDEX = POP_MILESTONES.length - 1;
