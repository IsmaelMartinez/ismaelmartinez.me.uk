/**
 * The head-and-shoulders portraits of the select, VS, quote and continue
 * screens, sculpted in 3D on the bodies' depth-buffered raster (`figure.ts`)
 * and turned three-quarters toward the opponent, as the arcade's select
 * screen painted its fighters: a skull, a jaw, cheekbones and a brow ridge
 * as separate forms, so the light falls on them in hard bands and the
 * raster's depth edges draw the lines between them; then the eyes, brows,
 * mouth and nostrils painted over in flat tones, which is where a portrait's
 * character is; then the hair as forms of its own.
 *
 * Each fighter's head differs in its proportions (`FACES`), not only in its
 * colours, so a row of portraits reads as eight people.
 */
import type { CharId, Fighter } from './roster';
import { Raster, type Look, type V3 } from './figure';

/** How a fighter's face departs from the default one (all 1 by default). */
interface Face {
  /** Jaw and cheek width. */
  jaw?: number;
  /** How far the chin drops and squares. */
  chin?: number;
  /** The brow ridge's weight (the scowl). */
  brow?: number;
  nose?: number;
  /** The neck's thickness. */
  neck?: number;
  beard?: string;
  moustache?: string;
  /** Painted lines on the cheeks (a kabuki's red). */
  paint?: string;
  /** Lighter features: lashes, a narrower brow, coloured lips. */
  soft?: boolean;
  /** A scar across the near cheek. */
  scar?: boolean;
  /** Teeth past the lips even when calm. */
  fangs?: boolean;
  /** A portrait-only hair shape, where the look's own reads too like another fighter's. */
  hair?: Look['hairStyle'];
}

const FACES: Partial<Record<CharId, Face>> = {
  kenji: {},
  ace: { chin: 1.2, jaw: 1.04 },
  mei: { jaw: 0.84, chin: 0.8, brow: 0.5, nose: 0.7, neck: 0.8, soft: true },
  boris: { jaw: 1.22, brow: 1.3, neck: 1.5, beard: '#a01c10', chin: 1.1 },
  raj: { jaw: 0.92, chin: 1.1, brow: 1.1, nose: 1.15, moustache: '#2a1a10', neck: 0.9 },
  tora: { jaw: 1.32, chin: 1.0, brow: 1.1, neck: 1.6, paint: '#c81818' },
  rio: { jaw: 1.22, brow: 1.5, nose: 1.2, neck: 1.4, fangs: true },
  duke: { jaw: 1.18, chin: 1.35, brow: 1.2, neck: 1.35, hair: 'flattop' },
  rocko: { jaw: 1.16, brow: 1.25, nose: 1.35, neck: 1.4, scar: true },
  varga: { jaw: 1.0, chin: 1.1, brow: 1.05, nose: 1.2, moustache: '#3a1a10' },
  sakda: { jaw: 1.12, chin: 1.15, brow: 1.4, neck: 1.35, scar: true },
  zar: { jaw: 1.1, chin: 1.2, brow: 1.3, nose: 1.1, neck: 1.25, beard: '#1a1a1a' }
};

/** The head's turn toward the opponent, radians. */
const YAW = 0.42;

export function drawPortrait(r: Raster, def: Fighter, look: Look, mood: 'calm' | 'hurt' | 'shout', size: number): void {
  const f: Face = FACES[def.id] ?? {};
  const jaw = f.jaw ?? 1;
  const chin = f.chin ?? 1;
  const brow = f.brow ?? 1;
  const nose = f.nose ?? 1;
  const neck = f.neck ?? 1;
  const s = size / 58;
  const cx = size * 0.5;
  const cy = size * 0.4;
  const co = Math.cos(YAW);
  const si = Math.sin(YAW);
  /** A point on the head (x right, y down, z out of the face, in head units) on screen. */
  const P = (x: number, y: number, z: number): V3 => [cx + s * (x * co + z * si), cy + s * y, s * (-x * si + z * co)];
  const AX: readonly [V3, V3, V3] = [
    [co, 0, -si],
    [0, 1, 0],
    [si, 0, co]
  ];
  /** An ellipsoid on the head: centre and semi-axes in head units. */
  const E = (x: number, y: number, z: number, a: number, b: number, c: number, m: number, g: number, bias = 0, sep = true, clip?: (x: number, y: number, z: number) => boolean): void =>
    r.ell3(P(x, y, z), AX, [a * s, b * s, c * s], m, g, bias, { sep, clip });
  const C = (a: readonly [number, number, number], b: readonly [number, number, number], ra: number, rb: number, m: number, g: number, bias = 0): void =>
    r.cone3(P(...a), P(...b), ra * s, rb * s, m, g, bias, { sep: true });
  /** Screen point back to head units. */
  const local = (x: number, y: number, z: number): V3 => {
    const dx = (x - cx) / s;
    const dz = z / s;
    return [dx * co - dz * si, (y - cy) / s, dx * si + dz * co];
  };

  const skin = r.material(look.skin);
  const hairHex = look.hair;
  const hair = r.material(hairHex);
  const top = look.top ? r.material(look.top) : skin;
  const accent = look.accent ? r.material(look.accent) : hair;
  const dark = r.material('#140c0a');
  const white = r.material('#f4f0ec');
  const heavy = def.build === 'heavy' || def.build === 'giant' || def.build === 'beast';

  // Shoulders, chest and neck, cropped by the frame's bottom edge.
  const sw = (heavy ? 1.25 : def.build === 'slim' ? 0.85 : def.build === 'muscle' ? 1.12 : 1) * jaw ** 0.3;
  const shoulder = look.top && look.sleeves !== 'none' ? top : skin;
  for (const side of [-1, 1]) E(side * 15 * sw, 26, -4, 12 * sw, 7, 9, shoulder, 1, 0, true);
  E(0, 33, 1, 22 * sw, 11, 10, skin, 1);
  if (look.top) {
    // The cloth over the chest, cut low at the neck.
    E(0, 35, 2.5, 20 * sw, 10, 10, top, 2, 0, true, (x, y, z) => {
      const [lx, ly] = local(x, y, z);
      return ly < 27 + Math.abs(lx) * 0.35 - (look.sleeves === 'none' ? 0 : 6);
    });
  } else {
    // Collarbones and the line between the pecs.
    for (const side of [-1, 1]) C([side * 3, 25.5, 6], [side * 15 * sw, 23.5, 2], 1.4, 1.1, skin, 2, 0.05);
  }
  C([0, 6, -3], [0, 26, -1], 6 * neck, 8.5 * neck, skin, 2);
  // Trapezius: the slope from neck to shoulder.
  for (const side of [-1, 1]) C([side * 5 * neck, 15, -5], [side * 15 * sw, 23, -5], 4 * neck, 6, skin, 2);

  // The head: skull, jaw, cheekbones, brow ridge, nose, chin, ears.
  const g = 3;
  E(0, -4, -1, 12.5, 13.5, 12.5, skin, g, 0, false);
  E(0, 4, 2, 10.5 * jaw, 8.6 * chin, 9.5, skin, g, 0, false);
  for (const side of [-1, 1]) E(side * 7 * jaw, 2.2, 6.5, 4, 2.8, 4.2, skin, g, 0.05);
  E(0, -3.6, 8.6, 9.5, 2.2 * brow, 3.8, skin, g, 0.08);
  E(0, 9.6 * chin, 6.2, 5.4 * jaw, 3.2 * chin, 4.2, skin, g, 0.04);
  for (const side of [-1, 1]) E(side * 11.6 * jaw ** 0.5, 1, -1.5, 2.2, 3.8, 2.4, skin, g, -0.05);
  C([0, -2.2, 11], [0, 4.6, 13.2 + nose], 1.4 * nose, 2.2 * nose, skin, g, 0.1);
  E(0, 5, 12 + nose * 0.8, 2.6 * nose, 1.9, 2.2, skin, g, 0.1);
  if (f.fangs) for (const side of [-1, 1]) E(side * 4.5, 7.5, 9, 2.2, 1.6, 1.6, skin, g, 0.05);

  // The face, painted over the forms.
  const hurt = mood === 'hurt';
  const eye = (side: number): void => {
    const shut = hurt && side === 1;
    // An almond, narrow and hooded: the genre's glare.
    const outline = [P(side * 2.8, 0.2, 11), P(side * 4.8, -1.1, 11.1), P(side * 7.4, -0.5, 9.6), P(side * 5, 0.9, 10.8)].map(p => [p[0], p[1]] as const);
    if (!shut) {
      fill(r, outline, white, 4);
      // The iris and pupil, looking toward the opponent, under the lid.
      const c = P(side * 4.8 + 0.8, -0.2, 11.1);
      fill(r, disc(c[0], c[1], 0.95 * s), dark, 0);
    }
    // The upper lid and its crease, and a shadow under the eye.
    line(r, P(side * 2.4, 0.1, 11), P(side * 4.8, -1.4, 11.2), dark, 0, 0);
    line(r, P(side * 4.8, -1.4, 11.2), P(side * 7.9, -0.4, 9.3), dark, 0, 0);
    line(r, P(side * 3.4, -2.2, 11.2), P(side * 6.8, -1.9, 9.8), skin, 1, 0);
    line(r, P(side * 3.4, 1.8, 11), P(side * 6.6, 1.4, 9.8), skin, 1, 0);
    if (f.soft) line(r, P(side * 7.4, -0.6, 9.6), P(side * 8.6, -1.6, 9), dark, 0, 0);
    // The brow: a dark wedge, thick at the nose and angled down to it.
    const bh = (f.soft ? 0.55 : 0.9) * Math.min(1.5, brow ** 0.6);
    const bc = look.hairStyle === 'bald' ? r.material('#3a2418') : f.beard ? r.material(f.beard) : hair;
    const lift = f.soft ? -0.9 : 0;
    fill(r, [P(side * 1.8, -2.4 + lift, 11.8), P(side * 5, -3.6 - bh + lift, 11.4), P(side * 9, -3.4 - bh * 0.4 + lift, 8.8), P(side * 8.8, -2.8 + lift, 8.9), P(side * 5, -3 + lift, 11.4), P(side * 2, -1.6 + lift, 11.8)].map(p => [p[0], p[1]] as const), bc, 1);
  };
  eye(1);
  eye(-1);
  // Nostrils and the shadow under the nose.
  const nz = 12 + nose * 0.8;
  for (const side of [-1, 1]) {
    const n = P(side * 1.5 * nose, 5.8, nz);
    r.dot(n[0], n[1], dark, 0);
  }
  line(r, P(-2.2 * nose, 6.6, nz - 1), P(2.2 * nose, 6.6, nz - 1), skin, 0, 0);
  // Cheek hollows and the lines from nose to mouth.
  for (const side of [-1, 1]) line(r, P(side * 3.4 * nose, 5.6, 11), P(side * 4.6, 9.4, 9.8), skin, 1, 0);
  const mouthY = 8.8 + (chin - 1) * 2;
  if (mood === 'shout' || hurt) {
    const red = r.material('#5a0e0e');
    fill(r, [P(-3.4, mouthY - 0.6, 10.6), P(3.4, mouthY - 0.6, 10.6), P(2.4, mouthY + 2.8, 10.4), P(-2.4, mouthY + 2.8, 10.4)].map(p => [p[0], p[1]] as const), red, 1);
    line(r, P(-3, mouthY - 0.2, 10.7), P(3, mouthY - 0.2, 10.7), white, 3, 0);
  } else {
    line(r, P(-3.6, mouthY, 10.6), P(3.6, mouthY, 10.6), f.soft ? r.material('#a83a40') : dark, f.soft ? 2 : 1, f.soft ? 0.6 : 0);
    line(r, P(-2.2, mouthY + 1.3, 10.6), P(2.2, mouthY + 1.3, 10.6), skin, 3, 0);
  }
  if (f.fangs) for (const side of [-1, 1]) fill(r, [P(side * 2.2, mouthY, 10.8), P(side * 3.2, mouthY, 10.8), P(side * 2.7, mouthY + 2, 10.8)].map(p => [p[0], p[1]] as const), white, 4);
  if (f.paint) {
    const pm = r.material(f.paint);
    for (const side of [-1, 1]) {
      fill(r, [P(side * 4.6, -1.8, 11.6), P(side * 8.6, -6, 9.4), P(side * 9.6, -5, 8.8), P(side * 6.6, -0.8, 10.6)].map(p => [p[0], p[1]] as const), pm, 2);
      fill(r, [P(side * 4, 2.6, 11), P(side * 9.4, 6.4, 8.6), P(side * 8.8, 7.6, 8.4), P(side * 3.6, 3.8, 10.8)].map(p => [p[0], p[1]] as const), pm, 2);
    }
  }
  if (f.scar) line(r, P(-8, -2, 9.4), P(-4, 5, 10.8), skin, 0, 0.5);
  if (f.moustache) {
    const mm = r.material(f.moustache);
    fill(r, [P(-4.2, mouthY - 0.4, 10.4), P(-1, mouthY - 2.6, 11.6), P(1, mouthY - 2.6, 11.6), P(4.2, mouthY - 0.4, 10.4), P(4.4, mouthY + 1.4, 10), P(3, mouthY - 0.6, 10.8), P(-3, mouthY - 0.6, 10.8), P(-4.4, mouthY + 1.4, 10)].map(p => [p[0], p[1]] as const), mm, 1);
  }
  if (f.beard) {
    const bm = r.material(f.beard);
    E(0, 9.5 * chin, 4.2, 10.4 * jaw, 8 * chin, 7.4, bm, g + 1, -0.05, true, (x, y, z) => {
      const [lx, ly] = local(x, y, z);
      return ly < 4 || (ly < mouthY + 1.6 && Math.abs(lx) < 5);
    });
  }
  if (hurt) {
    const blood = r.material('#b01010');
    const b = P(2.6, mouthY + 1.5, 10.5);
    fill(r, disc(b[0], b[1] + s, 0.9 * s), blood, 2);
    const v = P(5, 0, 11);
    fill(r, disc(v[0], v[1], 2.6 * s), r.material('#6a3a6a'), 1);
  }

  // The hair.
  const hg = g + 2;
  const style = f.hair ?? look.hairStyle;
  /** The hairline: the cap is cut away below it, high on the brow and low behind the ears. */
  const cap = (front: number, back: number) => (x: number, y: number, z: number): boolean => {
    const [lx, ly, lz] = local(x, y, z);
    const t = Math.max(0, Math.min(1, (lz + 2) / 12));
    // Receding a little at the temples.
    return ly > back + (front - back) * t - t * 0.045 * lx * lx;
  };
  switch (style) {
    case 'spiky': {
      E(0, -6.5, -1.5, 14, 13.8, 14, hair, hg, 0, true, cap(-6.5, 3));
      // Tufts thrown up and back from the crown, every way but down.
      for (let i = 0; i < 16; i++) {
        const a = -Math.PI * 1.02 + (i / 15) * Math.PI * 1.04;
        const z = ((i * 7) % 5) - 2;
        const len = 7 + ((i * 5) % 3) * 1.5;
        C([Math.cos(a) * 8, -9 + Math.sin(a) * 8, z * 2 - 1], [Math.cos(a) * (8 + len), -9 + Math.sin(a) * (8 + len) - 2, z * 3 - 4], 3.4, 0.5, hair, hg);
      }
      for (let i = -2; i <= 2; i++) C([i * 3, -11, 8], [i * 3.6 + 1, -6.6, 13], 2.4, 0.6, hair, hg + 1);
      if (look.accent) {
        E(0, -7.4, -0.6, 13.6, 2.4, 13.6, accent, hg + 1, 0.05, true, (x, y, z) => local(x, y, z)[1] > -5.4 || local(x, y, z)[1] < -9.4);
        C([-8, -7, -10], [-15, 3, -16], 1.6, 1, accent, hg);
        C([-9, -7, -9], [-18, -1, -12], 1.5, 0.9, accent, hg);
      }
      break;
    }
    case 'blond':
      E(0, -6, -1, 13.6, 13.8, 13.6, hair, hg, 0, true, cap(-5.5, 9));
      for (let i = -3; i <= 3; i++) C([i * 2.6, -13, 7], [i * 3.2, -5.2 - (i % 2 === 0 ? 0 : 1.4), 12], 2.6, 0.8, hair, hg + 1);
      if (def.build === 'slim') for (const side of [-1, 1]) C([side * 11, -4, 1], [side * 12.5, 14, -1], 3.6, 2.2, hair, hg);
      break;
    case 'topknot':
      E(0, -6, -1.4, 13, 13.4, 13, hair, hg, -0.1, true, cap(-7, 2));
      E(0, -18.5, -5, 4.2, 3.6, 4.4, hair, hg + 1, 0.05);
      C([0, -15, -6], [0, -18, -5], 2.2, 2.6, hair, hg);
      break;
    case 'mane':
      for (let i = 0; i < 15; i++) {
        const a = -Math.PI * 1.05 + (i / 14) * Math.PI * 1.1;
        C([Math.cos(a) * 6, -6 + Math.sin(a) * 6, -6], [Math.cos(a) * 22, -6 + Math.sin(a) * 17 - 2, -12 + (i % 3) * 3], 6, 1, hair, 2);
      }
      E(0, -7, -1, 13.4, 12.6, 13.4, hair, hg, 0, true, cap(-6, 4));
      for (let i = -2; i <= 2; i++) C([i * 3, -12, 8], [i * 4.4, -6, 13], 2.6, 0.8, hair, hg + 1);
      break;
    case 'flattop':
      E(0, -6, -1, 13.2, 12.6, 13.2, hair, hg, 0, true, cap(-6.5, -1));
      E(0, -15.5, -1, 12.6, 4.4, 12.6, hair, hg + 1, 0.15, true, (x, y, z) => local(x, y, z)[1] < -17.4);
      break;
    default:
      E(0, -7.5, -1.5, 13.8, 13.6, 13.8, hair, hg, 0, true, cap(-5.8, 2));
      // A lock or two falling forward over the brow.
      C([-1, -14, 9], [2.5, -6.4, 12.6], 2.6, 0.7, hair, hg + 1);
      C([2.5, -14, 8], [5.5, -7.4, 12], 2.2, 0.6, hair, hg + 1);
  }
}

function disc(x: number, y: number, rad: number): (readonly [number, number])[] {
  const pts: [number, number][] = [];
  for (let k = 0; k < 10; k++) pts.push([x + Math.cos((k / 10) * Math.PI * 2) * rad, y + Math.sin((k / 10) * Math.PI * 2) * rad]);
  return pts;
}

/** A flat polygon in one tone, over whatever is drawn. */
function fill(r: Raster, pts: readonly (readonly [number, number])[], m: number, tone: number): void {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const [x, y] of pts) {
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  }
  let any = false;
  for (let y = Math.floor(y0); y <= Math.ceil(y1); y++)
    for (let x = Math.floor(x0); x <= Math.ceil(x1); x++)
      if (inPoly(pts, x + 0.5, y + 0.5)) {
        r.dot(x, y, m, tone);
        any = true;
      }
  // A shape smaller than a pixel still shows as one.
  if (!any) r.dot((x0 + x1) / 2, (y0 + y1) / 2, m, tone);
}

/** A line `w` px either side of its centre in one tone (0 is a single pixel wide). */
function line(r: Raster, a: V3, b: V3, m: number, tone: number, w: number): void {
  const n = Math.max(1, Math.round(Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]))));
  for (let k = 0; k <= n; k++) {
    const x = a[0] + ((b[0] - a[0]) * k) / n;
    const y = a[1] + ((b[1] - a[1]) * k) / n;
    if (w <= 0) r.dot(x, y, m, tone);
    else for (let dy = -Math.ceil(w); dy <= Math.ceil(w); dy++) if (Math.abs(dy) <= w) r.dot(x, y + dy, m, tone);
  }
}

function inPoly(pts: readonly (readonly [number, number])[], x: number, y: number): boolean {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
