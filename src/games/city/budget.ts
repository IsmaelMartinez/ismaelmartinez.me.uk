/**
 * Microcity treasury: monthly tax income vs. infrastructure upkeep plus the
 * per-capita running cost that keeps income from running away from a flat bill.
 */
import type { CityTile, CityTileType } from './tiles';
import type { CityStats } from './simulation';

export const TAX_PER_RESIDENT = 1.5;
export const TAX_PER_JOB = 1;
/**
 * Running cost for every resident + job serviced *beyond the free allowance*.
 * Set just under the tax take so, at scale, a city runs only a thin surplus:
 * sprawl, over-servicing, political fines, or a disaster's lost income (while
 * costs lag through the rebuild) can drain the treasury — income no longer
 * trivially outscales a flat per-tile upkeep, so `money<0` is a live threat.
 */
export const SERVICE_COST_PER_CAPITA = 0.9;
/**
 * The city services this many residents + jobs for free. The per-capita bill
 * applies only to the population past it, so the squeeze is a *late-game* one
 * — a small or still-growing city is never bled to death, keeping the pressure
 * where the audit wanted it (a developed city that can no longer coast).
 */
export const SERVICE_FREE_ALLOWANCE = 150;

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
 * `stats` is supplied — the per-capita service bill that scales with the
 * population and jobs served. The no-stats form is the pure infrastructure
 * bill (used where the city's population isn't to hand).
 */
export function monthlyExpenses(tiles: CityTile[], stats?: CityStats): number {
  let total = 0;
  for (const tile of tiles) {
    total += UPKEEP[tile.type] ?? 0;
  }
  if (stats) {
    const billed = Math.max(0, stats.population + stats.jobs - SERVICE_FREE_ALLOWANCE);
    total += Math.round(billed * SERVICE_COST_PER_CAPITA);
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
