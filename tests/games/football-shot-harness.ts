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
 * **Where the keeper is takes three numbers, not one, because the game moves
 * him in three stages and reads the last of them.** His tracker is a lagged
 * copy of the ball (`trackLag`); the spot he is walking to is computed from
 * that copy (`keeperRest`); and his *body* is however far along the walk to
 * that spot he has got (`walkLag`). `approachGap` and `commitDive` read the
 * body and nothing else. For six rounds the rig had the first stage and then
 * teleported the body onto the third — `gk.x = rest.x` — so the walk lag was
 * identically zero in every cell by construction, and the quantity the keeper
 * code actually consumes was the one axis the grid did not have. Measured live
 * at d = 0.25, the body sits 21 px (competent) to 38 px (a wing routine) from
 * the ball at aerial contact against a `REACH_BASE` of 26, and roughly half of
 * that is walk rather than tracker (issue #273, finding 1).
 *
 * **And the spot he walks to is asked for rather than copied.** `keeperRest`
 * is exported from `match.ts` for this rig alone. The three lines it replaces
 * called `restPosition(trackX, ...)` directly and dropped both of the terms
 * round 6 added — the blend toward the landing point and the withdrawn advance
 * — so with the ball off the deck the rig stood him somewhere the game never
 * would, and `trackTarget` could not fire in the grid that was certifying it.
 */
import {
  ASSIST_WINDOW,
  createMatch,
  keeperRest,
  shoot,
  tickMatch,
  DRIBBLE_OFFSET,
  type ContactType,
  type MatchState
} from '../../src/games/football/match';
import { keeperSkill } from '../../src/games/football/keeper';
import { clamp } from '../../src/games/engine/math';
import {
  CENTRE_X,
  PITCH_L,
  PITCH_W,
  TEAM_SIZE,
  attackGoalY
} from '../../src/games/football/pitch';
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
   * How far the keeper's **body** still is from the spot his tracker sends him
   * to, in pitch pixels, and the axis this grid spent six rounds without.
   *
   * `trackLag` above is a lag in what he *believes*; this is a lag in where he
   * *is*, and they are different quantities with different sizes. He walks to
   * `keeperRest` at `KEEPER_WALK` = 120 px/s, so a target that moves 40 px
   * across him leaves him a third of a second — twenty ticks of the match loop
   * — behind it, and `keeperRest`'s own docstring calls that out as the honest
   * residual round 6 deliberately left in place. Nothing downstream reads the
   * spot: `approachGap` takes `keeper.x`, `commitDive` takes `keeper.x` as its
   * `restX`, and the rig used to write `gk.x = rest.x` before either of them
   * ran. So the certifying grid measured a keeper who had already arrived, at
   * every cell, at every station, in every round.
   *
   * The sign is the body's position relative to the spot, mirroring
   * `trackLag`'s: `bodyX = restX - walkLag`, so a positive lag is a body still
   * short of a target that has moved to its right. Both signs are real — they
   * are the two flanks — and a sweep that tries one has swept one wing.
   *
   * It is lateral only. His depth is a slow function of the ball's, and the
   * whole of the keeper's positioning story — the angle, the frame, the
   * tracker, the reach — is written across the goal rather than along the
   * pitch; lagging his depth as well would move which tick the ball crosses
   * his plane on and confound the axis with the crossing test.
   *
   * Zero is the honest default and is what every cell written before this
   * parameter existed measures: a shooter who has carried the ball to a spot
   * and stood still has left the keeper long enough to arrive. It is not the
   * honest default for a ball that has just been moved across him.
   */
  walkLag?: number;
  /**
   * Whether the ball arrived off a completed pass or a delivered cross — an
   * open `m.assist` window at the instant it is struck.
   *
   * This is the largest single term in the shot model and the grid could not
   * express it at all. `armKeeper` charges an assisted ground strike both
   * `ASSIST_DIVE_PENALTY` (half a dive) and `ASSIST_REACT_LOSS` (0.12 s of
   * reaction already spent on the previous ball), and the second of those is
   * worth more than everything else the window does put together. There is not
   * one occurrence of `assist` anywhere in this rig's history, so `assisted`
   * was false in every cell of the 7.3 distance rows — while live, about three
   * quarters of a competent player's shots are struck inside an open window
   * (issue #273, finding 6).
   *
   * `armKeeper` gates it on the strike being a **ground** contact, so setting
   * this on a header cell is deliberately a no-op on the keeper: that half of
   * round 6's fix is what the flag lets a cell prove rather than assume.
   *
   * Default false, which is every cell written before this parameter existed:
   * a shooter striking a ball he already had.
   */
  assisted?: boolean;
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
   * It pins his **tracker** with him, which is what makes it an override
   * rather than an axis: a cell that says where he stands has said everything
   * about his position, and nothing is left for a lag to be a lag *of*. A cell
   * that wants his body away from his target sets `walkLag`, which is the
   * mechanism; this is for a position no lag of either kind would produce.
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
  /**
   * How high the ball is when it is struck, which for a header off a cross is
   * never zero and in this rig always was.
   *
   * `kick` carries the ball's height through the strike untouched, so a header
   * met at `ballZ` crosses the keeper's plane at very nearly that height: at
   * `HEADER_SPEED` a ball struck twenty pixels in front of him is over him in
   * 0.07 s and has fallen about two pixels doing it. That is the whole of the
   * 22-to-26 band this axis exists to reach. `KEEPER_JUMP_Z` is 22 and
   * `HEADER_Z` lets a header be met as high as 30, so every header struck
   * between those two crosses him above his standing claim, and until
   * `heightReach` those were goals he was never rolled for.
   *
   * Default 0, which is every cell written before this parameter existed: a
   * shooter striking a still ball off the deck, and `kick` then leaves it there.
   */
  ballZ?: number;
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

/**
 * How far in from a touchline the parked players are stacked. The two sides
 * mirror each other about the halfway line, so both are written from this one
 * margin and the right-hand edge is derived from `PITCH_W` rather than hard
 * coded: a change to the pitch's width then moves both stacks together instead
 * of silently pushing one of them out of play.
 */
const PARK_MARGIN = 20;

/** Move everyone except the shooter and the defending keeper out of the way. */
function parkEveryone(m: MatchState, shooter: number): void {
  for (let idx = 0; idx < TEAM_SIZE; idx++) {
    if (idx > 0) {
      const away = m.players[1][idx];
      away.x = PARK_MARGIN + idx * 6;
      away.y = 20;
      away.speed = 0;
    }
    if (idx !== shooter) {
      const mate = m.players[0][idx];
      mate.x = PITCH_W - PARK_MARGIN - idx * 6;
      mate.y = 20;
      mate.speed = 0;
    }
  }
}

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
  m.ball.z = opts.ballZ ?? 0;
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
  m.keepers[1].trackX = trackX;
  m.keepers[1].dive = null;
  m.keepers[1].parryLock = opts.parryLock ?? 0;
  // The spot is the game's own — `keeperRest`, the function `stepKeeper` walks
  // him to — rather than this file's reading of it, so the rig can no longer
  // certify a positioning rule the game does not run.
  //
  // His **body** is `walkLag` px short of that spot, and only a cell that says
  // so gets a keeper who has arrived. His depth is not lagged; see `walkLag`.
  //
  // Clamped to the touchlines exactly as `stepKeeper` clamps him, so no cell
  // can stand him somewhere his own step function would not leave him.
  const rest = keeperRest(m, 1);
  gk.x = clamp(opts.keeperX ?? rest.x - (opts.walkLag ?? 0), 12, PITCH_W - 12);
  gk.y = rest.y;
  gk.speed = 0;

  // 7.3's header cell is "a header from a cross", and the game distinguishes
  // that from a header met off a hopeful clearance, so the rig has to say
  // which one it is asking about.
  m.lastFromCross = (opts.contact ?? 'ground') === 'header';
  // A ball that arrived off a completed pass catches the keeper still
  // adjusting to where it came from, and that window is the largest term in
  // the shot model. Off by default; see `assisted`.
  m.assist = opts.assisted ? { side: 0, t: ASSIST_WINDOW } : null;
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
