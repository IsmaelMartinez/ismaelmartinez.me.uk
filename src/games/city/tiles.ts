/**
 * Microcity tile model: zones (which develop in levels), infrastructure,
 * terrain, costs, and placement rules. Flat W×H grid; index = y * CITY_W + x.
 */

export const CITY_W = 24;
export const CITY_H = 14;
export const MAX_LEVEL = 3;
/** Zones can densify one level beyond MAX_LEVEL once the city is big enough
 *  (see simulation.ts's maxZoneLevel). */
export const DENSE_LEVEL = 4;

export type ZoneType = 'res' | 'com' | 'ind';
export type CityTileType =
  | 'empty'
  | 'road'
  | 'bridge'
  | 'power'
  | 'park'
  | 'school'
  | 'firehouse'
  | 'water'
  | 'tree'
  | 'rubble'
  | ZoneType;
export type CityTool = 'road' | 'power' | 'park' | 'school' | 'firehouse' | 'bulldoze' | 'fill' | ZoneType;

export interface CityTile {
  type: CityTileType;
  /** Development level for zones (0 = undeveloped); always 0 otherwise. */
  level: number;
}

/** Roads laid over water become bridges, at a premium. */
export const BRIDGE_COST = 50;

/** Permanently converts a water tile to buildable land. */
export const FILL_COST = 60;

export const TOOL_COSTS: Record<CityTool, number> = {
  road: 10,
  res: 50,
  com: 75,
  ind: 100,
  power: 500,
  park: 30,
  school: 300,
  firehouse: 250,
  bulldoze: 0,
  fill: FILL_COST
};

export const cityIdx = (x: number, y: number): number => y * CITY_W + x;

export function isZone(type: CityTileType): type is ZoneType {
  return type === 'res' || type === 'com' || type === 'ind';
}

/** Bridges carry traffic and service zones exactly like roads. */
export function isRoad(type: CityTileType): boolean {
  return type === 'road' || type === 'bridge';
}

export function createCity(): CityTile[] {
  return Array.from({ length: CITY_W * CITY_H }, () => ({ type: 'empty' as CityTileType, level: 0 }));
}

export function canBuild(tiles: CityTile[], x: number, y: number, tool: CityTool): boolean {
  if (x < 0 || x >= CITY_W || y < 0 || y >= CITY_H) return false;
  const tile = tiles[cityIdx(x, y)];
  if (tool === 'bulldoze') return tile.type !== 'empty' && tile.type !== 'water';
  if (tool === 'fill') return tile.type === 'water';
  if (tile.type === 'water') return tool === 'road';
  return tile.type === 'empty';
}

/** Cost of applying `tool` at a spot; roads over water price as bridges. */
export function buildCost(tiles: CityTile[], x: number, y: number, tool: CityTool): number {
  if (tool === 'road' && tiles[cityIdx(x, y)].type === 'water') return BRIDGE_COST;
  return TOOL_COSTS[tool];
}

export function build(tiles: CityTile[], x: number, y: number, tool: CityTool): void {
  const tile = tiles[cityIdx(x, y)];
  if (tool === 'bulldoze') {
    // Demolished bridges give the river back.
    tile.type = tile.type === 'bridge' ? 'water' : 'empty';
  } else if (tool === 'road' && tile.type === 'water') {
    tile.type = 'bridge';
  } else if (tool === 'fill') {
    // Filled land is indistinguishable from any other empty tile — no
    // reverting on bulldoze, unlike a bridge.
    tile.type = 'empty';
  } else {
    tile.type = tool;
  }
  tile.level = 0;
}
