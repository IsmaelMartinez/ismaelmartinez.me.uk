/**
 * Movement and decisions for everyone the stick is not steering: the human's
 * five off-ball teammates and the whole CPU side.
 *
 * The speed ledger lives here and it is a hard rule, asserted by a unit test:
 * `cpuSpeed(d) < HUMAN_SPEED` for every d in [0, 1], and a carrier is slower
 * than a free runner. The player is never out-run and never out-tackled;
 * difficulty buys the CPU better decisions, not faster legs.
 */
import { clamp } from '../engine/math';
import {
  PITCH_W,
  PITCH_L,
  CENTRE_X,
  GOAL_HALF,
  TEAM_SIZE,
  anchorFor,
  attackGoalY,
  attackDir,
  ownGoalY,
  dist,
  type Point,
  type Side
} from './pitch';
import type { MatchState, PlayerState } from './match';

/** Top speed of the player under the stick. Nothing in the game exceeds it. */
export const HUMAN_SPEED = 108;
/** Carrying the ball costs 15% of your pace, so dribbling is never the plan. */
export const DRIBBLE_FACTOR = 0.85;
/** Off-ball AI runs a shade below top speed, human side and CPU side alike. */
export const OFFBALL_FACTOR = 0.95;

/** CPU pace: 88.5 at d=0.25, 99.3 at d=0.85, always under HUMAN_SPEED. */
export function cpuSpeed(d: number): number {
  return 84 + 18 * clamp(d, 0, 1);
}

/** Base slide-tackle success. The human's is fixed; the CPU's tops out below. */
export const HUMAN_TACKLE_BASE = 0.6;
export function cpuTackleBase(d: number): number {
  return 0.44 + 0.165 * clamp(d, 0, 1);
}

/** CPU thinking time: 0.30 s at d=0.25 down to 0.12 s at d=0.85. */
export function cpuLatency(d: number): number {
  return clamp(0.375 - 0.3 * clamp(d, 0, 1), 0.1, 0.4);
}

/** How far from goal a shot is still a shot rather than a clearance. */
export const SHOOT_RANGE = 230;

/** Seconds a pressed teammate chases regardless of shape. */
export const PRESS_TIME = 1.2;

/**
 * The outfielder who should go for a loose ball. Whoever just kicked it is
 * skipped: he is standing on top of it and cannot re-capture during his grace
 * window, so letting him "chase" his own pass parks the intended receiver on
 * his formation anchor and hands half of all passes to the opposition.
 */
function chaserFor(m: MatchState, side: Side, x: number, y: number): number {
  let best = -1;
  let bestD = Infinity;
  for (let idx = 1; idx < TEAM_SIZE; idx++) {
    if (m.kickGrace && m.kickGrace.side === side && m.kickGrace.idx === idx) continue;
    const p = m.players[side][idx];
    if (p.down > 0) continue;
    const d = dist(p.x, p.y, x, y);
    if (d < bestD) {
      bestD = d;
      best = idx;
    }
  }
  return best;
}

/** The two outfielders of `side` closest to a point, nearest first. */
function twoNearest(m: MatchState, side: Side, x: number, y: number): [number, number] {
  const ranked: Array<[number, number]> = [];
  for (let idx = 1; idx < TEAM_SIZE; idx++) {
    const p = m.players[side][idx];
    ranked.push([idx, dist(p.x, p.y, x, y)]);
  }
  ranked.sort((a, b) => a[1] - b[1]);
  return [ranked[0][0], ranked[1][0]];
}

/**
 * Where an off-ball outfielder wants to be. The drifting formation anchor is
 * the default; chasing a loose ball, making a run into space and pressing the
 * carrier are the three overrides.
 */
export function offBallTarget(m: MatchState, side: Side, idx: number): Point {
  const p = m.players[side][idx];
  const ball = m.ball;
  const anchor = anchorFor(side, idx, ball.x, ball.y, m.swapped);
  const player = m.players[side][idx];

  if (player.press > 0 && m.owner && m.owner.side !== side) {
    const carrier = m.players[m.owner.side][m.owner.idx];
    return { x: carrier.x, y: carrier.y };
  }

  if (!m.owner) {
    // One outfielder goes for it, aiming where the ball will be rather than
    // where it is; everyone else keeps shape.
    const lead = { x: ball.x + ball.vx * 0.22, y: ball.y + ball.vy * 0.22 };
    if (chaserFor(m, side, lead.x, lead.y) === idx) return lead;
    return anchor;
  }

  if (m.owner.side === side) {
    if (m.owner.idx === idx) return { x: p.x, y: p.y };
    const carrier = m.players[side][m.owner.idx];
    const dir = attackDir(side, m.swapped);
    const goalY = attackGoalY(side, m.swapped);
    // The two most advanced players run into the attacking third, pulling away
    // from the carrier's lateral position so a pass has somewhere to go.
    const advanced = [...Array(TEAM_SIZE).keys()]
      .slice(1)
      .filter(i => i !== m.owner!.idx)
      .sort((a, b) => (m.players[side][b].y - m.players[side][a].y) * dir)
      .slice(0, 2);
    if (advanced.includes(idx)) {
      const away = carrier.x < CENTRE_X ? 1 : -1;
      const lane = clamp(CENTRE_X + away * (40 + (idx % 2) * 46), 24, PITCH_W - 24);
      const depth = goalY - dir * (60 + (idx % 2) * 34);
      return { x: lane, y: clamp(depth, 16, PITCH_L - 16) };
    }
    return anchor;
  }

  // Defending: the two nearest cut the carrier off, the rest drop between ball
  // and goal. Nobody presses a keeper who is holding it — crowding his
  // six-yard box would turn every goal kick into a gift.
  const carrier = m.players[m.owner.side][m.owner.idx];
  const own = ownGoalY(side, m.swapped);
  const [first, second] = twoNearest(m, side, carrier.x, carrier.y);
  if ((idx === first || idx === second) && m.owner.idx !== 0) {
    // They cannot out-run him — the speed ledger forbids it — so they run at
    // where he is going rather than where he is. Chasing a carrier's heels is
    // what let the audited build be dribbled through end to end.
    const gx = CENTRE_X - carrier.x;
    const gy = own - carrier.y;
    const glen = Math.hypot(gx, gy) || 1;
    const lead = clamp(dist(p.x, p.y, carrier.x, carrier.y) * 0.55, 0, 44);
    return {
      x: clamp(carrier.x + (gx / glen) * lead, 8, PITCH_W - 8),
      y: clamp(carrier.y + (gy / glen) * lead, 8, PITCH_L - 8)
    };
  }
  return {
    x: clamp((anchor.x + ball.x) / 2, 12, PITCH_W - 12),
    y: clamp(anchor.y * 0.45 + (ball.y * 0.35 + own * 0.2), 12, PITCH_L - 12)
  };
}

export type CarrierAction = 'shoot' | 'pass' | 'loft' | 'dribble';

export interface CarrierPlan {
  action: CarrierAction;
  /** Aim in [-1, 1] across the goal mouth; the player's envelope exactly. */
  aim: number;
  power: number;
  /** Teammate index for a pass. */
  target: number;
}

/** How crowded the corridor from `p` to the goal mouth is. */
function laneBlockers(m: MatchState, side: Side, p: PlayerState): number {
  const goalY = attackGoalY(side, m.swapped);
  const dir = attackDir(side, m.swapped);
  let blockers = 0;
  for (let idx = 1; idx < TEAM_SIZE; idx++) {
    const o = m.players[1 - side][idx];
    if ((o.y - p.y) * dir <= 0) continue;
    if ((goalY - o.y) * dir < 0) continue;
    const t = clamp((o.y - p.y) / ((goalY - p.y) || 1), 0, 1);
    const lineX = p.x + (CENTRE_X - p.x) * t;
    if (Math.abs(o.x - lineX) < 20) blockers++;
  }
  return blockers;
}

/** Score a teammate as a pass option: forward, open and not too far. */
function passScore(m: MatchState, side: Side, from: PlayerState, idx: number): number {
  const mate = m.players[side][idx];
  const dir = attackDir(side, m.swapped);
  const d = dist(from.x, from.y, mate.x, mate.y);
  if (d < 26 || d > 260) return -Infinity;
  let score = (mate.y - from.y) * dir * 0.6 - d * 0.2;
  for (let o = 1; o < TEAM_SIZE; o++) {
    const opp = m.players[1 - side][o];
    const t = clamp(
      ((opp.x - from.x) * (mate.x - from.x) + (opp.y - from.y) * (mate.y - from.y)) / (d * d),
      0,
      1
    );
    const lx = from.x + (mate.x - from.x) * t;
    const ly = from.y + (mate.y - from.y) * t;
    if (dist(opp.x, opp.y, lx, ly) < 20) score -= 110;
    if (dist(opp.x, opp.y, mate.x, mate.y) < 24) score -= 40;
  }
  return score;
}

/**
 * The CPU carrier's plan, recomputed every `cpuLatency(d)` seconds. Its aim
 * envelope is identical to the player's; only its error shrinks with
 * difficulty. The old build let the CPU aim at corners the player was
 * structurally forbidden from reaching, which was the least fair line in it.
 */
export function planCarrier(m: MatchState, side: Side, idx: number): CarrierPlan {
  const p = m.players[side][idx];
  const d = m.difficulty;
  const goalY = attackGoalY(side, m.swapped);
  const goalDist = dist(p.x, p.y, CENTRE_X, goalY);
  const keeper = m.players[1 - side][0];

  // The lane gate is the same at every difficulty. Loosening it with d made
  // the CPU shoot through traffic and turned the curve into a cliff; shot
  // *selection* is the channel difficulty flows through, and a clear lane is
  // what good selection means.
  if (goalDist < SHOOT_RANGE && laneBlockers(m, side, p) === 0) {
    // Place it away from the keeper, with the error shrinking as d rises. The
    // envelope is the player's exactly, and the clamp keeps a confident CPU
    // inside its own frame rather than aiming at the post as d approaches 1.
    const away = keeper.x <= CENTRE_X ? 1 : -1;
    const aim = clamp(
      away * (0.45 + 0.35 * d) + (m.rng() * 2 - 1) * 0.55 * (1 - d),
      -0.7,
      0.7
    );
    const power = clamp(0.45 + goalDist / 320 + 0.15 * d, 0.35, 1);
    return { action: 'shoot', aim, power, target: -1 };
  }

  let best = -1;
  let bestScore = -Infinity;
  for (let i = 1; i < TEAM_SIZE; i++) {
    if (i === idx) continue;
    const score = passScore(m, side, p, i);
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }

  const pressed = m.players[1 - side].some((o, i) => i > 0 && dist(o.x, o.y, p.x, p.y) < 30);
  const wantsPass = best >= 0 && (pressed || bestScore > 24);
  if (wantsPass) {
    const mate = m.players[side][best];
    const far = dist(p.x, p.y, mate.x, mate.y) > 150;
    return {
      action: far ? 'loft' : 'pass',
      aim: 0,
      power: clamp(dist(p.x, p.y, mate.x, mate.y) / 230, 0.3, 1),
      target: best
    };
  }
  return { action: 'dribble', aim: 0, power: 0, target: -1 };
}

/** Where a dribbling CPU carrier steers: at goal, drifting to the open lane. */
export function dribbleTarget(m: MatchState, side: Side, idx: number): Point {
  const p = m.players[side][idx];
  const goalY = attackGoalY(side, m.swapped);
  const goalDist = Math.abs(goalY - p.y);
  const lane = p.x < CENTRE_X ? CENTRE_X - GOAL_HALF : CENTRE_X + GOAL_HALF;
  return {
    x: goalDist < 170 ? CENTRE_X + (lane - CENTRE_X) * 0.35 : lane,
    y: goalY
  };
}
