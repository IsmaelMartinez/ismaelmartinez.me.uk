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

/** The same bitmap in solid white, for the flash on an enemy that has just been hit. */
export function flashDef(def: SpriteDef): SpriteDef {
  return { ...def, palette: Object.fromEntries(Object.keys(def.palette).map(k => [k, '#ffffff'])) };
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
 * dark trousers. Three bodies, chosen by the aim (front for a downward aim,
 * back for an upward one, side for east and west, mirrored), so he turns to
 * face what he shoots as the original's digitised contestant did. The legs
 * and the gun are drawn by the renderer (the legs scissor with the walk, the
 * gun turns with the aim), so the bitmaps stop at the belt. `PLAYER_DOWN` is
 * the fallen contestant for the death.
 */
const PLAYER_PALETTE = { k: K, h: '#2b1d14', r: '#ef4444', s: SKIN, d: SKIN_D, e: '#ffffff', v: '#3b82f6', V: '#1d4ed8', b: '#1f2937', y: '#facc15', p: '#f1c27d' };
export const PLAYER_FRONT: SpriteDef = {
  scale: 2,
  palette: PLAYER_PALETTE,
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
export const PLAYER_BACK: SpriteDef = {
  scale: 2,
  palette: PLAYER_PALETTE,
  rows: [
    '.....kkkk.....',
    '....khhhhk....',
    '...khhhhhhk...',
    '...khhhhhhk...',
    '...krrrrrrk...',
    '...khhhhhhk...',
    '....kssssk....',
    '.....kddk.....',
    '..kkkkvvkkkk..',
    '.kssskvvkssskk',
    'kssskvvvvkssdk',
    'kssskVvvVkdddk',
    'kdddkvvvvkdddk',
    '.kkk.kVVk.kkk.',
    '.....kbbk.....',
    '....kbbbbk....'
  ]
};
export const PLAYER_SIDE: SpriteDef = {
  scale: 2,
  palette: PLAYER_PALETTE,
  rows: [
    '.....kkkk.....',
    '....khhhhhk...',
    '....khhhhhhk..',
    '....krrrrrrk..',
    '....khsssssk..',
    '....khsskesk..',
    '.....ksssdk...',
    '......kddk....',
    '.....kkvvkk...',
    '....kvvvvvsk..',
    '....kVvvvksk..',
    '....kvvvvksk..',
    '....kvyyvkdk..',
    '....kVVVVkk...',
    '.....kbbk.....',
    '....kbbbbk....'
  ]
};
export const PLAYER_DOWN: SpriteDef = {
  scale: 2,
  palette: PLAYER_PALETTE,
  rows: [
    '.......................',
    '..kkkk.....kkkkkkkkkk..',
    '.khhhhk..kkvvvvvvvvbbk.',
    'khrrrrhkksVVvvvvvVVbbbk',
    'khssesskksvvvvyvvvvbbbk',
    '.kssssk..kkvvvvvvvvbbk.',
    '..kkkk.....kkkkkkkkkk..',
    '.......................'
  ]
};

/**
 * A clubber: Smash TV's grunt is a bald blue-skinned bruiser in an orange
 * vest with a wooden club over one shoulder. Three frames: legs apart,
 * together, apart the other way, with the club swinging.
 */
/** The clubbers' kit changes with the studio, as Smash TV recoloured its grunts level by level. */
export const GRUNT_KITS: { vest: string; shade: string; hide: string; hideShade: string }[] = [
  { vest: '#f97316', shade: '#c2410c', hide: '#5b8def', hideShade: '#2f54b8' },
  { vest: '#22c55e', shade: '#15803d', hide: '#a78bfa', hideShade: '#6d28d9' },
  { vest: '#e11d48', shade: '#9f1239', hide: '#94a3b8', hideShade: '#475569' }
];
const gruntPalette = (kit: (typeof GRUNT_KITS)[number]) => ({ k: K, b: kit.hide, B: kit.hideShade, c: '#dbeafe', e: '#ef4444', o: kit.vest, O: kit.shade, t: '#3f3f46', T: '#27272a', w: '#a16207', W: '#713f12', g: '#9ca3af' });
const GRUNT_PALETTE = gruntPalette(GRUNT_KITS[0]);
const GRUNT_FRAMES: string[][] = [
  [
      '....kkkk..ww',
      '...kcbbbk.wW',
      '...kbbbbk.wW',
      '...kbeebk.W.',
      '...kbbbbkkk.',
      '....kBBkkbbk',
      '..kkoookkbbk',
      '.kbkoOookbBk',
      'kbbkoooookk.',
      'kbbkoOOooBk.',
      'kBBkooooook.',
      '.kkkkooookk.',
      '....kttttk..',
      '...kttkkttk.',
      '...kTk..kTk.',
      '...kkk..kkk.'
    ],
  [
      '....kkkk....',
      '...kcbbbk.ww',
      '...kbbbbk.wW',
      '...kbeebkkW.',
      '...kbbbbkbbk',
      '....kBBkkbbk',
      '..kkoookkbBk',
      '.kbkoOookbk.',
      'kbbkooooook.',
      'kbbkoOOooBk.',
      'kBBkooooook.',
      '.kkkkooookk.',
      '....kttttk..',
      '....kttttk..',
      '....kTkkTk..',
      '....kk..kk..'
    ],
  [
      '....kkkk....',
      '...kcbbbk...',
      '...kbbbbk.kk',
      '...kbeebkbbk',
      '...kbbbbkbbk',
      '....kBBkkbBk',
      '..kkoookkbkw',
      '.kbkoOookkwW',
      'kbbkoooook.W',
      'kbbkoOOooBk.',
      'kBBkooooook.',
      '.kkkkooookk.',
      '....kttttk..',
      '...kttkkttk.',
      '...kTk..kTk.',
      '...kkk..kkk.'
    ]
];

/** The clubber's three frames in a studio's kit. */
export function gruntSprite(kit: number, frame: number): SpriteDef {
  return { scale: 2, palette: gruntPalette(GRUNT_KITS[kit % GRUNT_KITS.length]), rows: GRUNT_FRAMES[frame] };
}
export const GRUNT: SpriteDef[] = GRUNT_FRAMES.map(rows => ({ scale: 2, palette: GRUNT_PALETTE, rows }));

/**
 * An orb: a hovering chrome sphere with a lens for an eye, Smash TV's
 * floating mines that drift at you. The lens is cyan on a harmless orb and
 * red on one that shoots; the third frame is the white flare of a charge.
 */
const ORB_PALETTE = { k: K, m: '#cbd5e1', M: '#64748b', d: '#334155', w: '#ffffff', c: '#22d3ee', C: '#0e7490', r: '#ef4444', R: '#7f1d1d' };
/** The sphere with its lens, the highlight at one of four places round the top, so it reads as spinning. */
const orbRows = (lens: string, core: string, frame: number): string[] => {
  const rows = [
    '....kkkk....',
    '..kkmmmmkk..',
    '.kmmmmmmMMk.',
    '.kmmmmmmMMk.',
    'kmmmkkkkmMMk',
    `kmmk${lens}${lens}${lens}${lens}kMMk`,
    `kmmk${lens}${core}${core}${lens}kMMk`,
    `kMMk${lens}${lens}${lens}${lens}kddk`,
    'kMMMkkkkMddk',
    '.kMMMMMMddk.',
    '.kMMMMdddddk',
    '..kkddddkk..',
    '....kkkk....'
  ];
  const spots: [number, number][][] = [
    [[2, 2], [3, 1]],
    [[2, 4], [3, 5]],
    [[2, 7], [3, 8]],
    [[1, 5], [1, 6]]
  ];
  for (const [y, x] of spots[frame % 4]) rows[y] = rows[y].slice(0, x) + 'w' + rows[y].slice(x + 1);
  return rows;
};
const ORB_FRAMES = 4;
export const orbSprite = (state: 'quiet' | 'armed' | 'charging', frame: number): SpriteDef => ({
  scale: 2,
  palette: ORB_PALETTE,
  rows: state === 'quiet' ? orbRows('C', 'c', frame) : state === 'armed' ? orbRows('R', 'r', frame) : orbRows('r', 'w', frame)
});
export { ORB_FRAMES };

/** A mine: a spiked steel disc with a hazard stripe; the renderer blinks its lamp. */
export const MINE: SpriteDef = {
  scale: 2,
  palette: { k: K, m: '#9ca3af', M: '#4b5563', d: '#1f2937', y: '#facc15' },
  rows: [
    '....kk....',
    '.k.kmmk.k.',
    'kmkmMMmkmk',
    '.kmMddMmk.',
    'kkMdddddMk',
    'kkMdddddMk',
    '.kmMdyyMmk',
    'kmkmMMmkmk',
    '.k.kmmk.k.',
    '....kk....'
  ]
};

/**
 * Mr Shrapnel: a walking bomb, a red steel barrel on legs with a lit fuse,
 * two frames. The spark on the fuse is the renderer's.
 */
const SHRAPNEL_PALETTE = { k: K, r: '#ef4444', R: '#991b1b', d: '#111827', m: '#9ca3af', t: '#3f3f46', w: '#78350f', e: '#fde047' };
export const SHRAPNEL: SpriteDef[] = [
  {
    scale: 2,
    palette: SHRAPNEL_PALETTE,
    rows: [
      '.....ww.....',
      '....kwk.....',
      '..kkkkkkkk..',
      '.kmmmmmmmmk.',
      'kRrrrrrrrrRk',
      'krrrrrrrrrrk',
      'kddddddddddk',
      'krrkeekrrrrk',
      'krrkeekrrrrk',
      'kRrrrrrrrrRk',
      '.kmmmmmmmmk.',
      '..kkkkkkkk..',
      '..kttk.kttk.',
      '..ktk...ktk.',
      '..kkk...kkk.'
    ]
  },
  {
    scale: 2,
    palette: SHRAPNEL_PALETTE,
    rows: [
      '.....ww.....',
      '....kwk.....',
      '..kkkkkkkk..',
      '.kmmmmmmmmk.',
      'kRrrrrrrrrRk',
      'krrrrrrrrrrk',
      'kddddddddddk',
      'krrkeekrrrrk',
      'krrkeekrrrrk',
      'kRrrrrrrrrRk',
      '.kmmmmmmmmk.',
      '..kkkkkkkk..',
      '...kttkttk..',
      '...ktkkktk..',
      '...kk...kk..'
    ]
  }
];

/** A tank's hull and treads; the turret is the renderer's, turned to the contestant. */
export const TANK: SpriteDef = {
  scale: 2,
  palette: { k: K, g: '#84cc16', G: '#4d7c0f', d: '#1f2937', m: '#4b5563', y: '#a3e635' },
  rows: [
    'kkkkkkkkkkkkkkkkkk',
    'kdmdmdmdmdmdmdmdmk',
    'kkkkkkkkkkkkkkkkkk',
    '.kGggggggggggggGk.',
    '.kgggggkkkkgggggk.',
    '.kggggkyyyykggggk.',
    '.kggggkyyyykggggk.',
    '.kggggGkkkkGggggk.',
    '.kGGGggggggggGGGk.',
    'kkkkkkkkkkkkkkkkkk',
    'kdmdmdmdmdmdmdmdmk',
    'kkkkkkkkkkkkkkkkkk'
  ]
};

/** A snake's head, facing right to be turned along its heading, and its body segment. */
const SNAKE_PALETTE = { k: K, p: '#d946ef', P: '#86198f', y: '#fde047', e: '#111827', t: '#f87171' };
export const SNAKE_HEAD: SpriteDef = {
  scale: 2,
  palette: SNAKE_PALETTE,
  rows: [
    '..kkkkkk.....',
    '.kPppppppk...',
    'kPpppkykppk..',
    'kppppkekpppk.',
    'kppppppppppkt',
    'kppppppppppkt',
    'kppppkekpppk.',
    'kPpppkykppk..',
    '.kPppppppk...',
    '..kkkkkk.....'
  ]
};
export const SNAKE_SEGMENT: SpriteDef = {
  scale: 2,
  palette: SNAKE_PALETTE,
  rows: [
    '.kkkkkk.',
    'kPppppPk',
    'kpppyppk',
    'kppyyppk',
    'kpppyppk',
    'kPppppPk',
    '.kkkkkk.'
  ]
};

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

/** Mutoid Man under half health: the hide darkened and torn to the steel beneath, the visor burning. */
export const MUTOID_HURT: SpriteDef = {
  ...MUTOID,
  palette: { ...MUTOID_PALETTE, p: '#d97b8f', P: '#4b5563', r: '#fb923c', m: '#6b7280' }
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
