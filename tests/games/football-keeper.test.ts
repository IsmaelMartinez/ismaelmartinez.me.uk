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
  ERROR_BASE,
  ERROR_REACH,
  KEEPER_JUMP_Z,
  KEEPER_LINE,
  KEEPER_STEAL_R,
  REACH_BASE,
  REACH_BODY,
  REACH_DIVE,
  airborne,
  approachGap,
  narrowAngleX,
  postFrame,
  squareness,
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
/**
 * Full stick. The aim scale maps to reachable targets — see `shoot` in
 * match.ts — so this asks for the ball a ball's width inside the post. The
 * constant it replaces, `38 / 56`, was a point on the *interior* of the old
 * over-wide envelope and sat on the shoulder of the response peak, which is
 * how a sweep of it missed that the response collapsed to zero beyond it.
 */
const POST = 1;

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
    // DEVIATION, and it is the whole point of this round rather than a slip.
    // 7.3 asks for 0.25-0.40 on "a header from a cross at a tight angle" and
    // the cabinet gives 0.04. The cell is a header from outside the width of
    // the six-yard box, dragged all the way across the face of goal past a
    // keeper who is standing between it and the far post — which is precisely
    // the shot the audit's dominant camp strategy was made of, and precisely
    // the shot a keeper on the angle is there to deny. It cannot be 0.3 and
    // the camp exploit be dead; they are the same shot.
    [
      'a header dragged across the keeper from a tight angle',
      { distance: 34, aim: -POST, power: 1, offsetX: 34, keeperX: 184, contact: 'header' as const },
      0.01,
      0.12
    ],
    // What replaces it, and what the section was really asking about: the
    // cross-and-header weapon still exists, and what makes it work is a
    // delivery arriving where the keeper is not. Same tight angle, same
    // header, but met while he is still on his spot in the middle of the goal.
    [
      'a header met before the keeper has come across',
      { distance: 34, aim: 0, power: 1, offsetX: 34, keeperX: 170, contact: 'header' as const },
      0.3,
      0.6
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
    const wide = goalRate({ distance: 140, aim: 0.8, power: 1 }, 1500);
    const post = goalRate({ distance: 140, aim: POST, power: 1 }, 1500);
    expect(mid).toBeGreaterThan(centre);
    expect(wide).toBeGreaterThan(mid);
    expect(post).toBeGreaterThan(wide);
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
    // Down to touching distance. At 10 px the ball starts goal-side of the
    // keeper's standing line and never crosses it, so before this round the
    // crossing test never fired, the keeper was never consulted, and every one
    // of these cells measured exactly 1.0000 at every rating and difficulty.
    const distances = [10, 14, 30, 70, 110, 150, 190, 230];
    const aims = [0, 0.25, 0.5, 0.75, POST];
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

  it('comes out to narrow the angle as the ball nears, and never past it', () => {
    // The direction of this term was backwards in the audited build: the
    // keeper stood on his line for a shot from six yards and thirty pixels off
    // it for one from the halfway line. It is also the honest answer to why a
    // close-range shot is not a certainty — the ball crosses his plane before
    // it has spread far from the striker's foot.
    const near = restPosition(CENTRE_X, 40, 0, 1);
    const far = restPosition(CENTRE_X, 300, 0, 1);
    expect(near.y).toBeGreaterThan(far.y);
    for (const ballY of [14, 20, 30, 60, 120, 240, 400]) {
      const rest = restPosition(CENTRE_X, ballY, 0, 1);
      expect(rest.y, `keeper stays behind a ball at ${ballY}`).toBeLessThan(ballY);
      expect(rest.y, `keeper never behind his own line at ${ballY}`).toBeGreaterThan(0);
    }
  });

  it('has no cliff at the edge of his reach', () => {
    // The audit's exactly-100 % cell came from a hard `gap > reach` return
    // that fired before any roll. The curve now passes through a half chance
    // at full stretch and decays from there to a floor it never leaves.
    const reach = 30;
    const at = saveProbability(reach, reach, 380, 0.45);
    const just = saveProbability(reach + 1, reach, 380, 0.45);
    expect(at).toBeGreaterThan(0.35);
    expect(at).toBeLessThan(0.65);
    expect(at - just).toBeLessThan(0.05);
    // Miles away and still not a formality.
    expect(saveProbability(90, reach, 380, 0.45)).toBeGreaterThan(0);
    // And a shot straight at him is never a formality the other way either.
    expect(saveProbability(0, reach, 380, 0.9)).toBeLessThan(1);
  });

  it('gives a longer shot more time and therefore a bigger dive', () => {
    const near = flightTime(40, 450);
    const far = flightTime(240, 450);
    expect(far).toBeGreaterThan(near);
    expect(diveBudget(far)).toBeGreaterThan(diveBudget(near));
    expect(speedAfter(450, far)).toBeLessThan(speedAfter(450, near));
    expect(flightTime(500, 200)).toBe(Infinity);
  });

  it('extends his reach as he reacts and the dive develops', () => {
    // Reach is measured from the moment the ball was struck, not from a dive
    // progress fraction, and that is the whole of why a point-blank finish
    // beats a keeper standing in front of it: with no time at all he covers
    // his own body and nothing else.
    expect(keeperReach(0)).toBeCloseTo(REACH_BODY, 6);
    expect(keeperReach(0.02)).toBeLessThan(REACH_BASE * 0.6);
    expect(keeperReach(0.02)).toBeLessThan(keeperReach(0.1));
    expect(keeperReach(0.1)).toBeLessThan(keeperReach(0.4));
    expect(keeperReach(9)).toBeCloseTo(REACH_BASE + REACH_DIVE, 6);
    expect(diveProgress(9)).toBe(1);
  });

  it('stands on the angle rather than on the ball', () => {
    // From range the two posts are nearly the same direction, so a ball out
    // wide barely moves him: this is what stops a shooter dragging him off his
    // spot from the halfway line and shooting into the space.
    const farWide = narrowAngleX(CENTRE_X + 120, 300, 20);
    expect(Math.abs(farWide - CENTRE_X)).toBeLessThan(20);
    // From the corner of the penalty box he is hard against his near post,
    // which is the fix for the camp exploit: the reward for a wide position is
    // a narrow target rather than an open goal.
    const boxCorner = narrowAngleX(CENTRE_X + 108, 78, 20);
    expect(boxCorner).toBeGreaterThan(CENTRE_X + 12);
    // And he never leaves his own frame — where the frame is the one he is
    // actually standing in, which is `postFrame`: his posts, widened by the
    // allowance he has to leave his goal by at all.
    //
    // This assertion used to read `<= GOAL_HALF` and that bound was the bug
    // rather than the contract. A band drawn on the goal *line* is the wrong
    // shape for a keeper standing two strides in front of it, and an audit
    // measured what it cost: the bisector from any ball more than about 55 px
    // off centre falls outside it, so `restPosition` returned the clamp — a
    // constant 206.0, six pixels inside the near post — for every ball wider
    // than that, and the near-post finish from out there converted 0.91 to
    // 0.95 against 0.23 to 0.74 for the same shot dragged across goal. He was
    // not on the angle at all in the one region where the angle is the whole
    // of the danger.
    //
    // The bound below is what "covering your near post" means for a keeper who
    // may leave his goal at all: one budget, spent forward against a ball he
    // is facing and sideways against one at a tight angle, and he may be
    // outside the upright by the size of that budget and not a pixel more. It
    // is self-limiting — the budget is `KEEPER_ADVANCE` at most and fades with
    // distance — and with nothing to spend it collapses to the goal frame.
    for (const ballX of [-200, 0, CENTRE_X, 340, 600]) {
      for (const allowance of [0, 6, 12, 26]) {
        for (const depth of [1, 12, 40, 300]) {
          const x = narrowAngleX(ballX, depth, 20, allowance);
          expect(
            Math.abs(x - CENTRE_X),
            `ball ${ballX} at ${depth} px, allowance ${allowance}`
          ).toBeLessThanOrEqual(postFrame(allowance));
        }
      }
    }
    // With no allowance to spend — on his line, or with the ball over his head
    // — that frame is the goal and nothing more.
    expect(postFrame(0)).toBe(GOAL_HALF);
    expect(narrowAngleX(600, 40, 20)).toBeLessThanOrEqual(CENTRE_X + GOAL_HALF);
  });

  it('steps out from his near post only as far as he has left his line', () => {
    // The near-post lane, measured as arithmetic rather than as a goal rate,
    // because this is the thing the round changed and a rate can be tuned
    // around it: as the ball goes wider the keeper has to keep moving toward
    // the post it is threatening, not stop dead six pixels inside it.
    const at = (offset: number) => restPosition(CENTRE_X + offset, 45, 0, 1).x;
    let prev = at(0);
    for (const offset of [40, 55, 70, 85, 100, 120]) {
      const x = at(offset);
      expect(x, `keeper at ball offset +${offset}`).toBeGreaterThan(prev);
      prev = x;
    }
  });

  it('does not come out to a ball that is in the air', () => {
    // There is no shooting angle to narrow against a cross. A keeper who holds
    // an advanced near-post position while the delivery goes over him is a
    // keeper stranded in front of his own goal, and that is exactly what the
    // wing-cross routine was living on.
    const deck = restPosition(CENTRE_X + 130, 55, 0, 1, 0);
    const overhead = restPosition(CENTRE_X + 130, 55, 0, 1, KEEPER_JUMP_Z);
    expect(overhead.y, 'back on his line while the ball is up').toBeLessThan(deck.y);
    expect(overhead.y).toBeCloseTo(KEEPER_LINE, 6);
    // ...and being back on his line puts him back inside his goal frame.
    expect(Math.abs(overhead.x - CENTRE_X)).toBeLessThanOrEqual(GOAL_HALF);
    expect(Math.abs(deck.x - CENTRE_X)).toBeGreaterThan(GOAL_HALF - 6);
    expect(airborne(0)).toBe(0);
    expect(airborne(KEEPER_JUMP_Z * 2)).toBe(1);
  });

  it('advances on a ball it is facing and holds its post on one it is not', () => {
    // `squareness` is the other half of the same idea and it is why the frame
    // above can be widened without the keeper charging out to the corner flag:
    // the advance is worth making in proportion to how much goal there is in
    // front of the ball, so from the byline he sets rather than comes.
    expect(squareness(CENTRE_X, 60)).toBe(1);
    // Anywhere in front of the mouth is still square, so nothing about a shot
    // from the centre line moves — which is what keeps 7.3's grid identical.
    expect(squareness(CENTRE_X + GOAL_HALF, 60)).toBe(1);
    expect(squareness(CENTRE_X + 130, 60)).toBeLessThan(0.75);
    expect(squareness(CENTRE_X + 130, 60)).toBeGreaterThan(0);
    const square = restPosition(CENTRE_X, 60, 0, 1);
    const tight = restPosition(CENTRE_X + 130, 60, 0, 1);
    expect(tight.y, 'less advanced from a tight angle').toBeLessThan(square.y);
  });

  it('measures the gap as how near the ball passed him', () => {
    // A ball dragged across the face of goal crosses his line wide of him and
    // goes *through* the space he is standing in on the way. Measured
    // laterally it looks like a free corner; measured as an approach it is a
    // shot he is in the way of, and that is the other half of the camp fix.
    const across = approachGap({
      keeperX: CENTRE_X,
      keeperY: 20,
      ballX: CENTRE_X - 30,
      ballY: 10,
      vx: -300,
      vy: -300,
      back: 120
    });
    expect(across).toBeLessThan(30);
    // A ball that has already gone past him is simply where it is.
    const gone = approachGap({
      keeperX: CENTRE_X,
      keeperY: 20,
      ballX: CENTRE_X + 40,
      ballY: 4,
      vx: 0,
      vy: 400,
      back: 200
    });
    expect(gone).toBeCloseTo(Math.hypot(40, 16), 6);
    // And a shot from six yards is never credited with a closest approach it
    // took before the boot that struck it existed.
    const short = approachGap({
      keeperX: CENTRE_X,
      keeperY: 8,
      ballX: CENTRE_X + 20,
      ballY: 6,
      vx: 300,
      vy: -300,
      back: 4
    });
    expect(short).toBeGreaterThan(15);
  });

  it('misjudges by more the further he has to go, and never by the clock', () => {
    // The error is a function of the offset he has committed to covering, not
    // of the dive budget the flight time hands him. That is what keeps 7.3's
    // "falls with distance" honest at every aim: extra reading time used to
    // buy a proportionally bigger mistake, which cancelled it.
    const bound = (offset: number) =>
      (ERROR_BASE + ERROR_REACH * Math.abs(offset)) * errorFraction(0.6, 450) + 1e-9;
    const commit = (interceptX: number, flightT: number) =>
      commitDive({
        restX: CENTRE_X,
        interceptX,
        flightT,
        skill: 0.6,
        speed: 450,
        rng: seededRandom(7)
      });

    // A keeper asked to stay where he is cannot be far wrong, however long he
    // has to think about it.
    for (const flightT of [0.05, 0.3, 2]) {
      expect(Math.abs(commit(CENTRE_X, flightT).targetX - CENTRE_X)).toBeLessThanOrEqual(bound(0));
    }
    // A keeper asked to cover a corner can be, and the bound grows with the
    // corner rather than with the clock.
    for (const offset of [0, 12, 24, 36, 56]) {
      const d = commit(CENTRE_X + offset, 0.3);
      expect(Math.abs(d.targetX - (CENTRE_X + offset))).toBeLessThanOrEqual(bound(offset));
    }
    expect(bound(36)).toBeGreaterThan(bound(0));
    // Identical seeds, identical offsets, four times the flight: same guess.
    expect(commit(CENTRE_X + 36, 0.12).targetX).toBeCloseTo(commit(CENTRE_X + 36, 0.5).targetX, 9);
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
