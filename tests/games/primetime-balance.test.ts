/**
 * The balance report: plays the competent contestant over a spread of seeds
 * and prints where each run ended. The report is what a tuning round reads;
 * the assertions it carries are the floor `primetime.test.ts` also holds
 * (so this file can be run alone while tuning).
 */
import { describe, it, expect } from 'vitest';
import { competent, playRun } from './primetime-policies';

const SEEDS = [11, 23, 42, 101, 303, 777, 1990, 2026, 4242, 9001];

describe('PRIME TIME balance report', () => {
  it('plays the competent contestant on every seed and reports', () => {
    const rows = SEEDS.map(seed => {
      const r = playRun(seed, competent, 120000);
      const deathsByRoom: Record<string, number> = {};
      let room = `0:${r.run.visited[0].split(':')[1]}`;
      for (const ev of r.events) {
        if (ev.type === 'enterRoom') room = `${ev.circuit}:${ev.key}`;
        if (ev.type === 'death') deathsByRoom[room] = (deathsByRoom[room] ?? 0) + 1;
      }
      return {
        seed,
        end: r.run.phase,
        studio: r.run.circuit + 1,
        room: r.run.roomKey,
        cleared: r.run.roomsCleared,
        cash: r.run.cash,
        deaths: r.run.deaths,
        minutes: Math.round((r.ticks / 60 / 60) * 10) / 10,
        deathsByRoom: Object.entries(deathsByRoom).map(([k, v]) => `${k}x${v}`).join(' ')
      };
    });
    // eslint-disable-next-line no-console
    console.table(rows);
    for (const row of rows) expect(['over', 'won']).toContain(row.end);
  });
});
