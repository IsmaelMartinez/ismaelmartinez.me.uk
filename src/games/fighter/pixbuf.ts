/**
 * An offscreen pixel buffer for art that is painted once and blitted many
 * times: the display letters, the hit sparks and projectile frames, the
 * bonus car's damage stages, the flags. Every primitive writes whole opaque
 * pixels into a `Uint32Array`, so nothing it makes is anti-aliased or blended,
 * and `toCanvas()` hands the result to the framebuffer as an image that
 * `drawImage` copies at a whole-pixel offset.
 *
 * DOM-free until `toCanvas()`.
 */
import { makeCanvas } from './pix';

/** A colour packed for a little-endian RGBA byte view; 0 is transparent. */
export function rgb(hex: string): number {
  const v = parseInt(hex.slice(1), 16);
  return (0xff000000 | ((v & 0xff) << 16) | (v & 0xff00) | ((v >> 16) & 0xff)) >>> 0;
}

/** Mix two `#rrggbb` colours, `t` of the way from `a` to `b`. */
export function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const c = [16, 8, 0].map(s => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t));
  return `#${((c[0] << 16) | (c[1] << 8) | c[2]).toString(16).padStart(6, '0')}`;
}

/** The 4 x 4 ordered-dither thresholds, in (0, 1). */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16);
export function bayer(x: number, y: number): number {
  return BAYER[((y & 3) << 2) | (x & 3)];
}

export class PixBuf {
  readonly data: Uint32Array;
  constructor(
    readonly w: number,
    readonly h: number
  ) {
    this.data = new Uint32Array(w * h);
  }

  get(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    return this.data[y * this.w + x];
  }

  set(x: number, y: number, c: number): void {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.data[y * this.w + x] = c;
  }

  rect(x: number, y: number, w: number, h: number, c: number): void {
    const x0 = Math.max(0, Math.round(x));
    const y0 = Math.max(0, Math.round(y));
    const x1 = Math.min(this.w, Math.round(x + w));
    const y1 = Math.min(this.h, Math.round(y + h));
    for (let py = y0; py < y1; py++) this.data.fill(c, py * this.w + x0, py * this.w + Math.max(x0, x1));
  }

  /** Scanline polygon fill; `shade` may pick the colour per pixel. */
  poly(pts: readonly (readonly [number, number])[], c: number | ((x: number, y: number) => number)): void {
    let y0 = Infinity;
    let y1 = -Infinity;
    for (const [, y] of pts) {
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
    for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(this.h - 1, Math.ceil(y1)); y++) {
      const yc = y + 0.5;
      const xs: number[] = [];
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i];
        const [xj, yj] = pts[j];
        if (yi > yc !== yj > yc) xs.push(xi + ((yc - yi) * (xj - xi)) / (yj - yi));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const a = Math.max(0, Math.round(xs[k]));
        const b = Math.min(this.w, Math.round(xs[k + 1]));
        for (let x = a; x < b; x++) this.data[y * this.w + x] = typeof c === 'number' ? c : c(x, y);
      }
    }
  }

  ellipse(cx: number, cy: number, rx: number, ry: number, c: number | ((x: number, y: number) => number)): void {
    for (let y = Math.max(0, Math.floor(cy - ry)); y <= Math.min(this.h - 1, Math.ceil(cy + ry)); y++) {
      const dy = (y + 0.5 - cy) / ry;
      if (Math.abs(dy) > 1) continue;
      const half = rx * Math.sqrt(1 - dy * dy);
      const a = Math.max(0, Math.round(cx - half));
      const b = Math.min(this.w, Math.round(cx + half));
      for (let x = a; x < b; x++) this.data[y * this.w + x] = typeof c === 'number' ? c : c(x, y);
    }
  }

  disc(cx: number, cy: number, r: number, c: number | ((x: number, y: number) => number)): void {
    this.ellipse(cx, cy, r, r, c);
  }

  /** A line of square dots `size` wide. */
  line(x0: number, y0: number, x1: number, y1: number, c: number, size = 1): void {
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
    const h = size / 2;
    for (let i = 0; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n;
      const y = y0 + ((y1 - y0) * i) / n;
      this.rect(Math.round(x - h), Math.round(y - h), size, size, c);
    }
  }

  /**
   * Ring every opaque region with `c`, `n` pixels thick, rounding the corners
   * (alternate passes use four and eight neighbours, which grows an octagon).
   */
  outline(c: number, n = 1): void {
    for (let pass = 0; pass < n; pass++) {
      const src = this.data.slice();
      const eight = pass % 2 === 1 || n === 1;
      for (let y = 0; y < this.h; y++) {
        for (let x = 0; x < this.w; x++) {
          if (src[y * this.w + x]) continue;
          const at = (dx: number, dy: number) => {
            const px = x + dx;
            const py = y + dy;
            return px >= 0 && py >= 0 && px < this.w && py < this.h && src[py * this.w + px] !== 0;
          };
          if (at(1, 0) || at(-1, 0) || at(0, 1) || at(0, -1) || (eight && (at(1, 1) || at(-1, -1) || at(1, -1) || at(-1, 1)))) this.data[y * this.w + x] = c;
        }
      }
    }
  }

  /** Recolour every opaque pixel (a hit flash's white silhouette). */
  silhouette(c: number): PixBuf {
    const out = new PixBuf(this.w, this.h);
    for (let i = 0; i < this.data.length; i++) if (this.data[i]) out.data[i] = c;
    return out;
  }

  /** Copy another buffer's opaque pixels in at an offset, optionally mirrored. */
  blit(src: PixBuf, ox: number, oy: number, flip = false): void {
    for (let y = 0; y < src.h; y++)
      for (let x = 0; x < src.w; x++) {
        const v = src.data[y * src.w + x];
        if (v) this.set(ox + (flip ? src.w - 1 - x : x), oy + y, v);
      }
  }

  toCanvas(): HTMLCanvasElement {
    const c = makeCanvas(this.w, this.h);
    const ctx = c.getContext('2d') as CanvasRenderingContext2D;
    const img = ctx.createImageData(this.w, this.h);
    new Uint32Array(img.data.buffer).set(this.data);
    ctx.putImageData(img, 0, 0);
    return c;
  }
}
