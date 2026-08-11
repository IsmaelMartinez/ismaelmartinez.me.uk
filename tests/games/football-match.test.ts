import { describe, it, expect } from 'vitest';
import { seededRandom } from './seeded-random';
import {
  createMatch,
  tickMatch,
  resolveContact,
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
import { teamByCode } from '../../src/games/football/teams';
import { passive, competent } from './football-policies';

const DT = 1 / 60;
const TEAMS: [ReturnType<typeof teamByCode>, ReturnType<typeof teamByCode>] = [
  teamByCode('LUP'),
  teamByCode('TOR')
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
    const m = fresh();
    const log = playMatch(m, competent());
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
