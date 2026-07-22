import { describe, it, expect } from 'vitest';
import {
  GRID_W,
  GRID_H,
  MAX_HEIGHT,
  createPark,
  createFlatPark,
  ENTRANCE_CORE,
  neighbours,
  canPlace,
  applyTool,
  toolCost,
  terraformPlan,
  terraformSteps,
  idx,
  BUILDINGS,
  ZONES,
  zoneUnlocked,
  zoneAt,
  zonesForTiles,
  zoneDiscountFactor,
  gateZone
} from '../../src/games/park/grid';
import { findPath, bfsFrom, nearestReachable, adjacentWalkable } from '../../src/games/park/pathfind';
import { seededRandom } from './seeded-random';
import {
  createNeeds,
  decayNeeds,
  mostUrgentNeed,
  satisfyNeed,
  happiness,
  NEED_KEYS
} from '../../src/games/park/guests';
import {
  parkRating,
  spawnInterval,
  dailyUpkeep,
  wagePerAttraction,
  attractionCount,
  operatingCost,
  maxAttractionDailyRevenue,
  WAGE_GRACE_DAYS,
  WAGE_RAMP
} from '../../src/games/park/economy';
import {
  PARK_OBJECTIVES,
  objectiveMet,
  objectiveProgress
} from '../../src/games/park/objectives';
import {
  mayhemIntensity,
  MAYHEM_GRACE_DAYS,
  isRide,
  breakdownChance,
  pickBreakdownTile,
  coasterStallChance,
  rollSurge,
  surgedInterval,
  maxGuests,
  SURGE_SECONDS
} from '../../src/games/park/mayhem';
import {
  MIN_TRACK_LENGTH,
  CART_MIN_SPEED,
  CART_MAX_SPEED,
  CART_CRUISE_SPEED,
  stepTile,
  dirBetween,
  rotateDir,
  segmentClimb,
  turnKind,
  validateTrack,
  rotateToStation,
  trackHeightDrop,
  thrillBoost,
  nextCartSpeed,
  advanceU,
  canPlaceTrack,
  type Segment,
  type SegmentKind
} from '../../src/games/park/track';

describe('park grid', () => {
  it('creates a flat grass board with an entrance and starter path', () => {
    const { tiles, heights, tunnels, entrance } = createFlatPark();
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
    const { tiles, heights, tunnels } = createFlatPark();
    // Far corner: grass, no path nearby
    expect(canPlace(tiles, heights, tunnels, 0, 0, 'path')).toBe(true);
    expect(canPlace(tiles, heights, tunnels, 0, 0, 'carousel')).toBe(false);
    // Next to the starter path stub
    const ex = Math.floor(GRID_W / 2);
    expect(canPlace(tiles, heights, tunnels, ex - 1, GRID_H - 2, 'carousel')).toBe(true);
  });

  it('never allows building over occupied tiles or the entrance', () => {
    const { tiles, heights, tunnels, entrance } = createFlatPark();
    const ex = entrance % GRID_W;
    expect(canPlace(tiles, heights, tunnels, ex, GRID_H - 1, 'path')).toBe(false);
    expect(canPlace(tiles, heights, tunnels, ex, GRID_H - 1, 'bulldoze')).toBe(false);
    expect(canPlace(tiles, heights, tunnels, ex, GRID_H - 2, 'path')).toBe(false); // existing path
    expect(canPlace(tiles, heights, tunnels, ex, GRID_H - 2, 'bulldoze')).toBe(true);
  });

  it('bulldozing restores grass', () => {
    const { tiles, heights, tunnels } = createFlatPark();
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

describe('procedural park terrain (createPark)', () => {
  // Seeds spread by a large prime so the first draw (the coast-vs-ponds
  // roll) actually varies — the LCG's first output barely moves across
  // small consecutive seeds.
  const seeds = Array.from({ length: 60 }, (_, k) => (k + 1) * 104729);

  it('keeps every neighbour within one height step (the slope rule)', () => {
    for (const seed of seeds) {
      const { heights } = createPark(seededRandom(seed));
      for (let i = 0; i < heights.length; i++) {
        for (const n of neighbours(i)) {
          expect(Math.abs(heights[i] - heights[n])).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('keeps heights in range and rolls at least one hill', () => {
    for (const seed of seeds) {
      const { heights } = createPark(seededRandom(seed));
      expect(Math.min(...heights)).toBe(0);
      expect(Math.max(...heights)).toBeLessThanOrEqual(MAX_HEIGHT);
      expect(heights.some(h => h > 0)).toBe(true);
    }
  });

  it('keeps the entrance and its starter path flat and intact', () => {
    for (const seed of seeds) {
      const { tiles, heights, entrance } = createPark(seededRandom(seed));
      expect(tiles[entrance]).toBe('entrance');
      expect(tiles[entrance - GRID_W]).toBe('path');
      expect(tiles[entrance - 2 * GRID_W]).toBe('path');
      expect(heights[entrance]).toBe(0);
      expect(heights[entrance - GRID_W]).toBe(0);
      expect(heights[entrance - 2 * GRID_W]).toBe(0);
    }
  });

  it('leaves the entrance core untouched and a generous flat buildable board', () => {
    for (const seed of seeds) {
      const { tiles, heights } = createPark(seededRandom(seed));
      for (let y = ENTRANCE_CORE.y0; y <= ENTRANCE_CORE.y1; y++) {
        for (let x = ENTRANCE_CORE.x0; x <= ENTRANCE_CORE.x1; x++) {
          const i = idx(x, y);
          expect(heights[i]).toBe(0);
          expect(['grass', 'path', 'entrance']).toContain(tiles[i]);
        }
      }
      // Structural floor, not a tuning target: 336 tiles − 3 entrance/path
      // − ≤72 coast water (3 deep × 24) − ≤147 raised (3 disjoint 7×7 hill
      // footprints) = 114, asserted with a little slack. Typical rolls sit
      // far above it.
      const flatGrass = tiles.filter((t, i) => t === 'grass' && heights[i] === 0).length;
      expect(flatGrass).toBeGreaterThanOrEqual(110);
    }
  });

  it('places some water, only ever at height 0', () => {
    for (const seed of seeds) {
      const { tiles, heights } = createPark(seededRandom(seed));
      const water: number[] = [];
      tiles.forEach((t, i) => {
        if (t === 'water') water.push(i);
      });
      expect(water.length).toBeGreaterThanOrEqual(2);
      expect(water.length).toBeLessThanOrEqual(90);
      for (const i of water) expect(heights[i]).toBe(0);
    }
  });

  it('is deterministic for a seed and varies across seeds', () => {
    expect(createPark(seededRandom(5))).toEqual(createPark(seededRandom(5)));
    const a = createPark(seededRandom(1));
    const b = createPark(seededRandom(2));
    const same = a.tiles.join() === b.tiles.join() && a.heights.join() === b.heights.join();
    expect(same).toBe(false);
  });
});

describe('park terrain', () => {
  it('raises and lowers land within bounds, one step at a time', () => {
    const { tiles, heights, tunnels } = createFlatPark();
    expect(canPlace(tiles, heights, tunnels, 5, 5, 'raiseLand')).toBe(true);
    applyTool(tiles, heights, tunnels, 5, 5, 'raiseLand');
    expect(heights[idx(5, 5)]).toBe(1);
    expect(canPlace(tiles, heights, tunnels, 5, 5, 'lowerLand')).toBe(true);
    applyTool(tiles, heights, tunnels, 5, 5, 'lowerLand');
    expect(heights[idx(5, 5)]).toBe(0);
    // Can't lower below sea level.
    expect(canPlace(tiles, heights, tunnels, 5, 5, 'lowerLand')).toBe(false);
  });

  it('raising past the slope limit pushes the neighbours along instead of refusing', () => {
    const { tiles, heights, tunnels } = createFlatPark();
    applyTool(tiles, heights, tunnels, 5, 5, 'raiseLand'); // height 1, flat neighbours: diff 1, fine
    // A second raise would once have been rejected as a 2-step cliff; now
    // the cascade lifts the four neighbours to 1 so the slope rule holds.
    expect(canPlace(tiles, heights, tunnels, 5, 5, 'raiseLand')).toBe(true);
    applyTool(tiles, heights, tunnels, 5, 5, 'raiseLand');
    expect(heights[idx(5, 5)]).toBe(2);
    for (const [x, y] of [
      [4, 5],
      [6, 5],
      [5, 4],
      [5, 6]
    ]) {
      expect(heights[idx(x, y)]).toBe(1);
    }
    // Diagonal neighbours were never forced past the limit, so they stay flat.
    expect(heights[idx(4, 4)]).toBe(0);
  });

  it('plans the cascade with per-step costs, and refuses when something immovable is in the way', () => {
    const { tiles, heights, tunnels } = createFlatPark();
    // Flat ground: a one-step raise plans exactly one tile, one step.
    const single = terraformPlan(tiles, heights, idx(5, 5), 1);
    expect(single).not.toBeNull();
    expect([...single!.entries()]).toEqual([[idx(5, 5), 1]]);
    expect(terraformSteps(single!, heights)).toBe(1);
    // From a height-1 tile, going to 3 needs the neighbours dragged to 2,
    // and their neighbours to 1 — count the full ripple's steps.
    heights[idx(5, 5)] = 1;
    const big = terraformPlan(tiles, heights, idx(5, 5), 3);
    expect(big).not.toBeNull();
    expect(big!.get(idx(5, 5))).toBe(3);
    expect(big!.get(idx(6, 5))).toBe(2);
    expect(big!.get(idx(7, 5))).toBe(1);
    expect(terraformSteps(big!, heights)).toBeGreaterThan(2);
    // A building two tiles out blocks the wide ripple a 2-step raise needs...
    tiles[idx(7, 5)] = 'carousel';
    expect(terraformPlan(tiles, heights, idx(5, 5), 3)).toBeNull();
    // ...but a change whose ripple stops short of it still plans fine.
    expect(terraformPlan(tiles, heights, idx(5, 5), 2)).not.toBeNull();
    // Out-of-range targets and locked tiles refuse outright.
    expect(terraformPlan(tiles, heights, idx(5, 5), MAX_HEIGHT + 1)).toBeNull();
    expect(terraformPlan(tiles, heights, idx(5, 5), 2, new Set([idx(5, 4)]))).toBeNull();
    expect(tunnels.every(t => t === false)).toBe(true);
  });

  it('caps height at MAX_HEIGHT', () => {
    const { tiles, heights, tunnels } = createFlatPark();
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
    const { tiles, heights, tunnels } = createFlatPark();
    tiles[idx(5, 5)] = 'carousel';
    expect(canPlace(tiles, heights, tunnels, 5, 5, 'raiseLand')).toBe(false);
  });
});

describe('park water', () => {
  it('places water only on flat grass', () => {
    const { tiles, heights, tunnels } = createFlatPark();
    expect(canPlace(tiles, heights, tunnels, 3, 3, 'water')).toBe(true);
    applyTool(tiles, heights, tunnels, 3, 3, 'water');
    expect(tiles[idx(3, 3)]).toBe('water');

    applyTool(tiles, heights, tunnels, 10, 10, 'raiseLand');
    expect(canPlace(tiles, heights, tunnels, 10, 10, 'water')).toBe(false);
  });

  it('gates the Log Flume on an adjacent water tile', () => {
    const { tiles, heights, tunnels, entrance } = createFlatPark();
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
    const { tiles, heights, tunnels } = createFlatPark();
    applyTool(tiles, heights, tunnels, 5, 5, 'path');
    // No raised neighbour yet — nothing to tunnel into.
    expect(canPlace(tiles, heights, tunnels, 5, 5, 'digTunnel')).toBe(false);
    applyTool(tiles, heights, tunnels, 6, 5, 'raiseLand');
    expect(canPlace(tiles, heights, tunnels, 5, 5, 'digTunnel')).toBe(true);
    applyTool(tiles, heights, tunnels, 5, 5, 'digTunnel');
    expect(tunnels[idx(5, 5)]).toBe(true);
  });

  it('refuses to dig a tunnel that already exists', () => {
    const { tiles, heights, tunnels } = createFlatPark();
    applyTool(tiles, heights, tunnels, 5, 5, 'path');
    applyTool(tiles, heights, tunnels, 6, 5, 'raiseLand');
    applyTool(tiles, heights, tunnels, 5, 5, 'digTunnel');
    expect(canPlace(tiles, heights, tunnels, 5, 5, 'digTunnel')).toBe(false);
  });

  it('bulldozing a tunnelled path clears the tunnel flag', () => {
    const { tiles, heights, tunnels } = createFlatPark();
    applyTool(tiles, heights, tunnels, 5, 5, 'path');
    applyTool(tiles, heights, tunnels, 6, 5, 'raiseLand');
    applyTool(tiles, heights, tunnels, 5, 5, 'digTunnel');
    applyTool(tiles, heights, tunnels, 5, 5, 'bulldoze');
    expect(tiles[idx(5, 5)]).toBe('grass');
    expect(tunnels[idx(5, 5)]).toBe(false);
  });

  it('raising or lowering a tunnelled tile closes the tunnel', () => {
    const { tiles, heights, tunnels } = createFlatPark();
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
    const { tiles, heights, tunnels, entrance } = createFlatPark();
    const ex = entrance % GRID_W;
    const site = idx(ex - 1, GRID_H - 2);
    expect(canPlace(tiles, heights, tunnels, ex - 1, GRID_H - 2, 'skytower')).toBe(false);
    // Set the height directly rather than via two chained raiseLand calls:
    // a real second raise would be rejected by the smoothing rule while its
    // neighbours are still flat (see the "refuses to raise..." test above).
    // This test is only about the height gate, not a realistic build order.
    heights[site] = 2;
    expect(canPlace(tiles, heights, tunnels, ex - 1, GRID_H - 2, 'skytower')).toBe(true);
  });
});

describe('park theme zones', () => {
  it('maps each gate tile to its zone', () => {
    expect(gateZone('gateFairytale')).toBe('fairytale');
    expect(gateZone('gateAdventure')).toBe('adventure');
    expect(gateZone('gatePirate')).toBe('pirate');
    expect(gateZone('carousel')).toBeNull();
    expect(gateZone('grass')).toBeNull();
  });

  it('unlocks Fairytale from the start and gates Adventure/Pirate on rating + cash', () => {
    expect(zoneUnlocked('fairytale', 0, 0)).toBe(true);
    expect(zoneUnlocked('adventure', 59, 3000)).toBe(false);
    expect(zoneUnlocked('adventure', 60, 2999)).toBe(false);
    expect(zoneUnlocked('adventure', 60, 3000)).toBe(true);
    expect(zoneUnlocked('pirate', 74, 6000)).toBe(false);
    expect(zoneUnlocked('pirate', 75, 5999)).toBe(false);
    expect(zoneUnlocked('pirate', 75, 6000)).toBe(true);
  });

  it('has no zone influence anywhere until a gate is placed', () => {
    const { tiles } = createFlatPark();
    expect(zoneAt(tiles, idx(5, 5))).toBeNull();
    expect(zoneAt(tiles, idx(0, 0))).toBeNull();
  });

  it('claims influence around a placed gate', () => {
    const { tiles, heights, tunnels } = createFlatPark();
    applyTool(tiles, heights, tunnels, 2, 2, 'gateFairytale');
    expect(tiles[idx(2, 2)]).toBe('gateFairytale');
    expect(zoneAt(tiles, idx(3, 3))).toBe('fairytale');
    // Far side of the map still has no gate nearby, but the whole map is
    // partitioned by nearest gate once at least one exists.
    expect(zoneAt(tiles, idx(20, 10))).toBe('fairytale');
  });

  it('splits influence between two gates by Chebyshev distance', () => {
    const { tiles, heights, tunnels } = createFlatPark();
    applyTool(tiles, heights, tunnels, 1, 1, 'gateFairytale');
    applyTool(tiles, heights, tunnels, GRID_W - 2, GRID_H - 2, 'gateAdventure');
    expect(zoneAt(tiles, idx(2, 2))).toBe('fairytale');
    expect(zoneAt(tiles, idx(GRID_W - 3, GRID_H - 3))).toBe('adventure');
  });

  it('precomputes the same zone per tile as zoneAt, for every tile', () => {
    const { tiles, heights, tunnels } = createFlatPark();
    applyTool(tiles, heights, tunnels, 1, 1, 'gateFairytale');
    applyTool(tiles, heights, tunnels, GRID_W - 2, GRID_H - 2, 'gateAdventure');
    const precomputed = zonesForTiles(tiles);
    expect(precomputed).toHaveLength(tiles.length);
    tiles.forEach((_, i) => {
      expect(precomputed[i]).toBe(zoneAt(tiles, i));
    });
  });

  it('discounts a zone native attraction inside its own influence, but not other buildings', () => {
    const { tiles, heights, tunnels } = createFlatPark();
    applyTool(tiles, heights, tunnels, 5, 5, 'gateFairytale');
    // Fairytale's native attraction is the carousel — the sole gate on the
    // map claims the whole grid, so the discount reaches even a far tile.
    expect(zoneDiscountFactor(tiles, idx(6, 5), 'carousel')).toBe(0.9);
    expect(zoneDiscountFactor(tiles, idx(20, 10), 'carousel')).toBe(0.9);
    expect(zoneDiscountFactor(tiles, idx(6, 5), 'ferris')).toBe(1);
  });

  it('gives no discount anywhere before any gate is placed', () => {
    const { tiles } = createFlatPark();
    expect(zoneDiscountFactor(tiles, idx(5, 5), 'carousel')).toBe(1);
  });

  it('applies the discount to toolCost when a location is given', () => {
    const { tiles, heights, tunnels } = createFlatPark();
    applyTool(tiles, heights, tunnels, 5, 5, 'gateFairytale');
    const base = BUILDINGS.carousel!.cost;
    expect(toolCost('carousel')).toBe(base);
    expect(toolCost('carousel', tiles, idx(6, 5))).toBe(Math.round(base * 0.9));
    expect(toolCost('ferris', tiles, idx(6, 5))).toBe(BUILDINGS.ferris!.cost);
  });

  it('prices every zone gate and matches the ZONES catalogue', () => {
    expect(toolCost('gateFairytale')).toBeGreaterThan(0);
    expect(toolCost('gateAdventure')).toBeGreaterThan(0);
    expect(toolCost('gatePirate')).toBeGreaterThan(0);
    expect(ZONES.fairytale.native).toBe('carousel');
    expect(ZONES.adventure.native).toBe('flume');
    expect(ZONES.pirate.native).toBe('ferris');
  });
});

describe('park pathfinding', () => {
  it('finds the shortest route along a corridor', () => {
    const { tiles, entrance } = createFlatPark();
    for (let n = 3; n <= 6; n++) tiles[entrance - n * GRID_W] = 'path';
    const path = findPath(tiles, entrance, entrance - 6 * GRID_W);
    expect(path).not.toBeNull();
    expect(path!).toHaveLength(7);
    expect(path![0]).toBe(entrance);
  });

  it('returns null for disconnected targets', () => {
    const { tiles, entrance } = createFlatPark();
    tiles[idx(0, 0)] = 'path';
    expect(findPath(tiles, entrance, idx(0, 0))).toBeNull();
  });

  it('routes guests to the nearest reachable building', () => {
    const { tiles, entrance } = createFlatPark();
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
    const { tiles, entrance } = createFlatPark();
    const building = entrance - GRID_W - 1; // beside the starter path
    tiles[building] = 'drink';
    const stands = adjacentWalkable(tiles, building);
    expect(stands).toContain(entrance - GRID_W);
    for (const stand of stands) {
      expect(['path', 'entrance']).toContain(tiles[stand]);
    }
  });

  it('bfs from a non-walkable tile reaches nothing', () => {
    const { tiles } = createFlatPark();
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
    const needs = { fun: 90, hunger: 95, thirst: 100, bladder: 100, thrill: 90 };
    expect(mostUrgentNeed(needs)).toBeNull();
    needs.hunger = 40;
    needs.thirst = 30;
    expect(mostUrgentNeed(needs)).toBe('thirst');
  });

  it('satisfying a need caps at 100 and lifts happiness', () => {
    const needs = { fun: 10, hunger: 100, thirst: 100, bladder: 100, thrill: 100 };
    const before = happiness(needs);
    satisfyNeed(needs, 'fun', 95);
    expect(needs.fun).toBe(100);
    expect(happiness(needs)).toBeGreaterThan(before);
  });

  it('decays thrill slower than fun, so an un-built coaster is less punishing than an un-built ride', () => {
    // Equalize the starting values first — createNeeds gives thrill a
    // higher starting range than fun, which would make this assertion pass
    // regardless of decay rate. Comparing the loss from the same baseline
    // isolates the rate itself.
    const needs = createNeeds(() => 0.5);
    needs.fun = 80;
    needs.thrill = 80;
    decayNeeds(needs, 5);
    expect(needs.thrill).toBeGreaterThan(needs.fun);
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
    const { tiles, heights, tunnels } = createFlatPark();
    expect(dailyUpkeep(tiles)).toBe(0);
    applyTool(tiles, heights, tunnels, 0, 0, 'carousel');
    applyTool(tiles, heights, tunnels, 1, 0, 'toilet');
    expect(dailyUpkeep(tiles)).toBe(BUILDINGS.carousel!.upkeep + BUILDINGS.toilet!.upkeep);
  });

  it('discounts upkeep for a zone native attraction inside its own influence', () => {
    const { tiles, heights, tunnels } = createFlatPark();
    applyTool(tiles, heights, tunnels, 0, 0, 'gateFairytale');
    applyTool(tiles, heights, tunnels, 1, 0, 'carousel'); // native to Fairytale
    applyTool(tiles, heights, tunnels, 2, 0, 'toilet'); // not a native attraction anywhere
    const expected =
      Math.round(BUILDINGS.carousel!.upkeep * 0.9) + BUILDINGS.toilet!.upkeep;
    expect(dailyUpkeep(tiles)).toBe(expected);
  });
});

describe('coaster track', () => {
  /**
   * Builds a closed clockwise loop around the perimeter of a w×h rectangle
   * anchored at (x0, y0), with dir/kind derived purely from tile geometry
   * (turnR at every corner, flat along every straight run) — every segment
   * is internally consistent by construction, so tests only need to
   * override the specific kind(s) they're exercising.
   */
  function rectLoop(x0: number, y0: number, w: number, h: number): Segment[] {
    const tiles: number[] = [];
    for (let x = x0; x < x0 + w; x++) tiles.push(idx(x, y0));
    for (let y = y0 + 1; y < y0 + h; y++) tiles.push(idx(x0 + w - 1, y));
    for (let x = x0 + w - 2; x >= x0; x--) tiles.push(idx(x, y0 + h - 1));
    for (let y = y0 + h - 2; y > y0; y--) tiles.push(idx(x0, y));
    const n = tiles.length;
    return tiles.map((tile, i) => {
      const dir = dirBetween(tile, tiles[(i + 1) % n])!;
      const prevDir = dirBetween(tiles[(i - 1 + n) % n], tile)!;
      const kind: SegmentKind = dir === prevDir ? 'flat' : rotateDir(prevDir, 1) === dir ? 'turnR' : 'turnL';
      return { tile, dir, kind };
    });
  }

  /** First segment with the given kind — a stand-in for "one of the straight middles". */
  function firstOfKind(segments: Segment[], kind: SegmentKind, from = 0): number {
    return segments.findIndex((s, i) => i >= from && s.kind === kind);
  }

  /**
   * Sequentially derives a heights array consistent with each segment's own
   * kind (up=+1, down=-1, else=0) starting from 0 at segments[0].tile — so
   * every segment's own dh check passes by construction. The loop only
   * closes back to a self-consistent height at segments[0] if the chosen
   * kinds' deltas sum to zero around the loop; tests that want a closed,
   * height-consistent loop balance their up/down picks accordingly.
   */
  function heightsFor(segments: Segment[]): number[] {
    const heights = new Array(GRID_W * GRID_H).fill(0);
    let h = 0;
    for (let i = 0; i < segments.length; i++) {
      heights[segments[i].tile] = h;
      const dh = segments[i].kind === 'up' ? 1 : segments[i].kind === 'down' ? -1 : 0;
      h += dh;
    }
    return heights;
  }

  function withStation(segments: Segment[]): Segment[] {
    const copy = segments.map(s => ({ ...s }));
    copy[firstOfKind(copy, 'flat')].kind = 'station';
    return copy;
  }

  describe('stepTile / dirBetween / rotateDir', () => {
    it('steps one tile per direction and returns null past the edge', () => {
      const tile = idx(5, 5);
      expect(stepTile(tile, 1)).toBe(idx(6, 5)); // east
      expect(stepTile(tile, 2)).toBe(idx(5, 6)); // south
      expect(stepTile(idx(0, 5), 3)).toBeNull(); // west off the left edge
      expect(stepTile(idx(5, 0), 0)).toBeNull(); // north off the top edge
    });

    it('finds the direction between orthogonal neighbours, or null otherwise', () => {
      expect(dirBetween(idx(5, 5), idx(6, 5))).toBe(1);
      expect(dirBetween(idx(5, 5), idx(5, 4))).toBe(0);
      expect(dirBetween(idx(5, 5), idx(6, 6))).toBeNull(); // diagonal
      expect(dirBetween(idx(5, 5), idx(5, 5))).toBeNull(); // same tile
    });

    it('rotates directions left and right, wrapping at the compass', () => {
      expect(rotateDir(0, 1)).toBe(1);
      expect(rotateDir(0, -1)).toBe(3);
      expect(rotateDir(3, 1)).toBe(0);
    });

    it('derives corner kinds from entry and exit directions', () => {
      expect(turnKind(0, 0)).toBeNull(); // straight through
      expect(turnKind(0, 1)).toBe('turnR'); // north → east
      expect(turnKind(0, 3)).toBe('turnL'); // north → west
      expect(turnKind(3, 0)).toBe('turnR'); // west → north wraps the compass
      expect(turnKind(2, 1)).toBe('turnL'); // south → east
    });

    it('maps each segment kind to its exit height step', () => {
      expect(segmentClimb('up')).toBe(1);
      expect(segmentClimb('down')).toBe(-1);
      expect(segmentClimb('flat')).toBe(0);
      expect(segmentClimb('station')).toBe(0);
      expect(segmentClimb('turnL')).toBe(0);
      expect(segmentClimb('turnR')).toBe(0);
    });
  });

  describe('validateTrack', () => {
    it('accepts a minimal valid closed loop with exactly one station', () => {
      const loop = withStation(rectLoop(1, 1, 3, 2));
      expect(loop).toHaveLength(MIN_TRACK_LENGTH);
      expect(validateTrack(loop, heightsFor(loop))).toEqual({ ok: true });
    });

    it('rejects a loop shorter than the minimum', () => {
      const loop = withStation(rectLoop(1, 1, 3, 2)).slice(0, 3);
      expect(validateTrack(loop, heightsFor(rectLoop(1, 1, 3, 2)))).toEqual({
        ok: false,
        error: 'tooShort'
      });
    });

    it('rejects a loop that revisits a tile', () => {
      const loop = withStation(rectLoop(1, 1, 3, 2));
      loop[loop.length - 1].tile = loop[0].tile;
      expect(validateTrack(loop, heightsFor(loop)).ok).toBe(false);
      expect((validateTrack(loop, heightsFor(loop)) as { error: string }).error).toBe(
        'duplicateTile'
      );
    });

    it('rejects a loop with no station', () => {
      const loop = rectLoop(1, 1, 3, 2); // all turnR/flat, no station
      expect(validateTrack(loop, heightsFor(loop))).toEqual({ ok: false, error: 'needsStation' });
    });

    it('rejects a loop with more than one station', () => {
      const loop = withStation(rectLoop(1, 1, 4, 2));
      const secondFlat = firstOfKind(loop, 'flat');
      loop[secondFlat].kind = 'station';
      expect(validateTrack(loop, heightsFor(loop))).toEqual({ ok: false, error: 'needsStation' });
    });

    it('rejects a loop whose dir does not actually reach the next tile', () => {
      const loop = withStation(rectLoop(1, 1, 3, 2));
      loop[0].dir = rotateDir(loop[0].dir, 1);
      expect(validateTrack(loop, heightsFor(loop))).toEqual({ ok: false, error: 'notClosed' });
    });

    it('rejects a kind whose implied turn does not match the observed dir', () => {
      const loop = withStation(rectLoop(1, 1, 3, 2));
      const turnSeg = loop.find(s => s.kind === 'turnR')!;
      turnSeg.kind = 'turnL'; // dir stays the same, but turnL expects the opposite rotation
      expect(validateTrack(loop, heightsFor(loop))).toEqual({ ok: false, error: 'notClosed' });
    });

    it('rejects a flat/turn segment whose actual height delta is nonzero', () => {
      const loop = withStation(rectLoop(1, 1, 3, 2));
      const heights = heightsFor(loop);
      heights[loop[0].tile] += 1; // breaks the dh=0 expectation on whichever segment leads into it
      expect(validateTrack(loop, heights)).toEqual({ ok: false, error: 'heightMismatch' });
    });

    it('rejects an up segment over flat terrain as a height mismatch, not a geometry error', () => {
      // The terraform-mid-draft workflow: track laid first, land shaped
      // after. A forgotten raise must point at the terrain, not the loop.
      const loop = withStation(rectLoop(1, 1, 4, 2));
      loop[firstOfKind(loop, 'flat')].kind = 'up';
      expect(validateTrack(loop, heightsFor(loop))).toEqual({ ok: false, error: 'heightMismatch' });
    });

    it('rejects two consecutive up/down segments with no flat between them', () => {
      // A 5-wide top edge has three straight middle tiles in a row; the
      // 5-wide bottom edge balances the height change back to zero so the
      // loop still closes, isolating the steepness rule as the only failure.
      const loop = rectLoop(1, 1, 5, 2);
      const topFlats = loop.map((s, i) => (s.kind === 'flat' ? i : -1)).filter(i => i >= 0);
      const [up1, up2, station] = topFlats.slice(0, 3);
      const [down1, down2] = topFlats.slice(3, 5);
      loop[up1].kind = 'up';
      loop[up2].kind = 'up';
      loop[station].kind = 'station';
      loop[down1].kind = 'down';
      loop[down2].kind = 'down';
      expect(validateTrack(loop, heightsFor(loop))).toEqual({ ok: false, error: 'tooSteep' });
    });

    it('accepts an isolated up/down pair separated by a flat', () => {
      const loop = rectLoop(1, 1, 5, 2);
      const topFlats = loop.map((s, i) => (s.kind === 'flat' ? i : -1)).filter(i => i >= 0);
      const [up, station, down] = topFlats.slice(0, 3);
      loop[up].kind = 'up';
      loop[station].kind = 'station';
      loop[down].kind = 'down';
      expect(validateTrack(loop, heightsFor(loop))).toEqual({ ok: true });
    });
  });

  describe('rotateToStation', () => {
    it('rotates the loop so the station segment is first, preserving cyclic order', () => {
      const loop = withStation(rectLoop(1, 1, 3, 2));
      const stationTile = loop.find(s => s.kind === 'station')!.tile;
      const rotated = rotateToStation(loop);
      expect(rotated[0].kind).toBe('station');
      expect(rotated[0].tile).toBe(stationTile);
      expect(rotated).toHaveLength(loop.length);
      // Same cyclic sequence, just rotated — every tile still appears once.
      expect(new Set(rotated.map(s => s.tile))).toEqual(new Set(loop.map(s => s.tile)));
    });

    it('is a no-op when the station is already first', () => {
      const loop = withStation(rectLoop(1, 1, 3, 2));
      const stationIndex = loop.findIndex(s => s.kind === 'station');
      const rotatedOnce = rotateToStation(loop);
      expect(rotateToStation(rotatedOnce)).toEqual(rotatedOnce);
      expect(stationIndex).toBeGreaterThanOrEqual(0);
    });
  });

  describe('trackHeightDrop / thrillBoost', () => {
    it('is zero for a flat loop', () => {
      const loop = withStation(rectLoop(1, 1, 3, 2));
      expect(trackHeightDrop(loop, heightsFor(loop))).toBe(0);
    });

    it('sums only the descending segments', () => {
      const loop = rectLoop(1, 1, 5, 2);
      const topFlats = loop.map((s, i) => (s.kind === 'flat' ? i : -1)).filter(i => i >= 0);
      const [up, station, down] = topFlats.slice(0, 3);
      loop[up].kind = 'up';
      loop[station].kind = 'station';
      loop[down].kind = 'down';
      expect(trackHeightDrop(loop, heightsFor(loop))).toBe(1);
    });

    it('scales thrill boost with height drop and loop length, capped at 100', () => {
      const flatLoop = withStation(rectLoop(1, 1, 3, 2));
      const flatBoost = thrillBoost(flatLoop, heightsFor(flatLoop));

      const hillLoop = rectLoop(1, 1, 5, 2);
      const topFlats = hillLoop.map((s, i) => (s.kind === 'flat' ? i : -1)).filter(i => i >= 0);
      const [up, station, down] = topFlats.slice(0, 3);
      hillLoop[up].kind = 'up';
      hillLoop[station].kind = 'station';
      hillLoop[down].kind = 'down';
      const hillBoost = thrillBoost(hillLoop, heightsFor(hillLoop));

      expect(hillBoost).toBeGreaterThan(flatBoost);
      expect(hillBoost).toBeLessThanOrEqual(100);
      expect(flatBoost).toBeGreaterThan(0);
    });
  });

  describe('cart speed model', () => {
    it('accelerates going down, within the max speed clamp', () => {
      let speed = CART_CRUISE_SPEED;
      for (let i = 0; i < 10; i++) speed = nextCartSpeed(speed, 'down', 0.5);
      expect(speed).toBeGreaterThan(CART_CRUISE_SPEED);
      expect(speed).toBeLessThanOrEqual(CART_MAX_SPEED);
    });

    it('decelerates going up, but never below the min speed clamp', () => {
      let speed = CART_CRUISE_SPEED;
      for (let i = 0; i < 20; i++) speed = nextCartSpeed(speed, 'up', 0.5);
      expect(speed).toBeGreaterThanOrEqual(CART_MIN_SPEED);
      expect(speed).toBe(CART_MIN_SPEED);
    });

    it('drags flat-segment speed back toward cruise speed', () => {
      let speed = CART_MAX_SPEED;
      for (let i = 0; i < 20; i++) speed = nextCartSpeed(speed, 'flat', 0.5);
      expect(speed).toBeCloseTo(CART_CRUISE_SPEED, 1);
    });
  });

  describe('advanceU', () => {
    it('advances progress and wraps at the loop length', () => {
      expect(advanceU(0, 2, 1, 10)).toBe(2);
      expect(advanceU(9, 2, 1, 10)).toBe(1); // 11 wraps to 1 in a loop of length 10
    });
  });

  describe('canPlaceTrack', () => {
    it('requires every segment tile to currently be grass', () => {
      const loop = withStation(rectLoop(1, 1, 3, 2));
      const { tiles, heights, tunnels } = createFlatPark();
      expect(canPlaceTrack(tiles, loop)).toBe(true);
      applyTool(tiles, heights, tunnels, 2, 1, 'tree');
      expect(canPlaceTrack(tiles, loop)).toBe(false);
    });
  });

  it('prices the track tile like any other simple tool', () => {
    expect(toolCost('track')).toBeGreaterThan(0);
  });
});

describe('park mayhem', () => {
  it('stays calm through the grace days, then ramps to a cap of 1', () => {
    expect(mayhemIntensity(1)).toBe(0);
    expect(mayhemIntensity(MAYHEM_GRACE_DAYS)).toBe(0);
    const early = mayhemIntensity(MAYHEM_GRACE_DAYS + 2);
    const later = mayhemIntensity(MAYHEM_GRACE_DAYS + 8);
    expect(early).toBeGreaterThan(0);
    expect(later).toBeGreaterThan(early);
    expect(mayhemIntensity(999)).toBe(1);
  });

  it('classes exactly the fun buildings as breakable rides', () => {
    expect(isRide('carousel')).toBe(true);
    expect(isRide('ferris')).toBe(true);
    expect(isRide('flume')).toBe(true);
    expect(isRide('skytower')).toBe(true);
    expect(isRide('food')).toBe(false);
    expect(isRide('toilet')).toBe(false);
    expect(isRide('grass')).toBe(false);
    expect(isRide('track')).toBe(false);
  });

  it('breakdown odds scale with the ride count and stay zero early on', () => {
    expect(breakdownChance(2, 5)).toBe(0);
    const few = breakdownChance(20, 1);
    const many = breakdownChance(20, 4);
    expect(few).toBeGreaterThan(0);
    expect(many).toBeCloseTo(few * 4);
    expect(coasterStallChance(2)).toBe(0);
    expect(coasterStallChance(20)).toBeGreaterThan(0);
  });

  it('picks a working ride to break, never an already-broken or non-ride tile', () => {
    const { tiles } = createFlatPark();
    tiles[idx(4, 4)] = 'carousel';
    tiles[idx(6, 4)] = 'ferris';
    tiles[idx(8, 4)] = 'food';
    const first = pickBreakdownTile(tiles, [], () => 0);
    expect(first === idx(4, 4) || first === idx(6, 4)).toBe(true);
    const second = pickBreakdownTile(tiles, [idx(4, 4)], () => 0);
    expect(second).toBe(idx(6, 4));
    expect(pickBreakdownTile(tiles, [idx(4, 4), idx(6, 4)], () => 0)).toBeNull();
  });

  it('never picks a breakdown in a park with no rides', () => {
    const { tiles } = createFlatPark();
    tiles[idx(4, 4)] = 'food';
    expect(pickBreakdownTile(tiles, [], () => 0)).toBeNull();
  });

  it('rolls no surge during the grace days, bigger ones as the park matures', () => {
    expect(rollSurge(2, () => 0)).toBeNull();
    const surge = rollSurge(MAYHEM_GRACE_DAYS + 14, () => 0);
    expect(surge).not.toBeNull();
    expect(surge!.secondsLeft).toBe(SURGE_SECONDS);
    expect(surge!.factor).toBe(3); // 2 + intensity at full ramp
    // An unlucky roll yields nothing
    expect(rollSurge(MAYHEM_GRACE_DAYS + 14, () => 0.99)).toBeNull();
  });

  it('divides the spawn interval only while a surge is running', () => {
    expect(surgedInterval(9, null)).toBe(9);
    expect(surgedInterval(9, { secondsLeft: 10, factor: 3 })).toBe(3);
  });

  it('grows the guest cap from 60 to 120 as the park matures', () => {
    expect(maxGuests(1)).toBe(60);
    expect(maxGuests(MAYHEM_GRACE_DAYS + 7)).toBe(90);
    expect(maxGuests(999)).toBe(120);
    for (let d = 1; d < 40; d++) expect(maxGuests(d + 1)).toBeGreaterThanOrEqual(maxGuests(d));
  });
});

describe('park staff wages & operating cost', () => {
  it('charges no wages through the grace window, then a linear unbounded climb', () => {
    expect(wagePerAttraction(1)).toBe(0);
    expect(wagePerAttraction(WAGE_GRACE_DAYS)).toBe(0);
    const early = wagePerAttraction(WAGE_GRACE_DAYS + 2);
    const later = wagePerAttraction(WAGE_GRACE_DAYS + 20);
    expect(early).toBeGreaterThan(0);
    expect(later).toBeGreaterThan(early);
    // Each extra day past grace adds exactly WAGE_RAMP.
    expect(
      wagePerAttraction(WAGE_GRACE_DAYS + 11) - wagePerAttraction(WAGE_GRACE_DAYS + 10)
    ).toBeCloseTo(WAGE_RAMP);
  });

  it('counts placed rides and stalls as wage-bearing attractions, not décor or paths', () => {
    const { tiles, heights, tunnels } = createFlatPark();
    expect(attractionCount(tiles)).toBe(0);
    applyTool(tiles, heights, tunnels, 0, 0, 'carousel');
    applyTool(tiles, heights, tunnels, 1, 0, 'food');
    applyTool(tiles, heights, tunnels, 2, 0, 'tree'); // décor
    applyTool(tiles, heights, tunnels, 3, 0, 'path'); // path
    expect(attractionCount(tiles)).toBe(2);
  });

  it('equals upkeep during grace, then adds a wage bill that scales with attractions', () => {
    const { tiles, heights, tunnels } = createFlatPark();
    applyTool(tiles, heights, tunnels, 0, 0, 'carousel');
    applyTool(tiles, heights, tunnels, 1, 0, 'food');
    const upkeep = dailyUpkeep(tiles);
    expect(operatingCost(tiles, WAGE_GRACE_DAYS)).toBe(upkeep);
    const day = WAGE_GRACE_DAYS + 10;
    expect(operatingCost(tiles, day)).toBe(upkeep + Math.round(2 * wagePerAttraction(day)));
    expect(operatingCost(tiles, day)).toBeGreaterThan(upkeep);
  });

  it('is monotonic non-decreasing in day for a fixed park', () => {
    const { tiles, heights, tunnels } = createFlatPark();
    applyTool(tiles, heights, tunnels, 0, 0, 'ferris');
    applyTool(tiles, heights, tunnels, 1, 0, 'drink');
    for (let d = 1; d < 80; d++) {
      expect(operatingCost(tiles, d + 1)).toBeGreaterThanOrEqual(operatingCost(tiles, d));
    }
  });

  it('re-arms bankruptcy: wages eventually exceed any single attraction\'s daily takings', () => {
    // Beyond the crossover day every attraction is net-negative regardless of
    // park size — the crowd (hence revenue) is capped, the wage bill is not,
    // so the run is guaranteed to end. Early on the wage sits under the ceiling.
    const ceiling = maxAttractionDailyRevenue();
    expect(ceiling).toBeGreaterThan(0);
    expect(wagePerAttraction(WAGE_GRACE_DAYS + 1)).toBeLessThan(ceiling);
    expect(wagePerAttraction(500)).toBeGreaterThan(ceiling);
  });
});

describe('park objectives', () => {
  it('is an ordered ladder ending in exactly one prestige win', () => {
    expect(PARK_OBJECTIVES.length).toBeGreaterThanOrEqual(4);
    const wins = PARK_OBJECTIVES.filter(o => o.win);
    expect(wins).toHaveLength(1);
    expect(PARK_OBJECTIVES[PARK_OBJECTIVES.length - 1].win).toBe(true);
    // Every rung but the finish pays a positive reward; the finish pays none.
    for (const o of PARK_OBJECTIVES) {
      if (o.win) expect(o.reward).toBe(0);
      else expect(o.reward).toBeGreaterThan(0);
    }
  });

  it('rises within each metric', () => {
    for (const metric of ['welcomed', 'rating', 'peak'] as const) {
      const targets = PARK_OBJECTIVES.filter(o => o.metric === metric).map(o => o.target);
      for (let i = 1; i < targets.length; i++) {
        expect(targets[i]).toBeGreaterThan(targets[i - 1]);
      }
    }
  });

  it('meets an objective at its target (>=) and clamps the readout progress', () => {
    const obj = PARK_OBJECTIVES[0]; // welcomed >= 10
    expect(objectiveMet(obj, { welcomed: 9, peak: 0, rating: 0 })).toBe(false);
    expect(objectiveMet(obj, { welcomed: 10, peak: 0, rating: 0 })).toBe(true);
    expect(objectiveProgress(obj, { welcomed: 4, peak: 0, rating: 0 })).toBe(4);
    expect(objectiveProgress(obj, { welcomed: 999, peak: 0, rating: 0 })).toBe(obj.target);
  });
});
