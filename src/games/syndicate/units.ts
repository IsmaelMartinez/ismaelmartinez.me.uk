/**
 * Syndicate — unit and weapon models. Agents, civilians, rival guards and
 * agents, and the mission target all share one Unit shape; behaviour
 * differences live in sim.ts.
 */

export type WeaponId = 'pistol' | 'uzi' | 'minigun';

export interface Weapon {
  id: WeaponId;
  /** Firing range in tiles. */
  range: number;
  /** Damage per round before the ±15% spread. */
  damage: number;
  /** Seconds between rounds. */
  cooldown: number;
  /** Pickup priority — higher tier always replaces lower. */
  tier: number;
}

export const WEAPONS: Record<WeaponId, Weapon> = {
  pistol: { id: 'pistol', range: 4, damage: 12, cooldown: 0.9, tier: 1 },
  uzi: { id: 'uzi', range: 5, damage: 9, cooldown: 0.35, tier: 2 },
  minigun: { id: 'minigun', range: 6, damage: 8, cooldown: 0.15, tier: 3 }
};

export type UnitKind = 'agent' | 'civilian' | 'guard' | 'enemy' | 'target' | 'vip';
export type Faction = 'player' | 'hostile' | 'neutral';

export interface Unit {
  id: number;
  kind: UnitKind;
  faction: Faction;
  /** Position in tile units, centre-based (tile (x, y) centre is x+0.5, y+0.5). */
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  weapon: WeaponId | null;
  /** Remaining route as tile indices (next waypoint first). */
  path: number[];
  cooldown: number;
  /** True once recruited by the Persuadertron; persuaded units turn 'player'. */
  persuaded: boolean;
  /** Seconds of panic sprinting left (civilians fleeing gunfire). */
  panic: number;
  wanderTimer: number;
  repathTimer: number;
  /** Patrol anchor tile for guards/enemies, spawn tile otherwise. */
  home: number;
  /** Cosmetic colour variant. */
  tint: number;
  alive: boolean;
}

export const UNIT_HP: Record<UnitKind, number> = {
  agent: 100,
  civilian: 25,
  guard: 60,
  enemy: 80,
  target: 150,
  // Tougher than a civilian, frailer than an agent: the asset survives a
  // stray burst but not a firefight it is walked through.
  vip: 70
};

export const UNIT_SPEED: Record<UnitKind, number> = {
  agent: 3.2,
  civilian: 1.5,
  guard: 2.2,
  enemy: 2.6,
  target: 2.4,
  // Agent pace, so an escort keeps up with an unboosted squad and visibly
  // trails a boosted one (adrenaline is the squad's, not the asset's).
  vip: 3.2
};

/** Reach of the Persuadertron, in tiles. */
export const PERSUADE_RADIUS = 1.4;

/**
 * Followers required before the Persuadertron works on a unit kind —
 * civilians come freely, armed minds take a crowd behind you. Neither the
 * mission target nor the escort asset can ever be persuaded: the target is
 * the contract, and the asset is collected by walking to it, not swayed.
 */
export function persuadeRequirement(kind: UnitKind): number {
  if (kind === 'civilian') return 0;
  if (kind === 'guard') return 4;
  if (kind === 'enemy') return 8;
  return Infinity;
}

export function createUnit(
  id: number,
  kind: UnitKind,
  tile: number,
  mapW: number,
  weapon: WeaponId | null = null
): Unit {
  return {
    id,
    kind,
    faction:
      kind === 'agent'
        ? 'player'
        : kind === 'civilian' || kind === 'vip'
          ? 'neutral'
          : 'hostile',
    x: (tile % mapW) + 0.5,
    y: Math.floor(tile / mapW) + 0.5,
    hp: UNIT_HP[kind],
    maxHp: UNIT_HP[kind],
    weapon,
    path: [],
    cooldown: 0,
    persuaded: false,
    panic: 0,
    wanderTimer: 0,
    repathTimer: 0,
    home: tile,
    tint: 0,
    alive: true
  };
}
