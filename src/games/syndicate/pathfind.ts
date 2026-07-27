/**
 * Breadth-first pathfinding over the walkable city tiles (roads, pavements,
 * plazas). The BFS core is the engine's shared engine/pathfind.ts — the same
 * one Pixel Park's guest routing binds to — leaving only the squad-specific
 * helpers here.
 */
import { bfsFrom as engineBfsFrom, buildPath, type BfsResult } from '../engine/pathfind';
import { gridNeighbours } from '../engine/grid2d';
import { MAP_W, MAP_H, isWalkable, type MapTile } from './map';

export type { BfsResult };
export { buildPath };

/** Distances/parents from `start` across walkable tiles; -1 = unreachable. */
export function bfsFrom(tiles: MapTile[], start: number): BfsResult {
  return engineBfsFrom(MAP_W, MAP_H, i => isWalkable(tiles[i]), start);
}

/** Shortest walkable route between two walkable tiles, or null. */
export function findPath(tiles: MapTile[], from: number, to: number): number[] | null {
  return buildPath(bfsFrom(tiles, from), to);
}

/**
 * The `count` walkable tiles nearest `centre` in BFS order — distinct
 * destinations so a squad ordered to one spot fans out instead of stacking.
 */
export function spreadTargets(tiles: MapTile[], centre: number, count: number): number[] {
  const targets: number[] = [];
  if (centre < 0 || !isWalkable(tiles[centre])) return targets;
  const seen = new Uint8Array(tiles.length);
  const queue = [centre];
  seen[centre] = 1;
  for (let head = 0; head < queue.length && targets.length < count; head++) {
    const i = queue[head];
    targets.push(i);
    for (const n of gridNeighbours(i, MAP_W, MAP_H)) {
      if (!seen[n] && isWalkable(tiles[n])) {
        seen[n] = 1;
        queue.push(n);
      }
    }
  }
  return targets;
}

/** All walkable tile indices. */
export function walkableTiles(tiles: MapTile[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < tiles.length; i++) if (isWalkable(tiles[i])) out.push(i);
  return out;
}

export { MAP_W, MAP_H };
