/**
 * Attract mode: the cabinet's demo of itself.
 *
 * What has to hold is that the demo is the *same* game — an ordinary
 * `MatchState` stepped by the ordinary `tickMatch`, with `demo.ts` only
 * supplying side 0's stick — that it replays exactly from a seed, and that it
 * is worth watching: a demo where nobody scores sells nothing.
 */
import { describe, it, expect } from 'vitest';
import {
  ATTRACT_DELAY,
  DEMO_DIFFICULTY,
  DEMO_HALF_SECONDS,
  createDemoDriver,
  demoPairing
} from '../../src/games/football/demo';
import { seededRng } from '../../src/games/engine/math';
import { createMatch, tickMatch, type MatchState } from '../../src/games/football/match';
import { TEAMS } from '../../src/games/football/teams';

const DT = 1 / 60;

/** Play a whole demo match headlessly and hand back its final state. */
function playDemo(seed: number): MatchState {
  const rng = seededRng(seed);
  const [home, away] = demoPairing(rng, TEAMS);
  const m = createMatch({
    rng,
    difficulty: DEMO_DIFFICULTY,
    teams: [TEAMS[home], TEAMS[away]],
    halfSeconds: DEMO_HALF_SECONDS
  });
  const drive = createDemoDriver();
  // Enough ticks for both halves plus every freeze, celebration and restart.
  for (let tick = 0; tick < 60 * (DEMO_HALF_SECONDS * 2 + 30); tick++) {
    if (m.phase === 'over') break;
    tickMatch(m, DT, drive(m, DT));
  }
  return m;
}

describe('attract mode', () => {
  it('gives the cabinet time to be idle before it demos itself', () => {
    expect(ATTRACT_DELAY).toBeGreaterThanOrEqual(8);
    expect(ATTRACT_DELAY).toBeLessThanOrEqual(20);
  });

  it('runs both sides on AI through the ordinary match tick', () => {
    const m = playDemo(1);
    expect(m.phase).toBe('over');
    // 90 game minutes reached: the demo played a whole match, not a fragment.
    expect(m.clock).toBeGreaterThanOrEqual(89);
  });

  it('replays exactly from the same seed', () => {
    for (const seed of [7, 99, 12345]) {
      const a = playDemo(seed);
      const b = playDemo(seed);
      expect(b.score).toEqual(a.score);
      expect(b.ball.x).toBe(a.ball.x);
      expect(b.ball.y).toBe(a.ball.y);
      expect(b.log.length).toBe(a.log.length);
    }
  });

  it('varies across seeds', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 12; seed++) {
      const m = playDemo(seed);
      seen.add(`${m.teams[0].code}-${m.teams[1].code}-${m.score.join(':')}`);
    }
    expect(seen.size).toBeGreaterThan(4);
  });

  it('picks two different sides from the visible roster', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const [home, away] = demoPairing(seededRng(seed), TEAMS);
      expect(home).not.toBe(away);
      expect(TEAMS[home]).toBeDefined();
      expect(TEAMS[away]).toBeDefined();
    }
  });

  it('is worth watching: goals go in, at both ends, across a loop of demos', () => {
    let goals = 0;
    let homeGoals = 0;
    let awayGoals = 0;
    const RUNS = 24;
    for (let seed = 1; seed <= RUNS; seed++) {
      const m = playDemo(seed);
      homeGoals += m.score[0];
      awayGoals += m.score[1];
      goals += m.score[0] + m.score[1];
    }
    // Roughly a goal a demo either way; the assertion only pins that the
    // driver attacks rather than passing the ball around its own half.
    expect(goals / RUNS).toBeGreaterThan(0.5);
    expect(homeGoals).toBeGreaterThan(0);
    expect(awayGoals).toBeGreaterThan(0);
  });

  it('never puts an illegal stick or a NaN on the controls', () => {
    const rng = seededRng(4242);
    const m = createMatch({
      rng,
      difficulty: DEMO_DIFFICULTY,
      teams: [TEAMS[0], TEAMS[5]],
      halfSeconds: DEMO_HALF_SECONDS
    });
    const drive = createDemoDriver();
    for (let tick = 0; tick < 60 * 40 && m.phase !== 'over'; tick++) {
      const input = drive(m, DT);
      expect(Number.isFinite(input.x)).toBe(true);
      expect(Number.isFinite(input.y)).toBe(true);
      expect(Math.abs(input.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(input.y)).toBeLessThanOrEqual(1);
      tickMatch(m, DT, input);
    }
  });
});
