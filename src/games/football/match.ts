/**
 * The CALCIO '90 match: ball physics with a real height axis, possession,
 * shooting, tackling, both keepers, the three stoppages and the compressed
 * clock. DOM-free and deterministic under an injected RNG, so tests play whole
 * matches headlessly at a fixed dt.
 *
 * Seven a side, two halves of thirty real seconds shown as 0' to 90', ends
 * swapped at the interval. No fouls, no cards, no offside, no extra time: a
 * knockout tie level at full time reports `pendingShootout` and shootout.ts
 * takes over.
 */
import { clamp } from '../engine/math';
import {
  PITCH_W,
  PITCH_L,
  CENTRE_X,
  CENTRE_Y,
  GOAL_HALF,
  GOAL_HEIGHT,
  TEAM_SIZE,
  anchorFor,
  attackDir,
  attackGoalY,
  ownGoalY,
  inSixYardBox,
  inPenaltyBox,
  dist,
  type Side
} from './pitch';
import { TEAMS, type Team } from './teams';
import {
  KEEPER_WALK,
  KEEPER_DIVE,
  KEEPER_HOLD,
  KEEPER_STEAL_R,
  KEEPER_STEAL_RATE,
  KEEPER_BODY_R,
  KEEPER_JUMP_Z,
  PARRY_LOCK,
  REACH_BASE,
  commitDive,
  diveProgress,
  flightTime,
  keeperReach,
  keeperSkill,
  parryVelocity,
  resolveSave,
  restPosition,
  trackBall,
  type KeeperDive
} from './keeper';
import {
  boundaryRestart,
  cornerMarkers,
  goalKickAim,
  isProtected,
  AUTO_THROW_SPEED,
  AUTO_THROW_LIFT,
  GOAL_KICK_SPEED,
  GOAL_KICK_LIFT,
  RESTART_PAUSE,
  type RestartKind,
  type RestartSpec
} from './setpieces';
import {
  HUMAN_SPEED,
  DRIBBLE_FACTOR,
  OFFBALL_FACTOR,
  HUMAN_TACKLE_BASE,
  PRESS_TIME,
  SHOOT_RANGE,
  cpuLatency,
  cpuSpeed,
  cpuTackleBase,
  dribbleTarget,
  offBallTarget,
  planCarrier,
  type CarrierPlan
} from './ai';

export { HUMAN_SPEED, DRIBBLE_FACTOR, OFFBALL_FACTOR, SHOOT_RANGE, cpuSpeed, cpuTackleBase } from './ai';

/** Real seconds per half; the displayed clock compresses this to 45'. */
export const HALF_SECONDS = 30;
/** Game minutes per real second of play. */
export const MINUTES_PER_SECOND = 1.5;
export const FULL_TIME_MINUTES = 90;

export const KICKOFF_FREEZE = 0.8;
export const GOAL_PAUSE = 1.6;
export const HALF_TIME_PAUSE = 1.4;

/** Seconds A must be held for a full-power shot. */
export const CHARGE_TIME = 0.55;

const GRAVITY = 720;
const BALL_FRICTION = 0.55;
const AIR_FRICTION = 0.06;
const BOUNCE_Z = 0.5;
const BOUNCE_H = 0.8;

export const CAPTURE_R = 10;
export const CONTROL_MAX = 330;
/**
 * A keeper gathers loose balls up to this pace and no faster. Anything quicker
 * has to go through the save roll on his plane — letting him simply trap a
 * struck shot at capture range is precisely the deterministic absorber the
 * rewrite exists to remove.
 */
export const KEEPER_TRAP_MAX = 200;
/**
 * A struck ball has to pass closer than a rolling one to be blocked: nobody
 * reacts to a 450 px/s shot from the same distance they trap a loose ball.
 * Without the tighter radius half of every shot is deflected before it reaches
 * the keeper and shot power stops mattering again.
 */
export const BLOCK_R = 7;
export const TACKLE_R = 15;
export const DRIBBLE_OFFSET = 8;
export const KICK_GRACE = 0.35;
export const WIN_GRACE = 0.5;

export const SLIDE_TIME = 0.35;
export const SLIDE_SPEED = 26 / SLIDE_TIME;
export const SLIDE_COOLDOWN = 0.45;
export const SLIDE_DOWN = 0.8;
const BODY_STEAL_RATE = 1.1;
const BODY_STEAL_R = 12;

/** Ball height windows for automatic contact selection. */
export const TRAP_Z = 6;
export const VOLLEY_Z = 10;
export const HEADER_Z = 24;

export type ContactType = 'ground' | 'volley' | 'header';

/**
 * There is no header button: the contact follows from the ball's height.
 * Whether the ball is reachable at all is a separate question — `HEADER_Z` is
 * the ceiling an outfielder can attack, enforced where the strike is offered.
 */
export function resolveContact(ballZ: number): ContactType {
  if (ballZ >= VOLLEY_Z) return 'header';
  if (ballZ >= TRAP_Z) return 'volley';
  return 'ground';
}

export interface PlayerState {
  x: number;
  y: number;
  /** Facing; where a dribbled ball sits and a blind kick goes. */
  fx: number;
  fy: number;
  /** Speed over the last frame, for the tackle roll's speed term. */
  speed: number;
  /** >0 while committed to a slide. */
  slide: number;
  /** >0 while grounded after a failed slide. */
  down: number;
  slideCd: number;
  /** >0 while carrying out a press order. */
  press: number;
  /** True once this slide has rolled against a carrier. */
  slideRolled: boolean;
}

export interface BallState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
}

export interface Owner {
  side: Side;
  idx: number;
}

export interface KeeperRuntime {
  /** Delayed copy of the ball's lateral coordinate. */
  trackX: number;
  dive: KeeperDive | null;
  hold: number;
  parryLock: number;
  skill: number;
}

export type MatchPhase = 'kickoff' | 'play' | 'goal' | 'restart' | 'halfTime' | 'over';

export interface GoalRecord {
  side: Side;
  /** Shirt index of the scorer. */
  scorer: number;
  minute: number;
  contact: ContactType;
  /** True when the ball was walked over the line rather than struck. */
  dribbled: boolean;
  /** True when the goal came off a cross or a lofted delivery. */
  fromCross: boolean;
}

export type MatchEvent =
  | { type: 'kickoff'; side: Side }
  | { type: 'goal'; side: Side; record: GoalRecord }
  | { type: 'shot'; side: Side; onTarget: boolean; contact: ContactType }
  | { type: 'save'; side: Side; caught: boolean }
  | { type: 'post'; side: Side }
  | { type: 'restart'; kind: RestartKind; side: Side }
  | { type: 'tackle'; side: Side; won: boolean }
  | { type: 'turnover'; side: Side }
  | { type: 'halfTime' }
  | { type: 'end'; winner: Side | null; pendingShootout: boolean };

export interface MatchInput {
  /** Stick, each axis in [-1, 1]. */
  x: number;
  y: number;
  /** A: shoot in possession, slide out of it. */
  a: boolean;
  /** B: lofted pass and cross in possession, press order out of it. */
  b: boolean;
  /** C: ground pass in possession, switch player out of it. */
  c: boolean;
}

export const NEUTRAL_INPUT: MatchInput = { x: 0, y: 0, a: false, b: false, c: false };

export interface MatchStats {
  shots: [number, number];
  onTarget: [number, number];
  saves: [number, number];
  catches: [number, number];
  passes: [number, number];
  passesCompleted: [number, number];
  slides: [number, number];
  slidesWon: [number, number];
  turnovers: number;
  /** Durations of every completed human possession spell, seconds. */
  spells: number[];
}

export interface MatchState {
  players: [PlayerState[], PlayerState[]];
  ball: BallState;
  owner: Owner | null;
  phase: MatchPhase;
  phaseTimer: number;
  /** The restart being taken, with its protection and release clocks. */
  restart: (RestartSpec & { elapsed: number; taker: number }) | null;
  /** Landing markers offered while a corner is held. */
  markers: Array<{ x: number; y: number }>;
  half: 0 | 1;
  /** Ends are swapped for the second half. */
  swapped: boolean;
  /** Real seconds of play elapsed this half. */
  halfElapsed: number;
  /** Displayed clock, 0..90 game minutes. */
  clock: number;
  score: [number, number];
  difficulty: number;
  teams: [Team, Team];
  keepers: [KeeperRuntime, KeeperRuntime];
  /** Human outfield index under the stick; the keeper is never selectable. */
  controlled: number;
  /** Counts down a second of 2 Hz flash on the control triangle. */
  switchFlash: number;
  kickoffSide: Side;
  lastTouch: Side;
  /** Index of the last player of each side to kick the ball. */
  lastKicker: [number, number];
  /** Contact type of the last strike, for the goal record. */
  lastContact: ContactType;
  /** True while the ball in flight came from a cross or loft. */
  lastFromCross: boolean;
  /** A pass in flight, so a teammate's capture counts as completed. */
  passInFlight: Side | null;
  /**
   * The side that last had the ball at someone's feet. A turnover is counted
   * when possession is regained by the other side, which is almost always via
   * a spell of loose ball — counting only direct hand-to-hand changes missed
   * nine turnovers in ten.
   */
  lastOwnerSide: Side | null;
  /** A ball that cannot score directly (throw-ins), cleared on the next touch. */
  noScore: boolean;
  kickGrace: { side: Side; idx: number; t: number } | null;
  winGrace: { side: Side; idx: number; t: number } | null;
  charge: number;
  charging: boolean;
  aimLatchX: number;
  aimLatchY: number;
  prev: { a: boolean; b: boolean; c: boolean };
  cpuThink: number;
  cpuPlan: CarrierPlan | null;
  knockout: boolean;
  pendingShootout: boolean;
  winner: Side | null;
  goals: GoalRecord[];
  log: MatchEvent[];
  stats: MatchStats;
  spell: number;
  halfSeconds: number;
  rng: () => number;
}

export interface MatchOptions {
  rng?: () => number;
  difficulty?: number;
  teams?: [Team, Team];
  half?: 0 | 1;
  knockout?: boolean;
  halfSeconds?: number;
}

function freshPlayer(x: number, y: number, dir: 1 | -1): PlayerState {
  return {
    x,
    y,
    fx: 0,
    fy: dir,
    speed: 0,
    slide: 0,
    down: 0,
    slideCd: 0,
    press: 0,
    slideRolled: false
  };
}

function formation(side: Side, swapped: boolean): PlayerState[] {
  const dir = attackDir(side, swapped);
  const out: PlayerState[] = [];
  for (let idx = 0; idx < TEAM_SIZE; idx++) {
    const a = anchorFor(side, idx, CENTRE_X, CENTRE_Y, swapped);
    out.push(freshPlayer(a.x, a.y, dir));
  }
  return out;
}

function freshKeeper(team: Team, difficulty: number): KeeperRuntime {
  return {
    trackX: CENTRE_X,
    dive: null,
    hold: 0,
    parryLock: 0,
    skill: keeperSkill(team.keeper, difficulty)
  };
}

export function createMatch(opts: MatchOptions = {}): MatchState {
  const rng = opts.rng ?? Math.random;
  const difficulty = clamp(opts.difficulty ?? 0.25, 0, 1);
  const teams: [Team, Team] = opts.teams ?? [TEAMS[0], TEAMS[1]];
  const half = opts.half ?? 0;
  const swapped = half === 1;
  const m: MatchState = {
    players: [formation(0, swapped), formation(1, swapped)],
    ball: { x: CENTRE_X, y: CENTRE_Y, z: 0, vx: 0, vy: 0, vz: 0 },
    owner: null,
    phase: 'kickoff',
    phaseTimer: KICKOFF_FREEZE,
    restart: null,
    markers: [],
    half,
    swapped,
    halfElapsed: 0,
    clock: half * 45,
    score: [0, 0],
    difficulty,
    teams,
    keepers: [freshKeeper(teams[0], difficulty), freshKeeper(teams[1], difficulty)],
    controlled: 6,
    switchFlash: 0,
    kickoffSide: half === 0 ? 0 : 1,
    lastTouch: 0,
    lastKicker: [6, 6],
    lastContact: 'ground',
    lastFromCross: false,
    passInFlight: null,
    lastOwnerSide: null,
    noScore: false,
    kickGrace: null,
    winGrace: null,
    charge: 0,
    charging: false,
    aimLatchX: 0,
    aimLatchY: 0,
    prev: { a: false, b: false, c: false },
    cpuThink: 0,
    cpuPlan: null,
    knockout: opts.knockout ?? false,
    pendingShootout: false,
    winner: null,
    goals: [],
    log: [],
    stats: {
      shots: [0, 0],
      onTarget: [0, 0],
      saves: [0, 0],
      catches: [0, 0],
      passes: [0, 0],
      passesCompleted: [0, 0],
      slides: [0, 0],
      slidesWon: [0, 0],
      turnovers: 0,
      spells: []
    },
    spell: 0,
    halfSeconds: opts.halfSeconds ?? HALF_SECONDS,
    rng
  };
  placeKickoff(m);
  return m;
}

function placeKickoff(m: MatchState): void {
  m.players = [formation(0, m.swapped), formation(1, m.swapped)];
  m.ball = { x: CENTRE_X, y: CENTRE_Y, z: 0, vx: 0, vy: 0, vz: 0 };
  m.owner = null;
  m.restart = null;
  m.markers = [];
  m.kickGrace = null;
  m.winGrace = null;
  m.noScore = false;
  m.passInFlight = null;
  m.lastOwnerSide = null;
  m.lastFromCross = false;
  m.charge = 0;
  m.charging = false;
  for (const gk of m.keepers) {
    gk.dive = null;
    gk.hold = 0;
    gk.parryLock = 0;
    gk.trackX = CENTRE_X;
  }
  const taker = m.players[m.kickoffSide][6];
  const dir = attackDir(m.kickoffSide, m.swapped);
  taker.x = CENTRE_X;
  taker.y = CENTRE_Y - dir * (DRIBBLE_OFFSET + 1);
  taker.fx = 0;
  taker.fy = dir;
  m.phase = 'kickoff';
  m.phaseTimer = KICKOFF_FREEZE;
  m.controlled = 6;
}

/* ------------------------------------------------------------------ */
/* possession                                                          */

function playerAt(m: MatchState, owner: Owner): PlayerState {
  return m.players[owner.side][owner.idx];
}

function endSpell(m: MatchState): void {
  if (m.spell > 0) {
    m.stats.spells.push(m.spell);
    m.spell = 0;
  }
}

function takePossession(m: MatchState, side: Side, idx: number, won: boolean): void {
  const before = m.owner;
  if (m.lastOwnerSide !== null && m.lastOwnerSide !== side) {
    m.stats.turnovers++;
    m.log.push({ type: 'turnover', side });
  }
  m.lastOwnerSide = side;
  if (before && before.side === 0 && side !== 0) endSpell(m);
  m.owner = { side, idx };
  m.lastTouch = side;
  m.kickGrace = null;
  m.passInFlight = null;
  m.lastFromCross = false;
  m.ball.z = 0;
  m.ball.vx = 0;
  m.ball.vy = 0;
  m.ball.vz = 0;
  m.keepers[0].dive = null;
  m.keepers[1].dive = null;
  if (idx === 0) m.keepers[side].hold = KEEPER_HOLD;
  if (won) m.winGrace = { side, idx, t: WIN_GRACE };
  m.noScore = false;
}

/** Kick the ball loose from the current carrier, arming the re-capture grace. */
function kick(m: MatchState, vx: number, vy: number, vz: number): void {
  const owner = m.owner;
  if (!owner) return;
  const p = playerAt(m, owner);
  m.ball.x = p.x + p.fx * DRIBBLE_OFFSET;
  m.ball.y = p.y + p.fy * DRIBBLE_OFFSET;
  m.ball.vx = vx;
  m.ball.vy = vy;
  m.ball.vz = vz;
  m.kickGrace = { side: owner.side, idx: owner.idx, t: KICK_GRACE };
  m.lastTouch = owner.side;
  m.lastKicker[owner.side] = owner.idx;
  m.winGrace = null;
  m.owner = null;
  if (owner.side === 0) endSpell(m);
}

/* ------------------------------------------------------------------ */
/* shooting and passing                                                */

function accuracyScale(team: Team): number {
  return 1.25 - 0.5 * (team.skill / 5);
}

function signed(m: MatchState): number {
  return m.rng() * 2 - 1;
}

/**
 * Fire at goal. The aim envelope is +-(GOAL_HALF + 14) against a +-GOAL_HALF
 * mouth, so a player can hit either post and can genuinely miss — that width
 * is what makes placement a real decision instead of a keyhole to find.
 */
export function shoot(
  m: MatchState,
  side: Side,
  power: number,
  aim: number,
  contact: ContactType
): void {
  const owner = m.owner;
  if (!owner) return;
  const p = playerAt(m, owner);
  const goalY = attackGoalY(side, m.swapped);
  const d = dist(p.x, p.y, CENTRE_X, goalY);
  const scale = accuracyScale(m.teams[side]);
  const header = contact === 'header';
  const spread =
    (signed(m) * (9 - 5 * clamp(power, 0, 1)) + signed(m) * (d / 45) + (header ? signed(m) * 10 : 0)) *
    scale;
  const targetX = clamp(CENTRE_X + clamp(aim, -1, 1) * (GOAL_HALF + 14) + spread, 6, PITCH_W - 6);
  const dx = targetX - p.x;
  const dy = goalY - p.y;
  const len = Math.hypot(dx, dy) || 1;
  const speed = header ? 260 : 300 + 150 * clamp(power, 0, 1);
  p.fx = dx / len;
  p.fy = dy / len;
  const fromCross = m.lastFromCross;
  kick(m, (dx / len) * speed, (dy / len) * speed, 0);
  m.lastContact = contact;
  m.lastFromCross = fromCross;
  m.passInFlight = null;
  m.stats.shots[side]++;
  const onTarget = Math.abs(targetX - CENTRE_X) < GOAL_HALF;
  if (onTarget) m.stats.onTarget[side]++;
  m.log.push({ type: 'shot', side, onTarget, contact });
  armKeeper(m, side);
}

/** Out of shooting range A is a clearance driven up-pitch. A manual quirk. */
function clearUpfield(m: MatchState, side: Side, power: number, aim: number): void {
  const owner = m.owner;
  if (!owner) return;
  const p = playerAt(m, owner);
  const dir = attackDir(side, m.swapped);
  const lateral = clamp(aim, -1, 1) * 0.6;
  const len = Math.hypot(lateral, 1);
  const speed = 250 + 110 * clamp(power, 0, 1);
  p.fx = lateral / len;
  p.fy = (dir as number) / len;
  kick(m, (lateral / len) * speed, ((dir as number) / len) * speed, 150);
  m.lastContact = 'ground';
  m.lastFromCross = false;
  armKeeper(m, side);
}

/**
 * The teammate a ground pass should find. Among teammates within 220 px whose
 * bearing is within 35 degrees of the stick, the nearest wins. This assist is
 * a deliberate departure from the original's purely directional passing:
 * short passing has to be viable or the game is hoof-and-hope.
 */
export function passAssist(
  m: MatchState,
  side: Side,
  idx: number,
  aimX: number,
  aimY: number
): number {
  const p = m.players[side][idx];
  const len = Math.hypot(aimX, aimY);
  if (len < 0.2) return -1;
  const ax = aimX / len;
  const ay = aimY / len;
  const cone = Math.cos((35 * Math.PI) / 180);
  let best = -1;
  let bestD = Infinity;
  for (let i = 1; i < TEAM_SIZE; i++) {
    if (i === idx) continue;
    const mate = m.players[side][i];
    const dx = mate.x - p.x;
    const dy = mate.y - p.y;
    const d = Math.hypot(dx, dy);
    if (d < 20 || d > 220) continue;
    if ((dx * ax + dy * ay) / d < cone) continue;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

function groundPass(m: MatchState, side: Side, aimX: number, aimY: number, power: number): void {
  const owner = m.owner;
  if (!owner) return;
  const p = playerAt(m, owner);
  const mate = passAssist(m, side, owner.idx, aimX, aimY);
  const scale = accuracyScale(m.teams[side]);
  let dx = aimX;
  let dy = aimY;
  let speed = 190 + 110 * clamp(power, 0, 1);
  if (mate >= 0) {
    const t = m.players[side][mate];
    const d = dist(p.x, p.y, t.x, t.y);
    speed = clamp(190 + 110 * (d / 220), 190, 300);
    const flight = d / speed;
    dx = t.x - p.x + t.fx * t.speed * flight + signed(m) * 7 * scale;
    dy = t.y - p.y + t.fy * t.speed * flight + signed(m) * 7 * scale;
  }
  const len = Math.hypot(dx, dy) || 1;
  p.fx = dx / len;
  p.fy = dy / len;
  kick(m, (dx / len) * speed, (dy / len) * speed, 0);
  m.lastContact = 'ground';
  m.lastFromCross = false;
  m.passInFlight = side;
  m.stats.passes[side]++;
  armKeeper(m, side);
}

function loftedPass(m: MatchState, side: Side, aimX: number, aimY: number, power: number): void {
  const owner = m.owner;
  if (!owner) return;
  const p = playerAt(m, owner);
  let dx = aimX;
  let dy = aimY;
  if (Math.hypot(dx, dy) < 0.2) {
    dx = p.fx;
    dy = p.fy;
  }
  const len = Math.hypot(dx, dy) || 1;
  const speed = 150 + 90 * clamp(power, 0, 1);
  p.fx = dx / len;
  p.fy = dy / len;
  kick(m, (dx / len) * speed, (dy / len) * speed, 210 + 60 * clamp(power, 0, 1));
  m.lastContact = 'ground';
  m.lastFromCross = true;
  m.passInFlight = side;
  m.stats.passes[side]++;
  armKeeper(m, side);
}

/** Deliver a cross onto a chosen landing marker; corners use this. */
function crossTo(m: MatchState, side: Side, target: { x: number; y: number }): void {
  const owner = m.owner;
  if (!owner) return;
  const p = playerAt(m, owner);
  const dx = target.x - p.x + signed(m) * 8;
  const dy = target.y - p.y + signed(m) * 8;
  const len = Math.hypot(dx, dy) || 1;
  const flight = clamp(len / 190, 0.55, 1.4);
  p.fx = dx / len;
  p.fy = dy / len;
  kick(m, dx / flight, dy / flight, (GRAVITY * flight) / 2);
  m.lastContact = 'ground';
  m.lastFromCross = true;
  m.passInFlight = side;
  m.stats.passes[side]++;
  armKeeper(m, side);
}

/**
 * A header or volley on a ball still in the air, with the aim taken straight
 * from the stick and no charge. This is what keeps a cross a real weapon from
 * angles a ground shot cannot use.
 */
function airStrike(m: MatchState, side: Side, idx: number, aim: number): void {
  const contact = resolveContact(m.ball.z);
  m.owner = { side, idx };
  shoot(m, side, contact === 'header' ? 1 : 0.8, aim, contact);
}

function canAirStrike(m: MatchState, side: Side, idx: number): boolean {
  if (m.owner) return false;
  if (m.ball.z < TRAP_Z || m.ball.z > HEADER_Z) return false;
  if (m.kickGrace && m.kickGrace.side === side && m.kickGrace.idx === idx) return false;
  const p = m.players[side][idx];
  return dist(p.x, p.y, m.ball.x, m.ball.y) < CAPTURE_R + 5;
}

/* ------------------------------------------------------------------ */
/* keeper                                                              */

/** Let the defending keeper commit once, at the instant of release. */
function armKeeper(m: MatchState, kickingSide: Side): void {
  const ds = (1 - kickingSide) as Side;
  const gk = m.keepers[ds];
  const keeper = m.players[ds][0];
  const dir = attackDir(ds, m.swapped);
  const ball = m.ball;
  const speed = Math.hypot(ball.vx, ball.vy);
  if (speed < 60) return;
  const toPlane = (keeper.y - ball.y) * -dir;
  if (toPlane <= 0) return;
  const along = -dir * ball.vy;
  if (along <= 0) return;
  const travel = (toPlane * speed) / along;
  const t = flightTime(travel, speed);
  if (!Number.isFinite(t) || t > 2.5) return;
  gk.dive = commitDive({
    restX: keeper.x,
    interceptX: ball.x + (ball.vx / speed) * travel,
    flightT: t,
    skill: gk.skill,
    speed,
    rng: m.rng
  });
}

function stepKeeper(m: MatchState, side: Side, dt: number): void {
  const gk = m.keepers[side];
  const keeper = m.players[side][0];
  const goalY = ownGoalY(side, m.swapped);
  const dir = attackDir(side, m.swapped);
  gk.parryLock = Math.max(0, gk.parryLock - dt);

  if (m.owner) gk.dive = null;

  if (gk.dive) {
    gk.dive.elapsed += dt;
    const step = KEEPER_DIVE * dt;
    const next = keeper.x + clamp(gk.dive.targetX - keeper.x, -step, step);
    keeper.x = clamp(next, gk.dive.fromX - gk.dive.budget, gk.dive.fromX + gk.dive.budget);
    if (gk.dive.elapsed > 1.2) gk.dive = null;
    return;
  }

  gk.trackX = trackBall(gk.trackX, m.ball.x, gk.skill, dt);
  const rest = restPosition(gk.trackX, m.ball.y, goalY, dir);
  let tx = rest.x;
  let ty = rest.y;
  const slow = Math.hypot(m.ball.vx, m.ball.vy) < 150;
  if (!m.owner && slow && inPenaltyBox(m.ball.x, m.ball.y, goalY) && m.ball.z < KEEPER_JUMP_Z) {
    tx = m.ball.x;
    ty = m.ball.y;
  }
  moveToward(keeper, tx, ty, KEEPER_WALK, dt);
  keeper.x = clamp(keeper.x, 12, PITCH_W - 12);
  keeper.y = clamp(
    keeper.y,
    Math.min(goalY, goalY + dir * 70),
    Math.max(goalY, goalY + dir * 70)
  );
}

/**
 * Resolve a loose ball crossing a keeper's plane. This is the load-bearing
 * path: being within reach is a roll, not an absorption, and beating him still
 * only concedes if the ball is genuinely between the posts.
 */
function keeperPlane(m: MatchState, side: Side, prevY: number, events: MatchEvent[]): void {
  const gk = m.keepers[side];
  if (gk.parryLock > 0) return;
  const keeper = m.players[side][0];
  const goalY = ownGoalY(side, m.swapped);
  const dir = attackDir(side, m.swapped);
  const relPrev = (prevY - goalY) * dir;
  const relNow = (m.ball.y - goalY) * dir;
  const relKeeper = (keeper.y - goalY) * dir;
  if (!(relPrev > relKeeper && relNow <= relKeeper)) return;
  if (m.ball.z > KEEPER_JUMP_Z) return;

  const speed = Math.hypot(m.ball.vx, m.ball.vy);
  if (speed < 40) return;
  const gap = Math.abs(m.ball.x - keeper.x);
  const reach = gk.dive ? keeperReach(diveProgress(gk.dive.elapsed)) : REACH_BASE;
  const outcome = resolveSave({ gap, reach, speed, skill: gk.skill, rng: m.rng });
  if (outcome === 'beaten') return;

  m.stats.saves[side]++;
  gk.dive = null;
  if (outcome === 'caught') {
    m.stats.catches[side]++;
    m.ball.x = keeper.x;
    m.ball.y = keeper.y;
    takePossession(m, side, 0, true);
    events.push({ type: 'save', side, caught: true });
    return;
  }
  const v = parryVelocity(speed, dir, m.rng);
  m.ball.x = keeper.x;
  m.ball.y = keeper.y + dir * 6;
  m.ball.z = 2;
  m.ball.vx = v.vx;
  m.ball.vy = v.vy;
  m.ball.vz = 40;
  m.lastTouch = side;
  m.passInFlight = null;
  m.noScore = false;
  gk.parryLock = PARRY_LOCK;
  m.kickGrace = { side, idx: 0, t: KICK_GRACE };
  events.push({ type: 'save', side, caught: false });
}

/* ------------------------------------------------------------------ */
/* movement                                                            */

function moveToward(p: PlayerState, tx: number, ty: number, speed: number, dt: number): void {
  const dx = tx - p.x;
  const dy = ty - p.y;
  const d = Math.hypot(dx, dy);
  if (d < 1.5) {
    p.speed = 0;
    return;
  }
  const step = Math.min(d, speed * dt);
  p.x += (dx / d) * step;
  p.y += (dy / d) * step;
  p.fx = dx / d;
  p.fy = dy / d;
  p.speed = step / dt;
}

function clampToPitch(p: PlayerState): void {
  p.x = clamp(p.x, 4, PITCH_W - 4);
  p.y = clamp(p.y, 4, PITCH_L - 4);
}

function stepTimers(p: PlayerState, dt: number): void {
  p.slide = Math.max(0, p.slide - dt);
  p.down = Math.max(0, p.down - dt);
  p.slideCd = Math.max(0, p.slideCd - dt);
  p.press = Math.max(0, p.press - dt);
  if (p.slide === 0) p.slideRolled = false;
}

function carrySpeed(m: MatchState, side: Side, idx: number, base: number): number {
  return m.owner && m.owner.side === side && m.owner.idx === idx ? base * DRIBBLE_FACTOR : base;
}

/* ------------------------------------------------------------------ */
/* human control                                                       */

/** Nearest human outfielder to the ball, with a 30 px hysteresis band. */
function updateControlled(m: MatchState, dt: number): void {
  m.switchFlash = Math.max(0, m.switchFlash - dt);
  if (m.owner && m.owner.side === 0 && m.owner.idx !== 0) {
    if (m.controlled !== m.owner.idx) {
      m.controlled = m.owner.idx;
      m.switchFlash = 1;
    }
    return;
  }
  const cur = m.players[0][m.controlled];
  const curD = dist(cur.x, cur.y, m.ball.x, m.ball.y);
  let best = m.controlled;
  let bestD = curD;
  for (let idx = 1; idx < TEAM_SIZE; idx++) {
    const p = m.players[0][idx];
    const d = dist(p.x, p.y, m.ball.x, m.ball.y);
    if (d < bestD) {
      best = idx;
      bestD = d;
    }
  }
  if (best !== m.controlled && curD - bestD > 30) {
    m.controlled = best;
    m.switchFlash = 1;
  }
}

/** C out of possession cycles control through the three nearest teammates. */
function cycleControl(m: MatchState): void {
  const ranked = [...Array(TEAM_SIZE).keys()]
    .slice(1)
    .sort(
      (a, b) =>
        dist(m.players[0][a].x, m.players[0][a].y, m.ball.x, m.ball.y) -
        dist(m.players[0][b].x, m.players[0][b].y, m.ball.x, m.ball.y)
    )
    .slice(0, 3);
  const at = ranked.indexOf(m.controlled);
  m.controlled = ranked[(at + 1) % ranked.length];
  m.switchFlash = 1;
}

/** B out of possession orders the nearest teammate to close the carrier down. */
function pressOrder(m: MatchState): void {
  let best = -1;
  let bestD = Infinity;
  for (let idx = 1; idx < TEAM_SIZE; idx++) {
    if (idx === m.controlled) continue;
    const p = m.players[0][idx];
    const d = dist(p.x, p.y, m.ball.x, m.ball.y);
    if (d < bestD) {
      bestD = d;
      best = idx;
    }
  }
  if (best >= 0) m.players[0][best].press = PRESS_TIME;
}

function startSlide(m: MatchState, side: Side, idx: number): void {
  const p = m.players[side][idx];
  if (p.slide > 0 || p.down > 0 || p.slideCd > 0) return;
  p.slide = SLIDE_TIME;
  p.slideCd = SLIDE_TIME + SLIDE_COOLDOWN;
  p.slideRolled = false;
  m.stats.slides[side]++;
}

function pickMarker(m: MatchState, input: MatchInput): { x: number; y: number } {
  if (m.markers.length === 0) return { x: CENTRE_X, y: CENTRE_Y };
  if (input.x < -0.4) return m.markers[0];
  if (input.x > 0.4) return m.markers[2];
  return m.markers[1];
}

function humanAction(m: MatchState, input: MatchInput, dt: number): void {
  const aPressed = input.a && !m.prev.a;
  const aReleased = !input.a && m.prev.a;
  const bPressed = input.b && !m.prev.b;
  const bReleased = !input.b && m.prev.b;
  const cPressed = input.c && !m.prev.c;
  const anyPressed = aPressed || bPressed || cPressed;

  const stick = Math.hypot(input.x, input.y);
  if (stick > 0.2) {
    m.aimLatchX = input.x / stick;
    m.aimLatchY = input.y / stick;
  }

  // A human goal kick is taken by the keeper; the stick aims it, any button
  // releases it, and the 2.5 s deadline clears it either way.
  if (m.restart && m.restart.side === 0 && m.restart.keeperTakes && m.owner?.idx === 0) {
    if (anyPressed) {
      const dir = attackDir(0, m.swapped);
      const aim = goalKickAim(input.x, input.y, dir);
      const p = m.players[0][0];
      p.fx = aim.x;
      p.fy = aim.y;
      kick(m, aim.x * GOAL_KICK_SPEED, aim.y * GOAL_KICK_SPEED, GOAL_KICK_LIFT);
      m.lastFromCross = true;
      m.restart = null;
      armKeeper(m, 0);
    }
    return;
  }

  const owns = !!m.owner && m.owner.side === 0 && m.owner.idx === m.controlled;

  if (owns) {
    if (aPressed) {
      m.charging = true;
      m.charge = 0;
    }
    if (m.charging && input.a) m.charge = Math.min(CHARGE_TIME, m.charge + dt);
    if (aReleased && m.charging) {
      m.charging = false;
      const power = clamp(0.35 + (m.charge / CHARGE_TIME) * 0.65, 0.35, 1);
      const aim =
        stick > 0.2
          ? input.x
          : Math.abs(m.aimLatchX) > 0.2
            ? m.aimLatchX
            : m.players[0][m.controlled].fx;
      const goalY = attackGoalY(0, m.swapped);
      const p = m.players[0][m.controlled];
      if (dist(p.x, p.y, CENTRE_X, goalY) <= SHOOT_RANGE) {
        shoot(m, 0, power, clamp(aim, -1, 1), 'ground');
      } else {
        clearUpfield(m, 0, power, clamp(aim, -1, 1));
      }
      return;
    }
    if (m.restart?.kind === 'corner' && bReleased) {
      crossTo(m, 0, pickMarker(m, input));
      m.restart = null;
      m.markers = [];
      return;
    }
    if (bPressed && m.restart?.kind !== 'corner') {
      loftedPass(m, 0, input.x, input.y, 0.6);
      return;
    }
    if (cPressed) {
      const p = m.players[0][m.controlled];
      const ax = stick > 0.2 ? input.x : p.fx;
      const ay = stick > 0.2 ? input.y : p.fy;
      groundPass(m, 0, ax, ay, 0.6);
      return;
    }
    return;
  }

  m.charging = false;
  if (aPressed) {
    if (canAirStrike(m, 0, m.controlled)) {
      const aim = stick > 0.2 ? input.x : m.aimLatchX;
      airStrike(m, 0, m.controlled, clamp(aim, -1, 1));
      return;
    }
    startSlide(m, 0, m.controlled);
  }
  if (bPressed) pressOrder(m);
  if (cPressed) cycleControl(m);
}

function stepHumanSide(m: MatchState, input: MatchInput, dt: number): void {
  for (let idx = 0; idx < TEAM_SIZE; idx++) {
    const p = m.players[0][idx];
    stepTimers(p, dt);
    if (idx === 0) {
      stepKeeper(m, 0, dt);
      continue;
    }
    if (p.down > 0) {
      p.speed = 0;
      continue;
    }
    if (p.slide > 0) {
      p.x += p.fx * SLIDE_SPEED * dt;
      p.y += p.fy * SLIDE_SPEED * dt;
      p.speed = SLIDE_SPEED;
      clampToPitch(p);
      continue;
    }
    if (idx === m.controlled) {
      const len = Math.hypot(input.x, input.y);
      if (len > 0.05) {
        const mag = Math.min(1, len);
        const speed = carrySpeed(m, 0, idx, HUMAN_SPEED) * mag;
        p.x += (input.x / len) * speed * dt;
        p.y += (input.y / len) * speed * dt;
        p.fx = input.x / len;
        p.fy = input.y / len;
        p.speed = speed;
      } else {
        p.speed = 0;
      }
      clampToPitch(p);
      continue;
    }
    const t = offBallTarget(m, 0, idx);
    moveToward(p, t.x, t.y, carrySpeed(m, 0, idx, HUMAN_SPEED * OFFBALL_FACTOR), dt);
    clampToPitch(p);
  }
}

/* ------------------------------------------------------------------ */
/* CPU                                                                 */

function stepCpuSide(m: MatchState, dt: number): void {
  const speed = cpuSpeed(m.difficulty);
  for (let idx = 0; idx < TEAM_SIZE; idx++) {
    const p = m.players[1][idx];
    stepTimers(p, dt);
    if (idx === 0) {
      stepKeeper(m, 1, dt);
      continue;
    }
    if (p.down > 0) {
      p.speed = 0;
      continue;
    }
    if (p.slide > 0) {
      p.x += p.fx * SLIDE_SPEED * dt;
      p.y += p.fy * SLIDE_SPEED * dt;
      p.speed = SLIDE_SPEED;
      clampToPitch(p);
      continue;
    }
    if (m.owner && m.owner.side === 1 && m.owner.idx === idx) continue;
    const t = offBallTarget(m, 1, idx);
    moveToward(p, t.x, t.y, speed * OFFBALL_FACTOR, dt);
    clampToPitch(p);
  }
  cpuAirStrike(m);
  stepCpuCarrier(m, dt);
  stepCpuDefence(m, dt);
}

/** The CPU attacks a cross in its attacking box, the same weapon the human has. */
function cpuAirStrike(m: MatchState): void {
  if (m.owner || m.ball.z < TRAP_Z || m.ball.z > HEADER_Z) return;
  const goalY = attackGoalY(1, m.swapped);
  if (Math.abs(m.ball.y - goalY) > 90) return;
  for (let idx = 1; idx < TEAM_SIZE; idx++) {
    if (!canAirStrike(m, 1, idx)) continue;
    const keeper = m.players[0][0];
    const away = keeper.x <= CENTRE_X ? 1 : -1;
    const aim = clamp(away * (0.4 + 0.3 * m.difficulty) + signed(m) * 0.5 * (1 - m.difficulty), -1, 1);
    airStrike(m, 1, idx, aim);
    return;
  }
}

function stepCpuCarrier(m: MatchState, dt: number): void {
  const owner = m.owner;
  if (!owner || owner.side !== 1 || owner.idx === 0) return;
  if (m.restart && m.restart.side === 1 && isProtected(m.restart.elapsed)) return;
  m.cpuThink -= dt;
  if (m.cpuThink <= 0 || !m.cpuPlan) {
    m.cpuPlan = planCarrier(m, 1, owner.idx);
    m.cpuThink = cpuLatency(m.difficulty);
  }
  const plan = m.cpuPlan;
  const p = m.players[1][owner.idx];
  if (plan.action === 'shoot') {
    shoot(m, 1, plan.power, plan.aim, 'ground');
    m.cpuPlan = null;
    return;
  }
  if ((plan.action === 'pass' || plan.action === 'loft') && plan.target >= 0) {
    const mate = m.players[1][plan.target];
    const scale = 1.4 - 0.7 * m.difficulty;
    const ax = mate.x - p.x + signed(m) * 14 * scale;
    const ay = mate.y - p.y + signed(m) * 14 * scale;
    if (plan.action === 'loft') loftedPass(m, 1, ax, ay, plan.power);
    else groundPass(m, 1, ax, ay, plan.power);
    m.cpuPlan = null;
    return;
  }
  const t = dribbleTarget(m, 1, owner.idx);
  moveToward(p, t.x, t.y, cpuSpeed(m.difficulty) * DRIBBLE_FACTOR, dt);
  clampToPitch(p);
}

/** The CPU slides when it is close, facing, and the odds are worth it. */
function stepCpuDefence(m: MatchState, dt: number): void {
  const owner = m.owner;
  if (!owner || owner.side !== 0 || owner.idx === 0) return;
  const carrier = playerAt(m, owner);
  for (let idx = 1; idx < TEAM_SIZE; idx++) {
    const p = m.players[1][idx];
    if (p.slide > 0 || p.down > 0 || p.slideCd > 0) continue;
    if (dist(p.x, p.y, carrier.x, carrier.y) > TACKLE_R + 6) continue;
    if (m.rng() < (0.6 + m.difficulty) * dt) startSlide(m, 1, idx);
  }
}

/* ------------------------------------------------------------------ */
/* tackling                                                            */

function graceProtected(m: MatchState, side: Side, idx: number): boolean {
  if (m.winGrace && m.winGrace.side === side && m.winGrace.idx === idx && m.winGrace.t > 0) {
    return true;
  }
  if (m.restart && m.restart.side === side && isProtected(m.restart.elapsed)) return true;
  return false;
}

function knockLoose(m: MatchState, side: Side, idx: number): void {
  if (!m.owner) return;
  const carrier = playerAt(m, m.owner);
  const p = m.players[side][idx];
  const dx = carrier.x - p.x;
  const dy = carrier.y - p.y;
  const len = Math.hypot(dx, dy) || 1;
  m.ball.x = carrier.x + (dx / len) * 14;
  m.ball.y = carrier.y + (dy / len) * 14;
  m.ball.z = 0;
  m.ball.vx = (dx / len) * 60;
  m.ball.vy = (dy / len) * 60;
  m.ball.vz = 0;
  if (m.owner.side === 0) endSpell(m);
  m.owner = null;
  m.lastTouch = side;
  m.passInFlight = null;
  m.noScore = false;
  m.winGrace = { side, idx, t: WIN_GRACE };
}

function stepTackles(m: MatchState, dt: number, events: MatchEvent[]): void {
  const owner = m.owner;
  if (!owner) return;
  const carrier = playerAt(m, owner);
  const defSide = (1 - owner.side) as Side;

  // The keeper has a body: walking the ball in through him is impossible,
  // while a dribbled finish from an open angle around him still counts.
  const gkGoal = ownGoalY(defSide, m.swapped);
  const gk = m.players[defSide][0];
  const gkGap = dist(gk.x, gk.y, carrier.x, carrier.y);
  if (
    owner.idx !== 0 &&
    inSixYardBox(carrier.x, carrier.y, gkGoal) &&
    gkGap < KEEPER_STEAL_R &&
    !graceProtected(m, owner.side, owner.idx) &&
    (gkGap < KEEPER_BODY_R || m.rng() < KEEPER_STEAL_RATE * dt)
  ) {
    m.ball.x = gk.x;
    m.ball.y = gk.y;
    takePossession(m, defSide, 0, true);
    return;
  }

  if (owner.idx === 0) return;
  if (graceProtected(m, owner.side, owner.idx)) return;

  const base = defSide === 0 ? HUMAN_TACKLE_BASE : cpuTackleBase(m.difficulty);
  for (let idx = 1; idx < TEAM_SIZE; idx++) {
    const p = m.players[defSide][idx];
    const d = dist(p.x, p.y, carrier.x, carrier.y);

    if (p.slide > 0 && !p.slideRolled && d <= TACKLE_R) {
      p.slideRolled = true;
      if (m.rng() < slideChance(base, carrier, p)) {
        m.stats.slidesWon[defSide]++;
        knockLoose(m, defSide, idx);
        events.push({ type: 'tackle', side: defSide, won: true });
        return;
      }
      p.slide = 0;
      p.down = SLIDE_DOWN;
      events.push({ type: 'tackle', side: defSide, won: false });
      continue;
    }

    // Body steal: the quieter mechanic that keeps close defending viable
    // without slide-spam.
    if (p.slide === 0 && p.down === 0 && d < BODY_STEAL_R && d > 0) {
      const toX = (carrier.x - p.x) / d;
      const toY = (carrier.y - p.y) / d;
      const head = -(carrier.fx * toX + carrier.fy * toY);
      if (head > Math.cos((55 * Math.PI) / 180) && m.rng() < BODY_STEAL_RATE * dt) {
        knockLoose(m, defSide, idx);
        m.ball.x = p.x + p.fx * DRIBBLE_OFFSET;
        m.ball.y = p.y + p.fy * DRIBBLE_OFFSET;
        takePossession(m, defSide, idx, true);
        return;
      }
    }
  }
}

/**
 * One roll per slide, not one per frame: a slide is a single committed act, so
 * its published success rate is the number a player can reason about.
 */
export function slideChance(base: number, carrier: PlayerState, tackler: PlayerState): number {
  const dx = carrier.x - tackler.x;
  const dy = carrier.y - tackler.y;
  const len = Math.hypot(dx, dy) || 1;
  const cos = -(carrier.fx * (dx / len) + carrier.fy * (dy / len));
  const facing = cos > 0.5 ? 1 : cos > -0.17 ? 0.7 : 0.45;
  const speedDiff = clamp((carrier.speed - tackler.speed) / HUMAN_SPEED, 0, 0.4);
  return base * facing * (1 - speedDiff);
}

/* ------------------------------------------------------------------ */
/* ball                                                                */

function tryCapture(m: MatchState): void {
  if (m.owner) return;
  if (m.ball.z >= TRAP_Z) return;
  const speed = Math.hypot(m.ball.vx, m.ball.vy);
  let best: Owner | null = null;
  let bestD = speed > CONTROL_MAX ? BLOCK_R : CAPTURE_R;
  for (const side of [0, 1] as const) {
    for (let idx = 0; idx < TEAM_SIZE; idx++) {
      if (m.kickGrace && m.kickGrace.side === side && m.kickGrace.idx === idx) continue;
      if (idx === 0 && speed > KEEPER_TRAP_MAX) continue;
      const p = m.players[side][idx];
      if (p.down > 0) continue;
      const d = dist(p.x, p.y, m.ball.x, m.ball.y);
      if (d < bestD) {
        bestD = d;
        best = { side, idx };
      }
    }
  }
  if (!best) return;
  if (speed > CONTROL_MAX && best.idx !== 0) {
    // Too quick to trap: it deflects off him rather than being absorbed. This
    // is what stops defenders eating shots the way the audited build did.
    const angle = Math.atan2(m.ball.vy, m.ball.vx) + signed(m) * ((40 * Math.PI) / 180);
    const out = speed * 0.45;
    m.ball.vx = Math.cos(angle) * out;
    m.ball.vy = Math.sin(angle) * out;
    m.lastTouch = best.side;
    m.kickGrace = { side: best.side, idx: best.idx, t: KICK_GRACE };
    m.passInFlight = null;
    m.noScore = false;
    return;
  }
  if (m.passInFlight === best.side && best.idx !== 0) m.stats.passesCompleted[best.side]++;
  takePossession(m, best.side, best.idx, false);
}

function stepBall(m: MatchState, dt: number, events: MatchEvent[]): void {
  const ball = m.ball;
  if (m.owner) {
    const p = playerAt(m, m.owner);
    ball.x = p.x + p.fx * DRIBBLE_OFFSET;
    ball.y = p.y + p.fy * DRIBBLE_OFFSET;
    ball.z = 0;
    ball.vx = 0;
    ball.vy = 0;
    ball.vz = 0;
    checkLines(m, events, true);
    return;
  }
  const prevY = ball.y;
  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;
  if (ball.z > 0 || ball.vz !== 0) {
    ball.z += ball.vz * dt;
    ball.vz -= GRAVITY * dt;
    const drag = Math.exp(-AIR_FRICTION * dt);
    ball.vx *= drag;
    ball.vy *= drag;
    if (ball.z <= 0) {
      ball.z = 0;
      if (Math.abs(ball.vz) > 30) {
        ball.vz = -ball.vz * BOUNCE_Z;
        ball.vx *= BOUNCE_H;
        ball.vy *= BOUNCE_H;
      } else {
        ball.vz = 0;
      }
    }
  } else {
    const damp = Math.exp(-BALL_FRICTION * dt);
    ball.vx *= damp;
    ball.vy *= damp;
  }
  keeperPlane(m, 0, prevY, events);
  if (m.owner || m.phase !== 'play') return;
  keeperPlane(m, 1, prevY, events);
  if (m.owner || m.phase !== 'play') return;
  checkLines(m, events, false);
}

/** Goals, woodwork and the three ways the ball leaves the field. */
function checkLines(m: MatchState, events: MatchEvent[], carried: boolean): void {
  const ball = m.ball;
  for (const line of [0, PITCH_L]) {
    const crossed = line === 0 ? ball.y <= 0 : ball.y >= PITCH_L;
    if (!crossed) continue;
    const scoring = (attackGoalY(0, m.swapped) === line ? 0 : 1) as Side;
    const lateral = Math.abs(ball.x - CENTRE_X);
    if (ball.z < GOAL_HEIGHT && lateral < GOAL_HALF - 2 && !m.noScore) {
      scoreGoal(m, scoring, events, carried);
      return;
    }
    if (!carried && ball.z < GOAL_HEIGHT && lateral <= GOAL_HALF + 2) {
      // Woodwork: back into play with the pace bled off.
      const dir = line === 0 ? 1 : -1;
      ball.y = line + dir * 2;
      ball.vy = Math.abs(ball.vy) * 0.6 * dir;
      ball.vx *= 0.6;
      m.log.push({ type: 'post', side: scoring });
      events.push({ type: 'post', side: scoring });
      return;
    }
    awardRestart(m, events);
    return;
  }
  if (ball.x < 0 || ball.x > PITCH_W) awardRestart(m, events);
}

function scoreGoal(m: MatchState, side: Side, events: MatchEvent[], carried: boolean): void {
  const record: GoalRecord = {
    side,
    scorer: m.owner ? m.owner.idx : m.lastKicker[side],
    minute: Math.round(m.clock),
    contact: carried ? 'ground' : m.lastContact,
    dribbled: carried,
    fromCross: !carried && m.lastFromCross
  };
  m.score[side]++;
  m.goals.push(record);
  m.owner = null;
  m.ball.vx = 0;
  m.ball.vy = 0;
  m.ball.vz = 0;
  m.phase = 'goal';
  m.phaseTimer = GOAL_PAUSE;
  m.kickoffSide = (1 - side) as Side;
  const ev: MatchEvent = { type: 'goal', side, record };
  events.push(ev);
  m.log.push(ev);
  endSpell(m);
}

function nearestTo(m: MatchState, side: Side, x: number, y: number): number {
  let best = 1;
  let bestD = Infinity;
  for (let idx = 1; idx < TEAM_SIZE; idx++) {
    const p = m.players[side][idx];
    const d = dist(p.x, p.y, x, y);
    if (d < bestD) {
      bestD = d;
      best = idx;
    }
  }
  return best;
}

function awardRestart(m: MatchState, events: MatchEvent[]): void {
  const spec = boundaryRestart(m.ball.x, m.ball.y, m.lastTouch, m.swapped);
  if (!spec) return;
  m.owner = null;
  m.ball.vx = 0;
  m.ball.vy = 0;
  m.ball.vz = 0;
  m.ball.z = 0;
  m.ball.x = spec.x;
  m.ball.y = spec.y;
  m.passInFlight = null;
  const taker = spec.keeperTakes ? 0 : nearestTo(m, spec.side, spec.x, spec.y);
  m.restart = { ...spec, elapsed: 0, taker };
  m.phase = 'restart';
  m.phaseTimer = RESTART_PAUSE;
  const ev: MatchEvent = { type: 'restart', kind: spec.kind, side: spec.side };
  events.push(ev);
  m.log.push(ev);
  endSpell(m);
}

/* ------------------------------------------------------------------ */
/* restarts                                                            */

function beginRestart(m: MatchState): void {
  const r = m.restart;
  if (!r) return;
  const taker = m.players[r.side][r.taker];
  const dir = attackDir(r.side, m.swapped);
  taker.x = clamp(r.x, 2, PITCH_W - 2);
  taker.y = clamp(r.y, 2, PITCH_L - 2);
  taker.fx = 0;
  taker.fy = dir;
  taker.slide = 0;
  taker.down = 0;
  taker.slideCd = 0;
  m.markers =
    r.kind === 'corner' ? cornerMarkers(attackGoalY(r.side, m.swapped), r.x, m.swapped, r.side) : [];
  m.ball.x = taker.x + taker.fx * DRIBBLE_OFFSET;
  m.ball.y = taker.y + taker.fy * DRIBBLE_OFFSET;
  m.ball.z = 0;
  m.owner = { side: r.side, idx: r.taker };
  m.lastTouch = r.side;
  m.keepers[r.side].hold = 0;
  // A throw-in cannot score directly; every other restart can.
  m.noScore = r.kind === 'throwIn';
  m.phase = 'play';
  if (r.side === 0 && r.taker !== 0) m.controlled = r.taker;
}

/** The taker ran out of patience: released along the facing, always lofted. */
function autoRelease(m: MatchState): void {
  const r = m.restart;
  if (!r || !m.owner) {
    m.restart = null;
    return;
  }
  const p = playerAt(m, m.owner);
  if (r.kind === 'goalKick') {
    const dir = attackDir(r.side, m.swapped);
    const aim = goalKickAim(0, 0, dir);
    p.fx = aim.x;
    p.fy = aim.y;
    kick(m, aim.x * GOAL_KICK_SPEED, aim.y * GOAL_KICK_SPEED, GOAL_KICK_LIFT);
  } else {
    kick(m, p.fx * AUTO_THROW_SPEED, p.fy * AUTO_THROW_SPEED, AUTO_THROW_LIFT);
  }
  m.lastFromCross = true;
  m.passInFlight = r.side;
  const side = r.side;
  m.restart = null;
  m.markers = [];
  armKeeper(m, side);
}

/* ------------------------------------------------------------------ */
/* clock                                                               */

function finishHalf(m: MatchState, events: MatchEvent[]): void {
  if (m.half === 0) {
    m.clock = 45;
    m.phase = 'halfTime';
    m.phaseTimer = HALF_TIME_PAUSE;
    const ev: MatchEvent = { type: 'halfTime' };
    events.push(ev);
    m.log.push(ev);
    return;
  }
  m.clock = FULL_TIME_MINUTES;
  m.phase = 'over';
  if (m.score[0] === m.score[1]) {
    m.winner = null;
    m.pendingShootout = m.knockout;
  } else {
    m.winner = m.score[0] > m.score[1] ? 0 : 1;
    m.pendingShootout = false;
  }
  const ev: MatchEvent = { type: 'end', winner: m.winner, pendingShootout: m.pendingShootout };
  events.push(ev);
  m.log.push(ev);
  endSpell(m);
}

function startSecondHalf(m: MatchState): void {
  m.half = 1;
  m.swapped = true;
  m.halfElapsed = 0;
  m.clock = 45;
  m.kickoffSide = 1;
  placeKickoff(m);
}

/* ------------------------------------------------------------------ */
/* tick                                                                */

/** A keeper holding the ball must let it go; this is also the sit-on-it fix. */
function keeperDistribution(m: MatchState): void {
  const owner = m.owner;
  if (!owner || owner.idx !== 0) return;
  if (m.restart && m.restart.taker === 0 && m.restart.side === owner.side) return;
  if (m.keepers[owner.side].hold > 0) return;
  const dir = attackDir(owner.side, m.swapped);
  const p = playerAt(m, owner);
  const lateral = (m.rng() - 0.5) * 1.1;
  const len = Math.hypot(lateral, 1);
  p.fx = lateral / len;
  p.fy = (dir as number) / len;
  kick(m, (lateral / len) * GOAL_KICK_SPEED, ((dir as number) / len) * GOAL_KICK_SPEED, GOAL_KICK_LIFT);
  m.lastFromCross = true;
  m.passInFlight = owner.side;
  armKeeper(m, owner.side);
}

/** Advance the match by `dt` seconds. Returns the events raised this tick. */
export function tickMatch(
  m: MatchState,
  dt: number,
  input: MatchInput = NEUTRAL_INPUT
): MatchEvent[] {
  const events: MatchEvent[] = [];
  if (m.phase === 'over') return events;

  if (m.phase !== 'play') {
    m.phaseTimer -= dt;
    if (m.phaseTimer <= 0) {
      if (m.phase === 'kickoff') {
        m.phase = 'play';
        const taker = m.players[m.kickoffSide][6];
        m.ball.x = taker.x + taker.fx * DRIBBLE_OFFSET;
        m.ball.y = taker.y + taker.fy * DRIBBLE_OFFSET;
        takePossession(m, m.kickoffSide, 6, false);
        if (m.kickoffSide === 0) m.controlled = 6;
        const ev: MatchEvent = { type: 'kickoff', side: m.kickoffSide };
        events.push(ev);
        m.log.push(ev);
      } else if (m.phase === 'goal') {
        if (m.halfElapsed >= m.halfSeconds) finishHalf(m, events);
        else placeKickoff(m);
      } else if (m.phase === 'halfTime') {
        startSecondHalf(m);
      } else if (m.phase === 'restart') {
        beginRestart(m);
      }
    }
    m.prev = { a: input.a, b: input.b, c: input.c };
    return events;
  }

  // Open play. The clock only burns here, so celebrations, half-time and
  // set-piece placement cost the player no football.
  m.halfElapsed += dt;
  m.clock = Math.min(m.half * 45 + 45, m.half * 45 + m.halfElapsed * MINUTES_PER_SECOND);
  if (m.owner && m.owner.side === 0) m.spell += dt;
  else endSpell(m);

  if (m.kickGrace) {
    m.kickGrace.t -= dt;
    if (m.kickGrace.t <= 0) m.kickGrace = null;
  }
  if (m.winGrace) {
    m.winGrace.t -= dt;
    if (m.winGrace.t <= 0) m.winGrace = null;
  }
  if (m.restart) {
    m.restart.elapsed += dt;
    if (!m.owner) {
      m.restart = null;
      m.markers = [];
    } else if (m.restart.elapsed >= m.restart.deadline) {
      autoRelease(m);
    }
  }
  m.keepers[0].hold = Math.max(0, m.keepers[0].hold - dt);
  m.keepers[1].hold = Math.max(0, m.keepers[1].hold - dt);

  updateControlled(m, dt);
  humanAction(m, input, dt);
  stepHumanSide(m, input, dt);
  stepCpuSide(m, dt);
  keeperDistribution(m);
  stepTackles(m, dt, events);
  stepBall(m, dt, events);
  if (m.phase === 'play') tryCapture(m);

  m.prev = { a: input.a, b: input.b, c: input.c };

  if (m.phase === 'play' && m.halfElapsed >= m.halfSeconds) finishHalf(m, events);
  return events;
}

/** Up to three scorers per side with the minute, for the full-time screen. */
export function scorerList(m: MatchState, side: Side): GoalRecord[] {
  return m.goals.filter(g => g.side === side).slice(0, 3);
}
