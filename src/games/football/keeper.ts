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
 *  - **the frame he keeps inside travels with him, and it is one budget spent
 *    two ways.** `postFrame` is his posts widened by the allowance he has to
 *    leave his goal by at all, and `squareness` decides how much of that
 *    allowance goes forward rather than sideways. A band drawn on the goal
 *    *line* is the wrong shape for a keeper standing in front of it, and it
 *    pinned him off the near-post line for every ball more than about 55 px
 *    wide — which is where the fourth audit found a 0.91-0.95 finish.
 *  - **he does not come out to a ball in the air** (`airborne`). There is no
 *    shooting angle to narrow against a cross, and holding an advanced
 *    near-post position while the delivery goes over him is how he ends up
 *    stranded for the header.
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
import { CENTRE_X, GOAL_HALF, GOAL_HEIGHT, PITCH_L, SIX_DEPTH } from './pitch';

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
 * The frame he keeps inside: his own posts, widened by the allowance he has to
 * leave his goal by at all.
 *
 * The bound this replaces was `GOAL_HALF - 6` measured from the centre of the
 * goal — the specification's 6.5 number, which is written for a keeper
 * standing *on* his line and is simply the wrong shape for one who is not. A
 * fourth independent audit found what that costs: `restPosition` returned a
 * constant 206.0 for every ball more than about 55 px off centre, because the
 * bisector from a wide ball falls outside a band drawn on the goal line, so
 * the keeper stopped tracking the near post exactly where the near post starts
 * being the whole of the danger. Measured, the near-post finish converted
 * 0.911 at 80 px of offset and 0.951 at 120 px, against 0.23-0.74 for the same
 * shot dragged across goal — and both of the camp spots the whole-grid sweep
 * still flagged were shots struck from inside that pinned region.
 *
 * The allowance is the same one `restPosition` spends on coming out, and that
 * is the idea: a keeper has one budget for leaving his goal, and he spends it
 * *forward* against a ball he is facing and *sideways* against one at a tight
 * angle. Nobody comes twenty pixels off his line for a ball on the byline; he
 * goes across and takes his near post, and taking it means standing beside the
 * upright rather than six pixels inside it. It cannot run away with him: the
 * budget is `KEEPER_ADVANCE` at most and fades with distance, so the widest
 * frame the model can produce is one stride either side of the posts, and on
 * his line it is exactly the goal.
 */
export function postFrame(allowance: number): number {
  return GOAL_HALF + Math.max(0, allowance);
}
/** How far behind the ball he always stays; he narrows angles, never dives past it. */
export const KEEPER_STANDOFF = 8;
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

/**
 * How long a keeper is on the floor after pushing one away.
 *
 * It is a *handicap*, not an exemption, and the distinction is the whole of
 * this constant's history. `keeperPlane` used to open with
 * `if (gk.parryLock > 0) return;`, so for the whole window the ball crossing his
 * line was not resolved at all — no gap, no reach, no roll, not even the
 * desperation floor. An audit found 1,175 follow-ups after a parry and 1,175
 * goals, conversion exactly 1.000, which the module's own contract forbids in
 * its first paragraph: no configuration may be exactly 0 % or exactly 100 %.
 * A keeper on the ground is not a keeper who has left the pitch.
 *
 * So the window now buys two things, both of them real and neither of them a
 * free goal. His reach fades from his own body back to whatever he would
 * otherwise have had, in proportion to how much of the lock is left — he is
 * getting up, and at the instant of the parry he is flat. And a save he does
 * make while he is down he *keeps*: a man on the floor smothers the ball rather
 * than palming it out again, which is the loop the lock exists to prevent and
 * the only part of the old behaviour worth keeping.
 */
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
export function narrowAngleX(
  ballX: number,
  ballDepth: number,
  standDepth: number,
  /** How far outside his posts he is allowed to be; see `postFrame`. */
  allowance = 0
): number {
  const frame = postFrame(allowance);
  const inside = (x: number) => clamp(x, CENTRE_X - frame, CENTRE_X + frame);
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
 * How much of a ball is *in the air*, 0 on the deck and 1 above heading height.
 *
 * There is no angle to narrow against a ball nobody is about to shoot. A
 * keeper does not stand two strides off his line while a cross is over his
 * head — he gets back and sets, because the ball is going to come down
 * somewhere behind him and the only thing worth covering is the goal. Coming
 * out to a ball in flight is how a keeper ends up stranded in front of his own
 * six-yard line watching a header loop in, and this cabinet was doing it every
 * single time: the wing-cross routine dragged him to a near-post position
 * against the *carrier* and then left him there, twenty pixels off his line
 * and fifty pixels wide, while the delivery went over him. Dropping the
 * advance while the ball is up is what lets him be back on his line and inside
 * his frame when the header is struck.
 *
 * It is only the advance that goes; he still stands on the angle, and he still
 * tracks. And it costs nothing in 7.3's isolation rig, where the ball is
 * struck off the deck from a standing start.
 */
export function airborne(ballZ: number): number {
  return clamp(ballZ / KEEPER_JUMP_Z, 0, 1);
}

/**
 * What the keeper's lateral tracker is chasing: the ball on the deck, and where
 * the ball is *coming down* once it is in the air.
 *
 * Round 5 withdrew the keeper's **advance** while the ball was over his head and
 * left his **lateral** position reading a lagged copy of `ball.x`. That half-fix
 * is the generator of the whole cross exploit, and it is arithmetic rather than
 * balance. `restPosition` puts him on the angle from where his tracker says the
 * ball is; the tracker is an exponential lag on `ball.x` with a time constant of
 * about 0.16 s; and a ball whipped across the face of goal at 200-300 px/s
 * therefore leaves that copy 30-50 px stale — against a standing reach of
 * `REACH_BASE` = 26. Instrumented at every aerial contact, the conversion cliff
 * sat exactly on that reach: 0.068-0.108 under 25 px of lag, 0.565 at 30-40 and
 * 0.754 at 40-60. Past his own reach he is not a keeper who guessed wrong, he is
 * a keeper who is not there, and a fixed wing routine that engineers a median
 * contact lag of 29-32 px was worth twice what being the expert is worth.
 *
 * A keeper does not track the *ball* while a cross is in the air. He reads the
 * flight and sets where it is coming down, which is the same point the strikers
 * are running onto — `airMeetPoint`. So the tracker's target is blended from
 * `ball.x` toward that point in proportion to `airborne(ballZ)`, on exactly the
 * reasoning that withdraws the advance: there is no shot to narrow against a
 * ball in flight, and the only thing worth covering is where it is going to be
 * struck from.
 *
 * Two properties are load-bearing and both are the point of doing it here rather
 * than as an override at the call site.
 *
 * **On the deck it is not a change at all.** `airborne(0)` is 0, so a ball at a
 * striker's feet returns `ballX` exactly, and every cell of 7.3's isolation grid
 * — all of which strike a still ball off the deck, headers included, since a
 * header only leaves the ground on a rush the rig never generates — is
 * arithmetically identical to before. Measured cell for cell over the 162-cell
 * distance x aim x power grid at 2,000 seeds: identical to the last goal.
 *
 * **It is scaled, not absolute, and it is applied at `restPosition`'s input
 * rather than inside the tracker.** The lag itself is untouched: `trackBall`
 * goes on chasing `ball.x` exactly as before, from the moment the ball leaves
 * the crosser's boot, and `1 - airborne(ballZ)` of what the keeper sets from is
 * still that lagged copy. Only the part of the reading that corresponds to the
 * ball genuinely being *up* is taken from the landing point. Putting the blend
 * inside the tracker instead was tried first and measured worse for a reason
 * worth recording: the `airborne` ramp then acts as a second low-pass on top of
 * the exponential one, so the keeper spends the first half of the flight
 * chasing the crosser's own position and arrives with 30-70 px still to find.
 * Measured over live play, in-box aerial contacts past his standing reach ran
 * 44 % that way against 8 % this way.
 *
 * And he still has to *get there*: his body walks to the new spot at
 * `KEEPER_WALK`, 120 px/s, so a cross that genuinely changes his mind — one
 * whipped across him with a third of a second of hang time — still arrives
 * before he does. That is the honest residual, and it is the one this leaves in
 * place. What a cross can no longer do is beat him by arithmetic, at 30-50 px
 * against a 26 px reach, on a ball he has watched the whole way.
 */
export function trackTarget(trackX: number, meetX: number | null, ballZ: number): number {
  if (meetX === null) return trackX;
  return trackX + (meetX - trackX) * airborne(ballZ);
}

/**
 * How square the ball is to the goal: 1 anywhere in front of the mouth,
 * falling toward 0 out by the corner flag.
 *
 * Coming out is what a keeper does to a ball he is *facing*. From a tight
 * angle it is the wrong move and every coach says so: there is almost no goal
 * left to narrow — the mouth is foreshortened to nothing from out there —
 * while advancing hands the striker the whole of the goal behind you for a
 * cutback and takes you off the near post, which is the only thing worth
 * standing on. So this is how the keeper's one allowance for leaving his goal
 * is *split*: forward against a square ball, sideways against a tight one.
 *
 * Measured from the *posts* rather than from the centre spot, so a ball
 * anywhere in front of the mouth buys the full advance and nothing about a
 * shot from in front of goal changes: at `ballX = CENTRE_X` this returns
 * exactly 1, which is what keeps every cell of 7.3's isolation grid — all of
 * which shoot from the centre line — arithmetically identical to before.
 */
export function squareness(ballX: number, depth: number): number {
  const wide = Math.max(0, Math.abs(ballX - CENTRE_X) - GOAL_HALF);
  if (wide <= 0) return 1;
  return depth / Math.hypot(wide, depth);
}

/**
 * Where the keeper wants to stand: on the angle from the delayed ball line,
 * inside the frame his allowance buys him, and off his line when the ball is
 * still a long way out.
 */
export function restPosition(
  trackX: number,
  ballY: number,
  goalY: number,
  dir: 1 | -1,
  /** Ball height. A ball in the air is a cross, not a shot; see `airborne`. */
  ballZ = 0
): { x: number; y: number } {
  const depth = Math.abs(ballY - goalY);
  // One allowance for leaving his goal at all: it grows as the ball comes in,
  // fades back to nothing as it goes away, and is withdrawn entirely while the
  // ball is over his head, because there is no shot to narrow.
  const near = 1 - clamp((depth - SIX_DEPTH) / ADVANCE_FADE, 0, 1);
  const allowance = KEEPER_ADVANCE * near * (1 - airborne(ballZ));
  // Spent forward in proportion to how square the ball is — and never past the
  // ball itself: he narrows the angle, he does not leave the goal open behind
  // him. Whatever is not spent coming out is what lets him get across to his
  // near post instead, through `postFrame`.
  const advance = Math.min(
    allowance * squareness(trackX, depth),
    Math.max(0, depth - KEEPER_LINE - KEEPER_STANDOFF)
  );
  const standDepth = KEEPER_LINE + advance;
  return {
    x: narrowAngleX(trackX, depth, standDepth, allowance),
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
 * How much of that reach he still has against a ball crossing the line at
 * `ballZ`: all of it up to the top of his standing claim, none of it at the
 * bar, and a straight line between the two.
 *
 * This is the third exactly-1.000 cell in this module's history and it has the
 * same shape as the two before it. `keeperPlane` opened with
 * `if (m.ball.z > KEEPER_JUMP_Z) return;` against a `GOAL_HEIGHT` of 26, so a
 * ball on its way in between those two heights was a goal he was never
 * consulted about: no gap, no reach, no roll, not even the desperation floor.
 * Through the isolation rig a header met 20 px out and 30 px wide converted
 * 0.907 over 400 seeds at 23, at 24 and at 25 alike, the height making no
 * difference at all because he was not in the arithmetic. The `gap > reach` and
 * `parryLock > 0` returns were both converted into rolls for exactly this
 * reason, and this is the last of the three.
 *
 * **Raising `KEEPER_JUMP_Z` to `GOAL_HEIGHT` is the fix this is not.** A keeper
 * who claims a ball at the bar as readily as one at his chest is a keeper a
 * cross can no longer beat at all, and the cabinet's steer is that a cross is
 * supposed to be dangerous. What is wrong is the cliff, not the height: a ball
 * a hand's width over his claim is one he can plausibly get something to and a
 * ball on the underside of the bar is one he cannot, and between the two there
 * is a gradient rather than a door. `reach` is already a scale rather than a
 * wall, so a ball he cannot reach at all still runs into `SAVE_FLOOR` the way a
 * shot past his hands does, and no height is a certainty either way.
 *
 * **The height it is read at is the height at the goal line, not the height
 * over his own plane**, and getting that wrong costs more than leaving the bug
 * in. He stands 8 to 34 px in front of his line and the ball is falling, so a
 * ball that clears his claim going over him and drops into his hands before the
 * line has not beaten him at all; charging him for the height it passed his
 * plane at turned four of six rig cells *worse* than the bug did, because it
 * spent his one roll early at a reduced reach where the old early return had
 * quietly deferred it until the ball came down. Read at the line, every ball
 * that lands inside his claim is arithmetically unchanged, and so is every
 * ball struck off the deck: `heightReach` is exactly 1 at or below
 * `KEEPER_JUMP_Z`, which is the whole of the isolation grid.
 */
export function heightReach(ballZ: number): number {
  if (ballZ <= KEEPER_JUMP_Z) return 1;
  return clamp(1 - (ballZ - KEEPER_JUMP_Z) / (GOAL_HEIGHT - KEEPER_JUMP_Z), 0, 1);
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
 * It is deliberately smaller than `REACT_TIME`: he is late, not absent. **The
 * caller has to cap it at the ball's own flight time**, and it has to charge it
 * only where the sentence above is true — on a ball switched from one man to
 * another, not on a cross the keeper has watched arc into his own six-yard box.
 * `armKeeper` owns that second condition and sets out at length what it was
 * worth: the cap is arithmetically a *no-op* for any flight shorter than this
 * constant, because `keeperPlane` reads `keeperReach(elapsed - late)` with
 * `elapsed` equal to the flight, so the difference is exactly zero and
 * `keeperReach(0)` is `REACH_BODY`. Charged against a first-time header from six
 * yards that took the keeper's reach from 21.3 px to 12 px against a 22 px gap
 * — a 0.52 chance turned into a 0.93 one, on the best chance in the game.
 *
 * A flat subtraction cannot express "late" on its own, because whether 0.12 s is
 * a stumble or an eternity depends entirely on how long the ball is in the air.
 * The cap keeps it from going negative; restricting it to ground contacts keeps
 * it from being charged where the keeper was never surprised at all.
 *
 * **Left deliberately un-rescaled, and this is a real loose end rather than a
 * finished thought.** The obvious next step — charge the loss as a *share* of
 * the reaction he actually had, `min(ASSIST_REACT_LOSS, t x share)` — was built
 * and measured this round and measured backwards on the acceptance criteria: at
 * a half share it cost the scripted competent player 26 % of his goals a match
 * (2.57 to 1.90 at d = 0.25) against 6 % for the wing routine, because a ground
 * pass into the box is the shot the reward exists for and a header is not. It
 * widened every wing station's ladder margin rather than closing it. Making
 * that change work means re-deriving the passing reward at the same time, which
 * is a round of its own and not this one's.
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
