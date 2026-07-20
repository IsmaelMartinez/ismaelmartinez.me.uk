import { describe, it, expect, afterEach, vi } from 'vitest';
import { setupHiDpiCanvas, createStaticLayer, blink } from '../../src/games/engine/canvas';

describe('blink', () => {
  it('is on for the first half-phase and off for the second', () => {
    expect(blink(0)).toBe(true); // floor(0·1.5) = 0 → on
    expect(blink(0.5)).toBe(true); // floor(0.75) = 0 → on
    expect(blink(1)).toBe(false); // floor(1.5) = 1 → off
    expect(blink(4 / 3)).toBe(true); // floor(2) = 2 → on again
  });

  it('cycles at 1.5 half-phases per second', () => {
    // Consecutive half-phases flip: t and t + 2/3 always disagree.
    for (const t of [0, 0.4, 1.1, 7.77]) {
      expect(blink(t)).toBe(!blink(t + 2 / 3));
    }
  });

  it('offsets the cycle by integer phase', () => {
    for (const t of [0, 0.4, 1.1]) {
      expect(blink(t, 1)).toBe(!blink(t));
      expect(blink(t, 2)).toBe(blink(t));
    }
  });
});

/**
 * The suite runs under node, so window/document/canvas are hand-rolled fakes:
 * just enough surface for the helper's DPR sizing, listener lifecycle and
 * pointer mapping to run, with hooks to fire events and flip the ratio.
 */
interface FakeMq {
  media: string;
  readonly matches: boolean;
  listener: (() => void) | null;
  addEventListener(type: string, fn: () => void): void;
  removeEventListener(type: string, fn: () => void): void;
}

function makeMq(media: string, currentQuery: () => string): FakeMq {
  return {
    media,
    // Like the real thing: matches while the ratio the query is pinned to is
    // still the device's current ratio.
    get matches() {
      return media === currentQuery();
    },
    listener: null,
    addEventListener(_type, fn) {
      this.listener = fn;
    },
    removeEventListener(_type, fn) {
      if (this.listener === fn) this.listener = null;
    }
  };
}

function makeHarness(devicePixelRatio = 1) {
  const winListeners = new Map<string, Set<() => void>>();
  const docListeners = new Map<string, Set<() => void>>();
  const mqs: FakeMq[] = [];

  const listen = (map: Map<string, Set<() => void>>) => ({
    add(type: string, fn: () => void) {
      if (!map.has(type)) map.set(type, new Set());
      map.get(type)!.add(fn);
    },
    remove(type: string, fn: () => void) {
      map.get(type)?.delete(fn);
    },
    fire(type: string) {
      for (const fn of [...(map.get(type) ?? [])]) fn();
    },
    count(type: string) {
      return map.get(type)?.size ?? 0;
    }
  });

  const win = listen(winListeners);
  const doc = listen(docListeners);

  const windowStub = {
    devicePixelRatio,
    addEventListener: (t: string, fn: () => void) => win.add(t, fn),
    removeEventListener: (t: string, fn: () => void) => win.remove(t, fn),
    matchMedia: (query: string) => {
      const mq = makeMq(query, () => `(resolution: ${windowStub.devicePixelRatio || 1}dppx)`);
      mqs.push(mq);
      return mq;
    }
  };
  const documentStub = {
    addEventListener: (t: string, fn: () => void) => doc.add(t, fn),
    removeEventListener: (t: string, fn: () => void) => doc.remove(t, fn)
  };
  vi.stubGlobal('window', windowStub);
  vi.stubGlobal('document', documentStub);

  let rect = { left: 0, top: 0, width: 400, height: 200 };
  const canvas = {
    width: 0,
    height: 0,
    // Displayed at exactly logical size by default, so the CSS-upscale
    // factor is 1 and DPR-only expectations hold.
    clientWidth: 400,
    isConnected: true,
    style: {} as Record<string, string>,
    getBoundingClientRect: () => rect
  };
  const ctx = {
    transform: null as number[] | null,
    imageSmoothingEnabled: true,
    setTransform(...args: number[]) {
      this.transform = args;
      // Mirrors the real context: resizing the backing store resets state,
      // and the helper re-applies smoothing AFTER the transform.
      this.imageSmoothingEnabled = true;
    }
  };

  return {
    canvas,
    ctx,
    mqs,
    win,
    doc,
    setRatio(next: number) {
      windowStub.devicePixelRatio = next;
    },
    setRect(next: Partial<typeof rect>) {
      rect = { ...rect, ...next };
    },
    /** Fire the pending (once) listener of the most recent media query. */
    fireMq() {
      const mq = mqs[mqs.length - 1];
      const fn = mq.listener;
      mq.listener = null;
      fn?.();
    },
    setup(options?: Parameters<typeof setupHiDpiCanvas>[4]) {
      return setupHiDpiCanvas(
        canvas as unknown as HTMLCanvasElement,
        ctx as unknown as CanvasRenderingContext2D,
        400,
        200,
        options
      );
    }
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('DPR clamp and backing store sizing', () => {
  it.each([
    [1, 1],
    [1.25, 2], // fractional ratios ceil to an integer so pixel art scales cleanly
    [2, 2],
    [3, 3],
    [3.5, 3], // clamped: zoomed-in browsers must not allocate huge stores
    [0, 1] // defensive floor
  ])('devicePixelRatio %f → backing store at %ix logical', (ratio, expected) => {
    const h = makeHarness(ratio);
    h.setup();
    expect(h.canvas.width).toBe(400 * expected);
    expect(h.canvas.height).toBe(200 * expected);
    expect(h.ctx.transform).toEqual([expected, 0, 0, expected, 0, 0]);
  });

  it('sets the logical aspect-ratio inline style', () => {
    const h = makeHarness(2);
    h.setup();
    expect(h.canvas.style.aspectRatio).toBe('400 / 200');
  });

  it('accounts for CSS displaying the canvas larger than logical size', () => {
    const h = makeHarness(1);
    // Displayed at 500 CSS px for 400 logical px → 1.25x upscale, so a 1x
    // store would be blurry even on a 1x screen; ceil provisions 2x.
    h.canvas.clientWidth = 500;
    h.setup();
    expect(h.canvas.width).toBe(800);
    expect(h.ctx.transform).toEqual([2, 0, 0, 2, 0, 0]);
  });

  it('falls back to logical size when clientWidth is 0 (not yet laid out)', () => {
    const h = makeHarness(2);
    h.canvas.clientWidth = 0;
    h.setup();
    expect(h.canvas.width).toBe(800);
  });
});

describe('DPR change lifecycle', () => {
  it('resize with a new ratio re-sizes the backing store', () => {
    const h = makeHarness(1);
    h.setup();
    h.setRatio(2);
    h.win.fire('resize');
    expect(h.canvas.width).toBe(800);
    expect(h.ctx.transform).toEqual([2, 0, 0, 2, 0, 0]);
  });

  it('resize that only grows the displayed size re-sizes the backing store', () => {
    const h = makeHarness(1);
    h.setup();
    expect(h.canvas.width).toBe(400);
    h.canvas.clientWidth = 600; // window grew, canvas now displayed at 1.5x
    h.win.fire('resize');
    expect(h.canvas.width).toBe(800);
  });

  it('matchMedia change (same-size monitor move, no resize event) re-sizes and re-arms', () => {
    const h = makeHarness(1);
    h.setup();
    expect(h.mqs[0].media).toBe('(resolution: 1dppx)');
    h.setRatio(2);
    h.fireMq();
    expect(h.canvas.width).toBe(800);
    // Re-armed on the new ratio, ready for the next monitor move.
    expect(h.mqs[h.mqs.length - 1].media).toBe('(resolution: 2dppx)');
    expect(h.mqs[h.mqs.length - 1].listener).not.toBeNull();
    h.setRatio(1);
    h.fireMq();
    expect(h.canvas.width).toBe(400);
  });

  it('an unchanged ratio does not touch the backing store or call onApply again', () => {
    const onApply = vi.fn();
    const h = makeHarness(2);
    h.setup({ onApply });
    expect(onApply).toHaveBeenCalledTimes(1);
    h.win.fire('resize');
    expect(onApply).toHaveBeenCalledTimes(1);
  });

  it('resize events without a ratio change do not rebuild the media query', () => {
    const h = makeHarness(1);
    h.setup();
    const built = h.mqs.length;
    h.win.fire('resize');
    h.win.fire('resize');
    h.win.fire('resize');
    expect(h.mqs.length).toBe(built);
    expect(h.mqs[h.mqs.length - 1].listener).not.toBeNull();
  });

  it('onApply receives the clamped dpr on every backing-store resize', () => {
    const onApply = vi.fn();
    const h = makeHarness(1);
    h.setup({ onApply });
    expect(onApply).toHaveBeenLastCalledWith(1);
    h.setRatio(2.5);
    h.win.fire('resize');
    expect(onApply).toHaveBeenLastCalledWith(3);
  });

  it('smoothing: false is re-applied after each resize wipes context state', () => {
    const h = makeHarness(1);
    h.setup({ smoothing: false });
    expect(h.ctx.imageSmoothingEnabled).toBe(false);
    h.setRatio(2);
    h.win.fire('resize');
    expect(h.ctx.imageSmoothingEnabled).toBe(false);
  });

  it('astro:before-swap unhooks the resize and media-query listeners', () => {
    const h = makeHarness(1);
    h.setup();
    h.doc.fire('astro:before-swap');
    expect(h.win.count('resize')).toBe(0);
    expect(h.mqs[h.mqs.length - 1].listener).toBeNull();
    h.setRatio(2);
    h.win.fire('resize');
    expect(h.canvas.width).toBe(400);
  });

  it('a disconnected canvas unhooks on the next event instead of resizing', () => {
    const h = makeHarness(1);
    h.setup();
    h.canvas.isConnected = false;
    h.setRatio(2);
    h.win.fire('resize');
    expect(h.canvas.width).toBe(400);
    expect(h.win.count('resize')).toBe(0);
  });
});

describe('toLogical pointer mapping', () => {
  it('maps client coordinates through the CSS rect into logical units', () => {
    const h = makeHarness(2);
    const hiDpi = h.setup();
    // Canvas displayed at half logical size, offset by (10, 20).
    h.setRect({ left: 10, top: 20, width: 200, height: 100 });
    expect(hiDpi.toLogical({ clientX: 10, clientY: 20 })).toEqual({ x: 0, y: 0 });
    expect(hiDpi.toLogical({ clientX: 210, clientY: 120 })).toEqual({ x: 400, y: 200 });
    expect(hiDpi.toLogical({ clientX: 110, clientY: 70 })).toEqual({ x: 200, y: 100 });
  });

  it('is independent of the device-pixel ratio', () => {
    const at = (ratio: number) => {
      const h = makeHarness(ratio);
      const hiDpi = h.setup();
      h.setRect({ left: 0, top: 0, width: 200, height: 100 });
      return hiDpi.toLogical({ clientX: 50, clientY: 25 });
    };
    expect(at(1)).toEqual(at(3));
  });

  it('maps to the origin instead of NaN when the rect is zero-sized', () => {
    const h = makeHarness(1);
    const hiDpi = h.setup();
    h.setRect({ width: 0, height: 0 });
    expect(hiDpi.toLogical({ clientX: 42, clientY: 7 })).toEqual({ x: 0, y: 0 });
  });
});

describe('createStaticLayer', () => {
  interface FakeLayer {
    width: number;
    height: number;
    ctx: { scale: ReturnType<typeof vi.fn> } | null;
    getContext(type: string): FakeLayer['ctx'];
  }

  function makeLayerHarness({ contextAvailable = true } = {}) {
    const created: FakeLayer[] = [];
    vi.stubGlobal('document', {
      createElement: (tag: string): FakeLayer => {
        expect(tag).toBe('canvas');
        const el: FakeLayer = {
          width: 0,
          height: 0,
          ctx: contextAvailable ? { scale: vi.fn() } : null,
          getContext: () => el.ctx
        };
        created.push(el);
        return el;
      }
    });
    const drawImage = vi.fn();
    const mainCtx = { drawImage } as unknown as CanvasRenderingContext2D;
    return { created, drawImage, mainCtx };
  }

  it('bakes at device resolution and blits at logical size', () => {
    const h = makeLayerHarness();
    const paint = vi.fn();
    const layer = createStaticLayer(400, 200, paint);
    layer.rebuild(3);
    expect(h.created).toHaveLength(1);
    expect(h.created[0].width).toBe(1200);
    expect(h.created[0].height).toBe(600);
    // Painted in logical coordinates under a dpr scale, into the layer.
    expect(h.created[0].ctx!.scale).toHaveBeenCalledWith(3, 3);
    expect(paint).toHaveBeenCalledExactlyOnceWith(h.created[0].ctx);
    // draw() blits the bake (logical destination size, 1:1 onto backing
    // pixels) — it never repaints.
    layer.draw(h.mainCtx);
    expect(h.drawImage).toHaveBeenCalledExactlyOnceWith(h.created[0], 0, 0, 400, 200);
    expect(paint).toHaveBeenCalledTimes(1);
  });

  it('paints live until the first rebuild', () => {
    const h = makeLayerHarness();
    const paint = vi.fn();
    const layer = createStaticLayer(400, 200, paint);
    layer.draw(h.mainCtx);
    expect(paint).toHaveBeenCalledExactlyOnceWith(h.mainCtx);
    expect(h.drawImage).not.toHaveBeenCalled();
  });

  it('falls back to live painting when the layer context is unavailable', () => {
    const h = makeLayerHarness({ contextAvailable: false });
    const paint = vi.fn();
    const layer = createStaticLayer(400, 200, paint);
    layer.rebuild(2);
    layer.draw(h.mainCtx);
    layer.draw(h.mainCtx);
    expect(h.drawImage).not.toHaveBeenCalled();
    expect(paint).toHaveBeenCalledTimes(2);
    expect(paint).toHaveBeenNthCalledWith(1, h.mainCtx);
  });

  it('a rebuild at a new ratio replaces the bake', () => {
    const h = makeLayerHarness();
    const layer = createStaticLayer(400, 200, vi.fn());
    layer.rebuild(1);
    layer.rebuild(3);
    expect(h.created).toHaveLength(2);
    expect(h.created[1].width).toBe(1200);
    layer.draw(h.mainCtx);
    expect(h.drawImage).toHaveBeenCalledExactlyOnceWith(h.created[1], 0, 0, 400, 200);
  });
});
