/**
 * Pixel Park grid model: tile types, terrain heights, the building
 * catalogue, and placement rules. The park is a flat W×H grid stored as a
 * flat array; index = y * GRID_W + x. Terrain height is a parallel array —
 * see the "terrain elevation" section of
 * docs/plans/2026-07-09-park-overhaul-design.md for the model this encodes.
 */
import { gridNeighbours, chebyshev } from '../engine/grid2d';

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
  | 'skytower'
  | 'gateFairytale'
  | 'gateAdventure'
  | 'gatePirate'
  | 'track';

export type Tool =
  | Exclude<TileType, 'grass' | 'entrance'>
  | 'bulldoze'
  | 'raiseLand'
  | 'lowerLand'
  | 'digTunnel';

export type NeedKey = 'fun' | 'hunger' | 'thirst' | 'bladder' | 'thrill';

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
  digTunnel: 30,
  gateFairytale: 150,
  gateAdventure: 250,
  gatePirate: 350,
  track: 40
};

/**
 * Theme zones: unlockable areas whose influence is claimed by placing a Zone
 * Gate decoration rather than painting tiles, per the "Designed, not built:
 * theme zones" section of docs/plans/2026-07-09-park-overhaul-design.md.
 * Fairytale is available from the start; Adventure and Pirate unlock as
 * park rating and banked cash climb, matching the pacing of a run.
 */
export type ZoneId = 'fairytale' | 'adventure' | 'pirate';

export interface ZoneDef {
  gate: TileType;
  /** The attraction that gets a native-zone discount when built in this zone's influence. */
  native: TileType;
  unlockRating: number;
  unlockCash: number;
  /** Ground tint for grass tiles inside this zone's influence. */
  groundColor: string;
}

export const ZONES: Record<ZoneId, ZoneDef> = {
  fairytale: {
    gate: 'gateFairytale',
    native: 'carousel',
    unlockRating: 0,
    unlockCash: 0,
    groundColor: '#4a7a5a'
  },
  adventure: {
    gate: 'gateAdventure',
    native: 'flume',
    unlockRating: 60,
    unlockCash: 3000,
    groundColor: '#2f5a1f'
  },
  pirate: {
    gate: 'gatePirate',
    native: 'ferris',
    unlockRating: 75,
    unlockCash: 6000,
    groundColor: '#c2a26a'
  }
};

const GATE_ZONE: Partial<Record<TileType, ZoneId>> = {
  gateFairytale: 'fairytale',
  gateAdventure: 'adventure',
  gatePirate: 'pirate'
};

/**
 * The zone a Zone Gate tile belongs to, or null for any other tile type.
 * Takes `string` (not `TileType`) so call sites can pass a `Tool` (e.g. the
 * currently selected toolbar tool) directly, without an unsafe cast — a
 * non-gate value simply falls through to null.
 */
export function gateZone(tile: string): ZoneId | null {
  return GATE_ZONE[tile as TileType] ?? null;
}

/** Whether the given zone's rating + cash thresholds are currently met. */
export function zoneUnlocked(zone: ZoneId, rating: number, money: number): boolean {
  const def = ZONES[zone];
  return rating >= def.unlockRating && money >= def.unlockCash;
}

/**
 * The zone whose influence tile `i` falls under: the zone of the nearest
 * placed Zone Gate by Chebyshev distance, or null if no gates are on the
 * map yet. Rendering-only (guest pathing and building rules are unaffected)
 * — see the design doc. Ties keep whichever gate is scanned first (stable
 * grid order); an arbitrary but deterministic tie-break is fine since this
 * only drives cosmetics and a small discount.
 */
export function zoneAt(tiles: TileType[], i: number): ZoneId | null {
  let best: ZoneId | null = null;
  let bestDist = Infinity;
  for (let gi = 0; gi < tiles.length; gi++) {
    const zone = GATE_ZONE[tiles[gi]];
    if (!zone) continue;
    const dist = chebyshev(gi, i, GRID_W);
    if (dist < bestDist) {
      bestDist = dist;
      best = zone;
    }
  }
  return best;
}

/**
 * Zone for every tile in one pass — O(tiles × gates) instead of calling
 * zoneAt(tiles, i) per tile (which rescans the whole array for gates each
 * time, O(tiles²)). Used by the renderer, which needs every tile's zone
 * once per frame; zoneAt itself stays the right tool for a single lookup
 * (toolCost, dailyUpkeep, hover previews).
 */
export function zonesForTiles(tiles: TileType[]): (ZoneId | null)[] {
  const gates: { zone: ZoneId; gi: number }[] = [];
  for (let gi = 0; gi < tiles.length; gi++) {
    const zone = GATE_ZONE[tiles[gi]];
    if (zone) gates.push({ zone, gi });
  }
  return tiles.map((_, i) => {
    let best: ZoneId | null = null;
    let bestDist = Infinity;
    for (const gate of gates) {
      const dist = chebyshev(gate.gi, i, GRID_W);
      if (dist < bestDist) {
        bestDist = dist;
        best = gate.zone;
      }
    }
    return best;
  });
}

/** ~10% discount for a zone's native attraction built inside its own influence. */
export function zoneDiscountFactor(tiles: TileType[], i: number, tool: TileType): number {
  const zone = zoneAt(tiles, i);
  return zone && ZONES[zone].native === tool ? 0.9 : 1;
}

/**
 * Cost to place `tool`. Passing the tile it's being placed on (`tiles`, `i`)
 * applies the zone native-attraction discount; omit them for a location-
 * independent base cost (e.g. toolbar display).
 */
export function toolCost(tool: Tool, tiles?: TileType[], i?: number): number {
  const def = BUILDINGS[tool as TileType];
  if (def) {
    const factor = tiles && i !== undefined ? zoneDiscountFactor(tiles, i, tool as TileType) : 1;
    return Math.round(def.cost * factor);
  }
  return SIMPLE_COSTS[tool] ?? 0;
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

/** Tiles whose terrain height may be reshaped. */
function isTerraformable(tile: TileType): boolean {
  return tile === 'grass' || tile === 'path';
}

/**
 * Plan to set tile `i` to `targetH`, cascading to neighbours so every tile
 * stays within one step of each of its neighbours (the slope rule that keeps
 * hillside faces renderable). Neighbours are pushed the minimum amount, and
 * those pushes recurse outward. Returns tile → new height for every tile
 * that must change, or null if the cascade would have to move a tile that
 * can't be reshaped (water, buildings, track, the entrance, anything in
 * `locked`) or `targetH` is out of range. A one-step change on open ground
 * plans exactly one tile, matching the old single-tile raise/lower.
 */
export function terraformPlan(
  tiles: TileType[],
  heights: number[],
  i: number,
  targetH: number,
  locked?: ReadonlySet<number>
): Map<number, number> | null {
  if (targetH < MIN_HEIGHT || targetH > MAX_HEIGHT) return null;
  if (!isTerraformable(tiles[i]) || locked?.has(i)) return null;
  if (heights[i] === targetH) return new Map();
  const plan = new Map<number, number>([[i, targetH]]);
  const queue = [i];
  while (queue.length) {
    const t = queue.shift()!;
    const h = plan.get(t)!;
    for (const n of neighbours(t)) {
      const nh = plan.get(n) ?? heights[n];
      if (Math.abs(nh - h) <= 1) continue;
      // The minimum move: one step past the slope limit, toward h. Always
      // lands strictly between nh and h, so it can never leave the
      // MIN_HEIGHT..MAX_HEIGHT range targetH was checked against.
      const pushed = h + (nh > h ? 1 : -1);
      if (!isTerraformable(tiles[n]) || locked?.has(n)) return null;
      plan.set(n, pushed);
      queue.push(n);
    }
  }
  return plan;
}

/** Total height steps a terraform plan moves, across all affected tiles — the unit its cost scales with. */
export function terraformSteps(plan: Map<number, number>, heights: number[]): number {
  let steps = 0;
  for (const [tile, h] of plan) steps += Math.abs(h - heights[tile]);
  return steps;
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
    const delta = tool === 'raiseLand' ? 1 : -1;
    // Neighbours in the way get pushed along by the cascade, so the only
    // hard limits are the height range and immovable tiles in the cascade.
    return terraformPlan(tiles, heights, i, heights[i] + delta) !== null;
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
  if (tool === 'raiseLand' || tool === 'lowerLand') {
    const delta = tool === 'raiseLand' ? 1 : -1;
    const plan = terraformPlan(tiles, heights, i, heights[i] + delta);
    if (!plan) return;
    for (const [tile, h] of plan) {
      heights[tile] = h;
      // Reshaping the land under a dug tunnel closes it — a tunnel flag is
      // only meaningful at height 0, and canPlace doesn't otherwise stop a
      // path tile from being raised.
      tunnels[tile] = false;
    }
    return;
  }
  if (tool === 'digTunnel') {
    tunnels[i] = true;
    return;
  }
  tiles[i] = tool as TileType;
}
