/**
 * The big letters: ROUND 1, FIGHT!, K.O., YOU WIN, the timer, the title
 * logo. The 5x7 font blown up reads as a blocky scaling; the arcade's calls
 * were drawn letters, heavy and bevelled, graded top to bottom, inside a
 * thick dark outline. So each glyph here is a skeleton of strokes on a
 * 5 x 10 grid, swept with an octagonal pen at whatever cap height is asked
 * for, which keeps every size crisp and every diagonal clean, then painted
 * once into a cached image: a dithered vertical grade, a lit top edge and a
 * shaded bottom edge, an inner and an outer outline, and a hard drop shadow.
 *
 * Letters the skeletons do not cover (anything accented beyond the marks
 * below) fall back to '?', so a translated label still reads; the calls
 * themselves are English in every locale, as the arcade's were.
 */
import { PixBuf, bayer, mix, rgb } from './pixbuf';

type Pt = readonly [number, number];
interface Glyph {
  w: number;
  strokes: readonly (readonly Pt[])[];
}

const O_RING: Pt[] = [[1.5, 0], [3.5, 0], [5, 1.5], [5, 8.5], [3.5, 10], [1.5, 10], [0, 8.5], [0, 1.5], [1.5, 0]];
const P_BOWL: Pt[] = [[0, 10], [0, 0], [3.6, 0], [5, 1.4], [5, 3.8], [3.6, 5.2], [0, 5.2]];

const GLYPHS: Record<string, Glyph> = {
  A: { w: 5, strokes: [[[0, 10], [0, 1.6], [1.6, 0], [3.4, 0], [5, 1.6], [5, 10]], [[0, 5.6], [5, 5.6]]] },
  B: { w: 5, strokes: [[[0, 0], [3.6, 0], [5, 1.3], [5, 3.6], [3.8, 4.8], [0, 4.8]], [[3.8, 4.8], [5, 6], [5, 8.7], [3.7, 10], [0, 10], [0, 0]]] },
  C: { w: 5, strokes: [[[5, 2], [5, 1.5], [3.5, 0], [1.5, 0], [0, 1.5], [0, 8.5], [1.5, 10], [3.5, 10], [5, 8.5], [5, 8]]] },
  D: { w: 5, strokes: [[[0, 0], [3, 0], [5, 2], [5, 8], [3, 10], [0, 10], [0, 0]]] },
  E: { w: 5, strokes: [[[5, 0], [0, 0], [0, 10], [5, 10]], [[0, 4.9], [4, 4.9]]] },
  F: { w: 5, strokes: [[[5, 0], [0, 0], [0, 10]], [[0, 4.9], [4, 4.9]]] },
  G: { w: 5, strokes: [[[5, 1.8], [3.5, 0], [1.5, 0], [0, 1.5], [0, 8.5], [1.5, 10], [3.5, 10], [5, 8.5], [5, 5.4], [2.8, 5.4]]] },
  H: { w: 5, strokes: [[[0, 0], [0, 10]], [[5, 0], [5, 10]], [[0, 5], [5, 5]]] },
  I: { w: 0, strokes: [[[0, 0], [0, 10]]] },
  J: { w: 5, strokes: [[[5, 0], [5, 8.5], [3.5, 10], [1.5, 10], [0, 8.5], [0, 7]]] },
  K: { w: 5, strokes: [[[0, 0], [0, 10]], [[5, 0], [5, 0.6], [1.2, 4.9], [0, 4.9]], [[1.2, 4.9], [5, 9.4], [5, 10]]] },
  L: { w: 5, strokes: [[[0, 0], [0, 10], [5, 10]]] },
  M: { w: 6, strokes: [[[0, 10], [0, 0], [0.4, 0], [3, 4.6], [5.6, 0], [6, 0], [6, 10]]] },
  N: { w: 5, strokes: [[[0, 10], [0, 0], [0.4, 0], [4.6, 10], [5, 10], [5, 0]]] },
  O: { w: 5, strokes: [O_RING] },
  P: { w: 5, strokes: [P_BOWL] },
  Q: { w: 5, strokes: [O_RING, [[3, 7.4], [5.4, 10.4]]] },
  R: { w: 5, strokes: [P_BOWL, [[2.6, 5.2], [5, 8.6], [5, 10]]] },
  S: { w: 5, strokes: [[[5, 1.6], [3.5, 0], [1.5, 0], [0, 1.5], [0, 3.4], [1.5, 4.9], [3.5, 4.9], [5, 6.4], [5, 8.5], [3.5, 10], [1.5, 10], [0, 8.4]]] },
  T: { w: 6, strokes: [[[0, 0], [6, 0]], [[3, 0], [3, 10]]] },
  U: { w: 5, strokes: [[[0, 0], [0, 8.5], [1.5, 10], [3.5, 10], [5, 8.5], [5, 0]]] },
  V: { w: 5, strokes: [[[0, 0], [0, 5], [2.5, 10], [5, 5], [5, 0]]] },
  W: { w: 6, strokes: [[[0, 0], [0, 10], [0.4, 10], [3, 6], [5.6, 10], [6, 10], [6, 0]]] },
  X: { w: 5, strokes: [[[0, 0], [0, 1.2], [5, 8.8], [5, 10]], [[5, 0], [5, 1.2], [0, 8.8], [0, 10]]] },
  Y: { w: 5, strokes: [[[0, 0], [0, 2.4], [2.5, 5.2], [5, 2.4], [5, 0]], [[2.5, 5.2], [2.5, 10]]] },
  Z: { w: 5, strokes: [[[0, 0], [5, 0], [5, 1.2], [0, 8.8], [0, 10], [5, 10]]] },
  '0': { w: 5, strokes: [O_RING] },
  '1': { w: 2.6, strokes: [[[0, 1.6], [1.6, 0], [1.6, 10]], [[0, 10], [3.2, 10]]] },
  '2': { w: 5, strokes: [[[0, 1.6], [1.5, 0], [3.5, 0], [5, 1.5], [5, 3.6], [0, 8.6], [0, 10], [5, 10]]] },
  '3': { w: 5, strokes: [[[0, 1.5], [1.5, 0], [3.5, 0], [5, 1.5], [5, 3.4], [3.5, 4.9], [1.6, 4.9]], [[3.5, 4.9], [5, 6.4], [5, 8.5], [3.5, 10], [1.5, 10], [0, 8.5]]] },
  '4': { w: 5, strokes: [[[3.8, 10], [3.8, 0], [3.4, 0], [0, 6], [0, 7], [5.2, 7]]] },
  '5': { w: 5, strokes: [[[5, 0], [0, 0], [0, 4.4], [3.5, 4.4], [5, 5.9], [5, 8.5], [3.5, 10], [1.5, 10], [0, 8.5]]] },
  '6': { w: 5, strokes: [[[5, 1.5], [3.5, 0], [1.5, 0], [0, 1.5], [0, 8.5], [1.5, 10], [3.5, 10], [5, 8.5], [5, 6], [3.5, 4.6], [0, 4.6]]] },
  '7': { w: 5, strokes: [[[0, 0], [5, 0], [5, 2], [2, 8], [2, 10]]] },
  '8': { w: 5, strokes: [[[1.5, 4.9], [0, 3.4], [0, 1.5], [1.5, 0], [3.5, 0], [5, 1.5], [5, 3.4], [3.5, 4.9], [1.5, 4.9], [0, 6.4], [0, 8.5], [1.5, 10], [3.5, 10], [5, 8.5], [5, 6.4], [3.5, 4.9]]] },
  '9': { w: 5, strokes: [[[0, 8.5], [1.5, 10], [3.5, 10], [5, 8.5], [5, 1.5], [3.5, 0], [1.5, 0], [0, 1.5], [0, 4], [1.5, 5.4], [5, 5.4]]] },
  '!': { w: 0, strokes: [[[0, 0], [0, 6.4]], [[0, 10], [0, 10]]] },
  '¡': { w: 0, strokes: [[[0, 3.6], [0, 10]], [[0, 0], [0, 0]]] },
  '?': { w: 5, strokes: [[[0, 1.6], [1.5, 0], [3.5, 0], [5, 1.5], [5, 3], [2.5, 5.5], [2.5, 6.6]], [[2.5, 10], [2.5, 10]]] },
  '¿': { w: 5, strokes: [[[5, 8.4], [3.5, 10], [1.5, 10], [0, 8.5], [0, 7], [2.5, 4.5], [2.5, 3.4]], [[2.5, 0], [2.5, 0]]] },
  '.': { w: 0, strokes: [[[0, 10], [0, 10]]] },
  ',': { w: 0, strokes: [[[0, 10], [-0.6, 11.4]]] },
  '·': { w: 0, strokes: [[[0, 5], [0, 5]]] },
  "'": { w: 0, strokes: [[[0, 0], [0, 3]]] },
  '-': { w: 4, strokes: [[[0, 5.2], [4, 5.2]]] },
  '/': { w: 4, strokes: [[[4, 0], [0, 10]]] },
  ':': { w: 0, strokes: [[[0, 3], [0, 3]], [[0, 9], [0, 9]]] },
  ' ': { w: 2, strokes: [] }
};

/** Marks above (or under) a base letter, from the decomposed form. */
const MARKS: Record<string, readonly (readonly Pt[])[]> = {
  '́': [[[2, -1.4], [3.6, -3.2]]],
  '̀': [[[1.4, -3.2], [3, -1.4]]],
  '̈': [[[1, -2.2], [1, -2.2]], [[4, -2.2], [4, -2.2]]],
  '̃': [[[0.4, -1.6], [1.6, -2.8], [3.4, -1.6], [4.6, -2.8]]],
  '̂': [[[0.8, -1.4], [2.5, -3], [4.2, -1.4]]],
  '̧': [[[2.5, 10.6], [2.5, 12]]]
};

export interface DisplayStyle {
  /** The vertical grade over the cap height, as [position 0..1, colour]. */
  stops: readonly (readonly [number, string])[];
  /** The lit top edge of every stroke. */
  hi: string;
  /** The shaded bottom edge. */
  lo: string;
  /** Inner outline, hugging the letters. */
  edge: string;
  /** Outer outline. */
  outer?: string;
  shadow?: string;
  /** Shear, in units of x per unit of height, for the leaning calls. */
  italic?: number;
  /** Stroke weight in grid units. */
  weight?: number;
}

export interface DisplayImage {
  canvas: HTMLCanvasElement;
  /** Where the cap's top-left sits inside the image. */
  ox: number;
  oy: number;
  /** Width of the set letters, the cap height. */
  w: number;
  h: number;
}

function decompose(text: string): { base: string; marks: string[] }[] {
  const out: { base: string; marks: string[] }[] = [];
  for (const ch of text.toUpperCase().normalize('NFD')) {
    if (MARKS[ch] && out.length) out[out.length - 1].marks.push(ch);
    else if (/[̀-ͯ]/.test(ch)) continue;
    else out.push({ base: GLYPHS[ch] ? ch : '?', marks: [] });
  }
  return out;
}

/** Width the text sets at cap height `h` (without the outline). */
export function displayWidth(text: string, h: number, weight = 1.9): number {
  const u = h / 10;
  let w = 0;
  const cs = decompose(text);
  cs.forEach((c, i) => {
    w += (GLYPHS[c.base].w + weight) * u;
    if (i < cs.length - 1) w += 1.1 * u;
  });
  return Math.round(w);
}

const cache = new Map<string, DisplayImage>();

/** Paint (once) and return the image of `text` at cap height `h`. */
export function displayImage(text: string, h: number, style: DisplayStyle, key: string): DisplayImage {
  const id = `${key}|${h}|${text}`;
  const hit = cache.get(id);
  if (hit) return hit;
  const weight = style.weight ?? 1.9;
  const u = h / 10;
  const r = (weight * u) / 2;
  const edgeW = Math.max(1, Math.round(h / 14));
  const outerW = style.outer ? Math.max(1, Math.round(h / 22)) : 0;
  const shadowD = style.shadow ? Math.max(1, Math.round(h / 12)) : 0;
  const italic = style.italic ?? 0;
  const textW = displayWidth(text, h, weight);
  const pad = edgeW + outerW + 2;
  const lean = Math.ceil(italic * 12 * u);
  const ox = pad + Math.ceil(r);
  const oy = pad + Math.ceil(r) + Math.ceil(3.4 * u);
  const W = ox + textW + lean + pad + shadowD + 2;
  const H = oy + h + Math.ceil(r) + Math.ceil(2.2 * u) + pad + shadowD;
  const mask = new Uint8Array(W * H);
  // The octagonal pen: square with its corners cut.
  const pen: [number, number][] = [];
  const ri = Math.ceil(r);
  for (let dy = -ri - 1; dy <= ri + 1; dy++)
    for (let dx = -ri - 1; dx <= ri + 1; dx++) {
      const ax = Math.abs(dx);
      const ay = Math.abs(dy);
      if (Math.max(ax, ay) <= r && ax + ay <= r * 1.42) pen.push([dx, dy]);
    }
  const stamp = (x: number, y: number) => {
    const cx = Math.round(x);
    const cy = Math.round(y);
    for (const [dx, dy] of pen) {
      const px = cx + dx;
      const py = cy + dy;
      if (px >= 0 && py >= 0 && px < W && py < H) mask[py * W + px] = 1;
    }
  };
  const sweep = (pts: readonly Pt[], x0: number) => {
    const map = ([gx, gy]: Pt): [number, number] => [ox + x0 + gx * u + (10 - gy) * italic * u, oy + gy * u];
    if (pts.length === 1 || (pts.length === 2 && pts[0][0] === pts[1][0] && pts[0][1] === pts[1][1])) {
      const [x, y] = map(pts[0]);
      stamp(x, y);
      return;
    }
    for (let i = 0; i + 1 < pts.length; i++) {
      const [ax, ay] = map(pts[i]);
      const [bx, by] = map(pts[i + 1]);
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) * 2));
      for (let k = 0; k <= n; k++) stamp(ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n);
    }
  };
  let pen0 = 0;
  for (const c of decompose(text)) {
    const g = GLYPHS[c.base];
    for (const s of g.strokes) sweep(s, pen0);
    for (const m of c.marks) {
      const shift = (g.w - 5) / 2;
      for (const s of MARKS[m]) sweep(s.map(([x, y]) => [x + shift, y] as const), pen0);
    }
    pen0 += (g.w + weight + 1.1) * u;
  }

  const buf = new PixBuf(W, H);
  // The face: a dithered grade, lit along every top edge, shaded along the bottom.
  const stops = style.stops;
  const colourAt = (x: number, y: number): string => {
    const t = Math.min(1, Math.max(0, (y - oy + r * 0.6) / (h + r * 1.2)));
    for (let i = 0; i + 1 < stops.length; i++) {
      const [a, ca] = stops[i];
      const [b, cb] = stops[i + 1];
      if (t > b) continue;
      if (b - a < 0.03) return t < b ? ca : cb;
      const f = (t - a) / (b - a);
      return f > bayer(x, y) ? cb : ca;
    }
    return stops[stops.length - 1][1];
  };
  const hiC = rgb(style.hi);
  const loC = rgb(style.lo);
  const thick = h >= 18;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!mask[y * W + x]) continue;
      const up = y > 0 && mask[(y - 1) * W + x];
      const up2 = y > 1 && mask[(y - 2) * W + x];
      const down = y < H - 1 && mask[(y + 1) * W + x];
      const left = x > 0 && mask[y * W + x - 1];
      let c = rgb(colourAt(x, y));
      if (!up || (thick && !up2 && (x + y) % 2 === 0)) c = hiC;
      else if (!left && thick) c = rgb(mix(colourAt(x, y), style.hi, 0.5));
      else if (!down || (thick && y < H - 2 && !mask[(y + 2) * W + x] && (x + y) % 2 === 0)) c = loC;
      buf.data[y * W + x] = c;
    }
  buf.outline(rgb(style.edge), edgeW);
  if (style.outer) buf.outline(rgb(style.outer), outerW);
  if (style.shadow) {
    const sh = rgb(style.shadow);
    const src = buf.data.slice();
    for (let y = H - 1; y >= 0; y--)
      for (let x = W - 1; x >= 0; x--) {
        if (src[y * W + x]) continue;
        const sx = x - shadowD;
        const sy = y - shadowD;
        if (sx >= 0 && sy >= 0 && src[sy * W + sx]) buf.data[y * W + x] = sh;
      }
  }
  const img: DisplayImage = { canvas: buf.toCanvas(), ox, oy, w: textW + lean, h };
  cache.set(id, img);
  return img;
}

/**
 * Draw `text` with its cap top at `y`, centred on `cx` (or left-aligned at
 * `cx` when `align` is 'left', right-aligned when 'right'). The cap height
 * shrinks, if it has to, until the line fits `maxW`.
 */
export function drawDisplay(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  y: number,
  h: number,
  style: DisplayStyle,
  key: string,
  align: 'centre' | 'left' | 'right' = 'centre',
  maxW = 368
): DisplayImage {
  let size = h;
  while (size > 8 && displayWidth(text, size, style.weight) + (style.italic ?? 0) * 12 * (size / 10) > maxW) size--;
  const img = displayImage(text, size, style, key);
  const x = align === 'centre' ? Math.round(cx - img.w / 2) : align === 'left' ? Math.round(cx) : Math.round(cx - img.w);
  ctx.drawImage(img.canvas, x - img.ox, Math.round(y + (h - size) / 2) - img.oy);
  return img;
}

// --- The house styles ---------------------------------------------------------------

export const STYLE = {
  /** ROUND 1: pale gold over a deep orange, the arcade's call colours. */
  round: { stops: [[0, '#ffffff'], [0.3, '#f8f0b0'], [0.62, '#f8c838'], [1, '#d86010']], hi: '#ffffff', lo: '#902800', edge: '#401000', outer: '#000000', shadow: '#000000' },
  /** FIGHT!: hot yellow to red, leaning into it. */
  fight: { stops: [[0, '#fff8c0'], [0.25, '#f8e040'], [0.55, '#f88010'], [1, '#c81008']], hi: '#fffff0', lo: '#600000', edge: '#380000', outer: '#f8f0c8', shadow: '#000000', italic: 0.22, weight: 2.1 },
  /** K.O.: blood red with a white glint. */
  ko: { stops: [[0, '#ffffff'], [0.2, '#f8a0a0'], [0.5, '#f02818'], [1, '#781008']], hi: '#ffffff', lo: '#400000', edge: '#280000', outer: '#f8f0c8', shadow: '#000000', weight: 2.2 },
  /** YOU WIN / PERFECT: gold with a hard horizon, polished. */
  gold: { stops: [[0, '#ffffff'], [0.3, '#f8f090'], [0.52, '#f8c010'], [0.53, '#a85800'], [0.75, '#e09010'], [1, '#f8e070']], hi: '#ffffff', lo: '#603000', edge: '#301000', outer: '#000000', shadow: '#000000' },
  /** Chrome: STREET, VS, the select title. */
  chrome: { stops: [[0, '#ffffff'], [0.42, '#b8d0f0'], [0.5, '#5878c8'], [0.51, '#203078'], [0.75, '#6890e0'], [1, '#d8e8ff']], hi: '#ffffff', lo: '#101848', edge: '#080c28', outer: '#000000', shadow: '#000000' },
  /** Fire: CHAMPION, the VS mark. */
  fire: { stops: [[0, '#ffffc0'], [0.28, '#f8d830'], [0.5, '#f87810'], [0.51, '#c02000'], [0.8, '#e84010'], [1, '#f8a030']], hi: '#fffff0', lo: '#400000', edge: '#280000', outer: '#f8e8b8', shadow: '#000000', weight: 2.2 },
  /** The clock: white over amber, a little narrower. */
  timer: { stops: [[0, '#ffffff'], [0.5, '#f8f0c8'], [1, '#f8a810']], hi: '#ffffff', lo: '#905000', edge: '#000000', weight: 1.8 },
  /** The clock in its last ten seconds. */
  timerLow: { stops: [[0, '#ffffff'], [0.5, '#f8b0a0'], [1, '#e82010']], hi: '#ffffff', lo: '#600000', edge: '#000000', weight: 1.8 },
  /** Cool blue: BONUS STAGE, PLAYER SELECT, CONTINUE. */
  blue: { stops: [[0, '#ffffff'], [0.35, '#c8f0ff'], [0.65, '#48a8f8'], [1, '#1850c0']], hi: '#ffffff', lo: '#082060', edge: '#000828', outer: '#000000', shadow: '#000000' },
  /** Small red: LOSE, TIME OVER. */
  red: { stops: [[0, '#ffffff'], [0.3, '#f8c0a0'], [0.6, '#f04020'], [1, '#901008']], hi: '#ffffff', lo: '#400000', edge: '#200000', outer: '#000000', shadow: '#000000' },
  /** The combo counter. */
  combo: { stops: [[0, '#ffffff'], [0.4, '#f8f060'], [1, '#f86010']], hi: '#ffffff', lo: '#802000', edge: '#200000', italic: 0.15, weight: 1.9 }
} satisfies Record<string, DisplayStyle>;
