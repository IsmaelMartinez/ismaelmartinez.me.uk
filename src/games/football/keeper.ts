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
 *  - **he stands on the angle, not on the ball.** `narrowAngleX` puts him on
 *    the bisector of the angle the goal mouth subtends from the ball, which is
 *    what a keeper does and what decides how much goal there is to shoot at.
 *    Tracking the ball's lateral coordinate instead — which is what 6.5 asks
 *    for and what this module did until an audit swept it — is what made a
 *    fixed camp spot the best strategy in the game: from the corner of the
 *    penalty box the keeper stood where the *ball* was, the whole far side of
 *    the goal was open by construction, and no clamp on how far he would go
 *    could fix it without leaving him rooted to his spot against a genuine
 *    run. On the bisector, a wide position buys a narrow target: he covers his
 *    near post and the shooter is squeezing the ball past his body.
 *  - **his reach is a radius, so what counts is how near the ball passed
 *    him**, not the difference of two lateral coordinates. A shot dragged
 *    across the goal from a tight angle crosses his plane wide of him but
 *    travels *through* the space he is standing in; measuring it laterally
 *    credited it with a gap it never had, and that measurement is the other
 *    half of the same camp exploit.
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
import { CENTRE_X, GOAL_HALF, PITCH_L, SIX_DEPTH } from './pitch';

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
 * What he covers with no time at all — his own body — and how long it takes
 * him to get from that to his standing reach.
 *
 * This is the honest reason a shot from six yards beats a keeper who is
 * standing right in front of it, and without it there isn't one. Once the gap
 * is measured as how near the ball passed him rather than as a difference of
 * two lateral coordinates, a keeper who has come out to meet a striker is in
 * the way of *every* aim from close range, and the sweep said so: the goal
 * rate from the six-yard box was flat across the whole stick and lower than
 * from eighty pixels, which inverts 7.3's distance response. A keeper has
 * hands, not a wall; reaching a ball struck two metres away takes time he does
 * not have, and that — not a smaller body — is what a point-blank finish
 * beats.
 */
export const REACH_BODY = 12;
export const REACT_TIME = 0.16;

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
 * 26, well past the specification's 22, and it is the second half of narrowing
 * the angle: standing on the bisector decides *which* line he is on and coming
 * out decides how much of the goal his body covers from it. It is also what
 * keeps the response falling with distance — at 18 a shot from eighty pixels
 * measured better than one from forty-five, because he stopped following the
 * ball out exactly where the shooter still had room to go round him.
 */
export const KEEPER_ADVANCE = 26;
/**
 * How far inside his posts he will ever stand. The bisector does the work of
 * deciding *where*; this only keeps him inside his own frame, and it is the
 * specification's own bound (6.5's `mouthCentre +- (GOAL_HALF - 6)`).
 *
 * The constant it replaces was a hard `+-20` band around the centre of the
 * goal, introduced to stop a shooter dragging him off his spot.
 * It could not work and the audit measured why: a keeper pinned near the
 * middle covers the *centre* of the goal from every angle, so the reward for
 * getting wide was a free far post rather than a hard finish. The bisector
 * needs no band, because a keeper on the angle is already where the ball has
 * to pass.
 */
export const KEEPER_POST_INSET = GOAL_HALF - 6;
/** How far behind the ball he always stays; he narrows angles, never dives past it. */
export const KEEPER_STANDOFF = 6;
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
 *
 * Widening it further was tried this round, to steepen a ladder the keeper
 * work had flattened, and measured backwards: the curve that is steeper at the
 * top is shallower at the bottom, so the group stage got *easier* (a competent
 * player scored 3.43 a match at d = 0.25 against 3.12 before) and an expert put
 * ten past a keeper in one of two hundred matches, which 7.2 forbids outright.
 * The pinned shape stands.
 */
export function keeperSkill(rating: number, difficulty: number): number {
  return 0.3 + 0.5 * (rating / 5) * (0.133 + 0.667 * clamp(difficulty, 0, 1));
}

/**
 * Exponential lag on the keeper's lateral tracking: he guesses, never knows.
 *
 * Back to the specification's 0.22 - 0.12 x skill, from the 0.44 - 0.2 this
 * module inflated it to. The inflation was bought to make moving the ball
 * worth something in front of goal, and under the old measurement it had to
 * be: with the gap read laterally and the reach a flat 36 px, a keeper four
 * or five pixels behind the play was still standing in front of everything.
 * Now that his reach is what he can get to in the time he has, being caught
 * out of position is expensive by itself and the lag does not have to be
 * exaggerated to make the point — at the inflated value a ball switched
 * across the face left him 25 px wrong with 0.05 s to fix it, which is a
 * certain goal rather than a chance created.
 */
export function trackLag(skill: number): number {
  return 0.22 - 0.12 * clamp(skill, 0, 1);
}

/** Advance the delayed copy of the ball's lateral coordinate. */
export function trackBall(prevX: number, ballX: number, skill: number, dt: number): number {
  const lag = Math.max(0.02, trackLag(skill));
  return prevX + (ballX - prevX) * (1 - Math.exp(-dt / lag));
}

/**
 * Where a keeper standing `standDepth` off his line has to be to bisect the
 * angle the goal mouth subtends from a ball at `(ballX, ballDepth)`.
 *
 * This is the whole of what "narrowing the angle" means and it is the thing
 * lateral ball-tracking cannot express. From the middle of the pitch the two
 * posts are almost the same direction, so the bisector is nearly the centre of
 * the goal and the keeper barely moves however wide the ball is — which is why
 * a shooter can no longer drag him anywhere from range. From the corner of the
 * penalty box the two posts are 22 degrees apart and the bisector is hard
 * against the near post, which is where the ball has to pass to be squeezed
 * across goal. The reward for a wide position is a difficult finish.
 */
export function narrowAngleX(ballX: number, ballDepth: number, standDepth: number): number {
  const inside = (x: number) =>
    clamp(x, CENTRE_X - KEEPER_POST_INSET, CENTRE_X + KEEPER_POST_INSET);
  if (ballDepth <= standDepth + 1) return inside(ballX);
  // Unit vectors from the ball to each post, in a frame where the goal line is
  // depth 0 and the ball is out at `ballDepth`.
  let bx = 0;
  let bd = 0;
  for (const post of [CENTRE_X - GOAL_HALF, CENTRE_X + GOAL_HALF]) {
    const dx = post - ballX;
    const len = Math.hypot(dx, ballDepth) || 1;
    bx += dx / len;
    bd += -ballDepth / len;
  }
  if (bd > -1e-6) return inside(ballX);
  return inside(ballX + (bx * (ballDepth - standDepth)) / -bd);
}

/**
 * Where the keeper wants to stand: on the angle from the delayed ball line,
 * inside his posts, and off his line when the ball is still a long way out.
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
  const standDepth = KEEPER_LINE + advance;
  return {
    x: narrowAngleX(trackX, depth, standDepth),
    y: goalY + dir * standDepth
  };
}

/**
 * How near the ball passed the keeper on its way in, which is what a reach
 * measured as a radius is actually about.
 *
 * `back` is how far behind the ball its flight extends — the distance to the
 * boot that struck it — so a shot from six yards is never credited with a
 * closest approach it took before it existed. Beyond that, and for a ball that
 * is already past him, the answer is simply how far away it is.
 */
export function approachGap(opts: {
  keeperX: number;
  keeperY: number;
  ballX: number;
  ballY: number;
  vx: number;
  vy: number;
  back: number;
}): number {
  const dx = opts.keeperX - opts.ballX;
  const dy = opts.keeperY - opts.ballY;
  const speed = Math.hypot(opts.vx, opts.vy);
  const here = Math.hypot(dx, dy);
  if (speed < 1e-6) return here;
  // Backwards along the flight: where the ball has come from.
  const ux = -opts.vx / speed;
  const uy = -opts.vy / speed;
  const t = dx * ux + dy * uy;
  if (t <= 0) return here;
  if (t >= opts.back) return Math.hypot(dx - opts.back * ux, dy - opts.back * uy);
  return Math.abs(dx * uy - dy * ux);
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

/**
 * Reach either side of his hands `elapsed` seconds after the ball was struck:
 * his body at once, his standing reach once he has reacted, and the extra a
 * full-stretch dive adds as it extends.
 */
export function keeperReach(elapsed: number): number {
  const react = clamp(elapsed / REACT_TIME, 0, 1);
  return REACH_BODY + (REACH_BASE - REACH_BODY) * react + REACH_DIVE * diveProgress(elapsed);
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

/**
 * How much of his reaction a keeper has already spent on the *previous* ball
 * when a shot arrives off a completed pass, in seconds.
 *
 * The dive penalty above is the same idea applied to his legs, and on its own
 * it was not enough to make passing pay: measured with paired common random
 * numbers, a player who passed lost about 0.07 points a match to the identical
 * player who never did at three of the four difficulties. A dive is a small
 * part of what a keeper does; being *set* is most of it, and a keeper who has
 * just tracked the ball to one man and watched it go to another is not set. So
 * the same fact is charged where it is actually felt — his reach starts from
 * his body rather than from his standing position, and he has to find the
 * ground again before he is the obstacle he was.
 *
 * It is deliberately smaller than `REACT_TIME`: he is late, not absent.
 */
export const ASSIST_REACT_LOSS = 0.12;

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
  /** Reaction already spent on the previous ball; see `ASSIST_REACT_LOSS`. */
  late: number;
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
  /** Reaction already spent on the previous ball; see `ASSIST_REACT_LOSS`. */
  late?: number;
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
    elapsed: 0,
    late: Math.max(0, opts.late ?? 0)
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
