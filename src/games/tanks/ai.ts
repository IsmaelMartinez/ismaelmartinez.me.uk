/**
 * CPU gunner. Grid-searches angle/power combinations using the real shot
 * simulation, picks the one landing closest to the target, then smears the
 * result with noise scaled by (1 - difficulty) so lower difficulties miss
 * more often.
 */
import { simulateShot } from './physics';
import type { WeaponId } from './weapons';
import { clamp } from '../engine/math';

export interface AiShot {
  angle: number;
  power: number;
}

/** The three start-screen difficulty tiers and their base accuracy. */
export type Difficulty = 'rookie' | 'gunner' | 'veteran';

/**
 * Base `difficulty` fed to `chooseAiShot` per tier. Higher = tighter shots
 * (less `(1 - difficulty)` scatter). `gunner` ≈ the old fixed 0.72.
 */
export const DIFFICULTY_BASE: Record<Difficulty, number> = {
  rookie: 0.45,
  gunner: 0.7,
  veteran: 0.9
};

/** Per-decided-round tightening, so a best-of-5 escalates as it wears on. */
export const DIFFICULTY_RAMP = 0.06;

/**
 * Effective aim accuracy for the CPU: the tier's base plus a ramp for every
 * round already decided this match, capped at a perfect 1. A veteran late in a
 * long match is a crack shot; a rookie's opening round is forgiving.
 */
export function cpuDifficulty(tier: Difficulty, roundsDecided: number): number {
  // Fall back to gunner if an unknown tier ever reaches here — a bad DOM
  // dataset must not turn the aim maths into NaN and freeze the CPU turn.
  const base = DIFFICULTY_BASE[tier] ?? DIFFICULTY_BASE.gunner;
  return Math.min(1, base + Math.max(0, roundsDecided) * DIFFICULTY_RAMP);
}

/**
 * Tactical shell choice, replacing a coin-flip. The heavy is the finisher —
 * its wide, hard blast is worth its scarce ammo while the target still has
 * real armour to chew through; the MIRV's horizontal fan covers aim error, so
 * it earns its single shot at long range where one missile is easiest to miss
 * with; otherwise the unlimited missile. A little randomness keeps it from
 * being robotically predictable.
 */
export function cpuPickWeapon(
  ammo: { heavy: number; mirv: number },
  range: number,
  targetHp: number,
  random: () => number = Math.random
): WeaponId {
  if (ammo.heavy > 0 && targetHp > 45 && random() < 0.6) return 'heavy';
  if (ammo.mirv > 0 && range > 360 && random() < 0.5) return 'mirv';
  return 'missile';
}

export function chooseAiShot(
  ground: number[],
  width: number,
  height: number,
  from: { x: number; y: number },
  target: { x: number; y: number },
  wind: number,
  difficulty = 0.7,
  random: () => number = Math.random
): AiShot {
  let best: AiShot = { angle: target.x < from.x ? 135 : 45, power: 50 };
  let bestDist = Infinity;
  const facingLeft = target.x < from.x;

  for (let elevation = 20; elevation <= 85; elevation += 5) {
    const angle = facingLeft ? 180 - elevation : elevation;
    for (let power = 20; power <= 100; power += 5) {
      const impact = simulateShot(ground, width, height, from.x, from.y, angle, power, wind);
      if (!impact) continue;
      const dist = Math.hypot(impact.x - target.x, impact.y - target.y);
      if (dist < bestDist) {
        bestDist = dist;
        best = { angle, power };
      }
    }
  }

  const wobble = 1 - clamp(difficulty, 0, 1);
  return {
    angle: clamp(best.angle + (random() - 0.5) * 30 * wobble, 5, 175),
    power: clamp(best.power + (random() - 0.5) * 30 * wobble, 10, 100)
  };
}
