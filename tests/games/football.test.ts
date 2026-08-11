import { describe, it, expect } from 'vitest';
import { seededRandom } from './seeded-random';
import {
  createMatch,
  tickMatch,
  humanPass,
  humanShoot,
  bestPassTarget,
  MATCH_SECONDS,
  GOLDEN_SECONDS,
  GOAL_PAUSE,
  type MatchState,
  type MatchEvent
} from '../../src/games/football/match';
import { PITCH_W, PITCH_H, GOAL_TOP, GOAL_BOTTOM, anchorFor } from '../../src/games/football/pitch';
import {
  createLadder,
  recordMatch,
  ladderScore,
  difficultyFor,
  ROUNDS,
  OPPONENTS,
  GOAL_POINTS,
  ROUND_POINTS
} from '../../src/games/football/ladder';
import { createRunRecord } from '../../src/games/engine/scoreboard';

const DT = 1 / 60;

/** Tick through the kickoff freeze into open play. */
function toPlay(m: MatchState): void {
  for (let i = 0; i < 200 && m.phase !== 'play'; i++) tickMatch(m, DT);
  expect(m.phase).toBe('play');
}

/** Tick until a predicate fires or the budget runs out; returns all events. */
function tickUntil(
  m: MatchState,
  ticks: number,
  done: (events: MatchEvent[]) => boolean
): MatchEvent[] {
  const all: MatchEvent[] = [];
  for (let i = 0; i < ticks; i++) {
    const events = tickMatch(m, DT);
    all.push(...events);
    if (done(all)) break;
  }
  return all;
}

/** Park the defending keeper in a corner so a scripted shot is not saved. */
function benchKeeper(m: MatchState, side: 0 | 1): void {
  m.players[side][0].y = 10;
}

describe('football pitch', () => {
  it('keeps the keeper anchored across the goal mouth', () => {
    const high = anchorFor(0, 0, 100, 0);
    const low = anchorFor(0, 0, 100, PITCH_H);
    expect(high.y).toBeGreaterThanOrEqual(GOAL_TOP);
    expect(low.y).toBeLessThanOrEqual(GOAL_BOTTOM);
  });

  it('shifts outfield anchors with the ball but keeps them on the pitch', () => {
    const a = anchorFor(0, 4, PITCH_W, PITCH_H);
    expect(a.x).toBeLessThanOrEqual(PITCH_W - 10);
    expect(a.y).toBeLessThanOrEqual(PITCH_H - 10);
  });
});

describe('football match', () => {
  it('opens with a kickoff freeze, then play', () => {
    const m = createMatch(0, seededRandom(1));
    const events = tickUntil(m, 200, all => all.some(e => e.type === 'kickoff'));
    expect(events.some(e => e.type === 'kickoff')).toBe(true);
    expect(m.phase).toBe('play');
  });

  it('scores a ball driven into the goal mouth and pauses to celebrate', () => {
    const m = createMatch(0, seededRandom(2));
    toPlay(m);
    benchKeeper(m, 1);
    m.owner = null;
    m.ball = { x: PITCH_W - 30, y: PITCH_H / 2, vx: 400, vy: 0 };
    const events = tickUntil(m, 60, all => all.some(e => e.type === 'goal'));
    const goal = events.find(e => e.type === 'goal');
    expect(goal).toMatchObject({ side: 0, golden: false });
    expect(m.score).toEqual([1, 0]);
    expect(m.phase).toBe('goal');
    // The celebration resolves back to a kickoff with the score intact.
    tickUntil(m, Math.ceil((GOAL_PAUSE + 0.2) / DT), () => m.phase === 'kickoff');
    expect(m.phase).toBe('kickoff');
    expect(m.score).toEqual([1, 0]);
  });

  it('scores a ball dribbled across the goal line', () => {
    const m = createMatch(0, seededRandom(13));
    toPlay(m);
    benchKeeper(m, 1);
    // Park the CPU outfield away so nothing can tackle the carrier.
    for (let idx = 1; idx < m.players[1].length; idx++) {
      m.players[1][idx].x = 60;
      m.players[1][idx].y = 40;
    }
    // The carrier stands on the clamp line facing the goal: the dribble
    // offset puts the owned ball beyond the line, inside the mouth.
    const fwd = m.players[0][4];
    fwd.x = PITCH_W - 5;
    fwd.y = PITCH_H / 2;
    fwd.fx = 1;
    fwd.fy = 0;
    m.owner = { side: 0, idx: 4 };
    const events = tickUntil(m, 30, all => all.some(e => e.type === 'goal'));
    expect(events.find(e => e.type === 'goal')).toMatchObject({ side: 0 });
    expect(m.score).toEqual([1, 0]);
    expect(m.phase).toBe('goal');
  });

  it('rebounds off the walled perimeter instead of going out', () => {
    const m = createMatch(0, seededRandom(3));
    toPlay(m);
    m.owner = null;
    m.ball = { x: PITCH_W / 2, y: 2, vx: 0, vy: -200 };
    tickMatch(m, DT);
    tickMatch(m, DT);
    expect(m.ball.y).toBeGreaterThanOrEqual(0);
    expect(m.ball.vy).toBeGreaterThan(0);
  });

  it('lets a nearby player trap a slow loose ball', () => {
    const m = createMatch(0, seededRandom(4));
    toPlay(m);
    const fwd = m.players[0][4];
    m.owner = null;
    m.ball = { x: fwd.x + 2, y: fwd.y + 2, vx: 0, vy: 0 };
    tickMatch(m, DT);
    expect(m.owner).toEqual({ side: 0, idx: 4 });
  });

  it('picks the most advanced open teammate for a pass, avoiding blocked lanes', () => {
    const m = createMatch(0, seededRandom(5));
    // Hand-built situation: passer mid, open forward, everyone else parked.
    m.players[0][2].x = 200;
    m.players[0][2].y = 180;
    m.players[0][4].x = 330;
    m.players[0][4].y = 180;
    m.players[0][3].x = 210;
    m.players[0][3].y = 252;
    m.players[0][1].x = 95;
    m.players[0][1].y = 180;
    for (const opp of m.players[1]) {
      opp.x = 500;
      opp.y = 350;
    }
    expect(bestPassTarget(m, 0, 2)).toBe(4);
    // A marker straight down the lane makes the forward a bad ball.
    m.players[1][4].x = 265;
    m.players[1][4].y = 180;
    expect(bestPassTarget(m, 0, 2)).toBe(3);
  });

  it('completes a human pass and releases the ball toward the target', () => {
    const m = createMatch(0, seededRandom(6));
    toPlay(m);
    for (const opp of m.players[1]) {
      opp.x = 500;
      opp.y = 350;
    }
    m.owner = { side: 0, idx: 2 };
    const passer = m.players[0][2];
    const target = m.players[0][bestPassTarget(m, 0, 2)];
    expect(humanPass(m)).toBe(true);
    expect(m.owner).toBeNull();
    // Ball leaves in the target's direction.
    expect(Math.sign(m.ball.vx)).toBe(Math.sign(target.x - passer.x));
  });

  it('refuses pass and shot when the human does not own the ball', () => {
    const m = createMatch(0, seededRandom(7));
    toPlay(m);
    m.owner = null;
    expect(humanPass(m)).toBe(false);
    expect(humanShoot(m, 1)).toBe(false);
  });

  it('ends at full time when the scores differ', () => {
    const m = createMatch(0, seededRandom(8), 1);
    toPlay(m);
    m.score[0] = 1;
    const events = tickUntil(m, 120, all => all.some(e => e.type === 'end'));
    expect(events.find(e => e.type === 'end')).toMatchObject({ winner: 0 });
    expect(m.phase).toBe('over');
  });

  it('sends a level full time to a golden-goal minute', () => {
    const m = createMatch(0, seededRandom(9), 1);
    toPlay(m);
    const events = tickUntil(m, 120, all => all.some(e => e.type === 'goldenGoal'));
    expect(events.some(e => e.type === 'goldenGoal')).toBe(true);
    expect(m.golden).toBe(true);
    expect(m.timeLeft).toBe(GOLDEN_SECONDS);
    expect(m.phase).toBe('play');
  });

  it('ends the match outright on a golden goal', () => {
    const m = createMatch(0, seededRandom(10), 1);
    toPlay(m);
    tickUntil(m, 120, all => all.some(e => e.type === 'goldenGoal'));
    benchKeeper(m, 1);
    m.owner = null;
    m.ball = { x: PITCH_W - 20, y: PITCH_H / 2, vx: 450, vy: 0 };
    const events = tickUntil(m, Math.ceil((GOAL_PAUSE + 1) / DT), all =>
      all.some(e => e.type === 'end')
    );
    expect(events.find(e => e.type === 'goal')).toMatchObject({ side: 0, golden: true });
    expect(events.find(e => e.type === 'end')).toMatchObject({ winner: 0 });
    expect(m.phase).toBe('over');
  });

  it('ends with no winner when the golden minute stays scoreless', () => {
    const m = createMatch(0, seededRandom(11), 1);
    toPlay(m);
    tickUntil(m, 120, all => all.some(e => e.type === 'goldenGoal'));
    // Script the freeze: before every tick the ball goes back loose and dead
    // in a neutral corner, so neither side can score while the minute burns.
    const events: MatchEvent[] = [];
    const budget = Math.ceil((GOLDEN_SECONDS + 5) / DT);
    for (let i = 0; i < budget; i++) {
      m.owner = null;
      m.ball = { x: 4, y: 4, vx: 0, vy: 0 };
      events.push(...tickMatch(m, DT));
      if (events.some(e => e.type === 'end')) break;
    }
    const end = events.find(e => e.type === 'end');
    expect(end).toBeDefined();
    if (end?.type === 'end') expect(end.winner).toBeNull();
    expect(m.score).toEqual([0, 0]);
    expect(m.phase).toBe('over');
  });

  it('plays a whole headless match to completion inside the pitch', () => {
    const m = createMatch(1, seededRandom(12));
    const budget = Math.ceil((MATCH_SECONDS + GOLDEN_SECONDS + 60) / DT);
    const events = tickUntil(m, budget, all => all.some(e => e.type === 'end'));
    const end = events.find(e => e.type === 'end');
    expect(end).toBeDefined();
    expect(m.phase).toBe('over');
    // A passive human team never shoots, so it cannot out-score the CPU.
    if (end?.type === 'end') expect([1, null]).toContain(end.winner);
    expect(m.score[1]).toBeGreaterThanOrEqual(m.score[0]);
    // Everything stayed on the walled pitch.
    expect(m.ball.x).toBeGreaterThanOrEqual(0);
    expect(m.ball.x).toBeLessThanOrEqual(PITCH_W);
    expect(m.ball.y).toBeGreaterThanOrEqual(0);
    expect(m.ball.y).toBeLessThanOrEqual(PITCH_H);
    for (const side of [0, 1] as const) {
      for (const p of m.players[side]) {
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThanOrEqual(PITCH_W);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThanOrEqual(PITCH_H);
      }
    }
  });
});

describe('football ladder', () => {
  it('ramps difficulty from 0 to 1 across the rounds', () => {
    expect(difficultyFor(0)).toBe(0);
    expect(difficultyFor(ROUNDS - 1)).toBe(1);
    for (let round = 1; round < ROUNDS; round++) {
      expect(difficultyFor(round)).toBeGreaterThan(difficultyFor(round - 1));
    }
  });

  it('fields one opponent per round', () => {
    expect(OPPONENTS).toHaveLength(ROUNDS);
  });

  it('crowns a champion after winning every round', () => {
    const ladder = createLadder();
    const goals = [2, 1, 3, 1];
    for (const g of goals) recordMatch(ladder, true, g);
    expect(ladder.champion).toBe(true);
    expect(ladder.over).toBe(true);
    expect(ladder.roundsWon).toBe(ROUNDS);
    expect(ladderScore(ladder)).toBe(7 * GOAL_POINTS + ROUNDS * ROUND_POINTS);
  });

  it('ends the run on a loss but still counts the goals', () => {
    const ladder = createLadder();
    recordMatch(ladder, true, 2);
    recordMatch(ladder, false, 1);
    expect(ladder.over).toBe(true);
    expect(ladder.champion).toBe(false);
    expect(ladder.roundsWon).toBe(1);
    expect(ladder.round).toBe(1);
    expect(ladderScore(ladder)).toBe(3 * GOAL_POINTS + ROUND_POINTS);
  });

  it('banks exactly the ladder score across a won round', () => {
    // Mirrors game.ts's accounting: each goal banks the live score (ladder
    // plus this match's goals); the round-end bank runs after recordMatch has
    // folded the match into the ladder, so it banks the ladder score alone —
    // adding the goals again there is the double-count regression.
    const record = createRunRecord(0, () => {});
    record.beginRun();
    const ladder = createLadder();
    const matchGoals = 2;
    for (let g = 1; g <= matchGoals; g++) record.bank(ladderScore(ladder) + g * GOAL_POINTS);
    recordMatch(ladder, true, matchGoals);
    const { best } = record.bank(ladderScore(ladder));
    expect(best).toBe(ladderScore(ladder));
    expect(best).toBe(matchGoals * GOAL_POINTS + ROUND_POINTS);
  });

  it('treats a scoreless golden minute as elimination', () => {
    const ladder = createLadder();
    recordMatch(ladder, false, 0);
    expect(ladder.over).toBe(true);
    expect(ladderScore(ladder)).toBe(0);
  });
});
