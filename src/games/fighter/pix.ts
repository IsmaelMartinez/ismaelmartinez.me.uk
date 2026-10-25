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

// --- Painting toolkit for the stages --------------------------------------------------
//
// Everything below still ends in whole-pixel `fillRect` calls with opaque
// colours. The stages are painted once per visit, so these trade speed for
// detail: `fillFn` asks a function for every pixel of a box and draws the
// answer back as runs, which is how shading, dithering and textures are done
// without ever reaching for a canvas gradient or a path.

export type Rgb = readonly [number, number, number];

export function toRgb(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function toHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${((c(r) << 16) | (c(g) << 8) | c(b)).toString(16).padStart(6, '0')}`;
}

/** Blend two colours; `t` 0 gives `a`, 1 gives `b`. */
export function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = toRgb(a);
  const [br, bg, bb] = toRgb(b);
  return toHex(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t);
}

/**
 * A shading ramp of `n` tones from shadow to highlight around `base`, with
 * the hue shift a pixel artist paints by hand: shadows lean cool and
 * purple, highlights warm, so a ramp reads as a lit material rather than one
 * colour at several brightnesses.
 */
export function tones(base: string, n = 5, depth = 0.62, lift = 0.42, cool = '#1c1238', warm = '#fff2cc'): string[] {
  const out: string[] = [];
  const m = Math.round((n - 1) * 0.6);
  for (let i = 0; i < n; i++) {
    if (i < m) out.push(mix(base, cool, depth * (1 - i / m)));
    else if (i === m) out.push(base);
    else out.push(mix(base, warm, (lift * (i - m)) / (n - 1 - m)));
  }
  return out;
}

const B2 = [0.125, 0.625, 0.875, 0.375];
const B4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16);

/** Ordered-dither threshold of a 2x2 (`fine` false) or 4x4 Bayer matrix. */
export function bayer(x: number, y: number, fine = false): number {
  return fine ? B4[(y & 3) * 4 + (x & 3)] : B2[(y & 1) * 2 + (x & 1)];
}

/**
 * The tone of a ramp at a continuous shade `v` (0 shadow to 1 light),
 * dithered between the two nearest tones with a 2x2 ordered pattern: flat
 * bands, with checker transitions between them.
 */
export function pick(ramp: readonly string[], v: number, x: number, y: number, fine = false): string {
  const n = ramp.length;
  const f = Math.max(0, Math.min(1, v)) * (n - 1);
  const lo = Math.floor(f);
  if (lo >= n - 1) return ramp[n - 1];
  return f - lo > bayer(x, y, fine) ? ramp[lo + 1] : ramp[lo];
}

/**
 * Fill a box pixel by pixel: `fn` answers each pixel's colour, or null to
 * leave it, and the answers are drawn back as horizontal runs.
 */
export function fillFn(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fn: (px: number, py: number) => string | null | undefined): void {
  const x0 = Math.round(x);
  const y0 = Math.round(y);
  const x1 = x0 + Math.round(w);
  const y1 = y0 + Math.round(h);
  for (let py = y0; py < y1; py++) {
    let run: string | null | undefined = null;
    let start = x0;
    for (let px = x0; px <= x1; px++) {
      const c = px < x1 ? fn(px, py) : null;
      if (c !== run) {
        if (run) {
          ctx.fillStyle = run;
          ctx.fillRect(start, py, px - start, 1);
        }
        run = c;
        start = px;
      }
    }
  }
}

/** A one-pixel line by Bresenham, `t` pixels thick (square pen). */
export function line(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, color: string, t = 1): void {
  ctx.fillStyle = color;
  let ax = Math.round(x0);
  let ay = Math.round(y0);
  const bx = Math.round(x1);
  const by = Math.round(y1);
  const dx = Math.abs(bx - ax);
  const dy = -Math.abs(by - ay);
  const sx = ax < bx ? 1 : -1;
  const sy = ay < by ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    ctx.fillRect(ax, ay, t, t);
    if (ax === bx && ay === by) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      ax += sx;
    }
    if (e2 <= dx) {
      err += dx;
      ay += sy;
    }
  }
}

export function ellipse(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, color: string): void {
  ctx.fillStyle = color;
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    const dy = (y + 0.5 - cy) / ry;
    if (Math.abs(dy) > 1) continue;
    const half = rx * Math.sqrt(1 - dy * dy);
    const a = Math.round(cx - half);
    const b = Math.round(cx + half);
    if (b > a) ctx.fillRect(a, y, b - a, 1);
  }
}

/** A smooth vertical gradient through `colors`, ordered-dithered 4x4. */
export function vgrad(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, colors: readonly string[]): void {
  fillFn(ctx, x, y, w, h, (px, py) => pick(colors, (py - y) / Math.max(1, h - 1), px, py, true));
}

/** A shaded ball lit from the upper left (`lx`, `ly` aim the light). */
export function sphere(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, ramp: readonly string[], lx = -0.55, ly = -0.6, sy = 1): void {
  const ry = r * sy;
  fillFn(ctx, cx - r - 1, cy - ry - 1, r * 2 + 3, ry * 2 + 3, (px, py) => {
    const dx = (px + 0.5 - cx) / r;
    const dy = (py + 0.5 - cy) / ry;
    const d = dx * dx + dy * dy;
    if (d > 1) return null;
    const nz = Math.sqrt(1 - d);
    const lz = Math.sqrt(Math.max(0, 1 - lx * lx - ly * ly));
    const v = Math.max(0, dx * lx + dy * ly + nz * lz);
    return pick(ramp, v * 1.05 - 0.05, px, py);
  });
}

/** An upright cylinder (pillar, trunk, drum) lit from the left. */
export function cylinder(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, ramp: readonly string[], light = -0.45): void {
  fillFn(ctx, x, y, w, h, (px, py) => {
    const u = ((px + 0.5 - x) / w) * 2 - 1;
    const nz = Math.sqrt(Math.max(0, 1 - u * u));
    const v = Math.max(0, u * light + nz * 0.85);
    return pick(ramp, v, px, py);
  });
}

/** A lit block face: highlight along the top and left, shadow down the right and bottom. */
export function block(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, ramp: readonly string[]): void {
  const n = ramp.length;
  rect(ctx, x, y, w, h, ramp[Math.floor(n / 2)]);
  rect(ctx, x, y, w, 1, ramp[n - 1]);
  rect(ctx, x, y + 1, 1, h - 1, ramp[n - 2]);
  rect(ctx, x + w - 1, y + 1, 1, h - 1, ramp[1]);
  rect(ctx, x + 1, y + h - 1, w - 1, 1, ramp[0]);
}

/** Smooth value noise in [0, 1): bilinear between hashed lattice points. */
export function vnoise(x: number, y: number, seed = 0): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const h = (i: number, j: number) => hash(i * 57.13 + j * 311.71 + seed * 13.37);
  const a = h(xi, yi);
  const b = h(xi + 1, yi);
  const c = h(xi, yi + 1);
  const d = h(xi + 1, yi + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/** Two octaves of value noise, for wear, clouds and foliage. */
export function fbm(x: number, y: number, seed = 0): number {
  return vnoise(x, y, seed) * 0.65 + vnoise(x * 2.1, y * 2.1, seed + 7) * 0.35;
}

/**
 * Ring the opaque pixels of a canvas with a one-pixel outline, the way a
 * background figure was keyed off its scenery. Done once at paint time.
 */
export function outline(c: HTMLCanvasElement, color: string): void {
  const ctx = ctx2d(c);
  const { width: w, height: h } = c;
  const data = ctx.getImageData(0, 0, w, h).data;
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && data[(y * w + x) * 4 + 3] > 0;
  ctx.fillStyle = color;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (solid(x, y)) continue;
      if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) ctx.fillRect(x, y, 1, 1);
    }
  }
}

/** A lying cylinder (pipe, beam, log) lit from above. */
export function pipe(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, ramp: readonly string[], light = -0.5): void {
  fillFn(ctx, x, y, w, h, (px, py) => {
    const u = ((py + 0.5 - y) / h) * 2 - 1;
    const nz = Math.sqrt(Math.max(0, 1 - u * u));
    return pick(ramp, Math.max(0, u * light + nz * 0.8), px, py);
  });
}
