import { describe, it, expect } from 'vitest';
import {
  MAP_W,
  MAP_H,
  idx,
  generateCity,
  isWalkable,
  nearestWalkable,
  hasLineOfSight,
  type MapTile
} from '../../src/games/syndicate/map';
import { findPath, spreadTargets, walkableTiles } from '../../src/games/syndicate/pathfind';
import {
  WEAPONS,
  PERSUADE_RADIUS,
  createUnit,
  persuadeRequirement
} from '../../src/games/syndicate/units';
import {
  createWorld,
  stepWorld,
  commandMove,
  followerCount,
  persuadedCivilians
} from '../../src/games/syndicate/sim';
import { MISSIONS, SQUAD_SIZE, spawnMission, missionStatus } from '../../src/games/syndicate/missions';
import { seededRandom } from './seeded-random';

/** An all-walkable map for hand-built combat scenarios. */
function openMap(): MapTile[] {
  return Array.from({ length: MAP_W * MAP_H }, () => ({
    kind: 'plaza' as const,
    height: 0,
    palette: 0
  }));
}

describe('city map', () => {
  it('generates a full grid with roads, pavements and buildings', () => {
    const tiles = generateCity(seededRandom());
    expect(tiles).toHaveLength(MAP_W * MAP_H);
    expect(tiles.some(t => t.kind === 'road')).toBe(true);
    expect(tiles.some(t => t.kind === 'pavement')).toBe(true);
    expect(tiles.some(t => t.kind === 'building')).toBe(true);
    expect(tiles.filter(t => t.kind === 'building').every(t => t.height > 0)).toBe(true);
  });

  it('is deterministic for a given seed', () => {
    const a = generateCity(seededRandom(7));
    const b = generateCity(seededRandom(7));
    expect(a).toEqual(b);
  });

  it('keeps every walkable tile reachable from the streets', () => {
    const tiles = generateCity(seededRandom(3));
    const walkable = walkableTiles(tiles);
    const reached = spreadTargets(tiles, walkable[0], walkable.length);
    expect(reached).toHaveLength(walkable.length);
  });

  it('blocks line of sight with buildings but not across streets', () => {
    const tiles = openMap();
    expect(hasLineOfSight(tiles, 3.5, 5.5, 8.5, 5.5)).toBe(true);
    tiles[idx(5, 5)].kind = 'building';
    expect(hasLineOfSight(tiles, 3.5, 5.5, 8.5, 5.5)).toBe(false);
    expect(hasLineOfSight(tiles, 3.5, 2.5, 8.5, 2.5)).toBe(true);
  });

  it('finds the nearest walkable tile to a point', () => {
    const tiles = openMap();
    tiles[idx(0, 0)].kind = 'building';
    const nearest = nearestWalkable(tiles, 0, 0);
    expect(nearest).not.toBe(idx(0, 0));
    expect(isWalkable(tiles[nearest])).toBe(true);
  });
});

describe('pathfinding', () => {
  it('routes along a corridor and around walls', () => {
    const tiles = openMap();
    for (let y = 0; y < MAP_H - 1; y++) tiles[idx(5, y)].kind = 'building';
    const path = findPath(tiles, idx(2, 2), idx(8, 2));
    expect(path).not.toBeNull();
    // Must detour through the single gap at y = MAP_H - 1
    expect(path!.some(i => Math.floor(i / MAP_W) === MAP_H - 1)).toBe(true);
  });

  it('returns null when the target is sealed off', () => {
    const tiles = openMap();
    tiles[idx(9, 10)].kind = 'building';
    tiles[idx(11, 10)].kind = 'building';
    tiles[idx(10, 9)].kind = 'building';
    tiles[idx(10, 11)].kind = 'building';
    expect(findPath(tiles, idx(2, 2), idx(10, 10))).toBeNull();
  });

  it('fans a squad out over distinct nearby tiles', () => {
    const tiles = openMap();
    const spots = spreadTargets(tiles, idx(10, 10), SQUAD_SIZE);
    expect(new Set(spots).size).toBe(SQUAD_SIZE);
  });
});

describe('units and weapons', () => {
  it('orders weapon tiers pistol < uzi < minigun', () => {
    expect(WEAPONS.pistol.tier).toBeLessThan(WEAPONS.uzi.tier);
    expect(WEAPONS.uzi.tier).toBeLessThan(WEAPONS.minigun.tier);
  });

  it('scales persuasion requirements by unit kind', () => {
    expect(persuadeRequirement('civilian')).toBe(0);
    expect(persuadeRequirement('guard')).toBe(4);
    expect(persuadeRequirement('enemy')).toBe(8);
    expect(persuadeRequirement('target')).toBe(Infinity);
  });

  it('creates units centred on their tile with kind defaults', () => {
    const agent = createUnit(1, 'agent', idx(3, 4), MAP_W, 'pistol');
    expect(agent.x).toBe(3.5);
    expect(agent.y).toBe(4.5);
    expect(agent.faction).toBe('player');
    expect(createUnit(2, 'enemy', 0, MAP_W).faction).toBe('hostile');
    expect(createUnit(3, 'civilian', 0, MAP_W).faction).toBe('neutral');
  });
});

describe('simulation', () => {
  it('lets an agent gun down an enemy in range and drop its weapon', () => {
    const tiles = openMap();
    const agent = createUnit(1, 'agent', idx(5, 5), MAP_W, 'minigun');
    const enemy = createUnit(2, 'enemy', idx(7, 5), MAP_W, 'uzi');
    const world = createWorld(tiles, [agent, enemy], seededRandom());
    let killed = false;
    for (let step = 0; step < 600 && !killed; step++) {
      killed = stepWorld(world, 1 / 60).some(e => e.type === 'kill' && e.kind === 'enemy');
    }
    expect(killed).toBe(true);
    expect(enemy.alive).toBe(false);
    expect(world.pickups.some(p => p.weapon === 'uzi')).toBe(true);
    expect(world.shots.length).toBeGreaterThan(0);
  });

  it('does not fire through buildings', () => {
    const tiles = openMap();
    tiles[idx(6, 5)].kind = 'building';
    const agent = createUnit(1, 'agent', idx(5, 5), MAP_W, 'minigun');
    const enemy = createUnit(2, 'enemy', idx(7, 5), MAP_W, null);
    const world = createWorld(tiles, [agent, enemy], seededRandom());
    stepWorld(world, 1 / 60);
    expect(enemy.hp).toBe(enemy.maxHp);
  });

  it('persuades nearby civilians, and guards only with enough followers', () => {
    const tiles = openMap();
    const agent = createUnit(1, 'agent', idx(10, 10), MAP_W, 'pistol');
    const units = [agent];
    for (let n = 0; n < 4; n++) {
      units.push(createUnit(2 + n, 'civilian', n % 2 === 0 ? idx(10, 11) : idx(9, 10), MAP_W));
    }
    const guard = createUnit(9, 'guard', idx(11, 10), MAP_W, 'pistol');
    guard.hp = guard.maxHp = 9999; // keep the test about persuasion, not the firefight
    agent.hp = agent.maxHp = 9999;
    units.push(guard);
    const world = createWorld(tiles, units, seededRandom());

    stepWorld(world, 1 / 60);
    expect(persuadedCivilians(world)).toBe(4);
    expect(followerCount(world)).toBeGreaterThanOrEqual(4);
    // Guard within reach and quota met → converted to the player's side
    expect(guard.persuaded).toBe(true);
    expect(guard.faction).toBe('player');
  });

  it('needs four followers before a guard turns', () => {
    const tiles = openMap();
    const agent = createUnit(1, 'agent', idx(10, 10), MAP_W, null);
    const guard = createUnit(2, 'guard', idx(11, 10), MAP_W, 'pistol');
    const world = createWorld(tiles, [agent, guard], seededRandom());
    stepWorld(world, 1 / 60);
    expect(guard.persuaded).toBe(false);
    expect(Math.hypot(agent.x - guard.x, agent.y - guard.y)).toBeLessThan(PERSUADE_RADIUS);
  });

  it('upgrades an agent walking over a better weapon', () => {
    const tiles = openMap();
    const agent = createUnit(1, 'agent', idx(5, 5), MAP_W, 'pistol');
    const world = createWorld(tiles, [agent], seededRandom());
    world.pickups.push({ x: agent.x, y: agent.y, weapon: 'minigun' });
    const events = stepWorld(world, 1 / 60);
    expect(agent.weapon).toBe('minigun');
    expect(events).toContainEqual(expect.objectContaining({ type: 'pickup', upgraded: true }));
    expect(world.pickups).toHaveLength(0);
  });

  it('lets a persuaded follower loot a dropped weapon and join the fight', () => {
    const tiles = openMap();
    const agent = createUnit(1, 'agent', idx(10, 10), MAP_W, null);
    const follower = createUnit(2, 'civilian', idx(10, 11), MAP_W);
    follower.persuaded = true;
    follower.faction = 'player';
    const enemy = createUnit(3, 'enemy', idx(13, 11), MAP_W, null);
    const world = createWorld(tiles, [agent, follower, enemy], seededRandom());
    world.pickups.push({ x: 10.5, y: 12.5, weapon: 'uzi' });

    let armed = false;
    let firedAtEnemy = false;
    for (let step = 0; step < 600 && !firedAtEnemy; step++) {
      const events = stepWorld(world, 1 / 60);
      if (!armed && follower.weapon === 'uzi') {
        armed = true;
        expect(events).toContainEqual(expect.objectContaining({ type: 'pickup', role: 'follower' }));
      }
      if (armed) firedAtEnemy = enemy.hp < enemy.maxHp;
    }
    expect(armed).toBe(true);
    expect(firedAtEnemy).toBe(true);
  });

  it('moves commanded agents toward the ordered tile', () => {
    const tiles = openMap();
    const agent = createUnit(1, 'agent', idx(2, 2), MAP_W, null);
    const world = createWorld(tiles, [agent], seededRandom());
    commandMove(world, idx(8, 2), [agent]);
    expect(agent.path.length).toBeGreaterThan(0);
    for (let step = 0; step < 600 && agent.path.length; step++) stepWorld(world, 1 / 60);
    expect(Math.abs(agent.x - 8.5)).toBeLessThan(0.01);
    expect(Math.abs(agent.y - 2.5)).toBeLessThan(0.01);
  });
});

describe('missions', () => {
  it('spawns the campaign rosters on walkable tiles', () => {
    const tiles = generateCity(seededRandom(5));
    for (const spec of MISSIONS) {
      const setup = spawnMission(spec, tiles, ['pistol', 'pistol', 'pistol', 'pistol'], seededRandom());
      const agents = setup.units.filter(u => u.kind === 'agent');
      expect(agents).toHaveLength(SQUAD_SIZE);
      expect(setup.units.filter(u => u.kind === 'civilian')).toHaveLength(spec.civilians);
      expect(setup.units.filter(u => u.kind === 'enemy')).toHaveLength(spec.enemies);
      expect(setup.units.filter(u => u.kind === 'guard')).toHaveLength(spec.guards);
      expect(setup.units.filter(u => u.kind === 'target')).toHaveLength(
        spec.objective === 'assassinate' ? 1 : 0
      );
      for (const unit of setup.units) {
        expect(isWalkable(tiles[idx(Math.floor(unit.x), Math.floor(unit.y))])).toBe(true);
      }
      expect(isWalkable(tiles[setup.extraction])).toBe(true);
    }
  });

  it('tracks eliminate objectives, counting persuaded rivals as removed', () => {
    const spec = MISSIONS[0];
    const tiles = generateCity(seededRandom(5));
    const { units } = spawnMission(spec, tiles, ['pistol', 'pistol', 'pistol', 'pistol'], seededRandom());
    expect(missionStatus(spec, units, 0, false)).toBe('ongoing');
    units.forEach(u => {
      if (u.kind === 'enemy') u.alive = false;
    });
    expect(missionStatus(spec, units, 0, false)).toBe('won');
  });

  it('requires both the quota and extraction for persuade missions', () => {
    const spec = MISSIONS[1];
    const tiles = generateCity(seededRandom(5));
    const { units } = spawnMission(spec, tiles, ['pistol', 'pistol', 'pistol', 'pistol'], seededRandom());
    expect(missionStatus(spec, units, spec.persuadeQuota, false)).toBe('ongoing');
    expect(missionStatus(spec, units, spec.persuadeQuota - 1, true)).toBe('ongoing');
    expect(missionStatus(spec, units, spec.persuadeQuota, true)).toBe('won');
  });

  it('ends the campaign when the squad falls', () => {
    const spec = MISSIONS[2];
    const tiles = generateCity(seededRandom(5));
    const { units } = spawnMission(spec, tiles, ['pistol', 'pistol', 'pistol', 'pistol'], seededRandom());
    units.forEach(u => {
      if (u.kind === 'agent') u.alive = false;
    });
    expect(missionStatus(spec, units, 0, false)).toBe('lost');
    units.forEach(u => (u.alive = true));
    units.forEach(u => {
      if (u.kind === 'target') u.alive = false;
    });
    expect(missionStatus(spec, units, 0, false)).toBe('won');
  });

  it('fields a seven-mission campaign with escalating rewards and re-tiered weapons', () => {
    expect(MISSIONS).toHaveLength(7);
    for (let m = 1; m < MISSIONS.length; m++) {
      expect(MISSIONS[m].reward).toBeGreaterThan(MISSIONS[m - 1].reward);
    }
    // The minigun / executive target land at the mid-campaign assassinate (3
    // of 7), not the finale — no last-mission-only reveal.
    expect(MISSIONS[2].objective).toBe('assassinate');
    expect(MISSIONS[2].enemyWeapon).toBe('minigun');
    // The back half escalates: guards graduate to uzis, and minigun rivals
    // appear in a non-assassinate mission before the finale.
    expect(MISSIONS.slice(3).every(m => m.guardWeapon === 'uzi')).toBe(true);
    expect(MISSIONS[4].objective).toBe('persuade');
    expect(MISSIONS[4].enemyWeapon).toBe('minigun');
    // Mission 7 is the new `secure` mould — a hold contract with a positive
    // hold requirement, capping the campaign as its richest finale.
    expect(MISSIONS[6].objective).toBe('secure');
    expect(MISSIONS[6].holdSeconds).toBeGreaterThan(0);
    // All four objective moulds are represented across the campaign.
    const objectives = new Set(MISSIONS.map(m => m.objective));
    expect(objectives).toEqual(new Set(['eliminate', 'persuade', 'assassinate', 'secure']));
  });

  it('contests the landing zone: the secure mission rings the LZ with its guards', () => {
    const spec = MISSIONS[6];
    expect(spec.objective).toBe('secure');
    const tiles = generateCity(seededRandom(4));
    const setup = spawnMission(spec, tiles, ['pistol', 'pistol', 'pistol', 'pistol'], seededRandom());
    const guards = setup.units.filter(u => u.kind === 'guard');
    expect(guards).toHaveLength(spec.guards);
    // The guards dig in around the extraction pad (BFS-nearest tiles), not
    // scattered across the map — so the squad must fight in and hold, not just
    // reach the corner.
    const ex = (setup.extraction % MAP_W) + 0.5;
    const ey = Math.floor(setup.extraction / MAP_W) + 0.5;
    for (const g of guards) {
      expect(Math.hypot(g.x - ex, g.y - ey)).toBeLessThan(8);
    }
    // No `target` unit exists for a secure mission (the LZ is a tile, not a foe).
    expect(setup.units.some(u => u.kind === 'target')).toBe(false);
    // Losing the squad still ends it, whatever the hold count.
    setup.units.forEach(u => {
      if (u.kind === 'agent') u.alive = false;
    });
    expect(missionStatus(spec, setup.units, 0, false, spec.holdSeconds ?? 0)).toBe('lost');
  });

  it('never auto-wins a secure mission that forgot to set a hold requirement', () => {
    // A misconfigured secure mission (holdSeconds 0 or undefined) must not count
    // as instantly won — the guard surfaces it as an unwon mission instead of
    // silently skipping past it.
    const tiles = generateCity(seededRandom(4));
    const base = MISSIONS[6];
    const { units } = spawnMission(base, tiles, ['pistol', 'pistol', 'pistol', 'pistol'], seededRandom());
    expect(missionStatus({ ...base, holdSeconds: 0 }, units, 0, false, 999)).toBe('ongoing');
    expect(missionStatus({ ...base, holdSeconds: undefined }, units, 0, false, 999)).toBe('ongoing');
  });

  it('leaves each new mission winnable through its objective', () => {
    const tiles = generateCity(seededRandom(9));
    for (const spec of MISSIONS.slice(3)) {
      const { units } = spawnMission(spec, tiles, ['pistol', 'pistol', 'pistol', 'pistol'], seededRandom());
      expect(missionStatus(spec, units, 0, false)).toBe('ongoing');
      if (spec.objective === 'eliminate') {
        units.forEach(u => {
          if (u.kind === 'enemy') u.alive = false;
        });
        expect(missionStatus(spec, units, 0, false)).toBe('won');
      } else if (spec.objective === 'persuade') {
        expect(missionStatus(spec, units, spec.persuadeQuota, false)).toBe('ongoing');
        expect(missionStatus(spec, units, spec.persuadeQuota, true)).toBe('won');
      } else if (spec.objective === 'secure') {
        // Won by holding the LZ: below the required seconds it stays ongoing,
        // and reaching them wins regardless of the kill count (mirrors the
        // persuade quota probe).
        expect(missionStatus(spec, units, 0, false, (spec.holdSeconds ?? 0) - 1)).toBe('ongoing');
        expect(missionStatus(spec, units, 0, false, spec.holdSeconds ?? 0)).toBe('won');
      } else {
        units.forEach(u => {
          if (u.kind === 'target') u.alive = false;
        });
        expect(missionStatus(spec, units, 0, false)).toBe('won');
      }
    }
  });
});
