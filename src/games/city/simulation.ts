/**
 * Microcity growth simulation: power coverage, service coverage (schools,
 * fire stations), RCI demand, and the periodic step where zones develop or
 * decay.
 */
import { gridNeighbours, chebyshev } from '../engine/grid2d';
import { CITY_W, CITY_H, MAX_LEVEL, isZone, isRoad, type CityTile, type ZoneType } from './tiles';

export const POWER_RADIUS = 7;
export const SCHOOL_RADIUS = 6;
export const FIRE_RADIUS = 6;
export const RESIDENTS_PER_LEVEL = 8;
export const COM_JOBS_PER_LEVEL = 6;
export const IND_JOBS_PER_LEVEL = 8;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function coverage(tiles: CityTile[], sourceType: CityTile['type'], radius: number): boolean[] {
  const sources: number[] = [];
  tiles.forEach((tile, i) => {
    if (tile.type === sourceType) sources.push(i);
  });
  return tiles.map((_, i) => sources.some(s => chebyshev(i, s, CITY_W) <= radius));
}

/** A tile is powered when any power plant sits within POWER_RADIUS of it. */
export function computePowered(tiles: CityTile[]): boolean[] {
  return coverage(tiles, 'power', POWER_RADIUS);
}

/** Fire-station coverage: fires here ignite less, spread less, die faster. */
export function computeFireCover(tiles: CityTile[]): boolean[] {
  return coverage(tiles, 'firehouse', FIRE_RADIUS);
}

export function roadAdjacent(tiles: CityTile[], i: number): boolean {
  return gridNeighbours(i, CITY_W, CITY_H).some(n => isRoad(tiles[n].type));
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
 * fresh city bootstrappable. `modifier` layers temporary event effects
 * (festivals, strikes…) on top before clamping.
 */
export function computeDemand(stats: CityStats, modifier: Partial<Demand> = {}): Demand {
  return {
    res: clamp(stats.jobs + 16 - stats.population + (modifier.res ?? 0), -50, 50),
    com: clamp(stats.population * 0.35 - stats.comJobs + (modifier.com ?? 0), -50, 50),
    ind: clamp(stats.population * 0.55 - stats.indJobs + (modifier.ind ?? 0), -50, 50)
  };
}

/** Parks, forests, and riverfront all count as desirable nature. */
export function hasNatureNearby(tiles: CityTile[], i: number, radius = 3): boolean {
  return tiles.some(
    (tile, j) =>
      (tile.type === 'park' || tile.type === 'tree' || tile.type === 'water') &&
      chebyshev(i, j, CITY_W) <= radius
  );
}

export function hasSchoolNearby(tiles: CityTile[], i: number, radius = SCHOOL_RADIUS): boolean {
  return tiles.some((tile, j) => tile.type === 'school' && chebyshev(i, j, CITY_W) <= radius);
}

/**
 * One growth tick. Serviced zones (powered + next to a road) develop while
 * demand for their type is positive; unserviced developed zones decay.
 * Residential needs nature (park, forest, or riverfront) nearby to pass
 * level 1 and a school nearby to reach the top level. Returns the tile
 * indices that changed so the UI can celebrate (or mourn) them.
 */
export function growthStep(
  tiles: CityTile[],
  random: () => number = Math.random,
  demandModifier: Partial<Demand> = {}
): { grown: number[]; decayed: number[] } {
  const powered = computePowered(tiles);
  const demand = computeDemand(cityStats(tiles), demandModifier);
  const grown: number[] = [];
  const decayed: number[] = [];

  tiles.forEach((tile, i) => {
    if (!isZone(tile.type)) return;
    const serviced = powered[i] && roadAdjacent(tiles, i);
    if (!serviced) {
      if (tile.level > 0 && random() < 0.08) {
        tile.level--;
        decayed.push(i);
      }
      return;
    }
    if (tile.level >= MAX_LEVEL || demand[tile.type] <= 0) return;
    if (tile.type === 'res') {
      if (tile.level === 1 && !hasNatureNearby(tiles, i)) return;
      if (tile.level === MAX_LEVEL - 1 && !hasSchoolNearby(tiles, i)) return;
    }
    if (random() < Math.min(0.45, demand[tile.type] / 70)) {
      tile.level++;
      grown.push(i);
    }
  });

  return { grown, decayed };
}
