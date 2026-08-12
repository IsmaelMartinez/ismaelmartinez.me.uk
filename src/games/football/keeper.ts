/**
 * The CALCIO '90 goalkeeper, as pure functions so a test can sweep him in
 * isolation. This is the module the previous build got wrong: its keeper was a
 * deterministic absorber that only ran on the loose-ball path, so a shot was
 * either a certain save or a certain goal and walking the ball in was free.
 *
 * The contract here is the opposite and it is load-bearing:
 *
 *  - the keeper is a **probabilistic obstacle**. Being within reach is a save
 *    *roll*, never a guarantee, and being out of reach is a fingertip chance,
 *    not a formality: `reach` scales the curve, it does not terminate it. No
 *    configuration of distance, aim, power and skill produces exactly 0% or
 *    exactly 100%.
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
import { CENTRE_X, GOAL_HALF, PITCH_L, SIX_DEPTH } from './pitch';

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
export const KEEPER_DIVE = 26;

/** Seconds over which a dive reaches full extension. */
export const DIVE_TIME = 0.28;

/**
 * The longest window a dive can travel for. A dive is a single committed act,
 * not an indefinite slide along the line: without this cap a shot from 240 px
 * hands the keeper twice the lateral budget of one from 140 px purely because
 * it takes longer to arrive, and long-range placement becomes *harder* than
 * close-range placement. Capping the window is what keeps 7.3's "falls with
 * distance" true at the post as well as through the middle.
 */
export const DIVE_WINDOW = 0.45;

/** Standing reach, and the extra a full-stretch dive adds. */
export const REACH_BASE = 26;
export const REACH_DIVE = 10;

/**
 * He stands this far off his line, and comes this far further out *as the ball
 * comes to him*. The direction of that second term is load-bearing and the
 * previous build had it backwards: a keeper advances to narrow the shooting
 * angle when a striker is on top of him and retreats to his line when the ball
 * is out at the halfway line. Coming out is also the only honest answer to
 * "why is a shot from six yards not a certain goal" — the ball crosses his
 * plane before it has spread far from the striker's foot, so his standing
 * reach covers a shot that would beat him comfortably from range.
 */
export const KEEPER_LINE = 8;
export const KEEPER_ADVANCE = 12;
/** How far behind the ball he always stays; he narrows angles, never dives past it. */
export const KEEPER_STANDOFF = 20;
/**
 * Over what depth his advance fades back to his line. It is a whole half of
 * the pitch rather than the width of the box, and that is what keeps 7.3's
 * "falls with distance" honest: the angle he cuts off is a fraction of the way
 * from the striker to the goal, so a *sharp* fade makes a shot from forty
 * pixels harder than one from eighty and inverts the distance response. A slow
 * fade leaves pace and dive time — the two effects that should carry it — in
 * charge of how distance is felt.
 */
const ADVANCE_FADE = PITCH_L / 2;

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
 * Save-curve constants.
 *
 * The shape is the spec's in spirit — it falls with the gap between hand and
 * ball and falls with pace — but it is a **logistic in `gap / reach` with no
 * cliff at `gap = reach`**, and that is the fix for the audit's exactly-100 %
 * cell. The previous curve was linear inside the reach envelope and hard-cut
 * outside it, so any shot the keeper could not physically get to was a
 * certainty, and 7.3's "no cell may be exactly 0 % or exactly 100 %" was
 * violated in the direction opposite to the original absorber bug.
 *
 * Now the reach envelope is where the curve passes through a half chance
 * rather than where it stops, and a shot well past his hands still runs into
 * `SAVE_FLOOR`: a trailing hand, a boot, a deflection off his body. It is
 * small enough to be a footnote in play and large enough that no cell in the
 * sweep is ever a certainty.
 */
const SAVE_SHARP = 3.2;
const SAVE_CEIL = 1.05;
const SAVE_PACE_DIV = 760;
/**
 * The desperation chance a beaten keeper still has while the ball is inside
 * his frame. Callers pass 0 for a ball that is going wide anyway — he is not
 * credited with saving shots that were missing the goal.
 */
export const SAVE_FLOOR = 0.02;
const SAVE_MAX = 0.985;
/**
 * How much of the save curve the keeper's own skill is worth. The spec's
 * 0.72 + 0.28 x skill left a five-rated keeper at full difficulty only 7 %
 * better than a one-rated keeper on the easiest setting — with the dive budget
 * as small as it has to be for aim placement to matter, skill has almost
 * nothing else to act through, so the run's curve could not be felt in front
 * of goal at all. The span is widened and the floor set so a middling keeper
 * sits on 1.0, which is the curve 7.3's bands are fitted to.
 */
const SKILL_FLOOR = 0.6;
const SKILL_SPAN = 0.89;

/** Ground friction, shared with match.ts so flight times agree. */
export const BALL_FRICTION = 0.55;

/**
 * Keeper skill 0..1 from the team's Keeper rating and the match difficulty.
 * Even a 1-rated keeper on the easiest setting is a real obstacle; even a
 * 5-rated one at full difficulty leaves a gap.
 *
 * The difficulty term is far wider than the specification's 0.55 + 0.45 x d
 * and wider again than this module's first attempt at it. The keeper is where
 * most of 7.2's difficulty curve has to live — the speed ledger forbids buying
 * the CPU pace, and its passing and pressing move goals *against* rather than
 * goals *for* — so a group-stage keeper and a final keeper have to be visibly
 * different men. The slope is pinned so that d = 0.55, the difficulty 7.3's
 * isolation rig sweeps at, lands on exactly the same skill as before: the
 * shot-model bands and the ladder can then be read independently of one
 * another.
 */
export function keeperSkill(rating: number, difficulty: number): number {
  return 0.3 + 0.5 * (rating / 5) * (0.133 + 0.667 * clamp(difficulty, 0, 1));
}

/**
 * Exponential lag on the keeper's lateral tracking: he guesses, never knows.
 *
 * Longer than the specification's 0.22 - 0.12 x skill, and deliberately so.
 * This lag is the only channel through which *moving the ball* is rewarded in
 * front of goal: a side that switches play, crosses, or lays the ball off
 * across the face leaves the keeper trailing the ball by a real distance, and
 * a player who simply runs at the goal and strikes finds him already there.
 * At the specification's value the trail was four or five pixels and passing
 * bought nothing a straight run did not.
 */
export function trackLag(skill: number): number {
  return 0.44 - 0.2 * clamp(skill, 0, 1);
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
  // Out as the ball comes in, back on his line as it goes away, and never in
  // front of the ball: he narrows the angle, he does not leave the goal open
  // behind him.
  const near = 1 - clamp((depth - SIX_DEPTH) / ADVANCE_FADE, 0, 1);
  const advance = Math.min(
    KEEPER_ADVANCE * near,
    Math.max(0, depth - KEEPER_LINE - KEEPER_STANDOFF)
  );
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
  return KEEPER_DIVE * clamp(flightT, 0, DIVE_WINDOW);
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
  skill: number,
  floor: number = SAVE_FLOOR
): number {
  // Half a chance exactly at full stretch, and a smooth fall either side of
  // it. There is no cliff: `reach` is a scale, not a wall.
  const q = gap / Math.max(1, reach);
  const shape = 1 / (1 + Math.exp(SAVE_SHARP * (q - 1)));
  const ceiling =
    (SAVE_CEIL - (speed - 260) / SAVE_PACE_DIV) * (SKILL_FLOOR + SKILL_SPAN * clamp(skill, 0, 1));
  return clamp(ceiling * shape, floor, SAVE_MAX);
}

/** Chance a save is held rather than spilled. Hard shots are parried. */
export function catchProbability(speed: number): number {
  // Flatter than the specification's 1.15 - speed / 460, which parried three
  // saves in four at the speeds real shots actually arrive at and left the
  // catch share under 7.3's 45-70 % band.
  return clamp(1.25 - speed / 490, 0.2, 0.9);
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
  /**
   * Floor under the save chance. `SAVE_FLOOR` for a ball inside the frame,
   * which is what stops any cell of the sweep being a certain goal; 0 for one
   * that is missing anyway, so he is never credited with a save on a shot
   * flying past the post.
   */
  floor?: number;
}): KeeperOutcome {
  // No `gap > reach` short circuit. That early return was the audit's
  // exactly-100 % cell: it fired before any roll, so every shot he could not
  // physically reach was a certainty rather than a probability.
  const p = saveProbability(opts.gap, opts.reach, opts.speed, opts.skill, opts.floor ?? SAVE_FLOOR);
  if (opts.rng() >= p) return 'beaten';
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
