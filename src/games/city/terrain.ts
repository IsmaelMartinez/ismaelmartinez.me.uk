/**
 * Procedural terrain for a fresh Microcity map: a river wandering across the
 * long axis plus scattered forest clusters. Water can only be crossed by
 * bridges; trees must be bulldozed before building but boost nearby homes.
 */
import { CITY_W, CITY_H, cityIdx, type CityTile } from './tiles';

/**
 * Carves a river from the left edge to the right edge. The channel drifts
 * up/down one row at a time (filling both tiles at a bend so the water stays
 * connected) and occasionally widens to two tiles.
 */
export function carveRiver(tiles: CityTile[], random: () => number = Math.random): void {
  let y = 2 + Math.floor(random() * (CITY_H - 4));
  for (let x = 0; x < CITY_W; x++) {
    tiles[cityIdx(x, y)].type = 'water';
    if (y + 1 < CITY_H && random() < 0.3) tiles[cityIdx(x, y + 1)].type = 'water';
    const drift = random();
    if (drift < 0.28 && y > 1) y--;
    else if (drift > 0.72 && y < CITY_H - 2) y++;
    tiles[cityIdx(x, y)].type = 'water';
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

export function generateTerrain(tiles: CityTile[], random: () => number = Math.random): void {
  carveRiver(tiles, random);
  plantForests(tiles, random);
}
