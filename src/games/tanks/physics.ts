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
