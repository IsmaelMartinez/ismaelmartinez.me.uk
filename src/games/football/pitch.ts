/**
 * Pitch geometry for CALCIO '90. The whole simulation lives in pitch
 * coordinates: `(0, 0)` is the top-left corner flag, **x is the lateral axis
 * and y runs goal to goal**, so the world is portrait exactly as the cabinet
 * frames it. One world unit is one framebuffer pixel; render.ts only ever
 * subtracts the camera offset.
 *
 * Everything here is pure, which is what lets `cameraFor` carry a unit test.
 */
import { clamp } from '../engine/math';

export const PITCH_W = 340;
export const PITCH_L = 520;

/** Half-width of the goal mouth: it spans x in [128, 212]. */
export const GOAL_HALF = 42;
/** Net depth drawn outside the goal line. */
export const GOAL_DEPTH = 14;
/** A ball above this never counts as a goal — it cleared the bar. */
export const GOAL_HEIGHT = 26;

export const BOX_DEPTH = 78;
export const BOX_HALF = 108;
/** Six-yard box, which is also the keeper's claim zone. */
export const SIX_DEPTH = 30;
export const SIX_HALF = 62;
export const PENALTY_SPOT = 52;
export const CENTRE_R = 52;
export const CORNER_R = 8;

/** Keeper plus six outfielders; index 0 is always the keeper. */
export const TEAM_SIZE = 7;

export const CENTRE_X = PITCH_W / 2;
export const CENTRE_Y = PITCH_L / 2;
export const GOAL_LEFT = CENTRE_X - GOAL_HALF;
export const GOAL_RIGHT = CENTRE_X + GOAL_HALF;

/** The playfield window: the 320x224 framebuffer minus the 72 px HUD column. */
export const VIEW_W = 248;
export const VIEW_H = 224;
/** Terrace the camera may show beyond the touchline. */
export const CAMERA_MARGIN = 16;

/** Side 0 is always the human; side 1 is always the CPU. */
export type Side = 0 | 1;

export interface Point {
  x: number;
  y: number;
}

/**
 * Which way `side` is playing. Side 0 attacks increasing y in the first half
 * and the ends swap at the interval, so `swapped` is simply `half === 1`.
 */
export function attackDir(side: Side, swapped: boolean): 1 | -1 {
  const base: 1 | -1 = side === 0 ? 1 : -1;
  return swapped ? ((-base) as 1 | -1) : base;
}

/** y of the goal line `side` is shooting at. */
export function attackGoalY(side: Side, swapped: boolean): number {
  return attackDir(side, swapped) === 1 ? PITCH_L : 0;
}

/** y of the goal line `side` is defending. */
export function ownGoalY(side: Side, swapped: boolean): number {
  return attackDir(side, swapped) === 1 ? 0 : PITCH_L;
}

/** True when a lateral coordinate lies between the posts. */
export function inGoalMouth(x: number): boolean {
  return x > GOAL_LEFT && x < GOAL_RIGHT;
}

/** True when a point is inside the penalty area belonging to `goalY`. */
export function inPenaltyBox(x: number, y: number, goalY: number): boolean {
  return Math.abs(x - CENTRE_X) <= BOX_HALF && Math.abs(y - goalY) <= BOX_DEPTH;
}

/** True when a point is inside the six-yard box belonging to `goalY`. */
export function inSixYardBox(x: number, y: number, goalY: number): boolean {
  return Math.abs(x - CENTRE_X) <= SIX_HALF && Math.abs(y - goalY) <= SIX_DEPTH;
}

/** True when the ball has fully left the field of play. */
export function outOfPlay(x: number, y: number): boolean {
  return x < 0 || x > PITCH_W || y < 0 || y > PITCH_L;
}

export type Role = 'keeper' | 'defender' | 'midfielder' | 'forward';

/** 2-3-1 in front of the keeper, seven a side. */
export const ROLES: readonly Role[] = [
  'keeper',
  'defender',
  'defender',
  'midfielder',
  'midfielder',
  'midfielder',
  'forward'
];

/**
 * Formation anchors for a team defending y = 0 (attacking increasing y).
 * Mirrored through the halfway line for the other direction.
 */
const BASE_ANCHORS: ReadonlyArray<readonly [number, number]> = [
  [CENTRE_X, 18],
  [112, 92],
  [228, 92],
  [76, 196],
  [CENTRE_X, 178],
  [264, 196],
  [CENTRE_X, 296]
];

/** How far a team's block slides with the ball, per 2.3. */
const DRIFT_LONG = 0.35;
const DRIFT_LAT = 0.25;

/**
 * Where player `idx` of `side` wants to stand given the ball. The whole team
 * shifts as a block so it advances and retreats together; the keeper's anchor
 * is only a fallback, since keeper.ts owns his real positioning.
 */
export function anchorFor(
  side: Side,
  idx: number,
  ballX: number,
  ballY: number,
  swapped: boolean
): Point {
  const dir = attackDir(side, swapped);
  const [bx, by] = BASE_ANCHORS[idx];
  const baseY = dir === 1 ? by : PITCH_L - by;
  if (idx === 0) {
    const goalY = ownGoalY(side, swapped);
    return {
      x: clamp(ballX, GOAL_LEFT + 6, GOAL_RIGHT - 6),
      y: goalY + dir * 18
    };
  }
  const shiftY = (ballY - CENTRE_Y) * DRIFT_LONG;
  const shiftX = (ballX - CENTRE_X) * DRIFT_LAT;
  return {
    x: clamp(bx + shiftX, 10, PITCH_W - 10),
    y: clamp(baseY + shiftY, 12, PITCH_L - 12)
  };
}

export interface Camera {
  x: number;
  y: number;
}

/** Lookahead applied to the ball's velocity, and its cap in pixels. */
const LOOKAHEAD = 0.28;
const LOOKAHEAD_MAX = 40;
/** Half-extents of the 28x24 deadzone. */
const DEADZONE_X = 14;
const DEADZONE_Y = 12;
const CAMERA_LERP = 9;

export const CAMERA_MIN_X = -CAMERA_MARGIN;
export const CAMERA_MAX_X = PITCH_W + CAMERA_MARGIN - VIEW_W;
export const CAMERA_MIN_Y = -CAMERA_MARGIN;
export const CAMERA_MAX_Y = PITCH_L + CAMERA_MARGIN - VIEW_H;

/**
 * Next camera top-left, following the ball with lookahead through a deadzone.
 * The result is rounded to whole framebuffer pixels because a sub-pixel scroll
 * makes the dithered turf shimmer.
 */
export function cameraFor(
  prev: Camera,
  ball: { x: number; y: number; vx: number; vy: number },
  dt: number
): Camera {
  let lx = ball.vx * LOOKAHEAD;
  let ly = ball.vy * LOOKAHEAD;
  const len = Math.hypot(lx, ly);
  if (len > LOOKAHEAD_MAX) {
    lx = (lx / len) * LOOKAHEAD_MAX;
    ly = (ly / len) * LOOKAHEAD_MAX;
  }
  const wantX = ball.x + lx;
  const wantY = ball.y + ly;
  const curX = prev.x + VIEW_W / 2;
  const curY = prev.y + VIEW_H / 2;

  let aimX = curX;
  const dx = wantX - curX;
  if (dx > DEADZONE_X) aimX = wantX - DEADZONE_X;
  else if (dx < -DEADZONE_X) aimX = wantX + DEADZONE_X;

  let aimY = curY;
  const dy = wantY - curY;
  if (dy > DEADZONE_Y) aimY = wantY - DEADZONE_Y;
  else if (dy < -DEADZONE_Y) aimY = wantY + DEADZONE_Y;

  const k = 1 - Math.exp(-CAMERA_LERP * dt);
  const cx = curX + (aimX - curX) * k;
  const cy = curY + (aimY - curY) * k;
  return {
    x: Math.round(clamp(cx - VIEW_W / 2, CAMERA_MIN_X, CAMERA_MAX_X)),
    y: Math.round(clamp(cy - VIEW_H / 2, CAMERA_MIN_Y, CAMERA_MAX_Y))
  };
}

/** Straight-line distance, used everywhere in the simulation. */
export function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(bx - ax, by - ay);
}
