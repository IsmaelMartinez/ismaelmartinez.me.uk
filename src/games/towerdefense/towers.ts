/**
 * Line Hold — tower types, upgrades, targeting, and firing. Pure: towers
 * live on tiles, acquire the in-range enemy with the highest path progress,
 * and fire on a cooldown; one step returns the shots/kills as events for the
 * presentation layer to draw and bank.
 */
import { chebyshev } from '../engine/grid2d';
import { ENEMIES, type Enemy, type EnemyKind } from './enemies';
import { routePosition, GRID_W } from './path';

export type TowerKind = 'bolt' | 'blast' | 'frost';

export interface TowerDef {
  cost: number;
  /** Chebyshev reach in tiles at level 1 (level 3 adds one). */
  range: number;
  /** Damage per hit at level 1. */
  damage: number;
  /** Seconds between shots at level 1. */
  cooldown: number;
  /** Splash radius in tiles around the struck enemy; 0 = single target. */
  splash: number;
  /** Seconds of chill applied to the struck enemy; 0 = none. */
  slow: number;
}

export const TOWERS: Record<TowerKind, TowerDef> = {
  bolt: { cost: 70, range: 2, damage: 13, cooldown: 0.55, splash: 0, slow: 0 },
  blast: { cost: 110, range: 2, damage: 18, cooldown: 1.5, splash: 1.35, slow: 0 },
  frost: { cost: 90, range: 2, damage: 6, cooldown: 0.9, splash: 0, slow: 1.6 }
};

export const TOWER_KINDS: TowerKind[] = ['bolt', 'blast', 'frost'];
export const MAX_LEVEL = 3;

const DAMAGE_MUL = [1, 1.7, 2.9];
const COOLDOWN_MUL = [1, 0.85, 0.72];

export interface Tower {
  kind: TowerKind;
  tile: number;
  /** 1–MAX_LEVEL. */
  level: number;
  /** Seconds until the next shot is ready. */
  cooldown: number;
}

export function createTower(kind: TowerKind, tile: number): Tower {
  return { kind, tile, level: 1, cooldown: 0 };
}

/** Cost to raise a tower from its current `level` to the next, or null at cap. */
export function upgradeCost(tower: Tower): number | null {
  if (tower.level >= MAX_LEVEL) return null;
  return Math.round(TOWERS[tower.kind].cost * 0.8 * tower.level);
}

export function towerRange(tower: Tower): number {
  return TOWERS[tower.kind].range + (tower.level >= MAX_LEVEL ? 1 : 0);
}

export function towerDamage(tower: Tower): number {
  return Math.round(TOWERS[tower.kind].damage * DAMAGE_MUL[tower.level - 1]);
}

export function towerCooldown(tower: Tower): number {
  return TOWERS[tower.kind].cooldown * COOLDOWN_MUL[tower.level - 1];
}

/** The route tile a marching enemy currently stands on. */
export function enemyTile(route: number[], enemy: Enemy): number {
  return route[Math.min(Math.floor(enemy.progress), route.length - 1)];
}

/**
 * The in-range living enemy with the highest path progress — the classic
 * "first" priority that punishes leaks rather than farming stragglers.
 */
export function acquireTarget(tower: Tower, enemies: Enemy[], route: number[]): Enemy | null {
  const range = towerRange(tower);
  let best: Enemy | null = null;
  for (const enemy of enemies) {
    if (!enemy.alive) continue;
    if (chebyshev(tower.tile, enemyTile(route, enemy), GRID_W) > range) continue;
    if (!best || enemy.progress > best.progress) best = enemy;
  }
  return best;
}

export type CombatEvent =
  | { type: 'shot'; kind: TowerKind; from: number; tx: number; ty: number }
  | { type: 'kill'; kind: EnemyKind; bounty: number; x: number; y: number };

/** Applies one hit, respecting armour; a landed hit always costs at least 1 hp. */
function applyDamage(enemy: Enemy, damage: number, events: CombatEvent[], route: number[]): void {
  const def = ENEMIES[enemy.kind];
  enemy.hp -= Math.max(1, damage - def.armour);
  if (enemy.hp <= 0) {
    enemy.alive = false;
    const pos = routePosition(route, enemy.progress);
    events.push({ type: 'kill', kind: enemy.kind, bounty: def.bounty, x: pos.x, y: pos.y });
  }
}

/**
 * Ticks every tower's cooldown and fires the ready ones. Mutates enemy hp /
 * alive flags and tower cooldowns; returns the shots and kills of this step.
 */
export function stepTowers(
  towers: Tower[],
  enemies: Enemy[],
  route: number[],
  dt: number
): CombatEvent[] {
  const events: CombatEvent[] = [];
  for (const tower of towers) {
    tower.cooldown = Math.max(0, tower.cooldown - dt);
    if (tower.cooldown > 0) continue;
    const target = acquireTarget(tower, enemies, route);
    if (!target) continue;
    tower.cooldown = towerCooldown(tower);
    const def = TOWERS[tower.kind];
    const pos = routePosition(route, target.progress);
    events.push({ type: 'shot', kind: tower.kind, from: tower.tile, tx: pos.x, ty: pos.y });
    if (def.slow > 0) target.slow = Math.max(target.slow, def.slow);
    applyDamage(target, towerDamage(tower), events, route);
    if (def.splash > 0) {
      for (const other of enemies) {
        if (!other.alive || other === target) continue;
        const p = routePosition(route, other.progress);
        if (Math.hypot(p.x - pos.x, p.y - pos.y) <= def.splash) {
          applyDamage(other, towerDamage(tower), events, route);
        }
      }
    }
  }
  return events;
}
