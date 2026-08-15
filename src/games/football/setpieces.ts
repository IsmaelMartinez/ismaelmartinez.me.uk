/**
 * The only three stoppages CALCIO '90 has: throw-in, corner kick, goal kick.
 * There are no fouls, no free kicks, no offside and no referee entity, so this
 * module is purely "the ball left the field, who restarts and from where".
 *
 * The perspective set-piece screens of the original are cut: all three resolve
 * inside the normal top-down view behind a banner word and a short protected
 * restart, because unskippable cutaways every twenty seconds would wreck a
 * sixty-second match.
 */
import { clamp } from '../engine/math';
import {
  PITCH_W,
  PITCH_L,
  CENTRE_X,
  GOAL_HALF,
  SIX_DEPTH,
  CORNER_R,
  attackDir,
  ownGoalY,
  type Side
} from './pitch';

export type RestartKind = 'throwIn' | 'corner' | 'goalKick';

/** The ball is untacklable this long after a restart is placed. */
export const THROW_PROTECT = 1.5;
/** A thrower must release inside this, or it goes automatically. */
export const THROW_DEADLINE = 3;
/** A keeper idling on a goal kick clears automatically after this. */
export const GOAL_KICK_DEADLINE = 2.5;
/** Seconds the banner holds while the taker is placed; the clock is paused. */
export const RESTART_PAUSE = 0.5;

/** Speed of an automatic release, whichever restart ran out of patience. */
export const AUTO_THROW_SPEED = 165;
export const AUTO_THROW_LIFT = 190;
export const GOAL_KICK_SPEED = 235;
export const GOAL_KICK_LIFT = 230;

export interface RestartSpec {
  kind: RestartKind;
  /** The side awarded the restart. */
  side: Side;
  /** Where the ball is placed. */
  x: number;
  y: number;
  /** True when the taker must be the keeper (goal kicks only). */
  keeperTakes: boolean;
  /** Seconds before the taker releases automatically. */
  deadline: number;
}

/**
 * Which restart a ball leaving the field earns, or null while it is still in
 * play. `lastTouch` is the side that touched it last, so a throw goes the
 * other way and a goal line is a corner or a goal kick depending on who put it
 * out. Goals are detected before this is ever consulted.
 */
export function boundaryRestart(
  ballX: number,
  ballY: number,
  lastTouch: Side,
  swapped: boolean
): RestartSpec | null {
  const other = (1 - lastTouch) as Side;
  if (ballX < 0 || ballX > PITCH_W) {
    return {
      kind: 'throwIn',
      side: other,
      x: ballX < 0 ? 0 : PITCH_W,
      y: clamp(ballY, 4, PITCH_L - 4),
      keeperTakes: false,
      deadline: THROW_DEADLINE
    };
  }
  if (ballY >= 0 && ballY <= PITCH_L) return null;

  const line = ballY < 0 ? 0 : PITCH_L;
  // Whoever defends this line concedes a corner if they put it out themselves.
  const defending: Side = ownGoalY(0, swapped) === line ? 0 : 1;
  if (lastTouch === defending) {
    const dir = attackDir(defending, swapped);
    return {
      kind: 'corner',
      side: other,
      x: ballX < CENTRE_X ? CORNER_R / 2 : PITCH_W - CORNER_R / 2,
      y: line + dir * (CORNER_R / 2),
      keeperTakes: false,
      deadline: THROW_DEADLINE
    };
  }
  const dir = attackDir(defending, swapped);
  return {
    kind: 'goalKick',
    side: defending,
    x: clamp(ballX, CENTRE_X - GOAL_HALF, CENTRE_X + GOAL_HALF),
    y: line + dir * (SIX_DEPTH - 4),
    keeperTakes: true,
    deadline: GOAL_KICK_DEADLINE
  };
}

export interface CornerMarker {
  x: number;
  y: number;
}

/**
 * The three landing markers a held cross picks between: near post, centre, far
 * post. The manual's "coordinating numbers 1-5" is reduced to three because
 * five do not read at this zoom.
 */
export function cornerMarkers(goalY: number, cornerX: number, swapped: boolean, side: Side): CornerMarker[] {
  const dir = attackDir(side, swapped);
  const near = cornerX < CENTRE_X ? CENTRE_X - GOAL_HALF * 0.6 : CENTRE_X + GOAL_HALF * 0.6;
  const far = cornerX < CENTRE_X ? CENTRE_X + GOAL_HALF * 0.9 : CENTRE_X - GOAL_HALF * 0.9;
  return [
    { x: near, y: goalY - dir * 18 },
    { x: CENTRE_X, y: goalY - dir * 30 },
    { x: far, y: goalY - dir * 42 }
  ];
}

/**
 * A goal kick with a neutral stick goes straight up the middle, faithful to
 * the manual. Any held direction wins instead.
 */
export function goalKickAim(stickX: number, stickY: number, dir: 1 | -1): { x: number; y: number } {
  const len = Math.hypot(stickX, stickY);
  if (len < 0.2) return { x: 0, y: dir };
  return { x: stickX / len, y: stickY / len };
}

/** True while a restart taker still cannot be tackled. */
export function isProtected(elapsed: number): boolean {
  return elapsed < THROW_PROTECT;
}

/** A throw-in is always lofted and can never score directly. */
export function throwCannotScore(kind: RestartKind): boolean {
  return kind === 'throwIn';
}

/** The near touchline a ball at `x` went out over, for placing the taker. */
export function touchlineFor(x: number): number {
  return x < CENTRE_X ? 0 : PITCH_W;
}
