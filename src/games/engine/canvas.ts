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
  /** Current clamped device-pixel ratio of the backing store. */
  dpr(): number;
  /** Map a pointer event to logical canvas coordinates. */
  toLogical(e: { clientX: number; clientY: number }): { x: number; y: number };
}

export function setupHiDpiCanvas(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  logicalW: number,
  logicalH: number,
  options?: {
    /**
     * Runs after every backing-store (re)size. Assigning `canvas.width` wipes
     * all context state except the DPR transform reinstalled here, so
     * per-game context setup (image smoothing, cached DPR-sized overlays…)
     * belongs in this callback rather than at init.
     */
    onApply?: (dpr: number) => void;
  }
): HiDpiCanvas {
  // Ceil to an integer ratio so pixel-art layers upscale cleanly; clamp to 3
  // so zoomed-in browsers don't allocate huge backing stores.
  let dpr = 0;
  function applyDpr() {
    const next = Math.min(3, Math.max(1, Math.ceil(window.devicePixelRatio || 1)));
    if (next === dpr) return;
    dpr = next;
    canvas.width = logicalW * dpr;
    canvas.height = logicalH * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    options?.onApply?.(dpr);
  }
  applyDpr();
  canvas.style.aspectRatio = `${logicalW} / ${logicalH}`;

  // Browser zoom or dragging the window to another monitor changes
  // devicePixelRatio; a stale backing store would bring the blur back. A
  // ClientRouter swap replaces the canvas, so the listener unhooks itself
  // (on swap, or on the next resize) rather than holding the old game alive.
  const onResize = () => {
    if (!canvas.isConnected) {
      unhook();
      return;
    }
    applyDpr();
  };
  const unhook = () => {
    window.removeEventListener('resize', onResize);
    document.removeEventListener('astro:before-swap', unhook);
  };
  window.addEventListener('resize', onResize);
  document.addEventListener('astro:before-swap', unhook);

  return {
    dpr: () => dpr,
    toLogical(e) {
      const rect = canvas.getBoundingClientRect();
      return {
        x: (e.clientX - rect.left) * (logicalW / rect.width),
        y: (e.clientY - rect.top) * (logicalH / rect.height)
      };
    }
  };
}
