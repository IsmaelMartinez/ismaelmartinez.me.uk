/**
 * Projectile ballistics. Coordinates follow canvas convention: y grows
 * downwards, so gravity is positive and launch angles point "up" with
 * negative vy. Angles are degrees from horizontal-right (0 = right,
 * 90 = straight up, 180 = left).
 */
import { surfaceYAt } from './terrain';

export const GRAVITY = 240; // px/s²
export const POWER_TO_SPEED = 5.5; // px/s per power point (power range 10–100)

export interface Projectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export function launchProjectile(
  x: number,
  y: number,
  angleDeg: number,
  power: number
): Projectile {
  const rad = (angleDeg * Math.PI) / 180;
  const speed = power * POWER_TO_SPEED;
  return { x, y, vx: Math.cos(rad) * speed, vy: -Math.sin(rad) * speed };
}

/**
 * High-score-table score for a match won against the CPU: each round of
 * winning margin is worth 100 points, plus the armour the player's tank
 * finished on. Assumes hp is on the 0–100 scale tanks spawn with — a clean
 * sweep on full health must outrank a narrower win, so keep the margin
 * step above the hp cap if tank durability ever changes.
 */
export function matchScore(roundsWon: number, roundsLost: number, hp: number): number {
  return (roundsWon - roundsLost) * 100 + Math.round(Math.max(0, hp));
}

/** Advances a projectile by dt seconds. Wind is a horizontal acceleration. */
export function stepProjectile(p: Projectile, wind: number, dt: number): void {
  p.vx += wind * dt;
  p.vy += GRAVITY * dt;
  p.x += p.vx * dt;
  p.y += p.vy * dt;
}

export interface Impact {
  x: number;
  y: number;
}

/**
 * Runs a full trajectory against the terrain and returns the impact point,
 * or null if the shot leaves the field. Used by the CPU to evaluate shots
 * with exactly the same physics the live game uses.
 */
export function simulateShot(
  ground: number[],
  width: number,
  height: number,
  startX: number,
  startY: number,
  angleDeg: number,
  power: number,
  wind: number
): Impact | null {
  const p = launchProjectile(startX, startY, angleDeg, power);
  const dt = 1 / 120;
  const maxSteps = 120 * 15;
  for (let i = 0; i < maxSteps; i++) {
    stepProjectile(p, wind, dt);
    if (p.x < -100 || p.x > width + 100 || p.y > height) return null;
    if (p.y >= surfaceYAt(ground, p.x) && p.x >= 0 && p.x < width) {
      return { x: p.x, y: p.y };
    }
  }
  return null;
}

export const FALL_GRAVITY = 600; // px/s² for tanks dropping into craters

export interface FallBody {
  /** Vertical position (canvas y, grows downwards). */
  y: number;
  /** y where the current fall started, or null when grounded. */
  fallFrom: number | null;
  fallVy: number;
}

/**
 * Advances a body's gravity drop towards the terrain surface below it.
 *
 * A fall in progress always continues until the body actually reaches the
 * surface — the landing test must not depend on the takeoff threshold, or a
 * step that ends within that margin of the surface would leave `fallFrom`
 * set forever (which froze the game while it waited for tanks to settle).
 *
 * Returns the total drop height on the step the body lands, otherwise null.
 */
export function stepFall(body: FallBody, surface: number, dt: number): number | null {
  if (body.fallFrom === null) {
    if (body.y >= surface - 0.5) {
      // Grounded; track terrain that collapsed by less than the threshold.
      body.y = surface;
      return null;
    }
    body.fallFrom = body.y;
    body.fallVy = 0;
  }
  body.fallVy += FALL_GRAVITY * dt;
  body.y = Math.min(surface, body.y + body.fallVy * dt);
  if (body.y >= surface) {
    const drop = surface - body.fallFrom;
    body.fallFrom = null;
    body.fallVy = 0;
    return drop;
  }
  return null;
}

/** Linear-falloff blast damage; 0 outside the radius, maxDamage at the centre. */
export function explosionDamage(
  impactX: number,
  impactY: number,
  targetX: number,
  targetY: number,
  radius: number,
  maxDamage: number
): number {
  const dist = Math.hypot(targetX - impactX, targetY - impactY);
  if (dist >= radius) return 0;
  return Math.round(maxDamage * (1 - dist / radius));
}
