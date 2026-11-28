/**
 * HOTFIX's controls. `composeInput` is the pure half: it turns held keys, a
 * stick and three buttons into the run's `RunInput`, and is what the tests
 * read. `createControls` is the DOM half: the keyboard, a floating touch
 * stick on the canvas, the three touch buttons under it, and a gamepad.
 *
 * Keys drive like a car (up is the accelerator, left and right the wheel);
 * a stick, on glass or on a pad, points where to go and the car works out
 * the rest. Either way the same car answers.
 */
import type { RunInput } from './run';

export interface Stick {
  x: number;
  y: number;
}

export interface Buttons {
  action: boolean;
  handbrake: boolean;
  horn: boolean;
}

/** Keys the game takes for itself while a shift is running, so the page does not scroll under it. */
export const GAME_KEYS = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'w',
  'a',
  's',
  'd',
  ' ',
  'Enter',
  'e',
  'f',
  'h'
]);

/** Pixels of thumb travel that count as the stick pushed all the way. */
export const STICK_RANGE = 34;

export function composeInput(keys: ReadonlySet<string>, stick: Stick | null, buttons: Buttons): RunInput {
  const has = (...names: string[]) => names.some(n => keys.has(n));
  const action = buttons.action || has('Enter', 'e', 'f');
  const handbrake = buttons.handbrake || has(' ');
  const horn = buttons.horn || has('h');
  if (stick && Math.hypot(stick.x, stick.y) > 0.15) {
    return { moveX: stick.x, moveY: stick.y, mode: 'stick', handbrake, action, horn };
  }
  const moveX = (has('ArrowRight', 'd') ? 1 : 0) - (has('ArrowLeft', 'a') ? 1 : 0);
  const moveY = (has('ArrowDown', 's') ? 1 : 0) - (has('ArrowUp', 'w') ? 1 : 0);
  return { moveX, moveY, mode: 'keys', handbrake, action, horn };
}

/** The first connected pad's left stick and face buttons, or null with no pad. */
export function readGamepad(pads: readonly (Gamepad | null)[]): { stick: Stick; buttons: Buttons } | null {
  const pad = pads.find(p => p && p.connected);
  if (!pad) return null;
  const pressed = (i: number) => !!pad.buttons[i]?.pressed;
  let x = pad.axes[0] ?? 0;
  let y = pad.axes[1] ?? 0;
  if (pressed(14)) x = -1;
  if (pressed(15)) x = 1;
  if (pressed(12)) y = -1;
  if (pressed(13)) y = 1;
  return { stick: { x, y }, buttons: { action: pressed(0) || pressed(3), handbrake: pressed(1) || pressed(7), horn: pressed(2) } };
}

export interface Controls {
  read(): RunInput;
  /** Lets go of everything: for a pause, a blur, the end of a shift. */
  release(): void;
  /** Where the touch stick is, in logical canvas pixels, for drawing; null when no thumb is down. */
  stickOrigin(): Stick | null;
  stickAt(): Stick | null;
}

type Listen = <K extends keyof WindowEventMap>(target: Window | Document, type: K, handler: (e: WindowEventMap[K]) => void) => void;

export function createControls(
  canvas: HTMLCanvasElement,
  toLogical: (e: { clientX: number; clientY: number }) => { x: number; y: number },
  listen: Listen,
  playing: () => boolean,
  buttonEls: Partial<Record<keyof Buttons, HTMLElement | null>>
): Controls {
  const keys = new Set<string>();
  const touchButtons: Buttons = { action: false, handbrake: false, horn: false };
  let pointer: number | null = null;
  let origin: Stick | null = null;
  let at: Stick | null = null;

  const keyName = (e: KeyboardEvent) => (e.key.length === 1 ? e.key.toLowerCase() : e.key);
  listen(window, 'keydown', e => {
    if (!playing()) return;
    const key = keyName(e);
    if (!GAME_KEYS.has(key)) return;
    e.preventDefault();
    keys.add(key);
  });
  listen(window, 'keyup', e => keys.delete(keyName(e)));

  canvas.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' || !playing() || pointer !== null) return;
    pointer = e.pointerId;
    origin = toLogical(e);
    at = origin;
    canvas.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  canvas.addEventListener('pointermove', e => {
    if (e.pointerId !== pointer || !origin) return;
    const p = toLogical(e);
    const d = Math.hypot(p.x - origin.x, p.y - origin.y);
    const scale = d > STICK_RANGE ? STICK_RANGE / d : 1;
    at = { x: origin.x + (p.x - origin.x) * scale, y: origin.y + (p.y - origin.y) * scale };
  });
  const lift = (e: PointerEvent) => {
    if (e.pointerId !== pointer) return;
    pointer = null;
    origin = null;
    at = null;
  };
  canvas.addEventListener('pointerup', lift);
  canvas.addEventListener('pointercancel', lift);

  for (const name of ['action', 'handbrake', 'horn'] as const) {
    const el = buttonEls[name];
    if (!el) continue;
    const set = (down: boolean) => (e: Event) => {
      e.preventDefault();
      touchButtons[name] = down;
    };
    el.addEventListener('pointerdown', set(true));
    el.addEventListener('pointerup', set(false));
    el.addEventListener('pointerleave', set(false));
    el.addEventListener('pointercancel', set(false));
    el.addEventListener('contextmenu', e => e.preventDefault());
  }

  return {
    read() {
      const pad = typeof navigator !== 'undefined' && navigator.getGamepads ? readGamepad(navigator.getGamepads()) : null;
      const touch = origin && at ? { x: (at.x - origin.x) / STICK_RANGE, y: (at.y - origin.y) / STICK_RANGE } : null;
      const stick = touch ?? pad?.stick ?? null;
      const buttons: Buttons = {
        action: touchButtons.action || !!pad?.buttons.action,
        handbrake: touchButtons.handbrake || !!pad?.buttons.handbrake,
        horn: touchButtons.horn || !!pad?.buttons.horn
      };
      return composeInput(keys, stick, buttons);
    },
    release() {
      keys.clear();
      pointer = null;
      origin = null;
      at = null;
      touchButtons.action = touchButtons.handbrake = touchButtons.horn = false;
    },
    stickOrigin: () => origin,
    stickAt: () => at
  };
}
