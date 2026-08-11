/**
 * The under-construction floor's progressive unlock chain.
 *
 * The arcade floor shows the chain's cabinets one at a time: the first is
 * always on, and finishing a run of the newest unlocked cabinet powers the
 * next one. "Finished a run" is recorded by `markDone`, called from the one
 * door every finished run already passes through — `scoreboard.ts`'s commit
 * path — so no cabinet needs wiring of its own. Only the floor reads this
 * state: the game pages themselves are never gated, so a direct URL to a
 * still-shrouded cabinet keeps working.
 *
 * The pure floor rule lives in `visibleCabinets`, apart from the guarded
 * storage reads, so it stays unit-testable without a DOM.
 */

import { loadBest } from './highscores';

/** Floor order. Each cabinet is powered by finishing the one before it. */
export const UNLOCK_CHAIN = [
  'towerdefense',
  'lemmings',
  'cascade',
  'city',
  'tanks',
  'snake'
] as const;

const DONE_PREFIX = 'arcade-done-';

export const doneKey = (gameId: string): string => `${DONE_PREFIX}${gameId}`;

/** Records a finished run for the floor. Idempotent; storage failures are silent. */
export function markDone(gameId: string): void {
  try {
    localStorage.setItem(doneKey(gameId), '1');
  } catch {
    // Storage unavailable; the floor just won't remember this run.
  }
}

/**
 * The chain games this device has finished a run of. A personal best above
 * zero counts as done too: play that predates the unlock chain would
 * otherwise strip a returning player's floor back to one cabinet.
 */
export function completedGames(chain: readonly string[] = UNLOCK_CHAIN): Set<string> {
  const done = new Set<string>();
  for (const id of chain) {
    if (readDone(id) || loadBest(id) > 0) done.add(id);
  }
  return done;
}

function readDone(gameId: string): boolean {
  try {
    return localStorage.getItem(doneKey(gameId)) !== null;
  } catch {
    return false;
  }
}

export interface FloorState {
  /** Cabinets standing on the floor ready to play, in chain order. */
  unlocked: string[];
  /** The one shrouded "next" cabinet, or null once the chain is fully open. */
  next: string | null;
}

/**
 * Pure floor rule. Progress is measured from the deepest finished cabinet,
 * so a done set with gaps (seeded from old personal bests, or from a run
 * played via direct URL) never takes away a floor already reached. Everything
 * past the shrouded cabinet stays entirely off the floor, which is why the
 * shroud's hint can always name its immediate predecessor in the chain: that
 * predecessor is by construction the newest unlocked cabinet.
 */
export function visibleCabinets(chain: readonly string[], done: ReadonlySet<string>): FloorState {
  let lastDone = -1;
  chain.forEach((id, i) => {
    if (done.has(id)) lastDone = i;
  });
  // The cabinet after the deepest finished one is unlocked (finishing reveals
  // it), clamped so a fully finished chain doesn't run off the end.
  const newest = Math.min(lastDone + 1, chain.length - 1);
  return {
    unlocked: [...chain.slice(0, newest + 1)],
    next: chain[newest + 1] ?? null
  };
}
