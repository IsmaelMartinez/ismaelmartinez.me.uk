/**
 * Microcity chaos: fires that ignite, spread, and burn tiles down — unless a
 * firehouse in range fights them out first (see `EXTINGUISH_CHANCE`); roaming
 * tornadoes and earthquakes whose frequency ramps with the city's age and
 * size (see `disasterIntensity`); plus monthly political/civic events that
 * shake the treasury and RCI demand. DOM-free so every rule is testable
 * with a seeded random.
 */
import { gridNeighbours, chebyshev } from '../engine/grid2d';
import { CITY_W, CITY_H, cityIdx, isZone, type CityTile } from './tiles';
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
 * Chance per tick that a firehouse in range actually puts a covered fire out —
 * the tile survives instead of burning down. This is the fire crews doing real
 * work: an uncovered fire always burns to the end, a covered one is usually
 * (but not always) contained before it does.
 */
export const EXTINGUISH_CHANCE = 0.4;

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
    tile.type === 'police' ||
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
 * One fire tick: a firehouse in range fights each covered fire and may put it
 * out this tick (the tile survives); whatever it doesn't contain tries to
 * spread to flammable neighbours, then burns down. Burnt-out buildings leave
 * rubble (bulldoze to clear); nature burns away to bare earth. Fires whose tile
 * was bulldozed go out. Returns the surviving fire list plus what changed for
 * the UI (`extinguished` tiles were saved by the fire crews, unharmed).
 */
export function stepFires(
  tiles: CityTile[],
  fires: Fire[],
  fireCover: boolean[],
  random: () => number = Math.random
): { fires: Fire[]; spread: number[]; burnedOut: number[]; extinguished: number[] } {
  const alive = fires.filter(f => isFlammable(tiles[f.idx]));
  // Active firefighting: a covered fire may be knocked out before it does
  // anything else this tick — no spread, no burn, the tile left standing.
  const extinguished: number[] = [];
  const fighting: Fire[] = [];
  for (const fire of alive) {
    if (fireCover[fire.idx] && random() < EXTINGUISH_CHANCE) extinguished.push(fire.idx);
    else fighting.push(fire);
  }
  // Seed the "already burning" guard from every fire alive at the start of the
  // tick, not just the ones still fighting: a tile a crew put out this tick
  // must stay off-limits to spread, or an adjacent blaze would reignite it the
  // same tick and the extinguish would count for nothing.
  const burning = new Set(alive.map(f => f.idx));
  const spread: number[] = [];
  for (const fire of fighting) {
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
  for (const fire of fighting) {
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
  return { fires: remaining, spread, burnedOut, extinguished };
}

// --- Difficulty ramp ---

/** No tornadoes or earthquakes strike before this month. */
export const DISASTER_GRACE_MONTHS = 8;

/**
 * How hard the late game leans on the city, 0–1: nothing during the early
 * grace period, then a ramp driven by both the city's age and its size, so
 * a sprawling metropolis faces real weather while a village that has taken
 * thirty months to build its first block is still mostly left alone.
 */
export function disasterIntensity(month: number, population: number): number {
  if (month <= DISASTER_GRACE_MONTHS) return 0;
  const age = Math.min(1, (month - DISASTER_GRACE_MONTHS) / 30);
  const size = Math.min(1, population / 1500);
  return Math.min(1, 0.2 + 0.45 * age + 0.5 * size);
}

// --- Tornado ---

export interface Tornado {
  /** Fractional tile position of the funnel. */
  x: number;
  y: number;
  /** Heading, in tiles per sim tick. */
  dx: number;
  dy: number;
  ticksLeft: number;
}

export const TORNADO_TICKS = 26;
/** Chance per growth tick that a tornado touches down, at full intensity. */
export const TORNADO_CHANCE = 0.012;

export function tornadoChance(intensity: number): number {
  return TORNADO_CHANCE * intensity;
}

/** Touches down on a random edge of the map, heading across it. */
export function spawnTornado(random: () => number = Math.random): Tornado {
  const edge = Math.floor(random() * 4); // 0 W, 1 E, 2 N, 3 S
  const speed = 0.8;
  if (edge === 0 || edge === 1) {
    return {
      x: edge === 0 ? 0 : CITY_W - 1,
      y: 1 + random() * (CITY_H - 2),
      dx: edge === 0 ? speed : -speed,
      dy: (random() - 0.5) * 0.5,
      ticksLeft: TORNADO_TICKS
    };
  }
  return {
    x: 1 + random() * (CITY_W - 2),
    y: edge === 2 ? 0 : CITY_H - 1,
    dx: (random() - 0.5) * 0.5,
    dy: edge === 2 ? speed : -speed,
    ticksLeft: TORNADO_TICKS
  };
}

/**
 * What a tornado does to the tile under it. Developed zones are knocked
 * down a level (a level-1 building is flattened to rubble); civic buildings
 * and parks are flattened outright; trees are torn out. Power plants stay
 * standing for the same reason they are fireproof, and roads, water, and
 * bridges ride it out. Returns whether the tile changed.
 */
export function wreckTile(tile: CityTile): boolean {
  if (isZone(tile.type) && tile.level > 0) {
    if (tile.level > 1) tile.level--;
    else {
      tile.type = 'rubble';
      tile.level = 0;
    }
    return true;
  }
  if (
    tile.type === 'park' ||
    tile.type === 'school' ||
    tile.type === 'firehouse' ||
    tile.type === 'police'
  ) {
    tile.type = 'rubble';
    tile.level = 0;
    return true;
  }
  if (tile.type === 'tree') {
    tile.type = 'empty';
    return true;
  }
  return false;
}

/**
 * One tornado sim tick: the funnel drifts along its heading with a little
 * wobble, wrecking the tile it passes over. Returns the surviving tornado
 * (null once it blows out or leaves the map) and any tile it damaged.
 */
export function stepTornado(
  tiles: CityTile[],
  tornado: Tornado,
  random: () => number = Math.random
): { tornado: Tornado | null; wrecked: number[] } {
  const next: Tornado = {
    x: tornado.x + tornado.dx + (random() - 0.5) * 0.4,
    y: tornado.y + tornado.dy + (random() - 0.5) * 0.4,
    dx: tornado.dx,
    dy: tornado.dy,
    ticksLeft: tornado.ticksLeft - 1
  };
  const wrecked: number[] = [];
  const tx = Math.round(next.x);
  const ty = Math.round(next.y);
  if (tx >= 0 && tx < CITY_W && ty >= 0 && ty < CITY_H) {
    const i = cityIdx(tx, ty);
    if (wreckTile(tiles[i])) wrecked.push(i);
  }
  const gone =
    next.ticksLeft <= 0 || next.x < -1 || next.x > CITY_W || next.y < -1 || next.y > CITY_H;
  return { tornado: gone ? null : next, wrecked };
}

// --- Earthquake ---

/** Chance per month of an earthquake, at full intensity. */
export const QUAKE_CHANCE = 0.06;
export const QUAKE_RADIUS = 4;
/** Fires the shaking starts among the damage. */
export const QUAKE_IGNITE_CHANCE = 0.2;

export function quakeChance(intensity: number): number {
  return QUAKE_CHANCE * intensity;
}

/**
 * An earthquake: picks an epicentre, damages developed tiles around it with
 * odds falling off toward the edge of the radius (same rules as a tornado
 * hit), and starts a few fires in the wreckage's flammable surroundings.
 * Returns the epicentre plus what was damaged and ignited so the game layer
 * can shake the screen, spawn fires, and refresh derived state.
 */
export function earthquakeDamage(
  tiles: CityTile[],
  random: () => number = Math.random
): { epicentre: number; damaged: number[]; ignited: number[] } {
  const epicentre = Math.floor(random() * tiles.length);
  const damaged: number[] = [];
  const ignited: number[] = [];
  tiles.forEach((tile, i) => {
    const dist = chebyshev(epicentre, i, CITY_W);
    if (dist > QUAKE_RADIUS) return;
    const odds = 0.75 * (1 - dist / (QUAKE_RADIUS + 1));
    if (random() >= odds) return;
    if (wreckTile(tile)) {
      damaged.push(i);
    } else if (isFlammable(tile) && random() < QUAKE_IGNITE_CHANCE) {
      ignited.push(i);
    }
  });
  return { epicentre, damaged, ignited };
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
