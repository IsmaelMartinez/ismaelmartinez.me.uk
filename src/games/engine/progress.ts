/**
 * The under-construction floor's progressive unlock chain.
 *
 * The arcade floor shows the chain's cabinets one at a time: the first is
 * always on, and finishing a run of the newest unlocked cabinet powers the
 * next one. "Finished a run" is recorded by `markDone`, called from the door
 * every scored run already passes through — `scoreboard.ts`'s commit path —
 * plus one direct call in Tank Duel's match end, for the two-player matches
 * that finish without ever reaching the leaderboard. Only the floor reads this
 * state: the game pages themselves are never gated, so a direct URL to a
 * still-shrouded cabinet keeps working.
 *
 * The `arcade-done-*` key family is deliberately NOT derivable from
 * `arcade-best-*`, even though the seed below makes them look equivalent:
 * Tank Duel marks done on any completed two-player match, and a two-player
 * match banks no personal best (one person drives both tanks, so its score
 * reaches neither board). Deriving done from best would re-stall the chain on
 * exactly those runs, so keep both families.
 *
 * The pure floor rule lives in `visibleCabinets`, apart from the guarded
 * storage reads, so it stays unit-testable without a DOM.
 */

import { loadBest } from './highscores';

/**
 * Floor order: a walk through gaming history, oldest homaged classic first —
 * Tank Duel (Atari Tank, 1974), Snake (Blockade, 1976), Cascade (the
 * falling-block era, 1985), Microcity (SimCity, 1989), Calcio '90 (Italia '90
 * and the Kick Off / Sensible Soccer era, 1990), Critter Rescue (Lemmings,
 * 1991), Line Hold (the tower-defense era, 2007). Each cabinet is powered by
 * scoring on the one before it.
 */
export const UNLOCK_CHAIN = [
  'tanks',
  'snake',
  'cascade',
  'city',
  'football',
  'lemmings',
  'towerdefense'
] as const;

/**
 * Inserting into the middle of this list, as CALCIO '90 did at 1990 on
 * 2026-08-15, has one consequence worth knowing before the next one goes in.
 * Because `visibleCabinets` counts forward from the deepest *finished*
 * cabinet, a returning player whose deepest finished cabinet is the one just
 * before the insertion point sees the newcomer standing where the cabinet
 * after it used to stand, and that cabinet goes back under the tarp until they
 * score on the newcomer. Nobody loses a cabinet they had finished, the floor
 * never gets smaller, and a direct URL to the re-shrouded cabinet still works,
 * so this is a re-ordering of what the floor offers next rather than a loss of
 * progress. It is the price of keeping the chain chronological instead of
 * append-only, which is the whole idea of the walk, so it is accepted rather
 * than worked around. Appending would dodge it and would also put a 1990
 * cabinet after a 2007 one.
 */

const DONE_PREFIX = 'arcade-done-';

export const doneKey = (gameId: string): string => `${DONE_PREFIX}${gameId}`;

/**
 * Some cabinets record runs under more than one scoreboard gameId; the floor
 * treats them all as the one chain cabinet. Cascade's countdown mode
 * ('cascade-countdown') is the only case today.
 */
const CHAIN_ALIASES: Record<string, string> = { 'cascade-countdown': 'cascade' };

/** The chain id a scoreboard gameId counts toward. */
const chainId = (gameId: string): string => CHAIN_ALIASES[gameId] ?? gameId;

/**
 * Records a finished run for the floor, under the run's chain id (so a
 * Cascade countdown run powers the 'cascade' link). Only a run that actually
 * put something on the board counts — finishing with nothing scored reveals
 * nothing, matching the personal-best seed below (which also needs a score
 * above zero). Idempotent; storage failures are silent.
 */
export function markDone(gameId: string, score: number): void {
  if (score <= 0) return;
  try {
    localStorage.setItem(doneKey(chainId(gameId)), '1');
  } catch {
    // Storage unavailable; the floor just won't remember this run.
  }
}

/**
 * The chain games this device has finished a run of. A personal best above
 * zero — under the chain id or any alias of it — counts as done too: play
 * that predates the unlock chain would otherwise strip a returning player's
 * floor back to one cabinet.
 *
 * When storage is unusable (reads/writes throw) this fails OPEN, returning
 * the whole chain: progress could never be recorded on such a device, so a
 * gated floor would strand the player at one cabinet behind a hint promising
 * an unlock that can never land.
 */
export function completedGames(chain: readonly string[] = UNLOCK_CHAIN): Set<string> {
  if (!storageUsable()) return new Set(chain);
  const done = new Set<string>();
  for (const id of chain) {
    if (readDone(id) || bestCountsFor(id)) done.add(id);
  }
  return done;
}

/** A personal best above zero under the chain id or any alias mapping to it. */
function bestCountsFor(id: string): boolean {
  if (loadBest(id) > 0) return true;
  for (const [alias, target] of Object.entries(CHAIN_ALIASES)) {
    if (target === id && loadBest(alias) > 0) return true;
  }
  return false;
}

function storageUsable(): boolean {
  try {
    const probe = 'arcade-progress-probe';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
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
