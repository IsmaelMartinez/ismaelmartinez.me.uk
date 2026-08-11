/**
 * Pitch geometry for CALCIO '90. The simulation lives entirely in pitch
 * coordinates: (0,0) is the top-left corner flag, x runs goal to goal.
 * game.ts offsets these into canvas space when drawing.
 */

export const PITCH_W = 560;
export const PITCH_H = 360;

/** Half-height of the goal mouth. */
export const GOAL_HALF = 40;
export const GOAL_TOP = PITCH_H / 2 - GOAL_HALF;
export const GOAL_BOTTOM = PITCH_H / 2 + GOAL_HALF;

/** Penalty box: depth from the goal line and half-width around the centre. */
export const BOX_DEPTH = 70;
export const BOX_HALF = 92;

/** 0 plays left→right (attacks the right goal); 1 plays right→left. */
export type Side = 0 | 1;

/** Centre of the goal `side` is attacking. */
export function attackGoalX(side: Side): number {
  return side === 0 ? PITCH_W : 0;
}

/** Centre of the goal `side` is defending. */
export function ownGoalX(side: Side): number {
  return side === 0 ? 0 : PITCH_W;
}

/** True when a y coordinate lies inside the goal mouth. */
export function inGoalMouth(y: number): boolean {
  return y > GOAL_TOP && y < GOAL_BOTTOM;
}

/**
 * Formation anchors for the left-attacking team, mirrored for the right one:
 * keeper, defender, two mids, forward. Index 0 is always the keeper.
 */
const BASE_ANCHORS: ReadonlyArray<readonly [number, number]> = [
  [12, PITCH_H / 2],
  [95, PITCH_H / 2],
  [210, PITCH_H * 0.28],
  [210, PITCH_H * 0.72],
  [330, PITCH_H / 2]
];

export const TEAM_SIZE = BASE_ANCHORS.length;

/**
 * Where player `idx` of `side` wants to stand given the ball. Outfield
 * anchors drift with play so the team attacks and retreats as a block; the
 * keeper only tracks the ball across the goal mouth.
 */
export function anchorFor(
  side: Side,
  idx: number,
  ballX: number,
  ballY: number
): { x: number; y: number } {
  const [bx, by] = BASE_ANCHORS[idx];
  const mx = side === 0 ? bx : PITCH_W - bx;
  if (idx === 0) {
    return {
      x: mx,
      y: Math.min(GOAL_BOTTOM - 8, Math.max(GOAL_TOP + 8, ballY))
    };
  }
  const shiftX = (ballX - PITCH_W / 2) * 0.35;
  const shiftY = (ballY - PITCH_H / 2) * 0.25;
  return {
    x: Math.min(PITCH_W - 10, Math.max(10, mx + shiftX)),
    y: Math.min(PITCH_H - 10, Math.max(10, by + shiftY))
  };
}
