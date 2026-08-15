/**
 * A single shot against a live, correctly-positioned keeper with every other
 * player parked away — the isolation rig section 7.3 of the specification
 * describes. It drives the real `match.ts` code path rather than a copy of the
 * keeper maths, so the sweep and the game can never drift apart.
 *
 * No keeper is ever benched, parked or disabled here: that is the whole point
 * of the suite this rig serves. He is not *misplaced* either — he stands on
 * the angle rather than in the middle of his goal, because a keeper parked on
 * `CENTRE_X` is a keeper every offset shooter beats at the near post, and a
 * rig that only ever fields him there cannot measure the shot that beats him.
 * See `keeperX`.
 *
 * The rig has two axes for where he is, and for five rounds it had only one.
 * `keeperX` says where he *stands*. `trackLag` says how stale his lateral copy
 * of the ball is when the shot is struck — and that is the axis the game
 * itself moves him on, because `restPosition` is fed `gk.trackX` and never
 * `ball.x`. Every cell of the 7.3 grid was measured at lag zero, a converged
 * tracker, which is the honest reading for a carried ball and the wrong one
 * for a crossed one. An exploit that lives entirely at lag >= 30 is invisible
 * to a grid without that axis however wide the grid is, and one was.
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
  /**
   * Aim in [-1, 1], passed straight into `shoot`, which maps it across
   * `+-AIM_SPAN` — a ball's width inside each post. Full stick is a legal
   * target, not a structural miss. The number is deliberately *not* restated
   * here; `AIM_SPAN` in `match.ts` is the one place it is written down.
   *
   * This line used to give the number, and gave the wrong one: it read
   * `+-(GOAL_HALF + 14)`, the specification's original wider-than-the-mouth
   * envelope, long after `shoot` had stopped implementing it. An independent
   * audit built its own harness from this sentence, aimed at points it
   * believed were inside the frame, and reported "81 of 320 cells at exactly
   * 0 %" — an artefact of the stale docstring rather than a property of the
   * game. The repo's own suite and a second audit were right. Naming the
   * constant instead of copying its value is what stops it happening twice.
   */
  aim: number;
  power: number;
  rng: () => number;
  difficulty?: number;
  /** Keeper rating 1..5 of the defending team. */
  keeperRating?: number;
  contact?: ContactType;
  /**
   * Lateral offset of the shooter from the centre of the pitch. It moves the
   * keeper too, unless `keeperX` pins him: he stands on the angle from the
   * ball, so an offset shooter is by definition facing a keeper who has come
   * across to his near post.
   */
  offsetX?: number;
  /**
   * How stale the keeper's lateral copy of the ball is when the shot is
   * struck, in pitch pixels, and the axis this grid spent five rounds without.
   *
   * The keeper does not set his lateral position from the ball. He sets it
   * from `gk.trackX`, an exponentially lagged copy of `ball.x` with a time
   * constant of `trackLag(skill)` — about 0.16 s. A ball crossed along the
   * face of goal at 200-300 px/s therefore leaves that copy 30-50 px stale,
   * and `restPosition` puts him on the angle from **where he thinks the ball
   * is**, which is the wrong lateral spot by exactly that much.
   *
   * The sign is the tracker's position relative to the ball: `trackX =
   * ball.x - trackLag`, so a positive lag is a tracker still short of a ball
   * that has moved to its right, and a negative one is a tracker still beyond
   * a ball that has moved to its left. Both are real deliveries — they are the
   * two flanks — so a sweep that only tries one sign has only swept one wing.
   *
   * Zero is the honest default and is what every cell written before this
   * parameter existed measures: a shooter who has carried the ball to a spot
   * has stood still far longer than the time constant, so the tracker has
   * converged. It is *not* the honest default for a ball that has just been
   * whipped across him, which is the whole point of the axis.
   *
   * `keeperX` wins over this: a cell that pins where the keeper stands has
   * said everything about his position, and his tracker is pinned with him.
   */
  trackLag?: number;
  /**
   * Seconds of `PARRY_LOCK` still running when the shot is struck, which is
   * what a follow-up off a rebound is.
   *
   * `keeperPlane` returns before it does anything at all while
   * `gk.parryLock > 0` — the keeper is on the floor and is not consulted about
   * the ball. That is a defensible animation state and an indefensible
   * *outcome* state: the whole of `resolveSave` is skipped, so the shot is not
   * a probability, it is a result. Default 0, which is every cell written
   * before this parameter existed and is a keeper who is standing up.
   */
  parryLock?: number;
  /**
   * Where the keeper is standing when the shot is struck, **overriding** both
   * the default and `trackLag`.
   *
   * The default is `restPosition` from a tracker `trackLag` px stale — zero by
   * default, i.e. converged on the ball: the keeper is on the angle, which is
   * where the game puts him when the ball has been in front of him long enough
   * to be seen. Pinning him somewhere else is for cells that want a position
   * no lag would produce; a cell that wants him wrong-footed *the way the game
   * wrong-foots him* sets `trackLag` instead, because that is the mechanism.
   *
   * This line used to say the opposite — that a cell wanting him caught
   * mid-adjustment "pins `keeperX`". That was the whole blind spot: pinning
   * `keeperX` also pins `trackX` to the same value, so the pinned keeper is
   * standing exactly where his own tracker says the ball is, which is a keeper
   * who is *not* lagging. There was no way to express a stale tracker at all,
   * and the entire exploit lives at lag >= 30.
   *
   * This parameter used to have no default at all and the keeper was simply
   * parked at `CENTRE_X`. Every offset-shooter cell in the grid therefore
   * measured a shot at a keeper standing in the middle of his goal, which is
   * the one position from which the near post is never covered — so the sweep
   * could not see that the keeper's frame was clamped to `CENTRE_X +- 36` and
   * that beyond about 55 px of ball offset the true bisector was outside it,
   * pinning him off the near-post line. An audit measured the near-post finish
   * at 0.955 from a spot where the across-goal finish, which this rig did
   * sweep, converts 0.369. The frame is `postFrame` now and travels with him;
   * with the keeper standing where the game actually puts him, this rig's
   * widest cells read 0.20-0.23 either side.
   */
  keeperX?: number;
}

/**
 * A side per Keeper rating, so the defending team's own rating agrees with the
 * one the rig then forces onto `keepers[1].skill`. The roster tops out at 4 and
 * bottoms out at 2, so rating 5 reuses the best keeper on it and rating 1 takes
 * the weakest side.
 */
const KEEPER_TEAMS: Record<number, string> = {
  1: 'SCO',
  2: 'CMR',
  3: 'ESP',
  4: 'BEL',
  5: 'BEL'
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
    teams: [teamByCode('ENG'), teamByCode(KEEPER_TEAMS[rating])]
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
  // "Correctly positioned" includes his depth *and* his angle: a keeper comes
  // out to narrow the angle as a striker closes on him, and he stands on the
  // bisector from where he believes the ball is rather than in the middle of
  // his goal. Standing him on his line, or on the centre spot of the mouth,
  // for an offset shot would sweep a keeper the game never fields.
  //
  // ...and his lateral position comes from his *tracker*, not from the ball,
  // because that is what `stepKeeper` does. The tracker is converged by
  // default, which is the honest reading for a shooter who has carried the
  // ball to a spot: the time constant is about a sixth of a second and the
  // camping policies stand still for far longer than that. A cell that wants
  // him caught mid-adjustment — a ball whipped across the face of goal faster
  // than he can copy it — sets `trackLag`, and the tracker is left stale so
  // that it keeps converging through the flight exactly as it does in play.
  const trackX = opts.keeperX ?? m.ball.x - (opts.trackLag ?? 0);
  const rest = restPosition(trackX, m.ball.y, goalY, -dir as 1 | -1);
  gk.x = opts.keeperX ?? rest.x;
  gk.y = rest.y;
  gk.speed = 0;
  m.keepers[1].trackX = trackX;
  m.keepers[1].dive = null;
  m.keepers[1].parryLock = opts.parryLock ?? 0;

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
