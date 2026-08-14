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
  persuadedCivilians,
  livingAgents,
  vipOf,
  escorting,
  vipAtExtraction,
  FOLLOW_STOP_DISTANCE,
  ESCORT_FOLLOW_DISTANCE,
  EXTRACTION_RADIUS
} from '../../src/games/syndicate/sim';
import {
  MISSIONS,
  SQUAD_SIZE,
  ESCORT_MIN_FROM_PAD,
  spawnMission,
  missionStatus
} from '../../src/games/syndicate/missions';
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

  it('shields a pinned asset and exposes a collected one', () => {
    // The load-bearing rule of the escort mould. Hostiles pick their marks
    // from armed player units, so an unarmed asset would be unshootable and
    // the mission could never be lost — collecting it is what puts it in the
    // line of fire. Both halves run the same scenario, once each way.
    const shoot = (collected: boolean) => {
      const tiles = openMap();
      // The agent is unarmed and out of the guard's sight, so the only mark
      // on the street is the asset.
      const agent = createUnit(1, 'agent', idx(30, 30), MAP_W, null);
      const vip = createUnit(2, 'vip', idx(5, 5), MAP_W);
      const guard = createUnit(3, 'guard', idx(7, 5), MAP_W, 'minigun');
      if (collected) vip.faction = 'player';
      const world = createWorld(tiles, [agent, vip, guard], seededRandom());
      for (let step = 0; step < 120; step++) stepWorld(world, 1 / 60);
      return vip.hp;
    };
    expect(shoot(false)).toBe(createUnit(0, 'vip', 0, MAP_W).maxHp);
    expect(shoot(true)).toBeLessThan(createUnit(0, 'vip', 0, MAP_W).maxHp);
  });

  it('collects the asset an agent walks up to, and then it follows the squad', () => {
    const tiles = openMap();
    const agent = createUnit(1, 'agent', idx(10, 10), MAP_W, null);
    const vip = createUnit(2, 'vip', idx(11, 10), MAP_W);
    const world = createWorld(tiles, [agent, vip], seededRandom());

    // Within the Persuadertron's reach, so one step collects it.
    expect(Math.hypot(agent.x - vip.x, agent.y - vip.y)).toBeLessThanOrEqual(PERSUADE_RADIUS);
    const events = stepWorld(world, 1 / 60);
    expect(events.some(e => e.type === 'vipSecured')).toBe(true);
    expect(vip.faction).toBe('player');
    // It is collected, not persuaded — it never counts toward the follower
    // crowd the Persuadertron needs for armed minds.
    expect(vip.persuaded).toBe(false);
    expect(followerCount(world)).toBe(0);

    // Walk the agent away; the asset closes the gap on the shared follow
    // routine rather than standing where the contract left it. The agent is
    // driven by a bare path rather than `commandMove` on purpose — an order
    // hands the asset a route of its own, and what is under test here is the
    // trailing behaviour with no order in play.
    agent.path = findPath(tiles, idx(10, 10), idx(24, 10))!;
    for (let step = 0; step < 600; step++) stepWorld(world, 1 / 60);
    // The tolerance is the asset's own exported stop distance, not a round
    // number near it and not the crowd's looser gap: a loose "less than 2"
    // here is what let mission 10 ship with a delivery test the follow routine
    // could never satisfy.
    expect(Math.hypot(agent.x - vip.x, agent.y - vip.y)).toBeLessThanOrEqual(ESCORT_FOLLOW_DISTANCE);
    expect(vip.x).toBeGreaterThan(20);
  });

  it('keeps the escort gap tighter than the pad an agent has to stand on', () => {
    // The arithmetic the whole mould rests on, asserted as a relation rather
    // than left implicit in two constants that drifted apart. FOLLOW_STOP_
    // DISTANCE (1.6) is wider than EXTRACTION_RADIUS (1.5), so an asset on the
    // crowd's gap could never be delivered by trailing however it got there —
    // that gap being on the wrong side of the radius is exactly how mission 10
    // shipped unwinnable, and two rounds of routing fixes each traded one
    // unreachable case for another before the numbers were touched.
    expect(ESCORT_FOLLOW_DISTANCE).toBeLessThan(EXTRACTION_RADIUS);
    expect(FOLLOW_STOP_DISTANCE).toBeGreaterThan(EXTRACTION_RADIUS);
  });

  it('delivers the asset by trailing an agent that stands on the pad', () => {
    // Mission 10's whole geometry, in miniature, and the fix stated as the
    // arithmetic it is. Trailing used to be unable to deliver at all: `follow`
    // parked the asset FOLLOW_STOP_DISTANCE (1.6) behind its nearest agent,
    // further out than the EXTRACTION_RADIUS (1.5) every mould measures the
    // pad by, so an agent standing dead centre on the pad still was not
    // enough. On its own tighter gap it is: whoever the asset happens to be
    // trailing, if that agent is on the pad then so is the asset, and the
    // question of which order routed it there stops mattering.
    const tiles = openMap();
    const pad = idx(20, 20);
    const agent = createUnit(1, 'agent', pad, MAP_W, null);
    const vip = createUnit(2, 'vip', idx(28, 20), MAP_W);
    vip.faction = 'player';
    const world = createWorld(tiles, [agent, vip], seededRandom());
    expect(vipAtExtraction(world, pad)).toBe(false);

    // Left to trail, with no order of its own ever issued: it closes on the
    // agent standing on the pad and settles inside the pad's radius.
    for (let step = 0; step < 600; step++) stepWorld(world, 1 / 60);
    const trailing = Math.hypot(vip.x - 20.5, vip.y - 20.5);
    expect(trailing).toBeLessThanOrEqual(ESCORT_FOLLOW_DISTANCE);
    expect(trailing).toBeLessThanOrEqual(EXTRACTION_RADIUS);
    expect(vipAtExtraction(world, pad)).toBe(true);

    // Ordered to the pad on top of that, the asset takes the tile itself and
    // the agent rings it — the lead still puts it dead centre.
    commandMove(world, pad, [agent]);
    expect(vip.path.length).toBeGreaterThan(0);
    for (let step = 0; step < 600 && vip.path.length; step++) stepWorld(world, 1 / 60);
    expect(Math.hypot(vip.x - 20.5, vip.y - 20.5)).toBeLessThan(0.01);
    expect(vipAtExtraction(world, pad)).toBe(true);

    // An asset that is not in tow is not delivered, however close it stands.
    vip.faction = 'neutral';
    expect(vipAtExtraction(world, pad)).toBe(false);
    vip.faction = 'player';
    // Nor a dead one, wherever its body lies.
    vip.alive = false;
    expect(vipAtExtraction(world, pad)).toBe(false);
    vip.alive = true;
    // Nor one a hair outside the radius: the bound is the stated number, not
    // whatever the streets around the pad happen to allow.
    vip.x = 20.5 + EXTRACTION_RADIUS + 0.01;
    vip.y = 20.5;
    expect(vipAtExtraction(world, pad)).toBe(false);
    vip.x = 20.5 + EXTRACTION_RADIUS - 0.01;
    expect(vipAtExtraction(world, pad)).toBe(true);
  });

  it('never lets `follow` steal a move order away from the asset', () => {
    // The interlock the fix turns on. A player re-issues the extraction order
    // while the squad already rings the pad, so the asset's route in runs the
    // gauntlet of its own agents: `follow` would halt it the moment the first
    // one came within its gap, two tiles short, which is the very failure the
    // pad-centred delivery test would otherwise reintroduce. The order holds
    // until its route runs out.
    const tiles = openMap();
    const pad = idx(20, 20);
    const squad = [idx(20, 20), idx(21, 20), idx(22, 20)].map((tile, n) =>
      createUnit(n + 1, 'agent', tile, MAP_W, null)
    );
    const vip = createUnit(4, 'vip', idx(28, 20), MAP_W);
    vip.faction = 'player';
    const world = createWorld(tiles, [...squad, vip], seededRandom());

    commandMove(world, pad, squad);
    let closest = Infinity;
    for (let step = 0; step < 600 && closest > 0.01; step++) {
      stepWorld(world, 1 / 60);
      closest = Math.min(closest, Math.hypot(vip.x - 20.5, vip.y - 20.5));
    }
    expect(closest).toBeLessThan(0.01);
  });

  it('leaves the asset behind when only part of the squad is ordered out', () => {
    // The other half of the leading rule, and the reason it is scoped rather
    // than universal. Clicking a single agent chip and sending it up a side
    // street is a scouting order, not a march: leading the asset on it walks
    // it away from its escort alone, and a collected asset is valid prey the
    // whole way, so the mission is lost to an order the player never meant it
    // to hear. Only an order the whole living squad is taking may lead it.
    //
    // Scoping it this way used to cost the player the mission, because a
    // subset order left the asset on a gap it could never be delivered from.
    // It no longer does: it stays put here, and the delivery tests below walk
    // it home on nothing but subset orders.
    const tiles = openMap();
    const scout = createUnit(1, 'agent', idx(5, 12), MAP_W, null);
    const minder = createUnit(2, 'agent', idx(6, 12), MAP_W, null);
    const vip = createUnit(3, 'vip', idx(7, 12), MAP_W);
    vip.faction = 'player';
    const world = createWorld(tiles, [scout, minder, vip], seededRandom());
    const parked = { x: vip.x, y: vip.y };
    const sideStreet = idx(22, 12);

    // One chip selected, one agent ordered: the asset gets no route at all.
    commandMove(world, sideStreet, [scout]);
    expect(scout.path.length).toBeGreaterThan(0);
    expect(vip.path).toHaveLength(0);
    expect(vip.led).toBe(false);

    for (let step = 0; step < 600; step++) stepWorld(world, 1 / 60);
    expect(scout.x).toBeGreaterThan(21);
    // It never followed the scout: it is still stood beside the agent that
    // stayed, well inside the follow gap and nowhere near the scouted tile.
    expect(vip.x).toBe(parked.x);
    expect(vip.y).toBe(parked.y);
    expect(Math.hypot(vip.x - minder.x, vip.y - minder.y)).toBeLessThanOrEqual(ESCORT_FOLLOW_DISTANCE);

    // The whole squad marching, though, still leads it — the scope is which
    // agents were ordered, not whether leading happens at all.
    commandMove(world, idx(9, 18), [scout, minder]);
    expect(vip.path.length).toBeGreaterThan(0);
    expect(vip.led).toBe(true);
  });

  it('drops a march the player has countermanded with a subset order', () => {
    // The other end of the same rule. Scoping the lead to whole-squad orders
    // only helps if the lead also *ends* when the player countermands one:
    // a march hands the asset a long route, and if a later subset order just
    // skips it, `led` stays set and it keeps walking the abandoned route alone
    // with `follow` suppressed. That is the lone walk under fire the scoping
    // exists to prevent, on a route the player has already replaced — the
    // squad re-tasks down a side street while the asset carries on toward the
    // pad by itself, and a collected asset is valid prey the whole way.
    const tiles = openMap();
    const scout = createUnit(1, 'agent', idx(2, 12), MAP_W, null);
    const minder = createUnit(2, 'agent', idx(3, 12), MAP_W, null);
    const vip = createUnit(3, 'vip', idx(4, 12), MAP_W);
    vip.faction = 'player';
    const world = createWorld(tiles, [scout, minder, vip], seededRandom());
    const march = idx(24, 12);
    const sideStreet = idx(2, 22);

    // The whole squad marches east, so the asset takes a route of its own.
    commandMove(world, march, [scout, minder]);
    expect(vip.led).toBe(true);
    expect(vip.path.length).toBeGreaterThan(0);
    for (let step = 0; step < 120; step++) stepWorld(world, 1 / 60);
    expect(vip.x).toBeGreaterThan(4.5);

    // A firefight opens, so the player re-tasks the agents one chip at a time
    // down a side street. The first of those calls countermands the march.
    commandMove(world, sideStreet, [scout]);
    expect(vip.led).toBe(false);
    expect(vip.path).toHaveLength(0);
    commandMove(world, sideStreet, [minder]);
    expect(vip.led).toBe(false);

    for (let step = 0; step < 900; step++) stepWorld(world, 1 / 60);
    // It went with the squad, not on down the abandoned route: it is tucked
    // in behind its nearest agent on the side street, nowhere near the tile
    // the countermanded march was walking it to.
    const nearest = Math.min(
      Math.hypot(vip.x - scout.x, vip.y - scout.y),
      Math.hypot(vip.x - minder.x, vip.y - minder.y)
    );
    expect(nearest).toBeLessThanOrEqual(ESCORT_FOLLOW_DISTANCE);
    expect(Math.hypot(vip.x - 24.5, vip.y - 12.5)).toBeGreaterThan(ESCORT_FOLLOW_DISTANCE);
    expect(vip.x).toBeLessThan(6);
    expect(vip.y).toBeGreaterThan(18);
  });

  it('leaves an uncollected asset where the contract pinned it', () => {
    const tiles = openMap();
    const agent = createUnit(1, 'agent', idx(30, 30), MAP_W, null);
    const vip = createUnit(2, 'vip', idx(5, 5), MAP_W);
    const world = createWorld(tiles, [agent, vip], seededRandom());
    const where = { x: vip.x, y: vip.y };
    for (let step = 0; step < 600; step++) stepWorld(world, 1 / 60);
    // Unlike a civilian it never wanders off — the squad always knows where
    // to find it.
    expect(vip.x).toBe(where.x);
    expect(vip.y).toBe(where.y);
    expect(vip.faction).toBe('neutral');
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

  it('fields a ten-mission campaign with escalating rewards and re-tiered weapons', () => {
    expect(MISSIONS).toHaveLength(10);
    for (let m = 1; m < MISSIONS.length; m++) {
      expect(MISSIONS[m].reward).toBeGreaterThan(MISSIONS[m - 1].reward);
    }
    // The minigun / executive target land at the mid-campaign assassinate (3
    // of 10), not the finale — no last-mission-only reveal.
    expect(MISSIONS[2].objective).toBe('assassinate');
    expect(MISSIONS[2].enemyWeapon).toBe('minigun');
    // The back half escalates: guards graduate to uzis, and minigun rivals
    // appear in a non-assassinate mission before the finale.
    expect(MISSIONS.slice(3).every(m => m.guardWeapon === 'uzi')).toBe(true);
    expect(MISSIONS[4].objective).toBe('persuade');
    expect(MISSIONS[4].enemyWeapon).toBe('minigun');
    // Mission 7 introduces the `secure` mould — a hold contract with a
    // positive hold requirement.
    expect(MISSIONS[6].objective).toBe('secure');
    expect(MISSIONS[6].holdSeconds).toBeGreaterThan(0);
    // Mission 8 is the heaviest kill-count contract of the campaign, and
    // mission 9 escalates the secure mould: a longer hold behind a deeper LZ
    // ring than mission 7 fielded.
    expect(MISSIONS[7].objective).toBe('eliminate');
    expect(MISSIONS[7].enemies).toBe(Math.max(...MISSIONS.map(m => m.enemies)));
    expect(MISSIONS[8].objective).toBe('secure');
    expect(MISSIONS[8].holdSeconds!).toBeGreaterThan(MISSIONS[6].holdSeconds!);
    expect(MISSIONS[8].guards).toBeGreaterThan(MISSIONS[6].guards);
    // The mission-10 finale is the escort mould, and it deliberately fields
    // fewer rivals than the scorched-earth wipe: its difficulty is the thing
    // it has to bring home, not the body count.
    expect(MISSIONS[9].objective).toBe('escort');
    expect(MISSIONS[9].enemies).toBeLessThan(MISSIONS[7].enemies);
    // All five objective moulds are represented across the campaign.
    const objectives = new Set(MISSIONS.map(m => m.objective));
    expect(objectives).toEqual(
      new Set(['eliminate', 'persuade', 'assassinate', 'secure', 'escort'])
    );
  });

  it('contests the landing zone: every secure mission rings the LZ with its guards', () => {
    const secures = MISSIONS.filter(m => m.objective === 'secure');
    expect(secures.length).toBeGreaterThan(0);
    for (const spec of secures) {
      const tiles = generateCity(seededRandom(4));
      const setup = spawnMission(spec, tiles, ['pistol', 'pistol', 'pistol', 'pistol'], seededRandom());
      const guards = setup.units.filter(u => u.kind === 'guard');
      expect(guards).toHaveLength(spec.guards);
      // The guards dig in around the extraction pad (BFS-nearest tiles), not
      // scattered across the map — so the squad must fight in and hold, not
      // just reach the corner.
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
    }
  });

  it('pins the escort asset behind its own guard ring, far from the squad', () => {
    const escorts = MISSIONS.filter(m => m.objective === 'escort');
    expect(escorts.length).toBeGreaterThan(0);
    // Several seeds, because the holding tile is rolled and re-rolled until it
    // clears both ends — one seed would not prove the constraint holds.
    const cases = escorts.flatMap(spec => [2, 4, 7, 11, 19].map(seed => ({ spec, seed })));
    for (const { spec, seed } of cases) {
      const tiles = generateCity(seededRandom(seed));
      const setup = spawnMission(spec, tiles, ['pistol', 'pistol', 'pistol', 'pistol'], seededRandom(seed));
      const vips = setup.units.filter(u => u.kind === 'vip');
      expect(vips).toHaveLength(1);
      const vip = vips[0];
      // Neutral and unarmed until an agent collects it.
      expect(vip.faction).toBe('neutral');
      expect(vip.weapon).toBeNull();
      // Deep in the city, not next to the insertion corner.
      const spawn = setup.squadSpawn[0];
      const sx = (spawn % MAP_W) + 0.5;
      const sy = Math.floor(spawn / MAP_W) + 0.5;
      expect(Math.hypot(vip.x - sx, vip.y - sy)).toBeGreaterThanOrEqual(18);
      // And clear of the pad, so the escort leg is a leg. Without this the
      // asset can be pinned next to extraction and the half of the mission
      // the mould exists for collapses to a couple of steps.
      const ex = (setup.extraction % MAP_W) + 0.5;
      const ey = Math.floor(setup.extraction / MAP_W) + 0.5;
      expect(Math.hypot(vip.x - ex, vip.y - ey)).toBeGreaterThanOrEqual(ESCORT_MIN_FROM_PAD);
      // Ringed by the spec's guards, the way the executive's lair is.
      const guards = setup.units.filter(u => u.kind === 'guard');
      expect(guards).toHaveLength(spec.guards);
      for (const g of guards) {
        expect(Math.hypot(g.x - vip.x, g.y - vip.y)).toBeLessThan(8);
      }
      // A dead asset ends the contract wherever the squad happens to be.
      vip.alive = false;
      expect(missionStatus(spec, setup.units, 0, true, 0, true)).toBe('lost');
    }
  });

  /**
   * Plays mission 10 to a win over one city seed and reports how far from the
   * pad's centre the win registered, or null if it never came.
   *
   * `order` is how leg two is issued. 'squad' selects every living agent, the
   * way the All button does; 'chip' orders the agents one at a time, each call
   * covering a strict subset, the way a player clicking a single agent chip
   * does. Both must deliver — the second is the one that was unwinnable, and
   * scoping the lead to whole-squad orders is what reopened it.
   *
   * Hostiles are stripped because what is under test is whether the escort
   * geometry can ever close, not whether a fixed policy survives the firefight.
   */
  function playEscortFinale(seed: number, order: 'squad' | 'chip'): number | null {
    const spec = MISSIONS[9];
    const tiles = generateCity(seededRandom(seed * 7919));
    const setup = spawnMission(spec, tiles, ['uzi', 'uzi', 'uzi', 'uzi'], seededRandom(seed * 104729));
    const world = createWorld(
      tiles,
      setup.units.filter(u => u.faction !== 'hostile'),
      seededRandom(seed)
    );
    const px = (setup.extraction % MAP_W) + 0.5;
    const py = Math.floor(setup.extraction / MAP_W) + 0.5;
    const vip = vipOf(world)!;
    const status = () =>
      missionStatus(spec, world.units, 0, false, 0, vipAtExtraction(world, setup.extraction));

    // Leg one — fight in and collect it.
    for (let step = 0; step < 60 * 120 && !escorting(vip); step++) {
      if (step % 60 === 0) {
        commandMove(world, idx(Math.floor(vip.x), Math.floor(vip.y)), livingAgents(world));
      }
      stepWorld(world, 1 / 60);
    }
    expect(escorting(vip)).toBe(true);
    // Collected but nowhere near the pad: the contract is not done yet.
    expect(status()).toBe('ongoing');

    // Leg two — walk it out, re-issuing the order each second.
    let won = false;
    for (let step = 0; step < 60 * 180 && !won; step++) {
      if (step % 60 === 0) {
        const agents = livingAgents(world);
        if (order === 'squad') commandMove(world, setup.extraction, agents);
        else for (const agent of agents) commandMove(world, setup.extraction, [agent]);
      }
      stepWorld(world, 1 / 60);
      won = status() === 'won';
    }
    if (!won) return null;
    expect(vip.alive).toBe(true);
    return Math.hypot(vip.x - px, vip.y - py);
  }

  const ESCORT_SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  const median = (values: number[]): number => {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = sorted.length / 2;
    return sorted.length % 2 ? sorted[Math.floor(mid)] : (sorted[mid - 1] + sorted[mid]) / 2;
  };

  it.each(['squad', 'chip'] as const)(
    'walks the escort finale home on %s orders, and only ever wins it at the pad',
    order => {
      // The regression that matters for mission 10, which shipped unwinnable
      // (issue #255): the asset trails on `follow`, which parked it
      // FOLLOW_STOP_DISTANCE (1.6) behind its nearest agent, while the delivery
      // test demands it stand within EXTRACTION_RADIUS (1.5) of the pad. No
      // routing could close a gap that was on the wrong side of the radius,
      // which is why the asset now trails on its own tighter gap instead.
      //
      // Two things have to hold at once here, and pinning only the first is
      // what let an earlier attempt overcorrect into accepting wins nearly four
      // tiles from the pad. So this asserts the mission can be won on every
      // seed *and* records how far from the pad's centre each win registered:
      // that distance is the whole player-facing promise of the mould, and it
      // is bounded by the one radius every mould measures the pad by, not by
      // whichever tiles the streets happen to leave walkable around it.
      //
      // Twelve city seeds, since the pad sits in a random pocket of the
      // south-east block and its surroundings differ wildly.
      const distances = ESCORT_SEEDS.map(seed => playEscortFinale(seed, order));
      expect(distances.filter(d => d === null)).toHaveLength(0);
      const won = distances as number[];
      // The bound, in the player's terms, and written out as a number rather
      // than read back from the constant that produced it — a bound expressed
      // in terms of the thing it is bounding would widen the moment someone
      // widened the radius, which is exactly the failure mode this test exists
      // to catch. 1.5 tiles is a unit standing on the pad's own tile; it is the
      // same reach an agent must meet to extract, which is the point of it.
      expect(EXTRACTION_RADIUS).toBe(1.5);
      expect(Math.max(...won)).toBeLessThanOrEqual(1.5);
      expect(median(won)).toBeLessThanOrEqual(1.5);
    }
  );

  it('never auto-wins an escort mission whose roster has no asset', () => {
    // The mirror of the secure mould's missing-hold guard: a spec that fields
    // no VIP must surface as unwon rather than winning the moment anything
    // stands on the pad.
    const tiles = generateCity(seededRandom(4));
    const spec = MISSIONS[9];
    const { units } = spawnMission(spec, tiles, ['pistol', 'pistol', 'pistol', 'pistol'], seededRandom());
    const assetless = units.filter(u => u.kind !== 'vip');
    expect(missionStatus(spec, assetless, 0, true, 999, true)).toBe('ongoing');
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
      } else if (spec.objective === 'escort') {
        // Won by the asset reaching extraction, not an agent: a squad standing
        // on the pad without it is still mid-contract.
        expect(missionStatus(spec, units, 0, true, 0, false)).toBe('ongoing');
        expect(missionStatus(spec, units, 0, false, 0, true)).toBe('won');
      } else {
        units.forEach(u => {
          if (u.kind === 'target') u.alive = false;
        });
        expect(missionStatus(spec, units, 0, false)).toBe('won');
      }
    }
  });
});
