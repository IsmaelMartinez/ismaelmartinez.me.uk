/**
 * Pixel Park grid model: tile types, building catalogue, and placement rules.
 * The park is a flat W×H grid stored as a flat array; index = y * GRID_W + x.
 */

export const GRID_W = 24;
export const GRID_H = 14;

export type TileType =
  | 'grass'
  | 'path'
  | 'entrance'
  | 'carousel'
  | 'ferris'
  | 'food'
  | 'drink'
  | 'toilet'
  | 'tree';

export type Tool = Exclude<TileType, 'grass' | 'entrance'> | 'bulldoze';

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
}

export const BUILDINGS: Partial<Record<TileType, BuildingDef>> = {
  carousel: { cost: 250, price: 4, upkeep: 18, satisfies: 'fun', useTime: 3.5, boost: 65 },
  ferris: { cost: 400, price: 6, upkeep: 28, satisfies: 'fun', useTime: 5, boost: 95 },
  food: { cost: 150, price: 5, upkeep: 12, satisfies: 'hunger', useTime: 2.5, boost: 85 },
  drink: { cost: 100, price: 3, upkeep: 8, satisfies: 'thirst', useTime: 2, boost: 85 },
  toilet: { cost: 120, price: 1, upkeep: 6, satisfies: 'bladder', useTime: 2, boost: 100 }
};

const SIMPLE_COSTS: Partial<Record<Tool, number>> = { path: 10, tree: 25, bulldoze: 0 };

export function toolCost(tool: Tool): number {
  return BUILDINGS[tool as TileType]?.cost ?? SIMPLE_COSTS[tool] ?? 0;
}

export const idx = (x: number, y: number): number => y * GRID_W + x;

export function isWalkable(tile: TileType): boolean {
  return tile === 'path' || tile === 'entrance';
}

export function createPark(): { tiles: TileType[]; entrance: number } {
  const tiles: TileType[] = new Array(GRID_W * GRID_H).fill('grass');
  const entrance = idx(Math.floor(GRID_W / 2), GRID_H - 1);
  tiles[entrance] = 'entrance';
  // Starter path stub so the first guests can walk in
  tiles[entrance - GRID_W] = 'path';
  tiles[entrance - 2 * GRID_W] = 'path';
  return { tiles, entrance };
}

export function neighbours(i: number): number[] {
  const x = i % GRID_W;
  const y = Math.floor(i / GRID_W);
  const out: number[] = [];
  if (x > 0) out.push(i - 1);
  if (x < GRID_W - 1) out.push(i + 1);
  if (y > 0) out.push(i - GRID_W);
  if (y < GRID_H - 1) out.push(i + GRID_W);
  return out;
}

/**
 * Placement rules: everything builds on grass; buildings (and nothing else)
 * additionally need an adjacent walkable tile so guests can reach them.
 * The entrance can never be removed or built over.
 */
export function canPlace(tiles: TileType[], x: number, y: number, tool: Tool): boolean {
  if (x < 0 || x >= GRID_W || y < 0 || y >= GRID_H) return false;
  const i = idx(x, y);
  if (tiles[i] === 'entrance') return false;
  if (tool === 'bulldoze') return tiles[i] !== 'grass';
  if (tiles[i] !== 'grass') return false;
  if (BUILDINGS[tool as TileType]) {
    return neighbours(i).some(n => isWalkable(tiles[n]));
  }
  return true;
}

export function applyTool(tiles: TileType[], x: number, y: number, tool: Tool): void {
  const i = idx(x, y);
  tiles[i] = tool === 'bulldoze' ? 'grass' : (tool as TileType);
}
