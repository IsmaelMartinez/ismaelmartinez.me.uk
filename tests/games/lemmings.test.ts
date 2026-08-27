import { describe, it, expect } from 'vitest';
import { TerrainBitmap, AIR, EARTH, BRIDGE, STEEL } from '../../src/games/lemmings/bitmap';
import {
  createCritter,
  assignSkill,
  stepCritter,
  isActive,
  CRITTER_H,
  SPLAT_DIST,
  MAX_CLIMB,
  BUILD_BRICKS,
  DIG_INTERVAL,
  BASH_INTERVAL,
  BUILD_INTERVAL,
  BOMBER_FUSE,
  type Critter,
  type CritterWorld,
  type Skill
} from '../../src/games/lemmings/critter';
import {
  buildLevel,
  atExit,
  levelHatches,
  levelStock,
  LEVELS,
  LEVEL_W,
  LEVEL_H
} from '../../src/games/lemmings/levels';
import {
  createStallWatch,
  levelEnding,
  STUCK_TICKS,
  type FieldState,
  type LevelEnding,
  type EndConditionState
} from '../../src/games/lemmings/stall';
import { translations, locales, type TranslationKey } from '../../src/i18n/translations';
import { exitArrowAngle, rescueProgress } from '../../src/games/lemmings/hud';
import {
  newCombo,
  comboOnRescue,
  rescuePoints,
  levelBonuses,
  RESCUE_POINTS,
  COMBO_WINDOW,
  COMBO_STEP,
  COMBO_MAX_STREAK,
  OVER_QUOTA_POINTS,
  PERFECT_BONUS,
  TIME_BONUS_MAX
} from '../../src/games/lemmings/score';

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
    erodible: (x, y) => bmp.erodible(x, y),
    eraseRect: (x, y, w, h) => bmp.eraseRect(x, y, w, h),
    buildRow: (x, y, w) => bmp.buildRow(x, y, w),
    // Same blocker footprint as the game's world (game.ts): the body spans
    // from the feet up, never below them.
    blockerAt: (x, y) =>
      blockers.some(
        b => b.state === 'blocker' && Math.abs(x - b.x) <= 2 && y <= b.y && y >= b.y - (CRITTER_H - 1)
      )
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

  it('paints steel as a solid material', () => {
    const bmp = new TerrainBitmap(20, 20);
    bmp.fillRect(5, 5, 4, 4, STEEL);
    expect(bmp.solid(6, 6)).toBe(true);
    expect(bmp.materialAt(6, 6)).toBe(STEEL);
  });

  it('eraseRect clears earth but leaves steel standing', () => {
    const bmp = new TerrainBitmap(20, 20);
    bmp.fillRect(0, 10, 10, 4, EARTH);
    bmp.fillRect(10, 10, 10, 4, STEEL);
    bmp.eraseRect(0, 10, 20, 4);
    expect(bmp.solid(5, 12)).toBe(false); // earth gone
    expect(bmp.materialAt(15, 12)).toBe(STEEL); // steel untouched
  });

  it('eraseCircle (nuke craters) cannot dent steel', () => {
    const bmp = new TerrainBitmap(40, 40);
    bmp.fillRect(0, 0, 40, 40, STEEL);
    const v = bmp.version;
    bmp.eraseCircle(20, 20, 6);
    expect(bmp.solid(20, 20)).toBe(true);
    expect(bmp.version).toBe(v); // nothing changed, no redraw needed
  });

  it('buildRow fills only air, never converting earth or steel to bridge', () => {
    const bmp = new TerrainBitmap(20, 20);
    bmp.fillRect(4, 10, 2, 1, EARTH);
    bmp.fillRect(6, 10, 2, 1, STEEL);
    bmp.buildRow(2, 10, 8);
    expect(bmp.materialAt(2, 10)).toBe(BRIDGE);
    expect(bmp.materialAt(3, 10)).toBe(BRIDGE);
    expect(bmp.materialAt(4, 10)).toBe(EARTH);
    expect(bmp.materialAt(6, 10)).toBe(STEEL);
    expect(bmp.materialAt(8, 10)).toBe(BRIDGE);
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

  it('bomber lights a single critter\'s fuse and cannot be relit', () => {
    // Unlike the terrain skills, a bomber pins on any active critter whatever
    // its state (walker, blocker, mid-fall) — the pick-one counterpart to the
    // mass nuke. game.ts counts the fuse down and fires the blast.
    const c: Critter = { ...createCritter(1, 100, 159, 1), state: 'walker' };
    expect(c.fuse).toBe(-1); // unlit by default
    expect(assignSkill(c, 'bomber')).toBe(true);
    expect(c.fuse).toBe(BOMBER_FUSE);
    // A lit fuse can't be stacked or reset by a second bomber.
    expect(assignSkill(c, 'bomber')).toBe(false);
    expect(c.fuse).toBe(BOMBER_FUSE);

    const blocker: Critter = { ...createCritter(2, 50, 159, 1), state: 'blocker' };
    expect(assignSkill(blocker, 'bomber')).toBe(true);
    const faller = createCritter(3, 10, 10, 1); // still airborne
    expect(assignSkill(faller, 'bomber')).toBe(true);
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

  it('digger gives up on a steel floor without sinking in', () => {
    const bmp = new TerrainBitmap(LEVEL_W, LEVEL_H);
    bmp.fillRect(0, 160, LEVEL_W, 40, STEEL);
    const world = makeWorld(bmp);
    const c: Critter = { ...createCritter(1, 60, 159, 1), state: 'digger' };
    for (let i = 0; i < DIG_INTERVAL * 5 && c.state === 'digger'; i++) stepCritter(c, world);
    expect(c.state).toBe('walker');
    expect(c.y).toBe(159); // never sank into the plate
    expect(bmp.solid(60, 160)).toBe(true);
  });

  it('digger straddling a steel seam bounces without chewing the earth side', () => {
    const bmp = new TerrainBitmap(LEVEL_W, LEVEL_H);
    bmp.fillRect(0, 120, 240, 16, STEEL);
    bmp.fillRect(240, 120, 80, 16, EARTH);
    const world = makeWorld(bmp);
    // Centre column on steel, but the 8px swathe would reach earth at 240+.
    const c: Critter = { ...createCritter(1, 238, 119, 1), state: 'digger' };
    const v = bmp.version;
    for (let i = 0; i < DIG_INTERVAL * 3 && c.state === 'digger'; i++) stepCritter(c, world);
    expect(c.state).toBe('walker');
    expect(c.y).toBe(119);
    expect(bmp.solid(240, 120)).toBe(true); // seam edge untouched
    expect(bmp.solid(241, 120)).toBe(true);
    expect(bmp.version).toBe(v); // the bounced spade never erased anything
  });

  it('basher bounces off a steel wall and turns back as a walker', () => {
    const bmp = flatFloor(160);
    bmp.fillRect(120, 130, 8, 30, STEEL);
    const world = makeWorld(bmp);
    const c: Critter = { ...createCritter(1, 116, 159, 1), state: 'basher' };
    const v = bmp.version;
    for (let i = 0; i < BASH_INTERVAL * 30 && c.state === 'basher'; i++) stepCritter(c, world);
    expect(c.state).toBe('walker');
    expect(c.x).toBeLessThan(120); // never chewed into the wall
    expect(bmp.solid(122, 150)).toBe(true); // wall intact
    expect(bmp.version).toBe(v); // the bounced fist never erased anything
    // The walker rules then turn it around at the impassable face.
    for (let i = 0; i < 20; i++) stepCritter(c, world);
    expect(c.dir).toBe(-1);
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
  it('provides twenty-five solvable-shaped levels', () => {
    expect(LEVELS).toHaveLength(25);
    for (const level of LEVELS) {
      expect(level.needed).toBeGreaterThan(0);
      expect(level.needed).toBeLessThanOrEqual(level.spawnCount);
      expect(level.par).toBeGreaterThan(0);
      // On timed levels par must sit strictly inside the clock — otherwise
      // every possible clear beats par and the time bonus becomes automatic.
      if (level.timeLimit !== undefined) expect(level.timeLimit).toBeGreaterThan(level.par);
      const total = Object.values(level.stock).reduce((a, b) => a + b, 0);
      expect(total).toBeGreaterThanOrEqual(0);
    }
  });

  it('lists one hatch normally and both when a second is defined', () => {
    expect(levelHatches(LEVELS[0])).toEqual([LEVELS[0].hatch]);
    const twin = LEVELS[12]; // 13 — Double Trouble introduces the second hatch
    expect(twin.hatch2).toBeTruthy();
    expect(levelHatches(twin)).toEqual([twin.hatch, twin.hatch2]);
  });

  it('rasterises shapes and places every hatch and exit within bounds', () => {
    for (const level of LEVELS) {
      const bmp = buildLevel(level);
      expect(bmp.width).toBe(LEVEL_W);
      expect(bmp.height).toBe(LEVEL_H);
      for (const hatch of levelHatches(level)) {
        expect(hatch.x).toBeGreaterThanOrEqual(0);
        expect(hatch.x).toBeLessThan(LEVEL_W);
      }
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
      stock: {},
      par: 1
    });
    // Taller on the right than the left.
    const leftCol = countSolid(bmp, 1);
    const rightCol = countSolid(bmp, 18);
    expect(rightCol).toBeGreaterThan(leftCol);
  });

  it('gives every level from 6 onward a hint key that resolves in every locale', () => {
    // Levels 6 onward chain skills or twist the rules in non-obvious ways, so
    // each carries a one-line hint. The value is an i18n key, not raw text.
    // Ranging over LEVELS.length keeps this guard covering future batches.
    for (let index = 5; index < LEVELS.length; index++) {
      const key = LEVELS[index].hint;
      expect(key, `level ${index + 1} should have a hint`).toBeTruthy();
      if (!key) continue;
      for (const locale of locales) {
        const table = translations[locale] as Record<TranslationKey, string>;
        expect(table[key], `${key} missing in ${locale}`).toBeTruthy();
      }
    }
  });

  it('leaves the single-mechanic levels (1–5) hint-free so each one is discovered', () => {
    // 6 used to sit inside this rule and does not belong there: it is the act's
    // finale and the only level in it that chains three skills, which made it the
    // least-signposted hard level in the game (#267). One mechanic a level is
    // what earns the silence, and 6 has three.
    for (let i = 0; i < 5; i++) {
      expect(LEVELS[i].hint, `level ${i + 1} should not have a hint`).toBeUndefined();
    }
  });

  it('climbs in acts: difficulty never dips within an act, breathers exempt', () => {
    // Authored difficulty tiers per position (1-indexed), pinning the Round 6
    // acts resequence: I teaching (1–6), II skill chains (7–12), III rule
    // twists (14–19), IV endgame (20–25). Breathers — 13 Double Trouble,
    // 17 Two Streams, 22 Second Wind — deliberately reset tension and are
    // exempt from the climb.
    // prettier-ignore
    const tiers = [
      1, 2, 2, 2, 2, 3,
      3, 3, 4, 4, 4, 4,
      1,
      4, 5, 5, 2, 5, 6,
      6, 6, 2, 7, 7, 8
    ];
    const breathers = new Set([13, 17, 22]);
    expect(tiers).toHaveLength(LEVELS.length);
    const acts = [
      [1, 2, 3, 4, 5, 6],
      [7, 8, 9, 10, 11, 12, 13],
      [14, 15, 16, 17, 18, 19],
      [20, 21, 22, 23, 24, 25]
    ];
    for (const act of acts) {
      const climb = act.filter(p => !breathers.has(p));
      for (let i = 1; i < climb.length; i++) {
        expect(
          tiers[climb[i] - 1],
          `level ${climb[i]} should not be easier than level ${climb[i - 1]}`
        ).toBeGreaterThanOrEqual(tiers[climb[i - 1] - 1]);
      }
    }
    // The timing-sensitive set pieces (the gorge relay and the capstones) sit
    // in the endgame, strictly harder than anything the first three acts field.
    const earlyMax = Math.max(
      ...acts
        .slice(0, 3)
        .flat()
        .filter(p => !breathers.has(p))
        .map(p => tiers[p - 1])
    );
    expect(tiers[23 - 1]).toBeGreaterThan(earlyMax);
    expect(tiers[24 - 1]).toBeGreaterThan(earlyMax);
    expect(tiers[25 - 1]).toBeGreaterThan(earlyMax);
  });

  it('never ships the same level twice', () => {
    // Levels 24 and 25 were once identical in every field that decides what the
    // player has to do — shapes, both hatches, exit, spawn count, quota and
    // stock — and differed only in `par` and `timeLimit`, both of which were
    // *kinder* on 25. So the campaign's capstone was its predecessor with the
    // clock loosened, while the tier test above asserted a step up. This guard
    // compares what a level asks of the player and ignores what it pays out, so
    // a copy-pasted level cannot pass by retiming alone.
    // Canonical, because `JSON.stringify` is order-sensitive and a duplicate
    // that listed its rects or its stock in another order would slip straight
    // through the guard meant to catch it. Shapes are sorted by their own
    // serialisation and stock keys by name, so two levels that ask the same
    // thing compare equal however they were typed.
    const canon = (v: unknown): string =>
      JSON.stringify(v, (_k, val) =>
        val && typeof val === 'object' && !Array.isArray(val)
          ? Object.fromEntries(Object.entries(val as object).sort(([a], [b]) => (a < b ? -1 : 1)))
          : val
      );
    // A hard clock is part of what a level asks; how generous that clock is is
    // not. So `clocked` is in the key and `timeLimit` is not, which is exactly
    // the line between the two reuses in this campaign. 14 is 2's terrain on
    // purpose ("the wall level again, but now against a hard timer") and the
    // timer is the whole lesson, so they differ. 24 and 25 both ran a clock and
    // differed only in it being kinder on 25, so they did not.
    const asks = (l: (typeof LEVELS)[number]) =>
      canon({
        shapes: [...l.shapes].map(canon).sort(),
        hatch: l.hatch,
        hatch2: l.hatch2,
        exit: l.exit,
        spawnCount: l.spawnCount,
        needed: l.needed,
        stock: l.stock,
        clocked: l.timeLimit !== undefined
      });
    const seen = new Map<string, number>();
    for (let i = 0; i < LEVELS.length; i++) {
      const key = asks(LEVELS[i]);
      const twin = seen.get(key);
      expect(twin, `level ${i + 1} asks exactly what level ${(twin ?? 0) + 1} asks`).toBeUndefined();
      seen.set(key, i);
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
 * spawning on an interval (alternating hatches when a level has two), stepping
 * every critter each tick, counting bomber fuses down and detonating them,
 * banking exits, and resolving the level on the game's own end conditions
 * (everyone out and only blockers left; or an authored `timeLimit` running out)
 * — while a `strategy` callback assigns skills from the level's stock, the same
 * decisions a player makes with taps. This is the automated stand-in for the
 * manual "guide the crowd home with each skill" verification, so a timed level's
 * test proves it is winnable on the clock.
 *
 * The ending itself is not re-implemented here: `levelEnding` (stall.ts) is the
 * one composition, and game.ts calls the same function on the same facts. That
 * is deliberate — the previous harness spelled the conditions out a second time
 * and could therefore certify a level the shipped game would cut off, which is
 * how twenty-five green playthroughs coexisted with a level that hung in the
 * browser. There is now nothing production applies that the harness does not.
 *
 * `nukeWhenStuck` models the player the game now talks to. Nothing ends a level
 * on a standstill any more; the game raises a hint naming the Nuke button and
 * waits. A player who takes that hint is what the harness plays by default, so a
 * level that has run out of ways home still terminates here — through the same
 * concede-and-clear-the-field path the browser runs, not through a rule the test
 * invented. Turn it off to ask the other question: what a level does when nobody
 * touches it, which is the diagnosis the sentinel below records.
 *
 * `maxTicks` is the harness's own runaway guard, independent of anything under
 * test: a run that reaches it is a level nothing ever answered for, reported as
 * `endedAt === null`.
 */
type LevelDef = (typeof LEVELS)[number];

interface SimApi {
  critters: Critter[];
  bmp: TerrainBitmap;
  assign(c: Critter, skill: Skill): boolean;
  /** The player's escape hatch, exactly as the 💥 button drives it. */
  nuke(): void;
}

interface PlayOutcome {
  saved: number;
  /** Critters the level killed — deliberate detonations excluded, as in game.ts. */
  lost: number;
  /**
   * One line per loss: which critter, on what tick, where, and what it was
   * doing. Only ever read by the assertion message, and worth the field —
   * "lost 1 critter(s)" on a twenty-five level sweep is not enough to find the
   * one that fell, and this is how level 23's faller was traced to the tip of
   * an unfinished span rather than to the near lip.
   */
  lostAt?: string[];
  /** Tick the level resolved on, or null if it never did inside `maxTicks`. */
  endedAt: number | null;
  /**
   * The tick the level is *billed* for, which is what the end-of-level bonuses
   * are scored on (game.ts scores `finishLevel` on the same number): the ticks
   * that really elapsed, except on a run the player conceded, where the tick
   * they conceded on stands in so the standstill the hint asks them to sit
   * through does not eat the speed bonus.
   */
  ticks: number;
  /** `levelEnding`'s verdict, or null when nothing ended the level. */
  endedBy: LevelEnding | null;
  /** Whether the run reached its ending by the player conceding. */
  nuked: boolean;
}

/** game.ts's NUKE_INTERVAL: ticks between successive detonations in the chain. */
const NUKE_INTERVAL = 4;

function playLevel(
  level: LevelDef,
  strategy: (api: SimApi) => void,
  { interval = 24, maxTicks = 12000, nukeWhenStuck = true } = {}
): PlayOutcome {
  const bmp = buildLevel(level);
  // The same hand the browser deals, bomber reserve included — and, since the
  // reserve is only a real move if it goes off, the fuses below are counted down
  // and detonated here too.
  const stock = levelStock(level);
  let critters: Critter[] = [];
  let saved = 0;
  let lost = 0;
  const lostAt: string[] = [];
  const deliberate = new Set<number>();
  let spawned = 0;
  let spawnTimer = 0;
  let id = 1;
  let nuking = false;
  let nukeTimer = 0;
  let concededAt: number | null = null;
  const world: CritterWorld = {
    width: bmp.width,
    height: bmp.height,
    solid: (x, y) => bmp.solid(x, y),
    erodible: (x, y) => bmp.erodible(x, y),
    eraseRect: (x, y, w, h) => bmp.eraseRect(x, y, w, h),
    buildRow: (x, y, w) => bmp.buildRow(x, y, w),
    // Mirrors the game world's blocker footprint exactly (feet up, not below).
    blockerAt: (x, y) =>
      critters.some(
        c => c.state === 'blocker' && Math.abs(x - c.x) <= 2 && y <= c.y && y >= c.y - (CRITTER_H - 1)
      )
  };
  const assign = (c: Critter, skill: Skill) => {
    if (stock[skill] <= 0) return false;
    if (assignSkill(c, skill)) {
      stock[skill]--;
      return true;
    }
    return false;
  };
  /** game.ts's `detonate`: a real crater, and the critter is gone. */
  const detonate = (c: Critter) => {
    deliberate.add(c.id);
    c.alive = false;
    c.state = 'splatted';
    bmp.eraseCircle(c.x, Math.round(c.y - CRITTER_H / 2), 8);
  };

  const hatches = levelHatches(level);
  const stall = createStallWatch();
  const stockLeft = () => Object.values(stock).reduce((n, v) => n + v, 0);
  // The last tick the field moved, which is what a *conceded* level is billed
  // for. Every other ending is billed for the ticks that really elapsed.
  let billed = 0;
  /** game.ts's `startNuke`: no more spawns, and the billing clock stops here. */
  const nuke = () => {
    if (nuking) return;
    nuking = true;
    nukeTimer = 0;
    concededAt = billed;
    spawned = level.spawnCount;
  };
  for (let tick = 1; tick <= maxTicks; tick++) {
    if (nuking) {
      nukeTimer++;
      if (nukeTimer >= NUKE_INTERVAL) {
        nukeTimer = 0;
        const victim = critters.find(isActive);
        if (victim) detonate(victim);
      }
    } else if (spawned < level.spawnCount) {
      if (spawnTimer <= 0) {
        const h = hatches[spawned % hatches.length];
        critters.push(createCritter(id++, h.x, h.y, h.dir));
        spawned++;
        spawnTimer = interval;
      } else {
        spawnTimer--;
      }
    }
    strategy({ critters, bmp, assign, nuke });
    for (const c of critters) {
      if (!isActive(c)) continue;
      // A lit fuse burns down whatever the critter is doing and blows at zero,
      // exactly as game.ts's update does — a bomber the harness dealt itself but
      // never fired would be a skill that does nothing here and something in the
      // browser.
      if (c.fuse >= 0) {
        c.fuse--;
        if (c.fuse <= 0) {
          detonate(c);
          continue;
        }
      }
      const before = c.state;
      stepCritter(c, world);
      if (before !== 'splatted' && c.state === 'splatted' && !deliberate.has(c.id)) { lost++; lostAt.push(`id${c.id} tick${tick} @${c.x},${c.y} was=${before}`); }
      // A lit fuse is a commitment: game.ts refuses the rescue at the door.
      if (isActive(c) && c.fuse < 0 && atExit(c, level)) {
        c.state = 'exited';
        c.alive = false;
        saved++;
      }
    }
    critters = critters.filter(isActive);
    // The game's own end condition, called rather than copied (game.ts `update`
    // reaches this same function with these same facts).
    stall.observe({
      critters,
      saved,
      spawned,
      terrainVersion: bmp.version,
      stock: stockLeft()
    });
    billed = tick - stall.idleTicks;
    // The standstill ends nothing; it raises the on-screen hint, and this is the
    // player reading it and reaching for the button the hint names.
    if (nukeWhenStuck && stall.stuck) nuke();
    const endedBy = levelEnding({
      allOut: spawned >= level.spawnCount,
      onlyBlockersLeft: critters.every(c => c.state === 'blocker'),
      ticks: tick,
      timeLimit: level.timeLimit,
      conceded: nuking
    });
    if (endedBy) {
      // Billed as game.ts bills it: the ticks that really elapsed, or the tick
      // the player conceded on when they did. An authored clock running out is
      // billed for the whole clock, standstill or no standstill.
      return { saved, lost, lostAt, endedAt: tick, ticks: concededAt ?? tick, endedBy, nuked: nuking };
    }
  }
  return { saved, lost, lostAt, endedAt: null, ticks: concededAt ?? maxTicks, endedBy: null, nuked: nuking };
}

/**
 * Every playthrough asserts four things. The quota is the obvious one; the other
 * three are about the ending itself.
 *
 * The level has to *resolve*, and to resolve on the same terms the shipped game
 * uses — which it does by construction now that both call `levelEnding`, so a
 * strategy can no longer be certified here and cut off in the browser.
 *
 * It has to resolve *promptly*: `endedAt` is bounded well under the harness's
 * runaway guard, so a run that only limps home because the guard is generous
 * fails rather than passing on a technicality. The bound is the time it takes
 * the hint to appear plus a full playthrough's worth of ticks — the slowest
 * shipped solution at the slowest release rate the slider offers takes under
 * 2,000, so this is roomy without being meaningless.
 *
 * And it has to resolve *the way the test says it does*. The harness plays a
 * player who takes the stuck hint, so without this last assertion a strategy
 * that no longer solves its level would still pass: the crowd would freeze, the
 * simulated player would reach for the Nuke button, and a nuked level that
 * happens to have met its quota looks exactly like a solved one from the
 * outside. `nuked` is therefore pinned per test rather than left to chance:
 * `false` for a level the strategy genuinely walks empty, and explicitly
 * `STRANDS_A_CRITTER` for the eight that leave someone behind once the quota is
 * home.
 */
const RESOLVE_BY = STUCK_TICKS + 4000;

function expectCleared(level: LevelDef, outcome: PlayOutcome, { nuked = false } = {}): void {
  expect(outcome.endedAt).not.toBeNull();
  expect(outcome.endedAt).toBeLessThan(RESOLVE_BY);
  expect(outcome.saved).toBeGreaterThanOrEqual(level.needed);
  expect(outcome.nuked).toBe(nuked);
  // And the shipped solution earns the perfect bonus — on every level, which
  // is the whole of #280. The bonus used to ask for `saved >= spawnCount` and
  // ten of the twenty-five levels cannot pay that at all: eight strand a
  // critter behind terrain and two spend a blocker who then has nowhere to go,
  // so a third of the scoring ladder was unreachable content. It now asks that
  // the *level* killed nobody, which every solution here satisfies. Asserting
  // it inside the shared helper is deliberate: a rule that has to hold on all
  // twenty-five is worth more than a twenty-sixth test that says so once.
  const bonuses = levelBonuses({
    saved: outcome.saved,
    needed: level.needed,
    lost: outcome.lost,
    ticks: outcome.ticks,
    par: level.par
  });
  expect(bonuses.perfect, `lost ${outcome.lost} critter(s) to the level: ${JSON.stringify(outcome.lostAt)}`).toBe(PERFECT_BONUS);
}

/**
 * Eight of the twenty-five shipped solutions bring the quota home and then leave
 * a critter or two pacing a pocket they cannot climb out of, so the crowd's own
 * "everyone out, only blockers left" ending never matches and the run finishes
 * the way it finishes in the browser: the field freezes, the hint goes up, and
 * the player presses Nuke. Those tests say so out loud rather than letting the
 * nuke hide inside a green assertion. See "10 and 20" below for the diagnosis.
 */
const STRANDS_A_CRITTER = { nuked: true };

/** The speed bonus a run would be paid, scored exactly as `finishLevel` scores it. */
function timeBonusFor(level: LevelDef, outcome: PlayOutcome): number {
  return levelBonuses({
    saved: outcome.saved,
    needed: level.needed,
    lost: outcome.lost,
    ticks: outcome.ticks,
    par: level.par
  }).time;
}

describe('levels — solvable playthroughs', () => {
  it('1: reaches the exit by simply walking', () => {
    const outcome = playLevel(LEVELS[0], () => {});
    expectCleared(LEVELS[0], outcome);
  });

  it('2: a basher tunnels the wall for the whole crowd', () => {
    const outcome = playLevel(LEVELS[1], ({ critters, bmp, assign }) => {
      if (!bmp.solid(156, 158)) return; // tunnel already open
      if (critters.some(c => c.state === 'basher')) return;
      const w = critters.find(c => c.state === 'walker' && c.dir === 1 && c.x >= 140 && c.x <= 149);
      if (w) assign(w, 'basher');
    });
    expectCleared(LEVELS[1], outcome);
  });

  it('3: one builder ramps up to the ledge and the crowd follows', () => {
    let built = false;
    const outcome = playLevel(LEVELS[2], ({ critters, assign }) => {
      if (built) return;
      const w = critters.find(
        c => c.state === 'walker' && c.dir === 1 && c.y === 159 && c.x >= 226 && c.x <= 231
      );
      if (w && assign(w, 'builder')) built = true;
    });
    expectCleared(LEVELS[2], outcome, STRANDS_A_CRITTER);
  });

  it('4: a digger opens the floor and the crowd drops to the exit', () => {
    let dug = false;
    const outcome = playLevel(LEVELS[3], ({ critters, assign }) => {
      if (dug) return;
      const w = critters.find(c => c.state === 'walker' && c.y === 119);
      if (w && assign(w, 'digger')) dug = true;
    });
    expectCleared(LEVELS[3], outcome);
  });

  it('5: floaters survive the long drop', () => {
    const outcome = playLevel(LEVELS[4], ({ critters, assign }) => {
      for (const c of critters) {
        if (c.state === 'walker' && !c.floater && c.y === 59 && c.x < 108) assign(c, 'floater');
      }
    });
    expectCleared(LEVELS[4], outcome);
  });

  it('6: float down, bash across, build up — the finale chains three skills', () => {
    let built = false;
    const outcome = playLevel(LEVELS[5], ({ critters, bmp, assign }) => {
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
    expectCleared(LEVELS[5], outcome, STRANDS_A_CRITTER);
  });

  it('7: a blocker holds the crowd off the cliff while a digger drops them home', () => {
    let blocked = false;
    let dug = false;
    const outcome = playLevel(LEVELS[6], ({ critters, assign }) => {
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
    expectCleared(LEVELS[6], outcome);
  });

  it('8: build up onto the shelf, then bash through the wall to the exit', () => {
    let built = false;
    let bashed = false;
    const outcome = playLevel(LEVELS[7], ({ critters, assign }) => {
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
    expectCleared(LEVELS[7], outcome, STRANDS_A_CRITTER);
  });

  it('9: floaters ride the drop down, then a digger opens the chamber below', () => {
    let dug = false;
    const outcome = playLevel(LEVELS[8], ({ critters, assign }) => {
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
    expectCleared(LEVELS[8], outcome);
  });

  it('10: dig through the hall floor, then build up to the exit plinth', () => {
    let dug = false;
    let built = false;
    const outcome = playLevel(LEVELS[9], ({ critters, assign }) => {
      if (!dug) {
        const w = critters.find(
          c => c.state === 'walker' && c.y === 139 && c.x >= 100 && c.x <= 160
        );
        if (w && assign(w, 'digger')) dug = true;
      }
      if (dug && !built) {
        // Start the ramp so its top row meets the plinth surface (x0+16 ≥ 240
        // while clearing the plinth wall on the way up needs x0 ≤ 228).
        const w = critters.find(
          c => c.state === 'walker' && c.dir === 1 && c.y === 187 && c.x >= 224 && c.x <= 228
        );
        if (w && assign(w, 'builder')) built = true;
      }
    });
    expectCleared(LEVELS[9], outcome, STRANDS_A_CRITTER);
  });

  it('11: bash through the wall, then build up to the ledge beyond', () => {
    let bashed = false;
    let built = false;
    const outcome = playLevel(LEVELS[10], ({ critters, assign }) => {
      if (!bashed) {
        const w = critters.find(
          c => c.state === 'walker' && c.dir === 1 && c.y === 167 && c.x >= 143 && c.x <= 148
        );
        if (w && assign(w, 'basher')) bashed = true;
      }
      if (bashed && !built) {
        const w = critters.find(
          c => c.state === 'walker' && c.dir === 1 && c.y === 167 && c.x >= 237 && c.x <= 241
        );
        if (w && assign(w, 'builder')) built = true;
      }
    });
    expectCleared(LEVELS[10], outcome, STRANDS_A_CRITTER);
  });

  it('12: umbrellas into the pit, then a basher opens the right wall', () => {
    let bashed = false;
    const outcome = playLevel(LEVELS[11], ({ critters, assign }) => {
      for (const c of critters) {
        if (!c.floater && c.y < 160 && (c.state === 'walker' || c.state === 'faller')) {
          assign(c, 'floater');
        }
      }
      if (!bashed) {
        const w = critters.find(
          c => c.state === 'walker' && c.dir === 1 && c.y === 167 && c.x >= 144 && c.x <= 148
        );
        if (w && assign(w, 'basher')) bashed = true;
      }
    });
    expectCleared(LEVELS[11], outcome);
  });

  it('13: two hatches — both crowds simply walk to the shared middle door', () => {
    const outcome = playLevel(LEVELS[12], () => {});
    expectCleared(LEVELS[12], outcome);
  });

  // Timed levels are proven at interval 80 — the shipped release-slider
  // default (value 1 → (11-1)*8 ticks) — so the clock guarantee holds for a
  // player who never touches the slider, not just for a cranked release rate.
  const TRICKLE = { interval: 80 };

  it('14: beats the clock at the default trickle — a basher opens the wall in time', () => {
    const outcome = playLevel(
      LEVELS[13],
      ({ critters, bmp, assign }) => {
        if (!bmp.solid(156, 158)) return; // tunnel already open
        if (critters.some(c => c.state === 'basher')) return;
        const w = critters.find(
          c => c.state === 'walker' && c.dir === 1 && c.x >= 140 && c.x <= 149
        );
        if (w) assign(w, 'basher');
      },
      TRICKLE
    );
    expectCleared(LEVELS[13], outcome);
  });

  it('15: digs through the earth strip because the steel floor resists', () => {
    let dug = false;
    const outcome = playLevel(LEVELS[14], ({ critters, assign }) => {
      if (dug) return;
      // Only the strip beyond x=240 is earth; a dig there opens the way down.
      const w = critters.find(c => c.state === 'walker' && c.y === 119 && c.x >= 250 && c.x <= 290);
      if (w && assign(w, 'digger')) dug = true;
    });
    expectCleared(LEVELS[14], outcome);
  });

  it('15: proves the steel floor is a real wall — digging it saves no one', () => {
    // The counterfactual behind the hint: a digger dropped on the steel half
    // gives up on the spot, so nobody ever reaches the exit chamber.
    let dug = false;
    const outcome = playLevel(LEVELS[14], ({ critters, assign }) => {
      if (dug) return;
      const w = critters.find(c => c.state === 'walker' && c.y === 119 && c.x >= 100 && c.x <= 200);
      if (w && assign(w, 'digger')) dug = true;
    });
    expect(outcome.saved).toBe(0);
    // And with the crowd left pacing above the steel, nothing in the level's
    // own rules ends it — the player does, by taking the hint and conceding.
    expect(outcome.nuked).toBe(true);
  });

  it('16: ramps over the steel wall that bashers cannot dent', () => {
    let built = false;
    const outcome = playLevel(LEVELS[15], ({ critters, assign }) => {
      if (built) return;
      // The ramp must top the 8px steel stub before reaching it (x0 ≤ 142)
      // and still have bricks left to arrive there (x0 ≥ 138).
      const w = critters.find(
        c => c.state === 'walker' && c.dir === 1 && c.y === 159 && c.x >= 138 && c.x <= 142
      );
      if (w && assign(w, 'builder')) built = true;
    });
    expectCleared(LEVELS[15], outcome, STRANDS_A_CRITTER);
  });

  it('16: proves the steel wall is basher-proof — bashing alone saves no one', () => {
    const outcome = playLevel(LEVELS[15], ({ critters, assign }) => {
      for (const c of critters) {
        if (c.state === 'walker' && c.dir === 1 && c.x >= 144 && c.x <= 148) assign(c, 'basher');
      }
    });
    expect(outcome.saved).toBe(0);
    // And with the crowd left pacing at the steel, nothing in the level's own
    // rules ends it — the player does, by taking the hint and conceding.
    expect(outcome.nuked).toBe(true);
  });

  it('17: umbrellas for the high stream only — the low stream walks home', () => {
    const outcome = playLevel(LEVELS[16], ({ critters, assign }) => {
      for (const c of critters) {
        // Everything above y=100 came out of the high hatch and faces the
        // fatal cliff drop; the ground-level stream never needs a floater.
        if (!c.floater && c.y < 100 && (c.state === 'walker' || c.state === 'faller')) {
          assign(c, 'floater');
        }
      }
    });
    expectCleared(LEVELS[16], outcome);
  });

  it('18: a digger opens the earth seam that the steel floor denies', () => {
    let dug = false;
    const outcome = playLevel(LEVELS[17], ({ critters, assign }) => {
      if (dug) return;
      // Only the strip left of x=90 is earth; a dig there opens the way down,
      // and the swathe stays clear of the steel seam at x=90.
      const w = critters.find(c => c.state === 'walker' && c.y === 123 && c.x >= 30 && c.x <= 80);
      if (w && assign(w, 'digger')) dug = true;
    });
    expectCleared(LEVELS[17], outcome);
  });

  it('18: proves the steel floor is a real wall — digging it saves no one', () => {
    // The counterfactual behind the hint: a digger on the steel half gives up on
    // the spot, so nobody ever reaches the exit chamber below.
    let dug = false;
    const outcome = playLevel(LEVELS[17], ({ critters, assign }) => {
      if (dug) return;
      const w = critters.find(c => c.state === 'walker' && c.y === 123 && c.x >= 120 && c.x <= 220);
      if (w && assign(w, 'digger')) dug = true;
    });
    expect(outcome.saved).toBe(0);
    // And with the crowd left pacing above the steel, nothing in the level's
    // own rules ends it — the player does, by taking the hint and conceding.
    expect(outcome.nuked).toBe(true);
  });

  it('19: bridges the gap for the left crowd while the right crowd strolls in, on the clock', () => {
    let built = false;
    const outcome = playLevel(
      LEVELS[18],
      ({ critters, assign }) => {
        if (built) return;
        // Start the bridge just before the gap's lip so the tread run reaches
        // the far floor (x0+12 clears the gap while staying on solid ground).
        const w = critters.find(
          c => c.state === 'walker' && c.dir === 1 && c.y === 175 && c.x >= 125 && c.x <= 129
        );
        if (w && assign(w, 'builder')) built = true;
      },
      TRICKLE
    );
    expectCleared(LEVELS[18], outcome);
  });

  it('20: float down, bash through the wall, and build up to the door', () => {
    let bashed = false;
    let built = false;
    const outcome = playLevel(LEVELS[19], ({ critters, assign }) => {
      // Umbrellas anywhere above the shelf; they persist for the later hops.
      for (const c of critters) {
        if (!c.floater && c.y < 110 && (c.state === 'walker' || c.state === 'faller')) {
          assign(c, 'floater');
        }
      }
      if (!bashed) {
        const w = critters.find(
          c => c.state === 'walker' && c.dir === 1 && c.y === 179 && c.x >= 233 && c.x <= 237
        );
        if (w && assign(w, 'basher')) bashed = true;
      }
      if (bashed && !built) {
        // The tread run must reach past the plinth's left edge so the drop
        // off the bridge tip lands on the plinth, not beside it.
        const w = critters.find(
          c => c.state === 'walker' && c.dir === 1 && c.y === 179 && c.x >= 264 && c.x <= 268
        );
        if (w && assign(w, 'builder')) built = true;
      }
    });
    expectCleared(LEVELS[19], outcome, STRANDS_A_CRITTER);
  });

  it('21: umbrellas into the pan, then a digger drops the crowd home on the clock', () => {
    let dug = false;
    const outcome = playLevel(
      LEVELS[20],
      ({ critters, assign }) => {
        // Pop an umbrella on everything still high so the long drop never splats.
        for (const c of critters) {
          if (!c.floater && c.y < 130 && (c.state === 'walker' || c.state === 'faller')) {
            assign(c, 'floater');
          }
        }
        // Once they land on the pan, dig a central shaft down to the exit.
        if (!dug) {
          const w = critters.find(
            c => c.state === 'walker' && c.y === 149 && c.x >= 150 && c.x <= 170
          );
          if (w && assign(w, 'digger')) dug = true;
        }
      },
      TRICKLE
    );
    expectCleared(LEVELS[20], outcome);
  });

  it('22: one builder ramps the far bank of the valley and the crowd climbs out', () => {
    let built = false;
    const outcome = playLevel(LEVELS[21], ({ critters, assign }) => {
      if (built) return;
      // The valley floor sits a full staircase below the far plateau; start the
      // ramp a staircase-width before the plateau edge so its top meets the rim.
      const w = critters.find(
        c => c.state === 'walker' && c.dir === 1 && c.y === 159 && c.x >= 198 && c.x <= 202
      );
      if (w && assign(w, 'builder')) built = true;
    });
    expectCleared(LEVELS[21], outcome, STRANDS_A_CRITTER);
  });

  it('23: builders hand off at the tip until the span reaches the far bank', () => {
    // The gorge is bottomless, so a critter that walks off an unfinished span is
    // gone for good. The level hands out five builders for a bridge two can
    // *reach* across, and the spares are the answer: whoever arrives at the open
    // tip takes over rather than stepping off it. Played that way nobody is lost,
    // which is what the perfect bonus now asks for (#280) — the level's own note
    // once called the faller the price of the delay, and it is not one the player
    // has to pay.
    let first = false;
    const outcome = playLevel(
      LEVELS[22],
      ({ critters, assign }) => {
        // First bridge starts at the near bank's edge.
        if (!first) {
          const w = critters.find(
            c => c.state === 'walker' && c.dir === 1 && c.y === 159 && c.x >= 132 && c.x <= 138
          );
          if (w && assign(w, 'builder')) first = true;
        }
        // Anyone walking off the tip while the far bank is still out of reach
        // gets the next bag of bricks. `assign` refuses once the stock is gone,
        // so this cannot spend more than the level allows.
        if (first) {
          const tip = critters.find(
            c =>
              c.state === 'walker' && c.dir === 1 && c.y < 159 && c.x >= 146 && c.x < 160
          );
          if (tip) assign(tip, 'builder');
        }
      },
      TRICKLE
    );
    expectCleared(LEVELS[22], outcome);
  });

  it('23 played the cheap way meets the quota and loses the bonus', () => {
    // The other half of #280's goal. Making the bonus reachable everywhere is
    // only worth something if it can still be missed, so here is the same level
    // under the solution it used to ship with: hand the bricks over once and
    // walk away. The quota comes home either way, and the crowd is one short.
    let first = false;
    let second = false;
    const outcome = playLevel(
      LEVELS[22],
      ({ critters, assign }) => {
        if (!first) {
          const w = critters.find(
            c => c.state === 'walker' && c.dir === 1 && c.y === 159 && c.x >= 132 && c.x <= 138
          );
          if (w && assign(w, 'builder')) first = true;
        }
        if (first && !second) {
          const w = critters.find(
            c => c.state === 'walker' && c.dir === 1 && c.y < 155 && c.x >= 146
          );
          if (w && assign(w, 'builder')) second = true;
        }
      },
      TRICKLE
    );
    expect(outcome.saved).toBeGreaterThanOrEqual(LEVELS[22].needed);
    expect(outcome.lost).toBeGreaterThan(0);
    expect(
      levelBonuses({
        saved: outcome.saved,
        needed: LEVELS[22].needed,
        lost: outcome.lost,
        ticks: outcome.ticks,
        par: LEVELS[22].par
      }).perfect
    ).toBe(0);
  });

  it('24: the gauntlet — bash the earth wall left, build over the steel right, beat the clock', () => {
    let bashed = false;
    let built = false;
    const outcome = playLevel(
      LEVELS[23],
      ({ critters, assign }) => {
        if (!bashed) {
          // Close enough to the earth wall that the basher connects before its
          // patience runs out (six wall-less swings).
          const w = critters.find(
            c => c.state === 'walker' && c.dir === 1 && c.y === 179 && c.x >= 104 && c.x <= 108
          );
          if (w && assign(w, 'basher')) bashed = true;
        }
        if (!built) {
          // Mirrored ramp maths for the right crowd: top the steel stub before
          // reaching it (x0 ≥ 217) with bricks to spare (x0 ≤ 221).
          const w = critters.find(
            c => c.state === 'walker' && c.dir === -1 && c.y === 179 && c.x >= 217 && c.x <= 221
          );
          if (w && assign(w, 'builder')) built = true;
        }
      },
      TRICKLE
    );
    expectCleared(LEVELS[23], outcome);
  });

  it('25: the harder gauntlet — the right crowd ramps the steel and then bashes', () => {
    // What separates 25 from 24: the ramp over the steel stub does not reach the
    // door, it only drops the right crowd into a pocket behind a second earth
    // wall. Both bashers are spent, one a side, and the clock is 24's minus 300.
    let bashedLeft = false;
    let built = false;
    let bashedRight = false;
    const outcome = playLevel(
      LEVELS[24],
      ({ critters, assign }) => {
        if (!bashedLeft) {
          const w = critters.find(
            c => c.state === 'walker' && c.dir === 1 && c.y === 179 && c.x >= 104 && c.x <= 108
          );
          if (w && assign(w, 'basher')) bashedLeft = true;
        }
        if (!built) {
          // Same ramp maths as 24, carried 14px right with the stub.
          const w = critters.find(
            c => c.state === 'walker' && c.dir === -1 && c.y === 179 && c.x >= 231 && c.x <= 235
          );
          if (w && assign(w, 'builder')) built = true;
        }
        if (built && !bashedRight) {
          // Anyone who came over the ramp is now in the 190–214 pocket walking
          // at the second wall, well inside the basher's patience.
          const w = critters.find(
            c => c.state === 'walker' && c.dir === -1 && c.y === 179 && c.x >= 192 && c.x <= 201
          );
          if (w && assign(w, 'basher')) bashedRight = true;
        }
      },
      TRICKLE
    );
    expectCleared(LEVELS[24], outcome);
  });

  it('25 needs a third assignment where 24 needs two', () => {
    // The difficulty tiers claim 25 is a step up from 24. This is that claim as a
    // measurement rather than an authored number, and it is the claim the old data
    // could not support, because the two levels were the same level.
    //
    // Play 25 with the *shape* of 24's solution — bash the left wall, ramp the
    // right crowd over the steel — and it falls short, because on 25 the ramp only
    // drops that crowd into a pocket behind a second earth wall. The ramp window is
    // read off the level's own steel stub rather than pinned, so this stays a
    // statement about what the level asks and not about where a rect happens to sit:
    // give 25 back 24's geometry and the two assignments clear it, and this goes red.
    const steel = LEVELS[24].shapes.find(sh => sh.kind === 'rect' && sh.material === 'steel');
    expect(steel, '25 should still field a steel stub for the right crowd').toBeTruthy();
    const rampFrom = steel!.x + steel!.w - 1 + 8;

    let bashed = false;
    let built = false;
    const outcome = playLevel(
      LEVELS[24],
      ({ critters, assign }) => {
        if (!bashed) {
          const w = critters.find(
            c => c.state === 'walker' && c.dir === 1 && c.y === 179 && c.x >= 104 && c.x <= 108
          );
          if (w && assign(w, 'basher')) bashed = true;
        }
        if (!built) {
          const w = critters.find(
            c =>
              c.state === 'walker' &&
              c.dir === -1 &&
              c.y === 179 &&
              c.x >= rampFrom &&
              c.x <= rampFrom + 4
          );
          if (w && assign(w, 'builder')) built = true;
        }
      },
      TRICKLE
    );
    expect(bashed && built, 'both of 24\u2019s assignments should land on 25 too').toBe(true);
    expect(outcome.saved).toBeLessThan(LEVELS[24].needed);
  });
});

describe('levels — no level is ever unescapable', () => {
  // A crowd can run out of ways home without anyone dying: a walker pacing a
  // pocket it cannot climb out of is neither dead nor a blocker, so the "all
  // out, only blockers left" end condition never matches it. Ten of the levels
  // can reach that state, and the game deliberately does not end them — three
  // rounds of trying to tell "stuck" from "thinking" automatically each took a
  // run off a player who was still playing. What answers them instead is the
  // player: the game says the crowd looks stuck and names the Nuke button, and
  // the button always works. These tests prove both halves — that the levels
  // really are hung on their own (the diagnosis), and that the player's way out
  // always resolves them (the guarantee).

  /** Every level, played by nobody who ever reaches for the button. */
  const abandoned = () =>
    LEVELS.map(level => playLevel(level, () => {}, { nukeWhenStuck: false, maxTicks: 8000 }));

  it('ten of the twenty-five levels never resolve on their own', () => {
    // The diagnosis, kept as the record of which levels carry the underlying
    // terrain problem. Left to themselves, ten of them reach a state none of
    // their own rules answer for — no clock, no blockers, nobody dying — and
    // run until the harness's guard stops them. It is not a defect the fix
    // pretends away: those crowds genuinely cannot get home, and what changed is
    // that the player is now told so and handed the way out.
    //
    // If a terrain change frees one of these crowds the count moves, and the
    // number here should be re-measured rather than deleted.
    const hung = abandoned().filter(o => o.endedAt === null);
    expect(hung).toHaveLength(10);
    // And every one of them is genuinely stuck rather than merely slow: the
    // field had gone still long enough for the game to have raised the hint.
    for (const o of hung) expect(o.nuked).toBe(false);
  });

  it('every level, including all ten, is resolvable by the player', () => {
    // The guarantee itself, and the headline the fix now makes: a player who
    // takes the hint the game gives them ends the level, on every level, with no
    // input beyond the button. Nothing here waits on a clock the player cannot
    // see, and nothing ends a level the player has not ended.
    for (const level of LEVELS) {
      const outcome = playLevel(level, () => {});
      expect(outcome.endedAt).not.toBeNull();
      expect(outcome.endedAt).toBeLessThan(RESOLVE_BY);
    }
  });

  it('2: an untouched level hangs, and the hint fires before the nuke ends it', () => {
    // The issue's headline repro: level 2 needs a basher, so with no player
    // input at all every critter paces between the left wall and the pillar,
    // forever. Nothing in the level's own rules stops it, and nothing in the
    // game's does either — so it is still running when the guard trips.
    const abandonedRun = playLevel(LEVELS[1], () => {}, { nukeWhenStuck: false, maxTicks: 8000 });
    expect(abandonedRun.endedAt).toBeNull();
    expect(abandonedRun.saved).toBe(0);

    // The same level, played by someone who reads the hint. It ends — promptly,
    // and by their own hand.
    const escaped = playLevel(LEVELS[1], () => {});
    expect(escaped.nuked).toBe(true);
    expect(escaped.endedBy).toBe('settled');
    expect(escaped.endedAt).not.toBeNull();
    expect(escaped.endedAt).toBeLessThan(RESOLVE_BY);
    // The wait in front of the frozen field is not billed to the player: the
    // level is scored at the tick it last moved, a full window earlier.
    expect(escaped.endedAt! - escaped.ticks).toBeGreaterThanOrEqual(STUCK_TICKS);
  });

  it('10 and 20: a stranded critter no longer hangs a level that was already won', () => {
    // The worked example behind `STRANDS_A_CRITTER`. Both levels are cleared by
    // the builder placements the playthrough tests above aim at, and both leave
    // one critter pacing an 8px pocket afterwards
    // — quota met, crowd going nowhere, and skills still in hand, so the game
    // keeps offering the player the chance to go back for it, for as long as
    // they want. What ends it is the player, and because the level is billed at
    // the tick the field froze rather than the tick they conceded, the speed
    // bonus these two could never earn now pays. If a future terrain or skill
    // change frees that critter, `nuked` flips to false here and this
    // expectation should be updated rather than removed: the guarantee under
    // test is that the level ends, and is scored on the play rather than on the
    // wait.
    let dug = false;
    let built10 = false;
    const ten = playLevel(LEVELS[9], ({ critters, assign }) => {
      if (!dug) {
        const w = critters.find(c => c.state === 'walker' && c.y === 139 && c.x >= 100 && c.x <= 160);
        if (w && assign(w, 'digger')) dug = true;
      }
      if (dug && !built10) {
        const w = critters.find(
          c => c.state === 'walker' && c.dir === 1 && c.y === 187 && c.x >= 224 && c.x <= 228
        );
        if (w && assign(w, 'builder')) built10 = true;
      }
    });
    expect(ten.saved).toBeGreaterThanOrEqual(LEVELS[9].needed);
    expect(ten.nuked).toBe(true);
    expect(ten.endedBy).toBe('settled');
    expect(ten.endedAt).toBeLessThan(RESOLVE_BY);
    expect(ten.endedAt! - ten.ticks).toBeGreaterThanOrEqual(STUCK_TICKS);
    expect(timeBonusFor(LEVELS[9], ten)).toBeGreaterThan(0);

    let bashed = false;
    let built20 = false;
    const twenty = playLevel(LEVELS[19], ({ critters, assign }) => {
      for (const c of critters) {
        if (!c.floater && c.y < 110 && (c.state === 'walker' || c.state === 'faller')) {
          assign(c, 'floater');
        }
      }
      if (!bashed) {
        const w = critters.find(
          c => c.state === 'walker' && c.dir === 1 && c.y === 179 && c.x >= 233 && c.x <= 237
        );
        if (w && assign(w, 'basher')) bashed = true;
      }
      if (bashed && !built20) {
        const w = critters.find(
          c => c.state === 'walker' && c.dir === 1 && c.y === 179 && c.x >= 264 && c.x <= 268
        );
        if (w && assign(w, 'builder')) built20 = true;
      }
    });
    expect(twenty.saved).toBeGreaterThanOrEqual(LEVELS[19].needed);
    expect(twenty.nuked).toBe(true);
    expect(twenty.endedBy).toBe('settled');
    expect(twenty.endedAt).toBeLessThan(RESOLVE_BY);
    expect(twenty.endedAt! - twenty.ticks).toBeGreaterThanOrEqual(STUCK_TICKS);
    expect(timeBonusFor(LEVELS[19], twenty)).toBeGreaterThan(0);
  });

  it('an authored clock still ends its level, with nobody touching anything', () => {
    // A `timeLimit` is a race the level was designed around and the only ending
    // with a countdown on screen, so it must survive the rework: level 14 ends
    // at its clock (2,700) even when the player never reaches for the button.
    const timed = LEVELS[13];
    expect(timed.timeLimit).toBeDefined();
    const outcome = playLevel(timed, () => {}, { interval: 80, nukeWhenStuck: false });
    expect(outcome.endedAt).toBe(timed.timeLimit);
    expect(outcome.endedBy).toBe('clock');
    expect(outcome.nuked).toBe(false);
    // And it is billed for the whole clock. This crowd stands still for most of
    // it, so discounting the standstill would hand back time the countdown on
    // screen really burned — and hand back more of it the longer the player left
    // the field alone, which is worth points on a level whose par the clock
    // outlasts. game.ts scores `finishLevel` on this same number.
    expect(outcome.ticks).toBe(timed.timeLimit);
  });

  it('a lit bomber fuse really goes off, so the dealt reserve is a real move', () => {
    // The harness deals itself the same two-bomber reserve the browser grants,
    // which is only honest if it also burns the fuse down and detonates. Level 2
    // is the hung repro: spend a blast on the first critter out and the crowd is
    // one smaller and the terrain has a fresh crater, neither of which happens
    // if the fuse is merely handed out.
    let lit: Critter | null = null;
    let versionAtLight = -1;
    let versionAtEnd = -1;
    playLevel(
      LEVELS[1],
      ({ critters, bmp, assign }) => {
        if (!lit) {
          const c = critters.find(x => x.state === 'walker');
          if (c && assign(c, 'bomber')) {
            lit = c;
            versionAtLight = bmp.version;
          }
        }
        versionAtEnd = bmp.version;
      },
      { maxTicks: BOMBER_FUSE + 400, nukeWhenStuck: false }
    );
    expect(lit).not.toBeNull();
    expect(lit!.fuse).toBeLessThanOrEqual(0);
    expect(isActive(lit!)).toBe(false);
    expect(lit!.state).toBe('splatted');
    // The blast is a real crater, not just a retired critter.
    expect(versionAtEnd).toBeGreaterThan(versionAtLight);
  });
});

describe('stall — standstill detection', () => {
  const field = (critters: Critter[], over: Partial<FieldState> = {}): FieldState => ({
    critters,
    saved: 0,
    spawned: 1,
    terrainVersion: 0,
    stock: 0,
    ...over
  });

  it('never trips while a critter is covering new ground', () => {
    const c = createCritter(1, 4, 159, 1);
    const watch = createStallWatch();
    for (let t = 0; t < STUCK_TICKS * 2; t++) {
      c.x += 1;
      watch.observe(field([c]));
    }
    expect(watch.idleTicks).toBe(0);
    expect(watch.stuck).toBe(false);
  });

  it('trips one standstill window after a critter starts pacing a pocket', () => {
    const c = createCritter(1, 100, 159, 1);
    const watch = createStallWatch();
    let trippedAt: number | null = null;
    for (let t = 1; t <= STUCK_TICKS * 2 && trippedAt === null; t++) {
      // An eight-pixel pocket, walked end to end and back.
      c.x = 100 + Math.abs((t % 16) - 8);
      watch.observe(field([c]));
      if (watch.stuck) trippedAt = t;
    }
    // One lap to cover the pocket, then the window — and not a tick sooner.
    expect(trippedAt).toBeGreaterThan(STUCK_TICKS);
    expect(trippedAt).toBeLessThanOrEqual(STUCK_TICKS + 16);
  });

  it('starts the count over for a rescue, a terrain edit, or a skill spent', () => {
    const c = createCritter(1, 100, 159, 1);
    const watch = createStallWatch();
    const settle = () => {
      for (let t = 0; t < 50; t++) watch.observe(field([c]));
      expect(watch.idleTicks).toBeGreaterThan(0);
    };
    settle();
    watch.observe(field([c], { saved: 1 }));
    expect(watch.idleTicks).toBe(0);

    for (let t = 0; t < 50; t++) watch.observe(field([c], { saved: 1 }));
    watch.observe(field([c], { saved: 1, terrainVersion: 7 }));
    expect(watch.idleTicks).toBe(0);

    for (let t = 0; t < 50; t++) watch.observe(field([c], { saved: 1, terrainVersion: 7 }));
    watch.observe(field([c], { saved: 1, terrainVersion: 7, stock: 3 }));
    expect(watch.idleTicks).toBe(0);
  });

  it('forgets everything when a level loads', () => {
    const c = createCritter(1, 100, 159, 1);
    const watch = createStallWatch();
    for (let t = 0; t <= STUCK_TICKS; t++) watch.observe(field([c]));
    expect(watch.stuck).toBe(true);
    watch.reset();
    expect(watch.idleTicks).toBe(0);
    expect(watch.stuck).toBe(false);
  });
});

describe('stall — the end-of-level verdict', () => {
  /** A level mid-play: everyone out, crowd still walking, no authored clock. */
  const state = (over: Partial<EndConditionState> = {}): EndConditionState => ({
    allOut: true,
    onlyBlockersLeft: false,
    ticks: 1000,
    conceded: false,
    ...over
  });

  it('says nothing while the level is still being played', () => {
    expect(levelEnding(state())).toBeNull();
    // Nor while the hatch is still emptying.
    expect(levelEnding(state({ allOut: false }))).toBeNull();
  });

  it('settles a crowd that is all blockers, ahead of every other ending', () => {
    expect(levelEnding(state({ onlyBlockersLeft: true }))).toBe('settled');
    // Even on the exact tick an authored clock expires: the crowd resolved, so
    // the result should not read as a race lost.
    expect(
      levelEnding(state({ onlyBlockersLeft: true, ticks: 2700, timeLimit: 2700 }))
    ).toBe('settled');
  });

  it('never ends an untimed level, however long it has gone nowhere', () => {
    // The load-bearing negative, and the whole change of approach. Three
    // automatic endings lived here in turn, and each one took a run off a player
    // who was still playing: a hidden clock, then a standstill window, then a
    // stock-gated window with a minute-long backstop that ended the run and
    // submitted it. Nothing may end an untimed level but the crowd resolving or
    // the player conceding, so a level left running for an hour is still open.
    expect(levelEnding(state({ ticks: 60 * 60 * 60 }))).toBeNull();
  });

  it('ends a timed level on its clock, and only a timed one', () => {
    expect(levelEnding(state({ ticks: 2699, timeLimit: 2700 }))).toBeNull();
    expect(levelEnding(state({ ticks: 2700, timeLimit: 2700 }))).toBe('clock');
    expect(levelEnding(state({ ticks: 100000 }))).toBeNull();
  });

  it('stands the clock down once the player has conceded', () => {
    // The nuke chain is already ending the level; a timeout framing would coach
    // them to speed up instead of reading as the failure they chose.
    expect(levelEnding(state({ ticks: 2700, timeLimit: 2700, conceded: true }))).toBeNull();
  });

  it('settles the empty field a nuke leaves behind', () => {
    // The player's escape hatch resolves the level through the ordinary crowd
    // ending: once the chain has cleared the field there is nobody left who is
    // not a blocker, so `settled` answers even though the player conceded.
    expect(levelEnding(state({ onlyBlockersLeft: true, conceded: true }))).toBe('settled');
  });
});

describe('score — combos', () => {
  it('pays the base amount for an isolated rescue', () => {
    const c = comboOnRescue(newCombo(), 100);
    expect(c.streak).toBe(1);
    expect(rescuePoints(c.streak)).toBe(RESCUE_POINTS);
  });

  it('chains rescues inside the window and pays more per link', () => {
    let c = comboOnRescue(newCombo(), 100);
    c = comboOnRescue(c, 100 + COMBO_WINDOW);
    expect(c.streak).toBe(2);
    expect(rescuePoints(c.streak)).toBe(RESCUE_POINTS + COMBO_STEP);
    c = comboOnRescue(c, 100 + COMBO_WINDOW + 10);
    expect(c.streak).toBe(3);
    expect(rescuePoints(c.streak)).toBe(RESCUE_POINTS + 2 * COMBO_STEP);
  });

  it('resets the streak when the window lapses', () => {
    let c = comboOnRescue(newCombo(), 100);
    c = comboOnRescue(c, 100 + COMBO_WINDOW + 1);
    expect(c.streak).toBe(1);
  });

  it('caps the per-link bonus at COMBO_MAX_STREAK', () => {
    expect(rescuePoints(COMBO_MAX_STREAK)).toBe(
      RESCUE_POINTS + (COMBO_MAX_STREAK - 1) * COMBO_STEP
    );
    expect(rescuePoints(COMBO_MAX_STREAK + 10)).toBe(rescuePoints(COMBO_MAX_STREAK));
  });
});

describe('score — end-of-level bonuses', () => {
  const base = { saved: 5, needed: 5, lost: 0, ticks: 1000, par: 2000 };

  it('pays nothing on a failed quota', () => {
    const b = levelBonuses({ ...base, saved: 4 });
    expect(b).toEqual({ time: 0, perfect: 0, overQuota: 0, total: 0 });
  });

  it('scales the time bonus linearly down to zero at par', () => {
    expect(levelBonuses({ ...base, ticks: 0 }).time).toBe(TIME_BONUS_MAX);
    expect(levelBonuses({ ...base, ticks: 1000 }).time).toBe(TIME_BONUS_MAX / 2);
    expect(levelBonuses({ ...base, ticks: 2000 }).time).toBe(0);
    expect(levelBonuses({ ...base, ticks: 5000 }).time).toBe(0);
  });

  it('pays the perfect bonus only when the level killed nobody', () => {
    expect(levelBonuses({ ...base, lost: 0 }).perfect).toBe(PERFECT_BONUS);
    expect(levelBonuses({ ...base, lost: 1 }).perfect).toBe(0);
  });

  it('pays per rescue beyond the quota', () => {
    expect(levelBonuses({ ...base, saved: 8 }).overQuota).toBe(3 * OVER_QUOTA_POINTS);
    expect(levelBonuses({ ...base, saved: 5 }).overQuota).toBe(0);
  });

  it('totals the three bonuses', () => {
    const b = levelBonuses({ ...base, saved: 10, ticks: 0 });
    expect(b.total).toBe(b.time + b.perfect + b.overQuota);
    expect(b.total).toBe(TIME_BONUS_MAX + PERFECT_BONUS + 5 * OVER_QUOTA_POINTS);
  });
});
