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
  SPAWN_JITTER,
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
import { seededRng } from '../../src/games/engine/math';

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
    // The warlord arrives before the finale now, and the last wave fields a
    // quartet — sized so even a maxed corridor cannot blank it (see the
    // no-perfect-runs playthrough proofs below).
    expect(WAVES.slice(0, AUTHORED_WAVES - 1).some(w => w.some(e => e.kind === 'warlord'))).toBe(true);
    const finale = WAVES[AUTHORED_WAVES - 1];
    expect(finale.filter(e => e.kind === 'warlord').reduce((n, e) => n + e.count, 0)).toBe(4);
  });

  it('scales enemy hp up wave over wave, ramping harder past the teaching arc', () => {
    for (let w = 1; w < WAVES.length; w++) {
      expect(hpScale(w)).toBeGreaterThan(hpScale(w - 1));
    }
    expect(hpScale(0)).toBe(1);
    // Identical to the old linear curve through wave 9 (the teaching arc keeps
    // its feel), then the quadratic term takes over.
    for (let w = 0; w <= 8; w++) expect(hpScale(w)).toBeCloseTo(1 + w * 0.14);
    expect(hpScale(17)).toBeGreaterThan(1 + 17 * 0.14 + 2);
    // Still steepening in the endless tail.
    expect(hpScale(30) - hpScale(29)).toBeGreaterThan(hpScale(20) - hpScale(19));
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

  it('pays capped interest per finished wave and scores the wave base', () => {
    const eco = createEconomy();
    eco.money = 90;
    expect(clearWave(eco)).toEqual({ held: true, interest: 9 });
    expect(eco.money).toBe(99);
    expect(score(eco)).toBe(WAVE_BASE + 0);
    eco.money = 10000;
    expect(clearWave(eco).interest).toBe(INTEREST_CAP);
  });

  it('scores nothing for a leaked wave, but still pays its interest', () => {
    // Issue #254 was a scoring bug, so only the score is withheld: the wave
    // pays its interest as before, or one slip would also cost the tower that
    // stops the next wave.
    const eco = createEconomy();
    eco.money = 90;
    leak(eco, 1);
    expect(clearWave(eco)).toEqual({ held: false, interest: 9 });
    expect(eco.money).toBe(99);
    expect(eco.wavesCleared).toBe(1);
    expect(eco.wavesHeld).toBe(0);
    expect(score(eco)).toBe(0);
  });

  it('taints only the wave a leak happened in — the next starts clean', () => {
    // clearWave is the sole reset of the leak count, and this is what pins
    // that: move the reset anywhere run-scoped (createEconomy) and a single
    // wave-1 leak latches every later wave to unheld, silently costing a
    // strong run hundreds of points.
    const eco = createEconomy();
    leak(eco, 1);
    expect(clearWave(eco).held).toBe(false);
    expect(clearWave(eco).held).toBe(true);
    expect(clearWave(eco).held).toBe(true);
    expect(eco.wavesCleared).toBe(3);
    expect(eco.wavesHeld).toBe(2);
    expect(score(eco)).toBe(2 * WAVE_BASE);
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
  /**
   * Earliest wave index this step may be bought at — a player who builds
   * later rather than one who cannot afford to. Like affordability, it stalls
   * the buyer rather than skipping the step.
   */
  notBefore?: number;
}

function playRun(plan: BuildStep[], maxWave: number = AUTHORED_WAVES, seed?: number) {
  // One stream for the whole run, exactly as game.ts opens it. Left undefined
  // the spawner is bit-for-bit the old one, which is what keeps every
  // difficulty proof below measuring a layout rather than a seed.
  const runRng = seed === undefined ? undefined : seededRng(seed);
  const world = createTdMap();
  const eco = createEconomy();
  const towers: Tower[] = [];
  const dt = 1 / 60;
  let next = 0;
  let waveIdx = 0;
  /** Whether each finished wave was held, in order — the leak count's ledger. */
  const heldByWave: boolean[] = [];

  const buy = () => {
    while (next < plan.length) {
      const step = plan[next];
      if (step.notBefore !== undefined && waveIdx < step.notBefore) return;
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

  for (waveIdx = 0; waveIdx < maxWave; waveIdx++) {
    buy();
    const wave = waveDef(waveIdx);
    const spawner = createSpawner(wave, runRng);
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
      if (eco.lives <= 0) return { survived: false, eco, waveIdx, heldByWave };
      if (enemies.length > 64) enemies = enemies.filter(e => e.alive);
      if (spawnerDone(spawner, wave) && enemies.every(e => !e.alive)) break;
    }
    heldByWave.push(clearWave(eco).held);
    buy();
  }
  return { survived: true, eco, waveIdx: maxWave, heldByWave };
}

/**
 * Every spawn in a wave, as (tick, kind), played out at the game's own dt.
 * `rng` absent is the unseeded spawner.
 */
function spawnLog(wave: WaveEntry[], rng?: () => number): { tick: number; kind: EnemyKind }[] {
  const spawner = createSpawner(wave, rng);
  const out: { tick: number; kind: EnemyKind }[] = [];
  for (let tick = 0; tick < 60 * 600 && !spawnerDone(spawner, wave); tick++) {
    for (const kind of stepSpawner(spawner, wave, 1 / 60)) out.push({ tick, kind });
  }
  return out;
}

describe('a run has a seed (#264)', () => {
  // The cabinet had no RNG in its rules at all: `Math.random` appeared once and
  // only for a shot's visual zigzag, so a replay was the same run and the board
  // rewarded knowing the twelve best tiles rather than playing well. A seed now
  // varies *when* a wave's marchers arrive. What it must not vary is anything
  // the score is made of, or two players' boards stop being comparable.

  const finale = waveDef(AUTHORED_WAVES - 1);

  it('changes when the marchers arrive and never what arrives', () => {
    const plain = spawnLog(finale);
    const a = spawnLog(finale, seededRng(11));
    const b = spawnLog(finale, seededRng(22));

    // Same enemies, same count, same order, on every seed.
    expect(a.map(s => s.kind)).toEqual(plain.map(s => s.kind));
    expect(b.map(s => s.kind)).toEqual(plain.map(s => s.kind));

    // And genuinely different arrivals, not a seed that happens to do nothing.
    expect(a.map(s => s.tick)).not.toEqual(plain.map(s => s.tick));
    expect(a.map(s => s.tick)).not.toEqual(b.map(s => s.tick));
  });

  it('keeps every gap inside the jitter band', () => {
    // The band is what makes the variation safe: no gap collapses to zero (a
    // wave arriving all at once) and none stretches so far the wave outlasts
    // the run. Measured against the unseeded gaps entry by entry.
    const plain = spawnLog(finale);
    for (const seed of [1, 2, 3, 7, 99]) {
      const seeded = spawnLog(finale, seededRng(seed));
      for (let i = 1; i < plain.length; i++) {
        // Only compare gaps *within* an entry: a pause between entries is
        // structural and is not jittered.
        if (plain[i].kind !== plain[i - 1].kind) continue;
        const authored = plain[i].tick - plain[i - 1].tick;
        const actual = seeded[i].tick - seeded[i - 1].tick;
        if (authored <= 1) continue; // a one-tick gap cannot resolve the band
        expect(actual).toBeGreaterThanOrEqual(Math.floor(authored * (1 - SPAWN_JITTER)) - 1);
        expect(actual).toBeLessThanOrEqual(Math.ceil(authored * (1 + SPAWN_JITTER)) + 1);
      }
    }
  });

});

describe('headless playthrough', () => {
  it('an undefended line is overrun early', () => {
    const result = playRun([]);
    expect(result.survived).toBe(false);
    expect(result.waveIdx).toBeLessThan(4);
  });

  it('an idle run scores nothing (issue #254)', () => {
    // Press Start, build nothing, walk away. The opening waves still *end* —
    // every marcher walks into the keep, so no enemy is left alive — and the
    // run used to bank the wave bonus for each of them, putting 200 points on
    // the shared board for doing nothing at all.
    const result = playRun([]);
    expect(result.eco.wavesCleared).toBeGreaterThan(0); // waves did end
    expect(result.eco.wavesHeld).toBe(0); // none of them was held
    expect(score(result.eco)).toBe(0); // so the board gets nothing
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

  const SEEDS = [1, 2, 99, 1337, 4242];

  it('a seed changes the run, and the same seed brings it back (#264)', () => {
    // The player-visible half. It is measured on a run pushed into the endless
    // assault rather than on the 18-wave campaign, and that choice is the
    // interesting part: on the campaign the same layout scores 5,164 or 5,284
    // across these five seeds and holds 17 waves on every one of them, because
    // the authored layout is over-built for 18 waves and only warlords can
    // reach the keep anyway (#263). Run it to 27 and the seeds separate
    // properly — 7,210 to 8,398, falling on wave 23, 25 or 26 — because that is
    // where the line is actually close to breaking and *when* a marcher arrives
    // starts to decide whether it dies in the corridor or walks through it.
    //
    // Asserting a spread over five seeds rather than a difference between two
    // is deliberate: the first version of this test compared 4242 against 1337,
    // which happen to give the same 18-wave run, and read as "the seed does
    // nothing" when the seed does plenty.
    const runs = SEEDS.map(seed => playRun(CAMPAIGN_PLAN, 27, seed));
    expect(new Set(runs.map(r => score(r.eco))).size).toBeGreaterThan(1);

    // And it is reproducible, or the number in the HUD is decoration.
    const again = playRun(CAMPAIGN_PLAN, 27, SEEDS[0]);
    expect(score(again.eco)).toBe(score(runs[0].eco));
    expect(again.eco.lives).toBe(runs[0].eco.lives);
    expect(again.heldByWave).toEqual(runs[0].heldByWave);
  });

  it('a seed is variety, not a difficulty roll (#264)', () => {
    // The constraint that keeps the shared board fair. Whatever the seed, the
    // campaign is still winnable and still bleeds, which is the Round 6
    // no-perfect-runs contract, and the layout still holds the same number of
    // waves — the seed moves what a wave *looks* like, never what it is worth.
    const runs = SEEDS.map(seed => playRun(CAMPAIGN_PLAN, AUTHORED_WAVES, seed));
    for (const run of runs) {
      expect(run.survived).toBe(true);
      expect(run.eco.wavesCleared).toBe(AUTHORED_WAVES);
      expect(run.eco.lives).toBeGreaterThan(0);
      expect(run.eco.lives).toBeLessThan(START_LIVES);
    }
    expect(new Set(runs.map(r => r.eco.wavesHeld)).size).toBe(1);
  });

  it('survives all 18 authored waves with a known layout — but never 20/20', () => {
    const result = playRun(CAMPAIGN_PLAN);
    expect(result.survived).toBe(true);
    expect(result.eco.wavesCleared).toBe(AUTHORED_WAVES);
    // The Round 6 no-perfect-runs contract: the campaign is winnable, and even
    // the best layout we can author against this harness finishes bleeding.
    expect(result.eco.lives).toBeGreaterThan(0);
    expect(result.eco.lives).toBeLessThan(START_LIVES);
    // The score follows the design formula: waves *held* × base + kill
    // bounties. Since this plan bleeds (the contract above), some of the 18
    // waves it survives leaked and so paid no wave bonus — the run scores for
    // the ones it held, not for every one it got through (issue #254).
    expect(score(result.eco)).toBe(result.eco.wavesHeld * WAVE_BASE + result.eco.killScore);
    expect(result.eco.wavesHeld).toBeGreaterThan(0);
    expect(result.eco.wavesHeld).toBeLessThan(result.eco.wavesCleared);
    expect(result.eco.killScore).toBeGreaterThan(0);
    expect(result.eco.wavesHeld).toBe(result.heldByWave.filter(Boolean).length);
  });

  it('a wave that bled does not latch the rest of the run to unheld', () => {
    // Nothing stands for wave 1, so it leaks; the line goes up from wave 2 and
    // holds from there. The leak count is reset at the wave boundary and
    // nowhere else, and this is the whole-loop proof of that boundary: make
    // the reset run-scoped instead and a player who slips once on wave 1 then
    // holds everything after scores nothing for any of it.
    const result = playRun(
      [
        { kind: 'bolt', x: 10, y: 4, notBefore: 1 },
        { kind: 'bolt', x: 10, y: 8, notBefore: 1 },
        { kind: 'bolt', x: 13, y: 4, notBefore: 1 },
        { kind: 'bolt', x: 13, y: 8, notBefore: 2 },
        { kind: 'bolt', x: 7, y: 4, notBefore: 3 },
        { kind: 'bolt', x: 7, y: 8, notBefore: 3 }
      ],
      6
    );
    expect(result.survived).toBe(true);
    expect(result.heldByWave[0]).toBe(false); // wave 1 was undefended
    expect(result.heldByWave.slice(1)).toContain(true); // and the run recovers
    expect(result.eco.wavesHeld).toBe(result.heldByWave.filter(Boolean).length);
    expect(result.eco.wavesHeld).toBeGreaterThan(0);
    expect(score(result.eco)).toBe(result.eco.wavesHeld * WAVE_BASE + result.eco.killScore);
  });

  it('even the reference plan plus every affordable reinforcement still bleeds', () => {
    // Adversarial probe on the contract: max out frost against the warlords
    // and add every blast the purse can carry — the finale quartet still
    // cannot be blanked, so a perfect run is out of reach of the economy.
    const result = playRun([
      ...CAMPAIGN_PLAN,
      { kind: 'frost', x: 15, y: 4, upgrade: true },
      { kind: 'frost', x: 15, y: 8, upgrade: true },
      { kind: 'frost', x: 15, y: 4, upgrade: true },
      { kind: 'frost', x: 15, y: 8, upgrade: true },
      { kind: 'blast', x: 18, y: 8 },
      { kind: 'blast', x: 18, y: 8, upgrade: true },
      { kind: 'blast', x: 18, y: 8, upgrade: true },
      { kind: 'blast', x: 6, y: 4 },
      { kind: 'blast', x: 6, y: 4, upgrade: true }
    ]);
    expect(result.survived).toBe(true);
    expect(result.eco.lives).toBeLessThan(START_LIVES);
  });

  it('holds into the endless assault past the campaign', () => {
    // The same layout keeps holding a few waves past the authored roster,
    // proving the endless handoff spawns real (beatable) waves.
    const result = playRun(CAMPAIGN_PLAN, AUTHORED_WAVES + 3);
    expect(result.survived).toBe(true);
    expect(result.eco.wavesCleared).toBe(AUTHORED_WAVES + 3);
  });

  it('a decent build-once layout falls in the late script, not before wave 12', () => {
    // Build a sensible spread early and never adapt: the escalation must
    // punish complacency (death before wave 18) without feeling unfair
    // (survives well into the back half first).
    const result = playRun([
      { kind: 'bolt', x: 10, y: 4 },
      { kind: 'bolt', x: 10, y: 8 },
      { kind: 'bolt', x: 13, y: 4 },
      { kind: 'bolt', x: 13, y: 8 },
      { kind: 'blast', x: 12, y: 4 },
      { kind: 'blast', x: 12, y: 8 },
      { kind: 'frost', x: 15, y: 8 },
      { kind: 'bolt', x: 7, y: 4 },
      { kind: 'bolt', x: 7, y: 8 },
      { kind: 'bolt', x: 16, y: 8 }
    ]);
    expect(result.survived).toBe(false);
    expect(result.waveIdx).toBeGreaterThanOrEqual(11);
  });

  it('a naive handful of towers dies by mid-campaign', () => {
    const result = playRun([
      { kind: 'bolt', x: 10, y: 4 },
      { kind: 'bolt', x: 10, y: 8 },
      { kind: 'bolt', x: 13, y: 4 }
    ]);
    expect(result.survived).toBe(false);
    expect(result.waveIdx).toBeGreaterThan(3);
    expect(result.waveIdx).toBeLessThanOrEqual(10);
  });

  it('a thin defence clears the opening waves but falls to the late script', () => {
    const result = playRun([{ kind: 'bolt', x: 10, y: 4 }]);
    expect(result.survived).toBe(false);
    expect(result.waveIdx).toBeGreaterThan(1);
  });
});
