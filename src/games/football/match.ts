/**
 * The pure CALCIO '90 match simulation: ball physics, player steering, CPU
 * logic, keepers, and the match clock with its golden-goal extension.
 * game.ts feeds it ticks and the human's stick/buttons and renders whatever
 * it says; tests drive whole matches through it headlessly.
 *
 * Small-sided arcade rules: four outfield players and a keeper per team, a
 * walled pitch (the ball rebounds off the perimeter, so there are no
 * throw-ins or corners), and one 90-second period. A draw at full time goes
 * to a single golden-goal minute; if that too ends scoreless the match ends
 * with no winner, which the knockout ladder reads as elimination.
 */
import { clamp } from '../engine/math';
import {
  PITCH_W,
  PITCH_H,
  GOAL_TOP,
  GOAL_BOTTOM,
  BOX_DEPTH,
  TEAM_SIZE,
  attackGoalX,
  ownGoalX,
  inGoalMouth,
  anchorFor,
  type Side
} from './pitch';

export const MATCH_SECONDS = 90;
export const GOLDEN_SECONDS = 60;

/** Seconds the pre-play freeze lasts after a reset to the centre spot. */
export const KICKOFF_FREEZE = 0.9;
/** Seconds the goal celebration pauses play. */
export const GOAL_PAUSE = 2.0;

const HUMAN_SPEED = 120;
const OFFBALL_FACTOR = 0.85;
const KEEPER_SPEED = 100;
/** The ball carrier is slightly slower, so a chase can close him down. */
const DRIBBLE_FACTOR = 0.92;

/** Exponential ball friction: ~33% of the speed survives each second. */
const BALL_FRICTION = 1.1;
/** Perimeter rebound keeps this fraction of the incoming speed. */
const WALL_RESTITUTION = 0.55;

const CAPTURE_R = 11;
/** Balls faster than this beat an outfield player's trap entirely. */
const CONTROL_MAX = 300;
const TACKLE_R = 13;
/** Steals per second when a human challenges the CPU carrier. */
const HUMAN_TACKLE_RATE = 1.6;
/** Ball offset ahead of the carrier's facing. */
const DRIBBLE_OFFSET = 9;
/** Seconds after a kick during which the kicker cannot re-capture it. */
const KICK_GRACE = 0.45;

const SHOT_BASE_SPEED = 250;
const SHOT_POWER_SPEED = 170;
const PASS_MIN_SPEED = 200;
const PASS_MAX_SPEED = 330;

const KEEPER_HOLD = 0.9;
const PUNT_SPEED = 330;
/** Seconds between save attempts, so one shot rolls the dice once. */
const SAVE_COOLDOWN = 0.5;

export interface PlayerState {
  x: number;
  y: number;
  /** Facing, unit-ish; where a dribbled ball sits and a blind kick goes. */
  fx: number;
  fy: number;
}

export interface BallState {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface Owner {
  side: Side;
  idx: number;
}

export type MatchPhase = 'kickoff' | 'play' | 'goal' | 'over';

export type MatchEvent =
  | { type: 'kickoff' }
  | { type: 'goal'; side: Side; golden: boolean }
  | { type: 'shot'; side: Side }
  | { type: 'save'; side: Side }
  | { type: 'goldenGoal' }
  | { type: 'end'; winner: Side | null };

export interface MatchInput {
  /** Stick / arrow-key vector, each axis in [-1, 1]. */
  x: number;
  y: number;
}

export interface MatchState {
  /** players[side][idx]; idx 0 is the keeper. */
  players: [PlayerState[], PlayerState[]];
  ball: BallState;
  owner: Owner | null;
  phase: MatchPhase;
  /** Counts down the kickoff freeze or the goal celebration. */
  phaseTimer: number;
  timeLeft: number;
  golden: boolean;
  score: [number, number];
  /** 0..1; scales CPU speed, aim, keeper reach and tackling. */
  difficulty: number;
  /** Human outfield index currently under stick control. */
  controlled: number;
  /** Which side just scored, so the celebration knows how to resume. */
  scoredBy: Side | null;
  kickGrace: { side: Side; idx: number; t: number } | null;
  /** Seconds the owning keeper still holds the ball before punting. */
  keeperHold: number;
  saveCooldown: [number, number];
  random: () => number;
}

const dist = (ax: number, ay: number, bx: number, by: number): number =>
  Math.hypot(bx - ax, by - ay);

function freshPlayers(side: Side): PlayerState[] {
  const players: PlayerState[] = [];
  for (let idx = 0; idx < TEAM_SIZE; idx++) {
    const a = anchorFor(side, idx, PITCH_W / 2, PITCH_H / 2);
    players.push({ x: a.x, y: a.y, fx: side === 0 ? 1 : -1, fy: 0 });
  }
  return players;
}

function resetToKickoff(m: MatchState): void {
  m.players = [freshPlayers(0), freshPlayers(1)];
  m.ball = { x: PITCH_W / 2, y: PITCH_H / 2, vx: 0, vy: 0 };
  m.owner = null;
  m.kickGrace = null;
  m.keeperHold = 0;
  m.scoredBy = null;
  m.phase = 'kickoff';
  m.phaseTimer = KICKOFF_FREEZE;
}

export function createMatch(
  difficulty: number,
  random: () => number,
  duration = MATCH_SECONDS
): MatchState {
  const m: MatchState = {
    players: [freshPlayers(0), freshPlayers(1)],
    ball: { x: PITCH_W / 2, y: PITCH_H / 2, vx: 0, vy: 0 },
    owner: null,
    phase: 'kickoff',
    phaseTimer: KICKOFF_FREEZE,
    timeLeft: duration,
    golden: false,
    score: [0, 0],
    difficulty: clamp(difficulty, 0, 1),
    controlled: 4,
    scoredBy: null,
    kickGrace: null,
    keeperHold: 0,
    saveCooldown: [0, 0],
    random
  };
  return m;
}

const cpuSpeed = (d: number): number => 96 + d * 26;

function playerAt(m: MatchState, owner: Owner): PlayerState {
  return m.players[owner.side][owner.idx];
}

/** Steer a player toward a target at `speed`, arriving without jitter. */
function moveToward(p: PlayerState, tx: number, ty: number, speed: number, dt: number): void {
  const dx = tx - p.x;
  const dy = ty - p.y;
  const d = Math.hypot(dx, dy);
  if (d < 2) return;
  const step = Math.min(d, speed * dt);
  p.x += (dx / d) * step;
  p.y += (dy / d) * step;
  p.fx = dx / d;
  p.fy = dy / d;
}

function clampToPitch(p: PlayerState): void {
  p.x = clamp(p.x, 4, PITCH_W - 4);
  p.y = clamp(p.y, 4, PITCH_H - 4);
}

/** Give the ball to a player and plant it at their feet. */
function takePossession(m: MatchState, side: Side, idx: number): void {
  m.owner = { side, idx };
  m.kickGrace = null;
  m.keeperHold = idx === 0 ? KEEPER_HOLD : 0;
  m.ball.vx = 0;
  m.ball.vy = 0;
}

/** Kick the loose: clears ownership and arms the kicker's grace window. */
function kick(m: MatchState, vx: number, vy: number): void {
  const owner = m.owner;
  if (!owner) return;
  const p = playerAt(m, owner);
  m.ball.x = p.x + p.fx * DRIBBLE_OFFSET;
  m.ball.y = p.y + p.fy * DRIBBLE_OFFSET;
  m.ball.vx = vx;
  m.ball.vy = vy;
  m.kickGrace = { side: owner.side, idx: owner.idx, t: KICK_GRACE };
  m.owner = null;
}

/**
 * The teammate a pass should find: the most advanced one with a clear-ish
 * lane, scored as progress toward the attacking goal minus a penalty for
 * every opponent sitting near the passing line.
 */
export function bestPassTarget(m: MatchState, side: Side, fromIdx: number): number {
  const passer = m.players[side][fromIdx];
  const goalX = attackGoalX(side);
  let best = -1;
  let bestScore = -Infinity;
  for (let idx = 0; idx < TEAM_SIZE; idx++) {
    if (idx === fromIdx || idx === 0) continue;
    const mate = m.players[side][idx];
    const d = dist(passer.x, passer.y, mate.x, mate.y);
    if (d < 20) continue;
    let score = -Math.abs(goalX - mate.x) - d * 0.25;
    // Opponents close to the passing line make the lane risky.
    for (const opp of m.players[1 - side]) {
      const t = clamp(
        ((opp.x - passer.x) * (mate.x - passer.x) + (opp.y - passer.y) * (mate.y - passer.y)) /
          (d * d),
        0,
        1
      );
      const lx = passer.x + (mate.x - passer.x) * t;
      const ly = passer.y + (mate.y - passer.y) * t;
      if (dist(opp.x, opp.y, lx, ly) < 22) score -= 120;
    }
    if (score > bestScore) {
      bestScore = score;
      best = idx;
    }
  }
  return best;
}

function passFrom(m: MatchState, owner: Owner): boolean {
  const target = bestPassTarget(m, owner.side, owner.idx);
  if (target < 0) return false;
  const p = playerAt(m, owner);
  const mate = m.players[owner.side][target];
  const d = dist(p.x, p.y, mate.x, mate.y);
  const speed = clamp(d * 2.2, PASS_MIN_SPEED, PASS_MAX_SPEED);
  p.fx = (mate.x - p.x) / d;
  p.fy = (mate.y - p.y) / d;
  kick(m, p.fx * speed, p.fy * speed);
  return true;
}

/** Human pass button. True when a pass actually left the boot. */
export function humanPass(m: MatchState): boolean {
  if (m.phase !== 'play' || !m.owner || m.owner.side !== 0) return false;
  return passFrom(m, m.owner);
}

/**
 * Human shot, `power` 0..1 from the held button. Aimed at the goal centre
 * with the stick's vertical component bending it toward a corner.
 */
export function humanShoot(m: MatchState, power: number, aimY = 0): boolean {
  if (m.phase !== 'play' || !m.owner || m.owner.side !== 0) return false;
  const p = playerAt(m, m.owner);
  const targetY = PITCH_H / 2 + clamp(aimY, -1, 1) * 32;
  const dx = attackGoalX(0) - p.x;
  const dy = targetY - p.y;
  const d = Math.hypot(dx, dy) || 1;
  const speed = SHOT_BASE_SPEED + clamp(power, 0, 1) * SHOT_POWER_SPEED;
  p.fx = dx / d;
  p.fy = dy / d;
  kick(m, (dx / d) * speed, (dy / d) * speed);
  return true;
}

/** Nearest human outfield player to the ball, with switch hysteresis. */
function updateControlled(m: MatchState): void {
  const current = m.players[0][m.controlled];
  const currentD = dist(current.x, current.y, m.ball.x, m.ball.y);
  let nearest = m.controlled;
  let nearestD = currentD;
  for (let idx = 1; idx < TEAM_SIZE; idx++) {
    const p = m.players[0][idx];
    const d = dist(p.x, p.y, m.ball.x, m.ball.y);
    if (d < nearestD) {
      nearest = idx;
      nearestD = d;
    }
  }
  // Only switch on a clear win, so control doesn't flicker between two
  // teammates flanking the ball.
  if (nearest !== m.controlled && nearestD < currentD * 0.8) m.controlled = nearest;
  // The carrier is always the controlled player: the stick must never steer
  // a spectator while a teammate dribbles.
  if (m.owner && m.owner.side === 0 && m.owner.idx !== 0) m.controlled = m.owner.idx;
}

function stepHumans(m: MatchState, input: MatchInput, dt: number): void {
  updateControlled(m);
  for (let idx = 0; idx < TEAM_SIZE; idx++) {
    const p = m.players[0][idx];
    if (idx === m.controlled && idx !== 0) {
      const ix = clamp(input.x, -1, 1);
      const iy = clamp(input.y, -1, 1);
      const len = Math.hypot(ix, iy);
      if (len > 0.01) {
        const speed = m.owner?.side === 0 && m.owner.idx === idx ? HUMAN_SPEED * DRIBBLE_FACTOR : HUMAN_SPEED;
        p.x += (ix / len) * Math.min(1, len) * speed * dt;
        p.y += (iy / len) * Math.min(1, len) * speed * dt;
        p.fx = ix / len;
        p.fy = iy / len;
      }
    } else if (idx === 0) {
      stepKeeper(m, 0, dt);
    } else {
      const a = anchorFor(0, idx, m.ball.x, m.ball.y);
      moveToward(p, a.x, a.y, HUMAN_SPEED * OFFBALL_FACTOR, dt);
    }
    clampToPitch(p);
  }
}

function stepKeeper(m: MatchState, side: Side, dt: number): void {
  const keeper = m.players[side][0];
  const goalX = ownGoalX(side);
  const boxEdge = side === 0 ? BOX_DEPTH : PITCH_W - BOX_DEPTH;
  const ballInBox = side === 0 ? m.ball.x < boxEdge : m.ball.x > boxEdge;
  const loose = m.owner === null;
  if (loose && ballInBox && Math.hypot(m.ball.vx, m.ball.vy) < 120) {
    // A slow loose ball in the box is the keeper's to collect.
    moveToward(keeper, m.ball.x, m.ball.y, KEEPER_SPEED, dt);
  } else {
    const a = anchorFor(side, 0, m.ball.x, m.ball.y);
    moveToward(keeper, a.x, a.y, KEEPER_SPEED, dt);
  }
  keeper.x = clamp(keeper.x, side === 0 ? 6 : goalX - BOX_DEPTH + 6, side === 0 ? BOX_DEPTH - 6 : PITCH_W - 6);
  keeper.y = clamp(keeper.y, GOAL_TOP - 12, GOAL_BOTTOM + 12);
}

function cpuAttack(m: MatchState, events: MatchEvent[], dt: number): void {
  const owner = m.owner;
  if (!owner || owner.side !== 1) return;
  if (owner.idx === 0) return; // the keeper's punt clock handles it
  const p = playerAt(m, owner);
  const d = m.difficulty;
  const goalY = PITCH_H / 2;
  const goalDist = dist(p.x, p.y, attackGoalX(1), goalY);
  if (goalDist < 150 + d * 40) {
    // Shoot: sharper CPUs put it nearer the corners with less scatter.
    const corner = (m.random() < 0.5 ? -1 : 1) * (10 + d * 22);
    const err = (m.random() - 0.5) * 2 * (46 * (1 - d) + 8);
    const ty = clamp(goalY + corner + err, GOAL_TOP - 20, GOAL_BOTTOM + 20);
    const dx = attackGoalX(1) - p.x;
    const dy = ty - p.y;
    const len = Math.hypot(dx, dy) || 1;
    const speed = SHOT_BASE_SPEED + 30 + d * 90;
    p.fx = dx / len;
    p.fy = dy / len;
    kick(m, (dx / len) * speed, (dy / len) * speed);
    events.push({ type: 'shot', side: 1 });
    return;
  }
  const pressured = m.players[0].some(h => dist(h.x, h.y, p.x, p.y) < 26);
  if (pressured && m.random() < (0.8 + d * 0.8) * dt * 2) {
    if (passFrom(m, owner)) return;
  }
  // Dribble at goal, drifting toward the emptier half-space.
  const lane = m.ball.y < PITCH_H / 2 ? PITCH_H * 0.32 : PITCH_H * 0.68;
  const ty = goalDist < 220 ? goalY : lane;
  moveToward(p, attackGoalX(1), ty, cpuSpeed(d) * DRIBBLE_FACTOR, dt);
}

function stepCpu(m: MatchState, events: MatchEvent[], dt: number): void {
  const d = m.difficulty;
  const cpuOwns = m.owner?.side === 1;
  // Nearest CPU outfield player chases whenever the CPU doesn't have it.
  let chaser = -1;
  if (!cpuOwns) {
    let bestD = Infinity;
    for (let idx = 1; idx < TEAM_SIZE; idx++) {
      const p = m.players[1][idx];
      const dd = dist(p.x, p.y, m.ball.x, m.ball.y);
      if (dd < bestD) {
        bestD = dd;
        chaser = idx;
      }
    }
  }
  for (let idx = 0; idx < TEAM_SIZE; idx++) {
    const p = m.players[1][idx];
    if (idx === 0) {
      stepKeeper(m, 1, dt);
      continue;
    }
    if (m.owner && m.owner.side === 1 && m.owner.idx === idx) continue; // carrier steered by cpuAttack
    if (idx === chaser) {
      moveToward(p, m.ball.x, m.ball.y, cpuSpeed(d), dt);
    } else {
      const a = anchorFor(1, idx, m.ball.x, m.ball.y);
      moveToward(p, a.x, a.y, cpuSpeed(d) * OFFBALL_FACTOR, dt);
    }
    clampToPitch(p);
  }
  cpuAttack(m, events, dt);
}

function stepTackles(m: MatchState, dt: number): void {
  const owner = m.owner;
  if (!owner || owner.idx === 0) return; // keepers keep a caught ball
  const carrier = playerAt(m, owner);
  const defSide = (1 - owner.side) as Side;
  const rate = defSide === 0 ? HUMAN_TACKLE_RATE : 0.9 + m.difficulty * 1.3;
  for (let idx = 1; idx < TEAM_SIZE; idx++) {
    const p = m.players[defSide][idx];
    if (dist(p.x, p.y, carrier.x, carrier.y) > TACKLE_R) continue;
    if (m.random() < rate * dt) {
      takePossession(m, defSide, idx);
      return;
    }
  }
}

function tryCapture(m: MatchState): void {
  if (m.owner) return;
  const speed = Math.hypot(m.ball.vx, m.ball.vy);
  if (speed > CONTROL_MAX) return; // a driven ball beats the trap
  let best: Owner | null = null;
  let bestD = CAPTURE_R;
  for (const side of [0, 1] as const) {
    for (let idx = 0; idx < TEAM_SIZE; idx++) {
      if (m.kickGrace && m.kickGrace.side === side && m.kickGrace.idx === idx) continue;
      const p = m.players[side][idx];
      const d = dist(p.x, p.y, m.ball.x, m.ball.y);
      if (d < bestD) {
        bestD = d;
        best = { side, idx };
      }
    }
  }
  if (best) takePossession(m, best.side, best.idx);
}

function trySaves(m: MatchState, events: MatchEvent[]): void {
  if (m.owner) return;
  const speed = Math.hypot(m.ball.vx, m.ball.vy);
  if (speed < 60) return; // slow balls are collections, not saves
  for (const side of [0, 1] as const) {
    if (m.saveCooldown[side] > 0) continue;
    // Only a ball travelling toward this keeper's goal threatens it.
    const toward = side === 0 ? m.ball.vx < 0 : m.ball.vx > 0;
    if (!toward) continue;
    const keeper = m.players[side][0];
    const reach = side === 0 ? 20 : 16 + m.difficulty * 8;
    if (dist(keeper.x, keeper.y, m.ball.x, m.ball.y) > reach) continue;
    m.saveCooldown[side] = SAVE_COOLDOWN;
    const catchProb = clamp(1.25 - speed / 420, 0.15, 0.95);
    if (m.random() < catchProb) {
      takePossession(m, side, 0);
    } else {
      // Parried: back out into play, never spilled over the line.
      m.ball.vx = Math.abs(m.ball.vx) * 0.45 * (side === 0 ? 1 : -1);
      m.ball.vy += (m.random() - 0.5) * 140;
    }
    events.push({ type: 'save', side });
    return;
  }
}

function keeperDistribution(m: MatchState, dt: number): void {
  const owner = m.owner;
  if (!owner || owner.idx !== 0) return;
  m.keeperHold -= dt;
  if (m.keeperHold > 0) return;
  const p = playerAt(m, owner);
  // Punt upfield toward a varied flank so restarts don't loop identically.
  const tx = owner.side === 0 ? PITCH_W * 0.6 : PITCH_W * 0.4;
  const ty = PITCH_H * (0.25 + m.random() * 0.5);
  const dx = tx - p.x;
  const dy = ty - p.y;
  const len = Math.hypot(dx, dy) || 1;
  p.fx = dx / len;
  p.fy = dy / len;
  kick(m, (dx / len) * PUNT_SPEED, (dy / len) * PUNT_SPEED);
}

function scoreGoal(m: MatchState, side: Side, events: MatchEvent[]): void {
  m.score[side]++;
  m.scoredBy = side;
  m.owner = null;
  m.ball.vx = 0;
  m.ball.vy = 0;
  m.phase = 'goal';
  m.phaseTimer = GOAL_PAUSE;
  events.push({ type: 'goal', side, golden: m.golden });
}

function stepBall(m: MatchState, events: MatchEvent[], dt: number): void {
  const ball = m.ball;
  if (m.owner) {
    const p = playerAt(m, m.owner);
    ball.x = p.x + p.fx * DRIBBLE_OFFSET;
    ball.y = p.y + p.fy * DRIBBLE_OFFSET;
    return;
  }
  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;
  const damp = Math.exp(-BALL_FRICTION * dt);
  ball.vx *= damp;
  ball.vy *= damp;

  // Goal or rebound at either end line.
  if (ball.x < 0) {
    if (inGoalMouth(ball.y)) {
      scoreGoal(m, 1, events);
      return;
    }
    ball.x = 0;
    ball.vx = Math.abs(ball.vx) * WALL_RESTITUTION;
  } else if (ball.x > PITCH_W) {
    if (inGoalMouth(ball.y)) {
      scoreGoal(m, 0, events);
      return;
    }
    ball.x = PITCH_W;
    ball.vx = -Math.abs(ball.vx) * WALL_RESTITUTION;
  }
  if (ball.y < 0) {
    ball.y = 0;
    ball.vy = Math.abs(ball.vy) * WALL_RESTITUTION;
  } else if (ball.y > PITCH_H) {
    ball.y = PITCH_H;
    ball.vy = -Math.abs(ball.vy) * WALL_RESTITUTION;
  }
}

/** Advance the match by dt seconds; returns the events that fired. */
export function tickMatch(m: MatchState, dt: number, input: MatchInput = { x: 0, y: 0 }): MatchEvent[] {
  const events: MatchEvent[] = [];
  if (m.phase === 'over') return events;

  if (m.phase === 'kickoff') {
    m.phaseTimer -= dt;
    if (m.phaseTimer <= 0) {
      m.phase = 'play';
      events.push({ type: 'kickoff' });
    }
    return events;
  }

  if (m.phase === 'goal') {
    m.phaseTimer -= dt;
    if (m.phaseTimer <= 0) {
      if (m.golden) {
        m.phase = 'over';
        events.push({ type: 'end', winner: m.scoredBy });
      } else {
        resetToKickoff(m);
      }
    }
    return events;
  }

  // The clock only burns during open play, never through celebrations.
  m.timeLeft -= dt;
  if (m.timeLeft <= 0) {
    m.timeLeft = 0;
    if (m.golden) {
      m.phase = 'over';
      events.push({ type: 'end', winner: null });
      return events;
    }
    if (m.score[0] !== m.score[1]) {
      m.phase = 'over';
      events.push({ type: 'end', winner: m.score[0] > m.score[1] ? 0 : 1 });
      return events;
    }
    m.golden = true;
    m.timeLeft = GOLDEN_SECONDS;
    events.push({ type: 'goldenGoal' });
  }

  m.saveCooldown[0] = Math.max(0, m.saveCooldown[0] - dt);
  m.saveCooldown[1] = Math.max(0, m.saveCooldown[1] - dt);
  if (m.kickGrace) {
    m.kickGrace.t -= dt;
    if (m.kickGrace.t <= 0) m.kickGrace = null;
  }

  stepHumans(m, input, dt);
  stepCpu(m, events, dt);
  stepTackles(m, dt);
  stepBall(m, events, dt);
  if ((m.phase as MatchPhase) === 'goal') return events; // the ball just crossed the line
  trySaves(m, events);
  tryCapture(m);
  keeperDistribution(m, dt);
  return events;
}
