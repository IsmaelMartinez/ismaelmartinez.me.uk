import { describe, it, expect } from 'vitest';
import { TerrainBitmap, AIR, EARTH, BRIDGE } from '../../src/games/lemmings/bitmap';
import {
  createCritter,
  assignSkill,
  stepCritter,
  isActive,
  SPLAT_DIST,
  MAX_CLIMB,
  BUILD_BRICKS,
  DIG_INTERVAL,
  BASH_INTERVAL,
  BUILD_INTERVAL,
  type Critter,
  type CritterWorld,
  type Skill
} from '../../src/games/lemmings/critter';
import { buildLevel, atExit, LEVELS, LEVEL_W, LEVEL_H } from '../../src/games/lemmings/levels';
import { translations, locales, type TranslationKey } from '../../src/i18n/translations';
import { exitArrowAngle, exitArrowVector, rescueProgress } from '../../src/games/lemmings/hud';

/**
 * A test double for `CritterWorld` backed by a real `TerrainBitmap`, plus an
 * optional set of blocker columns so blocker-reversal can be exercised without
 * the game layer.
 */
function makeWorld(bmp: TerrainBitmap, blockers: Critter[] = []): CritterWorld {
  return {
    width: bmp.width,
    height: bmp.height,
    solid: (x, y) => bmp.solid(x, y),
    eraseRect: (x, y, w, h) => bmp.eraseRect(x, y, w, h),
    buildRow: (x, y, w) => bmp.buildRow(x, y, w),
    blockerAt: (x, y) =>
      blockers.some(b => b.state === 'blocker' && Math.abs(x - b.x) <= 2 && Math.abs(y - b.y) <= 8)
  };
}

/** A flat floor whose top solid row is `floorTop` (so feet rest at floorTop-1). */
function flatFloor(floorTop = 160): TerrainBitmap {
  const bmp = new TerrainBitmap(LEVEL_W, LEVEL_H);
  bmp.fillRect(0, floorTop, LEVEL_W, LEVEL_H - floorTop);
  return bmp;
}

describe('bitmap', () => {
  it('starts empty (all air)', () => {
    const bmp = new TerrainBitmap(10, 10);
    expect(bmp.solid(5, 5)).toBe(false);
    expect(bmp.materialAt(5, 5)).toBe(AIR);
    expect(bmp.version).toBe(0);
  });

  it('treats out-of-bounds as air', () => {
    const bmp = flatFloor(160);
    expect(bmp.solid(-1, 170)).toBe(false);
    expect(bmp.solid(LEVEL_W, 170)).toBe(false);
    expect(bmp.solid(10, LEVEL_H + 5)).toBe(false);
  });

  it('fills and reports solidity', () => {
    const bmp = new TerrainBitmap(20, 20);
    bmp.fillRect(5, 5, 4, 4);
    expect(bmp.solid(5, 5)).toBe(true);
    expect(bmp.solid(8, 8)).toBe(true);
    expect(bmp.solid(9, 9)).toBe(false); // exclusive of x+w / y+h
    expect(bmp.materialAt(6, 6)).toBe(EARTH);
  });

  it('bumps version on real edits only', () => {
    const bmp = new TerrainBitmap(20, 20);
    bmp.fillRect(0, 0, 5, 5);
    const v = bmp.version;
    expect(v).toBeGreaterThan(0);
    // Re-filling the same cells with the same material is a no-op.
    bmp.fillRect(0, 0, 5, 5);
    expect(bmp.version).toBe(v);
    bmp.eraseRect(0, 0, 1, 1);
    expect(bmp.version).toBe(v + 1);
  });

  it('erases a column (digger) and a swathe (basher)', () => {
    const bmp = flatFloor(160);
    bmp.eraseRect(40, 160, 8, 5);
    for (let x = 40; x < 48; x++) expect(bmp.solid(x, 162)).toBe(false);
    expect(bmp.solid(39, 162)).toBe(true);
    expect(bmp.solid(48, 162)).toBe(true);
  });

  it('erases a disc for the nuke/explosion', () => {
    const bmp = new TerrainBitmap(40, 40);
    bmp.fillRect(0, 0, 40, 40);
    bmp.eraseCircle(20, 20, 6);
    expect(bmp.solid(20, 20)).toBe(false);
    expect(bmp.solid(20, 26)).toBe(false);
    expect(bmp.solid(20, 28)).toBe(true); // outside the radius
  });

  it('lays bridge cells distinct from earth', () => {
    const bmp = new TerrainBitmap(20, 20);
    bmp.buildRow(4, 10, 6);
    expect(bmp.solid(4, 10)).toBe(true);
    expect(bmp.materialAt(4, 10)).toBe(BRIDGE);
    expect(bmp.materialAt(9, 10)).toBe(BRIDGE);
    expect(bmp.materialAt(10, 10)).toBe(AIR);
  });
});

describe('critter — walking & falling', () => {
  it('spawns as a faller and lands as a walker', () => {
    const bmp = flatFloor(160);
    const world = makeWorld(bmp);
    const c = createCritter(1, 50, 120, 1);
    expect(c.state).toBe('faller');
    for (let i = 0; i < 200 && c.state === 'faller'; i++) stepCritter(c, world);
    expect(c.state).toBe('walker');
    expect(c.y).toBe(159); // rests one px above the floor top
    expect(c.fallDist).toBe(0);
  });

  it('advances 1px per tick in its facing direction', () => {
    const bmp = flatFloor(160);
    const world = makeWorld(bmp);
    const c: Critter = { ...createCritter(1, 50, 159, 1), state: 'walker' };
    stepCritter(c, world);
    expect(c.x).toBe(51);
    c.dir = -1;
    stepCritter(c, world);
    expect(c.x).toBe(50);
  });

  it('climbs shallow slopes but reverses at tall walls', () => {
    const bmp = flatFloor(160);
    // A 3px step is climbable...
    bmp.fillRect(60, 157, 40, 3);
    const world = makeWorld(bmp);
    const climber: Critter = { ...createCritter(1, 55, 159, 1), state: 'walker' };
    for (let i = 0; i < 12; i++) stepCritter(climber, world);
    expect(climber.dir).toBe(1);
    expect(climber.y).toBeLessThan(159); // stepped up onto the ledge

    // ...a wall taller than MAX_CLIMB turns the critter around.
    const bmp2 = flatFloor(160);
    bmp2.fillRect(70, 160 - (MAX_CLIMB + 6), 10, MAX_CLIMB + 6);
    const world2 = makeWorld(bmp2);
    const blocked: Critter = { ...createCritter(2, 60, 159, 1), state: 'walker' };
    for (let i = 0; i < 20; i++) stepCritter(blocked, world2);
    expect(blocked.dir).toBe(-1);
    expect(blocked.x).toBeLessThan(70);
  });

  it('walks off a cliff, falls, and splats past the threshold', () => {
    const bmp = new TerrainBitmap(LEVEL_W, LEVEL_H);
    bmp.fillRect(0, 40, 80, 4); // high ledge, nothing below
    const world = makeWorld(bmp);
    const c: Critter = { ...createCritter(1, 78, 39, 1), state: 'walker' };
    for (let i = 0; i < 400 && isActive(c); i++) stepCritter(c, world);
    expect(c.state).toBe('splatted');
    expect(c.alive).toBe(false);
  });

  it('survives a short drop', () => {
    const landingTop = 100 + SPLAT_DIST - 10; // within the splat threshold
    const bmp = new TerrainBitmap(LEVEL_W, LEVEL_H);
    bmp.fillRect(0, 100, 80, 4); // ledge the critter walks off
    bmp.fillRect(0, landingTop, 200, 10); // ground below
    const world = makeWorld(bmp);
    const c: Critter = { ...createCritter(1, 78, 99, 1), state: 'walker' };
    // Step until it has walked off the ledge, fallen, and settled on the ground
    // below (feet one px above the landing surface) — never touching 'faller' as
    // a loop guard, which previously skipped the whole simulation.
    let landed = false;
    for (let i = 0; i < 400 && !landed; i++) {
      stepCritter(c, world);
      landed = c.state === 'walker' && c.y === landingTop - 1;
    }
    expect(landed).toBe(true);
    expect(c.alive).toBe(true);
    expect(c.state).not.toBe('splatted');
  });
});

describe('critter — skills', () => {
  it('floater cancels fall damage on a lethal drop', () => {
    const bmp = new TerrainBitmap(LEVEL_W, LEVEL_H);
    bmp.fillRect(0, 30, 80, 4);
    bmp.fillRect(0, 190, LEVEL_W, 10); // ground far below
    const world = makeWorld(bmp);
    const c: Critter = { ...createCritter(1, 78, 29, 1), state: 'walker' };
    expect(assignSkill(c, 'floater')).toBe(true);
    expect(assignSkill(c, 'floater')).toBe(false); // already a floater
    for (let i = 0; i < 800 && isActive(c) && c.y < 189; i++) stepCritter(c, world);
    expect(c.alive).toBe(true);
    expect(c.state).not.toBe('splatted');
  });

  it('floater may be pinned mid-air but earth skills need a grounded walker', () => {
    const faller = createCritter(1, 10, 10, 1); // still falling
    expect(faller.state).toBe('faller');
    expect(assignSkill(faller, 'digger')).toBe(false);
    expect(assignSkill(faller, 'floater')).toBe(true);
  });

  it('blocker stands still and reverses passing walkers', () => {
    const bmp = flatFloor(160);
    const blocker: Critter = { ...createCritter(1, 100, 159, 1), state: 'blocker' };
    const walker: Critter = { ...createCritter(2, 90, 159, 1), state: 'walker' };
    const world = makeWorld(bmp, [blocker]);
    for (let i = 0; i < 30; i++) {
      stepCritter(blocker, world);
      stepCritter(walker, world);
    }
    expect(blocker.x).toBe(100); // never moved
    expect(walker.dir).toBe(-1); // turned back before reaching the blocker
    expect(walker.x).toBeLessThan(100);
  });

  it('digger tunnels straight down until it breaks through', () => {
    const bmp = new TerrainBitmap(LEVEL_W, LEVEL_H);
    bmp.fillRect(0, 100, LEVEL_W, 20); // 20px-thick slab, air below
    const world = makeWorld(bmp);
    const c: Critter = { ...createCritter(1, 60, 99, 1), state: 'digger' };
    const startY = c.y;
    for (let i = 0; i < DIG_INTERVAL * 40 && c.state === 'digger'; i++) stepCritter(c, world);
    expect(c.y).toBeGreaterThan(startY); // sank into the slab
    expect(bmp.solid(60, 110)).toBe(false); // carved a shaft
    // Broke through the bottom of the slab and resumed (walker → then fell).
    expect(c.state === 'walker' || c.state === 'faller').toBe(true);
  });

  it('basher eats horizontally through a wall then walks on', () => {
    const bmp = flatFloor(160);
    bmp.fillRect(120, 130, 14, 30); // wall sitting on the floor
    const world = makeWorld(bmp);
    const c: Critter = { ...createCritter(1, 116, 159, 1), state: 'basher' };
    for (let i = 0; i < BASH_INTERVAL * 60 && c.state === 'basher'; i++) stepCritter(c, world);
    expect(c.x).toBeGreaterThan(133); // cleared the wall's far edge
    expect(bmp.solid(125, 158)).toBe(false); // tunnel at feet height
    expect(bmp.solid(125, 160)).toBe(true); // floor preserved
  });

  it('builder lays a rising staircase then resumes walking', () => {
    const bmp = flatFloor(160);
    const world = makeWorld(bmp);
    const c: Critter = { ...createCritter(1, 100, 159, 1), state: 'builder', bricks: BUILD_BRICKS };
    const startX = c.x;
    const startY = c.y;
    for (let i = 0; i < BUILD_INTERVAL * (BUILD_BRICKS + 3) && c.state === 'builder'; i++) {
      stepCritter(c, world);
    }
    expect(c.state).toBe('walker');
    expect(c.x).toBeGreaterThan(startX); // advanced in its facing direction
    expect(c.y).toBeLessThan(startY); // climbed as it built
    expect(bmp.materialAt(startX + 2, startY)).toBe(BRIDGE); // left a bridge tread
  });
});

describe('levels', () => {
  it('provides nine solvable-shaped levels', () => {
    expect(LEVELS).toHaveLength(9);
    for (const level of LEVELS) {
      expect(level.needed).toBeGreaterThan(0);
      expect(level.needed).toBeLessThanOrEqual(level.spawnCount);
      const total = Object.values(level.stock).reduce((a, b) => a + b, 0);
      expect(total).toBeGreaterThanOrEqual(0);
    }
  });

  it('rasterises shapes and places hatch over ground within bounds', () => {
    for (const level of LEVELS) {
      const bmp = buildLevel(level);
      expect(bmp.width).toBe(LEVEL_W);
      expect(bmp.height).toBe(LEVEL_H);
      expect(level.hatch.x).toBeGreaterThanOrEqual(0);
      expect(level.hatch.x).toBeLessThan(LEVEL_W);
      expect(level.exit.x).toBeGreaterThanOrEqual(0);
      expect(level.exit.x).toBeLessThan(LEVEL_W);
    }
  });

  it('renders a ramp as a genuine slope', () => {
    const bmp = buildLevel({
      shapes: [{ kind: 'ramp', x: 0, y: 0, w: 20, h: 20, high: 'right' }],
      hatch: { x: 0, y: 0, dir: 1 },
      exit: { x: 0, y: 0 },
      spawnCount: 1,
      needed: 1,
      stock: {}
    });
    // Taller on the right than the left.
    const leftCol = countSolid(bmp, 1);
    const rightCol = countSolid(bmp, 18);
    expect(rightCol).toBeGreaterThan(leftCol);
  });

  it('gives the trickier later levels (7–9) a hint key that resolves in every locale', () => {
    // Levels 7, 8, 9 (indices 6–8) chain skills in non-obvious ways, so each
    // carries a one-line hint. The value is an i18n key, not raw text.
    for (const index of [6, 7, 8]) {
      const key = LEVELS[index].hint;
      expect(key, `level ${index + 1} should have a hint`).toBeTruthy();
      if (!key) continue;
      for (const locale of locales) {
        const table = translations[locale] as Record<TranslationKey, string>;
        expect(table[key], `${key} missing in ${locale}`).toBeTruthy();
      }
    }
  });

  it('leaves the introductory levels (1–6) hint-free so their mechanic is discovered', () => {
    for (let i = 0; i < 6; i++) {
      expect(LEVELS[i].hint, `level ${i + 1} should not have a hint`).toBeUndefined();
    }
  });

  it('detects a critter standing in the exit', () => {
    const level = LEVELS[0];
    const inDoor: Critter = { ...createCritter(1, level.exit.x, level.exit.y, 1), state: 'walker' };
    const away: Critter = { ...createCritter(2, level.exit.x - 60, level.exit.y, 1), state: 'walker' };
    expect(atExit(inDoor, level)).toBe(true);
    expect(atExit(away, level)).toBe(false);
  });
});

describe('hud — destination arrow', () => {
  it('points straight right toward an exit on the same row', () => {
    expect(exitArrowAngle({ x: 10, y: 100 }, { x: 200, y: 100 })).toBeCloseTo(0);
  });

  it('points straight left toward an exit behind the critter', () => {
    expect(Math.abs(exitArrowAngle({ x: 200, y: 100 }, { x: 10, y: 100 }))).toBeCloseTo(Math.PI);
  });

  it('points down (+y in canvas space) toward an exit below', () => {
    expect(exitArrowAngle({ x: 50, y: 20 }, { x: 50, y: 180 })).toBeCloseTo(Math.PI / 2);
  });

  it('points up toward an exit above', () => {
    expect(exitArrowAngle({ x: 50, y: 180 }, { x: 50, y: 20 })).toBeCloseTo(-Math.PI / 2);
  });

  it('has a defined heading when critter and exit coincide', () => {
    expect(exitArrowAngle({ x: 5, y: 5 }, { x: 5, y: 5 })).toBe(0);
  });

  it('returns a unit vector toward the exit', () => {
    const v = exitArrowVector({ x: 0, y: 0 }, { x: 3, y: 4 });
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(1);
    expect(v.x).toBeCloseTo(0.6);
    expect(v.y).toBeCloseTo(0.8);
  });

  it('returns a zero vector for coincident points (no NaN)', () => {
    expect(exitArrowVector({ x: 7, y: 7 }, { x: 7, y: 7 })).toEqual({ x: 0, y: 0 });
  });
});

describe('hud — rescue progress', () => {
  it('is 0 with none saved and 1 at the quota', () => {
    expect(rescueProgress(0, 4)).toBe(0);
    expect(rescueProgress(4, 4)).toBe(1);
  });

  it('reports a partial fraction mid-rescue', () => {
    expect(rescueProgress(2, 4)).toBeCloseTo(0.5);
    expect(rescueProgress(1, 4)).toBeCloseTo(0.25);
  });

  it('clamps to 1 when the crowd over-delivers past the quota', () => {
    expect(rescueProgress(8, 4)).toBe(1);
  });

  it('clamps to 0 for negative input and treats a zero quota as complete', () => {
    expect(rescueProgress(-3, 4)).toBe(0);
    expect(rescueProgress(0, 0)).toBe(1);
  });
});

function countSolid(bmp: TerrainBitmap, x: number): number {
  let n = 0;
  for (let y = 0; y < bmp.height; y++) if (bmp.solid(x, y)) n++;
  return n;
}

/**
 * Headless playthrough harness: runs a level exactly as the game loop does —
 * spawning on an interval, stepping every critter each tick, banking exits —
 * while a `strategy` callback assigns skills from the level's stock, the same
 * decisions a player makes with taps. This is the automated stand-in for the
 * manual "guide the crowd home with each skill" verification.
 */
type LevelDef = (typeof LEVELS)[number];

interface SimApi {
  critters: Critter[];
  bmp: TerrainBitmap;
  assign(c: Critter, skill: Skill): boolean;
}

function playLevel(
  level: LevelDef,
  strategy: (api: SimApi) => void,
  { interval = 24, maxTicks = 8000 } = {}
): number {
  const bmp = buildLevel(level);
  const stock: Record<Skill, number> = {
    blocker: level.stock.blocker ?? 0,
    digger: level.stock.digger ?? 0,
    basher: level.stock.basher ?? 0,
    builder: level.stock.builder ?? 0,
    floater: level.stock.floater ?? 0
  };
  let critters: Critter[] = [];
  let saved = 0;
  let spawned = 0;
  let spawnTimer = 0;
  let id = 1;
  const world: CritterWorld = {
    width: bmp.width,
    height: bmp.height,
    solid: (x, y) => bmp.solid(x, y),
    eraseRect: (x, y, w, h) => bmp.eraseRect(x, y, w, h),
    buildRow: (x, y, w) => bmp.buildRow(x, y, w),
    blockerAt: (x, y) =>
      critters.some(c => c.state === 'blocker' && Math.abs(x - c.x) <= 2 && Math.abs(y - c.y) <= 8)
  };
  const assign = (c: Critter, skill: Skill) => {
    if (stock[skill] <= 0) return false;
    if (assignSkill(c, skill)) {
      stock[skill]--;
      return true;
    }
    return false;
  };

  for (let tick = 0; tick < maxTicks; tick++) {
    if (spawned < level.spawnCount) {
      if (spawnTimer <= 0) {
        critters.push(createCritter(id++, level.hatch.x, level.hatch.y, level.hatch.dir));
        spawned++;
        spawnTimer = interval;
      } else {
        spawnTimer--;
      }
    }
    strategy({ critters, bmp, assign });
    for (const c of critters) {
      if (!isActive(c)) continue;
      stepCritter(c, world);
      if (isActive(c) && atExit(c, level)) {
        c.state = 'exited';
        c.alive = false;
        saved++;
      }
    }
    critters = critters.filter(isActive);
    if (spawned >= level.spawnCount && critters.length === 0) break;
  }
  return saved;
}

describe('levels — solvable playthroughs', () => {
  it('1: reaches the exit by simply walking', () => {
    const saved = playLevel(LEVELS[0], () => {});
    expect(saved).toBeGreaterThanOrEqual(LEVELS[0].needed);
  });

  it('2: a basher tunnels the wall for the whole crowd', () => {
    const saved = playLevel(LEVELS[1], ({ critters, bmp, assign }) => {
      if (!bmp.solid(156, 158)) return; // tunnel already open
      if (critters.some(c => c.state === 'basher')) return;
      const w = critters.find(c => c.state === 'walker' && c.dir === 1 && c.x >= 140 && c.x <= 149);
      if (w) assign(w, 'basher');
    });
    expect(saved).toBeGreaterThanOrEqual(LEVELS[1].needed);
  });

  it('3: one builder ramps up to the ledge and the crowd follows', () => {
    let built = false;
    const saved = playLevel(LEVELS[2], ({ critters, assign }) => {
      if (built) return;
      const w = critters.find(
        c => c.state === 'walker' && c.dir === 1 && c.y === 159 && c.x >= 226 && c.x <= 231
      );
      if (w && assign(w, 'builder')) built = true;
    });
    expect(saved).toBeGreaterThanOrEqual(LEVELS[2].needed);
  });

  it('4: a digger opens the floor and the crowd drops to the exit', () => {
    let dug = false;
    const saved = playLevel(LEVELS[3], ({ critters, assign }) => {
      if (dug) return;
      const w = critters.find(c => c.state === 'walker' && c.y === 119);
      if (w && assign(w, 'digger')) dug = true;
    });
    expect(saved).toBeGreaterThanOrEqual(LEVELS[3].needed);
  });

  it('5: floaters survive the long drop', () => {
    const saved = playLevel(LEVELS[4], ({ critters, assign }) => {
      for (const c of critters) {
        if (c.state === 'walker' && !c.floater && c.y === 59 && c.x < 108) assign(c, 'floater');
      }
    });
    expect(saved).toBeGreaterThanOrEqual(LEVELS[4].needed);
  });

  it('6: float down, bash across, build up — the finale chains three skills', () => {
    let built = false;
    const saved = playLevel(LEVELS[5], ({ critters, bmp, assign }) => {
      for (const c of critters) {
        if (c.state === 'walker' && !c.floater && c.y === 59 && c.x < 88) assign(c, 'floater');
      }
      if (bmp.solid(156, 178) && !critters.some(c => c.state === 'basher')) {
        const w = critters.find(
          c => c.state === 'walker' && c.dir === 1 && c.y === 179 && c.x >= 143 && c.x <= 149
        );
        if (w) assign(w, 'basher');
      }
      if (!built) {
        const w = critters.find(
          c => c.state === 'walker' && c.dir === 1 && c.y === 179 && c.x >= 259 && c.x <= 264
        );
        if (w && assign(w, 'builder')) built = true;
      }
    });
    expect(saved).toBeGreaterThanOrEqual(LEVELS[5].needed);
  });

  it('7: a blocker holds the crowd off the cliff while a digger drops them home', () => {
    let blocked = false;
    let dug = false;
    const saved = playLevel(LEVELS[6], ({ critters, assign }) => {
      // Turn the crowd back before the leader marches off the right-hand cliff.
      if (!blocked) {
        const w = critters.find(
          c => c.state === 'walker' && c.dir === 1 && c.y === 119 && c.x >= 200 && c.x <= 208
        );
        if (w && assign(w, 'blocker')) blocked = true;
      }
      // Then sink a shaft through the shelf so the bouncing crowd falls through.
      if (blocked && !dug) {
        const w = critters.find(
          c => c.state === 'walker' && c.y === 119 && c.x >= 112 && c.x <= 128
        );
        if (w && assign(w, 'digger')) dug = true;
      }
    });
    expect(saved).toBeGreaterThanOrEqual(LEVELS[6].needed);
  });

  it('8: build up onto the shelf, then bash through the wall to the exit', () => {
    let built = false;
    let bashed = false;
    const saved = playLevel(LEVELS[7], ({ critters, assign }) => {
      if (!built) {
        const w = critters.find(
          c => c.state === 'walker' && c.dir === 1 && c.y === 169 && c.x >= 184 && c.x <= 190
        );
        if (w && assign(w, 'builder')) built = true;
      }
      if (built && !bashed) {
        const w = critters.find(
          c => c.state === 'walker' && c.dir === 1 && c.y === 157 && c.x >= 246 && c.x <= 249
        );
        if (w && assign(w, 'basher')) bashed = true;
      }
    });
    expect(saved).toBeGreaterThanOrEqual(LEVELS[7].needed);
  });

  it('9: floaters ride the drop down, then a digger opens the chamber below', () => {
    let dug = false;
    const saved = playLevel(LEVELS[8], ({ critters, assign }) => {
      // Pop an umbrella on anything still above the shelf so the fall is safe.
      for (const c of critters) {
        if (!c.floater && c.y < 130 && (c.state === 'walker' || c.state === 'faller')) {
          assign(c, 'floater');
        }
      }
      // Once they have landed, dig through the shelf to the exit chamber.
      if (!dug) {
        const w = critters.find(
          c => c.state === 'walker' && c.y === 139 && c.x >= 80 && c.x <= 140
        );
        if (w && assign(w, 'digger')) dug = true;
      }
    });
    expect(saved).toBeGreaterThanOrEqual(LEVELS[8].needed);
  });
});
