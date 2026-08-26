import { describe, it, expect, vi } from 'vitest';
import { createRunRecord, worldNoteText } from '../../src/games/engine/scoreboard';

const TEXT = {
  loading: 'Loading...',
  unavailable: 'World scores unavailable',
  rank: 'World rank #{rank}',
  notSaved: 'Score not saved. Try again later',
  rateLimited: 'Too many scores submitted. Try again later',
  outOfRange: 'Score is off the scale. The board cannot hold it'
};

const state = (over: Partial<Parameters<typeof worldNoteText>[0]> = {}) => ({
  loaded: false,
  pending: false,
  rank: 0,
  count: 0,
  failed: false,
  rateLimited: false,
  outOfRange: false,
  ...over
});

describe('worldNoteText', () => {
  it('shows the loading text while a first fetch is in flight', () => {
    expect(worldNoteText(state({ pending: true }), TEXT)).toBe('Loading...');
  });

  it('shows unavailable when no board loaded and nothing is pending', () => {
    expect(worldNoteText(state(), TEXT)).toBe(
      'World scores unavailable'
    );
  });

  it('shows nothing for a loaded board the run did not chart on', () => {
    expect(worldNoteText(state({ loaded: true, count: 5 }), TEXT)).toBe('');
  });

  it('shows the placed rank when it points at a real row', () => {
    expect(worldNoteText(state({ loaded: true, rank: 2, count: 5 }), TEXT)).toBe('World rank #2');
  });

  // Regression: a submission sets the rank alongside the board it charted on,
  // then loadWorld() swaps in a stale CDN read whose table is empty while the
  // rank stays put. The note must not claim "World rank #1" over a board that
  // simultaneously reads "No scores yet".
  it('hides a rank that no longer indexes a row on the board being shown', () => {
    expect(worldNoteText(state({ loaded: true, rank: 1 }), TEXT)).toBe('');
    expect(worldNoteText(state({ loaded: true, rank: 4, count: 3 }), TEXT)).toBe('');
  });

  /*
   * With no per-device table behind it, a score that does not reach the shared
   * board leaves no trace at all, so the panel has to say so. The notice
   * outranks every other state: it is the only line here a player can act on.
   */
  it('reports a failed save ahead of anything else the board might say', () => {
    expect(worldNoteText(state({ failed: true }), TEXT)).toBe('Score not saved. Try again later');
    expect(worldNoteText(state({ failed: true, pending: true }), TEXT)).toBe(
      'Score not saved. Try again later'
    );
    expect(worldNoteText(state({ failed: true, loaded: true, rank: 1, count: 3 }), TEXT)).toBe(
      'Score not saved. Try again later'
    );
  });

  /*
   * A rate limit means "try again later", not "something is broken" — a
   * grinding session can hit the API's hourly submission cap well before ten
   * distinct scores have charted. It gets its own copy rather than sharing
   * `notSaved`'s, and outranks it the same way `failed` outranks everything
   * else on this line.
   */
  it('reports a rate-limited save ahead of a generic failure and everything else', () => {
    expect(worldNoteText(state({ rateLimited: true }), TEXT)).toBe(
      'Too many scores submitted. Try again later'
    );
    expect(worldNoteText(state({ rateLimited: true, failed: true }), TEXT)).toBe(
      'Too many scores submitted. Try again later'
    );
    expect(worldNoteText(state({ rateLimited: true, loaded: true, rank: 1, count: 3 }), TEXT)).toBe(
      'Too many scores submitted. Try again later'
    );
  });

  /*
   * The API refuses a score past its ceiling for good, so this one outranks
   * even the rate limit: "try again later" would send a player to replay an
   * hour-long run that can never land (issue #271).
   */
  it('reports an out-of-range score ahead of every other notice', () => {
    expect(worldNoteText(state({ outOfRange: true }), TEXT)).toBe(
      'Score is off the scale. The board cannot hold it'
    );
    expect(worldNoteText(state({ outOfRange: true, rateLimited: true, failed: true }), TEXT)).toBe(
      'Score is off the scale. The board cannot hold it'
    );
    expect(worldNoteText(state({ outOfRange: true, loaded: true, rank: 1, count: 3 }), TEXT)).toBe(
      'Score is off the scale. The board cannot hold it'
    );
  });
});

describe('createRunRecord', () => {
  it('seeds best() from the initial table best', () => {
    const record = createRunRecord(120, () => {});
    expect(record.best()).toBe(120);
  });

  it('folds banked scores into best()', () => {
    const record = createRunRecord(50, () => {});
    record.beginRun();
    expect(record.bank(30).best).toBe(50);
    expect(record.bank(80).best).toBe(80);
    expect(record.best()).toBe(80);
  });

  it('fires newRecord exactly once per run', () => {
    const record = createRunRecord(100, () => {});
    record.beginRun();
    expect(record.bank(90).newRecord).toBe(false);
    expect(record.bank(101).newRecord).toBe(true);
    expect(record.bank(150).newRecord).toBe(false);
    expect(record.bank(200).newRecord).toBe(false);
  });

  it('never fires newRecord for a run starting at a zero baseline', () => {
    const record = createRunRecord(0, () => {});
    record.beginRun();
    expect(record.bank(500).newRecord).toBe(false);
    expect(record.best()).toBe(500);
  });

  it('re-arms the celebration on beginRun, against the new baseline', () => {
    const record = createRunRecord(100, () => {});
    record.beginRun();
    expect(record.bank(150).newRecord).toBe(true);
    record.beginRun();
    // The new baseline is 150 — the last run's best, not the seed.
    expect(record.bank(140).newRecord).toBe(false);
    expect(record.bank(160).newRecord).toBe(true);
  });

  it('never celebrates before the first beginRun', () => {
    const record = createRunRecord(100, () => {});
    expect(record.bank(999).newRecord).toBe(false);
  });

  /*
   * `newRecord` is spent by the toast that fires when the record lands;
   * `beaten` is what the game-over panel reads, so it has to survive the rest
   * of the run — including a run whose score falls back under the baseline.
   */
  it('keeps beaten() true for the rest of the run, and re-arms it per run', () => {
    const record = createRunRecord(100, () => {});
    expect(record.beaten()).toBe(false);
    record.beginRun();
    record.bank(150);
    expect(record.beaten()).toBe(true);
    record.bank(120);
    expect(record.beaten()).toBe(true);
    record.beginRun();
    expect(record.beaten()).toBe(false);
    record.bank(140); // under the 150 this run starts from
    expect(record.beaten()).toBe(false);
  });

  it('stashes only when the persisted best actually moves', () => {
    const stash = vi.fn();
    const record = createRunRecord(100, stash);
    record.beginRun();
    record.bank(0); // score 0 never stashes (it can't chart)
    record.bank(90); // below the stored best: writing it would be a no-op
    expect(stash).not.toHaveBeenCalled();
    record.bank(110);
    record.bank(110);
    record.bank(105);
    record.bank(120);
    expect(stash.mock.calls.map(([s]) => s)).toEqual([110, 120]);
  });

  /*
   * The persisted best is a maximum, so a later run scoring under it has
   * nothing to persist. The gate is the best itself rather than a per-run
   * high-water mark, which means no storage round trip is spent discovering
   * that a write would have changed nothing.
   */
  it('does not stash a new run whose score is under the standing best', () => {
    const stash = vi.fn();
    const record = createRunRecord(0, stash);
    record.beginRun();
    record.bank(30);
    record.beginRun();
    record.bank(10);
    expect(stash.mock.calls.map(([s]) => s)).toEqual([30]);
    // The record still reports the standing best, untouched by the lesser run.
    expect(record.best()).toBe(30);
  });
});
