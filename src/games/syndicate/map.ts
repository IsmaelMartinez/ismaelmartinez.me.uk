/**
 * Syndicate — city map model. A neon-lit grid of streets, pavements and
 * extruded tower blocks. Buildings block both movement and line of sight.
 *
 * Generation is deterministic for a given `random` so it stays unit-testable:
 * avenues are laid on a fixed grid, pavements wrap them, and the block
 * interiors fill with towers and the occasional plaza. A flood fill then
 * seals off any courtyard the streets cannot reach.
 */

export const MAP_W = 26;
export const MAP_H = 26;

export type TileKind = 'road' | 'pavement' | 'plaza' | 'building';

export interface MapTile {
  kind: TileKind;
  /** Extrusion height in pixels; 0 for ground tiles. */
  height: number;
  /** Index into the building palette (facade + neon trim colours). */
  palette: number;
}

export const idx = (x: number, y: number): number => y * MAP_W + x;

export const isWalkable = (tile: MapTile): boolean => tile.kind !== 'building';

const AVENUES = [3, 11, 19];

export function generateCity(random: () => number): MapTile[] {
  const tiles: MapTile[] = Array.from({ length: MAP_W * MAP_H }, () => ({
    kind: 'plaza' as TileKind,
    height: 0,
    palette: 0
  }));

  for (const a of AVENUES) {
    for (let i = 0; i < MAP_W; i++) tiles[idx(a, i)].kind = 'road';
    for (let i = 0; i < MAP_H; i++) tiles[idx(i, a)].kind = 'road';
  }

  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const tile = tiles[idx(x, y)];
      if (tile.kind === 'road') continue;
      const nearRoad =
        (x > 0 && tiles[idx(x - 1, y)].kind === 'road') ||
        (x < MAP_W - 1 && tiles[idx(x + 1, y)].kind === 'road') ||
        (y > 0 && tiles[idx(x, y - 1)].kind === 'road') ||
        (y < MAP_H - 1 && tiles[idx(x, y + 1)].kind === 'road');
      if (nearRoad) {
        tile.kind = 'pavement';
      } else if (random() < 0.62) {
        tile.kind = 'building';
        tile.height = random() < 0.2 ? 30 + Math.floor(random() * 20) : 14 + Math.floor(random() * 12);
        tile.palette = Math.floor(random() * 4);
      }
    }
  }

  // Seal walkable pockets the street network cannot reach.
  const reachable = new Uint8Array(tiles.length);
  const start = idx(AVENUES[0], AVENUES[0]);
  const queue = [start];
  reachable[start] = 1;
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head];
    const x = i % MAP_W;
    const y = Math.floor(i / MAP_W);
    const candidates = [
      x > 0 ? i - 1 : -1,
      x < MAP_W - 1 ? i + 1 : -1,
      y > 0 ? i - MAP_W : -1,
      y < MAP_H - 1 ? i + MAP_W : -1
    ];
    for (const n of candidates) {
      if (n >= 0 && !reachable[n] && isWalkable(tiles[n])) {
        reachable[n] = 1;
        queue.push(n);
      }
    }
  }
  tiles.forEach((tile, i) => {
    if (isWalkable(tile) && !reachable[i]) {
      tile.kind = 'building';
      tile.height = 12 + Math.floor(random() * 10);
      tile.palette = Math.floor(random() * 4);
    }
  });

  return tiles;
}

/** Walkable tile index closest (euclidean) to the point (x, y). */
export function nearestWalkable(tiles: MapTile[], x: number, y: number): number {
  let best = -1;
  let bestDist = Infinity;
  for (let i = 0; i < tiles.length; i++) {
    if (!isWalkable(tiles[i])) continue;
    const dx = (i % MAP_W) + 0.5 - x;
    const dy = Math.floor(i / MAP_W) + 0.5 - y;
    const d = dx * dx + dy * dy;
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

/**
 * True when no building tile interrupts the segment between the two points
 * (tile-centre coordinates). Sampled every quarter tile — fine for the
 * weapon ranges in play.
 */
export function hasLineOfSight(
  tiles: MapTile[],
  x0: number,
  y0: number,
  x1: number,
  y1: number
): boolean {
  const dist = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.max(1, Math.ceil(dist * 4));
  for (let s = 1; s < steps; s++) {
    const t = s / steps;
    const x = Math.floor(x0 + (x1 - x0) * t);
    const y = Math.floor(y0 + (y1 - y0) * t);
    if (x < 0 || x >= MAP_W || y < 0 || y >= MAP_H) return false;
    if (tiles[idx(x, y)].kind === 'building') return false;
  }
  return true;
}
