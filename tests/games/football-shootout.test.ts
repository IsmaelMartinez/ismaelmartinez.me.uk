import { describe, it, expect } from 'vitest';
import { seededRandom } from './seeded-random';
import {
  createShootout,
  tickShootout,
  kickOutcome,
  cpuKeeperZone,
  cpuKick,
  cpuMissChance,
  zoneFromStick,
  REGULATION_KICKS,
  SAVE_ADJACENT,
  SAVE_FAR,
  SAVE_SAME,
  SHOOTOUT_ZONES,
  WEAK_POWER,
  type ShootoutState
} from '../../src/games/football/shootout';

const DT = 1 / 60;
/** The five zones as stick deflections. */
const STICK = [-0.8, -0.4, 0, 0.4, 0.8];

/**
 * Play a whole shootout with a player who picks zones at random and lets each
 * window close on its own — which, on the defending kicks, is exactly the
 * "player who always dives" 7.5 measures the CPU against.
 */
function playShootout(seed: number, difficulty: number, dt = DT): ShootoutState {
  const s = createShootout({ rng: seededRandom(seed), difficulty });
  const pick = seededRandom(seed * 31 + 17);
  let seen = -1;
  let zone = 2;
  let guard = 0;
  while (!s.over && guard++ < 40000) {
    if (s.kicks.length !== seen) {
      seen = s.kicks.length;
      zone = Math.floor(pick() * SHOOTOUT_ZONES);
    }
    tickShootout(s, dt, { x: STICK[zone], y: 0, a: false });
  }
  return s;
}

function conversion(side: 0 | 1, seeds: number, difficulty: number): number {
  let scored = 0;
  let taken = 0;
  for (let i = 0; i < seeds; i++) {
    const s = playShootout(i * 7919 + 3, difficulty, 0.25);
    for (const kick of s.kicks) {
      if (kick.side !== side) continue;
      taken++;
      if (kick.result === 'scored') scored++;
    }
  }
  return scored / taken;
}

describe('shootout structure', () => {
  it('alternates, player first', () => {
    const s = playShootout(11, 0.45);
    expect(s.kicks[0].side).toBe(0);
    for (let i = 1; i < s.kicks.length; i++) {
      expect(s.kicks[i].side).toBe(1 - s.kicks[i - 1].side);
    }
  });

  it('never lets one side take more than one kick more than the other', () => {
    for (let seed = 0; seed < 200; seed++) {
      const s = playShootout(seed * 131 + 5, 0.45, 0.25);
      expect(Math.abs(s.taken[0] - s.taken[1])).toBeLessThanOrEqual(1);
      expect(s.over).toBe(true);
      expect(s.winner).not.toBeNull();
    }
  });

  it('goes to sudden death only when five kicks each are level', () => {
    let sawSudden = false;
    for (let seed = 0; seed < 400; seed++) {
      const s = playShootout(seed * 977 + 7, 0.45, 0.25);
      if (s.taken[0] <= REGULATION_KICKS && s.taken[1] <= REGULATION_KICKS) {
        expect(s.suddenDeath).toBe(false);
        continue;
      }
      sawSudden = true;
      expect(s.suddenDeath).toBe(true);
      const regulation = s.kicks.slice(0, REGULATION_KICKS * 2);
      const a = regulation.filter(k => k.side === 0 && k.result === 'scored').length;
      const b = regulation.filter(k => k.side === 1 && k.result === 'scored').length;
      expect(a).toBe(b);
      // Sudden death is decided a pair at a time, so it ends level in kicks.
      expect(s.taken[0]).toBe(s.taken[1]);
    }
    expect(sawSudden).toBe(true);
  });

  it('stops early once the remaining kicks cannot change the result', () => {
    let sawEarly = false;
    for (let seed = 0; seed < 300; seed++) {
      const s = playShootout(seed * 3121 + 11, 0.45, 0.25);
      if (s.taken[0] + s.taken[1] < REGULATION_KICKS * 2) sawEarly = true;
      expect(s.taken[0]).toBeLessThanOrEqual(Math.max(REGULATION_KICKS, s.taken[1] + 1));
    }
    expect(sawEarly).toBe(true);
  });
});

describe('shootout resolution', () => {
  it('maps the stick onto five zones', () => {
    expect(zoneFromStick(-1)).toBe(0);
    expect(zoneFromStick(-0.4)).toBe(1);
    expect(zoneFromStick(0)).toBe(2);
    expect(zoneFromStick(0.4)).toBe(3);
    expect(zoneFromStick(1)).toBe(4);
  });

  it('saves most of what the keeper guesses right and almost none of what he does not', () => {
    const rng = seededRandom(5);
    const measure = (zone: number, keeperZone: number, power: number): number => {
      let saved = 0;
      const n = 4000;
      for (let i = 0; i < n; i++) {
        if (kickOutcome(zone, keeperZone, power, rng) === 'saved') saved++;
      }
      return saved / n;
    };
    expect(measure(2, 2, 0.6)).toBeCloseTo(SAVE_SAME, 1);
    expect(measure(2, 3, 0.6)).toBeCloseTo(SAVE_ADJACENT, 1);
    expect(measure(0, 4, 0.6)).toBeCloseTo(SAVE_FAR, 1);
  });

  it('lets the keeper reach a weak kick from the next zone along', () => {
    const rng = seededRandom(9);
    let savedWeak = 0;
    let savedFirm = 0;
    const n = 4000;
    for (let i = 0; i < n; i++) {
      if (kickOutcome(2, 3, WEAK_POWER - 0.05, rng) === 'saved') savedWeak++;
      if (kickOutcome(2, 3, 0.8, rng) === 'saved') savedFirm++;
    }
    expect(savedWeak / n).toBeGreaterThan(savedFirm / n);
  });

  it('misses the frame sometimes when blasted at the very edge', () => {
    const rng = seededRandom(3);
    let missed = 0;
    const n = 6000;
    for (let i = 0; i < n; i++) {
      if (kickOutcome(0, 2, 1, rng) === 'missed') missed++;
    }
    expect(missed / n).toBeGreaterThan(0.02);
    expect(missed / n).toBeLessThan(0.16);
  });

  it('lets the CPU keeper lean on the zones the player has used', () => {
    const s = createShootout({ rng: seededRandom(4), difficulty: 0.85 });
    s.history = [4, 4, 4, 4];
    let hits = 0;
    for (let i = 0; i < 4000; i++) if (cpuKeeperZone(s) === 4) hits++;
    expect(hits / 4000).toBeGreaterThan(1 / SHOOTOUT_ZONES + 0.1);

    const easy = createShootout({ rng: seededRandom(4), difficulty: 0.25 });
    easy.history = [4, 4, 4, 4];
    let easyHits = 0;
    for (let i = 0; i < 4000; i++) if (cpuKeeperZone(easy) === 4) easyHits++;
    expect(easyHits).toBeLessThan(hits);
  });

  it('makes the CPU taker better with difficulty and never perfect', () => {
    expect(cpuMissChance(0.25)).toBeGreaterThan(cpuMissChance(0.85));
    expect(cpuMissChance(1)).toBeGreaterThan(0);
    const soft = createShootout({ rng: seededRandom(6), difficulty: 0.1 });
    const hard = createShootout({ rng: seededRandom(6), difficulty: 0.9 });
    let softPower = 0;
    let hardPower = 0;
    for (let i = 0; i < 2000; i++) {
      softPower += cpuKick(soft).power;
      hardPower += cpuKick(hard).power;
    }
    expect(hardPower).toBeGreaterThan(softPower);
  });
});

describe('shootout conversion bands', () => {
  it('converts 0.58 to 0.75 for the player against the CPU keeper', { timeout: 60000 }, () => {
    const p = conversion(0, 400, 0.45);
    expect(p).toBeGreaterThanOrEqual(0.58);
    expect(p).toBeLessThanOrEqual(0.75);
  });

  it('converts 0.52 to 0.70 for the CPU at d = 0.25', { timeout: 60000 }, () => {
    const p = conversion(1, 400, 0.25);
    expect(p).toBeGreaterThanOrEqual(0.52);
    expect(p).toBeLessThanOrEqual(0.7);
  });

  it('converts 0.60 to 0.78 for the CPU at d = 0.85', { timeout: 60000 }, () => {
    const p = conversion(1, 400, 0.85);
    expect(p).toBeGreaterThanOrEqual(0.6);
    expect(p).toBeLessThanOrEqual(0.78);
  });
});

describe('sudden death terminates', () => {
  it('settles within twelve pairs in at least 99.9% of ten thousand shootouts', { timeout: 180000 }, () => {
    const runs = 10000;
    let long = 0;
    for (let seed = 0; seed < runs; seed++) {
      const s = playShootout(seed * 6151 + 29, seed % 2 === 0 ? 0.25 : 0.85, 0.25);
      expect(s.over).toBe(true);
      const suddenPairs = Math.max(0, s.taken[0] - REGULATION_KICKS);
      if (suddenPairs > 12) long++;
    }
    expect(long / runs).toBeLessThanOrEqual(0.001);
  });
});
