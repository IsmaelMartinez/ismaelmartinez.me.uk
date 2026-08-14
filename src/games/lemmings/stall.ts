/**
 * Standstill detection and the end-of-level verdict for Critter Rescue.
 *
 * The level's own end condition ("everyone out, only blockers left") never
 * matches a crowd that has simply run out of ways home: a walker pacing a
 * pocket it cannot climb out of is neither dead nor a blocker. Ten of the
 * twenty-five levels can reach that state, and nothing in the level's rules
 * answers for it.
 *
 * Three rounds of automatic endings tried to answer for it here, and each one
 * took a run off a player who was still playing: a hidden clock cut off a slow
 * playthrough, then a standstill window closed a won level while skills and
 * rescuable critters were still on the field, then a stock-gated version of the
 * same thing fell through to a minute-long backstop that ended the whole run and
 * submitted it. The common fault is that all three tried to tell "stuck" from
 * "thinking" on the player's behalf, and guessing wrong costs the run.
 *
 * So this module no longer ends anything on a standstill. The escape hatch is
 * the player's: the Nuke button, which resigns the level deliberately and is
 * unambiguous in a way no timer is. What a standstill earns is a *hint* — the
 * game says the crowd looks stuck and points at the button. A hint that misfires
 * costs a line of text.
 *
 * "Frozen" is deliberately measured from the outside, as anything that could
 * still change the outcome: a rescue, a death, a spawn, a skill spent, a single
 * pixel of terrain moved, or any critter setting foot somewhere it has not been
 * since the last of those. A crowd bouncing between two blockers covers no new
 * ground and cuts no new terrain, so it freezes; a critter walking the long way
 * round to the exit does not, however long it takes. The same measurement also
 * says what the level is *billed* for: time on a frozen field is not time the
 * player played, so the score is taken at the tick the field last moved.
 *
 * `levelEnding` composes the whole verdict in one pure place so the game loop
 * and the headless playthrough harness cannot drift apart on when a level is
 * over — the divergence that let a hanging level ship green.
 */
import { LEVEL_W } from './levels';
import type { Critter } from './critter';

/**
 * Ticks (60/s — so 8 seconds) of a completely frozen field after which the game
 * offers the "you look stuck" hint. Comfortably above the longest stretch real
 * play can spend covering no new ground: a walker moves 1px per tick, so even a
 * critter retracing the full width of the level takes 320 ticks, and anything
 * that digs, builds, falls, or is rescued resets the count outright.
 *
 * It is a threshold for a sentence of text and nothing else. Nothing in the game
 * ends on it, so a window that is too short shows a hint a moment early rather
 * than taking a level away from anyone.
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
  /** True once the field has been frozen for `STUCK_TICKS` — show the hint. */
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

/**
 * How a level ended. Both are things the level itself decides; neither is a
 * judgement about whether the player has given up.
 *
 * - `settled` — everyone has emerged and no critter can still be rescued: the
 *   stragglers are blockers, which never leave on their own and, with nobody
 *   left to dig them free, are stuck for good. A nuke reaches this ending too,
 *   once the chain has cleared the field.
 * - `clock` — an authored `timeLimit` ran out, which is a race the level was
 *   designed around and the only ending with a countdown on screen.
 */
export type LevelEnding = 'settled' | 'clock';

/** Everything the verdict below is a function of. */
export interface EndConditionState {
  /** Every critter has left the hatch. */
  allOut: boolean;
  /** No active critter can still be rescued — all that remain are blockers. */
  onlyBlockersLeft: boolean;
  /** Ticks elapsed in the level, and its authored clock if it has one. */
  ticks: number;
  timeLimit?: number;
  /**
   * The player hit Nuke. The chain is already ending the level, so the clock
   * stands down: the result should read as the failure they chose rather than
   * as a timeout coaching them to play faster.
   */
  conceded: boolean;
}

/**
 * The single composition of "is this level over?", shared by the game loop and
 * the playthrough harness so neither can certify an ending the other would not.
 *
 * Note what is *not* here: any clock over an untimed level, and any reading of
 * the standstill. Every ending below follows either from the crowd's own state
 * or from a countdown the player can see, so no level is ever taken away for
 * time the player was never shown or for a pause the game mistook for defeat.
 * The consequence is deliberate: on a level whose crowd can no longer reach the
 * exit this function answers `null` forever, and the way out is the player's
 * Nuke — which resolves the field and arrives back here as `settled`.
 */
export function levelEnding(state: EndConditionState): LevelEnding | null {
  if (state.allOut && state.onlyBlockersLeft) return 'settled';
  if (!state.conceded && state.timeLimit !== undefined && state.ticks >= state.timeLimit) {
    return 'clock';
  }
  return null;
}
