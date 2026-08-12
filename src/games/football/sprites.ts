/**
 * Sprite baking and the CALCIO '90 palette.
 *
 * Every colour the cabinet paints lives in {@link PALETTE} and every value is
 * on the Mega Drive's 3-bit-per-channel ladder (00/24/49/6D/92/B6/DB/FF), which
 * `tests/games/football-render.test.ts` asserts by scanning this file, font.ts
 * and render.ts for hex literals. The palette sits here rather than in
 * render.ts because sprites.ts is the lowest layer that puts pixels down;
 * render.ts re-exports it so callers have one import.
 *
 * Sprites are authored once as character masks and baked per kit into
 * offscreen canvases at load. The masks are shared — only the colour a letter
 * maps to changes per team — so twelve kits cost twelve bakes of the same
 * artwork rather than twelve sets of artwork. Nothing here touches `document`
 * at module load: `createSpriteSheet()` is called from the renderer, which
 * only ever exists in the browser.
 */

/** The whole cabinet's colour set. Ladder-legal by construction. */
export const PALETTE = {
  black: '#000000',
  white: '#FFFFFF',

  grass: '#249224',
  grassBand: '#246D24',
  speckleLight: '#49B624',
  speckleDark: '#006D00',
  marking: '#B6FFDB',

  goalFrame: '#DBDBDB',
  netLine: '#FFFFFF',
  netFill: '#92B692',

  terraceFloor: '#492400',
  terraceStep: '#6D4900',
  flag: '#FF0000',

  hair: '#000000',
  skin: '#DB9249',
  boot: '#242424',
  outline: '#000000',
  glove: '#FFFFFF',

  ballWhite: '#FFFFFF',
  ballPatch: '#242424',
  ballShadow: '#006D00',

  hudPanel: '#002400',
  hudRule: '#B6FFDB',
  hudText: '#FFFFFF',
  hudDim: '#49B624',
  scoreText: '#B6FFDB',
  scoreOutline: '#004924',

  radarFrame: '#492400',
  radarPitch: '#B69224',
  radarMarking: '#B6FFDB',
  radarView: '#FF0000',
  radarA: '#49DBFF',
  radarB: '#FFDB00',
  radarBall: '#FF0000',

  triangle: '#FFDB00',
  triangleOutline: '#492400',
  /**
   * The marker's other colour, and the HUD arrow's: the A button under the
   * thumb is a shot rather than a clearance. Red is the one hue on the ladder
   * that cannot be mistaken for the gold marker, the mint chalk or the grass,
   * and it is already the cabinet's "look here" colour on the radar.
   */
  shotArmed: '#FF0000',
  markerIdle: '#B6FFDB',
  markerPicked: '#FFDB00',

  bannerText: '#B6FFDB',
  bannerShadow: '#0049DB',

  menuBg: '#DB9249',
  menuPanel: '#492400',
  menuBar: '#FF4900',
  menuBarLight: '#FF9200',
  menuBarDark: '#920000',
  menuSelected: '#0049DB',
  menuText: '#000000',
  menuField: '#24B6FF',

  titleBand: '#DB0000',
  titleRuleDark: '#920000',
  titleRuleGreen: '#00B649',
  titleRuleWhite: '#FFFFFF',
  /**
   * The specification's F0F0F0 wordmark panel is not on the 3-bit ladder, and
   * 8.1 forbids anything that is not. Snapped to the nearest rung, DB.
   */
  titlePanel: '#DBDBDB',
  titleCredit: '#009224',

  pipFull: '#B6FFDB',
  pipEmpty: '#004924',
  trophyShade: '#6D4900'
} as const;

/** Confetti colours for the terrace crowd and the champion screen. */
export const CROWD_COLOURS: readonly string[] = [
  '#FF0000',
  '#FFDB00',
  '#0049DB',
  '#FFFFFF',
  '#49DBFF',
  '#DB9249'
];

/* ------------------------------------------------------------------ */
/* sprite masks                                                        */

export const PLAYER_W = 14;
export const PLAYER_H = 12;
export const SLIDE_W = 20;
export const SLIDE_H = 16;
export const DIVE_W = 18;
export const DIVE_H = 12;
export const BALL_MIN = 6;
export const BALL_MAX = 9;
export const TRIANGLE_W = 7;
export const TRIANGLE_H = 6;
export const SHADOW_W = 6;
export const SHADOW_H = 2;
export const MARKER_SIZE = 9;

/**
 * Mask letters: `o` outline, `k` kit primary, `t` trim (shorts), `h` hair,
 * `s` skin (gloves on a keeper), `b` boots, `.` transparent.
 *
 * The head blob shifts toward the facing, which is the whole direction cue at
 * this size — 14x12 has no room for a face.
 */
const FACE_SOUTH: readonly string[][] = [
  [
    '...oooooooo...',
    '..okkkkkkkko..',
    '.okkkhhhhkkko.',
    'sokkhhhhhhkkos',
    'sokkhhsshhkkos',
    '.okkkhhhhkkko.',
    '.okkkkkkkkkko.',
    '..okkkkkkkko..',
    '...oooooooo...',
    '....otttto....',
    '....otttto....',
    '....bb..bb....'
  ],
  [
    '...oooooooo...',
    '..okkkkkkkko..',
    '.okkkhhhhkkko.',
    '.okkhhhhhhkkos',
    'sokkhhsshhkko.',
    '.okkkhhhhkkko.',
    '.okkkkkkkkkko.',
    '..okkkkkkkko..',
    '...oooooooo...',
    '....otttto....',
    '....otttto....',
    '...bb....bb...'
  ]
];

const FACE_NORTH: readonly string[][] = [
  [
    '...oooooooo...',
    '..okhhhhhhko..',
    '.okhhhhhhhhko.',
    'sokhhhhhhhhkos',
    'sokkhhhhhhkkos',
    '.okkkkkkkkkko.',
    '.okkkkkkkkkko.',
    '..okkkkkkkko..',
    '...oooooooo...',
    '....otttto....',
    '....otttto....',
    '....bb..bb....'
  ],
  [
    '...oooooooo...',
    '..okhhhhhhko..',
    '.okhhhhhhhhko.',
    '.okhhhhhhhhkos',
    'sokkhhhhhhkko.',
    '.okkkkkkkkkko.',
    '.okkkkkkkkkko.',
    '..okkkkkkkko..',
    '...oooooooo...',
    '....otttto....',
    '....otttto....',
    '...bb....bb...'
  ]
];

/** Facing east; west is the same bake mirrored. */
const FACE_EAST: readonly string[][] = [
  [
    '...oooooooo...',
    '..okkkkkkkko..',
    '.okkkkkhhhhko.',
    'sokkkkhhhhhko.',
    '.okkkkhhhhhkos',
    '.okkkkkhhhhko.',
    '.okkkkkkkkkko.',
    '..okkkkkkkko..',
    '...oooooooo...',
    '....otttto....',
    '....otttto....',
    '.....bb.bb....'
  ],
  [
    '...oooooooo...',
    '..okkkkkkkko..',
    '.okkkkkhhhhko.',
    '.okkkkhhhhhkos',
    'sokkkkhhhhhko.',
    '.okkkkkhhhhko.',
    '.okkkkkkkkkko.',
    '..okkkkkkkko..',
    '...oooooooo...',
    '....otttto....',
    '....otttto....',
    '....bb...bb...'
  ]
];

/**
 * The slide: an oversized, deliberately jarring articulated figure lying from
 * head (upper left) to boots (lower right), exactly the frame the original
 * threw on screen. Mirrored for a slide to the left.
 */
const SLIDE_MASK: readonly string[] = [
  '....................',
  '..oooo..............',
  '.ohhhho.............',
  '.ohhhho.............',
  '.okkkkoo............',
  'sokkkkkkoo..........',
  'sokkkkkkkkoo........',
  '.okkkkkkkkkkoo......',
  '..okkkkkkkttoo......',
  '...ookkkkttttoo.....',
  '.....ootttttboo.....',
  '........ottbbboo....',
  '..........obbbboo...',
  '............obboo...',
  '.............ooo....',
  '....................'
];

/** The keeper's dive frame: outstretched to the right, legs trailing. */
const DIVE_MASK: readonly string[] = [
  '......oooo........',
  '.....okhhko.......',
  '....okkhhhkko.....',
  '...okkkkkkkkkoo...',
  '..otkkkkkkkkkkoo..',
  '.ottkkkkkkkkkkkso.',
  '.ottkkkkkkkkkkkso.',
  '..otkkkkkkkkkkoo..',
  '...okkkkkkkkkoo...',
  '..obb..obb........',
  '.obb....obb.......',
  '..................'
];

/** Gold control triangle, pointing up at the controlled player's feet. */
const TRIANGLE_MASK: readonly string[] = [
  '...o...',
  '..oyo..',
  '.oyyyo.',
  'oyyyyyo',
  'oyyyyyo',
  'ooooooo'
];

/** Corner-cross landing marker: a diamond the stick moves between. */
const MARKER_MASK: readonly string[] = [
  '....m....',
  '...m.m...',
  '..m...m..',
  '.m.....m.',
  'm.......m',
  '.m.....m.',
  '..m...m..',
  '...m.m...',
  '....m....'
];

/* ------------------------------------------------------------------ */
/* baking                                                              */

function newCanvas(w: number, h: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return canvas;
}

/** Paint a character mask into a fresh canvas, one fillRect run per colour. */
function bakeMask(rows: readonly string[], colours: Record<string, string>): HTMLCanvasElement {
  const h = rows.length;
  const w = rows[0].length;
  const canvas = newCanvas(w, h);
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  for (let y = 0; y < h; y++) {
    const row = rows[y];
    let runStart = -1;
    let runChar = '';
    for (let x = 0; x <= w; x++) {
      const ch = x < w ? row[x] : '.';
      if (ch !== runChar) {
        if (runStart >= 0 && colours[runChar]) {
          ctx.fillStyle = colours[runChar];
          ctx.fillRect(runStart, y, x - runStart, 1);
        }
        runChar = ch;
        runStart = ch === '.' ? -1 : x;
      }
    }
  }
  return canvas;
}

/** Mirror a baked sprite horizontally; integer pixels, so this is exact. */
function mirror(source: HTMLCanvasElement): HTMLCanvasElement {
  const canvas = newCanvas(source.width, source.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.imageSmoothingEnabled = false;
  ctx.translate(source.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(source, 0, 0);
  return canvas;
}

/** A filled pixel circle of diameter `d`, with the ball's three dark patches. */
function bakeBall(d: number): HTMLCanvasElement {
  const canvas = newCanvas(d, d);
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const r = d / 2;
  ctx.fillStyle = PALETTE.ballWhite;
  for (let y = 0; y < d; y++) {
    for (let x = 0; x < d; x++) {
      const dx = x + 0.5 - r;
      const dy = y + 0.5 - r;
      if (dx * dx + dy * dy <= r * r) ctx.fillRect(x, y, 1, 1);
    }
  }
  ctx.fillStyle = PALETTE.ballPatch;
  const patches: ReadonlyArray<readonly [number, number]> = [
    [0.34, 0.34],
    [0.66, 0.5],
    [0.28, 0.68]
  ];
  for (const [fx, fy] of patches) {
    ctx.fillRect(Math.floor(fx * d), Math.floor(fy * d), 1, 1);
  }
  return canvas;
}

/** The flat shadow under an airborne ball. */
function bakeShadow(): HTMLCanvasElement {
  const canvas = newCanvas(SHADOW_W, SHADOW_H);
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.fillStyle = PALETTE.ballShadow;
  ctx.fillRect(1, 0, SHADOW_W - 2, 1);
  ctx.fillRect(0, 1, SHADOW_W, 1);
  return canvas;
}

/* ------------------------------------------------------------------ */
/* sheet                                                               */

export interface PlayerSprites {
  /** `[facing][frame]`, facing 0 = north, 1 = east, 2 = south, 3 = west. */
  run: HTMLCanvasElement[][];
  /** Slide frames, index 0 sliding right, 1 sliding left. */
  slide: [HTMLCanvasElement, HTMLCanvasElement];
}

export interface KeeperSprites extends PlayerSprites {
  /** Dive frames, index 0 diving right, 1 diving left. */
  dive: [HTMLCanvasElement, HTMLCanvasElement];
}

export interface SpriteSheet {
  /** Baked outfield kit, memoised per colour pair. */
  outfield(primary: string, trim: string): PlayerSprites;
  /** Baked keeper kit, memoised per colour. */
  keeper(kit: string): KeeperSprites;
  /** The ball at the size its height earns. */
  ball(z: number): HTMLCanvasElement;
  ballShadow: HTMLCanvasElement;
  /**
   * The control marker at the player's feet. `armed` draws it in the shot
   * colour: inside shooting range A is a shot, outside it a clearance, and
   * the marker is where that boundary is told.
   */
  triangle(armed: boolean): HTMLCanvasElement;
  /** Corner landing marker; the stick's pick is drawn in gold. */
  marker(picked: boolean): HTMLCanvasElement;
}

/** Facing index for a unit facing vector: N, E, S, W with diagonals snapped. */
export function facingIndex(fx: number, fy: number): number {
  if (Math.abs(fx) > Math.abs(fy)) return fx >= 0 ? 1 : 3;
  return fy >= 0 ? 2 : 0;
}

/** Ball sprite size for a height, 6 px on the deck up to 9 px at z = 40. */
export function ballSize(z: number): number {
  const t = Math.max(0, Math.min(1, z / 40));
  return BALL_MIN + Math.round((BALL_MAX - BALL_MIN) * t);
}

function bakeKit(primary: string, trim: string, arms: string): PlayerSprites {
  const colours: Record<string, string> = {
    o: PALETTE.outline,
    k: primary,
    t: trim,
    h: PALETTE.hair,
    s: arms,
    b: PALETTE.boot
  };
  const east = FACE_EAST.map(rows => bakeMask(rows, colours));
  const slideRight = bakeMask(SLIDE_MASK, colours);
  return {
    run: [
      FACE_NORTH.map(rows => bakeMask(rows, colours)),
      east,
      FACE_SOUTH.map(rows => bakeMask(rows, colours)),
      east.map(mirror)
    ],
    slide: [slideRight, mirror(slideRight)]
  };
}

/**
 * Bake the whole sheet. Kits are memoised by colour so two teams sharing a
 * primary (Leoni and Api both wear `#FFDB00`) bake once.
 */
export function createSpriteSheet(): SpriteSheet {
  const outfields = new Map<string, PlayerSprites>();
  const keepers = new Map<string, KeeperSprites>();
  const balls = new Map<number, HTMLCanvasElement>();
  const shadow = bakeShadow();
  const triangle = bakeMask(TRIANGLE_MASK, {
    o: PALETTE.triangleOutline,
    y: PALETTE.triangle
  });
  const triangleArmed = bakeMask(TRIANGLE_MASK, {
    o: PALETTE.triangleOutline,
    y: PALETTE.shotArmed
  });
  const markerIdle = bakeMask(MARKER_MASK, { m: PALETTE.markerIdle });
  const markerPicked = bakeMask(MARKER_MASK, { m: PALETTE.markerPicked });

  return {
    outfield(primary, trim) {
      const key = `${primary}|${trim}`;
      let sprites = outfields.get(key);
      if (!sprites) {
        sprites = bakeKit(primary, trim, PALETTE.skin);
        outfields.set(key, sprites);
      }
      return sprites;
    },
    keeper(kit) {
      let sprites = keepers.get(kit);
      if (!sprites) {
        // Gloves replace the bare arms, and the shorts go boot-dark so the
        // keeper reads as one solid block of his own colour.
        const base = bakeKit(kit, PALETTE.boot, PALETTE.glove);
        const diveRight = bakeMask(DIVE_MASK, {
          o: PALETTE.outline,
          k: kit,
          t: PALETTE.boot,
          h: PALETTE.hair,
          s: PALETTE.glove,
          b: PALETTE.boot
        });
        sprites = { ...base, dive: [diveRight, mirror(diveRight)] };
        keepers.set(kit, sprites);
      }
      return sprites;
    },
    ball(z) {
      const size = ballSize(z);
      let baked = balls.get(size);
      if (!baked) {
        baked = bakeBall(size);
        balls.set(size, baked);
      }
      return baked;
    },
    ballShadow: shadow,
    triangle(armed) {
      return armed ? triangleArmed : triangle;
    },
    marker(picked) {
      return picked ? markerPicked : markerIdle;
    }
  };
}
