/**
 * Park economy: rating, guest spawn rate, daily upkeep, and the age-ramping
 * staff wage bill that reintroduces late-game failure pressure.
 */
import { BUILDINGS, zoneDiscountFactor, type TileType } from './grid';

/** Seconds of game time per day — the canonical clock the wage/revenue maths
 *  share with game.ts's day loop (imported there as DAY_LENGTH). */
export const DAY_SECONDS = 24;

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

// --- Staff wages: the late-game pressure ---
//
// A busy stall out-earns a *flat* upkeep forever, so once the crowd arrives
// `money<0` never fires again — the only lose condition dies. Wages fix that:
// every attraction carries a per-head staff cost that climbs with the park's
// age, so a park that stops growing its takings slides into the red. The ramp
// is unbounded, so bankruptcy is eventually guaranteed (the crowd — and thus
// revenue — is capped at maxGuests, but the wage bill is not), keeping the run
// a finite score chase.

/** Days of grace before any wages are charged — a learning window. */
export const WAGE_GRACE_DAYS = 5;
/** £ added to each attraction's daily wage per day past the grace window. */
export const WAGE_RAMP = 1.4;

/** Per-attraction daily staff wage on a given day: zero through grace, then a
 *  linear, unbounded climb. */
export function wagePerAttraction(day: number): number {
  return Math.max(0, day - WAGE_GRACE_DAYS) * WAGE_RAMP;
}

/** Placed revenue-earning buildings (rides + stalls) — the wage-bearing staff count. */
export function attractionCount(tiles: TileType[]): number {
  let count = 0;
  for (const tile of tiles) {
    if (BUILDINGS[tile]) count++;
  }
  return count;
}

/**
 * The park's total daily running cost: flat building upkeep plus the age-ramped
 * staff wage bill. This is what the day tick deducts; `money<0` at day end still
 * ends the run, but now a static park eventually triggers it.
 */
export function operatingCost(tiles: TileType[], day: number): number {
  return dailyUpkeep(tiles) + Math.round(attractionCount(tiles) * wagePerAttraction(day));
}

/**
 * The most a single attraction can take in a day: one guest served per
 * `useTime`, at its price (coaster laps aside). Once `wagePerAttraction`
 * climbs past this, *every* attraction is net-negative regardless of park
 * size — the point beyond which no park can stay solvent. A design ceiling
 * the wage-vs-revenue crossover test pins.
 */
export function maxAttractionDailyRevenue(): number {
  let best = 0;
  for (const def of Object.values(BUILDINGS)) {
    if (!def) continue;
    best = Math.max(best, (DAY_SECONDS / def.useTime) * def.price);
  }
  return best;
}
