/**
 * The fighters' pixels: a jointed figure, dressed and shaded the way a 1991
 * sprite artist shaded by hand, rasterised fresh every frame.
 *
 * A software rasteriser rather than canvas paths, because canvas fills are
 * anti-aliased and anti-aliasing is the one thing a CPS-1 sprite never has.
 * Every limb is a **swept muscle profile** (a radius and an offset that vary
 * along the bone, so a biceps swells in front of the upper arm and a calf
 * behind the shin), every body a few ellipses and polygons, filled pixel by
 * pixel into a small buffer. A pixel's tone is its surface normal against one
 * key light, quantised to five tones per material with a checker dither where
 * two meet; the ramp is hue-shifted the way the arcade's palettes were (skin
 * falls into warm red-brown, cloth into cool indigo, and the top tone is a
 * specular shine), and the back edge catches a rim light. Then two passes make
 * it a sprite: a dark rim wherever a part in front borders a part behind (the
 * inner outlines that separate an arm from the chest it crosses), and a
 * one-pixel outer outline in the darkest tone of whatever it borders. Muscle
 * separations, knuckles, toes and cloth folds are creases painted into the
 * parts they belong to.
 *
 * `poses.ts` says where the joints go; this module owns proportions (per
 * build), costumes (per fighter, with a second colourway for the mirror
 * match), faces, hair and props. DOM-free apart from the `ImageData` the
 * caller hands it, so the geometry is testable.
 */
import type { Pose } from './poses';
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

const LOOKS: Record<CharId, { main: Look; alt: Partial<Look> }> = {
  kenji: {
    main: { skin: '#e0a070', hair: '#3a2416', top: '#eeeade', sleeves: 'short', vNeck: true, pants: '#eeeade', pantsStyle: 'gi', belt: '#1c1c22', gloves: '#c03028', hairStyle: 'spiky', accent: '#d02828' },
    alt: { top: '#e8e0a0', pants: '#e8e0a0', accent: '#3050c0', gloves: '#3050c0' }
  },
  ace: {
    main: { skin: '#eab084', hair: '#f0c838', top: '#d02a24', sleeves: 'short', vNeck: true, pants: '#d02a24', pantsStyle: 'gi', belt: '#1c1c22', gloves: '#2a2a30', hairStyle: 'blond' },
    alt: { top: '#e8e8e8', pants: '#e8e8e8', hair: '#b07030' }
  },
  mei: {
    main: { skin: '#eab48c', hair: '#2a1a14', top: '#2c50c8', sleeves: 'short', pants: '#a87850', pantsStyle: 'tight', shoes: '#f4f4f4', bands: '#5a5a6a', hairStyle: 'buns', accent: '#f4f4f4', extras: ['skirt', 'spikes'] },
    alt: { top: '#c82c88', accent: '#f8d040' }
  },
  boris: {
    main: { skin: '#e89a7c', hair: '#c02818', top: null, sleeves: 'none', pants: '#c02020', pantsStyle: 'trunks', belt: '#f0c030', shoes: '#c02020', bands: '#f0c030', hairStyle: 'mohawk' },
    alt: { pants: '#2040b0', shoes: '#2040b0', hair: '#202020' }
  },
  raj: {
    main: { skin: '#8a5434', hair: '#2a1a10', top: null, sleeves: 'none', pants: '#e88a1c', pantsStyle: 'shorts', bands: '#e8e0c0', hairStyle: 'bald', extras: ['skulls'] },
    alt: { pants: '#d8d8e0' }
  },
  tora: {
    main: { skin: '#eab08a', hair: '#1a1a22', top: null, sleeves: 'none', pants: '#1c3070', pantsStyle: 'mawashi', hairStyle: 'topknot', accent: '#d82828', extras: ['paint'] },
    alt: { pants: '#7a2020', accent: '#2848c8' }
  },
  rio: {
    main: { skin: '#5a9a3a', hair: '#e86a1a', top: null, sleeves: 'none', pants: '#6a4a26', pantsStyle: 'shorts', bands: '#4a4a52', hairStyle: 'mane' },
    alt: { skin: '#c89a40', hair: '#3a2a8a' }
  },
  duke: {
    main: { skin: '#e2a47a', hair: '#e8d050', top: '#4e6a2a', sleeves: 'none', pants: '#6a7c40', pantsStyle: 'cargo', shoes: '#2a2620', belt: '#3a2a1a', hairStyle: 'flattop', extras: ['tags'] },
    alt: { top: '#8a8a8a', pants: '#3a4a6a', hair: '#7a4a20' }
  },
  rocko: {
    main: { skin: '#6a3c24', hair: '#141414', top: null, sleeves: 'none', pants: '#2848b8', pantsStyle: 'trunks', belt: '#f0f0f0', shoes: '#1a1a1a', gloves: '#d82424', hairStyle: 'short', extras: ['boxing'] },
    alt: { pants: '#d8d8d8', gloves: '#2848b8' }
  },
  varga: {
    main: { skin: '#eab48c', hair: '#3a1a10', top: null, sleeves: 'none', pants: '#6a2a8a', pantsStyle: 'gi', belt: '#d82424', shoes: '#e8c040', hairStyle: 'mask', accent: '#f4f4f4', extras: ['claw'] },
    alt: { pants: '#204a8a', belt: '#e8c040' }
  },
  sakda: {
    main: { skin: '#b07a4a', hair: '#1a1a1a', top: null, sleeves: 'none', pants: '#5a2a8a', pantsStyle: 'shorts', bands: '#f0ece0', hairStyle: 'patch', accent: '#1a1a1a' },
    alt: { pants: '#b01818' }
  },
  zar: {
    main: { skin: '#e0a07a', hair: '#1a1a1a', top: '#a01828', sleeves: 'long', pants: '#a01828', pantsStyle: 'gi', shoes: '#242424', gloves: '#2a2a2a', belt: '#1a1a1a', hairStyle: 'cap', accent: '#e8c040', extras: ['cape'] },
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

interface Build {
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
const BUILDS = Object.fromEntries(
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
  /** Materials by id (id 0 is empty). */
  palettes: Rgb[][] = [[]];
  private matIds = new Map<string, number>();

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.mat = new Uint8Array(w * h);
    this.tone = new Uint8Array(w * h);
    this.grp = new Uint8Array(w * h);
  }

  clear(): void {
    this.mat.fill(0);
    this.grp.fill(0);
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
}

function inside(pts: readonly (readonly [number, number])[], x: number, y: number): boolean {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

// --- The figure -----------------------------------------------------------------

const RAD = Math.PI / 180;
/** Direction of an angle measured from straight down, positive forward, y down. */
const dir = (deg: number): [number, number] => [Math.sin(deg * RAD), Math.cos(deg * RAD)];

export interface Joints {
  hip: [number, number];
  neck: [number, number];
  head: [number, number];
  headAng: number;
  shoulderN: [number, number];
  shoulderF: [number, number];
  elbowN: [number, number];
  elbowF: [number, number];
  handN: [number, number];
  handF: [number, number];
  hipN: [number, number];
  hipF: [number, number];
  kneeN: [number, number];
  kneeF: [number, number];
  ankleN: [number, number];
  ankleF: [number, number];
  toeN: [number, number];
  toeF: [number, number];
  torsoAng: number;
  rot: number;
}

const add = (p: readonly [number, number], d: readonly [number, number], k: number): [number, number] => [p[0] + d[0] * k, p[1] + d[1] * k];

/** Where every joint sits, relative to the feet anchor, in pixels (y down). */
export function joints(pose: Pose, build: Build, k: number): Joints {
  const rot = pose.rot;
  const torsoAng = 180 - pose.lean - rot;
  const up = dir(torsoAng);
  const fw = dir(torsoAng - 90);
  const st = pose.stretch ?? {};
  const calc = (hipY: number): Joints => {
    const hip: [number, number] = [pose.x * k, -hipY];
    const neck = add(hip, up, build.torso * k);
    const headAng = torsoAng - pose.head;
    const head = add(neck, dir(headAng), (3 + build.head) * k);
    const shoulderN = add(add(neck, up, -3 * k), fw, 1.5 * k);
    const shoulderF = add(add(neck, up, -2 * k), fw, -3 * k);
    const arm = (s: [number, number], a: readonly [number, number], stretch = 1) => {
      const e = add(s, dir(a[0] - rot), build.upper * k * stretch);
      const h = add(e, dir(a[0] + a[1] - rot), build.fore * k * stretch);
      return [e, h] as const;
    };
    const [elbowN, handN] = arm(shoulderN, pose.aN, st.aN);
    const [elbowF, handF] = arm(shoulderF, pose.aF, st.aF);
    const hipN = add(hip, fw, 1.5 * k);
    const hipF = add(hip, fw, -2.5 * k);
    const leg = (h: [number, number], l: readonly [number, number], stretch = 1) => {
      const knee = add(h, dir(l[0] - rot), build.thigh * k * stretch);
      const shinAng = l[0] + l[1] - rot;
      const ankle = add(knee, dir(shinAng), build.shin * k * stretch);
      const toe = add(ankle, dir(shinAng + 90), 8 * k);
      return [knee, ankle, toe] as const;
    };
    const [kneeN, ankleN, toeN] = leg(hipN, pose.lN, st.lN);
    const [kneeF, ankleF, toeF] = leg(hipF, pose.lF, st.lF);
    return { hip, neck, head, headAng, shoulderN, shoulderF, elbowN, elbowF, handN, handF, hipN, hipF, kneeN, kneeF, ankleN, ankleF, toeN, toeF, torsoAng, rot };
  };
  if (!pose.plant) return calc(pose.y * k);
  // Planted: find how far the lowest foot hangs below the hip, and stand on it.
  const j = calc(0);
  const low = Math.max(j.ankleN[1], j.ankleF[1], j.toeN[1], j.toeF[1]) + 3 * k;
  return calc(low);
}

/**
 * Draw a fighter into the raster with its feet at (ax, ay), facing right
 * (the caller mirrors for facing left). `scale` multiplies the fighter's own
 * size, which the portraits use.
 */
/** The arcade drew heads large; the skeleton's head is scaled up by this. */
const HEAD_SCALE = 1.14;

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const unit = (a: readonly [number, number], b: readonly [number, number]): [number, number] => {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const m = Math.hypot(dx, dy) || 1;
  return [dx / m, dy / m];
};
const at2 = (p: readonly [number, number], d: readonly [number, number], k: number, q?: readonly [number, number], m = 0): [number, number] => [
  p[0] + d[0] * k + (q ? q[0] * m : 0),
  p[1] + d[1] * k + (q ? q[1] * m : 0)
];

/**
 * Draw a fighter into the raster with its feet at (ax, ay), facing right
 * (the caller mirrors for facing left). `scale` multiplies the fighter's own
 * size.
 */
export function drawFigure(r: Raster, def: Fighter, look: Look, pose: Pose, ax: number, ay: number, scale = 1): Joints {
  const build = BUILDS[def.build];
  const k = (def.height / 90) * scale;
  const j = joints(pose, build, k);
  const P = (p: readonly [number, number]): [number, number] => [ax + p[0], ay + p[1]];
  const skin = r.material(look.skin);
  const hair = r.material(look.hair);
  const top = look.top ? r.material(look.top) : skin;
  const pants = r.material(look.pants);
  const shoes = look.shoes ? r.material(look.shoes) : skin;
  const gloves = look.gloves ? r.material(look.gloves) : skin;
  const bands = look.bands ? r.material(look.bands) : 0;
  const accent = look.accent ? r.material(look.accent) : 0;
  const extras = new Set(look.extras ?? []);
  const bare = !look.top;
  const torsoUp = dir(j.torsoAng);
  const torsoFw = dir(j.torsoAng - 90);
  const ang = (j.torsoAng - 180) * -RAD;
  const baggy = look.pantsStyle === 'gi' || look.pantsStyle === 'cargo';

  // Groups are draw order: a later group in front of an earlier one gets a rim.
  let group = 1;

  // --- Behind everything: the cape.
  if (extras.has('cape')) {
    const capeMat = r.material('#2a2830');
    const s = P(j.shoulderF);
    const hipP = P(j.hip);
    const g = group++;
    r.poly(
      [
        [s[0] - 7 * k, s[1] - 3 * k],
        [s[0] + 7 * k, s[1] - 4 * k],
        [hipP[0] - 2 * k, hipP[1] + 30 * k],
        [hipP[0] - 24 * k, hipP[1] + 33 * k]
      ],
      capeMat,
      g,
      -0.1
    );
    for (const f of [0.35, 0.65]) r.crease(s[0] - 4 * k + 2 * k * f, s[1], hipP[0] - 24 * k * f, hipP[1] + 30 * k, g, 1);
  }

  /** Fold lines across a stretch of cloth, a crease with a lit lip beside it. */
  const folds = (a: [number, number], b: [number, number], width: number, g: number, at: number[], slant: number) => {
    const u = unit(a, b);
    const n: [number, number] = [-u[1], u[0]];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (const f of at) {
      const c = at2(a, u, len * f);
      const p0 = at2(c, n, -width * 0.7, u, -slant * width);
      const p1 = at2(c, n, width * 0.55, u, slant * width);
      r.crease(p0[0], p0[1], p1[0], p1[1], g, 2);
      r.lift(p0[0] + u[0], p0[1] + u[1], p1[0] + u[0], p1[1] + u[1], g);
    }
  };

  const hand = (E: [number, number], H: [number, number], g: number, bias: number, far: boolean) => {
    const u = unit(E, H);
    const n: [number, number] = [-u[1], u[0]];
    const boxing = extras.has('boxing');
    const fr = build.rFist * k * (boxing ? 1.55 : 1);
    const mat = gloves;
    if (boxing) {
      r.ellipse(H[0] + u[0] * fr * 0.3, H[1] + u[1] * fr * 0.3, fr * 1.05, fr * 0.9, Math.atan2(u[1], u[0]), mat, g, bias);
      const c0 = at2(H, u, -fr * 0.75);
      r.capsule(c0[0] - n[0] * fr * 0.7, c0[1] - n[1] * fr * 0.7, fr * 0.3, c0[0] + n[0] * fr * 0.7, c0[1] + n[1] * fr * 0.7, fr * 0.3, r.material('#f4f0e8'), g, bias);
      const lace = at2(H, u, fr * 0.2, n, fr * 0.2);
      r.crease(lace[0], lace[1], lace[0] + u[0] * fr * 0.6, lace[1] + u[1] * fr * 0.6, g, 1);
      return;
    }
    if (pose.hand === 'open') {
      // Palm, four fingers together and the thumb splayed.
      r.limb(H[0] - u[0] * fr * 0.2, H[1] - u[1] * fr * 0.2, H[0] + u[0] * fr * 0.7, H[1] + u[1] * fr * 0.7, t => [fr * lerp(0.78, 0.72, t), 0], mat, g, bias);
      const f0 = at2(H, u, fr * 0.6);
      r.limb(f0[0], f0[1], f0[0] + u[0] * fr * 1.15, f0[1] + u[1] * fr * 1.15, t => [fr * lerp(0.62, 0.42, t), 0], mat, g, bias);
      for (const off of [-0.22, 0.12]) {
        const a = at2(f0, n, fr * off, u, fr * 0.2);
        r.crease(a[0], a[1], a[0] + u[0] * fr * 0.9, a[1] + u[1] * fr * 0.9, g, 1);
      }
      const th = at2(H, n, far ? fr * 0.55 : -fr * 0.55);
      r.capsule(th[0], th[1], fr * 0.32, th[0] + u[0] * fr * 0.7 + n[0] * fr * (far ? 0.5 : -0.5), th[1] + u[1] * fr * 0.7 + n[1] * fr * (far ? 0.5 : -0.5), fr * 0.24, mat, g, bias);
      return;
    }
    // A closed fist: a block of fingers, the knuckle ridge and the thumb across.
    r.limb(H[0] - u[0] * fr * 0.35, H[1] - u[1] * fr * 0.35, H[0] + u[0] * fr * 0.55, H[1] + u[1] * fr * 0.55, t => [fr * lerp(0.92, 1, t), fr * 0.06], mat, g, bias);
    const kn = at2(H, u, fr * 0.6);
    for (const off of [-0.45, -0.05, 0.35]) {
      const a = at2(kn, n, fr * off);
      r.crease(a[0], a[1], a[0] - u[0] * fr * 0.55, a[1] - u[1] * fr * 0.55, g, 1);
    }
    const th0 = at2(H, n, far ? fr * 0.5 : -fr * 0.5, u, -fr * 0.2);
    const th1 = at2(H, n, far ? fr * 0.1 : -fr * 0.1, u, fr * 0.45);
    r.capsule(th0[0], th0[1], fr * 0.36, th1[0], th1[1], fr * 0.3, mat, g, bias + 0.05);
    r.crease(th0[0], th0[1], th1[0], th1[1], g, 1);
  };

  const arm = (s: [number, number], e: [number, number], h: [number, number], far: boolean) => {
    const g = group++;
    const bias = far ? -0.3 : 0;
    const S = P(s);
    const E = P(e);
    const H = P(h);
    const rU = build.rUpper * k;
    const rF = build.rFore * k;
    const upper: Profile = t => [lerp(rU * 1.06, rF * 1.02, t) * (1 + 0.18 * bump(t, 0.5, 0.38)), rU * 0.24 * bump(t, 0.52, 0.36)];
    const fore: Profile = t => [lerp(rF * 1.1, rF * 0.72, t) + rF * 0.16 * bump(t, 0.18, 0.3), -rF * 0.16 * bump(t, 0.22, 0.32)];
    r.limb(S[0], S[1], E[0], E[1], upper, skin, g, bias);
    r.limb(E[0], E[1], H[0], H[1], fore, skin, g, bias);
    // The deltoid caps the shoulder.
    const ua = unit(S, E);
    const del = at2(S, ua, rU * 0.5);
    r.ellipse(del[0], del[1], rU * 1.32, rU * 1.18, Math.atan2(ua[1], ua[0]), look.sleeves === 'none' ? skin : top, g, bias);
    const un: [number, number] = [ua[1], -ua[0]];
    const lenU = Math.hypot(E[0] - S[0], E[1] - S[1]);
    if (look.sleeves === 'long') {
      r.limb(S[0], S[1], E[0], E[1], t => [upper(t)[0] * 1.2, upper(t)[1] * 0.5], top, g, bias);
      const H2 = at2(H, unit(E, H), -rF * 1.1);
      r.limb(E[0], E[1], H2[0], H2[1], t => [fore(t)[0] * 1.2 + rF * 0.1 * t, 0], top, g, bias);
      folds(S, E, rU, g, [0.4, 0.75], 0.5);
      folds(E, H2, rF, g, [0.3, 0.7], -0.4);
    } else if (look.sleeves === 'short') {
      const m = at2(S, ua, lenU * 0.62);
      r.limb(S[0], S[1], m[0], m[1], t => [rU * lerp(1.42, 1.38, t), rU * 0.15], top, g, bias);
      folds(S, m, rU * 1.2, g, [0.45, 0.85], 0.6);
    } else {
      // Bare arms: the line between biceps and triceps, and the elbow.
      const b0 = at2(S, ua, lenU * 0.35, un, -rU * 0.05);
      const b1 = at2(S, ua, lenU * 0.82, un, rU * 0.25);
      r.crease(b0[0], b0[1], b1[0], b1[1], g, 1);
      const d0 = at2(S, ua, lenU * 0.28, un, rU * 0.9);
      const d1 = at2(S, ua, lenU * 0.42, un, -rU * 0.4);
      r.crease(d0[0], d0[1], d1[0], d1[1], g, 1);
    }
    if (bands) {
      const fa = unit(E, H);
      const b = at2(H, fa, -rF * 1.3);
      r.capsule(b[0], b[1], rF * 0.98, H[0] - fa[0] * rF * 0.35, H[1] - fa[1] * rF * 0.35, rF * 0.92, bands, g, bias);
      if (extras.has('spikes')) {
        const sp = r.material('#e8e8f0');
        const fn: [number, number] = [-fa[1], fa[0]];
        for (const o of [-1, 1]) r.dot(b[0] + fn[0] * rF * 1.5 * o, b[1] + fn[1] * rF * 1.5 * o, sp, 4, g);
      }
    }
    hand(E, H, g, bias, far);
    if (extras.has('claw') && !far) {
      const u = unit(E, H);
      const n: [number, number] = [-u[1], u[0]];
      const steel = r.material('#d8dce8');
      const cg = group++;
      for (const off of [-2, 0, 2]) {
        r.capsule(H[0] + n[0] * off * k, H[1] + n[1] * off * k, 0.9 * k, H[0] + u[0] * 17 * k + n[0] * off * 1.6 * k, H[1] + u[1] * 17 * k + n[1] * off * 1.6 * k, 0.5 * k, steel, cg, 0.25);
      }
    }
  };

  const leg = (hp: [number, number], kn: [number, number], an: [number, number], toe: [number, number], far: boolean) => {
    const g = group++;
    const bias = far ? -0.3 : 0;
    const Hh = P(hp);
    const K = P(kn);
    const A = P(an);
    const T = P(toe);
    const rT = build.rThigh * k;
    const rS = build.rShin * k;
    const style = look.pantsStyle;
    const skinLegs = style === 'trunks' || style === 'mawashi' || style === 'shorts';
    const thigh: Profile = t => [lerp(rT * 1.02, rS * 1.04, t) * (1 + 0.1 * bump(t, 0.4, 0.45)), rT * 0.14 * bump(t, 0.42, 0.4)];
    const shin: Profile = t => [lerp(rS * 0.92, rS * 0.58, t) + rS * 0.26 * bump(t, 0.28, 0.26), -rS * 0.3 * bump(t, 0.28, 0.3)];
    const legMat = skinLegs ? skin : pants;
    r.limb(Hh[0], Hh[1], K[0], K[1], thigh, legMat, g, bias);
    r.limb(K[0], K[1], A[0], A[1], shin, legMat, g, bias);
    const ut = unit(Hh, K);
    const us = unit(K, A);
    const nt: [number, number] = [ut[1], -ut[0]];
    const ns: [number, number] = [us[1], -us[0]];
    if (skinLegs) {
      // The kneecap, and the long line between the calf's two heads.
      const kc = at2(K, nt, rS * 0.5);
      r.ellipse(kc[0], kc[1], rS * 0.6, rS * 0.5, 0, skin, g, bias + 0.12);
      const c0 = at2(K, us, rS * 0.6, ns, -rS * 0.7);
      const c1 = at2(A, us, -rS * 1.4, ns, -rS * 0.15);
      r.crease(c0[0], c0[1], c1[0], c1[1], g, 1);
      const q0 = at2(Hh, ut, rT * 1.2, nt, rT * 0.4);
      const q1 = at2(K, ut, -rT * 0.8, nt, rT * 0.1);
      r.crease(q0[0], q0[1], q1[0], q1[1], g, 1);
    }
    if (baggy) {
      // Trousers: wider than the leg, flaring at the knee and the ankle, folded.
      const wide = style === 'gi' ? 1.45 : 1.25;
      r.limb(Hh[0], Hh[1], K[0], K[1], t => [thigh(t)[0] * 1.16 + rT * 0.05, thigh(t)[1] * 0.5], pants, g, bias);
      const A2 = at2(A, us, -rS * 0.25);
      r.limb(K[0], K[1], A2[0], A2[1], t => [rS * lerp(wide * 1.02, wide * 1.12, t), rS * 0.1 * t], pants, g, bias);
      folds(Hh, K, rT * 1.15, g, [0.35, 0.7], 0.5);
      folds(K, A2, rS * wide, g, [0.25, 0.55, 0.82], -0.45);
    } else if (style === 'tight') {
      folds(K, A, rS, g, [0.2], 0.3);
    }
    if (style === 'shorts') {
      const m = at2(Hh, ut, Math.hypot(K[0] - Hh[0], K[1] - Hh[1]) * 0.58);
      r.limb(Hh[0], Hh[1], m[0], m[1], t => [rT * lerp(1.22, 1.16, t), rT * 0.1], pants, g, bias);
      folds(Hh, m, rT * 1.2, g, [0.88], 0);
    }
    // Feet: boots reach up the shin with a sole; bare feet have a heel and toes.
    const fu = unit(A, T);
    const fn: [number, number] = [-fu[1], fu[0]];
    if (look.shoes) {
      const tall = style === 'trunks' ? 0.55 : 0.3;
      const b: [number, number] = [lerp(A[0], K[0], tall), lerp(A[1], K[1], tall)];
      r.limb(b[0], b[1], A[0], A[1], t => [rS * lerp(1.02, 0.86, t), 0], shoes, g, bias);
      const T2 = at2(T, fu, rS * 0.2);
      r.limb(A[0] - fu[0] * rS * 0.4, A[1] - fu[1] * rS * 0.4, T2[0], T2[1], t => [rS * lerp(0.78, 0.55, t), rS * 0.08], shoes, g, bias);
      const s0 = at2(A, fn, rS * 0.62, fu, -rS * 0.4);
      const s1 = at2(T2, fn, rS * 0.45);
      r.crease(s0[0], s0[1], s1[0], s1[1], g, 3);
      if (style !== 'trunks') r.lift(b[0] + fn[0], b[1] + fn[1], b[0] + fn[0] + fu[0] * 2, b[1] + fn[1] + fu[1] * 2, g);
    } else {
      r.ellipse(A[0] - fu[0] * rS * 0.15, A[1] - fu[1] * rS * 0.15, rS * 0.62, rS * 0.56, 0, skin, g, bias);
      r.limb(A[0], A[1], T[0], T[1], t => [rS * lerp(0.56, 0.42, t), rS * 0.12 * t], skin, g, bias);
      const tp = at2(T, fu, -rS * 0.15);
      r.crease(tp[0] + fn[0] * rS * 0.2, tp[1] + fn[1] * rS * 0.2, tp[0] - fn[0] * rS * 0.3, tp[1] - fn[1] * rS * 0.3, g, 1);
    }
  };

  const torso = () => {
    const g = group++;
    const H = P(j.hip);
    const N = P(j.neck);
    const rH = build.rHip * k;
    const rC = build.rChest * k;
    const torsoProf: Profile = t => [lerp(rH, rC * 0.7, t) + rC * 0.34 * bump(t, 0.72, 0.3) - rH * 0.08 * bump(t, 0.32, 0.18), rC * 0.16 * bump(t, 0.68, 0.32)];
    r.limb(H[0], H[1], N[0], N[1], torsoProf, top, g, 0, true);
    const tl = Math.hypot(N[0] - H[0], N[1] - H[1]);
    const chestC = at2(H, torsoUp, tl * 0.68);
    // The trapezius slopes from the neck down to each shoulder.
    for (const s of [j.shoulderF, j.shoulderN]) {
      const S = P(s);
      r.capsule(N[0], N[1], rC * 0.42, S[0], S[1], build.rUpper * k * 1.05, top, g, -0.05);
    }
    if (build.belly) {
      const b = at2(H, torsoUp, tl * 0.26, torsoFw, 3 * k);
      r.ellipse(b[0], b[1], build.belly * k, build.belly * k * 0.92, ang, skin, g);
      r.crease(b[0] - torsoFw[0] * build.belly * k * 0.2, b[1] + build.belly * k * 0.55, b[0] + torsoFw[0] * build.belly * k * 0.7, b[1] + build.belly * k * 0.4, g, 1);
    }
    if (bare) {
      // Pecs, the line under them, the abdominals and the oblique.
      const pec = at2(chestC, torsoFw, rC * 0.45, torsoUp, rC * 0.05);
      r.ellipse(pec[0], pec[1], rC * 0.72, rC * 0.5, ang + 0.15, skin, g, 0.04);
      const pl0 = at2(pec, torsoFw, -rC * 0.7, torsoUp, -rC * 0.3);
      const pl1 = at2(pec, torsoFw, rC * 0.6, torsoUp, -rC * 0.45);
      r.crease(pl0[0], pl0[1], pl1[0], pl1[1], g, 2);
      if (!build.belly) {
        const line0 = at2(H, torsoUp, tl * 0.15, torsoFw, rH * 0.62);
        const line1 = at2(H, torsoUp, tl * 0.5, torsoFw, rC * 0.75);
        r.crease(line0[0], line0[1], line1[0], line1[1], g, 1);
        for (const f of [0.22, 0.34, 0.46]) {
          const a = at2(H, torsoUp, tl * f, torsoFw, rH * 0.25 + rC * 0.4 * f);
          r.crease(a[0], a[1], a[0] + torsoFw[0] * rC * 0.45, a[1] + torsoFw[1] * rC * 0.45, g, 1);
        }
        const ob0 = at2(H, torsoUp, tl * 0.08, torsoFw, -rH * 0.1);
        const ob1 = at2(H, torsoUp, tl * 0.45, torsoFw, rH * 0.2);
        r.crease(ob0[0], ob0[1], ob1[0], ob1[1], g, 1);
      }
    } else {
      // A cloth top: the lapel or the hem, and folds across the waist.
      if (look.vNeck) {
        const a = at2(N, torsoFw, rC * 0.62);
        const b2 = at2(N, torsoUp, -tl * 0.5, torsoFw, rC * 0.72);
        const c = at2(N, torsoFw, -rC * 0.05);
        r.poly([a, b2, c], skin, g);
        r.crease(c[0], c[1], b2[0], b2[1], g, 2);
        r.crease(a[0], a[1], b2[0], b2[1], g, 1);
        const pl0 = at2(b2, torsoFw, -rC * 0.3, torsoUp, tl * 0.2);
        r.crease(pl0[0], pl0[1], pl0[0] + torsoFw[0] * rC * 0.35, pl0[1] + torsoFw[1] * rC * 0.35, g, 1);
      }
      folds(H, N, rC, g, [0.2, 0.42], 0.6);
    }
    // Pelvis: trunks, mawashi, the top of the trousers.
    const pelvisR = rH * (build.belly ? 1.05 : 1.12);
    r.ellipse(H[0], H[1] + 1 * k, pelvisR, rH * 0.72, ang, pants, g);
    if (look.pantsStyle === 'trunks') {
      r.crease(H[0] - pelvisR * 0.8, H[1] + rH * 0.55, H[0] + pelvisR * 0.8, H[1] + rH * 0.5, g, 1);
    }
    if (look.pantsStyle === 'mawashi') {
      const front = at2(H, torsoFw, pelvisR * 0.6);
      r.capsule(front[0], front[1], 2.8 * k, front[0], front[1] + 11 * k, 2.2 * k, pants, g);
      for (let i = -1; i <= 1; i++) r.capsule(front[0] + i * 1.6 * k, front[1] + 6 * k, 0.6 * k, front[0] + i * 1.8 * k, front[1] + 14 * k, 0.5 * k, pants, g, 0.2);
    }
    if (look.belt) {
      const belt = r.material(look.belt);
      const b = at2(H, torsoUp, 5 * k);
      const a1 = at2(b, torsoFw, -rH * 1.12);
      const a2 = at2(b, torsoFw, rH * 1.12);
      r.capsule(a1[0], a1[1], 1.9 * k, a2[0], a2[1], 1.9 * k, belt, g);
      if (look.pantsStyle === 'gi') {
        // The knot, and two tails that hang and swing.
        const knot = at2(a2, torsoFw, -2.4 * k);
        r.ellipse(knot[0], knot[1], 2.2 * k, 1.9 * k, 0, belt, g, 0.1);
        r.capsule(knot[0], knot[1], 1.2 * k, knot[0] - 1.5 * k, knot[1] + 10 * k, 1.1 * k, belt, g);
        r.capsule(knot[0], knot[1], 1.2 * k, knot[0] + 2.5 * k, knot[1] + 9 * k, 1.1 * k, belt, g);
      } else r.lift(a1[0], a1[1] - k, a2[0], a2[1] - k, g);
    }
    if (extras.has('skirt')) {
      const front = at2(H, torsoFw, rH * 0.4);
      r.poly(
        [
          [front[0] - 3 * k, front[1] - 2 * k],
          [front[0] + 6 * k, front[1] - 2 * k],
          [front[0] + 8 * k, front[1] + 20 * k],
          [front[0] - 2 * k, front[1] + 20 * k]
        ],
        top,
        g
      );
      r.crease(front[0] + 2 * k, front[1], front[0] + 3 * k, front[1] + 19 * k, g, 1);
      const gold = r.material('#e8c040');
      r.capsule(front[0] - 2 * k, front[1] + 18 * k, 0.7 * k, front[0] + 7.5 * k, front[1] + 18 * k, 0.7 * k, gold, g);
    }
    if (extras.has('skulls')) {
      const bone = r.material('#ece4cc');
      for (let s = 0; s < 5; s++) {
        const p = at2(N, torsoUp, -(3 + s * 3) * k, torsoFw, (1.5 + s * 1.4) * k);
        r.ellipse(p[0], p[1], 1.9 * k, 1.8 * k, 0, bone, g, 0.15);
        r.dot(p[0] + 0.6 * k, p[1] + 0.2 * k, bone, 0, g);
      }
    }
    if (extras.has('tags')) {
      const steel = r.material('#c8ccd4');
      const p = at2(N, torsoUp, -8 * k, torsoFw, 4 * k);
      r.capsule(N[0] + torsoFw[0] * 2 * k, N[1], 0.4 * k, p[0], p[1], 0.4 * k, steel, g);
      r.ellipse(p[0], p[1], 1.3 * k, 1.8 * k, 0, steel, g, 0.3);
    }
  };

  const head = () => {
    const g = group++;
    const kk = k * HEAD_SCALE;
    const C = P(j.head);
    const N = P(j.neck);
    const hr = build.head * kk;
    const hUp = dir(j.headAng);
    const hFw = dir(j.headAng - 90);
    const at = (fx: number, uy: number): [number, number] => [C[0] + hFw[0] * fx * kk + hUp[0] * uy * kk, C[1] + hFw[1] * fx * kk + hUp[1] * uy * kk];
    const headAngRad = (j.headAng - 180) * -RAD;
    r.capsule(N[0], N[1], hr * 0.66, C[0] - hFw[0] * kk, C[1] - hFw[1] * kk, hr * 0.56, skin, g, -0.08);
    // The skull behind and high, the jaw forward and low, the chin.
    r.ellipse(C[0], C[1], hr * 0.98, hr * 0.94, headAngRad, skin, g);
    // Hair sits on the crown and the back of the skull, clear of the brow and
    // the eye, which is what lets a face read at this size.
    const atH = (fx: number, uy: number): [number, number] => at(fx * 0.86 - 2.1, uy * 0.9 + 1.9);
    const hrH = hr * 0.86;
    const hairG = group++;
    switch (look.hairStyle) {
      case 'spiky':
      case 'blond': {
        const c = atH(-1.5, 2.5);
        r.ellipse(c[0], c[1], hrH * 0.98, hrH * 0.78, headAngRad, hair, hairG);
        const spikes: [number, number][] = look.hairStyle === 'spiky' ? [[-6, 6], [-2, 8.5], [2, 8], [5, 6]] : [[-8, 2], [-7, -4], [-4, 7], [1, 8], [5, 6]];
        for (const [fx, uy] of spikes) {
          const a = atH(fx * 0.6, uy * 0.6);
          const b = atH(fx, uy + (look.hairStyle === 'blond' && uy < 0 ? -4 : 2));
          r.capsule(a[0], a[1], 2.4 * kk, b[0], b[1], 0.6 * kk, hair, hairG);
        }
        if (look.hairStyle === 'blond') {
          const back = atH(-5, -2);
          r.ellipse(back[0], back[1], hrH * 0.6, hrH * 0.9, headAngRad, hair, hairG);
        }
        if (look.accent && look.hairStyle === 'spiky') {
          const a = atH(-7.5, 2.2);
          const b = atH(6.5, 3.4);
          r.capsule(a[0], a[1], 1.3 * kk, b[0], b[1], 1.3 * kk, accent, hairG);
          const tail = atH(-16, -1);
          r.capsule(a[0], a[1], 1.3 * kk, tail[0], tail[1], 0.8 * kk, accent, hairG);
          const tail2 = atH(-14, -5);
          r.capsule(a[0], a[1], 1.2 * kk, tail2[0], tail2[1], 0.7 * kk, accent, hairG);
        }
        break;
      }
      case 'buns': {
        const c = atH(-1.5, 2.5);
        r.ellipse(c[0], c[1], hrH * 0.95, hrH * 0.75, headAngRad, hair, hairG);
        for (const [fx, uy] of [
          [-5.5, 6],
          [1.5, 8]
        ] as const) {
          const b = atH(fx, uy);
          r.ellipse(b[0], b[1], 3.3 * kk, 3.3 * kk, 0, hair, hairG);
          r.ellipse(b[0], b[1] + 1.2 * kk, 3.4 * kk, 1.4 * kk, 0, accent, hairG, 0.2);
        }
        break;
      }
      case 'mohawk': {
        const a = atH(-6, 6);
        const b = atH(4, 8.5);
        r.capsule(a[0], a[1], 2.3 * kk, b[0], b[1], 2.6 * kk, hair, hairG);
        const beard = atH(2.5, -4.5);
        r.ellipse(beard[0], beard[1], 5.2 * kk, 3.8 * kk, headAngRad, hair, hairG);
        const brow = atH(5, 2.4);
        r.capsule(brow[0] - 2 * kk, brow[1], 0.9 * kk, brow[0] + 1.5 * kk, brow[1] + 0.3 * kk, 0.9 * kk, hair, hairG);
        break;
      }
      case 'bald': {
        const mark = r.material('#d82424');
        for (const uy of [3, 4.5]) {
          const m = atH(4.5, uy);
          r.dot(m[0], m[1], mark, 2, g);
        }
        break;
      }
      case 'topknot': {
        const c = atH(-1.5, 2.5);
        r.ellipse(c[0], c[1], hrH * 0.96, hrH * 0.7, headAngRad, hair, hairG);
        const k1 = atH(-3, 8);
        const k2 = atH(-7, 10);
        r.capsule(k1[0], k1[1], 2.2 * kk, k2[0], k2[1], 1.6 * kk, hair, hairG);
        break;
      }
      case 'mane': {
        for (const [fx, uy, len] of [
          [-4, 6, 9],
          [0, 8, 8],
          [-8, 2, 10],
          [-7, -3, 9],
          [3, 6, 6],
          [-3, -6, 8]
        ] as const) {
          const a = atH(fx * 0.5, uy * 0.5);
          const b = atH(fx + (fx < 0 ? -len * 0.4 : 1), uy + (uy > 0 ? len * 0.35 : -len * 0.2));
          r.capsule(a[0], a[1], 3.2 * kk, b[0], b[1], 0.8 * kk, hair, hairG);
        }
        break;
      }
      case 'flattop': {
        const c = atH(-1.5, 3);
        r.ellipse(c[0], c[1], hrH * 0.95, hrH * 0.7, headAngRad, hair, hairG);
        r.poly([atH(-6.5, 4), atH(5, 5), atH(5.5, 11.5), atH(-6, 11)], hair, hairG);
        break;
      }
      case 'short': {
        const c = atH(-1.5, 2.8);
        r.ellipse(c[0], c[1], hrH * 0.96, hrH * 0.68, headAngRad, hair, hairG);
        break;
      }
      case 'mask': {
        const c = atH(-2.5, 2);
        r.ellipse(c[0], c[1], hrH * 0.95, hrH * 0.8, headAngRad, hair, hairG);
        const tailA = atH(-7, 1);
        const tailB = atH(-12, -12);
        r.capsule(tailA[0], tailA[1], 2.2 * kk, tailB[0], tailB[1], 1.2 * kk, hair, hairG);
        const m = atH(4, 0.5);
        r.ellipse(m[0], m[1], 4.6 * kk, 5.6 * kk, headAngRad, accent, hairG, 0.15);
        break;
      }
      case 'patch': {
        const strapA = atH(-7, 4);
        const strapB = atH(5, 1);
        r.capsule(strapA[0], strapA[1], 0.7 * kk, strapB[0], strapB[1], 0.7 * kk, accent, hairG);
        const p = atH(4.2, 1);
        r.ellipse(p[0], p[1], 1.8 * kk, 1.6 * kk, 0, accent, hairG);
        break;
      }
      case 'cap': {
        const c = atH(-1, 5);
        r.ellipse(c[0], c[1], hrH * 1.08, hrH * 0.62, headAngRad, top, hairG);
        const visorA = atH(1, 3.2);
        const visorB = atH(9, 2.4);
        r.capsule(visorA[0], visorA[1], 1.4 * kk, visorB[0], visorB[1], 1 * kk, r.material('#1a1a1e'), hairG);
        const badge = atH(3, 6.5);
        r.ellipse(badge[0], badge[1], 1.4 * kk, 1.2 * kk, 0, accent, hairG, 0.3);
        break;
      }
    }

    // The face is cut in over the front of the hair, which is what draws the hairline.
    const faceC = at(2.9, -1.3);
    r.ellipse(faceC[0], faceC[1], 4.5 * kk, 4.1 * kk, headAngRad, skin, g);
    // The sumo's kumadori paint goes on over the face.
    if (extras.has('paint')) {
      const a = at(1, 1);
      const b = at(7, -1);
      r.capsule(a[0], a[1], 0.9 * kk, b[0], b[1], 0.9 * kk, accent, g);
      const c2 = at(3, -3);
      const d = at(7, -4);
      r.capsule(c2[0], c2[1], 0.8 * kk, d[0], d[1], 0.8 * kk, accent, g);
    }
    r.poly([at(-2, -2), at(5.4, -1.5), at(5.8, -5.4), at(3.4, -7), at(-0.5, -6.2), at(-3, -3.5)], skin, g);
    // Brow ridge, nose and ear.
    const brow = at(4.6, 2.2);
    r.ellipse(brow[0], brow[1], 2.4 * kk, 1.3 * kk, headAngRad, skin, g, 0.08);
    r.poly([at(5.8, 1.2), at(8, -1.8), at(6, -2.4)], skin, g, 0.1);
    const ear = at(-1.6, 0);
    r.ellipse(ear[0], ear[1], 1.6 * kk, 2.2 * kk, headAngRad, skin, g, -0.05);
    r.crease(ear[0] + hFw[0] * 0.4 * kk, ear[1] - 1.2 * kk, ear[0] + hFw[0] * 0.4 * kk, ear[1] + 0.8 * kk, g, 1);
    // The jaw line and the cheek's shadow.
    const j0 = at(-0.5, -4.2);
    const j1 = at(4.2, -6.4);
    r.crease(j0[0], j0[1], j1[0], j1[1], g, 1);
    const ch0 = at(2.6, -1);
    r.crease(ch0[0], ch0[1], ch0[0] + hFw[0] * 1.6 * kk - hUp[0] * 2 * kk, ch0[1] + hFw[1] * 1.6 * kk - hUp[1] * 2 * kk, g, 1);

    // The face: a heavy brow, the eye (white in front of a dark iris), the mouth.
    const dark = r.material('#14100c');
    const white = r.material('#f4f0ec');
    const face = pose.face ?? 'calm';
    const eye = at(4.4, 0.8);
    if (look.hairStyle === 'mask') {
      r.dot(eye[0], eye[1], dark, 0);
      r.dot(eye[0] + hFw[0], eye[1] + hFw[1], dark, 0);
    } else {
      // A one-pixel brow over the eye, set on the lit ridge so it reads as a scowl.
      const b0 = at(3.2, 2.5);
      const b1 = at(6, 2.1);
      r.crease(b0[0], b0[1], b1[0], b1[1], g, 2);
      if (face === 'hurt') {
        r.dot(eye[0], eye[1], dark, 0, g);
        r.dot(eye[0] + hFw[0] * kk, eye[1] - kk, dark, 0, g);
        r.dot(eye[0] - hFw[0] * kk, eye[1] - kk, dark, 0, g);
      } else if (look.hairStyle !== 'patch') {
        r.dot(eye[0] + hFw[0] * kk, eye[1] + hFw[1] * kk, white, 3, g);
        r.dot(eye[0], eye[1], dark, 0, g);
        r.dot(eye[0], eye[1] + kk, dark, 0, g);
      }
    }
    const mouth = at(5.4, -3.9);
    if (face === 'shout' || face === 'hurt') {
      const red = r.material('#6a0e0e');
      r.dot(mouth[0], mouth[1], red, 1, g);
      r.dot(mouth[0] + 1, mouth[1], red, 0, g);
      r.dot(mouth[0], mouth[1] + 1, red, 0, g);
      r.dot(mouth[0] + 1, mouth[1] + 1, red, 0, g);
      r.dot(mouth[0] + 1, mouth[1] - 1, white, 3, g);
    } else {
      r.crease(mouth[0] - hFw[0] * kk, mouth[1], mouth[0] + hFw[0] * 1.2 * kk, mouth[1] + 0.3 * kk, g, 2);
    }
  };

  arm(j.shoulderF, j.elbowF, j.handF, true);
  leg(j.hipF, j.kneeF, j.ankleF, j.toeF, true);
  torso();
  leg(j.hipN, j.kneeN, j.ankleN, j.toeN, false);
  head();
  arm(j.shoulderN, j.elbowN, j.handN, false);
  return j;
}

export function landmarks(def: Fighter, pose: Pose, scale = 1): { head: [number, number]; hip: [number, number]; handN: [number, number]; neck: [number, number] } {
  const j = joints(pose, BUILDS[def.build], (def.height / 90) * scale);
  return { head: j.head, hip: j.hip, handN: j.handN, neck: j.neck };
}

/**
 * A frontal head-and-shoulders portrait for the select, VS, quote and
 * continue screens, where the arcade showed every fighter face-on. Drawn
 * with the same raster and shading as the bodies, in a `size` square.
 */
export function drawPortrait(r: Raster, def: Fighter, look: Look, mood: 'calm' | 'hurt' | 'shout', size: number): void {
  const u = size / 64;
  const cx = size / 2;
  const cy = size * 0.42;
  const skin = r.material(look.skin);
  const hair = r.material(look.hair);
  const top = look.top ? r.material(look.top) : skin;
  const accent = look.accent ? r.material(look.accent) : hair;
  const dark = r.material('#140c0a');
  const white = r.material('#f4f0ec');
  const heavy = def.build === 'heavy' || def.build === 'giant' || def.build === 'muscle' || def.build === 'beast';
  const slim = def.build === 'slim';
  let g = 1;
  // Shoulders and chest.
  const sw = (heavy ? 30 : slim ? 21 : 26) * u;
  r.ellipse(cx, size + 4 * u, sw, 22 * u, 0, look.top && look.sleeves !== 'none' ? top : skin, g);
  if (look.top) {
    if (look.sleeves === 'none') {
      // A tank top: shoulders bare, the cloth over the chest.
      r.ellipse(cx, size + 8 * u, sw * 0.62, 20 * u, 0, top, g);
    } else if (look.vNeck) {
      r.poly([[cx - 9 * u, size * 0.78], [cx + 9 * u, size * 0.78], [cx, size]], skin, g);
    } else {
      r.ellipse(cx, size * 0.8, 7 * u, 3 * u, 0, top, g, 0.2);
    }
  } else {
    r.crease(cx, size * 0.86, cx, size, g);
    r.crease(cx - 12 * u, size * 0.84, cx - 3 * u, size * 0.88, g);
    r.crease(cx + 12 * u, size * 0.84, cx + 3 * u, size * 0.88, g);
  }
  if (look.extras?.includes('skulls')) for (let i = -2; i <= 2; i++) r.ellipse(cx + i * 5 * u, size * 0.82 + Math.abs(i) * -1.5 * u, 2.2 * u, 2 * u, 0, r.material('#ece4cc'), g);
  if (look.extras?.includes('cape')) {
    r.ellipse(cx - sw * 0.8, size * 0.92, 7 * u, 5 * u, 0, r.material('#e8c040'), g, 0.2);
    r.ellipse(cx + sw * 0.8, size * 0.92, 7 * u, 5 * u, 0, r.material('#e8c040'), g, 0.2);
  }
  g++;
  // Neck and head.
  const hw = (heavy ? 13.5 : slim ? 11 : 12.5) * u;
  const hh = 15.5 * u;
  r.capsule(cx, cy + 10 * u, (heavy ? 9 : 7) * u, cx, size * 0.78, (heavy ? 11 : 8) * u, skin, g);
  g++;
  r.ellipse(cx, cy, hw, hh, 0, skin, g);
  r.ellipse(cx, cy + 6 * u, hw * 0.86, hh * 0.68, 0, skin, g);
  r.ellipse(cx - hw, cy + 1 * u, 2.4 * u, 3.6 * u, 0, skin, g, -0.2);
  r.ellipse(cx + hw, cy + 1 * u, 2.4 * u, 3.6 * u, 0, skin, g, -0.2);
  // Sculpt the face the way the select-screen portraits were painted: lit
  // cheekbones over hollow cheeks, a hard jaw, the neck's two cords.
  for (const s of [-1, 1]) {
    r.ellipse(cx + s * 7 * u, cy + 3.2 * u, 3.6 * u, 2.2 * u, 0, skin, g, 0.12);
    r.crease(cx + s * 8.5 * u, cy + 5.5 * u, cx + s * 5 * u, cy + 10 * u, g, 1);
    r.crease(cx + s * 9.5 * u, cy + 9 * u, cx + s * 4 * u, cy + 14.5 * u, g, 1);
    r.crease(cx + s * 5.5 * u, cy + 15 * u, cx + s * 2.5 * u, size * 0.84, g - 1, 1);
  }
  if (heavy) r.crease(cx, cy + 12.5 * u, cx, cy + 14 * u, g, 1);
  // Eyes, brows, nose, mouth.
  const ey = cy - 0.5 * u;
  const ex = 5.4 * u;
  const hurt = mood === 'hurt';
  for (const s of [-1, 1]) {
    const x = cx + s * ex;
    if (look.hairStyle === 'patch' && s === 1) continue;
    if (hurt && s === 1) {
      r.capsule(x - 2 * u, ey, 0.7 * u, x + 2 * u, ey, 0.7 * u, dark, g + 1);
      r.ellipse(x, ey, 4 * u, 3 * u, 0, r.material('#6a3a6a'), g, -0.1);
      r.capsule(x - 2 * u, ey, 0.7 * u, x + 2 * u, ey, 0.7 * u, dark, g);
      continue;
    }
    r.ellipse(x, ey, 2.7 * u, 1.5 * u, 0, white, g, 0.3);
    r.dot(x + s * 0.3 * u, ey, dark, 0, g);
    r.dot(x + s * 0.3 * u + 1, ey, dark, 0, g);
    r.dot(x + s * 0.3 * u, ey + 1, dark, 0, g);
    r.dot(x + s * 0.3 * u + 1, ey + 1, dark, 0, g);
    // The upper lid, and a shadow under the eye.
    r.crease(x - 2.8 * u, ey - 1.2 * u, x + 2.8 * u, ey - 1.4 * u, g, 3);
    r.crease(x - 2 * u, ey + 2.2 * u, x + 2 * u, ey + 2.2 * u, g, 1);
    // Brows: heavy, angled down to the nose, the genre's scowl.
    r.capsule(x - s * 4 * u, ey - 3.2 * u, 1.1 * u, x + s * 3.2 * u, ey - 4.8 * u, 1 * u, look.hairStyle === 'bald' || look.hairStyle === 'patch' ? r.material('#3a2418') : hair, g);
  }
  // The nose: a lit bridge, a shadowed side, the nostrils.
  r.lift(cx - 0.5 * u, ey - 1 * u, cx - 0.5 * u, ey + 5 * u, g);
  r.crease(cx + 1.5 * u, ey + 1 * u, cx + 2 * u, ey + 6 * u, g);
  r.crease(cx - 2 * u, ey + 6.5 * u, cx + 2.5 * u, ey + 6.5 * u, g);
  r.dot(cx - 1.6 * u, ey + 6 * u, dark, 0, g);
  r.dot(cx + 1.8 * u, ey + 6 * u, dark, 0, g);
  const my = cy + 10 * u;
  if (mood === 'shout' || hurt) {
    r.ellipse(cx, my, 3.4 * u, 2.2 * u, 0, r.material('#5a0e0e'), g, -0.4);
    r.capsule(cx - 2.4 * u, my - 1.2 * u, 0.5 * u, cx + 2.4 * u, my - 1.2 * u, 0.5 * u, white, g);
  } else {
    r.crease(cx - 3 * u, my, cx + 3 * u, my, g);
    r.crease(cx - 3 * u, my + 0.5 * u, cx + 3 * u, my + 0.5 * u, g);
  }
  if (hurt) {
    const blood = r.material('#b01010');
    r.dot(cx + 3 * u, my + 2 * u, blood, 2, g);
    r.dot(cx + 3 * u, my + 3 * u, blood, 1, g);
    r.dot(cx - 8 * u, cy - 6 * u, blood, 2, g);
  }
  g++;
  // Hair and headgear.
  const top0 = cy - hh;
  switch (look.hairStyle) {
    case 'spiky': {
      r.ellipse(cx, cy - 12 * u, hw * 1.1, 7.5 * u, 0, hair, g);
      for (let i = -4; i <= 4; i++) r.capsule(cx + i * 3 * u, top0 + 4 * u, 2.6 * u, cx + i * 4.2 * u, top0 - 5 * u - Math.abs(i % 2) * 2 * u, 0.6 * u, hair, g);
      r.capsule(cx - hw * 1.05, cy - 8.6 * u, 2 * u, cx + hw * 1.05, cy - 8.6 * u, 2 * u, accent, g + 1);
      r.capsule(cx + hw, cy - 8.6 * u, 1.6 * u, cx + hw + 9 * u, cy - 1 * u, 1 * u, accent, g + 1);
      r.capsule(cx + hw, cy - 8.6 * u, 1.4 * u, cx + hw + 7 * u, cy + 4 * u, 0.9 * u, accent, g + 1);
      break;
    }
    case 'blond':
      r.ellipse(cx, cy - 10 * u, hw * 1.2, 9 * u, 0, hair, g);
      for (const s of [-1, 1]) r.capsule(cx + s * hw * 0.95, cy - 6 * u, 4 * u, cx + s * hw * 1.1, cy + 10 * u, 2.4 * u, hair, g);
      for (let i = -3; i <= 3; i++) r.capsule(cx + i * 3.4 * u, cy - 12 * u, 2.6 * u, cx + i * 3 * u + 1, cy - 6 * u, 1 * u, hair, g);
      break;
    case 'buns':
      r.ellipse(cx, cy - 11 * u, hw * 1.06, 8 * u, 0, hair, g);
      for (const s of [-1, 1]) {
        r.ellipse(cx + s * hw * 0.95, cy - 17 * u, 5.5 * u, 5.5 * u, 0, hair, g);
        r.ellipse(cx + s * hw * 0.95, cy - 15 * u, 6 * u, 2.2 * u, 0, accent, g + 1, 0.2);
      }
      break;
    case 'mohawk':
      r.capsule(cx, top0 - 3 * u, 3.6 * u, cx, cy - 6 * u, 3.4 * u, hair, g);
      r.ellipse(cx, cy + 11 * u, hw * 0.9, 7 * u, 0, hair, g);
      r.ellipse(cx, my, 3 * u, 1.2 * u, 0, r.material('#5a0e0e'), g + 1, -0.4);
      break;
    case 'bald': {
      const red = r.material('#d82424');
      for (let i = -1; i <= 1; i++) r.ellipse(cx + i * 3 * u, cy - 9 * u, 0.9 * u, 0.9 * u, 0, red, g, 0.2);
      break;
    }
    case 'topknot':
      r.ellipse(cx, cy - 12 * u, hw * 1.04, 7 * u, 0, hair, g);
      r.ellipse(cx, top0 - 4 * u, 4 * u, 3.4 * u, 0, hair, g);
      for (const s of [-1, 1]) r.capsule(cx + s * 2 * u, ey + 2.2 * u, 0.9 * u, cx + s * 10 * u, ey - 1 * u, 0.9 * u, accent, g + 1);
      break;
    case 'mane':
      for (let a = -2.6; a <= -0.5; a += 0.3) r.capsule(cx, cy - 4 * u, 5 * u, cx + Math.cos(a) * 26 * u, cy - 4 * u + Math.sin(a) * 22 * u, 1 * u, hair, g);
      for (const s of [-1, 1]) r.capsule(cx + s * hw, cy - 4 * u, 4 * u, cx + s * (hw + 9 * u), cy + 10 * u, 1 * u, hair, g);
      break;
    case 'flattop':
      r.poly([[cx - hw * 1.02, cy - 8 * u], [cx + hw * 1.02, cy - 8 * u], [cx + hw * 1.06, top0 - 9 * u], [cx - hw * 1.06, top0 - 9 * u]], hair, g);
      break;
    case 'short':
      r.ellipse(cx, cy - 12 * u, hw * 1.06, 6.5 * u, 0, hair, g);
      break;
    case 'mask':
      r.ellipse(cx, cy - 6 * u, hw * 1.15, 11 * u, 0, hair, g);
      for (const s of [-1, 1]) r.capsule(cx + s * hw, cy - 4 * u, 3.4 * u, cx + s * (hw + 3 * u), cy + 18 * u, 2 * u, hair, g);
      r.ellipse(cx, cy + 1 * u, hw * 0.92, hh * 0.9, 0, accent, g + 1, 0.15);
      for (const s of [-1, 1]) r.capsule(cx + s * 3 * u, ey, 0.8 * u, cx + s * 8 * u, ey - 1.5 * u, 0.8 * u, dark, g + 2);
      break;
    case 'patch':
      r.capsule(cx - hw, cy - 6 * u, 0.8 * u, cx + hw, cy - 1 * u, 0.8 * u, accent, g);
      r.ellipse(cx + ex, ey, 3.4 * u, 2.8 * u, 0, accent, g + 1);
      break;
    case 'cap': {
      r.ellipse(cx, cy - 10 * u, hw * 1.3, 8 * u, 0, top, g);
      r.capsule(cx - hw * 1.1, cy - 4 * u, 2 * u, cx + hw * 1.1, cy - 4 * u, 2 * u, r.material('#1a1a1e'), g + 1);
      r.ellipse(cx, cy - 11 * u, 3 * u, 3 * u, 0, accent, g + 1, 0.3);
      break;
    }
  }
  // Strands through the hair: creases with a lit edge, combed from the crown.
  if (look.hairStyle !== 'bald' && look.hairStyle !== 'patch' && look.hairStyle !== 'cap') {
    for (let i = -3; i <= 3; i++) {
      r.crease(cx + i * 1.6 * u, top0 + 1 * u, cx + i * 3.6 * u, cy - 6.5 * u, g, 1);
      r.lift(cx + i * 1.6 * u + 1, top0 + 1 * u, cx + i * 3.6 * u + 1, cy - 6.5 * u, g);
    }
  }
}
