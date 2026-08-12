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
export type PolicyName = 'passive' | 'dribbler' | 'competent' | 'expert';

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
      // A blocked lane is a wasted shot: from range the corridor has to be
      // clear, and only inside the box is one body in the way worth risking.
      if (goalDist < opts.shootRange && laneBlockers(m) <= (goalDist < 190 ? 2 : 1)) {
        // Place it toward the post the keeper is further from.
        const keeper = m.players[1][0];
        const side = keeper.x <= CENTRE_X ? 1 : -1;
        // Toward the post the keeper is further from, give or take: the
        // wander is drawn from the match's own RNG so a seeded match still
        // replays identically.
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
      // From the touchline the angle is not a shooting angle: the ball goes
      // into the middle for the most advanced man to attack. This is the only
      // route to the header 7.4 wants a share of the goals to come from.
      const wide = Math.abs(p.x - CENTRE_X) > GOAL_HALF + 66;
      if (opts.crosses && wide && goalDist < 160) {
        const runner = advancedTeammate(m);
        const target =
          runner >= 0
            ? m.players[0][runner]
            : { x: CENTRE_X, y: goal.y - Math.sign(goal.y - p.y) * 60 };
        const q = quantise8(target.x - p.x, target.y - p.y);
        held = { x: q.x, y: q.y, a: false, b: true, c: false };
        return held;
      }
      if (pressure < 20) {
        const mate = openTeammate(m);
        if (mate >= 0) {
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

    // Out of possession: chase, and slide only when it is genuinely on. A
    // failed slide is 0.8 s on the floor, so a player who mashes A spends the
    // match grounded — which is exactly what the cost is there to teach.
    const carrier = m.owner && m.owner.side === 1 && m.owner.idx !== 0 ? m.players[1][m.owner.idx] : null;
    const chase = carrier ?? { x: m.ball.x + m.ball.vx * 0.15, y: m.ball.y + m.ball.vy * 0.15 };
    const q = quantise8(chase.x - p.x, chase.y - p.y);
    let slide = false;
    if (carrier && slideRest === 0) {
      const d = dist(p.x, p.y, carrier.x, carrier.y);
      const toX = (carrier.x - p.x) / (d || 1);
      const toY = (carrier.y - p.y) / (d || 1);
      // Head-on only: from behind the roll is barely better than a coin flip.
      const headOn = -(carrier.fx * toX + carrier.fy * toY) > 0.5;
      slide = d < TACKLE_R && headOn;
    }
    held = { x: q.x, y: q.y, a: slide, b: false, c: false };
    if (slide) {
      charging = 2;
      slideRest = 1.1;
    }
    return held;
  };
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

export function competent(): Policy {
  return makeHuman({
    reaction: 0.17,
    shootRange: 200,
    aim: 0.58,
    aimSpread: 0.38,
    chargeTicks: 33,
    crosses: true
  });
}

export function expert(): Policy {
  return makeHuman({
    reaction: 0.066,
    shootRange: 205,
    aim: 0.62,
    aimSpread: 0.2,
    chargeTicks: 28,
    crosses: true
  });
}

export const POLICIES: Record<PolicyName, () => Policy> = {
  passive,
  dribbler,
  competent,
  expert
};
