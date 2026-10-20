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
 * from `pix.ts`.
 */
import { FLOOR_Y, SCREEN_H, SCREEN_W, STAGE_W } from './fight';
import { bands, checker, ctx2d, disc, hash, makeCanvas, poly, rect } from './pix';
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
  y: number;
  shirt: string;
  skin: string;
  hair: string;
  phase: number;
  /** Bigger figures stand nearer. */
  size: number;
}

export interface StageArt {
  id: StageId;
  sky: HTMLCanvasElement;
  far: HTMLCanvasElement;
  mid: HTMLCanvasElement;
  floor: HTMLCanvasElement;
  horizon: number;
  crowd: Spectator[];
  /** Animated touches drawn per frame (flags, flames, water). */
  live?: (ctx: CanvasRenderingContext2D, midX: number, t: number) => void;
}

interface Painter {
  horizon: number;
  sky: (ctx: CanvasRenderingContext2D) => void;
  far: (ctx: CanvasRenderingContext2D, w: number) => void;
  mid: (ctx: CanvasRenderingContext2D, w: number) => void;
  floor: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
  crowd?: { y: number; count: number; shirts: string[]; skins?: string[]; from?: number; to?: number };
  live?: StageArt['live'];
}

// --- Shared props -----------------------------------------------------------------

function mountains(ctx: CanvasRenderingContext2D, w: number, base: number, height: number, color: string, seed: number, step = 40): void {
  const pts: [number, number][] = [[0, base]];
  for (let x = 0; x <= w + step; x += step) pts.push([x, base - height * (0.4 + 0.6 * hash(seed + x * 0.37))]);
  pts.push([w + step, base]);
  poly(ctx, pts, color);
}

function skyline(ctx: CanvasRenderingContext2D, w: number, base: number, color: string, lit: string | null, seed: number, maxH = 60): void {
  let x = 0;
  let i = 0;
  while (x < w) {
    const bw = 14 + Math.floor(hash(seed + i) * 26);
    const bh = 20 + Math.floor(hash(seed + i * 3.1) * maxH);
    rect(ctx, x, base - bh, bw, bh, color);
    if (lit) {
      for (let wy = base - bh + 4; wy < base - 4; wy += 5) {
        for (let wx = x + 3; wx < x + bw - 3; wx += 4) if (hash(wx * 7.7 + wy * 1.3 + seed) > 0.55) rect(ctx, wx, wy, 2, 2, lit);
      }
    }
    x += bw + 1;
    i++;
  }
}

function palm(ctx: CanvasRenderingContext2D, x: number, base: number, h: number, trunk: string, leaf: string): void {
  for (let y = 0; y < h; y += 3) rect(ctx, x + Math.sin(y / 14) * 4, base - y - 3, 4, 3, y % 6 ? trunk : leaf === trunk ? trunk : shade(trunk));
  const top: [number, number] = [x + Math.sin(h / 14) * 4 + 2, base - h];
  for (const a of [-2.6, -2.1, -1.5, -0.9, -0.4, 0.2]) {
    const len = 22;
    const ex = top[0] + Math.cos(a) * len;
    const ey = top[1] + Math.sin(a) * len * 0.5 + 8;
    poly(ctx, [[top[0], top[1] - 2], [ex, ey], [ex - Math.sin(a) * 3, ey + 4], [top[0], top[1] + 2]], leaf);
  }
}

function shade(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * 0.7);
  const g = Math.round(((n >> 8) & 255) * 0.7);
  const b = Math.round((n & 255) * 0.7);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/** A curved east-asian roof, eaves turned up at the ends. */
function roof(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string, trim: string): void {
  poly(ctx, [[x - 8, y + h], [x + w / 2, y], [x + w + 8, y + h], [x + w + 10, y + h - 4], [x + w + 2, y + h + 2], [x - 2, y + h + 2], [x - 10, y + h - 4]], color);
  rect(ctx, x - 6, y + h, w + 12, 2, trim);
}

function lantern(ctx: CanvasRenderingContext2D, x: number, y: number, color: string): void {
  rect(ctx, x, y - 6, 1, 6, '#2a1a10');
  disc(ctx, x + 0.5, y + 3, 4, color);
  rect(ctx, x - 3, y + 2, 7, 1, shade(color));
  rect(ctx, x - 1, y + 7, 3, 2, '#2a1a10');
}

function arches(ctx: CanvasRenderingContext2D, w: number, top: number, base: number, wall: string, hole: string, step: number, archW: number): void {
  rect(ctx, 0, top, w, base - top, wall);
  for (let x = 8; x < w; x += step) {
    const r = archW / 2;
    rect(ctx, x, top + r + 8, archW, base - top - r - 8, hole);
    disc(ctx, x + r, top + r + 8, r, hole);
  }
}

// --- Floors -------------------------------------------------------------------------

/** Horizontal seam rows, closer together toward the horizon. */
function seamRows(h: number): number[] {
  const rows: number[] = [];
  for (let i = 1; i < 12; i++) {
    const y = Math.round(h * (1 - 1 / (1 + i * 0.32)) * 1.45);
    if (y < h) rows.push(y);
  }
  return rows;
}

function boards(ctx: CanvasRenderingContext2D, w: number, h: number, base: string, dark: string, light: string, step = 28): void {
  bands(ctx, 0, 0, w, h, [shade(base), base, base]);
  for (let x = 0; x < w; x += step) rect(ctx, x, 0, 1, h, dark);
  for (let x = step / 2; x < w; x += step * 2) rect(ctx, x, 0, 1, h, dark);
  for (const y of seamRows(h)) {
    for (let x = 0; x < w; x += step) if (hash(x * 1.7 + y) > 0.5) rect(ctx, x + 1, y, step / 2 - 1, 1, dark);
  }
  for (let x = 3; x < w; x += step) checker(ctx, x, 0, 2, h, light);
}

function tiles(ctx: CanvasRenderingContext2D, w: number, h: number, a: string, b: string, line: string, step = 32): void {
  rect(ctx, 0, 0, w, h, a);
  const rows = [0, ...seamRows(h), h];
  for (let r = 0; r + 1 < rows.length; r++) {
    for (let x = 0; x < w; x += step) {
      if ((Math.floor(x / step) + r) % 2) rect(ctx, x, rows[r], step, rows[r + 1] - rows[r], b);
    }
    rect(ctx, 0, rows[r], w, 1, line);
  }
  for (let x = 0; x < w; x += step) rect(ctx, x, 0, 1, h, line);
}

function ground(ctx: CanvasRenderingContext2D, w: number, h: number, colors: string[], speck: string, seed: number): void {
  bands(ctx, 0, 0, w, h, colors);
  for (let i = 0; i < (w * h) / 40; i++) {
    const x = Math.floor(hash(seed + i) * w);
    const y = Math.floor(hash(seed + i * 1.3) * h);
    rect(ctx, x, y, 2, 1, speck);
  }
}

// --- The stages ------------------------------------------------------------------------

const SKIN = ['#e8b088', '#c88a60', '#8a5a3a', '#f0c8a0', '#6a4028'];

const PAINTERS: Record<StageId, Painter> = {
  // A castle rooftop at night under a full moon.
  kenji: {
    horizon: 150,
    sky: ctx => {
      bands(ctx, 0, 0, SCREEN_W, 150, ['#0a0a28', '#141038', '#20184a', '#30205a', '#40286a']);
      disc(ctx, 300, 40, 22, '#f4ecc8');
      disc(ctx, 294, 36, 6, '#e0d4a8');
      disc(ctx, 306, 48, 4, '#e0d4a8');
      for (let i = 0; i < 40; i++) rect(ctx, hash(i) * SCREEN_W, hash(i + 9) * 90, 1, 1, '#c8c8f0');
    },
    far: (ctx, w) => {
      mountains(ctx, w, 150, 60, '#1a1440', 3, 30);
      mountains(ctx, w, 150, 34, '#140e30', 8, 24);
    },
    mid: (ctx, w) => {
      // The castle keep in the distance and the rooftop ridge in front.
      const cx = w / 2 - 20;
      rect(ctx, cx, 70, 60, 70, '#2a2440');
      roof(ctx, cx - 4, 56, 68, 16, '#181430', '#4a4070');
      roof(ctx, cx + 8, 36, 44, 14, '#181430', '#4a4070');
      for (let y = 80; y < 136; y += 14) for (let x = cx + 6; x < cx + 56; x += 12) rect(ctx, x, y, 5, 7, '#e8c060');
      roof(ctx, -20, 128, w + 40, 18, '#2a2234', '#6a5a7a');
      rect(ctx, 0, 148, w, 2, '#120c1c');
      // The hanging sign.
      rect(ctx, 40, 96, 26, 36, '#d8c8a0');
      rect(ctx, 41, 97, 24, 34, '#f0e4c0');
      for (let y = 102; y < 128; y += 6) rect(ctx, 50, y, 6, 3, '#1a1a1a');
    },
    floor: (ctx, w, h) => boards(ctx, w, h, '#6a4a34', '#3a2418', '#8a6a4a')
  },
  // A harbour pier at sunset, a yacht moored behind.
  ace: {
    horizon: 152,
    sky: ctx => {
      bands(ctx, 0, 0, SCREEN_W, 110, ['#f8d070', '#f8a850', '#f08048', '#d85848', '#a84050']);
      disc(ctx, 120, 100, 18, '#fff0b0');
      bands(ctx, 0, 104, SCREEN_W, 48, ['#4a3a6a', '#3a3a7a', '#2a3a7a', '#24346a']);
      for (let y = 106; y < 150; y += 3) rect(ctx, 104 + hash(y) * 10, y, 22 - (y - 106) / 3, 1, '#f8c070');
    },
    far: (ctx, w) => skyline(ctx, w, 108, '#5a3a5a', null, 4, 24),
    mid: (ctx, w) => {
      // The yacht.
      const x = w / 2 - 60;
      poly(ctx, [[x, 108], [x + 130, 108], [x + 118, 128], [x + 10, 128]], '#f0f0f0');
      rect(ctx, x + 10, 124, 108, 4, '#2848a8');
      rect(ctx, x + 30, 94, 60, 14, '#e8e8e8');
      for (let i = 0; i < 6; i++) rect(ctx, x + 36 + i * 9, 98, 5, 4, '#3a5a8a');
      rect(ctx, x + 62, 40, 2, 54, '#c8c8c8');
      // The pier rail and posts.
      rect(ctx, 0, 132, w, 3, '#5a3a24');
      for (let px = 0; px < w; px += 36) rect(ctx, px, 128, 4, 22, '#4a2e1c');
      rect(ctx, 0, 140, w, 2, '#5a3a24');
    },
    floor: (ctx, w, h) => boards(ctx, w, h, '#9a7050', '#4a3020', '#b88a60', 24),
    crowd: { y: 132, count: 16, shirts: ['#f0f0f0', '#2848a8', '#d82828', '#f0d040'] }
  },
  // A market street in the afternoon: shopfronts, signs, bicycles.
  mei: {
    horizon: 150,
    sky: ctx => bands(ctx, 0, 0, SCREEN_W, 150, ['#a8d0f0', '#b8d8f0', '#c8e0f0', '#d8e8f0']),
    far: (ctx, w) => {
      skyline(ctx, w, 120, '#8a9ab0', null, 11, 50);
      for (let x = 10; x < w; x += 70) roof(ctx, x, 54, 40, 12, '#7a5a5a', '#9a7a7a');
    },
    mid: (ctx, w) => {
      for (let x = 0; x < w; x += 64) {
        rect(ctx, x, 64, 60, 86, x % 128 ? '#c8a888' : '#b89878');
        roof(ctx, x + 6, 52, 48, 12, '#3a6a4a', '#d8c060');
        rect(ctx, x + 18, 76, 24, 34, '#c82828');
        for (let y = 80; y < 106; y += 7) rect(ctx, x + 26, y, 8, 4, '#f0d040');
        rect(ctx, x + 6, 118, 48, 32, '#5a3a2a');
        lantern(ctx, x + 4, 66, '#e83030');
        lantern(ctx, x + 56, 66, '#e83030');
      }
      // Bicycles parked at the kerb.
      for (let x = 30; x < w; x += 150) {
        disc(ctx, x, 144, 5, '#1a1a1a');
        disc(ctx, x, 144, 3, '#c8a888');
        disc(ctx, x + 16, 144, 5, '#1a1a1a');
        disc(ctx, x + 16, 144, 3, '#c8a888');
        poly(ctx, [[x, 144], [x + 6, 136], [x + 16, 144], [x + 14, 136]], '#2a5a2a');
      }
    },
    floor: (ctx, w, h) => tiles(ctx, w, h, '#a89880', '#988870', '#6a5a48', 30),
    crowd: { y: 126, count: 14, shirts: ['#f0f0f0', '#4a8ad8', '#e8e070', '#c84040', '#5aa05a'] }
  },
  // The factory floor: girders, a furnace glow, workers watching.
  boris: {
    horizon: 148,
    sky: ctx => bands(ctx, 0, 0, SCREEN_W, 148, ['#2a2a24', '#34342c', '#3e3e34', '#48483c']),
    far: (ctx, w) => {
      for (let x = 0; x < w; x += 48) {
        rect(ctx, x, 0, 6, 148, '#1e1e18');
        poly(ctx, [[x, 30], [x + 48, 0], [x + 48, 6], [x, 36]], '#1e1e18');
      }
      for (let x = 20; x < w; x += 96) {
        rect(ctx, x, 40, 40, 30, '#5a6a5a');
        for (let i = 0; i < 4; i++) rect(ctx, x + 2 + i * 10, 42, 8, 26, '#8aa08a');
      }
    },
    mid: (ctx, w) => {
      rect(ctx, 0, 96, w, 52, '#5a5444');
      for (let x = 0; x < w; x += 8) rect(ctx, x, 96, 1, 52, '#4a4434');
      // Pipes and a furnace mouth.
      rect(ctx, 0, 88, w, 6, '#7a7a6a');
      rect(ctx, 0, 89, w, 1, '#a8a898');
      const fx = w / 2 - 30;
      rect(ctx, fx, 104, 60, 44, '#2a2a22');
      bands(ctx, fx + 6, 110, 48, 38, ['#f8d040', '#f89030', '#d84020']);
      // A hammer and sickle banner, red.
      rect(ctx, fx - 120, 40, 40, 30, '#c82020');
      disc(ctx, fx - 106, 52, 5, '#f0c030');
      disc(ctx, fx - 106, 52, 3, '#c82020');
      rect(ctx, fx - 104, 54, 8, 2, '#f0c030');
    },
    floor: (ctx, w, h) => {
      tiles(ctx, w, h, '#6a6a5e', '#5e5e52', '#3a3a32', 40);
      for (let x = 6; x < w; x += 40) for (const y of seamRows(h)) rect(ctx, x, y + 2, 2, 1, '#9a9a8a');
    },
    crowd: { y: 126, count: 14, shirts: ['#4a5a8a', '#6a6a6a', '#8a5a3a', '#3a4a6a'] },
    live: (ctx, midX, t) => {
      const fx = MID_W / 2 - 30 - midX;
      for (let i = 0; i < 6; i++) {
        const y = 140 - ((t * 0.6 + i * 9) % 30);
        rect(ctx, fx + 10 + hash(i) * 40, y, 2, 2, i % 2 ? '#f8f080' : '#f8a040');
      }
    }
  },
  // A palace hall: arches, elephants, carved pillars.
  raj: {
    horizon: 152,
    sky: ctx => bands(ctx, 0, 0, SCREEN_W, 152, ['#f0c070', '#f0b060', '#e89850', '#e08040']),
    far: (ctx, w) => {
      for (let x = 20; x < w; x += 110) {
        rect(ctx, x, 40, 50, 80, '#c87848');
        disc(ctx, x + 25, 40, 22, '#d88858');
        rect(ctx, x + 24, 6, 2, 14, '#c87848');
      }
    },
    mid: (ctx, w) => {
      arches(ctx, w, 60, 152, '#e8b080', '#7a3a2a', 52, 30);
      for (let x = 0; x < w; x += 52) rect(ctx, x, 60, 6, 92, '#d89868');
      // Two elephants, painted and tusked.
      for (const ex of [40, w - 120]) {
        disc(ctx, ex + 40, 112, 28, '#8a8a92');
        rect(ctx, ex + 16, 116, 12, 34, '#7a7a82');
        rect(ctx, ex + 50, 116, 12, 34, '#7a7a82');
        disc(ctx, ex + 72, 104, 16, '#8a8a92');
        rect(ctx, ex + 82, 108, 6, 36, '#8a8a92');
        poly(ctx, [[ex + 76, 116], [ex + 92, 124], [ex + 90, 126], [ex + 76, 120]], '#f4f0e0');
        rect(ctx, ex + 26, 86, 30, 10, '#c82828');
        rect(ctx, ex + 26, 86, 30, 2, '#f0c030');
        disc(ctx, ex + 78, 100, 2, '#1a1a1a');
      }
    },
    floor: (ctx, w, h) => {
      tiles(ctx, w, h, '#c89868', '#b88858', '#8a5a38', 36);
      for (let x = 18; x < w; x += 36) for (const y of seamRows(h)) disc(ctx, x, y + 3, 1.5, '#e8c890');
    },
    crowd: { y: 130, count: 10, shirts: ['#f0f0e8', '#e8a030', '#c82828'], skins: ['#8a5434', '#6a4028', '#a06a44'] }
  },
  // A bathhouse: a wave mural on the tiles, the steaming tub.
  tora: {
    horizon: 150,
    sky: ctx => {
      rect(ctx, 0, 0, SCREEN_W, 150, '#e8e4d8');
      for (let y = 0; y < 150; y += 8) rect(ctx, 0, y, SCREEN_W, 1, '#c8c4b8');
      for (let x = 0; x < SCREEN_W; x += 8) rect(ctx, x, 0, 1, 150, '#c8c4b8');
    },
    far: (ctx, w) => {
      // The mountain and the great wave, painted on the wall.
      poly(ctx, [[w / 2 - 90, 100], [w / 2, 30], [w / 2 + 90, 100]], '#3a5aa8');
      poly(ctx, [[w / 2 - 22, 54], [w / 2, 30], [w / 2 + 22, 54], [w / 2 + 10, 50], [w / 2, 56], [w / 2 - 12, 50]], '#f8f8f8');
      for (let x = 0; x < w; x += 40) {
        disc(ctx, x + 20, 104, 18, '#2a4a98');
        disc(ctx, x + 26, 98, 10, '#e8e4d8');
      }
      rect(ctx, 0, 104, w, 16, '#2a4a98');
    },
    mid: (ctx, w) => {
      rect(ctx, 0, 120, w, 30, '#8a5a3a');
      rect(ctx, 0, 120, w, 3, '#aa7a5a');
      bands(ctx, 20, 124, w - 40, 22, ['#5ab0d8', '#3a90c8', '#2a70b0']);
      roof(ctx, -10, 0, w + 20, 14, '#3a2a20', '#6a4a30');
    },
    floor: (ctx, w, h) => tiles(ctx, w, h, '#d8d4c8', '#c8c4b8', '#9a968a', 24),
    live: (ctx, midX, t) => {
      for (let i = 0; i < 8; i++) {
        const x = 30 + i * 70 - midX;
        const y = 116 - ((t * 0.3 + i * 13) % 40);
        checker(ctx, x + Math.sin((t + i * 30) / 20) * 4, y, 10, 6, '#ffffff');
      }
    }
  },
  // A river village in the jungle: huts on stilts, a fisherman's boat.
  rio: {
    horizon: 154,
    sky: ctx => bands(ctx, 0, 0, SCREEN_W, 154, ['#70b8e0', '#88c8e8', '#a0d8e8', '#b8e0e0']),
    far: (ctx, w) => {
      mountains(ctx, w, 120, 40, '#2a6a3a', 21, 20);
      mountains(ctx, w, 124, 24, '#1a5a2a', 5, 16);
    },
    mid: (ctx, w) => {
      bands(ctx, 0, 120, w, 34, ['#3a7a8a', '#2a6a7a', '#2a5a6a']);
      for (let x = 20; x < w; x += 120) {
        for (const px of [x, x + 36]) rect(ctx, px, 100, 3, 40, '#5a3a20');
        rect(ctx, x - 4, 96, 46, 6, '#7a5a30');
        poly(ctx, [[x - 8, 96], [x + 19, 74], [x + 46, 96]], '#a88a40');
        rect(ctx, x + 6, 84, 26, 12, '#8a6a3a');
      }
      for (let x = 0; x < w; x += 90) palm(ctx, x + 60, 120, 60, '#6a4a2a', '#2a8a3a');
    },
    floor: (ctx, w, h) => boards(ctx, w, h, '#8a6a40', '#4a3420', '#a8885a', 22),
    crowd: { y: 128, count: 8, shirts: ['#f0f0f0', '#e8c030', '#3a8a3a'], skins: ['#a06a44', '#8a5434', '#c88a60'] },
    live: (ctx, midX, t) => {
      for (let i = 0; i < 10; i++) rect(ctx, ((i * 61 + t * 0.4) % MID_W) - midX, 124 + (i % 4) * 7, 8, 1, '#a0d0e0');
    }
  },
  // The air base: a fighter jet on the apron, a hangar, the flight line.
  duke: {
    horizon: 152,
    sky: ctx => {
      bands(ctx, 0, 0, SCREEN_W, 152, ['#3a70c8', '#5088d0', '#68a0d8', '#88b8e0', '#a8c8e0']);
      for (const [x, y] of [
        [60, 30],
        [250, 50]
      ]) {
        disc(ctx, x, y, 10, '#f0f4f8');
        disc(ctx, x + 12, y + 2, 8, '#f0f4f8');
        disc(ctx, x - 10, y + 3, 7, '#e0e8f0');
      }
    },
    far: (ctx, w) => mountains(ctx, w, 130, 26, '#7a90a8', 31, 36),
    mid: (ctx, w) => {
      rect(ctx, w - 160, 70, 150, 70, '#7a7a6a');
      poly(ctx, [[w - 168, 72], [w - 85, 52], [w - 2, 72]], '#6a6a5a');
      rect(ctx, w - 140, 90, 110, 50, '#2a2a24');
      // The jet.
      const x = 60;
      poly(ctx, [[x, 120], [x + 150, 116], [x + 172, 120], [x + 150, 126], [x, 128]], '#8a9aa0');
      poly(ctx, [[x + 60, 120], [x + 110, 96], [x + 120, 96], [x + 100, 120]], '#7a8a90');
      poly(ctx, [[x + 60, 126], [x + 110, 146], [x + 120, 146], [x + 100, 126]], '#6a7a80');
      poly(ctx, [[x + 2, 120], [x + 18, 98], [x + 26, 98], [x + 22, 120]], '#7a8a90');
      poly(ctx, [[x + 130, 116], [x + 146, 112], [x + 156, 117]], '#3a4a5a');
      rect(ctx, x + 60, 130, 3, 10, '#2a2a2a');
      rect(ctx, x + 130, 128, 3, 12, '#2a2a2a');
      rect(ctx, 0, 144, w, 8, '#5a5a50');
    },
    floor: (ctx, w, h) => {
      ground(ctx, w, h, ['#8a8a80', '#9a9a90', '#a4a49a'], '#7a7a70', 7);
      for (let x = 0; x < w; x += 96) rect(ctx, x, Math.round(h * 0.45), 48, 2, '#e8d040');
    },
    crowd: { y: 136, count: 10, shirts: ['#4e6a2a', '#6a7c40', '#3a4a2a'] }
  },
  // Las Vegas at night: neon, a casino, a crowd at the ropes.
  rocko: {
    horizon: 152,
    sky: ctx => bands(ctx, 0, 0, SCREEN_W, 152, ['#08061a', '#120a2a', '#1e1038', '#2a1440']),
    far: (ctx, w) => skyline(ctx, w, 120, '#1a1230', '#f8d870', 17, 90),
    mid: (ctx, w) => {
      rect(ctx, 0, 70, w, 82, '#2a1a3a');
      for (let x = 10; x < w; x += 100) {
        rect(ctx, x, 40, 80, 26, '#e83070');
        rect(ctx, x + 2, 42, 76, 22, '#1a0a1a');
        for (let i = 0; i < 5; i++) rect(ctx, x + 8 + i * 14, 48, 10, 10, i % 2 ? '#f8e040' : '#40e8f8');
      }
      for (let x = 0; x < w; x += 6) rect(ctx, x, 70, 3, 2, x % 12 ? '#f8e040' : '#f84040');
      rect(ctx, 0, 136, w, 2, '#c82828');
      for (let x = 0; x < w; x += 40) rect(ctx, x, 128, 3, 22, '#c8c8c8');
    },
    floor: (ctx, w, h) => ground(ctx, w, h, ['#3a3a44', '#44444e', '#4e4e58'], '#5e5e68', 13),
    crowd: { y: 132, count: 18, shirts: ['#f8f8f8', '#1a1a1a', '#d82828', '#f8d040', '#40a0e8'] },
    live: (ctx, midX, t) => {
      for (let x = 10; x < MID_W; x += 100) {
        if (Math.floor(t / 20 + x) % 3 === 0) checker(ctx, x - midX, 40, 80, 26, '#ffffff');
      }
    }
  },
  // A Spanish tavern courtyard, the cage, flamenco dancers on the balcony.
  varga: {
    horizon: 152,
    sky: ctx => bands(ctx, 0, 0, SCREEN_W, 152, ['#101030', '#1a1840', '#28204a', '#382850']),
    far: (ctx, w) => {
      rect(ctx, 0, 30, w, 122, '#d8b080');
      for (let x = 0; x < w; x += 4) if (hash(x) > 0.6) rect(ctx, x, 30, 2, 122, '#c8a070');
    },
    mid: (ctx, w) => {
      arches(ctx, w, 40, 104, '#e8c090', '#3a2010', 64, 34);
      rect(ctx, 0, 100, w, 6, '#7a4a2a');
      for (let x = 0; x < w; x += 8) rect(ctx, x, 106, 2, 22, '#2a1a10');
      // Dancers on the balcony.
      for (let x = 30; x < w; x += 128) {
        poly(ctx, [[x, 100], [x + 6, 80], [x + 12, 100]], '#d82828');
        disc(ctx, x + 6, 76, 4, '#e8b088');
        rect(ctx, x + 4, 70, 5, 3, '#1a1a1a');
      }
      // The cage fence in front.
      for (let x = 0; x < w; x += 6) rect(ctx, x, 112, 1, 40, '#8a8a8a');
      for (let y = 112; y < 152; y += 6) rect(ctx, 0, y, w, 1, '#7a7a7a');
      lantern(ctx, 60, 30, '#f8c040');
      lantern(ctx, w - 60, 30, '#f8c040');
    },
    floor: (ctx, w, h) => tiles(ctx, w, h, '#c87850', '#b86a44', '#7a4428', 26),
    crowd: { y: 132, count: 14, shirts: ['#1a1a1a', '#d82828', '#f0f0f0', '#e8b040'] }
  },
  // Temple ruins in Thailand: a reclining statue, palms, a gold stupa.
  sakda: {
    horizon: 152,
    sky: ctx => bands(ctx, 0, 0, SCREEN_W, 152, ['#f0a058', '#f0b870', '#f0c888', '#e8d098']),
    far: (ctx, w) => {
      for (let x = 30; x < w; x += 140) {
        poly(ctx, [[x, 120], [x + 20, 40], [x + 40, 120]], '#c89838');
        rect(ctx, x + 19, 20, 2, 22, '#c89838');
      }
    },
    mid: (ctx, w) => {
      // The great reclining figure.
      const x = w / 2 - 100;
      poly(ctx, [[x, 136], [x + 20, 100], [x + 170, 104], [x + 200, 136]], '#d8a840');
      disc(ctx, x + 26, 96, 18, '#e0b448');
      poly(ctx, [[x + 18, 82], [x + 26, 66], [x + 34, 82]], '#c89838');
      rect(ctx, x, 136, 200, 8, '#8a7a6a');
      for (const px of [10, w - 40]) palm(ctx, px, 150, 80, '#6a5030', '#3a7a2a');
      for (let px = 60; px < w; px += 180) {
        rect(ctx, px, 90, 14, 60, '#9a8a7a');
        rect(ctx, px - 3, 86, 20, 6, '#8a7a6a');
      }
    },
    floor: (ctx, w, h) => tiles(ctx, w, h, '#b0a088', '#a09078', '#6a5a48', 34),
    crowd: { y: 136, count: 8, shirts: ['#e88a20', '#f0f0f0', '#5a2a8a'], skins: ['#b07a4a', '#a06a44', '#8a5434'] }
  },
  // The final temple at dusk, a red sky and a giant statue.
  zar: {
    horizon: 150,
    sky: ctx => bands(ctx, 0, 0, SCREEN_W, 150, ['#200818', '#3a0a1a', '#5a1020', '#7a1a20', '#9a2a20']),
    far: (ctx, w) => {
      mountains(ctx, w, 140, 50, '#1a0610', 41, 26);
      for (let x = 20; x < w; x += 160) {
        poly(ctx, [[x, 140], [x + 30, 30], [x + 60, 140]], '#2a0a14');
        rect(ctx, x + 22, 60, 16, 4, '#5a1a20');
      }
    },
    mid: (ctx, w) => {
      for (let x = 0; x < w; x += 64) {
        rect(ctx, x + 8, 60, 14, 90, '#4a3a3a');
        rect(ctx, x + 4, 56, 22, 6, '#5a4a4a');
        rect(ctx, x + 6, 144, 18, 6, '#5a4a4a');
      }
      rect(ctx, 0, 50, w, 6, '#3a2a2a');
      // The banner with the skull emblem.
      const bx = w / 2 - 20;
      rect(ctx, bx, 56, 40, 60, '#7a1020');
      disc(ctx, bx + 20, 76, 10, '#e8c040');
      disc(ctx, bx + 20, 76, 7, '#7a1020');
      poly(ctx, [[bx + 12, 86], [bx + 20, 100], [bx + 28, 86]], '#e8c040');
    },
    floor: (ctx, w, h) => tiles(ctx, w, h, '#5a4a48', '#4e403e', '#2a2020', 36),
    live: (ctx, midX, t) => {
      for (let x = 15; x < MID_W; x += 64) {
        const fl = (Math.floor(t / 4) + x) % 3;
        poly(ctx, [[x - midX, 56], [x + 4 - midX, 44 - fl * 3], [x + 8 - midX, 56]], fl === 0 ? '#f8d040' : '#f87020');
      }
    }
  },
  // The bonus yards: a car park behind the docks, a factory yard of drums.
  car: {
    horizon: 150,
    sky: ctx => bands(ctx, 0, 0, SCREEN_W, 150, ['#5888c8', '#78a0d0', '#98b8d8', '#b8d0e0']),
    far: (ctx, w) => skyline(ctx, w, 120, '#7a8aa0', '#c8d8e8', 51, 70),
    mid: (ctx, w) => {
      rect(ctx, 0, 110, w, 40, '#8a8070');
      for (let x = 0; x < w; x += 30) rect(ctx, x, 110, 1, 40, '#6a6050');
    },
    floor: (ctx, w, h) => {
      ground(ctx, w, h, ['#5a5a5e', '#646468', '#6e6e72'], '#7e7e82', 3);
      for (let x = 0; x < w; x += 80) rect(ctx, x, Math.round(h * 0.4), 2, Math.round(h * 0.6), '#e8e8e0');
    },
    crowd: { y: 128, count: 10, shirts: ['#f0f0f0', '#d82828', '#2848a8', '#e8c040'] }
  },
  drums: {
    horizon: 150,
    sky: ctx => bands(ctx, 0, 0, SCREEN_W, 150, ['#f08850', '#f0a060', '#e8b070', '#d8b880']),
    far: (ctx, w) => {
      skyline(ctx, w, 130, '#6a5048', null, 61, 60);
      for (let x = 40; x < w; x += 120) rect(ctx, x, 30, 10, 100, '#5a4038');
    },
    mid: (ctx, w) => {
      rect(ctx, 0, 100, w, 50, '#7a6a5a');
      for (let x = 0; x < w; x += 10) rect(ctx, x, 100, 1, 50, '#6a5a4a');
      for (let x = 20; x < w; x += 90) {
        rect(ctx, x, 120, 20, 30, '#4a6a8a');
        rect(ctx, x, 124, 20, 2, '#2a4a6a');
      }
    },
    floor: (ctx, w, h) => ground(ctx, w, h, ['#7a6a52', '#8a7a62', '#94846a'], '#6a5a42', 9),
    crowd: { y: 126, count: 8, shirts: ['#4a5a8a', '#8a5a3a', '#e8c040'] }
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
  const floorH = SCREEN_H - p.horizon;
  const floor = makeCanvas(TEX_W, floorH);
  p.floor(ctx2d(floor), TEX_W, floorH);
  const crowd: Spectator[] = [];
  if (p.crowd) {
    const c = p.crowd;
    const skins = c.skins ?? SKIN;
    for (let i = 0; i < c.count; i++) {
      crowd.push({
        x: Math.round(((i + 0.5) / c.count) * MID_W + (hash(i * 3 + 1) - 0.5) * 20),
        y: c.y + Math.round(hash(i * 5) * 6),
        shirt: c.shirts[i % c.shirts.length],
        skin: skins[Math.floor(hash(i * 7) * skins.length)],
        hair: ['#1a1a1a', '#5a3a1a', '#c8a040', '#2a1a10'][Math.floor(hash(i * 11) * 4)],
        phase: Math.floor(hash(i * 13) * 40),
        size: 1 + hash(i * 17) * 0.2
      });
    }
  }
  return { id, sky, far, mid, floor, horizon: p.horizon, crowd, live: p.live };
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
  for (const s of art.crowd) drawSpectator(ctx, s, s.x - midX, t, excite);
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

function drawSpectator(ctx: CanvasRenderingContext2D, s: Spectator, x: number, t: number, excite: number): void {
  if (x < -12 || x > SCREEN_W + 12) return;
  const beat = Math.floor((t + s.phase) / (excite > 0.3 ? 6 : 18)) % 2;
  const bob = beat * (excite > 0.3 ? 2 : 1);
  const y = s.y - bob;
  const k = s.size;
  rect(ctx, x - 4 * k, y - 10 * k, 8 * k, 12 * k, s.shirt);
  rect(ctx, x - 4 * k, y - 10 * k, 2 * k, 12 * k, shade(s.shirt));
  disc(ctx, x, y - 14 * k, 3.4 * k, s.skin);
  rect(ctx, x - 3 * k, y - 18 * k, 6 * k, 2 * k, s.hair);
  if (excite > 0.3 && beat) {
    rect(ctx, x - 7 * k, y - 18 * k, 2 * k, 9 * k, s.skin);
    rect(ctx, x + 5 * k, y - 18 * k, 2 * k, 9 * k, s.skin);
  } else {
    rect(ctx, x - 6 * k, y - 9 * k, 2 * k, 8 * k, s.shirt);
    rect(ctx, x + 4 * k, y - 9 * k, 2 * k, 8 * k, s.shirt);
  }
}

/** Which stage a fighter defends at home. */
export function stageFor(id: CharId): StageId {
  return id;
}
