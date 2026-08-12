/**
 * A single shot against a live, correctly-positioned keeper with every other
 * player parked away — the isolation rig section 7.3 of the specification
 * describes. It drives the real `match.ts` code path rather than a copy of the
 * keeper maths, so the sweep and the game can never drift apart.
 *
 * No keeper is ever benched, parked or disabled here: that is the whole point
 * of the suite this rig serves.
 */
import {
  createMatch,
  shoot,
  tickMatch,
  DRIBBLE_OFFSET,
  type ContactType,
  type MatchState
} from '../../src/games/football/match';
import { keeperSkill, restPosition } from '../../src/games/football/keeper';
import { CENTRE_X, PITCH_L, TEAM_SIZE, attackGoalY } from '../../src/games/football/pitch';
import { teamByCode } from '../../src/games/football/teams';

export const DT = 1 / 60;

export type ShotOutcome = 'goal' | 'save' | 'off' | 'post';

export interface ShotOptions {
  /** Distance from the shooter to the goal line, in pitch pixels. */
  distance: number;
  /** Aim in [-1, 1] across the +-(GOAL_HALF + 14) envelope. */
  aim: number;
  power: number;
  rng: () => number;
  difficulty?: number;
  /** Keeper rating 1..5 of the defending team. */
  keeperRating?: number;
  contact?: ContactType;
  /** Lateral offset of the shooter from the centre of the pitch. */
  offsetX?: number;
  /**
   * Where the keeper is standing when the shot is struck. A cross drags his
   * lagged tracking off centre, which is exactly why a header at the far post
   * is a real weapon, so the header cells set this rather than pretending he
   * is always on his spot.
   */
  keeperX?: number;
}

const KEEPER_TEAMS: Record<number, string> = {
  1: 'API',
  2: 'GAM',
  3: 'TOR',
  4: 'AQU',
  5: 'AQU'
};

/** Move everyone except the shooter and the defending keeper out of the way. */
function parkEveryone(m: MatchState, shooter: number): void {
  for (let idx = 0; idx < TEAM_SIZE; idx++) {
    if (idx > 0) {
      const away = m.players[1][idx];
      away.x = 20 + idx * 6;
      away.y = 20;
      away.speed = 0;
    }
    if (idx !== shooter) {
      const mate = m.players[0][idx];
      mate.x = PITCH_W_EDGE - idx * 6;
      mate.y = 20;
      mate.speed = 0;
    }
  }
}

const PITCH_W_EDGE = 320;

export function shootAt(opts: ShotOptions): ShotOutcome {
  const difficulty = opts.difficulty ?? 0.55;
  const rating = opts.keeperRating ?? 3;
  const m = createMatch({
    rng: opts.rng,
    difficulty,
    teams: [teamByCode('LUP'), teamByCode(KEEPER_TEAMS[rating])]
  });
  m.keepers[1].skill = keeperSkill(rating, difficulty);
  // Straight to open play: the kickoff freeze is 48 ticks of nothing and the
  // rig runs tens of thousands of these.
  m.phase = 'play';
  m.phaseTimer = 0;

  const shooter = 6;
  parkEveryone(m, shooter);
  const goalY = attackGoalY(0, m.swapped);
  const dir = goalY === PITCH_L ? 1 : -1;
  const p = m.players[0][shooter];
  p.x = CENTRE_X + (opts.offsetX ?? 0);
  p.y = goalY - dir * opts.distance;
  p.fx = 0;
  p.fy = dir;
  p.speed = 0;
  m.controlled = shooter;
  m.owner = { side: 0, idx: shooter };
  m.ball.x = p.x;
  m.ball.y = p.y + dir * DRIBBLE_OFFSET;
  m.ball.z = 0;
  m.ball.vx = 0;
  m.ball.vy = 0;
  m.ball.vz = 0;

  const gk = m.players[1][0];
  gk.x = opts.keeperX ?? CENTRE_X;
  // "Correctly positioned" includes his depth: a keeper comes out to narrow
  // the angle as a striker closes on him, and standing him on his line for a
  // six-yard-box shot would sweep a keeper the game never fields.
  gk.y = restPosition(gk.x, m.ball.y, goalY, -dir as 1 | -1).y;
  gk.speed = 0;
  m.keepers[1].trackX = gk.x;
  m.keepers[1].dive = null;
  m.keepers[1].parryLock = 0;

  // 7.3's header cell is "a header from a cross", and the game distinguishes
  // that from a header met off a hopeful clearance, so the rig has to say
  // which one it is asking about.
  m.lastFromCross = (opts.contact ?? 'ground') === 'header';
  shoot(m, 0, opts.power, opts.aim, opts.contact ?? 'ground');

  for (let i = 0; i < 300; i++) {
    const events = tickMatch(m, DT);
    for (const e of events) {
      if (e.type === 'goal') return 'goal';
      if (e.type === 'save') return 'save';
      if (e.type === 'post') return 'post';
      if (e.type === 'restart') return 'off';
    }
    if (m.phase !== 'play') break;
  }
  return 'off';
}


/** Goal share over `n` seeded repeats of one cell. */
export function goalRate(opts: Omit<ShotOptions, 'rng'>, seeds: number, seed0 = 0): number {
  let goals = 0;
  for (let i = 0; i < seeds; i++) {
    if (shootAt({ ...opts, rng: lcg(seed0 + i * 7919 + 13) }) === 'goal') goals++;
  }
  return goals / seeds;
}

/** The repo's seeded LCG, inlined so the harness has no test-only import cycle. */
export function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}
