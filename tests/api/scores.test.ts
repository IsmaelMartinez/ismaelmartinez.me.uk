import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { get, put } from '@vercel/blob';
import {
  GAMES,
  normalizeBoard,
  GET,
  POST,
  OPTIONS,
  type BoardEntry,
  type RecentEntry
} from '../../api/scores';

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
const ADDRESS = '203.0.113.5';

/** What the handler derives for the test address, so the salt stays its own business. */
const ADDRESS_HASH = createHash('sha256')
  .update(`${TOKEN}${ADDRESS}`)
  .digest('hex')
  .slice(0, 16);

interface StoredBoard {
  top: BoardEntry[];
  recent: RecentEntry[];
}

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
    seed('snake', {
      recent: Array.from({ length: 40 }, (_, index) => ({
        h: `hash-${index}`,
        t: NOW_SECONDS - A_DAY - index,
        n: `old-${index}`
      }))
    });
    await POST(postRequest(submission({ nonce: 'fresh' })));
    const board = stored('snake');
    expect(board.recent).toEqual([{ h: ADDRESS_HASH, t: NOW_SECONDS, n: 'fresh' }]);
  });

  it('bounds `recent` above the daily cap, so pruning never evicts a countable write', async () => {
    seed('snake', {
      recent: Array.from({ length: 400 }, (_, index) => ({
        h: `hash-${index}`,
        t: NOW_SECONDS - index,
        n: `live-${index}`
      }))
    });
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

  it('gives up with a 503 rather than retrying forever', async () => {
    let rival = 0;
    const interlope = () => {
      blob.state.onRead = interlope;
      seed('snake', {}, `etag-rival-${rival++}`);
    };
    seed('snake', {}, 'etag-first');
    blob.state.onRead = interlope;

    const response = await POST(postRequest(submission({ nonce: 'doomed' })));
    expect(response.status).toBe(503);
    expect(vi.mocked(put)).toHaveBeenCalledTimes(3);
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
  it('rejects a twenty-first write from the same address within the hour', async () => {
    seed('snake', {
      recent: Array.from({ length: 20 }, (_, index) => ({
        h: ADDRESS_HASH,
        t: NOW_SECONDS - 60 * index,
        n: `mine-${index}`
      }))
    });
    const response = await POST(postRequest(submission({ nonce: 'twenty-first' })));
    expect(response.status).toBe(429);
    expect(vi.mocked(put)).not.toHaveBeenCalled();
  });

  it('lets the same address back in once its writes age out of the hour', async () => {
    seed('snake', {
      recent: Array.from({ length: 20 }, (_, index) => ({
        h: ADDRESS_HASH,
        t: NOW_SECONDS - AN_HOUR - index,
        n: `mine-${index}`
      }))
    });
    const response = await POST(postRequest(submission({ nonce: 'later' })));
    expect(response.status).toBe(200);
  });

  it('does not count another address against the limit', async () => {
    seed('snake', {
      recent: Array.from({ length: 20 }, (_, index) => ({
        h: 'somebodyelse00',
        t: NOW_SECONDS - index,
        n: `theirs-${index}`
      }))
    });
    const response = await POST(postRequest(submission({ nonce: 'mine' })));
    expect(response.status).toBe(200);
  });

  it('freezes a board after three hundred writes in twenty-four hours', async () => {
    seed('snake', {
      recent: Array.from({ length: 300 }, (_, index) => ({
        h: `flooder-${index}`,
        t: NOW_SECONDS - 60 * index,
        n: `flood-${index}`
      }))
    });
    const response = await POST(postRequest(submission({ nonce: 'three-hundred-and-first' })));
    expect(response.status).toBe(429);
    expect(vi.mocked(put)).not.toHaveBeenCalled();
  });

  it('caps each board separately, so one flood cannot freeze the arcade', async () => {
    seed('snake', {
      recent: Array.from({ length: 300 }, (_, index) => ({
        h: `flooder-${index}`,
        t: NOW_SECONDS - 60 * index,
        n: `flood-${index}`
      }))
    });
    const response = await POST(postRequest(submission({ game: 'cascade', nonce: 'elsewhere' })));
    expect(response.status).toBe(200);
  });

  it('lets a board thaw once its writes age past a day', async () => {
    seed('snake', {
      recent: Array.from({ length: 300 }, (_, index) => ({
        h: `flooder-${index}`,
        t: NOW_SECONDS - A_DAY - index,
        n: `flood-${index}`
      }))
    });
    const response = await POST(postRequest(submission({ nonce: 'tomorrow' })));
    expect(response.status).toBe(200);
  });
});
