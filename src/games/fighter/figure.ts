/**
 * The fighters' pixels: the looks, proportions, palettes and the software
 * raster the bodies (`body.ts`) and portraits are drawn into.
 *
 * A software rasteriser rather than canvas paths, because canvas fills are
 * anti-aliased and anti-aliasing is the one thing a CPS-1 sprite never has.
 * A pixel's tone is its surface normal against one key light, quantised to
 * five tones per material with a checker dither where two meet; the ramp is
 * hue-shifted the way the arcade's palettes were (skin falls into warm
 * red-brown, cloth into cool indigo, and the top tone is a specular shine),
 * and the back edge catches a rim light. The raster has two modes. The 3D
 * one (`ell3`, `cone3`, `toImage3`) fills ellipsoids and tapered capsules
 * through a depth buffer and draws the inner outlines from depth, which is
 * what the bodies use; the flat one (`ellipse`, `capsule`, `poly`,
 * `toImage`) paints in order with a rim where a later part borders an
 * earlier one, which is what the face-on portraits use. Creases (muscle
 * separations, knuckles, cloth folds) are painted into the part they belong
 * to in either.
 *
 * This module owns the looks (costumes per fighter, with a second colourway
 * for the mirror match), the builds' proportions and the portrait painter.
 * DOM-free apart from the `ImageData` the caller hands it.
 */
import type { CharId, Fighter } from './roster';

// --- Palette -------------------------------------------------------------------

export type Rgb = readonly [number, number, number];

export function hexRgb(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const WARM_LIGHT: Rgb = [255, 244, 214];
/** Shadow tints: skin falls toward a warm crimson-brown, everything else toward indigo. */
const WARM_SHADOW: Rgb = [92, 24, 34];
const COOL_SHADOW: Rgb = [26, 22, 72];

/** Whether a colour reads as skin (warm, red over green over blue), which shades warm. */
function warm(c: Rgb): boolean {
  return c[0] > c[1] && c[1] >= c[2] * 0.9 && c[0] - c[2] > 40;
}

/**
 * Six entries from one base colour: deep, shade, base, light, shine, and the
 * outline. Shadows shift hue as well as value, which is what makes a palette
 * read as painted rather than as a darkened copy of itself.
 */
export function ramp(hex: string): Rgb[] {
  const base = hexRgb(hex);
  const tint = warm(base) ? WARM_SHADOW : COOL_SHADOW;
  const deep = mix(base, tint, 0.62);
  return [deep, mix(base, tint, 0.34), base, mix(base, WARM_LIGHT, 0.3), mix(base, WARM_LIGHT, 0.64), mix(deep, [8, 4, 12], 0.6)];
}

// --- Looks ------------------------------------------------------------------------

type HairStyle = 'spiky' | 'blond' | 'buns' | 'mohawk' | 'bald' | 'topknot' | 'mane' | 'flattop' | 'short' | 'mask' | 'patch' | 'cap';
type Pants = 'gi' | 'tight' | 'shorts' | 'trunks' | 'mawashi' | 'cargo';

export interface Look {
  skin: string;
  hair: string;
  /** Torso cover; null is bare-chested. */
  top: string | null;
  sleeves: 'none' | 'short' | 'long';
  /** A gi's open V, showing the chest. */
  vNeck?: boolean;
  pants: string;
  pantsStyle: Pants;
  belt?: string;
  shoes?: string;
  gloves?: string;
  bands?: string;
  hairStyle: HairStyle;
  /** Headband, ribbons, mask, cap: the accent colour. */
  accent?: string;
  /** Extras drawn by name. */
  extras?: ('claw' | 'cape' | 'skulls' | 'tags' | 'skirt' | 'paint' | 'spikes' | 'boxing')[];
}

/**
 * The fighters' looks, matched to their CC0 sprite sheets (the colours
 * `scripts/fighter-sprites.py` recolours each body to), which the portraits
 * and the 3D fallback body are painted from.
 */
const LOOKS: Record<CharId, { main: Look; alt: Partial<Look> }> = {
  kenji: {
    main: { skin: '#e0a070', hair: '#3a2416', top: '#eeeade', sleeves: 'none', pants: '#eeeade', pantsStyle: 'gi', belt: '#1c1c22', hairStyle: 'spiky', accent: '#d02828' },
    alt: { top: '#e8e0a0', pants: '#e8e0a0' }
  },
  ace: {
    main: { skin: '#eab084', hair: '#f0c838', top: '#d02a24', sleeves: 'none', pants: '#d02a24', pantsStyle: 'gi', belt: '#1c1c22', hairStyle: 'blond' },
    alt: { top: '#e8e8e8', pants: '#e8e8e8', hair: '#b07030' }
  },
  mei: {
    main: { skin: '#eab48c', hair: '#2a1a14', top: '#2c50c8', sleeves: 'none', pants: '#1e2a78', pantsStyle: 'shorts', shoes: '#1e2a78', hairStyle: 'blond' },
    alt: { top: '#c82c88', pants: '#6a1848', shoes: '#6a1848' }
  },
  boris: {
    main: { skin: '#e89a7c', hair: '#c02818', top: null, sleeves: 'none', pants: '#c02020', pantsStyle: 'shorts', belt: '#f0c030', shoes: '#c02020', bands: '#f0c030', hairStyle: 'short' },
    alt: { pants: '#2040b0', shoes: '#2040b0', hair: '#202020' }
  },
  raj: {
    main: { skin: '#8a5434', hair: '#2a1a10', top: null, sleeves: 'none', pants: '#e88a1c', pantsStyle: 'shorts', bands: '#e8e0c0', hairStyle: 'short' },
    alt: { pants: '#d8d8e0' }
  },
  tora: {
    main: { skin: '#eab08a', hair: '#1a1a22', top: null, sleeves: 'none', pants: '#1c3070', pantsStyle: 'mawashi', hairStyle: 'topknot' },
    alt: { pants: '#7a2020' }
  },
  rio: {
    main: { skin: '#5a9a3a', hair: '#e86a1a', top: null, sleeves: 'none', pants: '#6a4a26', pantsStyle: 'gi', belt: '#4a4a52', hairStyle: 'mane' },
    alt: { skin: '#c89a40', hair: '#3a2a8a' }
  },
  duke: {
    main: { skin: '#e2a47a', hair: '#e8d050', top: '#4e6a2a', sleeves: 'none', pants: '#6a7c40', pantsStyle: 'cargo', shoes: '#2a2620', belt: '#3a2a1a', hairStyle: 'short' },
    alt: { top: '#3a4a6a', pants: '#3a4a6a', hair: '#7a4a20' }
  },
  rocko: {
    main: { skin: '#6a3c24', hair: '#141414', top: null, sleeves: 'none', pants: '#2848b8', pantsStyle: 'shorts', belt: '#f0f0f0', shoes: '#1a1a1a', bands: '#d82424', hairStyle: 'short' },
    alt: { pants: '#d8d8d8', bands: '#2848b8' }
  },
  varga: {
    main: { skin: '#eab48c', hair: '#3a1a10', top: null, sleeves: 'none', pants: '#6a2a8a', pantsStyle: 'gi', belt: '#d82424', shoes: '#e8c040', hairStyle: 'short' },
    alt: { pants: '#204a8a', belt: '#e8c040' }
  },
  sakda: {
    main: { skin: '#b07a4a', hair: '#1a1a1a', top: null, sleeves: 'none', pants: '#5a2a8a', pantsStyle: 'gi', belt: '#f0ece0', hairStyle: 'spiky', accent: '#f0ece0' },
    alt: { pants: '#b01818' }
  },
  zar: {
    main: { skin: '#e0a07a', hair: '#1a1a1a', top: '#a01828', sleeves: 'none', pants: '#a01828', pantsStyle: 'gi', belt: '#e8c040', shoes: '#242424', hairStyle: 'short' },
    alt: { top: '#304878', pants: '#304878' }
  }
};

export function lookFor(id: CharId, alt: boolean): Look {
  const l = LOOKS[id];
  return alt ? { ...l.main, ...l.alt } : l.main;
}

/** The colour the HUD and the select screen use for a fighter. */
export function signatureColour(id: CharId): string {
  const l = LOOKS[id].main;
  return l.top ?? l.pants;
}

// --- Proportions ----------------------------------------------------------------

export interface Build {
  torso: number;
  upper: number;
  fore: number;
  thigh: number;
  shin: number;
  /** Radii: hip, chest, upper arm, forearm, thigh, shin, fist. */
  rHip: number;
  rChest: number;
  rUpper: number;
  rFore: number;
  rThigh: number;
  rShin: number;
  rFist: number;
  head: number;
  /** Belly radius (the sumo's). */
  belly: number;
}

const RAW_BUILDS: Record<Fighter['build'], Build> = {
  lean: { torso: 30, upper: 17, fore: 16, thigh: 22, shin: 22, rHip: 8, rChest: 11, rUpper: 4.6, rFore: 3.9, rThigh: 6.2, rShin: 4.5, rFist: 4.6, head: 7.2, belly: 0 },
  muscle: { torso: 31, upper: 17, fore: 16, thigh: 22, shin: 22, rHip: 8.5, rChest: 12.5, rUpper: 5.4, rFore: 4.6, rThigh: 6.6, rShin: 4.8, rFist: 5, head: 7.2, belly: 0 },
  giant: { torso: 32, upper: 17, fore: 16, thigh: 21, shin: 21, rHip: 10, rChest: 14, rUpper: 6.2, rFore: 5.2, rThigh: 7.6, rShin: 5.6, rFist: 5.4, head: 7.2, belly: 0 },
  heavy: { torso: 30, upper: 16, fore: 15, thigh: 20, shin: 20, rHip: 13, rChest: 13, rUpper: 6.2, rFore: 5.2, rThigh: 8.4, rShin: 6, rFist: 5.2, head: 7.4, belly: 14 },
  slim: { torso: 28, upper: 16, fore: 15, thigh: 23, shin: 23, rHip: 7.8, rChest: 8.6, rUpper: 3.4, rFore: 3, rThigh: 6.8, rShin: 4.4, rFist: 3.8, head: 6.8, belly: 0 },
  beast: { torso: 30, upper: 18, fore: 17, thigh: 21, shin: 21, rHip: 8.5, rChest: 13, rUpper: 6, rFore: 5.4, rThigh: 6.8, rShin: 5, rFist: 5.4, head: 7.4, belly: 0 },
  tall: { torso: 31, upper: 19, fore: 18, thigh: 24, shin: 24, rHip: 7, rChest: 9.6, rUpper: 3.6, rFore: 3.2, rThigh: 5, rShin: 3.8, rFist: 4.2, head: 7, belly: 0 }
};

/**
 * The arcade's fighters are heavier than anatomy: every radius is fattened
 * by the same factor, so the table above stays readable as proportions.
 */
const BULK = 1.17;
export const BUILDS = Object.fromEntries(
  Object.entries(RAW_BUILDS).map(([id, b]) => [
    id,
    { ...b, rHip: b.rHip * BULK, rChest: b.rChest * BULK, rUpper: b.rUpper * BULK, rFore: b.rFore * BULK, rThigh: b.rThigh * BULK, rShin: b.rShin * BULK, rFist: b.rFist * 1.08, head: b.head * 1.06 }
  ])
) as Record<Fighter['build'], Build>;

// --- Raster ---------------------------------------------------------------------

/** Light from above, in front, a little toward the opponent. */
const LIGHT = (() => {
  const v = [0.44, -0.66, 0.6];
  const m = Math.hypot(v[0], v[1], v[2]);
  return v.map(x => x / m) as [number, number, number];
})();

/** A radius and an offset (toward the anterior side) at a point along a bone. */
export type Profile = (t: number) => readonly [number, number];

/** A smooth bump of height 1 at `c`, `w` wide each side. */
export const bump = (t: number, c: number, w: number): number => Math.max(0, 1 - ((t - c) / w) ** 2);

/** A software framebuffer of material ids, tones and part groups. */
export class Raster {
  readonly w: number;
  readonly h: number;
  readonly mat: Uint8Array;
  readonly tone: Uint8Array;
  readonly grp: Uint8Array;
  /** Depth toward the viewer of what each pixel shows (the 3D primitives' z-buffer). */
  readonly zb: Float32Array;
  /** Which 3D primitive each pixel shows, for the lines between muscles. */
  readonly pid: Uint16Array;
  /** Per primitive id: whether it draws a separation line where it meets another. */
  private sepOf = new Uint8Array(65536);
  private nextPid = 1;
  /** Materials by id (id 0 is empty). */
  palettes: Rgb[][] = [[]];
  private matIds = new Map<string, number>();

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.mat = new Uint8Array(w * h);
    this.tone = new Uint8Array(w * h);
    this.grp = new Uint8Array(w * h);
    this.zb = new Float32Array(w * h).fill(-Infinity);
    this.pid = new Uint16Array(w * h);
  }

  clear(): void {
    this.mat.fill(0);
    this.grp.fill(0);
    this.zb.fill(-Infinity);
    this.pid.fill(0);
    this.nextPid = 1;
  }

  private prim(sep: boolean): number {
    const id = this.nextPid;
    this.nextPid = id >= 65535 ? 1 : id + 1;
    this.sepOf[id] = sep ? 1 : 0;
    return id;
  }

  private put3(i: number, x: number, y: number, z: number, m: number, g: number, light: number, id: number): void {
    const v = light + ((x + y) & 1 ? 0.06 : -0.06);
    this.zb[i] = z;
    this.mat[i] = m;
    this.grp[i] = g;
    this.pid[i] = id;
    this.tone[i] = v > 0.95 ? 4 : v > 0.7 ? 3 : v > 0.38 ? 2 : v > 0.08 ? 1 : 0;
  }

  /**
   * An ellipsoid in 3D, seen down the z axis (z toward the viewer), drawn
   * through the depth buffer: `axes` are orthonormal, `rad` the semi-axes
   * along them. A surface point `clip` returns true for is cut away (a gi's
   * open neck, a hairline, a belt's band).
   */
  ell3(c: V3, axes: readonly [V3, V3, V3], rad: readonly [number, number, number], m: number, g: number, bias = 0, opt: Prim3 = {}): void {
    let m00 = 0, m01 = 0, m02 = 0, m11 = 0, m12 = 0, m22 = 0, ex = 0, ey = 0;
    for (let k = 0; k < 3; k++) {
      const a = axes[k];
      const q = 1 / (rad[k] * rad[k]);
      m00 += a[0] * a[0] * q;
      m01 += a[0] * a[1] * q;
      m02 += a[0] * a[2] * q;
      m11 += a[1] * a[1] * q;
      m12 += a[1] * a[2] * q;
      m22 += a[2] * a[2] * q;
      ex += (rad[k] * a[0]) ** 2;
      ey += (rad[k] * a[1]) ** 2;
    }
    ex = Math.sqrt(ex);
    ey = Math.sqrt(ey);
    const id = this.prim(!!opt.sep);
    const { w, zb } = this;
    const x0 = Math.max(0, Math.floor(c[0] - ex));
    const x1 = Math.min(w - 1, Math.ceil(c[0] + ex));
    const y0 = Math.max(0, Math.floor(c[1] - ey));
    const y1 = Math.min(this.h - 1, Math.ceil(c[1] + ey));
    for (let y = y0; y <= y1; y++) {
      const dy = y + 0.5 - c[1];
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - c[0];
        const B = 2 * (m02 * dx + m12 * dy);
        const C = m00 * dx * dx + 2 * m01 * dx * dy + m11 * dy * dy - 1;
        const disc = B * B - 4 * m22 * C;
        if (disc < 0) continue;
        const dz = (-B + Math.sqrt(disc)) / (2 * m22);
        const z = c[2] + dz;
        const i = y * w + x;
        if (z <= zb[i]) continue;
        if (opt.clip && opt.clip(x + 0.5, y + 0.5, z)) continue;
        const nx = m00 * dx + m01 * dy + m02 * dz;
        const ny = m01 * dx + m11 * dy + m12 * dz;
        const nz = m02 * dx + m12 * dy + m22 * dz;
        const nl = Math.hypot(nx, ny, nz) || 1;
        this.put3(i, x, y, z, m, g, (nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]) / nl + bias, id);
      }
    }
  }

  /**
   * A tapered capsule in 3D from `a` (radius ra) to `b` (radius rb): swept
   * along its projection, each pixel's depth is the axis's plus the round
   * of the section, which is exact for a bone across the view and close
   * enough for one foreshortened toward it.
   */
  cone3(a: V3, b: V3, ra: number, rb: number, m: number, g: number, bias = 0, opt: Prim3 = {}): void {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    const ux = len > 1e-3 ? dx / len : 0;
    const uy = len > 1e-3 ? dy / len : 0;
    const rMax = Math.max(ra, rb);
    const id = this.prim(!!opt.sep);
    const { w, zb } = this;
    const x0 = Math.max(0, Math.floor(Math.min(a[0], b[0]) - rMax));
    const x1 = Math.min(w - 1, Math.ceil(Math.max(a[0], b[0]) + rMax));
    const y0 = Math.max(0, Math.floor(Math.min(a[1], b[1]) - rMax));
    const y1 = Math.min(this.h - 1, Math.ceil(Math.max(a[1], b[1]) + rMax));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const px = x + 0.5 - a[0];
        const py = y + 0.5 - a[1];
        const t = len > 1e-3 ? Math.max(0, Math.min(1, (px * ux + py * uy) / len)) : 0;
        const r = len > 1e-3 ? ra + (rb - ra) * t : rMax;
        const ox = px - ux * t * len;
        const oy = py - uy * t * len;
        const d2 = ox * ox + oy * oy;
        if (d2 > r * r) continue;
        const hz = Math.sqrt(r * r - d2);
        const z = a[2] + (b[2] - a[2]) * t + hz;
        const i = y * w + x;
        if (z <= zb[i]) continue;
        if (opt.clip && opt.clip(x + 0.5, y + 0.5, z)) continue;
        this.put3(i, x, y, z, m, g, (ox * LIGHT[0] + oy * LIGHT[1] + hz * LIGHT[2]) / r + bias, id);
      }
    }
  }

  material(hex: string): number {
    let id = this.matIds.get(hex);
    if (id === undefined) {
      id = this.palettes.length;
      this.palettes.push(ramp(hex));
      this.matIds.set(hex, id);
    }
    return id;
  }

  private put(x: number, y: number, m: number, g: number, light: number): void {
    const i = y * this.w + x;
    const v = light + ((x + y) & 1 ? 0.06 : -0.06);
    this.mat[i] = m;
    this.grp[i] = g;
    this.tone[i] = v > 0.95 ? 4 : v > 0.7 ? 3 : v > 0.38 ? 2 : v > 0.08 ? 1 : 0;
  }

  /**
   * A bone swept from (ax, ay) to (bx, by) with a profile: at each fraction t
   * along it, a radius and an offset toward the anterior side (the side
   * opposite the bone's left perpendicular, which is the front of an arm or a
   * leg in any pose; `posterior` flips it, for a torso, whose front is the
   * other way round). The ends are round, like a capsule's.
   */
  limb(ax: number, ay: number, bx: number, by: number, prof: Profile, m: number, g: number, bias = 0, posterior = false): void {
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    // The anterior direction.
    const sx = posterior ? -uy : uy;
    const sy = posterior ? ux : -ux;
    let reach = 0;
    for (let k = 0; k <= 8; k++) {
      const [r, o] = prof(k / 8);
      reach = Math.max(reach, r + Math.abs(o));
    }
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - reach));
    const x1 = Math.min(this.w - 1, Math.ceil(Math.max(ax, bx) + reach));
    const y0 = Math.max(0, Math.floor(Math.min(ay, by) - reach));
    const y1 = Math.min(this.h - 1, Math.ceil(Math.max(ay, by) + reach));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const px = x + 0.5 - ax;
        const py = y + 0.5 - ay;
        const along = px * ux + py * uy;
        const t = Math.max(0, Math.min(1, along / len));
        const [r, off] = prof(t);
        const side = px * sx + py * sy - off;
        const over = along < 0 ? along : along > len ? along - len : 0;
        const d2 = side * side + over * over;
        if (d2 > r * r) continue;
        const nx = (side * sx + over * ux) / r;
        const ny = (side * sy + over * uy) / r;
        const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
        this.put(x, y, m, g, nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2] + bias);
      }
    }
  }

  /** A tapered capsule from (ax, ay) radius ar to (bx, by) radius br. */
  capsule(ax: number, ay: number, ar: number, bx: number, by: number, br: number, m: number, g: number, bias = 0): void {
    this.limb(ax, ay, bx, by, t => [ar + (br - ar) * t, 0], m, g, bias);
  }

  /** An ellipse rotated by `ang` radians. */
  ellipse(cx: number, cy: number, rx: number, ry: number, ang: number, m: number, g: number, bias = 0): void {
    const r = Math.max(rx, ry);
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(this.h - 1, Math.ceil(cy + r)); y++) {
      for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(this.w - 1, Math.ceil(cx + r)); x++) {
        const px = x + 0.5 - cx;
        const py = y + 0.5 - cy;
        const u = (px * c + py * s) / rx;
        const v = (-px * s + py * c) / ry;
        const d = u * u + v * v;
        if (d > 1) continue;
        const nx = u * c - v * s;
        const ny = u * s + v * c;
        const nz = Math.sqrt(Math.max(0, 1 - d));
        this.put(x, y, m, g, nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2] + bias);
      }
    }
  }

  /** A polygon, shaded as the ellipsoid that bounds it. */
  poly(pts: readonly (readonly [number, number])[], m: number, g: number, bias = 0): void {
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (const [x, y] of pts) {
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const rx = Math.max(1, (x1 - x0) / 2);
    const ry = Math.max(1, (y1 - y0) / 2);
    for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(this.h - 1, Math.ceil(y1)); y++) {
      for (let x = Math.max(0, Math.floor(x0)); x <= Math.min(this.w - 1, Math.ceil(x1)); x++) {
        if (!inside(pts, x + 0.5, y + 0.5)) continue;
        const nx = Math.max(-1, Math.min(1, (x + 0.5 - cx) / rx)) * 0.8;
        const ny = Math.max(-1, Math.min(1, (y + 0.5 - cy) / ry)) * 0.8;
        const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
        this.put(x, y, m, g, nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2] + bias);
      }
    }
  }

  /** Set a pixel to a material's tone outright (faces, eyes). */
  dot(x: number, y: number, m: number, tone: number, g?: number): void {
    const xi = Math.round(x);
    const yi = Math.round(y);
    if (xi < 0 || yi < 0 || xi >= this.w || yi >= this.h) return;
    const i = yi * this.w + xi;
    this.mat[i] = m;
    this.tone[i] = tone;
    if (g !== undefined) this.grp[i] = g;
  }

  /**
   * Darken a line of pixels already drawn in `group` (muscle separations,
   * knuckles, cloth folds). `depth` is how many tones it takes off.
   */
  crease(ax: number, ay: number, bx: number, by: number, group: number, depth = 2): void {
    const n = Math.max(1, Math.round(Math.max(Math.abs(bx - ax), Math.abs(by - ay))));
    for (let k = 0; k <= n; k++) {
      const x = Math.round(ax + ((bx - ax) * k) / n);
      const y = Math.round(ay + ((by - ay) * k) / n);
      if (x < 0 || y < 0 || x >= this.w || y >= this.h) continue;
      const i = y * this.w + x;
      if (this.grp[i] === group && this.mat[i]) this.tone[i] = Math.max(0, this.tone[i] - depth);
    }
  }

  /** Lift a line of pixels in `group` a tone (the lit lip of a fold). */
  lift(ax: number, ay: number, bx: number, by: number, group: number): void {
    const n = Math.max(1, Math.round(Math.max(Math.abs(bx - ax), Math.abs(by - ay))));
    for (let k = 0; k <= n; k++) {
      const x = Math.round(ax + ((bx - ax) * k) / n);
      const y = Math.round(ay + ((by - ay) * k) / n);
      if (x < 0 || y < 0 || x >= this.w || y >= this.h) continue;
      const i = y * this.w + x;
      if (this.grp[i] === group && this.mat[i]) this.tone[i] = Math.min(3, this.tone[i] + 1);
    }
  }

  /**
   * Resolve to RGBA: the rim light on the back edge, the inner rims, the
   * outer outline, and an optional flash (a hit whitens the whole figure for
   * a frame or two).
   */
  toImage(img: ImageData, flash: 'none' | 'white' | 'electric'): void {
    const { w, h, mat, tone, grp } = this;
    const out = new Uint32Array(img.data.buffer);
    out.fill(0);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const m = mat[i];
        let rgb: Rgb;
        if (m) {
          const pal = this.palettes[m];
          let t = tone[i];
          // The back edge, away from the key light, catches a rim of reflected light.
          if (t <= 1 && x > 1 && !mat[i - 1] && mat[i + 1]) t = 2;
          // A part in front of another gets a dark rim where it overlaps.
          const g = grp[i];
          let rim = false;
          if (g > 1) {
            for (const j of [i - 1, i + 1, i - w, i + w]) {
              if (j >= 0 && j < mat.length && mat[j] && grp[j] < g && grp[j] !== 0) {
                rim = true;
                break;
              }
            }
          }
          rgb = rim ? pal[5] : pal[t];
        } else {
          // The outer outline: the darkest tone of whatever it borders.
          let edge = 0;
          if (x > 0 && mat[i - 1]) edge = mat[i - 1];
          else if (x < w - 1 && mat[i + 1]) edge = mat[i + 1];
          else if (y > 0 && mat[i - w]) edge = mat[i - w];
          else if (y < h - 1 && mat[i + w]) edge = mat[i + w];
          if (!edge) continue;
          rgb = this.palettes[edge][5];
        }
        if (flash === 'white') rgb = mix(rgb, [255, 255, 255], 0.8);
        else if (flash === 'electric') rgb = mix(rgb, (x + y) % 4 < 2 ? [250, 250, 120] : [40, 60, 220], 0.75);
        out[i] = (255 << 24) | (Math.round(rgb[2]) << 16) | (Math.round(rgb[1]) << 8) | Math.round(rgb[0]);
      }
    }
  }

  /**
   * Resolve a 3D figure to RGBA. Where a nearer surface overlaps a farther
   * one by more than `edge` px of depth, the farther pixel takes the outline
   * colour, which draws the inner outlines (an arm across the chest, a leg
   * in front of the other) from the geometry itself; where a muscle meets
   * its neighbour at the same depth, a tone comes off the lower one, which
   * is the line a sprite artist draws round a muscle. Then the rim light on
   * the back edge and the outer outline, as for the flat figures.
   */
  toImage3(img: ImageData, flash: 'none' | 'white' | 'electric', edge: number): void {
    const { w, h, mat, tone, zb, pid } = this;
    const sepOf = this.sepOf;
    const out = new Uint32Array(img.data.buffer);
    out.fill(0);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const m = mat[i];
        let rgb: Rgb;
        if (m) {
          const pal = this.palettes[m];
          let t = tone[i];
          if (t <= 1 && x > 1 && !mat[i - 1] && mat[i + 1]) t = 2;
          const z = zb[i];
          const p = pid[i];
          let line = 0;
          for (const j of [i - 1, i + 1, i - w, i + w]) {
            if (j < 0 || j >= mat.length || !mat[j]) continue;
            const dz = zb[j] - z;
            if (dz > edge) {
              line = 2;
              break;
            }
            if (dz > 0.25 && pid[j] !== p && (sepOf[pid[j]] || sepOf[p])) line = 1;
          }
          if (line === 2) rgb = pal[5];
          else rgb = pal[line ? Math.max(0, t - 1) : t];
        } else {
          let edgeMat = 0;
          if (x > 0 && mat[i - 1]) edgeMat = mat[i - 1];
          else if (x < w - 1 && mat[i + 1]) edgeMat = mat[i + 1];
          else if (y > 0 && mat[i - w]) edgeMat = mat[i - w];
          else if (y < h - 1 && mat[i + w]) edgeMat = mat[i + w];
          if (!edgeMat) continue;
          rgb = this.palettes[edgeMat][5];
        }
        if (flash === 'white') rgb = mix(rgb, [255, 255, 255], 0.8);
        else if (flash === 'electric') rgb = mix(rgb, (x + y) % 4 < 2 ? [250, 250, 120] : [40, 60, 220], 0.75);
        out[i] = (255 << 24) | (Math.round(rgb[2]) << 16) | (Math.round(rgb[1]) << 8) | Math.round(rgb[0]);
      }
    }
  }
}


/** Options for a 3D primitive. */
export interface Prim3 {
  /** Draw a soft line where it meets a different primitive (a muscle's edge). */
  sep?: boolean;
  /** Cut away the surface at a screen point and depth. */
  clip?: (x: number, y: number, z: number) => boolean;
}

export type V3 = [number, number, number];

function inside(pts: readonly (readonly [number, number])[], x: number, y: number): boolean {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

/** The 3D bodies' head scale (see `body.ts`): the arcade drew its heads large. */
export const HEAD_SCALE_3D = 1.08;
