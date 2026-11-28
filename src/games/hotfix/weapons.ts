/**
 * HOTFIX's guns: three of them, found in crates about the town and carried on
 * foot only (nobody fires from a moving car here). DOM-free.
 *
 * What they are for is written in `run.ts`: bugs, rogue drones, and any car
 * you would like to see on fire. People are never hit; a shot that would
 * have found one sends them diving instead.
 */
export type WeaponId = 'pistol' | 'smg' | 'rocket';

export interface WeaponSpec {
  /** Seconds between shots. */
  rate: number;
  /** Pixels a second. */
  speed: number;
  damage: number;
  /** Radians of scatter either side of the aim. */
  spread: number;
  /** Pixels before the shot gives out. */
  range: number;
  /** Rounds in a crate. */
  ammo: number;
  /** A rocket's blast radius; 0 for a bullet. */
  blast: number;
}

export const WEAPONS: Record<WeaponId, WeaponSpec> = {
  pistol: { rate: 0.3, speed: 520, damage: 14, spread: 0.02, range: 300, ammo: 40, blast: 0 },
  smg: { rate: 0.09, speed: 560, damage: 8, spread: 0.09, range: 270, ammo: 120, blast: 0 },
  rocket: { rate: 0.9, speed: 330, damage: 80, spread: 0, range: 420, ammo: 6, blast: 72 }
};

export const WEAPON_IDS = Object.keys(WEAPONS) as WeaponId[];
