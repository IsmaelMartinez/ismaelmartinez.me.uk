import { describe, it, expect } from 'vitest';
import { gridNeighbours, chebyshev } from '../../src/games/engine/grid2d';
import {
  CITY_W,
  CITY_H,
  MAX_LEVEL,
  createCity,
  canBuild,
  build,
  cityIdx,
  TOOL_COSTS
} from '../../src/games/city/tiles';
import {
  computePowered,
  roadAdjacent,
  cityStats,
  computeDemand,
  growthStep,
  POWER_RADIUS,
  RESIDENTS_PER_LEVEL
} from '../../src/games/city/simulation';
import { monthlyIncome, monthlyExpenses } from '../../src/games/city/budget';

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
    growthStep(tiles, () => 0); // random()=0 < growth probability
    expect(tiles[cityIdx(6, 5)].level).toBe(1);
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

  it('gates top-level residential on a nearby park', () => {
    const tiles = createCity();
    build(tiles, 5, 5, 'power');
    build(tiles, 6, 6, 'road');
    build(tiles, 6, 5, 'res');
    tiles[cityIdx(6, 5)].level = MAX_LEVEL - 1;
    // Big job surplus to guarantee positive res demand
    build(tiles, 7, 6, 'ind');
    tiles[cityIdx(7, 6)].level = 3;
    growthStep(tiles, () => 0);
    expect(tiles[cityIdx(6, 5)].level).toBe(MAX_LEVEL - 1);
    build(tiles, 5, 4, 'park');
    growthStep(tiles, () => 0);
    expect(tiles[cityIdx(6, 5)].level).toBe(MAX_LEVEL);
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
});
