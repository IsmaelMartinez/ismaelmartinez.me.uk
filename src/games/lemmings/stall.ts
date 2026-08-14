/**
 * Stall detection for Critter Rescue.
 *
 * The level's own end condition ("everyone out, only blockers left") never
 * matches a crowd that has simply run out of ways home: a walker pacing a
 * pocket it cannot climb out of is neither dead nor a blocker. The fallback
 * clock in levels.ts stops such a level running forever, but 2.5 minutes of a
 * motionless field is not an answer the player can read — so the game watches
 * the field for a *frozen* one and resolves as soon as the level is decided,
 * leaving the clock as the runaway backstop it was meant to be.
 *
 * "Frozen" is deliberately measured from the outside, as anything that could
 * still change the outcome: a rescue, a death, a spawn, a skill spent, a single
 * pixel of terrain moved, or any critter setting foot somewhere it has not been
 * since the last of those. A crowd bouncing between two blockers covers no new
 * ground and cuts no new terrain, so it freezes; a critter walking the long way
 * round to the exit does not, however long it takes. All DOM-free, so both the
 * game loop and the headless playthrough harness drive the same watcher.
 */
import { LEVEL_W } from './levels';
import type { Critter } from './critter';

/**
 * Ticks (60/s — so 8 seconds) of a completely frozen field after which the
 * crowd counts as stuck. Comfortably above the longest stretch real play can
 * spend covering no new ground: a walker moves 1px per tick, so even a critter
 * retracing the full width of the level takes 320 ticks, and anything that digs,
 * builds, falls, or is rescued resets the count outright.
 */
export const STUCK_TICKS = 480;

/** Everything about the field that could still change the level's outcome. */
export interface FieldState {
  /** The active critters, after the tick's dead and exited have been retired. */
  critters: readonly Critter[];
  saved: number;
  spawned: number;
  /** `TerrainBitmap.version` — bumped by every dig, bash, build, and blast. */
  terrainVersion: number;
  /** Skills the player still has to spend; spending one is a change. */
  stock: number;
}

export interface StallWatch {
  /** Ticks since the field last changed in any way. */
  readonly idleTicks: number;
  /** True once the field has been frozen for `STUCK_TICKS`. */
  readonly stuck: boolean;
  /** Feeds one tick of field state. */
  observe(state: FieldState): void;
  /** Forgets everything — called when a level loads. */
  reset(): void;
}

export function createStallWatch(): StallWatch {
  // Every pixel an active critter has stood on since the last change. Cleared
  // whenever something else moves, so ground is only "old" relative to the
  // current standstill.
  const covered = new Set<number>();
  let idle = 0;
  let saved = -1;
  let spawned = -1;
  let version = -1;
  let stock = -1;
  let active = -1;

  return {
    get idleTicks() {
      return idle;
    },
    get stuck() {
      return idle >= STUCK_TICKS;
    },
    reset() {
      covered.clear();
      idle = 0;
      saved = spawned = version = stock = active = -1;
    },
    observe(state) {
      let changed = false;
      if (
        state.saved !== saved ||
        state.spawned !== spawned ||
        state.terrainVersion !== version ||
        state.stock !== stock ||
        state.critters.length !== active
      ) {
        changed = true;
        covered.clear();
      }
      saved = state.saved;
      spawned = state.spawned;
      version = state.terrainVersion;
      stock = state.stock;
      active = state.critters.length;
      for (const c of state.critters) {
        const cell = c.y * LEVEL_W + c.x;
        if (!covered.has(cell)) {
          covered.add(cell);
          changed = true;
        }
      }
      idle = changed ? 0 : idle + 1;
    }
  };
}
