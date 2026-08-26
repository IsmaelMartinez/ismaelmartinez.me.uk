/**
 * Client seam for the shared arcade leaderboard.
 *
 * This is the board a cabinet shows: the module talks to the Vercel Function
 * at `api/scores.ts`, which keeps one blob per game so every visitor sees the
 * same top ten. Both calls resolve `null` instead of throwing: a leaderboard
 * that cannot be reached must never break a game, so callers read `null` as
 * "world board unavailable" and say so rather than drawing an empty board.
 * That is the same graceful-degradation contract `src/data/health.ts` uses
 * for its build-time fetches. A player's own progress does not ride on this
 * either way: `highscores.ts` keeps their personal best on the device, which
 * is what the HUD readouts and the record toast are driven from.
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

/**
 * The ceiling `api/scores.ts` refuses a score at, duplicated here rather than
 * imported for the same reason `MAX_ENTRIES` duplicates `MAX_TOP`: importing
 * across the seam would pull server code into the browser bundle, and a test
 * holds the two in step. Checked before the POST so the panel can say the
 * score is off the scale, which is permanent, instead of the API's 400
 * arriving as the generic "not saved, try again later" (issue #271).
 */
export const MAX_SCORE = 10_000_000;

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
 * What became of a submission.
 *
 * `skipped` and `failed` both mean the score is not on the board, but only one
 * of them is worth telling the player about: away from production the write is
 * deliberately never attempted, and reporting that as a failed save would be a
 * lie. Keeping them apart here rather than collapsing both to a null is what
 * spares the panel from having to ask a second question to recover the
 * difference.
 *
 * `limited` is its own case rather than folding into `failed`: the API's 429
 * (per-address-per-hour or per-game-per-day cap, see `api/scores.ts`) means
 * "try again later", not "something is broken". A grinding session on a short
 * cabinet can hit the hourly cap well before ten distinct scores have charted,
 * and telling that player the same "not saved, try again" as a genuine outage
 * would send them refreshing a board that is working exactly as designed.
 *
 * `range` is kept apart from `failed` for the mirror-image reason: the API
 * refuses a score at or above MAX_SCORE for good, so telling that player to
 * try again later would send them to replay a run that can never land.
 */
export type SubmitResult =
  | { status: 'ok'; rank: number; table: ScoreEntry[] }
  | { status: 'skipped' }
  | { status: 'limited' }
  | { status: 'range' }
  | { status: 'failed' };

/**
 * Shared by callers that ask while a request is already out. One response
 * carries every game's board, so a second asker wants exactly what the first
 * is already waiting for. HTTP caching does not cover this: the pages that
 * field two panels (Cascade) construct both scoreboards on consecutive lines,
 * so both ask before either reply exists and there is nothing cached yet.
 * Cleared as soon as the request settles, so this only ever collapses
 * genuinely concurrent asks and never serves a stale board.
 */
let inFlight: Promise<Record<string, ScoreEntry[]> | null> | null = null;

/**
 * Every game's global top ten in one request, keyed by game id. Resolves
 * `null` when the board cannot be reached, which the panel shows as
 * "unavailable" rather than as an empty leaderboard.
 */
export function fetchGlobal(): Promise<Record<string, ScoreEntry[]> | null> {
  if (inFlight) return inFlight;
  inFlight = requestBoards().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function requestBoards(): Promise<Record<string, ScoreEntry[]> | null> {
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
): Promise<SubmitResult> {
  if (!canSubmit()) return { status: 'skipped' };
  if (score >= MAX_SCORE) return { status: 'range' };
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
    if (!res.ok) return res.status === 429 ? { status: 'limited' } : { status: 'failed' };
    const data = (await res.json()) as { rank?: unknown; table?: unknown };
    return {
      status: 'ok',
      rank: typeof data.rank === 'number' && Number.isFinite(data.rank) ? data.rank : 0,
      table: toEntries(data.table)
    };
  } catch {
    return { status: 'failed' };
  }
}
