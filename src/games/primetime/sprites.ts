/**
 * PRIME TIME's pixel art: every figure on the floor as an authored bitmap
 * after Smash TV's own digitised-looking sprites (Williams, 1990), drawn
 * with a one-letter palette per row and rendered once into an offscreen
 * canvas per sprite (`sprite()`), then blitted with smoothing off so every
 * block stays a block at any device-pixel ratio.
 *
 * The bitmaps were authored against the arcade and SNES screenshots: the
 * contestant is the blue-haired, red-shirted first player with his long
 * grey gun; the clubbers are the green-suited bald grunts with a club over
 * one shoulder; the orbs are the lilac spheres; the mines are the grey
 * four-pronged jacks with red tips; Mutoid Man is a bald flesh head on a
 * steel yoke over green bulk and fists, bolted to a grey tank; Scarface is
 * an olive face inside a riveted steel sphere whose crown blows off to show
 * the brain; Cobra Death is a chain of green segments with purple spots
 * behind a lumpy red head. The large ones were composed in a small shape
 * rig (circles, polygons, an automatic outline) and are kept here as the
 * literal rows the rig emitted, so a reviewer reads pixels, not code.
 *
 * `validateSprite` checks every row's width and every letter's colour;
 * `sprite()` runs it before drawing and `tests/games/primetime.test.ts`
 * runs it over `ALL_SPRITES` without a DOM, so a slipped pixel fails a
 * test rather than drawing a sheared figure. `.` is transparent.
 */

import type { ItemId } from './items';

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

/** Throws on a row of the wrong width or a letter with no colour. */
export function validateSprite(name: string, def: SpriteDef): void {
  const w = def.rows[0].length;
  for (const row of def.rows) {
    if (row.length !== w) throw new Error(`sprite ${name}: row "${row}" is ${row.length} wide, not ${w}`);
    for (const c of row) {
      if (c !== '.' && !def.palette[c]) throw new Error(`sprite ${name}: no colour for "${c}"`);
    }
  }
}

const cache = new Map<string, Sprite>();

/** The rendered sprite, built on first use and kept; null until a canvas context exists. */
export function sprite(name: string, def: SpriteDef): Sprite | null {
  const hit = cache.get(name);
  if (hit) return hit;
  validateSprite(name, def);
  const w = def.rows[0].length;
  const canvas = document.createElement('canvas');
  canvas.width = w * def.scale;
  canvas.height = def.rows.length * def.scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  def.rows.forEach((row, y) => {
    for (let x = 0; x < w; x++) {
      const c = row[x];
      if (c === '.') continue;
      ctx.fillStyle = def.palette[c];
      ctx.fillRect(x * def.scale, y * def.scale, def.scale, def.scale);
    }
  });
  const built = { canvas, w: canvas.width, h: canvas.height };
  cache.set(name, built);
  return built;
}

/** The same bitmap in solid white, for the flash on an enemy that has just been hit. */
export function flashDef(def: SpriteDef): SpriteDef {
  return {
    ...def,
    palette: Object.fromEntries(Object.keys(def.palette).map(k => [k, '#ffffff']))
  };
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

/** Shared tones: a black outline and the flesh every face on the floor shares. */
const K = '#0b0b12';
const SKIN = '#f1b98a';
const SKIN_D = '#c98a5a';

/**
 * The contestant as Smash TV draws its first player: blue hair, a red shirt,
 * blue jeans, bare arms on a long grey gun. Three bodies, chosen by the aim
 * (front for a downward aim, back for an upward one, side for east and west,
 * mirrored), so he turns to face what he shoots. The legs and the gun are
 * the renderer's (the legs scissor with the walk, the gun turns with the
 * aim), so the bitmaps stop at the belt. `PLAYER_DOWN` is the fallen
 * contestant for the death.
 */
const PLAYER_PALETTE = {
  k: '#0b0b12',
  h: '#2f5fe0',
  H: '#1d3fa8',
  s: '#f1b98a',
  d: '#c98a5a',
  e: '#ffffff',
  r: '#d9342b',
  R: '#9c1f18',
  j: '#2a4fc9',
  J: '#1a3390'
};
export const PLAYER_FRONT: SpriteDef = {
  scale: 2,
  palette: PLAYER_PALETTE,
  rows: [
    '.....kkkk.....',
    '....khhhhhk...',
    '....khhhhhk...',
    '....kssssdk...',
    '....ksesedk...',
    '.....kssdk....',
    '......kdk.....',
    '..kkkkrrrkkkk.',
    '.ksskrrrrrkssk',
    'kssskRrrrRkssk',
    'kssskrrrrrkssk',
    'kdddkRRrRRkddk',
    '.kkkkkRRRkkkk.',
    '.....kjjjk....'
  ]
};
export const PLAYER_BACK: SpriteDef = {
  scale: 2,
  palette: PLAYER_PALETTE,
  rows: [
    '.....kkkk.....',
    '....khhhhhk...',
    '....khhhhhk...',
    '....kHhhhhk...',
    '....kHHhhHk...',
    '.....kHHHk....',
    '......kdk.....',
    '..kkkkrrrkkkk.',
    '.ksskrrrrrkssk',
    'kssskrrrrrkssk',
    'kssskrrRrrkssk',
    'kdddkRRRRRkddk',
    '.kkkkkRRRkkkk.',
    '.....kjjjk....'
  ]
};
export const PLAYER_SIDE: SpriteDef = {
  scale: 2,
  palette: PLAYER_PALETTE,
  rows: [
    '.....kkkk.....',
    '....khhhhhk...',
    '....khhhhhsk..',
    '....khhsssdk..',
    '....kHssesdk..',
    '.....kssddk...',
    '......kdk.....',
    '....kkrrrkk...',
    '...krrrrkssssk',
    '...kRrrrkssssk',
    '...krrrrkkkkk.',
    '...kRRRRk.....',
    '....kkkkk.....',
    '.....kjjjk....'
  ]
};
export const PLAYER_DOWN: SpriteDef = {
  scale: 2,
  palette: PLAYER_PALETTE,
  rows: [
    '.......................',
    '..kkkk.....kkkkkkkkkk..',
    '.khhhhk..kkrrrrrrrrjjk.',
    'khhssskkksRrrrrrrRRjjjk',
    'khssesskksrrrrrrrrRjjjk',
    '.khsssk..kkRRRRRRRRjjk.',
    '..kkkk.....kkkkkkkkkk..',
    '.......................'
  ]
};

/**
 * A clubber: Smash TV's grunt is a bald bruiser in a one-piece suit with a
 * club over one shoulder, and the arcade recoloured him studio by studio.
 * The first studio's is the green one from the arcade's opening rooms; the
 * second's orange with a blue-skinned head; the third's purple with a
 * yellow one. Three frames: legs apart with the club raised, legs together
 * with it swung, legs apart with it trailing.
 */
export const GRUNT_KITS: {
  suit: string;
  shade: string;
  light: string;
  skin: string;
  skinShade: string;
}[] = [
  {
    suit: '#3cb84a',
    shade: '#1f7a2c',
    light: '#7ee08a',
    skin: SKIN,
    skinShade: SKIN_D
  },
  {
    suit: '#e8742a',
    shade: '#a8481a',
    light: '#ffb070',
    skin: '#8fb0ff',
    skinShade: '#5a7acc'
  },
  {
    suit: '#8a4bd6',
    shade: '#5a2a99',
    light: '#c08aff',
    skin: '#f0d040',
    skinShade: '#b89a20'
  }
];
const gruntPalette = (kit: (typeof GRUNT_KITS)[number]) => ({
  k: K,
  s: kit.skin,
  d: kit.skinShade,
  g: kit.suit,
  G: kit.shade,
  L: kit.light,
  w: '#a16a2b',
  W: '#6b4219',
  b: '#1a1a22'
});

const GRUNT_FRAMES: string[][] = [
  [
    '....kkkk..kk',
    '...kssssk.kw',
    '...ksdsdk.kw',
    '...kssssk.kw',
    '....kddk..kw',
    '..kkggggkkkw',
    '.kskgLggkssk',
    'ksskggggksk.',
    'kskkggggkk..',
    'kdkkGggGk...',
    '.k.kGGGGk...',
    '...kggggk...',
    '..kggkkggk..',
    '.kggk..kggk.',
    '.kbbk..kbbk.',
    '.kkkk..kkkk.'
  ],
  [
    '....kkkk....',
    '...kssssk...',
    '...ksdsdk...',
    '...kssssk...',
    '....kddk....',
    '..kkggggkk..',
    '.kskgLggksk.',
    'ksskggggksww',
    'kskkggggkkkk',
    'kdkkGggGk...',
    '.k.kGGGGk...',
    '...kggggk...',
    '...kggggk...',
    '...kggggk...',
    '...kbbbbk...',
    '...kkkkkk...'
  ],
  [
    '....kkkk....',
    '...kssssk...',
    '...ksdsdk...',
    '...kssssk...',
    '....kddk....',
    '..kkggggkk..',
    '.kskgLggkskk',
    'ksskggggkskw',
    'kskkggggkkkw',
    'kdkkGggGk..w',
    '.k.kGGGGk..W',
    '...kggggk...',
    '..kggkkggk..',
    '.kggk..kggk.',
    '.kbbk..kbbk.',
    '.kkkk..kkkk.'
  ]
];

/** The clubber's three frames in a studio's kit. */
export function gruntSprite(kit: number, frame: number): SpriteDef {
  return {
    scale: 2,
    palette: gruntPalette(GRUNT_KITS[kit % GRUNT_KITS.length]),
    rows: GRUNT_FRAMES[frame]
  };
}
export const GRUNT: SpriteDef[] = GRUNT_FRAMES.map(rows => ({
  scale: 2,
  palette: gruntPalette(GRUNT_KITS[0]),
  rows
}));

/**
 * An orb: the lilac sphere that drifts at the contestant. A quiet orb is
 * plain; one that shoots wears a red lens band, which goes white for the
 * charge before a shot. The highlight walks round the top over four frames
 * so the sphere reads as turning.
 */
const ORB_PALETTE = {
  k: '#0b0b12',
  m: '#8c80b0',
  M: '#4a4066',
  L: '#c8c0e0',
  w: '#ffffff',
  r: '#e03030',
  R: '#7a1010'
};
const ORB_ROWS: Record<'quiet' | 'armed' | 'charging', string[]> = {
  quiet: [
    '....kkkk....',
    '..kkLLmmkk..',
    '.kLLLLmmmMk.',
    '.kLLLmmmmMk.',
    'kLLmmmmmmMMk',
    'kLmmmmmmmMMk',
    'kmmmmmmmMMMk',
    'kmmmmmmMMMMk',
    '.kmmmmMMMMk.',
    '.kMmmMMMMMk.',
    '..kkMMMMkk..',
    '....kkkk....'
  ],
  armed: [
    '....kkkk....',
    '..kkLLmmkk..',
    '.kLLLLmmmMk.',
    '.kLLLmmmmMk.',
    'kLLmmmmmmMMk',
    'kLmkRrrRkMMk',
    'kmmkrrrrkMMk',
    'kmmmmmmMMMMk',
    '.kmmmmMMMMk.',
    '.kMmmMMMMMk.',
    '..kkMMMMkk..',
    '....kkkk....'
  ],
  charging: [
    '....kkkk....',
    '..kkLLmmkk..',
    '.kLLLLmmmMk.',
    '.kLLLmmmmMk.',
    'kLLmmmmmmMMk',
    'kLmkwwwwkMMk',
    'kmmkwrrwkMMk',
    'kmmmmmmMMMMk',
    '.kmmmmMMMMk.',
    '.kMmmMMMMMk.',
    '..kkMMMMkk..',
    '....kkkk....'
  ]
};
export const ORB_FRAMES = 4;
export const orbSprite = (state: 'quiet' | 'armed' | 'charging', frame: number): SpriteDef => {
  const rows = [...ORB_ROWS[state]];
  const spots: [number, number][][] = [
    [
      [2, 3],
      [3, 2]
    ],
    [
      [1, 4],
      [2, 5]
    ],
    [
      [1, 6],
      [2, 7]
    ],
    [
      [2, 8],
      [3, 8]
    ]
  ];
  for (const [y, x] of spots[frame % ORB_FRAMES]) rows[y] = rows[y].slice(0, x) + 'w' + rows[y].slice(x + 1);
  return { scale: 2, palette: ORB_PALETTE, rows };
};

/** A mine: Smash TV's grey four-pronged jack with a red lamp on each tip; the renderer blinks them. */
export const MINE: SpriteDef = {
  scale: 2,
  palette: {
    k: '#0b0b12',
    m: '#9a9aa4',
    M: '#5a5a66',
    r: '#e03030',
    d: '#2a2a30'
  },
  rows: [
    'kk.......kk',
    'krk.....krk',
    '.kmk...kmk.',
    '..kmk.kmk..',
    '...kMMMk...',
    '...kMdMk...',
    '...kMMMk...',
    '..kmk.kmk..',
    '.kmk...kmk.',
    'krk.....krk',
    'kk.......kk'
  ]
};

/** Mr Shrapnel: a walking steel robot with a red core that bursts into shards, two frames. */
const SHRAPNEL_PALETTE = {
  k: '#0b0b12',
  m: '#9a9aa4',
  M: '#5a5a66',
  r: '#e03030',
  d: '#2a2a30',
  e: '#fde047'
};
export const SHRAPNEL: SpriteDef[] = [
  {
    scale: 2,
    palette: SHRAPNEL_PALETTE,
    rows: [
      '....kkkk....',
      '...kmmmmk...',
      '...kmeemk...',
      '...kMMMMk...',
      '....kMMk....',
      '.kkkmmmmkkk.',
      'kmkmmrrmmkmk',
      'kmkmrrrrmkmk',
      'kMkmmrrmmkMk',
      'kMkkMMMMkkMk',
      '.k.kMMMMk.k.',
      '...kmmmmk...',
      '..kmmkkmmk..',
      '.kmmk..kmmk.',
      '.kMMk..kMMk.',
      '.kkkk..kkkk.'
    ]
  },
  {
    scale: 2,
    palette: SHRAPNEL_PALETTE,
    rows: [
      '....kkkk....',
      '...kmmmmk...',
      '...kmeemk...',
      '...kMMMMk...',
      '....kMMk....',
      '.kkkmmmmkkk.',
      'kmkmmrrmmkmk',
      'kmkmrrrrmkmk',
      'kMkmmrrmmkMk',
      'kMkkMMMMkkMk',
      '.k.kMMMMk.k.',
      '...kmmmmk...',
      '...kmmmmk...',
      '...kmmmmk...',
      '...kMMMMk...',
      '...kkkkkk...'
    ]
  }
];

/** A tank: the arcade's grey hover-tank with its orange-suited pilot in the saddle; the turret is the renderer's. */
export const TANK: SpriteDef = {
  scale: 2,
  palette: {
    k: '#0b0b12',
    m: '#9a9aa4',
    M: '#5a5a66',
    d: '#2a2a30',
    o: '#e8742a',
    s: '#f1b98a',
    b: '#2a4fc9'
  },
  rows: [
    'kkkkkkkkkkkkkkkkkk',
    'kdMdMdMdMdMdMdMdMk',
    'kkkkkkkkkkkkkkkkkk',
    '.kMmmmmmmmmmmmmMk.',
    '.kmmmmmkkkkmmmmmk.',
    '.kmmmmkossokmmmmk.',
    '.kmmmmkobbokmmmmk.',
    '.kmmmmMkkkkMmmmmk.',
    '.kMMMmmmmmmmmMMMk.',
    'kkkkkkkkkkkkkkkkkk',
    'kdMdMdMdMdMdMdMdMk',
    'kkkkkkkkkkkkkkkkkk'
  ]
};

/** A snake's head, facing right to be turned along its heading, and its body segment. */
const SNAKE_PALETTE = {
  k: '#0b0b12',
  p: '#38bdf8',
  P: '#0c6aa8',
  y: '#ffffff',
  e: '#111827',
  t: '#f87171'
};
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
  rows: ['.kkkkkk.', 'kPppppPk', 'kpppyppk', 'kppyyppk', 'kpppyppk', 'kPppppPk', '.kkkkkk.']
};

/**
 * Mutoid Man, whole: the bald flesh head, the steel shoulder yoke and chest
 * plate with its red emblem, the green bulk of the arms over flesh fists,
 * and the grey tank he is bolted to, cockpit, gun pods and treads. At
 * scale 3 he stands 108 x 138, the arena's first giant. The hurt variant
 * has his hide torn to the steel beneath and scorched.
 */
const MUTOID_PALETTE = {
  k: '#0b0b12',
  s: '#f2a784',
  S: '#c4704f',
  L: '#ffd0b0',
  g: '#2fa84a',
  G: '#1b6b2e',
  V: '#6fd47f',
  m: '#a3a3ad',
  M: '#5f5f6b',
  r: '#d9342b',
  d: '#2a2a30',
  y: '#f0c040',
  w: '#ffffff',
  t: '#3a3a42',
  e: '#3a1a10',
  p: '#a855f7'
};
export const MUTOID: SpriteDef = {
  scale: 3,
  palette: MUTOID_PALETTE,
  rows: [
    '................kkkk................',
    '..............kkLssskk..............',
    '.............kLLLssssSk.............',
    '.............kLLLssssSk.............',
    '............kLLLLssssSSk............',
    '............ksSSSSSSSSSk............',
    '............ksskessekSSk............',
    '............kssssssssSSk............',
    '............kssssSSssSSk............',
    '.............ksssssssSk.............',
    '......k......kskkkkkkSk......k......',
    '...kkkmkkkkkkmswwkwwwSmkkkkkkmkkk...',
    '..kVVmmmmmmmmmsssssssSmmmmmmmmmGGk..',
    '.kVVVVmmmmmmmmmmmmmmmmmmmmmmmmGGGGk.',
    '.kVVVVmmmmmmmmmmmmmmmmmmmmmmmmGGGGk.',
    'kVVVVVVVVVVVgmmmmmmmmmmGGGGGGGGGGGGk',
    'kVVVVVVVVVVVgmrrrrrrrrmGGGGGGGGGGGGk',
    'kVVVVVVVVVVVgmmrrrrrrmmGGGGGGGGGGGGk',
    'kVVVVVVVVVVVgmmrrrrrrmmGGGGGGGGGGGGk',
    '.kVVVVVVVVVVgmmmrrrrmmmGGGGGGGGGGGk.',
    '.kVVVVVVVVVVgmmmmrrmmmmGGGGGGGGGGGk.',
    '..kVVVVVVVVVgmmmmrrmmmmGGGGGGGGGGk..',
    '..kVVVVVVVVVgmmmmmmmmmmGGGGGGGGGGk..',
    '..kVVVVVVVVVgggggggggggGGGGGGGGGGk..',
    '..kssssggggggggggggggggGGGGGGssssk..',
    '.kssssssgggggggggggggggGGGGGssSSSSk.',
    '.kssssssgggggggggggggggGGGGGssSSSSk.',
    'ksSsSsSsgggggggggggggggGGGGGsSSSSSSk',
    'ksssssssgggggggggggggggGGGGGssSSSSSk',
    'ksssssssgggggggggggggggGGGGGssSSSSSk',
    '.kssssssgggggggggggggggGGGGGssSSSSk.',
    '.kksssskgggggggggggggggGGGGGksSSSkk.',
    '...kkkk.kggggggggggggggGGGGk.kkkk...',
    '......kkgggggggggggggggGGGGGkk......',
    '......kMmmmMmmmmMmmmmMmmmmMmMk......',
    '.kkkkkMMmmMmmddddddddddmmMmmMMkkkkk.',
    'kddMMMMMmMmmmddyyyyyyddmMmmmMMMMMddk',
    'kddMMMMMMmmmmddyyyyyyddMmmmmMMMMMddk',
    '.kkkMMMMmmmmMddyyyyyyddmmmmMMMMMkkk.',
    '....kttttttttttttttttttttttttttk....',
    '....kdttdttdttdttdttdttdttdttdtk....',
    '....kdttdttdttdttdttdttdttdttdtk....',
    '....kdttdttdttdttdttdttdttdttdtk....',
    '....kdttdttdttdttdttdttdttdttdtk....',
    '....kdttdttdttdttdttdttdttdttdtk....',
    '....kkkkkkkkkkkkkkkkkkkkkkkkkkkk....'
  ]
};
export const MUTOID_HURT: SpriteDef = {
  scale: 3,
  palette: MUTOID_PALETTE,
  rows: [
    '................kkkk................',
    '..............kkLssskk..............',
    '.............kLLLssssSk.............',
    '.............kLLLssssSk.............',
    '............kLLLLssssSSk............',
    '............ksSSSSSSSSSk............',
    '............ksskessekSSk............',
    '............kssssssssSSk............',
    '............kssssSSssSSk............',
    '.............ksssssssSk.............',
    '......k......kskkkkkkSk......k......',
    '...kkkmkkkkkkmswwkwwwSmkkkkkkmkkk...',
    '..kVVmmmmmmmmmsssssssSmmmmmmmmmGGk..',
    '.kVVVVmmmmmmmmmmmmmmmmmmmmmmmmGGGGk.',
    '.kVVVVmmmmmmmmmmmmmmmmmmmmmmmmGGGGk.',
    'kVVVVVVVVVVVgmmmmmmmmmmGGdGGGGGGGGGk',
    'kVVVVVVVVVVVdmrrrrrrrrmdGGGGGGGGGGdk',
    'kVVVVVVVVVVVgmmrrrrrrmmGGGGGGGGGdGGk',
    'kVVVVVVVVVVVgmmrrrrrrmmGGGGGGGdGGGGk',
    '.kVVVVVVVVVVgmmmrrrrmmmGGGGGdGGGGGk.',
    '.kVVVVVVVVVVgmmmmrrmmmmGGGdGGGGGGGk.',
    '..kVVVVVVVVVgmmmmrrmmmmGdGGGGGGGGk..',
    '..kVVVVVVVVVgmmmmmmmmmmGMMMGGGGGGk..',
    '..kVVVVVVVVVggggggggdggGMMMGGGGdGk..',
    '..kssssdggMMMgggggdggggGMrMGGssssk..',
    '.kssssssggMMMgggdggggggGMMMdssSSSSk.',
    '.kssssssggMMMgdggggggggGMMMGssSSSSk.',
    'ksSsSsSsggMrMggggggggggdMMMGsSSSSSSk',
    'ksssssssggMMMggggggggdgGGGGGssSSSSSk',
    'ksssssssdgMMMggggggdgggGGGGGssSSSSSk',
    '.kssssssggMMMggggdgggggGGGGGssSSSSk.',
    '.kksssskgggggggdgggggggGGGdGksSSSkk.',
    '...kkkk.kggggdgggggggggGdGGk.kkkk...',
    '......kkgggdggggggggggdGGGGGkk......',
    '......kMmmmMmmmmMmmmmMmmmmMmMk......',
    '.kkkkkMMmmMmmddddddddddmmMmmMMkkkkk.',
    'kddMMMMMmMmmmddyyyyyyddmMmmmMMMMMddk',
    'kddMMMMMMmmmmddyyyyyyddMmmmmMMMMMddk',
    '.kkkMMMMmmmmMddyyyyyyddmmmmMMMMMkkk.',
    '....kttttttttttttttttttttttttttk....',
    '....kdttdttdttdttdttdttdttdttdtk....',
    '....kdttdttdttdttdttdttdttdttdtk....',
    '....kdttdttdttdttdttdttdttdttdtk....',
    '....kdttdttdttdttdttdttdttdttdtk....',
    '....kdttdttdttdttdttdttdttdttdtk....',
    '....kkkkkkkkkkkkkkkkkkkkkkkkkkkk....'
  ]
};

/**
 * Scarface: an olive face inside a riveted steel sphere, the scar down his
 * left cheek. `calm` is his float, `rage` the open-mouthed red-eyed wind-up
 * and charge, `hurt` his second stage with the crown plate blown off and
 * the brain showing, as the arcade's Scarface loses his face.
 */
const SCARFACE_PALETTE = {
  k: '#0b0b12',
  m: '#a3a3ad',
  M: '#5f5f6b',
  d: '#2a2a30',
  r: '#e03030',
  f: '#b8b830',
  F: '#7a7a20',
  l: '#e0e050',
  e: '#ffffff',
  E: '#d9342b',
  p: '#111827',
  t: '#ffffff',
  s: '#8a1a1a',
  b: '#ff7ab6',
  B: '#c0407a',
  w: '#ffffff'
};
export const SCARFACE: Record<'calm' | 'rage' | 'hurt', SpriteDef> = {
  calm: {
    scale: 3,
    palette: SCARFACE_PALETTE,
    rows: [
      '..................................',
      '...........kkkkkkkkkkkk...........',
      '.........kkmmmmmdmmmmmmkk.........',
      '........kmmkmmmmmmmmmmkmmk........',
      '......kkmmmkkmmmmmmmmkkmmmkk......',
      '.....kmmmmmmlllllfffffmmmmmmk.....',
      '....kmdmmmllllllffffffffmmmdmk....',
      '....kmmmmllllllffffffffffmmmmk....',
      '...kmmmmslllllffffffffffffmmmmk...',
      '..kmmmmllllllffffffffffffffmmmmk..',
      '..kmmmlllsllfffffffffffffffFmmmk..',
      '.kmkkmlllFFFFFFfffffFFFFFFFFmkkMk.',
      '.kmmkllllsffffffffffffffffFFFkMMk.',
      '.kmmmllllfeppefffffffeppeffFFMMMk.',
      '.kmmmlllffeppefffffffeppeffFFMMMk.',
      '.kmmmllfffsfffffFFfffffffffFFMMMk.',
      '.kmmmlffffffffffFFfffffffffFFMMMk.',
      '.kdmmfffffsfffffFFffffffffffFMMdk.',
      '.kmmmfffffffffffFFfffffffffFFMMMk.',
      '.kmmmffffffsfffffffffffffffFFMMMk.',
      '.kmmmffffffffffffffffffffffFFMMMk.',
      '.kmmkffffffffffffffffffffffFFkMMk.',
      '.kmkkmfffffpttttttttttpfffFFMkkMk.',
      '..kmmmfffffptpptpptpptpfffFFMMMk..',
      '..kmmmmffffffffffffffffffFFMMMMk..',
      '...kmmmmffffffffffffffffFFMMMMk...',
      '....kmmmmffFFfffffffffFFFMMMMk....',
      '....kmdmmmFFFFFFFfFFFFFFMMMdMk....',
      '.....kmmmmmmFFFFFFFFFFMMMMMMk.....',
      '......kkmmmkkMMMMMMMMkkMMMkk......',
      '........kmmkMMMMMMMMMMkMMk........',
      '.........kkMMMMMMdMMMMMkk.........',
      '...........kkkkkkkkkkkk...........',
      '..................................'
    ]
  },
  rage: {
    scale: 3,
    palette: SCARFACE_PALETTE,
    rows: [
      '..................................',
      '...........kkkkkkkkkkkk...........',
      '.........kkmmmmmdmmmmmmkk.........',
      '........kmmkmmmmmmmmmmkmmk........',
      '......kkmmmkkmmmmmmmmkkmmmkk......',
      '.....kmmmmmmlllllfffffmmmmmmk.....',
      '....kmdmmmllllllffffffffmmmdmk....',
      '....kmmmmllllllffffffffffmmmmk....',
      '...kmmmmslllllffffffffffffmmmmk...',
      '..kmmmmllllllffffffffffffffmmmmk..',
      '..kmmmlllsllfffffffffffffffFmmmk..',
      '.kmkkmlllFFFFFFfffffFFFFFFFFmkkMk.',
      '.kmmkllllsffffffffffffffffFFFkMMk.',
      '.kmmmllllfeEEefffffffeEEeffFFMMMk.',
      '.kmmmlllffeEEefffffffeEEeffFFMMMk.',
      '.kmmmllfffsfffffFFfffffffffFFMMMk.',
      '.kmmmlffffffffffFFfffffffffFFMMMk.',
      '.kdmmfffffsfffffFFffffffffffFMMdk.',
      '.kmmmfffffffffffFFfffffffffFFMMMk.',
      '.kmmmffffffsfffffffffffffffFFMMMk.',
      '.kmmmffffffffffffffffffffffFFMMMk.',
      '.kmmkffffffpttttttttttpffffFFkMMk.',
      '.kmkkmfffffptptptptptppfffFFMkkMk.',
      '..kmmmfffffppppppppppppfffFFMMMk..',
      '..kmmmmffffpptptptptptpffFFMMMMk..',
      '...kmmmmfffpttttttttttpfFFMMMMk...',
      '....kmmmmffFFfffffffffFFFMMMMk....',
      '....kmdmmmFFFFFFFfFFFFFFMMMdMk....',
      '.....kmmmmmmFFFFFFFFFFMMMMMMk.....',
      '......kkmmmkkMMMMMMMMkkMMMkk......',
      '........kmmkMMMMMMMMMMkMMk........',
      '.........kkMMMMMMdMMMMMkk.........',
      '...........kkkkkkkkkkkk...........',
      '..................................'
    ]
  },
  hurt: {
    scale: 3,
    palette: SCARFACE_PALETTE,
    rows: [
      '..................................',
      '...........kkkkkkkkkkkk...........',
      '.........kkkkkmmdmmmkkkkk.........',
      '........k.....kBbbBk.....k........',
      '......kkkkkkkkBbbBbbkkkkkkkk......',
      '.....kmmk..kbBbbBbbBbbk..kmmk.....',
      '....kmdmk.kbBbbBbbBbbBbk.kmdmk....',
      '....kmmmk.kBbbBbbBbbBbbk.kmmmk....',
      '...kmmmmk..kbBbbBbbBbbk..kmmmmk...',
      '..kmmmmllkklBbbBbbBbbBfkkffmmmmk..',
      '..kmmmlllsllffbbbbbbfffffffFmmmk..',
      '.kmkkmlllFFFFFFfffffFFFFFFFFmkkMk.',
      '.kmmkllllsffffffffffffffffFFFkMMk.',
      '.kmmmllllfeppefffffffeppeffFFMMMk.',
      '.kmmmlllffeppefffffffeppeffFFMMMk.',
      '.kmmmllfffsfffffFFfffffffffFFMMMk.',
      '.kmmmlffffffffffFFfffffffffFFMMMk.',
      '.kdmmfffffsfffffFFffffffffffFMMdk.',
      '.kmmmfffffffffffFFfffffffffFFMMMk.',
      '.kmmmffffffsfffffffffffffffFFMMMk.',
      '.kmmmffffffffffffffffffffffFFMMMk.',
      '.kmmkffffffffffffffffffffffFFkMMk.',
      '.kmkkmfffffpttttttttttpfffFFMkkMk.',
      '..kmmmfffffptpptpptpptpfffFFMMMk..',
      '..kmmmmffffffffffffffffffFFMMMMk..',
      '...kmmmmffffffffffffffffFFMMMMk...',
      '....kmmmmffFFfffffffffFFFMMMMk....',
      '....kmdmmmFFFFFFFfFFFFFFMMMdMk....',
      '.....kmmmmmmFFFFFFFFFFMMMMMMk.....',
      '......kkmmmkkMMMMMMMMkkMMMkk......',
      '........kmmkMMMMMMMMMMkMMk........',
      '.........kkMMMMMMdMMMMMkk.........',
      '...........kkkkkkkkkkkk...........',
      '..................................'
    ]
  }
};

/**
 * Cobra Death's head, facing right so the renderer can turn it along its
 * heading: the lumpy red mass with a pink maw and fangs that the arcade's
 * snake bosses wore. The body is a chain of `COBRA_SEGMENT` sprites, green
 * spheres with purple spots.
 */
const COBRA_PALETTE = {
  k: '#0b0b12',
  g: '#2a8a2a',
  G: '#176117',
  V: '#45c045',
  p: '#7a2aa0',
  P: '#b060d8',
  r: '#c0281c',
  R: '#7a1410',
  o: '#e85a3a',
  m: '#ffb0a0',
  e: '#fde047',
  w: '#ffffff'
};
export const COBRA_HEAD: SpriteDef = {
  scale: 2,
  palette: COBRA_PALETTE,
  rows: [
    '..........................',
    '...........kkkk...........',
    '..........krrorkkk........',
    '...kkkkkk.krrrrrorkk......',
    '..kRrorrRkRrorrrrrrRk.....',
    '..krrrrrorrrrrrorrrrk.....',
    '..krorrrrrrorrrrrrorrk....',
    '..krrrrorrrrrrorrrrrrRk...',
    '..korrrrrrorrrrrrorrrrRk..',
    '..krrrorrrrrroekrrrrmmmmk.',
    '..krrrrrrorrrrrrorrmmwmmm.',
    '..krrorrrrrrorrrrrrmmmmmm.',
    '..krrrrrorrrrrrorrrmmmmmm.',
    '..krorrrrrrorrrrrrommmmmm.',
    '..krrrrorrrrrrorrrrrmwmmk.',
    '..korrrrrrorrrekrorrrrRk..',
    '..krrrorrrrrrorrrrrrork...',
    '..krrrrrrorrrrrrorrrrrk...',
    '..krrorrrrrrorrrrrrorrk...',
    '..kRrrrrRkRrrrrorrrrrk....',
    '...kkkkkk.korrrrrrorkk....',
    '..........krrrokkkkk......',
    '...........kkkk...........',
    '..........................'
  ]
};
export const COBRA_SEGMENT: SpriteDef = {
  scale: 2,
  palette: COBRA_PALETTE,
  rows: [
    '....................',
    '......kkkkkkkk......',
    '....kkVVVVVgggkk....',
    '...kVVVVVVggggggk...',
    '..kVVVVVVggggggggk..',
    '..kVVVVVgggggPpggk..',
    '.kVVVPpggggggppgggk.',
    '.kVVVppgggggggggggk.',
    '.kVVVggggggggggggGk.',
    '.kVVggggggPpggggGGk.',
    '.kVgggggggppgggGGGk.',
    '.kggggggggggggGGGGk.',
    '.kgggggggggggGPpGGk.',
    '.kgggggPpgggGGppGGk.',
    '..kggggppggGGGGGGk..',
    '..kgggggggGGGGGGGk..',
    '...kgggggGGGGGGGk...',
    '....kkggGGGGGGkk....',
    '......kkkkkkkk......',
    '....................'
  ]
};

/**
 * The prizes and the gear, ten pixels square: cash is a banded bundle of
 * notes, the toaster and the VCR are the boxes they are, the car a red
 * roof; everything else is a framed plaque with a glyph, which is how the
 * arcade drew every pick-up that was not loot. Drawn at scale 2 on the
 * floor and at scale 1 on the map and over the doors.
 */
const ITEM_PALETTE = {
  k: '#0b0b12',
  g: '#2fa84a',
  G: '#1b6b2e',
  w: '#ffffff',
  m: '#9a9aa4',
  M: '#5a5a66',
  d: '#1a1a22',
  y: '#f0c040',
  Y: '#b8860b',
  r: '#d9342b',
  R: '#9c1f18',
  b: '#2a4fc9',
  B: '#1a3390',
  c: '#22d3ee',
  o: '#e8742a',
  s: '#f1b98a',
  p: '#f472b6',
  e: '#38bdf8'
};
export const ITEM_SPRITES: Record<ItemId, SpriteDef> = {
  cash: {
    scale: 2,
    palette: ITEM_PALETTE,
    rows: ['..........', '.kkkkkkkk.', 'kggggggggk', 'kgGwwwwGgk', 'kgGwwwwGgk', 'kggggggggk', 'kGGGGGGGGk', '.kkkkkkkk.', '..........', '..........']
  },
  toaster: {
    scale: 2,
    palette: ITEM_PALETTE,
    rows: ['..........', '.kkkkkkkk.', 'kmmkkkkmmk', 'kmmmmmmmmk', 'kmMmmmmMmk', 'kmmmmmmmmk', 'kMMMMMMMMk', '.kkkkkkkk.', '..k....k..', '..........']
  },
  vcr: {
    scale: 2,
    palette: ITEM_PALETTE,
    rows: ['..........', '..........', 'kkkkkkkkkk', 'kddddddddk', 'kdMMMMMddk', 'kdkkkkkrdk', 'kddddddddk', 'kkkkkkkkkk', '..........', '..........']
  },
  car: {
    scale: 2,
    palette: ITEM_PALETTE,
    rows: ['..........', '...kkkk...', '..krrrrk..', '.kkrccrkk.', 'krrrrrrrrk', 'krrrrrrrrk', '.kkrccrkk.', '..krrrrk..', '...kkkk...', '..........']
  },
  key: {
    scale: 2,
    palette: ITEM_PALETTE,
    rows: ['kkkkkkkkkk', 'kbbbbbbbbk', 'kbbkkkbbbk', 'kbkyyykbbk', 'kbkykykbbk', 'kbkyyykbbk', 'kbbkykbbbk', 'kbbkyykbbk', 'kbbbkkbbbk', 'kkkkkkkkkk']
  },
  spread: {
    scale: 2,
    palette: ITEM_PALETTE,
    rows: ['kkkkkkkkkk', 'kggggggggk', 'kgwggwggwk', 'kgkwgwgwgk', 'kggkwwwggk', 'kgggkwkggk', 'kgggkwkggk', 'kgggkwkggk', 'kggggggggk', 'kkkkkkkkkk']
  },
  grenade: {
    scale: 2,
    palette: ITEM_PALETTE,
    rows: ['kkkkkkkkkk', 'kbbbbbbbbk', 'kbbbbkkbbk', 'kbbbkddkbk', 'kbbkddddkk', 'kbbkdwddkk', 'kbbkddddkk', 'kbbbkddkbk', 'kbbbbkkbbk', 'kkkkkkkkkk']
  },
  rocket: {
    scale: 2,
    palette: ITEM_PALETTE,
    rows: ['kkkkkkkkkk', 'kooooooook', 'koookwkook', 'kookwwwkok', 'kookwwwkok', 'kookwrwkok', 'kookwwwkok', 'kokwwkwwkk', 'kooooooook', 'kkkkkkkkkk']
  },
  shield: {
    scale: 2,
    palette: ITEM_PALETTE,
    rows: ['kkkkkkkkkk', 'kmmmmmmmmk', 'kmkkkkkkmk', 'kmkccccckk', 'kmkcwcccmk', 'kmkccccmmk', 'kmmkcccmmk', 'kmmmkckmmk', 'kmmmmkmmmk', 'kkkkkkkkkk']
  },
  boots: {
    scale: 2,
    palette: ITEM_PALETTE,
    rows: ['kkkkkkkkkk', 'kyyyyyyyyk', 'kyyykkkyyk', 'kyyykddkyk', 'kyyykddkyk', 'kyykkddkyk', 'kykddddkyk', 'kykddddkyk', 'kyykkkkkyk', 'kkkkkkkkkk']
  },
  bomb: {
    scale: 2,
    palette: ITEM_PALETTE,
    rows: ['kkkkkkkkkk', 'krrrrrkyrk', 'krrrrkyrrk', 'krrkkkkrrk', 'krkddddkrk', 'krkdwdddkk', 'krkddddkrk', 'krkddddkrk', 'krrkkkkrrk', 'kkkkkkkkkk']
  },
  life: {
    scale: 2,
    palette: ITEM_PALETTE,
    rows: ['kkkkkkkkkk', 'kppppppppk', 'kpkkpkkppk', 'kkwwkwwkpk', 'kkwwwwwkpk', 'kpkwwwkppk', 'kppkwkpppk', 'kpppkppppk', 'kppppppppk', 'kkkkkkkkkk']
  }
};

/** The boss marker on the map and over a door that leads to him. */
export const SKULL: SpriteDef = {
  scale: 2,
  palette: { k: K, w: '#ffffff' },
  rows: ['..kkkkk..', '.kwwwwwk.', 'kwwwwwwwk', 'kwkwwwkwk', 'kwkkwkkwk', '.kwwwwwk.', '.kkwkwkk.', '..kwkwk..', '...kkk...']
};

/** Every bitmap the module ships, for the width-and-palette test. */
export const ALL_SPRITES: Record<string, SpriteDef> = {
  PLAYER_FRONT,
  PLAYER_BACK,
  PLAYER_SIDE,
  PLAYER_DOWN,
  ...Object.fromEntries(GRUNT_KITS.flatMap((_, kit) => [0, 1, 2].map(f => [`GRUNT_${kit}_${f}`, gruntSprite(kit, f)]))),
  ...Object.fromEntries((['quiet', 'armed', 'charging'] as const).flatMap(s => [0, 1, 2, 3].map(f => [`ORB_${s}_${f}`, orbSprite(s, f)]))),
  MINE,
  SHRAPNEL_0: SHRAPNEL[0],
  SHRAPNEL_1: SHRAPNEL[1],
  TANK,
  SNAKE_HEAD,
  SNAKE_SEGMENT,
  MUTOID,
  MUTOID_HURT,
  SCARFACE_CALM: SCARFACE.calm,
  SCARFACE_RAGE: SCARFACE.rage,
  SCARFACE_HURT: SCARFACE.hurt,
  COBRA_HEAD,
  COBRA_SEGMENT,
  ...Object.fromEntries(Object.entries(ITEM_SPRITES).map(([k, v]) => [`ITEM_${k}`, v])),
  SKULL
};
