/**
 * Line Hold — enemy types and movement. Enemies hold a continuous `progress`
 * in tiles along the map route; the renderer derives their position from it
 * (path.ts routePosition), so movement stays pure and frame-rate free.
 */

export type EnemyKind = 'scout' | 'sprinter' | 'brute' | 'warlord';

export interface EnemyDef {
  hp: number;
  /** Tiles per second along the route. */
  speed: number;
  /** Flat damage soaked from every hit (a hit always lands at least 1). */
  armour: number;
  /** Cash paid on a kill (also the kill's score value). */
  bounty: number;
  /** Lives lost if it reaches the goal. */
  livesCost: number;
}

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  scout: { hp: 32, speed: 1.5, armour: 0, bounty: 6, livesCost: 1 },
  sprinter: { hp: 24, speed: 2.7, armour: 0, bounty: 8, livesCost: 1 },
  brute: { hp: 110, speed: 0.95, armour: 2, bounty: 16, livesCost: 2 },
  warlord: { hp: 750, speed: 0.7, armour: 4, bounty: 120, livesCost: 5 }
};

/** Speed multiplier while a frost tower's chill is active. */
export const SLOW_FACTOR = 0.45;

export interface Enemy {
  id: number;
  kind: EnemyKind;
  hp: number;
  maxHp: number;
  /** Tiles travelled along the route (continuous). */
  progress: number;
  /** Seconds of frost chill remaining. */
  slow: number;
  alive: boolean;
}

let nextId = 1;

export function spawnEnemy(kind: EnemyKind, hpScale: number): Enemy {
  const hp = Math.round(ENEMIES[kind].hp * hpScale);
  return { id: nextId++, kind, hp, maxHp: hp, progress: 0, slow: 0, alive: true };
}

export interface LeakEvent {
  kind: EnemyKind;
  livesCost: number;
}

/**
 * Advances every living enemy along the route; enemies that reach the end
 * are removed from play and reported as leaks.
 */
export function stepEnemies(enemies: Enemy[], routeLength: number, dt: number): LeakEvent[] {
  const leaks: LeakEvent[] = [];
  const end = routeLength - 1;
  for (const enemy of enemies) {
    if (!enemy.alive) continue;
    const def = ENEMIES[enemy.kind];
    // Chill applies to the step it is entered with, then burns down.
    enemy.progress += def.speed * (enemy.slow > 0 ? SLOW_FACTOR : 1) * dt;
    enemy.slow = Math.max(0, enemy.slow - dt);
    if (enemy.progress >= end) {
      enemy.alive = false;
      leaks.push({ kind: enemy.kind, livesCost: def.livesCost });
    }
  }
  return leaks;
}
