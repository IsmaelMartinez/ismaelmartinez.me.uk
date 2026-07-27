/**
 * Guest routing over walkable park tiles (paths + entrance). The BFS core
 * lives in engine/pathfind.ts; this module binds it to the park's tile
 * model and keeps the park-specific helpers (standing beside buildings).
 */
import { bfsFrom as engineBfsFrom, buildPath, type BfsResult } from '../engine/pathfind';
import { GRID_W, GRID_H, neighbours, isWalkable, footprintOf, type TileType } from './grid';

export type { BfsResult };
export { buildPath };

/** Distances/parents from `start` across walkable tiles; -1 = unreachable. */
export function bfsFrom(tiles: TileType[], start: number): BfsResult {
  return engineBfsFrom(GRID_W, GRID_H, i => isWalkable(tiles[i]), start);
}

/** Shortest walkable route between two walkable tiles, or null. */
export function findPath(tiles: TileType[], from: number, to: number): number[] | null {
  return buildPath(bfsFrom(tiles, from), to);
}

/**
 * Walkable tiles adjacent to a building — where guests stand to use it. For a
 * multi-tile ride (e.g. the 2×2 coaster) this spans the whole footprint, so a
 * guest can approach from whichever side has a path; a single-tile building
 * is just its walkable neighbours, exactly as before.
 */
export function adjacentWalkable(tiles: TileType[], building: number): number[] {
  const block = footprintOf(tiles, building);
  const inBlock = new Set(block);
  const stands = new Set<number>();
  for (const cell of block) {
    for (const n of neighbours(cell)) {
      if (!inBlock.has(n) && isWalkable(tiles[n])) stands.add(n);
    }
  }
  return [...stands];
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
