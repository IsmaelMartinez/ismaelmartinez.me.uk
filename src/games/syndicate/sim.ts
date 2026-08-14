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
/**
 * How close a persuaded mind settles behind its nearest agent, in tiles. It
 * stops here and never closes further, so this is a floor on where a
 * *followed* unit can come to rest. The escort asset trails on the same
 * routine but at its own tighter gap — see ESCORT_FOLLOW_DISTANCE.
 */
export const FOLLOW_STOP_DISTANCE = 1.6;
/**
 * How close a unit must stand to the extraction pad's centre to count as being
 * on it, in tiles. One number for every mould: the `secure` hold, the persuade
 * escape and the escort drop-off all mean the same place by it.
 */
export const EXTRACTION_RADIUS = 1.5;
/**
 * The escort asset's own follow gap, in tiles — deliberately tighter than
 * EXTRACTION_RADIUS rather than sharing the crowd's FOLLOW_STOP_DISTANCE.
 *
 * This is the arithmetic the whole mould rests on. An asset that settles
 * further out than the pad's own radius can never be delivered by trailing,
 * however it got there, so an agent standing on the pad is not a win — which
 * is how mission 10 shipped unwinnable, and why two rounds of routing fixes
 * (widening the win zone, then leading the asset only on whole-squad orders)
 * each traded one unreachable case for another. Tighter than the radius, the
 * question stops being *who* the asset follows: trailing any agent that is
 * standing on the pad puts it inside the pad's radius, so a whole-squad march
 * and a single chip ordered onto the tile both deliver.
 *
 * There is slack rather than a hair's breadth (1.2 against 1.5) because the
 * agent it trails need not be dead centre, and the gap is only sampled
 * between repaths. Nothing collides in this sim, so standing closer costs the
 * squad nothing but the look of it.
 */
export const ESCORT_FOLLOW_DISTANCE = 1.2;

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
  | { type: 'vipSecured'; x: number; y: number }
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

/** The escort asset, collected or not, on the missions that field one. */
export const vipOf = (world: World): Unit | null =>
  world.units.find(u => u.kind === 'vip') ?? null;

/** True once an agent has reached the asset and it is trailing the squad. */
export const escorting = (unit: Unit): boolean =>
  unit.kind === 'vip' && unit.faction === 'player';

/**
 * The escort's delivery test: is the asset standing on the extraction pad?
 *
 * Deliberately about the asset and not the squad — an agent alone on the pad
 * must not extract a mission whose whole point is what it brought with it —
 * and measured from the pad's own centre at the same EXTRACTION_RADIUS an
 * agent has to meet. That is the only bound a player can read off the screen:
 * anything derived from where the squad happens to land makes the win zone a
 * shape the city's streets chose rather than one the mission did, and stretches
 * it in whichever direction the pad's alley happens to run.
 *
 * What makes it reachable is ESCORT_FOLLOW_DISTANCE being tighter than this
 * radius: an asset trailing any agent that stands on the pad is already inside
 * it. `commandMove` leading the asset is what widens that from "an agent on
 * the pad" to "the squad ordered onto the pad", since a squad order fans the
 * agents out around the tile rather than onto it.
 */
export function vipAtExtraction(world: World, extraction: number): boolean {
  if (extraction < 0) return false;
  const vip = vipOf(world);
  if (!vip || !vip.alive || !escorting(vip)) return false;
  const ex = (extraction % MAP_W) + 0.5;
  const ey = Math.floor(extraction / MAP_W) + 0.5;
  return Math.hypot(vip.x - ex, vip.y - ey) <= EXTRACTION_RADIUS;
}

const tileOf = (u: Unit): number => idx(Math.floor(u.x), Math.floor(u.y));

const distance = (a: Unit, b: Unit): number => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Orders the given agents to fan out around the clicked tile.
 *
 * A collected asset is led rather than herded, but only when the order is one
 * the squad as a whole is taking: it takes the clicked tile itself and the
 * agents form up around it.
 *
 * That is a convenience on top of ESCORT_FOLLOW_DISTANCE rather than the thing
 * that makes delivery possible — trailing does deliver, as long as the agent
 * being trailed is the one on the pad. What leading buys is precisely the
 * whole-squad order, because `spreadTargets` fans a squad *around* the clicked
 * tile: the asset's nearest agent is then one of the outer spots, and it comes
 * to rest two to three tiles from the pad's centre. Measured over twelve city
 * seeds, dropping the lead loses every whole-squad delivery (0/12, 2.1 to 3.2
 * tiles out) while single-agent orders, which send every agent to the tile
 * itself, still land 12/12. Putting the asset at the head of the fan-out also
 * rings it with its escort instead of leaving it trailing at the back where
 * the streets can shoot it.
 *
 * An order to a subset of the living squad is a scouting order, not a march,
 * and must leave the asset trailing on `follow` where the rest of the squad
 * still stands. Leading it on those too walks it up a side street alone, and
 * a collected asset is valid prey the whole way — it would be shot down on an
 * order the player never meant it to hear. Since the tighter gap already makes
 * trailing deliver, that scoping costs the player nothing: walk the agents
 * onto the pad one chip at a time and the asset arrives with them.
 *
 * That scoping also countermands: a subset order drops any march still in
 * flight and hands the asset straight back to trailing. Skipping it instead
 * would leave the asset walking the abandoned route alone with `follow`
 * suppressed — the same lone walk under fire the scoping exists to prevent,
 * only now on a route the player has already replaced.
 */
export function commandMove(world: World, target: number, agents: Unit[]): void {
  if (target < 0 || !isWalkable(world.tiles[target])) return;
  const wholeSquad = agents.length > 0 && livingAgents(world).every(a => agents.includes(a));
  const escort = world.units.find(u => u.alive && escorting(u));
  const asset = wholeSquad ? escort : undefined;
  if (escort && !asset) {
    escort.led = false;
    escort.path = [];
  }
  const movers = asset ? [asset, ...agents] : agents;
  const spots = spreadTargets(world.tiles, target, movers.length);
  movers.forEach((unit, n) => {
    const path = findPath(world.tiles, tileOf(unit), spots[Math.min(n, spots.length - 1)] ?? target);
    if (!path) return;
    unit.path = path;
    if (unit === asset) unit.led = true;
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

function follow(world: World, unit: Unit, agents: Unit[], stopDistance: number): void {
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
  if (best <= stopDistance) {
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
  // What hostiles will shoot at. Armed player units draw fire as they always
  // have, plus a collected escort asset: it carries no weapon, so without
  // this it would be literally unshootable and an escort mission could never
  // be lost. A pinned asset is still neutral and ignored, which is what makes
  // reaching it the moment the contract turns dangerous.
  const prey = world.units.filter(
    u => u.alive && u.faction === 'player' && (u.weapon !== null || u.kind === 'vip')
  );
  const hostiles = world.units.filter(u => u.alive && u.faction === 'hostile');

  // Armed player units (agents and armed followers) shoot the nearest visible
  // hostile the moment their weapon comes off cooldown.
  const autoFire = (unit: Unit): void => {
    if (unit.weapon && unit.cooldown <= 0) {
      const target = visibleTarget(world, unit, hostiles, WEAPONS[unit.weapon].range);
      if (target) fire(world, unit, target, events);
    }
  };

  for (const unit of world.units) {
    if (!unit.alive) continue;
    unit.cooldown = Math.max(0, unit.cooldown - dt);
    unit.wanderTimer = Math.max(0, unit.wanderTimer - dt);
    unit.repathTimer = Math.max(0, unit.repathTimer - dt);
    unit.panic = Math.max(0, unit.panic - dt);

    let speed = UNIT_SPEED[unit.kind];
    if (unit.kind === 'civilian' && unit.panic > 0) speed = 3.2;
    if (unit.persuaded) speed = UNIT_SPEED.agent;
    // Adrenaline is the squad's own chrome, so a boosted squad outruns the
    // asset it is escorting — sprint ahead and you leave it exposed.
    if (unit.faction === 'player' && unit.kind !== 'vip' && world.boost > 0) {
      speed *= BOOST_SPEED;
    }

    if (unit.kind === 'agent') {
      // Movement is the player's; agents only auto-fire.
      autoFire(unit);
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
        follow(world, unit, agents, FOLLOW_STOP_DISTANCE);
      }
      autoFire(unit);
    } else if (unit.kind === 'vip') {
      // Pinned where the contract left it until an agent arrives. From then on
      // the squad leads it: a whole-squad move order walks it to the tile the
      // player clicked, and only once that route runs out does it fall back to
      // trailing the nearest agent on the same routine persuaded minds use,
      // at its own ESCORT_FOLLOW_DISTANCE rather than the crowd's gap.
      // Following never overrides an order in flight — the route to the pad
      // runs the gauntlet of the squad's own agents, and an asset re-aimed at
      // the first one it passes stops short of the tile the player clicked.
      //
      // The flag clears two ways, and both are here or in `commandMove`: the
      // route running out, and any subset order countermanding it. It is only
      // ever set on a march the entire living squad is walking, so the squad
      // can only vanish from under it by being wiped out, which loses the
      // mission outright before the next order. Either way the asset falls
      // back to trailing, which now delivers on its own, so the flag can
      // neither strand the mission nor outlive the order that set it.
      if (escorting(unit)) {
        if (!unit.path.length) unit.led = false;
        if (!unit.led) follow(world, unit, agents, ESCORT_FOLLOW_DISTANCE);
      }
    } else if (unit.faction === 'hostile') {
      const weapon = unit.weapon ? WEAPONS[unit.weapon] : null;
      const mark = visibleTarget(world, unit, prey, SIGHT_RANGE);
      if (mark && weapon) {
        if (distance(unit, mark) <= weapon.range) {
          unit.path = [];
          if (unit.cooldown <= 0) fire(world, unit, mark, events);
        } else if (unit.repathTimer <= 0) {
          const path = findPath(world.tiles, tileOf(unit), tileOf(mark));
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

  // Collecting the asset: walking an agent up to it is the whole interaction.
  // It joins the squad's faction, starts following, and from this moment the
  // streets can shoot it.
  for (const agent of agents) {
    for (const unit of world.units) {
      if (!unit.alive || unit.kind !== 'vip' || unit.faction === 'player') continue;
      if (distance(agent, unit) > PERSUADE_RADIUS) continue;
      unit.faction = 'player';
      unit.path = [];
      events.push({ type: 'vipSecured', x: unit.x, y: unit.y });
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
