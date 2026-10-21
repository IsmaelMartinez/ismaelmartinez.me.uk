/**
 * Which sprite cel a fighter shows on this frame, for the fighters drawn
 * from puffolotti's CC0 Mustermenschen sheets (`sheets.ts`, built by
 * `scripts/fighter-sprites.py`).
 *
 * A move list (`sprite-sets.json`) names each animation as the source
 * frames it is built from. Here the fight state picks an animation and a
 * place in it: idles and walks loop on the fight clock, an attack spends its
 * start-up on the frames before its widest one, holds the widest (the
 * extended limb) through its active frames and plays the rest through its
 * recovery, and reactions and specials run off their own state clocks.
 *
 * DOM-free: `celFor` reads the fight state and nothing else, so a test can
 * assert that every state of every sheeted fighter lands on a real cel.
 */
import { AIR_FRAMES, GETUP_FRAMES, type FighterState } from './fight';
import { SHEETS, type SheetFrame } from './sheets';
import SETS from './sprite-sets.json';

export type SetName = keyof typeof SETS;
type Anims = Record<string, readonly number[]>;

/** The source frame to draw for a fighter, or null if it has no sheet. */
export function celFor(f: FighterState, clock: number): number | null {
  const sheet = SHEETS[f.id];
  if (!sheet) return null;
  const anims = SETS[sheet.set].anims as Anims;
  return pick(f, clock, anims, sheet.frames);
}

const loop = (a: readonly number[], t: number, hold: number): number => a[Math.floor(t / hold) % a.length];
/** Through an animation once over `span` frames, holding the last. */
const once = (a: readonly number[], t: number, span: number): number => a[Math.min(a.length - 1, Math.floor((Math.max(0, t) / Math.max(1, span)) * a.length))];

/** The cel in an animation whose limb reaches furthest: the hit frame. */
function widest(a: readonly number[], frames: Readonly<Record<number, SheetFrame>>): number {
  let best = 0;
  for (let i = 1; i < a.length; i++) if ((frames[a[i]]?.[2] ?? 0) > (frames[a[best]]?.[2] ?? 0)) best = i;
  return best;
}

/** Map an attack's cels onto its start-up, active and recovery frames. */
function strike(a: readonly number[], frames: Readonly<Record<number, SheetFrame>>, t: number, startup: number, active: number, recovery: number): number {
  const hit = widest(a, frames);
  if (t < startup) return hit === 0 ? a[0] : once(a.slice(0, hit), t, startup);
  if (t < startup + active + 2) return a[hit];
  const after = a.slice(hit + 1);
  if (!after.length) return a[hit];
  return once(after, t - startup - active - 2, Math.max(1, recovery - 2));
}

function pick(f: FighterState, clock: number, A: Anims, frames: Readonly<Record<number, SheetFrame>>): number {
  const t = f.frame;
  switch (f.state) {
    case 'stand':
      return loop(A.idle, clock, 8);
    case 'land':
      return t < 3 ? A.land[0] : loop(A.idle, clock, 8);
    case 'walk': {
      const forward = Math.sign(f.vx) === f.facing;
      const step = Math.floor(clock / 5);
      const n = A.walk.length;
      return A.walk[forward ? step % n : n - 1 - (step % n)];
    }
    case 'guard':
      return A.guard[0];
    case 'crouch':
      return t < 2 ? A.crouchIn[0] : A.crouch[0];
    case 'prejump':
      return A.prejump[0];
    case 'jump': {
      const a = f.action;
      if (a?.normal) {
        const cels = a.button === 'P' ? A.airP : A.airK;
        return t < a.normal.startup ? cels[0] : cels[Math.min(cels.length - 1, 1 + Math.floor((t - a.normal.startup) / 6))];
      }
      if (f.jumpDir !== 0 && f.id !== 'boris' && f.id !== 'tora') {
        const p = Math.min(1, t / AIR_FRAMES);
        if (p > 0.12 && p < 0.88) return loop(A.flip, t, 4);
      }
      if (f.vy > 2) return once(A.jumpUp, t, 12);
      return f.vy > -2 ? A.jumpTop[0] : A.jumpDown[0];
    }
    case 'attack': {
      const a = f.action;
      const n = a?.normal;
      if (!a || !n) return A.idle[0];
      const key = `${a.posture}${a.button}${a.strength}`;
      return strike(A[key] ?? A.standP0, frames, t, n.startup, n.active, n.recovery);
    }
    case 'special':
      return special(f, A, frames);
    case 'blockstun':
      return f.low ? A.crouchGuard[0] : A.guard[0];
    case 'hitstun':
      if (f.low) return A.hitCrouch[0];
      return once(f.hitHigh ? A.hitHigh : A.hitLow, t, 14);
    case 'fall':
      if (f.y > 2 || f.vy > 0) return once(A.fall, t, 26);
      return A.down[0];
    case 'ko':
      if (f.y > 2 || f.vy > 0) return once(A.ko, t, 30);
      return A.down[A.down.length - 1];
    case 'down':
      return once(A.down, t, 20);
    case 'getup':
      return once(A.getup, t, GETUP_FRAMES);
    case 'dizzy':
      return loop(A.dizzy, clock, 6);
    case 'throw':
      return once(A.throw, t, 20);
    case 'thrown':
      return once(A.thrown, t, 24);
    case 'win':
      return t < 20 ? loop(A.idle, clock, 8) : once(A.win, t - 20, 36);
    case 'lose':
      return loop(A.lose, clock, 12);
  }
}

function special(f: FighterState, A: Anims, frames: Readonly<Record<number, SheetFrame>>): number {
  const a = f.action;
  const s = a?.special;
  if (!a || !s) return A.idle[0];
  const t = a.t;
  switch (s.kind) {
    case 'projectile':
    case 'breath':
      return once(A.fireball, t, s.kind === 'breath' ? 20 : 14);
    case 'rising':
      return f.y <= 0 && t > 6 ? A.crouch[0] : once(A.uppercut, t, 14);
    case 'flip':
      return f.y <= 0 ? A.crouch[0] : loop(A.flip, t, 3);
    case 'spin':
      return t < 6 ? A.jumpUp[0] : loop(A.spinKick, t, 3);
    case 'rapid': {
      const cels = s.button === 'K' ? [A.standK1[widest(A.standK1, frames)], A.standK2[widest(A.standK2, frames)], A.standK0[widest(A.standK0, frames)]] : [A.standP0[widest(A.standP0, frames)], A.standP1[widest(A.standP1, frames)], A.standP2[widest(A.standP2, frames)]];
      return loop(cels, t, 3);
    }
    case 'rush': {
      if (t < 8) return A.crouchIn[0];
      if (f.y > 0 || f.vy !== 0) return once(A.fall, t, 20);
      const cels = s.guard === 'low' ? A.crouchK2 : A.standP2;
      return a.travel > 0 ? cels[widest(cels, frames)] : cels[cels.length - 1];
    }
    case 'grab':
      return once(A.throw, t, 10);
    case 'lariat':
      return loop(A.spinKick, t, 4);
  }
}
