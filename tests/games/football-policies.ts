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
  NEUTRAL_INPUT,
  SHOOT_RANGE,
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

interface HumanOptions {
  reaction: number;
  shootRange: number;
  /** Where across the mouth this player puts a shot, 0..1. */
  aim: number;
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
    think -= dt;
    if (think > 0) return held;
    think = opts.reaction;

    const p = m.players[0][m.controlled];
    const owns = !!m.owner && m.owner.side === 0 && m.owner.idx === m.controlled;

    if (owns) {
      const goal = goalPoint(m);
      const goalDist = dist(p.x, p.y, goal.x, goal.y);
      const pressure = nearestOpponent(m, p.x, p.y);
      if (goalDist < opts.shootRange && laneBlockers(m) <= 1) {
        // Place it toward the post the keeper is further from.
        const keeper = m.players[1][0];
        const side = keeper.x <= CENTRE_X ? 1 : -1;
        // Just inside the post: wide enough to stretch him, not so wide that
        // the shot spread throws it past the frame.
        held = { x: side * opts.aim, y: Math.sign(goal.y - p.y), a: true, b: false, c: false };
        charging = opts.chargeTicks;
        return held;
      }
      if (pressure < 22) {
        const mate = openTeammate(m);
        if (mate >= 0) {
          const t = m.players[0][mate];
          const q = quantise8(t.x - p.x, t.y - p.y);
          const wide = Math.abs(p.x - CENTRE_X) > GOAL_HALF + 40;
          held = { x: q.x, y: q.y, a: false, b: opts.crosses && wide, c: !(opts.crosses && wide) };
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
  return makeHuman({ reaction: 0.17, shootRange: 200, aim: 0.7, chargeTicks: 22, crosses: false });
}

export function expert(): Policy {
  return makeHuman({ reaction: 0.066, shootRange: SHOOT_RANGE, aim: 0.72, chargeTicks: 30, crosses: true });
}

export const POLICIES: Record<PolicyName, () => Policy> = {
  passive,
  dribbler,
  competent,
  expert
};
