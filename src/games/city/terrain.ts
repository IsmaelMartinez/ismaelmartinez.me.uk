/**
 * Procedural terrain for a fresh Microcity map. Each new city rolls a water
 * style — a wandering river (horizontal or vertical), a lake or two, or a
 * coastline along one edge — plus scattered forest clusters, so where the
 * buildable land sits varies run to run. Water can only be crossed by
 * bridges; trees must be bulldozed before building but boost nearby homes.
 * All generators are pure given a seeded `random`, and invariants (water
 * count in range, plenty of buildable land, determinism) are unit-tested in
 * tests/games/city.test.ts.
 */
import { CITY_W, CITY_H, cityIdx, type CityTile } from './tiles';

export type WaterStyle = 'river' | 'lake' | 'coast';

/**
 * Carves a river across the board. Horizontal rivers run left → right
 * drifting up/down a row at a time (filling both tiles at a bend so the
 * water stays connected); `vertical` swaps the axes so the river runs top →
 * bottom instead. The channel's width wanders between one and two tiles in
 * stretches rather than per-tile speckle.
 */
export function carveRiver(
  tiles: CityTile[],
  random: () => number = Math.random,
  vertical = false
): void {
  const along = vertical ? CITY_H : CITY_W;
  const across = vertical ? CITY_W : CITY_H;
  const set = (k: number, c: number) => {
    if (c < 0 || c >= across) return;
    tiles[vertical ? cityIdx(c, k) : cityIdx(k, c)].type = 'water';
  };
  let c = 2 + Math.floor(random() * (across - 4));
  let wide = random() < 0.4;
  for (let k = 0; k < along; k++) {
    set(k, c);
    if (random() < 0.15) wide = !wide;
    if (wide) set(k, c + 1);
    const drift = random();
    if (drift < 0.28 && c > 1) c--;
    else if (drift > 0.72 && c < across - 2) c++;
    set(k, c);
  }
}

/** Grows one blob lake of roughly `target` tiles from a random inland seed. */
function growLake(tiles: CityTile[], target: number, random: () => number): void {
  const sx = 2 + Math.floor(random() * (CITY_W - 4));
  const sy = 2 + Math.floor(random() * (CITY_H - 4));
  const blob = [cityIdx(sx, sy)];
  tiles[blob[0]].type = 'water';
  // Growth can stall against edges, so bound the attempts.
  for (let tries = 0; blob.length < target && tries < target * 8; tries++) {
    const from = blob[Math.floor(random() * blob.length)];
    const fx = from % CITY_W;
    const fy = Math.floor(from / CITY_W);
    const dir = Math.floor(random() * 4);
    const x = fx + (dir === 1 ? 1 : dir === 3 ? -1 : 0);
    const y = fy + (dir === 2 ? 1 : dir === 0 ? -1 : 0);
    if (x < 0 || x >= CITY_W || y < 0 || y >= CITY_H) continue;
    const tile = tiles[cityIdx(x, y)];
    if (tile.type === 'empty') {
      tile.type = 'water';
      blob.push(cityIdx(x, y));
    }
  }
}

/** Fills the map's water with one big lake (and sometimes a second smaller one) instead of a river. */
export function carveLakes(tiles: CityTile[], random: () => number = Math.random): void {
  growLake(tiles, 9 + Math.floor(random() * 8), random);
  if (random() < 0.5) growLake(tiles, 4 + Math.floor(random() * 5), random);
}

/**
 * Floods one board edge with a coastline whose depth wanders between one
 * and four tiles, so the city grows against open water instead of around a
 * channel.
 */
export function carveCoast(tiles: CityTile[], random: () => number = Math.random): void {
  const edge = Math.floor(random() * 4); // 0 top, 1 right, 2 bottom, 3 left
  const len = edge % 2 === 0 ? CITY_W : CITY_H;
  let depth = 1 + Math.floor(random() * 2);
  for (let k = 0; k < len; k++) {
    const drift = random();
    if (drift < 0.3) depth = Math.max(1, depth - 1);
    else if (drift > 0.7) depth = Math.min(4, depth + 1);
    for (let d = 0; d < depth; d++) {
      const x = edge === 0 || edge === 2 ? k : edge === 1 ? CITY_W - 1 - d : d;
      const y = edge === 1 || edge === 3 ? k : edge === 0 ? d : CITY_H - 1 - d;
      tiles[cityIdx(x, y)].type = 'water';
    }
  }
}

/** Sprinkles forest clusters onto empty land. */
export function plantForests(tiles: CityTile[], random: () => number = Math.random): void {
  const clusters = 3 + Math.floor(random() * 3);
  for (let c = 0; c < clusters; c++) {
    const cx = Math.floor(random() * CITY_W);
    const cy = Math.floor(random() * CITY_H);
    const blob = 5 + Math.floor(random() * 6);
    for (let t = 0; t < blob; t++) {
      const x = cx + Math.floor(random() * 5) - 2;
      const y = cy + Math.floor(random() * 5) - 2;
      if (x < 0 || x >= CITY_W || y < 0 || y >= CITY_H) continue;
      const tile = tiles[cityIdx(x, y)];
      if (tile.type === 'empty') tile.type = 'tree';
    }
  }
}

/**
 * Rolls and applies a full starting map; returns which water style it chose
 * (the game ignores it, tests assert on it). Rivers stay the most common
 * start, with lakes and coastlines as occasional variety.
 */
export function generateTerrain(tiles: CityTile[], random: () => number = Math.random): WaterStyle {
  const roll = random();
  let style: WaterStyle;
  if (roll < 0.55) {
    style = 'river';
    carveRiver(tiles, random, random() < 0.5);
  } else if (roll < 0.78) {
    style = 'lake';
    carveLakes(tiles, random);
  } else {
    style = 'coast';
    carveCoast(tiles, random);
  }
  plantForests(tiles, random);
  return style;
}
