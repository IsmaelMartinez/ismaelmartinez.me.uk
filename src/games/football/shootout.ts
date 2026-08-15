/**
 * The penalty shootout: five kicks each alternating, player first, then sudden
 * death a pair at a time until a pair is split. It is interactive from both
 * ends — you take kicks and you dive to save them — which is the one place
 * every source agreed the original's keeper control was actually fun.
 *
 * A full state machine (idle -> aim -> strike -> result -> next -> over) that
 * steps headlessly, so the conversion bands have a unit test.
 */
import { clamp } from '../engine/math';
import type { Side } from './pitch';

/** The mouth is divided into five zones: far left, left, centre, right, far right. */
export const SHOOTOUT_ZONES = 5;
export const REGULATION_KICKS = 5;

/** Seconds the defender has to pick a zone and commit. */
export const DIVE_WINDOW = 1.2;
/** Seconds the taker has before the kick goes at whatever is selected. */
export const AIM_WINDOW = 2.2;
export const RESULT_HOLD = 1.0;

/**
 * Save probabilities by how many zones the keeper missed by.
 *
 * The spec's 0.82 / 0.30 / 0.04 make the two conversion bands in 7.5 and its
 * "sudden death terminates within 12 pairs in 99.9% of shootouts" bound
 * mutually unsatisfiable: at those numbers both sides convert around 0.70, a
 * pair ties 56% of the time and twelve pairs run dry once every 750 shootouts.
 * Nudging them up keeps every conversion band and buys the termination bound a
 * real margin.
 */
export const SAVE_SAME = 0.88;
export const SAVE_ADJACENT = 0.36;
export const SAVE_FAR = 0.05;

/** A kick under this power is weak enough that an adjacent keeper still gets it. */
export const WEAK_POWER = 0.3;
/** Blasting at the very edge of the frame sometimes misses it entirely. */
export const EDGE_MISS = 0.08;

export type ShootoutPhase = 'idle' | 'aim' | 'strike' | 'result' | 'next' | 'over';
export type KickResult = 'scored' | 'saved' | 'missed';

export interface ShootoutKick {
  /** The side taking, 0 = human. */
  side: Side;
  zone: number;
  keeperZone: number;
  result: KickResult;
}

export interface ShootoutInput {
  x: number;
  y: number;
  a: boolean;
}

export const SHOOTOUT_NEUTRAL: ShootoutInput = { x: 0, y: 0, a: false };

export interface ShootoutState {
  phase: ShootoutPhase;
  timer: number;
  /** Which side is taking this kick. */
  turn: Side;
  /** Kicks taken by each side. */
  taken: [number, number];
  score: [number, number];
  kicks: ShootoutKick[];
  suddenDeath: boolean;
  over: boolean;
  winner: Side | null;
  difficulty: number;
  /** Zone the stick currently selects, 0..4. */
  selected: number;
  charge: number;
  result: KickResult | null;
  /** Zones the human has used, most recent last; the CPU keeper reads these. */
  history: number[];
  prevA: boolean;
  rng: () => number;
}

export interface ShootoutOptions {
  rng?: () => number;
  difficulty?: number;
}

export type ShootoutEvent =
  | { type: 'kick'; kick: ShootoutKick }
  | { type: 'over'; winner: Side };

export function createShootout(opts: ShootoutOptions = {}): ShootoutState {
  return {
    phase: 'aim',
    timer: AIM_WINDOW,
    turn: 0,
    taken: [0, 0],
    score: [0, 0],
    kicks: [],
    suddenDeath: false,
    over: false,
    winner: null,
    difficulty: clamp(opts.difficulty ?? 0.25, 0, 1),
    selected: 2,
    charge: 0,
    result: null,
    history: [],
    prevA: false,
    rng: opts.rng ?? Math.random
  };
}

/** Map a stick's lateral deflection onto one of the five zones. */
export function zoneFromStick(x: number): number {
  if (x <= -0.6) return 0;
  if (x <= -0.2) return 1;
  if (x < 0.2) return 2;
  if (x < 0.6) return 3;
  return 4;
}

/**
 * Resolve one kick. Distance is measured in zones; a weak kick is treated as
 * one zone easier, which is what makes power matter as well as placement.
 */
export function kickOutcome(
  zone: number,
  keeperZone: number,
  power: number,
  rng: () => number
): KickResult {
  const edge = zone === 0 || zone === SHOOTOUT_ZONES - 1;
  if (edge && power > 0.95 && rng() < EDGE_MISS) return 'missed';
  let apart = Math.abs(zone - keeperZone);
  if (power < WEAK_POWER) apart = Math.max(0, apart - 1);
  const save = apart === 0 ? SAVE_SAME : apart === 1 ? SAVE_ADJACENT : SAVE_FAR;
  return rng() < save ? 'saved' : 'scored';
}

/**
 * The CPU keeper's guess. It leans on the zones the player has already used,
 * and how far back it remembers scales with difficulty — at d = 0.85 it holds
 * the last two.
 */
export function cpuKeeperZone(s: ShootoutState): number {
  const memory = 0.15 + 0.4 * s.difficulty;
  const depth = s.difficulty > 0.7 ? 2 : 1;
  const recent = s.history.slice(-depth);
  if (recent.length > 0 && s.rng() < memory) {
    return recent[Math.floor(s.rng() * recent.length)];
  }
  return Math.floor(s.rng() * SHOOTOUT_ZONES);
}

/** The CPU taker's zone and power; both improve with difficulty. */
export function cpuKick(s: ShootoutState): { zone: number; power: number } {
  const zone = Math.floor(s.rng() * SHOOTOUT_ZONES);
  const power = clamp(0.5 + 0.45 * s.difficulty + (s.rng() - 0.5) * 0.3, 0.15, 1);
  return { zone, power };
}

/** Extra CPU wastefulness that difficulty buys away, per 7.5's two bands. */
export function cpuMissChance(difficulty: number): number {
  return clamp(0.12 - 0.07 * clamp(difficulty, 0, 1), 0, 0.2);
}

function record(s: ShootoutState, kick: ShootoutKick, events: ShootoutEvent[]): void {
  s.kicks.push(kick);
  s.taken[kick.side]++;
  if (kick.result === 'scored') s.score[kick.side]++;
  s.result = kick.result;
  events.push({ type: 'kick', kick });
}

/**
 * Can the shootout still be decided, or is one side already out of reach?
 * Regulation only: sudden death is settled pair by pair.
 */
function regulationSettled(s: ShootoutState): Side | null {
  if (s.suddenDeath) return null;
  const left0 = REGULATION_KICKS - s.taken[0];
  const left1 = REGULATION_KICKS - s.taken[1];
  if (s.score[0] > s.score[1] + left1) return 0;
  if (s.score[1] > s.score[0] + left0) return 1;
  return null;
}

function advance(s: ShootoutState, events: ShootoutEvent[]): void {
  const decided = regulationSettled(s);
  if (decided !== null) {
    finish(s, decided, events);
    return;
  }
  if (!s.suddenDeath && s.taken[0] >= REGULATION_KICKS && s.taken[1] >= REGULATION_KICKS) {
    if (s.score[0] !== s.score[1]) {
      finish(s, s.score[0] > s.score[1] ? 0 : 1, events);
      return;
    }
    s.suddenDeath = true;
  }
  if (s.suddenDeath && s.taken[0] === s.taken[1] && s.taken[0] > REGULATION_KICKS - 1) {
    if (s.score[0] !== s.score[1]) {
      finish(s, s.score[0] > s.score[1] ? 0 : 1, events);
      return;
    }
  }
  s.turn = (1 - s.turn) as Side;
  s.phase = 'aim';
  s.timer = s.turn === 0 ? AIM_WINDOW : DIVE_WINDOW;
  s.charge = 0;
  s.selected = 2;
  s.result = null;
}

function finish(s: ShootoutState, winner: Side, events: ShootoutEvent[]): void {
  s.phase = 'over';
  s.over = true;
  s.winner = winner;
  events.push({ type: 'over', winner });
}

/**
 * Step the machine. When the human is taking, the stick picks a zone and A
 * charges and releases; when the CPU is taking, the same input picks the dive
 * and A commits it. Either way the window closes on its own.
 */
export function tickShootout(
  s: ShootoutState,
  dt: number,
  input: ShootoutInput = SHOOTOUT_NEUTRAL
): ShootoutEvent[] {
  const events: ShootoutEvent[] = [];
  if (s.phase === 'over') return events;

  const released = !input.a && s.prevA;
  const pressed = input.a && !s.prevA;
  s.prevA = input.a;

  if (s.phase === 'result') {
    s.timer -= dt;
    if (s.timer <= 0) advance(s, events);
    return events;
  }

  if (Math.abs(input.x) > 0.15) s.selected = zoneFromStick(input.x);
  s.timer -= dt;

  if (s.turn === 0) {
    // The human is taking.
    if (input.a) s.charge = Math.min(1, s.charge + dt / 0.55);
    const fire = released || s.timer <= 0;
    if (!fire) return events;
    const power = clamp(s.charge > 0 ? 0.35 + s.charge * 0.65 : 0.5, 0, 1);
    const keeperZone = cpuKeeperZone(s);
    const result = kickOutcome(s.selected, keeperZone, power, s.rng);
    s.history.push(s.selected);
    record(s, { side: 0, zone: s.selected, keeperZone, result }, events);
    s.phase = 'result';
    s.timer = RESULT_HOLD;
    return events;
  }

  // The CPU is taking and the human dives.
  const commit = pressed || released || s.timer <= 0;
  if (!commit) return events;
  const shot = cpuKick(s);
  let result = kickOutcome(shot.zone, s.selected, shot.power, s.rng);
  if (result === 'scored' && s.rng() < cpuMissChance(s.difficulty)) result = 'missed';
  record(s, { side: 1, zone: shot.zone, keeperZone: s.selected, result }, events);
  s.phase = 'result';
  s.timer = RESULT_HOLD;
  return events;
}
