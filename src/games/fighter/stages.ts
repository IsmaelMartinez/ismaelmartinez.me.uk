/**
 * The twelve home stages and the two bonus yards, painted once per visit
 * into parallax layers.
 *
 * Every stage is the same machine the CPS-1 used: a sky that never moves, a
 * far layer and a middle layer scrolling at a fraction of the camera, a crowd
 * that bobs and cheers in the middle layer, and a floor that scrolls **per
 * row**, slower near the horizon and faster at the front, which is what made
 * a flat floor read as perspective (the arcade did it with its row-scroll
 * registers; here each row is one `drawImage` from a baked texture whose
 * columns are world positions). Everything is painted with whole-pixel spans
 * from `pix.ts`: materials are shaded through hue-shifted ramps (`tones`)
 * with ordered-dither transitions (`pick`), and nothing is ever blended.
 *
 * The crowd are little people (about 27 px tall), each baked at paint time
 * into four frames (standing, clapping, both arms up, one fist up) with a
 * one-pixel outline, so a frame of cheering costs one `drawImage` each. A
 * `front` layer scrolls with the middle one and is drawn after the crowd, so
 * people can stand behind a rail, a fence or a ship's guard wire.
 */
import { FLOOR_Y, SCREEN_H, SCREEN_W, STAGE_W } from './fight';
import { block, ctx2d, cylinder, disc, ellipse, fbm, fillFn, hash, line, makeCanvas, mix, outline, pick, pipe, poly, rect, sphere, tones, vgrad, vnoise } from './pix';
import type { CharId } from './roster';

export type StageId = CharId | 'car' | 'drums';

/** Parallax factors of the far and middle layers. */
const FAR_K = 0.25;
const MID_K = 0.6;
const SCROLL = STAGE_W - SCREEN_W;
const FAR_W = SCREEN_W + Math.ceil(SCROLL * FAR_K);
const MID_W = SCREEN_W + Math.ceil(SCROLL * MID_K);
/** The floor texture covers every world column any row can show. */
const TEX_OFF = 200;
const TEX_W = STAGE_W + TEX_OFF * 2;

export interface Spectator {
  x: number;
  /** Where the feet are, in the middle layer. */
  y: number;
  sprite: HTMLCanvasElement;
  phase: number;
  /** 0 to 2: how this one cheers (clapper, pumper, quick). */
  tempo: number;
}

type Live = (ctx: CanvasRenderingContext2D, midX: number, t: number) => void;

export interface StageArt {
  id: StageId;
  sky: HTMLCanvasElement;
  far: HTMLCanvasElement;
  mid: HTMLCanvasElement;
  /** Scrolls with `mid`, drawn over the crowd (rails, fences, a ship's side). */
  front?: HTMLCanvasElement;
  floor: HTMLCanvasElement;
  horizon: number;
  crowd: Spectator[];
  /** Animated touches drawn per frame over the middle layer, behind the crowd. */
  liveBack?: Live;
  /** Animated touches drawn per frame (flags, flames, water), over everything but the floor. */
  live?: Live;
}

interface CrowdSpec {
  /** The outline colour, which is the stage's darkest shadow. */
  ink: string;
  spots: readonly (readonly [number, number])[];
  look: (i: number) => Look;
}

interface Painter {
  horizon: number;
  sky: (ctx: CanvasRenderingContext2D) => void;
  far: (ctx: CanvasRenderingContext2D, w: number) => void;
  mid: (ctx: CanvasRenderingContext2D, w: number) => void;
  front?: (ctx: CanvasRenderingContext2D, w: number) => void;
  floor: (ctx: CanvasRenderingContext2D, w: number, h: number, horizon: number) => void;
  crowd?: CrowdSpec;
  liveBack?: Live;
  live?: Live;
}

/** A seeded pick from a list. */
function of<T>(list: readonly T[], n: number): T {
  return list[Math.floor(hash(n) * list.length) % list.length];
}

/** Spots for a crowd: `count` people spread over [from, to] with their feet near `y`. */
function spread(count: number, from: number, to: number, y: number, seed: number, dy = 3): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < count; i++) {
    const x = from + ((i + 0.5) / count) * (to - from) + (hash(seed + i * 3.3) - 0.5) * ((to - from) / count) * 0.6;
    out.push([Math.round(x), y + Math.round(hash(seed + i * 5.1) * dy)]);
  }
  return out;
}

// --- The crowd ---------------------------------------------------------------------

type Hat = 'cap' | 'sailor' | 'hard' | 'helmet' | 'cone' | 'turban' | 'plume' | 'bandana' | 'hood' | 'flower' | 'beret' | 'peaked' | 'cowboy';

interface Look {
  top: string;
  bottom: string;
  skin: string;
  hair: string;
  hat?: Hat;
  hatColor?: string;
  long?: boolean;
  skirt?: boolean;
  robe?: boolean;
  bald?: boolean;
  stripes?: string;
  sash?: string;
  overalls?: string;
  /** 0 to 3 extra pixels of leg. */
  tall?: number;
  sleeves?: boolean;
}

const FW = 24;
const FH = 46;
const FEET = FH - 2;
const SKINS = ['#f0c8a0', '#e8b088', '#c88a60', '#a86c44', '#7a4a2c', '#5a3420'];
const HAIRS = ['#1a1418', '#2e1e16', '#5a3418', '#8a5a2a', '#c8a050', '#6a6a70'];

function person(ctx: CanvasRenderingContext2D, L: Look, frame: number): void {
  const cx = 12;
  const T = tones(L.top, 4, 0.55, 0.36);
  const OV = L.overalls ? tones(L.overalls, 4, 0.55, 0.3) : T;
  const ST = L.stripes ? tones(L.stripes, 4, 0.45, 0.3) : T;
  const Bt = tones(L.overalls ?? L.bottom, 3, 0.5, 0.28);
  const SK = tones(L.bottom, 4, 0.55, 0.32);
  const S = tones(L.skin, 3, 0.4, 0.28);
  const H = tones(L.hair, 3, 0.5, 0.35);
  const HC = tones(L.hatColor ?? '#c83030', 4, 0.5, 0.35);
  const shoe = '#2a2026';
  const tall = L.tall ?? 1;
  const legTop = FEET - (8 + tall) + 1;
  const torsoTop = legTop - 10;
  const headTop = torsoTop - 8;
  const px = (x: number, y: number, c: string) => {
    ctx.fillStyle = c;
    ctx.fillRect(x, y, 1, 1);
  };
  const hl = (x0: number, x1: number, y: number, c: string) => {
    ctx.fillStyle = c;
    ctx.fillRect(x0, y, x1 - x0 + 1, 1);
  };

  // Lower body.
  if (L.robe) {
    for (let y = torsoTop; y <= FEET - 1; y++) {
      const half = 4 + Math.floor((y - torsoTop) / 7);
      for (let x = cx - half; x <= cx + half; x++) {
        const u = (x - (cx - half)) / (2 * half);
        const fold = y > legTop && (x - cx + 9) % 3 === 0 ? -0.22 : 0;
        px(x, y, pick(T, 0.95 - u * 0.85 + fold, x, y));
      }
    }
    hl(cx - 3, cx - 1, FEET, shoe);
    hl(cx + 1, cx + 3, FEET, shoe);
  } else {
    for (let y = legTop; y <= FEET - 2; y++) {
      if (L.skirt) {
        hl(cx - 2, cx - 1, y, S[1]);
        hl(cx + 1, cx + 2, y, S[0]);
      } else {
        px(cx - 3, y, Bt[2]);
        hl(cx - 2, cx - 1, y, Bt[1]);
        hl(cx + 1, cx + 2, y, Bt[0]);
        px(cx + 3, y, y % 3 ? Bt[0] : Bt[1]);
      }
    }
    hl(cx - 4, cx - 1, FEET - 1, shoe);
    hl(cx - 4, cx - 1, FEET, shoe);
    hl(cx + 1, cx + 4, FEET - 1, shoe);
    hl(cx + 1, cx + 4, FEET, shoe);
    px(cx - 4, FEET - 1, '#4a3a40');
    if (L.skirt) {
      for (let y = legTop - 1; y <= legTop + 5; y++) {
        const half = 4 + Math.floor((y - legTop + 1) / 2);
        for (let x = cx - half; x <= cx + half; x++) px(x, y, pick(SK, 0.95 - ((x - cx + half) / (2 * half)) * 0.85 - (y === legTop + 5 ? 0.25 : 0), x, y));
      }
    }
  }

  // Torso.
  if (!L.robe) {
    for (let y = torsoTop; y < legTop; y++) {
      for (let x = cx - 4; x <= cx + 4; x++) {
        if (y === torsoTop && (x === cx - 4 || x === cx + 4)) continue;
        const u = (x - cx + 4) / 8;
        const v = 0.98 - u * 0.78 - (y === legTop - 1 ? 0.3 : 0);
        let ramp = T;
        if (L.stripes && (y - torsoTop) % 3 === 2) ramp = ST;
        if (L.overalls && (y >= torsoTop + 4 || x === cx - 3 || x === cx + 3)) ramp = OV;
        px(x, y, pick(ramp, v, x, y));
      }
    }
  }
  if (L.sash) {
    line(ctx, cx - 4, torsoTop + 1, cx + 3, legTop + 1, L.sash);
    line(ctx, cx - 3, torsoTop + 1, cx + 4, legTop + 1, mix(L.sash, '#000000', 0.25));
  }
  // Neck and collar.
  hl(cx - 1, cx + 1, torsoTop - 1, S[0]);
  if (!L.robe && !L.overalls) px(cx, torsoTop, S[1]);

  // Head.
  for (let r = 0; r < 7; r++) {
    const ins = r === 0 || r === 6 ? 1 : 0;
    const y = headTop + r;
    for (let x = cx - 3 + ins; x <= cx + 3 - ins; x++) {
      let c = x === cx - 3 + ins ? S[2] : x >= cx + 2 - ins ? S[0] : S[1];
      if (r === 6 && x > cx - 2) c = S[0];
      px(x, y, c);
    }
  }
  px(cx - 1, headTop + 3, '#1a1018');
  px(cx + 1, headTop + 3, '#1a1018');
  if (frame === 2) hl(cx - 1, cx, headTop + 5, '#6a1a1a');

  // Hair.
  const covered = L.hat === 'hood' || L.hat === 'helmet' || L.hat === 'turban';
  if (!L.bald && !covered) {
    hl(cx - 2, cx + 2, headTop - 1, H[1]);
    hl(cx - 3, cx + 3, headTop, H[1]);
    px(cx - 1, headTop - 1, H[2]);
    px(cx - 2, headTop, H[2]);
    hl(cx - 3, cx - 1, headTop + 1, H[0]);
    hl(cx + 1, cx + 3, headTop + 1, H[0]);
    px(cx - 3, headTop + 2, H[0]);
    px(cx + 3, headTop + 2, H[0]);
    if (L.long) {
      for (let y = headTop + 1; y <= torsoTop + 3; y++) {
        px(cx - 4, y, H[1]);
        px(cx + 4, y, H[0]);
        if (y > headTop + 2 && y < torsoTop) {
          px(cx - 3, y, H[1]);
          px(cx + 3, y, H[0]);
        }
      }
    }
  } else if (L.bald && !covered) {
    px(cx - 2, headTop + 1, mix(S[2], '#ffffff', 0.3));
  }

  // Arms.
  const sleeveL = [T[3], T[2]];
  const sleeveR = [T[1], T[0]];
  const skinL = [S[2], S[1]];
  const skinR = [S[1], S[0]];
  const long = L.sleeves ?? (L.robe || L.hat === 'hood');
  const armDown = (side: number) => {
    const x = side < 0 ? cx - 6 : cx + 5;
    const cs = side < 0 ? sleeveL : sleeveR;
    const ks = side < 0 ? skinL : skinR;
    for (let y = torsoTop + 1; y <= torsoTop + 8; y++) {
      const sl = long || y <= torsoTop + 3;
      px(x, y, sl ? cs[0] : ks[0]);
      px(x + 1, y, sl ? cs[1] : ks[1]);
    }
    hl(x, x + 1, torsoTop + 9, ks[1]);
  };
  const armUp = (side: number) => {
    const xs = side < 0 ? cx - 6 : cx + 5;
    const cs = side < 0 ? sleeveL : sleeveR;
    const ks = side < 0 ? skinL : skinR;
    for (let y = torsoTop - 7; y <= torsoTop + 1; y++) {
      const x = xs + (y < torsoTop - 3 ? side : 0);
      const sl = long ? y >= torsoTop - 5 : y >= torsoTop - 1;
      px(x, y, sl ? cs[0] : ks[0]);
      px(x + 1, y, sl ? cs[1] : ks[1]);
    }
    const fx = xs + side + (side < 0 ? -1 : 0);
    for (let y = torsoTop - 10; y <= torsoTop - 8; y++) hl(fx, fx + 2, y, y === torsoTop - 10 ? ks[0] : ks[1]);
  };
  const armClap = (side: number) => {
    const x = side < 0 ? cx - 6 : cx + 5;
    const cs = side < 0 ? sleeveL : sleeveR;
    const ks = side < 0 ? skinL : skinR;
    for (let y = torsoTop + 1; y <= torsoTop + 4; y++) {
      px(x, y, cs[0]);
      px(x + 1, y, cs[1]);
    }
    for (let y = torsoTop + 4; y <= torsoTop + 5; y++) {
      if (side < 0) hl(cx - 5, cx - 2, y, long ? cs[0] : ks[0]);
      else hl(cx + 2, cx + 5, y, long ? cs[1] : ks[1]);
    }
  };
  if (frame === 0) {
    armDown(-1);
    armDown(1);
  } else if (frame === 1) {
    armClap(-1);
    armClap(1);
    for (let y = torsoTop + 2; y <= torsoTop + 5; y++) hl(cx - 1, cx + 1, y, y === torsoTop + 2 ? S[2] : S[1]);
  } else if (frame === 2) {
    armUp(-1);
    armUp(1);
  } else {
    armUp(-1);
    armDown(1);
  }

  // Hats.
  const hat = L.hat;
  if (hat === 'cap' || hat === 'peaked') {
    hl(cx - 2, cx + 2, headTop - 2, HC[2]);
    hl(cx - 3, cx + 3, headTop - 1, HC[2]);
    hl(cx - 3, cx + 3, headTop, HC[1]);
    px(cx - 2, headTop - 1, HC[3]);
    hl(cx - 4, cx + (hat === 'peaked' ? 4 : 2), headTop + 1, hat === 'peaked' ? '#1a1a22' : HC[0]);
    if (hat === 'peaked') hl(cx - 1, cx + 1, headTop - 1, '#e8c040');
  } else if (hat === 'sailor') {
    hl(cx - 3, cx + 3, headTop - 3, '#e8ecf4');
    hl(cx - 4, cx + 4, headTop - 2, '#f8f8ff');
    hl(cx - 4, cx + 4, headTop - 1, '#d0d4e4');
    hl(cx - 3, cx + 3, headTop, '#2a3a7a');
    px(cx - 3, headTop - 2, '#ffffff');
  } else if (hat === 'hard') {
    hl(cx - 2, cx + 2, headTop - 3, HC[2]);
    hl(cx - 3, cx + 3, headTop - 2, HC[2]);
    hl(cx - 3, cx + 3, headTop - 1, HC[1]);
    px(cx - 2, headTop - 2, HC[3]);
    px(cx - 1, headTop - 3, HC[3]);
    hl(cx - 5, cx + 5, headTop, HC[0]);
  } else if (hat === 'helmet') {
    hl(cx - 2, cx + 2, headTop - 2, HC[2]);
    for (let y = headTop - 1; y <= headTop + 2; y++) {
      hl(cx - 4, cx + 4, y, HC[1]);
      px(cx - 4, y, HC[2]);
      px(cx + 4, y, HC[0]);
    }
    px(cx - 2, headTop - 1, HC[3]);
    hl(cx - 4, cx + 4, headTop + 2, HC[0]);
  } else if (hat === 'cone') {
    for (let r = 0; r < 6; r++) {
      const half = [0, 1, 2, 4, 5, 7][r];
      const y = headTop - 4 + r;
      for (let x = cx - half; x <= cx + half; x++) px(x, y, pick(HC, 0.9 - ((x - cx + half) / (2 * half + 1)) * 0.7 - (r === 5 ? 0.25 : 0), x, y));
    }
  } else if (hat === 'turban') {
    for (let y = headTop - 3; y <= headTop + 1; y++) {
      const ins = y === headTop - 3 ? 2 : 0;
      for (let x = cx - 4 + ins; x <= cx + 4 - ins; x++) px(x, y, (x + y) % 3 === 0 ? HC[3] : x > cx + 1 ? HC[1] : HC[2]);
    }
    px(cx, headTop - 1, '#d82828');
    px(cx, headTop - 2, '#f8e040');
  } else if (hat === 'plume') {
    hl(cx - 3, cx + 3, headTop - 1, '#f0c840');
    px(cx, headTop - 2, '#f84070');
    for (const dx of [-7, -4, -1, 2, 5]) {
      const tx = cx + dx;
      const ty = headTop - 13 + Math.abs(dx) / 2;
      line(ctx, cx + Math.sign(dx), headTop - 2, tx, ty, HC[2]);
      line(ctx, cx + Math.sign(dx) + 1, headTop - 2, tx + 1, ty, HC[3]);
      px(tx, ty - 1, '#ffffff');
      px(tx + 1, ty, '#ffffff');
    }
  } else if (hat === 'bandana') {
    hl(cx - 3, cx + 3, headTop + 1, HC[2]);
    hl(cx - 3, cx + 3, headTop, HC[1]);
    px(cx + 4, headTop + 1, HC[1]);
    px(cx + 5, headTop + 2, HC[0]);
  } else if (hat === 'flower') {
    px(cx + 3, headTop - 1, '#f82838');
    px(cx + 4, headTop, '#f82838');
    px(cx + 3, headTop, '#b81020');
    px(cx + 2, headTop - 1, '#f86878');
  } else if (hat === 'beret') {
    hl(cx - 3, cx + 4, headTop - 1, HC[1]);
    hl(cx - 4, cx + 3, headTop, HC[2]);
    px(cx, headTop - 2, HC[1]);
  } else if (hat === 'cowboy') {
    hl(cx - 2, cx + 2, headTop - 3, HC[2]);
    hl(cx - 3, cx + 3, headTop - 2, HC[1]);
    hl(cx - 3, cx + 3, headTop - 1, '#3a2010');
    hl(cx - 6, cx + 6, headTop, HC[0]);
    px(cx - 6, headTop - 1, HC[0]);
    px(cx + 6, headTop - 1, HC[0]);
  } else if (hat === 'hood') {
    for (let y = headTop - 1; y <= torsoTop + 1; y++) {
      const half = y === headTop - 1 ? 3 : 4 + (y > torsoTop - 2 ? 1 : 0);
      for (let x = cx - half; x <= cx + half; x++) {
        const face = y >= headTop + 2 && y <= headTop + 6 && x >= cx - 2 && x <= cx + 2;
        px(x, y, face ? '#1a1014' : pick(T, 0.9 - ((x - cx + half) / (2 * half)) * 0.8, x, y));
      }
    }
    px(cx - 1, headTop + 3, '#f8d040');
    px(cx + 1, headTop + 3, '#f8d040');
  }
}

/** Bake one spectator's four frames, outlined in the stage's ink. */
function spectatorSprite(L: Look, ink: string): HTMLCanvasElement {
  const c = makeCanvas(FW * 4, FH);
  const ctx = ctx2d(c);
  for (let f = 0; f < 4; f++) {
    ctx.save();
    ctx.translate(f * FW, 0);
    person(ctx, L, f);
    ctx.restore();
  }
  outline(c, ink);
  return c;
}

/** A crowd member with seeded everyday clothes, overridable piecemeal. */
function folk(i: number, tops: readonly string[], bottoms: readonly string[], extra: Partial<Look> = {}, skins = SKINS): Look {
  const woman = hash(i * 9.7 + 2) < 0.4;
  return {
    top: of(tops, i * 3.1 + 1),
    bottom: of(bottoms, i * 5.3 + 2),
    skin: of(skins, i * 7.7 + 3),
    hair: of(HAIRS, i * 11.1 + 4),
    long: woman,
    skirt: woman && hash(i * 4.4) < 0.5,
    tall: woman ? Math.floor(hash(i * 2.2) * 2) : 1 + Math.floor(hash(i * 2.2) * 3),
    ...extra
  };
}

function drawSpectator(ctx: CanvasRenderingContext2D, s: Spectator, x: number, t: number, excite: number): void {
  if (x < -14 || x > SCREEN_W + 14) return;
  const hot = excite > 0.3;
  const beat = Math.floor((t + s.phase) / (hot ? 6 + s.tempo : 13 + s.tempo * 4));
  let frame = 0;
  let lift = 0;
  if (hot) {
    frame = beat % 2 ? 2 : s.tempo === 1 ? 3 : 1;
    lift = beat % 2 ? 2 : 0;
  } else {
    const k = (beat + s.phase) % 7;
    frame = k === 3 ? (s.tempo === 1 ? 3 : 1) : k === 4 && s.tempo === 2 ? 1 : 0;
    lift = k === 3 && s.tempo === 0 ? 1 : 0;
  }
  ctx.drawImage(s.sprite, frame * FW, 0, FW, FH, Math.round(x) - 12, s.y - FEET - lift, FW, FH);
}

// --- Skies -----------------------------------------------------------------------------

function stars(ctx: CanvasRenderingContext2D, w: number, h: number, n: number, seed: number, dim: string, bright: string): void {
  for (let i = 0; i < n; i++) {
    const x = Math.floor(hash(seed + i * 1.7) * w);
    const y = Math.floor(Math.pow(hash(seed + i * 2.9), 1.4) * h);
    rect(ctx, x, y, 1, 1, hash(i * 3.3 + seed) > 0.8 ? bright : dim);
  }
  for (let i = 0; i < n / 10; i++) {
    const x = Math.floor(hash(seed + i * 7.1 + 50) * w);
    const y = Math.floor(hash(seed + i * 4.3 + 50) * h * 0.7);
    rect(ctx, x - 1, y, 3, 1, bright);
    rect(ctx, x, y - 1, 1, 3, bright);
  }
}

/** A halo: rings of `ramp` (outer first) fading out by dither into whatever is behind. */
function halo(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, ramp: readonly string[]): void {
  const n = ramp.length;
  fillFn(ctx, cx - r, cy - r, r * 2 + 1, r * 2 + 1, (px, py) => {
    const d = Math.hypot(px + 0.5 - cx, py + 0.5 - cy) / r;
    if (d >= 1) return null;
    const f = (1 - d) * n;
    const k = Math.floor(f);
    const fr = f - k;
    const thr = [0.125, 0.625, 0.875, 0.375][(py & 1) * 2 + (px & 1)];
    if (k === 0) return fr > thr ? ramp[0] : null;
    return fr > thr ? ramp[Math.min(n - 1, k)] : ramp[k - 1];
  });
}

/**
 * A cloud bank of lumpy blobs with a flat underside, lit from `lx` (-1 left
 * to 1 right) and from above; `ramp` runs shadow to highlight.
 */
function cloud(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, ramp: readonly string[], seed: number, lx = -0.4): void {
  const blobs: [number, number, number, number][] = [];
  const n = Math.max(3, Math.round(w / (h * 0.9)));
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n;
    const mid = 1 - Math.pow(u * 2 - 1, 2);
    const rx = h * (0.55 + hash(seed + i) * 0.5);
    const ry = h * (0.35 + mid * 0.5 + hash(seed + i * 2.3) * 0.2);
    blobs.push([x + u * w, y + h - ry * 0.7, rx, ry]);
  }
  const base = y + h;
  fillFn(ctx, x - h * 1.2, y - h * 0.6, w + h * 2.4, h * 1.7, (px, py) => {
    if (py > base) return null;
    let best = -2;
    for (const [bx, by, rx, ry] of blobs) {
      const dx = (px + 0.5 - bx) / rx;
      const dy = (py + 0.5 - by) / ry;
      const d = dx * dx + dy * dy;
      if (d > 1) continue;
      const nz = Math.sqrt(1 - d);
      const v = -dy * 0.55 + dx * lx * 0.4 + nz * 0.35;
      if (v > best) best = v;
    }
    if (best < -1.5) return null;
    const flat = (base - py) / h;
    return pick(ramp, 0.15 + best * 0.6 + flat * 0.3, px, py);
  });
}

/** Long flat streaks of cloud, lit along their lower edge (sunset) or upper edge. */
function streaks(ctx: CanvasRenderingContext2D, w: number, y0: number, y1: number, ramp: readonly string[], seed: number, below = true): void {
  for (let i = 0; i < 9; i++) {
    const y = Math.round(y0 + hash(seed + i) * (y1 - y0));
    const len = 40 + hash(seed + i * 2.1) * 120;
    const x = hash(seed + i * 3.7) * (w + 60) - 30;
    const th = 2 + Math.floor(hash(seed + i * 5.3) * 4);
    fillFn(ctx, x, y, len, th, (px, py) => {
      const u = (px - x) / len;
      const edge = Math.abs(u * 2 - 1);
      const lim = th * (1 - edge * edge);
      if (py - y >= lim) return null;
      const lit = below ? (py - y) / th : 1 - (py - y) / th;
      return pick(ramp, lit * 0.9 + (1 - edge) * 0.2, px, py);
    });
  }
}

/** A ridge line of heights from layered value noise. */
function ridge(w: number, height: number, seed: number, scale: number): number[] {
  const out: number[] = [];
  for (let x = 0; x < w + 2; x++) out.push(height * (0.25 + 0.75 * fbm(x / scale, 0.5, seed)));
  return out;
}

/** Shaded hills: slopes facing the light are brighter, a haze `fog` dithers in at the base. */
function hills(ctx: CanvasRenderingContext2D, w: number, base: number, height: number, ramp: readonly string[], seed: number, scale = 40, fog?: string, light = -1): void {
  const hs = ridge(w, height, seed, scale);
  fillFn(ctx, 0, base - height - 2, w, height + 2, (px, py) => {
    const top = base - hs[px];
    if (py < top) return null;
    const slope = (hs[px + 1] - hs[Math.max(0, px - 1)]) * -light;
    let v = 0.5 + slope * 0.35 - ((py - top) / height) * 0.35 + (fbm(px / 9, py / 7, seed) - 0.5) * 0.3;
    if (py - top < 1) v += 0.25;
    const c = pick(ramp, v, px, py);
    if (fog) {
      const f = 1 - (base - py) / (height * 0.5);
      if (f > 0 && f * 1.1 > [0.125, 0.625, 0.875, 0.375][(py & 1) * 2 + (px & 1)]) return fog;
    }
    return c;
  });
}

// --- Props -------------------------------------------------------------------------------

/** Paint something on a scratch layer, ring it with an outline, and lay it down. */
function inked(ctx: CanvasRenderingContext2D, ink: string, draw: (g: CanvasRenderingContext2D) => void): void {
  const tmp = makeCanvas(ctx.canvas.width, ctx.canvas.height);
  draw(ctx2d(tmp));
  outline(tmp, ink);
  ctx.drawImage(tmp, 0, 0);
}

/**
 * A curved east-asian roof seen from the front: a ridge, a tiled face whose
 * channels catch the light, and eaves that turn up at the ends.
 */
function eaveRoof(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, ramp: readonly string[], ridgeRamp: readonly string[], under: string, flare = h * 0.7, lift = Math.max(3, h * 0.3)): void {
  const cx = x + w / 2;
  const eave = (px: number) => {
    const s = Math.max(0, (Math.abs(px + 0.5 - cx) - w / 2) / flare);
    return y + h - lift * s * s;
  };
  const half = (py: number) => w / 2 + flare * Math.min(1, Math.pow(Math.max(0, (py - y) / (h - lift * 0.6)), 1.2));
  fillFn(ctx, x - flare - 2, y - 4, w + flare * 2 + 4, h + 8, (px, py) => {
    const ax = Math.abs(px + 0.5 - cx);
    const e = eave(px);
    if (py >= y && py <= e && ax <= half(py)) {
      const t = (py - y) / h;
      if (py > e - 1) return ramp[0];
      if (py > e - 2) return (px & 3) === 1 ? ramp[ramp.length - 1] : ramp[2];
      const k = (px - Math.round(x)) & 3;
      let v = 0.62 - t * 0.25 + (k === 0 ? 0.3 : k === 3 ? -0.3 : 0);
      if ((py - y) % 4 === 3) v -= 0.22;
      return pick(ramp, v, px, py);
    }
    if (py > e && py <= e + 2 && ax <= w / 2 + flare * 0.85) return py === Math.ceil(e) + 1 && (px & 1) ? mix(under, '#ffffff', 0.12) : under;
    if (py >= y - 4 && py < y && ax <= w / 2 + 2) return pick(ridgeRamp, 0.9 - (py - y + 4) / 4, px, py);
    return null;
  });
  // Ornaments at the ridge ends.
  for (const s of [-1, 1]) {
    const ox = cx + s * (w / 2 + 1);
    poly(ctx, [[ox - 2, y - 2], [ox + s * 4, y - 9], [ox + s * 6, y - 7], [ox + s * 2, y - 1]], ridgeRamp[0]);
    rect(ctx, ox + s * 4 - (s < 0 ? 1 : 0), y - 9, 2, 1, ridgeRamp[ridgeRamp.length - 1]);
  }
}

function paperLantern(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, ramp: readonly string[], cap = '#1a1010', glyph = true): void {
  rect(ctx, x, y - ry - 8, 1, 6, '#2a1a10');
  fillFn(ctx, x - rx - 1, y - ry - 1, rx * 2 + 3, ry * 2 + 3, (px, py) => {
    const dx = (px + 0.5 - x) / rx;
    const dy = (py + 0.5 - y) / ry;
    const d = dx * dx + dy * dy;
    if (d > 1) return null;
    let v = 0.9 - d * 0.55 - dx * 0.25;
    if ((py - Math.round(y - ry)) % 3 === 0) v -= 0.3;
    return pick(ramp, v, px, py);
  });
  rect(ctx, x - Math.ceil(rx * 0.5), y - ry - 2, Math.ceil(rx) + 1, 2, cap);
  rect(ctx, x - Math.ceil(rx * 0.5), y + ry, Math.ceil(rx) + 1, 2, cap);
  rect(ctx, x, y + ry + 2, 1, 4, ramp[1]);
  if (glyph && rx >= 4) {
    rect(ctx, x - 1, y - 2, 3, 1, cap);
    rect(ctx, x, y - 3, 1, 5, cap);
    rect(ctx, x - 1, y + 2, 3, 1, cap);
  }
}

/** Abstract brush glyphs (not any real script) in a column of cells. */
function glyphs(ctx: CanvasRenderingContext2D, x: number, y: number, cw: number, ch: number, n: number, color: string, seed: number, gap = 2, th = 1): void {
  for (let g = 0; g < n; g++) {
    const gy = y + g * (ch + gap);
    const s = seed + g * 17;
    const strokes = 3 + Math.floor(hash(s) * 3);
    for (let k = 0; k < strokes; k++) {
      const kind = Math.floor(hash(s + k * 3.1) * 4);
      const a = hash(s + k * 5.7);
      const b = hash(s + k * 7.3);
      if (kind === 0) rect(ctx, x + Math.floor(a * cw * 0.3), gy + Math.floor(b * (ch - th)), Math.ceil(cw * (0.6 + a * 0.4)) - th, th, color);
      else if (kind === 1) rect(ctx, x + Math.floor(a * (cw - th)), gy + Math.floor(b * ch * 0.3), th, Math.ceil(ch * (0.5 + b * 0.5)) - th, color);
      else if (kind === 2) line(ctx, x + a * (cw - th), gy + ch * 0.2, x + (1 - a) * cw * 0.8, gy + ch - th, color, th);
      else rect(ctx, x + Math.floor(a * (cw - 2)), gy + Math.floor(b * (ch - 2)), 2, 2, color);
    }
    rect(ctx, x + 1, gy + Math.floor(ch / 2), cw - 2, th, color);
  }
}

function barrel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, ramp: readonly string[], hoop: readonly string[]): void {
  fillFn(ctx, x - 1, y, w + 2, h, (px, py) => {
    const t = (py - y) / h;
    const bulge = Math.sin(t * Math.PI) * 1.2;
    const u = (px + 0.5 - x + bulge) / (w + bulge * 2);
    if (u < 0 || u > 1) return null;
    const nz = Math.sqrt(Math.max(0, 1 - (u * 2 - 1) ** 2));
    let v = 0.85 * nz - (u - 0.5) * 0.5;
    const r = py - y;
    if (r === 2 || r === 3 || r === h - 3 || r === h - 4 || Math.abs(r - h / 2) < 1) return pick(hoop, v, px, py);
    if (Math.round(u * w) % 4 === 0) v -= 0.2;
    return pick(ramp, v, px, py);
  });
  ellipse(ctx, x + w / 2, y + 1, w / 2, 1.5, ramp[1]);
}

function drum(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, ramp: readonly string[]): void {
  cylinder(ctx, x, y, w, h, ramp);
  for (const r of [3, Math.round(h / 2) - 1, h - 4]) {
    fillFn(ctx, x, y + r, w, 1, px => pick(ramp, 0.95 - ((px - x) / w) * 0.9, px, 0));
    rect(ctx, x, y + r + 1, w, 1, ramp[0]);
  }
  ellipse(ctx, x + w / 2, y + 1, w / 2, 2, ramp[ramp.length - 1]);
  ellipse(ctx, x + w / 2, y + 1, w / 2 - 2, 1, ramp[1]);
}

function crate(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, ramp: readonly string[]): void {
  fillFn(ctx, x, y, w, h, (px, py) => {
    const lx = px - x;
    const ly = py - y;
    if (lx < 2 || lx >= w - 2 || ly < 2 || ly >= h - 2) return pick(ramp, lx < 1 || ly < 1 ? 0.95 : lx >= w - 1 || ly >= h - 1 ? 0.15 : 0.7, px, py);
    const d1 = Math.abs(lx * (h / w) - ly);
    if (d1 < 1.6) return pick(ramp, 0.62, px, py);
    if ((ly - 2) % 5 === 4) return ramp[1];
    return pick(ramp, 0.45 + (vnoise(lx / 6, ly + y, x) - 0.5) * 0.3, px, py);
  });
}

/** A diamond chain-link mesh, every pixel opaque. */
function mesh(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, wire: string, dark: string, cell = 6): void {
  fillFn(ctx, x, y, w, h, (px, py) => {
    const a = (((px + py) % cell) + cell) % cell;
    const b = (((px - py) % cell) + cell) % cell;
    if (a === 0 || b === 0) return (px + py) % 3 ? wire : dark;
    return null;
  });
}

function palm(ctx: CanvasRenderingContext2D, x: number, base: number, h: number, lean: number, trunk: readonly string[], leaf: readonly string[]): void {
  let tx = x;
  for (let i = 0; i < h; i++) {
    const t = i / h;
    tx = x + lean * t * t * h * 0.5;
    const wd = Math.max(3, Math.round(6 - t * 3));
    for (let k = 0; k < wd; k++) rect(ctx, Math.round(tx) + k - (wd >> 1), base - i, 1, 1, pick(trunk, 0.9 - (k / wd) * 0.8 - (i % 4 === 0 ? 0.3 : 0), k, i));
  }
  const top: [number, number] = [Math.round(tx), base - h];
  const fronds = [-2.9, -2.45, -2.0, -1.5, -1.05, -0.6, -0.2, 0.25];
  for (const a0 of fronds) {
    const len = 26 + hash(a0 * 9 + x) * 10;
    let px = top[0];
    let py = top[1];
    let a = a0;
    for (let s = 0; s < len; s++) {
      a += (Math.cos(a) > 0 ? 1 : -1) * 0.035;
      px += Math.cos(a);
      py += Math.sin(a) * 0.7 + s * 0.022;
      const shade = Math.sin(a) < -0.5 ? 0.85 : 0.5;
      rect(ctx, Math.round(px), Math.round(py), 1, 2, pick(leaf, shade, s, 0));
      if (s > 3 && s % 2 === 0) {
        const ll = 5 - s / len * 3;
        line(ctx, px, py + 1, px - Math.sin(a) * ll * 0.4 + Math.cos(a) * 1.5, py + ll, leaf[Math.max(0, Math.floor(shade * (leaf.length - 1)) - 1)]);
      }
    }
  }
  disc(ctx, top[0], top[1] + 2, 3, trunk[0]);
  disc(ctx, top[0] - 2, top[1] + 4, 2, '#6a4a20');
  disc(ctx, top[0] + 2, top[1] + 4, 2, '#5a3a18');
}

/** A round broad-leaved tree crown out of lit clumps. */
function canopy(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, ramp: readonly string[], seed: number): void {
  const clumps: [number, number, number][] = [];
  for (let i = 0; i < 9; i++) {
    const a = hash(seed + i) * Math.PI * 2;
    const d = hash(seed + i * 2.7) * r * 0.6;
    clumps.push([cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.7, r * (0.4 + hash(seed + i * 4.1) * 0.25)]);
  }
  clumps.sort((p, q) => p[1] - q[1]);
  for (const [x, y, rr] of clumps) {
    fillFn(ctx, x - rr - 1, y - rr - 1, rr * 2 + 3, rr * 2 + 3, (px, py) => {
      const dx = (px + 0.5 - x) / rr;
      const dy = (py + 0.5 - y) / rr;
      const d = dx * dx + dy * dy;
      const n = fbm(px / 4, py / 4, seed);
      if (d > 0.75 + n * 0.5) return null;
      return pick(ramp, 0.7 - dy * 0.35 - dx * 0.2 - d * 0.25 + (n - 0.5) * 0.5, px, py);
    });
  }
}

/** A plain stone or plaster wall with blocks and wear. */
function stoneWall(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, ramp: readonly string[], mortar: string, bw: number, bh: number, seed: number): void {
  fillFn(ctx, x, y, w, h, (px, py) => {
    const row = Math.floor((py - y) / bh);
    const off = row % 2 ? bw / 2 : 0;
    const col = Math.floor((px - x + off) / bw);
    const lx = (px - x + off) % bw;
    const ly = (py - y) % bh;
    if (ly === bh - 1 || lx === bw - 1) return mortar;
    const tint = hash(seed + row * 31 + col * 7);
    let v = 0.5 + (tint - 0.5) * 0.35 + (fbm(px / 7, py / 7, seed) - 0.5) * 0.4;
    if (ly === 0) v += 0.25;
    if (lx === 0) v += 0.12;
    if (ly === bh - 2) v -= 0.2;
    return pick(ramp, v, px, py);
  });
}

/** Rough plaster: noise-shaded with the odd crack and bare patch. */
function plaster(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, ramp: readonly string[], seed: number, light = (_px: number, _py: number) => 0, amp = 0.55): void {
  fillFn(ctx, x, y, w, h, (px, py) => {
    const n = fbm(px / 11, py / 9, seed);
    const v = 0.55 + (n - 0.5) * amp + light(px, py) + (hash(px * 3.3 + py * 7.1) - 0.5) * 0.12;
    return pick(ramp, v, px, py);
  });
}

/** Corrugated sheet metal, ribs running down. */
function corrugated(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, ramp: readonly string[], seed: number, pitch = 4): void {
  fillFn(ctx, x, y, w, h, (px, py) => {
    const k = (px - Math.round(x)) % pitch;
    let v = [0.75, 0.55, 0.35, 0.2][Math.min(3, Math.floor((k / pitch) * 4))];
    v += (fbm(px / 20, py / 14, seed) - 0.5) * 0.35;
    if ((py - y) % 40 === 0) v -= 0.3;
    return pick(ramp, v, px, py);
  });
}

// --- Floors -------------------------------------------------------------------------

/** World depth of a floor row (1 at the fighters' feet, larger toward the horizon). */
function zOf(ry: number, hor: number): number {
  return 1 / (0.55 + (0.45 * ry) / (FLOOR_Y - hor));
}

interface Rows {
  row: number[];
  v: number[];
  size: number[];
  first: boolean[];
  last: boolean[];
}

/** Slice the floor into bands of equal world depth `d`, which come out thinner toward the horizon. */
function depthRows(h: number, hor: number, d: number): Rows {
  const z0 = zOf(0, hor);
  const row: number[] = [];
  const v: number[] = [];
  for (let ry = 0; ry < h; ry++) {
    const q = (z0 - zOf(ry, hor)) / d;
    row.push(Math.floor(q));
    v.push(q - Math.floor(q));
  }
  const count = new Map<number, number>();
  for (const r of row) count.set(r, (count.get(r) ?? 0) + 1);
  return {
    row,
    v,
    size: row.map(r => count.get(r) ?? 1),
    first: row.map((r, i) => i > 0 && row[i - 1] !== r),
    last: row.map((r, i) => i < h - 1 && row[i + 1] !== r)
  };
}

interface PlankOpts {
  ramp: readonly string[];
  gap: string;
  d?: number;
  len?: number;
  seed?: number;
  nail?: string;
  /** Wet sheen: a glint tone dithered over random patches. */
  wet?: string;
  /** Boards running into the screen instead of across it. */
  along?: number;
}

function plankFloor(ctx: CanvasRenderingContext2D, w: number, h: number, hor: number, o: PlankOpts): void {
  const d = o.d ?? 0.07;
  const len = o.len ?? 96;
  const seed = o.seed ?? 1;
  const R = depthRows(h, hor, d);
  fillFn(ctx, 0, 0, w, h, (x, ry) => {
    const row = R.row[ry];
    const v = R.v[ry];
    const far = ry < h * 0.3;
    let val: number;
    if (o.along) {
      const bw = o.along;
      const board = Math.floor(x / bw);
      const u = x - board * bw;
      if (u < (far ? 2 : 1)) return o.gap;
      const joint = (row + Math.floor(hash(board * 3.7 + seed) * 5)) % 5 === 0;
      if (joint && R.first[ry]) return o.gap;
      const b = hash(board * 13.1 + Math.floor((row + Math.floor(hash(board * 3.7 + seed) * 5)) / 5) * 2.3 + seed);
      val = 0.44 + (b - 0.5) * 0.32;
      const streak = (u / bw + vnoise(x / 3, ry / 9 + row * 0.7, seed) * 0.9) % 0.34;
      if (streak < 0.05) val -= 0.2;
      if (u === (far ? 2 : 1)) val += 0.2;
      if (u === bw - 1) val -= 0.2;
      if (o.nail && R.size[ry] >= 3 && joint && (R.v[ry] * R.size[ry] >= 1 && R.v[ry] * R.size[ry] < 2) && (u === 3 || u === bw - 3)) return o.nail;
    } else {
      if (R.first[ry]) return o.gap;
      const off = Math.floor(hash(row * 7.31 + seed) * len);
      const xx = x + off;
      const seg = Math.floor(xx / len);
      const u = xx - seg * len;
      const jw = far ? 2 : 1;
      if (u < jw) return o.gap;
      const b = hash(row * 13.7 + seg * 3.1 + seed);
      val = 0.44 + (b - 0.5) * 0.32;
      const g = vnoise(xx / 34, row * 3.3, seed);
      const streak = (v * 2.6 + g * 2.4 + hash(seg * 5.5 + row)) % 1;
      if (streak < 0.1) val -= 0.13;
      else if (streak > 0.94) val += 0.08;
      const kx = hash(seg * 9.1 + row * 4.4 + seed) * len;
      if (Math.abs(u - kx) < 3 && Math.abs(v - 0.5) < 0.25 && hash(seg + row * 2.2) < 0.4) val -= 0.35;
      if (ry > 0 && R.first[ry - 1]) val += 0.24;
      if (R.last[ry]) val -= 0.22;
      if (u === jw) val += 0.12;
      if (u === len - 1) val -= 0.15;
      const sz = R.size[ry];
      if (o.nail && sz >= 4) {
        const ny = Math.floor(v * sz);
        if ((u === jw + 2 || u === len - 3) && (ny === 1 || ny === sz - 2)) return o.nail;
      }
    }
    val -= (1 - ry / h) * 0.14;
    if (o.wet) {
      const n = fbm(x / 30, ry / 4 + 3, seed + 3);
      if (n > 0.64) {
        const sh = (n - 0.64) * 5;
        if (sh > 0.75 && hash(x * 3.7 + ry * 11.1) > 0.8) return o.wet;
        val += Math.min(0.3, sh * 0.4);
      }
    }
    return pick(o.ramp, val, x, ry);
  });
}

interface TileOpts {
  ramp: readonly string[];
  grout: string;
  tw: number;
  d: number;
  seed?: number;
  stagger?: boolean;
  /** A second ramp for alternate tiles, a checkerboard. */
  alt?: readonly string[];
  crack?: string;
  moss?: readonly string[];
  wear?: number;
  /** Per-pixel decoration over a tile: (u, v, col, row, px-height) to a colour or null. */
  inlay?: (u: number, v: number, col: number, row: number, sz: number) => string | null;
  shine?: string;
}

function tileFloor(ctx: CanvasRenderingContext2D, w: number, h: number, hor: number, o: TileOpts): void {
  const seed = o.seed ?? 1;
  const R = depthRows(h, hor, o.d);
  fillFn(ctx, 0, 0, w, h, (x, ry) => {
    const row = R.row[ry];
    const v = R.v[ry];
    const sz = R.size[ry];
    if (R.first[ry]) return o.grout;
    const off = o.stagger && row & 1 ? o.tw / 2 : 0;
    const xx = x + off;
    const col = Math.floor(xx / o.tw);
    const lx = xx - col * o.tw;
    const gw = ry < h * 0.3 ? 2 : 1;
    if (lx < gw) return o.grout;
    const u = lx / o.tw;
    const id = col * 31.7 + row * 17.3 + seed;
    const ramp = o.alt && (col + row) & 1 ? o.alt : o.ramp;
    let val = 0.5 + (hash(id) - 0.5) * 0.3;
    if (ry > 0 && R.first[ry - 1]) val += 0.26;
    if (lx === gw) val += 0.14;
    if (lx === o.tw - 1) val -= 0.16;
    if (R.last[ry]) val -= 0.24;
    const n = fbm(x / 13, (row + v) * 1.7, seed);
    val -= Math.max(0, n - 0.58) * 1.0 * (o.wear ?? 1);
    if (o.crack && hash(id * 3.3) < 0.3 && u > 0.12 && u < 0.88) {
      const cv = 0.25 + 0.5 * hash(id * 5.1) + (u - 0.5) * (hash(id * 7.7) - 0.5) * 1.4 + Math.sin(u * 17 + id) * 0.07;
      if (Math.abs(v - cv) * sz < 0.6) return o.crack;
      if (Math.abs(v - cv) * sz < 1.4 && v > cv) val += 0.2;
    }
    if (o.moss && (u < 0.12 || v > 0.82 || u > 0.92)) {
      const m = fbm(x / 5, (row + v) * 4, seed + 9);
      if (m > 0.6) return pick(o.moss, (m - 0.6) * 4, x, ry);
    }
    if (o.inlay) {
      const c = o.inlay(u, v, col, row, sz);
      if (c) return c;
    }
    if (o.shine) {
      const s = fbm(x / 40, ry / 3, seed + 21);
      if (s > 0.64 && (s - 0.64) * 5 > [0.125, 0.625, 0.875, 0.375][(ry & 1) * 2 + (x & 1)]) return o.shine;
    }
    val -= (1 - ry / h) * 0.12;
    return pick(ramp, val, x, ry);
  });
}

/** Asphalt, concrete or packed earth: speckled noise in a ramp. */
function grit(ctx: CanvasRenderingContext2D, w: number, h: number, ramp: readonly string[], seed: number, rough = 0.5, mark?: (x: number, ry: number) => string | null): void {
  fillFn(ctx, 0, 0, w, h, (x, ry) => {
    if (mark) {
      const c = mark(x, ry);
      if (c) return c;
    }
    const n = fbm(x / 22, ry / 5, seed);
    const s = hash(x * 7.13 + ry * 131.7 + seed);
    return pick(ramp, 0.3 + n * 0.4 + (s - 0.5) * rough * 0.6 + (ry / h) * 0.12, x, ry);
  });
}

/** The floor row index at the fighters' feet and the share of a depth band a row covers, for marks painted on grit. */
function rowsAt(h: number, hor: number, d: number): Rows {
  return depthRows(h, hor, d);
}

// --- Shared ramps ----------------------------------------------------------------------

const R = {
  wood: tones('#7a5236', 5),
  darkWood: tones('#4a3022', 5, 0.6, 0.35),
  redLacquer: tones('#b02a22', 5),
  gold: tones('#d8a838', 5, 0.62, 0.5, '#3a1a10', '#fff8d0'),
  brass: tones('#c89040', 5, 0.6, 0.45, '#2a1408', '#fff0c0'),
  steel: tones('#7a8088', 5),
  white: tones('#d8d8e0', 5, 0.5, 0.6),
  leaf: tones('#3a7a30', 5, 0.6, 0.35, '#0a2018', '#e8f088'),
  trunk: tones('#6a4a2a', 4, 0.6, 0.3)
};

// --- The stages ------------------------------------------------------------------------

const PAINTERS: Record<StageId, Painter> = {
  // A castle rooftop at night under a full moon, the great wooden sign behind.
  kenji: {
    horizon: 150,
    sky: ctx => {
      vgrad(ctx, 0, 0, SCREEN_W, 150, ['#04061a', '#080c26', '#101436', '#1c1c4a', '#2c2860', '#423470']);
      stars(ctx, SCREEN_W, 110, 110, 3, '#5a5a90', '#d8d8f8');
      halo(ctx, 292, 44, 52, ['#1e1e52', '#2a2a64', '#3a3878', '#4c4a8c']);
      fillFn(ctx, 270, 22, 46, 46, (px, py) => {
        const dx = px + 0.5 - 292;
        const dy = py + 0.5 - 44;
        const d = Math.hypot(dx, dy) / 21;
        if (d > 1) return null;
        const n = fbm(px / 5, py / 5, 4);
        const mare = fbm(px / 9 + 3, py / 9, 11) > 0.58;
        let v = 0.8 - d * d * 0.35 + (dx + dy) * -0.006;
        if (mare) v -= 0.3;
        v += (n - 0.5) * 0.2;
        return pick(['#a8a088', '#c8c0a0', '#e0d8b8', '#f4ecd0', '#fffcec'], v, px, py);
      });
      streaks(ctx, SCREEN_W, 52, 96, ['#14143a', '#23224e', '#3a3668', '#5c5888'], 7, false);
    },
    far: (ctx, w) => {
      hills(ctx, w, 150, 62, tones('#2a2a5a', 5, 0.6, 0.25, '#05051a', '#8888c0'), 3, 46, '#2e2a5c');
      hills(ctx, w, 150, 38, tones('#1a1840', 4, 0.6, 0.2, '#04040f', '#5a5a90'), 8, 28);
      // A far castle keep on the ridge, its windows lit.
      const kx = 96;
      const kr = tones('#3a3460', 4, 0.6, 0.2, '#08061a');
      for (const [y, ww] of [[104, 40], [92, 30], [82, 22]] as const) {
        rect(ctx, kx - ww / 2 + 2, y, ww - 4, 12, kr[1]);
        poly(ctx, [[kx - ww / 2 - 4, y + 1], [kx, y - 6], [kx + ww / 2 + 4, y + 1]], kr[0]);
        for (let wx = kx - ww / 2 + 5; wx < kx + ww / 2 - 4; wx += 5) rect(ctx, wx, y + 4, 2, 3, '#f0c060');
      }
      rect(ctx, kx - 26, 116, 52, 34, kr[0]);
      for (let i = 0; i < 26; i++) rect(ctx, Math.floor(hash(i + 60) * w), 132 + Math.floor(hash(i + 70) * 16), 1, 1, '#c8a050');
    },
    mid: (ctx, w) => {
      // The castle wall: plaster between dark timber, capped with tiles.
      const plasterR = tones('#8a88a8', 5, 0.55, 0.3, '#0e0c24', '#e8e8ff');
      plaster(ctx, 0, 108, w, 40, plasterR, 5, (_px, py) => -(py - 108) / 80);
      for (let x = 0; x < w; x += 48) {
        cylinder(ctx, x, 106, 6, 42, R.darkWood);
        rect(ctx, x + 6, 126, 42, 3, R.darkWood[1]);
        rect(ctx, x + 6, 126, 42, 1, R.darkWood[3]);
      }
      // Arrow slits.
      for (let x = 24; x < w; x += 96) {
        rect(ctx, x, 112, 8, 10, '#0a0818');
        rect(ctx, x, 112, 8, 1, plasterR[0]);
        poly(ctx, [[x + 14, 134], [x + 20, 130], [x + 26, 134], [x + 20, 140]], '#0a0818');
      }
      eaveRoof(ctx, -10, 92, w + 20, 16, tones('#4a4a6a', 5, 0.6, 0.3, '#06061a', '#b0b0d8'), tones('#2a2a40', 4), '#0c0a1c', 4, 0);
      // The stone parapet the fighters stand behind.
      stoneWall(ctx, 0, 140, w, 10, tones('#5a5870', 4, 0.6, 0.25), '#16142a', 22, 5, 9);
      rect(ctx, 0, 148, w, 2, '#0c0a18');
      // Stone lanterns.
      for (const lx of [132, w - 152]) {
        const st = tones('#6a6880', 5, 0.6, 0.3, '#06061a', '#c8c8e8');
        block(ctx, lx + 3, 134, 14, 8, st);
        block(ctx, lx + 1, 130, 18, 4, st);
        cylinder(ctx, lx + 6, 112, 8, 18, st);
        block(ctx, lx, 106, 20, 6, st);
        block(ctx, lx + 3, 96, 14, 10, st);
        rect(ctx, lx + 6, 98, 8, 6, '#f8c860');
        rect(ctx, lx + 8, 99, 4, 4, '#fff0b0');
        poly(ctx, [[lx - 5, 97], [lx + 10, 86], [lx + 25, 97]], st[2]);
        poly(ctx, [[lx + 10, 86], [lx + 25, 97], [lx + 10, 95]], st[1]);
        rect(ctx, lx - 4, 96, 28, 1, st[0]);
        sphere(ctx, lx + 10, 84, 2.5, st);
      }
      // The underside of the great roof we stand beneath, framing the night.
      const rafter = tones('#3a2a2a', 4, 0.6, 0.3, '#040208', '#a08880');
      const tile = tones('#3a3a58', 4, 0.6, 0.3, '#040410', '#9090c0');
      for (const [x0, x1, dir] of [[0, 250, 1], [w, w - 250, -1]] as const) {
        const lip = (px: number) => 44 - ((px - x0) * dir) * 0.18;
        fillFn(ctx, Math.min(x0, x1), 0, 250, 48, (px, py) => {
          const l = lip(px);
          if (py > l + 3) return null;
          if (py > l) return py === Math.floor(l) + 1 ? tile[3] : (px & 3) === 0 ? tile[2] : tile[0];
          if (py > l - 4) return pick(tile, 0.75 - (l - py) * 0.12 + ((px & 3) === 1 ? 0.25 : 0), px, py);
          const k = ((px - x0) * dir) % 9;
          if (k < 3 && py > l - 12) return pick(rafter, 0.8 - k * 0.25, px, py);
          return pick(rafter, 0.2 + (fbm(px / 9, py / 3, 5) - 0.5) * 0.3 - (l - py) / 120, px, py);
        });
        // Paper lanterns hanging from the eave.
        for (const off of [70, 150, 220]) {
          const lx = x0 + dir * off;
          const ly = Math.round(lip(lx)) + 16;
          paperLantern(ctx, lx, ly, 6, 8, tones('#d83020', 5, 0.55, 0.45, '#2a0408', '#ffe8a0'), '#1a0808', true);
        }
      }
      // The great sign, hung from a beam.
      const sx = w / 2 - 32;
      const sy = 40;
      rect(ctx, sx + 12, 22, 2, 18, '#1a1414');
      rect(ctx, sx + 50, 22, 2, 18, '#1a1414');
      block(ctx, sx - 4, sy - 4, 72, 62, R.darkWood);
      rect(ctx, sx - 2, sy - 2, 68, 1, R.darkWood[4]);
      fillFn(ctx, sx, sy, 64, 54, (px, py) => pick(tones('#c8b088', 4, 0.5, 0.35, '#3a2a30', '#fff4d8'), 0.62 + (fbm(px / 6, py / 2, 2) - 0.5) * 0.35 - ((px - sx) / 64) * 0.25, px, py));
      glyphs(ctx, sx + 6, sy + 5, 22, 13, 3, '#1a1410', 77, 4, 2);
      glyphs(ctx, sx + 36, sy + 5, 22, 13, 3, '#1a1410', 91, 4, 2);
      rect(ctx, sx + 54, sy + 44, 6, 6, '#b02020');
      rect(ctx, sx + 55, sy + 45, 4, 4, '#d84030');
    },
    floor: (ctx, w, h, hor) => plankFloor(ctx, w, h, hor, { ramp: tones('#6a5248', 5, 0.62, 0.35, '#0a0618', '#c8c8e8'), gap: '#140c14', d: 0.075, len: 110, seed: 4, nail: '#9898b8' }),
    live: (ctx, midX, t) => {
      for (const lx of [132, MID_W - 152]) {
        const fl = Math.floor(t / 5 + lx) % 3;
        rect(ctx, lx + 8 - midX, 99, 4, 4, fl ? '#fff0b0' : '#f8d880');
      }
    }
  },

  // A harbour at sunset: a white yacht with sailors cheering at the rail.
  ace: {
    horizon: 152,
    sky: ctx => {
      vgrad(ctx, 0, 0, SCREEN_W, 112, ['#2a2456', '#4a2f68', '#7a3a6a', '#b04a60', '#e06c50', '#f89c4c', '#fcc870']);
      streaks(ctx, SCREEN_W, 34, 96, ['#4a2a5a', '#82406a', '#d0645a', '#f8a058', '#ffd890'], 12, true);
      halo(ctx, 104, 108, 40, ['#f8a850', '#fab860', '#fcca70', '#fede90']);
      disc(ctx, 104, 108, 15, '#fff0b8');
      disc(ctx, 104, 108, 12, '#fffadc');
      vgrad(ctx, 0, 110, SCREEN_W, 42, ['#c86a5a', '#8a4a66', '#4a3a6a', '#2c3064']);
      for (let y = 111; y < 152; y++) {
        const half = Math.max(1, 18 - (y - 111) * 0.25);
        for (let k = 0; k < 3; k++) {
          const a = 104 - half + hash(y * 3.1 + k) * half * 2;
          rect(ctx, a, y, 2 + Math.floor(hash(y + k * 9) * 6), 1, y < 126 ? '#ffe0a0' : '#f8a868');
        }
        if (y % 3 === 0) for (let i = 0; i < 6; i++) rect(ctx, hash(y * 5 + i) * SCREEN_W, y, 3, 1, '#6a4a7a');
      }
    },
    far: (ctx, w) => {
      // The far shore: hills, a town, a lighthouse.
      hills(ctx, w, 112, 18, tones('#5a3a64', 4, 0.5, 0.2), 4, 30);
      for (let x = 0; x < w; x += 9) {
        const bh = 4 + Math.floor(hash(x) * 9);
        rect(ctx, x, 112 - bh, 8, bh, hash(x + 3) > 0.5 ? '#4a3058' : '#563862');
        if (hash(x * 2.3) > 0.6) rect(ctx, x + 3, 112 - bh + 2, 1, 1, '#f8c870');
      }
      const lx = w - 70;
      rect(ctx, lx, 84, 6, 28, '#e8d8d0');
      rect(ctx, lx, 90, 6, 4, '#c83838');
      rect(ctx, lx, 100, 6, 4, '#c83838');
      rect(ctx, lx - 1, 80, 8, 4, '#2a1a2a');
      rect(ctx, lx + 1, 81, 4, 2, '#fff0a0');
    },
    mid: (ctx, w) => {
      // Darker water between the pier and the yacht.
      vgrad(ctx, 0, 116, w, 36, ['#3a3266', '#2c2a5a', '#22224a', '#1a1a3a']);
      for (let i = 0; i < 90; i++) rect(ctx, hash(i * 2.1) * w, 118 + hash(i * 3.3) * 32, 3 + hash(i) * 8, 1, i % 3 ? '#4a4478' : '#e88a60');
      // The yacht.
      const x = w / 2 - 160;
      const hull = tones('#e8ecf4', 5, 0.45, 0.4, '#2a2050', '#ffffff');
      poly(ctx, [[x + 8, 100], [x + 340, 100], [x + 330, 112], [x + 312, 130], [x + 34, 130], [x + 18, 118]], hull[2]);
      const lerpX = (py: number, pts: readonly (readonly [number, number])[]) => {
        for (let i = 0; i + 1 < pts.length; i++) {
          const [ax, ay] = pts[i];
          const [bx, by] = pts[i + 1];
          if (py >= ay && py <= by) return ax + ((bx - ax) * (py - ay)) / (by - ay);
        }
        return pts[pts.length - 1][0];
      };
      fillFn(ctx, x + 8, 101, 334, 29, (px, py) => {
        const l = lerpX(py, [[x + 8, 100], [x + 18, 118], [x + 34, 130]]);
        const r = lerpX(py, [[x + 340, 100], [x + 330, 112], [x + 312, 130]]);
        if (px < l || px >= r) return null;
        const warm = py > 124 ? 0.15 : 0;
        const c = pick(hull, 0.92 - (py - 100) / 34 - (r - px < 10 ? 0.2 : 0) + (px - l < 4 ? 0.1 : 0), px, py);
        return warm && ((px + py) & 1) ? '#e8a070' : c;
      });
      rect(ctx, x + 22, 116, 302, 4, '#1e3c94');
      rect(ctx, x + 22, 116, 302, 1, '#4a6ad0');
      rect(ctx, x + 14, 101, 322, 1, hull[4]);
      for (let px = x + 60; px < x + 300; px += 14) {
        disc(ctx, px, 108, 2, '#1a2a4a');
        rect(ctx, px - 1, 107, 1, 1, '#8ab0e0');
      }
      // Cabins: the deckhouse, the bridge, the mast.
      const dh = tones('#dfe4ee', 5, 0.45, 0.35, '#2a2050', '#ffffff');
      block(ctx, x + 80, 76, 170, 16, dh);
      for (let wx = x + 88; wx < x + 244; wx += 16) {
        rect(ctx, wx, 80, 12, 7, '#24345a');
        rect(ctx, wx, 80, 12, 1, '#5a7ab0');
        rect(ctx, wx + 1, 81, 3, 1, '#f8c890');
      }
      block(ctx, x + 120, 60, 92, 16, dh);
      poly(ctx, [[x + 124, 66], [x + 206, 66], [x + 212, 75], [x + 120, 75]], '#1e2c50');
      rect(ctx, x + 128, 67, 30, 1, '#f8b070');
      rect(ctx, x + 112, 58, 108, 3, dh[3]);
      rect(ctx, x + 164, 18, 3, 40, '#c8c8d8');
      rect(ctx, x + 164, 18, 1, 40, '#ffffff');
      rect(ctx, x + 152, 30, 28, 2, '#a8a8b8');
      rect(ctx, x + 150, 42, 32, 2, '#a8a8b8');
      ellipse(ctx, x + 166, 26, 7, 2, '#e8e8f0');
      // Stays and the string of flags, mast to bow and to stern.
      line(ctx, x + 165, 20, x + 336, 98, '#6a6a80');
      line(ctx, x + 165, 20, x + 14, 98, '#6a6a80');
      // Life rings.
      for (const lx of [x + 96, x + 234]) {
        disc(ctx, lx, 96, 4, '#e83a2a');
        disc(ctx, lx, 96, 2, '#3a4080');
        rect(ctx, lx - 4, 95, 2, 2, '#f8f8f8');
        rect(ctx, lx + 3, 95, 2, 2, '#f8f8f8');
      }
      // The pier: posts, bollards, crates, barrels and rope.
      for (const [cx2, cy] of [[30, 128], [52, 134], [w - 70, 130]] as const) crate(ctx, cx2, cy, 22, 18, tones('#a07a48', 4));
      barrel(ctx, 12, 130, 14, 20, tones('#8a5a34', 4), tones('#4a4a54', 3));
      barrel(ctx, w - 40, 128, 14, 20, tones('#8a5a34', 4), tones('#4a4a54', 3));
      barrel(ctx, w - 26, 132, 14, 18, tones('#2a5a8a', 4), tones('#4a4a54', 3));
    },
    front: (ctx, w) => {
      const x = w / 2 - 160;
      // The yacht's guard rail over the sailors' legs.
      for (let px = x + 24; px < x + 330; px += 12) rect(ctx, px, 88, 1, 12, '#c8ccd8');
      rect(ctx, x + 20, 88, 312, 1, '#f8f8ff');
      rect(ctx, x + 20, 94, 312, 1, '#a8acbc');
      fillFn(ctx, x + 8, 96, 330, 5, (px, py) => pick(tones('#e8ecf4', 4, 0.45, 0.4, '#2a2050'), 0.7 - (py - 96) * 0.12, px, py));
      // Pier edge: a heavy beam on posts with rope.
      const pier = tones('#6a4a30', 5, 0.6, 0.35);
      fillFn(ctx, 0, 140, w, 6, (px, py) => pick(pier, 0.85 - (py - 140) * 0.14 + (fbm(px / 9, py, 3) - 0.5) * 0.3, px, py));
      for (let px = 18; px < w; px += 64) {
        cylinder(ctx, px, 132, 8, 20, pier);
        ellipse(ctx, px + 4, 132, 4, 1.5, pier[4]);
        for (let k = 0; k < 3; k++) rect(ctx, px - 1, 136 + k * 2, 10, 1, '#c8a870');
      }
      rect(ctx, 0, 146, w, 6, '#1e1424');
      for (let px = 0; px < w; px += 4) rect(ctx, px, 146 + (px % 8 ? 1 : 2), 2, 1, '#4a3a56');
    },
    floor: (ctx, w, h, hor) => plankFloor(ctx, w, h, hor, { ramp: tones('#8a6248', 5, 0.62, 0.4, '#20102a', '#ffd8a0'), gap: '#2a1820', d: 0.068, len: 120, seed: 2, nail: '#2a2028', wet: '#f8b878' }),
    crowd: {
      ink: '#1a1028',
      spots: [...spread(13, 210, 470, 100, 5, 0), [140, 148], [178, 150], [520, 148], [560, 150]],
      look: i =>
        i < 13 && hash(i * 4.1) < 0.7
          ? { top: '#f0f2f8', bottom: '#f0f2f8', skin: of(SKINS, i * 1.7), hair: '#1a1418', hat: 'sailor', stripes: '#2a3a8a', tall: 1 + (i % 3) }
          : folk(i, ['#d82828', '#2848a8', '#f0d040', '#30a060', '#f0f0f0'], ['#2a3a5a', '#3a3a3a', '#e8e0c8'], i >= 13 ? { hat: i % 2 ? 'cap' : undefined, hatColor: '#d83030' } : {})
    },
    live: (ctx, midX, t) => {
      const x = MID_W / 2 - 160 - midX;
      const flags = ['#e83030', '#f8d838', '#2858d8', '#f8f8f8', '#30a050'];
      for (const [x0, x1] of [[x + 165, x + 336], [x + 165, x + 14]] as const) {
        for (let k = 1; k < 14; k++) {
          const u = k / 14;
          const fx = Math.round(x0 + (x1 - x0) * u);
          const fy = Math.round(20 + 78 * u);
          const flap = Math.floor((t / 6 + k) % 2);
          poly(ctx, [[fx - 2, fy], [fx + 2, fy], [fx + flap, fy + 5]], flags[k % flags.length]);
        }
      }
      for (let i = 0; i < 14; i++) {
        const y = 118 + ((i * 7) % 30);
        const sx = ((i * 53 + t * (0.2 + (i % 3) * 0.1)) % MID_W) - midX;
        rect(ctx, sx, y, 4 + (i % 3) * 2, 1, i % 2 ? '#f8b070' : '#5a5090');
      }
    }
  },

  // A market street in the afternoon: shopfronts, signs, bicycles and chickens.
  mei: {
    horizon: 150,
    sky: ctx => {
      vgrad(ctx, 0, 0, SCREEN_W, 150, ['#3878c8', '#5090d8', '#70a8e0', '#98c4e8', '#c0dcf0']);
      cloud(ctx, 30, 20, 110, 24, tones('#d8e4f4', 4, 0.35, 0.5, '#5878a8', '#ffffff'), 2);
      cloud(ctx, 250, 40, 90, 18, tones('#d8e4f4', 4, 0.35, 0.5, '#5878a8', '#ffffff'), 9);
    },
    far: (ctx, w) => {
      const haze = tones('#8aa0bc', 4, 0.3, 0.25, '#405070', '#d8e8f8');
      for (let x = -10; x < w; x += 46) {
        const bh = 26 + Math.floor(hash(x) * 30);
        block(ctx, x, 110 - bh, 40, bh + 10, haze);
        eaveRoof(ctx, x + 4, 100 - bh, 32, 8, haze, haze, haze[0], 6, 3);
        for (let wy = 116 - bh; wy < 110; wy += 7) for (let wx = x + 5; wx < x + 36; wx += 8) rect(ctx, wx, wy, 4, 4, haze[1]);
      }
      // A pagoda over the roofs.
      const px = w * 0.7;
      for (let k = 0; k < 5; k++) {
        const ww = 34 - k * 5;
        rect(ctx, px - ww / 2 + 4, 76 - k * 12, ww - 8, 8, haze[1]);
        eaveRoof(ctx, px - ww / 2, 70 - k * 12, ww, 6, haze, haze, haze[0], 5, 3);
      }
      rect(ctx, px - 1, 6, 2, 10, haze[1]);
    },
    mid: (ctx, w) => {
      const fronts = ['#c8a478', '#b88a6a', '#d0b890', '#a87a5a'];
      const roofs = [tones('#2e6a50', 5), tones('#2a5a8a', 5), tones('#7a3028', 5)];
      for (let i = 0, x = -6; x < w; i++, x += 124) {
        const wallR = tones(fronts[i % 4], 5, 0.55, 0.3);
        plaster(ctx, x, 54, 120, 96, wallR, i + 3, (_px, py) => (py > 108 ? -0.2 : 0));
        // Upper storey: a lattice window, a balcony.
        const lat = R.darkWood;
        block(ctx, x + 18, 64, 84, 28, lat);
        fillFn(ctx, x + 20, 66, 80, 24, (px, py) => ((px - x) % 6 === 0 || (py - 66) % 6 === 0 || (px - x + py) % 12 === 0 ? lat[3] : '#2a1a14'));
        rect(ctx, x + 10, 92, 100, 3, R.redLacquer[3]);
        rect(ctx, x + 10, 95, 100, 2, R.redLacquer[1]);
        for (let bx = x + 12; bx < x + 110; bx += 5) rect(ctx, bx, 97, 2, 6, R.redLacquer[2]);
        rect(ctx, x + 10, 103, 100, 2, R.redLacquer[1]);
        eaveRoof(ctx, x + 10, 42, 100, 12, roofs[i % 3], tones('#3a2a20', 4), '#1a1210', 12, 4);
        // Ground floor: a shop opening with goods.
        fillFn(ctx, x + 8, 112, 104, 38, (px, py) => pick(tones('#3a2820', 4, 0.6, 0.2), 0.5 - (py - 112) / 60 + (fbm(px / 5, py / 5, i) - 0.5) * 0.3, px, py));
        cylinder(ctx, x + 4, 106, 6, 44, R.redLacquer);
        cylinder(ctx, x + 110, 106, 6, 44, R.redLacquer);
        // Shelves of jars and boxes inside.
        for (let sy = 118; sy < 140; sy += 10) {
          rect(ctx, x + 12, sy + 6, 96, 2, R.wood[2]);
          for (let gx = x + 14; gx < x + 104; gx += 7) {
            const c = mix(of(['#c83a2a', '#e8c040', '#3a8a4a', '#e8e0c8', '#4a6ab0'], gx * 0.37 + sy), '#2a1810', 0.45);
            const gt = tones(c, 3, 0.5, 0.3);
            rect(ctx, gx, sy, 5, 6, gt[1]);
            rect(ctx, gx, sy, 2, 6, gt[2]);
            rect(ctx, gx, sy, 5, 1, gt[2]);
          }
        }
        // A striped awning.
        const aw = i % 2 ? ['#e8e0d0', '#2a5aa8'] : ['#f0e8d8', '#c82a2a'];
        fillFn(ctx, x + 4, 106, 112, 8, (px, py) => {
          const k = Math.floor((px - x) / 8) % 2;
          const v = py === 113 ? 0.2 : 0.7;
          return pick(tones(aw[k], 3, 0.4, 0.3), v, px, py);
        });
        for (let px = x + 4; px < x + 116; px += 8) {
          rect(ctx, px + 1, 114, 6, 1, aw[1]);
          rect(ctx, px + 3, 115, 2, 1, aw[1]);
        }
        // Vertical signboards with glyphs.
        const sg = i % 2 ? '#1a1a1a' : '#a01818';
        block(ctx, x + 2, 58, 12, 44, tones(sg, 4, 0.5, 0.3));
        glyphs(ctx, x + 4, 62, 8, 8, 4, '#f0c840', i * 13, 2);
        // Fruit and vegetables on a trestle.
        if (i % 2 === 0) {
          rect(ctx, x + 22, 136, 76, 3, R.wood[3]);
          rect(ctx, x + 24, 139, 2, 11, R.wood[1]);
          rect(ctx, x + 94, 139, 2, 11, R.wood[1]);
          for (let bx = x + 24; bx < x + 96; bx += 12) {
            const c = of(['#e83020', '#f8a020', '#60b030', '#f0d840', '#a03080'], bx);
            ellipse(ctx, bx + 5, 135, 6, 3, '#8a6030');
            for (let k = 0; k < 6; k++) sphere(ctx, bx + 2 + (k % 3) * 3, 132 + Math.floor(k / 3) * 2, 1.6, tones(c, 3, 0.5, 0.4));
          }
        }
        // Lanterns hung under the eaves.
        for (const lx of [x + 30, x + 60, x + 90]) paperLantern(ctx, lx, 60, 5, 6, tones('#e03028', 4, 0.55, 0.4, '#3a0808', '#ffe0a0'), '#2a1008', true);
      }
      // Kerb along the front.
      fillFn(ctx, 0, 146, w, 4, (px, py) => pick(tones('#9a9080', 4), py === 146 ? 0.9 : 0.35, px, py));
    },
    front: (ctx, w) => {
      // Bicycles parked against the kerb.
      for (const bx of [24, 196, w - 185, w - 49]) {
        const wheel = (cx: number) => {
          for (let a = 0; a < 32; a++) {
            const ang = (a / 32) * Math.PI * 2;
            rect(ctx, cx + Math.round(Math.cos(ang) * 7), 142 + Math.round(Math.sin(ang) * 7), 1, 1, '#1a1a1e');
          }
          for (let a = 0; a < 6; a++) {
            const ang = (a / 6) * Math.PI;
            line(ctx, cx - Math.cos(ang) * 6, 142 - Math.sin(ang) * 6, cx + Math.cos(ang) * 6, 142 + Math.sin(ang) * 6, '#8a8a98');
          }
          rect(ctx, cx - 1, 141, 2, 2, '#c8c8d0');
        };
        wheel(bx);
        wheel(bx + 24);
        const fr = '#2a6a3a';
        line(ctx, bx, 142, bx + 9, 133, fr);
        line(ctx, bx + 9, 133, bx + 20, 133, fr);
        line(ctx, bx + 12, 142, bx + 20, 133, fr);
        line(ctx, bx, 142, bx + 12, 142, fr);
        line(ctx, bx + 24, 142, bx + 20, 131, fr);
        line(ctx, bx + 12, 142, bx + 8, 131, fr);
        rect(ctx, bx + 6, 130, 5, 2, '#1a1a1a');
        rect(ctx, bx + 18, 129, 6, 1, '#c8c8d0');
        rect(ctx, bx - 5, 132, 9, 6, '#8a6a3a');
        rect(ctx, bx - 5, 132, 9, 1, '#b08a50');
      }
      // A cage of chickens on the kerb.
      const cx2 = 300;
      crate(ctx, cx2, 134, 30, 14, tones('#b08a50', 4));
      for (let k = 0; k < 3; k++) {
        disc(ctx, cx2 + 7 + k * 8, 139, 3, '#f0ece0');
        rect(ctx, cx2 + 9 + k * 8, 135, 1, 2, '#d82020');
      }
      for (let px = cx2 + 2; px < cx2 + 30; px += 4) rect(ctx, px, 136, 1, 10, '#6a4a28');
    },
    floor: (ctx, w, h, hor) => tileFloor(ctx, w, h, hor, { ramp: tones('#a89a88', 5, 0.55, 0.35), alt: tones('#9c9080', 5, 0.55, 0.35), grout: '#4a4038', tw: 44, d: 0.11, seed: 3, stagger: true, crack: '#5a4e44' }),
    crowd: {
      ink: '#2a1c18',
      spots: [...spread(9, 40, 300, 146, 11), ...spread(8, 330, 600, 146, 23)],
      look: i =>
        folk(i, ['#f0f0f0', '#4a8ad8', '#e8d070', '#c84040', '#5aa05a', '#e888a8', '#3a3a5a'], ['#2a2a3a', '#3a4a6a', '#5a4a3a', '#1a1a1a'], hash(i * 6.6) < 0.2 ? { hat: 'cone', hatColor: '#d8c080' } : {}, SKINS.slice(0, 3))
    },
    live: (ctx, midX, t) => {
      // Chickens strutting and pecking along the kerb.
      for (let k = 0; k < 4; k++) {
        const range = 120;
        const base = 60 + k * 150;
        const ph = (t * 0.35 + k * 40) % (range * 2);
        const dir = ph < range ? 1 : -1;
        const x = Math.round(base + (ph < range ? ph : range * 2 - ph)) - midX;
        if (x < -10 || x > SCREEN_W + 10) continue;
        const peck = Math.floor((t + k * 13) / 8) % 4 === 0;
        const y = 148;
        const body = k % 2 ? '#f4f0e4' : '#c87838';
        const dark = k % 2 ? '#c8c0b0' : '#8a4a20';
        ellipse(ctx, x, y - 4, 4, 3, body);
        rect(ctx, x - 3 * dir, y - 6, 2, 3, dark);
        rect(ctx, x - 4 * dir - (dir < 0 ? 0 : 1), y - 8, 2, 2, dark);
        const hx = x + 3 * dir;
        const hy = peck ? y - 3 : y - 8;
        rect(ctx, hx - 1, hy, 3, 3, body);
        rect(ctx, hx, hy - 1, 2, 1, '#e02020');
        rect(ctx, hx + 2 * dir, hy + 1, 1, 1, '#f0a020');
        rect(ctx, hx + (dir > 0 ? 1 : 0), hy + 1, 1, 1, '#101010');
        rect(ctx, x - 1, y - 1, 1, 2, '#e0a020');
        rect(ctx, x + 1, y - 1, 1, 2, '#e0a020');
      }
    }
  },

  // The factory floor: girders, a hanging crucible, workers on the catwalk.
  boris: {
    horizon: 148,
    sky: ctx => {
      const wall = tones('#3a3e3c', 5, 0.6, 0.2, '#060808');
      corrugated(ctx, 0, 0, SCREEN_W, 148, wall, 1, 6);
      // High windows letting in cold light.
      for (let x = 12; x < SCREEN_W; x += 64) {
        rect(ctx, x, 14, 44, 30, '#101414');
        fillFn(ctx, x + 2, 16, 40, 26, (px, py) => ((px - x) % 10 < 1 || (py - 16) % 9 < 1 ? '#1a2020' : pick(['#3a5a68', '#5a8090', '#80a8b0'], 0.9 - (py - 16) / 30 + (hash(px * 3 + py) - 0.5) * 0.2, px, py)));
      }
    },
    far: (ctx, w) => {
      // Trusses across the roof and pillars down.
      const gird = tones('#2a2c2a', 4, 0.6, 0.25, '#040404');
      for (let x = 0; x < w; x += 60) {
        rect(ctx, x, 0, 8, 148, gird[1]);
        rect(ctx, x, 0, 2, 148, gird[2]);
        rect(ctx, x + 7, 0, 1, 148, gird[0]);
        for (let y = 6; y < 148; y += 10) rect(ctx, x + 2, y, 1, 1, gird[3]);
      }
      rect(ctx, 0, 48, w, 5, gird[1]);
      rect(ctx, 0, 48, w, 1, gird[2]);
      for (let x = 0; x < w; x += 30) {
        line(ctx, x, 53, x + 30, 70, gird[1], 2);
        line(ctx, x + 30, 53, x, 70, gird[1], 2);
      }
      rect(ctx, 0, 70, w, 4, gird[1]);
      // A glow from the furnace mouths deep in the hall.
      for (const gx of [70, 330]) halo(ctx, gx, 120, 44, ['#2a2018', '#3a2618', '#5a3018', '#7a3a14']);
      for (const gx of [70, 330]) {
        rect(ctx, gx - 14, 108, 28, 30, '#0c0a08');
        vgrad(ctx, gx - 10, 112, 20, 26, ['#f8e070', '#f8a030', '#c84010']);
      }
      // Chains.
      for (const cx of [130, 250, 410]) for (let y = 0; y < 100; y += 3) rect(ctx, cx + (y % 6 ? 0 : 1), y, 2, 2, gird[2]);
    },
    mid: (ctx, w) => {
      const steel = tones('#6a6e6a', 5, 0.6, 0.3, '#080a0a', '#d8e0d8');
      // The catwalk, with workers standing on it.
      fillFn(ctx, 0, 84, w, 6, (px, py) => pick(steel, py === 84 ? 0.95 : 0.4 - (py - 84) * 0.06 + (px % 8 === 0 ? -0.3 : 0), px, py));
      for (let x = 10; x < w; x += 70) {
        rect(ctx, x, 90, 4, 20, steel[1]);
        line(ctx, x + 4, 90, x + 20, 104, steel[1], 2);
      }
      // Pipes, valves, a gauge.
      pipe(ctx, 0, 112, w, 8, tones('#8a5a3a', 5, 0.62, 0.4, '#140804', '#f8d0a0'));
      for (let x = 50; x < w; x += 110) rect(ctx, x, 111, 3, 10, steel[1]);
      for (let x = 30; x < w; x += 110) {
        rect(ctx, x, 110, 6, 11, steel[0]);
        rect(ctx, x + 1, 111, 4, 9, steel[2]);
        disc(ctx, x + 3, 106, 4, '#b02020');
        rect(ctx, x - 1, 105, 9, 2, '#d03030');
      }
      pipe(ctx, 0, 122, w, 5, tones('#5a6a5a', 4, 0.6, 0.35, '#040806'));
      // Machines at either side.
      for (const mx of [0, w - 90]) {
        block(ctx, mx, 96, 90, 52, tones('#4a5a4a', 5, 0.6, 0.3));
        rect(ctx, mx + 8, 104, 30, 18, '#1a201a');
        for (let k = 0; k < 4; k++) rect(ctx, mx + 10 + k * 7, 106 + (k % 2) * 6, 3, 3, k % 2 ? '#f0c030' : '#40d040');
        disc(ctx, mx + 62, 114, 10, steel[3]);
        disc(ctx, mx + 62, 114, 8, '#e8e8d8');
        line(ctx, mx + 62, 114, mx + 67, 109, '#c02020');
        rect(ctx, mx + 4, 130, 82, 6, '#e8c020');
        for (let k = 0; k < 82; k += 8) poly(ctx, [[mx + 4 + k, 136], [mx + 8 + k, 130], [mx + 12 + k, 130], [mx + 8 + k, 136]], '#1a1a1a');
      }
      // The red banner with a star and gear (an original emblem).
      const bx = w / 2 - 110;
      rect(ctx, bx - 2, 18, 44, 3, steel[1]);
      fillFn(ctx, bx, 21, 40, 46, (px, py) => (py > 60 && Math.abs(px - bx - 20) < (py - 60) * 3 ? null : pick(tones('#b02018', 4, 0.55, 0.3), 0.7 - ((px - bx) / 40) * 0.4 + ((px - bx) % 9 === 0 ? -0.2 : 0), px, py)));
      disc(ctx, bx + 20, 40, 9, '#e8b830');
      disc(ctx, bx + 20, 40, 6, '#b02018');
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        rect(ctx, bx + 19 + Math.round(Math.cos(a) * 9), 39 + Math.round(Math.sin(a) * 9), 2, 2, '#e8b830');
      }
      poly(ctx, [[bx + 20, 34], [bx + 22, 39], [bx + 26, 39], [bx + 23, 42], [bx + 24, 46], [bx + 20, 43], [bx + 16, 46], [bx + 17, 42], [bx + 14, 39], [bx + 18, 39]], '#f8d040');
      // The hanging crucible.
      const cx = w / 2 + 6;
      for (const sx of [-18, 18]) for (let y = 0; y < 40; y += 3) rect(ctx, cx + sx + (y % 6 ? 0 : 1) - (sx > 0 ? 0 : 0), y, 2, 2, steel[2]);
      rect(ctx, cx - 22, 38, 44, 3, steel[1]);
      fillFn(ctx, cx - 26, 42, 52, 30, (px, py) => {
        const t = (py - 42) / 30;
        const half = 26 - t * t * 12;
        if (Math.abs(px + 0.5 - cx) > half) return null;
        const u = (px + 0.5 - cx) / half;
        return pick(tones('#4a3a34', 5, 0.6, 0.4, '#050404', '#f8a060'), 0.55 - u * 0.4 + (1 - t) * 0.2 + (t > 0.85 ? 0.3 : 0), px, py);
      });
      rect(ctx, cx - 26, 42, 52, 3, '#2a1a14');
      ellipse(ctx, cx, 43, 22, 2, '#f8a020');
      ellipse(ctx, cx, 43, 16, 1, '#fff080');
    },
    front: (ctx, w) => {
      const steel = tones('#7a7e78', 4, 0.6, 0.3, '#080a0a');
      // Catwalk railing over the workers up there.
      rect(ctx, 0, 70, w, 2, steel[3]);
      rect(ctx, 0, 77, w, 1, steel[1]);
      for (let x = 0; x < w; x += 14) rect(ctx, x, 70, 2, 14, steel[2]);
      // The low barrier the ground crew lean on.
      fillFn(ctx, 90, 136, w - 180, 12, (px, py) => {
        if (py < 138) return pick(steel, py === 136 ? 0.95 : 0.6, px, py);
        return ((px + py * 1) >> 3) % 2 ? '#e8c020' : '#1e1e1a';
      });
      rect(ctx, 90, 146, w - 180, 2, '#0c0c0a');
    },
    floor: (ctx, w, h, hor) =>
      tileFloor(ctx, w, h, hor, {
        ramp: tones('#6a6c64', 5, 0.62, 0.32, '#08080a', '#e0e0d0'),
        grout: '#16160f',
        tw: 56,
        d: 0.14,
        seed: 6,
        wear: 0.8,
        inlay: (u, v, _c, _r, sz) => {
          const lx = Math.floor(u * 56);
          const ly = Math.floor(v * sz);
          if ((lx === 4 || lx === 51) && (ly === 1 || ly === sz - 2) && sz >= 5) return '#c8c8b8';
          if ((lx === 5 || lx === 52) && (ly === 2 || ly === sz - 1) && sz >= 5) return '#1a1a14';
          if (sz >= 8 && lx > 8 && lx < 48 && ly > 1 && ly < sz - 1 && (lx + ly * 2) % 9 === 0 && (Math.floor(lx / 9) + ly) % 2 === 0) return '#7a7c72';
          return null;
        }
      }),
    crowd: {
      ink: '#0a0a08',
      spots: [...spread(7, 60, 250, 84, 3, 0), ...spread(5, 380, 560, 84, 9, 0), ...spread(10, 100, 520, 146, 17, 1)],
      look: i => {
        const overall = of(['#3a5a8a', '#4a6a4a', '#6a5a3a', '#2a3a6a'], i * 2.7);
        return {
          ...folk(i, ['#c8c0b0', '#8a8a80', '#a06040', '#5a6a8a'], ['#3a4a6a'], {}, SKINS.slice(0, 4)),
          long: false,
          skirt: false,
          overalls: overall,
          hat: hash(i * 5.5) < 0.6 ? 'hard' : 'cap',
          hatColor: hash(i * 5.5) < 0.6 ? '#e8b818' : '#4a4a50'
        };
      }
    },
    live: (ctx, midX, t) => {
      const cx = MID_W / 2 + 6 - midX;
      // Molten drips and sparks under the crucible.
      for (let i = 0; i < 10; i++) {
        const ph = (t * 0.9 + i * 11) % 70;
        const x = cx - 18 + hash(i * 3.3) * 36 + Math.sin(ph / 10 + i) * 3;
        const y = 72 + ph * 1.1;
        if (y < 148) rect(ctx, Math.round(x), Math.round(y), 1, 2, i % 3 ? '#f8d040' : '#fff8c0');
      }
      const fl = Math.floor(t / 4) % 3;
      ellipse(ctx, cx, 43, 22, 2, fl ? '#f8a020' : '#f87010');
      ellipse(ctx, cx + (fl - 1) * 2, 43, 14, 1, '#fff8a0');
    }
  },

  // A palace hall: cusped arches, painted elephants, brass lamps.
  raj: {
    horizon: 152,
    sky: ctx => {
      vgrad(ctx, 0, 0, SCREEN_W, 152, ['#2a0c10', '#4a1418', '#6a2018', '#8a3018', '#a84818']);
      // The painted ceiling band.
      fillFn(ctx, 0, 0, SCREEN_W, 14, (px, py) => ((px + py * 2) % 12 < 2 ? '#d8a030' : (px - py * 2 + 400) % 12 < 2 ? '#d8a030' : py > 11 ? '#2a0808' : '#6a1414'));
    },
    far: (ctx, w) => {
      // A back wall of great cusped arches, a dusk sky through them.
      const sand = tones('#b0683c', 5, 0.6, 0.35, '#1a0608', '#f8d8a0');
      fillFn(ctx, 0, 14, w, 138, (px, py) => {
        const k = (px + 10) % 80;
        const cx = 40;
        const top = 52;
        const dx = Math.abs(k - cx);
        if (dx < 26 && py > top) {
          const cusp = top - 8 + Math.abs(Math.sin((k - cx) / 6.5)) * 6 + (dx * dx) / 40;
          if (py > cusp + 6) return pick(['#401c38', '#6a2a3c', '#a04838', '#d87038', '#f8a848'], (py - 40) / 112, px, py, true);
        }
        let v = 0.45 + (fbm(px / 9, py / 9, 2) - 0.5) * 0.3;
        if (dx < 30 && dx > 26 && py > top) v += 0.3;
        if ((py - 14) % 24 === 0) v -= 0.3;
        return pick(sand, v, px, py);
      });
      // Domes on the skyline seen through the arches.
      for (let x = 20; x < w; x += 80) {
        sphere(ctx, x + 20, 118, 9, tones('#e8d0b0', 4, 0.5, 0.35, '#5a2838'));
        rect(ctx, x + 11, 118, 18, 22, '#c8a890');
        rect(ctx, x + 19, 104, 2, 6, '#e8c040');
      }
    },
    mid: (ctx, w) => {
      const pillar = tones('#d89a60', 5, 0.62, 0.4, '#2a0a0a', '#fff0c8');
      // The dais the elephants stand on.
      fillFn(ctx, 0, 124, w, 28, (px, py) => {
        const lx = px % 32;
        if (py === 124) return pillar[4];
        if (py < 128) return pick(pillar, 0.6, px, py);
        if (py === 128) return pillar[0];
        if ((lx === 0 && py > 128) || py === 151) return '#3a1408';
        const inset = lx > 3 && lx < 29 && py > 131 && py < 148;
        return pick(pillar, inset ? 0.3 + (py - 132) * 0.02 : 0.55, px, py);
      });
      for (let x = 16; x < w; x += 32) disc(ctx, x, 140, 3, '#c83020');
      // Carved pillars.
      for (let x = 0; x < w; x += 102) {
        cylinder(ctx, x + 2, 40, 14, 84, pillar);
        for (let y = 44; y < 120; y += 12) rect(ctx, x + 2, y, 14, 1, pillar[1]);
        block(ctx, x - 2, 34, 22, 7, pillar);
        block(ctx, x - 2, 120, 22, 5, pillar);
        rect(ctx, x + 6, 56, 6, 6, '#3aa0a0');
        rect(ctx, x + 7, 57, 2, 2, '#a0f0e0');
      }
      rect(ctx, 0, 28, w, 6, pillar[2]);
      for (let x = 0; x < w; x += 6) rect(ctx, x, 30, 3, 2, x % 12 ? '#c83020' : '#3a8a7a');
      // Three elephants, painted for a festival.
      const hide = tones('#8a8a98', 5, 0.6, 0.35, '#1a1020', '#e8e8f0');
      const elephant = (ex: number, dir: number) => {
        const X = (dx: number) => ex + dir * dx;
        // Legs.
        for (const lx of [-26, -12, 16, 28]) cylinder(ctx, Math.min(X(lx), X(lx + 10)), 102, 10, 22, hide);
        for (const lx of [-26, -12, 16, 28]) rect(ctx, Math.min(X(lx), X(lx + 10)), 122, 10, 2, '#e8e0d0');
        // Body.
        fillFn(ctx, ex - 44, 64, 88, 46, (px, py) => {
          const dx = (px + 0.5 - X(-2)) / 40;
          const dy = (py + 0.5 - 88) / 22;
          const d = dx * dx + dy * dy;
          if (d > 1) return null;
          return pick(hide, 0.72 - dy * 0.45 - dx * dir * 0.15 - d * 0.2 + (fbm(px / 4, py / 3, ex) - 0.5) * 0.15, px, py);
        });
        // Head, ear, trunk, tusk.
        sphere(ctx, X(40), 76, 16, hide, -0.3 * dir, -0.6);
        fillFn(ctx, Math.min(X(20), X(40)), 66, 20, 28, (px, py) => {
          const dx = (px + 0.5 - X(30)) / 9;
          const dy = (py + 0.5 - 80) / 13;
          if (dx * dx + dy * dy > 1) return null;
          return pick(hide, 0.4 - dy * 0.3 + Math.abs(dx) * 0.2, px, py);
        });
        for (let k = 0; k < 30; k++) {
          const t = k / 30;
          const tx = X(50 + Math.sin(t * 2.2) * 8);
          const ty = 84 + t * 36 - Math.max(0, t - 0.85) * 40;
          disc(ctx, tx, ty, 5 - t * 2.5, pick(hide, 0.65 - t * 0.2, k, 0));
          if (k % 3 === 0) rect(ctx, Math.round(tx - 2), Math.round(ty), 4, 1, hide[1]);
        }
        line(ctx, X(46), 88, X(58), 96, '#f8f0dc', 2);
        line(ctx, X(58), 96, X(62), 92, '#f8f0dc', 2);
        rect(ctx, X(44), 72, 2, 2, '#1a1010');
        // Painted forehead and the jewelled headdress.
        fillFn(ctx, Math.min(X(34), X(52)), 58, 18, 14, (px, py) => {
          const dx = Math.abs(px + 0.5 - X(43));
          if (py > 58 + 14 - dx || dx > 9) return null;
          return pick(R.gold, 0.8 - (py - 58) / 14 + ((px + py) % 4 === 0 ? 0.3 : 0), px, py);
        });
        disc(ctx, X(43), 63, 2, '#d82838');
        // The saddle cloth, red and gold, with tassels.
        fillFn(ctx, ex - 30, 60, 60, 36, (px, py) => {
          const dx = Math.abs(px + 0.5 - X(-4));
          if (py < 64 || dx > 24 - (py < 68 ? 68 - py : 0)) return null;
          if (py > 92) return null;
          const border = dx > 20 || py > 88 || py < 67;
          if (border) return pick(R.gold, 0.7 + ((px + py) % 3 === 0 ? 0.3 : -0.1), px, py);
          const diamond = (Math.abs(((px - ex) % 8 + 8) % 8 - 4) + Math.abs(((py - 60) % 8) - 4)) === 3;
          return diamond ? '#e8b030' : pick(tones('#b01830', 4, 0.55, 0.3), 0.75 - dx / 30 - (py - 64) / 60, px, py);
        });
        for (let k = -20; k <= 20; k += 5) {
          rect(ctx, X(-4 + k), 93, 1, 4, '#e8c040');
          rect(ctx, X(-4 + k) - 1, 97, 3, 2, '#d82838');
        }
        // Painted spots on the trunk root.
        for (let k = 0; k < 4; k++) disc(ctx, X(46 + (k % 2) * 3), 80 + k * 4, 1.2, ['#f8d040', '#e84040', '#40c0c0', '#f8f8f8'][k]);
      };
      elephant(108, 1);
      elephant(Math.round(w / 2), 1);
      elephant(w - 108, -1);
    },
    floor: (ctx, w, h, hor) =>
      tileFloor(ctx, w, h, hor, {
        ramp: tones('#c89868', 5, 0.6, 0.4, '#2a0a08', '#fff0d0'),
        alt: tones('#a86848', 5, 0.6, 0.35, '#2a0a08', '#ffe0c0'),
        grout: '#4a1a10',
        tw: 40,
        d: 0.1,
        seed: 5,
        wear: 0.3,
        inlay: (u, v, col, row, sz) => {
          if (!((col + row) & 1) || sz < 4) return null;
          const du = Math.abs(u - 0.5);
          const dv = Math.abs(v - 0.5);
          if (Math.abs(du + dv - 0.3) < 0.035) return '#d8a848';
          if (du + dv < 0.07) return '#a83020';
          return null;
        }
      }),
    crowd: {
      ink: '#200808',
      spots: [[30, 150], [62, 152], [176, 150], [210, 152], [404, 150], [436, 152], [554, 150], [590, 152]],
      look: i => folk(i, ['#f0f0e8', '#e8a030', '#c82828', '#3a8a8a', '#f0d0e0'], ['#f0f0e8', '#d8c8a0'], { hat: hash(i * 3.3) < 0.5 ? 'turban' : undefined, hatColor: of(['#e8a030', '#f0f0e8', '#c82838'], i), sleeves: true }, ['#8a5434', '#6a4028', '#a06a44', '#7a4a2c'])
    },
    live: (ctx, midX, t) => {
      // Brass lamps hanging between the pillars, flames flickering.
      for (let x = 51; x < MID_W; x += 102) {
        const sx = x - midX;
        if (sx < -10 || sx > SCREEN_W + 10) continue;
        rect(ctx, sx, 34, 1, 14, '#5a3a18');
        poly(ctx, [[sx - 6, 48], [sx + 7, 48], [sx + 4, 54], [sx - 3, 54]], '#c89040');
        rect(ctx, sx - 6, 48, 13, 1, '#f8e0a0');
        rect(ctx, sx - 2, 54, 5, 2, '#8a5a20');
        const fl = Math.floor(t / 4 + x) % 3;
        poly(ctx, [[sx - 2, 48], [sx + (fl - 1), 40 - fl], [sx + 3, 48]], fl === 0 ? '#f8f080' : '#f8a030');
        rect(ctx, sx, 45, 1, 2, '#fff8d0');
      }
    }
  },

  // A bathhouse: the mountain and great-wave mural on the tiles, the steaming tub.
  tora: {
    horizon: 150,
    sky: ctx => {
      // The wooden ceiling and its beams.
      fillFn(ctx, 0, 0, SCREEN_W, 26, (px, py) => pick(R.wood, 0.4 + (vnoise(px / 30, py / 3, 1) - 0.5) * 0.3 - (px % 48 < 2 ? 0.3 : 0) - (26 - py) / 60, px, py));
      rect(ctx, 0, 26, SCREEN_W, 124, '#d8d4c8');
    },
    far: (ctx, w) => {
      // The mural, painted on tiles: a cream sky, gold clouds, the red sun.
      fillFn(ctx, 0, 26, w, 100, (px, py) => pick(['#d8ccb0', '#e8dcc0', '#f2e8d0', '#f6eedc'], (py - 26) / 100, px, py, true));
      sphere(ctx, w - 120, 52, 14, tones('#d83a2a', 4, 0.4, 0.3, '#801010', '#f88060'), -0.3, -0.4);
      const cloudBand = (cx: number, cy: number, len: number) => {
        for (let k = 0; k < 3; k++) {
          const x0 = cx - len / 2 + k * 10;
          const l = len - k * 20;
          fillFn(ctx, x0, cy + k * 4, l, 4, (px, py) => {
            const e = Math.min(px - x0, x0 + l - px);
            if (e < 3 && py - cy - k * 4 < 3 - e) return null;
            return pick(R.gold, py - cy - k * 4 === 0 ? 0.95 : py - cy - k * 4 === 3 ? 0.25 : 0.6, px, py);
          });
        }
      };
      cloudBand(70, 40, 80);
      cloudBand(200, 60, 60);
      cloudBand(400, 36, 90);
      // The mountain, snow running down in tongues.
      const mtn = tones('#3a5aa0', 5, 0.55, 0.3, '#101838', '#a8c8f0');
      const mx = w / 2 + 40;
      fillFn(ctx, mx - 130, 42, 260, 84, (px, py) => {
        const dx = Math.abs(px + 0.5 - mx);
        const top = 46 + Math.max(0, dx - 8) * 0.55;
        if (py < top) return null;
        const snow = 64 + Math.sin(px / 3.1) * 4 + (hash(Math.floor(px / 3)) - 0.5) * 8 - Math.max(0, dx - 30) * 0.4;
        if (py < snow && dx < 44) return pick(['#a8b8d8', '#d8e0f0', '#ffffff'], 0.9 - (px - mx + 40) / 90, px, py);
        const ridge = Math.abs(((px - mx) * 0.35 + py * 0.2) % 9) < 1;
        return pick(mtn, 0.62 - (px - mx) * 0.0035 - (py - 44) / 200 + (ridge ? -0.25 : 0), px, py);
      });
      // The great wave rising from the left, its lip curling over with claws of foam.
      const wave = tones('#1a3a8a', 5, 0.55, 0.4, '#06102a', '#88b0f0');
      const top = (px: number) => {
        const u = (px - 150) / 85;
        return 124 - 70 * Math.max(0, 1 - u * u) * (u < 0 ? 1 : 1 - u * 0.6);
      };
      fillFn(ctx, 40, 50, 260, 76, (px, py) => {
        const tp = top(px);
        if (py < tp) return null;
        const d = py - tp;
        const stripe = (d + Math.sin(px / 9) * 3) % 7;
        return pick(wave, 0.72 - d / 50 + (stripe < 1.2 ? 0.35 : 0), px, py);
      });
      const lcx = 168;
      const lcy = 76;
      fillFn(ctx, lcx - 34, lcy - 34, 70, 60, (px, py) => {
        const dx = px + 0.5 - lcx;
        const dy = py + 0.5 - lcy;
        const r = Math.hypot(dx, dy);
        const a = Math.atan2(dy, dx);
        if (a > 0.15 || a < -2.9) return null;
        if (r > 26 || r < 15) return null;
        if (r > 23) return (Math.floor(a * 9) & 1) ? '#ffffff' : '#d8e4f8';
        return pick(wave, 0.3 + (r - 15) / 14 + ((Math.floor(a * 12) & 1) ? 0.15 : 0), px, py);
      });
      for (let k = 0; k < 9; k++) {
        const a = -2.6 + k * 0.42;
        const bx = lcx + Math.cos(a) * 27;
        const by = lcy + Math.sin(a) * 27;
        for (let f = -1; f <= 1; f++) line(ctx, bx, by, bx + Math.cos(a + f * 0.5) * 5, by + Math.sin(a + f * 0.5) * 5 + 2, '#ffffff');
      }
      for (let k = 0; k < 24; k++) disc(ctx, 190 + hash(k) * 40, 70 + hash(k * 2.3) * 30, 1 + hash(k * 3) * 1.2, '#f8f8ff');
      // Small waves along the bottom of the mural.
      for (let x = -20; x < w; x += 46) {
        fillFn(ctx, x, 104, 46, 22, (px, py) => {
          const u = (px - x) / 46;
          const tp = 118 - Math.sin(u * Math.PI) * 10 * (u < 0.6 ? 1 : 0.7);
          if (py < tp) return null;
          if (py < tp + 2) return '#f8f8ff';
          return pick(wave, 0.55 - (py - tp) / 20 + (((py - tp) | 0) % 4 === 0 ? 0.25 : 0), px, py);
        });
        for (let k = 0; k < 3; k++) disc(ctx, x + 22 + k * 4, 107 - k, 1.5, '#ffffff');
      }
      // Grout lines over the whole mural: darken what is there.
      const img = ctx.getImageData(0, 26, w, 100).data;
      for (let y = 0; y < 100; y++) {
        for (let x = 0; x < w; x++) {
          if (y % 12 !== 11 && x % 12 !== 11) continue;
          const i = (y * w + x) * 4;
          ctx.fillStyle = `rgb(${img[i] * 0.8 | 0},${img[i + 1] * 0.8 | 0},${img[i + 2] * 0.82 | 0})`;
          ctx.fillRect(x, y + 26, 1, 1);
        }
      }
      rect(ctx, 0, 126, w, 26, '#b8b4a8');
    },
    mid: (ctx, w) => {
      const wood = tones('#a07040', 5, 0.6, 0.4, '#2a1008', '#fff0c8');
      // The ceiling beam and the pillars framing the mural.
      pipe(ctx, 0, 22, w, 8, R.darkWood);
      for (const px of [96, w - 104]) {
        cylinder(ctx, px, 26, 10, 124, R.darkWood);
        block(ctx, px - 3, 26, 16, 6, R.darkWood);
      }
      // Wooden walls at the far ends, a doorway curtain on the right.
      for (const [x0, ww] of [[0, 96], [w - 94, 94]] as const) {
        fillFn(ctx, x0, 30, ww, 120, (px, py) => pick(wood, 0.5 + (vnoise(px / 2, py / 20, 3) - 0.5) * 0.3 - ((px - x0) % 14 === 0 ? 0.35 : 0) - (py - 30) / 300, px, py));
      }
      fillFn(ctx, w - 80, 40, 60, 46, (px, py) => {
        const k = Math.floor((px - (w - 80)) / 15);
        const lx = (px - (w - 80)) % 15;
        if (lx === 14 && py > 50) return null;
        return pick(tones('#2a3a7a', 4, 0.5, 0.3), 0.7 - lx / 22 + (k % 2) * 0.05, px, py);
      });
      rect(ctx, w - 82, 38, 64, 3, R.darkWood[2]);
      sphere(ctx, w - 50, 56, 7, tones('#f0ece0', 3));
      glyphs(ctx, w - 54, 52, 8, 8, 1, '#2a3a7a', 41, 0, 1);
      // A shelf of folded towels and a wooden sign on the left wall.
      rect(ctx, 10, 76, 76, 3, wood[3]);
      for (let k = 0; k < 6; k++) {
        const c = tones(of(['#f0f0f0', '#e8a0a0', '#a0c0e8'], k), 3, 0.4, 0.3);
        rect(ctx, 14 + k * 12, 68, 10, 8, c[1]);
        rect(ctx, 14 + k * 12, 68, 10, 2, c[2]);
        rect(ctx, 14 + k * 12, 72, 10, 1, c[0]);
      }
      block(ctx, 24, 36, 40, 24, R.darkWood);
      rect(ctx, 26, 38, 36, 20, '#e8dcc0');
      glyphs(ctx, 30, 41, 12, 14, 1, '#1a1410', 12, 0, 2);
      glyphs(ctx, 46, 41, 12, 14, 1, '#1a1410', 33, 0, 2);
      // The great tub: water, a rim, staves and copper hoops.
      const tx = 112;
      const tw = w - 224;
      vgrad(ctx, tx + 4, 106, tw - 8, 8, ['#a8e0f0', '#68b8e0', '#3a88c0']);
      fillFn(ctx, tx, 112, tw, 34, (px, py) => {
        if (py < 116) return pick(wood, py === 112 ? 0.98 : 0.72 - (py - 112) * 0.12, px, py);
        if (py === 116) return wood[0];
        const k = (px - tx) % 10;
        if (py === 124 || py === 125 || py === 138 || py === 139) return pick(tones('#b8683a', 4, 0.55, 0.45), py % 2 ? 0.25 : 0.85, px, py);
        const v = 0.55 - (k === 0 ? 0.4 : k === 1 ? -0.15 : 0) + (vnoise(px / 3, py / 12, 7) - 0.5) * 0.25 - (py - 116) / 80;
        return pick(wood, v, px, py);
      });
      rect(ctx, tx, 146, tw, 2, '#2a1808');
      // Buckets stacked by the tub, a stool.
      const bucketR = tones('#c89050', 4, 0.6, 0.35);
      const hoop = tones('#3a3a4a', 3);
      for (const [bx, by] of [[112, 134], [128, 134], [120, 122]] as const) barrel(ctx, bx, by, 14, 12, bucketR, hoop);
      for (const [bx, by] of [[w - 128, 134], [w - 144, 134]] as const) barrel(ctx, bx, by, 14, 12, bucketR, hoop);
      block(ctx, w - 170, 132, 20, 4, wood);
      rect(ctx, w - 168, 136, 2, 10, wood[1]);
      rect(ctx, w - 154, 136, 2, 10, wood[1]);
      // Red paper lanterns from the beam.
      for (const lx of [160, w - 160]) paperLantern(ctx, lx, 44, 7, 10, tones('#e03028', 5, 0.55, 0.4, '#3a0808', '#ffe0a0'), '#1a0808', true);
      rect(ctx, 0, 146, w, 4, '#5a3a20');
      rect(ctx, 0, 146, w, 1, '#a07040');
    },
    floor: (ctx, w, h, hor) => plankFloor(ctx, w, h, hor, { ramp: tones('#b8905e', 5, 0.55, 0.4, '#3a1a10', '#fff8e0'), gap: '#4a2a18', d: 0.07, len: 140, seed: 8, wet: '#f0dcb0' }),
    liveBack: (ctx, midX, t) => {
      const tx = 112 - midX;
      for (let i = 0; i < 12; i++) {
        const x = tx + 10 + ((i * 37 + t * 0.15 * ((i % 3) + 1)) % (MID_W - 250));
        rect(ctx, x, 107 + (i % 3) * 2, 3 + (i % 4), 1, '#e8f8ff');
      }
    },
    live: (ctx, midX, t) => {
      for (let i = 0; i < 9; i++) {
        const x0 = 130 + i * 42 - midX;
        const ph = (t * 0.25 + i * 17) % 60;
        const y = 106 - ph;
        const x = x0 + Math.sin((t + i * 30) / 25) * 5 + ph * 0.1;
        const wv = 8 + ph / 8;
        if (ph > 30) continue;
        fillFn(ctx, x, y, wv, 6, (px, py) => (((px + py) & 1) === 0 && hash(px * 7 + py * 3 + i) > 0.35 ? '#f8fcff' : null));
      }
    }
  },

  // A river village in the jungle: huts on stilts, a dugout and the dock.
  rio: {
    horizon: 154,
    sky: ctx => {
      vgrad(ctx, 0, 0, SCREEN_W, 154, ['#2a78c0', '#4890d0', '#68a8d8', '#90c0e0', '#c0dce0']);
      cloud(ctx, 20, 14, 140, 30, tones('#e0e8f0', 4, 0.4, 0.4, '#5a7898', '#ffffff'), 4);
      cloud(ctx, 230, 34, 120, 22, tones('#e0e8f0', 4, 0.4, 0.4, '#5a7898', '#ffffff'), 13);
    },
    far: (ctx, w) => {
      hills(ctx, w, 112, 40, tones('#4a8a6a', 4, 0.5, 0.25, '#0a2a28', '#b8e0c0'), 21, 50, '#90b8b0');
      for (let x = 0; x < w; x += 22) canopy(ctx, x + hash(x) * 10, 104 - hash(x * 3) * 10, 14, tones('#2e6a3a', 5, 0.6, 0.3, '#041810', '#c8e890'), x);
    },
    mid: (ctx, w) => {
      // The river, brown-green, catching the sky.
      fillFn(ctx, 0, 112, w, 42, (px, py) => {
        const d = py - 112;
        const shade = d < 10 ? 0.15 + d * 0.02 : 0.35 + (d - 10) / 60;
        const ripple = Math.sin(px / (5 + d * 0.15) + d * 1.9 + Math.sin(px / 23) * 2) > 0.8 ? 0.3 : 0;
        return pick(['#1e3a2e', '#2e4e3a', '#46684e', '#6a9078', '#9cc0c0', '#c8e0e0'], shade + ripple + (fbm(px / 30, d / 4, 2) - 0.5) * 0.2, px, py);
      });
      // A waterfall spilling into the river upstream.
      fillFn(ctx, w / 2 - 50, 70, 22, 44, (px, py) => pick(['#7ab0c0', '#b8e0e8', '#f0f8ff'], 0.5 + Math.sin(px * 1.7 + py * 0.3) * 0.4, px, py));
      for (let k = 0; k < 10; k++) disc(ctx, w / 2 - 50 + hash(k) * 24, 114 + hash(k * 3) * 4, 2 + hash(k * 7) * 2, '#e8f4f8');
      // Jungle on the far bank.
      for (let x = -10; x < w; x += 30) canopy(ctx, x + 10, 96 - hash(x + 5) * 20, 18 + hash(x) * 8, R.leaf, x + 3);
      fillFn(ctx, 0, 104, w, 10, (px, py) => pick(tones('#3a5a2a', 4), 0.5 - (py - 104) / 12 + (hash(px * 1.3) - 0.5) * 0.5, px, py));
      // Huts on stilts with thatched roofs.
      const thatch = tones('#b89048', 5, 0.6, 0.35, '#3a1a08', '#fff0b0');
      for (const hx of [70, 330]) {
        for (const sx of [0, 22, 44, 66]) cylinder(ctx, hx + sx, 90, 4, 34, R.trunk);
        fillFn(ctx, hx - 6, 86, 82, 5, (px, py) => pick(R.wood, py === 86 ? 0.9 : 0.4, px, py));
        fillFn(ctx, hx + 2, 62, 66, 24, (px, py) => pick(tones('#8a6a3a', 4), 0.5 + ((px % 4 === 0) ? -0.3 : 0) - (py - 62) / 60, px, py));
        rect(ctx, hx + 26, 68, 16, 18, '#2a1a10');
        rect(ctx, hx + 8, 68, 10, 8, '#2a1a10');
        rect(ctx, hx + 50, 68, 10, 8, '#2a1a10');
        fillFn(ctx, hx - 16, 30, 102, 36, (px, py) => {
          const dx = Math.abs(px + 0.5 - (hx + 35));
          const top = 30 + dx * 0.62;
          if (py < top) return null;
          if (py > 62 + Math.sin(px * 1.7) * 2) return null;
          const strand = (px * 3 + Math.floor(py / 3) * 2) % 5 === 0;
          return pick(thatch, 0.7 - (py - top) / 40 - (px > hx + 35 ? 0.2 : 0) + (strand ? -0.3 : 0), px, py);
        });
        // A ladder down to the water.
        for (let k = 0; k < 6; k++) rect(ctx, hx + 26, 92 + k * 5, 12, 1, R.wood[3]);
        rect(ctx, hx + 26, 90, 1, 32, R.wood[1]);
        rect(ctx, hx + 37, 90, 1, 32, R.wood[1]);
      }
      // A dugout canoe with a fisherman's net.
      fillFn(ctx, 200, 128, 70, 8, (px, py) => {
        const u = (px - 200) / 70;
        const half = 4 * Math.sin(u * Math.PI);
        if (py - 128 > half + 3) return null;
        return pick(R.darkWood, 0.7 - (py - 128) / 8, px, py);
      });
      for (let k = 0; k < 8; k++) line(ctx, 214 + k * 4, 128, 220 + k * 4, 124, '#c8c0a0');
      // Palms and hanging vines close by.
      palm(ctx, 10, 148, 94, 0.5, R.trunk, R.leaf);
      palm(ctx, w - 30, 148, 100, -0.6, R.trunk, R.leaf);
      palm(ctx, w / 2 + 30, 116, 70, 0.3, R.trunk, R.leaf);
      for (let x = 7; x < w; x += 37 + Math.floor(hash(x) * 20)) {
        const len = 14 + hash(x * 7) * 34;
        for (let y = 0; y < len; y++) {
          const vx = x + Math.round(Math.sin(y / 7 + x) * 2);
          rect(ctx, vx, y, 1, 1, R.leaf[0]);
          if (y % 4 === 1) {
            const sd = (y >> 2) % 2 ? 1 : -2;
            rect(ctx, vx + sd, y, 2, 2, R.leaf[2 + ((y >> 3) % 2)]);
          }
        }
      }
      // Big leaves in the top corners.
      for (const [lx, ly, dir] of [[0, 0, 1], [w, 0, -1]] as const) {
        for (let k = 0; k < 5; k++) {
          const a = 0.2 + k * 0.28;
          const ex = lx + dir * Math.cos(a) * 60;
          const ey = ly + Math.sin(a) * 40;
          fillFn(ctx, Math.min(lx, ex) - 8, ly - 8, Math.abs(ex - lx) + 16, ey - ly + 16, (px, py) => {
            const t = ((px - lx) * (ex - lx) + (py - ly) * (ey - ly)) / ((ex - lx) ** 2 + (ey - ly) ** 2);
            if (t < 0 || t > 1) return null;
            const cx = lx + (ex - lx) * t;
            const cy = ly + (ey - ly) * t;
            const dist = Math.hypot(px - cx, py - cy);
            const wdt = Math.sin(t * Math.PI) * 9;
            if (dist > wdt) return null;
            return pick(R.leaf, 0.6 - dist / 20 + (dist < 1 ? 0.3 : 0), px, py);
          });
        }
      }
    },
    front: (ctx, w) => {
      // The dock edge and its posts.
      for (let x = 6; x < w; x += 52) {
        cylinder(ctx, x, 132, 7, 22, R.trunk);
        ellipse(ctx, x + 3.5, 132, 3.5, 1.5, R.trunk[3]);
        for (let k = 0; k < 3; k++) rect(ctx, x - 1, 138 + k * 2, 9, 1, '#c8b080');
      }
      fillFn(ctx, 0, 148, w, 6, (px, py) => pick(R.darkWood, py === 148 ? 0.9 : 0.4 - (py - 148) * 0.05, px, py));
    },
    floor: (ctx, w, h, hor) => plankFloor(ctx, w, h, hor, { ramp: tones('#8a6a44', 5, 0.62, 0.38, '#1a1008', '#f8e8b0'), gap: '#1a1008', d: 0.06, seed: 9, along: 20, nail: '#3a3028' }),
    crowd: {
      ink: '#0a1408',
      spots: [[84, 86], [104, 86], [122, 86], [346, 86], [366, 86], [390, 86], [226, 130], [250, 131], [170, 110], [292, 109], [470, 110], [520, 111]],
      look: i => folk(i, ['#f0f0f0', '#e8c030', '#3a8a3a', '#d84030', '#e888a8'], ['#5a4a3a', '#3a5a8a', '#e8e0c8'], hash(i * 2.3) < 0.3 ? { hat: 'cone', hatColor: '#d8c080' } : {}, ['#a06a44', '#8a5434', '#c88a60', '#6a4028'])
    },
    live: (ctx, midX, t) => {
      for (let i = 0; i < 16; i++) {
        const x = ((i * 61 + t * (0.25 + (i % 3) * 0.1)) % MID_W) - midX;
        rect(ctx, x, 116 + (i % 6) * 5, 6 + (i % 3) * 3, 1, i % 2 ? '#a8c8b8' : '#6a8a78');
      }
      // A bird crossing.
      const bx = ((t * 0.8) % (MID_W + 80)) - 40 - midX;
      const wing = Math.floor(t / 6) % 2;
      rect(ctx, bx, 50, 4, 1, '#1a1a1a');
      rect(ctx, bx - 2, 50 - wing * 2, 2, 1, '#1a1a1a');
      rect(ctx, bx + 4, 50 - wing * 2, 2, 1, '#1a1a1a');
    }
  },

  // The air base: a fighter jet on the apron, a hangar, the flight line.
  duke: {
    horizon: 152,
    sky: ctx => {
      vgrad(ctx, 0, 0, SCREEN_W, 152, ['#2860b8', '#3c74c4', '#5088cc', '#6c9ed4', '#90b8dc', '#b8d0e0']);
      cloud(ctx, 40, 30, 90, 18, tones('#e8eef4', 4, 0.35, 0.5, '#6880a8', '#ffffff'), 3);
      cloud(ctx, 220, 52, 120, 16, tones('#e8eef4', 4, 0.35, 0.5, '#6880a8', '#ffffff'), 8);
    },
    far: (ctx, w) => {
      hills(ctx, w, 128, 32, tones('#7890a8', 4, 0.4, 0.3, '#30405a', '#d0e0f0'), 31, 60, '#a0b8cc');
      // Distant hangars and the control tower.
      const far = tones('#8a96a0', 4, 0.4, 0.3);
      for (const hx of [40, 120, 300]) {
        fillFn(ctx, hx, 112, 60, 18, (px, py) => {
          const dx = (px - hx - 30) / 30;
          if (py < 112 + dx * dx * 8) return null;
          return pick(far, 0.6 - (py - 112) / 30, px, py);
        });
        rect(ctx, hx + 18, 120, 24, 10, far[0]);
      }
      const tx = 230;
      block(ctx, tx, 92, 10, 38, far);
      rect(ctx, tx - 5, 84, 20, 8, '#2a3a4a');
      rect(ctx, tx - 4, 85, 18, 4, '#6aa0c8');
      rect(ctx, tx - 6, 82, 22, 2, far[3]);
      // The fence along the perimeter.
      for (let x = 0; x < w; x += 2) rect(ctx, x, 132, 1, 10, (x / 2) % 2 ? '#8898a0' : '#6a7a88');
      for (let x = 0; x < w; x += 30) rect(ctx, x, 128, 2, 14, '#5a6a78');
      rect(ctx, 0, 132, w, 1, '#a0b0b8');
    },
    mid: (ctx, w) => {
      // The hangar on the right, its door open on a dark bay.
      const hang = tones('#7a8078', 5, 0.55, 0.3);
      const hx = w - 200;
      corrugated(ctx, hx, 60, 196, 92, hang, 2, 4);
      fillFn(ctx, hx - 6, 40, 208, 22, (px, py) => {
        const dx = (px - (hx + 98)) / 104;
        if (py < 40 + dx * dx * 20) return null;
        return pick(hang, 0.75 - (py - 40) / 40, px, py);
      });
      fillFn(ctx, hx + 26, 82, 144, 70, (px, py) => pick(['#0e100e', '#1a1c1a', '#2a2c28'], 0.3 + (py - 82) / 140 + (hash(px) > 0.97 ? 0.4 : 0), px, py));
      for (let x = hx + 26; x < hx + 170; x += 24) rect(ctx, x, 82, 1, 70, '#3a3c38');
      rect(ctx, hx + 26, 82, 144, 3, '#e8c020');
      for (let k = 0; k < 144; k += 8) rect(ctx, hx + 26 + k, 82, 4, 3, '#1a1a1a');
      rect(ctx, hx + 70, 64, 56, 12, '#d8dcd0');
      glyphs(ctx, hx + 74, 66, 8, 8, 1, '#2a2a2a', 5, 0);
      rect(ctx, hx + 86, 66, 36, 8, '#2a2a2a');
      rect(ctx, hx + 87, 67, 34, 6, '#d8dcd0');
      for (let k = 0; k < 5; k++) rect(ctx, hx + 89 + k * 7, 68, 4, 4, '#2a2a2a');
      // The jet: a single-engine fighter in two greys, nose to the left, keyed off the apron with an outline.
      inked(ctx, '#18202c', g => {
        const jet = tones('#8e98a2', 6, 0.6, 0.4, '#141c2c', '#f4faff');
        const jx = 100;
        const jy = 112;
        fillFn(g, jx, jy - 12, 230, 26, (px, py) => {
          const u = (px - jx) / 230;
          const top = jy - (u < 0.12 ? (u / 0.12) * 7 : 7 + Math.min(1, (u - 0.12) / 0.2) * 2) + (u > 0.85 ? (u - 0.85) * 10 : 0);
          const bot = jy + (u < 0.1 ? (u / 0.1) * 5 : 5 + Math.min(1, (u - 0.1) / 0.25) * 5) - (u > 0.88 ? (u - 0.88) * 30 : 0);
          if (py < top || py > bot) return null;
          const t = (py - top) / Math.max(1, bot - top);
          let v = 0.9 - t * 0.8;
          if ((px - jx) % 23 === 0 && u > 0.15) v -= 0.25;
          if (Math.round(py) === Math.round(jy + 1)) v -= 0.22;
          return pick(jet, v, px, py);
        });
        // Nose cone and pitot.
        fillFn(g, jx - 16, jy - 6, 18, 12, (px, py) => {
          const u = (px - (jx - 16)) / 18;
          const half = Math.sqrt(u) * 5.5;
          if (Math.abs(py + 0.5 - (jy - 0.5)) > half) return null;
          return pick(tones('#4a525e', 4, 0.5, 0.35), 0.75 - (py - jy + 6) / 12, px, py);
        });
        rect(g, jx - 24, jy - 1, 9, 1, '#6a7280');
        // Intake under the cockpit.
        fillFn(g, jx + 46, jy + 2, 44, 11, (px, py) => (px - jx - 46 < (py - jy - 2) * 2 ? null : pick(jet, 0.3 - (py - jy) / 40, px, py)));
        rect(g, jx + 48, jy + 4, 7, 7, '#0e1218');
        // The canopy: dark glass with a streak of sky.
        fillFn(g, jx + 22, jy - 21, 60, 15, (px, py) => {
          const dx = (px + 0.5 - (jx + 50)) / 28;
          const dy = (py + 0.5 - (jy - 7)) / 13;
          if (dx * dx + dy * dy > 1 || py > jy - 7) return null;
          const streak = Math.abs(dx * 0.8 + dy + 0.35) < 0.12;
          return pick(['#1a2638', '#2a4460', '#4a7898', '#90c8e0', '#ffffff'], 0.25 - dy * 0.35 - dx * 0.2 + (streak ? 0.75 : 0), px, py);
        });
        rect(g, jx + 50, jy - 20, 1, 13, '#3a4450');
        // The wing in plan, a little below the spine, with its shadow.
        poly(g, [[jx + 88, jy + 2], [jx + 168, jy - 3], [jx + 180, jy + 2], [jx + 172, jy + 6], [jx + 108, jy + 9]], jet[1]);
        poly(g, [[jx + 88, jy + 2], [jx + 168, jy - 3], [jx + 171, jy - 1], [jx + 98, jy + 3]], jet[4]);
        line(g, jx + 110, jy + 7, jx + 170, jy + 4, jet[0]);
        // The fin, the tailplane, the nozzle.
        poly(g, [[jx + 174, jy - 7], [jx + 198, jy - 46], [jx + 216, jy - 46], [jx + 214, jy - 8]], jet[2]);
        poly(g, [[jx + 174, jy - 7], [jx + 198, jy - 46], [jx + 202, jy - 46], [jx + 180, jy - 7]], jet[5]);
        poly(g, [[jx + 210, jy - 46], [jx + 216, jy - 46], [jx + 214, jy - 8], [jx + 210, jy - 8]], jet[1]);
        rect(g, jx + 200, jy - 36, 14, 4, '#e8c020');
        rect(g, jx + 200, jy - 32, 14, 1, '#a88010');
        poly(g, [[jx + 194, jy + 3], [jx + 234, jy + 1], [jx + 238, jy + 7], [jx + 204, jy + 9]], jet[1]);
        fillFn(g, jx + 228, jy - 6, 12, 14, (px, py) => pick(tones('#3a3a42', 4), 0.7 - Math.abs(py - jy) / 9 - (px - jx - 228) / 20, px, py));
        rect(g, jx + 238, jy - 4, 2, 10, '#1a1a20');
        // Markings: a roundel, a serial, warning stripes on the intake.
        disc(g, jx + 132, jy - 2, 5, '#f0f0f0');
        disc(g, jx + 132, jy - 2, 3.5, '#2a4a9a');
        disc(g, jx + 132, jy - 2, 1.5, '#d83030');
        for (let k = 0; k < 4; k++) rect(g, jx + 150 + k * 4, jy - 4, 3, 3, '#2a3240');
        rect(g, jx + 64, jy - 1, 2, 4, '#d83030');
        // Drop tank, missile on the wingtip rail, the gear.
        fillFn(g, jx + 104, jy + 11, 44, 7, (px, py) => {
          const u = (px - jx - 104) / 44;
          const half = 3.4 * Math.sqrt(Math.max(0, 1 - (u * 2 - 1) ** 4));
          if (Math.abs(py + 0.5 - (jy + 14.5)) > half) return null;
          return pick(jet, 0.8 - (py - jy - 11) / 7, px, py);
        });
        rect(g, jx + 150, jy + 8, 40, 2, '#e8e8e8');
        rect(g, jx + 150, jy + 9, 40, 1, '#a8a8b0');
        poly(g, [[jx + 186, jy + 8], [jx + 192, jy + 5], [jx + 192, jy + 12]], '#a8a8b0');
        rect(g, jx + 146, jy + 8, 4, 2, '#d83030');
        for (const [gx, gl] of [[jx + 22, 22], [jx + 148, 20]] as const) {
          rect(g, gx, jy + 8, 2, gl, '#3a3a42');
          rect(g, gx - 2, jy + 8 + gl - 8, 6, 2, '#5a5a62');
          sphere(g, gx + 1, jy + 8 + gl, 4.5, tones('#2a2a30', 4, 0.5, 0.4));
          disc(g, gx + 1, jy + 8 + gl, 1.5, '#9a9aa0');
        }
        // A boarding ladder.
        line(g, jx + 40, jy - 6, jx + 30, jy + 34, '#c8a818');
        line(g, jx + 46, jy - 6, jx + 36, jy + 34, '#c8a818');
        for (let k = 0; k < 7; k++) rect(g, jx + 39 - k * 1.4, jy - 2 + k * 5.5, 6, 1, '#e8c828');
      });
      // Fuel drums and chocks by the hangar.
      for (const [dx, dy] of [[352, 132], [368, 132], [360, 114]] as const) drum(ctx, dx, dy, 14, 18, tones(dy < 120 ? '#4a6a3a' : '#5a7a4a', 4));
      // The flight line along the front.
      rect(ctx, 0, 150, w, 2, '#3a3a34');
    },
    floor: (ctx, w, h, hor) =>
      tileFloor(ctx, w, h, hor, {
        ramp: tones('#9c9c94', 5, 0.5, 0.35, '#2a2a30', '#f0f0e0'),
        grout: '#4a4a44',
        tw: 120,
        d: 0.22,
        seed: 7,
        crack: '#6a6a60',
        wear: 0.7,
        inlay: (u, v, col, row, sz) => {
          if (row === 2 && Math.abs(v - 0.5) * sz < 1.2 && (col % 2 === 0 || u < 0.5)) return '#e8c838';
          if (hash(col * 3.1 + row * 7.7) > 0.7 && Math.hypot((u - 0.4) * 4, v - 0.5) < 0.18 + fbm(u * 8, v * 3, col) * 0.12) return '#84847c';
          return null;
        }
      }),
    crowd: {
      ink: '#141a20',
      spots: [[60, 146], [214, 147], [298, 144], [392, 146], [412, 142], [470, 146], [496, 143], [526, 146], [566, 144]],
      look: i => ({ top: of(['#5a6a3a', '#4e5e30', '#6a7444'], i), bottom: '#4a5a32', skin: of(SKINS, i * 2.3), hair: '#2a1a10', hat: i % 3 === 0 ? 'cap' : 'helmet', hatColor: i % 3 === 0 ? '#3a4a2a' : '#5a6640', tall: 2 + (i % 2), sleeves: hash(i) > 0.5 })
    },
    live: (ctx, midX, t) => {
      // The windsock on its pole, and the hangar beacon.
      const x = MID_W - 230 - midX;
      rect(ctx, x, 70, 2, 80, '#c8c8c8');
      const flap = Math.sin(t / 10);
      for (let k = 0; k < 5; k++) {
        const sx = x + 2 + k * 5;
        const sy = 72 + Math.round(flap * k * 0.6) + k;
        rect(ctx, sx, sy, 5, 6 - k, k % 2 ? '#f0f0f0' : '#f06020');
      }
      if (Math.floor(t / 30) % 2) rect(ctx, MID_W - 102 - midX, 38, 4, 3, '#f83030');
      else rect(ctx, MID_W - 102 - midX, 38, 4, 3, '#6a1010');
    }
  },

  // Las Vegas at night: neon, a casino's lit doors, showgirls at the ropes.
  rocko: {
    horizon: 152,
    sky: ctx => {
      vgrad(ctx, 0, 0, SCREEN_W, 152, ['#060414', '#0e0820', '#180c30', '#28103e', '#401848', '#5a2048']);
      stars(ctx, SCREEN_W, 70, 40, 9, '#4a3a70', '#a8a0d0');
    },
    far: (ctx, w) => {
      // Towers with lit windows and neon crowns.
      let x = 0;
      let i = 0;
      while (x < w) {
        const bw = 22 + Math.floor(hash(i + 3) * 30);
        const bh = 50 + Math.floor(hash(i * 3.1 + 7) * 60);
        const top = 130 - bh;
        const bt = tones(of(['#2a1e48', '#1e1a3a', '#30204a'], i), 4, 0.5, 0.2);
        fillFn(ctx, x, top, bw, bh, (px, py) => pick(bt, 0.6 - (px - x) / bw * 0.5, px, py));
        for (let wy = top + 4; wy < 128; wy += 4) for (let wx = x + 2; wx < x + bw - 2; wx += 3) if (hash(wx * 3.3 + wy * 7.7) > 0.5) rect(ctx, wx, wy, 2, 2, hash(wx + wy) > 0.3 ? '#f8d870' : '#f8a0c8');
        const neon = of(['#f83088', '#40e8f8', '#f8e040', '#a050f8'], i * 2.2);
        rect(ctx, x, top, bw, 2, neon);
        if (i % 3 === 0) {
          rect(ctx, x + bw / 2 - 1, top - 18, 2, 18, '#4a3a5a');
          rect(ctx, x + bw / 2 - 1, top - 20, 2, 2, '#f83030');
        }
        x += bw + 2;
        i++;
      }
      // Searchlight beams, dithered.
      for (const [bx, a] of [[90, -0.25], [380, 0.3]] as const) {
        fillFn(ctx, 0, 0, w, 130, (px, py) => {
          const along = 130 - py;
          const cx = bx + a * along;
          return Math.abs(px - cx) < 2 + along * 0.06 && ((px + py) & 1) === 0 && ((px >> 1) + py) % 3 === 0 ? '#5a4a80' : null;
        });
      }
    },
    mid: (ctx, w) => {
      // The casino's frontage.
      const facade = tones('#3a2048', 5, 0.6, 0.3, '#060210', '#c8a0e0');
      fillFn(ctx, 0, 52, w, 100, (px, py) => pick(facade, 0.5 - (py - 52) / 300 + ((px % 40 < 2) ? -0.3 : 0) + (fbm(px / 20, py / 20, 3) - 0.5) * 0.2, px, py));
      // Lit doors: the bright lobby behind glass.
      for (const dx of [w / 2 - 70, w / 2 + 10]) {
        fillFn(ctx, dx, 98, 60, 54, (px, py) => pick(['#4a2a28', '#7a4830', '#a87040', '#d8a058', '#f0d088'], 0.85 - Math.abs(px - dx - 30) / 45 - (py - 98) / 90, px, py));
        for (let k = 0; k < 60; k += 15) rect(ctx, dx + k, 98, 2, 54, '#c8a040');
        rect(ctx, dx - 2, 96, 64, 3, '#f8e080');
      }
      // The marquee canopy and its bulbs.
      fillFn(ctx, w / 2 - 110, 78, 220, 18, (px, py) => pick(R.gold, py === 78 ? 0.98 : py > 92 ? 0.2 : 0.55 + Math.sin(px / 3) * 0.1, px, py));
      rect(ctx, w / 2 - 104, 82, 208, 8, '#1a0818');
      // Big neon signs: a star, dice, a cocktail glass, a spade.
      const star = (cx: number, cy: number, r: number, c: string) => {
        const pts: [number, number][] = [];
        for (let k = 0; k < 10; k++) {
          const a = -Math.PI / 2 + (k * Math.PI) / 5;
          const rr = k % 2 ? r * 0.45 : r;
          pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
        }
        poly(ctx, pts, c);
      };
      const sx = w / 2;
      rect(ctx, sx - 64, 24, 128, 50, '#120414');
      for (let k = 0; k < 128; k += 4) {
        rect(ctx, sx - 64 + k, 24, 2, 2, '#f8e8a0');
        rect(ctx, sx - 64 + k, 72, 2, 2, '#f8e8a0');
      }
      star(sx, 48, 20, '#f8d040');
      star(sx, 48, 14, '#fff8c0');
      for (const [cx, c] of [[sx - 44, '#40e8f8'], [sx + 44, '#f83088']] as const) {
        block(ctx, cx - 10, 38, 20, 20, tones(c, 4, 0.5, 0.4, '#100010', '#ffffff'));
        for (const [ox, oy] of [[-5, -5], [5, 5], [0, 0]]) disc(ctx, cx + ox, 48 + oy, 1.6, '#100018');
      }
      // Neon sign panels on the flanks.
      for (const [px0, c] of [[20, '#f83088'], [w - 110, '#40e8f8']] as const) {
        rect(ctx, px0, 60, 90, 30, '#0c0414');
        rect(ctx, px0 + 2, 62, 86, 1, c);
        rect(ctx, px0 + 2, 87, 86, 1, c);
        rect(ctx, px0 + 2, 62, 1, 26, c);
        rect(ctx, px0 + 87, 62, 1, 26, c);
        // A cocktail glass and a spade.
        if (c === '#f83088') {
          poly(ctx, [[px0 + 12, 68], [px0 + 30, 68], [px0 + 21, 78]], c);
          rect(ctx, px0 + 20, 78, 2, 6, c);
          rect(ctx, px0 + 15, 84, 12, 1, c);
          disc(ctx, px0 + 27, 67, 2, '#60f060');
        } else {
          disc(ctx, px0 + 70, 74, 6, c);
          disc(ctx, px0 + 76, 74, 6, c);
          poly(ctx, [[px0 + 64, 74], [px0 + 73, 64], [px0 + 82, 74]], c);
          rect(ctx, px0 + 72, 78, 2, 7, c);
        }
        for (let k = 0; k < 4; k++) rect(ctx, px0 + 40 + k * 10, 70, 6, 10, k % 2 ? '#f8e040' : c);
      }
      // Palms in planters.
      for (const px of [130, w - 150]) {
        palm(ctx, px, 140, 76, px < w / 2 ? -0.2 : 0.2, tones('#5a3a30', 4), tones('#1a5a3a', 5, 0.6, 0.4, '#020a08', '#90e0a0'));
        block(ctx, px - 10, 136, 24, 14, tones('#c8a060', 4));
      }
      rect(ctx, 0, 148, w, 4, '#a8a0b0');
      rect(ctx, 0, 148, w, 1, '#e8e0f0');
    },
    front: (ctx, w) => {
      // Velvet ropes between brass stanchions.
      for (let x = 20; x < w; x += 46) {
        cylinder(ctx, x, 128, 4, 20, R.brass);
        sphere(ctx, x + 2, 127, 3, R.brass);
        ellipse(ctx, x + 2, 148, 5, 1.5, R.brass[1]);
        for (let k = 0; k < 42; k++) {
          const sag = Math.sin((k / 42) * Math.PI) * 6;
          rect(ctx, x + 4 + k, 131 + Math.round(sag), 1, 2, k % 5 === 0 ? '#e83050' : '#b01838');
        }
      }
    },
    floor: (ctx, w, h, hor) => {
      const rows = rowsAt(h, hor, 0.3);
      grit(ctx, w, h, tones('#2e2a3a', 5, 0.6, 0.3, '#06040c', '#8a84a0'), 13, 0.35, (x, ry) => {
        if (rows.row[ry] === 1 && (x % 90) < 40 && Math.abs(rows.v[ry] - 0.5) * rows.size[ry] < 1.2) return '#e8e0c8';
        const n = vnoise(x / 5, ry / 16, 77) * (0.6 + 0.4 * vnoise(x / 60, 0, 3));
        if (n > 0.6) return pick(['#2a2638', '#4a2850', '#8a2a68', '#c84888'], (n - 0.6) * 4, x, ry);
        const m = vnoise(x / 5 + 40, ry / 16, 51) * (0.6 + 0.4 * vnoise(x / 60, 5, 9));
        if (m > 0.62) return pick(['#2a2638', '#203a58', '#2a6a90', '#50b0d0'], (m - 0.62) * 4, x, ry);
        return null;
      });
    },
    crowd: {
      ink: '#08020c',
      spots: spread(16, 30, 590, 146, 41, 2),
      look: i => {
        if (i % 4 === 1) return { top: of(['#f83088', '#40c8f8', '#f8d040'], i), bottom: '#f0e0c0', skin: of(SKINS, i * 3.3), hair: of(HAIRS, i), hat: 'plume', hatColor: of(['#f8f8f8', '#f878b8', '#80e8f8'], i * 1.3), skirt: true, long: true, tall: 2 };
        if (i % 4 === 3) return { top: '#1a1a22', bottom: '#1a1a22', skin: of(SKINS, i * 3.3), hair: of(HAIRS, i), stripes: undefined, tall: 2, sleeves: true };
        return folk(i, ['#f8f8f8', '#d82828', '#f8d040', '#40a0e8', '#e868a8'], ['#2a2a3a', '#1a1a1a', '#4a4a6a'], hash(i * 5) < 0.3 ? { hat: 'cowboy', hatColor: '#8a5a30' } : {});
      }
    },
    live: (ctx, midX, t) => {
      const x0 = MID_W / 2 - 110 - midX;
      const phase = Math.floor(t / 5);
      for (let k = 0; k < 52; k++) rect(ctx, x0 + 6 + k * 4, 84 + (k % 2) * 2, 2, 2, (k + phase) % 3 === 0 ? '#fff8c0' : '#8a6a20');
      const sx = MID_W / 2 - midX;
      for (let k = 0; k < 32; k++) {
        const on = (k + phase) % 4 < 2;
        rect(ctx, sx - 64 + k * 4, 24, 2, 2, on ? '#fff8d0' : '#6a5020');
        rect(ctx, sx + 62 - k * 4, 72, 2, 2, on ? '#fff8d0' : '#6a5020');
      }
      if (Math.floor(t / 47) % 5 === 0) rect(ctx, 22 - midX + 38, 62, 50, 26, '#0c0414');
    }
  },

  // A Spanish tavern courtyard at night: the cage, a flamenco dancer on the balcony.
  varga: {
    horizon: 152,
    sky: ctx => {
      vgrad(ctx, 0, 0, SCREEN_W, 152, ['#060820', '#0c1030', '#141840', '#20204c', '#302858']);
      stars(ctx, SCREEN_W, 80, 70, 21, '#4a4a80', '#e0e0ff');
      fillFn(ctx, 300, 14, 24, 24, (px, py) => {
        const a = Math.hypot(px - 312, py - 26);
        const b = Math.hypot(px - 318, py - 22);
        return a < 10 && b > 9 ? (px < 308 ? '#fff8d8' : '#e8e0b8') : null;
      });
    },
    far: (ctx, w) => {
      // The town on the hill: white houses, a bell tower.
      const town = tones('#3a3a60', 4, 0.5, 0.2, '#0a0a20');
      for (let x = 0; x < w; x += 18) {
        const bh = 10 + Math.floor(hash(x * 1.3) * 22);
        rect(ctx, x, 118 - bh, 16, bh + 34, town[1 + (x % 36 ? 0 : 1)]);
        poly(ctx, [[x - 1, 118 - bh], [x + 8, 112 - bh], [x + 17, 118 - bh]], '#3a2030');
        if (hash(x * 2.7) > 0.4) rect(ctx, x + 4, 124 - bh, 3, 4, '#f8c860');
      }
      rect(ctx, 200, 58, 18, 60, town[2]);
      rect(ctx, 204, 64, 10, 12, '#0a0a20');
      poly(ctx, [[198, 58], [209, 40], [220, 58]], '#3a2030');
    },
    mid: (ctx, w) => {
      // The tavern: whitewashed plaster lit warm by lanterns.
      const wall = tones('#d8c098', 5, 0.62, 0.35, '#1a0c18', '#fff8e0');
      plaster(ctx, 0, 34, w, 118, wall, 4, (px, py) => {
        let l = -0.25;
        for (const lx of [60, w / 2, w - 60]) l += Math.max(0, 0.45 - Math.hypot(px - lx, (py - 60) * 1.4) / 160);
        return l;
      }, 0.28);
      // Terracotta roof along the top.
      fillFn(ctx, 0, 22, w, 14, (px, py) => {
        const k = px % 8;
        if (py > 33) return '#2a1010';
        return pick(tones('#b85a30', 5, 0.6, 0.35), 0.8 - Math.abs(k - 3.5) / 5 - (py - 22) / 30 + ((py - 22) % 5 === 4 ? -0.3 : 0), px, py);
      });
      // Arched windows with shutters, flowers in pots.
      for (let x = 30; x < w; x += 110) {
        fillFn(ctx, x, 44, 28, 34, (px, py) => {
          const dx = px + 0.5 - (x + 14);
          if (py < 58 && dx * dx + (py - 58) ** 2 > 14 * 14) return null;
          return pick(['#1a0c10', '#3a1c18', '#6a3020'], 0.3 + (py - 44) / 60, px, py);
        });
        fillFn(ctx, x - 9, 54, 8, 24, (px, py) => pick(tones('#2a6a4a', 4), 0.6 - ((py - 54) % 3 === 0 ? 0.3 : 0), px, py));
        fillFn(ctx, x + 29, 54, 8, 24, (px, py) => pick(tones('#2a6a4a', 4), 0.4 - ((py - 54) % 3 === 0 ? 0.3 : 0), px, py));
        block(ctx, x - 2, 78, 32, 4, wall);
        for (let k = 0; k < 4; k++) {
          rect(ctx, x + 1 + k * 7, 74, 5, 4, '#b05028');
          for (let f = 0; f < 3; f++) disc(ctx, x + 2 + k * 7 + f * 2, 72 - (f % 2), 1.4, f % 2 ? '#f83040' : '#e81828');
          rect(ctx, x + 2 + k * 7, 73, 3, 1, '#3a8a3a');
        }
      }
      // The balcony running across, wrought iron.
      fillFn(ctx, 0, 100, w, 5, (px, py) => pick(R.darkWood, py === 100 ? 0.95 : 0.4, px, py));
      for (let x = 0; x < w; x += 6) {
        rect(ctx, x, 86, 1, 14, '#1a1418');
        if (x % 12 === 0) {
          disc(ctx, x + 3, 92, 2, '#1a1418');
          disc(ctx, x + 3, 92, 1, wall[2]);
        }
      }
      rect(ctx, 0, 85, w, 2, '#1a1418');
      for (let x = 20; x < w; x += 60) {
        rect(ctx, x, 105, 3, 8, '#3a2010');
        line(ctx, x + 3, 105, x + 10, 112, '#3a2010', 2);
      }
      // Wine barrels stacked by the door.
      const bar = tones('#8a4a28', 4, 0.6, 0.35);
      for (const [bx, by] of [[10, 128], [30, 128], [20, 110], [w - 50, 128], [w - 30, 128]] as const) barrel(ctx, bx, by, 18, 20, bar, tones('#3a3a44', 3));
      // The tavern door.
      fillFn(ctx, w / 2 - 20, 108, 40, 44, (px, py) => pick(R.darkWood, 0.5 - ((px - w / 2 + 20) % 8 === 0 ? 0.3 : 0) - (py - 108) / 100, px, py));
      rect(ctx, w / 2 - 22, 106, 44, 3, R.darkWood[3]);
      // Hanging iron lanterns.
      for (const lx of [60, w / 2, w - 60]) {
        rect(ctx, lx, 36, 1, 10, '#1a1418');
        poly(ctx, [[lx - 5, 46], [lx + 6, 46], [lx + 4, 58], [lx - 3, 58]], '#1a1418');
        rect(ctx, lx - 3, 48, 7, 8, '#f8c040');
        rect(ctx, lx - 1, 49, 3, 5, '#fff8c0');
        rect(ctx, lx, 48, 1, 8, '#1a1418');
      }
    },
    front: (ctx, w) => {
      // The cage: a mesh fence on posts with a top rail, crowd behind it.
      mesh(ctx, 0, 110, w, 40, '#9898a8', '#5a5a6a', 6);
      for (let x = 0; x < w; x += 72) cylinder(ctx, x, 104, 5, 46, R.steel);
      rect(ctx, 0, 108, w, 3, '#b8b8c8');
      rect(ctx, 0, 108, w, 1, '#e8e8f0');
      rect(ctx, 0, 149, w, 3, '#3a3a48');
    },
    floor: (ctx, w, h, hor) => tileFloor(ctx, w, h, hor, { ramp: tones('#c0704a', 5, 0.6, 0.35, '#2a0a0a', '#f8d0a0'), alt: tones('#b0603e', 5, 0.6, 0.35, '#2a0a0a', '#f8c898'), grout: '#5a2818', tw: 30, d: 0.085, seed: 10, crack: '#7a3a24', wear: 0.55 }),
    crowd: {
      ink: '#140810',
      spots: [[150, 100], ...spread(14, 20, 600, 146, 61, 2)],
      look: i => {
        if (i === 0) return { top: '#d81828', bottom: '#d81828', skin: '#e8b088', hair: '#120a0a', long: false, skirt: true, hat: 'flower', tall: 2 };
        return folk(i, ['#1a1a1a', '#d82828', '#f0f0f0', '#e8b040', '#6a2a5a'], ['#1a1a1a', '#3a2a2a', '#d82828'], hash(i * 7) < 0.25 ? { hat: 'beret', hatColor: '#1a1a1a' } : hash(i * 7) > 0.8 ? { hat: 'flower' } : {});
      }
    },
    live: (ctx, midX, t) => {
      // A guitarist beside the dancer on the balcony, strumming.
      const gx = 186 - midX;
      if (gx > -20 && gx < SCREEN_W + 20) {
        const strum = Math.floor(t / 5) % 2;
        rect(ctx, gx - 3, 84, 7, 9, '#1a1a1a');
        disc(ctx, gx, 80, 3, '#c88a60');
        rect(ctx, gx - 3, 76, 7, 2, '#120a0a');
        ellipse(ctx, gx + 3, 90, 4, 3, '#b8783a');
        rect(ctx, gx + 3, 89, 1, 1, '#1a0a0a');
        line(ctx, gx + 5, 88, gx + 12, 82, '#6a3a18');
        rect(ctx, gx + 1 + strum, 88, 2, 2, '#c88a60');
      }
      // The dancer's skirt flares in time.
      const dx = 150 - midX;
      if (dx > -20 && dx < SCREEN_W + 20) {
        const f = Math.floor(t / 7) % 2;
        poly(ctx, [[dx - 2, 92], [dx + 3, 92], [dx + 8 + f * 2, 100], [dx - 8 - (1 - f) * 2, 100]], '#d81828');
        for (let k = -6; k <= 6; k += 3) rect(ctx, dx + k + f, 99, 2, 1, '#f8f0e0');
      }
    }
  },

  // Temple ruins in Thailand at sunset: a reclining golden statue, palms, stupas.
  sakda: {
    horizon: 152,
    sky: ctx => {
      vgrad(ctx, 0, 0, SCREEN_W, 152, ['#3a2060', '#7a3060', '#c04a50', '#e87848', '#f8a848', '#f8d070']);
      halo(ctx, 250, 118, 70, ['#f8b850', '#f8c460', '#f8d070', '#fce090']);
      disc(ctx, 250, 118, 20, '#fff0b0');
      disc(ctx, 250, 118, 16, '#fffae0');
      streaks(ctx, SCREEN_W, 28, 100, ['#5a2858', '#a04060', '#e07050', '#f8a858', '#ffe0a0'], 31, true);
    },
    far: (ctx, w) => {
      // Silhouetted prangs and palms against the sun.
      const sil = tones('#5a2838', 4, 0.5, 0.2, '#1a0818', '#a85848');
      hills(ctx, w, 138, 14, sil, 41, 40);
      for (const [x, h] of [[60, 70], [180, 96], [300, 60], [420, 84]] as const) {
        fillFn(ctx, x - 20, 138 - h, 40, h, (px, py) => {
          const t = (py - (138 - h)) / h;
          const half = 2 + t * 16 + (Math.floor(t * 8) % 2) * 2;
          if (Math.abs(px + 0.5 - x) > half) return null;
          return pick(sil, 0.6 - (px - x) / 40 + ((py - 138 + h) % 8 === 0 ? 0.3 : 0), px, py);
        });
      }
      for (const x of [20, 120, 240, 360, 460]) palm(ctx, x, 140, 50 + hash(x) * 20, (hash(x * 2) - 0.5), sil, sil);
    },
    mid: (ctx, w) => {
      const stone = tones('#8a7a6a', 5, 0.62, 0.35, '#1a0a10', '#f8e0c0');
      // The plinth and the great reclining figure, head propped on a hand.
      const x = w / 2 - 130;
      stoneWall(ctx, x - 10, 116, 290, 24, stone, '#2a1a18', 20, 6, 4);
      fillFn(ctx, x - 14, 112, 298, 4, (px, py) => pick(stone, py === 112 ? 0.95 : 0.6, px, py));
      for (let k = 0; k < 290; k += 20) {
        rect(ctx, x - 6 + k, 124, 12, 8, stone[1]);
        disc(ctx, x + k, 128, 2, stone[3]);
      }
      const gold = tones('#d8a030', 6, 0.66, 0.5, '#3a1008', '#fffce0');
      inked(ctx, '#3a1408', g => {
        // The pillow under the elbow.
        fillFn(g, x - 4, 90, 46, 22, (px, py) => {
          const lx = px - x + 4;
          const ly = py - 90;
          if ((lx < 2 || lx > 43) && (ly < 2 || ly > 19)) return null;
          if (ly % 6 === 2) return '#e8b830';
          return pick(tones('#b02830', 4, 0.55, 0.35), 0.8 - ly / 26 - lx / 120, px, py);
        });
        // The body: shoulder, waist, hip, knee and feet along one line.
        const pts: [number, number][] = [[34, 78], [60, 74], [100, 82], [146, 74], [176, 80], [214, 86], [246, 92], [262, 96]];
        const topAt = (u: number) => {
          for (let i = 0; i + 1 < pts.length; i++) {
            const [ax, ay] = pts[i];
            const [bx, by] = pts[i + 1];
            if (u >= ax && u <= bx) {
              const t = (u - ax) / (bx - ax);
              const s2 = t * t * (3 - 2 * t);
              return ay + (by - ay) * s2;
            }
          }
          return 999;
        };
        fillFn(g, x + 30, 70, 236, 42, (px, py) => {
          const u = px - x;
          const top = topAt(u);
          if (py < top) return null;
          const t = (py - top) / Math.max(1, 112 - top);
          let v = 0.95 - Math.pow(t, 0.7) * 0.8;
          if (u > 60 && ((u * 0.55 + py * 1.3) % 15) < 1.2) v -= 0.3;
          if (Math.abs(py - (top + 7 + u * 0.02)) < 0.6) v -= 0.35;
          if (u > 236) v -= 0.15;
          return pick(gold, v, px, py);
        });
        // The upright forearm and the hand under the head.
        cylinder(g, x + 18, 72, 11, 32, gold);
        sphere(g, x + 23, 74, 6, gold);
        // The head: curls, a serene face, a long earlobe, the flame above.
        sphere(g, x + 30, 62, 13, gold, -0.5, -0.5, 1.15);
        for (let k = 0; k < 40; k++) {
          const a = Math.PI + (k / 40) * Math.PI;
          const rr = 9 + (k % 3) * 2;
          rect(g, Math.round(x + 30 + Math.cos(a) * rr), Math.round(56 + Math.sin(a) * rr * 0.8), 1, 1, gold[1]);
        }
        rect(g, x + 18, 56, 24, 1, gold[1]);
        sphere(g, x + 30, 44, 5, gold);
        poly(g, [[x + 27, 42], [x + 30, 28], [x + 33, 42]], gold[3]);
        poly(g, [[x + 30, 28], [x + 33, 42], [x + 30, 42]], gold[1]);
        rect(g, x + 22, 64, 5, 1, gold[0]);
        rect(g, x + 32, 64, 5, 1, gold[0]);
        rect(g, x + 29, 66, 1, 4, gold[2]);
        rect(g, x + 27, 71, 5, 1, gold[1]);
        rect(g, x + 41, 60, 3, 14, gold[2]);
        rect(g, x + 42, 63, 1, 9, gold[0]);
        // Soles of the feet at the far end, lotus-marked.
        for (const fy of [96, 104]) {
          ellipse(g, x + 262, fy, 5, 4.5, gold[3]);
          ellipse(g, x + 263, fy, 3, 3, gold[2]);
          rect(g, x + 262, fy - 1, 2, 2, '#c83020');
        }
      });
      // Broken columns and fallen blocks.
      for (const [cx, ch] of [[22, 70], [72, 40], [w - 40, 64], [w - 90, 30]] as const) {
        cylinder(ctx, cx, 148 - ch, 14, ch, stone);
        for (let y = 148 - ch + 6; y < 148; y += 10) rect(ctx, cx, y, 14, 1, stone[0]);
        fillFn(ctx, cx - 2, 146 - ch, 18, 4, (px, py) => (hash(px * 3.1) > 0.4 || py > 147 - ch ? pick(stone, 0.8, px, py) : null));
        for (let k = 0; k < 4; k++) disc(ctx, cx + hash(cx + k) * 14, 148 - ch + hash(cx * 2 + k) * ch, 2, R.leaf[1]);
      }
      block(ctx, 100, 136, 26, 14, stone);
      block(ctx, w - 130, 140, 20, 10, stone);
      // Palms.
      palm(ctx, 140, 140, 96, -0.6, R.trunk, tones('#3a7a2a', 5, 0.6, 0.35, '#0a1a08', '#e0f088'));
      palm(ctx, w - 150, 140, 104, 0.6, R.trunk, tones('#3a7a2a', 5, 0.6, 0.35, '#0a1a08', '#e0f088'));
      // Steps across the front.
      fillFn(ctx, 0, 140, w, 12, (px, py) => pick(stone, (py - 140) % 4 === 0 ? 0.9 : 0.4 - ((py - 140) % 4) * 0.08 + (fbm(px / 8, py, 9) - 0.5) * 0.3, px, py));
    },
    floor: (ctx, w, h, hor) => tileFloor(ctx, w, h, hor, { ramp: tones('#a89480', 5, 0.62, 0.35, '#2a1010', '#fff0d0'), grout: '#3a2a20', tw: 52, d: 0.12, seed: 11, stagger: true, crack: '#4a3a2a', wear: 0.7, moss: tones('#5a7a2a', 4, 0.5, 0.3) }),
    crowd: {
      ink: '#1a0a0a',
      spots: [[40, 146], [190, 140], [212, 142], [234, 140], [380, 140], [402, 142], [424, 141], [580, 146]],
      look: i => (i % 3 === 0 ? folk(i, ['#f0f0f0', '#3a6aa8', '#d83030'], ['#3a2a2a', '#5a4a3a'], {}, ['#b07a4a', '#a06a44', '#8a5434']) : { top: of(['#e88a20', '#d87018', '#f0a030'], i), bottom: '#e88a20', skin: of(['#b07a4a', '#a06a44', '#8a5434'], i), hair: '#1a1a1a', bald: true, robe: true, sash: '#b85810', tall: 1 })
    },
    live: (ctx, midX, t) => {
      // Incense smoke from a burner at the statue's feet.
      const x = MID_W / 2 + 120 - midX;
      for (let i = 0; i < 8; i++) {
        const ph = (t * 0.3 + i * 9) % 60;
        rect(ctx, Math.round(x + Math.sin((ph + i) / 7) * 3), Math.round(112 - ph), 1, 2, ph > 40 ? '#c8a088' : '#e8d0c0');
      }
      rect(ctx, x - 3, 112, 7, 4, '#6a4a20');
    }
  },

  // The final temple: a storm-red sky, great pillars, braziers, the crest.
  zar: {
    horizon: 150,
    sky: ctx => {
      vgrad(ctx, 0, 0, SCREEN_W, 150, ['#0e0410', '#200614', '#3a0a18', '#5a101c', '#7a1a1e', '#a02a1e']);
      streaks(ctx, SCREEN_W, 20, 110, ['#120408', '#2a0810', '#4a1018', '#8a2a20'], 51, false);
    },
    far: (ctx, w) => {
      hills(ctx, w, 150, 56, tones('#2a0a14', 4, 0.6, 0.25, '#060104', '#7a2a28'), 41, 36);
      for (let x = 30; x < w; x += 150) {
        fillFn(ctx, x - 20, 40, 40, 100, (px, py) => {
          const t = (py - 40) / 100;
          if (Math.abs(px + 0.5 - x) > 3 + t * 17) return null;
          return pick(tones('#3a0e18', 4, 0.6, 0.3, '#080104', '#a04030'), 0.6 - (px - x) / 30 + ((py - 40) % 12 === 0 ? 0.25 : 0), px, py);
        });
        rect(ctx, x - 1, 32, 2, 8, '#f8c040');
      }
    },
    mid: (ctx, w) => {
      const stone = tones('#5a4a50', 5, 0.62, 0.32, '#0a0408', '#d8c0c0');
      // The colonnade with gold bands.
      fillFn(ctx, 0, 28, w, 12, (px, py) => pick(stone, py === 28 ? 0.95 : py > 37 ? 0.15 : 0.5 + ((px % 20 < 2) ? -0.3 : 0), px, py));
      for (let x = 0; x < w; x += 20) rect(ctx, x + 8, 32, 4, 4, '#c89830');
      for (let x = 0; x < w; x += 88) {
        cylinder(ctx, x + 10, 40, 20, 106, stone);
        for (let y = 50; y < 146; y += 8) for (let k = 0; k < 20; k += 4) rect(ctx, x + 11 + k, y, 1, 6, stone[1]);
        fillFn(ctx, x + 10, 40, 20, 6, (px, py) => pick(R.gold, 0.9 - (px - x - 10) / 24 - (py - 40) * 0.05, px, py));
        fillFn(ctx, x + 10, 120, 20, 4, (px, py) => pick(R.gold, 0.9 - (px - x - 10) / 24, px, py));
        block(ctx, x + 6, 140, 28, 8, stone);
      }
      // Banners with the gold crest, hung between pillars.
      const crest = (cx: number, cy: number) => {
        for (const s of [-1, 1]) {
          for (let k = 0; k < 4; k++) poly(ctx, [[cx + s * 4, cy - 2 + k * 3], [cx + s * (18 - k * 2), cy - 10 + k * 5], [cx + s * (16 - k * 2), cy - 6 + k * 5], [cx + s * 4, cy + 2 + k * 3]], k % 2 ? '#c89028' : '#f0c040');
        }
        disc(ctx, cx, cy, 6, '#f0c040');
        disc(ctx, cx, cy, 4, '#5a0810');
        rect(ctx, cx - 2, cy - 1, 2, 2, '#f8e070');
        rect(ctx, cx + 1, cy - 1, 2, 2, '#f8e070');
        poly(ctx, [[cx - 5, cy + 6], [cx, cy + 16], [cx + 5, cy + 6]], '#f0c040');
      };
      for (let x = 44; x < w; x += 176) {
        fillFn(ctx, x, 44, 44, 76, (px, py) => {
          const dx = Math.abs(px + 0.5 - (x + 22));
          if (py > 110 && py - 110 > 10 - dx * 0.45) return null;
          return pick(tones('#7a0c18', 5, 0.6, 0.35, '#100004', '#f85048'), 0.6 - (px - x) / 70 + Math.sin((px - x) / 4) * 0.12 + (dx > 19 ? 0.3 : 0), px, py);
        });
        rect(ctx, x - 2, 42, 48, 3, R.gold[2]);
        crest(x + 22, 72);
      }
      // Guardian statues at the ends.
      for (const [sx, dir] of [[40, 1], [w - 40, -1]] as const) {
        block(ctx, sx - 16, 122, 32, 26, stone);
        sphere(ctx, sx, 110, 12, stone, -0.4 * dir, -0.6);
        sphere(ctx, sx + dir * 8, 96, 8, stone, -0.4 * dir, -0.6);
        rect(ctx, sx + dir * 10 - 1, 94, 3, 2, '#f8c040');
      }
      // Steps.
      fillFn(ctx, 0, 146, w, 4, (px, py) => pick(stone, py === 146 ? 0.9 : 0.3, px, py));
    },
    floor: (ctx, w, h, hor) =>
      tileFloor(ctx, w, h, hor, {
        ramp: tones('#4a3c40', 5, 0.62, 0.32, '#060204', '#d0b0b0'),
        alt: tones('#3e3236', 5, 0.62, 0.3, '#060204', '#c0a0a0'),
        grout: '#7a5a2a',
        tw: 48,
        d: 0.12,
        seed: 12,
        wear: 0.5,
        shine: '#7a5a58',
        inlay: (u, v) => (Math.abs(u - 0.5) < 0.03 && Math.abs(v - 0.5) < 0.12 ? '#a87828' : null)
      }),
    crowd: {
      ink: '#080204',
      spots: [...spread(4, 100, 250, 146, 71, 0), ...spread(4, 370, 520, 146, 81, 0)],
      look: i => ({ top: '#8a1420', bottom: '#2a1a1e', skin: of(SKINS, i * 1.9), hair: '#1a1418', hat: 'peaked', hatColor: '#8a1420', tall: 3, sleeves: true })
    },
    live: (ctx, midX, t) => {
      // Braziers burning before the pillars.
      for (let x = 88 + 44; x < MID_W; x += 176) {
        const sx = x - midX;
        if (sx < -16 || sx > SCREEN_W + 16) continue;
        rect(ctx, sx - 1, 124, 3, 22, '#3a2a20');
        poly(ctx, [[sx - 9, 116], [sx + 10, 116], [sx + 6, 124], [sx - 5, 124]], '#6a5030');
        rect(ctx, sx - 9, 116, 19, 1, '#c8a050');
        const f = Math.floor(t / 4 + x) % 3;
        poly(ctx, [[sx - 7, 116], [sx - 3, 104 - f * 2], [sx, 110], [sx + 3, 100 + f], [sx + 8, 116]], '#f87020');
        poly(ctx, [[sx - 4, 116], [sx - 1, 108 - f], [sx + 2, 106 + f], [sx + 5, 116]], '#f8d040');
        rect(ctx, sx - 1, 112, 3, 4, '#fff8c0');
      }
      // A lightning flash in the far sky now and then.
      const k = t % 400;
      if (k < 6 && k % 2 === 0) {
        let lx = 60 + ((Math.floor(t / 400) * 97) % 260);
        let ly = 0;
        while (ly < 80) {
          const nx = lx + (hash(ly + t) - 0.5) * 12;
          line(ctx, lx, ly, nx, ly + 8, '#fff0f0');
          lx = nx;
          ly += 8;
        }
      }
    }
  },

  // The bonus yards: a car park on the docks, a factory yard of drums.
  car: {
    horizon: 150,
    sky: ctx => {
      vgrad(ctx, 0, 0, SCREEN_W, 150, ['#3068c0', '#4880c8', '#6898d0', '#90b4d8', '#b8d0e0']);
      cloud(ctx, 60, 24, 120, 24, tones('#e8eef4', 4, 0.35, 0.5, '#6880a8', '#ffffff'), 6);
      cloud(ctx, 270, 40, 80, 16, tones('#e8eef4', 4, 0.35, 0.5, '#6880a8', '#ffffff'), 16);
    },
    far: (ctx, w) => {
      let x = 0;
      let i = 0;
      const bt = tones('#7a8aa0', 4, 0.4, 0.3, '#2a3048', '#d8e0f0');
      while (x < w) {
        const bw = 18 + Math.floor(hash(i + 51) * 26);
        const bh = 30 + Math.floor(hash(i * 3.1 + 51) * 60);
        block(ctx, x, 118 - bh, bw, bh, bt);
        for (let wy = 122 - bh; wy < 116; wy += 5) for (let wx = x + 3; wx < x + bw - 3; wx += 4) rect(ctx, wx, wy, 2, 3, hash(wx + wy * 3) > 0.5 ? '#b8c8e0' : bt[1]);
        x += bw + 2;
        i++;
      }
      // Harbour cranes.
      for (const cx of [80, 380]) {
        for (let y = 50; y < 118; y += 6) {
          line(ctx, cx, y, cx + 8, y + 6, '#c85030');
          line(ctx, cx + 8, y, cx, y + 6, '#c85030');
        }
        rect(ctx, cx, 50, 1, 68, '#c85030');
        rect(ctx, cx + 8, 50, 1, 68, '#c85030');
        rect(ctx, cx - 40, 46, 80, 4, '#c85030');
        rect(ctx, cx + 30, 50, 1, 30, '#4a4a4a');
      }
    },
    mid: (ctx, w) => {
      // A warehouse with roller doors.
      const wall = tones('#a89878', 5, 0.55, 0.3);
      corrugated(ctx, 0, 70, w, 80, wall, 3, 5);
      fillFn(ctx, 0, 62, w, 9, (px, py) => pick(tones('#6a5a4a', 4), py === 62 ? 0.95 : 0.4, px, py));
      for (let x = 20; x < w; x += 150) {
        fillFn(ctx, x, 84, 80, 66, (px, py) => pick(tones('#7a8088', 4), (py - 84) % 4 === 0 ? 0.2 : 0.6 - (px - x) / 200, px, py));
        rect(ctx, x - 2, 82, 84, 3, '#3a3a3a');
        rect(ctx, x + 30, 76, 20, 5, '#e8c020');
      }
      // Shipping containers stacked at the ends of the yard.
      const box = (bx: number, by: number, c: string) => {
        corrugated(ctx, bx, by, 64, 22, tones(c, 4, 0.55, 0.3), bx, 3);
        rect(ctx, bx, by, 64, 1, mix(c, '#ffffff', 0.4));
        rect(ctx, bx, by + 21, 64, 1, mix(c, '#000000', 0.5));
        for (const ex of [bx, bx + 62]) rect(ctx, ex, by, 2, 22, mix(c, '#000000', 0.35));
        rect(ctx, bx + 54, by + 4, 1, 14, '#2a2a2a');
        rect(ctx, bx + 58, by + 4, 1, 14, '#2a2a2a');
      };
      box(20, 118, '#b83a2a');
      box(36, 96, '#2a5a9a');
      box(w - 90, 118, '#3a8a5a');
      box(w - 100, 96, '#c88a30');
      // Crates, barrels, a pallet stack and a lamp post.
      for (const [cx, cy, cw, ch] of [[100, 120, 30, 30], [104, 96, 24, 24], [418, 124, 28, 26], [440, 130, 20, 20]] as const) crate(ctx, cx, cy, cw, ch, tones('#b08850', 4));
      for (const bx of [250, 266, 258]) barrel(ctx, bx, bx === 258 ? 112 : 130, 14, 20, tones('#3a6aa8', 4), tones('#4a4a54', 3));
      rect(ctx, w - 60, 40, 3, 110, '#3a3a3a');
      rect(ctx, w - 70, 38, 18, 4, '#3a3a3a');
      rect(ctx, w - 68, 42, 12, 2, '#f8f0c0');
      // A low concrete barrier the watchers lean on.
      fillFn(ctx, 0, 140, w, 10, (px, py) => pick(tones('#b0aca0', 4), py === 140 ? 0.95 : 0.55 - (py - 140) / 25 + ((px % 60) < 1 ? -0.4 : 0), px, py));
    },
    floor: (ctx, w, h, hor) => {
      const rows = rowsAt(h, hor, 0.35);
      grit(ctx, w, h, tones('#5a5a60', 5, 0.55, 0.35, '#10101a', '#e0e0e0'), 3, 0.45, (x, ry) => {
        if (rows.row[ry] >= 1 && x % 100 < 2) return '#e8e8e0';
        if (rows.row[ry] === 1 && rows.first[ry]) return '#e8e8e0';
        if (fbm(x / 18, ry / 4, 33) > 0.76) return '#4a4a50';
        return null;
      });
    },
    crowd: {
      ink: '#141820',
      spots: spread(12, 30, 590, 142, 91, 2),
      look: i => folk(i, ['#f0f0f0', '#d82828', '#2848a8', '#e8c040', '#3a8a5a'], ['#2a3a5a', '#3a3a3a', '#5a4a3a'], hash(i * 4) < 0.3 ? { hat: 'cap', hatColor: of(['#2848a8', '#d82828'], i) } : {})
    }
  },
  drums: {
    horizon: 150,
    sky: ctx => {
      vgrad(ctx, 0, 0, SCREEN_W, 150, ['#5a3a5a', '#a04a50', '#e07048', '#f09858', '#f0c078', '#e8d098']);
      halo(ctx, 90, 120, 40, ['#f0a858', '#f8b868', '#f8c878', '#f8d890']);
      disc(ctx, 90, 120, 12, '#fff0c0');
    },
    far: (ctx, w) => {
      const sil = tones('#5a3a40', 4, 0.5, 0.2, '#1a0a10', '#a06058');
      for (let x = 0; x < w; x += 38) {
        const bh = 20 + Math.floor(hash(x * 1.7) * 30);
        block(ctx, x, 130 - bh, 36, bh + 20, sil);
      }
      for (const cx of [60, 200, 330, 440]) {
        fillFn(ctx, cx, 30, 12, 100, (px, py) => pick(sil, 0.7 - (px - cx) / 14 + ((py - 30) % 14 === 0 ? 0.3 : 0), px, py));
        for (let k = 0; k < 6; k++) cloud(ctx, cx - 10 + k * 8, 6 - k * 2 + 18, 20 + k * 4, 10, tones('#a89090', 3, 0.4, 0.3), cx + k, 0.5);
      }
      // A cooling tower.
      fillFn(ctx, 250, 70, 50, 60, (px, py) => {
        const t = (py - 70) / 60;
        const half = 18 - Math.sin(t * Math.PI * 0.8) * 6 + t * 4;
        if (Math.abs(px - 275) > half) return null;
        return pick(sil, 0.65 - (px - 275) / 50, px, py);
      });
    },
    mid: (ctx, w) => {
      // A brick wall around the yard with a fence on top, pipes along it.
      stoneWall(ctx, 0, 88, w, 62, tones('#8a4a38', 5, 0.6, 0.3, '#1a0808', '#f8c8a0'), '#3a2420', 14, 6, 15);
      fillFn(ctx, 0, 84, w, 5, (px, py) => pick(tones('#8a8070', 4), py === 84 ? 0.95 : 0.3, px, py));
      for (let x = 0; x < w; x += 4) rect(ctx, x, 70, 1, 14, '#3a3036');
      rect(ctx, 0, 70, w, 1, '#6a6068');
      rect(ctx, 0, 76, w, 1, '#4a4048');
      for (let x = 0; x < w; x += 48) {
        rect(ctx, x, 64, 3, 20, '#3a3036');
        for (let k = 0; k < 6; k++) rect(ctx, x - 6 + k * 3, 64 + (k % 2), 2, 1, '#5a5058');
      }
      pipe(ctx, 0, 100, w, 6, R.steel);
      for (let x = 30; x < w; x += 80) rect(ctx, x, 99, 3, 8, R.steel[1]);
      // A storage tank and a gantry behind the wall.
      cylinder(ctx, w / 2 - 40, 30, 80, 56, tones('#9a9488', 5, 0.55, 0.35, '#2a1a18', '#fff0d8'));
      ellipse(ctx, w / 2, 30, 40, 5, '#b8b0a0');
      for (let y = 38; y < 86; y += 12) rect(ctx, w / 2 - 40, y, 80, 1, '#6a645a');
      rect(ctx, w / 2 - 12, 44, 24, 10, '#c82020');
      rect(ctx, w / 2 - 10, 48, 20, 2, '#f8f8f8');
      for (let y = 30; y < 86; y += 4) rect(ctx, w / 2 + 44, y, 6, 1, '#4a4038');
      rect(ctx, w / 2 + 44, 30, 1, 56, '#4a4038');
      rect(ctx, w / 2 + 49, 30, 1, 56, '#4a4038');
      // Oil drums stacked in pyramids.
      const stack = (x0: number, cols: readonly string[]) => {
        for (let k = 0; k < 3; k++) drum(ctx, x0 + k * 18, 130, 17, 20, tones(cols[k % cols.length], 4, 0.6, 0.4));
        for (let k = 0; k < 2; k++) drum(ctx, x0 + 9 + k * 18, 110, 17, 20, tones(cols[(k + 1) % cols.length], 4, 0.6, 0.4));
        drum(ctx, x0 + 18, 90, 17, 20, tones(cols[2 % cols.length], 4, 0.6, 0.4));
      };
      stack(118, ['#3a6aa8', '#c83a2a', '#c8a030']);
      stack(w - 172, ['#4a7a3a', '#3a6aa8', '#c83a2a']);
      // Pallets, a hand truck and a warning sign.
      for (const [px, py] of [[20, 142], [w - 60, 142]] as const) {
        for (let k = 0; k < 3; k++) rect(ctx, px, py + k * 3, 40, 2, R.wood[2 + (k % 2)]);
        for (let k = 0; k < 40; k += 13) rect(ctx, px + k, py, 3, 8, R.wood[1]);
      }
      rect(ctx, w / 2 + 90, 120, 2, 28, '#3a3a3a');
      rect(ctx, w / 2 + 90, 146, 14, 2, '#3a3a3a');
      disc(ctx, w / 2 + 96, 146, 3, '#1a1a1a');
      block(ctx, w / 2 - 20, 104, 40, 20, tones('#e8e0c8', 4));
      rect(ctx, w / 2 - 17, 107, 34, 14, '#c82020');
      rect(ctx, w / 2 - 13, 112, 26, 4, '#f8f8f8');
    },
    floor: (ctx, w, h) => grit(ctx, w, h, tones('#8a7a60', 5, 0.55, 0.35, '#2a1a10', '#f8e8c8'), 9, 0.55, (x, ry) => (fbm(x / 30, ry / 6, 44) > 0.75 ? '#76664e' : null)),
    crowd: {
      ink: '#1a0c0c',
      spots: spread(10, 60, 560, 146, 101, 2),
      look: i => ({ ...folk(i, ['#c8c0b0', '#8a8a80', '#a06040'], ['#3a4a6a'], {}, SKINS.slice(0, 4)), long: false, skirt: false, overalls: of(['#3a5a8a', '#4a6a4a', '#6a5a3a'], i), hat: 'hard', hatColor: of(['#e8b818', '#f0f0f0', '#d84020'], i * 1.1) })
    }
  }
};

/** Paint a stage's layers. Browser only (it makes canvases). */
export function paintStage(id: StageId): StageArt {
  const p = PAINTERS[id];
  const sky = makeCanvas(SCREEN_W, SCREEN_H);
  p.sky(ctx2d(sky));
  const far = makeCanvas(FAR_W, SCREEN_H);
  p.far(ctx2d(far), FAR_W);
  const mid = makeCanvas(MID_W, SCREEN_H);
  p.mid(ctx2d(mid), MID_W);
  let front: HTMLCanvasElement | undefined;
  if (p.front) {
    front = makeCanvas(MID_W, SCREEN_H);
    p.front(ctx2d(front), MID_W);
  }
  const floorH = SCREEN_H - p.horizon;
  const floor = makeCanvas(TEX_W, floorH);
  p.floor(ctx2d(floor), TEX_W, floorH, p.horizon);
  const crowd: Spectator[] = [];
  if (p.crowd) {
    const c = p.crowd;
    c.spots.forEach(([x, y], i) => {
      crowd.push({ x, y, sprite: spectatorSprite(c.look(i), c.ink), phase: Math.floor(hash(i * 13 + 5) * 40), tempo: Math.floor(hash(i * 7 + 3) * 3) });
    });
    // Nearer (lower) people are drawn last.
    crowd.sort((a, b) => a.y - b.y);
  }
  return { id, sky, far, mid, front, floor, horizon: p.horizon, crowd, liveBack: p.liveBack, live: p.live };
}

/** How fast a floor row scrolls relative to the fighters (1 at their feet). */
export function rowFactor(y: number, horizon: number): number {
  return 0.55 + 0.45 * ((y - horizon) / (FLOOR_Y - horizon));
}

/**
 * Draw the stage behind the fighters for a camera centred on world x `cam`.
 * `excite` (0 to 1) makes the crowd jump.
 */
export function drawStage(ctx: CanvasRenderingContext2D, art: StageArt, cam: number, t: number, excite: number): void {
  const left = cam - SCREEN_W / 2;
  ctx.drawImage(art.sky, 0, 0);
  ctx.drawImage(art.far, -Math.round(left * FAR_K), 0);
  const midX = Math.round(left * MID_K);
  ctx.drawImage(art.mid, -midX, 0);
  art.liveBack?.(ctx, midX, t);
  for (const s of art.crowd) drawSpectator(ctx, s, s.x - midX, t, excite);
  if (art.front) ctx.drawImage(art.front, -midX, 0);
  art.live?.(ctx, midX, t);
  // The floor, one row at a time.
  const rows = SCREEN_H - art.horizon;
  for (let r = 0; r < rows; r++) {
    const y = art.horizon + r;
    const f = rowFactor(y, art.horizon);
    const srcW = SCREEN_W / f;
    const u0 = cam - srcW / 2 + TEX_OFF;
    ctx.drawImage(art.floor, u0, r, srcW, 1, 0, y, SCREEN_W, 1);
  }
}

/** Which stage a fighter defends at home. */
export function stageFor(id: CharId): StageId {
  return id;
}
