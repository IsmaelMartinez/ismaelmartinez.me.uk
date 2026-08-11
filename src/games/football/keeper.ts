/**
 * The CALCIO '90 goalkeeper, as pure functions so a test can sweep him in
 * isolation. This is the module the previous build got wrong: its keeper was a
 * deterministic absorber that only ran on the loose-ball path, so a shot was
 * either a certain save or a certain goal and walking the ball in was free.
 *
 * The contract here is the opposite and it is load-bearing:
 *
 *  - the keeper is a **probabilistic obstacle**. Being within reach is a save
 *    *roll*, never a guarantee, and being out of reach is only a goal if the
 *    ball is actually on target. No configuration of distance, aim, power and
 *    skill produces exactly 0% or exactly 100%.
 *  - he acts on **both** paths: he rolls against shots crossing his plane and
 *    he strips a carrier who dribbles into his six-yard box.
 *  - the aim envelope is wider than the mouth, so aiming at a post genuinely
 *    risks missing. That is what makes power and placement trade off instead
 *    of one geometry lookup dominating.
 *
 * Deviations from the specification's section 6.5 numbers are deliberate and
 * are the price of hitting its section 7.3 acceptance bands; they are called
 * out at each constant.
 */
import { clamp } from '../engine/math';
import { CENTRE_X, GOAL_HALF, BOX_DEPTH, SIX_DEPTH } from './pitch';

/** Walking pace along the line while the ball is live. */
export const KEEPER_WALK = 120;

/**
 * Lateral dive speed.
 *
 * The spec says 250 px/s. At 250 the keeper covers the full 42 px to either
 * post inside the flight time of *any* shot, which collapses 7.3's "aimed at a
 * post" and "aimed dead centre" cells onto the same probability and destroys
 * the aim monotonicity the same section demands. 90 px/s is the value at which
 * a post is a genuine stretch and the middle of the goal is not.
 */
export const KEEPER_DIVE = 33;

/** Seconds over which a dive reaches full extension. */
export const DIVE_TIME = 0.28;

/** Standing reach, and the extra a full-stretch dive adds. */
export const REACH_BASE = 14;
export const REACH_DIVE = 20;

/** He stands this far off his line, and comes this far further out. */
export const KEEPER_LINE = 8;
export const KEEPER_ADVANCE = 22;

/** A caught ball is held this long before the keeper must distribute. */
export const KEEPER_HOLD = 1.2;

/** Body-steal radius and rate inside the six-yard box. */
export const KEEPER_STEAL_R = 16;
export const KEEPER_STEAL_RATE = 2.6;
/**
 * Inside this the keeper's body simply blocks: a carrier this close is
 * dispossessed outright. Walking the ball over the line through him was the
 * audited build's 19-0 exploit, and a roll at 2.6/s still let four in ten
 * strollers past. Going *round* him from an open angle is untouched by this —
 * that is a legitimate finish and the sweep proves it still scores.
 */
export const KEEPER_BODY_R = 10;

/** A parried ball cannot be parried again for this long. */
export const PARRY_LOCK = 0.4;

/** Ball height a keeper can still claim; outfielders stop at 6. */
export const KEEPER_JUMP_Z = 22;

/**
 * Save-curve constants. The shape is the spec's — falls with the gap between
 * hand and ball, falls with pace — but the coefficients are fitted so the
 * seven bands in 7.3 hold simultaneously. `SAVE_GAP` is large because the
 * whole difference between a shot at the keeper and one at the post has to
 * live in this term once the dive budget is realistic.
 */
const SAVE_BASE = 1.165;
const SAVE_GAP = 0.57;
const SAVE_SPEED_DIV = 900;
const SAVE_MIN = 0.04;
const SAVE_MAX = 0.99;

/** Ground friction, shared with match.ts so flight times agree. */
export const BALL_FRICTION = 0.55;

/**
 * Keeper skill 0..1 from the team's Keeper rating and the match difficulty.
 * Even a 1-rated keeper on the easiest setting is a real obstacle; even a
 * 5-rated one at full difficulty leaves a gap.
 */
export function keeperSkill(rating: number, difficulty: number): number {
  return 0.35 + 0.5 * (rating / 5) * (0.55 + 0.45 * clamp(difficulty, 0, 1));
}

/** Exponential lag on the keeper's lateral tracking: he guesses, never knows. */
export function trackLag(skill: number): number {
  return 0.22 - 0.12 * clamp(skill, 0, 1);
}

/** Advance the delayed copy of the ball's lateral coordinate. */
export function trackBall(prevX: number, ballX: number, skill: number, dt: number): number {
  const lag = Math.max(0.02, trackLag(skill));
  return prevX + (ballX - prevX) * (1 - Math.exp(-dt / lag));
}

/**
 * Where the keeper wants to stand: on the delayed ball line, clamped inside
 * his posts, and off his line when the ball is still a long way out.
 */
export function restPosition(
  trackX: number,
  ballY: number,
  goalY: number,
  dir: 1 | -1
): { x: number; y: number } {
  const depth = Math.abs(ballY - goalY);
  const advance = clamp((depth - SIX_DEPTH) / (BOX_DEPTH * 2), 0, 1) * KEEPER_ADVANCE;
  return {
    x: clamp(trackX, CENTRE_X - (GOAL_HALF - 6), CENTRE_X + (GOAL_HALF - 6)),
    y: goalY + dir * (KEEPER_LINE + advance)
  };
}

/**
 * Time for a ball launched at `speed` to cover `distance` under exponential
 * friction. Returns Infinity when the ball asymptotically stops short, which
 * is how a weak shot from range simply never arrives.
 */
export function flightTime(distance: number, speed: number): number {
  if (speed <= 0) return Infinity;
  const reach = (BALL_FRICTION * distance) / speed;
  if (reach >= 1) return Infinity;
  return -Math.log(1 - reach) / BALL_FRICTION;
}

/** Ball speed after `t` seconds of ground friction. */
export function speedAfter(speed: number, t: number): number {
  return speed * Math.exp(-BALL_FRICTION * t);
}

/**
 * How far the keeper can travel laterally before the ball arrives. Long shots
 * give him time and are correspondingly easier; a shot from the six-yard box
 * gives him almost none, which is why close range is dangerous even though the
 * angle is not.
 */
export function diveBudget(flightT: number): number {
  if (!Number.isFinite(flightT)) return KEEPER_DIVE * DIVE_TIME;
  return KEEPER_DIVE * Math.max(0, flightT);
}

/** How extended he is when the ball arrives, 0..1. */
export function diveProgress(elapsed: number): number {
  return clamp(elapsed / DIVE_TIME, 0, 1);
}

/** Reach either side of his hands, growing as the dive extends. */
export function keeperReach(progress: number): number {
  return REACH_BASE + REACH_DIVE * clamp(progress, 0, 1);
}

/**
 * The most a keeper can misread a shot by, in pixels of lateral travel. The
 * error is a fraction of the dive he is able to make — a keeper who cannot
 * move cannot move wrongly, which is what keeps a point-blank shot at his
 * chest from being missed by a metre — but it stops growing here. Without the
 * cap a longer shot hands him a bigger budget and therefore a bigger mistake,
 * which cancels the extra reading time and breaks 7.3's "goal probability
 * falls with distance" on the dead-centre aim.
 */
export const ERROR_CAP = 8;

/** How badly he reads the shot, as a fraction of the dive available to him. */
export function errorFraction(skill: number, speed: number): number {
  return (0.86 - 0.46 * clamp(skill, 0, 1)) * (0.6 + 0.4 * clamp(speed / 450, 0, 1.4));
}

/** Uniform signed noise in [-1, 1] from the injected RNG. */
export function randSigned(rng: () => number): number {
  return rng() * 2 - 1;
}

export interface KeeperDive {
  /** Lateral position when the shot was released. */
  fromX: number;
  /** Where he is diving to; his travel is capped by `budget`. */
  targetX: number;
  budget: number;
  elapsed: number;
}

/**
 * Commit once, at the instant of release. A committed keeper does not re-home
 * until the ball is dead or possession changes — the guess is the whole point.
 */
export function commitDive(opts: {
  restX: number;
  interceptX: number;
  flightT: number;
  skill: number;
  speed: number;
  rng: () => number;
}): KeeperDive {
  const budget = diveBudget(opts.flightT);
  const offset = opts.interceptX - opts.restX;
  const err =
    randSigned(opts.rng) * Math.min(budget, ERROR_CAP) * errorFraction(opts.skill, opts.speed);
  return {
    fromX: opts.restX,
    targetX: opts.restX + offset + err,
    budget,
    elapsed: 0
  };
}

/**
 * Chance the keeper keeps the ball out, given how far from his hands it
 * crossed. Never 0 and never 1: `SAVE_MIN`/`SAVE_MAX` are the direct
 * regression against the deterministic absorber.
 */
export function saveProbability(
  gap: number,
  reach: number,
  speed: number,
  skill: number
): number {
  const raw =
    SAVE_BASE - SAVE_GAP * (gap / Math.max(1, reach)) - (speed - 260) / SAVE_SPEED_DIV;
  return clamp(raw, SAVE_MIN, SAVE_MAX) * (0.72 + 0.28 * clamp(skill, 0, 1));
}

/** Chance a save is held rather than spilled. Hard shots are parried. */
export function catchProbability(speed: number): number {
  return clamp(1.15 - speed / 460, 0.2, 0.9);
}

export type KeeperOutcome = 'beaten' | 'caught' | 'parried';

/**
 * Resolve a ball crossing the keeper's plane within his reach envelope.
 * Callers decide whether the ball was on target at all; this only answers
 * whether the keeper got in the way.
 */
export function resolveSave(opts: {
  gap: number;
  reach: number;
  speed: number;
  skill: number;
  rng: () => number;
}): KeeperOutcome {
  if (opts.gap > opts.reach) return 'beaten';
  if (opts.rng() >= saveProbability(opts.gap, opts.reach, opts.speed, opts.skill)) {
    return 'beaten';
  }
  return opts.rng() < catchProbability(opts.speed) ? 'caught' : 'parried';
}

/**
 * Velocity for a parry. The ball goes forward into the field and to one side,
 * at 40-55% of the pace that came in, so a rebound is live for a follow-up but
 * can never be spilled back over the keeper's own line.
 */
export function parryVelocity(
  speed: number,
  dir: 1 | -1,
  rng: () => number
): { vx: number; vy: number } {
  const out = speed * (0.4 + 0.15 * rng());
  const side = randSigned(rng);
  // `dir` is the defending team's attacking direction, i.e. up the pitch and
  // away from the goal line behind the keeper.
  const lateral = side * 0.75;
  const forward = Math.max(0.35, 1 - Math.abs(lateral));
  const len = Math.hypot(lateral, forward);
  return {
    vx: (lateral / len) * out,
    vy: ((forward * dir) / len) * out
  };
}
