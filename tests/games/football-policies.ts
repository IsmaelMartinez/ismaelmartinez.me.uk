/**
 * Scripted input policies for the CALCIO '90 suites: the four players the
 * balance targets are written against.
 *
 * `passive` presses nothing. `dribbler` never shoots or passes and simply runs
 * the ball at the goal. `competent` models a decent human — 170 ms reaction,
 * an 8-way quantised stick, shoots from inside 200 px when the lane is
 * reasonable, passes when pressed, slides when in range and facing. `expert`
 * is the same policy at 66 ms with better shot selection and real use of the
 * cross.
 *
 * A policy is a function of the match state, so it reacts to what is actually
 * happening rather than replaying a fixed tape.
 */
import {
  canAirStrike,
  NEUTRAL_INPUT,
  TACKLE_R,
  type MatchInput,
  type MatchState
} from '../../src/games/football/match';
import {
  CENTRE_X,
  GOAL_HALF,
  TEAM_SIZE,
  attackDir,
  attackGoalY,
  dist
} from '../../src/games/football/pitch';

export type Policy = (m: MatchState, dt: number) => MatchInput;
export type PolicyName =
  | 'passive'
  | 'dribbler'
  | 'masher'
  | 'competent'
  | 'expert'
  | 'winger'
  | 'nearCamper';

/** Quantise a vector to the eight directions a keyboard can express. */
export function quantise8(x: number, y: number): { x: number; y: number } {
  const len = Math.hypot(x, y);
  if (len < 0.001) return { x: 0, y: 0 };
  const qx = Math.abs(x) / len > 0.383 ? Math.sign(x) : 0;
  const qy = Math.abs(y) / len > 0.383 ? Math.sign(y) : 0;
  if (qx === 0 && qy === 0) return { x: 0, y: Math.sign(y) || 1 };
  return { x: qx, y: qy };
}

export function passive(): Policy {
  return () => NEUTRAL_INPUT;
}

/** Runs the ball at the goal and nothing else. The anti-dribbling control. */
export function dribbler(): Policy {
  return (m: MatchState) => {
    const p = m.players[0][m.controlled];
    const target = m.owner && m.owner.side === 0 ? goalPoint(m) : { x: m.ball.x, y: m.ball.y };
    const q = quantise8(target.x - p.x, target.y - p.y);
    return { x: q.x, y: q.y, a: false, b: false, c: false };
  };
}

/**
 * The button-masher: run at the ball, run at the goal once you have it, and
 * hammer A on a fixed cycle. No aiming, no passing, no reading — the strategy
 * a player finds in the first thirty seconds and never has to leave.
 *
 * This policy exists because an independent audit found it was the *best*
 * available strategy, beating both scripted humans at nearly every difficulty,
 * and the suite could not see it. It is now the control that pins "skill beats
 * mashing": the period is swept, because a masher that only loses at one
 * cadence has not been fixed.
 */
export function masher(
  period = 21,
  hold = Math.max(1, Math.round(period / 2)),
  reaction = MASH_REACTION
): Policy {
  let tick = 0;
  let think = 0;
  let steer = { x: 0, y: 0 };
  const held = clampHold(period, hold);
  return (m: MatchState, dt: number) => {
    // He hammers the button on a motor cycle, but he *steers* on the same
    // reaction the scripted humans do. This is the control the comparison
    // needs and an earlier round of it did not have: without the latency the
    // masher re-aimed his run every single tick while the players he was being
    // measured against were gated at 120-170 ms, which made him the best
    // ball-chaser on the pitch by reflex alone. At a 120-tick cadence that
    // superhuman chase was worth 1.433 points a match against the expert's
    // 1.406 — the masher was not out-playing anyone, he was out-reacting them,
    // and no human holds a controller like that.
    tick++;
    think -= dt;
    if (think <= 0) {
      const p = m.players[0][m.controlled];
      const owns = !!m.owner && m.owner.side === 0;
      const target = owns ? goalPoint(m) : { x: m.ball.x, y: m.ball.y };
      steer = quantise8(target.x - p.x, target.y - p.y);
      think = owns ? reaction : Math.max(reaction, DEFENSIVE_REACTION);
    }
    return { x: steer.x, y: steer.y, a: (tick - 1) % period < held, b: false, c: false };
  };
}

/** The masher reacts as fast as the `competent` player and no faster. */
export const MASH_REACTION = 0.17;

/**
 * Which post a camper strikes at from his spot.
 *
 * `across` drags the ball over the face of goal to the far post; `near` hits
 * the post he is stood beside. They are opposite stick deflections from the
 * same position and they are **not** the same shot: the keeper stands on the
 * angle bisector, so where he ends up decides which of the two is on, and the
 * bisector is clamped into the frame `postFrame` allows him. Until round six
 * that frame was a band drawn on the goal *line* (`GOAL_HALF - 6`), so from
 * wide enough it bound and he could not reach the near-post line at all.
 */
export type CampAim = 'across' | 'near';

export const CAMP_AIMS: readonly CampAim[] = ['across', 'near'];

/**
 * The camper: carry the ball to one fixed spot and strike it at one fixed post
 * from there, at the same 170 ms reaction as `competent`. Nothing else.
 *
 * This is the policy an independent audit found was the strongest thing on the
 * pitch — "camp on the corner of the penalty box and shoot across goal" scored
 * 6.6 to 6.8 ladder points against the expert's 5.9, won 94 % of matches at
 * d = 0.25 and was champion in nearly half of all runs. It is a whole class of
 * bug rather than a spot on the pitch: any *fixed* position that beats playing
 * football means the geometry in front of goal has a hole in it, so the suite
 * sweeps the position rather than testing the one that was found.
 *
 * **The aim is swept for the same reason the position is, and it was not.**
 * This function used to hard-code `across` — `const across = campX <= CENTRE_X
 * ? 1 : -1` — so the whole 45-spot grid was swept with exactly the shot the
 * previous round had just fixed, and never once with the opposite one. A
 * fourth independent audit then found the near-post aim beating `competent`
 * from those same spots at every difficulty (+0.163 to +0.280 points a match,
 * t = 4.0 to 11.1), converting 0.955 against 0.369 for the across-goal aim
 * from the same place. The suite could not see it because the aim was a
 * constant. It is a parameter now, and both values are swept at every spot.
 */
export function camper(campX: number, campDepth: number, aim: CampAim = 'across'): Policy {
  let think = 0;
  let held: MatchInput = NEUTRAL_INPUT;
  let charging = 0;
  return (m: MatchState, dt: number) => {
    if (charging > 0) {
      charging--;
      if (charging === 0) return { ...held, a: false };
      return held;
    }
    think -= dt;
    if (think > 0) return held;
    think = MASH_REACTION;
    const p = m.players[0][m.controlled];
    const owns = !!m.owner && m.owner.side === 0 && m.owner.idx === m.controlled;
    const dir = attackDir(0, m.swapped);
    const goalY = attackGoalY(0, m.swapped);
    if (owns) {
      const spot = { x: campX, y: goalY - dir * campDepth };
      if (dist(p.x, p.y, spot.x, spot.y) < 12) {
        // The stick maps straight onto `shoot`'s aim, which is a point across
        // the mouth: positive is the right-hand side of the goal. So the near
        // post is the side the spot itself is on and the far post is the other.
        const near = campX <= CENTRE_X ? -1 : 1;
        held = {
          x: aim === 'near' ? near : -near,
          y: Math.sign(goalY - p.y),
          a: true,
          b: false,
          c: false
        };
        charging = FULL_CHARGE_TICKS;
        return held;
      }
      const q = quantise8(spot.x - p.x, spot.y - p.y);
      held = { x: q.x, y: q.y, a: false, b: false, c: false };
      return held;
    }
    const q = quantise8(m.ball.x - p.x, m.ball.y - p.y);
    held = { x: q.x, y: q.y, a: false, b: false, c: false };
    return held;
  };
}

/**
 * Camp positions swept across the attacking third: nine lateral stations from
 * the left touchline to the right, at five depths from the six-yard line to
 * the edge of the centre circle. Forty-five fixed spots, deliberately including
 * the ones the audit named and the ones a later round of this work found when
 * the first hole was closed and the exploit moved.
 */
export const CAMP_SPOTS: Array<[number, number]> = (() => {
  const out: Array<[number, number]> = [];
  for (const x of [50, 90, 120, 145, 170, 195, 220, 250, 290]) {
    for (const depth of [40, 60, 78, 110, 150]) out.push([x, depth]);
  }
  return out;
})();

/**
 * The wide station the audit's `winger w130 d55` worked from. It is the
 * function's default argument and it is **no longer the claim**.
 *
 * This constant was the fifth blind spot in as many rounds, and the most
 * embarrassing, because the file it lives in already argues the general case
 * at length. `CAMP_SPOTS` sweeps forty-five positions and the docstring under
 * it says why: "any fixed position that beats playing football means the
 * geometry in front of goal has a hole in it", and "patching the corner of the
 * box would have moved the exploit rather than removed it". Both sentences are
 * about camps. The wing routine was then pinned to a single point — one
 * lateral, one depth — and swept only across the *side*, which is the one axis
 * a mirror-symmetric pitch guarantees nothing lives on.
 *
 * It had moved by 25 px of depth. At `(130, 55)` the routine measures -0.053
 * ladder points against `competent` and -0.373 against `expert`, the answered,
 * healthy numbers the previous round recorded. Change nothing but the depth
 * and `(1, 130, 30)` scores 4.38 goals a match at d = 0.25 against 2.11,
 * reaches eleven, and puts a side in double figures in 3 of 300 matches where
 * the pinned station's biggest scoreline in 1,200 matches is six.
 * `(-1, 90, 30)` beats `competent` by +0.740 and `expert` by +0.420.
 *
 * So the station is swept now, exactly as the camps are. See `WING_STATIONS`.
 */
export const WING_LATERAL = 130;
export const WING_DEPTH = 55;

/**
 * Wing stations swept across the flank: six laterals from just outside the
 * six-yard box to the touchline, at five depths from close to the goal line to
 * the edge of the penalty area. Thirty stations, swept on **both** flanks,
 * which is sixty — the same treatment `CAMP_SPOTS` gets, for the reason
 * `CAMP_SPOTS` already gives.
 *
 * The depth is the axis that matters and it is the one that was pinned. 30 px
 * is about the six-yard line, 65 px is short of the penalty spot, and the
 * routine's whole character changes across that span. Deep, it stands and
 * crosses from outside the danger, and the keeper has the delivery in view the
 * whole way. Shallow, it whips the ball flat across the face of goal — and
 * that is the delivery that leaves `gk.trackX` 30-50 px stale and the keeper
 * set on the wrong lateral spot when the header is met. The station is not the
 * bug; the lag is. But a grid that cannot reach the station cannot reach the
 * bug either, and for five rounds this one could not.
 *
 * The laterals bracket the corner of the penalty area (`BOX_HALF` is 108) so
 * the sweep holds both the cut-back position inside the box and the proper
 * touchline cross outside it.
 */
export const WING_STATIONS: Array<[number, number]> = (() => {
  const out: Array<[number, number]> = [];
  for (const lateral of [90, 105, 120, 130, 145, 165]) {
    for (const depth of [30, 40, 50, 55, 65]) out.push([lateral, depth]);
  }
  return out;
})();

/**
 * The wing-cross routine: carry the ball to a fixed wide station, put it in
 * on the head of the most advanced teammate, and attack every dropping ball.
 * Three verbs, one station, no reading of the game at all.
 *
 * This is the fourth exploit an independent audit has found in this cabinet
 * and the second the suite was structurally unable to see: **there was no
 * crossing or heading routine in the policy catalogue.** The cross-share cap
 * in 7.4 was therefore only ever measured against `competent`, whose share is
 * 0.13-0.22 — a cap that is never approached is not a cap, it is a comment.
 * The audit measured it beating `expert` at every difficulty by +0.177 to
 * +0.285 points a match at t = 8.9 to 10.8, taking 98-100 % of its goals out
 * of the air against the specification's hard 0.45 ceiling. Reproduced here on
 * the commit that adds it, at 150 matched pairs a rung: +0.907 ladder points
 * against `expert` (+0.233 t=4.55 / +0.227 t=5.09 / +0.187 t=3.18 / +0.260
 * t=5.45), +1.053 against `competent`, and an air-goal share of 0.983-0.997.
 *
 * Answered in the commit after, at the same 150 pairs: -0.373 against `expert`
 * on this wing and -1.200 on the other, -0.053 against `competent`, and a
 * champion rate of 0.580 against the expert's 0.705 where it was 0.940 against
 * 0.782. It is not a dead routine — it still takes thirteen shots and scores
 * 2.3 goals a match at d = 0.25 against a competent player's 2.5, which is the
 * owner's steer for the round: a cross is supposed to be dangerous, it is just
 * not supposed to be better than football.
 *
 * It steers on `MASH_REACTION`, the same 170 ms as `competent` and nearly
 * three times slower than `expert`'s 66 ms, so a margin it shows is a margin
 * over a player who reacts at least as fast — never an input artefact. The
 * audit's own rig ran it at that latency for exactly this reason.
 */
export function winger(
  wing: -1 | 1,
  lateral = WING_LATERAL,
  depth = WING_DEPTH
): Policy {
  let think = 0;
  let held: MatchInput = NEUTRAL_INPUT;
  /** Ticks of a held button left to run before it is released. */
  let pressing = 0;
  /** Which button the current press is on, so releasing lets go of that one. */
  let button: 'a' | 'b' = 'a';
  return (m: MatchState, dt: number) => {
    if (pressing > 0) {
      pressing--;
      if (pressing === 0) return { ...held, [button]: false };
      return held;
    }

    const p = m.players[0][m.controlled];
    const owns = !!m.owner && m.owner.side === 0 && m.owner.idx === m.controlled;
    const dir = attackDir(0, m.swapped);
    const goalY = attackGoalY(0, m.swapped);

    // Attack every dropping ball, checked every tick rather than behind the
    // reaction gate: the heading window is a handful of frames wide, and the
    // game itself is asked whether the contact is on. This is the same reflex
    // `competent` has, verbatim, so the two policies differ in what they do
    // with the ball and not in how they meet it.
    if (!owns && canAirStrike(m, 0, m.controlled)) {
      const keeper = m.players[1][0];
      const away = keeper.x <= CENTRE_X ? 1 : -1;
      held = { x: away, y: Math.sign(goalY - p.y), a: true, b: false, c: false };
      button = 'a';
      pressing = 2;
      return held;
    }

    think -= dt;
    if (think > 0) return held;
    think = MASH_REACTION;

    if (owns) {
      const spot = { x: CENTRE_X + wing * lateral, y: goalY - dir * depth };
      const runner = advancedTeammate(m);
      if (dist(p.x, p.y, spot.x, spot.y) < 14 && runner >= 0) {
        const t = m.players[0][runner];
        const q = quantise8(t.x - p.x, t.y - p.y);
        held = { x: q.x, y: q.y, a: false, b: true, c: false };
        // B is edge-triggered, so the press has to end for the next one to
        // exist at all. Two ticks down, then let go.
        button = 'b';
        pressing = 2;
        return held;
      }
      const q = quantise8(spot.x - p.x, spot.y - p.y);
      held = { x: q.x, y: q.y, a: false, b: false, c: false };
      return held;
    }

    const q = quantise8(m.ball.x - p.x, m.ball.y - p.y);
    held = { x: q.x, y: q.y, a: false, b: false, c: false };
    return held;
  };
}

/**
 * A press has to fit inside its own cycle, and it has to end: a masher who
 * never lets go of A never releases a shot at all, and would look like a
 * player who has been beaten when he has simply not played.
 */
function clampHold(period: number, hold: number): number {
  return Math.max(1, Math.min(hold, period - 1));
}

/** How many ticks of held A a full `CHARGE_TIME` needs. */
export const FULL_CHARGE_TICKS = 33;

/**
 * Every mash cadence the suite sweeps, as `[period, hold]` in ticks.
 *
 * The set is dense from 5 to 120 rather than the three cadences an earlier
 * round asserted, and it carries a hold-and-release variant of every period
 * long enough for one. That earlier round is exactly why: it pinned 8, 21 and
 * 40 ticks, and a 66-tick cadence — the first period with room for the whole
 * 0.55 s charge — still won 0.80 / 0.66 / 0.53 / 0.54 across the ladder and
 * out-scored the scripted competent player. A masher that only loses at the
 * cadences someone thought to test has not been beaten; he has been missed.
 */
export const MASH_CADENCES: Array<[number, number]> = (() => {
  const periods = [5, 7, 9, 12, 15, 18, 21, 26, 31, 36, 40, 46, 52, 58, 66, 74, 84, 96, 108, 120];
  const out: Array<[number, number]> = [];
  for (const period of periods) {
    // Tap: the shortest press the cycle allows, which is the button being
    // hammered rather than charged.
    out.push([period, 1]);
    // Square wave: half the cycle down, the cadence the audit described.
    out.push([period, Math.max(1, Math.round(period / 2))]);
    // Hold and release: the whole charge, then let go. This is the variant
    // that survived the last round, so it is swept at every period with room
    // for it rather than at the one period that happened to be tried.
    if (period > FULL_CHARGE_TICKS) out.push([period, FULL_CHARGE_TICKS]);
  }
  return out;
})();

function goalPoint(m: MatchState): { x: number; y: number } {
  return { x: CENTRE_X, y: attackGoalY(0, m.swapped) };
}

/** How crowded the corridor from the carrier to the mouth is. */
function laneBlockers(m: MatchState): number {
  return laneBlockersFrom(m, m.players[0][m.controlled]);
}

/** The same question asked of any point, so a pass can be judged by it too. */
function laneBlockersFrom(m: MatchState, p: { x: number; y: number }): number {
  const goalY = attackGoalY(0, m.swapped);
  const dir = attackDir(0, m.swapped);
  let n = 0;
  for (let idx = 1; idx < TEAM_SIZE; idx++) {
    const o = m.players[1][idx];
    if ((o.y - p.y) * dir <= 0) continue;
    if ((goalY - o.y) * dir < 0) continue;
    const t = (o.y - p.y) / ((goalY - p.y) || 1);
    const lineX = p.x + (CENTRE_X - p.x) * t;
    if (Math.abs(o.x - lineX) < 18) n++;
  }
  return n;
}

function nearestOpponent(m: MatchState, x: number, y: number): number {
  let best = Infinity;
  for (let idx = 1; idx < TEAM_SIZE; idx++) {
    const o = m.players[1][idx];
    best = Math.min(best, dist(o.x, o.y, x, y));
  }
  return best;
}

/** Slowest a scripted player reacts when the ball is not at his feet. */
const DEFENSIVE_REACTION = 0.12;

interface HumanOptions {
  reaction: number;
  shootRange: number;
  /**
   * Inside this he will shoot with one defender in the corridor; beyond it the
   * lane has to be clean. It is where he stops working the ball and hits it.
   */
  workRange: number;
/** Where across the mouth this player puts a shot, 0..1. */
  aim: number;
  /**
   * How far his intent wanders either side of that, per shot. Nobody hits the
   * same spot twice, and without this every shot the policy takes is inside
   * the frame — which is not a decent human, it is a machine.
   */
  aimSpread: number;
  /** Ticks A is held before release, which sets the shot's power. */
  chargeTicks: number;
  /** Whether the policy uses the lofted cross from wide areas. */
  crosses: boolean;
  /**
   * Whether the policy plays a ground pass out of pressure, and whether it
   * slides at a carrier it is in range of and facing.
   *
   * These exist so the suite can field a player who is identical in every
   * other respect and simply never uses the verb, which is the only honest way
   * to ask whether the verb is worth using. Each defaults to on; a comparison
   * turns exactly one of them off.
   */
  passes?: boolean;
  slides?: boolean;
}

function makeHuman(opts: HumanOptions): Policy {
  let think = 0;
  let held: MatchInput = NEUTRAL_INPUT;
  let charging = 0;
  let slideRest = 0;
  return (m: MatchState, dt: number) => {
    slideRest = Math.max(0, slideRest - dt);
    // A charge in progress is never interrupted: releasing is what fires it.
    if (charging > 0) {
      charging--;
      if (charging === 0) return { ...held, a: false };
      return held;
    }

    const p = m.players[0][m.controlled];
    const owns = !!m.owner && m.owner.side === 0 && m.owner.idx === m.controlled;
    const goal = goalPoint(m);

    // Attacking a dropping ball is an instinct, not a decision: the window a
    // cross is headable in is a handful of frames wide, so it is checked every
    // tick rather than behind the reaction gate. A is the only button
    // involved — the contact follows from the ball's height, per 6.1.
    // The game itself is asked whether the ball can be attacked: pressing A at
    // a ball that cannot be headed buys a slide tackle and its cooldown, and
    // the chance is gone before the policy looks again.
    if (!owns && canAirStrike(m, 0, m.controlled) && Math.abs(goal.y - m.ball.y) < 150) {
      const keeper = m.players[1][0];
      const away = keeper.x <= CENTRE_X ? 1 : -1;
      held = { x: away * opts.aim, y: Math.sign(goal.y - p.y), a: true, b: false, c: false };
      // Two frames of A: the press is what fires the header, the release
      // simply lets go of a button that is no longer charging anything.
      charging = 2;
      return held;
    }

    // A slide is a reflex too, and for the same reason: it is checked on the
    // tick it would land rather than on the tick the policy last thought.
    //
    // This is a measurement, not a preference. Behind the reaction gate the
    // decision was up to 170 ms stale by the time the button reached the game,
    // and of 1,865 slides the policy started across 200 matches only 174 ever
    // came within `TACKLE_R` of a carrier at all — 91 % of them were swung at
    // a man who had already gone, or at a ball that was already loose. A verb
    // that whiffs nine times in ten cannot be shown to earn its place however
    // good the mechanic behind it is, and the mechanic is not what was wrong.
    const carrier =
      m.owner && m.owner.side === 1 && m.owner.idx !== 0 ? m.players[1][m.owner.idx] : null;
    if (opts.slides !== false && !owns && carrier && slideRest === 0) {
      const gap = dist(p.x, p.y, carrier.x, carrier.y);
      const toX = (carrier.x - p.x) / (gap || 1);
      const toY = (carrier.y - p.y) / (gap || 1);
      // Head-on only: from behind the roll is barely better than a coin flip.
      const headOn = -(carrier.fx * toX + carrier.fy * toY) > 0.5;
      if (gap < TACKLE_R && headOn && p.slide === 0 && p.down === 0 && p.slideCd === 0) {
        const q = quantise8(carrier.x - p.x, carrier.y - p.y);
        held = { x: q.x, y: q.y, a: true, b: false, c: false };
        charging = 2;
        slideRest = 1.1;
        return held;
      }
    }

    think -= dt;
    if (think > 0) return held;
    // Reaction is a decision latency, and only decisions *on* the ball are
    // made four times faster by being good at the game: nobody reads a loose
    // ball 66 ms after it moves. Chasing therefore runs on a floor shared by
    // both policies — without it the expert's defending alone held goals
    // against flat across the whole difficulty ladder.
    think = owns ? opts.reaction : Math.max(opts.reaction, DEFENSIVE_REACTION);

    if (owns) {
      const goalDist = dist(p.x, p.y, goal.x, goal.y);
      const pressure = nearestOpponent(m, p.x, p.y);
      // From out wide the angle is not a shooting angle: the ball goes into
      // the middle for a man arriving on it. This is the only route to the
      // header 7.4 wants a share of the goals to come from, and it is checked
      // *before* the shot rather than after it.
      //
      // Behind that reordering is a measurement. The cross used to sit under
      // the shot branch, gated on being more than `GOAL_HALF + 66` px off
      // centre — which is 108 px, the very edge of the penalty area — while
      // the shot branch above it accepted anything inside 200 px with a
      // passable lane. The two conditions overlapped almost completely, the
      // shot always won, and the scripted `competent` player played exactly
      // **zero** lofted balls a match across 200 matches at every difficulty.
      // Crossing was not weak in the suite; it was absent from it, and the
      // "no crosses" control measured identical to the player who had it.
      const lateral = Math.abs(p.x - CENTRE_X);
      const runner = advancedTeammate(m);
      // Crossing has to *add* a chance rather than spend one. The gates below
      // are the ones under which the shot branch would have declined anyway:
      // out beyond the corner of the six-yard box, where the angle is not a
      // shooting angle, or with three bodies in the corridor, one more than the
      // shot branch will accept. Set two pixels looser than this — a lateral
      // gate of `GOAL_HALF + 10` and two blockers — the cross overlapped the
      // shot it should have deferred to, and the player who crossed scored
      // 1.90 a match against 2.01 for the same player who never did.
      const blocked = laneBlockers(m) >= 3;
      if (
        opts.crosses !== false &&
        runner >= 0 &&
        goalDist > 60 &&
        goalDist < 240 &&
        (lateral > GOAL_HALF + 30 || blocked) &&
        aheadOf(m, runner, p) > 40
      ) {
        const t = m.players[0][runner];
        const q = quantise8(t.x - p.x, t.y - p.y);
        held = { x: q.x, y: q.y, a: false, b: true, c: false };
        return held;
      }
      // A blocked lane is a wasted shot: from range the corridor has to be
      // clear, and only inside the box is one body in the way worth risking.
      //
      // The gate this replaces accepted two bodies in the corridor out to
      // 190 px and one beyond that, and it is most of what a camping policy
      // was beating: shooting from anywhere inside 200 px through traffic
      // converted at 0.19 a shot, against 0.41 for a policy that walked the
      // ball to one spot at the edge of the box and struck it from there. A
      // decent human does not hit the first shot that is technically legal,
      // he takes the one that is on — and "a shot is worth taking when a
      // better one is not available" is a *policy* claim, so it belongs here
      // rather than in the game. The camp sweep is what holds it honest: the
      // whole attacking third is swept for a fixed spot that out-points this
      // player, and if one exists again this gate is the first thing to look
      // at.
      if (goalDist < opts.shootRange && laneBlockers(m) <= (goalDist < opts.workRange ? 1 : 0)) {
        // Place it toward the post the keeper is further from.
        const keeper = m.players[1][0];
        const side = keeper.x <= CENTRE_X ? 1 : -1;
        // Toward the post the keeper is further from, give or take: the
        // wander is drawn from the match's own RNG so a seeded match still
        // replays identically. The magnitudes are on the stick scale where
        // full deflection asks for the ball a ball's width inside the post
        // (`AIM_SPAN`); they were raised when that scale changed, because a
        // decent human aims at the same *place* and the number the stick has
        // to read to express it is not a property of the player.
        const wander = (m.rng() * 2 - 1) * opts.aimSpread;
        held = {
          x: side * Math.max(0, opts.aim + wander),
          y: Math.sign(goal.y - p.y),
          a: true,
          b: false,
          c: false
        };
        charging = opts.chargeTicks;
        return held;
      }
      // The ball may go square but it may not go backwards: the long ball
      // played back across your own half under pressure is the pass that
      // concedes, and it was a real part of why passing was a net loss.
      // Barring it outright — insisting the receiver be no further from the
      // opposition goal than the passer — cost a third of the policy's passing
      // volume and took it under 7.4's floor, so the gate is only on the ball
      // that actually loses matches.
      const mate = opts.passes !== false ? openTeammate(m) : -1;
      // Passing is not only an escape. A decent player also gives it to a man
      // who is further up the pitch and *much* freer than he is.
      //
      // "Much" is doing the work, and it is the second half of the answer to
      // finding two. The gate this replaces asked for twelve pixels of extra
      // room, which is inside the width of the two players; the policy played
      // eleven and a half balls a match on it, half of them to a man no better
      // off than the passer, and every one of them cost a shot. Volume is the
      // one thing passing does not need: measured with paired common random
      // numbers, taking it from eight to eleven and a half moved the verb from
      // -0.07 to -0.22 points a match. The distance here is the width of the
      // corridor a defender has to cover to get to the receiver, so the pass
      // is played when the ball genuinely reaches a freer man and not because
      // there is a teammate in front.
      const better =
        mate >= 0 &&
        aheadOf(m, mate, p) > 40 &&
        nearestOpponent(m, m.players[0][mate].x, m.players[0][mate].y) > pressure + 40;
      if (mate >= 0 && (pressure < 26 || better)) {
        if (aheadOf(m, mate, p) > -60) {
          const t = m.players[0][mate];
          const q = quantise8(t.x - p.x, t.y - p.y);
          held = { x: q.x, y: q.y, a: false, b: false, c: true };
          return held;
        }
      }
      const q = quantise8(goal.x - p.x, goal.y - p.y);
      held = { x: q.x, y: q.y, a: false, b: false, c: false };
      return held;
    }

    // Out of possession and not in a challenge: close the carrier down, or the
    // ball if it is loose. The slide itself is handled above, as a reflex.
    const chase = carrier ?? { x: m.ball.x + m.ball.vx * 0.15, y: m.ball.y + m.ball.vy * 0.15 };
    const q = quantise8(chase.x - p.x, chase.y - p.y);
    held = { x: q.x, y: q.y, a: false, b: false, c: false };
    return held;
  };
}

/** How far up the pitch `idx` is ahead of the carrier, in the attacking sense. */
function aheadOf(m: MatchState, idx: number, carrier: { y: number }): number {
  return (m.players[0][idx].y - carrier.y) * attackDir(0, m.swapped);
}

/** The teammate furthest up the pitch: the man a cross is aimed at. */
function advancedTeammate(m: MatchState): number {
  const dir = attackDir(0, m.swapped);
  let best = -1;
  let bestY = -Infinity;
  for (let idx = 1; idx < TEAM_SIZE; idx++) {
    if (idx === m.controlled) continue;
    const t = m.players[0][idx];
    const forward = t.y * dir;
    if (forward > bestY) {
      bestY = forward;
      best = idx;
    }
  }
  return best;
}

/**
 * How many opponents are standing in the corridor a pass would travel down.
 *
 * A decent player does not play the ball through a defender and hope, and
 * until this existed the policy did: it picked the freest, most advanced
 * teammate with no regard for what was between the two of them, which is a
 * third of a pass's value handed straight back. Passing quality is the whole
 * of what the paired comparison is asking about — a pass has to make a better
 * chance than the shot it replaced, and a pass that is cut out makes none.
 */
function passLaneBlockers(m: MatchState, from: { x: number; y: number }, idx: number): number {
  const t = m.players[0][idx];
  const dx = t.x - from.x;
  const dy = t.y - from.y;
  const d2 = dx * dx + dy * dy || 1;
  let blockers = 0;
  for (let o = 1; o < TEAM_SIZE; o++) {
    const opp = m.players[1][o];
    const along = Math.max(0, Math.min(1, ((opp.x - from.x) * dx + (opp.y - from.y) * dy) / d2));
    if (dist(opp.x, opp.y, from.x + dx * along, from.y + dy * along) < 18) blockers++;
  }
  return blockers;
}

function openTeammate(m: MatchState): number {
  const p = m.players[0][m.controlled];
  const dir = attackDir(0, m.swapped);
  let best = -1;
  let bestScore = -Infinity;
  for (let idx = 1; idx < TEAM_SIZE; idx++) {
    if (idx === m.controlled) continue;
    const t = m.players[0][idx];
    const d = dist(p.x, p.y, t.x, t.y);
    if (d < 26 || d > 220) continue;
    // A body in the corridor is a heavy penalty rather than a veto: vetoing it
    // outright measured worse than not passing at all, because it cut the
    // policy from eight balls a match to three without improving what was
    // left. What passing needs is the *best* option taken, not the marginal
    // one refused.
    const score =
      (t.y - p.y) * dir * 0.5 +
      nearestOpponent(m, t.x, t.y) -
      d * 0.2 -
      passLaneBlockers(m, p, idx) * 90;
    if (score > bestScore) {
      bestScore = score;
      best = idx;
    }
  }
  return best;
}

const COMPETENT: HumanOptions = {
  reaction: 0.17,
  shootRange: 165,
  workRange: 130,
  aim: 0.82,
  aimSpread: 0.3,
  chargeTicks: 33,
  crosses: true
};

const EXPERT: HumanOptions = {
  reaction: 0.066,
  // The same shot selection as the competent player, and deliberately so: what
  // makes the expert an expert is his reaction, his placement and his charge,
  // not a licence to shoot from further out. Given a wider gate (185 / 150
  // against 165 / 130) he measured *worse* than the competent player at
  // d = 0.65 — 0.73 wins against 0.78 — because the extra shots he took were
  // the ones the competent player had already learned to decline.
  shootRange: 165,
  workRange: 130,
  aim: 0.9,
  aimSpread: 0.18,
  chargeTicks: 28,
  crosses: true
};

export function competent(): Policy {
  return makeHuman(COMPETENT);
}

export function expert(): Policy {
  return makeHuman(EXPERT);
}

/**
 * The competent player with one verb taken away and nothing else changed.
 *
 * The comparisons these feed are the regression test for this whole class of
 * bug. Absolute win rates move with every tuning pass and can be argued about;
 * "a player who passes beats the same player who never passes" cannot, and it
 * is false of any build in which passing is a net loss. The audit that found
 * passing losing the ball a third of the time, crossing unreachable and a won
 * slide handing the ball straight back would have been a three-line test.
 */
export function competentWithout(verb: 'passes' | 'crosses' | 'slides'): Policy {
  return makeHuman({ ...COMPETENT, [verb]: false });
}

/**
 * The camp spot the named catalogue entry below stands on; the wing stations
 * are `WING_REPS`, immediately after.
 *
 * They are representatives, not the whole claim: the sweeps in the suites pick
 * their own spots off the grid. What they are for is everything that needs *a*
 * policy rather than a scan — the run ladder, the goal-mix shares, the
 * double-figure ban — and they are the strongest members of their class that
 * the grid scan found, so a cap they clear is a cap that holds.
 *
 * `(120, 78)` is the corner of the penalty box on the left. Aimed at the near
 * post it measured +1.025 ladder points against `competent` at 80 pairs a rung
 * and put a side in double figures in 78 of 300 group-stage matches, with a
 * maximum scoreline of 15 — the audit's finding, spot for spot and number for
 * number. Answered: -2.193 ladder points at 150 pairs, 7.39 goals a match down
 * to 1.85, no double figures anywhere and a biggest scoreline of 5. Note that
 * it does not shoot from `(120, 78)` — it holds the aim through the whole
 * 0.55 s charge, so it drifts goalwards and releases from about 75 px off
 * centre at 25-50 px of depth, which is exactly the region the keeper's frame
 * clamp had him pinned out of.
 */
export const NEAR_CAMP_SPOT: [number, number] = [120, 78];

/**
 * The wing stations the caps that need *a* policy are measured against, and
 * the sentence above — "they are the strongest members of their class that the
 * grid scan found" — is now true of the wing as well as of the camp.
 *
 * It was not. The catalogue winger stood on `(1, 130, 55)`, which the round-6
 * scan over `WING_STATIONS` ranks **fifty-third of sixty**. Every cap that
 * asks the catalogue for "the wing routine" — the air-goals rate, the
 * double-figure ban — was therefore measured against one of the weakest
 * stations on the flank, which is why they were green on a build where the
 * strongest station reaches eleven.
 *
 * Two representatives rather than one, because the two caps rank the grid
 * differently and picking either winner alone re-opens the other's blind spot:
 *
 *   - `(-1, 90, 30)` is the ladder winner. +0.740 ladder points against
 *     `competent` (SE 0.130) and +0.420 against `expert` (SE 0.113) at 150
 *     matched pairs a rung, and 4.17 air goals a match at d = 0.25 against
 *     7.2's 3.4 ceiling.
 *   - `(1, 130, 30)` is the scoreline winner: 4.38 goals a match at d = 0.25,
 *     a biggest scoreline of eleven and 3 of 300 matches in double figures.
 *
 * Both are shallow. That is the finding, not a coincidence — see
 * `WING_STATIONS`.
 */
export const WING_REPS: Array<[-1 | 1, number, number]> = [
  [-1, 90, 30],
  [1, 130, 30]
];

export const POLICIES: Record<PolicyName, () => Policy> = {
  passive,
  dribbler,
  masher,
  competent,
  expert,
  winger: () => winger(WING_REPS[0][0], WING_REPS[0][1], WING_REPS[0][2]),
  nearCamper: () => camper(NEAR_CAMP_SPOT[0], NEAR_CAMP_SPOT[1], 'near')
};
