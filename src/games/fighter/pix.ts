/**
 * Crisp pixel drawing for the framebuffer: polygons, discs and dithered
 * bands filled with whole-pixel `fillRect` spans, because a canvas path fill
 * anti-aliases its edges and nothing in a 1991 frame is anti-aliased.
 */

export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (ctx) ctx.imageSmoothingEnabled = false;
  return c;
}

export function ctx2d(c: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = c.getContext('2d') as CanvasRenderingContext2D;
  ctx.imageSmoothingEnabled = false;
  return ctx;
}

/** Fill a polygon by scanline spans. */
export function poly(ctx: CanvasRenderingContext2D, pts: readonly (readonly [number, number])[], color: string): void {
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const [, y] of pts) {
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  }
  ctx.fillStyle = color;
  for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) {
    const yc = y + 0.5;
    const xs: number[] = [];
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i];
      const [xj, yj] = pts[j];
      if (yi > yc !== yj > yc) xs.push(xi + ((yc - yi) * (xj - xi)) / (yj - yi));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const a = Math.round(xs[k]);
      const b = Math.round(xs[k + 1]);
      if (b > a) ctx.fillRect(a, y, b - a, 1);
    }
  }
}

export function disc(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string): void {
  ctx.fillStyle = color;
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    const dy = y + 0.5 - cy;
    if (Math.abs(dy) > r) continue;
    const half = Math.sqrt(r * r - dy * dy);
    const a = Math.round(cx - half);
    const b = Math.round(cx + half);
    if (b > a) ctx.fillRect(a, y, b - a, 1);
  }
}

export function rect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

/**
 * A vertical gradient as solid bands with a one-row checker dither between
 * each pair, the way a palette-limited sky was painted.
 */
export function bands(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, colors: readonly string[]): void {
  const n = colors.length;
  const step = h / n;
  for (let i = 0; i < n; i++) rect(ctx, x, y + i * step, w, Math.ceil(step), colors[i]);
  for (let i = 1; i < n; i++) {
    const row = Math.round(y + i * step);
    ctx.fillStyle = colors[i - 1];
    for (let dy = 0; dy < 2; dy++) for (let px = (dy & 1) + x; px < x + w; px += 2) ctx.fillRect(px, row + dy, 1, 1);
    ctx.fillStyle = colors[i];
    for (let px = x + 1; px < x + w; px += 2) ctx.fillRect(px, row - 1, 1, 1);
  }
}

/** Every other pixel of a rectangle, for shadows and glass. */
export function checker(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string): void {
  ctx.fillStyle = color;
  for (let py = Math.round(y); py < y + h; py++) for (let px = Math.round(x) + ((py + Math.round(x)) & 1); px < x + w; px += 2) ctx.fillRect(px, py, 1, 1);
}

/** A cheap seeded hash in [0, 1), for scattered detail that never moves. */
export function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}
