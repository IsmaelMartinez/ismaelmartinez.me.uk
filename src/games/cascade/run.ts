/**
 * The pure Cascade state machine: gravity, lock delay, clear/cascade timing,
 * scoring, and the level ramp. game.ts feeds it ticks and inputs and renders
 * whatever it says; tests drive whole games through it headlessly.
 *
 * Scoring: only clears score (every point lands with an on-screen popup —
 * per-row drop trickle would be noise). Each chain link is worth
 * base(rows) × level × link, so a cascade that re-completes rows pays double,
 * then triple, the deeper it goes.
 */
import {
  createWell,
  fullRows,
  clearRows,
  cascadeGravity,
  WELL_W,
  type Well
} from './well';
import {
  spawnPiece,
  cellsOf,
  fits,
  tryMove,
  tryRotate,
  type ActivePiece,
  type PieceId
} from './piece';
import { createBag } from './bag';

/** Seconds a grounded piece waits before locking; moves/rotates reset it. */
export const LOCK_DELAY = 0.5;
/** Lock-delay resets allowed per piece, so a piece can't hover forever. */
export const MAX_LOCK_RESETS = 15;
/** Seconds each chain link's rows stay lit before the landslide. */
export const CLEAR_TIME = 0.32;
/** Rows per soft-drop step — much faster than any level's gravity. */
export const SOFT_DROP_INTERVAL = 0.04;
export const LINES_PER_LEVEL = 10;

const LINE_POINTS = [0, 100, 300, 500, 800];

/** Seconds per gravity row at a level; ramps ~15% per level, floored. */
export function gravityInterval(level: number): number {
  return Math.max(0.07, 0.8 * Math.pow(0.85, level - 1));
}

/** Points for one chain link: `chain` is 1 for the lock's own clear. */
export function clearPoints(rowCount: number, level: number, chain: number): number {
  const base =
    rowCount <= 4 ? LINE_POINTS[rowCount] : LINE_POINTS[4] + 200 * (rowCount - 4);
  return base * level * chain;
}

export type RunPhase = 'falling' | 'clearing' | 'over';

export type RunEvent =
  | { type: 'lock' }
  | { type: 'clear'; rows: number[]; count: number; chain: number; points: number }
  | { type: 'levelUp'; level: number }
  | { type: 'topOut' };

export interface CascadeRun {
  well: Well;
  piece: ActivePiece | null;
  nextId: PieceId;
  phase: RunPhase;
  score: number;
  lines: number;
  level: number;
  /** Current chain link (1 = the lock's own clear) while clearing. */
  chain: number;
  /** Rows lit up during the clearing phase. */
  clearingRows: number[];
  softDrop: boolean;
  gravityTimer: number;
  lockTimer: number;
  lockResets: number;
  clearTimer: number;
  drawPiece: () => PieceId;
}

export function createRun(random: () => number): CascadeRun {
  const drawPiece = createBag(random);
  return {
    well: createWell(),
    piece: spawnPiece(drawPiece()),
    nextId: drawPiece(),
    phase: 'falling',
    score: 0,
    lines: 0,
    level: 1,
    chain: 0,
    clearingRows: [],
    softDrop: false,
    gravityTimer: 0,
    lockTimer: LOCK_DELAY,
    lockResets: 0,
    clearTimer: 0,
    drawPiece
  };
}

/** True when the active piece is resting on the floor or the stack. */
export function grounded(run: CascadeRun): boolean {
  return run.piece !== null && tryMove(run.well, run.piece, 0, 1) === null;
}

/** Row the active piece would land on if dropped now (its ghost). */
export function ghostPiece(run: CascadeRun): ActivePiece | null {
  if (!run.piece) return null;
  let ghost = run.piece;
  for (;;) {
    const below = tryMove(run.well, ghost, 0, 1);
    if (!below) return ghost;
    ghost = below;
  }
}

function bumpLevel(run: CascadeRun, events: RunEvent[]): void {
  const next = Math.floor(run.lines / LINES_PER_LEVEL) + 1;
  if (next > run.level) {
    run.level = next;
    events.push({ type: 'levelUp', level: next });
  }
}

/** Scores one chain link and lights its rows for the clearing phase. */
function startClearStep(run: CascadeRun, rows: number[], events: RunEvent[]): void {
  run.chain++;
  const points = clearPoints(rows.length, run.level, run.chain);
  run.score += points;
  run.lines += rows.length;
  events.push({ type: 'clear', rows, count: rows.length, chain: run.chain, points });
  bumpLevel(run, events);
  run.clearingRows = rows;
  run.clearTimer = CLEAR_TIME;
  run.phase = 'clearing';
}

function spawnNext(run: CascadeRun, events: RunEvent[]): void {
  const piece = spawnPiece(run.nextId);
  run.nextId = run.drawPiece();
  run.gravityTimer = 0;
  run.lockTimer = LOCK_DELAY;
  run.lockResets = 0;
  if (!fits(run.well, piece)) {
    run.piece = null;
    run.phase = 'over';
    events.push({ type: 'topOut' });
    return;
  }
  run.piece = piece;
  run.phase = 'falling';
}

function lockNow(run: CascadeRun, events: RunEvent[]): void {
  const piece = run.piece!;
  let above = false;
  for (const c of cellsOf(piece)) {
    if (c.y < 0) {
      above = true;
      continue;
    }
    run.well[c.y * WELL_W + c.x] = piece.id + 1;
  }
  run.piece = null;
  events.push({ type: 'lock' });
  if (above) {
    // Part of the piece never entered the well: the stack has hit the sky.
    run.phase = 'over';
    events.push({ type: 'topOut' });
    return;
  }
  run.chain = 0;
  const rows = fullRows(run.well);
  if (rows.length > 0) startClearStep(run, rows, events);
  else spawnNext(run, events);
}

/** Advance the run by dt seconds; returns the events that fired. */
export function tickRun(run: CascadeRun, dt: number): RunEvent[] {
  const events: RunEvent[] = [];
  if (run.phase === 'over') return events;

  if (run.phase === 'clearing') {
    run.clearTimer -= dt;
    if (run.clearTimer > 0) return events;
    clearRows(run.well, run.clearingRows);
    cascadeGravity(run.well);
    const rows = fullRows(run.well);
    if (rows.length > 0) {
      startClearStep(run, rows, events);
    } else {
      run.clearingRows = [];
      spawnNext(run, events);
    }
    return events;
  }

  if (grounded(run)) {
    run.gravityTimer = 0;
    run.lockTimer -= dt;
    if (run.lockTimer <= 0) lockNow(run, events);
    return events;
  }

  const interval = run.softDrop
    ? Math.min(SOFT_DROP_INTERVAL, gravityInterval(run.level))
    : gravityInterval(run.level);
  run.gravityTimer += dt;
  while (run.gravityTimer >= interval && run.piece) {
    run.gravityTimer -= interval;
    const below = tryMove(run.well, run.piece, 0, 1);
    if (!below) break;
    run.piece = below;
    // Landing on a new ledge grants a fresh lock delay (and fresh resets).
    run.lockTimer = LOCK_DELAY;
    run.lockResets = 0;
    if (grounded(run)) {
      run.gravityTimer = 0;
      break;
    }
  }
  return events;
}

/** Shared tail for shift/rotate: a grounded nudge re-arms the lock timer. */
function applyNudge(run: CascadeRun, moved: ActivePiece | null): boolean {
  if (!moved) return false;
  run.piece = moved;
  if (grounded(run) && run.lockResets < MAX_LOCK_RESETS) {
    run.lockTimer = LOCK_DELAY;
    run.lockResets++;
  }
  return true;
}

export function shift(run: CascadeRun, dir: -1 | 1): boolean {
  if (run.phase !== 'falling' || !run.piece) return false;
  return applyNudge(run, tryMove(run.well, run.piece, dir, 0));
}

export function rotate(run: CascadeRun, dir: 1 | -1): boolean {
  if (run.phase !== 'falling' || !run.piece) return false;
  return applyNudge(run, tryRotate(run.well, run.piece, dir));
}

export function setSoftDrop(run: CascadeRun, on: boolean): void {
  run.softDrop = on;
}

/** Slam the piece to its ghost row and lock immediately. */
export function hardDrop(run: CascadeRun): RunEvent[] {
  const events: RunEvent[] = [];
  if (run.phase !== 'falling' || !run.piece) return events;
  run.piece = ghostPiece(run);
  lockNow(run, events);
  return events;
}
