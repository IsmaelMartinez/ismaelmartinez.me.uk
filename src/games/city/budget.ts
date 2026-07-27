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
