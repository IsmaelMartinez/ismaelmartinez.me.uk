import { describe, it, expect } from 'vitest';
import {
  GRID_W,
  GRID_H,
  createPark,
  canPlace,
  applyTool,
  toolCost,
  idx,
  BUILDINGS
} from '../../src/games/park/grid';
import { findPath, bfsFrom, nearestReachable, adjacentWalkable } from '../../src/games/park/pathfind';
import {
  createNeeds,
  decayNeeds,
  mostUrgentNeed,
  satisfyNeed,
  happiness,
  NEED_KEYS
} from '../../src/games/park/guests';
import { parkRating, spawnInterval, dailyUpkeep } from '../../src/games/park/economy';

describe('park grid', () => {
  it('creates a grass park with an entrance and starter path', () => {
    const { tiles, entrance } = createPark();
    expect(tiles).toHaveLength(GRID_W * GRID_H);
    expect(tiles[entrance]).toBe('entrance');
    expect(tiles[entrance - GRID_W]).toBe('path');
    expect(tiles.filter(t => t === 'grass').length).toBe(GRID_W * GRID_H - 3);
  });

  it('allows paths on any grass but requires adjacency for buildings', () => {
    const { tiles } = createPark();
    // Far corner: grass, no path nearby
    expect(canPlace(tiles, 0, 0, 'path')).toBe(true);
    expect(canPlace(tiles, 0, 0, 'carousel')).toBe(false);
    // Next to the starter path stub
    const ex = Math.floor(GRID_W / 2);
    expect(canPlace(tiles, ex - 1, GRID_H - 2, 'carousel')).toBe(true);
  });

  it('never allows building over occupied tiles or the entrance', () => {
    const { tiles, entrance } = createPark();
    const ex = entrance % GRID_W;
    expect(canPlace(tiles, ex, GRID_H - 1, 'path')).toBe(false);
    expect(canPlace(tiles, ex, GRID_H - 1, 'bulldoze')).toBe(false);
    expect(canPlace(tiles, ex, GRID_H - 2, 'path')).toBe(false); // existing path
    expect(canPlace(tiles, ex, GRID_H - 2, 'bulldoze')).toBe(true);
  });

  it('bulldozing restores grass', () => {
    const { tiles } = createPark();
    applyTool(tiles, 0, 0, 'path');
    expect(tiles[idx(0, 0)]).toBe('path');
    applyTool(tiles, 0, 0, 'bulldoze');
    expect(tiles[idx(0, 0)]).toBe('grass');
  });

  it('prices every tool', () => {
    expect(toolCost('path')).toBe(10);
    expect(toolCost('bulldoze')).toBe(0);
    expect(toolCost('ferris')).toBe(BUILDINGS.ferris!.cost);
  });
});

describe('park pathfinding', () => {
  it('finds the shortest route along a corridor', () => {
    const { tiles, entrance } = createPark();
    for (let n = 3; n <= 6; n++) tiles[entrance - n * GRID_W] = 'path';
    const path = findPath(tiles, entrance, entrance - 6 * GRID_W);
    expect(path).not.toBeNull();
    expect(path!).toHaveLength(7);
    expect(path![0]).toBe(entrance);
  });

  it('returns null for disconnected targets', () => {
    const { tiles, entrance } = createPark();
    tiles[idx(0, 0)] = 'path';
    expect(findPath(tiles, entrance, idx(0, 0))).toBeNull();
  });

  it('routes guests to the nearest reachable building', () => {
    const { tiles, entrance } = createPark();
    // Corridor upwards with two food stalls, near and far
    for (let n = 3; n <= 8; n++) tiles[entrance - n * GRID_W] = 'path';
    const near = entrance - 4 * GRID_W + 1;
    const far = entrance - 8 * GRID_W + 1;
    tiles[near] = 'food';
    tiles[far] = 'food';
    const found = nearestReachable(tiles, entrance, [near, far]);
    expect(found).not.toBeNull();
    expect(found!.building).toBe(near);
    expect(found!.path[found!.path.length - 1]).toBe(near - 1);
  });

  it('only stands on walkable tiles next to a building', () => {
    const { tiles, entrance } = createPark();
    const building = entrance - GRID_W - 1; // beside the starter path
    tiles[building] = 'drink';
    const stands = adjacentWalkable(tiles, building);
    expect(stands).toContain(entrance - GRID_W);
    for (const stand of stands) {
      expect(['path', 'entrance']).toContain(tiles[stand]);
    }
  });

  it('bfs from a non-walkable tile reaches nothing', () => {
    const { tiles } = createPark();
    const bfs = bfsFrom(tiles, idx(0, 0));
    expect(Math.max(...bfs.dist)).toBe(-1);
  });
});

describe('guest needs', () => {
  it('creates needs within the 0-100 scale', () => {
    const needs = createNeeds(() => 0.5);
    for (const key of NEED_KEYS) {
      expect(needs[key]).toBeGreaterThanOrEqual(0);
      expect(needs[key]).toBeLessThanOrEqual(100);
    }
  });

  it('decays needs over time without going negative', () => {
    const needs = createNeeds(() => 0.5);
    const before = needs.fun;
    decayNeeds(needs, 1);
    expect(needs.fun).toBeLessThan(before);
    decayNeeds(needs, 10000);
    for (const key of NEED_KEYS) expect(needs[key]).toBe(0);
  });

  it('flags the lowest urgent need and none when satisfied', () => {
    const needs = { fun: 90, hunger: 95, thirst: 100, bladder: 100 };
    expect(mostUrgentNeed(needs)).toBeNull();
    needs.hunger = 40;
    needs.thirst = 30;
    expect(mostUrgentNeed(needs)).toBe('thirst');
  });

  it('satisfying a need caps at 100 and lifts happiness', () => {
    const needs = { fun: 10, hunger: 100, thirst: 100, bladder: 100 };
    const before = happiness(needs);
    satisfyNeed(needs, 'fun', 95);
    expect(needs.fun).toBe(100);
    expect(happiness(needs)).toBeGreaterThan(before);
  });
});

describe('park economy', () => {
  it('rates an empty park as neutral and stays within 0-100', () => {
    expect(parkRating(null, 0)).toBe(50);
    expect(parkRating(100, 100)).toBeLessThanOrEqual(100);
    expect(parkRating(0, 0)).toBe(0);
  });

  it('spawns guests faster as rating rises', () => {
    expect(spawnInterval(90)).toBeLessThan(spawnInterval(30));
    expect(spawnInterval(100)).toBeGreaterThanOrEqual(1.5);
  });

  it('sums daily upkeep across placed buildings', () => {
    const { tiles } = createPark();
    expect(dailyUpkeep(tiles)).toBe(0);
    applyTool(tiles, 0, 0, 'carousel');
    applyTool(tiles, 1, 0, 'toilet');
    expect(dailyUpkeep(tiles)).toBe(BUILDINGS.carousel!.upkeep + BUILDINGS.toilet!.upkeep);
  });
});
