import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  fetchGlobal,
  submitGlobal,
  MAX_SCORE,
  SCORES_ENDPOINT
} from '../../src/games/engine/globalScores';

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
  it('reports a skipped submission without calling fetch on localhost', async () => {
    stubLocation('localhost');
    const fetchMock = stubFetchOk({});
    const result = await submitGlobal('snake', 'ISM', 300);
    // Distinct from 'failed': nothing was offered, so nothing was refused, and
    // the panel must not tell a local player their score was lost.
    expect(result).toEqual({ status: 'skipped' });
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
    expect(result).toEqual({
      status: 'ok',
      rank: 4,
      table: [{ initials: 'ISM', score: 300 }]
    });
  });

  it('returns rank 0 when the response omits or malforms rank', async () => {
    stubLocation('ismaelmartinez.me.uk');
    stubFetchOk({ table: [] });
    expect(await submitGlobal('snake', 'ISM', 300)).toMatchObject({ status: 'ok', rank: 0 });

    stubLocation('ismaelmartinez.me.uk');
    stubFetchOk({ rank: 'first', table: [] });
    expect(await submitGlobal('snake', 'ISM', 300)).toMatchObject({ status: 'ok', rank: 0 });

    stubLocation('ismaelmartinez.me.uk');
    stubFetchOk({ rank: NaN, table: [] });
    expect(await submitGlobal('snake', 'ISM', 300)).toMatchObject({ status: 'ok', rank: 0 });
  });

  it('reports a refusal as failed, which the panel does tell the player about', async () => {
    stubLocation('ismaelmartinez.me.uk');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    expect(await submitGlobal('snake', 'ISM', 300)).toEqual({ status: 'failed' });
  });

  it('reports a network rejection as failed rather than throwing', async () => {
    stubLocation('ismaelmartinez.me.uk');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await expect(submitGlobal('snake', 'ISM', 300)).resolves.toEqual({ status: 'failed' });
  });

  /*
   * A marathon run past the API's ceiling is refused for good, and relaying
   * that as `failed` told the player to try again later — advice that can only
   * cost them another hour (issue #271). Caught before the POST so no doomed
   * write goes out, and so the message does not depend on which of the API's
   * several 400s came back.
   */
  it('reports an out-of-range score as its own permanent refusal', async () => {
    stubLocation('ismaelmartinez.me.uk');
    const fetchMock = stubFetchOk({ rank: 1, table: [] });
    expect(await submitGlobal('cascade', 'ISM', MAX_SCORE)).toEqual({ status: 'range' });
    expect(await submitGlobal('cascade', 'ISM', MAX_SCORE + 1)).toEqual({ status: 'range' });
    expect(fetchMock).not.toHaveBeenCalled();

    // One under the ceiling is an ordinary submission.
    expect(await submitGlobal('cascade', 'ISM', MAX_SCORE - 1)).toMatchObject({ status: 'ok' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
