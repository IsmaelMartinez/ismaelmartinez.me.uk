/**
 * The two sticks, from whatever the contestant has in their hands.
 *
 * Four sources feed one `RunInput`: the keyboard (WASD moves, the arrow keys
 * or IJKL fire), a gamepad (left stick or d-pad moves, right stick fires),
 * the mouse (hold a button to fire toward the pointer; the keyboard still
 * moves) and touch (two floating sticks, one on each half of the canvas,
 * anchored where the thumb lands). `composeInput` is the pure part, unit
 * tested; `createTwinStick` is the DOM wiring around it, and keeps the touch
 * sticks' geometry for the renderer to draw.
 */
import { CANVAS_W, DEAD_ZONE, type Pt } from './arena';
import type { RunInput } from './run';

export interface Stick {
  /** Where the thumb first landed, in logical canvas coordinates. */
  anchor: Pt;
  /** Where it is now. */
  at: Pt;
  pointerId: number;
}

export interface InputSources {
  keys: ReadonlySet<string>;
  /** The gamepad's two sticks (and d-pad folded into the left one), or null without one. */
  pad: { moveX: number; moveY: number; fireX: number; fireY: number } | null;
  /** The mouse: whether a button is down and the vector from the contestant to the pointer. */
  mouse: { down: boolean; dx: number; dy: number } | null;
  move: Stick | null;
  fire: Stick | null;
}

/** Pixels of thumb travel for a full deflection of a touch stick. */
export const STICK_RANGE = 44;

const MOVE_KEYS: Record<string, [number, number]> = {
  w: [0, -1],
  a: [-1, 0],
  s: [0, 1],
  d: [1, 0]
};
const FIRE_KEYS: Record<string, [number, number]> = {
  ArrowUp: [0, -1],
  ArrowLeft: [-1, 0],
  ArrowDown: [0, 1],
  ArrowRight: [1, 0],
  i: [0, -1],
  j: [-1, 0],
  k: [0, 1],
  l: [1, 0]
};

/** Every key the game consumes, so the page does not scroll under a fight. */
export const GAME_KEYS: ReadonlySet<string> = new Set([
  ...Object.keys(MOVE_KEYS),
  ...Object.keys(MOVE_KEYS).map(k => k.toUpperCase()),
  ...Object.keys(FIRE_KEYS),
  ...['I', 'J', 'K', 'L'],
  ' '
]);

function fromKeys(keys: ReadonlySet<string>, table: Record<string, [number, number]>): Pt {
  let x = 0;
  let y = 0;
  for (const [key, [kx, ky]] of Object.entries(table)) {
    if (keys.has(key) || keys.has(key.toUpperCase())) {
      x += kx;
      y += ky;
    }
  }
  return { x: Math.sign(x), y: Math.sign(y) };
}

/** A touch stick's deflection, -1..1 on each axis, clamped to the unit disc. */
export function stickVector(stick: Stick): Pt {
  const dx = (stick.at.x - stick.anchor.x) / STICK_RANGE;
  const dy = (stick.at.y - stick.anchor.y) / STICK_RANGE;
  const m = Math.hypot(dx, dy);
  if (m <= 1) return { x: dx, y: dy };
  return { x: dx / m, y: dy / m };
}

const live = (v: Pt): boolean => v.x * v.x + v.y * v.y >= DEAD_ZONE * DEAD_ZONE;

/**
 * One frame's input from every source. The first live source wins per stick,
 * keyboard first: a stick that is centred (inside the dead zone) yields to
 * the next, so a gamepad left plugged in never pins the contestant.
 */
export function composeInput(s: InputSources): RunInput {
  const moves: Pt[] = [fromKeys(s.keys, MOVE_KEYS)];
  if (s.pad) moves.push({ x: s.pad.moveX, y: s.pad.moveY });
  if (s.move) moves.push(stickVector(s.move));
  const fires: Pt[] = [fromKeys(s.keys, FIRE_KEYS)];
  if (s.pad) fires.push({ x: s.pad.fireX, y: s.pad.fireY });
  if (s.mouse?.down) fires.push({ x: s.mouse.dx, y: s.mouse.dy });
  if (s.fire) fires.push(stickVector(s.fire));
  const move = moves.find(live) ?? { x: 0, y: 0 };
  const fire = fires.find(live) ?? { x: 0, y: 0 };
  return { moveX: move.x, moveY: move.y, fireX: fire.x, fireY: fire.y };
}

/** The gamepad's sticks, with the d-pad folded into the left stick; null when none is connected. */
export function readGamepad(pads: readonly (Gamepad | null)[] | undefined): InputSources['pad'] {
  if (!pads) return null;
  const pad = pads.find(p => p && p.connected);
  if (!pad) return null;
  const axis = (i: number) => (pad.axes.length > i && Number.isFinite(pad.axes[i]) ? pad.axes[i] : 0);
  const button = (i: number) => (pad.buttons.length > i && pad.buttons[i].pressed ? 1 : 0);
  // Standard mapping: 12 up, 13 down, 14 left, 15 right.
  const dpadX = button(15) - button(14);
  const dpadY = button(13) - button(12);
  return {
    moveX: dpadX || axis(0),
    moveY: dpadY || axis(1),
    fireX: axis(2),
    fireY: axis(3)
  };
}

export interface TwinStick {
  /** This frame's input, from every source. */
  read(playerAt: Pt): RunInput;
  /** The touch sticks on the canvas right now, for the renderer. */
  readonly move: Stick | null;
  readonly fire: Stick | null;
  /** Whether a pointer is currently down on the canvas, so a stray tap can be told from a game gesture. */
  readonly touching: boolean;
  /** Forget every held key (on a focus loss, or a run's end), so nothing sticks. */
  release(): void;
}

/**
 * Wires the keyboard, the mouse and touch to one canvas. Keys are tracked on
 * `document` through `listen` (the caller passes `listenUntilSwap` so the
 * listeners retire with the page); pointer events stay on the canvas, which
 * a ClientRouter swap replaces along with them.
 */
export function createTwinStick(
  canvas: HTMLCanvasElement,
  toLogical: (e: { clientX: number; clientY: number }) => Pt,
  listen: (
    target: Document,
    type: 'keydown' | 'keyup',
    handler: (e: KeyboardEvent) => void
  ) => void,
  canAct: () => boolean
): TwinStick {
  const keys = new Set<string>();
  let move: Stick | null = null;
  let fire: Stick | null = null;
  let mouse: { down: boolean; at: Pt } = { down: false, at: { x: 0, y: 0 } };

  listen(document, 'keydown', e => {
    if (!canAct()) return;
    if (GAME_KEYS.has(e.key)) e.preventDefault();
    keys.add(e.key.length === 1 ? e.key.toLowerCase() : e.key);
  });
  listen(document, 'keyup', e => {
    keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key);
  });

  canvas.addEventListener('pointerdown', e => {
    if (!canAct()) return;
    const at = toLogical(e);
    if (e.pointerType === 'mouse') {
      mouse = { down: true, at };
      canvas.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    // The left half of the floor is the move stick, the right half fire; a
    // second thumb takes whichever stick is free.
    const stick: Stick = { anchor: at, at, pointerId: e.pointerId };
    const left = at.x < CANVAS_W / 2;
    if (left ? !move : fire !== null && !move) move = stick;
    else if (!fire) fire = stick;
    else if (!move) move = stick;
  });
  canvas.addEventListener('pointermove', e => {
    const at = toLogical(e);
    if (e.pointerType === 'mouse') {
      mouse.at = at;
      return;
    }
    if (move?.pointerId === e.pointerId) move.at = at;
    else if (fire?.pointerId === e.pointerId) fire.at = at;
  });
  const lift = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') {
      mouse.down = false;
      return;
    }
    if (move?.pointerId === e.pointerId) move = null;
    if (fire?.pointerId === e.pointerId) fire = null;
  };
  canvas.addEventListener('pointerup', lift);
  canvas.addEventListener('pointercancel', lift);
  canvas.addEventListener('lostpointercapture', lift);
  // A context menu on a held right button would steal the pointer mid-fight.
  canvas.addEventListener('contextmenu', e => e.preventDefault());

  return {
    get move() {
      return move;
    },
    get fire() {
      return fire;
    },
    get touching() {
      return move !== null || fire !== null || mouse.down;
    },
    read(playerAt) {
      const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : undefined;
      return composeInput({
        keys,
        pad: readGamepad(pads),
        mouse: mouse.down ? { down: true, dx: mouse.at.x - playerAt.x, dy: mouse.at.y - playerAt.y } : null,
        move,
        fire
      });
    },
    release() {
      keys.clear();
      move = null;
      fire = null;
      mouse.down = false;
    }
  };
}
