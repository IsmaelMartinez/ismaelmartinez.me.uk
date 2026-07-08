/**
 * Microcity treasury: monthly tax income vs. infrastructure upkeep.
 */
import type { CityTile, CityTileType } from './tiles';
import type { CityStats } from './simulation';

export const TAX_PER_RESIDENT = 1.5;
export const TAX_PER_JOB = 1;

const UPKEEP: Partial<Record<CityTileType, number>> = {
  road: 1,
  bridge: 3,
  power: 40,
  park: 3,
  school: 15,
  firehouse: 12
};

export function monthlyIncome(stats: CityStats): number {
  return Math.round(stats.population * TAX_PER_RESIDENT + stats.jobs * TAX_PER_JOB);
}

export function monthlyExpenses(tiles: CityTile[]): number {
  let total = 0;
  for (const tile of tiles) {
    total += UPKEEP[tile.type] ?? 0;
  }
  return total;
}
