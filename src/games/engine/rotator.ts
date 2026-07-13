/**
 * Quarter-turn view-rotation controller shared by the isometric sims
 * (Microcity, Pixel Park). Owns the rotation state, the double-tap guard,
 * the prefers-reduced-motion fallback, and the two-phase rotateY flip that
 * spins the old view edge-on, swaps the rotation at the midpoint, and spins
 * the new view back in.
 *
 * Games react through `onChange` (rebuild the view, drop screen-space
 * effects) and must ignore canvas input while `animating()` is true — the
 * CSS transform shrinks the canvas's bounding rect mid-spin, so any
 * screen→tile unprojection would land on the wrong tile.
 */
import type { Rotation } from './iso';

const FLIP_DURATION = 0.32; // seconds

export interface ViewRotator {
  rotation(): Rotation;
  /** True while the flip is mid-spin — canvas picking is unreliable then. */
  animating(): boolean;
  /** Kicks off a quarter turn (1 = clockwise); taps during a running flip are ignored. */
  start(dir: 1 | -1): void;
  /** Advances the flip; call once per update tick. */
  update(dt: number): void;
}

export function createViewRotator(
  canvas: HTMLCanvasElement,
  onChange: (rot: Rotation) => void
): ViewRotator {
  const reduceMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  let rotation: Rotation = 0;
  let anim: { t: number; dir: 1 | -1; swapped: boolean } | null = null;

  function turn(dir: 1 | -1) {
    rotation = ((((rotation + dir) % 4) + 4) % 4) as Rotation;
    onChange(rotation);
  }

  return {
    rotation: () => rotation,
    animating: () => anim !== null,
    start(dir) {
      if (anim) return;
      if (reduceMotion) {
        turn(dir);
        return;
      }
      anim = { t: 0, dir, swapped: false };
    },
    update(dt) {
      if (!anim) return;
      anim.t += dt;
      const t = Math.min(1, anim.t / FLIP_DURATION);
      // First half spins the current view edge-on; at the midpoint (an
      // imperceptible sliver) the underlying rotation swaps and the second
      // half spins the new view back in from the opposite edge.
      if (t >= 0.5 && !anim.swapped) {
        anim.swapped = true;
        turn(anim.dir);
      }
      // Without a perspective term rotateY is a flat horizontal squish;
      // with one the board reads as a card flipping in 3D.
      const angle = anim.dir * 90 * (t < 0.5 ? t * 2 : (t - 1) * 2);
      canvas.style.transform = t >= 1 ? '' : `perspective(1000px) rotateY(${angle}deg)`;
      if (t >= 1) anim = null;
    }
  };
}
