/**
 * Syndicate — campaign missions. Three contracts in the classic mould:
 * wipe out the rival agents, persuade a crowd and reach extraction, and
 * finally assassinate the rival executive.
 */
import { MAP_W, MAP_H, nearestWalkable, type MapTile } from './map';
import { spreadTargets, walkableTiles } from './pathfind';
import { createUnit, type Unit, type WeaponId } from './units';

export type Objective = 'eliminate' | 'persuade' | 'assassinate';

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
  agentAtExtraction: boolean
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
  }
}
