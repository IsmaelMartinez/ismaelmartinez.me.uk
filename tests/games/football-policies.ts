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
export type PolicyName = 'passive' | 'dribbler' | 'masher' | 'competent' | 'expert';

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
export function masher(period = 21, hold = Math.max(1, Math.round(period / 2))): Policy {
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
      think = owns ? MASH_REACTION : Math.max(MASH_REACTION, DEFENSIVE_REACTION);
    }
    return { x: steer.x, y: steer.y, a: (tick - 1) % period < held, b: false, c: false };
  };
}

/** The masher reacts as fast as the `competent` player and no faster. */
const MASH_REACTION = 0.17;

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
  const p = m.players[0][m.controlled];
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
      if (goalDist < opts.shootRange && laneBlockers(m) <= (goalDist < 190 ? 2 : 1)) {
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
      // who is further up the pitch and freer than he is, and gating the pass
      // on pressure alone left the policy playing four a match against 7.4's
      // floor of eight — and left the reward for moving the ball collectable
      // only when he was already in trouble.
      const better =
        mate >= 0 &&
        aheadOf(m, mate, p) > 40 &&
        nearestOpponent(m, m.players[0][mate].x, m.players[0][mate].y) > pressure + 12;
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
    const score = (t.y - p.y) * dir * 0.5 + nearestOpponent(m, t.x, t.y) - d * 0.2;
    if (score > bestScore) {
      bestScore = score;
      best = idx;
    }
  }
  return best;
}

const COMPETENT: HumanOptions = {
  reaction: 0.17,
  shootRange: 200,
  aim: 0.82,
  aimSpread: 0.3,
  chargeTicks: 33,
  crosses: true
};

const EXPERT: HumanOptions = {
  reaction: 0.066,
  shootRange: 205,
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

export const POLICIES: Record<PolicyName, () => Policy> = {
  passive,
  dribbler,
  masher,
  competent,
  expert
};
