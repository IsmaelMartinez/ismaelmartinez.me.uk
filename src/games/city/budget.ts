/**
 * Microcity treasury: monthly tax income vs. infrastructure upkeep plus the
 * per-capita running cost that keeps income from running away from a flat bill.
 * That cost is charged in two bands — a growing city's rate and, past
 * `SERVICE_DENSE_THRESHOLD`, a dense one — so the pressure lands on a finished
 * city rather than on one still filling its map.
 */
import type { CityTile, CityTileType } from './tiles';
import type { CityStats } from './simulation';

export const TAX_PER_RESIDENT = 1.5;
export const TAX_PER_JOB = 1;
/**
 * Running cost for every resident + job serviced *beyond the free allowance*
 * and below the dense threshold — a growing city's rate. Kept under the tax
 * take so a city that is still filling its map keeps a working surplus to
 * zone with; the squeeze on a finished one is the dense rate below.
 */
export const SERVICE_COST_PER_CAPITA = 0.9;
/**
 * The city services this many residents + jobs for free. The per-capita bill
 * applies only to the population past it, so the squeeze is a *late-game* one
 * — a small or still-growing city is never bled to death, keeping the pressure
 * where the audit wanted it (a developed city that can no longer coast).
 */
export const SERVICE_FREE_ALLOWANCE = 150;
/**
 * Residents + jobs past which every further head is billed at the dense rate.
 * A resident arrives with a job beside them (below), so this is a city of
 * about 500 people — the fourth rung of the milestone ladder, which is already
 * the point the game stops treating a city as one that is finding its feet.
 * Written out rather than read from `POP_MILESTONES` on purpose: retuning the
 * ladder must not silently retune the economy underneath it.
 */
export const SERVICE_DENSE_THRESHOLD = 1000;
/**
 * What a head costs to service in a big city: exactly what a head pays in tax.
 * Not a fudge factor — the demand model makes jobs converge on population
 * (`COM_JOB_SHARE + IND_JOB_SHARE === 1`, see simulation.ts), so a resident
 * arrives with one job beside them and the pair pay
 * `TAX_PER_RESIDENT + TAX_PER_JOB` across two billed heads. Billing the
 * marginal head at that average is what stops growth from being free money:
 * past the threshold a metropolis keeps its *exemptions* (the free allowance,
 * and the discount on everything under the threshold) minus its infrastructure
 * upkeep, and nothing else — so the books of a finished city are decided by
 * what it built rather than by how big it got.
 *
 * A single flat rate cannot do this job (issue #309). The one rate that
 * flattens a saturated city's surplus, ~1.18, is charged from the first head
 * past the allowance, which taxes the mid game hardest of all — measured over
 * 10 seeds of the full loop it cut the median peak population from 1996 to 920
 * and bankrupted a competent build on 4 seeds in 10, because a city that
 * cannot afford to zone stops growing and then cannot afford its own upkeep.
 */
export const SERVICE_COST_PER_CAPITA_DENSE = (TAX_PER_RESIDENT + TAX_PER_JOB) / 2;

const UPKEEP: Partial<Record<CityTileType, number>> = {
  road: 1,
  bridge: 3,
  power: 40,
  park: 3,
  school: 15,
  firehouse: 12,
  police: 14
};

export function monthlyIncome(stats: CityStats): number {
  return Math.round(stats.population * TAX_PER_RESIDENT + stats.jobs * TAX_PER_JOB);
}

/**
 * Monthly running costs: fixed per-tile infrastructure upkeep, plus — when
 * `stats` is supplied — the two-band per-capita service bill that scales with
 * the population and jobs served. The no-stats form is the pure infrastructure
 * bill (used where the city's population isn't to hand).
 */
export function monthlyExpenses(tiles: CityTile[], stats?: CityStats): number {
  let total = 0;
  for (const tile of tiles) {
    total += UPKEEP[tile.type] ?? 0;
  }
  if (stats) {
    const capita = stats.population + stats.jobs;
    const billed = Math.max(0, capita - SERVICE_FREE_ALLOWANCE);
    const dense = Math.max(0, capita - SERVICE_DENSE_THRESHOLD);
    total += Math.round(
      (billed - dense) * SERVICE_COST_PER_CAPITA + dense * SERVICE_COST_PER_CAPITA_DENSE
    );
  }
  return total;
}

/** What a month's books mean for the run. */
export type Solvency = 'ok' | 'lowFunds' | 'grace' | 'bankrupt';

/**
 * Reads the month's books as a verdict on the run: `money` is the treasury
 * after they were charged, `cashflow` the income minus expenses just charged
 * (the closest thing to a projection of next month's, since nothing else
 * knows what the player is about to build), and `wasOverdrawn` whether the
 * *previous* books already left the city in the red — its grace month.
 *
 * Bankruptcy used to be the first negative balance, unannounced: a first-time
 * visitor was out inside a minute with no idea which bill did it (issue #266).
 * So a solvent city whose own cashflow would take it under next month is
 * warned first, and an overdrawn one gets one grace month to bulldoze what it
 * cannot pay for or grow its tax base. The run ends only when a second set of
 * books in a row finds the treasury still empty — and a city that climbs back
 * into the black clears its grace, so the reprieve is per slide, not per run.
 */
export function solvency(money: number, cashflow: number, wasOverdrawn: boolean): Solvency {
  if (money < 0) return wasOverdrawn ? 'bankrupt' : 'grace';
  return cashflow < 0 && money + cashflow < 0 ? 'lowFunds' : 'ok';
}
