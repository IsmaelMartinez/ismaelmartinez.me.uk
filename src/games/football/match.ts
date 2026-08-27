/**
 * The CALCIO '90 match: ball physics with a real height axis, possession,
 * shooting, tackling, both keepers, the three stoppages and the compressed
 * clock. DOM-free and deterministic under an injected RNG, so tests play whole
 * matches headlessly at a fixed dt.
 *
 * Seven a side, two halves of thirty real seconds shown as 0' to 90', ends
 * swapped at the interval. No fouls, no cards, no offside, no extra time: a
 * knockout tie level at full time reports `pendingShootout` and shootout.ts
 * takes over.
 */
import { clamp } from '../engine/math';
import {
  PITCH_W,
  PITCH_L,
  CENTRE_X,
  CENTRE_Y,
  GOAL_HALF,
  GOAL_HEIGHT,
  TEAM_SIZE,
  anchorFor,
  attackDir,
  attackGoalY,
  ownGoalY,
  inPenaltyBox,
  dist,
  type Point,
  type Side
} from './pitch';
import { TEAMS, fixtureKits, type Kit, type Team } from './teams';
import {
  ASSIST_DIVE_PENALTY,
  ASSIST_REACT_LOSS,
  KEEPER_WALK,
  KEEPER_DIVE,
  KEEPER_HOLD,
  KEEPER_STEAL_R,
  KEEPER_STEAL_RATE,
  KEEPER_BODY_R,
  KEEPER_JUMP_Z,
  PARRY_LOCK,
  REACH_BASE,
  REACH_BODY,
  SAVE_FLOOR,
  approachGap,
  commitDive,
  flightTime,
  heightReach,
  keeperReach,
  keeperSkill,
  parryVelocity,
  resolveSave,
  restPosition,
  trackBall,
  trackTarget,
  type KeeperDive
} from './keeper';
import {
  boundaryRestart,
  cornerMarkers,
  goalKickAim,
  isProtected,
  AUTO_THROW_SPEED,
  AUTO_THROW_LIFT,
  GOAL_KICK_SPEED,
  GOAL_KICK_LIFT,
  RESTART_PAUSE,
  type RestartKind,
  type RestartSpec
} from './setpieces';
import {
  HUMAN_SPEED,
  DRIBBLE_FACTOR,
  OFFBALL_FACTOR,
  HUMAN_TACKLE_BASE,
  PRESS_TIME,
  SHOOT_RANGE,
  cpuLatency,
  cpuSpeed,
  cpuTackleBase,
  dribbleTarget,
  offBallTarget,
  planCarrier,
  type CarrierPlan
} from './ai';

export { HUMAN_SPEED, DRIBBLE_FACTOR, OFFBALL_FACTOR, SHOOT_RANGE, cpuSpeed, cpuTackleBase } from './ai';

/** Real seconds per half; the displayed clock compresses this to 45'. */
export const HALF_SECONDS = 30;
/** Game minutes per real second of play. */
export const MINUTES_PER_SECOND = 1.5;
export const FULL_TIME_MINUTES = 90;

export const KICKOFF_FREEZE = 0.6;
export const GOAL_PAUSE = 1.2;
export const HALF_TIME_PAUSE = 1.0;

/** Seconds A must be held for a full-power shot. */
export const CHARGE_TIME = 0.55;

const GRAVITY = 720;
const BALL_FRICTION = 0.55;
const AIR_FRICTION = 0.06;
const BOUNCE_Z = 0.5;
const BOUNCE_H = 0.8;

export const CAPTURE_R = 10;
/**
 * How near an opponent has to be to cut out a pass that is on its way to a
 * teammate — tighter than `CAPTURE_R`, because a firm ball played into a man
 * has to be stepped in front of rather than merely stood near.
 *
 * This is the difference between "short passing is viable" and a coin flip:
 * with fourteen players inside a 340 x 520 pitch, any lane wide enough to pass
 * through was also wide enough for whoever was covering it, which made the
 * policy that hammered the ball up the pitch strictly better than the one that
 * played through it. Passing is the main thing a good player does that a
 * button-masher does not, so it has to pay.
 */
export const PASS_INTERCEPT_R = 4;
/**
 * How near the ball the *intended receiver* of a ground pass has to be to take
 * it in. Wider than `CAPTURE_R`, because a man a ball has been played to is
 * running onto it and expecting it, and narrower than a stride, because he
 * still has to be there.
 */
export const RECEIVE_R = 16;
export const CONTROL_MAX = 330;
/**
 * A keeper gathers loose balls up to this pace and no faster. Anything quicker
 * has to go through the save roll on his plane — letting him simply trap a
 * struck shot at capture range is precisely the deterministic absorber the
 * rewrite exists to remove.
 */
export const KEEPER_TRAP_MAX = 200;
/**
 * A struck ball has to pass closer than a rolling one to be blocked: nobody
 * reacts to a 450 px/s shot from the same distance they trap a loose ball.
 * Without the tighter radius half of every shot is deflected before it reaches
 * the keeper and shot power stops mattering again.
 *
 * 9 rather than 5, which is a body's width rather than a rumour of one. At 5 a
 * defender standing in the corridor was transparent, so shooting through
 * traffic cost nothing and picking a clean lane bought nothing — and 6.2's own
 * number is `CAPTURE_R`, which is 10. It is still tighter than trapping a
 * loose ball, which is the part that has to stay true.
 */
export const BLOCK_R = 9;
export const TACKLE_R = 15;
export const DRIBBLE_OFFSET = 8;
export const KICK_GRACE = 0.35;
export const WIN_GRACE = 0.5;

/**
 * Shot placement. Full stick asks for the ball this far off centre — a ball's
 * width inside the post, so the whole stick range is a reachable target. See
 * `shoot` for why the specification's wider-than-the-mouth envelope had to go.
 *
 * Where the keeper stands is no longer a band at all — he stands on the angle
 * (`narrowAngleX`), so there is no line for the aim scale to be congruent
 * with. What matters here is only that the whole stick maps inside the frame.
 *
 * Going the other way and pushing this out to `GOAL_HALF - 2` — which the
 * first pass at this fix did, to make the span exactly twice the band — is
 * what the sweep will not have. Two pixels inside the post is inside the
 * spread of any shot, so full stick measured *worse* than three-quarter stick
 * (0.271 against 0.403 from the six-yard box) and 7.3's aim monotonicity
 * failed at the one place it most needs to hold.
 */
export const AIM_SPAN = GOAL_HALF - 7;
/**
 * Shot pace. Steeper in the charge than the specification's 300 + 150 x power:
 * the charge is the one thing a player spends real time on before striking —
 * half a second in which a defender can close him down — and it has to be the
 * difference between a shot and a scuff. At the specification's spread a tap
 * arrived at 78 % of a full strike's pace and the meter was decoration.
 */
const SHOT_SPEED_BASE = 295;
const SHOT_SPEED_CHARGE = 155;
/**
 * A header takes its aim from the stick with no charge, so it has neither the
 * charge's pace nor the charge's precision to trade: its own fixed pace and
 * spread are what keep a cross-and-header a real weapon from angles a ground
 * shot has no gap through, without letting it become the dominant one.
 *
 * Both moved this round, and the direction is the point. A cross that cannot
 * be met is not a weapon and a header that cannot be scored is not a reason to
 * cross; measured against a control that never crossed, the player who did was
 * losing 4.807 points a match against 4.823 with the old numbers. A firmer,
 * truer contact is also what the cabinet's header looks like — it is a
 * deliberate strike, not a deflection. 7.3's header cell moves from 0.30 to
 * 0.35 inside its 0.25-0.40 band, and 7.4's cap on the share of goals that may
 * come from crosses and headers is still met with room to spare.
 */
const HEADER_SPEED = 295;
const HEADER_SPREAD = 6;
/** Placement error, before quality: a scuffed tap sprays, a struck shot does not. */
const SPREAD_BASE = 8;
const SPREAD_CHARGE = 5;
const SPREAD_RANGE_DIV = 34;
const SPREAD_RUSH = 0.45;
/** A defender this close is in the way of the swing. */
export const STRIKE_PRESSURE_R = 30;
/**
 * What spoils a strike, and by how much. Every term is something a player can
 * do something about: back off the pressure, slow down, get the run and the
 * shot on the same line, shoot from a sensible distance, and do not swing at
 * it again while still off balance from the last one.
 */
const RUSH_PRESSED = 0.8;
const RUSH_PACE = 0.5;
const RUSH_ACROSS = 0.5;
const RUSH_RANGE = 0.5;
const RUSH_OFF_BALANCE = 0.5;
const RUSH_SCUFF = 0.55;
/**
 * How much a shot taken off a completed pass is *un*-rushed by it, and how
 * long that lasts. This is the reward side of the same coin as the rest of the
 * rush terms: a chance that was made by moving the ball is a better chance
 * than one taken by running at the goal with it, which is the whole reason to
 * pass rather than to hammer the button. It is also the one term a player who
 * never passes can never collect.
 */
const RUSH_ASSIST = 1.1;
/**
 * How much of that relief a **first-time** contact collects — a header or a
 * volley met on the drop, off a cross.
 *
 * The relief above is paid for having *time on the ball*: a man who has
 * received a pass, taken a touch and set himself is not rushed, and that is
 * the whole reason to move the ball rather than run with it. A man throwing
 * his head or his boot at a dropping cross has no time at all. It is the
 * hardest contact in the game and it was being scored as the calmest: the
 * catalogue's wing-cross routine took 98-100 % of its goals out of the air and
 * converted the ones met with the keeper wrong-footed at 0.86-0.94, against
 * the 0.30-0.60 band 7.3 writes for the very same shot in isolation — where no
 * assist exists, because the rig strikes the ball directly. The two numbers
 * were measuring the same header with and without a reward it should never
 * have collected.
 *
 * What the cross buys is that the keeper is beaten, not that the striker is
 * composed, and the keeper side of the window is untouched. A quarter is left
 * rather than none because a ball *delivered* onto a runner is still an easier
 * contact than a hoof he has chased down — which is what `RUSH_HOOF` prices,
 * and it is charged on top of this one.
 */
const AIR_ASSIST_SHARE = 0.25;
/*
 * `RUSH_MEET` and `MEET_PACE_DIV` were here, and this note is deliberately kept
 * where they were rather than deleted with them.
 *
 * They charged a first-time contact for the pace of the ball it was meeting,
 * and the intention was good: a ball dropping on your head at walking pace is a
 * free header, a cross whipped across the six-yard box at three hundred is the
 * hardest ball in football to hit. The implementation could not deliver it, and
 * the constant is removed rather than retuned because **a lever that measures
 * identically at every value is worse than no lever at all** — the next round
 * reads it as a live knob and tunes against it.
 *
 * Two independent reasons, both measured.
 *
 * **It was inert.** The only channel it reached the outcome through was the
 * spread multiplier `1 + SPREAD_RUSH x rush`, and at its maximum it widened a
 * header's placement spread by about 0.4 px against an 84 px goal mouth. Swept
 * over 36 stations x 4,000 seeds a cell, the whole dynamic range of the
 * constant — a dead ball against the fastest delivery the game can produce —
 * moved a header from 0.0881 to 0.0860 and a volley from 0.2944 to 0.2932. That
 * is a fifth of the sampling error of the suites that were supposed to be
 * measuring it. (It also saturates at `MEET_PACE_DIV`, so meet speeds 300 and
 * 600 were arithmetically the same cell.)
 *
 * **And the trade it claimed to price did not exist.** "A floated ball is
 * easier to strike and easier to defend; that is the choice the mechanic now
 * offers" — the player has no such choice. `loftedPass` weights a ball aimed at
 * a man on the line through `loftWeight(range)`, which is a pure function of
 * the range to that man; `power` is only consulted when there is *nobody* on
 * the line, i.e. when the ball is not a cross to anyone. So the term was not
 * pricing a decision, it was taxing a distance.
 *
 * What it was actually bought to answer — "pace on the cross is what beats the
 * keeper across his goal" — was never a balance fact. It was the keeper setting
 * his lateral position from a lagged copy of the ball, and it is fixed at the
 * generator now: see `trackTarget` in keeper.ts. A first-time contact is still
 * priced as harder than a set one, twice over and through channels that do
 * measure — `AIR_ASSIST_SHARE` above, which hands an aerial contact a quarter of
 * the relief a completed pass gives a man with time on the ball, and
 * `HEADER_SPREAD`, which only headers pay.
 */
/** Extra rush on a header met off a clearance rather than a delivered ball. */
const RUSH_HOOF = 1;
/**
 * How long a completed pass keeps helping the man who received it. A second
 * was shorter than the time it takes to receive a ball, turn and strike it, so
 * three quarters of the passes that did lead to a shot were collecting nothing
 * for it — which is most of why passing was a net loss.
 */
export const ASSIST_WINDOW = 2;
const RUSH_MAX = 2;
/** Rush below this stays out of the sky; above it, some of them go over. */
const SKY_GATE = 1.15;
const SKY_CHANCE = 0.95;
const SKY_LIFT_MIN = 140;
const SKY_LIFT_MAX = 260;
/**
 * How long a striker is off balance afterwards, and how much of his pace he
 * loses while he is. A clean strike costs him almost nothing; a wild one costs
 * him half a second of the chase for his own rebound. There are no fouls in
 * this game, so position is the only price a bad decision can be charged.
 */
export const STRIKE_RECOVER_MIN = 0.2;
export const STRIKE_RECOVER_MAX = 0.65;
export const STRIKE_SLOW = 0.5;
/** A blind clearance: shorter than a pass and steered only roughly. */
const CLEAR_SPEED_BASE = 235;
const CLEAR_SPEED_CHARGE = 110;
const CLEAR_SCATTER = 0.75;

export const SLIDE_TIME = 0.35;
export const SLIDE_SPEED = 26 / SLIDE_TIME;
export const SLIDE_COOLDOWN = 0.45;
export const SLIDE_DOWN = 0.8;
/**
 * How hard a won challenge knocks the ball back through the tackle, and how
 * long the man who lost it is off balance for. Both exist so that a won slide
 * is worth the 0.8 s on the floor a lost one costs: the risk is priced in the
 * failure case, which is the only place it can be priced without making the
 * success case worthless.
 *
 * 40 rather than 70, because at 70 the ball ran away from the man who had just
 * won it: an audit measured the tackler still in possession 19 % of the time a
 * quarter of a second after the challenge and 8 % after a second, which is
 * level with a control that never slid at all. Knocking the ball back
 * *through* the tackle rather than past the carrier was the right fix and it
 * was not enough on its own — the ball was still struck hard enough to be a
 * loose ball rather than a possession.
 */
const KNOCK_SPEED = 40;
const KNOCK_STUMBLE = 0.4;
const BODY_STEAL_RATE = 1.1;
const BODY_STEAL_R = 12;

/** Ball height windows for automatic contact selection. */
export const TRAP_Z = 6;
export const VOLLEY_Z = 10;
export const HEADER_Z = 30;
/**
 * How far an airborne ball must have travelled from the boot that launched it
 * before anyone may attack it. Without this a goal kick passes through heading
 * height a metre off its own goal line every time, and a forward loitering in
 * the six-yard box heads it straight back in — which was putting nearly half
 * of every side's goals on the end of a cross nobody ever played.
 */
export const AIR_STRIKE_MIN_TRAVEL = 40;
/**
 * How near an airborne ball a player has to be to attack it. Tighter than the
 * trap radius plus twelve it started at: a header has to be *met*, and at the
 * wider radius a player who simply held A collected every ball that passed
 * through heading height anywhere near him, which turned hammering the button
 * into an aerial threat with a hundred per cent uptime and pushed the share of
 * goals coming off crosses past the anti-goal 7.4 sets for it.
 */
export const AIR_STRIKE_R = CAPTURE_R + 6;
/**
 * The same radius for a ball that was *delivered* — a cross, a corner, a
 * lofted pass aimed at a man. A hoof forward has to be met on the same tight
 * terms as before, because meeting one is what "hoof and hope" is made of; a
 * ball played onto a runner's head is supposed to be meetable, and at the hoof
 * radius it was not: the window a cross spends in the heading band is a few
 * frames wide and arriving inside 16 px of it in those frames essentially
 * never happened. Widening only the delivered case is what makes crossing a
 * weapon without making punting one.
 */
export const CROSS_STRIKE_R = CAPTURE_R + 20;
/** Lift on a lofted pass or cross; see `loftedPass` for why it is this low. */
export const LOFT_LIFT = 150;
/**
 * A delivered cross is aimed to pass through heading height *over* its target
 * rather than to land on him, so it is aimed this far beyond the man and timed
 * to be at `CROSS_MEET_Z` when it reaches him.
 */
const CROSS_OVERSHOOT = 34;
const CROSS_MEET_Z = 16;
/** Nominal pace of a delivery, which sets its hang time. */
const CROSS_PACE = 210;
const CROSS_FLIGHT_MIN = 0.34;
const CROSS_FLIGHT_MAX = 0.68;

export type ContactType = 'ground' | 'volley' | 'header';

/**
 * There is no header button: the contact follows from the ball's height.
 * Whether the ball is reachable at all is a separate question — `HEADER_Z` is
 * the ceiling an outfielder can attack, enforced where the strike is offered.
 */
export function resolveContact(ballZ: number): ContactType {
  if (ballZ >= VOLLEY_Z) return 'header';
  if (ballZ >= TRAP_Z) return 'volley';
  return 'ground';
}

export interface PlayerState {
  x: number;
  y: number;
  /** Facing; where a dribbled ball sits and a blind kick goes. */
  fx: number;
  fy: number;
  /** Speed over the last frame, for the tackle roll's speed term. */
  speed: number;
  /** >0 while committed to a slide. */
  slide: number;
  /** >0 while grounded after a failed slide. */
  down: number;
  slideCd: number;
  /** >0 while carrying out a press order. */
  press: number;
  /** >0 while off balance from a strike: no second strike, and slower. */
  strike: number;
  /** True once this slide has rolled against a carrier. */
  slideRolled: boolean;
}

export interface BallState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
}

export interface Owner {
  side: Side;
  idx: number;
}

export interface KeeperRuntime {
  /** Delayed copy of the ball's lateral coordinate. */
  trackX: number;
  dive: KeeperDive | null;
  hold: number;
  parryLock: number;
  skill: number;
  /**
   * True once this keeper has rolled against the ball currently in flight.
   *
   * A keeper gets one go at a ball, and which frame he gets it on cannot be
   * decided by a plane-crossing test alone: a shot struck from inside his
   * standing line never crosses that plane, so before this flag existed the
   * keeper was simply never consulted and every shot from ten pixels was a
   * certain goal at every rating and difficulty. Cleared by every kick and
   * every change of possession.
   */
  contested: boolean;
}

export type MatchPhase = 'kickoff' | 'play' | 'goal' | 'restart' | 'halfTime' | 'over';

export interface GoalRecord {
  side: Side;
  /** Shirt index of the scorer. */
  scorer: number;
  minute: number;
  contact: ContactType;
  /** True when the ball was walked over the line rather than struck. */
  dribbled: boolean;
  /** True when the goal came off a cross or a lofted delivery. */
  fromCross: boolean;
}

export type MatchEvent =
  | { type: 'kickoff'; side: Side }
  | { type: 'goal'; side: Side; record: GoalRecord }
  | { type: 'shot'; side: Side; onTarget: boolean; contact: ContactType }
  | { type: 'save'; side: Side; caught: boolean }
  | { type: 'post'; side: Side }
  | { type: 'restart'; kind: RestartKind; side: Side }
  | { type: 'tackle'; side: Side; won: boolean }
  | { type: 'turnover'; side: Side }
  | { type: 'halfTime' }
  | { type: 'end'; winner: Side | null; pendingShootout: boolean };

export interface MatchInput {
  /** Stick, each axis in [-1, 1]. */
  x: number;
  y: number;
  /** A: shoot in possession, slide out of it. */
  a: boolean;
  /** B: lofted pass and cross in possession, press order out of it. */
  b: boolean;
  /** C: ground pass in possession, switch player out of it. */
  c: boolean;
}

export const NEUTRAL_INPUT: MatchInput = { x: 0, y: 0, a: false, b: false, c: false };

export interface MatchStats {
  shots: [number, number];
  onTarget: [number, number];
  saves: [number, number];
  catches: [number, number];
  passes: [number, number];
  passesCompleted: [number, number];
  shotDistance: [number, number];
  /** Ground passes only (C), which is what 7.4's completion band is about. */
  groundPasses: [number, number];
  groundPassesCompleted: [number, number];
  slides: [number, number];
  slidesWon: [number, number];
  turnovers: number;
  /** Durations of every completed human *team* possession spell, seconds. */
  spells: number[];
}

export interface MatchState {
  players: [PlayerState[], PlayerState[]];
  ball: BallState;
  owner: Owner | null;
  phase: MatchPhase;
  phaseTimer: number;
  /** The restart being taken, with its protection and release clocks. */
  restart: (RestartSpec & { elapsed: number; taker: number }) | null;
  /** Landing markers offered while a corner is held. */
  markers: Array<{ x: number; y: number }>;
  half: 0 | 1;
  /** Ends are swapped for the second half. */
  swapped: boolean;
  /** Real seconds of play elapsed this half. */
  halfElapsed: number;
  /** Displayed clock, 0..90 game minutes. */
  clock: number;
  score: [number, number];
  difficulty: number;
  teams: [Team, Team];
  /**
   * The strips this fixture is played in, decided once at kickoff by
   * `fixtureKits`: a side wears its change strip when its first one would be
   * two indistinguishable blobs against the opponent's, or would disappear
   * into the grass. Presentation data, but it belongs to the fixture rather
   * than to the frame, which is why it is settled here and not in the draw.
   */
  kits: [Kit, Kit];
  keepers: [KeeperRuntime, KeeperRuntime];
  /** Human outfield index under the stick; the keeper is never selectable. */
  controlled: number;
  /** Counts down a second of 2 Hz flash on the control triangle. */
  switchFlash: number;
  /**
   * Seconds left on a C press's claim over the auto-switcher. See
   * `cycleControl` — without it a manual pick survived about one frame.
   */
  manualHold: number;
  kickoffSide: Side;
  lastTouch: Side;
  /** Index of the last player of each side to kick the ball. */
  lastKicker: [number, number];
  /** Where the ball was last kicked from, for the air-strike travel gate. */
  kickFrom: { x: number; y: number };
  /** Contact type of the last strike, for the goal record. */
  lastContact: ContactType;
  /** True while the ball in flight came from a cross or loft. */
  lastFromCross: boolean;
  /** A pass in flight, so a teammate's capture counts as completed. */
  passInFlight: Side | null;
  /**
   * Seconds left on the window in which a completed pass is still helping the
   * man who received it, and the side it belongs to. A ball laid off into
   * space arrives with the defence still adjusting to it, so the shot that
   * follows is a made chance rather than a snatched one.
   */
  assist: { side: Side; t: number } | null;
  /** True while the pass in flight is a lofted one rather than along the deck. */
  passLofted: boolean;
  /**
   * The teammate a ground pass was actually aimed at, so he is the one who
   * runs onto it. Without this the loose-ball chaser is simply whoever is
   * nearest the landing point, which is very often not the man the pass was
   * played to — and a pass whose intended receiver stands still is a pass the
   * opposition collects.
   */
  passTarget: number;
  /**
   * The side that last had the ball at someone's feet. A turnover is counted
   * when possession is regained by the other side, which is almost always via
   * a spell of loose ball — counting only direct hand-to-hand changes missed
   * nine turnovers in ten.
   */
  lastOwnerSide: Side | null;
  /** A ball that cannot score directly (throw-ins), cleared on the next touch. */
  noScore: boolean;
  kickGrace: { side: Side; idx: number; t: number } | null;
  winGrace: { side: Side; idx: number; t: number } | null;
  charge: number;
  charging: boolean;
  aimLatchX: number;
  aimLatchY: number;
  prev: { a: boolean; b: boolean; c: boolean };
  cpuThink: number;
  cpuPlan: CarrierPlan | null;
  /**
   * Whether the CPU has already been asked to challenge for the ball currently
   * in the air over its own box. One roll per ball — see `cpuAirStrike`.
   */
  cpuAirRolled: boolean;
  knockout: boolean;
  pendingShootout: boolean;
  winner: Side | null;
  goals: GoalRecord[];
  log: MatchEvent[];
  stats: MatchStats;
  spell: number;
  halfSeconds: number;
  rng: () => number;
}

export interface MatchOptions {
  rng?: () => number;
  difficulty?: number;
  teams?: [Team, Team];
  half?: 0 | 1;
  knockout?: boolean;
  halfSeconds?: number;
}

function freshPlayer(x: number, y: number, dir: 1 | -1): PlayerState {
  return {
    x,
    y,
    fx: 0,
    fy: dir,
    speed: 0,
    slide: 0,
    down: 0,
    slideCd: 0,
    press: 0,
    strike: 0,
    slideRolled: false
  };
}

function formation(side: Side, swapped: boolean): PlayerState[] {
  const dir = attackDir(side, swapped);
  const out: PlayerState[] = [];
  for (let idx = 0; idx < TEAM_SIZE; idx++) {
    const a = anchorFor(side, idx, CENTRE_X, CENTRE_Y, swapped);
    out.push(freshPlayer(a.x, a.y, dir));
  }
  return out;
}

/**
 * The player's own keeper is not part of the difficulty curve. Difficulty is
 * the CPU's handicap (6.8), and letting it lift *both* keepers meant a harder
 * match quietly made the player's own goal harder to score in as well, which
 * held goals-against flat across the whole run. Side 0's keeper is therefore
 * fixed at a middling profile and only his team's Keeper rating moves him.
 */
export const HUMAN_KEEPER_PROFILE = 0.3;

function freshKeeper(team: Team, side: Side, difficulty: number): KeeperRuntime {
  return {
    trackX: CENTRE_X,
    dive: null,
    hold: 0,
    parryLock: 0,
    skill: keeperSkill(team.keeper, side === 0 ? HUMAN_KEEPER_PROFILE : difficulty),
    contested: false
  };
}

export function createMatch(opts: MatchOptions = {}): MatchState {
  const rng = opts.rng ?? Math.random;
  const difficulty = clamp(opts.difficulty ?? 0.25, 0, 1);
  const teams: [Team, Team] = opts.teams ?? [TEAMS[0], TEAMS[1]];
  const half = opts.half ?? 0;
  const swapped = half === 1;
  const m: MatchState = {
    players: [formation(0, swapped), formation(1, swapped)],
    ball: { x: CENTRE_X, y: CENTRE_Y, z: 0, vx: 0, vy: 0, vz: 0 },
    owner: null,
    phase: 'kickoff',
    phaseTimer: KICKOFF_FREEZE,
    restart: null,
    markers: [],
    half,
    swapped,
    halfElapsed: 0,
    clock: half * 45,
    score: [0, 0],
    difficulty,
    teams,
    kits: fixtureKits(teams[0], teams[1]),
    keepers: [freshKeeper(teams[0], 0, difficulty), freshKeeper(teams[1], 1, difficulty)],
    controlled: 6,
    switchFlash: 0,
    manualHold: 0,
    kickoffSide: half === 0 ? 0 : 1,
    lastTouch: 0,
    lastKicker: [6, 6],
    kickFrom: { x: CENTRE_X, y: CENTRE_Y },
    lastContact: 'ground',
    lastFromCross: false,
    passInFlight: null,
    assist: null,
    passLofted: false,
    passTarget: -1,
    lastOwnerSide: null,
    noScore: false,
    kickGrace: null,
    winGrace: null,
    charge: 0,
    charging: false,
    aimLatchX: 0,
    aimLatchY: 0,
    prev: { a: false, b: false, c: false },
    cpuThink: 0,
    cpuPlan: null,
    cpuAirRolled: false,
    knockout: opts.knockout ?? false,
    pendingShootout: false,
    winner: null,
    goals: [],
    log: [],
    stats: {
      shots: [0, 0],
      onTarget: [0, 0],
      saves: [0, 0],
      catches: [0, 0],
      passes: [0, 0],
      passesCompleted: [0, 0],
      shotDistance: [0, 0],
      groundPasses: [0, 0],
      groundPassesCompleted: [0, 0],
      slides: [0, 0],
      slidesWon: [0, 0],
      turnovers: 0,
      spells: []
    },
    spell: 0,
    halfSeconds: opts.halfSeconds ?? HALF_SECONDS,
    rng
  };
  placeKickoff(m);
  return m;
}

function placeKickoff(m: MatchState): void {
  m.players = [formation(0, m.swapped), formation(1, m.swapped)];
  m.ball = { x: CENTRE_X, y: CENTRE_Y, z: 0, vx: 0, vy: 0, vz: 0 };
  m.owner = null;
  m.restart = null;
  m.markers = [];
  m.kickGrace = null;
  m.winGrace = null;
  m.noScore = false;
  m.passInFlight = null;
  m.passLofted = false;
  m.passTarget = -1;
  m.lastOwnerSide = null;
  m.lastFromCross = false;
  m.charge = 0;
  m.charging = false;
  for (const gk of m.keepers) {
    gk.dive = null;
    gk.hold = 0;
    gk.parryLock = 0;
    gk.trackX = CENTRE_X;
    gk.contested = false;
  }
  const taker = m.players[m.kickoffSide][6];
  const dir = attackDir(m.kickoffSide, m.swapped);
  taker.x = CENTRE_X;
  taker.y = CENTRE_Y - dir * (DRIBBLE_OFFSET + 1);
  taker.fx = 0;
  taker.fy = dir;
  m.phase = 'kickoff';
  m.phaseTimer = KICKOFF_FREEZE;
  m.controlled = 6;
}

/* ------------------------------------------------------------------ */
/* possession                                                          */

function playerAt(m: MatchState, owner: Owner): PlayerState {
  return m.players[owner.side][owner.idx];
}

function endSpell(m: MatchState): void {
  if (m.spell > 0) {
    m.stats.spells.push(m.spell);
    m.spell = 0;
  }
}

function takePossession(m: MatchState, side: Side, idx: number, won: boolean): void {
  if (m.lastOwnerSide !== null && m.lastOwnerSide !== side) {
    // The other side has it: whatever the pass before it created is gone.
    m.assist = null;
    m.stats.turnovers++;
    m.log.push({ type: 'turnover', side });
    // A possession spell is the *team's*, not one player's: it survives every
    // pass between teammates and ends only when the other side takes over.
    if (m.lastOwnerSide === 0) endSpell(m);
  }
  m.lastOwnerSide = side;
  m.owner = { side, idx };
  m.lastTouch = side;
  m.kickGrace = null;
  m.passInFlight = null;
  m.passTarget = -1;
  m.lastFromCross = false;
  m.ball.z = 0;
  m.ball.vx = 0;
  m.ball.vy = 0;
  m.ball.vz = 0;
  m.keepers[0].dive = null;
  m.keepers[1].dive = null;
  m.keepers[0].contested = false;
  m.keepers[1].contested = false;
  if (idx === 0) m.keepers[side].hold = KEEPER_HOLD;
  if (won) m.winGrace = { side, idx, t: WIN_GRACE };
  m.noScore = false;
}

/** Kick the ball loose from the current carrier, arming the re-capture grace. */
function kick(m: MatchState, vx: number, vy: number, vz: number): void {
  const owner = m.owner;
  if (!owner) return;
  const p = playerAt(m, owner);
  m.ball.x = p.x + p.fx * DRIBBLE_OFFSET;
  m.ball.y = p.y + p.fy * DRIBBLE_OFFSET;
  m.ball.vx = vx;
  m.ball.vy = vy;
  m.ball.vz = vz;
  m.kickGrace = { side: owner.side, idx: owner.idx, t: KICK_GRACE };
  m.kickFrom = { x: m.ball.x, y: m.ball.y };
  // A new ball in flight is a new ball for both keepers to answer.
  m.keepers[0].contested = false;
  m.keepers[1].contested = false;
  m.lastTouch = owner.side;
  m.lastKicker[owner.side] = owner.idx;
  m.winGrace = null;
  m.owner = null;
}

/* ------------------------------------------------------------------ */
/* shooting and passing                                                */

function accuracyScale(team: Team): number {
  return 1.25 - 0.5 * (team.skill / 5);
}

function signed(m: MatchState): number {
  return m.rng() * 2 - 1;
}

/**
 * How badly a strike is being rushed, 0 (a set player with time) to 1 (flat
 * out, off balance, with a defender on him).
 *
 * This is the term that makes shot *quality* something a player earns rather
 * than something the charge meter hands out, and it is the direct answer to
 * the audit's dominant strategy: running at the ball and hammering A produced
 * shots as accurate as a set finish, so there was never a reason to do
 * anything else. Three things spoil a strike, all of them things a good player
 * can avoid and a masher cannot:
 *
 *  - **pressure**: a defender inside `STRIKE_PRESSURE_R` is in the way of the
 *    swing. A blind shot out of a crowd is a poor shot.
 *  - **balance**: the faster he is travelling and the further the shot he is
 *    attempting is from the line he is running along, the more he is striking
 *    across his own body. Slowing down, or picking the shot that matches the
 *    run, is free and costs only the moment it takes to decide.
 *  - **being off-balance already**: a strike inside the recovery from the last
 *    one is a swipe, not a shot.
 */
function strikeRush(
  m: MatchState,
  side: Side,
  p: PlayerState,
  targetX: number,
  goalY: number,
  power: number,
  /** Share of the assist relief this contact is entitled to; see `AIR_ASSIST_SHARE`. */
  assistShare = 1
): number {
  let nearest = Infinity;
  for (let idx = 1; idx < TEAM_SIZE; idx++) {
    const o = m.players[1 - side][idx];
    if (o.down > 0) continue;
    nearest = Math.min(nearest, dist(o.x, o.y, p.x, p.y));
  }
  const pressed = 1 - clamp((nearest - CAPTURE_R) / (STRIKE_PRESSURE_R - CAPTURE_R), 0, 1);
  const dx = targetX - p.x;
  const dy = goalY - p.y;
  const len = Math.hypot(dx, dy) || 1;
  const align = clamp((p.fx * dx + p.fy * dy) / len, 0, 1);
  const pace = clamp(p.speed / HUMAN_SPEED, 0, 1);
  const range = clamp(len / SHOOT_RANGE, 0, 1);
  return clamp(
    RUSH_PRESSED * pressed +
      RUSH_PACE * pace +
      RUSH_ACROSS * pace * (1 - align) +
      RUSH_RANGE * range +
      RUSH_SCUFF * (1 - clamp(power, 0, 1)) +
      (p.strike > 0 ? RUSH_OFF_BALANCE : 0) -
      (m.assist && m.assist.side === side ? RUSH_ASSIST * assistShare : 0),
    0,
    RUSH_MAX
  );
}

/**
 * How much unintended lift a rushed strike gets — the shot that sails over the
 * bar.
 *
 * This is the honest source of off-target shooting, and it is what lets the
 * aim scale stay inside the frame (see `shoot`) without every shot being on
 * target. A set player striking a still ball from the edge of the six-yard box
 * never skies one; a player at a dead sprint, with a defender on him, hammering
 * it from thirty yards, regularly does. It costs the mash strategy far more
 * than it costs a player who picks his moment, and it costs nothing at all in
 * 7.3's isolation rig, where the shooter is stationary and unpressed — which is
 * why the keeper bands and the shot bands can be read independently.
 */
function skyLift(m: MatchState, rush: number): number {
  const wild = clamp((rush - SKY_GATE) / (RUSH_MAX - SKY_GATE), 0, 1);
  if (wild <= 0 || m.rng() >= wild * SKY_CHANCE) return 0;
  return SKY_LIFT_MIN + (SKY_LIFT_MAX - SKY_LIFT_MIN) * m.rng();
}

/**
 * Fire at goal.
 *
 * **The aim scale maps to targets that are actually reachable.** Full stick
 * asks for the ball `AIM_SPAN` off centre, a ball's width inside the post, and
 * everything between centre and there is a legal target — so goal probability
 * rises all the way from the middle of the goal to the post, which is what
 * 7.3 asks for. The specification's +-(GOAL_HALF + 14) envelope against a
 * +-GOAL_HALF mouth could not deliver that: a quarter of the stick's range was
 * a *structural* miss at every distance, power and skill (twenty of the
 * audit's hundred and twenty grid cells measured exactly zero), and because
 * the miss arrived before the keeper did, the response peaked in the interior
 * and collapsed toward the post — the opposite of the required monotonicity.
 *
 * Missing is still entirely possible; it comes from execution rather than from
 * the stick. `strikeRush` widens the spread until a post-aimed shot taken at a
 * sprint with a defender on the shoulder is as likely to go wide as in, which
 * is why placement is worth having only when the rest of the play earns it.
 */
export function shoot(
  m: MatchState,
  side: Side,
  power: number,
  aim: number,
  contact: ContactType
): void {
  const owner = m.owner;
  if (!owner) return;
  const p = playerAt(m, owner);
  const goalY = attackGoalY(side, m.swapped);
  const d = dist(p.x, p.y, CENTRE_X, goalY);
  const scale = accuracyScale(m.teams[side]);
  const header = contact === 'header';
  const aimed = CENTRE_X + clamp(aim, -1, 1) * AIM_SPAN;
  // A header off a ball that was deliberately delivered is a made chance; one
  // off a hopeful punt up the pitch is a hopeful header, and it is scored as
  // one. Without the distinction, hammering the ball forward and running on to
  // it is a scoring strategy in its own right — the "hoof and hope" the
  // specification names as an anti-goal, arrived at by a player who never
  // aimed a cross in his life.
  const hoofed = header && !m.lastFromCross;
  const rush = clamp(
    strikeRush(
      m,
      side,
      p,
      aimed,
      goalY,
      header ? 1 : power,
      // A first-time contact has no time on the ball, so it collects only a
      // token of the relief a completed pass hands the man who receives it.
      contact === 'ground' ? 1 : AIR_ASSIST_SHARE
    ) + (hoofed ? RUSH_HOOF : 0),
    0,
    RUSH_MAX
  );
  const spread =
    (signed(m) * (SPREAD_BASE - SPREAD_CHARGE * clamp(power, 0, 1)) +
      signed(m) * (d / SPREAD_RANGE_DIV) +
      (header ? signed(m) * HEADER_SPREAD : 0)) *
    scale *
    (1 + SPREAD_RUSH * rush);
  const targetX = clamp(aimed + spread, 6, PITCH_W - 6);
  // A strike leaves him off balance, and the worse the strike the longer for.
  // This is the cost the audit found missing: a wild swipe has to be worth
  // less than a struck shot, and with no fouls in the game the only currency
  // available is the striker's own position.
  p.strike = STRIKE_RECOVER_MIN + (STRIKE_RECOVER_MAX - STRIKE_RECOVER_MIN) * clamp(rush / RUSH_MAX, 0, 1);
  const dx = targetX - p.x;
  const dy = goalY - p.y;
  const len = Math.hypot(dx, dy) || 1;
  const speed = header ? HEADER_SPEED : SHOT_SPEED_BASE + SHOT_SPEED_CHARGE * clamp(power, 0, 1);
  p.fx = dx / len;
  p.fy = dy / len;
  const fromCross = m.lastFromCross;
  const lift = skyLift(m, rush);
  kick(m, (dx / len) * speed, (dy / len) * speed, lift);
  m.lastContact = contact;
  m.lastFromCross = fromCross;
  m.passInFlight = null;
  m.stats.shots[side]++;
  const onTarget = lift === 0 && Math.abs(targetX - CENTRE_X) < GOAL_HALF - 2;
  if (onTarget) m.stats.onTarget[side]++;
  m.log.push({ type: 'shot', side, onTarget, contact });
  m.stats.shotDistance[side] += d;
  armKeeper(m, side, contact);
}

/**
 * Out of shooting range A is a clearance driven up-pitch. A manual quirk, and
 * also the move a player who is simply hammering the button spends most of his
 * match making — so it carries the same off-balance cost as a shot. Hoofing
 * the ball away is a legitimate way out of trouble; doing it every second
 * without ever looking up has to leave you flat-footed for the second ball,
 * because that is the only thing standing between "clear it" and a dominant
 * strategy with no downside at all.
 */
function clearUpfield(m: MatchState, side: Side, power: number, aim: number): void {
  const owner = m.owner;
  if (!owner) return;
  const p = playerAt(m, owner);
  const dir = attackDir(side, m.swapped);
  const goalY = attackGoalY(side, m.swapped);
  const rush = strikeRush(m, side, p, CENTRE_X, goalY, clamp(power, 0, 1));
  // A hoof is blind: the more rushed it is, the less it resembles the
  // direction it was aimed in. Without this the clearance is a free, accurate
  // reset that empties your own half every time, which is a large part of what
  // made hammering the button a defensive strategy as well as an attacking one.
  const lateral = clamp(clamp(aim, -1, 1) * 0.6 + signed(m) * CLEAR_SCATTER * (rush / RUSH_MAX), -1, 1);
  const len = Math.hypot(lateral, 1);
  const speed = CLEAR_SPEED_BASE + CLEAR_SPEED_CHARGE * clamp(power, 0, 1);
  p.fx = lateral / len;
  p.fy = (dir as number) / len;
  p.strike =
    STRIKE_RECOVER_MIN + (STRIKE_RECOVER_MAX - STRIKE_RECOVER_MIN) * clamp(rush / RUSH_MAX, 0, 1);
  kick(m, (lateral / len) * speed, ((dir as number) / len) * speed, 150);
  m.lastContact = 'ground';
  m.lastFromCross = false;
  armKeeper(m, side, 'ground');
}

/**
 * The teammate a ground pass should find. Among teammates within 220 px whose
 * bearing is within 35 degrees of the stick, the most available wins — near,
 * and with nobody standing on him. Picking the *nearest* instead, as the
 * specification's 6.3 has it, threw half of all passes at whichever teammate
 * happened to be closest to the line even with a defender in his pocket, and
 * a 50 % completion rate is not "short passing is viable". This assist is
 * already a deliberate departure from the original's purely directional
 * passing; this is the same departure, done properly.
 */
export function passAssist(
  m: MatchState,
  side: Side,
  idx: number,
  aimX: number,
  aimY: number
): number {
  const p = m.players[side][idx];
  const len = Math.hypot(aimX, aimY);
  if (len < 0.2) return -1;
  const ax = aimX / len;
  const ay = aimY / len;
  const cone = Math.cos((35 * Math.PI) / 180);
  let best = -1;
  let bestScore = -Infinity;
  for (let i = 1; i < TEAM_SIZE; i++) {
    if (i === idx) continue;
    const mate = m.players[side][i];
    const dx = mate.x - p.x;
    const dy = mate.y - p.y;
    const d = Math.hypot(dx, dy);
    if (d < 20 || d > 220) continue;
    if ((dx * ax + dy * ay) / d < cone) continue;
    let marker = Infinity;
    let lane = 0;
    for (let o = 1; o < TEAM_SIZE; o++) {
      const opp = m.players[1 - side][o];
      marker = Math.min(marker, dist(opp.x, opp.y, mate.x, mate.y));
      // Anyone standing on the line the ball would travel gets to intercept
      // it, so a candidate behind a defender is not an option at all.
      const t = clamp(((opp.x - p.x) * dx + (opp.y - p.y) * dy) / (d * d), 0, 1);
      if (dist(opp.x, opp.y, p.x + dx * t, p.y + dy * t) < 18) lane += 1;
    }
    const score = Math.min(marker, 60) * 2 - d - lane * 120;
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}

function groundPass(m: MatchState, side: Side, aimX: number, aimY: number, power: number): void {
  const owner = m.owner;
  if (!owner) return;
  const p = playerAt(m, owner);
  const mate = passAssist(m, side, owner.idx, aimX, aimY);
  const scale = accuracyScale(m.teams[side]);
  let dx = aimX;
  let dy = aimY;
  let speed = 190 + 110 * clamp(power, 0, 1);
  if (mate >= 0) {
    const t = m.players[side][mate];
    const d = dist(p.x, p.y, t.x, t.y);
    // Firmer than the specification's 190 + 110 x power. A pass that ambles
    // gives every defender on the line time to step across it, and half of
    // all passes were being read; this stays under CONTROL_MAX so the
    // receiver still takes it cleanly rather than having it bounce off him.
    speed = clamp(268 + 120 * (d / 220), 268, 326);
    const flight = d / speed;
    dx = t.x - p.x + t.fx * t.speed * flight + signed(m) * 5 * scale;
    dy = t.y - p.y + t.fy * t.speed * flight + signed(m) * 5 * scale;
  }
  const len = Math.hypot(dx, dy) || 1;
  p.fx = dx / len;
  p.fy = dy / len;
  kick(m, (dx / len) * speed, (dy / len) * speed, 0);
  m.lastContact = 'ground';
  m.lastFromCross = false;
  m.passInFlight = side;
  m.passLofted = false;
  m.passTarget = mate;
  m.stats.passes[side]++;
  m.stats.groundPasses[side]++;
  armKeeper(m, side, 'ground');
}

/**
 * How far along the line the ball is being lofted a teammate is standing, or 0
 * if nobody is on it.
 *
 * **This does not steer the ball.** It answers one question — "is there a man
 * out that way, and how far?" — and the only thing the answer is allowed to
 * change is the *weight* of the ball. Direction stays exactly what the stick
 * asked for, which is the specification's "purely directional, no assist" and,
 * more to the point, is how B behaves on the cabinet this is a copy of: you
 * point it and you hit it, and the game decides how hard.
 *
 * An earlier pass at this fix did steer it — it scored every teammate in a 50
 * degree cone for how free he was and how near the goal, then aimed the ball at
 * the winner with a lead on his run. That made the cross land, and it made it
 * land the way a modern football game's assisted cross lands, which is not what
 * B does on a Mega Drive. The reachability problem it was solving turns out to
 * be entirely a problem of hang time, so hang time is all that is taken.
 */
function loftRange(m: MatchState, side: Side, idx: number, ax: number, ay: number): number {
  const p = m.players[side][idx];
  // A narrow corridor, not a catchment: a man has to be genuinely on the line
  // of the ball, near enough to the width of the two of them at that range.
  const cone = Math.cos((16 * Math.PI) / 180);
  let best = 0;
  for (let i = 1; i < TEAM_SIZE; i++) {
    if (i === idx) continue;
    const mate = m.players[side][i];
    const dx = mate.x - p.x;
    const dy = mate.y - p.y;
    const d = Math.hypot(dx, dy);
    if (d < 34 || d > 200) continue;
    if ((dx * ax + dy * ay) / d < cone) continue;
    // The nearest man on the line is the man the ball is for; a ball weighted
    // for someone behind him would sail over the one it was played to.
    if (best === 0 || d < best) best = d;
  }
  return best;
}

/**
 * Lift and pace for a lofted ball that has `range` px to travel before it wants
 * to be at heading height.
 *
 * The overshoot is what makes it a cross rather than a lob: the ball is
 * weighted to be still coming down at `CROSS_MEET_Z` as it crosses the man,
 * travelling on past him, rather than dying at his feet. A lob that lands on a
 * player is a ball he traps; a ball arriving over him at head height is a ball
 * he heads, and 6.1 resolves the contact from the height.
 */
function loftWeight(range: number): { pace: number; vz: number } {
  const drop = range + CROSS_OVERSHOOT;
  const t = clamp(range / CROSS_PACE, CROSS_FLIGHT_MIN, CROSS_FLIGHT_MAX);
  const vz = CROSS_MEET_Z / t + (GRAVITY * t) / 2;
  return { pace: drop / ((2 * vz) / GRAVITY), vz };
}

function loftedPass(m: MatchState, side: Side, aimX: number, aimY: number, power: number): void {
  const owner = m.owner;
  if (!owner) return;
  const p = playerAt(m, owner);
  let dx = aimX;
  let dy = aimY;
  if (Math.hypot(dx, dy) < 0.2) {
    dx = p.fx;
    dy = p.fy;
  }
  const len = Math.hypot(dx, dy) || 1;
  p.fx = dx / len;
  p.fy = dy / len;
  const range = loftRange(m, side, owner.idx, dx / len, dy / len);
  if (range > 0) {
    // There is a man on the line, so the ball is weighted to reach him at head
    // height instead of at whatever range a fixed lift happened to give it.
    // Fixed lift was why crossing did not exist: the ball crossed the heading
    // band twice inside a tenth of a second and at a distance nobody had asked
    // for, so the header 7.4 wants a share of the goals from never happened.
    const w = loftWeight(range);
    kick(m, (dx / len) * w.pace, (dy / len) * w.pace, w.vz);
    m.lastContact = 'ground';
    m.lastFromCross = true;
    m.passInFlight = side;
    m.passLofted = true;
    m.passTarget = -1;
    m.stats.passes[side]++;
    armKeeper(m, side, 'ground');
    return;
  }
  const speed = 150 + 90 * clamp(power, 0, 1);
  // Lower than the specification's 210 + 60 x power. At that lift a cross
  // arcs to 42 px, twice the heading ceiling, and crosses the band on the way
  // up and again on the way down inside a tenth of a second either side —
  // nobody could ever meet one, and the cross-and-header weapon 7.4 asks for
  // simply did not exist. At this lift the ball spends two thirds of its
  // flight inside the heading band while still clearing every outfielder's
  // 6 px trap ceiling, so it is a cross rather than a rolled pass.
  kick(m, (dx / len) * speed, (dy / len) * speed, LOFT_LIFT + 45 * clamp(power, 0, 1));
  m.lastContact = 'ground';
  m.lastFromCross = true;
  m.passInFlight = side;
  m.passLofted = true;
  m.passTarget = -1;
  m.stats.passes[side]++;
  armKeeper(m, side, 'ground');
}

/**
 * Where an airborne ball comes down through heading height, or null if it is
 * not in the air or never gets that low on its own.
 *
 * This is what a striker runs onto, and it is the honest way to make a cross
 * meetable: the man attacks the flight of the ball rather than the ball being
 * steered onto the man. On the cabinet this is a copy of, pressing B toward the
 * box and watching your centre-forward peel off to meet it is the whole of the
 * cross-and-header move; here it is one override in `offBallTarget`.
 *
 * Horizontal drag is ignored over the fraction of a second involved — at
 * `AIR_FRICTION` the ball loses about four per cent of its pace across a
 * cross's whole hang time, which is under a pixel of run.
 */
export function airMeetPoint(ball: BallState): Point | null {
  if (ball.z <= TRAP_Z && ball.vz <= 0) return null;
  const disc = ball.vz * ball.vz - 2 * GRAVITY * (CROSS_MEET_Z - ball.z);
  if (disc < 0) return null;
  const t = (ball.vz + Math.sqrt(disc)) / GRAVITY;
  if (t <= 0) return null;
  return { x: ball.x + ball.vx * t, y: ball.y + ball.vy * t };
}

/** Deliver a cross onto a chosen landing marker; corners use this. */
function crossTo(m: MatchState, side: Side, target: { x: number; y: number }): void {
  const owner = m.owner;
  if (!owner) return;
  const p = playerAt(m, owner);
  // A corner is the one ball in the game that *is* aimed at a spot rather than
  // in a direction, because 3's corner mechanic gives the player three landing
  // markers to choose between — the readable version of the manual's numbered
  // aim targets. Weighted the same way as any other loft, so it arrives over
  // the marker at heading height and a runner meets it.
  const dx = target.x - p.x + signed(m) * 8;
  const dy = target.y - p.y + signed(m) * 8;
  const len = Math.hypot(dx, dy) || 1;
  const w = loftWeight(len);
  p.fx = dx / len;
  p.fy = dy / len;
  kick(m, (dx / len) * w.pace, (dy / len) * w.pace, w.vz);
  m.lastContact = 'ground';
  m.lastFromCross = true;
  m.passInFlight = side;
  m.passLofted = true;
  m.passTarget = -1;
  m.stats.passes[side]++;
  armKeeper(m, side, 'ground');
}

/**
 * A header or volley on a ball still in the air, with the aim taken straight
 * from the stick and no charge. This is what keeps a cross a real weapon from
 * angles a ground shot cannot use.
 */
function airStrike(m: MatchState, side: Side, idx: number, aim: number): void {
  const contact = resolveContact(m.ball.z);
  // Meeting a ball that was deliberately delivered is a completed pass by
  // another name, so it collects the same reward: the man striking it is not
  // rushed and the keeper, who has been following the flight of the cross, is
  // committing late. A ball met off a hoof collects neither — `shoot` charges
  // that one `RUSH_HOOF` instead, which is what keeps the anti-goal in 7.4
  // from being reached by punting the ball forward and running after it.
  // ...and it has to be *your* side that delivered it. `lastFromCross` only
  // records that the ball in the air was crossed, not by whom, so heading an
  // opponent's cross away used to collect the delivered-ball reward for the
  // side that had nothing to do with delivering it. Nothing exercised that
  // before `headClear` existed — the only defensive header in the game was the
  // human pressing A in his own box — but it was already wrong there.
  if (m.lastFromCross && m.passInFlight === side) m.assist = { side, t: ASSIST_WINDOW };
  m.owner = { side, idx };
  shoot(m, side, contact === 'header' ? 1 : 0.8, aim, contact);
}

/**
 * A defensive header: meet the ball in your own box and put it away from goal,
 * rather than strike it at one four hundred pixels away.
 *
 * `airStrike` is not that verb. It goes straight to `shoot`, which always aims
 * at the striker's attacking goal, and the aerial path has no range split of
 * the kind the ground path gets at `SHOOT_RANGE` — so a header met in your own
 * six-yard box is a shot at the far end. This is the aerial half of
 * `clearUpfield`, and it delegates to it so the two cannot drift: a hoof is
 * blind, costs the same off-balance recovery, and scatters the more rushed it
 * is.
 *
 * He aims at the touchline he is nearest rather than up the middle, which is
 * the one piece of judgement a defender is allowed here — clearing a ball
 * across your own box is the mistake the verb exists to avoid.
 */
function headClear(m: MatchState, side: Side, idx: number): void {
  m.owner = { side, idx };
  clearUpfield(m, side, 1, m.ball.x <= CENTRE_X ? -1 : 1);
}

/**
 * Whether `idx` may attack the ball in the air right now. Exported because the
 * scripted policies have to ask the same question the game does — a policy
 * that presses A at a ball it cannot head gets a slide tackle and its cooldown
 * instead, and the chance is gone.
 */
export function canAirStrike(m: MatchState, side: Side, idx: number): boolean {
  if (m.owner) return false;
  if (m.players[side][idx].strike > 0) return false;
  if (m.ball.z < TRAP_Z || m.ball.z > HEADER_Z) return false;
  if (dist(m.ball.x, m.ball.y, m.kickFrom.x, m.kickFrom.y) < AIR_STRIKE_MIN_TRAVEL) return false;
  if (m.kickGrace && m.kickGrace.side === side && m.kickGrace.idx === idx) return false;
  const p = m.players[side][idx];
  return dist(p.x, p.y, m.ball.x, m.ball.y) < (m.lastFromCross ? CROSS_STRIKE_R : AIR_STRIKE_R);
}

/* ------------------------------------------------------------------ */
/* keeper                                                              */

/** Let the defending keeper commit once, at the instant of release. */
/**
 * `strike` is how *this* ball was struck, passed in rather than read back off
 * `m.lastContact`. The two are the same value today only because every caller
 * writes `lastContact` immediately before calling, so the read landed after
 * the write and meant "this strike is a ground strike" — which is what the
 * assist gate below wants, and is not what its own comment said it was
 * checking. Under the documented reading, "the last contact was on the
 * ground", the gate would be inert, because `crossTo` and `loftedPass` both
 * write `'ground'` themselves. That made it a fix held up by statement order:
 * an ordinary tidy-up hoisting the read above the kick would have silently
 * reverted it with every test still green. Taking it as an argument is what
 * removes the trap (issue #273, finding 5).
 */
function armKeeper(m: MatchState, kickingSide: Side, strike: ContactType): void {
  const ds = (1 - kickingSide) as Side;
  const gk = m.keepers[ds];
  const keeper = m.players[ds][0];
  const dir = attackDir(ds, m.swapped);
  const ball = m.ball;
  const speed = Math.hypot(ball.vx, ball.vy);
  if (speed < 60) return;
  // He does not commit a dive to a ball that is on its way *up*. This is the
  // third place the same idea has had to be written down, and it was the
  // load-bearing one: `airborne` withdraws his advance while a cross is over
  // his head and `trackTarget` puts him on the landing spot, and both of them
  // are dead letters if he has already committed — `stepKeeper` returns early
  // for a diving keeper, so for the whole flight of the delivery he neither
  // tracks nor walks, he slides along a line he picked when the ball left the
  // crosser's boot. A lofted ball is not a shot. He stays on his feet, keeps
  // reading it, and commits when somebody actually strikes it.
  if (ball.vz > 0) return;
  const along = -dir * ball.vy;
  if (along <= 0) return;
  const toPlane = (keeper.y - ball.y) * -dir;
  // How far the ball travels before it is level with him. A ball released
  // *inside* his line has none of that journey left, and he has to go now.
  const travel = Math.max(0, (toPlane * speed) / along);
  const t = flightTime(travel, speed);
  if (!Number.isFinite(t) || t > 2.5) return;
  // He dives at where the ball will pass him, which is not where it crosses
  // his line: for a ball dragged across the face of goal those two points are
  // thirty pixels apart, and committing to the second is committing to a
  // corner the ball reaches long after it has gone by him.
  const nearest = Math.max(
    0,
    ((keeper.x - ball.x) * ball.vx + (keeper.y - ball.y) * ball.vy) / (speed * speed)
  );
  // A ball that arrived off a completed pass or a delivered cross catches him
  // still adjusting to where it came from, so he commits with half a dive. It
  // is the whole reward for moving the ball rather than running with it.
  //
  // The reaction loss is capped by the ball's own flight, and that cap is
  // where the audit's 0.92-0.98 conversion actually lived: a flat 0.12 s
  // against a volley that arrives in a tenth of a second is not "late", it is
  // "absent", and it was taking the keeper's reach down to his own body
  // precisely on the chances that were already the best in the game. See
  // `ASSIST_REACT_LOSS`.
  //
  // Scaling the two penalties by how far the delivery had *already* dragged
  // him off the ball was tried here as well — the reading of the audit's third
  // finding under which the window and the tracker lag double-count the same
  // fact — and measured backwards. Paired against the catalogue, at a 60 px
  // span it cost the competent player 0.58 goals a match at d = 0.25 and the
  // wing-cross routine 0.06, because a keeper beaten by a *cross* is beaten
  // laterally by more than his reach either way while the ground pass the
  // window exists to reward leaves him ten to twenty pixels wrong. It taxed
  // passing, which is the verb the reward was written for, and left the cross
  // where it was. The flight-time cap is the honest cap; that one was not.
  //
  // ...and it is charged on a ball switched from one man to another **on the
  // deck**, not on a cross. That is what the penalty says it models — "a keeper
  // set for the man who had the ball is not set for the man who has it now" —
  // and a delivery he has watched arc into his own six-yard box is the one ball
  // on the pitch he is *not* surprised by. He has had its whole flight to set
  // his feet, and since round 6 he spends that flight on his line
  // (`airborne`), on the landing spot (`trackTarget`) and on his feet rather
  // than mid-dive (the `ball.vz > 0` gate above), all of which exist precisely
  // so that he is ready for the header.
  //
  // Charging it anyway was worth 0.52 to 0.93 on the best chance in the game.
  // Worked through on the shot the wing routine plays — a header met 22 px in
  // front of him, `HEADER_SPEED`, aimed full stick — the flight is 0.075 s, so
  // `min(ASSIST_REACT_LOSS, t)` is the whole flight, `elapsed - late` is zero,
  // and `keeperReach(0)` is `REACH_BODY`. His reach fell from 21.3 px to 12 px
  // against a 22 px gap, `gap / reach` went from 1.03 to 1.83, and the save
  // logistic fell off the end of its own curve. The cap the docstring credits
  // with fixing that is arithmetically a no-op for every flight under
  // `ASSIST_REACT_LOSS`, which is every finish inside about 35 px.
  //
  // Crossing keeps the half-dive penalty, which is the part that is about his
  // *legs* rather than his reading, and keeps everything `AIR_ASSIST_SHARE`
  // hands the striker. What it stops collecting is a keeper with no hands.
  const assisted = !!m.assist && m.assist.side === kickingSide && strike === 'ground';
  gk.dive = commitDive({
    restX: keeper.x,
    interceptX: ball.x + ball.vx * nearest,
    flightT: t,
    skill: gk.skill,
    speed,
    rng: m.rng,
    budgetScale: assisted ? ASSIST_DIVE_PENALTY : 1,
    late: assisted ? Math.min(ASSIST_REACT_LOSS, t) : 0
  });
}

/**
 * The spot a keeper who is on his feet is walking to, given where his tracker
 * currently is and what the ball is doing.
 *
 * It is exported, and it is the seam 7.3's isolation rig stands him on. The rig
 * used to *copy* this rule — `restPosition(gk.trackX, ...)`, and only that —
 * which quietly dropped both of the terms round 6 added: the blend toward the
 * landing spot (`trackTarget`) and the withdrawn advance (`restPosition`'s
 * `ballZ`). Every cell of the grid struck the ball off the deck, where both of
 * those are arithmetically inert, so three rounds of aerial keeper work were
 * certified by a grid in which the code being certified could not fire at all
 * (issue #273, finding 1). A copy of a positioning rule is a copy that drifts;
 * asking for the rule cannot.
 *
 * It answers where he is *going*, not where he *is*. His body walks here at
 * `KEEPER_WALK` and arrives late whenever the target moves faster than he does,
 * and that gap — not this spot — is what `approachGap` and `commitDive` read.
 */
export function keeperRest(m: MatchState, side: Side): Point {
  const gk = m.keepers[side];
  const goalY = ownGoalY(side, m.swapped);
  const dir = attackDir(side, m.swapped);
  // He sets from his lagged copy of the ball on the deck and from where the
  // ball is *coming down* while it is over his head — the same point the
  // strikers are running onto. See `trackTarget`. The lag is untouched and
  // `airborne` is 0 on the deck, so nothing about a ball at a striker's feet
  // changes; only a delivery in flight reads differently, and only in
  // proportion to how far up it is.
  const meet = airMeetPoint(m.ball);
  // There is no separate "shade across toward a close carrier" term any more,
  // and there is no longer anything for it to correct. It existed to buy back
  // the coverage a keeper clamped to a central band lost against a forward
  // running in off the wing; a keeper who stands on the angle covers that man
  // by construction, because the angle is computed from where the ball is.
  const slow = Math.hypot(m.ball.vx, m.ball.vy) < 150;
  if (!m.owner && slow && inPenaltyBox(m.ball.x, m.ball.y, goalY) && m.ball.z < KEEPER_JUMP_Z) {
    return { x: m.ball.x, y: m.ball.y };
  }
  return restPosition(
    trackTarget(gk.trackX, meet ? meet.x : null, m.ball.z),
    m.ball.y,
    goalY,
    dir,
    m.ball.z
  );
}

function stepKeeper(m: MatchState, side: Side, dt: number): void {
  const gk = m.keepers[side];
  const keeper = m.players[side][0];
  const goalY = ownGoalY(side, m.swapped);
  const dir = attackDir(side, m.swapped);
  gk.parryLock = Math.max(0, gk.parryLock - dt);

  if (m.owner) gk.dive = null;

  if (gk.dive) {
    gk.dive.elapsed += dt;
    const step = KEEPER_DIVE * dt;
    const next = keeper.x + clamp(gk.dive.targetX - keeper.x, -step, step);
    keeper.x = clamp(next, gk.dive.fromX - gk.dive.budget, gk.dive.fromX + gk.dive.budget);
    if (gk.dive.elapsed > 1.2) gk.dive = null;
    return;
  }

  gk.trackX = trackBall(gk.trackX, m.ball.x, gk.skill, dt);
  const rest = keeperRest(m, side);
  moveToward(keeper, rest.x, rest.y, KEEPER_WALK, dt);
  keeper.x = clamp(keeper.x, 12, PITCH_W - 12);
  keeper.y = clamp(
    keeper.y,
    Math.min(goalY, goalY + dir * 70),
    Math.max(goalY, goalY + dir * 70)
  );
}

/**
 * Resolve a loose ball crossing a keeper's plane. This is the load-bearing
 * path: being within reach is a roll, not an absorption, and beating him still
 * only concedes if the ball is genuinely between the posts.
 */
function keeperPlane(m: MatchState, side: Side, prevY: number, events: MatchEvent[]): void {
  const gk = m.keepers[side];
  const keeper = m.players[side][0];
  const goalY = ownGoalY(side, m.swapped);
  const dir = attackDir(side, m.swapped);
  const relPrev = (prevY - goalY) * dir;
  const relNow = (m.ball.y - goalY) * dir;
  const relKeeper = (keeper.y - goalY) * dir;
  // Crossing his line is the ordinary case. The other one is a ball that was
  // struck from *inside* it — a shot from ten pixels, a rebound at his feet —
  // which never crosses anything and which the crossing test therefore waved
  // straight into the net, at every rating and every difficulty. He gets one
  // roll at a ball either way; `contested` is what makes it one.
  const crossing = relPrev > relKeeper && relNow <= relKeeper;
  // ...and only for a ball that was still in front of the goal line when the
  // frame began: one that had already crossed is a goal, not a save he never
  // made. The test is on the *previous* position because a shot from ten
  // pixels crosses the line inside a single tick, and he has to be consulted
  // about that shot rather than about where it ended up.
  const inside = relNow <= relKeeper && relPrev > 0 && m.ball.vy * dir < 0;
  if (!(crossing || (inside && !gk.contested))) return;
  // How high the ball will be when it reaches the goal line, which is both the
  // height that decides whether it is a goal at all and the height he has to
  // beat. It is *not* the height over his own plane, and the difference is the
  // whole of this fix: a ball that clears his claim going over him and drops
  // into his hands before the line has not beaten him, and reading his own
  // plane would charge him for it. Above the bar at the line it is not going in
  // and he is not consulted, because `SAVE_FLOOR` would otherwise credit him
  // with saving shots flying over.
  //
  // Both terms are signed along the flight rather than absolute, and that is
  // not tidiness: a fast enough ball clears his plane and the goal line inside
  // one tick, so `toLine` is behind it by then and an absolute distance would
  // project the flight *forward* to a height the ball never had at the line.
  // Signed, `lineT` simply goes negative and the same parabola answers where it
  // was when it crossed. `closing` is positive by construction on both paths
  // above — the ball is moving toward this goal — and the guard is there so a
  // deflection that arrives on neither reads its height where it stands.
  const toLine = (m.ball.y - goalY) * dir;
  const closing = -m.ball.vy * dir;
  const lineT = closing > 1e-6 ? toLine / closing : 0;
  const lineZ = Math.max(0, m.ball.z + m.ball.vz * lineT - (GRAVITY * lineT * lineT) / 2);
  if (lineZ >= GOAL_HEIGHT) return;

  const speed = Math.hypot(m.ball.vx, m.ball.vy);
  if (speed < 40) return;
  gk.contested = true;
  // How near it passed him, not how far apart two lateral coordinates are:
  // his reach is a radius and the ball is on a line, so a shot squeezed
  // across him at a tight angle is a shot he is standing in the way of.
  const gap = approachGap({
    keeperX: keeper.x,
    keeperY: keeper.y,
    ballX: m.ball.x,
    ballY: m.ball.y,
    vx: m.ball.vx,
    vy: m.ball.vy,
    back: dist(m.ball.x, m.ball.y, m.kickFrom.x, m.kickFrom.y)
  });
  // A keeper who was never armed — a loose ball rolling in, a deflection — has
  // had all the time in the world and is simply set; one who was armed is
  // measured from the moment the ball was struck.
  const standing = gk.dive ? keeperReach(gk.dive.elapsed - gk.dive.late) : REACH_BASE;
  // ...and a keeper who is still on the floor from the last save reaches with
  // what he can get off the ground, fading back to that as he gets up. This
  // used to be an early `return` at the top of the function and it was the
  // audit's second exactly-100 % cell: 1,175 follow-ups inside the lock, 1,175
  // goals. See `PARRY_LOCK`. He is handicapped, not absent.
  const down = clamp(gk.parryLock / PARRY_LOCK, 0, 1);
  // ...and a ball crossing the line above his standing claim is one he is
  // stretching for, so what he has left of that reach falls off with height
  // rather than the whole roll being skipped. `heightReach` is exactly 1 at or
  // below `KEEPER_JUMP_Z`, so every ball that lands inside his claim, and every
  // ball struck off the deck, is arithmetically unchanged.
  const reach = (REACH_BODY + (standing - REACH_BODY) * (1 - down)) * heightReach(lineZ);
  // The desperation floor applies only to a ball that is actually going in:
  // he is never credited with saving one that was missing the goal anyway.
  //
  // Measured where the ball crosses the line, not where it passes him, along
  // the same signed `lineT` the height above is projected with. `m.ball.x` asks
  // whether the ball is between the posts *as it goes by his plane*, which is a
  // different question and the wrong one: a ball still travelling across the
  // face reads outside the frame there and is denied the floor it is owed, so
  // he is never even given the trailing hand at a shot that is going in. That
  // was the fourth exactly-1.000 cell in the rig census (#312). There is no
  // gravity term because lateral flight is linear.
  const lineX = m.ball.x + m.ball.vx * lineT;
  const inFrame = Math.abs(lineX - CENTRE_X) < GOAL_HALF;
  const outcome = resolveSave({
    gap,
    reach,
    speed,
    skill: gk.skill,
    rng: m.rng,
    floor: inFrame ? SAVE_FLOOR : 0
  });
  if (outcome === 'beaten') return;

  m.stats.saves[side]++;
  gk.dive = null;
  // A save made from the floor is held rather than spilled: he is already down
  // on top of the ball, and a second parry inside the same window is the
  // rebound loop the lock is actually there to prevent.
  if (outcome === 'caught' || down > 0) {
    m.stats.catches[side]++;
    m.ball.x = keeper.x;
    m.ball.y = keeper.y;
    takePossession(m, side, 0, true);
    events.push({ type: 'save', side, caught: true });
    return;
  }
  const v = parryVelocity(speed, dir, m.rng);
  m.ball.x = keeper.x;
  m.ball.y = keeper.y + dir * 6;
  m.ball.z = 2;
  m.ball.vx = v.vx;
  m.ball.vy = v.vy;
  m.ball.vz = 40;
  m.lastTouch = side;
  m.passInFlight = null;
  m.noScore = false;
  gk.parryLock = PARRY_LOCK;
  m.kickGrace = { side, idx: 0, t: KICK_GRACE };
  events.push({ type: 'save', side, caught: false });
}

/* ------------------------------------------------------------------ */
/* movement                                                            */

function moveToward(p: PlayerState, tx: number, ty: number, speed: number, dt: number): void {
  const dx = tx - p.x;
  const dy = ty - p.y;
  const d = Math.hypot(dx, dy);
  if (d < 1.5) {
    p.speed = 0;
    return;
  }
  const step = Math.min(d, speed * dt);
  p.x += (dx / d) * step;
  p.y += (dy / d) * step;
  p.fx = dx / d;
  p.fy = dy / d;
  p.speed = step / dt;
}

function clampToPitch(p: PlayerState): void {
  p.x = clamp(p.x, 4, PITCH_W - 4);
  p.y = clamp(p.y, 4, PITCH_L - 4);
}

function stepTimers(p: PlayerState, dt: number): void {
  p.slide = Math.max(0, p.slide - dt);
  p.down = Math.max(0, p.down - dt);
  p.slideCd = Math.max(0, p.slideCd - dt);
  p.press = Math.max(0, p.press - dt);
  p.strike = Math.max(0, p.strike - dt);
  if (p.slide === 0) p.slideRolled = false;
}

/**
 * Movement pace for one player: slower carrying the ball, slower still while
 * off balance from a strike. Both factors only ever *reduce* a speed, so the
 * 6.9 speed ledger — the CPU is never quicker than the human — is untouched.
 */
function carrySpeed(m: MatchState, side: Side, idx: number, base: number): number {
  const p = m.players[side][idx];
  const carrying = !!m.owner && m.owner.side === side && m.owner.idx === idx;
  return base * (carrying ? DRIBBLE_FACTOR : 1) * (p.strike > 0 ? STRIKE_SLOW : 1);
}

/* ------------------------------------------------------------------ */
/* human control                                                       */

/** Nearest human outfielder to the ball, with a 30 px hysteresis band. */
function updateControlled(m: MatchState, dt: number): void {
  m.switchFlash = Math.max(0, m.switchFlash - dt);
  m.manualHold = Math.max(0, m.manualHold - dt);
  if (m.owner && m.owner.side === 0 && m.owner.idx !== 0) {
    if (m.controlled !== m.owner.idx) {
      m.controlled = m.owner.idx;
      m.switchFlash = 1;
    }
    // Somebody of ours is on the ball: the stick belongs to him and there is
    // nothing left for a manual pick to be holding out against.
    m.manualHold = 0;
    return;
  }
  const cur = m.players[0][m.controlled];
  const curD = dist(cur.x, cur.y, m.ball.x, m.ball.y);
  let best = m.controlled;
  let bestD = curD;
  for (let idx = 1; idx < TEAM_SIZE; idx++) {
    const p = m.players[0][idx];
    const d = dist(p.x, p.y, m.ball.x, m.ball.y);
    if (d < bestD) {
      best = idx;
      bestD = d;
    }
  }
  // The hysteresis band keeps the cursor from flickering between two players
  // equally close to the ball, but a player inside his own kick grace cannot
  // touch it at all: holding the cursor on him would leave the player driving
  // a man who can do nothing while his own cross drops on somebody's head.
  const stuck = !!m.kickGrace && m.kickGrace.side === 0 && m.kickGrace.idx === m.controlled;
  // A manual pick outranks the distance rule but not the kick-grace escape:
  // holding the cursor on a man who cannot touch the ball is the one case
  // where the player is better served by being overruled.
  if (best !== m.controlled && (stuck || (m.manualHold === 0 && curD - bestD > 30))) {
    m.controlled = best;
    m.switchFlash = 1;
    m.manualHold = 0;
  }
}

/**
 * How long a C press keeps the man it picked, in seconds. It is the length of
 * `switchFlash`, so the marker stops flashing at the moment the auto-switcher
 * is allowed to have its say again — the player is told when his pick expires
 * rather than having to time it.
 */
const MANUAL_HOLD = 1;

/**
 * C out of possession cycles control through the three nearest teammates.
 *
 * Two things made this unpredictable enough to stop using, and both of them
 * are here rather than in the ranking.
 *
 * `updateControlled` runs at the top of every tick, *before* this, and hands
 * the stick to whoever is 30 px nearer the ball than the current man. A C
 * press picks the second or third nearest almost by definition, so the auto
 * switcher took the pick straight back on the very next frame — the button
 * looked like it did nothing, or worse, like it did something at random. The
 * pick now claims the stick for `MANUAL_HOLD`.
 *
 * And the ranking could hand over a man who was on the floor or halfway
 * through a slide, neither of whom answers the stick at all: `stepHumanSide`
 * drives a sliding player along his own facing regardless of input. That was
 * survivable while the auto-switcher was undoing it a frame later and is not
 * survivable now that the pick sticks, so those men are no longer candidates.
 */
function cycleControl(m: MatchState): void {
  const ranked = [...Array(TEAM_SIZE).keys()]
    .slice(1)
    .filter(idx => m.players[0][idx].down === 0 && m.players[0][idx].slide === 0)
    .sort(
      (a, b) =>
        dist(m.players[0][a].x, m.players[0][a].y, m.ball.x, m.ball.y) -
        dist(m.players[0][b].x, m.players[0][b].y, m.ball.x, m.ball.y)
    )
    .slice(0, 3);
  if (ranked.length === 0) return;
  const at = ranked.indexOf(m.controlled);
  m.controlled = ranked[(at + 1) % ranked.length];
  m.switchFlash = 1;
  m.manualHold = MANUAL_HOLD;
}

/** B out of possession orders the nearest teammate to close the carrier down. */
function pressOrder(m: MatchState): void {
  let best = -1;
  let bestD = Infinity;
  for (let idx = 1; idx < TEAM_SIZE; idx++) {
    if (idx === m.controlled) continue;
    const p = m.players[0][idx];
    const d = dist(p.x, p.y, m.ball.x, m.ball.y);
    if (d < bestD) {
      bestD = d;
      best = idx;
    }
  }
  if (best >= 0) m.players[0][best].press = PRESS_TIME;
}

function startSlide(m: MatchState, side: Side, idx: number): void {
  const p = m.players[side][idx];
  if (p.slide > 0 || p.down > 0 || p.slideCd > 0) return;
  p.slide = SLIDE_TIME;
  p.slideCd = SLIDE_TIME + SLIDE_COOLDOWN;
  p.slideRolled = false;
  m.stats.slides[side]++;
}

function pickMarker(m: MatchState, input: MatchInput): { x: number; y: number } {
  if (m.markers.length === 0) return { x: CENTRE_X, y: CENTRE_Y };
  if (input.x < -0.4) return m.markers[0];
  if (input.x > 0.4) return m.markers[2];
  return m.markers[1];
}

function humanAction(m: MatchState, input: MatchInput, dt: number): void {
  const aPressed = input.a && !m.prev.a;
  const aReleased = !input.a && m.prev.a;
  const bPressed = input.b && !m.prev.b;
  const bReleased = !input.b && m.prev.b;
  const cPressed = input.c && !m.prev.c;
  const anyPressed = aPressed || bPressed || cPressed;

  const stick = Math.hypot(input.x, input.y);
  if (stick > 0.2) {
    m.aimLatchX = input.x / stick;
    m.aimLatchY = input.y / stick;
  }

  // A human goal kick is taken by the keeper; the stick aims it, any button
  // releases it, and the 2.5 s deadline clears it either way.
  if (m.restart && m.restart.side === 0 && m.restart.keeperTakes && m.owner?.idx === 0) {
    if (anyPressed) {
      const dir = attackDir(0, m.swapped);
      const aim = goalKickAim(input.x, input.y, dir);
      const p = m.players[0][0];
      p.fx = aim.x;
      p.fy = aim.y;
      kick(m, aim.x * GOAL_KICK_SPEED, aim.y * GOAL_KICK_SPEED, GOAL_KICK_LIFT);
      m.lastFromCross = true;
      m.restart = null;
      armKeeper(m, 0, 'ground');
    }
    return;
  }

  const owns = !!m.owner && m.owner.side === 0 && m.owner.idx === m.controlled;

  if (owns) {
    // A striker still off balance from the last swing cannot line up another:
    // this is the cooldown half of the strike cost, and it is what turns a
    // fixed-cadence A-mash into a sequence of half-made contacts.
    if (aPressed && m.players[0][m.controlled].strike === 0) {
      m.charging = true;
      m.charge = 0;
    }
    if (m.charging && input.a) m.charge = Math.min(CHARGE_TIME, m.charge + dt);
    if (aReleased && m.charging) {
      m.charging = false;
      const power = clamp(0.35 + (m.charge / CHARGE_TIME) * 0.65, 0.35, 1);
      const aim =
        stick > 0.2
          ? input.x
          : Math.abs(m.aimLatchX) > 0.2
            ? m.aimLatchX
            : m.players[0][m.controlled].fx;
      const goalY = attackGoalY(0, m.swapped);
      const p = m.players[0][m.controlled];
      if (dist(p.x, p.y, CENTRE_X, goalY) <= SHOOT_RANGE) {
        shoot(m, 0, power, clamp(aim, -1, 1), 'ground');
      } else {
        clearUpfield(m, 0, power, clamp(aim, -1, 1));
      }
      return;
    }
    if (m.restart?.kind === 'corner' && bReleased) {
      crossTo(m, 0, pickMarker(m, input));
      m.restart = null;
      m.markers = [];
      return;
    }
    if (bPressed && m.restart?.kind !== 'corner') {
      loftedPass(m, 0, input.x, input.y, 0.6);
      return;
    }
    if (cPressed) {
      const p = m.players[0][m.controlled];
      const ax = stick > 0.2 ? input.x : p.fx;
      const ay = stick > 0.2 ? input.y : p.fy;
      groundPass(m, 0, ax, ay, 0.6);
      return;
    }
    return;
  }

  m.charging = false;
  if (aPressed) {
    if (canAirStrike(m, 0, m.controlled)) {
      const aim = stick > 0.2 ? input.x : m.aimLatchX;
      airStrike(m, 0, m.controlled, clamp(aim, -1, 1));
      return;
    }
    startSlide(m, 0, m.controlled);
  }
  if (bPressed) pressOrder(m);
  if (cPressed) cycleControl(m);
}

function stepHumanSide(m: MatchState, input: MatchInput, dt: number): void {
  for (let idx = 0; idx < TEAM_SIZE; idx++) {
    const p = m.players[0][idx];
    stepTimers(p, dt);
    if (idx === 0) {
      stepKeeper(m, 0, dt);
      continue;
    }
    if (p.down > 0) {
      p.speed = 0;
      continue;
    }
    if (p.slide > 0) {
      p.x += p.fx * SLIDE_SPEED * dt;
      p.y += p.fy * SLIDE_SPEED * dt;
      p.speed = SLIDE_SPEED;
      clampToPitch(p);
      continue;
    }
    if (idx === m.controlled) {
      const len = Math.hypot(input.x, input.y);
      if (len > 0.05) {
        const mag = Math.min(1, len);
        const speed = carrySpeed(m, 0, idx, HUMAN_SPEED) * mag;
        p.x += (input.x / len) * speed * dt;
        p.y += (input.y / len) * speed * dt;
        p.fx = input.x / len;
        p.fy = input.y / len;
        p.speed = speed;
      } else {
        p.speed = 0;
      }
      clampToPitch(p);
      continue;
    }
    const t = offBallTarget(m, 0, idx);
    moveToward(p, t.x, t.y, carrySpeed(m, 0, idx, HUMAN_SPEED * OFFBALL_FACTOR), dt);
    clampToPitch(p);
  }
}

/* ------------------------------------------------------------------ */
/* CPU                                                                 */

function stepCpuSide(m: MatchState, dt: number): void {
  const speed = cpuSpeed(m.difficulty);
  for (let idx = 0; idx < TEAM_SIZE; idx++) {
    const p = m.players[1][idx];
    stepTimers(p, dt);
    if (idx === 0) {
      stepKeeper(m, 1, dt);
      continue;
    }
    if (p.down > 0) {
      p.speed = 0;
      continue;
    }
    if (p.slide > 0) {
      p.x += p.fx * SLIDE_SPEED * dt;
      p.y += p.fy * SLIDE_SPEED * dt;
      p.speed = SLIDE_SPEED;
      clampToPitch(p);
      continue;
    }
    if (m.owner && m.owner.side === 1 && m.owner.idx === idx) continue;
    const t = offBallTarget(m, 1, idx);
    moveToward(p, t.x, t.y, carrySpeed(m, 1, idx, speed * OFFBALL_FACTOR), dt);
    clampToPitch(p);
  }
  cpuAirStrike(m);
  stepCpuCarrier(m, dt);
  stepCpuDefence(m, dt);
}

/**
 * How near either goal a ball in the air has to be for the CPU to go up for it.
 * The attacking half of this is the box it scores headers in; the defending
 * half is the box it defends them in, and they are the same distance because
 * they are the same event seen from the two ends.
 */
const AIR_BOX = 90;

/**
 * How often a CPU defender wins a cross delivered into his own box.
 *
 * Swept against the two bounds issue #308 is judged on and the one bound that
 * ruled out every previous attempt at it. The station is the pinned
 * `(-1, 90, 30)` on the near-post header aim; air goals a match are over 300
 * matches at d = 0.25 against an `AIR_GOALS_CEILING` of 4.0; the ladder margin
 * is over `competent` at 150 matched pairs a rung against a `LADDER_CEILING` of
 * 0.4; and `expert` is 7.2's win-rate floor at d = 0.25, which is 0.800 and had
 * five matches of slack before any of this:
 *
 *   0     4.060 air   +0.727 ladder   expert 0.8167   <- the defect
 *   0.22  3.237       +0.333 (0.140)  pass
 *   0.28  3.057       +0.160 (0.145)  pass            <- shipped
 *   0.35  2.963       +0.093 (0.146)  expert 0.7967   <- fails 7.2 by one match
 *   1     1.377       -1.120 (0.164)  -               <- a certainty, and it
 *                                                        abolishes crossing
 *
 * The window is real but narrow, and 0.28 is picked to sit in the middle of it
 * rather than at either edge: it clears the ladder ceiling by 1.65 standard
 * errors where 0.22 clears it by 0.48, and it leaves 7.2's floor intact where
 * 0.35 does not. That floor is the same one `HEADER_SPREAD` fell foul of when it
 * was the candidate lever, and the difference is that this taxes only
 * uncontested crosses while `HEADER_SPREAD` taxed every header in the game.
 *
 * The routine is deliberately still a threat at the shipped value: +0.173 at
 * d = 0.25 and a biggest scoreline of eight. A cross is supposed to be
 * dangerous, and the curve is monotone, so this is a point on a dial rather than
 * a threshold that happened to measure well.
 */
const AIR_WIN_CHANCE = 0.28;

/**
 * The CPU goes up for a ball in the air in either box: to score in one, to
 * clear it out of the other.
 *
 * The defending half was missing outright, and it is issue #308's real cause.
 * The gate here read the *attacking* goal alone, so a CPU defender stood in his
 * own six-yard box under a dropping cross had no path to touch it — measured on
 * the near-post wing routine at the pinned station `(-1, 90, 30)`, a defender
 * satisfied `canAirStrike` on 320 of the 516 ticks where the human could head
 * it, and this gate opened on 0 of them. That is what made the near-post header
 * free: not that the man arriving in the box was unmarked (the nearest defender
 * averages 27 px from the ball, inside `CROSS_STRIKE_R`), but that being marked
 * cost the attacker nothing.
 *
 * Two rounds of keeper work were spent on that cell for the same reason. A
 * header met 20 px in front of the keeper arrives in 0.07 s, which is three
 * pixels of dive, so no keeper model can reach it; the contest that *is*
 * available happens a beat earlier, in the air, and nobody was allowed to enter
 * it. `HEADER_SPREAD` was the other candidate lever and it cost `expert` its
 * 7.2 win-rate floor, because it taxes every header in the game rather than the
 * uncontested ones.
 *
 * The defender is not given a difficulty dial. He challenges whenever the rules
 * already let him, which keeps this out of 6.8's four channels: it is not the
 * CPU being sharper at higher difficulty, it is the CPU being allowed to play
 * the ball at all. The human needs no equivalent — he has had this since the
 * cabinet shipped, as A in his own box, and `canAirStrike` never gated him on
 * position.
 */
function cpuAirStrike(m: MatchState): void {
  if (m.owner || m.ball.z < TRAP_Z || m.ball.z > HEADER_Z) {
    // Not a live aerial challenge, so the next one that is gets a fresh roll. A
    // ball that bounces back up into the band is a second ball.
    m.cpuAirRolled = false;
    return;
  }
  const attackY = attackGoalY(1, m.swapped);
  const ownY = ownGoalY(1, m.swapped);
  const attacking = Math.abs(m.ball.y - attackY) <= AIR_BOX;
  // Only a ball the opponent has *delivered* into this box is contested. A
  // rebound, a parry, a hoof and the CPU's own goal kick are all airborne in
  // the same place and none of them is the event this defends against, and
  // challenging for all of them is what took `expert` under its 7.2 win-rate
  // floor at d = 0.25 (0.787 against 0.800) — the same floor, and the same five
  // matches of slack, that ruled out `HEADER_SPREAD` as the lever for #308.
  // `shoot` clears `passInFlight` and keeps `lastFromCross`, so the second ball
  // off a header is not a cross by inheritance.
  const defending =
    Math.abs(m.ball.y - ownY) <= AIR_BOX && m.lastFromCross && m.passInFlight === 0;
  if (!attacking && !defending) {
    m.cpuAirRolled = false;
    return;
  }
  // First eligible, not nearest: the attacking branch below has picked its man
  // this way since the cabinet shipped, and switching it to nearest moves goals
  // that have nothing to do with this issue — measured at 0.2 air goals a match
  // off the near-post cell on its own, which is most of the headroom the ceiling
  // has. The defensive branch has no reason to disagree with it.
  let ready = -1;
  for (let idx = 1; idx < TEAM_SIZE; idx++) {
    if (canAirStrike(m, 1, idx)) {
      ready = idx;
      break;
    }
  }
  if (ready < 0) {
    m.cpuAirRolled = false;
    return;
  }
  if (attacking) {
    const keeper = m.players[0][0];
    const away = keeper.x <= CENTRE_X ? 1 : -1;
    const aim = clamp(away * (0.4 + 0.3 * m.difficulty) + signed(m) * 0.5 * (1 - m.difficulty), -1, 1);
    airStrike(m, 1, ready, aim);
    return;
  }
  // One roll per ball, exactly as the keeper gets one roll per shot, and for the
  // same reason: a defender who takes every ball he is legally able to take is
  // not contesting a cross, he is abolishing it. Taken as a certainty this moved
  // the wing routine from +0.727 over `competent` to -1.793, with air goals at
  // 0.817 a match and a biggest scoreline of four. A cross is supposed to be
  // dangerous; it is just not supposed to be uncontested.
  if (m.cpuAirRolled) return;
  m.cpuAirRolled = true;
  if (m.rng() >= AIR_WIN_CHANCE) return;
  headClear(m, 1, ready);
}

function stepCpuCarrier(m: MatchState, dt: number): void {
  const owner = m.owner;
  if (!owner || owner.side !== 1 || owner.idx === 0) return;
  if (m.restart && m.restart.side === 1 && isProtected(m.restart.elapsed)) return;
  m.cpuThink -= dt;
  if (m.cpuThink <= 0 || !m.cpuPlan) {
    m.cpuPlan = planCarrier(m, 1, owner.idx);
    m.cpuThink = cpuLatency(m.difficulty);
  }
  const plan = m.cpuPlan;
  const p = m.players[1][owner.idx];
  if (plan.action === 'shoot') {
    if (p.strike > 0) return;
    shoot(m, 1, plan.power, plan.aim, 'ground');
    m.cpuPlan = null;
    return;
  }
  if ((plan.action === 'pass' || plan.action === 'loft') && plan.target >= 0) {
    const mate = m.players[1][plan.target];
    const scale = 1.1 - 0.5 * m.difficulty;
    const ax = mate.x - p.x + signed(m) * 14 * scale;
    const ay = mate.y - p.y + signed(m) * 14 * scale;
    if (plan.action === 'loft') loftedPass(m, 1, ax, ay, plan.power);
    else groundPass(m, 1, ax, ay, plan.power);
    m.cpuPlan = null;
    return;
  }
  const t = dribbleTarget(m, 1, owner.idx);
  moveToward(p, t.x, t.y, carrySpeed(m, 1, owner.idx, cpuSpeed(m.difficulty)), dt);
  clampToPitch(p);
}

/** The CPU slides when it is close, facing, and the odds are worth it. */
function stepCpuDefence(m: MatchState, dt: number): void {
  const owner = m.owner;
  if (!owner || owner.side !== 0 || owner.idx === 0) return;
  const carrier = playerAt(m, owner);
  for (let idx = 1; idx < TEAM_SIZE; idx++) {
    const p = m.players[1][idx];
    if (p.slide > 0 || p.down > 0 || p.slideCd > 0) continue;
    if (dist(p.x, p.y, carrier.x, carrier.y) > TACKLE_R + 6) continue;
    // Slide willingness is a decision, so it is a difficulty channel: an
    // easy CPU commits rarely and can be run at, a hard one is always coming.
    if (m.rng() < (0.02 + 0.66 * m.difficulty) * dt) startSlide(m, 1, idx);
  }
}

/* ------------------------------------------------------------------ */
/* tackling                                                            */

function graceProtected(m: MatchState, side: Side, idx: number): boolean {
  if (m.winGrace && m.winGrace.side === side && m.winGrace.idx === idx && m.winGrace.t > 0) {
    return true;
  }
  if (m.restart && m.restart.side === side && isProtected(m.restart.elapsed)) return true;
  return false;
}

/**
 * Take the ball off a carrier and put it where the man who won it can get to
 * it.
 *
 * The direction here is the whole mechanic and the previous build had it
 * backwards: the ball was knocked 14 px *beyond* the carrier, on the far side
 * from the tackler, who was then locked in a third of a second of slide facing
 * the wrong way. A slide that succeeded on the roll therefore handed the ball
 * straight back — the tackler ended up in possession inside a second and a
 * half about four times in a thousand, against six to eight times in a hundred
 * for simply running at the carrier and not sliding at all, so the correct play
 * was never to slide. Now the ball comes back *through* the challenge toward
 * the tackler and past him, which is where a won tackle actually puts a
 * football, and it is his to chase.
 */
function knockLoose(m: MatchState, side: Side, idx: number): void {
  if (!m.owner) return;
  const carrier = playerAt(m, m.owner);
  const loser = m.owner;
  const p = m.players[side][idx];
  const dx = p.x - carrier.x;
  const dy = p.y - carrier.y;
  const len = Math.hypot(dx, dy) || 1;
  m.ball.x = carrier.x + (dx / len) * Math.min(len * 0.6, 12);
  m.ball.y = carrier.y + (dy / len) * Math.min(len * 0.6, 12);
  m.ball.z = 0;
  m.ball.vx = (dx / len) * KNOCK_SPEED;
  m.ball.vy = (dy / len) * KNOCK_SPEED;
  m.ball.vz = 0;
  m.owner = null;
  m.lastTouch = side;
  m.passInFlight = null;
  m.noScore = false;
  // The man who lost it is off balance and cannot simply turn and stand on it
  // again: the loose-ball scramble that follows is the one thing the tackler
  // has bought, and without a grace on the loser he never wins it.
  carrier.strike = Math.max(carrier.strike, KNOCK_STUMBLE);
  m.kickGrace = { side: loser.side, idx: loser.idx, t: KICK_GRACE };
  m.winGrace = { side, idx, t: WIN_GRACE };
}

function stepTackles(m: MatchState, dt: number, events: MatchEvent[]): void {
  const owner = m.owner;
  if (!owner) return;
  const carrier = playerAt(m, owner);
  const defSide = (1 - owner.side) as Side;

  // The keeper has a body: walking the ball in through him is impossible,
  // while a dribbled finish from an open angle around him still counts.
  //
  // The zone is the *penalty* area rather than the six-yard box, and the two
  // stopped being interchangeable when he started coming out to narrow the
  // angle. A keeper standing twenty-nine pixels off his line is at the feet of
  // a striker who has carried the ball to the edge of the six-yard box, and
  // under the old test he could only watch him: the zone said his own box, so
  // a carrier who stopped a pixel outside it was safe from the man he was
  // standing next to. That pocket is where "carry it into the box and strike
  // it" lived — a policy that did nothing else converted 0.43 of its shots
  // from there. Coming out and smothering is one act; where he happens to be
  // standing when he makes it is not a rule.
  const gkGoal = ownGoalY(defSide, m.swapped);
  const gk = m.players[defSide][0];
  const gkGap = dist(gk.x, gk.y, carrier.x, carrier.y);
  if (
    owner.idx !== 0 &&
    inPenaltyBox(carrier.x, carrier.y, gkGoal) &&
    gkGap < KEEPER_STEAL_R &&
    !graceProtected(m, owner.side, owner.idx) &&
    (gkGap < KEEPER_BODY_R || m.rng() < KEEPER_STEAL_RATE * dt)
  ) {
    m.ball.x = gk.x;
    m.ball.y = gk.y;
    takePossession(m, defSide, 0, true);
    return;
  }

  if (owner.idx === 0) return;
  if (graceProtected(m, owner.side, owner.idx)) return;

  const base = defSide === 0 ? HUMAN_TACKLE_BASE : cpuTackleBase(m.difficulty);
  for (let idx = 1; idx < TEAM_SIZE; idx++) {
    const p = m.players[defSide][idx];
    const d = dist(p.x, p.y, carrier.x, carrier.y);

    if (p.slide > 0 && !p.slideRolled && d <= TACKLE_R) {
      p.slideRolled = true;
      if (m.rng() < slideChance(base, carrier, p)) {
        m.stats.slidesWon[defSide]++;
        // He has won it, so he is up: the commitment a slide costs is priced
        // entirely in the failure case, where it is 0.8 s on the floor. Riding
        // out the rest of the slide on a *successful* challenge was the other
        // half of why winning one bought so little — the ball was at his feet
        // and he was still travelling, face down, in a fixed direction.
        p.slide = 0;
        knockLoose(m, defSide, idx);
        events.push({ type: 'tackle', side: defSide, won: true });
        return;
      }
      p.slide = 0;
      p.down = SLIDE_DOWN;
      events.push({ type: 'tackle', side: defSide, won: false });
      continue;
    }

    // Body steal: the quieter mechanic that keeps close defending viable
    // without slide-spam.
    if (p.slide === 0 && p.down === 0 && d < BODY_STEAL_R && d > 0) {
      const toX = (carrier.x - p.x) / d;
      const toY = (carrier.y - p.y) / d;
      const head = -(carrier.fx * toX + carrier.fy * toY);
      // The quiet steal scales with the same tackle rating the slide rolls
      // against, so a low-difficulty CPU is no better at it than at sliding.
      const stealRate = BODY_STEAL_RATE * (base / HUMAN_TACKLE_BASE);
      if (head > Math.cos((55 * Math.PI) / 180) && m.rng() < stealRate * dt) {
        knockLoose(m, defSide, idx);
        m.ball.x = p.x + p.fx * DRIBBLE_OFFSET;
        m.ball.y = p.y + p.fy * DRIBBLE_OFFSET;
        takePossession(m, defSide, idx, true);
        return;
      }
    }
  }
}

/**
 * One roll per slide, not one per frame: a slide is a single committed act, so
 * its published success rate is the number a player can reason about.
 */
export function slideChance(base: number, carrier: PlayerState, tackler: PlayerState): number {
  const dx = carrier.x - tackler.x;
  const dy = carrier.y - tackler.y;
  const len = Math.hypot(dx, dy) || 1;
  const cos = -(carrier.fx * (dx / len) + carrier.fy * (dy / len));
  const facing = cos > 0.5 ? 1 : cos > -0.17 ? 0.7 : 0.45;
  const speedDiff = clamp((carrier.speed - tackler.speed) / HUMAN_SPEED, 0, 0.4);
  return base * facing * (1 - speedDiff);
}

/* ------------------------------------------------------------------ */
/* ball                                                                */

function tryCapture(m: MatchState): void {
  if (m.owner) return;
  if (m.ball.z >= TRAP_Z) return;
  const speed = Math.hypot(m.ball.vx, m.ball.vy);
  let best: Owner | null = null;
  let bestD = Infinity;
  const loose = speed > CONTROL_MAX ? BLOCK_R : CAPTURE_R;
  for (const side of [0, 1] as const) {
    // Cutting out a pass that is on takes more than standing in its corridor;
    // receiving one takes only the usual first touch.
    const intercepting = m.passInFlight !== null && m.passInFlight !== side && speed <= CONTROL_MAX;
    for (let idx = 0; idx < TEAM_SIZE; idx++) {
      if (m.kickGrace && m.kickGrace.side === side && m.kickGrace.idx === idx) continue;
      if (idx === 0 && speed > KEEPER_TRAP_MAX) continue;
      const p = m.players[side][idx];
      if (p.down > 0) continue;
      // The man the ball was played to is expecting it, so he takes it in from
      // a stride further than he would reach for a loose one. This is the only
      // difference between a pass and a ball that happens to be going his way,
      // and without it there wasn't one: a third of every ground pass ran
      // through the receiver's own radius and out the other side, which is
      // most of the arithmetic behind passing being a net loss. A minute of
      // football has room for about a dozen possessions a side, so a verb that
      // costs a shot has to complete like a pass rather than like a punt.
      const receiving = m.passInFlight === side && m.passTarget === idx;
      const reach = intercepting ? PASS_INTERCEPT_R : receiving ? RECEIVE_R : loose;
      const d = dist(p.x, p.y, m.ball.x, m.ball.y);
      if (d < reach && d < bestD) {
        bestD = d;
        best = { side, idx };
      }
    }
  }
  if (!best) return;
  if (speed > CONTROL_MAX && best.idx !== 0) {
    // Too quick to trap: it deflects off him rather than being absorbed. This
    // is what stops defenders eating shots the way the audited build did.
    const angle = Math.atan2(m.ball.vy, m.ball.vx) + signed(m) * ((40 * Math.PI) / 180);
    const out = speed * 0.45;
    m.ball.vx = Math.cos(angle) * out;
    m.ball.vy = Math.sin(angle) * out;
    m.lastTouch = best.side;
    m.kickGrace = { side: best.side, idx: best.idx, t: KICK_GRACE };
    m.passInFlight = null;
    m.noScore = false;
    return;
  }
  if (m.passInFlight === best.side && best.idx !== 0) {
    m.stats.passesCompleted[best.side]++;
    if (!m.passLofted) m.stats.groundPassesCompleted[best.side]++;
    m.assist = { side: best.side, t: ASSIST_WINDOW };
  }
  takePossession(m, best.side, best.idx, false);
}

function stepBall(m: MatchState, dt: number, events: MatchEvent[]): void {
  const ball = m.ball;
  if (m.owner) {
    const p = playerAt(m, m.owner);
    ball.x = p.x + p.fx * DRIBBLE_OFFSET;
    ball.y = p.y + p.fy * DRIBBLE_OFFSET;
    ball.z = 0;
    ball.vx = 0;
    ball.vy = 0;
    ball.vz = 0;
    checkLines(m, events, true);
    return;
  }
  const prevX = ball.x;
  const prevY = ball.y;
  const prevZ = ball.z;
  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;
  if (ball.z > 0 || ball.vz !== 0) {
    ball.z += ball.vz * dt;
    ball.vz -= GRAVITY * dt;
    const drag = Math.exp(-AIR_FRICTION * dt);
    ball.vx *= drag;
    ball.vy *= drag;
    if (ball.z <= 0) {
      ball.z = 0;
      if (Math.abs(ball.vz) > 30) {
        ball.vz = -ball.vz * BOUNCE_Z;
        ball.vx *= BOUNCE_H;
        ball.vy *= BOUNCE_H;
      } else {
        ball.vz = 0;
      }
    }
  } else {
    const damp = Math.exp(-BALL_FRICTION * dt);
    ball.vx *= damp;
    ball.vy *= damp;
  }
  keeperPlane(m, 0, prevY, events);
  if (m.owner || m.phase !== 'play') return;
  keeperPlane(m, 1, prevY, events);
  if (m.owner || m.phase !== 'play') return;
  checkLines(m, events, false, { x: prevX, y: prevY, z: prevZ });
}

/**
 * Goals, woodwork and the three ways the ball leaves the field.
 *
 * The lateral position is taken at the point the ball *crosses* the line, not
 * at the first frame after it: at shot pace the ball travels five to eight
 * pixels a tick, so sampling after the crossing put near-post shots into the
 * woodwork band by up to a tick's worth of drift and made a well-placed finish
 * measurably worse than a slightly worse-placed one.
 */
function checkLines(
  m: MatchState,
  events: MatchEvent[],
  carried: boolean,
  prev?: { x: number; y: number; z: number }
): void {
  const ball = m.ball;
  for (const line of [0, PITCH_L]) {
    const crossed = line === 0 ? ball.y <= 0 : ball.y >= PITCH_L;
    if (!crossed) continue;
    const scoring = (attackGoalY(0, m.swapped) === line ? 0 : 1) as Side;
    const span = prev ? ball.y - prev.y : 0;
    const t = prev && span !== 0 ? clamp((line - prev.y) / span, 0, 1) : 1;
    const crossX = prev ? prev.x + (ball.x - prev.x) * t : ball.x;
    const crossZ = prev ? prev.z + (ball.z - prev.z) * t : ball.z;
    const lateral = Math.abs(crossX - CENTRE_X);
    if (crossZ < GOAL_HEIGHT && lateral < GOAL_HALF - 2 && !m.noScore) {
      scoreGoal(m, scoring, events, carried);
      return;
    }
    if (!carried && crossZ < GOAL_HEIGHT && lateral <= GOAL_HALF + 2) {
      // Woodwork: back into play with the pace bled off.
      const dir = line === 0 ? 1 : -1;
      ball.y = line + dir * 2;
      ball.vy = Math.abs(ball.vy) * 0.6 * dir;
      ball.vx *= 0.6;
      m.log.push({ type: 'post', side: scoring });
      events.push({ type: 'post', side: scoring });
      return;
    }
    awardRestart(m, events);
    return;
  }
  if (ball.x < 0 || ball.x > PITCH_W) awardRestart(m, events);
}

function scoreGoal(m: MatchState, side: Side, events: MatchEvent[], carried: boolean): void {
  const record: GoalRecord = {
    side,
    scorer: m.owner ? m.owner.idx : m.lastKicker[side],
    minute: Math.round(m.clock),
    contact: carried ? 'ground' : m.lastContact,
    dribbled: carried,
    fromCross: !carried && m.lastFromCross
  };
  m.score[side]++;
  m.goals.push(record);
  m.owner = null;
  m.ball.vx = 0;
  m.ball.vy = 0;
  m.ball.vz = 0;
  m.phase = 'goal';
  m.phaseTimer = GOAL_PAUSE;
  m.kickoffSide = (1 - side) as Side;
  const ev: MatchEvent = { type: 'goal', side, record };
  events.push(ev);
  m.log.push(ev);
  endSpell(m);
}

function nearestTo(m: MatchState, side: Side, x: number, y: number): number {
  let best = 1;
  let bestD = Infinity;
  for (let idx = 1; idx < TEAM_SIZE; idx++) {
    const p = m.players[side][idx];
    const d = dist(p.x, p.y, x, y);
    if (d < bestD) {
      bestD = d;
      best = idx;
    }
  }
  return best;
}

function awardRestart(m: MatchState, events: MatchEvent[]): void {
  const spec = boundaryRestart(m.ball.x, m.ball.y, m.lastTouch, m.swapped);
  if (!spec) return;
  m.owner = null;
  m.ball.vx = 0;
  m.ball.vy = 0;
  m.ball.vz = 0;
  m.ball.z = 0;
  m.ball.x = spec.x;
  m.ball.y = spec.y;
  m.passInFlight = null;
  const taker = spec.keeperTakes ? 0 : nearestTo(m, spec.side, spec.x, spec.y);
  m.restart = { ...spec, elapsed: 0, taker };
  m.phase = 'restart';
  m.phaseTimer = RESTART_PAUSE;
  const ev: MatchEvent = { type: 'restart', kind: spec.kind, side: spec.side };
  events.push(ev);
  m.log.push(ev);
}

/* ------------------------------------------------------------------ */
/* restarts                                                            */

function beginRestart(m: MatchState): void {
  const r = m.restart;
  if (!r) return;
  const taker = m.players[r.side][r.taker];
  const dir = attackDir(r.side, m.swapped);
  taker.x = clamp(r.x, 2, PITCH_W - 2);
  taker.y = clamp(r.y, 2, PITCH_L - 2);
  taker.fx = 0;
  taker.fy = dir;
  taker.slide = 0;
  taker.down = 0;
  taker.slideCd = 0;
  m.markers =
    r.kind === 'corner' ? cornerMarkers(attackGoalY(r.side, m.swapped), r.x, m.swapped, r.side) : [];
  m.ball.x = taker.x + taker.fx * DRIBBLE_OFFSET;
  m.ball.y = taker.y + taker.fy * DRIBBLE_OFFSET;
  m.ball.z = 0;
  m.owner = { side: r.side, idx: r.taker };
  // A stoppage is not a turnover: a side that puts the ball out and takes the
  // throw itself has never lost it, so the spell only closes when the restart
  // actually hands the ball to the other team.
  if (m.lastOwnerSide === 0 && r.side !== 0) endSpell(m);
  m.lastOwnerSide = r.side;
  m.lastTouch = r.side;
  m.keepers[r.side].hold = 0;
  // A throw-in cannot score directly; every other restart can.
  m.noScore = r.kind === 'throwIn';
  m.phase = 'play';
  if (r.side === 0 && r.taker !== 0) m.controlled = r.taker;
}

/** The taker ran out of patience: released along the facing, always lofted. */
function autoRelease(m: MatchState): void {
  const r = m.restart;
  if (!r || !m.owner) {
    m.restart = null;
    return;
  }
  const p = playerAt(m, m.owner);
  if (r.kind === 'goalKick') {
    const dir = attackDir(r.side, m.swapped);
    const aim = goalKickAim(0, 0, dir);
    p.fx = aim.x;
    p.fy = aim.y;
    kick(m, aim.x * GOAL_KICK_SPEED, aim.y * GOAL_KICK_SPEED, GOAL_KICK_LIFT);
  } else {
    kick(m, p.fx * AUTO_THROW_SPEED, p.fy * AUTO_THROW_SPEED, AUTO_THROW_LIFT);
  }
  m.lastFromCross = true;
  m.passInFlight = r.side;
  m.passLofted = true;
  const side = r.side;
  m.restart = null;
  m.markers = [];
  armKeeper(m, side, 'ground');
}

/* ------------------------------------------------------------------ */
/* clock                                                               */

function finishHalf(m: MatchState, events: MatchEvent[]): void {
  if (m.half === 0) {
    m.clock = 45;
    m.phase = 'halfTime';
    m.phaseTimer = HALF_TIME_PAUSE;
    const ev: MatchEvent = { type: 'halfTime' };
    events.push(ev);
    m.log.push(ev);
    return;
  }
  m.clock = FULL_TIME_MINUTES;
  m.phase = 'over';
  if (m.score[0] === m.score[1]) {
    m.winner = null;
    m.pendingShootout = m.knockout;
  } else {
    m.winner = m.score[0] > m.score[1] ? 0 : 1;
    m.pendingShootout = false;
  }
  const ev: MatchEvent = { type: 'end', winner: m.winner, pendingShootout: m.pendingShootout };
  events.push(ev);
  m.log.push(ev);
  endSpell(m);
}

function startSecondHalf(m: MatchState): void {
  m.half = 1;
  m.swapped = true;
  m.halfElapsed = 0;
  m.clock = 45;
  m.kickoffSide = 1;
  placeKickoff(m);
}

/* ------------------------------------------------------------------ */
/* tick                                                                */

/** A keeper holding the ball must let it go; this is also the sit-on-it fix. */
function keeperDistribution(m: MatchState): void {
  const owner = m.owner;
  if (!owner || owner.idx !== 0) return;
  if (m.restart && m.restart.taker === 0 && m.restart.side === owner.side) return;
  if (m.keepers[owner.side].hold > 0) return;
  const dir = attackDir(owner.side, m.swapped);
  const p = playerAt(m, owner);
  const lateral = (m.rng() - 0.5) * 1.1;
  const len = Math.hypot(lateral, 1);
  p.fx = lateral / len;
  p.fy = (dir as number) / len;
  kick(m, (lateral / len) * GOAL_KICK_SPEED, ((dir as number) / len) * GOAL_KICK_SPEED, GOAL_KICK_LIFT);
  m.lastFromCross = true;
  m.passInFlight = owner.side;
  m.passLofted = true;
  armKeeper(m, owner.side, 'ground');
}

/** Advance the match by `dt` seconds. Returns the events raised this tick. */
export function tickMatch(
  m: MatchState,
  dt: number,
  input: MatchInput = NEUTRAL_INPUT
): MatchEvent[] {
  const events: MatchEvent[] = [];
  if (m.phase === 'over') return events;

  if (m.phase !== 'play') {
    m.phaseTimer -= dt;
    if (m.phaseTimer <= 0) {
      if (m.phase === 'kickoff') {
        m.phase = 'play';
        const taker = m.players[m.kickoffSide][6];
        m.ball.x = taker.x + taker.fx * DRIBBLE_OFFSET;
        m.ball.y = taker.y + taker.fy * DRIBBLE_OFFSET;
        takePossession(m, m.kickoffSide, 6, false);
        if (m.kickoffSide === 0) m.controlled = 6;
        const ev: MatchEvent = { type: 'kickoff', side: m.kickoffSide };
        events.push(ev);
        m.log.push(ev);
      } else if (m.phase === 'goal') {
        if (m.halfElapsed >= m.halfSeconds) finishHalf(m, events);
        else placeKickoff(m);
      } else if (m.phase === 'halfTime') {
        startSecondHalf(m);
      } else if (m.phase === 'restart') {
        beginRestart(m);
      }
    }
    m.prev = { a: input.a, b: input.b, c: input.c };
    return events;
  }

  // Open play. The clock only burns here, so celebrations, half-time and
  // set-piece placement cost the player no football.
  m.halfElapsed += dt;
  m.clock = Math.min(m.half * 45 + 45, m.half * 45 + m.halfElapsed * MINUTES_PER_SECOND);
  if (m.lastOwnerSide === 0) m.spell += dt;
  else endSpell(m);

  if (m.kickGrace) {
    m.kickGrace.t -= dt;
    if (m.kickGrace.t <= 0) m.kickGrace = null;
  }
  if (m.winGrace) {
    m.winGrace.t -= dt;
    if (m.winGrace.t <= 0) m.winGrace = null;
  }
  if (m.assist) {
    m.assist.t -= dt;
    if (m.assist.t <= 0) m.assist = null;
  }
  if (m.restart) {
    m.restart.elapsed += dt;
    if (!m.owner) {
      m.restart = null;
      m.markers = [];
    } else if (m.restart.elapsed >= m.restart.deadline) {
      autoRelease(m);
    }
  }
  m.keepers[0].hold = Math.max(0, m.keepers[0].hold - dt);
  m.keepers[1].hold = Math.max(0, m.keepers[1].hold - dt);

  updateControlled(m, dt);
  humanAction(m, input, dt);
  stepHumanSide(m, input, dt);
  stepCpuSide(m, dt);
  keeperDistribution(m);
  stepTackles(m, dt, events);
  stepBall(m, dt, events);
  if (m.phase === 'play') tryCapture(m);

  m.prev = { a: input.a, b: input.b, c: input.c };

  if (m.phase === 'play' && m.halfElapsed >= m.halfSeconds) finishHalf(m, events);
  return events;
}

/** Up to three scorers per side with the minute, for the full-time screen. */
export function scorerList(m: MatchState, side: Side): GoalRecord[] {
  return m.goals.filter(g => g.side === side).slice(0, 3);
}
