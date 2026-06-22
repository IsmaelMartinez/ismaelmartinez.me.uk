/**
 * Breadth-first pathfinding over the walkable city tiles (roads, pavements,
 * plazas). Same approach as Pixel Park's guest routing.
 */
import { MAP_W, MAP_H, isWalkable, type MapTile } from './map';

export interface BfsResult {
  dist: Int32Array;
  parent: Int32Array;
}

/** Distances/parents from `start` across walkable tiles; -1 = unreachable. */
export function bfsFrom(tiles: MapTile[], start: number): BfsResult {
  const dist = new Int32Array(tiles.length).fill(-1);
  const parent = new Int32Array(tiles.length).fill(-1);
  if (start < 0 || !isWalkable(tiles[start])) return { dist, parent };
  dist[start] = 0;
  const queue = [start];
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head];
    const x = i % MAP_W;
    const y = Math.floor(i / MAP_W);
    const neighbours = [
      x > 0 ? i - 1 : -1,
      x < MAP_W - 1 ? i + 1 : -1,
      y > 0 ? i - MAP_W : -1,
      y < MAP_H - 1 ? i + MAP_W : -1
    ];
    for (const n of neighbours) {
      if (n >= 0 && dist[n] === -1 && isWalkable(tiles[n])) {
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
  if (target < 0 || bfs.dist[target] === -1) return null;
  const path: number[] = [];
  let i = target;
  while (i !== -1) {
    path.push(i);
    i = bfs.parent[i];
  }
  return path.reverse();
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
    const x = i % MAP_W;
    const y = Math.floor(i / MAP_W);
    const neighbours = [
      x > 0 ? i - 1 : -1,
      x < MAP_W - 1 ? i + 1 : -1,
      y > 0 ? i - MAP_W : -1,
      y < MAP_H - 1 ? i + MAP_W : -1
    ];
    for (const n of neighbours) {
      if (n >= 0 && !seen[n] && isWalkable(tiles[n])) {
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
