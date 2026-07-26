/**
 * Client seam for the shared arcade leaderboard.
 *
 * The per-device tables in `highscores.ts` stay the source of truth for a
 * player's own board. This module talks to the Vercel Function at
 * `api/scores.ts`, which keeps one blob per game so every visitor sees the
 * same top ten. Both calls resolve `null` instead of throwing: a leaderboard
 * that cannot be reached must never break a game, so callers read `null` as
 * "world board unavailable" and fall back to the device table. That is the
 * same graceful-degradation contract `src/data/health.ts` uses for its
 * build-time fetches.
 */
import type { ScoreEntry } from './highscores';

/**
 * Hardcoded rather than read from an env var. The URL is not a secret, and
 * baking it in removes a build-config failure mode as well as the need to
 * thread a new variable through the GitHub Pages workflow.
 */
export const SCORES_ENDPOINT = 'https://ismaelmartinezmeuk.vercel.app/api/scores';

/**
 * Hosts allowed to write. Everywhere else (local dev, preview deployments)
 * reads the real board but never adds to it, so experimenting offline cannot
 * pollute the scores everyone sees.
 */
const SUBMIT_HOSTS = ['ismaelmartinez.me.uk', 'ismaelmartinezmeuk.vercel.app'];

const TIMEOUT_MS = 5000;

/** The wire shape, kept short because whole boards travel in one response. */
interface WireEntry {
  i: string;
  s: number;
}

function isWireEntry(value: unknown): value is WireEntry {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as WireEntry).i === 'string' &&
    typeof (value as WireEntry).s === 'number' &&
    Number.isFinite((value as WireEntry).s)
  );
}

/** Anything malformed is dropped rather than trusted: this is remote data. */
function toEntries(wire: unknown): ScoreEntry[] {
  if (!Array.isArray(wire)) return [];
  return wire.filter(isWireEntry).map(e => ({ initials: e.i, score: e.s }));
}

function canSubmit(): boolean {
  return typeof location !== 'undefined' && SUBMIT_HOSTS.includes(location.hostname);
}

/**
 * Every game's global top ten in one request, keyed by game id. Resolves
 * `null` when the board cannot be reached, which the panel shows as
 * "unavailable" rather than as an empty leaderboard. One request covers a
 * page's every table, and the response's own cache headers spare the second
 * panel on the pages that field two.
 */
export async function fetchGlobal(): Promise<Record<string, ScoreEntry[]> | null> {
  try {
    const res = await fetch(SCORES_ENDPOINT, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return null;
    const data: unknown = await res.json();
    if (typeof data !== 'object' || data === null) return null;
    const boards: Record<string, ScoreEntry[]> = {};
    for (const [gameId, wire] of Object.entries(data)) boards[gameId] = toEntries(wire);
    return boards;
  } catch {
    return null;
  }
}

/**
 * Offers a finished run to the global board and returns its world rank (0 if
 * it did not chart) alongside the new top ten, so a submission never needs a
 * follow-up read. Resolves `null` when the write was not attempted or did not
 * land.
 *
 * `keepalive` matters: the commit path also runs from `pagehide`, and without
 * it a score entered on the game-over screen would be cancelled by the very
 * navigation that triggered the commit. `text/plain` is deliberate too, since
 * it is CORS-safelisted and so costs no preflight round trip.
 */
export async function submitGlobal(
  gameId: string,
  initials: string,
  score: number
): Promise<{ rank: number; table: ScoreEntry[] } | null> {
  if (!canSubmit()) return null;
  try {
    const res = await fetch(SCORES_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({
        game: gameId,
        initials,
        score,
        nonce: crypto.randomUUID()
      }),
      keepalive: true,
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { rank?: unknown; table?: unknown };
    return {
      rank: typeof data.rank === 'number' && Number.isFinite(data.rank) ? data.rank : 0,
      table: toEntries(data.table)
    };
  } catch {
    return null;
  }
}
