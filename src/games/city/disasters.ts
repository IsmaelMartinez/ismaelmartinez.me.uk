/**
 * Microcity chaos: fires that ignite, spread, and burn tiles down, plus
 * monthly political/civic events that shake the treasury and RCI demand.
 * DOM-free so every rule is testable with a seeded random.
 */
import { gridNeighbours } from '../engine/grid2d';
import { CITY_W, CITY_H, isZone, type CityTile } from './tiles';
import type { Demand } from './simulation';

// --- Fires ---

export interface Fire {
  idx: number;
  /** Sim ticks left before the tile burns down. */
  ticks: number;
}

export const BURN_TICKS = 5;
export const BURN_TICKS_COVERED = 3;
export const SPREAD_CHANCE = 0.22;
export const SPREAD_CHANCE_COVERED = 0.08;

/**
 * What can catch fire: nature, developed zones, and civic buildings.
 * Power plants are deliberately fireproof — losing the whole grid to a
 * single spark would be too brutal for the game's scale.
 */
export function isFlammable(tile: CityTile): boolean {
  return (
    tile.type === 'tree' ||
    tile.type === 'park' ||
    tile.type === 'school' ||
    tile.type === 'firehouse' ||
    (isZone(tile.type) && tile.level > 0)
  );
}

/**
 * Ignition risk weight of a single tile: industry is three times as
 * fire-prone as anything else, and fire-station coverage halves the risk.
 */
export function ignitionWeight(tile: CityTile, covered: boolean): number {
  if (!isFlammable(tile)) return 0;
  const base = tile.type === 'ind' ? 3 : 1;
  return covered ? base * 0.5 : base;
}

/**
 * Chance per sim tick that a new fire breaks out somewhere. Scales with how
 * much burnable (and how well-protected) city exists, so sleepy hamlets
 * stay safe and fire stations genuinely reduce outbreaks.
 */
export function ignitionChance(tiles: CityTile[], fireCover: boolean[]): number {
  let total = 0;
  tiles.forEach((tile, i) => (total += ignitionWeight(tile, fireCover[i])));
  return Math.min(0.02, total * 0.0004);
}

/**
 * Picks a tile for a new fire, proportional to each tile's ignition weight.
 * Returns null when nothing can burn.
 */
export function startFire(
  tiles: CityTile[],
  fireCover: boolean[],
  random: () => number = Math.random
): Fire | null {
  const weights = tiles.map((tile, i) => ignitionWeight(tile, fireCover[i]));
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return null;
  let roll = random() * total;
  let idx = -1;
  for (let i = 0; i < weights.length; i++) {
    if (weights[i] <= 0) continue;
    idx = i;
    roll -= weights[i];
    if (roll < 0) break;
  }
  return { idx, ticks: fireCover[idx] ? BURN_TICKS_COVERED : BURN_TICKS };
}

/**
 * One fire tick: active fires try to spread to flammable neighbours, then
 * burn down. Burnt-out buildings leave rubble (bulldoze to clear); nature
 * burns away to bare earth. Fires whose tile was bulldozed go out. Returns
 * the surviving fire list plus what changed for the UI.
 */
export function stepFires(
  tiles: CityTile[],
  fires: Fire[],
  fireCover: boolean[],
  random: () => number = Math.random
): { fires: Fire[]; spread: number[]; burnedOut: number[] } {
  const alive = fires.filter(f => isFlammable(tiles[f.idx]));
  const burning = new Set(alive.map(f => f.idx));
  const spread: number[] = [];
  for (const fire of alive) {
    for (const n of gridNeighbours(fire.idx, CITY_W, CITY_H)) {
      if (burning.has(n) || !isFlammable(tiles[n])) continue;
      // Coverage on either side of the boundary dampens the jump
      const dampened = fireCover[fire.idx] || fireCover[n];
      if (random() < (dampened ? SPREAD_CHANCE_COVERED : SPREAD_CHANCE)) {
        burning.add(n);
        spread.push(n);
      }
    }
  }

  const burnedOut: number[] = [];
  const remaining: Fire[] = [];
  for (const fire of alive) {
    const ticks = fire.ticks - 1;
    if (ticks > 0) {
      remaining.push({ idx: fire.idx, ticks });
      continue;
    }
    burnedOut.push(fire.idx);
    const tile = tiles[fire.idx];
    tile.type = tile.type === 'tree' || tile.type === 'park' ? 'empty' : 'rubble';
    tile.level = 0;
  }
  for (const idx of spread) {
    remaining.push({ idx, ticks: fireCover[idx] ? BURN_TICKS_COVERED : BURN_TICKS });
  }
  return { fires: remaining, spread, burnedOut };
}

// --- Political & civic events ---

export type CityEventId = 'grant' | 'protest' | 'festival' | 'strike' | 'boom';

export interface CityEvent {
  id: CityEventId;
  emoji: string;
  /** Immediate treasury delta. */
  money: number;
  /** Additive RCI demand modifier while the event is active. */
  demand: Partial<Demand>;
  /** How many months the demand modifier lasts (0 = instant only). */
  months: number;
}

export const CITY_EVENTS: CityEvent[] = [
  { id: 'grant', emoji: '🏛️', money: 300, demand: {}, months: 0 },
  { id: 'protest', emoji: '📢', money: -150, demand: { res: -15 }, months: 2 },
  { id: 'festival', emoji: '🎪', money: -100, demand: { res: 15, com: 20 }, months: 2 },
  { id: 'strike', emoji: '✊', money: 0, demand: { ind: -30 }, months: 2 },
  { id: 'boom', emoji: '📈', money: 150, demand: { com: 25 }, months: 2 }
];

export const EVENT_CHANCE = 0.3;
/** Young cities get a grace period before politics kicks in. */
export const EVENT_GRACE_MONTHS = 4;

export interface ActiveEvent {
  event: CityEvent;
  monthsLeft: number;
}

export function rollEvent(month: number, random: () => number = Math.random): CityEvent | null {
  if (month <= EVENT_GRACE_MONTHS) return null;
  if (random() >= EVENT_CHANCE) return null;
  return CITY_EVENTS[Math.floor(random() * CITY_EVENTS.length)];
}

/** Sums the demand modifiers of every active event. */
export function sumDemandModifiers(active: ActiveEvent[]): Partial<Demand> {
  const total: Partial<Demand> = {};
  for (const { event } of active) {
    for (const key of Object.keys(event.demand) as (keyof Demand)[]) {
      total[key] = (total[key] ?? 0) + (event.demand[key] ?? 0);
    }
  }
  return total;
}
