import { describe, it, expect, vi } from 'vitest';
import { createRunRecord } from '../../src/games/engine/scoreboard';

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

  it('stashes only when the run best grows', () => {
    const stash = vi.fn();
    const record = createRunRecord(100, stash);
    record.beginRun();
    record.bank(0); // score 0 never stashes (it can't chart)
    expect(stash).not.toHaveBeenCalled();
    record.bank(10);
    record.bank(10);
    record.bank(5);
    record.bank(20);
    expect(stash.mock.calls.map(([s]) => s)).toEqual([10, 20]);
  });

  it('resets the stash gate each run', () => {
    const stash = vi.fn();
    const record = createRunRecord(0, stash);
    record.beginRun();
    record.bank(30);
    record.beginRun();
    record.bank(10); // lower than last run's 30, but this run's first growth
    expect(stash.mock.calls.map(([s]) => s)).toEqual([30, 10]);
  });
});
