/**
 * Syndicate — campaign missions. Seven contracts, escalating the roster and
 * weapon tiers: wipe out the rival agents, persuade a crowd and reach
 * extraction, assassinate the rival executive, then a reinforced wipe, a
 * recruitment under heavy fire, the decapitation finale, and finally a `secure`
 * contract — a new objective mould — that has the squad fight to the extraction
 * zone and *hold* it for a spell against a dug-in guard ring. The mid-campaign
 * assassinate keeps the minigun and the executive `target` from being a
 * last-mission-only reveal.
 */
import { MAP_W, MAP_H, nearestWalkable, type MapTile } from './map';
import { spreadTargets, walkableTiles } from './pathfind';
import { createUnit, type Unit, type WeaponId } from './units';

export type Objective = 'eliminate' | 'persuade' | 'assassinate' | 'secure';

export interface MissionSpec {
  id: number;
  objective: Objective;
  civilians: number;
  guards: number;
  enemies: number;
  guardWeapon: WeaponId;
  enemyWeapon: WeaponId;
  /** Civilians to recruit before extraction opens (persuade missions). */
  persuadeQuota: number;
  /**
   * Seconds a living agent must control the landing zone to win (`secure`
   * missions). Unset/0 on the other objective moulds.
   */
  holdSeconds?: number;
  /** Cash bonus on completion. */
  reward: number;
}

export const MISSIONS: MissionSpec[] = [
  {
    id: 1,
    objective: 'eliminate',
    civilians: 14,
    guards: 2,
    enemies: 4,
    guardWeapon: 'pistol',
    enemyWeapon: 'uzi',
    persuadeQuota: 0,
    reward: 1000
  },
  {
    id: 2,
    objective: 'persuade',
    civilians: 18,
    guards: 4,
    enemies: 3,
    guardWeapon: 'pistol',
    enemyWeapon: 'uzi',
    persuadeQuota: 8,
    reward: 1500
  },
  {
    id: 3,
    objective: 'assassinate',
    civilians: 12,
    guards: 4,
    enemies: 4,
    guardWeapon: 'pistol',
    enemyWeapon: 'minigun',
    persuadeQuota: 0,
    reward: 2500
  },
  {
    // Reinforced wipe — the rivals regroup with heavier hardware; guards now
    // carry uzis, so the streets bite back.
    id: 4,
    objective: 'eliminate',
    civilians: 16,
    guards: 4,
    enemies: 5,
    guardWeapon: 'uzi',
    enemyWeapon: 'uzi',
    persuadeQuota: 0,
    reward: 3000
  },
  {
    // Recruitment under fire — a bigger quota with minigun-armed rivals
    // patrolling the crowd you have to win over.
    id: 5,
    objective: 'persuade',
    civilians: 20,
    guards: 5,
    enemies: 4,
    guardWeapon: 'uzi',
    enemyWeapon: 'minigun',
    persuadeQuota: 10,
    reward: 3500
  },
  {
    // Decapitation finale — the executive behind the deepest guard ring the
    // campaign fields, every hostile on top-tier chrome.
    id: 6,
    objective: 'assassinate',
    civilians: 12,
    guards: 6,
    enemies: 5,
    guardWeapon: 'uzi',
    enemyWeapon: 'minigun',
    persuadeQuota: 0,
    reward: 5000
  },
  {
    // Hold the Line — the campaign's new mould. Fight across the city to the
    // extraction zone and hold it for twenty seconds against the deepest guard
    // ring, every rival on top-tier chrome. Winning is not a kill count — it is
    // keeping the LZ under your boots while it counts down.
    id: 7,
    objective: 'secure',
    civilians: 12,
    guards: 6,
    enemies: 5,
    guardWeapon: 'uzi',
    enemyWeapon: 'minigun',
    persuadeQuota: 0,
    holdSeconds: 20,
    reward: 6000
  }
];

export const SQUAD_SIZE = 4;

export interface MissionSetup {
  units: Unit[];
  /** Tile indices where the squad starts (north-west corner). */
  squadSpawn: number[];
  /** Extraction tile (south-east corner). */
  extraction: number;
}

/** Random walkable tile at least `minDist` tiles (euclidean) from `from`. */
function remoteTile(
  walkable: number[],
  fromX: number,
  fromY: number,
  minDist: number,
  random: () => number
): number {
  for (let attempt = 0; attempt < 40; attempt++) {
    const tile = walkable[Math.floor(random() * walkable.length)];
    const dx = (tile % MAP_W) + 0.5 - fromX;
    const dy = Math.floor(tile / MAP_W) + 0.5 - fromY;
    if (Math.hypot(dx, dy) >= minDist) return tile;
  }
  return walkable[walkable.length - 1];
}

/**
 * Builds the mission's population. Agents spawn clustered in the north-west,
 * hostiles keep their distance, civilians fill the streets.
 */
export function spawnMission(
  spec: MissionSpec,
  tiles: MapTile[],
  agentWeapons: WeaponId[],
  random: () => number
): MissionSetup {
  const walkable = walkableTiles(tiles);
  const corner = nearestWalkable(tiles, 0, 0);
  const squadSpawn = spreadTargets(tiles, corner, SQUAD_SIZE);
  const extraction = nearestWalkable(tiles, MAP_W - 1, MAP_H - 1);
  const spawnX = (corner % MAP_W) + 0.5;
  const spawnY = Math.floor(corner / MAP_W) + 0.5;

  const units: Unit[] = [];
  let nextId = 1;

  for (let n = 0; n < SQUAD_SIZE; n++) {
    const agent = createUnit(nextId++, 'agent', squadSpawn[n % squadSpawn.length], MAP_W, agentWeapons[n] ?? 'pistol');
    agent.tint = n;
    units.push(agent);
  }
  for (let n = 0; n < spec.civilians; n++) {
    const civilian = createUnit(nextId++, 'civilian', remoteTile(walkable, spawnX, spawnY, 4, random), MAP_W);
    civilian.tint = Math.floor(random() * 6);
    units.push(civilian);
  }
  if (spec.objective === 'assassinate') {
    // The executive holes up far from the insertion point, ringed by guards.
    const lair = remoteTile(walkable, spawnX, spawnY, 18, random);
    units.push(createUnit(nextId++, 'target', lair, MAP_W, 'pistol'));
    const ring = spreadTargets(tiles, lair, spec.guards + 1);
    for (let n = 0; n < spec.guards; n++) {
      units.push(createUnit(nextId++, 'guard', ring[n + 1] ?? lair, MAP_W, spec.guardWeapon));
    }
  } else if (spec.objective === 'secure') {
    // The landing zone is contested — guards dig in around the extraction pad
    // (the same ring the executive's lair uses), so the squad has to fight in
    // and hold it rather than just sprint to the corner.
    const ring = spreadTargets(tiles, extraction, spec.guards + 1);
    for (let n = 0; n < spec.guards; n++) {
      units.push(createUnit(nextId++, 'guard', ring[n + 1] ?? extraction, MAP_W, spec.guardWeapon));
    }
  } else {
    for (let n = 0; n < spec.guards; n++) {
      units.push(createUnit(nextId++, 'guard', remoteTile(walkable, spawnX, spawnY, 10, random), MAP_W, spec.guardWeapon));
    }
  }
  for (let n = 0; n < spec.enemies; n++) {
    units.push(createUnit(nextId++, 'enemy', remoteTile(walkable, spawnX, spawnY, 12, random), MAP_W, spec.enemyWeapon));
  }

  return { units, squadSpawn, extraction };
}

export type MissionState = 'ongoing' | 'won' | 'lost';

export function missionStatus(
  spec: MissionSpec,
  units: Unit[],
  persuadedCivilians: number,
  agentAtExtraction: boolean,
  holdProgress = 0
): MissionState {
  if (!units.some(u => u.alive && u.kind === 'agent')) return 'lost';
  switch (spec.objective) {
    case 'eliminate':
      // Persuaded rivals count: they work for you now.
      return units.every(u => u.kind !== 'enemy' || !u.alive || u.faction === 'player')
        ? 'won'
        : 'ongoing';
    case 'persuade':
      return persuadedCivilians >= spec.persuadeQuota && agentAtExtraction ? 'won' : 'ongoing';
    case 'assassinate':
      return units.every(u => u.kind !== 'target' || !u.alive) ? 'won' : 'ongoing';
    case 'secure': {
      // Won by controlling the landing zone long enough; game.ts banks the
      // seconds a living agent stands on the LZ into `holdProgress`. The hold
      // requirement defines the mould, so a missing/zero `holdSeconds` never
      // auto-wins — it surfaces the misconfiguration as an unwon mission rather
      // than silently skipping past it.
      const target = spec.holdSeconds ?? 0;
      return target > 0 && holdProgress >= target ? 'won' : 'ongoing';
    }
  }
}
