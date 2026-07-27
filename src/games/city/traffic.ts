/**
 * Road traffic. Cars random-walk the road network, biased against U-turns.
 * Traffic also *matters*: `computeCongestion` scores how hard each road is
 * worked by the dense zones it serves, which slows the cars over it (so
 * chokepoints visibly clot) and throttles the growth of districts with no
 * relief route (see simulation.ts). DOM-free so the rules are testable.
 */
import { gridNeighbours } from '../engine/grid2d';
import { CITY_W, CITY_H, isRoad, isZone, type CityTile } from './tiles';

/** Developed-zone level a road tile may carry before it saturates. */
export const CONGESTION_THRESHOLD = 6;

/**
 * Per-tile traffic load: for each road tile, the summed development level of
 * the zone tiles it directly serves (its orthogonal neighbours — the ones that
 * use it for access). A road hemmed by dense zones with no parallel relief
 * route scores high. Non-road tiles are 0.
 */
export function computeCongestion(tiles: CityTile[]): number[] {
  const load = new Array<number>(tiles.length).fill(0);
  tiles.forEach((tile, i) => {
    if (!isRoad(tile.type)) return;
    let sum = 0;
    for (const n of gridNeighbours(i, CITY_W, CITY_H)) {
      if (isZone(tiles[n].type)) sum += tiles[n].level;
    }
    load[i] = sum;
  });
  return load;
}

/** Whether a road tile's traffic load has tipped it into congestion. */
export function isCongested(load: number): boolean {
  return load > CONGESTION_THRESHOLD;
}

export interface Car {
  /** Tile the car is leaving. */
  from: number;
  /** Tile the car is heading to (always a road). */
  to: number;
  /** 0–1 along the from→to segment. */
  progress: number;
  /** Tiles per second. */
  speed: number;
  color: string;
}

export const CAR_COLORS = ['#f8fafc', '#fbbf24', '#f87171', '#60a5fa', '#a3e635'];

/** How many cars a city of this size should show. */
export function targetCarCount(population: number): number {
  return Math.min(14, Math.floor(population / 40));
}

function roadNeighbours(tiles: CityTile[], i: number): number[] {
  return gridNeighbours(i, CITY_W, CITY_H).filter(n => isRoad(tiles[n].type));
}

/** Spawns a car on a random road tile that has somewhere to drive to. */
export function spawnCar(tiles: CityTile[], random: () => number = Math.random): Car | null {
  const candidates: number[] = [];
  tiles.forEach((tile, i) => {
    if (isRoad(tile.type) && roadNeighbours(tiles, i).length > 0) candidates.push(i);
  });
  if (!candidates.length) return null;
  const from = candidates[Math.floor(random() * candidates.length)];
  const exits = roadNeighbours(tiles, from);
  return {
    from,
    to: exits[Math.floor(random() * exits.length)],
    progress: random() * 0.5,
    speed: 0.9 + random() * 0.6,
    color: CAR_COLORS[Math.floor(random() * CAR_COLORS.length)]
  };
}

/**
 * Advances a car. Returns false when the car should despawn (its road was
 * bulldozed or it reached a dead end with nowhere left to go).
 */
export function stepCar(
  tiles: CityTile[],
  car: Car,
  dt: number,
  random: () => number = Math.random
): boolean {
  if (!isRoad(tiles[car.to].type) || !isRoad(tiles[car.from].type)) return false;
  car.progress += car.speed * dt;
  while (car.progress >= 1) {
    car.progress -= 1;
    const arrived = car.to;
    const exits = roadNeighbours(tiles, arrived);
    if (!exits.length) return false;
    // Prefer not to U-turn unless it's a dead end
    const forward = exits.filter(n => n !== car.from);
    const options = forward.length ? forward : exits;
    car.from = arrived;
    car.to = options[Math.floor(random() * options.length)];
  }
  return true;
}
