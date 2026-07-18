/**
 * Breadth-first pathfinding over a flat W×H tile grid (index = y * w + x).
 *
 * Extracted from the near-identical copies Pixel Park (guest routing) and
 * Syndicate (unit orders) each carried; Line Hold's enemy routing made it
 * three. Walkability is a predicate on the tile index so each game keeps its
 * own tile model — the engine never needs to know what a "tile" is.
 */
import { gridNeighbours } from './grid2d';

export interface BfsResult {
  dist: Int32Array;
  parent: Int32Array;
}

/** Distances/parents from `start` across walkable tiles; -1 = unreachable. */
export function bfsFrom(
  w: number,
  h: number,
  walkable: (i: number) => boolean,
  start: number
): BfsResult {
  const size = w * h;
  const dist = new Int32Array(size).fill(-1);
  const parent = new Int32Array(size).fill(-1);
  if (start < 0 || start >= size || !walkable(start)) return { dist, parent };
  dist[start] = 0;
  const queue = [start];
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head];
    for (const n of gridNeighbours(i, w, h)) {
      if (dist[n] === -1 && walkable(n)) {
        dist[n] = dist[i] + 1;
        parent[n] = i;
        queue.push(n);
      }
    }
  }
  return { dist, parent };
}

/** Reconstructs the tile sequence start→target (inclusive), or null. */
export function buildPath(bfs: BfsResult, target: number): number[] | null {
  if (target < 0 || target >= bfs.dist.length || bfs.dist[target] === -1) return null;
  const path: number[] = [];
  let i = target;
  while (i !== -1) {
    path.push(i);
    i = bfs.parent[i];
  }
  return path.reverse();
}

/** Shortest walkable route between two walkable tiles, or null. */
export function findPath(
  w: number,
  h: number,
  walkable: (i: number) => boolean,
  from: number,
  to: number
): number[] | null {
  return buildPath(bfsFrom(w, h, walkable, from), to);
}
