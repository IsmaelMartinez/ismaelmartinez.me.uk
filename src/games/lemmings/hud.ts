/**
 * Pure HUD maths for Critter Rescue.
 *
 * DOM-free so it can be unit-tested headless: the destination-arrow direction
 * each critter should point (toward the exit) and the rescued/quota progress
 * fraction the HUD bar fills to. The game module (game.ts) owns the actual
 * canvas drawing and DOM updates and calls these for the numbers.
 */

export interface Point {
  x: number;
  y: number;
}

/**
 * Angle in radians (canvas convention: +x right, +y down, measured with
 * `Math.atan2`) from a critter toward the exit, for the little destination
 * arrow drawn above each critter. Returns 0 when the two points coincide so
 * the arrow has a defined heading rather than NaN.
 */
export function exitArrowAngle(from: Point, exit: Point): number {
  const dx = exit.x - from.x;
  const dy = exit.y - from.y;
  if (dx === 0 && dy === 0) return 0;
  return Math.atan2(dy, dx);
}

/**
 * Unit vector from a critter toward the exit. Handy for placing/offsetting the
 * arrow without recomputing trig. Returns {x:0,y:0} for coincident points.
 */
export function exitArrowVector(from: Point, exit: Point): Point {
  const dx = exit.x - from.x;
  const dy = exit.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return { x: 0, y: 0 };
  return { x: dx / len, y: dy / len };
}

/**
 * Rescue progress toward the level quota, clamped to [0, 1]. `needed <= 0`
 * (a hypothetical quota-free level) reads as fully complete so the bar never
 * divides by zero or reports a fraction above one when the crowd over-delivers.
 */
export function rescueProgress(saved: number, needed: number): number {
  if (needed <= 0) return 1;
  const fraction = saved / needed;
  if (fraction < 0) return 0;
  if (fraction > 1) return 1;
  return fraction;
}
