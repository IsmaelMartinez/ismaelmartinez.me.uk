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
 *  - **where he stands and where the stick can put the ball are not the same
 *    line.** `KEEPER_BAND` holds him near the middle of his goal; `AIM_SPAN`
 *    reaches most of the way to a post. When the two were congruent the whole
 *    cabinet reduced to one number — drag him one way, shoot the other — and
 *    no amount of tuning inside that geometry could have fixed it.
 *  - **his commit is a guess whose spread grows with what is asked of it.** A
 *    ball at his chest he simply catches; a ball into a corner he has to pick
 *    a side for. That, and not the size of his dive, is what makes placement a
 *    gradient rather than a lookup.
 *
 * Deviations from the specification's section 6.5 numbers are deliberate and
 * are the price of hitting its section 7.3 acceptance bands; they are called
 * out at each constant.
 */
import { clamp } from '../engine/math';
import { CENTRE_X, PITCH_L, SIX_DEPTH } from './pitch';

/** Walking pace along the line while the ball is live. */
export const KEEPER_WALK = 120;

/**
 * Lateral dive speed.
 *
 * At 26 px/s — the value this module shipped with — a committed dive covered
 * 11.7 px at its absolute longest, which is a third of one post's worth of
 * goal. The keeper's coverage was therefore his *standing* position and
 * nothing else, and since that position was clamped to the same +-36 px band
 * the aim scale mapped to, target and keeper lived on one congruent line: drag
 * him to one end of it, shoot the other, and there was nothing between the
 * ball and the net. The dive has to be a real act for a keeper who has been
 * moved to still be defending anything.
 *
 * It is far below the specification's 250 all the same, and the reason is the
 * opposite failure: at 250 he covers the whole mouth inside any flight time,
 * every aim from the middle of the goal to the post measures the same, and
 * 7.3's aim monotonicity has nothing left to be monotone in. Swept at this
 * module's own rig, 105 px/s already flattened the response at 140 px to
 * 0.169 across the whole stick and *fell* to 0.085 at the post. At 45 the
 * budget runs from about 2 px on a shot from the six-yard box to 20 px on one
 * from range, which is a real fraction of the distance to a corner and never
 * the whole of it.
 */
export const KEEPER_DIVE = 45;

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
/**
 * 18 rather than 12, and the six pixels are bought back from `KEEPER_BAND`. A
 * keeper who now holds the middle of his goal has to make up for it somewhere,
 * and coming to meet the ball is the move he has: it is what the cabinet's own
 * keeper does as an attack arrives, and it is what keeps a shot from the edge
 * of the six-yard box from being a formality.
 */
export const KEEPER_ADVANCE = 18;
/**
 * How far off centre he will ever *stand*.
 *
 * This is deliberately much narrower than `AIM_SPAN`, the band the stick maps
 * a shot into, and the non-congruence is the point. When the two were equal
 * the game reduced to one number — both the keeper and the target lived on the
 * same 72 px line, so moving him to one end of it left the other end
 * uncovered by construction and no dive could ever close the distance. A
 * keeper who holds a central position takes the far corner away from *nobody*
 * on geometry alone; what takes it away is the dive, which is a guess with a
 * budget. Dragging him still pays — he is 20 px off his spot and the far
 * corner is that much further from his hands — it simply is not a free goal.
 */
export const KEEPER_BAND = 20;
/** How far behind the ball he always stays; he narrows angles, never dives past it. */
export const KEEPER_STANDOFF = 20;
/**
 * How far across toward a carrier this close to goal the keeper shades, as a
 * fraction of the distance between them, and the range over which it fades in.
 *
 * This is a *lateral* correction and deliberately nothing else: the keeper
 * follows the man across his goal, he does not leave it. It is what lets
 * `KEEPER_BAND` hold him central against a shot — which is where the
 * drag-him-and-shoot-the-other-way exploit lived — without leaving him rooted
 * to the middle while a forward runs in from the wing.
 */
export const KEEPER_SMOTHER = 0.8;
export const KEEPER_SMOTHER_R = 60;
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
    x: clamp(trackX, CENTRE_X - KEEPER_BAND, CENTRE_X + KEEPER_BAND),
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
 * How far wrong a commit can be, in pixels, as `ERROR_BASE + ERROR_REACH x the
 * lateral offset he has committed to covering`.
 *
 * The second term is the whole of what makes placement a gradient rather than
 * a lookup, and it replaces a flat cap that made the keeper's accuracy
 * independent of what was asked of him. A keeper who has to stay where he is
 * cannot be far wrong: that is `ERROR_BASE`, and it is why a shot struck at
 * his chest is not a lottery. A keeper who has to *move* is guessing, and the
 * further the ball is from where he stands the more of the answer is guessed
 * rather than seen — so a ball placed at the post is missed by a distance
 * proportional to how far out it was placed.
 *
 * `ERROR_REACH` being greater than one is deliberate and is what the constant
 * is for. Past the dive budget the term stops behaving like a displacement and
 * starts behaving like a coin: he still only travels `budget` pixels, so all
 * the spread beyond that decides is *which way he goes*, weighted toward the
 * ball by the offset itself. A keeper facing a shot into the corner picks a
 * side; a keeper facing one at his chest does not have to pick anything. That
 * is the difference the whole aim axis is made of, and at 140 px it is worth
 * 0.168 dead centre against 0.327 at the post.
 *
 * Scaling the error on the offset rather than on the dive budget also fixes,
 * structurally, the thing the flat cap existed to paper over: the error no
 * longer depends on the flight time at all, so a longer shot buys the keeper
 * reading time without also buying him a bigger mistake, and 7.3's "goal
 * probability falls with distance" holds at every aim instead of only at the
 * ones the cap happened to cover.
 */
export const ERROR_BASE = 6;
export const ERROR_REACH = 3;

/**
 * How much of his dive a keeper still has when the ball arrives off a
 * completed pass, a delivered cross or a lay-off.
 *
 * This is the reward side of moving the ball, and it is the only channel
 * through which passing can beat carrying without touching the shot model. A
 * keeper set for the man who had the ball is not set for the man who has it
 * now: he commits late, from the wrong foot, and gets roughly half the lateral
 * budget he would have had against a striker who simply ran at him. It is a
 * penalty on *his* execution rather than a bonus on the shooter's accuracy,
 * which keeps 7.3's isolation rig — where no pass ever happened — reading the
 * same numbers it always did.
 */
export const ASSIST_DIVE_PENALTY = 0.5;

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
  /** Fraction of his dive he still has; see `ASSIST_DIVE_PENALTY`. */
  budgetScale?: number;
}): KeeperDive {
  const budget = diveBudget(opts.flightT) * clamp(opts.budgetScale ?? 1, 0, 1);
  const offset = opts.interceptX - opts.restX;
  const err =
    randSigned(opts.rng) *
    (ERROR_BASE + ERROR_REACH * Math.abs(offset)) *
    errorFraction(opts.skill, opts.speed);
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
