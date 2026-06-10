import { describe, it, expect } from 'vitest';
import { generateTerrain, surfaceYAt, carveCrater } from '../../src/games/tanks/terrain';
import {
  launchProjectile,
  stepProjectile,
  simulateShot,
  explosionDamage,
  GRAVITY
} from '../../src/games/tanks/physics';
import { chooseAiShot } from '../../src/games/tanks/ai';
import { WEAPONS, WEAPON_IDS, freshAmmo, splitCluster } from '../../src/games/tanks/weapons';

const WIDTH = 800;
const HEIGHT = 450;

function seededRandom(seed = 42): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

describe('terrain', () => {
  it('generates one height per column within bounds', () => {
    const ground = generateTerrain(WIDTH, HEIGHT, seededRandom());
    expect(ground).toHaveLength(WIDTH);
    for (const y of ground) {
      expect(y).toBeGreaterThanOrEqual(HEIGHT * 0.3);
      expect(y).toBeLessThanOrEqual(HEIGHT * 0.92);
    }
  });

  it('is deterministic for a given random source', () => {
    const a = generateTerrain(WIDTH, HEIGHT, seededRandom(7));
    const b = generateTerrain(WIDTH, HEIGHT, seededRandom(7));
    expect(a).toEqual(b);
  });

  it('clamps surface sampling to the field', () => {
    const ground = generateTerrain(WIDTH, HEIGHT, seededRandom());
    expect(surfaceYAt(ground, -50)).toBe(ground[0]);
    expect(surfaceYAt(ground, WIDTH + 50)).toBe(ground[WIDTH - 1]);
    expect(surfaceYAt(ground, 10.4)).toBe(ground[10]);
  });

  it('carves a crater that lowers terrain inside the radius only', () => {
    const ground = new Array(WIDTH).fill(300);
    const before = [...ground];
    carveCrater(ground, HEIGHT, 400, 300, 40);

    expect(ground[400]).toBeGreaterThan(before[400]);
    // Deepest at the centre, shallower at the edges
    expect(ground[400] - before[400]).toBeGreaterThan(ground[430] - before[430]);
    // Untouched outside the radius
    expect(ground[350]).toBe(300);
    expect(ground[450]).toBe(300);
  });

  it('never carves below the floor', () => {
    const ground = new Array(WIDTH).fill(HEIGHT - 5);
    carveCrater(ground, HEIGHT, 400, HEIGHT - 5, 60);
    for (const y of ground) {
      expect(y).toBeLessThanOrEqual(HEIGHT);
    }
  });
});

describe('physics', () => {
  it('launches straight up at 90 degrees', () => {
    const p = launchProjectile(100, 100, 90, 50);
    expect(p.vx).toBeCloseTo(0, 5);
    expect(p.vy).toBeLessThan(0);
  });

  it('launches left for angles above 90 degrees', () => {
    const p = launchProjectile(100, 100, 135, 50);
    expect(p.vx).toBeLessThan(0);
    expect(p.vy).toBeLessThan(0);
  });

  it('applies gravity and wind over time', () => {
    const p = launchProjectile(100, 100, 45, 50);
    const vy0 = p.vy;
    const vx0 = p.vx;
    stepProjectile(p, 30, 0.5);
    expect(p.vy).toBeCloseTo(vy0 + GRAVITY * 0.5, 5);
    expect(p.vx).toBeCloseTo(vx0 + 30 * 0.5, 5);
  });

  it('simulated shots land on the terrain surface', () => {
    const ground = new Array(WIDTH).fill(350);
    const impact = simulateShot(ground, WIDTH, HEIGHT, 100, 340, 45, 60, 0);
    expect(impact).not.toBeNull();
    expect(impact!.x).toBeGreaterThan(100);
    // Impact is detected just after crossing the surface within one substep
    expect(impact!.y).toBeGreaterThanOrEqual(350);
    expect(impact!.y).toBeLessThan(355);
  });

  it('returns null when the shot leaves the field', () => {
    const ground = new Array(WIDTH).fill(350);
    const impact = simulateShot(ground, WIDTH, HEIGHT, 700, 340, 10, 100, 0);
    expect(impact).toBeNull();
  });

  it('deals max damage at the centre and none outside the radius', () => {
    expect(explosionDamage(0, 0, 0, 0, 45, 55)).toBe(55);
    expect(explosionDamage(0, 0, 45, 0, 45, 55)).toBe(0);
    expect(explosionDamage(0, 0, 100, 0, 45, 55)).toBe(0);
    const near = explosionDamage(0, 0, 10, 0, 45, 55);
    const far = explosionDamage(0, 0, 30, 0, 45, 55);
    expect(near).toBeGreaterThan(far);
    expect(far).toBeGreaterThan(0);
  });
});

describe('ai', () => {
  it('lands close to the target at full accuracy on flat terrain', () => {
    const ground = new Array(WIDTH).fill(350);
    const from = { x: 650, y: 335 };
    const target = { x: 150, y: 350 };
    const shot = chooseAiShot(ground, WIDTH, HEIGHT, from, target, 0, 1, () => 0.5);
    const impact = simulateShot(ground, WIDTH, HEIGHT, from.x, from.y, shot.angle, shot.power, 0);
    expect(impact).not.toBeNull();
    expect(Math.abs(impact!.x - target.x)).toBeLessThan(40);
  });

  it('aims left when the target is to the left', () => {
    const ground = new Array(WIDTH).fill(350);
    const shot = chooseAiShot(
      ground, WIDTH, HEIGHT,
      { x: 650, y: 335 }, { x: 150, y: 350 },
      0, 1, () => 0.5
    );
    expect(shot.angle).toBeGreaterThan(90);
  });

  it('keeps noisy shots within legal slider ranges', () => {
    const ground = new Array(WIDTH).fill(350);
    const random = seededRandom(99);
    for (let i = 0; i < 10; i++) {
      const shot = chooseAiShot(
        ground, WIDTH, HEIGHT,
        { x: 650, y: 335 }, { x: 150, y: 350 },
        20, 0, random
      );
      expect(shot.angle).toBeGreaterThanOrEqual(5);
      expect(shot.angle).toBeLessThanOrEqual(175);
      expect(shot.power).toBeGreaterThanOrEqual(10);
      expect(shot.power).toBeLessThanOrEqual(100);
    }
  });
});

describe('weapons', () => {
  it('stocks unlimited missiles and scarce specials', () => {
    const ammo = freshAmmo();
    expect(ammo.missile).toBe(Infinity);
    expect(ammo.heavy).toBeGreaterThan(0);
    expect(ammo.heavy).toBeLessThan(5);
    expect(ammo.mirv).toBeGreaterThan(0);
  });

  it('defines every listed weapon', () => {
    for (const id of WEAPON_IDS) {
      expect(WEAPONS[id].radius).toBeGreaterThan(0);
      expect(WEAPONS[id].maxDamage).toBeGreaterThan(0);
      expect(WEAPONS[id].cluster).toBeGreaterThanOrEqual(1);
    }
  });

  it('splits a cluster into a symmetric horizontal fan', () => {
    const p = { x: 400, y: 120, vx: 80, vy: 0 };
    const parts = splitCluster(p, 5, 50);
    expect(parts).toHaveLength(5);
    // Middle warhead keeps the original trajectory
    expect(parts[2]).toEqual(p);
    // Fan is symmetric around the original vx
    expect(parts[0].vx + parts[4].vx).toBeCloseTo(2 * p.vx, 5);
    expect(parts[1].vx + parts[3].vx).toBeCloseTo(2 * p.vx, 5);
    // All inherit position and vertical velocity
    for (const part of parts) {
      expect(part.x).toBe(p.x);
      expect(part.y).toBe(p.y);
      expect(part.vy).toBe(p.vy);
    }
  });
});
