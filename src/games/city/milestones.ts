/**
 * Microcity population milestones and their one-time cash grants. Crossing a
 * milestone pays its grant — capital to fund the next tier of growth against
 * the per-capita economy — and the final milestone crowns the city a
 * metropolis: a prestige win after which play continues endless (the run still
 * ends only on bankruptcy). Pure so the ladder is testable.
 *
 * The ladder is sized to what a city can actually reach, not to a round
 * number (issue #265). It used to top out at 2000, which nothing ever hit:
 * `computeDemand` bounds total jobs at 0.9× population, so residential demand
 * crosses zero around population 160 and everything above that is per-tick
 * overshoot plus the slow ratchet that political events (a festival's +15 res)
 * add on top. Measured over headless runs of the real modules: a maximised
 * city with unlimited money peaks at a median ~1200 and never reached 2000,
 * while a competent builder paying real prices takes roughly twenty minutes to
 * pass 600 and half an hour to approach four figures. So the top rung sits at
 * 600 — a stretch a strong city reaches inside one long sitting — and the
 * lower rungs come in early enough that a first city is paid for building
 * anything at all. Retuning the ladder is a mitigation, not a cure: the
 * demand deadlock underneath it is tracked separately.
 */

/** Population thresholds, ascending; the last is the metropolis win. */
export const POP_MILESTONES = [50, 120, 250, 400, 600];

/** Cash paid on crossing each milestone, parallel to POP_MILESTONES. */
export const MILESTONE_GRANTS = [400, 900, 1800, 4000, 8000];

/** Index of the milestone that crowns the city — the endless-mode threshold. */
export const METROPOLIS_INDEX = POP_MILESTONES.length - 1;
