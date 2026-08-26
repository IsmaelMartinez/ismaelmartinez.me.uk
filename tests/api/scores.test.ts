import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { get, put } from '@vercel/blob';
import {
  GAMES,
  MAX_TOP,
  MAX_SCORE,
  mergeTop,
  normalizeBoard,
  publish,
  GET,
  POST,
  OPTIONS,
  type BoardEntry,
  type StoredBoard
} from '../../api/scores';
import { MAX_ENTRIES } from '../../src/games/engine/highscores';
import { MAX_SCORE as CLIENT_MAX_SCORE } from '../../src/games/engine/globalScores';

/**
 * An in-memory stand-in for the blob store. It has to be built inside
 * `vi.hoisted` because the mock factory runs when `api/scores` first imports
 * `@vercel/blob`, which happens before this file's own bindings exist.
 *
 * `onRead` is the hook the ETag tests use: it fires once, immediately after a
 * read returns, to simulate a rival write landing mid-merge.
 */
const blob = vi.hoisted(() => {
  class MockPreconditionFailedError extends Error {}
  return {
    store: new Map<string, { json: string; etag: string }>(),
    state: { onRead: null as null | (() => void) },
    MockPreconditionFailedError
  };
});

vi.mock('@vercel/blob', () => ({
  get: vi.fn(async (pathname: string) => {
    const found = blob.store.get(pathname);
    const result = found
      ? {
          statusCode: 200 as const,
          stream: new Response(found.json).body,
          headers: new Headers(),
          blob: { etag: found.etag, pathname }
        }
      : null;
    const hook = blob.state.onRead;
    if (hook) {
      blob.state.onRead = null;
      hook();
    }
    return result;
  }),
  put: vi.fn(async (pathname: string, body: string, options: { ifMatch?: string }) => {
    const found = blob.store.get(pathname);
    if (options.ifMatch !== undefined && found?.etag !== options.ifMatch) {
      throw new blob.MockPreconditionFailedError('precondition failed');
    }
    blob.store.set(pathname, { json: body, etag: `etag-${blob.store.size}-${body.length}` });
    return { pathname, url: `https://store.public.blob.vercel-storage.com/${pathname}` };
  }),
  BlobPreconditionFailedError: blob.MockPreconditionFailedError
}));

const ORIGIN = 'https://ismaelmartinez.me.uk';
const NOW_SECONDS = 1785000000;
const AN_HOUR = 60 * 60;
const A_DAY = 24 * 60 * 60;
const TOKEN = 'vercel_blob_rw_test_token';
const ADDRESS_LIMIT = 20;
const GAME_LIMIT = 300;
const MAX_RECENT = 400;
const ADDRESS = '203.0.113.5';

/** What the handler derives for the test address, so the salt stays its own business. */
const ADDRESS_HASH = createHash('sha256')
  .update(`${TOKEN}${ADDRESS}`)
  .digest('hex')
  .slice(0, 16);

const entry = (i: string, s: number, t: number, n: string): BoardEntry => ({ i, s, t, n });

function seed(gameId: string, board: Partial<StoredBoard>, etag = `etag-${gameId}`): void {
  const full: StoredBoard = { top: [], recent: [], ...board };
  blob.store.set(`scores/${gameId}.json`, { json: JSON.stringify(full), etag });
}

/**
 * Seeds a board from its rows, deriving the matching `recent` submissions so a
 * test can keep describing a board by the scores on it. Each row is credited
 * to its own address unless `sameAddress` is set, so seeding a board does not
 * accidentally spend one address's hourly allowance.
 */
function seedBoard(
  gameId: string,
  entries: BoardEntry[],
  etag?: string,
  sameAddress?: string
): void {
  seed(
    gameId,
    {
      top: entries,
      recent: entries.map(e => ({ h: sameAddress ?? `hash-${e.n}`, t: e.t, n: e.n }))
    },
    etag
  );
}

/**
 * Seeds a board's submission history directly, for the rate-limit tests. Each
 * entry gets a distinct nonce so none of them collide with the submission
 * under test; `from` decides whose allowance they spend and `at` how long ago
 * they landed, which is the whole of what separates these cases.
 */
function seedTraffic(
  gameId: string,
  count: number,
  from: (index: number) => string,
  at: (index: number) => number
): void {
  seed(gameId, {
    recent: Array.from({ length: count }, (_, index) => ({
      h: from(index),
      t: at(index),
      n: `seeded-${index}`
    }))
  });
}

/** Every entry credited to the test's own address, so they share its quota. */
const sameAddress = () => ADDRESS_HASH;
/** A distinct address per entry, so no single one hits the per-address cap. */
const manyAddresses = (index: number) => `flooder-${index}`;

function stored(gameId: string): StoredBoard {
  const found = blob.store.get(`scores/${gameId}.json`);
  if (!found) throw new Error(`no blob for ${gameId}`);
  return JSON.parse(found.json) as StoredBoard;
}

function postRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('https://ismaelmartinez.me.uk/api/scores', {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain',
      origin: ORIGIN,
      'x-forwarded-for': `${ADDRESS}, 70.41.3.18`,
      ...headers
    },
    body: typeof body === 'string' ? body : JSON.stringify(body)
  });
}

const getRequest = (): Request =>
  new Request('https://ismaelmartinez.me.uk/api/scores', { headers: { origin: ORIGIN } });

const submission = (over: Record<string, unknown> = {}) => ({
  game: 'snake',
  initials: 'IMR',
  score: 4210,
  nonce: 'nonce-1',
  ...over
});

beforeEach(() => {
  blob.store.clear();
  blob.state.onRead = null;
  vi.mocked(get).mockClear();
  vi.mocked(put).mockClear();
  vi.stubEnv('BLOB_READ_WRITE_TOKEN', TOKEN);
  // Date.now is stubbed rather than the whole timer suite: faking setImmediate
  // would stall the stream reads the blob mock hands back.
  vi.spyOn(Date, 'now').mockReturnValue(NOW_SECONDS * 1000);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('normalizeBoard', () => {
  it('keeps a well-formed board as it is', () => {
    const board = { top: [entry('AAA', 10, 1, 'a')], recent: [{ h: 'h', t: 1, n: 'a' }] };
    expect(normalizeBoard(board)).toEqual(board);
  });

  it('returns an empty board for anything that is not one', () => {
    for (const raw of [null, undefined, 42, 'nope', [], {}]) {
      expect(normalizeBoard(raw)).toEqual({ top: [], recent: [] });
    }
  });

  /*
   * The blob is world-readable and, with the token, hand-editable, so the
   * columns read back off it are treated as untrusted input. A non-finite
   * timestamp is the sharp one: it is a sort key, so it would make the
   * board's comparator inconsistent rather than merely misorder one row.
   */
  it('coerces unusable timestamps and nonces rather than sorting on them', () => {
    const board = normalizeBoard({
      top: [
        { i: 'AAA', s: 10, t: Number.NaN, n: { evil: true } },
        { i: 'BBB', s: 20, t: 'soon', n: 5 }
      ],
      recent: [{ h: 'h', t: Number.POSITIVE_INFINITY, n: 1 }]
    });
    expect(board.top).toEqual([
      { i: 'AAA', s: 10, t: 0, n: '' },
      { i: 'BBB', s: 20, t: 0, n: '' }
    ]);
    // A non-finite timestamp is not a submission time, so the row is dropped.
    expect(board.recent).toEqual([]);
  });

  it('drops malformed rows rather than trusting them', () => {
    const raw = {
      top: [entry('AAA', 10, 1, 'a'), { i: 'BBB' }, { s: 5 }, null, 'x'],
      recent: [{ h: 'h', t: 1, n: 'a' }, { h: 'h' }, { t: 2 }, null]
    };
    const board = normalizeBoard(raw);
    expect(board.top).toEqual([entry('AAA', 10, 1, 'a')]);
    expect(board.recent).toEqual([{ h: 'h', t: 1, n: 'a' }]);
  });

  /*
   * Boards written before the top ten was persisted carry a rolling `all`
   * history and `top` rows with no `t`/`n`. Those rows are the oldest scores
   * the board holds, so defaulting the timestamp to 0 ranks them accordingly
   * and the upgrade needs no migration pass. The retired history is dropped,
   * which resets the daily counter once and nothing else.
   */
  it('upgrades a pre-persisted-top board without losing its scores', () => {
    const board = normalizeBoard({
      top: [{ i: 'IMR', s: 4210 }],
      all: [{ i: 'IMR', s: 4210, t: 99, n: 'old' }],
      recent: [{ h: 'h', t: 99 }]
    });
    expect(board.top).toEqual([{ i: 'IMR', s: 4210, t: 0, n: '' }]);
    expect(board.recent).toEqual([{ h: 'h', t: 99, n: '' }]);
    expect(board).not.toHaveProperty('all');
  });
});

describe('CORS', () => {
  it('answers OPTIONS with 204 and echoes an allowlisted origin', () => {
    const response = OPTIONS(getRequest());
    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    expect(response.headers.get('vary')).toBe('Origin');
    expect(response.headers.get('access-control-allow-methods')).toContain('POST');
  });

  it('echoes each allowlisted origin rather than a list', () => {
    for (const origin of [
      'https://ismaelmartinez.me.uk',
      'https://ismaelmartinezmeuk.vercel.app',
      'http://localhost:4321'
    ]) {
      const response = OPTIONS(new Request('https://x/api/scores', { headers: { origin } }));
      expect(response.headers.get('access-control-allow-origin')).toBe(origin);
    }
  });

  it('omits the header entirely for an origin that is not allowlisted', () => {
    const response = OPTIONS(
      new Request('https://x/api/scores', { headers: { origin: 'https://evil.example' } })
    );
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
    expect(response.headers.get('vary')).toBe('Origin');
  });

  it('omits the header on a POST from a foreign origin', async () => {
    const response = await POST(postRequest(submission(), { origin: 'https://evil.example' }));
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
  });
});

describe('GET', () => {
  it('returns a key for every game, empty where no board exists', async () => {
    const body = (await (await GET(getRequest())).json()) as Record<string, unknown[]>;
    expect(Object.keys(body).sort()).toEqual([...GAMES].sort());
    expect(Object.values(body).every(table => table.length === 0)).toBe(true);
  });

  it('publishes the stored board without its private columns', async () => {
    seedBoard('snake', [entry('BBB', 300, 2, 'b'), entry('AAA', 100, 1, 'a')]);
    const body = (await (await GET(getRequest())).json()) as Record<string, unknown[]>;
    expect(body.snake).toEqual([
      { i: 'BBB', s: 300 },
      { i: 'AAA', s: 100 }
    ]);
    // Timestamps and nonces are server-side bookkeeping and never ship.
    expect(Object.keys(body.snake[0] as object)).toEqual(['i', 's']);
  });

  it('still publishes a board written before the top ten was persisted', async () => {
    seed('snake', {
      top: [{ i: 'IMR', s: 4210 }] as unknown as BoardEntry[],
      recent: []
    });
    const body = (await (await GET(getRequest())).json()) as Record<string, unknown[]>;
    expect(body.snake).toEqual([{ i: 'IMR', s: 4210 }]);
  });

  it('sets the agreed Cache-Control header', async () => {
    const response = await GET(getRequest());
    expect(response.headers.get('cache-control')).toBe(
      'public, max-age=30, s-maxage=30, stale-while-revalidate=60'
    );
  });

  it('reads through the blob cache, which the blobs own short max-age bounds', async () => {
    await GET(getRequest());
    expect(vi.mocked(get).mock.calls[0][1]).toMatchObject({ useCache: true });
  });
});

describe('POST rejections', () => {
  it('rejects a body over 1KB before parsing it', async () => {
    const response = await POST(postRequest(submission({ nonce: 'n'.repeat(2000) })));
    expect(response.status).toBe(413);
    expect(vi.mocked(get)).not.toHaveBeenCalled();
  });

  it('rejects a malformed body', async () => {
    for (const body of ['not json at all', 'null', '42', '']) {
      const response = await POST(postRequest(body));
      expect(response.status).toBe(400);
    }
  });

  it('rejects a game that is not on the allowlist', async () => {
    for (const game of ['poo-poo-land', '', 'SNAKE', 'scores/../secrets', 42]) {
      const response = await POST(postRequest(submission({ game })));
      expect(response.status).toBe(400);
    }
    expect(vi.mocked(put)).not.toHaveBeenCalled();
  });

  it('rejects initials outside /^[A-Z0-9]{1,3}$/', async () => {
    for (const initials of ['', 'imr', 'ABCD', 'A B', 'A!', 42]) {
      const response = await POST(postRequest(submission({ initials })));
      expect(response.status).toBe(400);
    }
  });

  it('accepts one to three uppercase alphanumerics', async () => {
    for (const initials of ['A', 'A1', 'Z99']) {
      blob.store.clear();
      const response = await POST(postRequest(submission({ initials, nonce: `n-${initials}` })));
      expect(response.status).toBe(200);
    }
  });

  // The board is public, shared and has no admin endpoint, so a slur that
  // gets in stays on every cabinet until someone hand-edits the blob.
  it('rejects blocked initials even though they match the pattern', async () => {
    for (const initials of ['ASS', 'FUC', 'NIG', 'TIT']) {
      // Proving the block is doing the work, not the pattern.
      expect(/^[A-Z0-9]{1,3}$/.test(initials)).toBe(true);
      const response = await POST(postRequest(submission({ initials, nonce: `n-${initials}` })));
      expect(response.status).toBe(400);
    }
  });

  it('rejects scores that are not positive safe integers under ten million', async () => {
    for (const score of [0, -5, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 10_000_000, 1e21, '500']) {
      const response = await POST(postRequest(submission({ score })));
      expect(response.status).toBe(400);
    }
  });

  it('accepts the largest legal score', async () => {
    const response = await POST(postRequest(submission({ score: 9_999_999 })));
    expect(response.status).toBe(200);
  });

  it('rejects a missing or empty nonce', async () => {
    for (const nonce of ['', undefined, 7]) {
      const response = await POST(postRequest(submission({ nonce })));
      expect(response.status).toBe(400);
    }
  });

  it('rejects an oversized or unsafe nonce', async () => {
    for (const nonce of ['x'.repeat(65), 'not a nonce!', '<script>alert(1)</script>']) {
      const response = await POST(postRequest(submission({ nonce })));
      expect(response.status).toBe(400);
    }
  });

  it('answers with a plain message, never a stack trace', async () => {
    const response = await POST(postRequest(submission({ game: 'nope' })));
    const body = (await response.json()) as { error: string };
    expect(body).toEqual({ error: 'unknown game' });
  });
});

describe('POST writes', () => {
  it('charts a first submission and returns the new table', async () => {
    const response = await POST(postRequest(submission()));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ rank: 1, table: [{ i: 'IMR', s: 4210 }] });
    expect(stored('snake').top).toHaveLength(1);
  });

  it('reports the global rank, and 0 when the score misses the top ten', async () => {
    seedBoard(
      'snake',
      Array.from({ length: 12 }, (_, index) => entry('AAA', 1000 + index, index, `seed-${index}`))
    );

    const missed = await POST(postRequest(submission({ score: 1, nonce: 'low' })));
    expect(await missed.json()).toMatchObject({ rank: 0 });

    const charted = await POST(postRequest(submission({ score: 5000, nonce: 'high' })));
    expect(await charted.json()).toMatchObject({ rank: 1 });
  });

  it('writes without ifMatch on the first write and with it afterwards', async () => {
    await POST(postRequest(submission()));
    expect(vi.mocked(put).mock.calls[0][2]).not.toHaveProperty('ifMatch');

    await POST(postRequest(submission({ nonce: 'nonce-2', score: 10 })));
    expect(vi.mocked(put).mock.calls[1][2]).toHaveProperty('ifMatch');
  });

  it('bypasses the blob cache when reading to merge, so no rival score is lost', async () => {
    await POST(postRequest(submission()));
    expect(vi.mocked(get).mock.calls[0][1]).toMatchObject({ useCache: false });
  });

  it('keeps the stored blob cacheable for only a minute', async () => {
    await POST(postRequest(submission()));
    expect(vi.mocked(put).mock.calls[0][2]).toMatchObject({
      access: 'public',
      allowOverwrite: true,
      cacheControlMaxAge: 60
    });
  });

  it('assigns the timestamp itself and ignores a client-supplied one', async () => {
    await POST(postRequest(submission({ t: 1, s: 999999, i: 'HAX' })));
    expect(stored('snake').top[0]).toEqual({ i: 'IMR', s: 4210, t: NOW_SECONDS, n: 'nonce-1' });
  });

  it('stores the address as a salted hash, never in the clear', async () => {
    await POST(postRequest(submission()));
    const [recent] = stored('snake').recent;
    expect(recent).toEqual({ h: ADDRESS_HASH, t: NOW_SECONDS, n: 'nonce-1' });
    expect(JSON.stringify(stored('snake'))).not.toContain(ADDRESS);
  });

  it('falls back to x-real-ip when there is no forwarded chain', async () => {
    const request = new Request('https://ismaelmartinez.me.uk/api/scores', {
      method: 'POST',
      headers: { origin: ORIGIN, 'x-real-ip': '198.51.100.7' },
      body: JSON.stringify(submission())
    });
    await POST(request);
    expect(stored('snake').recent[0].h).toMatch(/^[0-9a-f]{16}$/);
    expect(stored('snake').recent[0].h).not.toBe(ADDRESS_HASH);
  });

  /**
   * A record leaves the board only when ten better ones push it off. It used
   * to leave when five hundred newer submissions pushed it out of the rolling
   * history the table was re-derived from, which quietly made an all-time
   * board a recent one.
   */
  it('keeps an old record on the board however much newer traffic arrives', async () => {
    seedBoard('snake', [entry('OLD', 9_000_000, NOW_SECONDS - A_DAY - 5, 'ancient')]);
    await POST(postRequest(submission({ score: 10, nonce: 'fresh' })));
    const board = stored('snake');
    expect(board.top[0]).toMatchObject({ i: 'OLD', s: 9_000_000 });
    expect(board.top.map(e => e.n)).toContain('fresh');
  });

  it('prunes submissions older than the longest rate-limit window', async () => {
    seedTraffic('snake', 40, manyAddresses, index => NOW_SECONDS - A_DAY - index);
    await POST(postRequest(submission({ nonce: 'fresh' })));
    const board = stored('snake');
    expect(board.recent).toEqual([{ h: ADDRESS_HASH, t: NOW_SECONDS, n: 'fresh' }]);
  });

  it('bounds `recent` above the daily cap, so pruning never evicts a countable write', async () => {
    seedTraffic('snake', MAX_RECENT, manyAddresses, index => NOW_SECONDS - index);
    // 400 live writes is past the 300/day cap, so this is refused rather than
    // written — which is the point: the cap bites before the bound does.
    const response = await POST(postRequest(submission({ nonce: 'fresh' })));
    expect(response.status).toBe(429);
  });
});

describe('POST idempotency', () => {
  it('treats a repeated nonce as a no-op and returns the current table', async () => {
    seedBoard('snake', [
      entry('AAA', 900, NOW_SECONDS - 10, 'nonce-1'),
      entry('BBB', 100, NOW_SECONDS - 5, 'other')
    ]);
    vi.mocked(put).mockClear();

    const response = await POST(postRequest(submission({ score: 4210 })));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      rank: 1,
      table: [
        { i: 'AAA', s: 900 },
        { i: 'BBB', s: 100 }
      ]
    });
    expect(vi.mocked(put)).not.toHaveBeenCalled();
  });
});

describe('POST conditional writes', () => {
  it('re-reads and merges when a rival write invalidates the ETag', async () => {
    seedBoard('snake', [entry('AAA', 900, NOW_SECONDS - 10, 'rival-0')], 'etag-first');
    blob.state.onRead = () => {
      seedBoard(
        'snake',
        [
          entry('AAA', 900, NOW_SECONDS - 10, 'rival-0'),
          entry('BBB', 800, NOW_SECONDS - 5, 'rival-1')
        ],
        'etag-second'
      );
    };

    const response = await POST(postRequest(submission({ score: 4210, nonce: 'mine' })));

    expect(response.status).toBe(200);
    expect(vi.mocked(get)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(put)).toHaveBeenCalledTimes(2);
    // The rival's entry survived, which only holds if the retry re-read.
    expect(stored('snake').top.map(e => e.n).sort()).toEqual(['mine', 'rival-0', 'rival-1']);
    expect(await response.json()).toMatchObject({ rank: 1 });
  });

  /*
   * Regression: this used to give up with a 503 and drop the player's score
   * entirely once every conditional attempt lost the ETag race. But Vercel
   * Blob documents up to sixty seconds for an overwrite to reach every
   * reader — far longer than this function's own retry budget — so a read
   * that keeps looking stale is at least as likely to be that propagation lag
   * as a genuine rival. The final attempt now writes unconditionally instead
   * of surrendering, on the same reasoning already applied to a board's first
   * write: the player's own score must land, even if the read it merged
   * against was not the very latest.
   */
  it('falls back to an unconditional write on the final attempt instead of giving up', async () => {
    let rival = 0;
    const interlope = () => {
      blob.state.onRead = interlope;
      seed('snake', {}, `etag-rival-${rival++}`);
    };
    seed('snake', {}, 'etag-first');
    blob.state.onRead = interlope;

    const response = await POST(postRequest(submission({ nonce: 'survives' })));

    expect(response.status).toBe(200);
    expect(vi.mocked(put)).toHaveBeenCalledTimes(3);
    // The final call is the one that actually lands, and it must not carry an
    // ETag: nothing here would ever match a store whose ETag changes on every read.
    expect(vi.mocked(put).mock.calls[2][2]).not.toHaveProperty('ifMatch');
    expect(stored('snake').top.map(e => e.n)).toEqual(['survives']);
  });

  /*
   * Regression: a real submission went missing in production this way. The
   * store answers "no board" both for a game that has never been played and
   * for a read that trails a blob created a moment earlier, and `put` has no
   * conditional-create to separate them. Taking absence at face value sends a
   * write with no ETag, which replaces the board instead of adding to it.
   */
  it('retries rather than overwriting when a read trails a just-created board', async () => {
    blob.state.onRead = () => {
      seedBoard('snake', [entry('AAA', 900, NOW_SECONDS - 5, 'rival-0')], 'etag-created');
    };

    const response = await POST(postRequest(submission({ score: 4210, nonce: 'mine' })));

    expect(response.status).toBe(200);
    // The rival survived, which only holds if the absent read was not believed.
    expect(stored('snake').top.map(e => e.n).sort()).toEqual(['mine', 'rival-0']);
    // Every write that landed was conditional, so none could have clobbered.
    const conditional = vi
      .mocked(put)
      .mock.calls.every(call => (call[2] as { ifMatch?: string }).ifMatch !== undefined);
    expect(conditional).toBe(true);
  });

  it('still creates the board when it is genuinely absent', async () => {
    const response = await POST(postRequest(submission({ score: 100, nonce: 'first' })));

    expect(response.status).toBe(200);
    expect(stored('snake').top.map(e => e.n)).toEqual(['first']);
    // Absence is only accepted once the retries have given storage time to settle.
    expect(vi.mocked(get)).toHaveBeenCalledTimes(3);
    expect(vi.mocked(put)).toHaveBeenCalledTimes(1);
  });
});

describe('POST rate limits', () => {
  it('rejects one write past the per-address hourly allowance', async () => {
    seedTraffic('snake', ADDRESS_LIMIT, sameAddress, index => NOW_SECONDS - 60 * index);
    const response = await POST(postRequest(submission({ nonce: 'past-the-cap' })));
    expect(response.status).toBe(429);
    expect(vi.mocked(put)).not.toHaveBeenCalled();
  });

  it('lets the same address back in once its writes age out of the hour', async () => {
    seedTraffic('snake', ADDRESS_LIMIT, sameAddress, index => NOW_SECONDS - AN_HOUR - index);
    const response = await POST(postRequest(submission({ nonce: 'later' })));
    expect(response.status).toBe(200);
  });

  it('does not count another address against the limit', async () => {
    seedTraffic('snake', ADDRESS_LIMIT, () => 'somebodyelse00', index => NOW_SECONDS - index);
    const response = await POST(postRequest(submission({ nonce: 'mine' })));
    expect(response.status).toBe(200);
  });

  it('freezes a board once the daily cap is reached', async () => {
    seedTraffic('snake', GAME_LIMIT, manyAddresses, index => NOW_SECONDS - 60 * index);
    const response = await POST(postRequest(submission({ nonce: 'past-the-cap' })));
    expect(response.status).toBe(429);
    expect(vi.mocked(put)).not.toHaveBeenCalled();
  });

  it('caps each board separately, so one flood cannot freeze the arcade', async () => {
    seedTraffic('snake', GAME_LIMIT, manyAddresses, index => NOW_SECONDS - 60 * index);
    const response = await POST(postRequest(submission({ game: 'cascade', nonce: 'elsewhere' })));
    expect(response.status).toBe(200);
  });

  it('lets a board thaw once its writes age past a day', async () => {
    seedTraffic('snake', GAME_LIMIT, manyAddresses, index => NOW_SECONDS - A_DAY - index);
    const response = await POST(postRequest(submission({ nonce: 'tomorrow' })));
    expect(response.status).toBe(200);
  });
});

describe('mergeTop', () => {
  /**
   * The board is maintained incrementally now: each accepted submission is
   * merged into a persisted top ten, rather than the whole table being
   * re-derived from a rolling history that the oldest entries fall out of.
   * Folding runs in arrival order must therefore give exactly what one sort of
   * the same runs would, ties included — the arcade rule keeps the OLDER entry
   * higher, so equal scores break on ascending timestamp.
   */
  const run = (i: string, s: number, t: number): BoardEntry => ({ i, s, t, n: `n-${i}` });
  const fold = (runs: BoardEntry[]): BoardEntry[] =>
    runs.reduce<BoardEntry[]>((top, entry) => mergeTop(top, entry), []);

  it('orders by score and keeps the earlier submission above a tie', () => {
    const runs = [
      run('AAA', 100, 1),
      run('BBB', 300, 2),
      run('CCC', 300, 3), // ties BBB, arrived later
      run('DDD', 250, 4),
      run('EEE', 300, 5), // ties BBB/CCC too
      run('FFF', 50, 6),
      run('GGG', 400, 7),
      run('HHH', 250, 8) // ties DDD, arrived later
    ];
    expect(fold(runs).map(e => e.i)).toEqual([
      'GGG',
      'BBB',
      'CCC',
      'EEE',
      'DDD',
      'HHH',
      'AAA',
      'FFF'
    ]);
  });

  /**
   * Server timestamps have one-second resolution, so two submissions
   * contending for the same board routinely share a `t`. That is precisely
   * when the arcade rule matters and the sort has no timestamp left to
   * separate them, so it falls back to arrival order: the incoming entry is
   * appended before a stable sort, which leaves the one already on the board
   * above it.
   */
  it('keeps the earlier of two same-second, same-score entries higher', () => {
    const sameSecond = [run('ERL', 5000, 1785000000), run('LTE', 5000, 1785000000)];
    expect(fold(sameSecond).map(e => e.i)).toEqual(['ERL', 'LTE']);
  });

  it('caps the board at ten, dropping the weakest entry', () => {
    const full = fold(Array.from({ length: 10 }, (_, i) => run(`E${i}`, (10 - i) * 100, i + 1)));
    const merged = mergeTop(full, run('NEW', 950, 11));
    expect(merged).toHaveLength(10);
    expect(merged.map(e => e.i)[1]).toBe('NEW');
    expect(merged.some(e => e.s === 100)).toBe(false);
  });

  it('leaves the board it merges into untouched', () => {
    const board = [run('AAA', 300, 1)];
    const snapshot = board.map(e => ({ ...e }));
    mergeTop(board, run('BBB', 400, 2));
    expect(board).toEqual(snapshot);
  });

  /**
   * Rows written before the top ten was persisted carry no timestamp, and
   * `normalizeBoard` defaults them to 0. They are genuinely the oldest scores
   * the board holds, so ranking them as such is the right outcome rather than
   * a quirk to work around.
   */
  it('ranks a pre-upgrade row with no timestamp above a later tie', () => {
    const legacy: BoardEntry = { i: 'OLD', s: 500, t: 0, n: '' };
    expect(mergeTop([legacy], run('NEW', 500, 1785000000)).map(e => e.i)).toEqual(['OLD', 'NEW']);
  });

  it('publishes only the initials and score, never the timestamp or nonce', () => {
    expect(publish([run('IMR', 420, 99)])).toEqual([{ i: 'IMR', s: 420 }]);
  });
});

/*
 * `qualifies` on the client measures a finished run against this board to
 * decide whether to interrupt the player for initials, using its own
 * `MAX_ENTRIES`. Before the per-device table was retired the two described
 * different boards and could drift freely; they describe the same one now, and
 * raising only `MAX_TOP` would silently stop the panel prompting for runs that
 * chart. Importing across the seam would pull server code into the browser
 * bundle, so the constants stay separate and this holds them together.
 */
describe('client and server board sizes', () => {
  it('keeps MAX_TOP and the client MAX_ENTRIES in step', () => {
    expect(MAX_TOP).toBe(MAX_ENTRIES);
  });

  /*
   * Same seam, same reason. The client checks the ceiling before it POSTs so
   * an out-of-range run is told it is off the scale rather than being handed
   * this endpoint's 400 as "not saved, try again later" (issue #271). Lowering
   * only one of the two would put a whole band of scores back on the wrong
   * message.
   */
  it('keeps MAX_SCORE in step with the client copy', () => {
    expect(MAX_SCORE).toBe(CLIENT_MAX_SCORE);
  });
});
