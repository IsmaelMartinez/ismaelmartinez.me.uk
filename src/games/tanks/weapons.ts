/**
 * Weapon arsenal, Scorched Earth style. Every tank gets the full rack each
 * round: missiles are unlimited, the specials are scarce and re-stocked at
 * the start of every round.
 */
import type { Projectile } from './physics';

export type WeaponId = 'missile' | 'heavy' | 'mirv' | 'bounce';

export interface WeaponDef {
  /** Blast radius of each warhead, in px. */
  radius: number;
  /** Damage at the centre of each blast. */
  maxDamage: number;
  /** Shots available per round; Infinity for the standard missile. */
  ammo: number;
  /** Warheads after the MIRV-style apex split; 1 means no split. */
  cluster: number;
  /** Ground bounces before the shell detonates; 0/undefined for a normal shell. */
  bounces?: number;
  emoji: string;
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  missile: { radius: 45, maxDamage: 55, ammo: Infinity, cluster: 1, emoji: '🚀' },
  heavy: { radius: 72, maxDamage: 85, ammo: 2, cluster: 1, emoji: '💣' },
  mirv: { radius: 30, maxDamage: 32, ammo: 1, cluster: 5, emoji: '🎇' },
  // The Skipper: a low, flat shot that skips off dirt to reach around terrain,
  // but is stopped dead by the bunker pillar (see the solid-column check in
  // stepShot). Scarce, and lighter than the missile to pay for its reach.
  bounce: { radius: 40, maxDamage: 46, ammo: 3, cluster: 1, bounces: 2, emoji: '🎾' }
};

export const WEAPON_IDS: WeaponId[] = ['missile', 'heavy', 'mirv', 'bounce'];

export type Ammo = Record<WeaponId, number>;

export function freshAmmo(): Ammo {
  return {
    missile: WEAPONS.missile.ammo,
    heavy: WEAPONS.heavy.ammo,
    mirv: WEAPONS.mirv.ammo,
    bounce: WEAPONS.bounce.ammo
  };
}

/**
 * Splits a shell at its apex into `count` warheads fanned out horizontally.
 * The middle warhead keeps the original trajectory.
 */
export function splitCluster(p: Projectile, count: number, spread = 55): Projectile[] {
  const out: Projectile[] = [];
  for (let i = 0; i < count; i++) {
    out.push({
      x: p.x,
      y: p.y,
      vx: p.vx + (i - (count - 1) / 2) * spread,
      vy: p.vy
    });
  }
  return out;
}
