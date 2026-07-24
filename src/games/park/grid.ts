/**
 * Pixel Park grid model: tile types, terrain heights, the building
 * catalogue, and placement rules. The park is a flat W×H grid stored as a
 * flat array; index = y * GRID_W + x. Terrain height is a parallel array —
 * see the "terrain elevation" section of
 * docs/plans/2026-07-09-park-overhaul-design.md for the model this encodes.
 */
import { gridNeighbours, chebyshev, growBlob, carveEdge } from '../engine/grid2d';

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
  | 'pirateship'
  | 'coaster'
  | 'manor'
  | 'bumper'
  | 'helter'
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
  | 'rideannex';

export type Tool =
  | Exclude<TileType, 'grass' | 'entrance' | 'rideannex'>
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
  /** Side length in tiles of a multi-tile ride's square footprint (e.g. the
   *  2×2 coaster). Absent or 1 means an ordinary single-tile building. */
  footprint?: number;
}

export const BUILDINGS: Partial<Record<TileType, BuildingDef>> = {
  carousel: { cost: 250, price: 4, upkeep: 18, satisfies: 'fun', useTime: 3.5, boost: 65 },
  ferris: { cost: 400, price: 6, upkeep: 28, satisfies: 'fun', useTime: 5, boost: 95 },
  // The Pirate Ship is the first thrill satisfier a player can place as a
  // single tile — before it, only a built coaster served the `thrill` need,
  // so coasterless parks bled guests. A good coaster still out-thrills it.
  pirateship: { cost: 500, price: 7, upkeep: 26, satisfies: 'thrill', useTime: 4.5, boost: 70 },
  // The premium thrill ride: a placed 2×2 coaster that replaced the old
  // lay-your-own-track editor. Best thrill in the park, priced and sized to
  // match — it rides, breaks down, and is bulldozed through the generic
  // building path; the footprint is the only thing that makes it special.
  coaster: { cost: 800, price: 8, upkeep: 34, satisfies: 'thrill', useTime: 4.5, boost: 100, footprint: 2 },
  manor: { cost: 450, price: 6, upkeep: 24, satisfies: 'fun', useTime: 4, boost: 90 },
  bumper: { cost: 300, price: 4, upkeep: 16, satisfies: 'fun', useTime: 3, boost: 60 },
  helter: { cost: 350, price: 5, upkeep: 18, satisfies: 'fun', useTime: 3.5, boost: 75 },
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
  gatePirate: 350
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
    native: 'pirateship',
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

/** The largest building footprint side length; the search bound for annex→anchor recovery. */
export const MAX_FOOTPRINT = 2;

/**
 * The tile indices of a `size`×`size` building footprint anchored at its
 * top-left corner (x, y), or null if the block would run off the grid. A
 * single-tile building (size 1) is just [idx(x, y)].
 */
export function footprintTiles(x: number, y: number, size: number): number[] | null {
  if (x < 0 || y < 0 || x + size > GRID_W || y + size > GRID_H) return null;
  const cells: number[] = [];
  for (let dy = 0; dy < size; dy++) {
    for (let dx = 0; dx < size; dx++) cells.push(idx(x + dx, y + dy));
  }
  return cells;
}

/**
 * Every tile of the multi-tile ride that tile `i` belongs to — whether `i`
 * is the anchor (which holds the building's TileType) or one of its
 * `rideannex` fillers. Returns [i] for a single-tile building or bare
 * ground, so bulldoze and guest routing can treat a 2×2 coaster as one
 * object from any of its four tiles. An annex's anchor is found by scanning
 * the (up to) MAX_FOOTPRINT² top-left positions whose block could cover `i`;
 * footprints never overlap (placement demands all-grass), so at most one matches.
 */
export function footprintOf(tiles: TileType[], i: number): number[] {
  const def = BUILDINGS[tiles[i]];
  if (def && (def.footprint ?? 1) > 1) {
    return footprintTiles(i % GRID_W, Math.floor(i / GRID_W), def.footprint!) ?? [i];
  }
  if (tiles[i] === 'rideannex') {
    const x = i % GRID_W;
    const y = Math.floor(i / GRID_W);
    for (let ay = Math.max(0, y - MAX_FOOTPRINT + 1); ay <= y; ay++) {
      for (let ax = Math.max(0, x - MAX_FOOTPRINT + 1); ax <= x; ax++) {
        const anchor = BUILDINGS[tiles[idx(ax, ay)]];
        if (!anchor || (anchor.footprint ?? 1) <= 1) continue;
        const cells = footprintTiles(ax, ay, anchor.footprint!);
        if (cells && cells.includes(i)) return cells;
      }
    }
  }
  return [i];
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

/**
 * A dead-flat board with just the entrance and its starter path stub — the
 * blank slate createPark's generation starts from. Exported for tests that
 * need known-flat ground under placement/terraform assertions.
 */
export function createFlatPark(): Park {
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

/**
 * The flat buildable core around the entrance (inclusive tile bounds) that
 * terrain generation must leave untouched: no water, no hills — so the
 * early game builds on open ground instead of fighting the landscape. The
 * entrance and its starter path sit inside it.
 */
export const ENTRANCE_CORE = {
  x0: Math.floor(GRID_W / 2) - 4,
  x1: Math.floor(GRID_W / 2) + 4,
  y0: GRID_H - 5,
  y1: GRID_H - 1
};

/** Chebyshev distance from tile (x, y) to the entrance core's rectangle (0 = inside it). */
function chebToCore(x: number, y: number): number {
  const dx = Math.max(ENTRANCE_CORE.x0 - x, 0, x - ENTRANCE_CORE.x1);
  const dy = Math.max(ENTRANCE_CORE.y0 - y, 0, y - ENTRANCE_CORE.y1);
  return Math.max(dx, dy);
}

/** Uniform integer in [lo, hi] from a [0,1) random source. */
const randInt = (random: () => number, lo: number, hi: number): number =>
  lo + Math.floor(random() * (hi - lo + 1));

/**
 * Digs one pond: a random-growth blob of water on flat grass, kept a tile
 * clear of the entrance core so it never crowds the starting build space.
 * Runs before the hills, so "flat grass" is simply "grass" here.
 */
function digPond(tiles: TileType[], random: () => number): void {
  const pondable = (i: number) =>
    tiles[i] === 'grass' && chebToCore(i % GRID_W, Math.floor(i / GRID_W)) >= 2;
  const candidates: number[] = [];
  for (let i = 0; i < tiles.length; i++) {
    if (pondable(i)) candidates.push(i);
  }
  if (!candidates.length) return;
  const seed = candidates[Math.floor(random() * candidates.length)];
  tiles[seed] = 'water';
  growBlob(seed, GRID_W, GRID_H, randInt(random, 3, 7), pondable, i => (tiles[i] = 'water'), random);
}

/**
 * Floods one board edge (top, left, or right — never the entrance's edge)
 * with a shoreline whose depth wanders 1–3 tiles, so some maps start
 * coastal instead of pond-dotted. The core-distance guard is a safety net;
 * the eligible edges never actually reach the entrance core.
 */
function carveCoast(tiles: TileType[], random: () => number): void {
  const edge = [0, 1, 3][randInt(random, 0, 2)]; // top, right, left — never the entrance's edge
  carveEdge(
    GRID_W,
    GRID_H,
    edge,
    3,
    (x, y) => {
      const i = idx(x, y);
      if (tiles[i] === 'grass' && chebToCore(x, y) >= 1) tiles[i] = 'water';
    },
    random
  );
}

/** Whether every tile within `reach` of (cx, cy) can host hill footprint: all grass, clear of the entrance core. */
function footprintClear(tiles: TileType[], cx: number, cy: number, reach: number): boolean {
  for (let y = Math.max(0, cy - reach); y <= Math.min(GRID_H - 1, cy + reach); y++) {
    for (let x = Math.max(0, cx - reach); x <= Math.min(GRID_W - 1, cx + reach); x++) {
      if (tiles[idx(x, y)] !== 'grass' || chebToCore(x, y) < 1) return false;
    }
  }
  return true;
}

/**
 * Stamps one hill onto the heightmap: height falls off by one per Chebyshev
 * ring beyond a flat top, which makes every hill (and any max-merge of
 * overlapping hills) automatically respect the one-step slope rule — see
 * the invariants tested in tests/games/park.test.ts. Height-1 hills get
 * their top widened by a ring here, where the falloff geometry lives: a
 * lone raised tile reads like a rendering glitch, a small plateau reads
 * like a knoll. The footprint must be all grass (water stays at height 0)
 * and clear of the entrance core. Enumerating every candidate centre (the
 * board is only 24×14, and this runs once per new park) rather than
 * rejection-sampling is what guarantees a hill lands whenever any valid
 * centre exists — the "at least one hill" invariant the tests rely on.
 * Returns false when no valid centre exists for this size.
 */
function placeHill(
  tiles: TileType[],
  heights: number[],
  peak: number,
  topRadius: number,
  random: () => number
): boolean {
  const top = peak === 1 ? topRadius + 1 : topRadius;
  const reach = peak + top - 1; // outermost ring with height > 0
  const candidates: number[] = [];
  for (let cy = 0; cy < GRID_H; cy++) {
    for (let cx = 0; cx < GRID_W; cx++) {
      if (footprintClear(tiles, cx, cy, reach)) candidates.push(idx(cx, cy));
    }
  }
  if (!candidates.length) return false;
  const c = candidates[Math.floor(random() * candidates.length)];
  const cx = c % GRID_W;
  const cy = Math.floor(c / GRID_W);
  for (let y = Math.max(0, cy - reach); y <= Math.min(GRID_H - 1, cy + reach); y++) {
    for (let x = Math.max(0, cx - reach); x <= Math.min(GRID_W - 1, cx + reach); x++) {
      const i = idx(x, y);
      const h = peak - Math.max(0, chebyshev(i, c, GRID_W) - top);
      heights[i] = Math.min(MAX_HEIGHT, Math.max(heights[i], h));
    }
  }
  return true;
}

/**
 * A fresh park with procedurally rolled starting terrain: a couple of gentle
 * hills (sometimes one tall enough — height ≥2 — to be a free Sky Tower
 * site), and either a pond or two or a coastline along one edge (natural Log
 * Flume sites). Pure and seedable: pass a deterministic `random` to get the
 * same map every time. Hard invariants (unit-tested): the slope rule holds
 * everywhere, water only at height 0, the entrance and starter path stay
 * flat and intact, and a generous flat grass core remains around the
 * entrance.
 */
export function createPark(random: () => number = Math.random): Park {
  const park = createFlatPark();
  // Water first, hills second: hill footprints avoid water tiles, which
  // keeps "water only at height 0" true by construction.
  if (random() < 0.35) {
    carveCoast(park.tiles, random);
  } else {
    const ponds = randInt(random, 1, 2);
    for (let p = 0; p < ponds; p++) digPond(park.tiles, random);
  }
  const hills = randInt(random, 1, 3);
  for (let h = 0; h < hills; h++) {
    const roll = random();
    const wantPeak = roll < 0.35 ? 1 : roll < 0.75 ? 2 : 3;
    const topRadius = randInt(random, 0, 1);
    // Fall back to a smaller hill rather than none if the roll doesn't fit.
    for (let peak = wantPeak; peak >= 1; peak--) {
      if (placeHill(park.tiles, park.heights, peak, topRadius, random)) break;
    }
  }
  return park;
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
 * can't be reshaped (water, buildings, the entrance, anything in
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
  // Index-pointer queue: shift() re-indexes the whole array per dequeue.
  // Visit order doesn't affect the result (each push is the minimum move
  // toward the wavefront), so a plain pointer walk is safe.
  const queue = [i];
  for (let head = 0; head < queue.length; head++) {
    const t = queue[head];
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
 * Applies a terraform plan: sets each planned height and closes any tunnel
 * dug on a moved tile — a tunnel flag is only meaningful at height 0. The
 * single mutation site for terrain plans, whatever produced them (the
 * raise/lower tools via applyTool, or track drafting's automatic shaping).
 */
export function applyTerraformPlan(
  heights: number[],
  tunnels: boolean[],
  plan: Map<number, number>
): void {
  for (const [tile, h] of plan) {
    heights[tile] = h;
    tunnels[tile] = false;
  }
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
    const cells = footprintTiles(x, y, def.footprint ?? 1);
    if (!cells) return false; // the block would run off the grid
    const block = new Set(cells);
    // Every footprint tile clear and level with the anchor: a flat pad, so a
    // multi-tile ride never straddles a slope. (For a single-tile building
    // the anchor grass check above already covered this; the loop is a no-op.)
    for (const c of cells) {
      if (tiles[c] !== 'grass' || heights[c] !== heights[i]) return false;
    }
    if (def.minHeight !== undefined && heights[i] < def.minHeight) return false;
    // Reachable: some footprint tile touches a walkable tile OUTSIDE the block.
    if (!cells.some(c => neighbours(c).some(n => !block.has(n) && isWalkable(tiles[n])))) return false;
    if (def.needsWater && !cells.some(c => neighbours(c).some(n => !block.has(n) && tiles[n] === 'water'))) {
      return false;
    }
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
    // Bulldozing any tile of a multi-tile ride clears the whole footprint.
    for (const c of footprintOf(tiles, i)) {
      tiles[c] = 'grass';
      tunnels[c] = false;
    }
    return;
  }
  if (tool === 'raiseLand' || tool === 'lowerLand') {
    const delta = tool === 'raiseLand' ? 1 : -1;
    const plan = terraformPlan(tiles, heights, i, heights[i] + delta);
    if (plan) applyTerraformPlan(heights, tunnels, plan);
    return;
  }
  if (tool === 'digTunnel') {
    tunnels[i] = true;
    return;
  }
  const def = BUILDINGS[tool as TileType];
  if (def && (def.footprint ?? 1) > 1) {
    // Fill the block with inert annex tiles, then stamp the anchor last so it
    // owns its own tile. canPlace has already guaranteed the block is clear.
    for (const c of footprintTiles(x, y, def.footprint!)!) tiles[c] = 'rideannex';
    tiles[i] = tool as TileType;
    return;
  }
  tiles[i] = tool as TileType;
}
