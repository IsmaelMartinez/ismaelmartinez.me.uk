/**
 * Microcity tile model: zones (which develop in levels), infrastructure,
 * costs, and placement rules. Flat W×H grid; index = y * CITY_W + x.
 */

export const CITY_W = 24;
export const CITY_H = 14;
export const MAX_LEVEL = 3;

export type ZoneType = 'res' | 'com' | 'ind';
export type CityTileType = 'empty' | 'road' | 'power' | 'park' | ZoneType;
export type CityTool = Exclude<CityTileType, 'empty'> | 'bulldoze';

export interface CityTile {
  type: CityTileType;
  /** Development level for zones (0 = undeveloped); always 0 otherwise. */
  level: number;
}

export const TOOL_COSTS: Record<CityTool, number> = {
  road: 10,
  res: 50,
  com: 75,
  ind: 100,
  power: 500,
  park: 30,
  bulldoze: 0
};

export const cityIdx = (x: number, y: number): number => y * CITY_W + x;

export function isZone(type: CityTileType): type is ZoneType {
  return type === 'res' || type === 'com' || type === 'ind';
}

export function createCity(): CityTile[] {
  return Array.from({ length: CITY_W * CITY_H }, () => ({ type: 'empty' as CityTileType, level: 0 }));
}

export function canBuild(tiles: CityTile[], x: number, y: number, tool: CityTool): boolean {
  if (x < 0 || x >= CITY_W || y < 0 || y >= CITY_H) return false;
  const tile = tiles[cityIdx(x, y)];
  if (tool === 'bulldoze') return tile.type !== 'empty';
  return tile.type === 'empty';
}

export function build(tiles: CityTile[], x: number, y: number, tool: CityTool): void {
  const tile = tiles[cityIdx(x, y)];
  tile.type = tool === 'bulldoze' ? 'empty' : tool;
  tile.level = 0;
}
