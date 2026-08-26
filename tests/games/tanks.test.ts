import { describe, it, expect } from 'vitest';
import { generateTerrain, surfaceYAt, carveCrater, arenaSolid, bunkerColumns, isSolidColumn, type ArenaType } from '../../src/games/tanks/terrain';
import {
  launchProjectile,
  stepProjectile,
  bounceOffSurface,
  simulateShot,
  explosionDamage,
  stepFall,
  GRAVITY,
  type FallBody
} from '../../src/games/tanks/physics';
import {
  createScoreLedger,
  submitsToBoard,
  DIRECT_HIT_POINTS,
  ROUND_WIN_POINTS,
  type TankMode
} from '../../src/games/tanks/scoring';
import {
  chooseAiShot,
  cpuDifficulty,
  cpuPickWeapon,
  DIFFICULTY_BASE,
  type Difficulty
} from '../../src/games/tanks/ai';
import { WEAPONS, WEAPON_IDS, freshAmmo, splitCluster } from '../../src/games/tanks/weapons';
import {
  createMatch,
  resetMatch,
  startRound,
  tickMatch,
  fire,
  isHumanTurn,
  WIDTH,
  HEIGHT,
  WINS_PER_MATCH,
  TANK_H,
  type MatchEvent,
  type MatchState
} from '../../src/games/tanks/match';
import { seededRandom } from './seeded-random';
import { meanT } from './football-paired';

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

describe('arenas', () => {
  const ARENAS = ['hills', 'canyon', 'mesa', 'ridges', 'bunker'] as const;

  it('leaves the default hills arena identical to the original three-wave generator', () => {
    // A standalone copy of the pre-arena generator. hills must match it byte for
    // byte: same random() draws in the same order, no reshape. This guards the
    // shipped terrain against a future edit accidentally routing hills through a
    // reshape (a plain `generateTerrain(...,'hills') === generateTerrain(...)`
    // check can't, since 'hills' is the default arg — it would compare hills to
    // itself).
    function reference(width: number, height: number, random: () => number): number[] {
      const ground = new Array<number>(width);
      const base = height * 0.65;
      const waves = [
        { amp: height * (0.08 + random() * 0.1), freq: 0.5 + random(), phase: random() * Math.PI * 2 },
        { amp: height * (0.04 + random() * 0.06), freq: 2 + random() * 2, phase: random() * Math.PI * 2 },
        { amp: height * (0.02 + random() * 0.03), freq: 5 + random() * 4, phase: random() * Math.PI * 2 }
      ];
      for (let x = 0; x < width; x++) {
        const tx = (x / width) * Math.PI * 2;
        let y = base;
        for (const wave of waves) y += wave.amp * Math.sin(tx * wave.freq + wave.phase);
        ground[x] = Math.min(height * 0.92, Math.max(height * 0.3, y));
      }
      return ground;
    }
    for (const seed of [1, 7, 42, 99]) {
      expect(generateTerrain(WIDTH, HEIGHT, seededRandom(seed), 'hills')).toEqual(
        reference(WIDTH, HEIGHT, seededRandom(seed))
      );
    }
  });

  it('draws the same nine-wave random sequence for every arena (reshape adds no draws)', () => {
    for (const arena of ARENAS) {
      let draws = 0;
      generateTerrain(WIDTH, HEIGHT, () => { draws++; return 0.5; }, arena);
      expect(draws, arena).toBe(9);
    }
  });

  it('keeps every arena within the field bounds', () => {
    for (const arena of ARENAS) {
      for (let seed = 0; seed < 30; seed++) {
        const ground = generateTerrain(WIDTH, HEIGHT, seededRandom(seed), arena);
        expect(ground).toHaveLength(WIDTH);
        for (const y of ground) {
          expect(y).toBeGreaterThanOrEqual(HEIGHT * 0.3);
          expect(y).toBeLessThanOrEqual(HEIGHT * 0.92);
        }
      }
    }
  });

  it('reshapes each non-hills arena into a distinct silhouette', () => {
    for (const arena of ['canyon', 'mesa', 'ridges'] as const) {
      const hills = generateTerrain(WIDTH, HEIGHT, seededRandom(3), 'hills');
      const shaped = generateTerrain(WIDTH, HEIGHT, seededRandom(3), arena);
      let differing = 0;
      for (let x = 0; x < WIDTH; x++) {
        if (Math.abs(shaped[x] - hills[x]) > 1) differing++;
      }
      // A real reshape moves a large fraction of the columns.
      expect(differing).toBeGreaterThan(WIDTH * 0.3);
    }
  });

  it('leaves every arena winnable: the CPU can land a shot on the far tank', () => {
    // newRound spawns tanks at 70 + random()*90 and WIDTH-70-random()*90, so the
    // real range runs from the widest separation (70 / WIDTH-70) to the closest
    // (160 / WIDTH-160). Test both extremes across every arena: if the CPU's
    // grid search finds a landing shot at both ends of the envelope, every spawn
    // in between is covered.
    const SPAWN_PAIRS = [
      [70, WIDTH - 70],
      [160, WIDTH - 160]
    ];
    for (const arena of ARENAS) {
      for (const [leftX, rightX] of SPAWN_PAIRS) {
        for (let seed = 0; seed < 24; seed++) {
          const ground = generateTerrain(WIDTH, HEIGHT, seededRandom(seed), arena);
          const left = { x: leftX, y: surfaceYAt(ground, leftX) };
          const right = { x: rightX, y: surfaceYAt(ground, rightX) };
          for (const [from, target] of [[left, right], [right, left]] as const) {
            // difficulty 1 => zero wobble, so this is the CPU's best grid shot.
            const shot = chooseAiShot(ground, WIDTH, HEIGHT, from, target, 0, 1, seededRandom(seed));
            const impact = simulateShot(ground, WIDTH, HEIGHT, from.x, from.y, shot.angle, shot.power, 0);
            expect(impact).toBeTruthy();
            const dist = Math.hypot(impact!.x - target.x, impact!.y - target.y);
            expect(dist).toBeLessThanOrEqual(80);
          }
        }
      }
    }
  });

  it('marks the bunker pillar solid and every other arena fully carveable', () => {
    const { x0, x1 } = bunkerColumns(WIDTH);
    const bunkerSolid = arenaSolid('bunker', WIDTH);
    expect(bunkerSolid).toHaveLength(WIDTH);
    for (let x = 0; x < WIDTH; x++) {
      expect(bunkerSolid[x], `col ${x}`).toBe(x >= x0 && x <= x1);
    }
    expect(bunkerSolid[0]).toBe(false);
    expect(bunkerSolid[WIDTH - 1]).toBe(false);
    for (const arena of ['hills', 'canyon', 'mesa', 'ridges'] as const) {
      expect(arenaSolid(arena, WIDTH).some(Boolean), arena).toBe(false);
    }
  });

  it('raises a flat tall pillar in the bunker arena, base terrain unchanged', () => {
    const { x0, x1 } = bunkerColumns(WIDTH);
    const hills = generateTerrain(WIDTH, HEIGHT, seededRandom(5), 'hills');
    const bunker = generateTerrain(WIDTH, HEIGHT, seededRandom(5), 'bunker');
    // Every pillar column is a flat top near the ceiling.
    for (let x = x0; x <= x1; x++) {
      expect(bunker[x], `pillar col ${x}`).toBeCloseTo(HEIGHT * 0.34, 5);
    }
    // The pillar top sits high (small y); the base outside it is untouched.
    expect(bunker[x0]).toBeLessThan(HEIGHT * 0.5);
    expect(bunker[0]).toBe(hills[0]);
    expect(bunker[x0 - 5]).toBe(hills[x0 - 5]);
    expect(bunker[x1 + 5]).toBe(hills[x1 + 5]);
  });

  it('never carves a solid column, only its carveable neighbours', () => {
    const width = 60;
    const ground = new Array<number>(width).fill(300);
    const solid = new Array<boolean>(width).fill(false);
    solid[30] = true; // one indestructible column
    const before = [...ground];
    carveCrater(ground, 450, 30, 300, 8, solid);
    // The solid column rides out a direct hit...
    expect(ground[30]).toBe(before[30]);
    // ...while its carveable neighbours inside the blast are dug down.
    expect(ground[28]).toBeGreaterThan(before[28]);
    expect(ground[32]).toBeGreaterThan(before[32]);
  });

  it('reports the bunker pillar as cover for the Skipper interlock', () => {
    // isSolidColumn is the load-bearing half of the bounce interlock: a skip is
    // denied on a solid column (the pillar) and allowed on open dirt.
    const solid = arenaSolid('bunker', WIDTH);
    const { x0, x1 } = bunkerColumns(WIDTH);
    const mid = Math.round((x0 + x1) / 2);
    expect(isSolidColumn(solid, mid, WIDTH)).toBe(true); // pillar stops the skip
    expect(isSolidColumn(solid, mid + 0.4, WIDTH)).toBe(true); // rounds into the pillar
    expect(isSolidColumn(solid, 40, WIDTH)).toBe(false); // open dirt, the shot skips
    // Out-of-range x clamps into the field rather than reading undefined.
    expect(isSolidColumn(solid, -10, WIDTH)).toBe(false);
    expect(isSolidColumn(solid, WIDTH + 50, WIDTH)).toBe(false);
    // Every open arena is cover-free everywhere.
    expect(isSolidColumn(arenaSolid('hills', WIDTH), 400, WIDTH)).toBe(false);
  });
});

describe('physics', () => {
  it('bounces a shell off the surface: reflects upward and bleeds speed', () => {
    const p = { x: 100, y: 305, vx: 40, vy: 60 }; // falling into the ground
    bounceOffSurface(p, 300, 0.6);
    expect(p.y).toBe(299); // lifted just clear of the surface
    expect(p.vy).toBeCloseTo(-36, 5); // -|60| * 0.6, now heading up
    expect(p.vx).toBeCloseTo(24, 5); // 40 * 0.6
    expect(p.vy).toBeLessThan(0);
  });

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

describe('scoring', () => {
  const PLAYER = 0;
  const FOE = 1;

  it('pays a point per hp of damage landed on the opponent', () => {
    const ledger = createScoreLedger();
    expect(ledger.damage(PLAYER, FOE, 37)).toBe(37);
    expect(ledger.total(PLAYER)).toBe(37);
    // Credited to the shooter, never to the tank that was hit.
    expect(ledger.total(FOE)).toBe(0);
  });

  it('pays a bonus for putting a shell on the enemy hull', () => {
    const ledger = createScoreLedger();
    expect(ledger.directHit(PLAYER, FOE, 100)).toBe(DIRECT_HIT_POINTS);
    expect(ledger.total(PLAYER)).toBe(DIRECT_HIT_POINTS);
  });

  it('pays nothing for shelling a wreck, however many shells land on it', () => {
    // Regression: the bonus was paid on any shell that detonated on a hull,
    // live or not, while the damage it carried was correctly worth nothing to
    // a tank already at zero. A MIRV's five warheads keep flying until the
    // last one lands, so a finishing kill collected four more bonuses off the
    // corpse — and that inflated total is what reached the world board.
    const ledger = createScoreLedger();
    expect(ledger.directHit(PLAYER, FOE, 6)).toBe(DIRECT_HIT_POINTS); // the kill
    expect(ledger.damage(PLAYER, FOE, 6)).toBe(6);
    for (let warhead = 0; warhead < 4; warhead++) {
      expect(ledger.directHit(PLAYER, FOE, 0)).toBe(0);
      expect(ledger.damage(PLAYER, FOE, 0)).toBe(0);
    }
    expect(ledger.total(PLAYER)).toBe(DIRECT_HIT_POINTS + 6);
  });

  it('pays the round winner a flat bonus, and nobody on a mutual kill', () => {
    const ledger = createScoreLedger();
    expect(ledger.roundWin(FOE)).toBe(ROUND_WIN_POINTS);
    expect(ledger.roundWin(null)).toBe(0);
    expect(ledger.total(FOE)).toBe(ROUND_WIN_POINTS);
    expect(ledger.total(PLAYER)).toBe(0);
  });

  it('pays nothing for self-damage or for a fall', () => {
    const ledger = createScoreLedger();
    // A shell that lands on the tank that fired it.
    expect(ledger.damage(PLAYER, PLAYER, 40)).toBe(0);
    expect(ledger.directHit(PLAYER, PLAYER, 100)).toBe(0);
    // A drop into a crater has no shooter at all.
    expect(ledger.damage(null, PLAYER, 30)).toBe(0);
    expect(ledger.damage(null, FOE, 30)).toBe(0);
    expect(ledger.total(PLAYER)).toBe(0);
    expect(ledger.total(FOE)).toBe(0);
  });

  it('never subtracts, whatever it is handed', () => {
    // The bug this scoring replaced showed the player a negative number for
    // most of a match. No award may ever move a total downwards.
    const ledger = createScoreLedger();
    ledger.damage(PLAYER, FOE, 50);
    const before = ledger.total(PLAYER);
    for (const bad of [-1, -100, 0, -0.4]) {
      expect(ledger.damage(PLAYER, FOE, bad)).toBe(0);
      expect(ledger.survivingArmour(PLAYER, bad)).toBe(0);
    }
    expect(ledger.total(PLAYER)).toBe(before);
    expect(ledger.total(PLAYER)).toBeGreaterThan(0);
  });

  it('folds surviving armour in once, clamping a destroyed tank to nothing', () => {
    const ledger = createScoreLedger();
    expect(ledger.survivingArmour(PLAYER, 64)).toBe(64);
    expect(ledger.survivingArmour(FOE, 0)).toBe(0);
    expect(ledger.total(PLAYER)).toBe(64);
    expect(ledger.total(FOE)).toBe(0);
  });

  it('clears both totals for a new match', () => {
    const ledger = createScoreLedger();
    ledger.damage(PLAYER, FOE, 20);
    ledger.roundWin(FOE);
    ledger.reset();
    expect(ledger.total(PLAYER)).toBe(0);
    expect(ledger.total(FOE)).toBe(0);
  });

  it('grows monotonically across a whole match, and submits what it displays', () => {
    // A full best-of-five played out shot by shot. The header shows
    // total(0) throughout and the match end submits total(0) — one number,
    // so the two cannot disagree.
    const ledger = createScoreLedger();
    let seen = 0;
    const play = () => {
      expect(ledger.total(PLAYER)).toBeGreaterThanOrEqual(seen);
      seen = ledger.total(PLAYER);
    };
    for (let round = 0; round < 5; round++) {
      for (let shot = 0; shot < 4; shot++) {
        ledger.directHit(PLAYER, FOE, 100);
        ledger.damage(PLAYER, FOE, 25);
        play();
        ledger.damage(FOE, PLAYER, 25); // the CPU shooting back
        play();
        ledger.damage(null, PLAYER, 12); // a fall into a crater
        play();
      }
      ledger.roundWin(round % 2 === 0 ? PLAYER : FOE);
      play();
    }
    ledger.survivingArmour(PLAYER, 40);
    play();
    // 5 rounds × 4 shots × (25 direct + 25 damage) + 3 round wins + armour.
    expect(ledger.total(PLAYER)).toBe(
      20 * (DIRECT_HIT_POINTS + 25) + 3 * ROUND_WIN_POINTS + 40
    );
    // The submitted number is exactly the displayed one.
    expect(ledger.total(PLAYER)).toBe(seen);
  });

  it('offers a vs-CPU match to the board and never a two-player one', () => {
    // Two humans on one keyboard can farm any total they like, so a 2P run
    // reaches neither the world board nor the personal best. Load-bearing.
    expect(submitsToBoard('cpu')).toBe(true);
    expect(submitsToBoard('2p')).toBe(false);
  });
});

describe('falling', () => {
  const DT = 1 / 60;

  function settle(body: FallBody, surface: number, maxSteps = 600): number {
    for (let i = 1; i <= maxSteps; i++) {
      stepFall(body, surface, DT);
      if (body.fallFrom === null && body.y === surface) return i;
    }
    return -1;
  }

  it('drops a body onto the surface and clears the fall state', () => {
    const body: FallBody = { y: 200, fallFrom: null, fallVy: 0 };
    expect(settle(body, 320)).toBeGreaterThan(0);
    expect(body.y).toBe(320);
    expect(body.fallVy).toBe(0);
  });

  it('reports the drop height on landing and nothing before', () => {
    const body: FallBody = { y: 250, fallFrom: null, fallVy: 0 };
    let drop: number | null = null;
    for (let i = 0; i < 600 && drop === null; i++) {
      drop = stepFall(body, 300, DT);
    }
    expect(drop).toBe(50);
  });

  it('always lands even when a step ends a hair above the surface', () => {
    // Regression: a shallow fall used to strand the body inside the last
    // half-pixel (falling threshold not met, landing test not met either),
    // leaving fallFrom set forever and freezing the turn state machine.
    for (let depth = 0.6; depth <= 40; depth += 0.7) {
      const body: FallBody = { y: 300 - depth, fallFrom: null, fallVy: 0 };
      expect(settle(body, 300)).toBeGreaterThan(0);
      expect(body.fallFrom).toBeNull();
      expect(body.y).toBe(300);
    }
  });

  it('keeps a fall in progress alive when the surface recedes mid-drop', () => {
    const body: FallBody = { y: 260, fallFrom: null, fallVy: 0 };
    stepFall(body, 280, DT);
    expect(body.fallFrom).toBe(260);
    // A crater deepens the ground below while the body is still airborne.
    expect(settle(body, 340)).toBeGreaterThan(0);
    expect(body.y).toBe(340);
  });

  it('snaps a grounded body down when the ground collapses by less than the threshold', () => {
    const body: FallBody = { y: 300, fallFrom: null, fallVy: 0 };
    stepFall(body, 300.4, DT);
    expect(body.y).toBe(300.4);
    expect(body.fallFrom).toBeNull();
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

  // The empirical proof behind the difficulty picker: a higher difficulty must
  // land measurably tighter shots. Same seeded noise sequence for every tier,
  // so the only variable is the (1 - difficulty) scatter scale — a fair test.
  function missDistances(difficulty: number, samples: number): number[] {
    const ground = new Array(WIDTH).fill(350);
    const from = { x: 650, y: 335 };
    const target = { x: 150, y: 350 };
    const random = seededRandom(123);
    const dists: number[] = [];
    for (let i = 0; i < samples; i++) {
      const shot = chooseAiShot(ground, WIDTH, HEIGHT, from, target, 0, difficulty, random);
      const impact = simulateShot(ground, WIDTH, HEIGHT, from.x, from.y, shot.angle, shot.power, 0);
      // A shot that sails off the field is the worst possible miss.
      dists.push(impact ? Math.abs(impact.x - target.x) : WIDTH);
    }
    return dists;
  }

  const mean = (xs: number[]) => xs.reduce((s, v) => s + v, 0) / xs.length;

  it('lands tighter shots at higher difficulty (the picker actually bites)', () => {
    const rookie = missDistances(DIFFICULTY_BASE.rookie, 50);
    const veteran = missDistances(DIFFICULTY_BASE.veteran, 50);
    // A veteran's average miss is smaller than a rookie's...
    expect(mean(veteran)).toBeLessThan(mean(rookie));
    // ...and its grouping is tighter (more shots land near the target).
    const near = (xs: number[]) => xs.filter(d => d < 30).length;
    expect(near(veteran)).toBeGreaterThan(near(rookie));
  });

  it('is a dead-eye at full accuracy', () => {
    expect(mean(missDistances(1, 30))).toBeLessThan(20);
  });
});

describe('cpuDifficulty ramp', () => {
  it('gunner opens at the retired fixed accuracy', () => {
    expect(cpuDifficulty('gunner', 0)).toBeCloseTo(DIFFICULTY_BASE.gunner);
  });

  it('tightens monotonically as rounds are decided', () => {
    expect(cpuDifficulty('rookie', 1)).toBeGreaterThan(cpuDifficulty('rookie', 0));
    expect(cpuDifficulty('rookie', 3)).toBeGreaterThan(cpuDifficulty('rookie', 1));
    expect(cpuDifficulty('gunner', 2)).toBeGreaterThan(cpuDifficulty('gunner', 0));
  });

  it('never exceeds a perfect 1', () => {
    expect(cpuDifficulty('veteran', 100)).toBe(1);
    expect(cpuDifficulty('rookie', 1000)).toBeLessThanOrEqual(1);
  });
});

describe('cpuPickWeapon', () => {
  it('spends a heavy on a high-armour target', () => {
    expect(cpuPickWeapon({ heavy: 2, mirv: 1 }, 300, 100, () => 0)).toBe('heavy');
  });

  it('lobs a MIRV at long range once the heavy branch passes', () => {
    // First roll (0.9) skips the heavy branch; second (0.1) takes the MIRV.
    let call = 0;
    const rnd = () => (call++ === 0 ? 0.9 : 0.1);
    expect(cpuPickWeapon({ heavy: 2, mirv: 1 }, 500, 100, rnd)).toBe('mirv');
  });

  it('does not waste a heavy on a nearly-dead, close target', () => {
    // hp 45 fails the >45 guard; range 200 fails the long-range MIRV guard.
    expect(cpuPickWeapon({ heavy: 2, mirv: 1 }, 200, 45, () => 0)).toBe('missile');
  });

  it('falls back to the unlimited missile with specials empty', () => {
    expect(cpuPickWeapon({ heavy: 0, mirv: 0 }, 500, 100, () => 0)).toBe('missile');
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

  it('stocks the Skipper as a scarce bouncing special', () => {
    expect(WEAPON_IDS).toContain('bounce');
    expect(freshAmmo().bounce).toBeGreaterThan(0);
    expect(WEAPONS.bounce.bounces).toBeGreaterThan(0);
    // Lighter than the plain missile, to pay for its reach.
    expect(WEAPONS.bounce.maxDamage).toBeLessThan(WEAPONS.missile.maxDamage);
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

describe('headless playthrough (seeded, deterministic)', () => {
  /**
   * A shot chooser: it sets the current tank's angle, power and shell, and the
   * harness pulls the trigger. `rng` is the policy's own stream, kept apart
   * from the match's so that two policies compared on one seed open on the
   * same terrain, spawns, wind and first turn.
   */
  type Gunner = (m: MatchState, rng: () => number) => void;

  /**
   * The competent player: the same grid search over the real ballistics the
   * CPU aims with, at near-perfect accuracy and on the unlimited missile. An
   * oracle rather than an optimum — it never reads the arena, never spends a
   * special and never lays up — which is what makes it a usable answer to
   * "can this cabinet be played at all".
   */
  const competent: Gunner = (m, rng) => {
    const me = m.tanks[m.current];
    const foe = m.tanks[m.current === 0 ? 1 : 0];
    const shot = chooseAiShot(
      m.ground,
      WIDTH,
      HEIGHT,
      { x: me.x, y: me.y - TANK_H },
      { x: foe.x, y: foe.y },
      m.wind,
      0.9,
      rng
    );
    me.angle = shot.angle;
    me.power = shot.power;
    me.weapon = 'missile';
  };

  /** One repeated input: the same lob every turn, wind and terrain be damned. */
  const oneNote: Gunner = m => {
    const me = m.tanks[m.current];
    me.angle = m.current === 0 ? 45 : 135;
    me.power = 60;
    me.weapon = 'missile';
  };

  /** A legal shot picked at random every turn. */
  const scattergun: Gunner = (m, rng) => {
    const me = m.tanks[m.current];
    me.angle = 5 + rng() * 170;
    me.power = 10 + rng() * 90;
    me.weapon = 'missile';
  };

  const DT = 1 / 60;
  /**
   * The runaway guard. A plain literal on purpose: derive it from
   * WINS_PER_MATCH, CPU_THINK_TIME or EXPLOSION_TIME and it moves whenever the
   * thing it is guarding moves, which is how a harness ends up unable to fail
   * (issue #260). At 1/60 s a tick this is a quarter of an hour of play,
   * against observed matches of a few thousand ticks.
   */
  const TICK_CAP = 50000;

  interface Played {
    match: MatchState;
    events: MatchEvent[];
    ticks: number;
    /** Whether a match end was actually reached, rather than the cap hit. */
    finished: boolean;
    /** What the cabinet would put on the board: player 0's running total. */
    score: number;
  }

  /**
   * Plays one seeded match to its end through the real match module, driving
   * every human turn from `gunner` and taking the Next Round button between
   * rounds exactly as a player does.
   */
  function playMatch(
    gunner: Gunner,
    options: { seed: number; difficulty?: Difficulty; arena?: ArenaType; mode?: TankMode }
  ): Played {
    const { seed, difficulty = 'gunner', arena = 'hills', mode = 'cpu' } = options;
    const events: MatchEvent[] = [];
    let finished = false;
    const m = createMatch({
      difficulty,
      arena,
      random: seededRandom(seed),
      onEvent: event => {
        events.push(event);
        if (event.type === 'roundOver' && event.matchOver) finished = true;
      }
    });
    // The policy's own stream, so its draws never perturb the match's.
    const rng = seededRandom(seed * 7919 + 1);
    resetMatch(m, mode);
    startRound(m);
    let ticks = 0;
    while (ticks < TICK_CAP && !finished) {
      if (m.phase === 'round-over') startRound(m);
      else if (isHumanTurn(m)) {
        gunner(m, rng);
        fire(m);
      }
      tickMatch(m, DT);
      ticks++;
    }
    return { match: m, events, ticks, finished, score: m.ledger.total(0) };
  }

  /** Every gold "+NN" the event stream floated over a given tank. */
  function awardsSeen(events: MatchEvent[], player: number): number {
    let total = 0;
    for (const event of events) {
      if (event.type === 'damage' && event.shooter === player) total += event.points;
      else if (event.type === 'directHit' && event.shooter === player) total += event.points;
      else if (event.type === 'roundOver') {
        for (const award of event.awards) if (award.player === player) total += award.points;
      }
    }
    return total;
  }

  it('plays a vs-CPU match through to a result and submits what the player watched land', () => {
    const played = playMatch(competent, { seed: 7 });

    // The match ended on its own, and the guard that knows nothing about it was
    // never in the running: a match is a few thousand ticks, not the quarter of
    // an hour the cap allows, so the cap stays a backstop rather than becoming
    // the thing that ends a run.
    expect(played.finished).toBe(true);
    expect(played.ticks, `${played.ticks} ticks`).toBeLessThan(TICK_CAP / 2);

    // A best-of-five ends the moment somebody reaches three, once.
    const finals = played.events.filter(e => e.type === 'roundOver' && e.matchOver);
    expect(finals).toHaveLength(1);
    expect(Math.max(...played.match.wins)).toBe(WINS_PER_MATCH);
    expect(played.match.phase).toBe('round-over');

    // The number the overlay shows and submits is the running total, and that
    // total is exactly the gains that floated over the player's own tank —
    // re-derived from the event stream the cabinet renders, not read off the
    // ledger a second time.
    expect(played.score).toBe(awardsSeen(played.events, 0));
    expect(played.score).toBeGreaterThan(0);
    // And it is a vs-CPU run, so it reaches the shared board.
    expect(submitsToBoard(played.match.mode)).toBe(true);
  });

  it('leaves every arena playable: a competent gunner finishes and scores on all five', () => {
    const arenas: ArenaType[] = ['hills', 'canyon', 'mesa', 'ridges', 'bunker'];
    for (const arena of arenas) {
      const played = playMatch(competent, { seed: 31, arena });
      expect(played.finished, `${arena} never resolved`).toBe(true);
      expect(played.score, `${arena} scored nothing`).toBeGreaterThan(0);
      expect(played.score).toBe(awardsSeen(played.events, 0));
    }
  });

  it('finishes and puts a number on the board at every difficulty tier', () => {
    const tiers: Difficulty[] = ['rookie', 'gunner', 'veteran'];
    for (const difficulty of tiers) {
      const played = playMatch(competent, { seed: 91, difficulty });
      expect(played.finished, `${difficulty} never resolved`).toBe(true);
      expect(played.score, `${difficulty} scored nothing`).toBeGreaterThan(0);
    }
  });

  /**
   * The competent control plays the same seeds in both comparisons below, so
   * its half of each pairing is played once and remembered — the same saving
   * the football harness makes, and worth making here because a competent
   * match is the expensive one (both sides run the full shot search).
   */
  const controlScores = new Map<number, number>();
  function controlScore(seed: number): number {
    const seen = controlScores.get(seed);
    if (seen !== undefined) return seen;
    const score = playMatch(competent, { seed }).score;
    controlScores.set(seed, score);
    return score;
  }

  /**
   * A paired common-random-numbers comparison against the competent control:
   * both play the same seed, so the terrain, the spawns, the opening wind and
   * who shoots first are shared and only the shooting differs. `meanT` is
   * borrowed from the football harness rather than copied, because two
   * implementations of the statistic is how two suites end up disagreeing
   * about whether an effect is real.
   */
  function pairedAgainstCompetent(
    challenger: Gunner,
    n: number,
    seed0 = 5
  ): { mean: number; t: number } {
    const diffs: number[] = [];
    for (let i = 0; i < n; i++) {
      const seed = seed0 + i * 7919;
      diffs.push(controlScore(seed) - playMatch(challenger, { seed }).score);
    }
    return meanT(diffs);
  }

  it('out-scores a one-note gunner, on matched seeds with a reported t', () => {
    const paired = pairedAgainstCompetent(oneNote, 12);
    const line = `competent - oneNote: ${paired.mean.toFixed(1)} points (t=${paired.t.toFixed(2)})`;
    expect(paired.mean, line).toBeGreaterThan(0);
    expect(paired.t, line).toBeGreaterThan(2);
  });

  it('out-scores a random gunner, on matched seeds with a reported t', () => {
    const paired = pairedAgainstCompetent(scattergun, 12);
    const line = `competent - scattergun: ${paired.mean.toFixed(1)} points (t=${paired.t.toFixed(2)})`;
    expect(paired.mean, line).toBeGreaterThan(0);
    expect(paired.t, line).toBeGreaterThan(2);
  });

  it('scores a two-player match the same way and still keeps it off the board', () => {
    const played = playMatch(competent, { seed: 7, mode: '2p' });
    expect(played.finished).toBe(true);
    // Both tanks are driven from the one keyboard, so both totals grow...
    expect(played.match.ledger.total(0)).toBeGreaterThan(0);
    expect(played.match.ledger.total(1)).toBeGreaterThan(0);
    expect(played.match.ledger.total(0)).toBe(awardsSeen(played.events, 0));
    expect(played.match.ledger.total(1)).toBe(awardsSeen(played.events, 1));
    // ...and neither reaches the shared board. Load-bearing: do not widen.
    expect(submitsToBoard(played.match.mode)).toBe(false);
  });

  it('replays a seed exactly, and a different seed differently', () => {
    const a = playMatch(competent, { seed: 404 });
    const b = playMatch(competent, { seed: 404 });
    const c = playMatch(competent, { seed: 405 });
    expect(b.score).toBe(a.score);
    expect(b.ticks).toBe(a.ticks);
    expect([c.score, c.ticks]).not.toEqual([a.score, a.ticks]);
  });
});
