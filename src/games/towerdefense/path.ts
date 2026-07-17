/**
 * Line Hold — the battlefield map. A modest iso grid (Microcity's footprint)
 * crossed by one authored path from spawn to goal; the grass beside the path
 * is where towers go.
 *
 * The authored waypoints expand into an ordered route (the tile sequence
 * enemies march), and a BFS distance field from the goal (engine/pathfind.ts)
 * cross-checks it: every route step must move strictly downhill toward the
 * exit, so a future maze-building mode can swap the authored route for the
 * field without touching enemy movement.
 */
import { bfsFrom, type BfsResult } from '../engine/pathfind';
import { chebyshev } from '../engine/grid2d';

export const GRID_W = 24;
export const GRID_H = 14;

export const idx = (x: number, y: number): number => y * GRID_W + x;

/** How far (Chebyshev) from the path a tower may stand. */
export const BUILD_REACH = 2;

/**
 * One authored path for v1: a serpentine with three straights, so most of
 * the board sits within tower reach of at least one pass.
 */
const WAYPOINTS: Array<[number, number]> = [
  [0, 2],
  [17, 2],
  [17, 6],
  [5, 6],
  [5, 10],
  [23, 10]
];

export interface TdMap {
  /** Ordered tile indices from spawn to goal, inclusive. */
  route: number[];
  /** True where the path runs. */
  path: boolean[];
  /** True where a tower may be placed (grass within reach of the path). */
  buildable: boolean[];
  spawn: number;
  goal: number;
  /** BFS distances to the goal along the path; -1 off it. */
  dist: BfsResult['dist'];
}

/** Expands the authored waypoints into a contiguous tile route. */
export function buildRoute(waypoints: Array<[number, number]> = WAYPOINTS): number[] {
  const route: number[] = [idx(waypoints[0][0], waypoints[0][1])];
  for (let w = 1; w < waypoints.length; w++) {
    let [x, y] = waypoints[w - 1];
    const [tx, ty] = waypoints[w];
    while (x !== tx || y !== ty) {
      x += Math.sign(tx - x);
      y += Math.sign(ty - y);
      route.push(idx(x, y));
    }
  }
  return route;
}

export function createTdMap(): TdMap {
  const route = buildRoute();
  const path = new Array<boolean>(GRID_W * GRID_H).fill(false);
  for (const i of route) path[i] = true;
  const spawn = route[0];
  const goal = route[route.length - 1];
  const dist = bfsFrom(GRID_W, GRID_H, i => path[i], goal).dist;
  const buildable = path.map((onPath, i) => {
    if (onPath) return false;
    for (const p of route) {
      if (chebyshev(i, p, GRID_W) <= BUILD_REACH) return true;
    }
    return false;
  });
  return { route, path, buildable, spawn, goal, dist };
}

/** Fractional tile-centre coordinates at `progress` tiles along the route. */
export function routePosition(
  route: number[],
  progress: number
): { x: number; y: number } {
  const last = route.length - 1;
  const t = Math.max(0, Math.min(progress, last));
  const i0 = Math.min(Math.floor(t), last - 1);
  const frac = t - i0;
  const a = route[i0];
  const b = route[Math.min(i0 + 1, last)];
  const ax = (a % GRID_W) + 0.5;
  const ay = Math.floor(a / GRID_W) + 0.5;
  const bx = (b % GRID_W) + 0.5;
  const by = Math.floor(b / GRID_W) + 0.5;
  return { x: ax + (bx - ax) * frac, y: ay + (by - ay) * frac };
}
