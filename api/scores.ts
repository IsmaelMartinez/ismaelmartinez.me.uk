/**
 * Global arcade high-score tables, one blob per cabinet.
 *
 * Every cabinet already keeps a per-device top ten in localStorage; this
 * endpoint is the shared board behind them. A game's entire state lives in a
 * single JSON blob at `scores/<gameId>.json`, so a submission costs one read
 * and one write however much bookkeeping the abuse rules need:
 *
 *   top     the derived top ten, recomputed on every write
 *   all     the 500 newest submissions, which `top` is derived from
 *   recent  the 50 newest accepted writes as salted address hashes, kept
 *           only for rate limiting
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

/** A single submission as stored. Short keys because the blob is read whole. */
export interface HistoryEntry {
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

interface RecentWrite {
  h: string;
  t: number;
}

interface StoredBoard {
  top: TopEntry[];
  all: HistoryEntry[];
  recent: RecentWrite[];
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

const MAX_TOP = 10;
const MAX_HISTORY = 500;
const MAX_RECENT = 50;
const MAX_BODY_CHARS = 1024;
const MAX_SCORE = 10_000_000;
const INITIALS = /^[A-Z0-9]{1,3}$/;

/**
 * Three letters of A-Z0-9 reach a handful of slurs and obscenities, and this
 * board is public, shared and has no admin endpoint: anything that lands here
 * shows on every cabinet in three locales until someone hand-edits the blob.
 * Rejected rather than rewritten, so a client that sends one sees the failure
 * and falls back to its device table.
 */
const BLOCKED_INITIALS = new Set([
  'ASS', 'CNT', 'COK', 'CUM', 'DIC', 'DIK', 'FAG', 'FUC', 'FUK', 'FUX',
  'GAY', 'JAP', 'JEW', 'KKK', 'NIG', 'PIS', 'POO', 'PUS', 'SEX', 'SHT',
  'SLT', 'SPS', 'TIT', 'TWT', 'VAG', 'WOG'
]);

const ADDRESS_LIMIT = 5;
const ADDRESS_WINDOW = 60 * 60;
const GAME_LIMIT = 30;
const GAME_WINDOW = 24 * 60 * 60;

const WRITE_ATTEMPTS = 3;

/**
 * Blobs are cached for a month by default. A minute is the floor the API
 * allows and is all a leaderboard needs: submitters see their own new table
 * in the POST response, so nobody is looking at a stale board they just
 * changed.
 */
const BLOB_CACHE_SECONDS = 60;

const boardPath = (gameId: string): string => `scores/${gameId}.json`;

/**
 * Highest score first; equal scores keep the earlier submission above, which
 * is the rule the per-device tables follow so the two tabs cannot disagree.
 *
 * Precondition: `all` is newest-first, which is how `record` writes it. Two
 * entries can tie on score AND on second (likely, in fact, since contending
 * writes retry within a second of each other), and at that point the only
 * remaining signal for which came first is position in the array. Reversing
 * to oldest-first before a stable sort therefore leaves the older of a full
 * tie above. Sorting the newest-first array directly would rank the later
 * submission higher, inverting the arcade rule exactly in the case where it
 * is most likely to be seen.
 */
const sortByRank = (all: HistoryEntry[]): HistoryEntry[] =>
  [...all].reverse().sort((a, b) => b.s - a.s || a.t - b.t);

/**
 * The published table. Always derived from `all`, never read back off
 * storage, so a hand-edited or half-written `top` cannot poison the board.
 */
export function rankTop(all: HistoryEntry[]): TopEntry[] {
  return sortByRank(all)
    .slice(0, MAX_TOP)
    .map(({ i, s }) => ({ i, s }));
}

/**
 * A submission's place on the global board: 1-based when it charted in the
 * top ten, 0 when it did not, matching what the per-device tables report.
 */
function rankOf(all: HistoryEntry[], nonce: string): number {
  const index = sortByRank(all).findIndex(e => e.n === nonce);
  return index >= 0 && index < MAX_TOP ? index + 1 : 0;
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
  const board = JSON.parse(await new Response(result.stream).text()) as StoredBoard;
  return { board, etag: result.blob.etag };
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
      const board = loaded[index]?.board;
      tables[gameId] = board ? rankTop(board.all) : [];
    });
    return Response.json(tables, {
      headers: { ...cors, 'Cache-Control': 'public, max-age=30' }
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
  if (typeof nonce !== 'string' || nonce === '') return fail(400, 'bad nonce', cors);

  try {
    return await record(request, cors, { game, initials, score, nonce });
  } catch {
    // Blob trouble. The cabinets fall back to their per-device tables.
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
    const loaded = await readBoard(game, true);
    const board = loaded?.board ?? { top: [], all: [], recent: [] };
    const now = Math.floor(Date.now() / 1000);

    // A resent submission (flaky network, double tap) must not chart twice.
    if (board.all.some(e => e.n === nonce)) {
      return Response.json({ rank: rankOf(board.all, nonce), table: rankTop(board.all) }, { headers: cors });
    }

    // Per address per game per hour: `recent` lives in this game's blob and
    // sees no other board's traffic. See the note at the top of the file.
    const fromAddress = board.recent.filter(r => r.h === hash && r.t > now - ADDRESS_WINDOW).length;
    if (fromAddress >= ADDRESS_LIMIT) return fail(429, 'too many submissions', cors);

    // The cost cap. Its worst case is one board frozen for a day; without it
    // a scripted flood burns the Blob quota, and an over-quota Hobby store is
    // disabled for thirty days. CORS gates who can read the response, not who
    // can post, so anyone with curl is inside the per-address limit's reach.
    const forGame = board.all.filter(e => e.t > now - GAME_WINDOW).length;
    if (forGame >= GAME_LIMIT) return fail(429, 'board is full for today', cors);

    // Newest first, so capping is a plain slice off the tail.
    const all = [{ i: initials, s: score, t: now, n: nonce }, ...board.all].slice(0, MAX_HISTORY);
    const next: StoredBoard = {
      top: rankTop(all),
      all,
      recent: [{ h: hash, t: now }, ...board.recent].slice(0, MAX_RECENT)
    };

    try {
      await put(boardPath(game), JSON.stringify(next), {
        access: 'public',
        contentType: 'application/json',
        allowOverwrite: true,
        cacheControlMaxAge: BLOB_CACHE_SECONDS,
        // A first write has no ETag to match on. Every later write carries
        // one, so a read that went stale mid-merge fails here and retries.
        ...(loaded ? { ifMatch: loaded.etag } : {})
      });
    } catch (error) {
      if (error instanceof BlobPreconditionFailedError) continue;
      throw error;
    }

    return Response.json({ rank: rankOf(all, nonce), table: next.top }, { headers: cors });
  }

  return fail(503, 'board busy, try again', cors);
}
