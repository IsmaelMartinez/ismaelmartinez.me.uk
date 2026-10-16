/**
 * PRIME TIME's studio floor: one single-screen arena with a door in the middle
 * of each wall, which is the whole of Smash TV's geometry. Everything here is
 * pure arithmetic over logical canvas coordinates, shared by the simulation
 * (spawns at doors, exits through them, the walls the contestant is clamped
 * inside) and the renderer (where to paint the walls and the door chevrons).
 */

export interface Pt {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Logical canvas size; CSS scales it, `setupHiDpiCanvas` keeps it crisp. */
export const CANVAS_W = 660;
export const CANVAS_H = 420;
/** Wall thickness around the floor. */
export const WALL = 18;
/** The floor the contestant can stand on. */
export const ARENA: Rect = { x: WALL, y: WALL, w: CANVAS_W - WALL * 2, h: CANVAS_H - WALL * 2 };
/** Width of the gap in a wall that is a door. */
export const DOOR_W = 84;
/** How far outside the wall an enemy appears before it walks in. */
const SPAWN_OUTSIDE = 10;

export type Side = 'n' | 'e' | 's' | 'w';
export const SIDES: readonly Side[] = ['n', 'e', 's', 'w'];

/** The wall opening for a door: the gap itself, `WALL` deep. */
export function doorRect(side: Side): Rect {
  const cx = ARENA.x + ARENA.w / 2;
  const cy = ARENA.y + ARENA.h / 2;
  switch (side) {
    case 'n':
      return { x: cx - DOOR_W / 2, y: 0, w: DOOR_W, h: WALL };
    case 's':
      return { x: cx - DOOR_W / 2, y: ARENA.y + ARENA.h, w: DOOR_W, h: WALL };
    case 'w':
      return { x: 0, y: cy - DOOR_W / 2, w: WALL, h: DOOR_W };
    case 'e':
      return { x: ARENA.x + ARENA.w, y: cy - DOOR_W / 2, w: WALL, h: DOOR_W };
  }
}

/** The middle of a door, on the floor's edge. */
export function doorCentre(side: Side): Pt {
  const r = doorRect(side);
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

/**
 * Where an enemy entering through `side` first stands: just outside the wall,
 * `along` (0 to 1) of the way across the door's width, so a stream from one
 * door does not arrive in single file.
 */
export function doorSpawnPoint(side: Side, along: number): Pt {
  const a = Math.min(1, Math.max(0, along));
  const span = DOOR_W - 24;
  const off = -span / 2 + a * span;
  const c = doorCentre(side);
  switch (side) {
    case 'n':
      return { x: c.x + off, y: ARENA.y - SPAWN_OUTSIDE };
    case 's':
      return { x: c.x + off, y: ARENA.y + ARENA.h + SPAWN_OUTSIDE };
    case 'w':
      return { x: ARENA.x - SPAWN_OUTSIDE, y: c.y + off };
    case 'e':
      return { x: ARENA.x + ARENA.w + SPAWN_OUTSIDE, y: c.y + off };
  }
}

/** The unit vector pointing from a door into the room. */
export function inwardOf(side: Side): Pt {
  switch (side) {
    case 'n':
      return { x: 0, y: 1 };
    case 's':
      return { x: 0, y: -1 };
    case 'w':
      return { x: 1, y: 0 };
    case 'e':
      return { x: -1, y: 0 };
  }
}

/** The door on the opposite wall, where a contestant arrives after leaving by `side`. */
export function opposite(side: Side): Side {
  return side === 'n' ? 's' : side === 's' ? 'n' : side === 'e' ? 'w' : 'e';
}

/** Whether a circle sits wholly on the floor. */
export function insideArena(x: number, y: number, r: number): boolean {
  return x - r >= ARENA.x && x + r <= ARENA.x + ARENA.w && y - r >= ARENA.y && y + r <= ARENA.y + ARENA.h;
}

/**
 * Keeps a circle on the floor, except where an open door lets it through:
 * inside a door's span the wall is absent, so the circle may cross the wall
 * line there (and `exitThrough` notices once it has). Returns the clamped
 * point.
 */
export function clampToArena(x: number, y: number, r: number, open: readonly Side[] = []): Pt {
  const cx = ARENA.x + ARENA.w / 2;
  const cy = ARENA.y + ARENA.h / 2;
  const half = DOOR_W / 2 - r;
  const inDoorX = Math.abs(x - cx) <= half;
  const inDoorY = Math.abs(y - cy) <= half;
  let nx = x;
  let ny = y;
  const minX = ARENA.x + r;
  const maxX = ARENA.x + ARENA.w - r;
  const minY = ARENA.y + r;
  const maxY = ARENA.y + ARENA.h - r;
  if (nx < minX && !(open.includes('w') && inDoorY)) nx = minX;
  if (nx > maxX && !(open.includes('e') && inDoorY)) nx = maxX;
  if (ny < minY && !(open.includes('n') && inDoorX)) ny = minY;
  if (ny > maxY && !(open.includes('s') && inDoorX)) ny = maxY;
  // Past a wall line through a door, stay inside the door's own span so a
  // contestant cannot slide along the outside of the wall.
  if (nx < ARENA.x || nx > ARENA.x + ARENA.w) ny = Math.min(cy + half, Math.max(cy - half, ny));
  if (ny < ARENA.y || ny > ARENA.y + ARENA.h) nx = Math.min(cx + half, Math.max(cx - half, nx));
  return { x: nx, y: ny };
}

/**
 * The open door a circle has left the room through, once its centre is past
 * the wall's outer face, or null while it is still on the floor or in the
 * doorway.
 */
export function exitThrough(x: number, y: number, open: readonly Side[]): Side | null {
  for (const side of open) {
    const r = doorRect(side);
    const within = side === 'n' || side === 's' ? x >= r.x && x <= r.x + r.w : y >= r.y && y <= r.y + r.h;
    if (!within) continue;
    if (side === 'n' && y <= 0) return side;
    if (side === 's' && y >= CANVAS_H) return side;
    if (side === 'w' && x <= 0) return side;
    if (side === 'e' && x >= CANVAS_W) return side;
  }
  return null;
}

/** The eight directions of a Smash TV joystick, as unit vectors, clockwise from east. */
export const DIRS8: readonly Pt[] = Array.from({ length: 8 }, (_, i) => {
  const a = (i * Math.PI) / 4;
  return { x: Math.round(Math.cos(a) * 1e6) / 1e6, y: Math.round(Math.sin(a) * 1e6) / 1e6 };
});

/** Below this magnitude a stick reads as centred. */
export const DEAD_ZONE = 0.3;

/**
 * Snaps a stick vector to the nearest of the eight directions, or null inside
 * the dead zone. Fire and movement both go through it, from every input
 * device, which is what makes a keyboard and an analogue stick equals on the
 * shared board.
 */
export function snap8(x: number, y: number): Pt | null {
  if (x * x + y * y < DEAD_ZONE * DEAD_ZONE) return null;
  const a = Math.atan2(y, x);
  const i = ((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8;
  return DIRS8[i];
}

/** The eight-direction index (0 east, clockwise) a unit vector points at. */
export function dirIndex(d: Pt): number {
  return ((Math.round(Math.atan2(d.y, d.x) / (Math.PI / 4)) % 8) + 8) % 8;
}

export const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y);

/** A unit vector from `a` toward `b`; east when the two coincide. */
export function toward(a: Pt, b: Pt): Pt {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy);
  return d > 1e-9 ? { x: dx / d, y: dy / d } : { x: 1, y: 0 };
}
