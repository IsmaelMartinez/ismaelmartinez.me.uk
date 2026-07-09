/**
 * Park economy: rating, guest spawn rate, and daily upkeep.
 */
import { BUILDINGS, zoneDiscountFactor, type TileType } from './grid';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Park rating 0–100: mostly average guest happiness, with a small bonus for
 * greenery. With nobody in the park it idles at a neutral 50.
 */
export function parkRating(avgHappiness: number | null, treeCount: number): number {
  const base = avgHappiness === null ? 50 : avgHappiness * 0.9;
  return Math.round(clamp(base + Math.min(15, treeCount * 1.5), 0, 100));
}

/** Seconds between guest arrivals; better parks pull bigger crowds. */
export function spawnInterval(rating: number): number {
  return clamp(9 - rating * 0.075, 1.5, 9);
}

/** Daily running costs across all placed buildings, discounted for a zone's native attraction. */
export function dailyUpkeep(tiles: TileType[]): number {
  let total = 0;
  tiles.forEach((tile, i) => {
    const def = BUILDINGS[tile];
    if (!def) return;
    total += Math.round(def.upkeep * zoneDiscountFactor(tiles, i, tile));
  });
  return total;
}
