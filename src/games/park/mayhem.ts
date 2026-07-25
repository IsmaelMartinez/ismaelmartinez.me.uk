/**
 * Pixel Park mayhem: ride breakdowns and gate-flooding crowd surges, all
 * ramping up as the park matures so the late game stays lively. DOM-free so
 * every rule is testable with a seeded random.
 */
import { BUILDINGS, type TileType } from './grid';

/** Days of calm before rides start breaking down and surges roll. */
export const MAYHEM_GRACE_DAYS = 3;

/**
 * How hard mayhem leans on the park, 0–1: zero through the grace days,
 * then a ramp over the following weeks. The single difficulty knob every
 * chance function below scales from.
 */
export function mayhemIntensity(day: number): number {
  if (day <= MAYHEM_GRACE_DAYS) return 0;
  return Math.min(1, (day - MAYHEM_GRACE_DAYS) / 14);
}

// --- Ride breakdowns ---

export interface RideBreakdown {
  tile: number;
  secondsLeft: number;
}

/** How long a broken ride stays roped off before the mechanic fixes it. */
export const BREAKDOWN_SECONDS = 14;
/** Per-ride chance per second that it breaks, at full intensity. */
export const BREAKDOWN_CHANCE_PER_RIDE = 0.003;

/** The buildings that can break down: the ones guests ride for fun or thrills. */
export function isRide(tile: TileType): boolean {
  const need = BUILDINGS[tile]?.satisfies;
  return need === 'fun' || need === 'thrill';
}

/** Chance per second that some ride in the park breaks down. */
export function breakdownChance(day: number, rideCount: number): number {
  return BREAKDOWN_CHANCE_PER_RIDE * rideCount * mayhemIntensity(day);
}

/**
 * Picks which ride breaks: a uniform choice among working rides. Returns
 * the tile index, or null when every ride is already broken (or there are
 * none).
 */
export function pickBreakdownTile(
  tiles: TileType[],
  broken: number[],
  random: () => number = Math.random
): number | null {
  const down = new Set(broken);
  const candidates: number[] = [];
  tiles.forEach((tile, i) => {
    if (isRide(tile) && !down.has(i)) candidates.push(i);
  });
  if (!candidates.length) return null;
  return candidates[Math.floor(random() * candidates.length)];
}

// --- Crowd surges ---

export interface Surge {
  secondsLeft: number;
  /** Divisor applied to the spawn interval while the surge runs. */
  factor: number;
}

export const SURGE_SECONDS = 25;
/** Chance per day tick that a surge arrives, at full intensity. */
export const SURGE_CHANCE = 0.5;

/**
 * Rolls the daily crowd surge — a coach party flooding the gates. Bigger,
 * older parks draw bigger surges (spawn rate up to 3× while it lasts).
 */
export function rollSurge(day: number, random: () => number = Math.random): Surge | null {
  const intensity = mayhemIntensity(day);
  if (intensity <= 0 || random() >= SURGE_CHANCE * intensity) return null;
  return { secondsLeft: SURGE_SECONDS, factor: 2 + intensity };
}

/** Spawn interval after the active surge (if any) is applied. */
export function surgedInterval(base: number, surge: Surge | null): number {
  return surge ? base / surge.factor : base;
}

/**
 * Guest cap for the day: bigger crowds as the park matures, ramping from
 * the starting 60 up to 120 — late-game parks genuinely heave.
 */
export function maxGuests(day: number): number {
  return Math.min(120, 60 + Math.round(60 * mayhemIntensity(day)));
}
