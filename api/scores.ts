/**
 * Global arcade high-score tables, one blob per cabinet.
 *
 * A game's entire state lives in a single JSON blob at `scores/<gameId>.json`,
 * so a submission costs one read and one write however much bookkeeping the
 * abuse rules need:
 *
 *   top     the all-time top ten, merged on every write
 *   recent  every submission inside the rate-limit window, kept for replay
 *           dedupe and for the two caps below
 *
 * `top` used to be re-derived on each write from a rolling history of the 500
 * newest submissions. That quietly made the board a *recent* top ten rather
 * than an all-time one: once a busy game passed five hundred runs, the oldest
 * entries fell out of the history and their scores vanished off the board even
 * if they were still the best ever posted. Merging each new entry into a
 * persisted `top` instead means a record leaves the board only when ten better
 * ones have pushed it off.
 *
 * Because that state is per blob, the per-address limit is per address per
 * game, not per address overall: one address can spend it on each of the nine
 * boards. Making it global would need a tenth shared blob and a second
 * read-modify-write on every submission, which is not worth it here, because
 * the per-game daily cap below is what actually bounds the quota.
 *
 * Timestamps are server-assigned. The arcade tie rule (equal scores keep the
 * older entry higher) survives globally only if `t` is monotonic with write
 * order, which a client-supplied time would not be, so a `t` in the request
 * body is ignored.
 *
 * This file lives at the repository root rather than under `src/pages/api/`
 * because the site is a static Astro build with no adapter: a page-route API
 * would be prerendered to a file and never run. Vercel deploys anything in a
 * root `api/` directory as a function regardless of framework.
 */

import { createHash } from 'node:crypto';
import { get, put, BlobPreconditionFailedError } from '@vercel/blob';

/**
 * A row of the board as stored. Short keys because the blob is read whole.
 * `t` and `n` never leave the server: `t` settles ties, `n` identifies a
 * resent submission so it cannot chart twice.
 */
export interface BoardEntry {
  i: string;
  s: number;
  t: number;
  n: string;
}

/** A row of the published table. Timestamps and nonces stay server-side. */
export interface TopEntry {
  i: string;
  s: number;
}

/** A submission inside the rate-limit window: when, from whom, and which one. */
export interface RecentEntry {
  h: string;
  t: number;
  n: string;
}

export interface StoredBoard {
  top: BoardEntry[];
  recent: RecentEntry[];
}

interface LoadedBoard {
  board: StoredBoard;
  etag: string;
}

interface Submission {
  game: string;
  initials: string;
  score: number;
  nonce: string;
}

/** The nine boards: eight cabinets, with Cascade fielding one per mode. */
export const GAMES: readonly string[] = [
  'snake',
  'tanks',
  'park',
  'city',
  'syndicate',
  'lemmings',
  'towerdefense',
  'cascade',
  'cascade-countdown'
];

const ALLOWED_ORIGINS = [
  'https://ismaelmartinez.me.uk',
  'https://ismaelmartinezmeuk.vercel.app',
  'http://localhost:4321'
];

/**
 * Rows the board keeps. The client's `MAX_ENTRIES` must agree: it decides
 * whether a finished run is worth interrupting the player for initials, and
 * measures that against this board. Exported so a test can hold the two in
 * step, since importing across the client/server seam would pull server code
 * into the browser bundle.
 */
export const MAX_TOP = 10;
const MAX_BODY_CHARS = 1024;
const MAX_SCORE = 10_000_000;
const INITIALS = /^[A-Z0-9]{1,3}$/;

/**
 * Nonces exist only for replay dedupe, but they are stored verbatim in a
 * world-readable blob: bound them to a UUID-sized safe alphabet so the blob
 * cannot carry free-text graffiti. The client sends crypto.randomUUID().
 */
const NONCE = /^[A-Za-z0-9-]{1,64}$/;

/**
 * Three letters of A-Z0-9 reach a handful of slurs and obscenities, and this
 * board is public, shared and has no admin endpoint: anything that lands here
 * shows on every cabinet in three locales until someone hand-edits the blob.
 * Rejected rather than rewritten, so a client that sends one sees the failure.
 */
const BLOCKED_INITIALS = new Set([
  'ASS', 'CNT', 'COK', 'CUM', 'DIC', 'DIK', 'FAG', 'FUC', 'FUK', 'FUX',
  'GAY', 'JAP', 'JEW', 'KKK', 'NIG', 'PIS', 'POO', 'PUS', 'SEX', 'SHT',
  'SLT', 'SPS', 'TIT', 'TWT', 'VAG', 'WOG'
]);

/**
 * Every finished run is offered to the board now, not just the ones that
 * charted on a player's own device table, so these caps see roughly one
 * submission per game played rather than one per personal best. Sized for
 * that: a long session on one cabinet fits inside the hourly allowance, and
 * the daily cap is loose enough to survive the traffic of being linked
 * somewhere busy while still bounding the blob write quota, whose worst case
 * is one board frozen for a day. CORS gates who can read the response, not
 * who can post, so anyone with curl is inside the per-address limit's reach.
 */
const ADDRESS_LIMIT = 20;
const ADDRESS_WINDOW = 60 * 60;
const GAME_LIMIT = 300;
const GAME_WINDOW = 24 * 60 * 60;

/** Headroom over the daily cap, so pruning never evicts a countable entry. */
const MAX_RECENT = 400;

const WRITE_ATTEMPTS = 3;

/**
 * Pause before re-reading after a losing attempt. A read can trail a write
 * that has only just landed, so retrying instantly tends to fetch the same
 * stale view and burn the attempt for nothing.
 */
const RETRY_BACKOFF_MS = 150;

const pause = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Blobs are cached for a month by default. A minute is the floor the API
 * allows and is all a leaderboard needs: submitters see their own new table
 * in the POST response, so nobody is looking at a stale board they just
 * changed.
 */
const BLOB_CACHE_SECONDS = 60;

const boardPath = (gameId: string): string => `scores/${gameId}.json`;

/**
 * Adds an entry to the all-time top ten. Highest score first; equal scores
 * keep the earlier submission above.
 *
 * The new entry is appended before sorting, so a stable sort leaves an
 * existing entry above one that ties it on both score and second — likely, in
 * fact, since contending writes retry within a second of each other, and at
 * that point arrival order is the only remaining signal for which came first.
 */
export function mergeTop(top: BoardEntry[], entry: BoardEntry): BoardEntry[] {
  return [...top, entry].sort((a, b) => b.s - a.s || a.t - b.t).slice(0, MAX_TOP);
}

/** The wire form of a board: the private columns are dropped here, once. */
export const publish = (top: BoardEntry[]): TopEntry[] => top.map(({ i, s }) => ({ i, s }));

/**
 * A submission's place on the board: 1-based when it charted, 0 when it did
 * not.
 */
const rankOf = (top: BoardEntry[], nonce: string): number => {
  const index = top.findIndex(e => e.n === nonce);
  return index >= 0 ? index + 1 : 0;
};

/**
 * The guards narrow to exactly the fields they establish, leaving `t` and `n`
 * unknown for the coercions below to settle. Narrowing to `Partial<BoardEntry>`
 * instead would claim less than was proved and put the invariant back on
 * non-null assertions, where a future edit to a guard could not be caught.
 */
const isBoardEntry = (value: unknown): value is { i: string; s: number; t?: unknown; n?: unknown } =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as BoardEntry).i === 'string' &&
  Number.isFinite((value as BoardEntry).s);

const isRecentEntry = (value: unknown): value is { h: string; t: number; n?: unknown } =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as RecentEntry).h === 'string' &&
  Number.isFinite((value as RecentEntry).t);

/**
 * Timestamps are sort keys, so a NaN or an Infinity read back off storage
 * would make the board's comparator inconsistent rather than merely wrong.
 * Anything unusable is treated as the oldest possible entry.
 */
const asTime = (value: unknown): number => (Number.isFinite(value) ? (value as number) : 0);

/** Nonces are written back into a world-readable blob, so only strings pass. */
const asNonce = (value: unknown): string => (typeof value === 'string' ? value : '');

/**
 * Re-establishes the blob's shape on read.
 *
 * Boards written before `top` was persisted carry an extra `all` history and
 * `top` rows without `t`/`n`; those rows are the oldest the board has, and
 * defaulting their timestamp to 0 ranks them accordingly, so the upgrade needs
 * no migration pass. The retired history is simply dropped, which resets the
 * daily counter once and nothing else.
 */
export function normalizeBoard(raw: unknown): StoredBoard {
  const board = (typeof raw === 'object' && raw !== null ? raw : {}) as Partial<StoredBoard>;
  const top = Array.isArray(board.top) ? board.top : [];
  const recent = Array.isArray(board.recent) ? board.recent : [];
  return {
    top: top.filter(isBoardEntry).map(e => ({ i: e.i, s: e.s, t: asTime(e.t), n: asNonce(e.n) })),
    recent: recent.filter(isRecentEntry).map(e => ({ h: e.h, t: e.t, n: asNonce(e.n) }))
  };
}

/**
 * Access-Control-Allow-Origin carries one value, never a list, so the
 * request's own origin is echoed back when it is on the allowlist and the
 * header is omitted otherwise. `Vary: Origin` stops a cache handing one
 * site's echo to another.
 */
function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('origin');
  const headers: Record<string, string> = { Vary: 'Origin' };
  if (origin && ALLOWED_ORIGINS.includes(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

function fail(status: number, message: string, cors: Record<string, string>): Response {
  return Response.json({ error: message }, { status, headers: cors });
}

/**
 * Blob URLs are public, so `recent` is world-readable and must never carry a
 * raw address. The read-write token is a server-only secret that is always
 * present, so it doubles as the salt rather than adding a second environment
 * variable that could go unset.
 */
function hashAddress(address: string): string {
  return createHash('sha256')
    .update(`${process.env.BLOB_READ_WRITE_TOKEN}${address}`)
    .digest('hex')
    .slice(0, 16);
}

function clientAddress(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.headers.get('x-real-ip') ?? '';
}

/**
 * Reads a board, or null when the game has no blob yet. `fresh` bypasses the
 * blob CDN, which the write path needs: a cached read would merge into a
 * stale board and silently drop everyone else's scores, and the ETag it
 * returns is guaranteed to belong to the bytes just read.
 */
async function readBoard(gameId: string, fresh: boolean): Promise<LoadedBoard | null> {
  const result = await get(boardPath(gameId), { access: 'public', useCache: !fresh });
  if (!result || result.statusCode !== 200) return null;
  const raw: unknown = JSON.parse(await new Response(result.stream).text());
  return { board: normalizeBoard(raw), etag: result.blob.etag };
}

export function OPTIONS(request: Request): Response {
  return new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders(request),
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}

export async function GET(request: Request): Promise<Response> {
  const cors = corsHeaders(request);
  try {
    const loaded = await Promise.all(GAMES.map(gameId => readBoard(gameId, false)));
    const tables: Record<string, TopEntry[]> = {};
    GAMES.forEach((gameId, index) => {
      tables[gameId] = publish(loaded[index]?.board.top ?? []);
    });
    return Response.json(tables, {
      headers: { ...cors, 'Cache-Control': 'public, max-age=30, s-maxage=30, stale-while-revalidate=60' }
    });
  } catch {
    return fail(503, 'scores unavailable', cors);
  }
}

export async function POST(request: Request): Promise<Response> {
  const cors = corsHeaders(request);

  // Size is checked on the raw text: a megabyte of JSON never reaches the parser.
  const raw = await request.text();
  if (raw.length > MAX_BODY_CHARS) return fail(413, 'body too large', cors);

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return fail(400, 'malformed body', cors);
  }
  if (typeof parsed !== 'object' || parsed === null) return fail(400, 'malformed body', cors);

  const { game, initials, score, nonce } = parsed as Partial<Submission>;
  if (typeof game !== 'string' || !GAMES.includes(game)) return fail(400, 'unknown game', cors);
  if (typeof initials !== 'string' || !INITIALS.test(initials)) return fail(400, 'bad initials', cors);
  if (BLOCKED_INITIALS.has(initials)) return fail(400, 'bad initials', cors);
  if (typeof score !== 'number' || !Number.isSafeInteger(score) || score <= 0 || score >= MAX_SCORE) {
    return fail(400, 'bad score', cors);
  }
  if (typeof nonce !== 'string' || !NONCE.test(nonce)) return fail(400, 'bad nonce', cors);

  try {
    return await record(request, cors, { game, initials, score, nonce });
  } catch {
    // Blob trouble. The cabinets keep playing; the run just doesn't chart.
    return fail(503, 'scores unavailable', cors);
  }
}

async function record(
  request: Request,
  cors: Record<string, string>,
  submission: Submission
): Promise<Response> {
  const { game, initials, score, nonce } = submission;
  const hash = hashAddress(clientAddress(request));

  for (let attempt = 0; attempt < WRITE_ATTEMPTS; attempt++) {
    if (attempt > 0) await pause(RETRY_BACKOFF_MS * attempt);
    const loaded = await readBoard(game, true);

    /*
     * An absent board normally means this is the first score the game has
     * ever taken, and the write below then has no ETag to match on. But a
     * read that trails a blob created moments earlier looks exactly the same
     * from here, and `put` offers no conditional-create to tell them apart.
     * Believing a lagging read would send an unconditional write that
     * replaces the whole board rather than adding to it, which is how a real
     * submission went missing in testing. So absence is only accepted on the
     * final attempt, once the backoffs above have given storage time to
     * settle. A genuine first write costs those attempts once per game.
     */
    if (!loaded && attempt < WRITE_ATTEMPTS - 1) continue;

    const board = loaded?.board ?? { top: [], recent: [] };
    const now = Math.floor(Date.now() / 1000);

    // A resent submission (flaky network, double tap) must not chart twice.
    if (board.recent.some(r => r.n === nonce)) {
      return Response.json(
        { rank: rankOf(board.top, nonce), table: publish(board.top) },
        { headers: cors }
      );
    }

    // Everything older than the longest window is dead weight, so one prune
    // serves both counts below and keeps the blob a bounded size.
    const live = board.recent.filter(r => r.t > now - GAME_WINDOW).slice(0, MAX_RECENT);

    // Per address per game per hour: `recent` lives in this game's blob and
    // sees no other board's traffic. See the note at the top of the file.
    if (live.filter(r => r.h === hash && r.t > now - ADDRESS_WINDOW).length >= ADDRESS_LIMIT) {
      return fail(429, 'too many submissions', cors);
    }

    // The cost cap: without it a scripted flood burns the Blob quota, and an
    // over-quota Hobby store is disabled for thirty days.
    if (live.length >= GAME_LIMIT) return fail(429, 'board is full for today', cors);

    const entry: BoardEntry = { i: initials, s: score, t: now, n: nonce };
    const next: StoredBoard = {
      top: mergeTop(board.top, entry),
      // Newest first, so pruning is a plain slice off the tail.
      recent: [{ h: hash, t: now, n: nonce }, ...live].slice(0, MAX_RECENT)
    };

    try {
      await put(boardPath(game), JSON.stringify(next), {
        access: 'public',
        contentType: 'application/json',
        allowOverwrite: true,
        cacheControlMaxAge: BLOB_CACHE_SECONDS,
        // Every write that read an existing board carries its ETag, so a read
        // that went stale mid-merge is rejected here and retried. Only the
        // accepted-absence path above writes without one.
        ...(loaded ? { ifMatch: loaded.etag } : {})
      });
    } catch (error) {
      if (error instanceof BlobPreconditionFailedError) continue;
      throw error;
    }

    return Response.json({ rank: rankOf(next.top, nonce), table: publish(next.top) }, { headers: cors });
  }

  return fail(503, 'board busy, try again', cors);
}
