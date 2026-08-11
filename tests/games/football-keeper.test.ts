/**
 * The keeper sweep, and the direct regression for the bug this rewrite exists
 * to fix. The audited build's keeper was a deterministic absorber: in reach was
 * a certain save, out of reach a certain goal, and only 4.9% of the shot grid
 * could ever produce one — an independent audit scored 0 goals in 24,000
 * unopposed shots while walking the ball in won 19-0.
 *
 * Nothing here benches, parks or disables a keeper in order to score.
 */
import { describe, it, expect } from 'vitest';
import { seededRandom } from './seeded-random';
import { shootAt, type ShotOutcome } from './football-shot-harness';
import {
  ERROR_CAP,
  KEEPER_STEAL_R,
  catchProbability,
  commitDive,
  diveBudget,
  diveProgress,
  errorFraction,
  flightTime,
  keeperReach,
  keeperSkill,
  parryVelocity,
  restPosition,
  saveProbability,
  speedAfter,
  trackBall,
  trackLag
} from '../../src/games/football/keeper';
import {
  CENTRE_X,
  GOAL_HALF,
  PITCH_L,
  SIX_DEPTH,
  TEAM_SIZE,
  attackGoalY
} from '../../src/games/football/pitch';
import { createMatch, tickMatch, DRIBBLE_OFFSET } from '../../src/games/football/match';
import { teamByCode } from '../../src/games/football/teams';

const DT = 1 / 60;
/** Aim that puts the ball a few pixels inside the post. */
const POST = 38 / 56;

function rate(
  opts: Parameters<typeof shootAt>[0] extends infer T
    ? T extends { rng: unknown }
      ? Omit<T, 'rng'>
      : never
    : never,
  seeds: number
): Record<ShotOutcome, number> {
  const tally: Record<ShotOutcome, number> = { goal: 0, save: 0, off: 0, post: 0 };
  for (let i = 0; i < seeds; i++) {
    tally[shootAt({ ...opts, rng: seededRandom(i * 7919 + 13) })]++;
  }
  const out = { ...tally };
  for (const key of Object.keys(out) as ShotOutcome[]) out[key] /= seeds;
  return out;
}

function goalRate(opts: Parameters<typeof rate>[0], seeds = 2000): number {
  return rate(opts, seeds).goal;
}

describe('keeper: the 7.3 acceptance bands', () => {
  const cells: Array<[string, Parameters<typeof rate>[0], number, number]> = [
    ['full power from 140 px at a post', { distance: 140, aim: POST, power: 1 }, 0.3, 0.45],
    ['full power from 140 px dead centre', { distance: 140, aim: 0, power: 1 }, 0.08, 0.18],
    ['full power from 240 px at a post', { distance: 240, aim: POST, power: 1 }, 0.15, 0.28],
    ['half power from 140 px at a post', { distance: 140, aim: POST, power: 0.5 }, 0.18, 0.32],
    ['from the six-yard box at a post', { distance: 25, aim: POST, power: 1 }, 0.35, 0.55],
    ['from the six-yard box dead centre', { distance: 25, aim: 0, power: 1 }, 0.12, 0.25],
    [
      'a header from a cross at a tight angle',
      { distance: 34, aim: POST, power: 1, offsetX: 34, keeperX: 184, contact: 'header' as const },
      0.25,
      0.4
    ]
  ];

  for (const [name, opts, lo, hi] of cells) {
    it(`${name} scores between ${lo} and ${hi}`, { timeout: 30000 }, () => {
      const p = goalRate(opts);
      expect(p).toBeGreaterThanOrEqual(lo);
      expect(p).toBeLessThanOrEqual(hi);
    });
  }
});

describe('keeper: monotonicity', () => {
  it('goal chance rises with power at a fixed distance and aim', { timeout: 30000 }, () => {
    const tap = goalRate({ distance: 140, aim: POST, power: 0.35 }, 1500);
    const half = goalRate({ distance: 140, aim: POST, power: 0.6 }, 1500);
    const full = goalRate({ distance: 140, aim: POST, power: 1 }, 1500);
    expect(half).toBeGreaterThan(tap);
    expect(full).toBeGreaterThan(half);
  });

  it('goal chance rises as the aim moves from centre toward a post', { timeout: 30000 }, () => {
    const centre = goalRate({ distance: 140, aim: 0, power: 1 }, 1500);
    const mid = goalRate({ distance: 140, aim: 0.45, power: 1 }, 1500);
    const post = goalRate({ distance: 140, aim: POST, power: 1 }, 1500);
    expect(mid).toBeGreaterThan(centre);
    expect(post).toBeGreaterThan(mid);
  });

  it('goal chance falls with distance at a fixed power and aim', { timeout: 30000 }, () => {
    for (const aim of [0, POST]) {
      const close = goalRate({ distance: 25, aim, power: 1 }, 1500);
      const mid = goalRate({ distance: 140, aim, power: 1 }, 1500);
      const far = goalRate({ distance: 240, aim, power: 1 }, 1500);
      expect(close).toBeGreaterThan(mid);
      expect(mid).toBeGreaterThan(far);
    }
  });
});

describe('keeper: nothing is ever certain', () => {
  it('never returns exactly 0.0 or exactly 1.0 anywhere on the grid', { timeout: 120000 }, () => {
    const distances = [30, 70, 110, 150, 190, 230];
    const aims = [0, 0.25, 0.5, POST];
    const powers = [0.35, 0.6, 1];
    const ratings = [2, 3, 4];
    let cells = 0;
    let above = 0;
    for (const distance of distances) {
      for (const aim of aims) {
        for (const power of powers) {
          for (const keeperRating of ratings) {
            const p = goalRate({ distance, aim, power, keeperRating }, 300);
            cells++;
            if (p > 0.05) above++;
            expect(p, `d=${distance} aim=${aim} pow=${power} gk=${keeperRating}`).toBeGreaterThan(0);
            expect(p, `d=${distance} aim=${aim} pow=${power} gk=${keeperRating}`).toBeLessThan(1);
          }
        }
      }
    }
    // The old build managed 4.9% of cells above 0.05.
    expect(above / cells).toBeGreaterThanOrEqual(0.6);
  });

  it('keeps the save probability strictly inside (0, 1) for every input', () => {
    for (let gap = 0; gap <= 60; gap += 2) {
      for (const reach of [14, 20, 26, 34]) {
        for (let speed = 120; speed <= 460; speed += 20) {
          for (let skill = 0; skill <= 1.0001; skill += 0.1) {
            const p = saveProbability(gap, reach, speed, skill);
            expect(p).toBeGreaterThan(0);
            expect(p).toBeLessThan(1);
          }
        }
      }
    }
  });

  it('keeps the catch probability off both rails', () => {
    for (let speed = 60; speed <= 500; speed += 10) {
      const p = catchProbability(speed);
      expect(p).toBeGreaterThan(0);
      expect(p).toBeLessThan(1);
    }
    expect(catchProbability(200)).toBeGreaterThan(catchProbability(420));
  });
});

describe('keeper: the pure pieces', () => {
  it('scales skill with rating and difficulty but never reaches the rails', () => {
    expect(keeperSkill(1, 0)).toBeGreaterThan(0);
    expect(keeperSkill(5, 1)).toBeLessThan(1);
    expect(keeperSkill(5, 0.5)).toBeGreaterThan(keeperSkill(1, 0.5));
    expect(keeperSkill(3, 0.85)).toBeGreaterThan(keeperSkill(3, 0.25));
  });

  it('tracks the ball with a lag, so he guesses rather than knows', () => {
    expect(trackLag(0)).toBeGreaterThan(trackLag(1));
    let x = CENTRE_X;
    for (let i = 0; i < 6; i++) x = trackBall(x, CENTRE_X + 40, 0.6, DT);
    expect(x).toBeGreaterThan(CENTRE_X);
    expect(x).toBeLessThan(CENTRE_X + 40);
  });

  it('clamps his rest position inside his own posts', () => {
    for (const trackX of [0, CENTRE_X, 340]) {
      const rest = restPosition(trackX, 200, 0, 1);
      expect(rest.x).toBeGreaterThanOrEqual(CENTRE_X - GOAL_HALF);
      expect(rest.x).toBeLessThanOrEqual(CENTRE_X + GOAL_HALF);
      expect(rest.y).toBeGreaterThan(0);
    }
  });

  it('gives a longer shot more time and therefore a bigger dive', () => {
    const near = flightTime(40, 450);
    const far = flightTime(240, 450);
    expect(far).toBeGreaterThan(near);
    expect(diveBudget(far)).toBeGreaterThan(diveBudget(near));
    expect(speedAfter(450, far)).toBeLessThan(speedAfter(450, near));
    expect(flightTime(500, 200)).toBe(Infinity);
  });

  it('extends his reach as the dive develops', () => {
    expect(keeperReach(diveProgress(0))).toBeLessThan(keeperReach(diveProgress(0.28)));
    expect(diveProgress(9)).toBe(1);
  });

  it('caps his misjudgement, so more time never means a bigger mistake', () => {
    const rng = seededRandom(7);
    const long = commitDive({
      restX: CENTRE_X,
      interceptX: CENTRE_X,
      flightT: 2,
      skill: 0.6,
      speed: 450,
      rng
    });
    expect(Math.abs(long.targetX - CENTRE_X)).toBeLessThanOrEqual(
      ERROR_CAP * errorFraction(0.6, 450) + 1e-9
    );
    expect(errorFraction(0.9, 450)).toBeLessThan(errorFraction(0.2, 450));
  });
});

describe('keeper: parries', () => {
  it('always sends the ball away from its own line and into the field', () => {
    const rng = seededRandom(99);
    for (const dir of [1, -1] as const) {
      for (let i = 0; i < 2000; i++) {
        const v = parryVelocity(200 + rng() * 260, dir, rng);
        // `dir` points up the pitch, away from the goal behind the keeper.
        expect(v.vy * dir).toBeGreaterThan(0);
        const speed = Math.hypot(v.vx, v.vy);
        expect(speed).toBeGreaterThan(0);
      }
    }
  });

  it('bleeds pace off the shot rather than returning it', () => {
    const rng = seededRandom(4);
    for (let i = 0; i < 500; i++) {
      const incoming = 300;
      const v = parryVelocity(incoming, 1, rng);
      const speed = Math.hypot(v.vx, v.vy);
      expect(speed).toBeGreaterThanOrEqual(incoming * 0.4 - 1e-9);
      expect(speed).toBeLessThanOrEqual(incoming * 0.55 + 1e-9);
    }
  });
});

describe('keeper: he has a body', () => {
  it('dispossesses a carrier inside his six-yard box within a second', () => {
    let stripped = 0;
    const trials = 60;
    for (let seed = 0; seed < trials; seed++) {
      const m = createMatch({
        rng: seededRandom(seed * 7919 + 5),
        difficulty: 0.55,
        teams: [teamByCode('LUP'), teamByCode('TOR')]
      });
      m.phase = 'play';
      m.phaseTimer = 0;
      const goalY = attackGoalY(0, m.swapped);
      // Park the CPU outfielders far away: only the keeper may win this ball.
      for (let idx = 1; idx < TEAM_SIZE; idx++) {
        m.players[1][idx].x = 20;
        m.players[1][idx].y = 20;
      }
      const carrier = m.players[0][6];
      carrier.x = CENTRE_X;
      carrier.y = goalY - (SIX_DEPTH - 8);
      carrier.fx = 0;
      carrier.fy = 1;
      m.controlled = 6;
      m.owner = { side: 0, idx: 6 };
      m.ball.x = carrier.x;
      m.ball.y = carrier.y + DRIBBLE_OFFSET;
      const gk = m.players[1][0];
      gk.x = CENTRE_X;
      gk.y = goalY - 8;
      m.keepers[1].trackX = CENTRE_X;
      m.winGrace = null;

      let won = false;
      for (let i = 0; i < 60; i++) {
        tickMatch(m, DT);
        if (m.owner && m.owner.side === 1) {
          won = true;
          break;
        }
        if (m.phase !== 'play') break;
      }
      if (won) stripped++;
    }
    // 2.6 steals/second over a second is a near-certainty, but it is a roll.
    expect(stripped / trials).toBeGreaterThan(0.85);
  });

  it('keeps a steal radius small enough to leave an open angle round him', () => {
    expect(KEEPER_STEAL_R).toBeLessThan(GOAL_HALF);
    expect(PITCH_L).toBeGreaterThan(0);
  });
});
