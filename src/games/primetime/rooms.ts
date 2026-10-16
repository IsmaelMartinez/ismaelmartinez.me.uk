/**
 * The show's three studios: each a small grid of rooms with directed exits
 * from the entrance to the boss room, and a wave script per room.
 *
 * Exits are authored per room and point forward only, so the map is a DAG a
 * contestant can never get stuck in or walk back through, which is how Smash
 * TV's maps worked (`primetime.test.ts` proves it for every studio: every
 * exit leads to a real neighbour, no cycles, and the boss is reachable from
 * every room). The shortest path through a studio is deliberately short and
 * poor, the long way round rich in prizes, which is the choice the map screen
 * exists to offer.
 *
 * A room's enemies, counts, doors and timing are a table, not a roll: the
 * run's seed moves only where along a door an enemy appears, a grunt's speed
 * jitter and where a prize lands, so two contestants on different seeds fight
 * the same room for the same cash (Line Hold's rule for its seed).
 */
import type { Side } from './arena';
import type { BossKind, EnemyKind } from './enemies';
import type { ItemId } from './items';

/** Where a spawn entry's enemies come in: a fixed door, a door away from the contestant, or placed on the floor. */
export type SpawnDoor = Side | 'any' | 'floor';

export interface SpawnEntry {
  kind: EnemyKind;
  count: number;
  /** Seconds into the room the first one appears. */
  at: number;
  /** Seconds between each of the rest. */
  every: number;
  door: SpawnDoor;
  /** Orbs that shoot (a second-studio thing). */
  armed?: boolean;
}

export interface ItemEntry {
  item: ItemId;
  at: number;
}

export interface RoomScript {
  spawns: SpawnEntry[];
  items: ItemEntry[];
}

export interface RoomDef {
  key: string;
  col: number;
  row: number;
  /** Doors that open once the room is cleared, each leading to the neighbour on that side. */
  exits: Side[];
  script: RoomScript;
  boss?: BossKind;
}

export interface Circuit {
  /** The studio's number on the map screen (1 to 3). */
  studio: number;
  cols: number;
  rows: number;
  rooms: Record<string, RoomDef>;
  start: string;
  boss: string;
}

/** The knobs a room's script is generated from; `mix` turns them into entries. */
export interface RoomMix {
  grunts: number;
  orbs?: number;
  mines?: number;
  shrapnel?: number;
  tanks?: number;
  snakes?: number;
  /** Orbs shoot. */
  armed?: boolean;
  /** Seconds between grunts within a stream; smaller is a thicker crowd. */
  pace?: number;
  items?: ItemId[];
}

/**
 * A room's script from its knobs. Grunts arrive in three streams through
 * doors away from the contestant, the second and third smaller, so a room
 * opens with its biggest push and ends with stragglers rather than a wall;
 * mines are laid in the opening second; orbs and the heavier kinds trickle in
 * from a few seconds on; prizes and gear land spaced through the fight.
 */
export function mix(m: RoomMix): RoomScript {
  const pace = m.pace ?? 0.4;
  const spawns: SpawnEntry[] = [];
  const g1 = Math.round(m.grunts * 0.45);
  const g2 = Math.round(m.grunts * 0.35);
  const g3 = m.grunts - g1 - g2;
  if (g1 > 0) spawns.push({ kind: 'grunt', count: g1, at: 0.8, every: pace, door: 'any' });
  if (g2 > 0) spawns.push({ kind: 'grunt', count: g2, at: 0.8 + g1 * pace + 3.5, every: pace, door: 'any' });
  if (g3 > 0) spawns.push({ kind: 'grunt', count: g3, at: 0.8 + (g1 + g2) * pace + 8, every: pace * 0.9, door: 'any' });
  if (m.mines) spawns.push({ kind: 'mine', count: m.mines, at: 0.4, every: 0.25, door: 'floor' });
  if (m.orbs) spawns.push({ kind: 'orb', count: m.orbs, at: 3.5, every: 1.7, door: 'any', armed: m.armed });
  if (m.shrapnel) spawns.push({ kind: 'shrapnel', count: m.shrapnel, at: 7, every: 3.2, door: 'any' });
  if (m.tanks) spawns.push({ kind: 'tank', count: m.tanks, at: 5.5, every: 6.5, door: 'any' });
  if (m.snakes) spawns.push({ kind: 'snake', count: m.snakes, at: 9, every: 5.5, door: 'any' });
  const items: ItemEntry[] = (m.items ?? []).map((item, i) => ({ item, at: 3 + i * 6 }));
  return { spawns, items };
}

/** How many enemies a script sends in all. */
export function scriptEnemies(script: RoomScript): number {
  return script.spawns.reduce((n, s) => n + s.count, 0);
}

/** Seconds until a script's last spawn. */
export function scriptLength(script: RoomScript): number {
  return script.spawns.reduce((t, s) => Math.max(t, s.at + (s.count - 1) * s.every), 0);
}

function room(key: string, col: number, row: number, exits: Side[], script: RoomScript, boss?: BossKind): RoomDef {
  return { key, col, row, exits, script, boss };
}

const index = (rooms: RoomDef[]): Record<string, RoomDef> => Object.fromEntries(rooms.map(r => [r.key, r]));

/**
 * Studio 1: the teaching studio. Grunts, a few orbs that do not shoot, mines
 * from the third room, one shrapnel man before the boss. The short path is
 * S, B, D, boss; the long ways round through A, C or E, F carry the spread
 * gun, a VCR, a key and the only extra life in the studio.
 *
 *     .  A  C  .
 *     S  B  D  X
 *     .  E  F  .
 */
const STUDIO_1: Circuit = {
  studio: 1,
  cols: 4,
  rows: 3,
  start: 'S',
  boss: 'X',
  rooms: index([
    room('S', 0, 1, ['e'], mix({ grunts: 28, pace: 0.38, items: ['cash'] })),
    room('B', 1, 1, ['n', 'e', 's'], mix({ grunts: 40, orbs: 2, pace: 0.36, items: ['cash', 'key'] })),
    room('A', 1, 0, ['e'], mix({ grunts: 36, orbs: 3, pace: 0.36, items: ['spread', 'toaster'] })),
    room('C', 2, 0, ['s'], mix({ grunts: 44, mines: 3, pace: 0.36, items: ['cash', 'vcr', 'key'] })),
    room('E', 1, 2, ['e'], mix({ grunts: 36, orbs: 2, mines: 2, pace: 0.36, items: ['grenade', 'cash'] })),
    room('F', 2, 2, ['n'], mix({ grunts: 42, orbs: 3, pace: 0.36, items: ['life', 'key', 'toaster'] })),
    room('D', 2, 1, ['e'], mix({ grunts: 48, orbs: 4, mines: 3, shrapnel: 1, pace: 0.36, items: ['shield', 'cash', 'key'] })),
    room('X', 3, 1, ['e'], { spawns: [], items: [{ item: 'spread', at: 2 }, { item: 'cash', at: 14 }] }, 'mutoid')
  ])
};

/**
 * Studio 2: orbs shoot, tanks and the first snakes arrive, the crowds thicken.
 * Two routes of equal length, upper and lower, around a central room that
 * both can reach, and a prize room (P) off the upper route.
 *
 *     S  A  P  .  .
 *     .  B  C  D  X
 *     .  E  F  .  .
 */
const STUDIO_2: Circuit = {
  studio: 2,
  cols: 5,
  rows: 3,
  start: 'S',
  boss: 'X',
  rooms: index([
    room('S', 0, 0, ['e'], mix({ grunts: 40, orbs: 3, armed: true, pace: 0.36, items: ['cash', 'key'] })),
    room('A', 1, 0, ['e', 's'], mix({ grunts: 46, orbs: 4, armed: true, mines: 3, items: ['rocket', 'cash'] })),
    room('P', 2, 0, ['s'], mix({ grunts: 30, tanks: 1, items: ['vcr', 'car', 'key', 'life'] })),
    room('B', 1, 1, ['e', 's'], mix({ grunts: 50, orbs: 4, armed: true, shrapnel: 2, items: ['grenade', 'toaster'] })),
    room('C', 2, 1, ['e'], mix({ grunts: 54, orbs: 5, armed: true, mines: 4, tanks: 1, snakes: 1, items: ['shield', 'cash', 'key'] })),
    room('E', 1, 2, ['e'], mix({ grunts: 44, snakes: 1, mines: 3, items: ['spread', 'cash'] })),
    room('F', 2, 2, ['n'], mix({ grunts: 48, orbs: 4, armed: true, tanks: 2, items: ['bomb', 'vcr', 'key'] })),
    room('D', 3, 1, ['e'], mix({ grunts: 60, orbs: 5, armed: true, shrapnel: 3, snakes: 2, pace: 0.34, items: ['rocket', 'boots', 'cash'] })),
    room(
      'X',
      4,
      1,
      ['e'],
      { spawns: [{ kind: 'mine', count: 5, at: 0.4, every: 0.25, door: 'floor' }], items: [{ item: 'rocket', at: 2 }, { item: 'shield', at: 16 }] },
      'scarface'
    )
  ])
};

/**
 * Studio 3: everything at once, ninety grunts a room at the end. A hub after
 * the opener forks into two routes that rejoin, then a straight run of two
 * rooms to Cobra Death. The upper route is the prize route (two cars), the
 * lower has the gear.
 *
 *     .  A  C  .  .
 *     S  H  D  E  X
 *     .  B  F  .  .
 */
const STUDIO_3: Circuit = {
  studio: 3,
  cols: 5,
  rows: 3,
  start: 'S',
  boss: 'X',
  rooms: index([
    room('S', 0, 1, ['e'], mix({ grunts: 52, orbs: 3, armed: true, tanks: 1, pace: 0.34, items: ['spread', 'cash', 'key'] })),
    room('H', 1, 1, ['n', 's'], mix({ grunts: 58, orbs: 4, armed: true, shrapnel: 2, pace: 0.33, items: ['grenade', 'toaster', 'key'] })),
    room('A', 1, 0, ['e'], mix({ grunts: 60, orbs: 5, armed: true, tanks: 2, items: ['car', 'toaster', 'key'] })),
    room('C', 2, 0, ['s'], mix({ grunts: 66, snakes: 2, mines: 5, items: ['grenade', 'car', 'vcr'] })),
    room('B', 1, 2, ['e'], mix({ grunts: 60, orbs: 5, armed: true, shrapnel: 3, items: ['rocket', 'shield', 'key'] })),
    room('F', 2, 2, ['n'], mix({ grunts: 64, tanks: 3, snakes: 1, items: ['life', 'bomb', 'cash'] })),
    room('D', 2, 1, ['e'], mix({ grunts: 74, orbs: 6, armed: true, mines: 5, shrapnel: 3, tanks: 2, pace: 0.3, items: ['rocket', 'boots', 'key'] })),
    room('E', 3, 1, ['e'], mix({ grunts: 90, orbs: 6, armed: true, snakes: 3, shrapnel: 4, pace: 0.28, items: ['grenade', 'shield', 'vcr', 'key'] })),
    room('X', 4, 1, ['e'], { spawns: [], items: [{ item: 'rocket', at: 2 }, { item: 'shield', at: 18 }, { item: 'rocket', at: 30 }] }, 'cobra')
  ])
};

export const CIRCUITS: readonly Circuit[] = [STUDIO_1, STUDIO_2, STUDIO_3];

/** Keys in both maps are per studio, so a room is named by both. */
export const roomAt = (circuit: number, key: string): RoomDef => CIRCUITS[circuit].rooms[key];

/** The room on `side` of `room` in its studio, if there is one. */
export function neighbour(circuit: Circuit, room: RoomDef, side: Side): RoomDef | null {
  const dc = side === 'e' ? 1 : side === 'w' ? -1 : 0;
  const dr = side === 's' ? 1 : side === 'n' ? -1 : 0;
  return Object.values(circuit.rooms).find(r => r.col === room.col + dc && r.row === room.row + dr) ?? null;
}

/** The side of `from` that leads to `to`, when they are neighbours. */
export function sideTo(from: RoomDef, to: RoomDef): Side | null {
  if (to.col === from.col + 1 && to.row === from.row) return 'e';
  if (to.col === from.col - 1 && to.row === from.row) return 'w';
  if (to.row === from.row + 1 && to.col === from.col) return 's';
  if (to.row === from.row - 1 && to.col === from.col) return 'n';
  return null;
}

/** Seconds the bonus prize room lasts, and how often a prize lands in it. */
export const DOME_SECONDS = 15;
export const DOME_DROP_EVERY = 0.42;
