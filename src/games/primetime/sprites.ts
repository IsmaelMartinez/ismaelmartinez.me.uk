/**
 * PRIME TIME's pixel art: the contestant, the clubbers and the three bosses
 * as authored bitmaps in the manner of Smash TV's own digitised-looking
 * sprites, drawn with a one-letter palette per row and rendered once into an
 * offscreen canvas per sprite (`sprite()`), then blitted with smoothing off
 * so every block stays a block at any device-pixel ratio.
 *
 * A row's width is checked against its sprite at import, so a slipped pixel
 * fails `primetime-dom.test.ts` (which imports the page's module graph)
 * rather than drawing a sheared figure. `.` is transparent.
 */

export interface SpriteDef {
  rows: string[];
  palette: Record<string, string>;
  /** Logical pixels per bitmap pixel. */
  scale: number;
}

export interface Sprite {
  canvas: HTMLCanvasElement;
  w: number;
  h: number;
}

const cache = new Map<string, Sprite>();

/** The rendered sprite, built on first use and kept; null until a canvas context exists. */
export function sprite(name: string, def: SpriteDef): Sprite | null {
  const hit = cache.get(name);
  if (hit) return hit;
  const w = def.rows[0].length;
  for (const row of def.rows) {
    if (row.length !== w) throw new Error(`sprite ${name}: row "${row}" is ${row.length} wide, not ${w}`);
  }
  const canvas = document.createElement('canvas');
  canvas.width = w * def.scale;
  canvas.height = def.rows.length * def.scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  def.rows.forEach((row, y) => {
    for (let x = 0; x < w; x++) {
      const c = row[x];
      if (c === '.') continue;
      const colour = def.palette[c];
      if (!colour) throw new Error(`sprite ${name}: no colour for "${c}"`);
      ctx.fillStyle = colour;
      ctx.fillRect(x * def.scale, y * def.scale, def.scale, def.scale);
    }
  });
  const built = { canvas, w: canvas.width, h: canvas.height };
  cache.set(name, built);
  return built;
}

/** Blits a sprite centred on (x, y), optionally mirrored, with no smoothing. */
export function drawSprite(ctx: CanvasRenderingContext2D, s: Sprite | null, x: number, y: number, flipX = false, angle = 0): void {
  if (!s) return;
  const smoothing = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  if (angle) ctx.rotate(angle);
  if (flipX) ctx.scale(-1, 1);
  ctx.drawImage(s.canvas, -s.w / 2, -s.h / 2);
  ctx.restore();
  ctx.imageSmoothingEnabled = smoothing;
}

/** Shared tones: a black outline, skin, the contestant's kit, the clubbers' hide. */
const K = '#0b0b12';
const SKIN = '#f1c27d';
const SKIN_D = '#c98f55';

/**
 * The contestant, seen from above and in front as Smash TV draws its
 * players: dark hair under a red headband, bare shoulders, a blue tank top,
 * dark trousers. The legs and the gun are drawn by the renderer (the legs
 * scissor with the walk, the gun turns with the aim), so the bitmap stops at
 * the belt.
 */
export const PLAYER: SpriteDef = {
  scale: 2,
  palette: { k: K, h: '#2b1d14', r: '#ef4444', s: SKIN, d: SKIN_D, e: '#ffffff', v: '#3b82f6', V: '#1d4ed8', b: '#1f2937', y: '#facc15' },
  rows: [
    '.....kkkk.....',
    '....khhhhk....',
    '...khhhhhhk...',
    '...krrrrrrk...',
    '...kssssssk...',
    '...kseksekk...',
    '....kssssk....',
    '.....kddk.....',
    '..kkkkvvkkkk..',
    '.kssskvvkssskk',
    'kssskVvvVkssdk',
    'kssskvvvvkdddk',
    'kdddkvyyvkdddk',
    '.kkk.kVVk.kkk.',
    '.....kbbk.....',
    '....kbbbbk....'
  ]
};

/**
 * A clubber: Smash TV's grunt is a bald blue-skinned bruiser in an orange
 * vest with a wooden club. Two frames, the legs apart and together.
 */
const GRUNT_PALETTE = { k: K, b: '#5b8def', B: '#2f54b8', e: '#ef4444', o: '#f97316', O: '#c2410c', t: '#3f3f46', w: '#a16207', W: '#713f12' };
export const GRUNT: SpriteDef[] = [
  {
    scale: 2,
    palette: GRUNT_PALETTE,
    rows: [
      '...kkkk...',
      '..kbbbbk..',
      '..kbebek..',
      '..kbbbbk..',
      '...kBBk...',
      '.kkoookk.w',
      'kbkooookbW',
      'kbkoOOokbk',
      'kBkooookBk',
      '.kkoookkk.',
      '..kttttk..',
      '..kt..tk..',
      '..kk..kk..',
      '..........'
    ]
  },
  {
    scale: 2,
    palette: GRUNT_PALETTE,
    rows: [
      '...kkkk...',
      '..kbbbbk..',
      '..kbebek..',
      '..kbbbbk..',
      '...kBBk...',
      '.kkoookkw.',
      'kbkooookWk',
      'kbkoOOokbk',
      'kBkooookBk',
      '.kkoookkk.',
      '..kttttk..',
      '.ktt..ttk.',
      '.kk....kk.',
      '..........'
    ]
  }
];

/**
 * Mutoid Man's upper half: a pink mutant torso bolted to steel shoulders,
 * a chrome half-face with a red visor, a grin of steel teeth. The tank base
 * and the arm cannons are the renderer's (the cannons turn with the aim).
 */
const MUTOID_PALETTE = { k: K, p: '#f4a3b2', P: '#c9657a', m: '#9ca3af', M: '#4b5563', r: '#ef4444', t: '#e5e7eb', c: '#1f2937', y: '#facc15' };
export const MUTOID: SpriteDef = {
  scale: 3,
  palette: MUTOID_PALETTE,
  rows: [
    '..........kkkkkkkk...........',
    '.........kmmmmmmmmk..........',
    '........kmmmmkkkkmmmk........',
    '........kmmmkrrrrkmmk........',
    '........kmmmkrrrrkmmk........',
    '........kmmmmkkkkmmmk........',
    '.........kmppppppppk.........',
    '.........kpktttttkpk.........',
    '..........kkkkkkkkk..........',
    '.....kkkkkkpppppppkkkkkk.....',
    '...kkmmmmmkppppppppkmmmmmkk..',
    '..kmmMMMMmkppPPppPPpkmMMMMmk.',
    '.kmMMMMMMMkppppppppppkMMMMMmk',
    '.kMMMMMMMkppPPpppPPppkMMMMMMk',
    '.kMMMMMMkpppppppppppppkMMMMMk',
    '.kkMMMMkpppPPPPPPPPpppkMMMMkk',
    '..kkkkkkpppppppppppppppkkkkk.',
    '.......kPPpppppppppppPPk.....',
    '.......kpPPPPPPPPPPPPPpk.....',
    '........kkPPPPPPPPPPPkk......',
    '..........kcccyycccck........',
    '..........kkkkkkkkkkk........'
  ]
};

/**
 * Scarface: a floating head the size of a contestant's whole body, grey-green
 * hide, a steel plate riveted over one eye, the scar that names him, a
 * grimace of broken teeth. The second frame is the wind-up before a charge:
 * the mouth open, the eye red.
 */
const SCARFACE_PALETTE = { k: K, g: '#9ab38a', G: '#5b7250', m: '#9ca3af', M: '#4b5563', r: '#b91c1c', e: '#ffffff', E: '#ef4444', p: '#111827', t: '#e5e7eb', s: '#7f1d1d' };
export const SCARFACE: SpriteDef[] = [
  {
    scale: 3,
    palette: SCARFACE_PALETTE,
    rows: [
      '.....kkkkkkkkkk.....',
      '...kkggggggggggkk...',
      '..kggggggggggggggk..',
      '.kggggggkmmmmmmmggk.',
      '.kgggggkmMmmmmmMmgk.',
      'kggrgggkmmmMMMmmmmgk',
      'kgggrggkmmmmmmmmmmgk',
      'kggggrgkkkkkkkkkkggk',
      'kgeeegrgggggggggggGk',
      'kgepegggrggggggggGGk',
      'kgeeeggggrgggGGGGGGk',
      'kgggggggggrgGGGGGGGk',
      '.kGGGGkkkkkkkkkGGGk.',
      '.kGGGktptptptptkGGk.',
      '..kGGktttttttttkGk..',
      '..kkGkptptptptpkkk..',
      '...kkkkkkkkkkkkkk...',
      '......kkkkkkkk......'
    ]
  },
  {
    scale: 3,
    palette: SCARFACE_PALETTE,
    rows: [
      '.....kkkkkkkkkk.....',
      '...kkggggggggggkk...',
      '..kggggggggggggggk..',
      '.kggggggkmmmmmmmggk.',
      '.kgggggkmMmmmmmMmgk.',
      'kggrgggkmmmMMMmmmmgk',
      'kgggrggkmmmmmmmmmmgk',
      'kggggrgkkkkkkkkkkggk',
      'kgEEEgrgggggggggggGk',
      'kgEpEgggrggggggggGGk',
      'kgEEEggggrgggGGGGGGk',
      'kgggggggggrgGGGGGGGk',
      '.kGGkkkkkkkkkkkkGGk.',
      '.kGGktptpssssptptGk.',
      '..kGkpssssssssssskk.',
      '..kkkttptpssptpttk..',
      '...kkkkkkkkkkkkkk...',
      '......kkkkkkkk......'
    ]
  }
];

/**
 * Cobra Death's head, facing right so the renderer can turn it along its
 * heading: a hood with an eye-spot pattern, slit eyes, fangs and a forked
 * tongue. The body is a chain of `COBRA_SEGMENT` sprites.
 */
const COBRA_PALETTE = { k: K, g: '#22c55e', G: '#15803d', d: '#14532d', y: '#fde047', Y: '#a16207', e: '#ef4444', w: '#ffffff', t: '#f87171' };
export const COBRA_HEAD: SpriteDef = {
  scale: 2,
  palette: COBRA_PALETTE,
  rows: [
    '....kkkkkkkkkkk........',
    '..kkGGGGGGGGGGGkk......',
    '.kGGGyyGGGGGGGGGGk.....',
    'kGGGyYYyGGGGgggggkk....',
    'kGGGyYYyGGGgggggggkk...',
    'kGGGGyyGGGggggggkeggk..',
    'kGGGGGGGGggggggggkgggk.',
    'kGGGGGGGGggggggggggggkt',
    'kGGGGGGGGgggggggggggkkt',
    'kGGGGGGGGggggggkwkwkk..',
    'kGGGGyyGGGgggggggkkk...',
    'kGGGyYYyGGGggggggkk....',
    'kGGGyYYyGGGGgggggk.....',
    '.kGGGyyGGGGGGGGGGk.....',
    '..kkGGGGGGGGGGGkk......',
    '....kkkkkkkkkkk........'
  ]
};

export const COBRA_SEGMENT: SpriteDef = {
  scale: 2,
  palette: COBRA_PALETTE,
  rows: [
    '..kkkkkk..',
    '.kGggggGk.',
    'kGgggyggGk',
    'kGggyYyggk',
    'kGgggyggGk',
    'kGgggggGGk',
    '.kGGGGGGk.',
    '..kkkkkk..'
  ]
};
