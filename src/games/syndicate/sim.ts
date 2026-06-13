/**
 * Syndicate — world simulation. Pure and DOM-free: movement along BFS
 * routes, civilian wandering and panic, hostile patrol/chase/fire AI,
 * Persuadertron recruiting, weapon drops and pickups.
 *
 * Rendering state the canvas needs (tracer shots) lives on the world;
 * one-off happenings (kills, persuasions, pickups) are returned as events
 * so the presentation layer can award cash and toast messages.
 */
import { MAP_W, MAP_H, idx, isWalkable, hasLineOfSight, type MapTile } from './map';
import { findPath, spreadTargets } from './pathfind';
import {
  WEAPONS,
  PERSUADE_RADIUS,
  UNIT_SPEED,
  persuadeRequirement,
  type Unit,
  type WeaponId
} from './units';

/** How far hostiles can spot an armed player unit, in tiles. */
export const SIGHT_RANGE = 7;
/** Adrenaline: squad speed multiplier and weapon cooldown multiplier. */
export const BOOST_SPEED = 1.6;
export const BOOST_FIRE = 0.6;

export interface Shot {
  fx: number;
  fy: number;
  tx: number;
  ty: number;
  weapon: WeaponId;
  faction: 'player' | 'hostile';
  life: number;
}

export interface Pickup {
  x: number;
  y: number;
  weapon: WeaponId;
}

export type WorldEvent =
  | { type: 'kill'; kind: Unit['kind']; by: 'player' | 'hostile'; x: number; y: number }
  | { type: 'agentDown'; x: number; y: number }
  | { type: 'persuade'; kind: Unit['kind']; x: number; y: number }
  | { type: 'pickup'; weapon: WeaponId; role: 'agent' | 'follower'; upgraded: boolean; x: number; y: number };

export interface World {
  tiles: MapTile[];
  units: Unit[];
  pickups: Pickup[];
  shots: Shot[];
  random: () => number;
  /** Seconds of adrenaline boost remaining for the player squad. */
  boost: number;
}

export function createWorld(tiles: MapTile[], units: Unit[], random: () => number): World {
  return { tiles, units, pickups: [], shots: [], random, boost: 0 };
}

export const livingAgents = (world: World): Unit[] =>
  world.units.filter(u => u.alive && u.kind === 'agent');

export const followerCount = (world: World): number =>
  world.units.reduce((n, u) => n + (u.alive && u.persuaded ? 1 : 0), 0);

export const persuadedCivilians = (world: World): number =>
  world.units.reduce((n, u) => n + (u.alive && u.persuaded && u.kind === 'civilian' ? 1 : 0), 0);

const tileOf = (u: Unit): number => idx(Math.floor(u.x), Math.floor(u.y));

const distance = (a: Unit, b: Unit): number => Math.hypot(a.x - b.x, a.y - b.y);

/** Orders the given agents to fan out around the clicked tile. */
export function commandMove(world: World, target: number, agents: Unit[]): void {
  if (target < 0 || !isWalkable(world.tiles[target])) return;
  const spots = spreadTargets(world.tiles, target, agents.length);
  agents.forEach((agent, n) => {
    const path = findPath(world.tiles, tileOf(agent), spots[Math.min(n, spots.length - 1)] ?? target);
    if (path) agent.path = path;
  });
}

function moveAlong(unit: Unit, speed: number, dt: number): void {
  let remaining = speed * dt;
  while (remaining > 0 && unit.path.length) {
    const t = unit.path[0];
    const tx = (t % MAP_W) + 0.5;
    const ty = Math.floor(t / MAP_W) + 0.5;
    const dx = tx - unit.x;
    const dy = ty - unit.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= remaining) {
      unit.x = tx;
      unit.y = ty;
      unit.path.shift();
      remaining -= dist;
    } else {
      unit.x += (dx / dist) * remaining;
      unit.y += (dy / dist) * remaining;
      remaining = 0;
    }
  }
}

/** Random walkable tile within `radius` (chebyshev) of `centre`, or -1. */
function randomNearbyTile(world: World, centre: number, radius: number): number {
  const cx = centre % MAP_W;
  const cy = Math.floor(centre / MAP_W);
  for (let attempt = 0; attempt < 8; attempt++) {
    const x = cx + Math.floor((world.random() * 2 - 1) * radius);
    const y = cy + Math.floor((world.random() * 2 - 1) * radius);
    if (x < 0 || x >= MAP_W || y < 0 || y >= MAP_H) continue;
    const i = idx(x, y);
    if (isWalkable(world.tiles[i])) return i;
  }
  return -1;
}

function wander(world: World, unit: Unit, radius: number, idleMin: number, idleMax: number): void {
  if (unit.path.length || unit.wanderTimer > 0) return;
  const dest = randomNearbyTile(world, unit.panic > 0 ? tileOf(unit) : unit.home, radius);
  if (dest >= 0) {
    const path = findPath(world.tiles, tileOf(unit), dest);
    if (path) unit.path = path;
  }
  unit.wanderTimer = unit.panic > 0 ? 0.3 : idleMin + world.random() * (idleMax - idleMin);
}

/** Closest weapon drop within `range` tiles of the unit, or null. */
function nearestPickup(world: World, unit: Unit, range: number): Pickup | null {
  let best: Pickup | null = null;
  let bestDist = range;
  for (const pickup of world.pickups) {
    const d = Math.hypot(pickup.x - unit.x, pickup.y - unit.y);
    if (d < bestDist) {
      bestDist = d;
      best = pickup;
    }
  }
  return best;
}

function follow(world: World, unit: Unit, agents: Unit[]): void {
  let leader: Unit | null = null;
  let best = Infinity;
  for (const agent of agents) {
    const d = distance(unit, agent);
    if (d < best) {
      best = d;
      leader = agent;
    }
  }
  if (!leader) return;
  if (best <= 1.6) {
    unit.path = [];
    return;
  }
  if (unit.repathTimer <= 0 || !unit.path.length) {
    const path = findPath(world.tiles, tileOf(unit), tileOf(leader));
    if (path) unit.path = path;
    unit.repathTimer = 0.5;
  }
}

function visibleTarget(world: World, shooter: Unit, candidates: Unit[], range: number): Unit | null {
  let best: Unit | null = null;
  let bestDist = Infinity;
  for (const candidate of candidates) {
    if (!candidate.alive) continue; // may have died earlier this same step
    const d = distance(shooter, candidate);
    if (d > range || d >= bestDist) continue;
    if (!hasLineOfSight(world.tiles, shooter.x, shooter.y, candidate.x, candidate.y)) continue;
    best = candidate;
    bestDist = d;
  }
  return best;
}

function fire(world: World, shooter: Unit, victim: Unit, events: WorldEvent[]): void {
  const weapon = WEAPONS[shooter.weapon!];
  const boosted = shooter.faction === 'player' && world.boost > 0;
  shooter.cooldown = weapon.cooldown * (boosted ? BOOST_FIRE : 1);
  world.shots.push({
    fx: shooter.x,
    fy: shooter.y,
    tx: victim.x,
    ty: victim.y,
    weapon: weapon.id,
    faction: shooter.faction === 'player' ? 'player' : 'hostile',
    life: 0.12
  });
  victim.hp -= weapon.damage * (0.85 + world.random() * 0.3);

  // Bystanders near the impact scatter
  for (const unit of world.units) {
    if (unit.alive && unit.kind === 'civilian' && !unit.persuaded && distance(unit, victim) < 4) {
      unit.panic = 3;
      unit.wanderTimer = 0;
    }
  }

  if (victim.hp <= 0) {
    victim.alive = false;
    victim.path = [];
    if (victim.weapon) world.pickups.push({ x: victim.x, y: victim.y, weapon: victim.weapon });
    if (victim.kind === 'agent') {
      events.push({ type: 'agentDown', x: victim.x, y: victim.y });
    } else {
      events.push({
        type: 'kill',
        kind: victim.kind,
        by: shooter.faction === 'player' ? 'player' : 'hostile',
        x: victim.x,
        y: victim.y
      });
    }
  }
}

export function stepWorld(world: World, dt: number): WorldEvent[] {
  const events: WorldEvent[] = [];
  world.boost = Math.max(0, world.boost - dt);
  world.shots = world.shots.filter(shot => (shot.life -= dt) > 0);

  const agents = livingAgents(world);
  const armedPlayers = world.units.filter(u => u.alive && u.faction === 'player' && u.weapon);
  const hostiles = world.units.filter(u => u.alive && u.faction === 'hostile');

  for (const unit of world.units) {
    if (!unit.alive) continue;
    unit.cooldown = Math.max(0, unit.cooldown - dt);
    unit.wanderTimer = Math.max(0, unit.wanderTimer - dt);
    unit.repathTimer = Math.max(0, unit.repathTimer - dt);
    unit.panic = Math.max(0, unit.panic - dt);

    let speed = UNIT_SPEED[unit.kind];
    if (unit.kind === 'civilian' && unit.panic > 0) speed = 3.2;
    if (unit.persuaded) speed = UNIT_SPEED.agent;
    if (unit.faction === 'player' && world.boost > 0) speed *= BOOST_SPEED;

    if (unit.kind === 'agent') {
      // Movement is the player's; agents only auto-fire.
      if (unit.weapon && unit.cooldown <= 0) {
        const target = visibleTarget(world, unit, hostiles, WEAPONS[unit.weapon].range);
        if (target) fire(world, unit, target, events);
      }
    } else if (unit.persuaded) {
      // Unarmed followers peel off to loot a nearby weapon; armed ones stick
      // with the squad and lay down fire — just like the original's mobs.
      const drop = unit.weapon ? null : nearestPickup(world, unit, 6);
      if (drop) {
        if (unit.repathTimer <= 0 || !unit.path.length) {
          const path = findPath(world.tiles, tileOf(unit), idx(Math.floor(drop.x), Math.floor(drop.y)));
          if (path) unit.path = path;
          unit.repathTimer = 0.4;
        }
      } else {
        follow(world, unit, agents);
      }
      if (unit.weapon && unit.cooldown <= 0) {
        const target = visibleTarget(world, unit, hostiles, WEAPONS[unit.weapon].range);
        if (target) fire(world, unit, target, events);
      }
    } else if (unit.faction === 'hostile') {
      const weapon = unit.weapon ? WEAPONS[unit.weapon] : null;
      const prey = visibleTarget(world, unit, armedPlayers, SIGHT_RANGE);
      if (prey && weapon) {
        if (distance(unit, prey) <= weapon.range) {
          unit.path = [];
          if (unit.cooldown <= 0) fire(world, unit, prey, events);
        } else if (unit.repathTimer <= 0) {
          const path = findPath(world.tiles, tileOf(unit), tileOf(prey));
          if (path) unit.path = path;
          unit.repathTimer = 0.7;
        }
      } else {
        wander(world, unit, 5, 1.5, 4);
      }
    } else {
      wander(world, unit, unit.panic > 0 ? 8 : 6, 2, 5);
    }

    moveAlong(unit, speed, dt);
  }

  // Persuadertron sweep: every agent recruits nearby minds it can sway.
  for (const agent of agents) {
    for (const unit of world.units) {
      if (!unit.alive || unit.persuaded || unit.kind === 'agent') continue;
      if (followerCount(world) < persuadeRequirement(unit.kind)) continue;
      if (distance(agent, unit) > PERSUADE_RADIUS) continue;
      unit.persuaded = true;
      unit.faction = 'player';
      unit.panic = 0;
      unit.path = [];
      events.push({ type: 'persuade', kind: unit.kind, x: unit.x, y: unit.y });
    }
  }

  // Weapon pickups. Agents claim first — upgrading their kit or fencing the
  // duplicate for cash. Then unarmed or out-gunned followers grab what's left
  // and join the firefight.
  const followers = world.units.filter(u => u.alive && u.persuaded && u.faction === 'player');
  world.pickups = world.pickups.filter(pickup => {
    for (const agent of agents) {
      if (Math.hypot(agent.x - pickup.x, agent.y - pickup.y) > 0.8) continue;
      const upgraded = !agent.weapon || WEAPONS[pickup.weapon].tier > WEAPONS[agent.weapon].tier;
      if (upgraded) agent.weapon = pickup.weapon;
      events.push({ type: 'pickup', weapon: pickup.weapon, role: 'agent', upgraded, x: pickup.x, y: pickup.y });
      return false;
    }
    for (const follower of followers) {
      if (Math.hypot(follower.x - pickup.x, follower.y - pickup.y) > 0.8) continue;
      const upgraded = !follower.weapon || WEAPONS[pickup.weapon].tier > WEAPONS[follower.weapon].tier;
      if (!upgraded) continue;
      follower.weapon = pickup.weapon;
      events.push({ type: 'pickup', weapon: pickup.weapon, role: 'follower', upgraded: true, x: pickup.x, y: pickup.y });
      return false;
    }
    return true;
  });

  return events;
}
