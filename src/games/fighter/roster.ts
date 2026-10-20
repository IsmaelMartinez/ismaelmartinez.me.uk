/**
 * The twelve fighters: eight world warriors you can pick and four bosses who
 * wait at the top of the ladder, each an original character built on the
 * archetype a 1991 player would recognise (the karate shoto and his rival,
 * the charge soldier, the kicking heroine, the wrestler, the stretching yogi,
 * the sumo, the jungle beast; then the boxer, the masked claw, the muay thai
 * giant and the dictator).
 *
 * DOM-free data. Everything a fighter does is a row here: the normals come
 * from one shared frame-data table scaled per fighter (reach, power, speed),
 * the specials are a kind plus numbers, and `fight.ts` runs the kinds. Names
 * are plain ASCII so the bitmap font draws them in every locale.
 */
import type { Motion } from './motion';

export type CharId =
  | 'kenji'
  | 'ace'
  | 'mei'
  | 'boris'
  | 'raj'
  | 'tora'
  | 'rio'
  | 'duke'
  | 'rocko'
  | 'varga'
  | 'sakda'
  | 'zar';

/** The eight on the select screen, in grid order (two rows of four). */
export const SELECTABLE: readonly CharId[] = ['kenji', 'tora', 'rio', 'duke', 'ace', 'mei', 'boris', 'raj'];
/** The bosses, in the order the ladder meets them. */
export const BOSSES: readonly CharId[] = ['rocko', 'varga', 'sakda', 'zar'];

export type Posture = 'stand' | 'crouch' | 'air';
export type Guard = 'mid' | 'low' | 'high';
export type Strength = 0 | 1 | 2;

/** A normal attack's frame data (60 fps), for a fighter facing right. */
export interface NormalDef {
  startup: number;
  active: number;
  recovery: number;
  damage: number;
  /** Dizzy points the hit adds. */
  stun: number;
  /** The hitbox, relative to the fighter's feet: x forward, y up. */
  box: { x: number; y: number; w: number; h: number };
  guard: Guard;
  knockdown?: boolean;
  /** Which limb strikes, which is what the pose extends. */
  limb: 'fist' | 'foot';
}

export type SpecialKind = 'projectile' | 'rising' | 'spin' | 'rapid' | 'rush' | 'flip' | 'grab' | 'lariat' | 'breath';

/** The look of a projectile, which `render.ts` reads. */
export type ProjectileStyle = 'spirit' | 'sonic' | 'fire' | 'tiger' | 'tigerLow';

export interface SpecialDef {
  /** The move's name on the instruction card; a proper name, the same in every locale. */
  name: string;
  kind: SpecialKind;
  motion: Motion;
  button: 'P' | 'K';
  /** Damage per hit, by strength. */
  damage: readonly [number, number, number];
  /** Projectile style, for `projectile`. */
  style?: ProjectileStyle;
  /** Height the projectile flies at (its centre, from the floor). */
  height?: number;
  /** Rush and spin speed in px/frame by strength; projectile speed for projectiles. */
  speed?: readonly [number, number, number];
  /** Hits a multi-hit move lands at most. */
  hits?: number;
  /** Guard the move must be blocked by (projectiles default to mid). */
  guard?: Guard;
  /** Passes through projectiles. */
  projInvuln?: boolean;
}

export interface Fighter {
  id: CharId;
  name: string;
  /** Home country, the key for the stage and the map. */
  home: HomeId;
  /** Stand height of the hurtbox, px. */
  height: number;
  /** Walk speed forward / back, px per frame. */
  walk: readonly [number, number];
  /** Jump horizontal speed, px per frame. */
  jumpX: number;
  /** Multiplier on normal attacks' horizontal reach (the yogi stretches). */
  reach: number;
  /** Multiplier on normals' damage. */
  power: number;
  /** Health, out of which every hit is taken. */
  health: number;
  /** Dizzy threshold. */
  stunMax: number;
  /** Kicks are punches (the boxer). */
  boxer?: boolean;
  /** How the fighter is drawn; `art.ts` keys on it. */
  build: 'lean' | 'muscle' | 'giant' | 'heavy' | 'slim' | 'beast' | 'tall';
  specials: readonly SpecialDef[];
}

export type HomeId =
  | 'japan'
  | 'usa'
  | 'harbour'
  | 'china'
  | 'ussr'
  | 'india'
  | 'brazil'
  | 'vegas'
  | 'spain'
  | 'thailand'
  | 'temple';

/** Where each home sits on the world map (longitude, latitude), and the country the map names. */
export const HOMES: Record<HomeId, { lon: number; lat: number; country: string }> = {
  japan: { lon: 139, lat: 36, country: 'JAPAN' },
  usa: { lon: -98, lat: 36, country: 'USA' },
  harbour: { lon: -122, lat: 38, country: 'USA' },
  china: { lon: 116, lat: 38, country: 'CHINA' },
  ussr: { lon: 38, lat: 56, country: 'USSR' },
  india: { lon: 78, lat: 24, country: 'INDIA' },
  brazil: { lon: -60, lat: -4, country: 'BRAZIL' },
  vegas: { lon: -115, lat: 36, country: 'USA' },
  spain: { lon: -4, lat: 40, country: 'SPAIN' },
  thailand: { lon: 100, lat: 15, country: 'THAILAND' },
  temple: { lon: 101, lat: 19, country: 'THAILAND' }
};

/**
 * The shared table of normals. Light attacks are fast and link, heavies are
 * slow and hurt, crouching kicks hit low and the crouching heavy kick
 * sweeps, and every jumping attack is an overhead a crouching guard cannot
 * stop, which is the whole of the genre's guessing game in eighteen rows.
 */
const NORMALS: Record<Posture, Record<'P' | 'K', readonly [NormalDef, NormalDef, NormalDef]>> = {
  stand: {
    P: [
      { startup: 3, active: 3, recovery: 6, damage: 6, stun: 3, box: { x: 18, y: 62, w: 34, h: 12 }, guard: 'mid', limb: 'fist' },
      { startup: 4, active: 4, recovery: 11, damage: 12, stun: 6, box: { x: 18, y: 60, w: 40, h: 14 }, guard: 'mid', limb: 'fist' },
      { startup: 6, active: 4, recovery: 19, damage: 20, stun: 10, box: { x: 18, y: 58, w: 44, h: 16 }, guard: 'mid', limb: 'fist' }
    ],
    K: [
      { startup: 4, active: 4, recovery: 8, damage: 7, stun: 3, box: { x: 16, y: 26, w: 40, h: 14 }, guard: 'mid', limb: 'foot' },
      { startup: 5, active: 4, recovery: 14, damage: 13, stun: 6, box: { x: 16, y: 44, w: 48, h: 16 }, guard: 'mid', limb: 'foot' },
      { startup: 8, active: 5, recovery: 21, damage: 21, stun: 10, box: { x: 16, y: 62, w: 54, h: 18 }, guard: 'mid', limb: 'foot' }
    ]
  },
  crouch: {
    P: [
      { startup: 3, active: 3, recovery: 6, damage: 5, stun: 3, box: { x: 16, y: 34, w: 34, h: 12 }, guard: 'mid', limb: 'fist' },
      { startup: 4, active: 4, recovery: 11, damage: 11, stun: 6, box: { x: 16, y: 34, w: 40, h: 14 }, guard: 'mid', limb: 'fist' },
      // The crouching heavy punch rises: the anti-air everybody has.
      { startup: 5, active: 5, recovery: 21, damage: 18, stun: 10, box: { x: 4, y: 50, w: 36, h: 52 }, guard: 'mid', limb: 'fist' }
    ],
    K: [
      { startup: 3, active: 3, recovery: 8, damage: 6, stun: 3, box: { x: 16, y: 2, w: 38, h: 12 }, guard: 'low', limb: 'foot' },
      { startup: 5, active: 4, recovery: 14, damage: 12, stun: 6, box: { x: 16, y: 2, w: 50, h: 12 }, guard: 'low', limb: 'foot' },
      { startup: 6, active: 5, recovery: 24, damage: 17, stun: 8, box: { x: 16, y: 0, w: 56, h: 12 }, guard: 'low', knockdown: true, limb: 'foot' }
    ]
  },
  air: {
    P: [
      { startup: 3, active: 10, recovery: 2, damage: 7, stun: 4, box: { x: 10, y: 20, w: 30, h: 22 }, guard: 'high', limb: 'fist' },
      { startup: 4, active: 6, recovery: 2, damage: 13, stun: 7, box: { x: 10, y: 12, w: 34, h: 26 }, guard: 'high', limb: 'fist' },
      { startup: 5, active: 6, recovery: 2, damage: 19, stun: 10, box: { x: 10, y: 6, w: 38, h: 28 }, guard: 'high', limb: 'fist' }
    ],
    K: [
      { startup: 3, active: 12, recovery: 2, damage: 8, stun: 4, box: { x: 8, y: 2, w: 34, h: 18 }, guard: 'high', limb: 'foot' },
      { startup: 4, active: 7, recovery: 2, damage: 13, stun: 7, box: { x: 8, y: -4, w: 42, h: 22 }, guard: 'high', limb: 'foot' },
      { startup: 5, active: 6, recovery: 2, damage: 20, stun: 10, box: { x: 8, y: -8, w: 46, h: 24 }, guard: 'high', limb: 'foot' }
    ]
  }
};

/** A fighter's normal: the shared row, scaled by its reach and power. */
export function normalFor(f: Fighter, posture: Posture, button: 'P' | 'K', strength: Strength): NormalDef {
  const base = NORMALS[posture][f.boxer ? 'P' : button][strength];
  // The boxer's kick buttons are punches too, aimed a little lower.
  const boxerLow = f.boxer && button === 'K' && posture !== 'air' ? -14 : 0;
  // The yogi's stretch is in his medium and heavy limbs; jabs stay short.
  const reach = strength === 0 ? 1 + (f.reach - 1) * 0.3 : f.reach;
  const extra = base.box.w * (reach - 1);
  return {
    ...base,
    damage: Math.round(base.damage * f.power),
    // A stretched limb is slower to come out and go home.
    startup: base.startup + (reach > 1.2 ? 2 : 0),
    recovery: base.recovery + (reach > 1.2 ? 4 : 0),
    box: { x: base.box.x, y: Math.max(0, base.box.y + boxerLow), w: Math.round(base.box.w + extra), h: base.box.h }
  };
}

const shoto = (dragon: [number, number, number], wave: number): SpecialDef[] => [
  { name: 'Spirit Wave', kind: 'projectile', motion: 'qcf', button: 'P', damage: [wave, wave + 1, wave + 2], style: 'spirit', height: 62, speed: [2.4, 3.2, 4.2] },
  { name: 'Rising Dragon', kind: 'rising', motion: 'dp', button: 'P', damage: dragon, hits: 1 },
  { name: 'Whirlwind Kick', kind: 'spin', motion: 'qcb', button: 'K', damage: [10, 12, 14], speed: [2.2, 2.6, 3], hits: 3 }
];

export const FIGHTERS: Record<CharId, Fighter> = {
  kenji: {
    id: 'kenji',
    name: 'KENJI',
    home: 'japan',
    height: 90,
    walk: [2.1, 1.8],
    jumpX: 2.6,
    reach: 1,
    power: 1,
    health: 160,
    stunMax: 40,
    build: 'lean',
    specials: shoto([22, 26, 30], 14)
  },
  ace: {
    id: 'ace',
    name: 'ACE',
    home: 'harbour',
    height: 90,
    walk: [2.2, 1.9],
    jumpX: 2.6,
    reach: 1,
    power: 1,
    health: 160,
    stunMax: 40,
    build: 'lean',
    // His dragon burns hotter and climbs higher; his wave is a touch weaker.
    specials: shoto([24, 28, 34], 12)
  },
  mei: {
    id: 'mei',
    name: 'MEI',
    home: 'china',
    height: 84,
    walk: [2.6, 2.2],
    jumpX: 3,
    reach: 1.1,
    power: 1,
    health: 160,
    stunMax: 40,
    build: 'slim',
    specials: [
      { name: 'Lightning Legs', kind: 'rapid', motion: 'mash', button: 'K', damage: [5, 6, 7], hits: 6 },
      { name: 'Spinning Bird Kick', kind: 'spin', motion: 'chargeDU', button: 'K', damage: [9, 10, 12], speed: [2.4, 2.8, 3.2], hits: 4 }
    ]
  },
  boris: {
    id: 'boris',
    name: 'BORIS',
    home: 'ussr',
    height: 100,
    walk: [1.8, 1.5],
    jumpX: 2.1,
    reach: 1.05,
    power: 1.25,
    health: 190,
    stunMax: 50,
    build: 'giant',
    specials: [
      { name: 'Siberian Suplex', kind: 'grab', motion: 'hcb', button: 'P', damage: [30, 34, 38] },
      { name: 'Iron Lariat', kind: 'lariat', motion: 'ppp', button: 'P', damage: [10, 10, 10], hits: 3, projInvuln: true }
    ]
  },
  raj: {
    id: 'raj',
    name: 'RAJ',
    home: 'india',
    height: 94,
    walk: [1.6, 1.5],
    jumpX: 1.8,
    reach: 1.55,
    power: 0.9,
    health: 150,
    stunMax: 38,
    build: 'tall',
    specials: [
      { name: 'Fire Orb', kind: 'projectile', motion: 'qcf', button: 'P', damage: [13, 14, 15], style: 'fire', height: 58, speed: [1.6, 2.2, 2.8] },
      { name: 'Dragon Breath', kind: 'breath', motion: 'qcb', button: 'P', damage: [16, 18, 20], guard: 'mid' }
    ]
  },
  tora: {
    id: 'tora',
    name: 'TORA',
    home: 'japan',
    height: 92,
    walk: [1.7, 1.5],
    jumpX: 2.2,
    reach: 1,
    power: 1.1,
    health: 175,
    stunMax: 44,
    build: 'heavy',
    specials: [
      { name: 'Hundred Slaps', kind: 'rapid', motion: 'mash', button: 'P', damage: [5, 6, 7], hits: 6 },
      { name: 'Sumo Torpedo', kind: 'rush', motion: 'chargeBF', button: 'P', damage: [18, 21, 24], speed: [4.4, 5.4, 6.4] }
    ]
  },
  rio: {
    id: 'rio',
    name: 'RIO',
    home: 'brazil',
    height: 88,
    walk: [2.3, 2],
    jumpX: 2.7,
    reach: 1.05,
    power: 1,
    health: 160,
    stunMax: 40,
    build: 'beast',
    specials: [
      { name: 'Thunder Hide', kind: 'rapid', motion: 'mash', button: 'P', damage: [5, 6, 7], hits: 5, guard: 'mid' },
      { name: 'Rolling Cannon', kind: 'rush', motion: 'chargeBF', button: 'P', damage: [16, 19, 22], speed: [4.6, 5.6, 6.6] }
    ]
  },
  duke: {
    id: 'duke',
    name: 'DUKE',
    home: 'usa',
    height: 94,
    walk: [1.9, 1.7],
    jumpX: 2.4,
    reach: 1.05,
    power: 0.95,
    health: 150,
    stunMax: 42,
    build: 'muscle',
    specials: [
      { name: 'Sonic Cutter', kind: 'projectile', motion: 'chargeBF', button: 'P', damage: [10, 11, 12], style: 'sonic', height: 60, speed: [2.6, 3.6, 4.6] },
      { name: 'Flash Kick', kind: 'flip', motion: 'chargeDU', button: 'K', damage: [17, 20, 23] }
    ]
  },
  rocko: {
    id: 'rocko',
    name: 'ROCKO',
    home: 'vegas',
    height: 96,
    walk: [2.2, 1.9],
    jumpX: 2.4,
    reach: 1.1,
    power: 1.25,
    health: 195,
    stunMax: 50,
    boxer: true,
    build: 'muscle',
    specials: [
      { name: 'Dash Straight', kind: 'rush', motion: 'chargeBF', button: 'P', damage: [18, 21, 24], speed: [4.8, 5.8, 6.8] },
      { name: 'Dash Upper', kind: 'rush', motion: 'chargeBF', button: 'K', damage: [16, 19, 22], speed: [4.2, 5.2, 6.2], guard: 'low' }
    ]
  },
  varga: {
    id: 'varga',
    name: 'VARGA',
    home: 'spain',
    height: 92,
    walk: [2.6, 2.3],
    jumpX: 3.2,
    reach: 1.25,
    power: 1,
    health: 160,
    stunMax: 40,
    build: 'slim',
    specials: [
      { name: 'Rolling Claw', kind: 'rush', motion: 'chargeBF', button: 'P', damage: [7, 8, 9], speed: [4, 4.8, 5.6], hits: 3 },
      { name: 'Flip Kick', kind: 'flip', motion: 'chargeDU', button: 'K', damage: [16, 19, 22] }
    ]
  },
  sakda: {
    id: 'sakda',
    name: 'SAKDA',
    home: 'thailand',
    height: 110,
    walk: [1.8, 1.6],
    jumpX: 2.2,
    reach: 1.2,
    power: 1.15,
    health: 190,
    stunMax: 48,
    build: 'tall',
    specials: [
      { name: 'Tiger Shot', kind: 'projectile', motion: 'qcf', button: 'P', damage: [14, 16, 18], style: 'tiger', height: 70, speed: [2.8, 3.6, 4.6] },
      { name: 'Low Tiger Shot', kind: 'projectile', motion: 'qcf', button: 'K', damage: [12, 14, 16], style: 'tigerLow', height: 16, speed: [2.8, 3.6, 4.6], guard: 'low' },
      { name: 'Tiger Uppercut', kind: 'rising', motion: 'dp', button: 'P', damage: [22, 26, 30], hits: 2 }
    ]
  },
  zar: {
    id: 'zar',
    name: 'ZAR',
    home: 'temple',
    height: 96,
    walk: [2.4, 2.1],
    jumpX: 2.8,
    reach: 1.1,
    power: 1.2,
    health: 200,
    stunMax: 52,
    build: 'muscle',
    specials: [
      { name: 'Psycho Charge', kind: 'rush', motion: 'chargeBF', button: 'P', damage: [9, 10, 11], speed: [4.6, 5.6, 6.6], hits: 3, projInvuln: true },
      { name: 'Scissor Kicks', kind: 'rush', motion: 'chargeBF', button: 'K', damage: [8, 9, 10], speed: [3.6, 4.2, 4.8], hits: 2 }
    ]
  }
};

/** Whether a fighter has a special of this kind (the CPU asks before it plans). */
export function specialOf(f: Fighter, kind: SpecialKind): SpecialDef | undefined {
  return f.specials.find(s => s.kind === kind);
}
