/**
 * Hi-DPI canvas setup shared by every arcade cabinet.
 *
 * The games draw in fixed logical dimensions and let CSS scale the canvas to
 * fill its container, so a 1:1 backing store comes out blurry on hi-DPI
 * screens — especially emoji sprites and text. This helper sizes the backing
 * store at `logicalW×logicalH` device pixels per CSS pixel (clamped DPR) and
 * installs a matching context transform, so all drawing — and all pointer
 * math via {@link HiDpiCanvas.toLogical} — stays in logical coordinates.
 * Never read `canvas.width`/`canvas.height` for game math once this is
 * installed; they hold backing-store pixels, not logical units.
 */
export interface HiDpiCanvas {
  /** Map a pointer event to logical canvas coordinates. */
  toLogical(e: { clientX: number; clientY: number }): { x: number; y: number };
}

/**
 * Cached device-resolution layer for static full-canvas content (skies,
 * starfields, checkerboards, vignettes) that a render loop would otherwise
 * repaint every frame.
 *
 * `rebuild(dpr)` bakes `paint` into an offscreen canvas at device resolution
 * — pass it as {@link setupHiDpiCanvas}'s `onApply` so the bake tracks every
 * backing-store resize. `draw(ctx)` blits the layer at logical size, which
 * maps 1:1 onto backing pixels (no resampling, smoothing-agnostic); if the
 * layer's context couldn't be created it paints live instead, reproducing
 * the un-cached frame.
 *
 * The layer must stay aligned to the visible board: gradient dithering is
 * anchored to device pixels, so painting the same content at an offset
 * inside the layer produces visibly-identical but not byte-identical pixels.
 * `paint` therefore draws in plain logical coordinates (the layer context is
 * pre-scaled by `dpr`), exactly as it would draw on the main context.
 */
export interface StaticLayer {
  /** Rebuild the bake for a new device-pixel ratio. */
  rebuild(dpr: number): void;
  /** Blit the bake (or paint live if the layer couldn't be built). */
  draw(ctx: CanvasRenderingContext2D): void;
}

export function createStaticLayer(
  logicalW: number,
  logicalH: number,
  paint: (ctx: CanvasRenderingContext2D) => void
): StaticLayer {
  let layer: HTMLCanvasElement | null = null;
  return {
    rebuild(dpr) {
      layer = null;
      const next = document.createElement('canvas');
      next.width = logicalW * dpr;
      next.height = logicalH * dpr;
      const lctx = next.getContext('2d');
      if (!lctx) return;
      lctx.scale(dpr, dpr);
      paint(lctx);
      layer = next;
    },
    draw(ctx) {
      if (layer) ctx.drawImage(layer, 0, 0, logicalW, logicalH);
      else paint(ctx);
    }
  };
}

export function setupHiDpiCanvas(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  logicalW: number,
  logicalH: number,
  options?: {
    /**
     * Set false for pixel-art games: their 1x bitmap layers need
     * nearest-neighbour upscaling (the integer DPR clamp makes that exact),
     * and the flag must be re-applied here after every backing-store resize
     * because assigning `canvas.width` wipes it.
     */
    smoothing?: boolean;
    /**
     * Runs after every backing-store (re)size. Assigning `canvas.width` wipes
     * all context state except what this helper reinstalls, so per-game
     * context setup (cached DPR-sized overlays…) belongs in this callback
     * rather than at init.
     */
    onApply?: (dpr: number) => void;
  }
): HiDpiCanvas {
  // Ceil to an integer ratio so pixel-art layers and 1px overlay lines land
  // exactly on device pixels; clamp to 3 so zoomed-in browsers don't
  // allocate huge backing stores.
  let dpr = 0;
  function applyDpr() {
    // Scale the backing store to the device pixels the canvas actually
    // covers: pages can display a board larger than its logical size (e.g.
    // Pixel Park's max-width 820px vs 760 logical px), so devicePixelRatio
    // alone under-provisions even on 1x screens. clientWidth is layout-based,
    // so a mid-flip rotateY transform can't skew the measurement.
    const cssUpscale = (canvas.clientWidth || logicalW) / logicalW;
    const next = Math.min(3, Math.max(1, Math.ceil((window.devicePixelRatio || 1) * cssUpscale)));
    if (next === dpr) return;
    dpr = next;
    canvas.width = logicalW * dpr;
    canvas.height = logicalH * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (options?.smoothing === false) ctx.imageSmoothingEnabled = false;
    options?.onApply?.(dpr);
  }
  applyDpr();
  canvas.style.aspectRatio = `${logicalW} / ${logicalH}`;

  // devicePixelRatio changes with browser zoom (which fires resize) but also
  // when the window moves to a different-DPR monitor at the same CSS size,
  // which fires no resize — a matchMedia query pinned to the current ratio is
  // the only reliable signal for that, re-armed after every change. A stale
  // backing store would bring the blur back. A ClientRouter swap replaces the
  // canvas, so the listeners unhook themselves (on swap, or on the next
  // change) rather than holding the old game alive.
  let mq: MediaQueryList | null = null;
  const onChange = () => {
    if (!canvas.isConnected) {
      unhook();
      return;
    }
    applyDpr();
    watchDpr();
  };
  const watchDpr = () => {
    const query = `(resolution: ${window.devicePixelRatio || 1}dppx)`;
    // Still armed on a query that matches the current ratio (the common case
    // for the many resize events of a window drag) — don't rebuild it.
    if (mq?.matches && mq.media === query) return;
    mq?.removeEventListener('change', onChange);
    mq = window.matchMedia(query);
    mq.addEventListener('change', onChange, { once: true });
  };
  const unhook = () => {
    window.removeEventListener('resize', onChange);
    mq?.removeEventListener('change', onChange);
    document.removeEventListener('astro:before-swap', unhook);
  };
  watchDpr();
  window.addEventListener('resize', onChange);
  document.addEventListener('astro:before-swap', unhook);

  return {
    toLogical(e) {
      const rect = canvas.getBoundingClientRect();
      // A hidden or detached canvas has a zero-size rect; dividing by it
      // would feed NaN into game state (e.g. a pointer-captured drag that
      // outlives a page swap), so map to the origin instead.
      if (!rect.width || !rect.height) return { x: 0, y: 0 };
      return {
        x: (e.clientX - rect.left) * (logicalW / rect.width),
        y: (e.clientY - rect.top) * (logicalH / rect.height)
      };
    }
  };
}
