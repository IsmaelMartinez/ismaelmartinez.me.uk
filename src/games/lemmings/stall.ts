/**
 * Stall detection and the end-of-level verdict for Critter Rescue.
 *
 * The level's own end condition ("everyone out, only blockers left") never
 * matches a crowd that has simply run out of ways home: a walker pacing a
 * pocket it cannot climb out of is neither dead nor a blocker. Without a second
 * answer such a level runs forever, with the Nuke button as the only way out.
 *
 * That answer is a standstill, not a clock. An untimed level shows no timer —
 * deliberately, since the fallback is a safety net rather than a race — so a
 * hidden countdown can only ever end a level for a reason the player cannot
 * see, and one long enough to be safe is 2.5 minutes of staring at a motionless
 * field. Watching for the field to *freeze* instead resolves the level within
 * seconds of there being nothing left to watch, and by construction can never
 * cut off a playthrough that is still going somewhere, however slowly it is
 * being played.
 *
 * "Frozen" is deliberately measured from the outside, as anything that could
 * still change the outcome: a rescue, a death, a spawn, a skill spent, a single
 * pixel of terrain moved, or any critter setting foot somewhere it has not been
 * since the last of those. A crowd bouncing between two blockers covers no new
 * ground and cuts no new terrain, so it freezes; a critter walking the long way
 * round to the exit does not, however long it takes.
 *
 * Termination is guaranteed rather than hoped for: every reset the watcher
 * accepts is finite (rescues and spawns are capped by the crowd, terrain edits
 * and skill spends by the level's stock, and the active count only ever falls
 * once the hatch is empty), and between resets a critter can only cover each of
 * the level's finitely many pixels once. So the idle count always runs away in
 * the end, and `levelEnding` always answers.
 *
 * All DOM-free, and `levelEnding` composes the whole verdict in one pure place
 * so the game loop and the headless playthrough harness cannot drift apart on
 * when a level is over — the divergence that let a hanging level ship green.
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

/**
 * The same standstill, but for a player who still has skills in hand: 3,600
 * ticks, a full minute of a field where literally nothing has happened.
 *
 * A frozen field only settles the level when the player can no longer change
 * it. While a single skill is left unspent the crowd on screen is still
 * rescuable — penning the surplus behind blockers and then reading the terrain
 * for a while is ordinary play, and ending the level there would take the
 * remaining rescues and the perfect bonus away from someone who was never given
 * the chance to act. So the short window waits on the player, and this long one
 * is the backstop for the level nobody is playing any more.
 */
export const ABANDONED_TICKS = 3600;

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

/**
 * How a level ended, in the order the conditions are trusted:
 *
 * - `settled` — everyone has emerged and no critter can still be rescued: the
 *   stragglers are blockers, which never leave on their own and, with nobody
 *   left to dig them free, are stuck for good.
 * - `decided` — the field has frozen and the player has no skill left to spend
 *   on it, so nothing on screen can change the result. Won or lost, the level
 *   is over; it just has not noticed yet.
 * - `stalled` — the field has frozen for a whole minute with skills still in
 *   hand, on a level with no clock of its own. Nobody is playing this level any
 *   more, and nothing else was ever going to end it.
 * - `clock` — an authored `timeLimit` ran out, which is a race the level was
 *   designed around and the only ending with a countdown on screen.
 */
export type LevelEnding = 'settled' | 'decided' | 'stalled' | 'clock';

/** Everything the verdict below is a function of. */
export interface EndConditionState {
  /** Every critter has left the hatch. */
  allOut: boolean;
  /** No active critter can still be rescued — all that remain are blockers. */
  onlyBlockersLeft: boolean;
  /**
   * Skills the player still has to spend, across every type. Deliberately the
   * only thing here about the *player*: whether the quota is met does not
   * decide when a level is over, only how the result reads, so a frozen field
   * with nothing left to spend on it ends the same way won or lost.
   */
  stockLeft: number;
  /** `StallWatch.idleTicks`. */
  idleTicks: number;
  /** Ticks elapsed in the level, and its authored clock if it has one. */
  ticks: number;
  timeLimit?: number;
  /**
   * The player hit Nuke. The chain is already ending the level, so the clock
   * stands down: the result should read as the failure they chose rather than
   * as a timeout coaching them to play faster. The standstill needs no such
   * guard — a detonation every four ticks is the opposite of a frozen field.
   */
  conceded: boolean;
}

/**
 * The single composition of "is this level over?", shared by the game loop and
 * the playthrough harness so neither can certify an ending the other would not.
 *
 * Note what is *not* here: a wall clock over untimed levels. Every ending below
 * either follows from the crowd's own state or from the field going nowhere, so
 * a level being played is never cut off by elapsed time it was never shown.
 */
export function levelEnding(state: EndConditionState): LevelEnding | null {
  if (state.allOut && state.onlyBlockersLeft) return 'settled';
  if (state.allOut) {
    // A player with a skill in hand is the reason to keep waiting, so they set
    // how long the wait is — and on a level that already carries a countdown,
    // that countdown is the backstop, so the long window stands down entirely
    // rather than pre-empting a race the player can see and is still in.
    if (state.stockLeft === 0) {
      if (state.idleTicks >= STUCK_TICKS) return 'decided';
    } else if (state.timeLimit === undefined && state.idleTicks >= ABANDONED_TICKS) {
      return 'stalled';
    }
  }
  if (!state.conceded && state.timeLimit !== undefined && state.ticks >= state.timeLimit) {
    return 'clock';
  }
  return null;
}
