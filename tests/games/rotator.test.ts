import { describe, it, expect } from 'vitest';
import { createViewRotator } from '../../src/games/engine/rotator';
import type { Rotation } from '../../src/games/engine/iso';

/** The rotator only touches canvas.style.transform. */
function fakeCanvas(): HTMLCanvasElement {
  return { style: { transform: '' } } as unknown as HTMLCanvasElement;
}

describe('createViewRotator', () => {
  it('swaps the rotation exactly once, at the flip midpoint', () => {
    const changes: Rotation[] = [];
    const rotator = createViewRotator(fakeCanvas(), rot => changes.push(rot));
    rotator.start(1);
    rotator.update(0.1); // before the midpoint of the 0.32s flip
    expect(changes).toEqual([]);
    rotator.update(0.1); // past the midpoint
    expect(changes).toEqual([1]);
    rotator.update(0.2); // through the end
    expect(changes).toEqual([1]);
    expect(rotator.rotation()).toBe(1);
  });

  it('wraps counter-clockwise turns from 0 to 3', () => {
    const canvas = fakeCanvas();
    const rotator = createViewRotator(canvas, () => {});
    rotator.start(-1);
    rotator.update(1); // one big tick runs the whole flip
    expect(rotator.rotation()).toBe(3);
  });

  it('ignores start() while a flip is animating, then accepts the next one', () => {
    const rotator = createViewRotator(fakeCanvas(), () => {});
    rotator.start(1);
    rotator.update(0.05);
    expect(rotator.animating()).toBe(true);
    rotator.start(1); // swallowed
    rotator.update(1);
    expect(rotator.animating()).toBe(false);
    expect(rotator.rotation()).toBe(1);
    rotator.start(1);
    rotator.update(1);
    expect(rotator.rotation()).toBe(2);
  });

  it('applies a rotateY transform mid-flip and clears it when done', () => {
    const canvas = fakeCanvas();
    const rotator = createViewRotator(canvas, () => {});
    rotator.start(1);
    rotator.update(0.08); // quarter of the way: half of the first 90° sweep
    expect(canvas.style.transform).toBe('perspective(1000px) rotateY(45deg)');
    rotator.update(1);
    expect(canvas.style.transform).toBe('');
  });

  it('still swaps the rotation when one tick jumps past the whole flip', () => {
    // A backgrounded tab can deliver a dt that leaps from t<0.5 straight
    // past t=1 — the midpoint swap must not be skipped.
    const changes: Rotation[] = [];
    const rotator = createViewRotator(fakeCanvas(), rot => changes.push(rot));
    rotator.start(1);
    rotator.update(5);
    expect(changes).toEqual([1]);
    expect(rotator.animating()).toBe(false);
  });
});
