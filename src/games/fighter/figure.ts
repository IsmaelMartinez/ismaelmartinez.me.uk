/**
 * The fighters' pixels: a jointed figure, dressed and shaded the way a 1991
 * sprite artist shaded by hand, rasterised fresh every frame.
 *
 * A software rasteriser rather than canvas paths, because canvas fills are
 * anti-aliased and anti-aliasing is the one thing a CPS-1 sprite never has.
 * Every limb is a tapered capsule and every body a few ellipses and
 * polygons, filled pixel by pixel into a small buffer; each pixel's tone is
 * its surface normal against one key light, quantised to four tones per
 * material with a checker dither where two tones meet. Then two passes make
 * it a sprite: a dark rim wherever a part in front borders a part behind
 * (the inner outlines that separate an arm from the chest it crosses), and a
 * one-pixel outer outline in the darkest tone of whatever it borders.
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
const WARM_LIGHT: Rgb = [255, 248, 224];
const COOL_DARK: Rgb = [20, 12, 40];

/** Four tones (deep, shade, base, light) and an outline, from one base colour. */
export function ramp(hex: string): Rgb[] {
  const base = hexRgb(hex);
  const deep = mix(base, COOL_DARK, 0.58);
  return [deep, mix(base, COOL_DARK, 0.3), base, mix(base, WARM_LIGHT, 0.36), mix(deep, [0, 0, 0], 0.55)];
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
  const v = [0.42, -0.68, 0.6];
  const m = Math.hypot(v[0], v[1], v[2]);
  return v.map(x => x / m) as [number, number, number];
})();

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
    const v = light + ((x + y) & 1 ? 0.07 : -0.07);
    this.mat[i] = m;
    this.grp[i] = g;
    this.tone[i] = v > 0.8 ? 3 : v > 0.4 ? 2 : v > 0.04 ? 1 : 0;
  }

  /** A tapered capsule from (ax, ay) radius ar to (bx, by) radius br. */
  capsule(ax: number, ay: number, ar: number, bx: number, by: number, br: number, m: number, g: number, bias = 0): void {
    const x0 = Math.max(0, Math.floor(Math.min(ax - ar, bx - br)));
    const x1 = Math.min(this.w - 1, Math.ceil(Math.max(ax + ar, bx + br)));
    const y0 = Math.max(0, Math.floor(Math.min(ay - ar, by - br)));
    const y1 = Math.min(this.h - 1, Math.ceil(Math.max(ay + ar, by + br)));
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy || 1;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const px = x + 0.5 - ax;
        const py = y + 0.5 - ay;
        const t = Math.max(0, Math.min(1, (px * dx + py * dy) / len2));
        const cx = px - dx * t;
        const cy = py - dy * t;
        const r = ar + (br - ar) * t;
        const d2 = cx * cx + cy * cy;
        if (d2 > r * r) continue;
        const nx = cx / r;
        const ny = cy / r;
        const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
        this.put(x, y, m, g, nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2] + bias);
      }
    }
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
        // The normal in screen space, rotated back from the ellipse's frame.
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

  /** Set a pixel to a material's tone outright (faces, creases). */
  dot(x: number, y: number, m: number, tone: number, g?: number): void {
    const xi = Math.round(x);
    const yi = Math.round(y);
    if (xi < 0 || yi < 0 || xi >= this.w || yi >= this.h) return;
    const i = yi * this.w + xi;
    this.mat[i] = m;
    this.tone[i] = tone;
    if (g !== undefined) this.grp[i] = g;
  }

  /** Darken a line of pixels already drawn in `group` (muscle creases). */
  crease(ax: number, ay: number, bx: number, by: number, group: number): void {
    const n = Math.max(1, Math.round(Math.max(Math.abs(bx - ax), Math.abs(by - ay))));
    for (let k = 0; k <= n; k++) {
      const x = Math.round(ax + ((bx - ax) * k) / n);
      const y = Math.round(ay + ((by - ay) * k) / n);
      if (x < 0 || y < 0 || x >= this.w || y >= this.h) continue;
      const i = y * this.w + x;
      if (this.grp[i] === group && this.mat[i]) this.tone[i] = Math.max(0, this.tone[i] - 2);
    }
  }

  /**
   * Resolve to RGBA: the inner rims, the outer outline, and an optional
   * flash (a hit whitens the whole figure for a frame or two).
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
          // A part in front of another gets a dark rim where it overlaps.
          const g = grp[i];
          if (g > 1) {
            const n = [i - 1, i + 1, i - w, i + w];
            for (const j of n) {
              if (j >= 0 && j < mat.length && mat[j] && grp[j] < g && grp[j] !== 0) {
                t = -1;
                break;
              }
            }
          }
          rgb = t < 0 ? pal[4] : pal[t];
        } else {
          // The outer outline: the darkest tone of whatever it borders.
          let edge = 0;
          if (x > 0 && mat[i - 1]) edge = mat[i - 1];
          else if (x < w - 1 && mat[i + 1]) edge = mat[i + 1];
          else if (y > 0 && mat[i - w]) edge = mat[i - w];
          else if (y < h - 1 && mat[i + w]) edge = mat[i + w];
          if (!edge) continue;
          rgb = this.palettes[edge][4];
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

  const torsoUp = dir(j.torsoAng);
  const torsoFw = dir(j.torsoAng - 90);
  const ang = (j.torsoAng - 180) * -RAD;

  // Groups are draw order: a later group in front of an earlier one gets a rim.
  let group = 1;

  // --- Behind everything: the cape.
  if (extras.has('cape')) {
    const capeMat = r.material('#26262c');
    const s = P(j.shoulderF);
    const hipP = P(j.hip);
    const sway = Math.sin(j.hip[0] * 0.1) * 2;
    r.poly(
      [
        [s[0] - 6 * k, s[1] - 2 * k],
        [s[0] + 6 * k, s[1] - 3 * k],
        [hipP[0] - 4 * k + sway, hipP[1] + 28 * k],
        [hipP[0] - 20 * k + sway, hipP[1] + 30 * k]
      ],
      capeMat,
      group++,
      -0.15
    );
  }

  const arm = (s: [number, number], e: [number, number], h: [number, number], far: boolean) => {
    const g = group++;
    const bias = far ? -0.32 : 0;
    const S = P(s);
    const E = P(e);
    const H = P(h);
    r.capsule(S[0], S[1], build.rUpper * k * 1.1, E[0], E[1], build.rFore * k * 1.05, skin, g, bias);
    r.capsule(E[0], E[1], build.rFore * k, H[0], H[1], build.rFore * k * 0.85, skin, g, bias);
    if (look.sleeves === 'long') {
      r.capsule(S[0], S[1], build.rUpper * k * 1.25, E[0], E[1], build.rFore * k * 1.2, top, g, bias);
      r.capsule(E[0], E[1], build.rFore * k * 1.2, H[0] - (H[0] - E[0]) * 0.2, H[1] - (H[1] - E[1]) * 0.2, build.rFore * k * 1.1, top, g, bias);
    } else if (look.sleeves === 'short') {
      const m: [number, number] = [S[0] + (E[0] - S[0]) * 0.55, S[1] + (E[1] - S[1]) * 0.55];
      r.capsule(S[0], S[1], build.rUpper * k * 1.35, m[0], m[1], build.rUpper * k * 1.25, top, g, bias);
    }
    if (bands) {
      const b: [number, number] = [E[0] + (H[0] - E[0]) * 0.72, E[1] + (H[1] - E[1]) * 0.72];
      r.capsule(b[0], b[1], build.rFore * k * 1.15, H[0] - (H[0] - E[0]) * 0.1, H[1] - (H[1] - E[1]) * 0.1, build.rFore * k * 1.1, bands, g, bias);
      if (extras.has('spikes')) {
        const sp = r.material('#e8e8f0');
        r.dot(b[0], b[1] - build.rFore * k * 1.6, sp, 3);
        r.dot(b[0] + 2, b[1] - build.rFore * k * 1.4, sp, 3);
      }
    }
    // The fist (or the boxing glove, the open palm).
    const fistR = build.rFist * k * (extras.has('boxing') ? 1.55 : 1);
    if (pose.hand === 'open' && !extras.has('boxing')) {
      const d = [H[0] - E[0], H[1] - E[1]];
      const m = Math.hypot(d[0], d[1]) || 1;
      r.capsule(H[0], H[1], fistR * 0.75, H[0] + (d[0] / m) * fistR * 1.3, H[1] + (d[1] / m) * fistR * 1.3, fistR * 0.6, gloves === skin ? skin : gloves, g, bias);
    } else {
      r.ellipse(H[0], H[1], fistR, fistR * 0.92, 0, gloves, g, bias);
    }
    if (extras.has('claw') && !far) {
      const d = [H[0] - E[0], H[1] - E[1]];
      const m = Math.hypot(d[0], d[1]) || 1;
      const steel = r.material('#d8dce8');
      const cg = group++;
      for (const off of [-2, 0, 2]) {
        const px = -d[1] / m;
        const py = d[0] / m;
        r.capsule(H[0] + px * off, H[1] + py * off, 0.9, H[0] + (d[0] / m) * 15 * k + px * off * 1.4, H[1] + (d[1] / m) * 15 * k + py * off * 1.4, 0.6, steel, cg, 0.2);
      }
    }
  };

  const leg = (hp: [number, number], kn: [number, number], an: [number, number], toe: [number, number], far: boolean) => {
    const g = group++;
    const bias = far ? -0.32 : 0;
    const Hh = P(hp);
    const K = P(kn);
    const A = P(an);
    const T = P(toe);
    const style = look.pantsStyle;
    const skinLegs = style === 'trunks' || style === 'mawashi' || style === 'shorts';
    r.capsule(Hh[0], Hh[1], build.rThigh * k, K[0], K[1], build.rShin * k * 1.05, skinLegs ? skin : pants, g, bias);
    r.capsule(K[0], K[1], build.rShin * k, A[0], A[1], build.rShin * k * 0.72, skinLegs ? skin : pants, g, bias);
    if (style === 'gi' || style === 'cargo') {
      // Baggy trousers: wider than the leg, flaring at the knee and the ankle.
      const wide = style === 'gi' ? 1.42 : 1.25;
      r.capsule(Hh[0], Hh[1], build.rThigh * k * 1.15, K[0], K[1], build.rShin * k * wide, pants, g, bias);
      r.capsule(K[0], K[1], build.rShin * k * wide, A[0] - (A[0] - K[0]) * 0.08, A[1] - (A[1] - K[1]) * 0.08, build.rShin * k * wide * 1.05, pants, g, bias);
    }
    if (style === 'shorts') {
      const m: [number, number] = [Hh[0] + (K[0] - Hh[0]) * 0.6, Hh[1] + (K[1] - Hh[1]) * 0.6];
      r.capsule(Hh[0], Hh[1], build.rThigh * k * 1.2, m[0], m[1], build.rThigh * k * 1.1, pants, g, bias);
    }
    // Boots reach up the shin; bare feet are a short wedge.
    if (look.shoes) {
      const b: [number, number] = [A[0] + (K[0] - A[0]) * (look.pantsStyle === 'trunks' ? 0.45 : 0.25), A[1] + (K[1] - A[1]) * (look.pantsStyle === 'trunks' ? 0.45 : 0.25)];
      r.capsule(b[0], b[1], build.rShin * k * 0.95, A[0], A[1], build.rShin * k * 0.85, shoes, g, bias);
    }
    r.capsule(A[0], A[1], build.rShin * k * 0.7, T[0], T[1], build.rShin * k * 0.5, shoes, g, bias);
  };

  const torso = () => {
    const g = group++;
    const H = P(j.hip);
    const N = P(j.neck);
    const chestC = add(H, torsoUp, build.torso * k * 0.66);
    r.capsule(H[0], H[1], build.rHip * k, N[0], N[1], build.rChest * k * 0.7, top, g);
    r.ellipse(chestC[0] + torsoFw[0] * 1.5 * k, chestC[1] + torsoFw[1] * 1.5 * k, build.rChest * k, build.rChest * k * 0.78, ang, top, g);
    if (build.belly) {
      const b = add(H, torsoUp, build.torso * k * 0.28);
      r.ellipse(b[0] + torsoFw[0] * 3 * k, b[1] + torsoFw[1] * 3 * k, build.belly * k, build.belly * k * 0.9, ang, skin, g);
    }
    if (look.top && look.vNeck) {
      // The gi's open front, chest showing.
      const a = add(N, torsoFw, build.rChest * k * 0.55);
      const b2 = add(add(N, torsoUp, -build.torso * k * 0.5), torsoFw, build.rChest * k * 0.75);
      const c = add(N, torsoFw, -build.rChest * k * 0.1);
      r.poly([a, b2, c], skin, g);
    }
    if (!look.top) {
      // Pecs and abs: the creases a sprite artist painted in.
      const pec = add(chestC, torsoUp, -build.rChest * k * 0.35);
      r.crease(pec[0] - torsoFw[0] * 3 * k, pec[1] - torsoFw[1] * 3 * k, pec[0] + torsoFw[0] * build.rChest * k, pec[1] + torsoFw[1] * build.rChest * k, g);
      if (!build.belly) {
        for (const f of [0.25, 0.4]) {
          const a = add(H, torsoUp, build.torso * k * f);
          r.crease(a[0] + torsoFw[0] * 2 * k, a[1] + torsoFw[1] * 2 * k, a[0] + torsoFw[0] * 6 * k, a[1] + torsoFw[1] * 6 * k, g);
        }
      }
    }
    // Pelvis: trunks, mawashi, the top of the trousers.
    const pelvisR = build.rHip * k * (build.belly ? 1.05 : 1.12);
    r.ellipse(H[0], H[1] + 1 * k, pelvisR, build.rHip * k * 0.7, ang, pants, g);
    if (look.pantsStyle === 'mawashi') {
      const front = add(H, torsoFw, pelvisR * 0.6);
      r.capsule(front[0], front[1], 2.6 * k, front[0], front[1] + 9 * k, 2.2 * k, pants, g);
    }
    if (look.belt) {
      const belt = r.material(look.belt);
      const b = add(H, torsoUp, 5 * k);
      const a1 = add(b, torsoFw, -build.rHip * k * 1.1);
      const a2 = add(b, torsoFw, build.rHip * k * 1.1);
      r.capsule(a1[0], a1[1], 1.8 * k, a2[0], a2[1], 1.8 * k, belt, g);
      if (look.pantsStyle === 'gi') {
        const knot = add(a2, torsoFw, -2 * k);
        r.capsule(knot[0], knot[1], 1.2 * k, knot[0] + 2 * k, knot[1] + 9 * k, 1 * k, belt, g);
      }
    }
    if (extras.has('skirt')) {
      const front = add(H, torsoFw, build.rHip * k * 0.4);
      r.poly(
        [
          [front[0] - 3 * k, front[1] - 2 * k],
          [front[0] + 5 * k, front[1] - 2 * k],
          [front[0] + 7 * k, front[1] + 18 * k],
          [front[0] - 2 * k, front[1] + 18 * k]
        ],
        top,
        g
      );
    }
    if (extras.has('skulls')) {
      const bone = r.material('#ece4cc');
      for (let s = 0; s < 4; s++) {
        const p = add(add(N, torsoUp, -(4 + s * 3.2) * k), torsoFw, (2 + s * 1.6) * k);
        r.ellipse(p[0], p[1], 1.9 * k, 1.7 * k, 0, bone, g, 0.1);
      }
    }
    if (extras.has('tags')) {
      const steel = r.material('#c8ccd4');
      const p = add(add(N, torsoUp, -7 * k), torsoFw, 4 * k);
      r.ellipse(p[0], p[1], 1.2 * k, 1.6 * k, 0, steel, g, 0.2);
    }
  };

  const head = () => {
    const g = group++;
    const C = P(j.head);
    const N = P(j.neck);
    const hr = build.head * k;
    const hUp = dir(j.headAng);
    const hFw = dir(j.headAng - 90);
    const at = (fx: number, uy: number): [number, number] => [C[0] + hFw[0] * fx * k + hUp[0] * uy * k, C[1] + hFw[1] * fx * k + hUp[1] * uy * k];
    const headAngRad = (j.headAng - 180) * -RAD;
    r.capsule(N[0], N[1], hr * 0.62, C[0], C[1], hr * 0.55, skin, g);
    // The jaw sits forward and low; the skull behind and high.
    const jaw = at(1.5, -3);
    r.ellipse(jaw[0], jaw[1], hr * 0.8, hr * 0.62, headAngRad, skin, g);
    r.ellipse(C[0], C[1], hr, hr * 0.95, headAngRad, skin, g);
    const nose = at(7, -0.5);
    r.ellipse(nose[0], nose[1], 1.3 * k, 1.1 * k, 0, skin, g, 0.1);

    const hairG = group++;
    switch (look.hairStyle) {
      case 'spiky':
      case 'blond': {
        const c = at(-1.5, 2.5);
        r.ellipse(c[0], c[1], hr * 0.98, hr * 0.78, headAngRad, hair, hairG);
        const spikes: [number, number][] = look.hairStyle === 'spiky' ? [[-6, 6], [-2, 8.5], [2, 8], [5, 6]] : [[-8, 2], [-7, -4], [-4, 7], [1, 8], [5, 6]];
        for (const [fx, uy] of spikes) {
          const a = at(fx * 0.6, uy * 0.6);
          const b = at(fx, uy + (look.hairStyle === 'blond' && uy < 0 ? -4 : 2));
          r.capsule(a[0], a[1], 2.4 * k, b[0], b[1], 0.6 * k, hair, hairG);
        }
        if (look.hairStyle === 'blond') {
          const back = at(-5, -2);
          r.ellipse(back[0], back[1], hr * 0.6, hr * 0.9, headAngRad, hair, hairG);
        }
        if (look.accent && look.hairStyle === 'spiky') {
          const a = at(-7.5, 2.2);
          const b = at(6.5, 3.4);
          r.capsule(a[0], a[1], 1.3 * k, b[0], b[1], 1.3 * k, accent, hairG);
          const tail = at(-16, -1);
          r.capsule(a[0], a[1], 1.3 * k, tail[0], tail[1], 0.8 * k, accent, hairG);
          const tail2 = at(-14, -5);
          r.capsule(a[0], a[1], 1.2 * k, tail2[0], tail2[1], 0.7 * k, accent, hairG);
        }
        break;
      }
      case 'buns': {
        const c = at(-1.5, 2.5);
        r.ellipse(c[0], c[1], hr * 0.95, hr * 0.75, headAngRad, hair, hairG);
        for (const [fx, uy] of [
          [-5.5, 6],
          [1.5, 8]
        ] as const) {
          const b = at(fx, uy);
          r.ellipse(b[0], b[1], 3.3 * k, 3.3 * k, 0, hair, hairG);
          r.ellipse(b[0], b[1] + 1.2 * k, 3.4 * k, 1.4 * k, 0, accent, hairG, 0.2);
        }
        break;
      }
      case 'mohawk': {
        const a = at(-6, 6);
        const b = at(4, 8.5);
        r.capsule(a[0], a[1], 2.3 * k, b[0], b[1], 2.6 * k, hair, hairG);
        const beard = at(2.5, -4.5);
        r.ellipse(beard[0], beard[1], 5.2 * k, 3.8 * k, headAngRad, hair, hairG);
        const brow = at(5, 2.4);
        r.capsule(brow[0] - 2 * k, brow[1], 0.9 * k, brow[0] + 1.5 * k, brow[1] + 0.3 * k, 0.9 * k, hair, hairG);
        break;
      }
      case 'bald': {
        const mark = r.material('#d82424');
        for (const uy of [3, 4.5]) {
          const m = at(4.5, uy);
          r.dot(m[0], m[1], mark, 2, g);
        }
        break;
      }
      case 'topknot': {
        const c = at(-1.5, 2.5);
        r.ellipse(c[0], c[1], hr * 0.96, hr * 0.7, headAngRad, hair, hairG);
        const k1 = at(-3, 8);
        const k2 = at(-7, 10);
        r.capsule(k1[0], k1[1], 2.2 * k, k2[0], k2[1], 1.6 * k, hair, hairG);
        if (extras.has('paint')) {
          const a = at(1, 1);
          const b = at(7, -1);
          r.capsule(a[0], a[1], 0.9 * k, b[0], b[1], 0.9 * k, accent, hairG);
          const c2 = at(3, -3);
          const d = at(7, -4);
          r.capsule(c2[0], c2[1], 0.8 * k, d[0], d[1], 0.8 * k, accent, hairG);
        }
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
          const a = at(fx * 0.5, uy * 0.5);
          const b = at(fx + (fx < 0 ? -len * 0.4 : 1), uy + (uy > 0 ? len * 0.35 : -len * 0.2));
          r.capsule(a[0], a[1], 3.2 * k, b[0], b[1], 0.8 * k, hair, hairG);
        }
        break;
      }
      case 'flattop': {
        const c = at(-1.5, 3);
        r.ellipse(c[0], c[1], hr * 0.95, hr * 0.7, headAngRad, hair, hairG);
        r.poly([at(-6.5, 4), at(5, 5), at(5.5, 11.5), at(-6, 11)], hair, hairG);
        break;
      }
      case 'short': {
        const c = at(-1.5, 2.8);
        r.ellipse(c[0], c[1], hr * 0.96, hr * 0.68, headAngRad, hair, hairG);
        break;
      }
      case 'mask': {
        const c = at(-2.5, 2);
        r.ellipse(c[0], c[1], hr * 0.95, hr * 0.8, headAngRad, hair, hairG);
        const tailA = at(-7, 1);
        const tailB = at(-12, -12);
        r.capsule(tailA[0], tailA[1], 2.2 * k, tailB[0], tailB[1], 1.2 * k, hair, hairG);
        const m = at(4, 0.5);
        r.ellipse(m[0], m[1], 4.6 * k, 5.6 * k, headAngRad, accent, hairG, 0.15);
        break;
      }
      case 'patch': {
        const strapA = at(-7, 4);
        const strapB = at(5, 1);
        r.capsule(strapA[0], strapA[1], 0.7 * k, strapB[0], strapB[1], 0.7 * k, accent, hairG);
        const p = at(4.2, 1);
        r.ellipse(p[0], p[1], 1.8 * k, 1.6 * k, 0, accent, hairG);
        break;
      }
      case 'cap': {
        const c = at(-1, 5);
        r.ellipse(c[0], c[1], hr * 1.08, hr * 0.62, headAngRad, top, hairG);
        const visorA = at(1, 3.2);
        const visorB = at(9, 2.4);
        r.capsule(visorA[0], visorA[1], 1.4 * k, visorB[0], visorB[1], 1 * k, r.material('#1a1a1e'), hairG);
        const badge = at(3, 6.5);
        r.ellipse(badge[0], badge[1], 1.4 * k, 1.2 * k, 0, accent, hairG, 0.3);
        break;
      }
    }
    // The face: brow, eye, mouth.
    const dark = r.material('#14100c');
    const eye = at(4.3, 1);
    const browL = at(2.8, 2.6);
    const browR = at(6, 2.2);
    const face = pose.face ?? 'calm';
    if (look.hairStyle !== 'mask') {
      r.crease(browL[0], browL[1], browR[0], browR[1], g);
      r.crease(browL[0], browL[1], browR[0], browR[1], hairG);
      if (face === 'hurt') {
        r.dot(eye[0], eye[1], dark, 0);
        r.dot(eye[0] + 1, eye[1] - 1, dark, 0);
      } else if (look.hairStyle !== 'patch') {
        r.dot(eye[0], eye[1], dark, 0);
        r.dot(eye[0], eye[1] + 1, dark, 0);
      }
    } else {
      r.dot(eye[0], eye[1], dark, 0);
    }
    const mouth = at(5.4, -3.8);
    if (face === 'shout' || face === 'hurt') {
      const red = r.material('#7a1010');
      r.dot(mouth[0], mouth[1], red, 1);
      r.dot(mouth[0] + 1, mouth[1], red, 0);
      r.dot(mouth[0], mouth[1] + 1, red, 0);
    } else {
      r.dot(mouth[0], mouth[1], skin, 0);
      r.dot(mouth[0] + 1, mouth[1], skin, 0);
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

/** Where a fighter's head and hip sit relative to his feet, for portraits and effects. */
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
    r.ellipse(x, ey, 2.6 * u, 1.5 * u, 0, white, g, 0.3);
    r.dot(x + s * 0.3 * u, ey, dark, 0, g);
    r.dot(x + s * 0.3 * u, ey + 1, dark, 0, g);
    // Brows: heavy, angled down to the nose, the genre's scowl.
    r.capsule(x - s * 4 * u, ey - 3.2 * u, 1.1 * u, x + s * 3.2 * u, ey - 4.8 * u, 1 * u, look.hairStyle === 'bald' || look.hairStyle === 'patch' ? r.material('#3a2418') : hair, g);
  }
  r.crease(cx + 1 * u, ey + 1 * u, cx + 1.5 * u, ey + 6 * u, g);
  r.crease(cx - 1 * u, ey + 6.5 * u, cx + 2 * u, ey + 6.5 * u, g);
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
}
