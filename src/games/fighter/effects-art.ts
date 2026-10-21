/**
 * The fight's effects as the arcade drew them: hand-made frames, painted
 * once into images and blitted at whole-pixel offsets. Hit sparks are layered
 * bursts (a white-hot core, a star of jagged yellow-to-orange rays, a shock
 * ring on the heavy ones) that bloom over two frames, hold, hollow out from
 * the middle and break into fragments; a guarded blow throws a blue-white
 * splash instead; a knockdown kicks up rolling dust. The projectiles, the
 * flames of psycho power and the yogi's breath, the dizzy stars and birds
 * and the spin blurs are frames here too.
 *
 * Every frame is built in a `PixBuf` from whole opaque pixels and cached on
 * first use, so a frame of the fight costs a handful of `drawImage` calls.
 */
import { hash } from './pix';
import { PixBuf, bayer, rgb } from './pixbuf';

export interface Sprite {
  canvas: HTMLCanvasElement;
  /** The anchor (the point the sprite is placed by) inside the image. */
  ax: number;
  ay: number;
}

const sprites = new Map<string, Sprite>();

/** Bake once (normal and mirrored) and cache. */
function baked(key: string, flip: boolean, make: () => { buf: PixBuf; ax: number; ay: number }): Sprite {
  const id = `${key}|${flip ? 1 : 0}`;
  const hit = sprites.get(id);
  if (hit) return hit;
  const { buf, ax, ay } = make();
  let out = buf;
  let x = ax;
  if (flip) {
    out = new PixBuf(buf.w, buf.h);
    out.blit(buf, 0, 0, true);
    x = buf.w - 1 - ax;
  }
  const s = { canvas: out.toCanvas(), ax: x, ay };
  sprites.set(id, s);
  return s;
}

export function blit(ctx: CanvasRenderingContext2D, s: Sprite, x: number, y: number): void {
  ctx.drawImage(s.canvas, Math.round(x) - s.ax, Math.round(y) - s.ay);
}

/** Thin the pixels of a buffer by an ordered dither, `k` of them gone. */
function erode(buf: PixBuf, k: number): void {
  if (k <= 0) return;
  for (let y = 0; y < buf.h; y++) for (let x = 0; x < buf.w; x++) if (bayer(x, y) < k) buf.data[y * buf.w + x] = 0;
}

function eraseDisc(buf: PixBuf, cx: number, cy: number, r: number): void {
  if (r <= 0) return;
  for (let y = Math.floor(cy - r); y <= cy + r; y++)
    for (let x = Math.floor(cx - r); x <= cx + r; x++) if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) buf.set(x, y, 0);
}

/** A ray: a tapering, kinked spike from (cx, cy) along `a`. */
function ray(buf: PixBuf, cx: number, cy: number, a: number, len: number, half: number, kink: number, c: number): void {
  const ux = Math.cos(a);
  const uy = Math.sin(a);
  const px = -uy;
  const py = ux;
  buf.poly(
    [
      [cx + px * half, cy + py * half],
      [cx + ux * len * 0.55 + px * half * (0.55 + kink), cy + uy * len * 0.55 + py * half * (0.55 + kink)],
      [cx + ux * len * 0.72 + px * half * 0.2, cy + uy * len * 0.72 + py * half * 0.2],
      [cx + ux * len, cy + uy * len],
      [cx + ux * len * 0.64 - px * half * 0.45, cy + uy * len * 0.64 - py * half * 0.45],
      [cx - px * half, cy - py * half]
    ],
    c
  );
}

// --- Hit sparks ----------------------------------------------------------------------------

export type HitKind = 'light' | 'medium' | 'heavy' | 'ko' | 'block' | 'clash' | 'chip';

const HIT = {
  light: { size: 17, rays: 7 },
  medium: { size: 23, rays: 8 },
  heavy: { size: 31, rays: 10 },
  ko: { size: 46, rays: 14 },
  clash: { size: 32, rays: 12 },
  chip: { size: 18, rays: 7 }
};

export const SPARK_FRAMES = 12;

/** One frame (0..11) of a hit spark, the blow travelling toward +x (mirrored for -x). */
export function hitSpark(kind: HitKind, variant: number, t: number, flip: boolean): Sprite {
  const f = Math.max(0, Math.min(SPARK_FRAMES - 1, Math.floor(t)));
  return baked(`spark:${kind}:${variant & 3}:${f}`, flip, () => (kind === 'block' ? blockSpark(variant & 3, f) : burst(kind, variant & 3, f)));
}

function burst(kind: Exclude<HitKind, 'block'>, v: number, t: number): { buf: PixBuf; ax: number; ay: number } {
  const { size: S, rays: N } = HIT[kind];
  const D = Math.ceil(S * 2.9);
  const buf = new PixBuf(D, D);
  const c = D / 2;
  const blue = kind === 'clash';
  const pal = blue
    ? { core: '#ffffff', inner: '#e0f8ff', mid: '#90d8f8', outer: '#3888f0', late: '#2050c0', ring: '#c0f0ff' }
    : t <= 5
      ? { core: '#ffffff', inner: '#fff8c8', mid: '#f8e040', outer: '#f88018', late: '#d83008', ring: '#fff0a0' }
      : t <= 8
        ? { core: '#fff8c8', inner: '#f8e860', mid: '#f8a020', outer: '#e04810', late: '#b02008', ring: '#f8c040' }
        : { core: '#f8e040', inner: '#f8b030', mid: '#f07018', outer: '#c82808', late: '#801808', ring: '#e06018' };
  const grow = t === 0 ? 0.62 : t === 1 ? 0.88 : t <= 4 ? 1 : 1 + (t - 4) * 0.04;
  const rot = v * 0.53 + (kind === 'ko' ? 0.2 : 0);
  // The flash of contact, before the star.
  if (kind === 'ko' && t <= 2) {
    buf.disc(c, c, S * (t === 0 ? 0.7 : t === 1 ? 0.95 : 0.8), rgb('#fff8d0'));
    buf.disc(c, c, S * (t === 0 ? 0.6 : t === 1 ? 0.82 : 0.6), rgb('#ffffff'));
  }
  for (let i = 0; i < N; i++) {
    const a = rot + (i / N) * Math.PI * 2 + (hash(v * 17 + i) - 0.5) * 0.35;
    const lean = 1 + 0.4 * Math.max(0, Math.cos(a));
    const long = i % 2 === 0 ? 1 : 0.62 + hash(v * 5 + i) * 0.2;
    const L = S * grow * long * lean;
    const half = S * 0.23 * (i % 2 === 0 ? 1 : 0.72);
    const kink = (hash(v * 3 + i * 7) - 0.5) * 0.8;
    ray(buf, c, c, a, L, half, kink, rgb(pal.outer));
    ray(buf, c, c, a, L * 0.8, half * 0.62, kink, rgb(pal.mid));
    ray(buf, c, c, a, L * 0.5, half * 0.38, -kink, rgb(pal.inner));
  }
  // The core, white hot while it lasts.
  if (t <= 4) {
    const r = S * (t <= 1 ? 0.36 : 0.32 - (t - 2) * 0.05);
    buf.disc(c, c, r + 2, rgb(pal.inner));
    buf.disc(c, c, r, rgb(pal.core));
  }
  // Hollow out from the middle as it burns away.
  if (t >= 5) eraseDisc(buf, c, c, S * (0.18 + (t - 5) * 0.13));
  // A shock ring on the heavy blows.
  if ((kind === 'heavy' || kind === 'ko' || kind === 'clash') && t >= 3 && t <= 9) {
    const R = S * (0.9 + (t - 3) * 0.14);
    const ringC = rgb(pal.ring);
    for (let k = 0; k < 160; k++) {
      const a = (k / 160) * Math.PI * 2;
      if ((t >= 6 && k % 3 === 0) || Math.floor(k / 10) % 4 === 3) continue;
      buf.set(c + Math.cos(a) * R, c + Math.sin(a) * R * 0.92, ringC);
      if (t < 7) buf.set(c + Math.cos(a) * (R - 1), c + Math.sin(a) * (R - 1) * 0.92, rgb(pal.core));
    }
  }
  // Fragments flung out along the blow.
  if (kind !== 'light') {
    const n = kind === 'ko' ? 12 : kind === 'heavy' || kind === 'clash' ? 8 : 5;
    for (let i = 0; i < n; i++) {
      const a = (hash(v * 11 + i * 3) - 0.5) * Math.PI * 1.6;
      const d = S * (0.5 + t * 0.12) * (0.8 + hash(i + v) * 0.5);
      if (t < 2) continue;
      const x = c + Math.cos(a) * d;
      const y = c + Math.sin(a) * d + t * t * 0.04 * S * 0.1;
      const col = t < 7 ? (i % 2 ? pal.core : pal.mid) : pal.outer;
      buf.rect(x - 1, y - 1, t < 8 ? 3 : 2, t < 8 ? 2 : 2, rgb(col));
    }
  }
  if (t >= 9) erode(buf, (t - 8) * 0.24);
  if (t <= 7) buf.outline(rgb(pal.late), 1);
  return { buf, ax: Math.round(c), ay: Math.round(c) };
}

/** The guard's splash: a flat blue-white star and a spray thrown back along the blow. */
function blockSpark(v: number, t: number): { buf: PixBuf; ax: number; ay: number } {
  const D = 84;
  const buf = new PixBuf(D, D);
  const c = D / 2;
  const grow = 1.45 * (t === 0 ? 0.55 : t === 1 ? 0.85 : t <= 4 ? 1 : Math.max(0.3, 1 - (t - 4) * 0.12));
  const pal = t <= 5 ? { core: '#ffffff', inner: '#d8f8ff', mid: '#78c8f8', outer: '#2878e8' } : { core: '#d8f8ff', inner: '#90d0f8', mid: '#4890e8', outer: '#1848b0' };
  const arms: [number, number, number][] = [
    [0, 17, 3],
    [Math.PI, 13, 3],
    [-Math.PI / 2, 12, 2.6],
    [Math.PI / 2, 10, 2.6],
    [-Math.PI / 4, 8, 2],
    [Math.PI / 4, 8, 2],
    [(-3 * Math.PI) / 4, 7, 2],
    [(3 * Math.PI) / 4, 7, 2]
  ];
  if (t <= 7) {
    for (const [a, len, half] of arms) {
      const L = len * grow;
      ray(buf, c, c, a + v * 0.05, L, half, 0, rgb(pal.outer));
      ray(buf, c, c, a + v * 0.05, L * 0.75, half * 0.6, 0, rgb(pal.mid));
      ray(buf, c, c, a + v * 0.05, L * 0.45, half * 0.4, 0, rgb(pal.inner));
    }
    if (t <= 4) {
      buf.ellipse(c, c, 5 * grow + 1, 4 * grow + 1, rgb(pal.inner));
      buf.ellipse(c, c, 4 * grow, 3 * grow, rgb(pal.core));
    } else eraseDisc(buf, c, c, (t - 4) * 2.2);
  }
  // Droplets sprayed out and back, falling.
  for (let i = 0; i < 9; i++) {
    if (t < 1) break;
    const a = Math.PI + (hash(v * 7 + i) - 0.5) * 2.2;
    const d = 6 + t * (1.6 + hash(i * 5 + v) * 1.4);
    const x = c + Math.cos(a) * d;
    const y = c + Math.sin(a) * d * 0.8 + t * t * 0.06;
    buf.rect(x, y, 2, i % 3 === 0 ? 2 : 1, rgb(i % 2 ? pal.core : pal.mid));
  }
  if (t >= 8) erode(buf, (t - 7) * 0.2);
  if (t <= 6) buf.outline(rgb('#103080'), 1);
  return { buf, ax: c, ay: c };
}

// --- Dust ----------------------------------------------------------------------------------

export const DUST_FRAMES = 20;

/** The cloud a body throws up hitting the floor, anchored at the point of impact on the floor. */
export function dust(variant: number, t: number): Sprite {
  const f = Math.max(0, Math.min(DUST_FRAMES - 1, Math.floor(t)));
  return baked(`dust:${variant & 1}:${f}`, false, () => {
    const W = 120;
    const H = 44;
    const buf = new PixBuf(W, H);
    const cx = W / 2;
    const fy = H - 4;
    const hi = rgb('#f8f0d8');
    const mid = rgb('#d8c8a0');
    const lo = rgb('#a89070');
    const dk = rgb('#786048');
    const puffs: [number, number, number][] = [];
    for (let i = 0; i < 7; i++) {
      const side = i < 3 ? -1 : i < 6 ? 1 : 0;
      const k = side === 0 ? 0 : (i % 3) + 1;
      const spread = side * (6 + k * 6 + f * (1.2 + k * 0.45));
      const r = 3 + f * 0.32 + (3 - k) * 1.2 + hash(variant * 9 + i) * 2;
      const rise = f * (0.35 + 0.15 * (3 - k)) + (side === 0 ? f * 0.5 : 0);
      puffs.push([cx + spread, fy - r * 0.7 - rise, r]);
    }
    for (const [x, y, r] of puffs) buf.disc(x, y, r + 1, dk);
    for (const [x, y, r] of puffs) buf.disc(x, y, r, lo);
    for (const [x, y, r] of puffs) buf.disc(x - r * 0.18, y - r * 0.2, r * 0.8, mid);
    for (const [x, y, r] of puffs) buf.disc(x - r * 0.35, y - r * 0.4, r * 0.45, hi);
    // Grit kicked out low.
    for (let i = 0; i < 10; i++) {
      const s = i % 2 ? 1 : -1;
      const x = cx + s * (8 + f * (2 + hash(i) * 2.5));
      const y = fy - 2 - Math.max(0, f * 1.6 - f * f * 0.09) * (0.5 + hash(i + 3));
      buf.rect(x, y, 1, 1, i % 3 ? lo : dk);
    }
    if (f >= 9) erode(buf, (f - 8) * 0.085);
    return { buf, ax: cx, ay: fy };
  });
}

// --- Projectiles -------------------------------------------------------------------------------

export type ProjectileArt = 'spirit' | 'sonic' | 'fire' | 'tiger' | 'tigerLow';

/** One frame (0..3) of a projectile flying toward +x (mirrored for -x), anchored at its centre. */
export function projectileArt(style: ProjectileArt, frame: number, flip: boolean): Sprite {
  const f = frame & 3;
  return baked(`proj:${style}:${f}`, flip, () => {
    switch (style) {
      case 'spirit':
        return spirit(f);
      case 'sonic':
        return sonic(f);
      case 'fire':
        return fireOrb(f);
      default:
        return tiger(f, style === 'tigerLow');
    }
  });
}

function spirit(f: number): { buf: PixBuf; ax: number; ay: number } {
  const buf = new PixBuf(64, 36);
  const cx = 46;
  const cy = 18;
  const ph = (f * Math.PI) / 2;
  const dark = rgb('#1830b0');
  const blue = rgb('#3868e8');
  const light = rgb('#80b0f8');
  const pale = rgb('#c8e8ff');
  const white = rgb('#ffffff');
  // The wispy tail, three flames licking back.
  for (let k = -1; k <= 1; k++) {
    for (let s = 0; s <= 1; s += 0.025) {
      const x = cx - 6 - s * (30 + (k === 0 ? 8 : 0) + Math.sin(ph + k) * 3);
      const y = cy + k * 6.5 * (1 - s * 0.4) + Math.sin(s * 7 + ph * 1.5 + k * 2) * (1.5 + s * 2.5);
      const r = (1 - s) * (k === 0 ? 6 : 4.2) + 0.6;
      buf.disc(x, y, r, s > 0.55 && (Math.floor(s * 40) + f) % 3 === 0 ? 0 : dark);
    }
  }
  for (let k = -1; k <= 1; k++)
    for (let s = 0; s <= 0.75; s += 0.025) {
      const x = cx - 6 - s * (30 + (k === 0 ? 8 : 0) + Math.sin(ph + k) * 3);
      const y = cy + k * 6.5 * (1 - s * 0.4) + Math.sin(s * 7 + ph * 1.5 + k * 2) * (1.5 + s * 2.5);
      const r = (1 - s) * (k === 0 ? 3.6 : 2.4);
      if (r > 0.6) buf.disc(x, y, r, s < 0.3 ? light : blue);
    }
  // The ball.
  buf.ellipse(cx, cy, 12, 13, dark);
  buf.ellipse(cx + 0.5, cy, 11, 12, blue);
  buf.ellipse(cx + 1.5, cy - 0.5, 8.5, 9.5, light);
  buf.ellipse(cx + 2.5, cy - 1, 5.5, 6.5, pale);
  buf.ellipse(cx + 3.5, cy - 1.5, 2.8, 3.4, white);
  // The swirl turning inside it.
  for (let s = 0; s < 1; s += 0.012) {
    const a = ph + s * Math.PI * 3.2;
    const r = 2 + s * 8.5;
    buf.set(cx + 1.5 + Math.cos(a) * r, cy - 0.5 + Math.sin(a) * r * 1.08, s < 0.5 ? white : pale);
  }
  // A flickering fringe of little flames round the ball.
  for (let i = 0; i < 9; i++) {
    const a = Math.PI * 0.55 + (i / 8) * Math.PI * 0.9 + Math.sin(ph + i) * 0.1;
    if (hash(i * 13 + f) < 0.3) continue;
    const r = 12 + hash(i + f * 7) * 2;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    buf.line(x, y, x - 3 - hash(i * 3 + f) * 3, y + Math.sin(a) * 1.5, hash(i + f) > 0.5 ? light : blue);
  }
  buf.outline(rgb('#081050'), 1);
  return { buf, ax: cx, ay: cy };
}

function sonic(f: number): { buf: PixBuf; ax: number; ay: number } {
  const W = 48;
  const H = 58;
  const buf = new PixBuf(W, H);
  const cx = 30;
  const cy = H / 2;
  const crescent = (dx: number, outR: [number, number], inR: [number, number], inOff: number, fill: (x: number, y: number) => number) => {
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const ox = (x + 0.5 - (cx + dx)) / outR[0];
        const oy = (y + 0.5 - cy) / outR[1];
        if (ox * ox + oy * oy > 1) continue;
        const ix = (x + 0.5 - (cx + dx - inOff)) / inR[0];
        const iy = (y + 0.5 - cy) / inR[1];
        if (ix * ix + iy * iy <= 1) continue;
        const c = fill(x, y);
        if (c) buf.set(x, y, c);
      }
  };
  const thin = [6, 7, 8, 7][f];
  // Afterimages, the spin, dithered as the arcade's translucency was.
  crescent(-13 + f, [9, 23], [8, 22], 4, (x, y) => ((x + y) % 2 === 0 ? rgb('#70a828') : 0));
  crescent(-6 + f * 0.5, [10, 24], [8, 22], 5, (x, y) => ((x + y) % 2 === 0 ? rgb('#b8e048') : 0));
  // The blade.
  const edge = rgb('#304808');
  crescent(0, [12, 26], [9 + (thin - 7) * 0.5, 23], thin + 2, () => edge);
  crescent(0, [11, 25], [9 + (thin - 7) * 0.5, 23], thin + 2, (x, y) => {
    const front = x + 0.5 - cx;
    const along = Math.abs(y + 0.5 - cy) / 23;
    if (front > 8 - along * 5) return rgb('#ffffe8');
    if (front > 5 - along * 5) return rgb('#f0fc98');
    if (front > 0.5 - along * 5) return rgb('#d8f058');
    return (x + y) % 2 ? rgb('#a8d030') : rgb('#c0e040');
  });
  // Rings across it, the boom's shimmer.
  for (const ry of [-15, -5 + f * 2, 10]) for (let x = cx - 4; x < cx + 11; x++) if (buf.get(x, cy + ry) && buf.get(x, cy + ry) !== edge) buf.set(x, cy + ry, rgb('#ffffff'));
  return { buf, ax: cx, ay: cy };
}

/** Flame tongues licking back (and up) from a ball at (cx, cy). */
function tongues(buf: PixBuf, cx: number, cy: number, f: number, n: number, reach: number, colours: [number, number, number], lift: number): void {
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < n; i++) {
      const spread = (i / (n - 1) - 0.5) * 2;
      const len = reach * (0.6 + hash(i * 7 + f * 3) * 0.5) * (1 - Math.abs(spread) * 0.25) * (1 - pass * 0.28);
      const tipX = cx - len;
      const tipY = cy + spread * 9 - lift * (0.4 + hash(i + f) * 0.6) * (1 - pass * 0.3) + Math.sin(f * 1.6 + i) * 2;
      const base = 5.5 - pass * 1.6 - Math.abs(spread) * 1.2;
      if (base <= 0.5) continue;
      const by = cy + spread * 6.5 * (1 - pass * 0.25);
      buf.poly(
        [
          [cx + 2, by - base],
          [cx - len * 0.5, (by + tipY) / 2 - base * 0.6 + Math.sin(f + i) * 1.5],
          [tipX, tipY],
          [cx - len * 0.45, (by + tipY) / 2 + base * 0.5],
          [cx + 2, by + base]
        ],
        colours[pass]
      );
    }
  }
}

function fireOrb(f: number): { buf: PixBuf; ax: number; ay: number } {
  const buf = new PixBuf(60, 40);
  const cx = 42;
  const cy = 21;
  tongues(buf, cx - 2, cy, f, 5, 30, [rgb('#d02808'), rgb('#f88018'), rgb('#f8d848')], 8);
  buf.disc(cx, cy, 11.5, rgb('#c82008'));
  buf.disc(cx + 0.5, cy - 0.5, 10, rgb('#f05810'));
  buf.disc(cx + 1.5, cy - 1, 7.8, rgb('#f89828'));
  buf.disc(cx + 2.5, cy - 1.5, 5.4, rgb('#f8d850'));
  buf.disc(cx + 3, cy - 2, 2.8, rgb('#fffff0'));
  // Licks of flame on the leading edge that change every frame.
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI / 2 + (i / 6 - 0.5) * 2.6;
    if (hash(i * 3 + f * 5) < 0.3) continue;
    const r = 10 + hash(i + f) * 3;
    buf.rect(cx + Math.cos(a) * r - 1, cy + Math.sin(a) * r - 2, 2, 3, rgb(hash(i * f + 1) > 0.5 ? '#f8a028' : '#e84010'));
  }
  buf.outline(rgb('#400800'), 1);
  return { buf, ax: cx, ay: cy };
}

function tiger(f: number, low: boolean): { buf: PixBuf; ax: number; ay: number } {
  const buf = new PixBuf(64, 40);
  const cx = 44;
  const cy = 21;
  const sq = low ? 0.78 : 1;
  tongues(buf, cx - 4, cy, f, 6, 30, [rgb('#c83808'), rgb('#f89020'), rgb('#f8e070')], low ? 3 : 6);
  const ry = 11 * sq;
  // The head: a broad brow, two ears, a jaw thrust forward.
  buf.ellipse(cx, cy, 13.5, ry + 1.2, rgb('#a02800'));
  buf.poly([[cx - 4, cy - ry + 2], [cx - 1, cy - ry - 6], [cx + 3, cy - ry + 1]], rgb('#a02800'));
  buf.poly([[cx + 4, cy - ry + 2], [cx + 8, cy - ry - 5], [cx + 11, cy - ry + 3]], rgb('#a02800'));
  buf.poly([[cx - 3, cy - ry + 2], [cx - 0.5, cy - ry - 4], [cx + 2, cy - ry + 2]], rgb('#f8a020'));
  buf.poly([[cx + 5, cy - ry + 2], [cx + 8, cy - ry - 3], [cx + 10, cy - ry + 3]], rgb('#f8a020'));
  buf.ellipse(cx + 0.5, cy, 12.4, ry, rgb('#e86410'));
  buf.ellipse(cx + 1.5, cy - 0.5, 9.6, ry * 0.8, rgb('#f8a028'));
  buf.ellipse(cx + 3, cy - 1, 6, ry * 0.55, rgb('#f8e070'));
  buf.ellipse(cx + 4, cy - 1.5, 2.8, ry * 0.3, rgb('#fffff0'));
  // Stripes and a glaring eye, so the shot reads as a tiger's head.
  const stripe = rgb('#b03000');
  for (const [sx, sy, len] of [
    [-7, -5, 5],
    [-9, 1, 6],
    [-6, 6, 4]
  ] as const)
    for (let i = 0; i < len; i++) buf.set(cx + sx + i * 0.6, cy + (sy + i * 0.8) * sq, stripe);
  buf.rect(cx + 5, cy - 5 * sq, 4, 2, rgb('#801800'));
  buf.rect(cx + 7, cy - 5 * sq, 1, 1, rgb('#ffffff'));
  if (f % 2 === 0) buf.rect(cx + 8, cy + 3 * sq, 4, 1, rgb('#a02800'));
  buf.outline(rgb('#401000'), 1);
  return { buf, ax: cx, ay: cy };
}

// --- Flames --------------------------------------------------------------------------------

/** A single tongue of flame (psycho power), its base at the anchor, licking up or back. */
export function flameTongue(frame: number, purple: boolean, trail: boolean, flip: boolean): Sprite {
  const f = frame & 3;
  return baked(`tongue:${purple ? 'p' : 'f'}:${trail ? 't' : 'u'}:${f}`, flip, () => {
    const W = 14;
    const H = 26;
    const up = new PixBuf(W, H);
    const pal = purple ? ['#4c0880', '#8828d0', '#c070f8', '#f8e0ff'] : ['#a01800', '#e85010', '#f8a830', '#fff8c0'];
    const sway = [0, 1.5, 0.5, -1.2][f];
    const tip = [2, 0, 3, 1][f];
    for (let layer = 0; layer < 4; layer++) {
      const k = 1 - layer * 0.24;
      const half = 5.2 * k;
      const top = tip + (H - 2 - tip) * (1 - k) * 0.8;
      up.poly(
        [
          [W / 2 - half, H - 2],
          [W / 2 - half * 0.9 + sway * 0.4, H - 2 - (H - top) * 0.45],
          [W / 2 + sway + 1, top],
          [W / 2 + half * 0.6 + sway * 0.6, H - 2 - (H - top) * 0.55],
          [W / 2 + half, H - 2]
        ],
        rgb(pal[layer])
      );
    }
    up.ellipse(W / 2, H - 3, 5, 2.4, rgb(pal[2]));
    if (!trail) return { buf: up, ax: W / 2, ay: H - 3 };
    // Turned on its side, licking back toward -x.
    const side = new PixBuf(H, W);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) side.set(y, x, up.get(x, y));
    return { buf: side, ax: H - 3, ay: W / 2 };
  });
}

/** The yogi's breath: a stream from the mouth (the anchor) toward +x. */
export function breathStream(frame: number, flip: boolean): Sprite {
  const f = frame & 3;
  return baked(`breath:${f}`, flip, () => {
    const W = 104;
    const H = 44;
    const buf = new PixBuf(W, H);
    const cy = 22;
    const pal = [rgb('#901000'), rgb('#e04010'), rgb('#f89020'), rgb('#f8e060'), rgb('#ffffe0')];
    const puffs: [number, number, number][] = [];
    for (let i = 0; i < 34; i++) {
      const s = i / 33;
      const x = 4 + s * 86;
      const y = cy + Math.sin(s * 9 + f * 1.7) * (1 + s * 3) - s * 3;
      const r = 3 + s * 10 + (hash(i * 5 + f) - 0.3) * 4 * s;
      puffs.push([x, y, r]);
    }
    for (let layer = 0; layer < 5; layer++) {
      for (const [x, y, r] of puffs) {
        const k = 1 - layer * 0.2;
        const rr = r * k - (layer > 2 ? (x / W) * 5 : 0);
        if (rr > 0.6) buf.disc(x - layer * 0.8, y + layer * 0.3, rr, pal[layer]);
      }
    }
    // Tongues licking up off the stream.
    for (let i = 0; i < 6; i++) {
      const x = 22 + i * 13 + hash(i + f * 3) * 6;
      const top = cy - 10 - (x / W) * 10 - hash(i * 3 + f) * 6;
      buf.poly([[x - 6, cy - 3], [x - 3, (cy + top) / 2], [x + 1, top], [x + 2, (cy + top) / 2 + 2], [x + 6, cy - 3]], pal[1]);
      buf.poly([[x - 3, cy - 3], [x, (cy + top) / 2 + 3], [x + 3, cy - 3]], pal[2]);
    }
    // The ragged far end.
    for (let y = 0; y < H; y++) for (let x = 80; x < W; x++) if (bayer(x, y) < (x - 80) / 26) buf.set(x, y, 0);
    buf.outline(rgb('#400400'), 1);
    return { buf, ax: 2, ay: cy };
  });
}

// --- Dizzy ---------------------------------------------------------------------------------

export function dizzyStar(): Sprite {
  return baked('star', false, () => {
    const buf = new PixBuf(11, 11);
    const pts: [number, number][] = [];
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const r = i % 2 ? 2 : 5;
      pts.push([5.5 + Math.cos(a) * r, 5.7 + Math.sin(a) * r]);
    }
    buf.poly(pts, rgb('#f8d820'));
    buf.rect(4, 4, 3, 2, rgb('#fffff0'));
    buf.rect(5, 6, 1, 1, rgb('#fff8a0'));
    buf.outline(rgb('#904000'), 1);
    return { buf, ax: 5, ay: 5 };
  });
}

/** A little yellow bird circling the head, wings up or down. */
export function dizzyBird(frame: number, flip: boolean): Sprite {
  const f = frame & 1;
  return baked(`bird:${f}`, flip, () => {
    const buf = new PixBuf(14, 12);
    buf.ellipse(6, 7, 4.5, 3.6, rgb('#f8d830'));
    buf.disc(9.5, 4.5, 2.6, rgb('#f8d830'));
    buf.rect(12, 4, 2, 1, rgb('#f87818'));
    buf.rect(12, 5, 1, 1, rgb('#d05010'));
    buf.set(10, 4, rgb('#101010'));
    buf.rect(2, 9, 6, 1, rgb('#d8a818'));
    if (f === 0) buf.poly([[3, 6], [6, 1], [8, 6]], rgb('#fff080'));
    else buf.poly([[3, 7], [7, 11], [8, 7]], rgb('#fff080'));
    buf.rect(4, 5, 2, 1, rgb('#fffff0'));
    buf.outline(rgb('#704000'), 1);
    return { buf, ax: 7, ay: 6 };
  });
}

// --- Motion blurs ------------------------------------------------------------------------

/**
 * The whirl of a spinning move: speed streaks round an ellipse, split into
 * the half behind the body and the half in front so the body sits inside it.
 */
export function whirl(rx: number, ry: number, frame: number, half: 'back' | 'front', tint: 'white' | 'blue'): Sprite {
  const f = frame & 3;
  return baked(`whirl:${rx}:${ry}:${f}:${half}:${tint}`, false, () => {
    const W = rx * 2 + 8;
    const H = ry * 2 + 10;
    const buf = new PixBuf(W, H);
    const cx = W / 2;
    const cy = H / 2;
    const pal = tint === 'white' ? [rgb('#ffffff'), rgb('#d0e0f8'), rgb('#8098c8')] : [rgb('#e8f8ff'), rgb('#90c8f8'), rgb('#4070c8')];
    for (let s = 0; s < 3; s++) {
      const start = (f / 4) * Math.PI * 2 + (s * Math.PI * 2) / 3;
      for (let k = 0; k < 90; k++) {
        const a = start + (k / 90) * 1.9;
        const front = Math.sin(a) > 0;
        if ((half === 'front') !== front) continue;
        const tail = k / 90;
        const x = cx + Math.cos(a) * rx;
        const y = cy + Math.sin(a) * ry;
        const c = tail < 0.25 ? pal[2] : tail < 0.7 ? pal[1] : pal[0];
        if (tail < 0.4 && bayer(Math.round(x), Math.round(y)) > tail * 2.5) continue;
        buf.rect(x, y - (tail > 0.6 ? 1 : 0), 2, tail > 0.6 ? 3 : 2, c);
        if (tail > 0.5) buf.rect(x, y + ry * 0.35, 2, 1, pal[2]);
      }
    }
    return { buf, ax: Math.round(cx), ay: Math.round(cy) };
  });
}
