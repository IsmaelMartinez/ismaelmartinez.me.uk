/**
 * The command reader: six buttons, eight directions, and the motions that
 * turn them into special moves, after Street Fighter II's.
 *
 * DOM-free. A fighter keeps a short history of what its player held each
 * frame, already turned into **numpad notation relative to its facing** (6 is
 * toward the opponent, 4 away, 2 down, 8 up, 5 neutral), because every motion
 * in the genre is written that way and a fireball must come out of a
 * quarter-circle *forward* whichever side of the screen the player stands on.
 * The CPU feeds this same reader through the same `FrameInput`, so its
 * specials are motions it actually performs rather than moves it is handed.
 */

/** Button bits. Punches are the low three, kicks the high three. */
export const LP = 1;
export const MP = 2;
export const HP = 4;
export const LK = 8;
export const MK = 16;
export const HK = 32;
export const PUNCHES = LP | MP | HP;
export const KICKS = LK | MK | HK;

/** What one player's hands are doing on one frame, in screen terms. */
export interface FrameInput {
  /** -1 left, 0, 1 right. */
  x: -1 | 0 | 1;
  /** -1 up, 0, 1 down. */
  y: -1 | 0 | 1;
  /** Buttons held this frame. */
  held: number;
  /** Buttons that went down this frame. */
  pressed: number;
}

export const NO_INPUT: FrameInput = Object.freeze({ x: 0, y: 0, held: 0, pressed: 0 });

/** Numpad direction of a stick, relative to a fighter facing `facing` (1 right, -1 left). */
export function numpad(x: number, y: number, facing: 1 | -1): number {
  const fx = Math.sign(x) * facing;
  const row = y < 0 ? 2 : y > 0 ? 0 : 1;
  return 1 + row * 3 + (fx + 1);
}

export const isBack = (d: number): boolean => d === 1 || d === 4 || d === 7;
export const isForward = (d: number): boolean => d === 3 || d === 6 || d === 9;
export const isDown = (d: number): boolean => d <= 3;
export const isUp = (d: number): boolean => d >= 7;

/** The strongest button of a kind pressed in a mask: 0 light, 1 medium, 2 heavy, -1 none. */
export function strengthOf(mask: number, kind: 'P' | 'K'): -1 | 0 | 1 | 2 {
  const m = kind === 'P' ? mask & PUNCHES : (mask & KICKS) >> 3;
  if (m & 4) return 2;
  if (m & 2) return 1;
  if (m & 1) return 0;
  return -1;
}

export type Motion =
  | 'qcf' // 2 3 6
  | 'qcb' // 2 1 4
  | 'dp' // 6 2 3
  | 'hcb' // 6 3 2 1 4
  | 'chargeBF' // hold back, then forward
  | 'chargeDU' // hold down, then up
  | 'mash' // the same kind of button, five times quickly
  | 'ppp'; // all three punches at once

/** Frames of history kept. */
export const HISTORY = 40;
/** Frames a motion may take from its first direction to the button. */
const MOTION_WINDOW = 18;
/** A half-circle is a longer gesture and gets a longer window. */
const HCB_WINDOW = 26;
/** Frames back (or down) must be held to charge. */
export const CHARGE_FRAMES = 45;
/** Frames between releasing the charge and the button. */
const CHARGE_GRACE = 10;
/** Presses needed, and the window they must land in, for a mash special. */
const MASH_PRESSES = 4;
const MASH_WINDOW = 24;
/** Frames the three punches may be spread across. */
const PPP_WINDOW = 3;

export interface CommandBuffer {
  /** Relative numpad direction per frame, newest last. */
  dirs: number[];
  /** Buttons pressed per frame, newest last. */
  presses: number[];
  /** Consecutive frames back (1, 4, 7) has been held, and when it was let go. */
  backCharge: number;
  backReleased: number;
  downCharge: number;
  downReleased: number;
}

export function createBuffer(): CommandBuffer {
  return { dirs: [], presses: [], backCharge: 0, backReleased: 99, downCharge: 0, downReleased: 99 };
}

/** Record one frame. Charges carry their last full value through a short grace. */
export function pushFrame(buf: CommandBuffer, dir: number, pressed: number): void {
  buf.dirs.push(dir);
  buf.presses.push(pressed);
  if (buf.dirs.length > HISTORY) {
    buf.dirs.shift();
    buf.presses.shift();
  }
  if (isBack(dir)) {
    buf.backCharge++;
    buf.backReleased = 0;
  } else {
    buf.backReleased++;
    if (buf.backReleased > CHARGE_GRACE) buf.backCharge = 0;
  }
  if (isDown(dir)) {
    buf.downCharge++;
    buf.downReleased = 0;
  } else {
    buf.downReleased++;
    if (buf.downReleased > CHARGE_GRACE) buf.downCharge = 0;
  }
}

/**
 * Whether `seq` appears in order in the last `window` frames of directions.
 * Each step may be held for any number of frames and other directions may
 * sit between steps, as long as the order holds — which is how loose the
 * arcade's reader was, and why a rolled thumb still throws a fireball.
 */
function sequenceIn(dirs: readonly number[], seq: readonly number[], window: number): boolean {
  let i = seq.length - 1;
  for (let f = dirs.length - 1; f >= 0 && f >= dirs.length - window; f--) {
    if (dirs[f] === seq[i]) {
      i--;
      if (i < 0) return true;
    }
  }
  return false;
}

/**
 * Whether the motion is complete on this frame. Called only on a frame a
 * button of the right kind went down (the press is part of the motion), so a
 * motion is never read twice off one gesture.
 */
export function motionDone(buf: CommandBuffer, motion: Motion, kind: 'P' | 'K'): boolean {
  const dirs = buf.dirs;
  const now = dirs[dirs.length - 1] ?? 5;
  switch (motion) {
    case 'qcf':
      return sequenceIn(dirs, [2, 3, 6], MOTION_WINDOW) && isForward(now);
    case 'qcb':
      return sequenceIn(dirs, [2, 1, 4], MOTION_WINDOW) && isBack(now);
    case 'dp':
      // The dragon punch: forward, down, down-forward. A held 3 at the end
      // still counts, so the press may come a frame late.
      return sequenceIn(dirs, [6, 2, 3], MOTION_WINDOW) && (now === 3 || now === 6);
    case 'hcb':
      return sequenceIn(dirs, [6, 2, 4], HCB_WINDOW) && (isBack(now) || isUp(now));
    case 'chargeBF':
      return buf.backCharge >= CHARGE_FRAMES && isForward(now);
    case 'chargeDU':
      return buf.downCharge >= CHARGE_FRAMES && isUp(now);
    case 'mash': {
      const mask = kind === 'P' ? PUNCHES : KICKS;
      let presses = 0;
      const p = buf.presses;
      for (let f = p.length - 1; f >= 0 && f >= p.length - MASH_WINDOW; f--) {
        if (p[f] & mask) presses++;
      }
      return presses >= MASH_PRESSES;
    }
    case 'ppp': {
      let got = 0;
      const p = buf.presses;
      for (let f = p.length - 1; f >= 0 && f >= p.length - PPP_WINDOW; f--) got |= p[f] & PUNCHES;
      return got === PUNCHES;
    }
  }
}

/** Forget the motion once it has fired, so one gesture is one special. */
export function consumeMotion(buf: CommandBuffer, motion: Motion): void {
  if (motion === 'chargeBF') buf.backCharge = 0;
  else if (motion === 'chargeDU') buf.downCharge = 0;
  else if (motion === 'mash') buf.presses.fill(0);
  else buf.dirs.fill(5);
}
