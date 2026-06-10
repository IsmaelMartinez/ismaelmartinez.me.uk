/**
 * CPU gunner. Grid-searches angle/power combinations using the real shot
 * simulation, picks the one landing closest to the target, then smears the
 * result with noise scaled by (1 - difficulty) so lower difficulties miss
 * more often.
 */
import { simulateShot } from './physics';

export interface AiShot {
  angle: number;
  power: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
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
