/**
 * The control panel: two players' sticks and six buttons each, from a
 * keyboard, gamepads and an on-screen pad, turned into one `FrameInput` per
 * player per frame. The rules of what those inputs do are in `motion.ts`.
 *
 * Keys are read by `code`, not `key`, so the layout is the same physical
 * keys on any keyboard. Player one: WASD and U I O (punches) over J K L
 * (kicks); in a one-player game the arrow keys move player one as well.
 * Player two: the arrows and the numeric keypad's 7 8 9 over 4 5 6, or the
 * six keys above the arrows (Insert, Home, Page Up over Delete, End, Page
 * Down) on a keyboard without one. Gamepads use the fighting-pad layout:
 * X Y RB punch, A B RT kick.
 */
import { HK, HP, LK, LP, MK, MP, type FrameInput } from './motion';

const P1_KEYS: Record<string, number> = { KeyU: LP, KeyI: MP, KeyO: HP, KeyJ: LK, KeyK: MK, KeyL: HK };
const P2_KEYS: Record<string, number> = {
  Numpad7: LP,
  Numpad8: MP,
  Numpad9: HP,
  Numpad4: LK,
  Numpad5: MK,
  Numpad6: HK,
  Insert: LP,
  Home: MP,
  PageUp: HP,
  Delete: LK,
  End: MK,
  PageDown: HK
};
const P1_DIRS: Record<string, [number, number]> = { KeyW: [0, -1], KeyA: [-1, 0], KeyS: [0, 1], KeyD: [1, 0] };
const ARROWS: Record<string, [number, number]> = { ArrowUp: [0, -1], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowRight: [1, 0] };

/** Standard-mapping gamepad buttons to fight buttons. */
const PAD_BUTTONS: [number, number][] = [
  [2, LP],
  [3, MP],
  [5, HP],
  [0, LK],
  [1, MK],
  [7, HK],
  [4, HP],
  [6, HK]
];
const DEAD = 0.45;

export interface ControlPanel {
  /** This frame's input for both players; call once per simulation frame. */
  read(twoPlayer: boolean): [FrameInput, FrameInput];
  /** Whether a pad's Start (or Enter) went down since the last call. */
  startPressed(): boolean;
  /** Let go of everything (blur, pause). */
  release(): void;
}

interface Hands {
  dirs: Map<string, [number, number]>;
  buttons: number;
  /** Buttons pressed since the last read, so a tap between frames is never lost. */
  latched: number;
}

const hands = (): Hands => ({ dirs: new Map(), buttons: 0, latched: 0 });

export function createControlPanel(
  listen: <K extends keyof WindowEventMap>(target: Window, type: K, handler: (e: WindowEventMap[K]) => void) => void,
  active: () => boolean,
  touchRoot: HTMLElement | null
): ControlPanel {
  const keys: [Hands, Hands] = [hands(), hands()];
  const arrows = hands();
  const touch = hands();
  let lastPad: [number, number] = [0, 0];
  let start = false;
  let padStartWas = false;

  listen(window, 'keydown', e => {
    if (!active()) return;
    const code = e.code;
    let used = true;
    if (P1_DIRS[code]) keys[0].dirs.set(code, P1_DIRS[code]);
    else if (ARROWS[code]) arrows.dirs.set(code, ARROWS[code]);
    else if (P1_KEYS[code]) {
      if (!e.repeat) keys[0].latched |= P1_KEYS[code];
      keys[0].buttons |= P1_KEYS[code];
    } else if (P2_KEYS[code]) {
      if (!e.repeat) keys[1].latched |= P2_KEYS[code];
      keys[1].buttons |= P2_KEYS[code];
    } else if (code === 'Enter' || code === 'Space') start = true;
    else used = false;
    // The arrows and space would scroll the page under the fight.
    if (used) e.preventDefault();
  });
  listen(window, 'keyup', e => {
    const code = e.code;
    keys[0].dirs.delete(code);
    arrows.dirs.delete(code);
    if (P1_KEYS[code]) keys[0].buttons &= ~P1_KEYS[code];
    if (P2_KEYS[code]) keys[1].buttons &= ~P2_KEYS[code];
  });

  if (touchRoot) wireTouch(touchRoot, touch);

  function sumDirs(...hs: Hands[]): [number, number] {
    let x = 0;
    let y = 0;
    for (const h of hs) for (const [dx, dy] of h.dirs.values()) {
      x += dx;
      y += dy;
    }
    return [Math.sign(x), Math.sign(y)];
  }

  function pads(): { x: number; y: number; buttons: number }[] {
    const out: { x: number; y: number; buttons: number }[] = [];
    const list = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    let startNow = false;
    for (const pad of list) {
      if (!pad || !pad.connected) continue;
      const b = (i: number) => !!pad.buttons[i]?.pressed;
      let x = (b(15) ? 1 : 0) - (b(14) ? 1 : 0);
      let y = (b(13) ? 1 : 0) - (b(12) ? 1 : 0);
      const ax = pad.axes[0] ?? 0;
      const ay = pad.axes[1] ?? 0;
      if (Math.abs(ax) > DEAD) x = Math.sign(ax);
      if (Math.abs(ay) > DEAD) y = Math.sign(ay);
      let buttons = 0;
      for (const [i, bit] of PAD_BUTTONS) if (b(i)) buttons |= bit;
      if (b(9)) startNow = true;
      out.push({ x, y, buttons });
    }
    if (startNow && !padStartWas) start = true;
    padStartWas = startNow;
    return out;
  }

  return {
    read(twoPlayer) {
      const pad = pads();
      const result: FrameInput[] = [0, 1].map(p => {
        const kb = p === 0 ? (twoPlayer ? sumDirs(keys[0], touch) : sumDirs(keys[0], arrows, touch)) : sumDirs(arrows);
        let [x, y] = kb;
        let held = keys[p].buttons | (p === 0 ? touch.buttons : 0);
        let latched = keys[p].latched | (p === 0 ? touch.latched : 0);
        // One pad plays player one alone; two pads take a side each.
        const mine = pad.length >= 2 ? pad[p] : p === 0 ? pad[0] : undefined;
        if (mine) {
          if (!x) x = mine.x;
          if (!y) y = mine.y;
          held |= mine.buttons;
          latched |= mine.buttons & ~lastPad[p];
          lastPad[p] = mine.buttons;
        }
        keys[p].latched = 0;
        if (p === 0) touch.latched = 0;
        return { x: x as -1 | 0 | 1, y: y as -1 | 0 | 1, held: held | latched, pressed: latched };
      });
      return [result[0], result[1]];
    },
    startPressed() {
      pads();
      const s = start;
      start = false;
      return s;
    },
    release() {
      for (const h of [...keys, arrows, touch]) {
        h.dirs.clear();
        h.buttons = 0;
        h.latched = 0;
      }
      lastPad = [0, 0];
      start = false;
    }
  };
}

/**
 * The on-screen pad: an eight-way stick on the left (the direction is where
 * the thumb is from the stick's centre) and six buttons on the right, each
 * multi-touch, so a thumb can hold back while the other jabs.
 */
function wireTouch(root: HTMLElement, h: Hands): void {
  const stick = root.querySelector<HTMLElement>('[data-stick]');
  const knob = root.querySelector<HTMLElement>('[data-knob]');
  if (stick) {
    let id: number | null = null;
    const move = (e: PointerEvent) => {
      const r = stick.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      const dead = r.width * 0.16;
      const x = Math.abs(dx) > dead && Math.abs(dx) > Math.abs(dy) * 0.45 ? Math.sign(dx) : 0;
      const y = Math.abs(dy) > dead && Math.abs(dy) > Math.abs(dx) * 0.45 ? Math.sign(dy) : 0;
      h.dirs.set('touch', [x, y]);
      if (knob) knob.style.transform = `translate(${x * 30}%, ${y * 30}%)`;
    };
    stick.addEventListener('pointerdown', e => {
      id = e.pointerId;
      stick.setPointerCapture(e.pointerId);
      move(e);
      e.preventDefault();
    });
    stick.addEventListener('pointermove', e => {
      if (e.pointerId === id) move(e);
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      id = null;
      h.dirs.delete('touch');
      if (knob) knob.style.transform = '';
    };
    stick.addEventListener('pointerup', end);
    stick.addEventListener('pointercancel', end);
  }
  const bits: Record<string, number> = { lp: LP, mp: MP, hp: HP, lk: LK, mk: MK, hk: HK };
  root.querySelectorAll<HTMLElement>('[data-button]').forEach(btn => {
    const bit = bits[btn.dataset.button ?? ''] ?? 0;
    btn.addEventListener('pointerdown', e => {
      btn.setPointerCapture(e.pointerId);
      h.latched |= bit;
      h.buttons |= bit;
      btn.classList.add('down');
      e.preventDefault();
    });
    const up = () => {
      h.buttons &= ~bit;
      btn.classList.remove('down');
    };
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
  });
}
