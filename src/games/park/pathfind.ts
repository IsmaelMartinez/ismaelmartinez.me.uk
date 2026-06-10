/**
 * Breadth-first search over walkable tiles (paths + entrance).
 */
import { GRID_W, neighbours, isWalkable, type TileType } from './grid';

export interface BfsResult {
  dist: Int32Array;
  parent: Int32Array;
}

/** Distances/parents from `start` across walkable tiles; -1 = unreachable. */
export function bfsFrom(tiles: TileType[], start: number): BfsResult {
  const dist = new Int32Array(tiles.length).fill(-1);
  const parent = new Int32Array(tiles.length).fill(-1);
  if (!isWalkable(tiles[start])) return { dist, parent };
  dist[start] = 0;
  const queue = [start];
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head];
    for (const n of neighbours(i)) {
      if (dist[n] === -1 && isWalkable(tiles[n])) {
        dist[n] = dist[i] + 1;
        parent[n] = i;
        queue.push(n);
      }
    }
  }
  return { dist, parent };
}

/** Reconstructs the tile sequence start→target (inclusive) from a BFS result. */
export function buildPath(bfs: BfsResult, target: number): number[] | null {
  if (bfs.dist[target] === -1) return null;
  const path: number[] = [];
  let i = target;
  while (i !== -1) {
    path.push(i);
    i = bfs.parent[i];
  }
  return path.reverse();
}

/** Shortest walkable route between two walkable tiles, or null. */
export function findPath(tiles: TileType[], from: number, to: number): number[] | null {
  return buildPath(bfsFrom(tiles, from), to);
}

/** Walkable tiles adjacent to a (building) tile — where guests stand to use it. */
export function adjacentWalkable(tiles: TileType[], building: number): number[] {
  return neighbours(building).filter(n => isWalkable(tiles[n]));
}

/**
 * Nearest tile from `candidates` (typically building tiles) reachable from
 * `from`, judged by distance to any walkable tile adjacent to the candidate.
 * Returns the chosen building tile and the route to stand beside it.
 */
export function nearestReachable(
  tiles: TileType[],
  from: number,
  candidates: number[]
): { building: number; path: number[] } | null {
  const bfs = bfsFrom(tiles, from);
  let best: { building: number; standAt: number; dist: number } | null = null;
  for (const building of candidates) {
    for (const stand of adjacentWalkable(tiles, building)) {
      const d = bfs.dist[stand];
      if (d !== -1 && (!best || d < best.dist)) {
        best = { building, standAt: stand, dist: d };
      }
    }
  }
  if (!best) return null;
  const path = buildPath(bfs, best.standAt);
  return path ? { building: best.building, path } : null;
}

export { GRID_W };
