import { describe, it, expect } from 'vitest';
import { seededRandom } from './seeded-random';
import {
  createMatch,
  tickMatch,
  resolveContact,
  shoot,
  slideChance,
  scorerList,
  cpuSpeed,
  DRIBBLE_OFFSET,
  FULL_TIME_MINUTES,
  HALF_SECONDS,
  HUMAN_SPEED,
  DRIBBLE_FACTOR,
  OFFBALL_FACTOR,
  TRAP_Z,
  VOLLEY_Z,
  HEADER_Z,
  AIR_STRIKE_MIN_TRAVEL,
  AIR_STRIKE_R,
  CROSS_STRIKE_R,
  canAirStrike,
  type MatchEvent,
  type MatchState
} from '../../src/games/football/match';
import {
  CENTRE_X,
  CENTRE_Y,
  GOAL_HALF,
  PITCH_L,
  PITCH_W,
  TEAM_SIZE,
  attackGoalY
} from '../../src/games/football/pitch';
import { firstKit, teamByCode } from '../../src/games/football/teams';
import { aCue, airArmed, shotArmed } from '../../src/games/football/render';
import { SHOOT_RANGE } from '../../src/games/football/ai';
import { passive, competent } from './football-policies';

const DT = 1 / 60;
const TEAMS: [ReturnType<typeof teamByCode>, ReturnType<typeof teamByCode>] = [
  teamByCode('ENG'),
  teamByCode('ESP')
];

function fresh(opts: Parameters<typeof createMatch>[0] = {}): MatchState {
  return createMatch({ rng: seededRandom(7), difficulty: 0.45, teams: TEAMS, ...opts });
}

/** Run a whole match with a policy on the stick, returning every event. */
function playMatch(m: MatchState, policy = passive()): MatchEvent[] {
  const log: MatchEvent[] = [];
  for (let i = 0; i < 60 * 240 && m.phase !== 'over'; i++) {
    log.push(...tickMatch(m, DT, policy(m, DT)));
  }
  return log;
}

/** Drop straight into open play with the ball loose where we put it. */
function looseBallAt(m: MatchState, x: number, y: number, vx = 0, vy = 0): void {
  m.phase = 'play';
  m.phaseTimer = 0;
  m.owner = null;
  m.kickGrace = null;
  m.restart = null;
  m.ball.x = x;
  m.ball.y = y;
  m.ball.z = 0;
  m.ball.vx = vx;
  m.ball.vy = vy;
  m.ball.vz = 0;
  for (const side of [0, 1] as const) {
    for (let idx = 0; idx < TEAM_SIZE; idx++) {
      m.players[side][idx].x = 20 + idx * 8 + side * 140;
      m.players[side][idx].y = CENTRE_Y;
    }
  }
}

describe('kickoff assignment', () => {
  it('gives the first half to the human and the second to the CPU', () => {
    const m = fresh();
    const log = playMatch(m);
    const kickoffs = log.filter(e => e.type === 'kickoff') as Array<{ side: 0 | 1 }>;
    expect(kickoffs.length).toBeGreaterThanOrEqual(2);
    expect(kickoffs[0].side).toBe(0);
    const halfTimeAt = log.findIndex(e => e.type === 'halfTime');
    expect(halfTimeAt).toBeGreaterThan(0);
    const afterHalf = log.slice(halfTimeAt).find(e => e.type === 'kickoff') as { side: 0 | 1 };
    expect(afterHalf.side).toBe(1);
  });

  it('restarts with the conceding side after a goal', () => {
    // Several seeds, because one match is not guaranteed to contain a goal and
    // this is an assertion about what happens *after* one, not about how often
    // they arrive.
    const log: MatchEvent[] = [];
    for (let seed = 1; seed <= 6; seed++) {
      log.push(...playMatch(fresh({ rng: seededRandom(seed * 7919 + 3) }), competent()));
    }
    const goals = log.filter(e => e.type === 'goal');
    expect(goals.length).toBeGreaterThan(0);
    for (const goal of goals) {
      if (goal.type !== 'goal') continue;
      const at = log.indexOf(goal);
      const next = log.slice(at + 1).find(e => e.type === 'kickoff' || e.type === 'halfTime');
      if (!next || next.type !== 'kickoff') continue;
      expect(next.side).toBe(1 - goal.side);
    }
  });

  it('freezes both sides and the ball during the kickoff pause', () => {
    const m = fresh();
    const before = { x: m.ball.x, y: m.ball.y };
    for (let i = 0; i < 20; i++) tickMatch(m, DT, { x: 1, y: 1, a: true, b: true, c: true });
    expect(m.phase).toBe('kickoff');
    expect(m.ball.x).toBeCloseTo(before.x, 6);
    expect(m.ball.y).toBeCloseTo(before.y, 6);
    expect(m.owner).toBeNull();
  });
});

/**
 * The strips are part of the fixture, not of the frame: whether a side wears
 * its change kit is decided once when the match is made, so the two teams
 * cannot swap shirts mid-match and a headless test can read the answer.
 */
describe('the fixture picks the strips', () => {
  it('plays an unclashing fixture in both first strips', () => {
    const m = fresh();
    expect(m.kits[0]).toEqual(firstKit(TEAMS[0]));
    expect(m.kits[1]).toEqual(firstKit(TEAMS[1]));
  });

  it('puts the away side in its change strip when the two clash', () => {
    // Spain and Belgium wear the same red, so one of them has to change.
    const home = teamByCode('ESP');
    const away = teamByCode('BEL');
    const m = createMatch({ rng: seededRandom(7), teams: [home, away] });
    expect(m.kits[0]).toEqual(firstKit(home));
    expect(m.kits[1]).toEqual(away.alt);
  });
});

/**
 * The shooting-range cue. Inside `SHOOT_RANGE` the A button is a shot and
 * outside it the same press is a clearance that usually concedes possession,
 * and before this the boundary was invisible: nothing on the pitch, the player
 * or the HUD changed as you crossed it. `shotArmed` is what turns the marker
 * and the HUD arrow red, so it has to answer exactly what `humanAction` will
 * do with the next press — including the cases where there is no press to
 * make, because a cue that lies about a slide tackle is worse than none.
 */
describe('the shooting-range cue', () => {
  function carry(m: MatchState, x: number, y: number): void {
    m.phase = 'play';
    m.phaseTimer = 0;
    const idx = m.controlled;
    m.players[0][idx].x = x;
    m.players[0][idx].y = y;
    m.owner = { side: 0, idx };
  }

  it('is on inside shooting range and off outside it', () => {
    const m = fresh();
    const goalY = attackGoalY(0, m.swapped);
    const dir = goalY === 0 ? 1 : -1;
    carry(m, CENTRE_X, goalY + dir * (SHOOT_RANGE - 10));
    expect(shotArmed(m)).toBe(true);
    carry(m, CENTRE_X, goalY + dir * (SHOOT_RANGE + 10));
    expect(shotArmed(m)).toBe(false);
  });

  it('agrees with the range the shot itself is decided on, all the way out', () => {
    const m = fresh();
    const goalY = attackGoalY(0, m.swapped);
    const dir = goalY === 0 ? 1 : -1;
    for (let d = 4; d < 320; d += 4) {
      carry(m, CENTRE_X, goalY + dir * d);
      const p = m.players[0][m.controlled];
      const shoots = Math.hypot(p.x - CENTRE_X, p.y - goalY) <= SHOOT_RANGE;
      expect(shotArmed(m), `at ${d} px`).toBe(shoots);
    }
  });

  it('stays off when the ball is not at the controlled man\'s feet', () => {
    const m = fresh();
    const goalY = attackGoalY(0, m.swapped);
    const dir = goalY === 0 ? 1 : -1;
    carry(m, CENTRE_X, goalY + dir * 60);
    expect(shotArmed(m)).toBe(true);
    // A loose ball: A is a slide tackle, not a shot.
    m.owner = null;
    expect(shotArmed(m)).toBe(false);
    // The CPU on the ball in the same place, likewise.
    m.owner = { side: 1, idx: m.controlled };
    expect(shotArmed(m)).toBe(false);
    // A teammate on the ball the stick is not holding.
    m.owner = { side: 0, idx: m.controlled === 1 ? 2 : 1 };
    expect(shotArmed(m)).toBe(false);
  });
});

/**
 * Switching players with C.
 *
 * A playtester stopped using the button because it was unpredictable enough to
 * be worse than nothing, and regularly left him driving a man running away
 * from the ball. The cause was not the ranking. `updateControlled` runs at the
 * top of every tick, *before* `humanAction`, and hands the stick to whoever is
 * 30 px nearer the ball than the current man — and a C press picks the second
 * or third nearest almost by definition, so the auto-switcher took the pick
 * back on the very next frame. The press looked like it did nothing, or like
 * it did something at random.
 */
describe('switching players with C', () => {
  const NEUTRAL = { x: 0, y: 0, a: false, b: false, c: false };
  const PRESS_C = { ...NEUTRAL, c: true };

  /** The human outfielder actually nearest the ball right now. */
  function nearestOutfielder(m: MatchState): number {
    let best = 1;
    let bestD = Infinity;
    for (let idx = 1; idx < TEAM_SIZE; idx++) {
      const p = m.players[0][idx];
      const d = Math.hypot(p.x - m.ball.x, p.y - m.ball.y);
      if (d < bestD) {
        bestD = d;
        best = idx;
      }
    }
    return best;
  }

  /**
   * A loose ball with the human outfielders strung out behind it and both
   * sides well clear of capture range, so nothing but the switch itself moves
   * the cursor.
   */
  function strungOut(m: MatchState): void {
    looseBallAt(m, CENTRE_X, CENTRE_Y);
    for (let idx = 1; idx < TEAM_SIZE; idx++) {
      m.players[0][idx].x = CENTRE_X;
      m.players[0][idx].y = CENTRE_Y + 40 + idx * 40;
    }
    for (let idx = 0; idx < TEAM_SIZE; idx++) {
      m.players[1][idx].x = 40;
      m.players[1][idx].y = 40;
    }
    m.controlled = nearestOutfielder(m);
  }

  it('keeps the man it picked instead of handing him straight back', () => {
    const m = fresh();
    strungOut(m);
    const before = m.controlled;
    tickMatch(m, DT, PRESS_C);
    const picked = m.controlled;
    expect(picked, 'C moved the cursor').not.toBe(before);
    // Four frames is long enough for the auto-switcher to have fired several
    // times and short enough that nobody has walked anywhere.
    for (let i = 0; i < 4; i++) tickMatch(m, DT, NEUTRAL);
    expect(m.controlled, 'the pick survived the auto-switcher').toBe(picked);
  });

  it('gives the cursor back to the nearest man once the hold runs out', () => {
    const m = fresh();
    strungOut(m);
    tickMatch(m, DT, PRESS_C);
    const picked = m.controlled;
    for (let i = 0; i < 90; i++) tickMatch(m, DT, NEUTRAL);
    expect(m.controlled, 'the hold expired').not.toBe(picked);
    expect(m.controlled).toBe(nearestOutfielder(m));
  });

  /**
   * A man on the floor or halfway through a slide does not answer the stick at
   * all — `stepHumanSide` drives a sliding player along his own facing whatever
   * the input says. That was survivable while the auto-switcher was undoing
   * the pick a frame later; with the pick now sticking for a second it is not.
   */
  it('will not hand over a man who cannot be driven', () => {
    for (const state of ['slide', 'down'] as const) {
      const m = fresh();
      strungOut(m);
      // Take out the two men C would otherwise reach for.
      const order = [...Array(TEAM_SIZE).keys()]
        .slice(1)
        .sort(
          (a, b) =>
            Math.hypot(m.players[0][a].x - m.ball.x, m.players[0][a].y - m.ball.y) -
            Math.hypot(m.players[0][b].x - m.ball.x, m.players[0][b].y - m.ball.y)
        );
      m.players[0][order[1]][state] = 0.3;
      m.players[0][order[2]][state] = 0.3;
      tickMatch(m, DT, PRESS_C);
      expect([order[1], order[2]], `picked a ${state}ing man`).not.toContain(m.controlled);
    }
  });
});

/**
 * The air-strike cue, which is the same argument as the shooting-range one
 * made about the other half of the A button.
 *
 * Off the ball, A is a header or a volley when `canAirStrike` says so and a
 * slide tackle when it does not — and a slide tackle costs its whole cooldown,
 * so guessing wrong does not merely waste the press, it takes the man out of
 * the move. Nothing on screen said which you were about to get, and a
 * playtester called it the most confusing thing in the cabinet: deliver a
 * cross, run in, press A, find out. `airArmed` turns the marker and the HUD
 * arrow sky blue while the window is open.
 *
 * The cue must not be allowed to drift from `humanAction`'s own branch, so it
 * is asserted against `canAirStrike` — which is that branch's condition — over
 * every axis the predicate reads, rather than at a couple of spots.
 */
describe('the air-strike cue', () => {
  /** A loose ball in the air, delivered from far enough away to be strikable. */
  function loose(m: MatchState, z: number, gap: number): void {
    m.phase = 'play';
    m.phaseTimer = 0;
    const p = m.players[0][m.controlled];
    p.x = CENTRE_X;
    p.y = CENTRE_Y;
    p.strike = 0;
    m.owner = null;
    m.kickGrace = null;
    m.ball.x = CENTRE_X + gap;
    m.ball.y = CENTRE_Y;
    m.ball.z = z;
    m.kickFrom = { x: CENTRE_X, y: CENTRE_Y - AIR_STRIKE_MIN_TRAVEL - gap - 10 };
  }

  it('agrees with the branch it cues, over height and distance', () => {
    const m = fresh();
    for (const fromCross of [false, true]) {
      m.lastFromCross = fromCross;
      for (let z = 0; z <= HEADER_Z + 10; z += 2) {
        for (let gap = 0; gap <= CROSS_STRIKE_R + 10; gap += 2) {
          loose(m, z, gap);
          expect(airArmed(m), `cross=${fromCross} z=${z} gap=${gap}`).toBe(
            canAirStrike(m, 0, m.controlled)
          );
        }
      }
    }
  });

  /**
   * The reach is the one axis the cue could plausibly have got wrong by
   * copying a constant, so it is pinned on both sides of both radii: a cross
   * may be met from further out than a loose ball in play.
   */
  it('reaches further for a cross than for any other ball in the air', () => {
    const m = fresh();
    const z = (TRAP_Z + VOLLEY_Z) / 2;
    m.lastFromCross = false;
    loose(m, z, AIR_STRIKE_R - 2);
    expect(airArmed(m), 'inside the open-play radius').toBe(true);
    loose(m, z, AIR_STRIKE_R + 2);
    expect(airArmed(m), 'outside the open-play radius').toBe(false);
    m.lastFromCross = true;
    loose(m, z, AIR_STRIKE_R + 2);
    expect(airArmed(m), 'a cross reaches past the open-play radius').toBe(true);
    loose(m, z, CROSS_STRIKE_R + 2);
    expect(airArmed(m), 'but not past its own').toBe(false);
  });

  /** The ball on the deck, or at somebody's feet, is a slide tackle. */
  it('stays off for a ball nobody can head', () => {
    const m = fresh();
    m.lastFromCross = true;
    loose(m, TRAP_Z - 1, 4);
    expect(airArmed(m), 'rolling along the floor').toBe(false);
    loose(m, HEADER_Z + 1, 4);
    expect(airArmed(m), 'over everybody').toBe(false);
    loose(m, HEADER_Z - 1, 4);
    expect(airArmed(m), 'inside the window, for contrast').toBe(true);
    m.owner = { side: 1, idx: 3 };
    expect(airArmed(m), 'a ball already under control').toBe(false);
  });

  /**
   * The two cues are three states of one signal, and the marker can only wear
   * one colour, so the mapping is pinned rather than left to the draw call.
   */
  it('resolves to one colour with the shooting-range cue', () => {
    const m = fresh();
    m.lastFromCross = true;
    loose(m, HEADER_Z - 4, 4);
    expect(aCue(m)).toBe('air');
    // The ball at his feet inside range is a shot, and a shot wins.
    const goalY = attackGoalY(0, m.swapped);
    const dir = goalY === 0 ? 1 : -1;
    const p = m.players[0][m.controlled];
    p.x = CENTRE_X;
    p.y = goalY + dir * (SHOOT_RANGE - 10);
    m.ball.z = 0;
    m.owner = { side: 0, idx: m.controlled };
    expect(shotArmed(m)).toBe(true);
    expect(aCue(m)).toBe('shot');
    // Out of range with the ball at his feet, A is a hoof: no cue at all.
    p.y = goalY + dir * (SHOOT_RANGE + 10);
    expect(aCue(m)).toBe('idle');
    // And a loose ball on the deck is a slide tackle: likewise none.
    m.owner = null;
    loose(m, 0, 4);
    expect(aCue(m)).toBe('idle');
  });
});

describe('the clock', () => {
  it('reaches exactly 90 over sixty seconds of play, and no faster', () => {
    const m = fresh();
    let ticks = 0;
    for (; m.phase !== 'over' && ticks < 60 * 240; ticks++) tickMatch(m, DT);
    expect(m.phase).toBe('over');
    expect(m.clock).toBe(FULL_TIME_MINUTES);
    expect(m.halfElapsed).toBeGreaterThanOrEqual(HALF_SECONDS);
    // Celebrations, half-time and set-piece placement cost real time but no
    // football, so the wall clock always exceeds the sixty seconds of play.
    expect(ticks * DT).toBeGreaterThan(2 * HALF_SECONDS);
  });

  it('does not advance during celebrations, freezes or restarts', () => {
    const m = fresh();
    tickMatch(m, DT);
    const atFreeze = m.clock;
    for (let i = 0; i < 20; i++) tickMatch(m, DT);
    expect(m.phase).toBe('kickoff');
    expect(m.clock).toBe(atFreeze);

    m.phase = 'goal';
    m.phaseTimer = 1;
    const atGoal = m.clock;
    for (let i = 0; i < 30; i++) tickMatch(m, DT);
    expect(m.clock).toBe(atGoal);
  });

  it('swaps ends at half-time', () => {
    const m = fresh();
    expect(m.swapped).toBe(false);
    expect(attackGoalY(0, m.swapped)).toBe(PITCH_L);
    for (let i = 0; i < 60 * 240 && m.half === 0; i++) tickMatch(m, DT);
    expect(m.half).toBe(1);
    expect(m.swapped).toBe(true);
    expect(attackGoalY(0, m.swapped)).toBe(0);
    expect(m.clock).toBeGreaterThanOrEqual(45);
  });
});

describe('boundaries and restarts', () => {
  it('awards a throw-in the other way over each touchline', () => {
    for (const [x, lastTouch] of [
      [-2, 0],
      [-2, 1],
      [PITCH_W + 2, 0],
      [PITCH_W + 2, 1]
    ] as const) {
      const m = fresh();
      looseBallAt(m, x, CENTRE_Y);
      m.lastTouch = lastTouch;
      const events = tickMatch(m, DT);
      const restart = events.find(e => e.type === 'restart');
      expect(restart).toBeDefined();
      if (restart?.type !== 'restart') throw new Error('no restart');
      expect(restart.kind).toBe('throwIn');
      expect(restart.side).toBe(1 - lastTouch);
    }
  });

  it('awards a corner when a defender puts it behind, and a goal kick when an attacker does', () => {
    for (const line of [0, PITCH_L]) {
      const defending = line === 0 ? 0 : 1;
      const attacking = (1 - defending) as 0 | 1;

      const corner = fresh();
      looseBallAt(corner, CENTRE_X + GOAL_HALF + 40, line === 0 ? -2 : PITCH_L + 2);
      corner.lastTouch = defending;
      const cornerEvents = tickMatch(corner, DT);
      const cornerRestart = cornerEvents.find(e => e.type === 'restart');
      if (cornerRestart?.type !== 'restart') throw new Error('no corner');
      expect(cornerRestart.kind).toBe('corner');
      expect(cornerRestart.side).toBe(attacking);

      const goalKick = fresh();
      looseBallAt(goalKick, CENTRE_X + GOAL_HALF + 40, line === 0 ? -2 : PITCH_L + 2);
      goalKick.lastTouch = attacking;
      const gkEvents = tickMatch(goalKick, DT);
      const gkRestart = gkEvents.find(e => e.type === 'restart');
      if (gkRestart?.type !== 'restart') throw new Error('no goal kick');
      expect(gkRestart.kind).toBe('goalKick');
      expect(gkRestart.side).toBe(defending);
    }
  });
});

describe('goal detection', () => {
  it('counts a ball crossing between the posts', () => {
    const m = fresh();
    looseBallAt(m, CENTRE_X, PITCH_L + 1, 0, 120);
    m.lastTouch = 0;
    const events = tickMatch(m, DT);
    const goal = events.find(e => e.type === 'goal');
    expect(goal).toBeDefined();
    if (goal?.type !== 'goal') throw new Error('no goal');
    expect(goal.side).toBe(0);
    expect(m.score[0]).toBe(1);
  });

  it('sends a shot that clips a post back into play instead', () => {
    const m = fresh();
    looseBallAt(m, CENTRE_X + GOAL_HALF - 0.5, PITCH_L + 0.5, 0, 300);
    m.lastTouch = 0;
    const events = tickMatch(m, DT);
    expect(events.some(e => e.type === 'post')).toBe(true);
    expect(events.some(e => e.type === 'goal')).toBe(false);
    expect(m.score[0]).toBe(0);
    expect(m.ball.y).toBeLessThan(PITCH_L);
  });

  it('waves away a ball that clears the bar', () => {
    const m = fresh();
    looseBallAt(m, CENTRE_X, PITCH_L + 1, 0, 200);
    m.ball.z = 40;
    m.ball.vz = 10;
    m.lastTouch = 0;
    const events = tickMatch(m, DT);
    expect(events.some(e => e.type === 'goal')).toBe(false);
    const restart = events.find(e => e.type === 'restart');
    if (restart?.type !== 'restart') throw new Error('no restart');
    expect(restart.kind).toBe('goalKick');
  });

  it('records the scorer and the minute in the log', () => {
    const m = fresh();
    for (let i = 0; i < 400; i++) tickMatch(m, DT);
    const minuteBefore = Math.round(m.clock);
    looseBallAt(m, CENTRE_X, PITCH_L + 1, 0, 120);
    m.lastTouch = 0;
    m.lastKicker[0] = 4;
    tickMatch(m, DT);
    expect(m.goals).toHaveLength(1);
    expect(m.goals[0].scorer).toBe(4);
    expect(m.goals[0].minute).toBeGreaterThanOrEqual(minuteBefore);
    expect(m.goals[0].minute).toBeLessThanOrEqual(FULL_TIME_MINUTES);
    expect(m.log.some(e => e.type === 'goal')).toBe(true);
  });

  it('lists at most three scorers a side for the full-time screen', () => {
    const m = fresh();
    for (let i = 0; i < 5; i++) {
      m.goals.push({
        side: 0,
        scorer: i,
        minute: i * 10,
        contact: 'ground',
        dribbled: false,
        fromCross: false
      });
    }
    expect(scorerList(m, 0)).toHaveLength(3);
    expect(scorerList(m, 1)).toHaveLength(0);
  });
});

describe('full time', () => {
  function runOut(m: MatchState): MatchEvent[] {
    m.half = 1;
    m.swapped = true;
    m.halfElapsed = HALF_SECONDS - DT / 2;
    m.phase = 'play';
    m.phaseTimer = 0;
    return tickMatch(m, DT);
  }

  it('lets a group match end level and calls it a draw', () => {
    const m = fresh({ knockout: false });
    m.score = [1, 1];
    const events = runOut(m);
    const end = events.find(e => e.type === 'end');
    if (end?.type !== 'end') throw new Error('no end');
    expect(end.winner).toBeNull();
    expect(end.pendingShootout).toBe(false);
    expect(m.phase).toBe('over');
  });

  it('sends a level knockout tie to penalties, never to a null-winner exit', () => {
    const m = fresh({ knockout: true });
    m.score = [2, 2];
    const events = runOut(m);
    const end = events.find(e => e.type === 'end');
    if (end?.type !== 'end') throw new Error('no end');
    expect(end.winner).toBeNull();
    expect(end.pendingShootout).toBe(true);
    expect(m.pendingShootout).toBe(true);
  });

  it('names the winner when the sides are not level', () => {
    for (const [score, winner] of [
      [[2, 1], 0],
      [[0, 3], 1]
    ] as const) {
      const m = fresh({ knockout: true });
      m.score = [score[0], score[1]];
      const events = runOut(m);
      const end = events.find(e => e.type === 'end');
      if (end?.type !== 'end') throw new Error('no end');
      expect(end.winner).toBe(winner);
      expect(end.pendingShootout).toBe(false);
    }
  });
});

describe('the speed ledger', () => {
  it('never lets the CPU out-run the player at any difficulty', () => {
    for (let d = 0; d <= 1.0001; d += 0.01) {
      expect(cpuSpeed(d)).toBeLessThan(HUMAN_SPEED);
    }
  });

  it('makes carrying the ball cost pace', () => {
    expect(DRIBBLE_FACTOR).toBeLessThan(1);
    expect(HUMAN_SPEED * DRIBBLE_FACTOR).toBeLessThan(HUMAN_SPEED * OFFBALL_FACTOR);
    expect(cpuSpeed(1) * DRIBBLE_FACTOR).toBeLessThan(HUMAN_SPEED);
  });
});

describe('contact and tackling', () => {
  it('picks the contact from the ball height, with no header button', () => {
    expect(resolveContact(0)).toBe('ground');
    expect(resolveContact(TRAP_Z - 0.1)).toBe('ground');
    expect(resolveContact(VOLLEY_Z - 0.1)).toBe('volley');
    expect(resolveContact(VOLLEY_Z)).toBe('header');
    expect(resolveContact(HEADER_Z)).toBe('header');
    expect(resolveContact(HEADER_Z + 1)).toBe('header');
  });

  it('rewards a head-on slide and punishes one from behind', () => {
    const carrier = {
      x: 100,
      y: 100,
      fx: 0,
      fy: 1,
      speed: 92,
      slide: 0,
      down: 0,
      slideCd: 0,
      press: 0,
      strike: 0,
      slideRolled: false
    };
    const headOn = { ...carrier, x: 100, y: 112, speed: 74 };
    const behind = { ...carrier, x: 100, y: 88, speed: 74 };
    const front = slideChance(0.6, carrier, headOn);
    const back = slideChance(0.6, carrier, behind);
    expect(front).toBeGreaterThan(back);
    expect(front).toBeGreaterThan(0.45);
    expect(front).toBeLessThan(0.62);
  });
});

describe('the keeper against a delivery in flight', () => {
  /**
   * He stays on his feet while a cross is over his head, and this is the third
   * place the same idea has had to be written down.
   *
   * `airborne` withdraws his advance while the ball is up and `trackTarget` puts
   * him on the landing spot, and **both of them were dead letters** because
   * `armKeeper` committed him to a *dive* the instant the delivery was played:
   * `stepKeeper` returns early for a diving keeper, so for the whole flight of
   * the cross he neither tracked nor walked, he slid along a line he chose when
   * the ball left the crosser's boot, at `KEEPER_DIVE` = 45 px/s against the
   * 120 px/s he walks at, toward where the *cross* would pass him rather than
   * where it was going to be met.
   *
   * A lofted ball is not a shot. Measured over 900 matches a cell, letting him
   * read it instead took the strongest wing station's air goals from 4.54 a
   * match at d = 0.25 to 2.97 and its double-figure scorelines from 8 in 900 to
   * none.
   */
  /** Put the human in possession out on the flank, facing the goal. */
  function onTheBall(m: MatchState, offsetX: number, depth: number): void {
    const goalY = attackGoalY(0, m.swapped);
    const dir = m.swapped ? -1 : 1;
    looseBallAt(m, CENTRE_X + offsetX, goalY - dir * depth);
    const p = m.players[0][6];
    p.x = CENTRE_X + offsetX;
    p.y = goalY - dir * depth;
    p.fx = 0;
    p.fy = dir;
    p.speed = 0;
    m.controlled = 6;
    m.owner = { side: 0, idx: 6 };
    m.ball.x = p.x;
    m.ball.y = p.y + dir * DRIBBLE_OFFSET;
    m.keepers[1].dive = null;
    m.kickGrace = null;
    m.prev = { a: false, b: false, c: false };
  }

  it('stays on its feet for a lofted ball and commits when one is struck', () => {
    // B is the lofted ball: a cross, a lofted pass, a corner. It leaves the
    // boot climbing, and he must not commit to it.
    const cross = fresh();
    const dir = cross.swapped ? -1 : 1;
    onTheBall(cross, 130, 55);
    tickMatch(cross, DT, { x: 0, y: dir, a: false, b: true, c: false });
    expect(cross.ball.vz, 'B really did loft it').toBeGreaterThan(0);
    expect(cross.keepers[1].dive, 'no dive committed to a ball on its way up').toBeNull();

    // A struck at goal off the deck is the ball he is there for, and he
    // commits to that one exactly as before.
    const shot = fresh();
    onTheBall(shot, 0, 120);
    shoot(shot, 0, 1, 0, 'ground');
    expect(shot.ball.vz, 'a struck shot stays down').toBe(0);
    expect(shot.keepers[1].dive, 'he commits to a ball struck at him').not.toBeNull();
  });
});

describe('a whole match runs to completion', () => {
  it('finishes, keeps everyone on the pitch, and logs a coherent scoreline', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const m = createMatch({ rng: seededRandom(seed * 7919), difficulty: 0.45, teams: TEAMS });
      playMatch(m, competent());
      expect(m.phase).toBe('over');
      expect(m.score[0]).toBe(m.goals.filter(g => g.side === 0).length);
      expect(m.score[1]).toBe(m.goals.filter(g => g.side === 1).length);
      for (const side of [0, 1] as const) {
        for (let idx = 0; idx < TEAM_SIZE; idx++) {
          const p = m.players[side][idx];
          expect(p.x).toBeGreaterThanOrEqual(0);
          expect(p.x).toBeLessThanOrEqual(PITCH_W);
          expect(p.y).toBeGreaterThanOrEqual(0);
          expect(p.y).toBeLessThanOrEqual(PITCH_L);
          expect(Number.isFinite(p.x)).toBe(true);
        }
      }
      expect(Number.isFinite(m.ball.x)).toBe(true);
      expect(Number.isFinite(m.ball.y)).toBe(true);
    }
  });

  it('is deterministic under the same seed', () => {
    const run = (): MatchState => {
      const m = createMatch({ rng: seededRandom(4242), difficulty: 0.45, teams: TEAMS });
      playMatch(m, competent());
      return m;
    };
    const a = run();
    const b = run();
    expect(a.score).toEqual(b.score);
    expect(a.goals).toEqual(b.goals);
    expect(a.stats.shots).toEqual(b.stats.shots);
  });

  it('never leaves the ball attached to a player who is not on the pitch', () => {
    const m = createMatch({ rng: seededRandom(11), difficulty: 0.65, teams: TEAMS });
    playMatch(m, competent());
    expect(m.ball.x).toBeGreaterThanOrEqual(-DRIBBLE_OFFSET);
    expect(m.ball.x).toBeLessThanOrEqual(PITCH_W + DRIBBLE_OFFSET);
  });
});
