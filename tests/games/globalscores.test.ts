import { describe, it, expect, afterEach, vi } from 'vitest';
import { fetchGlobal, submitGlobal, SCORES_ENDPOINT } from '../../src/games/engine/globalScores';
import { insertScore } from '../../src/games/engine/highscores';
import { rankTop, type HistoryEntry } from '../../api/scores';

function stubFetchOk(body: unknown): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(body)
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function stubLocation(hostname: string): void {
  vi.stubGlobal('location', { hostname });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchGlobal', () => {
  it('maps the compact wire shape to the engine ScoreEntry shape', async () => {
    stubFetchOk({ snake: [{ i: 'ISM', s: 300 }, { i: 'AAA', s: 100 }] });
    const boards = await fetchGlobal();
    expect(boards).toEqual({
      snake: [{ initials: 'ISM', score: 300 }, { initials: 'AAA', score: 100 }]
    });
  });

  it('requests SCORES_ENDPOINT and passes an abort signal', async () => {
    const fetchMock = stubFetchOk({});
    await fetchGlobal();
    expect(fetchMock).toHaveBeenCalledWith(
      SCORES_ENDPOINT,
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it('resolves null on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    expect(await fetchGlobal()).toBeNull();
  });

  it('resolves null on a network rejection rather than throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await expect(fetchGlobal()).resolves.toBeNull();
  });

  it('resolves null when the body is not valid JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.reject(new SyntaxError('bad json'))
    }));
    expect(await fetchGlobal()).toBeNull();
  });

  it('resolves null when the JSON body is not an object', async () => {
    stubFetchOk('not an object');
    expect(await fetchGlobal()).toBeNull();

    stubFetchOk(null);
    expect(await fetchGlobal()).toBeNull();

    stubFetchOk(42);
    expect(await fetchGlobal()).toBeNull();
  });

  it('drops malformed entries inside an otherwise valid board', async () => {
    stubFetchOk({
      snake: [
        { i: 'ISM', s: 300 },
        { i: 5, s: 200 }, // initials not a string
        { i: 'BBB', s: 'nope' }, // score not a number
        { i: 'CCC', s: NaN }, // score not finite
        null,
        'garbage',
        { i: 'DDD' } // missing score
      ]
    });
    const boards = await fetchGlobal();
    expect(boards).toEqual({ snake: [{ initials: 'ISM', score: 300 }] });
  });

  it('never throws, whatever the response shape', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(undefined)
    }));
    await expect(fetchGlobal()).resolves.not.toThrow();
  });
});

describe('submitGlobal production-host guard', () => {
  it('returns null without calling fetch on localhost', async () => {
    stubLocation('localhost');
    const fetchMock = stubFetchOk({});
    const result = await submitGlobal('snake', 'ISM', 300);
    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('allows the apex production host', async () => {
    stubLocation('ismaelmartinez.me.uk');
    const fetchMock = stubFetchOk({ rank: 1, table: [] });
    await submitGlobal('snake', 'ISM', 300);
    expect(fetchMock).toHaveBeenCalled();
  });

  it('allows the Vercel production host', async () => {
    stubLocation('ismaelmartinezmeuk.vercel.app');
    const fetchMock = stubFetchOk({ rank: 1, table: [] });
    await submitGlobal('snake', 'ISM', 300);
    expect(fetchMock).toHaveBeenCalled();
  });
});

describe('submitGlobal request shape', () => {
  it('POSTs with the CORS-safelisted content type and keepalive set', async () => {
    stubLocation('ismaelmartinez.me.uk');
    const fetchMock = stubFetchOk({ rank: 1, table: [] });
    await submitGlobal('snake', 'ISM', 300);
    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'Content-Type': 'text/plain' });
    expect(init.keepalive).toBe(true);
  });

  it('sends game, initials, score and a nonce that differs between calls', async () => {
    stubLocation('ismaelmartinez.me.uk');
    const fetchMock = stubFetchOk({ rank: 1, table: [] });
    await submitGlobal('snake', 'ISM', 300);
    await submitGlobal('snake', 'ISM', 300);

    const firstBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    const secondBody = JSON.parse(fetchMock.mock.calls[1][1].body);

    expect(firstBody).toMatchObject({ game: 'snake', initials: 'ISM', score: 300 });
    expect(typeof firstBody.nonce).toBe('string');
    expect(firstBody.nonce).not.toBe(secondBody.nonce);
  });

  it('returns rank and table mapped from the wire shape', async () => {
    stubLocation('ismaelmartinez.me.uk');
    stubFetchOk({ rank: 4, table: [{ i: 'ISM', s: 300 }] });
    const result = await submitGlobal('snake', 'ISM', 300);
    expect(result).toEqual({ rank: 4, table: [{ initials: 'ISM', score: 300 }] });
  });

  it('returns rank 0 when the response omits or malforms rank', async () => {
    stubLocation('ismaelmartinez.me.uk');
    stubFetchOk({ table: [] });
    expect((await submitGlobal('snake', 'ISM', 300))?.rank).toBe(0);

    stubLocation('ismaelmartinez.me.uk');
    stubFetchOk({ rank: 'first', table: [] });
    expect((await submitGlobal('snake', 'ISM', 300))?.rank).toBe(0);

    stubLocation('ismaelmartinez.me.uk');
    stubFetchOk({ rank: NaN, table: [] });
    expect((await submitGlobal('snake', 'ISM', 300))?.rank).toBe(0);
  });

  it('resolves null on a non-ok response', async () => {
    stubLocation('ismaelmartinez.me.uk');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    expect(await submitGlobal('snake', 'ISM', 300)).toBeNull();
  });

  it('resolves null on a network rejection rather than throwing', async () => {
    stubLocation('ismaelmartinez.me.uk');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await expect(submitGlobal('snake', 'ISM', 300)).resolves.toBeNull();
  });
});

describe('device table vs server rankTop agreement', () => {
  /**
   * The device tables (highscores.ts) and the server (api/scores.ts) compute
   * top ten independently: one by folding `insertScore` calls as runs land in
   * real time, the other by sorting a flat history array after the fact. They
   * must produce the same order for the same data, or a game's own-device
   * panel and the global panel would disagree about who is really ahead.
   * Ties are the case where the two approaches could diverge: insertScore's
   * documented rule keeps the OLDER entry higher, so rankTop must break ties
   * by ascending timestamp to match.
   */
  it('orders identically to repeated insertScore for a run history with ties', () => {
    // t is chronological submission order; several scores tie so the
    // "older entry wins the tie" rule is actually exercised both ways.
    const runs = [
      { initials: 'AAA', score: 100, t: 1 },
      { initials: 'BBB', score: 300, t: 2 },
      { initials: 'CCC', score: 300, t: 3 }, // ties BBB, arrived later
      { initials: 'DDD', score: 250, t: 4 },
      { initials: 'EEE', score: 300, t: 5 }, // ties BBB/CCC too
      { initials: 'FFF', score: 50, t: 6 },
      { initials: 'GGG', score: 400, t: 7 },
      { initials: 'HHH', score: 250, t: 8 }, // ties DDD, arrived later
      { initials: 'III', score: 10, t: 9 },
      { initials: 'JJJ', score: 20, t: 10 },
      { initials: 'KKK', score: 500, t: 11 }, // pushes an existing entry off a full table
      { initials: 'LLL', score: 30, t: 12 }
    ];

    let deviceTable: { initials: string; score: number }[] = [];
    for (const run of runs) {
      deviceTable = insertScore(deviceTable, run.initials, run.score).table;
    }

    const history: HistoryEntry[] = runs.map(run => ({
      i: run.initials,
      s: run.score,
      t: run.t,
      n: `nonce-${run.t}`
    }));
    const serverTop = rankTop(history);

    expect(serverTop.map(e => ({ i: e.i, s: e.s }))).toEqual(
      deviceTable.map(e => ({ i: e.initials, s: e.score }))
    );
  });

  /**
   * Server timestamps have one-second resolution, so two submissions that
   * contend for the same board routinely share a `t`. That is precisely when
   * the arcade rule matters and the sort has no timestamp left to separate
   * them, so it falls back to storage order. The server stores `all`
   * newest-first, which is how this history is built here: sorting it without
   * accounting for that direction would put the LATER submitter on top, the
   * exact inverse of what the device table shows for the same two scores.
   */
  it('keeps the earlier of two same-second, same-score entries higher', () => {
    const newestFirst: HistoryEntry[] = [
      { i: 'LTE', s: 5000, t: 1785000000, n: 'n-late' },
      { i: 'ERL', s: 5000, t: 1785000000, n: 'n-early' }
    ];

    expect(rankTop(newestFirst).map(e => e.i)).toEqual(['ERL', 'LTE']);

    // And the device table, folded in the same chronological order, agrees.
    let deviceTable: { initials: string; score: number }[] = [];
    for (const initials of ['ERL', 'LTE']) {
      deviceTable = insertScore(deviceTable, initials, 5000).table;
    }
    expect(deviceTable.map(e => e.initials)).toEqual(['ERL', 'LTE']);
  });

  it('sorts descending by score, ascending by t within a tie, capped at 10, without mutating input', () => {
    const history: HistoryEntry[] = [
      { i: 'A', s: 100, t: 5, n: 'n1' },
      { i: 'B', s: 100, t: 2, n: 'n2' }, // same score, earlier t: should rank above A
      { i: 'C', s: 300, t: 9, n: 'n3' },
      { i: 'D', s: 50, t: 1, n: 'n4' },
      { i: 'E', s: 200, t: 4, n: 'n5' },
      { i: 'F', s: 90, t: 3, n: 'n6' },
      { i: 'G', s: 80, t: 6, n: 'n7' },
      { i: 'H', s: 70, t: 7, n: 'n8' },
      { i: 'I', s: 60, t: 8, n: 'n9' },
      { i: 'J', s: 40, t: 10, n: 'n10' },
      { i: 'K', s: 30, t: 11, n: 'n11' } // 11th entry, must be capped out
    ];
    const original = history.map(e => ({ ...e }));

    const result = rankTop(history);

    expect(result).toEqual([
      { i: 'C', s: 300 },
      { i: 'E', s: 200 },
      { i: 'B', s: 100 },
      { i: 'A', s: 100 },
      { i: 'F', s: 90 },
      { i: 'G', s: 80 },
      { i: 'H', s: 70 },
      { i: 'I', s: 60 },
      { i: 'D', s: 50 },
      { i: 'J', s: 40 }
    ]);
    expect(result).toHaveLength(10);
    expect(history).toEqual(original); // rankTop must not mutate its input
  });
});
