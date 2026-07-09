/**
 * Pixel Park grid model: tile types, terrain heights, the building
 * catalogue, and placement rules. The park is a flat W×H grid stored as a
 * flat array; index = y * GRID_W + x. Terrain height is a parallel array —
 * see the "terrain elevation" section of
 * docs/plans/2026-07-09-park-overhaul-design.md for the model this encodes.
 */
import { gridNeighbours } from '../engine/grid2d';

export const GRID_W = 24;
export const GRID_H = 14;

/** Terrain height range, in discrete steps (0 = sea level). */
export const MIN_HEIGHT = 0;
export const MAX_HEIGHT = 4;

export type TileType =
  | 'grass'
  | 'path'
  | 'entrance'
  | 'carousel'
  | 'ferris'
  | 'food'
  | 'drink'
  | 'toilet'
  | 'tree'
  | 'water'
  | 'flume'
  | 'skytower';

export type Tool =
  | Exclude<TileType, 'grass' | 'entrance'>
  | 'bulldoze'
  | 'raiseLand'
  | 'lowerLand'
  | 'digTunnel';

export type NeedKey = 'fun' | 'hunger' | 'thirst' | 'bladder';

export interface BuildingDef {
  cost: number;
  /** Charged to a guest per use. */
  price: number;
  /** Deducted per in-game day. */
  upkeep: number;
  satisfies: NeedKey;
  /** Seconds a guest spends using it. */
  useTime: number;
  /** How much of the need one use restores (0–100). */
  boost: number;
  /** Must also have a water tile among its neighbours (e.g. Log Flume). */
  needsWater?: boolean;
  /** Minimum terrain height its own tile must sit at (e.g. Sky Tower). */
  minHeight?: number;
}

export const BUILDINGS: Partial<Record<TileType, BuildingDef>> = {
  carousel: { cost: 250, price: 4, upkeep: 18, satisfies: 'fun', useTime: 3.5, boost: 65 },
  ferris: { cost: 400, price: 6, upkeep: 28, satisfies: 'fun', useTime: 5, boost: 95 },
  food: { cost: 150, price: 5, upkeep: 12, satisfies: 'hunger', useTime: 2.5, boost: 85 },
  drink: { cost: 100, price: 3, upkeep: 8, satisfies: 'thirst', useTime: 2, boost: 85 },
  toilet: { cost: 120, price: 1, upkeep: 6, satisfies: 'bladder', useTime: 2, boost: 100 },
  flume: { cost: 350, price: 5, upkeep: 20, satisfies: 'fun', useTime: 4, boost: 80, needsWater: true },
  skytower: { cost: 600, price: 8, upkeep: 30, satisfies: 'fun', useTime: 4.5, boost: 90, minHeight: 2 }
};

const SIMPLE_COSTS: Partial<Record<Tool, number>> = {
  path: 10,
  tree: 25,
  bulldoze: 0,
  water: 15,
  raiseLand: 20,
  lowerLand: 20,
  digTunnel: 30
};

export function toolCost(tool: Tool): number {
  return BUILDINGS[tool as TileType]?.cost ?? SIMPLE_COSTS[tool] ?? 0;
}

export const idx = (x: number, y: number): number => y * GRID_W + x;

export function isWalkable(tile: TileType): boolean {
  return tile === 'path' || tile === 'entrance';
}

export interface Park {
  tiles: TileType[];
  /** Terrain height per tile, 0–MAX_HEIGHT. Guests ignore it when walking —
   * it's a rendering/placement concern only (see design doc "v1 simplifications"). */
  heights: number[];
  /** True where a path tile has been dug into a hillside; only meaningful
   * where tiles[i] === 'path'. Hides guests standing there and draws a dark
   * archway on the adjoining raised tile's face. */
  tunnels: boolean[];
  entrance: number;
}

export function createPark(): Park {
  const size = GRID_W * GRID_H;
  const tiles: TileType[] = new Array(size).fill('grass');
  const heights: number[] = new Array(size).fill(MIN_HEIGHT);
  const tunnels: boolean[] = new Array(size).fill(false);
  const entrance = idx(Math.floor(GRID_W / 2), GRID_H - 1);
  tiles[entrance] = 'entrance';
  // Starter path stub so the first guests can walk in
  tiles[entrance - GRID_W] = 'path';
  tiles[entrance - 2 * GRID_W] = 'path';
  return { tiles, heights, tunnels, entrance };
}

export function neighbours(i: number): number[] {
  return gridNeighbours(i, GRID_W, GRID_H);
}

/**
 * Placement rules: everything builds on grass; buildings additionally need
 * an adjacent walkable tile so guests can reach them, plus any building-
 * specific gate (water adjacency, minimum terrain height). Terraforming
 * tools have their own rules below. The entrance can never be removed,
 * built over, or reshaped.
 */
export function canPlace(
  tiles: TileType[],
  heights: number[],
  tunnels: boolean[],
  x: number,
  y: number,
  tool: Tool
): boolean {
  if (x < 0 || x >= GRID_W || y < 0 || y >= GRID_H) return false;
  const i = idx(x, y);
  if (tiles[i] === 'entrance') return false;

  if (tool === 'raiseLand' || tool === 'lowerLand') {
    if (tiles[i] !== 'grass' && tiles[i] !== 'path') return false;
    const delta = tool === 'raiseLand' ? 1 : -1;
    const next = heights[i] + delta;
    if (next < MIN_HEIGHT || next > MAX_HEIGHT) return false;
    // Every neighbour must stay within one step, so every tile's four side
    // faces remain flat quads with no gaps or floating edges.
    return neighbours(i).every(n => Math.abs(heights[n] - next) <= 1);
  }

  if (tool === 'digTunnel') {
    if (tiles[i] !== 'path' || heights[i] !== MIN_HEIGHT || tunnels[i]) return false;
    // Only cuts into an existing hillside — a tunnel mouth needs a hill to
    // enter, not a hole in flat ground.
    return neighbours(i).some(n => heights[n] >= 1);
  }

  if (tool === 'bulldoze') return tiles[i] !== 'grass';
  if (tiles[i] !== 'grass') return false;

  if (tool === 'water') return heights[i] === MIN_HEIGHT;

  const def = BUILDINGS[tool as TileType];
  if (def) {
    if (def.minHeight !== undefined && heights[i] < def.minHeight) return false;
    if (!neighbours(i).some(n => isWalkable(tiles[n]))) return false;
    if (def.needsWater && !neighbours(i).some(n => tiles[n] === 'water')) return false;
    return true;
  }
  return true;
}

export function applyTool(
  tiles: TileType[],
  heights: number[],
  tunnels: boolean[],
  x: number,
  y: number,
  tool: Tool
): void {
  const i = idx(x, y);
  if (tool === 'bulldoze') {
    tiles[i] = 'grass';
    tunnels[i] = false;
    return;
  }
  if (tool === 'raiseLand') {
    heights[i] += 1;
    // Reshaping the land under a dug tunnel closes it — a tunnel flag is
    // only meaningful at height 0, and canPlace doesn't otherwise stop a
    // path tile from being raised.
    tunnels[i] = false;
    return;
  }
  if (tool === 'lowerLand') {
    heights[i] -= 1;
    tunnels[i] = false;
    return;
  }
  if (tool === 'digTunnel') {
    tunnels[i] = true;
    return;
  }
  tiles[i] = tool as TileType;
}
