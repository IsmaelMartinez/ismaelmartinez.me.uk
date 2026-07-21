import { describe, it, expect } from 'vitest';
import { gridNeighbours, chebyshev } from '../../src/games/engine/grid2d';
import { rotatedDims, rotateTile, unrotateTile, rotatePoint } from '../../src/games/engine/iso';
import {
  CITY_W,
  CITY_H,
  MAX_LEVEL,
  DENSE_LEVEL,
  BRIDGE_COST,
  FILL_COST,
  createCity,
  canBuild,
  buildCost,
  build,
  cityIdx,
  TOOL_COSTS
} from '../../src/games/city/tiles';
import {
  carveRiver,
  carveLakes,
  carveCoast,
  plantForests,
  generateTerrain,
  type WaterStyle
} from '../../src/games/city/terrain';
import {
  computePowered,
  computeFireCover,
  roadAdjacent,
  cityStats,
  computeDemand,
  hasNatureNearby,
  hasSchoolNearby,
  growthStep,
  maxZoneLevel,
  POWER_RADIUS,
  RESIDENTS_PER_LEVEL,
  DENSITY_UNLOCK_POP,
  DENSE_DEMAND_MIN
} from '../../src/games/city/simulation';
import { monthlyIncome, monthlyExpenses } from '../../src/games/city/budget';
import { targetCarCount, spawnCar, stepCar } from '../../src/games/city/traffic';
import {
  isFlammable,
  ignitionChance,
  startFire,
  stepFires,
  rollEvent,
  sumDemandModifiers,
  CITY_EVENTS,
  BURN_TICKS,
  BURN_TICKS_COVERED,
  EXTINGUISH_CHANCE,
  EVENT_GRACE_MONTHS,
  disasterIntensity,
  DISASTER_GRACE_MONTHS,
  tornadoChance,
  spawnTornado,
  stepTornado,
  wreckTile,
  TORNADO_TICKS,
  quakeChance,
  earthquakeDamage,
  QUAKE_RADIUS,
  type Fire,
  type Tornado
} from '../../src/games/city/disasters';
import { seededRandom } from './seeded-random';

describe('engine grid2d', () => {
  it('respects grid edges for neighbours', () => {
    expect(gridNeighbours(0, 4, 3).sort()).toEqual([1, 4]);
    expect(gridNeighbours(5, 4, 3).sort((a, b) => a - b)).toEqual([1, 4, 6, 9]);
    expect(gridNeighbours(11, 4, 3).sort((a, b) => a - b)).toEqual([7, 10]);
  });

  it('computes chessboard distance', () => {
    const a = cityIdx(3, 3);
    expect(chebyshev(a, cityIdx(3, 3), CITY_W)).toBe(0);
    expect(chebyshev(a, cityIdx(6, 4), CITY_W)).toBe(3);
    expect(chebyshev(a, cityIdx(4, 8), CITY_W)).toBe(5);
  });
});

describe('city tiles', () => {
  it('creates an empty city', () => {
    const tiles = createCity();
    expect(tiles).toHaveLength(CITY_W * CITY_H);
    expect(tiles.every(t => t.type === 'empty' && t.level === 0)).toBe(true);
  });

  it('builds only on empty land and bulldozes only structures', () => {
    const tiles = createCity();
    expect(canBuild(tiles, 2, 2, 'res')).toBe(true);
    expect(canBuild(tiles, 2, 2, 'bulldoze')).toBe(false);
    build(tiles, 2, 2, 'res');
    expect(canBuild(tiles, 2, 2, 'road')).toBe(false);
    expect(canBuild(tiles, 2, 2, 'bulldoze')).toBe(true);
    build(tiles, 2, 2, 'bulldoze');
    expect(tiles[cityIdx(2, 2)].type).toBe('empty');
  });

  it('bulldozing a developed zone resets its level', () => {
    const tiles = createCity();
    build(tiles, 2, 2, 'res');
    tiles[cityIdx(2, 2)].level = 3;
    build(tiles, 2, 2, 'bulldoze');
    expect(tiles[cityIdx(2, 2)].level).toBe(0);
  });

  it('prices every tool', () => {
    expect(TOOL_COSTS.power).toBe(500);
    expect(TOOL_COSTS.bulldoze).toBe(0);
  });
});

describe('city simulation', () => {
  it('powers tiles within the plant radius only', () => {
    const tiles = createCity();
    build(tiles, 5, 5, 'power');
    const powered = computePowered(tiles);
    expect(powered[cityIdx(5, 5)]).toBe(true);
    expect(powered[cityIdx(5 + POWER_RADIUS, 5)]).toBe(true);
    expect(powered[cityIdx(5 + POWER_RADIUS + 1, 5)]).toBe(false);
  });

  it('detects road adjacency', () => {
    const tiles = createCity();
    build(tiles, 3, 3, 'road');
    expect(roadAdjacent(tiles, cityIdx(4, 3))).toBe(true);
    expect(roadAdjacent(tiles, cityIdx(5, 3))).toBe(false);
  });

  it('aggregates population and jobs from zone levels', () => {
    const tiles = createCity();
    build(tiles, 1, 1, 'res');
    tiles[cityIdx(1, 1)].level = 2;
    build(tiles, 2, 1, 'com');
    tiles[cityIdx(2, 1)].level = 1;
    build(tiles, 3, 1, 'ind');
    tiles[cityIdx(3, 1)].level = 3;
    const stats = cityStats(tiles);
    expect(stats.population).toBe(2 * RESIDENTS_PER_LEVEL);
    expect(stats.jobs).toBe(6 + 24);
  });

  it('bootstraps a fresh city with residential demand only', () => {
    const demand = computeDemand(cityStats(createCity()));
    expect(demand.res).toBeGreaterThan(0);
    expect(demand.com).toBeLessThanOrEqual(0);
    expect(demand.ind).toBeLessThanOrEqual(0);
  });

  it('grows a serviced residential zone when demand is positive', () => {
    const tiles = createCity();
    build(tiles, 5, 5, 'power');
    build(tiles, 6, 6, 'road');
    build(tiles, 6, 5, 'res');
    const result = growthStep(tiles, () => 0); // random()=0 < growth probability
    expect(tiles[cityIdx(6, 5)].level).toBe(1);
    expect(result.grown).toEqual([cityIdx(6, 5)]);
    expect(result.decayed).toEqual([]);
  });

  it('does not grow zones without road or power', () => {
    const tiles = createCity();
    build(tiles, 5, 5, 'power');
    build(tiles, 6, 5, 'res'); // powered but no road
    build(tiles, 20, 12, 'road');
    build(tiles, 21, 12, 'res'); // road but unpowered
    growthStep(tiles, () => 0.99);
    expect(tiles[cityIdx(6, 5)].level).toBe(0);
    expect(tiles[cityIdx(21, 12)].level).toBe(0);

    // random()=0 also triggers decay of unserviced developed zones
    tiles[cityIdx(21, 12)].level = 2;
    growthStep(tiles, () => 0);
    expect(tiles[cityIdx(21, 12)].level).toBe(1);
  });

  it('gates level-2 residential on nearby nature (park, forest, or water)', () => {
    const tiles = createCity();
    build(tiles, 5, 5, 'power');
    build(tiles, 6, 6, 'road');
    build(tiles, 6, 5, 'res');
    tiles[cityIdx(6, 5)].level = 1;
    // Big job surplus to guarantee positive res demand
    build(tiles, 7, 6, 'ind');
    tiles[cityIdx(7, 6)].level = 3;
    growthStep(tiles, () => 0);
    expect(tiles[cityIdx(6, 5)].level).toBe(1);
    tiles[cityIdx(5, 4)].type = 'tree'; // forest counts as nature
    growthStep(tiles, () => 0);
    expect(tiles[cityIdx(6, 5)].level).toBe(2);
  });

  it('gates top-level residential on a nearby school', () => {
    const tiles = createCity();
    build(tiles, 5, 5, 'power');
    build(tiles, 6, 6, 'road');
    build(tiles, 6, 5, 'res');
    build(tiles, 5, 4, 'park');
    tiles[cityIdx(6, 5)].level = MAX_LEVEL - 1;
    build(tiles, 7, 6, 'ind');
    tiles[cityIdx(7, 6)].level = 3;
    growthStep(tiles, () => 0);
    expect(tiles[cityIdx(6, 5)].level).toBe(MAX_LEVEL - 1);
    build(tiles, 3, 3, 'school');
    growthStep(tiles, () => 0);
    expect(tiles[cityIdx(6, 5)].level).toBe(MAX_LEVEL);
  });

  it('detects nature and school coverage by radius', () => {
    const tiles = createCity();
    tiles[cityIdx(4, 4)].type = 'water';
    expect(hasNatureNearby(tiles, cityIdx(6, 6))).toBe(true);
    expect(hasNatureNearby(tiles, cityIdx(8, 8))).toBe(false);
    // Bridging the water keeps the riverfront bonus
    build(tiles, 4, 4, 'road');
    expect(tiles[cityIdx(4, 4)].type).toBe('bridge');
    expect(hasNatureNearby(tiles, cityIdx(6, 6))).toBe(true);
    build(tiles, 10, 10, 'school');
    expect(hasSchoolNearby(tiles, cityIdx(12, 12))).toBe(true);
    expect(hasSchoolNearby(tiles, cityIdx(0, 0))).toBe(false);
  });

  it('applies event demand modifiers before clamping', () => {
    const stats = cityStats(createCity());
    const base = computeDemand(stats);
    const boosted = computeDemand(stats, { com: 30, ind: -10 });
    expect(boosted.com).toBe(base.com + 30);
    expect(boosted.ind).toBe(base.ind - 10);
    expect(computeDemand(stats, { res: 500 }).res).toBe(50); // still clamped
  });
});

describe('city terrain', () => {
  it('carves a river that reaches both edges without gaps', () => {
    const tiles = createCity();
    carveRiver(tiles, seededRandom(7));
    const waterInColumn = (x: number) =>
      Array.from({ length: CITY_H }, (_, y) => tiles[cityIdx(x, y)].type).filter(t => t === 'water').length;
    for (let x = 0; x < CITY_W; x++) expect(waterInColumn(x)).toBeGreaterThan(0);
  });

  it('plants forests only on empty land', () => {
    const tiles = createCity();
    carveRiver(tiles, seededRandom(3));
    const waterBefore = tiles.filter(t => t.type === 'water').length;
    plantForests(tiles, seededRandom(9));
    expect(tiles.filter(t => t.type === 'water').length).toBe(waterBefore);
    expect(tiles.filter(t => t.type === 'tree').length).toBeGreaterThan(0);
  });

  it('carves a vertical river that reaches top and bottom without gaps', () => {
    const tiles = createCity();
    carveRiver(tiles, seededRandom(7), true);
    const waterInRow = (y: number) =>
      Array.from({ length: CITY_W }, (_, x) => tiles[cityIdx(x, y)].type).filter(t => t === 'water').length;
    for (let y = 0; y < CITY_H; y++) expect(waterInRow(y)).toBeGreaterThan(0);
  });

  it('grows lakes of a sensible size', () => {
    for (const seed of [1, 8, 15, 22, 29]) {
      const tiles = createCity();
      carveLakes(tiles, seededRandom(seed));
      const water = tiles.filter(t => t.type === 'water').length;
      expect(water).toBeGreaterThanOrEqual(6);
      expect(water).toBeLessThanOrEqual(30);
    }
  });

  it('floods a single edge with a coastline', () => {
    for (const seed of [2, 9, 16, 23, 30]) {
      const tiles = createCity();
      carveCoast(tiles, seededRandom(seed));
      const water: { x: number; y: number }[] = [];
      tiles.forEach((t, i) => {
        if (t.type === 'water') water.push({ x: i % CITY_W, y: Math.floor(i / CITY_W) });
      });
      expect(water.length).toBeGreaterThanOrEqual(Math.min(CITY_W, CITY_H));
      // Every water tile hugs a board edge (coast depth never exceeds 4).
      for (const { x, y } of water) {
        const edgeDist = Math.min(x, y, CITY_W - 1 - x, CITY_H - 1 - y);
        expect(edgeDist).toBeLessThan(4);
      }
    }
  });

  it('generates deterministic terrain from a seeded random', () => {
    const a = createCity();
    const b = createCity();
    generateTerrain(a, seededRandom(11));
    generateTerrain(b, seededRandom(11));
    expect(a).toEqual(b);
  });

  it('rolls varied water styles while always leaving plenty of buildable land', () => {
    const styles = new Set<WaterStyle>();
    // Seeds spread by a large prime: the LCG's first draw (the style roll)
    // barely moves across small consecutive seeds.
    for (let seed = 1; seed <= 40; seed++) {
      const tiles = createCity();
      styles.add(generateTerrain(tiles, seededRandom(seed * 104729)));
      const water = tiles.filter(t => t.type === 'water').length;
      const empty = tiles.filter(t => t.type === 'empty').length;
      expect(water).toBeGreaterThanOrEqual(6);
      expect(water).toBeLessThanOrEqual(100);
      expect(empty).toBeGreaterThanOrEqual(180);
    }
    expect(styles).toEqual(new Set(['river', 'lake', 'coast']));
  });
});

describe('city bridges', () => {
  it('allows only roads on water, priced as bridges', () => {
    const tiles = createCity();
    tiles[cityIdx(4, 4)].type = 'water';
    expect(canBuild(tiles, 4, 4, 'res')).toBe(false);
    expect(canBuild(tiles, 4, 4, 'park')).toBe(false);
    expect(canBuild(tiles, 4, 4, 'bulldoze')).toBe(false);
    expect(canBuild(tiles, 4, 4, 'road')).toBe(true);
    expect(buildCost(tiles, 4, 4, 'road')).toBe(BRIDGE_COST);
    expect(buildCost(tiles, 5, 4, 'road')).toBe(TOOL_COSTS.road);
  });

  it('builds bridges over water and restores water when demolished', () => {
    const tiles = createCity();
    tiles[cityIdx(4, 4)].type = 'water';
    build(tiles, 4, 4, 'road');
    expect(tiles[cityIdx(4, 4)].type).toBe('bridge');
    expect(roadAdjacent(tiles, cityIdx(5, 4))).toBe(true);
    build(tiles, 4, 4, 'bulldoze');
    expect(tiles[cityIdx(4, 4)].type).toBe('water');
  });

  it('lets cars drive across bridges', () => {
    const tiles = createCity();
    build(tiles, 3, 3, 'road');
    tiles[cityIdx(4, 3)].type = 'bridge';
    build(tiles, 5, 3, 'road');
    const random = seededRandom(5);
    const car = spawnCar(tiles, random)!;
    expect(car).not.toBeNull();
    for (let i = 0; i < 100; i++) expect(stepCar(tiles, car, 0.1, random)).toBe(true);
  });

  it('only allows filling water, priced flat', () => {
    const tiles = createCity();
    tiles[cityIdx(4, 4)].type = 'water';
    expect(canBuild(tiles, 4, 4, 'fill')).toBe(true);
    expect(canBuild(tiles, 5, 4, 'fill')).toBe(false); // empty land, nothing to fill
    expect(buildCost(tiles, 4, 4, 'fill')).toBe(FILL_COST);
  });

  it('permanently converts filled water to empty land', () => {
    const tiles = createCity();
    tiles[cityIdx(4, 4)].type = 'water';
    build(tiles, 4, 4, 'fill');
    expect(tiles[cityIdx(4, 4)].type).toBe('empty');
    expect(canBuild(tiles, 4, 4, 'res')).toBe(true);
    // Unlike a bridge, bulldozing filled land does not bring the river back
    expect(canBuild(tiles, 4, 4, 'bulldoze')).toBe(false);
  });
});

describe('city disasters', () => {
  function firePlayground() {
    const tiles = createCity();
    build(tiles, 5, 5, 'ind');
    tiles[cityIdx(5, 5)].level = 2;
    build(tiles, 6, 5, 'res');
    tiles[cityIdx(6, 5)].level = 1;
    tiles[cityIdx(5, 6)].type = 'tree';
    return tiles;
  }

  it('classifies flammable tiles', () => {
    const tiles = firePlayground();
    expect(isFlammable(tiles[cityIdx(5, 5)])).toBe(true); // developed industry
    expect(isFlammable(tiles[cityIdx(5, 6)])).toBe(true); // tree
    expect(isFlammable({ type: 'school', level: 0 })).toBe(true);
    expect(isFlammable({ type: 'firehouse', level: 0 })).toBe(true);
    expect(isFlammable({ type: 'res', level: 0 })).toBe(false); // undeveloped zone
    expect(isFlammable({ type: 'road', level: 0 })).toBe(false);
    expect(isFlammable({ type: 'water', level: 0 })).toBe(false);
    expect(isFlammable({ type: 'power', level: 0 })).toBe(false); // fireproof by design
  });

  it('burns civic buildings down to rubble', () => {
    const tiles = createCity();
    build(tiles, 5, 5, 'school');
    const cover = tiles.map(() => false);
    const result = stepFires(tiles, [{ idx: cityIdx(5, 5), ticks: 1 }], cover, () => 0.999);
    expect(result.burnedOut).toEqual([cityIdx(5, 5)]);
    expect(tiles[cityIdx(5, 5)].type).toBe('rubble');
  });

  it('scales ignition chance with flammable tiles, halved under fire cover', () => {
    const empty = createCity();
    expect(ignitionChance(empty, empty.map(() => false))).toBe(0);
    const tiles = firePlayground();
    // ind level 2 weighs 3, res level 1 and tree weigh 1 each
    expect(ignitionChance(tiles, tiles.map(() => false))).toBeCloseTo(5 * 0.0004);
    expect(ignitionChance(tiles, tiles.map(() => true))).toBeCloseTo(2.5 * 0.0004);
  });

  it('starts fires on flammable tiles, burning shorter under fire cover', () => {
    const tiles = firePlayground();
    const noCover = tiles.map(() => false);
    const fire = startFire(tiles, noCover, () => 0)!;
    expect(isFlammable(tiles[fire.idx])).toBe(true);
    expect(fire.ticks).toBe(BURN_TICKS);
    const covered = tiles.map(() => true);
    expect(startFire(tiles, covered, () => 0)!.ticks).toBe(BURN_TICKS_COVERED);
    expect(startFire(createCity(), noCover, () => 0)).toBeNull();
  });

  it('spreads to flammable neighbours and burns tiles down', () => {
    const tiles = firePlayground();
    const cover = tiles.map(() => false);
    let fires: Fire[] = [{ idx: cityIdx(5, 5), ticks: 1 }];
    // random()=0 → guaranteed spread to both flammable neighbours; the
    // source burns out this tick and leaves rubble.
    const result = stepFires(tiles, fires, cover, () => 0);
    expect(result.burnedOut).toEqual([cityIdx(5, 5)]);
    expect(tiles[cityIdx(5, 5)].type).toBe('rubble');
    expect(tiles[cityIdx(5, 5)].level).toBe(0);
    expect(result.spread.sort((a, b) => a - b)).toEqual([cityIdx(6, 5), cityIdx(5, 6)].sort((a, b) => a - b));
    expect(result.fires).toHaveLength(2);

    // Burn everything down: trees vanish, buildings leave rubble
    fires = result.fires;
    for (let i = 0; i < BURN_TICKS + 1; i++) {
      fires = stepFires(tiles, fires, cover, () => 0.999).fires;
    }
    expect(fires).toHaveLength(0);
    expect(tiles[cityIdx(6, 5)].type).toBe('rubble');
    expect(tiles[cityIdx(5, 6)].type).toBe('empty');
  });

  it('dampens spread when either side of the boundary has fire cover', () => {
    const tiles = firePlayground();
    // Cover the flammable neighbours but not the burning source, so the fire
    // isn't simply put out — the covered boundary should still dampen the jump.
    const cover = tiles.map((_, i) => i === cityIdx(6, 5) || i === cityIdx(5, 6));
    // 0.15 sits between SPREAD_CHANCE_COVERED (0.08) and SPREAD_CHANCE (0.22):
    // without the neighbour-side dampening the fire would jump
    const result = stepFires(tiles, [{ idx: cityIdx(5, 5), ticks: 5 }], cover, () => 0.15);
    expect(result.spread).toEqual([]);
    const uncovered = tiles.map(() => false);
    const unprotected = stepFires(tiles, [{ idx: cityIdx(5, 5), ticks: 5 }], uncovered, () => 0.15);
    expect(unprotected.spread.length).toBeGreaterThan(0);
  });

  it('sends fire crews to put covered fires out, sparing the tile', () => {
    const tiles = firePlayground();
    const covered = tiles.map(() => true);
    // A roll below EXTINGUISH_CHANCE means the crews reach it this tick: the
    // fire is out, the tile untouched, and a fire being fought never spreads.
    const roll = EXTINGUISH_CHANCE / 2;
    const out = stepFires(tiles, [{ idx: cityIdx(5, 5), ticks: 5 }], covered, () => roll);
    expect(out.extinguished).toEqual([cityIdx(5, 5)]);
    expect(out.fires).toEqual([]);
    expect(out.burnedOut).toEqual([]);
    expect(out.spread).toEqual([]);
    expect(tiles[cityIdx(5, 5)].type).toBe('ind'); // saved, not burnt to rubble
    expect(tiles[cityIdx(5, 5)].level).toBe(2);

    // A roll at/above the chance means the crews miss it this tick: it behaves
    // like an ordinary covered fire and just loses one tick.
    const missed = stepFires(tiles, [{ idx: cityIdx(5, 5), ticks: 5 }], covered, () => 0.999);
    expect(missed.extinguished).toEqual([]);
    expect(missed.fires).toEqual([{ idx: cityIdx(5, 5), ticks: 4 }]);

    // An uncovered fire gets no help and always burns to the end.
    const uncovered = tiles.map(() => false);
    const doomed = stepFires(tiles, [{ idx: cityIdx(5, 5), ticks: 1 }], uncovered, () => roll);
    expect(doomed.extinguished).toEqual([]);
    expect(doomed.burnedOut).toEqual([cityIdx(5, 5)]);
  });

  it('protects a just-extinguished tile from same-tick reignition by a neighbour', () => {
    const tiles = firePlayground();
    // Two adjacent fires: the industry tile is covered (crews reach it), the
    // residential neighbour is not (it keeps burning and tries to spread).
    const cover = tiles.map((_, i) => i === cityIdx(5, 5));
    // random()=0 extinguishes the covered fire and would spread the uncovered
    // one to every flammable neighbour — including the tile just put out.
    const result = stepFires(
      tiles,
      [{ idx: cityIdx(5, 5), ticks: 5 }, { idx: cityIdx(6, 5), ticks: 5 }],
      cover,
      () => 0
    );
    expect(result.extinguished).toContain(cityIdx(5, 5));
    // The neighbour must not reignite the saved tile the same tick.
    expect(result.spread).not.toContain(cityIdx(5, 5));
    expect(result.fires.some(f => f.idx === cityIdx(5, 5))).toBe(false);
    expect(tiles[cityIdx(5, 5)].type).toBe('ind'); // saved, still standing
  });

  it('never spreads when random rolls high, and drops bulldozed fires', () => {
    const tiles = firePlayground();
    const cover = tiles.map(() => false);
    const result = stepFires(tiles, [{ idx: cityIdx(5, 5), ticks: 5 }], cover, () => 0.999);
    expect(result.spread).toEqual([]);
    expect(result.fires).toHaveLength(1);

    build(tiles, 5, 5, 'bulldoze');
    const after = stepFires(tiles, result.fires, cover, () => 0);
    expect(after.fires).toEqual([]);
    expect(after.burnedOut).toEqual([]);
  });

  it('rubble blocks building until bulldozed', () => {
    const tiles = createCity();
    tiles[cityIdx(2, 2)].type = 'rubble';
    expect(canBuild(tiles, 2, 2, 'res')).toBe(false);
    expect(canBuild(tiles, 2, 2, 'bulldoze')).toBe(true);
    build(tiles, 2, 2, 'bulldoze');
    expect(canBuild(tiles, 2, 2, 'res')).toBe(true);
  });

  it('computes fire-station coverage', () => {
    const tiles = createCity();
    build(tiles, 5, 5, 'firehouse');
    const cover = computeFireCover(tiles);
    expect(cover[cityIdx(5, 5)]).toBe(true);
    expect(cover[cityIdx(11, 5)]).toBe(true);
    expect(cover[cityIdx(12, 5)]).toBe(false);
  });

  it('rolls no events during the grace period, then from the event table', () => {
    expect(rollEvent(EVENT_GRACE_MONTHS, () => 0)).toBeNull();
    expect(rollEvent(EVENT_GRACE_MONTHS + 1, () => 0.99)).toBeNull(); // failed chance roll
    const event = rollEvent(EVENT_GRACE_MONTHS + 1, () => 0);
    expect(event).toBe(CITY_EVENTS[0]);
  });

  it('sums demand modifiers across active events', () => {
    const festival = CITY_EVENTS.find(e => e.id === 'festival')!;
    const strike = CITY_EVENTS.find(e => e.id === 'strike')!;
    const total = sumDemandModifiers([
      { event: festival, monthsLeft: 2 },
      { event: strike, monthsLeft: 1 }
    ]);
    expect(total).toEqual({ res: 15, com: 20, ind: -30 });
    expect(sumDemandModifiers([])).toEqual({});
  });
});

describe('view rotation', () => {
  it('swaps dimensions on quarter turns', () => {
    expect(rotatedDims(24, 14, 0)).toEqual({ w: 24, h: 14 });
    expect(rotatedDims(24, 14, 1)).toEqual({ w: 14, h: 24 });
    expect(rotatedDims(24, 14, 2)).toEqual({ w: 24, h: 14 });
    expect(rotatedDims(24, 14, 3)).toEqual({ w: 14, h: 24 });
  });

  it('rotateTile and unrotateTile are inverses over the whole grid', () => {
    for (let rot = 0; rot < 4; rot++) {
      for (let y = 0; y < CITY_H; y++) {
        for (let x = 0; x < CITY_W; x++) {
          const v = rotateTile(x, y, CITY_W, CITY_H, rot);
          const dims = rotatedDims(CITY_W, CITY_H, rot);
          expect(v.x).toBeGreaterThanOrEqual(0);
          expect(v.x).toBeLessThan(dims.w);
          expect(v.y).toBeGreaterThanOrEqual(0);
          expect(v.y).toBeLessThan(dims.h);
          expect(unrotateTile(v.x, v.y, CITY_W, CITY_H, rot)).toEqual({ x, y });
        }
      }
    }
  });

  it('keeps fractional points inside their rotated tile', () => {
    for (let rot = 0; rot < 4; rot++) {
      const v = rotateTile(3, 7, CITY_W, CITY_H, rot);
      const p = rotatePoint(3.25, 7.75, CITY_W, CITY_H, rot);
      expect(Math.floor(p.tx)).toBe(v.x);
      expect(Math.floor(p.ty)).toBe(v.y);
    }
  });
});

describe('city budget', () => {
  it('taxes residents and jobs', () => {
    expect(monthlyIncome({ population: 100, jobs: 40, comJobs: 16, indJobs: 24 })).toBe(190);
  });

  it('charges upkeep for infrastructure only', () => {
    const tiles = createCity();
    build(tiles, 0, 0, 'road');
    build(tiles, 1, 0, 'road');
    build(tiles, 2, 0, 'power');
    build(tiles, 3, 0, 'park');
    build(tiles, 4, 0, 'res');
    expect(monthlyExpenses(tiles)).toBe(1 + 1 + 40 + 3);
  });

  it('charges upkeep for services and bridges', () => {
    const tiles = createCity();
    build(tiles, 0, 0, 'school');
    build(tiles, 1, 0, 'firehouse');
    tiles[cityIdx(2, 0)].type = 'water';
    build(tiles, 2, 0, 'road'); // becomes a bridge
    expect(monthlyExpenses(tiles)).toBe(15 + 12 + 3);
  });
});

describe('city traffic', () => {
  it('scales car count with population, capped', () => {
    expect(targetCarCount(0)).toBe(0);
    expect(targetCarCount(80)).toBe(2);
    expect(targetCarCount(100000)).toBe(14);
  });

  it('spawns cars only when a drivable road exists', () => {
    const tiles = createCity();
    expect(spawnCar(tiles, seededRandom())).toBeNull();
    build(tiles, 3, 3, 'road');
    // A single isolated road tile has no exit, so still nothing to drive
    expect(spawnCar(tiles, seededRandom())).toBeNull();
    build(tiles, 4, 3, 'road');
    const car = spawnCar(tiles, seededRandom());
    expect(car).not.toBeNull();
    expect(tiles[car!.from].type).toBe('road');
    expect(tiles[car!.to].type).toBe('road');
  });

  it('keeps cars on the road network as they wander', () => {
    const tiles = createCity();
    for (let x = 2; x <= 8; x++) build(tiles, x, 3, 'road');
    for (let y = 3; y <= 7; y++) build(tiles, 5, y, 'road');
    const random = seededRandom(7);
    const car = spawnCar(tiles, random)!;
    for (let i = 0; i < 200; i++) {
      expect(stepCar(tiles, car, 0.1, random)).toBe(true);
      expect(tiles[car.from].type).toBe('road');
      expect(tiles[car.to].type).toBe('road');
      expect(car.progress).toBeGreaterThanOrEqual(0);
      expect(car.progress).toBeLessThan(1);
    }
  });

  it('despawns cars when their road is bulldozed', () => {
    const tiles = createCity();
    build(tiles, 3, 3, 'road');
    build(tiles, 4, 3, 'road');
    const car = spawnCar(tiles, seededRandom())!;
    build(tiles, car.to % CITY_W, Math.floor(car.to / CITY_W), 'bulldoze');
    expect(stepCar(tiles, car, 0.1, seededRandom())).toBe(false);
  });
});

describe('city chaos — difficulty ramp', () => {
  it('holds all disasters back through the grace months', () => {
    expect(disasterIntensity(1, 5000)).toBe(0);
    expect(disasterIntensity(DISASTER_GRACE_MONTHS, 5000)).toBe(0);
    expect(tornadoChance(disasterIntensity(4, 0))).toBe(0);
    expect(quakeChance(disasterIntensity(4, 0))).toBe(0);
  });

  it('ramps with the city age and size and caps at 1', () => {
    const young = disasterIntensity(DISASTER_GRACE_MONTHS + 2, 100);
    const older = disasterIntensity(DISASTER_GRACE_MONTHS + 20, 100);
    const bigger = disasterIntensity(DISASTER_GRACE_MONTHS + 20, 1200);
    expect(young).toBeGreaterThan(0);
    expect(older).toBeGreaterThan(young);
    expect(bigger).toBeGreaterThan(older);
    expect(disasterIntensity(999, 999999)).toBeLessThanOrEqual(1);
  });
});

describe('city chaos — tornado', () => {
  it('touches down on an edge with a heading into the map', () => {
    for (let seed = 1; seed < 20; seed++) {
      const t = spawnTornado(seededRandom(seed));
      expect(t.ticksLeft).toBe(TORNADO_TICKS);
      expect(t.x).toBeGreaterThanOrEqual(0);
      expect(t.x).toBeLessThan(CITY_W);
      expect(t.y).toBeGreaterThanOrEqual(0);
      expect(t.y).toBeLessThan(CITY_H);
      // At least one axis carries real speed
      expect(Math.abs(t.dx) + Math.abs(t.dy)).toBeGreaterThan(0.5);
    }
  });

  it('knocks a developed zone down one level, to rubble at level 1', () => {
    const tall = { type: 'res' as const, level: 3 };
    expect(wreckTile(tall)).toBe(true);
    expect(tall.level).toBe(2);
    const shack = { type: 'com' as const, level: 1 };
    expect(wreckTile(shack)).toBe(true);
    expect(shack.type).toBe('rubble');
  });

  it('flattens civic buildings, tears out trees, and spares power/roads/water', () => {
    const school = { type: 'school' as const, level: 0 };
    expect(wreckTile(school)).toBe(true);
    expect(school.type).toBe('rubble');
    const tree = { type: 'tree' as const, level: 0 };
    expect(wreckTile(tree)).toBe(true);
    expect(tree.type).toBe('empty');
    for (const type of ['power', 'road', 'water', 'bridge', 'empty', 'rubble'] as const) {
      const tile = { type, level: 0 };
      expect(wreckTile(tile), type).toBe(false);
      expect(tile.type).toBe(type);
    }
  });

  it('drifts along its heading, wrecking what it passes over', () => {
    const tiles = createCity();
    build(tiles, 6, 5, 'res');
    tiles[cityIdx(6, 5)].level = 2;
    const tornado: Tornado = { x: 5, y: 5, dx: 1, dy: 0, ticksLeft: 10 };
    // Zero jitter: random() always 0.5
    const step = stepTornado(tiles, tornado, () => 0.5);
    expect(step.tornado?.x).toBe(6);
    expect(step.wrecked).toEqual([cityIdx(6, 5)]);
    expect(tiles[cityIdx(6, 5)].level).toBe(1);
  });

  it('blows out when its clock runs down or it leaves the map', () => {
    const tiles = createCity();
    const dying: Tornado = { x: 5, y: 5, dx: 0, dy: 0, ticksLeft: 1 };
    expect(stepTornado(tiles, dying, () => 0.5).tornado).toBeNull();
    const leaving: Tornado = { x: CITY_W - 0.2, y: 5, dx: 2, dy: 0, ticksLeft: 10 };
    expect(stepTornado(tiles, leaving, () => 0.5).tornado).toBeNull();
  });
});

describe('city chaos — earthquake', () => {
  function developedCity() {
    const tiles = createCity();
    for (let x = 2; x < 20; x++) {
      for (let y = 2; y < 12; y++) {
        build(tiles, x, y, 'res');
        tiles[cityIdx(x, y)].level = 2;
      }
    }
    return tiles;
  }

  it('damages tiles only within the radius of the epicentre', () => {
    const tiles = developedCity();
    const quake = earthquakeDamage(tiles, seededRandom(7));
    expect(quake.damaged.length).toBeGreaterThan(0);
    for (const i of quake.damaged) {
      expect(chebyshev(quake.epicentre, i, CITY_W)).toBeLessThanOrEqual(QUAKE_RADIUS);
    }
  });

  it('only ignites tiles that can actually burn', () => {
    const tiles = developedCity();
    const quake = earthquakeDamage(tiles, seededRandom(11));
    for (const i of quake.ignited) {
      expect(isFlammable(tiles[i])).toBe(true);
    }
  });

  it('finds nothing to break in an empty city', () => {
    const tiles = createCity();
    const quake = earthquakeDamage(tiles, seededRandom(3));
    expect(quake.damaged).toEqual([]);
    expect(quake.ignited).toEqual([]);
  });
});

describe('city density (level-4 zones)', () => {
  it('caps zones at MAX_LEVEL until the population unlock', () => {
    expect(maxZoneLevel({ population: 0, comJobs: 0, indJobs: 0, jobs: 0 })).toBe(MAX_LEVEL);
    expect(
      maxZoneLevel({ population: DENSITY_UNLOCK_POP - 1, comJobs: 0, indJobs: 0, jobs: 0 })
    ).toBe(MAX_LEVEL);
    expect(
      maxZoneLevel({ population: DENSITY_UNLOCK_POP, comJobs: 0, indJobs: 0, jobs: 0 })
    ).toBe(DENSE_LEVEL);
  });

  /** A serviced res tile at MAX_LEVEL inside a metropolis with hot demand. */
  function metropolis() {
    const tiles = createCity();
    build(tiles, 5, 5, 'power');
    build(tiles, 6, 6, 'road');
    build(tiles, 6, 5, 'res');
    build(tiles, 5, 4, 'park');
    build(tiles, 3, 3, 'school');
    tiles[cityIdx(6, 5)].level = MAX_LEVEL;
    // Backdrop population and jobs (need not be serviced to count in stats):
    // enough residents to clear the unlock and enough jobs for hot res demand.
    for (let x = 10; x < 22; x++) {
      build(tiles, x, 2, 'res');
      tiles[cityIdx(x, 2)].level = 8;
      build(tiles, x, 10, 'ind');
      tiles[cityIdx(x, 10)].level = 11;
    }
    return tiles;
  }

  it('lets a serviced zone densify to level 4 in a big city with hot demand', () => {
    const tiles = metropolis();
    const stats = cityStats(tiles);
    expect(stats.population).toBeGreaterThanOrEqual(DENSITY_UNLOCK_POP);
    expect(computeDemand(stats).res).toBeGreaterThanOrEqual(DENSE_DEMAND_MIN);
    growthStep(tiles, () => 0);
    expect(tiles[cityIdx(6, 5)].level).toBe(DENSE_LEVEL);
    // And DENSE_LEVEL is the ceiling — another tick must not exceed it.
    growthStep(tiles, () => 0);
    expect(tiles[cityIdx(6, 5)].level).toBe(DENSE_LEVEL);
  });

  it('refuses to densify while the city is still small', () => {
    const tiles = createCity();
    build(tiles, 5, 5, 'power');
    build(tiles, 6, 6, 'road');
    build(tiles, 6, 5, 'res');
    build(tiles, 5, 4, 'park');
    build(tiles, 3, 3, 'school');
    tiles[cityIdx(6, 5)].level = MAX_LEVEL;
    build(tiles, 7, 6, 'ind');
    tiles[cityIdx(7, 6)].level = 3;
    growthStep(tiles, () => 0);
    expect(tiles[cityIdx(6, 5)].level).toBe(MAX_LEVEL);
  });
});
