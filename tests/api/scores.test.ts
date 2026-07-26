import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { get, put } from '@vercel/blob';
import { GAMES, rankTop, GET, POST, OPTIONS, type HistoryEntry } from '../../api/scores';

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
  top: { i: string; s: number }[];
  all: HistoryEntry[];
  recent: { h: string; t: number }[];
}

const entry = (i: string, s: number, t: number, n: string): HistoryEntry => ({ i, s, t, n });

function seed(gameId: string, board: Partial<StoredBoard>, etag = `etag-${gameId}`): void {
  const full: StoredBoard = { top: [], all: [], recent: [], ...board };
  blob.store.set(`scores/${gameId}.json`, { json: JSON.stringify(full), etag });
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

describe('rankTop', () => {
  it('sorts by score descending', () => {
    const all = [entry('AAA', 10, 1, 'a'), entry('BBB', 30, 2, 'b'), entry('CCC', 20, 3, 'c')];
    expect(rankTop(all)).toEqual([
      { i: 'BBB', s: 30 },
      { i: 'CCC', s: 20 },
      { i: 'AAA', s: 10 }
    ]);
  });

  it('breaks ties by timestamp ascending, so the older entry stays higher', () => {
    const all = [entry('NEW', 100, 500, 'a'), entry('OLD', 100, 100, 'b'), entry('MID', 100, 300, 'c')];
    expect(rankTop(all).map(e => e.i)).toEqual(['OLD', 'MID', 'NEW']);
  });

  it('caps the table at ten and drops timestamps and nonces', () => {
    const all = Array.from({ length: 25 }, (_, index) => entry('AAA', index + 1, index, `n${index}`));
    const table = rankTop(all);
    expect(table).toHaveLength(10);
    expect(table[0]).toEqual({ i: 'AAA', s: 25 });
    expect(Object.keys(table[0])).toEqual(['i', 's']);
  });

  it('does not mutate the history it was given', () => {
    const all = [entry('AAA', 10, 1, 'a'), entry('BBB', 30, 2, 'b')];
    rankTop(all);
    expect(all.map(e => e.i)).toEqual(['AAA', 'BBB']);
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

  it('derives each table from the stored history rather than trusting `top`', async () => {
    seed('snake', {
      top: [{ i: 'HAX', s: 999999 }],
      all: [entry('AAA', 100, 1, 'a'), entry('BBB', 300, 2, 'b')]
    });
    const body = (await (await GET(getRequest())).json()) as Record<string, unknown[]>;
    expect(body.snake).toEqual([
      { i: 'BBB', s: 300 },
      { i: 'AAA', s: 100 }
    ]);
  });

  it('sets the agreed Cache-Control header', async () => {
    const response = await GET(getRequest());
    expect(response.headers.get('cache-control')).toBe('public, max-age=30');
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
    expect(stored('snake').all).toHaveLength(1);
  });

  it('reports the global rank, and 0 when the score misses the top ten', async () => {
    seed('snake', {
      all: Array.from({ length: 12 }, (_, index) => entry('AAA', 1000 + index, index, `seed-${index}`))
    });

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
    expect(stored('snake').all[0]).toEqual({ i: 'IMR', s: 4210, t: NOW_SECONDS, n: 'nonce-1' });
  });

  it('stores the address as a salted hash, never in the clear', async () => {
    await POST(postRequest(submission()));
    const [recent] = stored('snake').recent;
    expect(recent).toEqual({ h: ADDRESS_HASH, t: NOW_SECONDS });
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

  it('keeps `all` at the 500 newest', async () => {
    seed('snake', {
      all: Array.from({ length: 500 }, (_, index) =>
        entry('OLD', 100 + index, NOW_SECONDS - A_DAY - index, `old-${index}`)
      )
    });
    await POST(postRequest(submission({ nonce: 'fresh' })));
    const board = stored('snake');
    expect(board.all).toHaveLength(500);
    expect(board.all[0].n).toBe('fresh');
    expect(board.all.some(e => e.n === 'old-499')).toBe(false);
  });

  it('keeps `recent` at the 50 newest', async () => {
    seed('snake', {
      recent: Array.from({ length: 50 }, (_, index) => ({
        h: `hash-${index}`,
        t: NOW_SECONDS - AN_HOUR - index
      }))
    });
    await POST(postRequest(submission({ nonce: 'fresh' })));
    const board = stored('snake');
    expect(board.recent).toHaveLength(50);
    expect(board.recent[0]).toEqual({ h: ADDRESS_HASH, t: NOW_SECONDS });
    expect(board.recent.some(r => r.h === 'hash-49')).toBe(false);
  });
});

describe('POST idempotency', () => {
  it('treats a repeated nonce as a no-op and returns the current table', async () => {
    seed('snake', {
      all: [
        entry('AAA', 900, NOW_SECONDS - 10, 'nonce-1'),
        entry('BBB', 100, NOW_SECONDS - 5, 'other')
      ]
    });
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
    seed('snake', { all: [entry('AAA', 900, NOW_SECONDS - 10, 'rival-0')] }, 'etag-first');
    blob.state.onRead = () => {
      seed(
        'snake',
        {
          all: [
            entry('BBB', 800, NOW_SECONDS - 5, 'rival-1'),
            entry('AAA', 900, NOW_SECONDS - 10, 'rival-0')
          ]
        },
        'etag-second'
      );
    };

    const response = await POST(postRequest(submission({ score: 4210, nonce: 'mine' })));

    expect(response.status).toBe(200);
    expect(vi.mocked(get)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(put)).toHaveBeenCalledTimes(2);
    // The rival's entry survived, which only holds if the retry re-read.
    expect(stored('snake').all.map(e => e.n).sort()).toEqual(['mine', 'rival-0', 'rival-1']);
    expect(await response.json()).toMatchObject({ rank: 1 });
  });

  it('gives up with a 503 rather than retrying forever', async () => {
    let rival = 0;
    const interlope = () => {
      blob.state.onRead = interlope;
      seed('snake', { all: [] }, `etag-rival-${rival++}`);
    };
    seed('snake', { all: [] }, 'etag-first');
    blob.state.onRead = interlope;

    const response = await POST(postRequest(submission({ nonce: 'doomed' })));
    expect(response.status).toBe(503);
    expect(vi.mocked(put)).toHaveBeenCalledTimes(3);
  });
});

describe('POST rate limits', () => {
  it('rejects a sixth write from the same address within the hour', async () => {
    seed('snake', {
      recent: Array.from({ length: 5 }, (_, index) => ({
        h: ADDRESS_HASH,
        t: NOW_SECONDS - 60 * index
      }))
    });
    const response = await POST(postRequest(submission({ nonce: 'sixth' })));
    expect(response.status).toBe(429);
    expect(vi.mocked(put)).not.toHaveBeenCalled();
  });

  it('lets the same address back in once its writes age out of the hour', async () => {
    seed('snake', {
      recent: Array.from({ length: 5 }, (_, index) => ({
        h: ADDRESS_HASH,
        t: NOW_SECONDS - AN_HOUR - index
      }))
    });
    const response = await POST(postRequest(submission({ nonce: 'later' })));
    expect(response.status).toBe(200);
  });

  it('does not count another address against the limit', async () => {
    seed('snake', {
      recent: Array.from({ length: 5 }, (_, index) => ({
        h: 'somebodyelse00',
        t: NOW_SECONDS - index
      }))
    });
    const response = await POST(postRequest(submission({ nonce: 'mine' })));
    expect(response.status).toBe(200);
  });

  it('freezes a board after thirty writes in twenty-four hours', async () => {
    seed('snake', {
      all: Array.from({ length: 30 }, (_, index) =>
        entry('AAA', 100, NOW_SECONDS - 60 * index, `flood-${index}`)
      )
    });
    const response = await POST(postRequest(submission({ nonce: 'thirty-first' })));
    expect(response.status).toBe(429);
    expect(vi.mocked(put)).not.toHaveBeenCalled();
  });

  it('caps each board separately, so one flood cannot freeze the arcade', async () => {
    seed('snake', {
      all: Array.from({ length: 30 }, (_, index) =>
        entry('AAA', 100, NOW_SECONDS - 60 * index, `flood-${index}`)
      )
    });
    const response = await POST(postRequest(submission({ game: 'cascade', nonce: 'elsewhere' })));
    expect(response.status).toBe(200);
  });

  it('lets a board thaw once its writes age past a day', async () => {
    seed('snake', {
      all: Array.from({ length: 30 }, (_, index) =>
        entry('AAA', 100, NOW_SECONDS - A_DAY - index, `flood-${index}`)
      )
    });
    const response = await POST(postRequest(submission({ nonce: 'tomorrow' })));
    expect(response.status).toBe(200);
  });
});
