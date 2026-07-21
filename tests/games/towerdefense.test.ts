import { describe, it, expect } from 'vitest';
import {
  GRID_W,
  GRID_H,
  idx,
  BUILD_REACH,
  createTdMap,
  routePosition
} from '../../src/games/towerdefense/path';
import {
  ENEMIES,
  SLOW_FACTOR,
  spawnEnemy,
  stepEnemies,
  type Enemy,
  type EnemyKind
} from '../../src/games/towerdefense/enemies';
import {
  TOWERS,
  TOWER_KINDS,
  MAX_LEVEL,
  createTower,
  upgradeCost,
  towerRange,
  towerDamage,
  towerCooldown,
  enemyTile,
  acquireTarget,
  stepTowers,
  type Tower,
  type TowerKind
} from '../../src/games/towerdefense/towers';
import {
  WAVES,
  AUTHORED_WAVES,
  endlessWave,
  waveDef,
  hpScale,
  createSpawner,
  stepSpawner,
  spawnerDone,
  type WaveEntry
} from '../../src/games/towerdefense/waves';
import {
  START_MONEY,
  START_LIVES,
  WAVE_BASE,
  INTEREST_CAP,
  createEconomy,
  spend,
  awardKill,
  leak,
  clearWave,
  score
} from '../../src/games/towerdefense/economy';
import { chebyshev } from '../../src/games/engine/grid2d';

const map = createTdMap();

describe('map & route', () => {
  it('runs from the spawn to the goal without repeats', () => {
    expect(map.route[0]).toBe(map.spawn);
    expect(map.route[map.route.length - 1]).toBe(map.goal);
    expect(new Set(map.route).size).toBe(map.route.length);
  });

  it('is contiguous: every step moves to a 4-neighbour', () => {
    for (let i = 1; i < map.route.length; i++) {
      const a = map.route[i - 1];
      const b = map.route[i];
      const dx = Math.abs((a % GRID_W) - (b % GRID_W));
      const dy = Math.abs(Math.floor(a / GRID_W) - Math.floor(b / GRID_W));
      expect(dx + dy).toBe(1);
    }
  });

  it('agrees with the BFS distance field: every step walks downhill to the goal', () => {
    expect(map.dist[map.spawn]).toBe(map.route.length - 1);
    expect(map.dist[map.goal]).toBe(0);
    for (let i = 1; i < map.route.length; i++) {
      expect(map.dist[map.route[i]]).toBe(map.dist[map.route[i - 1]] - 1);
    }
  });

  it('marks buildable ground beside the path, never on it', () => {
    let count = 0;
    for (let i = 0; i < map.buildable.length; i++) {
      if (!map.buildable[i]) continue;
      count++;
      expect(map.path[i]).toBe(false);
      const near = map.route.some(p => chebyshev(i, p, GRID_W) <= BUILD_REACH);
      expect(near).toBe(true);
    }
    // A meaningful defence needs room: the shelf must cover a good slice of the board.
    expect(count).toBeGreaterThan(60);
  });

  it('stays inside the grid', () => {
    for (const i of map.route) {
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(GRID_W * GRID_H);
    }
  });

  it('interpolates positions along the route and clamps at both ends', () => {
    const start = routePosition(map.route, 0);
    expect(start).toEqual({
      x: (map.spawn % GRID_W) + 0.5,
      y: Math.floor(map.spawn / GRID_W) + 0.5
    });
    const mid = routePosition(map.route, 0.5);
    expect(mid.x).toBeCloseTo(start.x + 0.5); // first leg heads east
    expect(mid.y).toBeCloseTo(start.y);
    const past = routePosition(map.route, map.route.length + 5);
    expect(past).toEqual({
      x: (map.goal % GRID_W) + 0.5,
      y: Math.floor(map.goal / GRID_W) + 0.5
    });
  });
});

describe('enemies', () => {
  it('spawns with scaled hp', () => {
    const scout = spawnEnemy('scout', 1.5);
    expect(scout.hp).toBe(Math.round(ENEMIES.scout.hp * 1.5));
    expect(scout.maxHp).toBe(scout.hp);
    expect(scout.alive).toBe(true);
    expect(scout.progress).toBe(0);
  });

  it('marches at its speed', () => {
    const brute = spawnEnemy('brute', 1);
    stepEnemies([brute], map.route.length, 2);
    expect(brute.progress).toBeCloseTo(ENEMIES.brute.speed * 2);
  });

  it('crawls at SLOW_FACTOR while chilled, then thaws', () => {
    const scout = spawnEnemy('scout', 1);
    scout.slow = 0.5;
    stepEnemies([scout], map.route.length, 0.5);
    expect(scout.progress).toBeCloseTo(ENEMIES.scout.speed * 0.5 * SLOW_FACTOR);
    stepEnemies([scout], map.route.length, 0.5);
    expect(scout.progress).toBeCloseTo(ENEMIES.scout.speed * 0.5 * (SLOW_FACTOR + 1));
  });

  it('leaks when it reaches the goal, at its lives price', () => {
    const warlord = spawnEnemy('warlord', 1);
    warlord.progress = map.route.length - 1.05;
    const leaks = stepEnemies([warlord], map.route.length, 1);
    expect(leaks).toEqual([{ kind: 'warlord', livesCost: ENEMIES.warlord.livesCost }]);
    expect(warlord.alive).toBe(false);
  });
});

describe('towers', () => {
  const towerTile = idx(10, 4); // beside both east-west runs of the path

  function enemyAt(progress: number, kind: EnemyKind = 'scout'): Enemy {
    const enemy = spawnEnemy(kind, 1);
    enemy.progress = progress;
    return enemy;
  }

  it('defines a sane catalogue for every kind', () => {
    expect(TOWER_KINDS).toHaveLength(3);
    for (const kind of TOWER_KINDS) {
      const def = TOWERS[kind];
      expect(def.cost).toBeGreaterThan(0);
      expect(def.range).toBeGreaterThan(0);
      expect(def.damage).toBeGreaterThan(0);
      expect(def.cooldown).toBeGreaterThan(0);
    }
  });

  it('targets the in-range enemy with the highest path progress', () => {
    const tower = createTower('bolt', towerTile);
    const near = enemyAt(9); // tile (9, 2): in range
    const nearer = enemyAt(11); // tile (11, 2): in range, further along
    const far = enemyAt(45); // down on the last straight: out of range
    expect(chebyshev(towerTile, enemyTile(map.route, far), GRID_W)).toBeGreaterThan(
      towerRange(tower)
    );
    expect(acquireTarget(tower, [near, nearer, far], map.route)).toBe(nearer);
  });

  it('ignores dead enemies', () => {
    const tower = createTower('bolt', towerTile);
    const dead = enemyAt(10);
    dead.alive = false;
    expect(acquireTarget(tower, [dead], map.route)).toBeNull();
  });

  it('fires on cooldown: one shot, then silence until it recharges', () => {
    const tower = createTower('bolt', towerTile);
    const tank = enemyAt(10, 'brute');
    const first = stepTowers([tower], [tank], map.route, 1 / 60);
    expect(first.some(e => e.type === 'shot')).toBe(true);
    const second = stepTowers([tower], [tank], map.route, 1 / 60);
    expect(second).toEqual([]);
    // After the full cooldown it speaks again.
    const third = stepTowers([tower], [tank], map.route, towerCooldown(tower));
    expect(third.some(e => e.type === 'shot')).toBe(true);
  });

  it('respects armour but always lands at least 1 damage', () => {
    const tower = createTower('frost', towerTile);
    const brute = enemyAt(10, 'brute');
    stepTowers([tower], [brute], map.route, 1 / 60);
    expect(brute.hp).toBe(
      brute.maxHp - Math.max(1, towerDamage(tower) - ENEMIES.brute.armour)
    );
  });

  it('chills its target', () => {
    const tower = createTower('frost', towerTile);
    const scout = enemyAt(10);
    stepTowers([tower], [scout], map.route, 1 / 60);
    expect(scout.slow).toBeCloseTo(TOWERS.frost.slow);
  });

  it('splashes neighbours but leaves distant marchers alone', () => {
    const tower = createTower('blast', towerTile);
    const target = enemyAt(11, 'brute');
    const close = enemyAt(10.5, 'brute');
    const distant = enemyAt(14, 'brute');
    stepTowers([tower], [target, close, distant], map.route, 1 / 60);
    expect(target.hp).toBeLessThan(target.maxHp);
    expect(close.hp).toBeLessThan(close.maxHp);
    expect(distant.hp).toBe(distant.maxHp);
  });

  it('pays a bounty on the kill', () => {
    const tower = createTower('bolt', towerTile);
    const scout = enemyAt(10);
    scout.hp = 1;
    const events = stepTowers([tower], [scout], map.route, 1 / 60);
    const kill = events.find(e => e.type === 'kill');
    expect(kill).toMatchObject({ kind: 'scout', bounty: ENEMIES.scout.bounty });
    expect(scout.alive).toBe(false);
  });

  it('upgrades cost more per level and cap at MAX_LEVEL with a range bonus', () => {
    const tower = createTower('bolt', towerTile);
    const baseRange = towerRange(tower);
    const baseDamage = towerDamage(tower);
    const cost1 = upgradeCost(tower)!;
    tower.level = 2;
    const cost2 = upgradeCost(tower)!;
    expect(cost2).toBeGreaterThan(cost1);
    expect(towerDamage(tower)).toBeGreaterThan(baseDamage);
    tower.level = MAX_LEVEL;
    expect(upgradeCost(tower)).toBeNull();
    expect(towerRange(tower)).toBe(baseRange + 1);
    expect(towerCooldown(tower)).toBeLessThan(TOWERS.bolt.cooldown);
  });
});

/** Sum of raw enemy hp a wave throws (before the per-wave hpScale). */
function waveHp(wave: WaveEntry[]): number {
  return wave.reduce((sum, e) => sum + e.count * ENEMIES[e.kind].hp, 0);
}

describe('waves', () => {
  it('ships the authored campaign, every entry sane', () => {
    expect(WAVES).toHaveLength(AUTHORED_WAVES);
    expect(AUTHORED_WAVES).toBe(18);
    for (const wave of WAVES) {
      expect(wave.length).toBeGreaterThan(0);
      for (const entry of wave) {
        expect(ENEMIES[entry.kind]).toBeDefined();
        expect(entry.count).toBeGreaterThan(0);
        expect(entry.gap).toBeGreaterThan(0);
      }
    }
    // The warlord arrives before the finale now, and the last wave fields two.
    expect(WAVES.slice(0, AUTHORED_WAVES - 1).some(w => w.some(e => e.kind === 'warlord'))).toBe(true);
    const finale = WAVES[AUTHORED_WAVES - 1];
    expect(finale.filter(e => e.kind === 'warlord').reduce((n, e) => n + e.count, 0)).toBe(2);
  });

  it('scales enemy hp up wave over wave', () => {
    for (let w = 1; w < WAVES.length; w++) {
      expect(hpScale(w)).toBeGreaterThan(hpScale(w - 1));
    }
    expect(hpScale(0)).toBe(1);
  });

  describe('endless assault', () => {
    it('waveDef serves authored waves in range and endless waves past it', () => {
      expect(waveDef(0)).toBe(WAVES[0]);
      expect(waveDef(AUTHORED_WAVES - 1)).toBe(WAVES[AUTHORED_WAVES - 1]);
      expect(waveDef(AUTHORED_WAVES)).toEqual(endlessWave(AUTHORED_WAVES));
    });

    it('never returns undefined for a stray negative or non-finite index', () => {
      // The primary accessor normalises bad input rather than handing back
      // undefined (which would crash createSpawner downstream).
      expect(waveDef(-5)).toBe(WAVES[0]);
      expect(waveDef(NaN)).toBe(WAVES[0]);
      // endlessWave clamps too, so an in-campaign index can't go negative.
      expect(endlessWave(0)).toEqual(endlessWave(AUTHORED_WAVES));
    });

    it('is deterministic and always sane', () => {
      for (let w = AUTHORED_WAVES; w < AUTHORED_WAVES + 30; w++) {
        const a = endlessWave(w);
        const b = endlessWave(w);
        expect(a).toEqual(b);
        expect(a.length).toBeGreaterThan(0);
        for (const entry of a) {
          expect(ENEMIES[entry.kind]).toBeDefined();
          expect(entry.count).toBeGreaterThan(0);
          expect(entry.gap).toBeGreaterThan(0);
        }
      }
    });

    it('escalates: each composition grows harder three waves on, and hp keeps scaling', () => {
      // Same rotating composition recurs every 3 waves; its raw hp (and the
      // per-wave hpScale multiplying it) both climb, so the effective threat
      // strictly rises.
      for (let w = AUTHORED_WAVES; w < AUTHORED_WAVES + 12; w++) {
        expect(waveHp(endlessWave(w + 3))).toBeGreaterThan(waveHp(endlessWave(w)));
        expect(hpScale(w + 3)).toBeGreaterThan(hpScale(w));
      }
    });

    it('sends more warlords the deeper it runs', () => {
      const warlords = (w: number) =>
        endlessWave(w).filter(e => e.kind === 'warlord').reduce((n, e) => n + e.count, 0);
      // Compare the same rotating composition (both +2 and +32 are the
      // warlord-led variant) 30 waves apart: the tally climbs.
      expect(warlords(AUTHORED_WAVES + 32)).toBeGreaterThan(warlords(AUTHORED_WAVES + 2));
    });
  });

  it('spawns exactly the scripted count, spaced by the gap', () => {
    const wave = [{ kind: 'scout' as EnemyKind, count: 3, gap: 1 }];
    const spawner = createSpawner(wave);
    const spawned: EnemyKind[] = [];
    for (let t = 0; t < 60; t++) {
      spawned.push(...stepSpawner(spawner, wave, 0.1));
    }
    expect(spawned).toEqual(['scout', 'scout', 'scout']);
    expect(spawnerDone(spawner, wave)).toBe(true);
  });

  it('honours a later entry’s opening pause', () => {
    const wave = [
      { kind: 'scout' as EnemyKind, count: 1, gap: 0.5 },
      { kind: 'brute' as EnemyKind, count: 1, gap: 1, pause: 2 }
    ];
    const spawner = createSpawner(wave);
    expect(stepSpawner(spawner, wave, 0.01)).toEqual(['scout']);
    // gap (0.5) + pause (2) must elapse before the brute appears.
    expect(stepSpawner(spawner, wave, 2)).toEqual([]);
    expect(stepSpawner(spawner, wave, 1)).toEqual(['brute']);
  });
});

describe('economy', () => {
  it('starts with the stake and full lives', () => {
    const eco = createEconomy();
    expect(eco.money).toBe(START_MONEY);
    expect(eco.lives).toBe(START_LIVES);
    expect(score(eco)).toBe(0);
  });

  it('refuses an overdraft and spends exactly otherwise', () => {
    const eco = createEconomy();
    expect(spend(eco, START_MONEY + 1)).toBe(false);
    expect(eco.money).toBe(START_MONEY);
    expect(spend(eco, 70)).toBe(true);
    expect(eco.money).toBe(START_MONEY - 70);
  });

  it('banks kills as money and score alike', () => {
    const eco = createEconomy();
    awardKill(eco, 16);
    expect(eco.money).toBe(START_MONEY + 16);
    expect(score(eco)).toBe(16);
  });

  it('floors lives at zero', () => {
    const eco = createEconomy();
    eco.lives = 3;
    expect(leak(eco, 5)).toBe(0);
  });

  it('pays capped interest per cleared wave and scores the wave base', () => {
    const eco = createEconomy();
    eco.money = 90;
    expect(clearWave(eco)).toBe(9);
    expect(eco.money).toBe(99);
    expect(score(eco)).toBe(WAVE_BASE + 0);
    eco.money = 10000;
    expect(clearWave(eco)).toBe(INTEREST_CAP);
  });
});

/**
 * Headless playthrough harness: steps spawner, enemies, towers, and economy
 * exactly as game.ts does per 60Hz tick — the same composition, minus the
 * canvas. Mirrors Critter Rescue's solvability playthroughs.
 */
interface BuildStep {
  kind: TowerKind;
  x: number;
  y: number;
  /** Upgrade an existing tower at (x, y) instead of placing. */
  upgrade?: boolean;
}

function playRun(plan: BuildStep[], maxWave: number = AUTHORED_WAVES) {
  const world = createTdMap();
  const eco = createEconomy();
  const towers: Tower[] = [];
  const dt = 1 / 60;
  let next = 0;

  const buy = () => {
    while (next < plan.length) {
      const step = plan[next];
      const tile = idx(step.x, step.y);
      if (step.upgrade) {
        const tower = towers.find(t => t.tile === tile);
        if (!tower) throw new Error(`no tower to upgrade at ${step.x},${step.y}`);
        const cost = upgradeCost(tower);
        if (cost === null) throw new Error(`tower at ${step.x},${step.y} already maxed`);
        if (!spend(eco, cost)) return;
        tower.level++;
      } else {
        if (!world.buildable[tile]) throw new Error(`not buildable: ${step.x},${step.y}`);
        if (towers.some(t => t.tile === tile)) throw new Error(`occupied: ${step.x},${step.y}`);
        if (!spend(eco, TOWERS[step.kind].cost)) return;
        towers.push(createTower(step.kind, tile));
      }
      next++;
    }
  };

  for (let waveIdx = 0; waveIdx < maxWave; waveIdx++) {
    buy();
    const wave = waveDef(waveIdx);
    const spawner = createSpawner(wave);
    let enemies: Enemy[] = [];
    for (let guard = 0; ; guard++) {
      if (guard > 60 * 600) throw new Error(`wave ${waveIdx + 1} never ended`);
      for (const kind of stepSpawner(spawner, wave, dt)) {
        enemies.push(spawnEnemy(kind, hpScale(waveIdx)));
      }
      for (const leaked of stepEnemies(enemies, world.route.length, dt)) {
        leak(eco, leaked.livesCost);
      }
      for (const event of stepTowers(towers, enemies, world.route, dt)) {
        if (event.type === 'kill') awardKill(eco, event.bounty);
      }
      if (eco.lives <= 0) return { survived: false, eco, waveIdx };
      if (enemies.length > 64) enemies = enemies.filter(e => e.alive);
      if (spawnerDone(spawner, wave) && enemies.every(e => !e.alive)) break;
    }
    clearWave(eco);
    buy();
  }
  return { survived: true, eco, waveIdx: maxWave };
}

describe('headless playthrough', () => {
  it('an undefended line is overrun early', () => {
    const result = playRun([]);
    expect(result.survived).toBe(false);
    expect(result.waveIdx).toBeLessThan(4);
  });

  // The kill corridors: bolts on the ridges between the path's straights
  // (y=4 covers the top two passes, y=8 the bottom two) with blasts for the
  // packs and frost to hobble the warlords; the exit approach on the long
  // final straight gets its own guns. This layout is the completability proof
  // for the whole 18-wave campaign — kept dense enough to also push into the
  // endless assault. Ordered cheapest-essential-first, since the buyer stalls
  // on the first step it can't afford and resumes at the next wave boundary.
  const CAMPAIGN_PLAN: BuildStep[] = [
    { kind: 'bolt', x: 10, y: 4 },
    { kind: 'bolt', x: 10, y: 8 },
    { kind: 'bolt', x: 13, y: 4 },
    { kind: 'bolt', x: 13, y: 8 },
    { kind: 'bolt', x: 7, y: 4 },
    { kind: 'bolt', x: 7, y: 8 },
    { kind: 'bolt', x: 10, y: 4, upgrade: true },
    { kind: 'bolt', x: 10, y: 8, upgrade: true },
    { kind: 'blast', x: 12, y: 4 },
    { kind: 'blast', x: 12, y: 8 },
    { kind: 'bolt', x: 16, y: 8 },
    { kind: 'bolt', x: 13, y: 4, upgrade: true },
    { kind: 'bolt', x: 13, y: 8, upgrade: true },
    { kind: 'bolt', x: 10, y: 4, upgrade: true },
    { kind: 'bolt', x: 10, y: 8, upgrade: true },
    { kind: 'frost', x: 15, y: 4 },
    { kind: 'frost', x: 15, y: 8 },
    { kind: 'blast', x: 12, y: 4, upgrade: true },
    { kind: 'blast', x: 12, y: 8, upgrade: true },
    { kind: 'bolt', x: 7, y: 4, upgrade: true },
    { kind: 'bolt', x: 7, y: 8, upgrade: true },
    { kind: 'bolt', x: 13, y: 4, upgrade: true },
    { kind: 'bolt', x: 13, y: 8, upgrade: true },
    { kind: 'bolt', x: 19, y: 8 },
    { kind: 'bolt', x: 21, y: 8 },
    { kind: 'bolt', x: 16, y: 8, upgrade: true },
    { kind: 'bolt', x: 16, y: 8, upgrade: true },
    { kind: 'blast', x: 12, y: 4, upgrade: true },
    { kind: 'blast', x: 12, y: 8, upgrade: true },
    { kind: 'bolt', x: 7, y: 4, upgrade: true },
    { kind: 'bolt', x: 7, y: 8, upgrade: true },
    { kind: 'bolt', x: 19, y: 8, upgrade: true },
    { kind: 'bolt', x: 21, y: 8, upgrade: true },
    { kind: 'bolt', x: 19, y: 8, upgrade: true },
    { kind: 'bolt', x: 21, y: 8, upgrade: true },
    { kind: 'blast', x: 9, y: 4 },
    { kind: 'blast', x: 9, y: 8 },
    { kind: 'blast', x: 9, y: 4, upgrade: true },
    { kind: 'blast', x: 9, y: 8, upgrade: true },
    { kind: 'blast', x: 9, y: 4, upgrade: true },
    { kind: 'blast', x: 9, y: 8, upgrade: true }
  ];

  it('survives all 18 authored waves with a known layout', () => {
    const result = playRun(CAMPAIGN_PLAN);
    expect(result.survived).toBe(true);
    expect(result.eco.wavesCleared).toBe(AUTHORED_WAVES);
    // The score follows the design formula: waves × base + kill bounties.
    expect(score(result.eco)).toBe(AUTHORED_WAVES * WAVE_BASE + result.eco.killScore);
    expect(result.eco.killScore).toBeGreaterThan(0);
  });

  it('holds into the endless assault past the campaign', () => {
    // The same layout keeps holding a few waves past the authored roster,
    // proving the endless handoff spawns real (beatable) waves.
    const result = playRun(CAMPAIGN_PLAN, AUTHORED_WAVES + 3);
    expect(result.survived).toBe(true);
    expect(result.eco.wavesCleared).toBe(AUTHORED_WAVES + 3);
  });

  it('a thin defence clears the opening waves but falls to the late script', () => {
    const result = playRun([{ kind: 'bolt', x: 10, y: 4 }]);
    expect(result.survived).toBe(false);
    expect(result.waveIdx).toBeGreaterThan(1);
  });
});
