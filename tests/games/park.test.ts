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
  gateZone,
  footprintTiles,
  footprintOf
} from '../../src/games/park/grid';
import { findPath, bfsFrom, nearestReachable, adjacentWalkable } from '../../src/games/park/pathfind';
import { seededRandom } from './seeded-random';
import {
  createNeeds,
  decayNeeds,
  mostUrgentNeed,
  satisfyNeed,
  happiness,
  URGENT_THRESHOLD,
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
  rollSurge,
  surgedInterval,
  maxGuests,
  SURGE_SECONDS
} from '../../src/games/park/mayhem';

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
    expect(ZONES.pirate.native).toBe('pirateship');
  });

  it('discounts the Pirate Ship inside pirate-zone influence (its new native)', () => {
    const { tiles, heights, tunnels } = createFlatPark();
    applyTool(tiles, heights, tunnels, 5, 5, 'gatePirate');
    expect(zoneDiscountFactor(tiles, idx(6, 5), 'pirateship')).toBe(0.9);
    // The ferris lost its native discount when the ship took the slot.
    expect(zoneDiscountFactor(tiles, idx(6, 5), 'ferris')).toBe(1);
  });
});

describe('park attraction catalogue (Round 7)', () => {
  it('prices, charges and staffs every new attraction like the rest', () => {
    for (const tile of ['pirateship', 'manor', 'bumper', 'helter'] as const) {
      const def = BUILDINGS[tile];
      expect(def, tile).toBeDefined();
      expect(def!.cost).toBeGreaterThan(0);
      expect(def!.price).toBeGreaterThan(0);
      expect(def!.upkeep).toBeGreaterThan(0);
      expect(def!.boost).toBeGreaterThan(0);
      expect(def!.useTime).toBeGreaterThan(0);
      expect(toolCost(tile)).toBe(def!.cost);
    }
  });

  it('makes the Pirate Ship the only single-tile thrill satisfier, and treats it as a ride', () => {
    const thrill = (Object.keys(BUILDINGS) as (keyof typeof BUILDINGS)[]).filter(
      t => BUILDINGS[t]!.satisfies === 'thrill' && (BUILDINGS[t]!.footprint ?? 1) === 1
    );
    expect(thrill).toEqual(['pirateship']);
    // The coaster is also a thrill satisfier, but a 2×2 placed ride, not a
    // single-tile one — the premium thrill option above the Pirate Ship.
    expect(BUILDINGS.coaster).toBeDefined();
    expect(BUILDINGS.coaster!.satisfies).toBe('thrill');
    expect(BUILDINGS.coaster!.footprint).toBe(2);
    expect(BUILDINGS.coaster!.boost).toBe(100);
    expect(isRide('coaster')).toBe(true);
    // Rides (fun or thrill) break down; stalls/toilets do not.
    expect(isRide('pirateship')).toBe(true);
    expect(isRide('manor')).toBe(true);
    expect(isRide('bumper')).toBe(true);
    expect(isRide('helter')).toBe(true);
    expect(isRide('food')).toBe(false);
    expect(isRide('toilet')).toBe(false);
  });

  it('lets a thrill-starved guest in a coasterless park reach and be satisfied by a Pirate Ship', () => {
    // The gap this closes: before the ship, a park with no built coaster had
    // no thrill source, so thrill-urgent guests could never be served.
    const { tiles, entrance } = createFlatPark();
    for (let n = 3; n <= 6; n++) tiles[entrance - n * GRID_W] = 'path';
    const ship = entrance - 5 * GRID_W + 1;
    tiles[ship] = 'pirateship';

    // A guest whose lowest need is thrill picks thrill as its want.
    const needs = createNeeds(() => 0.5);
    needs.thrill = 12;
    expect(mostUrgentNeed(needs)).toBe('thrill');

    // The candidate scan chooseAction runs for thrill: coaster stations plus
    // any thrill-satisfying building. With no coaster, the ship is reachable.
    const candidates: number[] = [];
    tiles.forEach((t, i) => {
      if (BUILDINGS[t]?.satisfies === 'thrill') candidates.push(i);
    });
    const found = nearestReachable(tiles, entrance, candidates);
    expect(found).not.toBeNull();
    expect(found!.building).toBe(ship);

    // Using it restores the need above the urgent line (the generic
    // using-handler applies def.satisfies/def.boost).
    satisfyNeed(needs, BUILDINGS.pirateship!.satisfies, BUILDINGS.pirateship!.boost);
    expect(needs.thrill).toBeGreaterThan(URGENT_THRESHOLD);
  });
});

describe('park coaster (2×2 placed ride)', () => {
  const CELLS = [idx(5, 5), idx(6, 5), idx(5, 6), idx(6, 6)];

  it('enumerates a square footprint anchored at its top-left, or null off-grid', () => {
    expect(footprintTiles(3, 4, 2)).toEqual([idx(3, 4), idx(4, 4), idx(3, 5), idx(4, 5)]);
    expect(footprintTiles(7, 2, 1)).toEqual([idx(7, 2)]);
    expect(footprintTiles(GRID_W - 1, 5, 2)).toBeNull(); // runs off the right edge
    expect(footprintTiles(5, GRID_H - 1, 2)).toBeNull(); // runs off the bottom edge
  });

  it('places the coaster on flat grass with a path adjacent to the block', () => {
    const { tiles, heights, tunnels } = createFlatPark();
    applyTool(tiles, heights, tunnels, 4, 5, 'path'); // west of the anchor
    expect(canPlace(tiles, heights, tunnels, 5, 5, 'coaster')).toBe(true);
  });

  it('refuses when any of the four tiles is not grass', () => {
    const { tiles, heights, tunnels } = createFlatPark();
    applyTool(tiles, heights, tunnels, 4, 5, 'path');
    applyTool(tiles, heights, tunnels, 6, 6, 'tree'); // a tree inside the block
    expect(canPlace(tiles, heights, tunnels, 5, 5, 'coaster')).toBe(false);
  });

  it('refuses when the block would run off the grid', () => {
    const { tiles, heights, tunnels } = createFlatPark();
    expect(canPlace(tiles, heights, tunnels, GRID_W - 1, 5, 'coaster')).toBe(false);
  });

  it('refuses when the four tiles are not all at the same height', () => {
    const { tiles, heights, tunnels } = createFlatPark();
    applyTool(tiles, heights, tunnels, 4, 5, 'path');
    heights[idx(6, 6)] = 1; // one footprint tile raised above the anchor
    expect(canPlace(tiles, heights, tunnels, 5, 5, 'coaster')).toBe(false);
  });

  it('refuses when no footprint tile has an adjacent path', () => {
    const { tiles, heights, tunnels } = createFlatPark();
    expect(canPlace(tiles, heights, tunnels, 5, 5, 'coaster')).toBe(false);
  });

  it('writes the anchor and three annex tiles, priced like any building', () => {
    const { tiles, heights, tunnels } = createFlatPark();
    applyTool(tiles, heights, tunnels, 4, 5, 'path');
    applyTool(tiles, heights, tunnels, 5, 5, 'coaster');
    expect(tiles[idx(5, 5)]).toBe('coaster');
    expect(tiles[idx(6, 5)]).toBe('rideannex');
    expect(tiles[idx(5, 6)]).toBe('rideannex');
    expect(tiles[idx(6, 6)]).toBe('rideannex');
    expect(toolCost('coaster')).toBe(BUILDINGS.coaster!.cost);
  });

  it('recovers the whole footprint from the anchor or any annex tile', () => {
    const { tiles, heights, tunnels } = createFlatPark();
    applyTool(tiles, heights, tunnels, 4, 5, 'path');
    applyTool(tiles, heights, tunnels, 5, 5, 'coaster');
    const want = new Set(CELLS);
    for (const cell of CELLS) {
      expect(new Set(footprintOf(tiles, cell))).toEqual(want);
    }
  });

  it('clears all four tiles when the anchor is bulldozed', () => {
    const { tiles, heights, tunnels } = createFlatPark();
    applyTool(tiles, heights, tunnels, 4, 5, 'path');
    applyTool(tiles, heights, tunnels, 5, 5, 'coaster');
    applyTool(tiles, heights, tunnels, 5, 5, 'bulldoze');
    for (const cell of CELLS) expect(tiles[cell]).toBe('grass');
  });

  it('clears all four tiles when an annex is bulldozed', () => {
    const { tiles, heights, tunnels } = createFlatPark();
    applyTool(tiles, heights, tunnels, 4, 5, 'path');
    applyTool(tiles, heights, tunnels, 5, 5, 'coaster');
    applyTool(tiles, heights, tunnels, 6, 6, 'bulldoze'); // an annex, not the anchor
    for (const cell of CELLS) expect(tiles[cell]).toBe('grass');
  });

  it('counts the placed coaster once for attractions and upkeep', () => {
    const { tiles, heights, tunnels } = createFlatPark();
    applyTool(tiles, heights, tunnels, 4, 5, 'path');
    applyTool(tiles, heights, tunnels, 5, 5, 'coaster');
    expect(attractionCount(tiles)).toBe(1);
    expect(dailyUpkeep(tiles)).toBe(BUILDINGS.coaster!.upkeep);
  });

  it('offers standing tiles spanning the whole block, not just beside the anchor', () => {
    const { tiles, heights, tunnels } = createFlatPark();
    applyTool(tiles, heights, tunnels, 7, 6, 'path'); // adjacent to the (6,6) annex tile
    applyTool(tiles, heights, tunnels, 5, 5, 'coaster');
    const stands = adjacentWalkable(tiles, idx(5, 5));
    expect(stands).toContain(idx(7, 6));
  });

  it('lets a thrill-starved guest reach and be satisfied by a placed 2×2 coaster', () => {
    const { tiles, heights, tunnels, entrance } = createFlatPark();
    for (let n = 3; n <= 8; n++) tiles[entrance - n * GRID_W] = 'path';
    const anchorX = 13;
    const anchorY = 6; // (13,6) sits east of the path tile at (12,6)
    const anchor = idx(anchorX, anchorY);
    expect(canPlace(tiles, heights, tunnels, anchorX, anchorY, 'coaster')).toBe(true);
    applyTool(tiles, heights, tunnels, anchorX, anchorY, 'coaster');
    expect(tiles[anchor]).toBe('coaster');

    const needs = createNeeds(() => 0.5);
    needs.thrill = 12;
    expect(mostUrgentNeed(needs)).toBe('thrill');

    const candidates: number[] = [];
    tiles.forEach((t, i) => {
      if (BUILDINGS[t]?.satisfies === 'thrill') candidates.push(i);
    });
    const found = nearestReachable(tiles, entrance, candidates);
    expect(found).not.toBeNull();
    expect(found!.building).toBe(anchor);

    satisfyNeed(needs, BUILDINGS.coaster!.satisfies, BUILDINGS.coaster!.boost);
    expect(needs.thrill).toBeGreaterThan(URGENT_THRESHOLD);
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
    expect(isRide('coaster')).toBe(true);
  });

  it('breakdown odds scale with the ride count and stay zero early on', () => {
    expect(breakdownChance(2, 5)).toBe(0);
    const few = breakdownChance(20, 1);
    const many = breakdownChance(20, 4);
    expect(few).toBeGreaterThan(0);
    expect(many).toBeCloseTo(few * 4);
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
