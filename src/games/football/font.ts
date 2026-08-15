/**
 * CALCIO '90's 5x7 bitmap font.
 *
 * Every word the cabinet puts on screen is drawn from this table with
 * `fillRect` runs, never with `ctx.fillText` — a system font would be the one
 * anti-aliased thing in an otherwise nearest-neighbour framebuffer, and it
 * would resample differently at every integer blit scale.
 *
 * Glyphs are authored as seven five-character rows (`#` on, `.` off) and
 * compiled to row bitmasks once at module load. The font is uppercase only:
 * `drawText` upper-cases its input, which is also how the accented vowels the
 * Spanish and Catalan strings carry (`É`, `À`, `Ï`, …) find a glyph. Those are
 * composed from a six-row "short" vowel with the accent occupying the top row,
 * so every glyph still fits the same 5x7 cell and no line ever bleeds into the
 * one above it.
 *
 * DOM-free: the module exports pure data plus draw helpers that take a
 * context, so `tests/games/football-render.test.ts` can assert glyph coverage
 * in the node environment.
 */

export const GLYPH_W = 5;
export const GLYPH_H = 7;
/** Gap between glyphs, in unscaled font pixels. */
export const TRACKING = 1;
/** Drawn in place of any character with no glyph. */
export const FALLBACK = '?';

const EMPTY_ROW = '.....';

/** Full-height glyphs, seven rows each. */
const RAW: Record<string, string> = {
  ' ': [EMPTY_ROW, EMPTY_ROW, EMPTY_ROW, EMPTY_ROW, EMPTY_ROW, EMPTY_ROW, EMPTY_ROW].join('|'),
  A: '.###.|#...#|#...#|#####|#...#|#...#|#...#',
  B: '####.|#...#|#...#|####.|#...#|#...#|####.',
  C: '.###.|#...#|#....|#....|#....|#...#|.###.',
  D: '####.|#...#|#...#|#...#|#...#|#...#|####.',
  E: '#####|#....|#....|####.|#....|#....|#####',
  F: '#####|#....|#....|####.|#....|#....|#....',
  G: '.###.|#...#|#....|#.###|#...#|#...#|.###.',
  H: '#...#|#...#|#...#|#####|#...#|#...#|#...#',
  I: '.###.|..#..|..#..|..#..|..#..|..#..|.###.',
  J: '..###|...#.|...#.|...#.|...#.|#..#.|.##..',
  K: '#...#|#..#.|#.#..|##...|#.#..|#..#.|#...#',
  L: '#....|#....|#....|#....|#....|#....|#####',
  M: '#...#|##.##|#.#.#|#.#.#|#...#|#...#|#...#',
  N: '#...#|##..#|#.#.#|#.#.#|#..##|#...#|#...#',
  O: '.###.|#...#|#...#|#...#|#...#|#...#|.###.',
  P: '####.|#...#|#...#|####.|#....|#....|#....',
  Q: '.###.|#...#|#...#|#...#|#.#.#|#..#.|.##.#',
  R: '####.|#...#|#...#|####.|#.#..|#..#.|#...#',
  S: '.####|#....|#....|.###.|....#|....#|####.',
  T: '#####|..#..|..#..|..#..|..#..|..#..|..#..',
  U: '#...#|#...#|#...#|#...#|#...#|#...#|.###.',
  V: '#...#|#...#|#...#|#...#|#...#|.#.#.|..#..',
  W: '#...#|#...#|#...#|#.#.#|#.#.#|##.##|#...#',
  X: '#...#|#...#|.#.#.|..#..|.#.#.|#...#|#...#',
  Y: '#...#|#...#|.#.#.|..#..|..#..|..#..|..#..',
  Z: '#####|....#|...#.|..#..|.#...|#....|#####',
  '0': '.###.|#...#|#..##|#.#.#|##..#|#...#|.###.',
  '1': '..#..|.##..|..#..|..#..|..#..|..#..|.###.',
  '2': '.###.|#...#|....#|...#.|..#..|.#...|#####',
  '3': '#####|...#.|..##.|....#|....#|#...#|.###.',
  '4': '...#.|..##.|.#.#.|#..#.|#####|...#.|...#.',
  '5': '#####|#....|####.|....#|....#|#...#|.###.',
  '6': '..##.|.#...|#....|####.|#...#|#...#|.###.',
  '7': '#####|....#|...#.|..#..|.#...|.#...|.#...',
  '8': '.###.|#...#|#...#|.###.|#...#|#...#|.###.',
  '9': '.###.|#...#|#...#|.####|....#|...#.|.##..',
  '!': '..#..|..#..|..#..|..#..|..#..|.....|..#..',
  '"': '.#.#.|.#.#.|.....|.....|.....|.....|.....',
  "'": '..#..|..#..|.....|.....|.....|.....|.....',
  '(': '...#.|..#..|.#...|.#...|.#...|..#..|...#.',
  ')': '.#...|..#..|...#.|...#.|...#.|..#..|.#...',
  '+': '.....|..#..|..#..|#####|..#..|..#..|.....',
  ',': '.....|.....|.....|.....|..#..|..#..|.#...',
  '-': '.....|.....|.....|.###.|.....|.....|.....',
  '.': '.....|.....|.....|.....|.....|.....|..#..',
  '/': '....#|....#|...#.|..#..|.#...|#....|#....',
  ':': '.....|..#..|..#..|.....|..#..|..#..|.....',
  ';': '.....|..#..|..#..|.....|..#..|..#..|.#...',
  '=': '.....|.....|#####|.....|#####|.....|.....',
  '?': '.###.|#...#|....#|...#.|..#..|.....|..#..',
  '%': '#...#|...#.|..#..|..#..|.#...|#...#|.....',
  '·': '.....|.....|.....|..#..|.....|.....|.....',
  '¡': '..#..|.....|..#..|..#..|..#..|..#..|..#..',
  '¿': '..#..|.....|..#..|.#...|#....|#...#|.###.'
};

/** Six-row bodies used under an accent, so the accented cell stays 5x7. */
const SHORT: Record<string, string> = {
  A: '.###.|#...#|#...#|#####|#...#|#...#',
  E: '#####|#....|####.|#....|#....|#####',
  I: '.###.|..#..|..#..|..#..|..#..|.###.',
  O: '.###.|#...#|#...#|#...#|#...#|.###.',
  U: '#...#|#...#|#...#|#...#|#...#|.###.',
  N: '#...#|##..#|#.#.#|#..##|#...#|#...#'
};

const ACUTE = '...#.';
const GRAVE = '.#...';
const DIAERESIS = '.#.#.';
const TILDE = '.###.';

/** Accented capitals: accent row on top, short body below. */
const ACCENTED: Record<string, string> = {
  À: `${GRAVE}|${SHORT.A}`,
  Á: `${ACUTE}|${SHORT.A}`,
  È: `${GRAVE}|${SHORT.E}`,
  É: `${ACUTE}|${SHORT.E}`,
  Ì: `${GRAVE}|${SHORT.I}`,
  Í: `${ACUTE}|${SHORT.I}`,
  Ï: `${DIAERESIS}|${SHORT.I}`,
  Ò: `${GRAVE}|${SHORT.O}`,
  Ó: `${ACUTE}|${SHORT.O}`,
  Ù: `${GRAVE}|${SHORT.U}`,
  Ú: `${ACUTE}|${SHORT.U}`,
  Ü: `${DIAERESIS}|${SHORT.U}`,
  Ñ: `${TILDE}|${SHORT.N}`,
  // Ç hangs its cedilla off the bottom row instead of taking an accent row.
  Ç: '.###.|#...#|#....|#....|#...#|.###.|..#..'
};

function compile(rows: string): number[] {
  return rows.split('|').map(row => {
    let mask = 0;
    for (let col = 0; col < GLYPH_W; col++) {
      if (row[col] === '#') mask |= 1 << (GLYPH_W - 1 - col);
    }
    return mask;
  });
}

/** Every glyph, as seven row bitmasks (bit 4 is the leftmost pixel). */
export const GLYPHS: Readonly<Record<string, readonly number[]>> = Object.freeze(
  Object.fromEntries(
    Object.entries({ ...RAW, ...ACCENTED }).map(([ch, rows]) => [ch, compile(rows)])
  )
);

/** The authored source rows, so a test can assert every cell is 7x5. */
export const GLYPH_SOURCE: Readonly<Record<string, string>> = Object.freeze({
  ...RAW,
  ...ACCENTED
});

/** Upper-case and normalise a string the way `drawText` will render it. */
export function normaliseText(text: string): string {
  return text.toUpperCase();
}

/** True when the font can draw `ch` (after the same upper-casing drawText does). */
export function hasGlyph(ch: string): boolean {
  return normaliseText(ch) in GLYPHS;
}

function glyphFor(ch: string): readonly number[] {
  return GLYPHS[ch] ?? GLYPHS[FALLBACK];
}

/** Pixel width of `text` at `scale`, including inter-glyph tracking. */
export function textWidth(text: string, scale = 1): number {
  const n = normaliseText(text).length;
  if (n === 0) return 0;
  return (n * (GLYPH_W + TRACKING) - TRACKING) * scale;
}

/** Pixel height of one line at `scale`. */
export function textHeight(scale = 1): number {
  return GLYPH_H * scale;
}

export interface TextOptions {
  /** Integer pixel size of one font pixel. */
  scale?: number;
  color: string;
  /** Drop shadow drawn behind the glyphs, offset in framebuffer pixels. */
  shadow?: { color: string; dx: number; dy: number };
  /** 1 px halo around the glyphs, drawn in framebuffer pixels. */
  outline?: string;
}

/** Draw one pass of the glyph runs; the shadow and outline reuse it. */
function drawPass(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  scale: number,
  color: string
): void {
  ctx.fillStyle = color;
  const advance = (GLYPH_W + TRACKING) * scale;
  let penX = x;
  for (const ch of text) {
    const glyph = glyphFor(ch);
    for (let row = 0; row < GLYPH_H; row++) {
      const bits = glyph[row];
      if (!bits) continue;
      // Batch consecutive lit pixels into one fillRect: a word at scale 3 is
      // a handful of rects instead of a hundred.
      let runStart = -1;
      for (let col = 0; col <= GLYPH_W; col++) {
        const on = col < GLYPH_W && (bits & (1 << (GLYPH_W - 1 - col))) !== 0;
        if (on && runStart < 0) runStart = col;
        else if (!on && runStart >= 0) {
          ctx.fillRect(penX + runStart * scale, y + row * scale, (col - runStart) * scale, scale);
          runStart = -1;
        }
      }
    }
    penX += advance;
  }
}

const OUTLINE_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1]
];

/**
 * Draw `text` with its top-left at (x, y). Shadow first, then the 1 px
 * outline, then the glyphs — the order the banner and the score both need.
 */
export function drawText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  opts: TextOptions
): void {
  const scale = opts.scale ?? 1;
  const upper = normaliseText(text);
  if (opts.shadow) {
    drawPass(ctx, upper, x + opts.shadow.dx, y + opts.shadow.dy, scale, opts.shadow.color);
  }
  if (opts.outline) {
    for (const [dx, dy] of OUTLINE_OFFSETS) {
      drawPass(ctx, upper, x + dx, y + dy, scale, opts.outline);
    }
  }
  drawPass(ctx, upper, x, y, scale, opts.color);
}

/** Draw `text` centred on `cx`, snapped to a whole framebuffer pixel. */
export function drawTextCentred(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  y: number,
  opts: TextOptions
): void {
  const w = textWidth(text, opts.scale ?? 1);
  drawText(ctx, text, Math.round(cx - w / 2), Math.round(y), opts);
}

/** Draw `text` with its right edge at `rx`. */
export function drawTextRight(
  ctx: CanvasRenderingContext2D,
  text: string,
  rx: number,
  y: number,
  opts: TextOptions
): void {
  const w = textWidth(text, opts.scale ?? 1);
  drawText(ctx, text, Math.round(rx - w), Math.round(y), opts);
}
