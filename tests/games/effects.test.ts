import { describe, it, expect, vi, afterEach } from 'vitest';
import { createEffects } from '../../src/games/engine/effects';

afterEach(() => vi.restoreAllMocks());

describe('createEffects', () => {
  it('bursts count particles with speeds scaled 0.4–1.0 of the base', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const fx = createEffects({ burstSpeed: 100 });
    fx.burst(10, 20, 5, '#fff');
    expect(fx.particles).toHaveLength(5);
    for (const p of fx.particles) {
      const v = Math.hypot(p.vx, p.vy);
      expect(v).toBeCloseTo(100 * 0.7);
      expect(p.x).toBe(10);
      expect(p.y).toBe(20);
    }
  });

  it('applies the launch kick and vy squash to gravity bursts', () => {
    // First random picks the angle (0.25 → π/2, straight down), second the
    // speed jitter (1 → full speed), so the squash is actually observable.
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.25).mockReturnValueOnce(1);
    const fx = createEffects({ burstSpeed: 100, vySquash: 0.5, launchKick: 30 });
    fx.burst(0, 0, 1, '#fff', { gravity: 1 });
    const p = fx.particles[0];
    expect(p.vy).toBeCloseTo(100 * 0.5 - 30);
    expect(p.vx).toBeCloseTo(0);
  });

  it('ages, moves, and culls particles in update', () => {
    const fx = createEffects({ gravityScale: 100 });
    fx.emit({ x: 0, y: 0, vx: 10, vy: -10, life: 0.25, color: '#fff', gravity: 1 });
    fx.update(0.1);
    const p = fx.particles[0];
    expect(p.x).toBeCloseTo(1);
    expect(p.y).toBeCloseTo(-1);
    // Gravity integrates after the position step, as the game copies did.
    expect(p.vy).toBeCloseTo(-10 + 100 * 0.1);
    fx.update(0.2); // life 0.25 expires
    expect(fx.particles).toHaveLength(0);
  });

  it('applies per-particle drag', () => {
    const fx = createEffects();
    fx.emit({ x: 0, y: 0, vx: 100, vy: 100, life: 1, color: '#fff', drag: 2.5 });
    fx.update(0.1);
    expect(fx.particles[0].vx).toBeCloseTo(100 * (1 - 0.25));
    expect(fx.particles[0].vy).toBeCloseTo(100 * (1 - 0.25));
  });

  it('culls particles below cullBelowY even while alive', () => {
    const fx = createEffects({ cullBelowY: 50 });
    fx.emit({ x: 0, y: 40, vx: 0, vy: 200, life: 10, color: '#fff' });
    fx.update(0.01);
    expect(fx.particles).toHaveLength(1);
    fx.update(0.1);
    expect(fx.particles).toHaveLength(0);
  });

  it('rises and expires floaters', () => {
    const fx = createEffects({ floaterRise: 20, floaterLife: 1 });
    fx.floater(5, 100, '+10', '#fff');
    fx.update(0.5);
    expect(fx.floaters[0].y).toBeCloseTo(90);
    expect(fx.floaters[0].life).toBeCloseTo(0.5);
    fx.update(0.6);
    expect(fx.floaters).toHaveLength(0);
  });

  it('honours per-floater rise/life/size overrides', () => {
    const fx = createEffects({ floaterRise: 22, floaterLife: 1.1, floaterSize: 13 });
    fx.floater(0, 100, 'CHAIN', '#fff', { rise: 10, life: 1.5, size: 22 });
    fx.update(1);
    expect(fx.floaters[0].y).toBeCloseTo(90);
    expect(fx.floaters[0].life).toBeCloseTo(0.5);
    expect(fx.floaters[0].size).toBe(22);
  });

  it('clear drops both arrays', () => {
    const fx = createEffects();
    fx.burst(0, 0, 3, '#fff');
    fx.floater(0, 0, 'x', '#fff');
    fx.clear();
    expect(fx.particles).toHaveLength(0);
    expect(fx.floaters).toHaveLength(0);
  });
});
