/**
 * The contestant's guns. The machine gun is always there; the three pickups
 * replace it for as long as their ammo lasts and then hand back, which is
 * Smash TV's rule. Every figure a shot has is a column here so a balance
 * change is one line, and `shotVectors` is the one place the spread gun's fan
 * is defined.
 */
import type { Pt } from './arena';

export type WeaponId = 'machine' | 'spread' | 'grenade' | 'rocket';

export interface WeaponDef {
  id: WeaponId;
  /** Shots a second while fire is held. */
  rate: number;
  /** Shot speed in px/s. */
  speed: number;
  /** Damage per shot that lands. */
  damage: number;
  /** Shots the pickup carries; 0 is the machine gun's bottomless belt. */
  ammo: number;
  /** Enemies a shot passes through before it is spent (1 is an ordinary bullet). */
  pierce: number;
  /** Blast radius in px when the shot bursts; 0 for a shot that does not. */
  blast: number;
  /** Distance a bursting shot flies before it bursts on its own; 0 flies to a wall. */
  fuse: number;
  /** Shot radius for collision and drawing. */
  r: number;
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  machine: { id: 'machine', rate: 9, speed: 430, damage: 1, ammo: 0, pierce: 1, blast: 0, fuse: 0, r: 3 },
  spread: { id: 'spread', rate: 7, speed: 400, damage: 1, ammo: 90, pierce: 1, blast: 0, fuse: 0, r: 3 },
  grenade: { id: 'grenade', rate: 3.2, speed: 260, damage: 5, ammo: 36, pierce: 1, blast: 62, fuse: 210, r: 4 },
  rocket: { id: 'rocket', rate: 5, speed: 540, damage: 4, ammo: 48, pierce: 4, blast: 0, fuse: 0, r: 3.5 }
};

export const WEAPON_IDS: readonly WeaponId[] = ['machine', 'spread', 'grenade', 'rocket'];

/** The spread gun's fan: the aimed direction and one each side, this far off it. */
export const SPREAD_ANGLE = Math.PI / 9;

/** The directions one pull of the trigger sends shots in, for an eight-way aim `dir`. */
export function shotVectors(weapon: WeaponId, dir: Pt): Pt[] {
  if (weapon !== 'spread') return [dir];
  const a = Math.atan2(dir.y, dir.x);
  return [-SPREAD_ANGLE, 0, SPREAD_ANGLE].map(off => ({ x: Math.cos(a + off), y: Math.sin(a + off) }));
}
