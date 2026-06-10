/**
 * Microcity growth simulation: power coverage, RCI demand, and the periodic
 * step where zones develop or decay.
 */
import { gridNeighbours, chebyshev } from '../engine/grid2d';
import { CITY_W, CITY_H, MAX_LEVEL, isZone, type CityTile, type ZoneType } from './tiles';

export const POWER_RADIUS = 7;
export const RESIDENTS_PER_LEVEL = 8;
export const COM_JOBS_PER_LEVEL = 6;
export const IND_JOBS_PER_LEVEL = 8;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** A tile is powered when any power plant sits within POWER_RADIUS of it. */
export function computePowered(tiles: CityTile[]): boolean[] {
  const plants: number[] = [];
  tiles.forEach((tile, i) => {
    if (tile.type === 'power') plants.push(i);
  });
  return tiles.map((_, i) => plants.some(p => chebyshev(i, p, CITY_W) <= POWER_RADIUS));
}

export function roadAdjacent(tiles: CityTile[], i: number): boolean {
  return gridNeighbours(i, CITY_W, CITY_H).some(n => tiles[n].type === 'road');
}

export interface CityStats {
  population: number;
  comJobs: number;
  indJobs: number;
  jobs: number;
}

export function cityStats(tiles: CityTile[]): CityStats {
  let population = 0;
  let comJobs = 0;
  let indJobs = 0;
  for (const tile of tiles) {
    if (tile.type === 'res') population += tile.level * RESIDENTS_PER_LEVEL;
    else if (tile.type === 'com') comJobs += tile.level * COM_JOBS_PER_LEVEL;
    else if (tile.type === 'ind') indJobs += tile.level * IND_JOBS_PER_LEVEL;
  }
  return { population, comJobs, indJobs, jobs: comJobs + indJobs };
}

export type Demand = Record<ZoneType, number>;

/**
 * Classic coupled RCI demand, clamped to ±50. People move in where there are
 * jobs; shops want customers; industry wants workers. The +16 base keeps a
 * fresh city bootstrappable.
 */
export function computeDemand(stats: CityStats): Demand {
  return {
    res: clamp(stats.jobs + 16 - stats.population, -50, 50),
    com: clamp(stats.population * 0.35 - stats.comJobs, -50, 50),
    ind: clamp(stats.population * 0.55 - stats.indJobs, -50, 50)
  };
}

export function hasParkNearby(tiles: CityTile[], i: number, radius = 3): boolean {
  return tiles.some((tile, j) => tile.type === 'park' && chebyshev(i, j, CITY_W) <= radius);
}

/**
 * One growth tick. Serviced zones (powered + next to a road) develop while
 * demand for their type is positive; unserviced developed zones decay.
 * Residential needs a park nearby to reach the top level.
 */
export function growthStep(
  tiles: CityTile[],
  random: () => number = Math.random
): { grown: number; decayed: number } {
  const powered = computePowered(tiles);
  const demand = computeDemand(cityStats(tiles));
  let grown = 0;
  let decayed = 0;

  tiles.forEach((tile, i) => {
    if (!isZone(tile.type)) return;
    const serviced = powered[i] && roadAdjacent(tiles, i);
    if (!serviced) {
      if (tile.level > 0 && random() < 0.08) {
        tile.level--;
        decayed++;
      }
      return;
    }
    if (tile.level >= MAX_LEVEL || demand[tile.type] <= 0) return;
    if (tile.type === 'res' && tile.level === MAX_LEVEL - 1 && !hasParkNearby(tiles, i)) return;
    if (random() < Math.min(0.45, demand[tile.type] / 70)) {
      tile.level++;
      grown++;
    }
  });

  return { grown, decayed };
}
