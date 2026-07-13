/**
 * Critter finite-state machine for Critter Rescue.
 *
 * A critter is a tiny FSM whose feet sit at `(x, y)`: `y` is the first empty
 * cell above the ground, so the floor a critter stands on is the solid cell at
 * `(x, y + 1)`. Movement is per-tick (1px walkers), which is why the game runs
 * on the fixed-timestep engine loop.
 *
 * The base cycle is `walker → faller → splatter` (a fall longer than
 * `SPLAT_DIST` is fatal unless the critter is a floater); on top of that sit
 * the five assignable skills. All rules run against a `CritterWorld` — the
 * terrain bitmap plus a blocker lookup — so the FSM is unit-tested against a
 * fake world with no DOM.
 */

export type Skill = 'blocker' | 'digger' | 'basher' | 'builder' | 'floater';

export type CritterState =
  | 'walker'
  | 'faller'
  | 'blocker'
  | 'digger'
  | 'basher'
  | 'builder'
  | 'exited'
  | 'splatted';

export interface Critter {
  id: number;
  x: number;
  y: number;
  /** Facing/travel direction: +1 right, -1 left. */
  dir: 1 | -1;
  state: CritterState;
  /** Umbrella deployed — immune to fall damage, drifts down slowly. */
  floater: boolean;
  /** Pixels fallen in the current descent, for splat detection. */
  fallDist: number;
  /** Ticks since the last skill "work" step (dig/bash/build cadence). */
  timer: number;
  /** Bridge treads a builder has left to lay. */
  bricks: number;
  /** Basher steps taken with no wall ahead, so it gives up after a few. */
  stall: number;
  alive: boolean;
  /** Reached the exit and was rescued. */
  saved: boolean;
}

/**
 * The slice of the world a critter can see and change: solidity queries, the
 * terrain edits skills make, and where blockers stand.
 */
export interface CritterWorld {
  readonly width: number;
  readonly height: number;
  solid(x: number, y: number): boolean;
  eraseRect(x: number, y: number, w: number, h: number): void;
  buildRow(x: number, y: number, w: number): void;
  /** True when a (non-self) blocker's body occupies this cell. */
  blockerAt(x: number, y: number): boolean;
}

// --- Tunable constants (exported for tests and level tuning) ---
export const CRITTER_H = 9; // body height in px, for blocker footprint & drawing
export const MAX_CLIMB = 4; // slope a walker steps up in one move
export const FALL_SPEED = 3; // px/tick a plain faller drops
export const FLOAT_SPEED = 1; // px/tick a floater drifts
export const SPLAT_DIST = 60; // fall px beyond which a landing is fatal

export const DIG_INTERVAL = 4; // ticks between digger slabs
export const DIG_WIDTH = 8;
export const BASH_INTERVAL = 3; // ticks between basher slabs
export const BASH_WIDTH = 4;
export const BUILD_INTERVAL = 6; // ticks between builder treads
export const BUILD_BRICKS = 12;
export const BRICK_WIDTH = 6;
export const BASH_PATIENCE = 6; // steps a basher walks toward a wall before giving up

export function createCritter(id: number, x: number, y: number, dir: 1 | -1 = 1): Critter {
  return {
    id,
    x,
    y,
    dir,
    // Critters drop out of the hatch, so they start airborne.
    state: 'faller',
    floater: false,
    fallDist: 0,
    timer: 0,
    bricks: 0,
    stall: 0,
    alive: true,
    saved: false
  };
}

export function isActive(c: Critter): boolean {
  return c.alive && c.state !== 'exited' && c.state !== 'splatted';
}

/**
 * Applies the currently selected skill to a critter. Floater can be pinned on
 * a walker or a mid-air faller (the umbrella pops open); the terrain-shaping
 * skills need a grounded walker. Returns whether the skill took (so the caller
 * only spends stock on a real assignment).
 */
export function assignSkill(c: Critter, skill: Skill): boolean {
  if (!isActive(c)) return false;
  if (skill === 'floater') {
    if (c.floater) return false;
    c.floater = true;
    return true;
  }
  if (c.state !== 'walker') return false;
  switch (skill) {
    case 'blocker':
      c.state = 'blocker';
      return true;
    case 'digger':
      c.state = 'digger';
      c.timer = 0;
      return true;
    case 'basher':
      c.state = 'basher';
      c.timer = 0;
      c.stall = 0;
      return true;
    case 'builder':
      c.state = 'builder';
      c.timer = 0;
      c.bricks = BUILD_BRICKS;
      return true;
  }
}

/** Advances a critter by one simulation tick. */
export function stepCritter(c: Critter, world: CritterWorld): void {
  if (!isActive(c)) return;
  switch (c.state) {
    case 'walker':
      stepWalker(c, world);
      break;
    case 'faller':
      stepFaller(c, world);
      break;
    case 'blocker':
      stepBlocker(c, world);
      break;
    case 'digger':
      stepDigger(c, world);
      break;
    case 'basher':
      stepBasher(c, world);
      break;
    case 'builder':
      stepBuilder(c, world);
      break;
  }
}

function grounded(c: Critter, world: CritterWorld): boolean {
  return world.solid(c.x, c.y + 1);
}

function startFalling(c: Critter): void {
  c.state = 'faller';
  c.fallDist = 0;
}

function land(c: Critter): void {
  if (!c.floater && c.fallDist > SPLAT_DIST) {
    c.alive = false;
    c.state = 'splatted';
    return;
  }
  c.fallDist = 0;
  c.state = 'walker';
}

function stepFaller(c: Critter, world: CritterWorld): void {
  const speed = c.floater ? FLOAT_SPEED : FALL_SPEED;
  for (let i = 0; i < speed; i++) {
    if (world.solid(c.x, c.y + 1)) {
      land(c);
      return;
    }
    c.y++;
    c.fallDist++;
    if (c.y >= world.height) {
      // Fell out of the bottom of the world.
      c.alive = false;
      c.state = 'splatted';
      return;
    }
  }
}

function stepWalker(c: Critter, world: CritterWorld): void {
  if (!grounded(c, world)) {
    startFalling(c);
    return;
  }
  const nx = c.x + c.dir;
  // A blocker's body turns a walker around before it steps into it.
  if (world.blockerAt(nx, c.y)) {
    c.dir = (-c.dir) as 1 | -1;
    return;
  }
  if (world.solid(nx, c.y)) {
    // Terrain rises ahead — climb it if the step is shallow enough.
    let up = 1;
    while (up <= MAX_CLIMB && world.solid(nx, c.y - up)) up++;
    if (up <= MAX_CLIMB) {
      c.x = nx;
      c.y -= up;
    } else {
      // Wall too tall: turn back.
      c.dir = (-c.dir) as 1 | -1;
    }
    return;
  }
  // Clear ahead: step forward. Any drop is resolved by gravity next tick.
  c.x = nx;
}

function stepBlocker(c: Critter, world: CritterWorld): void {
  // Blockers hold their ground until it is dug out from under them.
  if (!grounded(c, world)) startFalling(c);
}

function stepDigger(c: Critter, world: CritterWorld): void {
  c.timer++;
  if (c.timer < DIG_INTERVAL) return;
  c.timer = 0;
  // Chew a slab out of the floor and sink into it.
  world.eraseRect(Math.round(c.x - DIG_WIDTH / 2), c.y + 1, DIG_WIDTH, 1);
  // Steel underfoot survives the erase — the spade bounces off and the digger
  // gives up on the spot.
  if (world.solid(c.x, c.y + 1)) {
    c.state = 'walker';
    return;
  }
  c.y++;
  if (c.y >= world.height) {
    c.alive = false;
    c.state = 'splatted';
    return;
  }
  // Broke through into open air — resume walking (gravity takes over).
  if (!world.solid(c.x, c.y + 1)) c.state = 'walker';
}

function wallAhead(c: Critter, world: CritterWorld, aheadX: number): boolean {
  for (let dy = 0; dy < CRITTER_H - 1; dy++) {
    if (world.solid(aheadX, c.y - dy)) return true;
  }
  return false;
}

function stepBasher(c: Critter, world: CritterWorld): void {
  // The floor can be dug out from under a basher mid-swing.
  if (!grounded(c, world)) {
    startFalling(c);
    return;
  }
  c.timer++;
  if (c.timer < BASH_INTERVAL) return;
  c.timer = 0;
  const aheadX = c.x + c.dir;
  if (wallAhead(c, world, aheadX)) {
    // Erase a body-height slab directly ahead, leaving the floor intact.
    const fx = c.dir > 0 ? c.x + 1 : c.x - BASH_WIDTH;
    world.eraseRect(fx, c.y - (CRITTER_H - 2), BASH_WIDTH, CRITTER_H - 1);
    // A steel face survives the erase — the fist bounces off and the basher
    // quits (the walker rules then turn it around at the wall).
    if (wallAhead(c, world, aheadX)) {
      c.state = 'walker';
      return;
    }
    c.x += c.dir;
    c.stall = 0;
  } else {
    // Nothing to bash: step toward a wall a few times, then give up walking.
    c.x += c.dir;
    c.stall++;
    if (c.stall > BASH_PATIENCE) c.state = 'walker';
  }
}

function stepBuilder(c: Critter, world: CritterWorld): void {
  c.timer++;
  if (c.timer < BUILD_INTERVAL) return;
  c.timer = 0;
  if (c.bricks <= 0) {
    c.state = 'walker';
    return;
  }
  // Lay a tread the width of the critter as the floor for the next step up.
  const bx = c.dir > 0 ? c.x : c.x - BRICK_WIDTH + 1;
  world.buildRow(bx, c.y, BRICK_WIDTH);
  c.bricks--;
  const nx = c.x + c.dir;
  const ny = c.y - 1;
  // Blocked by a ceiling or a blocker: give up and turn around.
  if (world.solid(nx, ny) || world.blockerAt(nx, c.y)) {
    c.state = 'walker';
    c.dir = (-c.dir) as 1 | -1;
    return;
  }
  c.x = nx;
  c.y = ny;
}
