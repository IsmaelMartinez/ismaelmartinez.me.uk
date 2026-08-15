import { describe, it, expect } from 'vitest';
import { seededRandom } from './seeded-random';
import {
  boundaryRestart,
  cornerMarkers,
  goalKickAim,
  isProtected,
  throwCannotScore,
  touchlineFor,
  GOAL_KICK_DEADLINE,
  RESTART_PAUSE,
  THROW_DEADLINE,
  THROW_PROTECT
} from '../../src/games/football/setpieces';
import {
  CENTRE_X,
  CENTRE_Y,
  GOAL_HALF,
  PITCH_L,
  PITCH_W,
  SIX_DEPTH,
  TEAM_SIZE,
  attackGoalY,
  ownGoalY
} from '../../src/games/football/pitch';
import { createMatch, tickMatch, type MatchState } from '../../src/games/football/match';
import { teamByCode } from '../../src/games/football/teams';

const DT = 1 / 60;

function fresh(): MatchState {
  return createMatch({
    rng: seededRandom(21),
    difficulty: 0.45,
    teams: [teamByCode('ENG'), teamByCode('ESP')]
  });
}

/** Put the ball out of play in one tick and let the restart be awarded. */
function forceOut(m: MatchState, x: number, y: number, lastTouch: 0 | 1): void {
  m.phase = 'play';
  m.phaseTimer = 0;
  m.owner = null;
  m.kickGrace = null;
  m.restart = null;
  m.ball.x = x;
  m.ball.y = y;
  m.ball.z = 0;
  m.ball.vx = 0;
  m.ball.vy = 0;
  m.ball.vz = 0;
  m.lastTouch = lastTouch;
  tickMatch(m, DT);
}

/** Tick past the banner pause so the taker actually has the ball. */
function intoRestart(m: MatchState): void {
  for (let i = 0; i < Math.ceil(RESTART_PAUSE / DT) + 2 && m.phase !== 'play'; i++) {
    tickMatch(m, DT);
  }
}

describe('boundaryRestart', () => {
  it('returns null while the ball is still on the field', () => {
    expect(boundaryRestart(CENTRE_X, CENTRE_Y, 0, false)).toBeNull();
    expect(boundaryRestart(0, 0, 0, false)).toBeNull();
    expect(boundaryRestart(PITCH_W, PITCH_L, 1, false)).toBeNull();
  });

  it('places a throw on the touchline the ball crossed', () => {
    const left = boundaryRestart(-4, 300, 0, false);
    expect(left?.kind).toBe('throwIn');
    expect(left?.x).toBe(0);
    expect(left?.y).toBeCloseTo(300, 6);
    expect(left?.side).toBe(1);
    expect(touchlineFor(-4)).toBe(0);

    const right = boundaryRestart(PITCH_W + 4, 120, 1, false);
    expect(right?.x).toBe(PITCH_W);
    expect(right?.side).toBe(0);
    expect(touchlineFor(PITCH_W + 4)).toBe(PITCH_W);
  });

  it('places a corner at the nearer flag and a goal kick on the six-yard line', () => {
    const corner = boundaryRestart(20, -3, 0, false);
    expect(corner?.kind).toBe('corner');
    expect(corner?.x).toBeLessThan(CENTRE_X);
    expect(corner?.y).toBeGreaterThanOrEqual(0);
    expect(corner?.keeperTakes).toBe(false);

    const goalKick = boundaryRestart(20, -3, 1, false);
    expect(goalKick?.kind).toBe('goalKick');
    expect(goalKick?.keeperTakes).toBe(true);
    expect(goalKick?.side).toBe(0);
    expect(goalKick?.y).toBeCloseTo(SIX_DEPTH - 4, 6);
    expect(Math.abs((goalKick?.x ?? 0) - CENTRE_X)).toBeLessThanOrEqual(GOAL_HALF);
  });

  it('gives each restart the deadline the manual describes', () => {
    expect(boundaryRestart(-4, 300, 0, false)?.deadline).toBe(THROW_DEADLINE);
    expect(boundaryRestart(20, -3, 1, false)?.deadline).toBe(GOAL_KICK_DEADLINE);
  });
});

describe('corner markers', () => {
  it('offers exactly three landing spots, all inside the box in front of goal', () => {
    for (const swapped of [false, true]) {
      for (const side of [0, 1] as const) {
        const goalY = attackGoalY(side, swapped);
        const markers = cornerMarkers(goalY, 20, swapped, side);
        expect(markers).toHaveLength(3);
        for (const marker of markers) {
          expect(marker.x).toBeGreaterThan(0);
          expect(marker.x).toBeLessThan(PITCH_W);
          expect(marker.y).toBeGreaterThanOrEqual(0);
          expect(marker.y).toBeLessThanOrEqual(PITCH_L);
          expect(Math.abs(marker.y - goalY)).toBeLessThan(60);
        }
        // Near post, centre, far post: three distinct lateral positions.
        expect(new Set(markers.map(mk => mk.x)).size).toBe(3);
      }
    }
  });

  it('flips near and far with the corner the ball went out at', () => {
    const left = cornerMarkers(PITCH_L, 4, false, 0);
    const right = cornerMarkers(PITCH_L, PITCH_W - 4, false, 0);
    expect(left[0].x).toBeLessThan(CENTRE_X);
    expect(right[0].x).toBeGreaterThan(CENTRE_X);
  });
});

describe('goal kicks', () => {
  it('goes straight up the middle when no direction is held', () => {
    expect(goalKickAim(0, 0, 1)).toEqual({ x: 0, y: 1 });
    expect(goalKickAim(0, 0, -1)).toEqual({ x: 0, y: -1 });
    expect(goalKickAim(0.1, -0.05, 1)).toEqual({ x: 0, y: 1 });
  });

  it('takes any held direction instead, normalised', () => {
    const aim = goalKickAim(3, 4, 1);
    expect(Math.hypot(aim.x, aim.y)).toBeCloseTo(1, 6);
    expect(aim.x).toBeCloseTo(0.6, 6);
  });

  it('clears itself if the keeper dawdles past the deadline', () => {
    const m = fresh();
    forceOut(m, 20, -3, 1);
    expect(m.restart?.kind).toBe('goalKick');
    intoRestart(m);
    expect(m.owner).toEqual({ side: 0, idx: 0 });

    let released = -1;
    for (let i = 0; i < 400; i++) {
      tickMatch(m, DT);
      if (!m.owner || m.owner.idx !== 0) {
        released = i * DT;
        break;
      }
    }
    expect(released).toBeGreaterThan(0);
    expect(released).toBeLessThanOrEqual(GOAL_KICK_DEADLINE + 0.1);
    expect(Math.hypot(m.ball.vx, m.ball.vy)).toBeGreaterThan(0);
  });
});

describe('throw-ins', () => {
  it('protects the taker for the untacklable window', () => {
    expect(isProtected(0)).toBe(true);
    expect(isProtected(THROW_PROTECT - 0.01)).toBe(true);
    expect(isProtected(THROW_PROTECT)).toBe(false);
  });

  it('keeps the ball with the taker through the protected window', () => {
    const m = fresh();
    forceOut(m, -3, CENTRE_Y, 1);
    intoRestart(m);
    const taker = m.owner;
    expect(taker?.side).toBe(0);
    // Crowd the taker: nothing may take it off him while he is protected.
    for (let idx = 1; idx < TEAM_SIZE; idx++) {
      m.players[1][idx].x = m.ball.x;
      m.players[1][idx].y = m.ball.y;
    }
    for (let i = 0; i < Math.floor((THROW_PROTECT - 0.05) / DT); i++) {
      tickMatch(m, DT);
      expect(m.owner?.side).toBe(0);
    }
  });

  it('releases automatically once the taker runs out of patience', () => {
    const m = fresh();
    forceOut(m, -3, CENTRE_Y, 1);
    intoRestart(m);
    expect(m.owner).not.toBeNull();
    let released = -1;
    for (let i = 0; i < 400; i++) {
      tickMatch(m, DT);
      if (m.restart === null) {
        released = i * DT;
        break;
      }
    }
    expect(released).toBeGreaterThan(0);
    expect(released).toBeLessThanOrEqual(THROW_DEADLINE + 0.1);
  });

  it('cannot score directly', () => {
    expect(throwCannotScore('throwIn')).toBe(true);
    expect(throwCannotScore('corner')).toBe(false);
    expect(throwCannotScore('goalKick')).toBe(false);

    const m = fresh();
    forceOut(m, -3, CENTRE_Y, 1);
    intoRestart(m);
    expect(m.noScore).toBe(true);
    // Fire the thrown ball straight into the goal it is attacking.
    m.owner = null;
    m.kickGrace = null;
    m.restart = null;
    m.ball.x = CENTRE_X;
    m.ball.y = attackGoalY(0, m.swapped) + 1;
    m.ball.vy = 200;
    const events = tickMatch(m, DT);
    expect(events.some(e => e.type === 'goal')).toBe(false);
    expect(m.score).toEqual([0, 0]);
  });

  it('clears the no-score flag as soon as anyone else touches it', () => {
    const m = fresh();
    forceOut(m, -3, CENTRE_Y, 1);
    intoRestart(m);
    expect(m.noScore).toBe(true);
    m.owner = null;
    m.kickGrace = null;
    m.restart = null;
    m.ball.x = m.players[0][2].x;
    m.ball.y = m.players[0][2].y;
    m.ball.vx = 0;
    m.ball.vy = 0;
    tickMatch(m, DT);
    expect(m.owner).not.toBeNull();
    expect(m.noScore).toBe(false);
  });
});

describe('restart placement inside the match', () => {
  it('teleports the taker onto the ball and hands it to the right side', () => {
    const m = fresh();
    forceOut(m, PITCH_W + 3, 180, 0);
    expect(m.phase).toBe('restart');
    intoRestart(m);
    expect(m.owner?.side).toBe(1);
    const taker = m.players[1][m.owner!.idx];
    expect(Math.abs(taker.x - PITCH_W)).toBeLessThan(4);
    expect(Math.abs(taker.y - 180)).toBeLessThan(4);
  });

  it('pauses the clock while the taker is being placed', () => {
    const m = fresh();
    for (let i = 0; i < 200; i++) tickMatch(m, DT);
    forceOut(m, PITCH_W + 3, 180, 0);
    const clock = m.clock;
    for (let i = 0; i < Math.floor(RESTART_PAUSE / DT) - 1; i++) tickMatch(m, DT);
    expect(m.phase).toBe('restart');
    expect(m.clock).toBe(clock);
  });

  it('offers the three markers only for a corner', () => {
    const m = fresh();
    forceOut(m, 20, PITCH_L + 3, 1);
    expect(m.restart?.kind).toBe('corner');
    intoRestart(m);
    expect(m.markers).toHaveLength(3);

    const throwIn = fresh();
    forceOut(throwIn, -3, CENTRE_Y, 1);
    intoRestart(throwIn);
    expect(throwIn.markers).toHaveLength(0);
  });

  it('gives the defending side the goal kick at its own end', () => {
    const m = fresh();
    const own = ownGoalY(0, m.swapped);
    forceOut(m, CENTRE_X + 90, own === 0 ? -3 : PITCH_L + 3, 1);
    expect(m.restart?.kind).toBe('goalKick');
    expect(m.restart?.side).toBe(0);
    expect(m.restart?.taker).toBe(0);
  });
});
