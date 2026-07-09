import { describe, it, expect } from 'vitest';
import {
  GRID_W,
  GRID_H,
  MAX_HEIGHT,
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
  it('creates a grass park with an entrance, starter path, and flat terrain', () => {
    const { tiles, heights, tunnels, entrance } = createPark();
    expect(tiles).toHaveLength(GRID_W * GRID_H);
    expect(heights).toHaveLength(GRID_W * GRID_H);
    expect(tunnels).toHaveLength(GRID_W * GRID_H);
    expect(tiles[entrance]).toBe('entrance');
    expect(tiles[entrance - GRID_W]).toBe('path');
    expect(tiles.filter(t => t === 'grass').length).toBe(GRID_W * GRID_H - 3);
    expect(heights.every(h => h === 0)).toBe(true);
    expect(tunnels.every(t => t === false)).toBe(true);
  });

  it('allows paths on any grass but requires adjacency for buildings', () => {
    const { tiles, heights, tunnels } = createPark();
    // Far corner: grass, no path nearby
    expect(canPlace(tiles, heights, tunnels, 0, 0, 'path')).toBe(true);
    expect(canPlace(tiles, heights, tunnels, 0, 0, 'carousel')).toBe(false);
    // Next to the starter path stub
    const ex = Math.floor(GRID_W / 2);
    expect(canPlace(tiles, heights, tunnels, ex - 1, GRID_H - 2, 'carousel')).toBe(true);
  });

  it('never allows building over occupied tiles or the entrance', () => {
    const { tiles, heights, tunnels, entrance } = createPark();
    const ex = entrance % GRID_W;
    expect(canPlace(tiles, heights, tunnels, ex, GRID_H - 1, 'path')).toBe(false);
    expect(canPlace(tiles, heights, tunnels, ex, GRID_H - 1, 'bulldoze')).toBe(false);
    expect(canPlace(tiles, heights, tunnels, ex, GRID_H - 2, 'path')).toBe(false); // existing path
    expect(canPlace(tiles, heights, tunnels, ex, GRID_H - 2, 'bulldoze')).toBe(true);
  });

  it('bulldozing restores grass', () => {
    const { tiles, heights, tunnels } = createPark();
    applyTool(tiles, heights, tunnels, 0, 0, 'path');
    expect(tiles[idx(0, 0)]).toBe('path');
    applyTool(tiles, heights, tunnels, 0, 0, 'bulldoze');
    expect(tiles[idx(0, 0)]).toBe('grass');
  });

  it('prices every tool', () => {
    expect(toolCost('path')).toBe(10);
    expect(toolCost('bulldoze')).toBe(0);
    expect(toolCost('ferris')).toBe(BUILDINGS.ferris!.cost);
    expect(toolCost('skytower')).toBe(BUILDINGS.skytower!.cost);
    expect(toolCost('raiseLand')).toBe(20);
  });
});

describe('park terrain', () => {
  it('raises and lowers land within bounds, one step at a time', () => {
    const { tiles, heights, tunnels } = createPark();
    expect(canPlace(tiles, heights, tunnels, 5, 5, 'raiseLand')).toBe(true);
    applyTool(tiles, heights, tunnels, 5, 5, 'raiseLand');
    expect(heights[idx(5, 5)]).toBe(1);
    expect(canPlace(tiles, heights, tunnels, 5, 5, 'lowerLand')).toBe(true);
    applyTool(tiles, heights, tunnels, 5, 5, 'lowerLand');
    expect(heights[idx(5, 5)]).toBe(0);
    // Can't lower below sea level.
    expect(canPlace(tiles, heights, tunnels, 5, 5, 'lowerLand')).toBe(false);
  });

  it('refuses to raise a tile more than one step above its neighbours', () => {
    const { tiles, heights, tunnels } = createPark();
    expect(canPlace(tiles, heights, tunnels, 5, 5, 'raiseLand')).toBe(true);
    applyTool(tiles, heights, tunnels, 5, 5, 'raiseLand'); // height 1, flat neighbours: diff 1, fine
    // A second raise would make it height 2 next to flat (0) neighbours: a 2-step cliff.
    expect(canPlace(tiles, heights, tunnels, 5, 5, 'raiseLand')).toBe(false);
    // Raising every neighbour to close the gap makes it possible again.
    for (const [x, y] of [
      [4, 5],
      [6, 5],
      [5, 4],
      [5, 6]
    ]) {
      applyTool(tiles, heights, tunnels, x, y, 'raiseLand');
    }
    expect(canPlace(tiles, heights, tunnels, 5, 5, 'raiseLand')).toBe(true);
  });

  it('caps height at MAX_HEIGHT', () => {
    const { tiles, heights, tunnels } = createPark();
    heights[idx(5, 5)] = MAX_HEIGHT;
    for (const [x, y] of [
      [4, 5],
      [6, 5],
      [5, 4],
      [5, 6]
    ]) {
      heights[idx(x, y)] = MAX_HEIGHT;
    }
    expect(canPlace(tiles, heights, tunnels, 5, 5, 'raiseLand')).toBe(false);
  });

  it('cannot terraform under a building', () => {
    const { tiles, heights, tunnels } = createPark();
    tiles[idx(5, 5)] = 'carousel';
    expect(canPlace(tiles, heights, tunnels, 5, 5, 'raiseLand')).toBe(false);
  });
});

describe('park water', () => {
  it('places water only on flat grass', () => {
    const { tiles, heights, tunnels } = createPark();
    expect(canPlace(tiles, heights, tunnels, 3, 3, 'water')).toBe(true);
    applyTool(tiles, heights, tunnels, 3, 3, 'water');
    expect(tiles[idx(3, 3)]).toBe('water');

    applyTool(tiles, heights, tunnels, 10, 10, 'raiseLand');
    expect(canPlace(tiles, heights, tunnels, 10, 10, 'water')).toBe(false);
  });

  it('gates the Log Flume on an adjacent water tile', () => {
    const { tiles, heights, tunnels, entrance } = createPark();
    const ex = entrance % GRID_W;
    const site = idx(ex - 1, GRID_H - 2); // beside the starter path
    expect(canPlace(tiles, heights, tunnels, ex - 1, GRID_H - 2, 'flume')).toBe(false); // no water yet
    applyTool(tiles, heights, tunnels, ex - 2, GRID_H - 2, 'water');
    expect(canPlace(tiles, heights, tunnels, ex - 1, GRID_H - 2, 'flume')).toBe(true);
    applyTool(tiles, heights, tunnels, ex - 1, GRID_H - 2, 'flume');
    expect(tiles[site]).toBe('flume');
  });
});

describe('park tunnels', () => {
  it('only digs a tunnel from a flat path into a hillside', () => {
    const { tiles, heights, tunnels } = createPark();
    applyTool(tiles, heights, tunnels, 5, 5, 'path');
    // No raised neighbour yet — nothing to tunnel into.
    expect(canPlace(tiles, heights, tunnels, 5, 5, 'digTunnel')).toBe(false);
    applyTool(tiles, heights, tunnels, 6, 5, 'raiseLand');
    expect(canPlace(tiles, heights, tunnels, 5, 5, 'digTunnel')).toBe(true);
    applyTool(tiles, heights, tunnels, 5, 5, 'digTunnel');
    expect(tunnels[idx(5, 5)]).toBe(true);
  });

  it('refuses to dig a tunnel that already exists', () => {
    const { tiles, heights, tunnels } = createPark();
    applyTool(tiles, heights, tunnels, 5, 5, 'path');
    applyTool(tiles, heights, tunnels, 6, 5, 'raiseLand');
    applyTool(tiles, heights, tunnels, 5, 5, 'digTunnel');
    expect(canPlace(tiles, heights, tunnels, 5, 5, 'digTunnel')).toBe(false);
  });

  it('bulldozing a tunnelled path clears the tunnel flag', () => {
    const { tiles, heights, tunnels } = createPark();
    applyTool(tiles, heights, tunnels, 5, 5, 'path');
    applyTool(tiles, heights, tunnels, 6, 5, 'raiseLand');
    applyTool(tiles, heights, tunnels, 5, 5, 'digTunnel');
    applyTool(tiles, heights, tunnels, 5, 5, 'bulldoze');
    expect(tiles[idx(5, 5)]).toBe('grass');
    expect(tunnels[idx(5, 5)]).toBe(false);
  });

  it('raising or lowering a tunnelled tile closes the tunnel', () => {
    const { tiles, heights, tunnels } = createPark();
    applyTool(tiles, heights, tunnels, 5, 5, 'path');
    applyTool(tiles, heights, tunnels, 6, 5, 'raiseLand');
    applyTool(tiles, heights, tunnels, 5, 5, 'digTunnel');
    expect(tunnels[idx(5, 5)]).toBe(true);
    applyTool(tiles, heights, tunnels, 5, 5, 'raiseLand');
    expect(tunnels[idx(5, 5)]).toBe(false);
    expect(heights[idx(5, 5)]).toBe(1);
  });
});

describe('park building gates', () => {
  it('requires height 2+ for the Sky Tower', () => {
    const { tiles, heights, tunnels, entrance } = createPark();
    const ex = entrance % GRID_W;
    expect(canPlace(tiles, heights, tunnels, ex - 1, GRID_H - 2, 'skytower')).toBe(false);
    applyTool(tiles, heights, tunnels, ex - 1, GRID_H - 2, 'raiseLand');
    applyTool(tiles, heights, tunnels, ex - 1, GRID_H - 2, 'raiseLand');
    expect(canPlace(tiles, heights, tunnels, ex - 1, GRID_H - 2, 'skytower')).toBe(true);
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
    const { tiles, heights, tunnels } = createPark();
    expect(dailyUpkeep(tiles)).toBe(0);
    applyTool(tiles, heights, tunnels, 0, 0, 'carousel');
    applyTool(tiles, heights, tunnels, 1, 0, 'toilet');
    expect(dailyUpkeep(tiles)).toBe(BUILDINGS.carousel!.upkeep + BUILDINGS.toilet!.upkeep);
  });
});
