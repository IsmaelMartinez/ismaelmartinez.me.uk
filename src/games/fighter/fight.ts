/**
 * One match: two fighters, a timer, rounds, and every rule of the 1991
 * fighting game that decides who falls down — after Street Fighter II: The
 * World Warrior.
 *
 * DOM-free and deterministic: `tickFight(fight, [p1, p2])` advances one
 * 60 fps frame from two `FrameInput`s and returns what happened as events, so
 * the tests can play whole matches headlessly with the CPU on both sides. It
 * never draws a random number; the CPU (`ai.ts`) owns its own seeded stream.
 *
 * The rules worth knowing before changing anything here:
 *
 * - **Hitstop freezes the world.** A connecting hit stops both fighters and
 *   every projectile for a few frames (longer for heavier hits), which is
 *   where the weight of a hit comes from. Inputs are still buffered through
 *   it, and a special motion finished during it cancels the normal that hit,
 *   which is the combo system the genre was built on.
 * - **Holding back is the guard.** Back blocks standing (beats overheads,
 *   which is every jumping attack), down-back blocks crouching (beats lows);
 *   both block mids. Holding back near an attack or a projectile puts the
 *   fighter into the guard pose rather than walking away (proximity guard).
 *   Specials chip a quarter of their damage through a guard, and chip can KO.
 * - **Air hits knock down; a knocked-down fighter cannot be hit** until he
 *   is back on his feet, and getting up is invulnerable, so there are no
 *   juggles and no unblockable wake-ups.
 * - **Stun builds and decays.** Every hit adds dizzy points; enough of them
 *   inside a short window leaves the fighter seeing stars once his hitstun
 *   ends. Mashing shortens it. Being hit wakes him.
 * - **A KO slows the world** to a third for a moment, as the arcade did.
 */
import {
  CHARGE_FRAMES,
  HP,
  HK,
  KICKS,
  MK,
  MP,
  PUNCHES,
  consumeMotion,
  createBuffer,
  isBack,
  isDown,
  isForward,
  isUp,
  motionDone,
  numpad,
  pushFrame,
  strengthOf,
  type CommandBuffer,
  type FrameInput
} from './motion';
import {
  FIGHTERS,
  normalFor,
  type CharId,
  type Fighter,
  type Guard,
  type NormalDef,
  type Posture,
  type ProjectileStyle,
  type SpecialDef,
  type Strength
} from './roster';

/** The visible screen, in framebuffer pixels (the CPS-1's 384 x 224). */
export const SCREEN_W = 384;
export const SCREEN_H = 224;
/** Screen row the floor sits on. */
export const FLOOR_Y = 204;
/** The stage is two screens wide and scrolls. */
export const STAGE_W = 768;
/** Fighters stop this far inside the screen edge. */
const EDGE = 22;
/** Count the round clock starts from. */
export const ROUND_TIME = 99;
/** Frames per clock count: the arcade's clock ran a little faster than seconds. */
export const TIMER_TICK = 52;
/** Rounds to win the match. */
export const ROUNDS_TO_WIN = 2;
/** The fourth round is the final one; a tie after it is a draw game. */
export const MAX_ROUNDS = 4;

const GRAVITY = 0.4;
const JUMP_VY = 7.8;
/** Frames a jump spends in the air. */
export const AIR_FRAMES = Math.round((2 * JUMP_VY) / GRAVITY);
const PREJUMP = 4;
const LAND = 4;
/** Hitstun, blockstun and hitstop by strength (light, medium, heavy). */
const HITSTUN = [12, 16, 20] as const;
const BLOCKSTUN = [8, 12, 15] as const;
const HITSTOP = [6, 9, 12] as const;
const PUSHBACK = [2.2, 2.8, 3.4] as const;
/** Frames lying down after a knockdown, then rising (invulnerable throughout). */
const DOWN_FRAMES = 34;
const GETUP_FRAMES = 22;
/** Frames since the last hit before the dizzy meter starts to drain. */
const STUN_HOLD = 100;
const DIZZY_FRAMES = 170;
/** Frames the KO slow motion lasts and how many real frames make one game frame in it. */
const KO_SLOW_FRAMES = 90;
const KO_SLOW_RATE = 3;
/** How near an attack must be for holding back to raise the guard instead of walking. */
const GUARD_RANGE = 110;
/** Throw reach between the two fighters' centres. */
const THROW_RANGE = 46;
const THROW_DAMAGE = 22;
/** Frames from a throw's grab to the release. */
const THROW_HOLD = 14;

/** Points by strength for a normal that connects; specials, throws and blocks below. */
export const POINTS = {
  normal: [100, 300, 500] as const,
  special: 1000,
  throw: 1500,
  /** Per clock count left when the round is won. */
  time: 100,
  /** Per point of health left when the round is won. */
  vitality: 50,
  perfect: 20000
};

export type FState =
  | 'stand'
  | 'walk'
  | 'guard'
  | 'crouch'
  | 'prejump'
  | 'jump'
  | 'land'
  | 'attack'
  | 'special'
  | 'blockstun'
  | 'hitstun'
  | 'fall'
  | 'down'
  | 'getup'
  | 'throw'
  | 'thrown'
  | 'dizzy'
  | 'ko'
  | 'win'
  | 'lose';

export interface Action {
  type: 'normal' | 'special';
  posture: Posture;
  button: 'P' | 'K';
  strength: Strength;
  normal?: NormalDef;
  special?: SpecialDef;
  /** Hits landed by this action (multi-hit specials count up to `hits`). */
  hits: number;
  /** Frames until a multi-hit move may hit again. */
  rehit: number;
  /** Connected (hit or blocked) at least once, which opens the cancel window. */
  connected: boolean;
  /** The special's own clock; for normals it is the fighter's frame. */
  t: number;
  /** Rush and spin: distance still to travel. */
  travel: number;
  /** Rapid: frames the mash has bought. */
  until: number;
}

export interface FighterState {
  side: 0 | 1;
  id: CharId;
  def: Fighter;
  x: number;
  /** Height of the feet above the floor. */
  y: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  health: number;
  state: FState;
  /** Frames in the current state. */
  frame: number;
  action: Action | null;
  /** Frames of hitstun or blockstun left. */
  lock: number;
  /** The posture the stun or guard is in (a crouching guard looks different). */
  low: boolean;
  /** Pushback slide, px per frame, decaying. */
  slide: number;
  /** Jump direction, -1 back, 0 up, 1 forward (relative to facing at takeoff). */
  jumpDir: -1 | 0 | 1;
  airAttacked: boolean;
  buf: CommandBuffer;
  input: FrameInput;
  /** Full invulnerability frames (a dragon's start-up, getting up). */
  invuln: number;
  stunPoints: number;
  sinceHit: number;
  /** Set when the meter fills; the stars come out when the hitstun ends. */
  dizzyPending: boolean;
  /** Hits taken in the current combo. */
  comboTaken: number;
  /** Frames left on the white flash the renderer shows on a hit. */
  flash: number;
  /** Which way the last hit came from, for the reel. */
  hitHigh: boolean;
  /** Round wins this match. */
  wins: number;
  /** Has a projectile on screen. */
  projectileOut: boolean;
  /** The thrower holds the thrown: their centre offset and the throw's damage. */
  grab: { damage: number; backward: boolean; slam: boolean } | null;
}

export interface Projectile {
  side: 0 | 1;
  x: number;
  y: number;
  vx: number;
  damage: number;
  strength: Strength;
  style: ProjectileStyle;
  guard: Guard;
  /** Frames alive, for the animation. */
  t: number;
  dead: boolean;
}

/** A bonus-stage object: the car, an oil drum. */
export interface Target {
  kind: 'car' | 'drum';
  x: number;
  /** Bottom edge above the floor (drums stack). */
  y: number;
  w: number;
  h: number;
  hp: number;
  maxHp: number;
  flash: number;
  /** Frames since destroyed, for the debris; -1 while standing. */
  broken: number;
}

export type FightPhase = 'intro' | 'call' | 'fight' | 'ko' | 'timeover' | 'roundEnd' | 'matchEnd';

export interface FightState {
  mode: 'match' | 'bonus';
  fighters: [FighterState, FighterState | null];
  projectiles: Projectile[];
  targets: Target[];
  phase: FightPhase;
  /** Frames in the current phase. */
  phaseFrame: number;
  round: number;
  /** Clock count shown. */
  timer: number;
  timerFrames: number;
  hitstop: number;
  slow: number;
  /** Real frames counted in the slow motion, for its rate. */
  slowStep: number;
  camera: number;
  /** The round's result, once decided. */
  roundWinner: 0 | 1 | null;
  perfect: boolean;
  doubleKo: boolean;
  /** The match's winner, once decided; null for a draw game. */
  winner: 0 | 1 | null;
  /** Total frames simulated, for animation clocks. */
  clock: number;
  /** Points each side has earned this match. */
  points: [number, number];
}

export type FightEvent =
  | { type: 'roundCall'; round: number; final: boolean }
  | { type: 'fight' }
  | { type: 'swing'; side: 0 | 1; strength: Strength }
  | {
      type: 'hit';
      side: 0 | 1;
      x: number;
      y: number;
      strength: Strength;
      blocked: boolean;
      damage: number;
      kind: 'normal' | 'special' | 'throw' | 'projectile';
    }
  | { type: 'points'; side: 0 | 1; points: number; x: number; y: number }
  | { type: 'combo'; side: 0 | 1; hits: number }
  | { type: 'special'; side: 0 | 1; kind: SpecialDef['kind']; style?: ProjectileStyle }
  | { type: 'clash'; x: number; y: number }
  | { type: 'land'; side: 0 | 1 }
  | { type: 'knockdown'; side: 0 | 1; x: number }
  | { type: 'throw'; side: 0 | 1 }
  | { type: 'dizzy'; side: 0 | 1 }
  | { type: 'ko'; side: 0 | 1; double: boolean }
  | { type: 'timeOver' }
  | { type: 'roundEnd'; winner: 0 | 1 | null; perfect: boolean; double: boolean }
  | { type: 'roundBonus'; side: 0 | 1; time: number; vitality: number; perfect: number }
  | { type: 'matchEnd'; winner: 0 | 1 | null }
  | { type: 'target'; x: number; y: number; kind: Target['kind']; destroyed: boolean }
  | { type: 'bonusEnd'; cleared: boolean; bonus: number }
  | { type: 'danger'; on: boolean };

function createFighter(id: CharId, side: 0 | 1, x: number): FighterState {
  const def = FIGHTERS[id];
  return {
    side,
    id,
    def,
    x,
    y: 0,
    vx: 0,
    vy: 0,
    facing: side === 0 ? 1 : -1,
    health: def.health,
    state: 'stand',
    frame: 0,
    action: null,
    lock: 0,
    low: false,
    slide: 0,
    jumpDir: 0,
    airAttacked: false,
    buf: createBuffer(),
    input: { x: 0, y: 0, held: 0, pressed: 0 },
    invuln: 0,
    stunPoints: 0,
    sinceHit: 0,
    dizzyPending: false,
    comboTaken: 0,
    flash: 0,
    hitHigh: true,
    wins: 0,
    projectileOut: false,
    grab: null
  };
}

const START_GAP = 72;

export function createFight(p1: CharId, p2: CharId): FightState {
  const mid = STAGE_W / 2;
  return {
    mode: 'match',
    fighters: [createFighter(p1, 0, mid - START_GAP), createFighter(p2, 1, mid + START_GAP)],
    projectiles: [],
    targets: [],
    phase: 'intro',
    phaseFrame: 0,
    round: 1,
    timer: ROUND_TIME,
    timerFrames: 0,
    hitstop: 0,
    slow: 0,
    slowStep: 0,
    camera: mid,
    roundWinner: null,
    perfect: false,
    doubleKo: false,
    winner: null,
    clock: 0,
    points: [0, 0]
  };
}

/** The bonus stages: the car, and the stacked oil drums. */
export type BonusKind = 'car' | 'drums';
export const BONUS_TIME = 40;
export const BONUS_CLEAR = 20000;

export function createBonus(p1: CharId, kind: BonusKind): FightState {
  const f = createFight(p1, p1);
  const mid = STAGE_W / 2;
  f.mode = 'bonus';
  f.fighters = [createFighter(p1, 0, mid - 90), null];
  f.timer = BONUS_TIME;
  if (kind === 'car') {
    f.targets = [{ kind: 'car', x: mid + 40, y: 0, w: 176, h: 70, hp: 260, maxHp: 260, flash: 0, broken: -1 }];
  } else {
    const drums: Target[] = [];
    const rows = [
      [-30, 0, 30],
      [-15, 15],
      [0]
    ];
    rows.forEach((row, r) =>
      row.forEach(dx => drums.push({ kind: 'drum', x: mid + 50 + dx * 1.2, y: r * 40, w: 34, h: 40, hp: 40, maxHp: 40, flash: 0, broken: -1 }))
    );
    f.targets = drums;
  }
  return f;
}

// --- Geometry -----------------------------------------------------------------

export interface Box {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/** A fighter-relative box (x forward from the feet) in world space. */
function worldBox(f: FighterState, b: { x: number; y: number; w: number; h: number }): Box {
  const a = f.x + f.facing * b.x;
  const c = f.x + f.facing * (b.x + b.w);
  return { x0: Math.min(a, c), x1: Math.max(a, c), y0: f.y + b.y, y1: f.y + b.y + b.h };
}

const overlap = (a: Box, b: Box): boolean => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

const halfWidth = (f: FighterState): number => (f.def.build === 'giant' || f.def.build === 'heavy' ? 19 : 15);

export function isAirborne(f: FighterState): boolean {
  if (f.state === 'jump' || f.state === 'fall' || f.state === 'ko') return f.y > 0 || f.vy !== 0;
  if (f.state === 'special' && f.y > 0) return true;
  return false;
}

/** Whether the fighter is crouching for the purposes of being hit and guarding. */
function crouched(f: FighterState): boolean {
  if (f.state === 'crouch') return true;
  if ((f.state === 'blockstun' || f.state === 'hitstun' || f.state === 'guard') && f.low) return true;
  return f.state === 'attack' && f.action?.posture === 'crouch';
}

/** Where a fighter can be hit, in world space; empty while untouchable. */
export function hurtboxes(f: FighterState): Box[] {
  if (f.invuln > 0) return [];
  if (f.state === 'down' || f.state === 'getup' || f.state === 'ko' || f.state === 'win' || f.state === 'lose') return [];
  if (f.state === 'fall' || f.state === 'thrown' || f.state === 'throw') return [];
  const w = halfWidth(f);
  const h = f.def.height;
  const out: Box[] = [];
  if (crouched(f)) out.push(worldBox(f, { x: -w - 2, y: 0, w: 2 * w + 4, h: h * 0.62 }));
  else if (isAirborne(f) || f.state === 'prejump') {
    const a = f.action?.special;
    if (a && (a.kind === 'rush' || a.kind === 'spin')) out.push(worldBox(f, { x: -w, y: 18, w: 2 * w, h: h * 0.45 }));
    else out.push(worldBox(f, { x: -w, y: 14, w: 2 * w, h: h * 0.72 }));
  } else {
    const a = f.action?.special;
    if (a && a.kind === 'rush') out.push(worldBox(f, { x: -w, y: 8, w: 2 * w + 8, h: h * 0.5 }));
    else out.push(worldBox(f, { x: -w, y: 0, w: 2 * w, h }));
  }
  // An extended limb can be hit, which is what makes poking a game.
  const n = f.action?.normal;
  if (n && f.action && f.state === 'attack' && f.frame >= n.startup) {
    const b = n.box;
    out.push(worldBox(f, { x: b.x + 4, y: b.y + 2, w: Math.max(4, b.w - 12), h: Math.max(4, b.h - 4) }));
  }
  return out;
}

/** The box an action hits with on this frame, or null. */
export function hitbox(f: FighterState): { box: Box; guard: Guard } | null {
  const a = f.action;
  if (!a) return null;
  if (a.type === 'normal' && a.normal) {
    const n = a.normal;
    if (f.frame < n.startup || f.frame >= n.startup + n.active) return null;
    if (a.connected) return null;
    return { box: worldBox(f, n.box), guard: n.guard };
  }
  const s = a.special;
  if (!s || a.rehit > 0) return null;
  // A rapid move keeps landing for as long as it is mashed; the rest stop at their count.
  if (s.kind !== 'rapid' && s.hits !== undefined && a.hits >= s.hits) return null;
  if (s.kind !== 'rapid' && s.hits === undefined && a.connected) return null;
  const h = f.def.height;
  const t = a.t;
  const st = a.strength;
  switch (s.kind) {
    case 'rising':
      return t >= 3 && t < 12 + st * 2 ? { box: worldBox(f, { x: 4, y: h * 0.45, w: 30, h: h * 0.6 }), guard: 'mid' } : null;
    case 'flip':
      return t >= 3 && t < 16 ? { box: worldBox(f, { x: -6, y: h * 0.25, w: 46, h: h * 0.75 }), guard: 'mid' } : null;
    case 'spin':
      return t >= 6 && a.travel > 0 ? { box: worldBox(f, { x: -40, y: 28, w: 80, h: 26 }), guard: 'mid' } : null;
    case 'rapid':
      if (t < 6 || t > a.until) return null;
      if (s.button === 'K') return { box: worldBox(f, { x: 12, y: 24, w: 54, h: 46 }), guard: 'mid' };
      if (f.def.build === 'beast') return { box: worldBox(f, { x: -10, y: 10, w: 56, h: h * 0.85 }), guard: 'mid' };
      return { box: worldBox(f, { x: 12, y: 40, w: 48, h: 36 }), guard: 'mid' };
    case 'rush':
      return t >= 8 && a.travel > 0
        ? { box: worldBox(f, { x: 4, y: s.guard === 'low' ? 4 : h * 0.3, w: 42, h: h * 0.45 }), guard: s.guard ?? 'mid' }
        : null;
    case 'lariat':
      return t >= 6 && t < 50 ? { box: worldBox(f, { x: -54, y: h * 0.5, w: 108, h: 26 }), guard: 'mid' } : null;
    case 'breath':
      return t >= 14 && t < 34 ? { box: worldBox(f, { x: 22, y: h * 0.48, w: 60, h: 28 }), guard: 'mid' } : null;
    default:
      return null;
  }
}

// --- Actions ------------------------------------------------------------------

function setState(f: FighterState, state: FState): void {
  f.state = state;
  f.frame = 0;
}

function neutral(f: FighterState): boolean {
  return f.state === 'stand' || f.state === 'walk' || f.state === 'crouch' || f.state === 'guard';
}

function startNormal(f: FighterState, posture: Posture, button: 'P' | 'K', strength: Strength): void {
  const normal = normalFor(f.def, posture, button, strength);
  f.action = { type: 'normal', posture, button, strength, normal, hits: 0, rehit: 0, connected: false, t: 0, travel: 0, until: 0 };
  if (posture === 'air') {
    f.airAttacked = true;
    // An air attack runs on its own clock inside the jump state.
    f.frame = 0;
    return;
  }
  setState(f, 'attack');
  f.vx = 0;
}

const RUSH_DISTANCE = [96, 136, 176] as const;

function startSpecial(fight: FightState, f: FighterState, s: SpecialDef, strength: Strength): void {
  f.action = {
    type: 'special',
    posture: 'stand',
    button: s.button,
    strength,
    special: s,
    hits: 0,
    rehit: 0,
    connected: false,
    t: 0,
    travel: 0,
    until: 0
  };
  setState(f, 'special');
  f.vx = 0;
  f.vy = 0;
  f.y = Math.max(0, f.y);
  if (s.kind === 'rush') f.action.travel = RUSH_DISTANCE[strength];
  if (s.kind === 'spin') f.action.travel = 70 + strength * 40;
  if (s.kind === 'rapid') f.action.until = 30;
  if (s.kind === 'rising') f.invuln = 4 + strength * 2;
  if (s.kind === 'flip') f.invuln = 6;
  fightEventsSink?.push({ type: 'special', side: f.side, kind: s.kind, style: s.style });
}

/**
 * The events of the tick in progress. Set by `tickFight` for its duration so
 * the deep helpers can report without threading an array through every call.
 */
let fightEventsSink: FightEvent[] | null = null;
const emit = (e: FightEvent): void => {
  fightEventsSink?.push(e);
};

/** Try every special this fighter owns against the buffer. */
function trySpecial(fight: FightState, f: FighterState): boolean {
  const pressed = f.input.pressed;
  if (!pressed) return false;
  // Charge specials and dragon punches before quarter circles, as the arcade
  // checked them: a dragon's motion contains a fireball's.
  const order = [...f.def.specials].sort((a, b) => rank(a) - rank(b));
  for (const s of order) {
    const strength = strengthOf(pressed, s.button);
    if (strength < 0) continue;
    if (!motionDone(f.buf, s.motion, s.button)) continue;
    if (s.kind === 'projectile' && f.projectileOut) continue;
    consumeMotion(f.buf, s.motion);
    startSpecial(fight, f, s, strength as Strength);
    return true;
  }
  return false;
}

function rank(s: SpecialDef): number {
  switch (s.motion) {
    case 'ppp':
      return 0;
    case 'hcb':
      return 1;
    case 'dp':
      return 2;
    case 'chargeBF':
    case 'chargeDU':
      return 3;
    case 'mash':
      return 5;
    default:
      return 4;
  }
}

function tryThrow(fight: FightState, f: FighterState, opp: FighterState | null): boolean {
  if (!opp) return false;
  const pressed = f.input.pressed & (MP | HP | MK | HK);
  if (!pressed) return false;
  const dir = numpad(f.input.x, f.input.y, f.facing);
  if (!(dir === 4 || dir === 6)) return false;
  if (Math.abs(opp.x - f.x) > THROW_RANGE + (halfWidth(opp) - 15)) return false;
  if (!throwable(opp)) return false;
  beginThrow(f, opp, THROW_DAMAGE, dir === 4, false);
  return true;
}

function throwable(opp: FighterState): boolean {
  if (opp.invuln > 0 || opp.y > 0) return false;
  return opp.state === 'stand' || opp.state === 'walk' || opp.state === 'crouch' || opp.state === 'guard' || opp.state === 'attack' || opp.state === 'land' || opp.state === 'dizzy';
}

function beginThrow(f: FighterState, opp: FighterState, damage: number, backward: boolean, slam: boolean): void {
  setState(f, 'throw');
  f.action = null;
  f.vx = 0;
  f.grab = { damage, backward, slam };
  setState(opp, 'thrown');
  opp.action = null;
  opp.lock = 0;
  opp.vx = 0;
  opp.vy = 0;
  opp.dizzyPending = false;
  emit({ type: 'throw', side: f.side });
}

/** Read the stick and buttons of a fighter who is free to act. */
function control(fight: FightState, f: FighterState, opp: FighterState | null): void {
  const inp = f.input;
  const dir = numpad(inp.x, inp.y, f.facing);
  if (f.state === 'jump') {
    if (!f.airAttacked && inp.pressed) {
      const p = strengthOf(inp.pressed, 'P');
      const k = strengthOf(inp.pressed, 'K');
      if (p >= 0 || k >= 0) startNormal(f, 'air', p >= k ? 'P' : 'K', (p >= k ? p : k) as Strength);
    }
    return;
  }
  if (!neutral(f)) return;
  if (trySpecial(fight, f)) return;
  if (inp.pressed && tryThrow(fight, f, opp)) return;
  if (inp.pressed & (PUNCHES | KICKS)) {
    const p = strengthOf(inp.pressed, 'P');
    const k = strengthOf(inp.pressed, 'K');
    const button = p >= k ? 'P' : 'K';
    startNormal(f, isDown(dir) ? 'crouch' : 'stand', button, (button === 'P' ? p : k) as Strength);
    return;
  }
  if (isUp(dir)) {
    setState(f, 'prejump');
    f.jumpDir = isForward(dir) ? 1 : isBack(dir) ? -1 : 0;
    f.vx = 0;
    return;
  }
  if (isDown(dir)) {
    if (f.state !== 'crouch') setState(f, 'crouch');
    f.low = true;
    f.vx = 0;
    return;
  }
  if (isBack(dir) && opp && threatened(fight, f, opp)) {
    if (f.state !== 'guard') setState(f, 'guard');
    f.low = false;
    f.vx = 0;
    return;
  }
  if (dir === 4 || dir === 6) {
    if (f.state !== 'walk') setState(f, 'walk');
    f.vx = dir === 6 ? f.facing * f.def.walk[0] : -f.facing * f.def.walk[1];
    return;
  }
  if (f.state !== 'stand') setState(f, 'stand');
  f.vx = 0;
}

/** Whether something is coming that holding back should guard against. */
function threatened(fight: FightState, f: FighterState, opp: FighterState): boolean {
  if (Math.abs(opp.x - f.x) < GUARD_RANGE && (opp.state === 'attack' || opp.state === 'special' || (opp.action && opp.state === 'jump'))) return true;
  return fight.projectiles.some(p => p.side !== f.side && Math.abs(p.x - f.x) < GUARD_RANGE);
}

/** Whether a fighter is holding a guard that stops an attack of this height. */
function guarding(f: FighterState, guard: Guard): boolean {
  const ok = f.state === 'stand' || f.state === 'walk' || f.state === 'crouch' || f.state === 'guard' || f.state === 'blockstun';
  if (!ok || f.y > 0) return false;
  const dir = numpad(f.input.x, f.input.y, f.facing);
  if (!isBack(dir)) return false;
  const low = isDown(dir);
  if (guard === 'low') return low;
  if (guard === 'high') return !low;
  return true;
}

// --- Hits ---------------------------------------------------------------------

function award(fight: FightState, side: 0 | 1, points: number, x: number, y: number): void {
  if (points <= 0) return;
  fight.points[side] += points;
  emit({ type: 'points', side, points, x, y });
}

/** Land a hit (or a block) of `damage` from `atk` on `def`. */
function strike(
  fight: FightState,
  atk: FighterState,
  def: FighterState,
  opts: {
    damage: number;
    stun: number;
    strength: Strength;
    guard: Guard;
    kind: 'normal' | 'special' | 'projectile';
    knockdown: boolean;
    at: { x: number; y: number };
    fromX: number;
  }
): void {
  const blocked = guarding(def, opts.guard);
  const dirAway = def.x >= opts.fromX ? 1 : -1;
  if (blocked) {
    const chip = opts.kind === 'normal' ? 0 : Math.max(1, Math.floor(opts.damage / 4));
    def.health = Math.max(0, def.health - chip);
    def.low = isDown(numpad(def.input.x, def.input.y, def.facing));
    setState(def, 'blockstun');
    def.lock = BLOCKSTUN[opts.strength] + (opts.kind === 'normal' ? 0 : 2);
    def.slide = PUSHBACK[opts.strength] * 0.8 * dirAway;
    fight.hitstop = Math.max(fight.hitstop, HITSTOP[opts.strength] - 2);
    emit({ type: 'hit', side: atk.side, x: opts.at.x, y: opts.at.y, strength: opts.strength, blocked: true, damage: chip, kind: opts.kind });
    if (def.health <= 0) knockOut(fight, def, atk);
    return;
  }
  def.health = Math.max(0, def.health - opts.damage);
  def.flash = 6;
  def.hitHigh = opts.at.y - def.y > def.def.height * 0.45;
  const wasHurt = def.state === 'hitstun' || def.state === 'fall' || def.state === 'dizzy';
  def.comboTaken = wasHurt && def.comboTaken > 0 ? def.comboTaken + 1 : 1;
  if (def.comboTaken >= 2) emit({ type: 'combo', side: atk.side, hits: def.comboTaken });
  if (def.state === 'dizzy') def.dizzyPending = false;
  def.stunPoints += opts.stun;
  def.sinceHit = 0;
  if (def.stunPoints >= def.def.stunMax && def.state !== 'dizzy') {
    def.dizzyPending = true;
    def.stunPoints = 0;
  }
  def.action = null;
  def.projectileOut = fight.projectiles.some(p => p.side === def.side && !p.dead);
  fight.hitstop = Math.max(fight.hitstop, HITSTOP[opts.strength] + (opts.kind === 'normal' ? 0 : 2));
  emit({ type: 'hit', side: atk.side, x: opts.at.x, y: opts.at.y, strength: opts.strength, blocked: false, damage: opts.damage, kind: opts.kind });
  const points = opts.kind === 'normal' ? POINTS.normal[opts.strength] : POINTS.special;
  award(fight, atk.side, points, opts.at.x, opts.at.y);
  if (def.health <= 0) {
    knockOut(fight, def, atk);
    return;
  }
  if (opts.knockdown || def.y > 0 || isAirborne(def)) {
    launch(def, dirAway, opts.knockdown ? 1 : 0.7);
    return;
  }
  def.low = crouched(def);
  setState(def, 'hitstun');
  def.lock = HITSTUN[opts.strength] + (opts.kind === 'normal' ? 0 : 4);
  def.slide = PUSHBACK[opts.strength] * dirAway;
}

/** Send a fighter flying into a knockdown. */
function launch(f: FighterState, dirAway: number, power: number): void {
  setState(f, 'fall');
  f.action = null;
  f.vx = dirAway * 2.2 * power;
  f.vy = 4.6 * power + (f.y > 0 ? 0.5 : 0);
  f.slide = 0;
}

function knockOut(fight: FightState, def: FighterState, atk: FighterState): void {
  setState(def, 'ko');
  def.action = null;
  def.vx = (def.x >= atk.x ? 1 : -1) * 2.4;
  def.vy = 5.4;
  def.invuln = 0;
  def.dizzyPending = false;
  if (fight.phase !== 'ko') {
    fight.phase = 'ko';
    fight.phaseFrame = 0;
    fight.slow = KO_SLOW_FRAMES;
  }
}

function resolveHits(fight: FightState): void {
  const [a, b] = fight.fighters;
  const pairs: [FighterState, FighterState | null][] = [
    [a, b],
    [b as FighterState, a]
  ];
  // Both hitboxes are read before either hit lands, so a trade is a trade.
  const pending: (() => void)[] = [];
  for (const [atk, def] of pairs) {
    if (!atk) continue;
    const hb = hitbox(atk);
    if (!hb) continue;
    if (fight.mode === 'bonus') {
      hitTargets(fight, atk, hb.box);
      continue;
    }
    if (!def) continue;
    const hurts = hurtboxes(def);
    if (!hurts.some(h => overlap(hb.box, h))) continue;
    const act = atk.action as Action;
    pending.push(() => {
      // A trade may have knocked the attacker out of his move first.
      if (atk.action !== act) return;
      const n = act.normal;
      const s = act.special;
      const strength = act.strength;
      const at = { x: (Math.max(hb.box.x0, def.x - 20) + Math.min(hb.box.x1, def.x + 20)) / 2, y: (hb.box.y0 + hb.box.y1) / 2 };
      const last = s?.hits !== undefined ? act.hits + 1 >= s.hits : true;
      strike(fight, atk, def, {
        damage: n ? n.damage : (s as SpecialDef).damage[strength],
        stun: n ? n.stun : 8,
        strength: n ? strength : 2,
        guard: hb.guard,
        kind: n ? 'normal' : 'special',
        knockdown: n ? !!n.knockdown : last && s?.kind !== 'rapid' && s?.kind !== 'lariat',
        at,
        fromX: atk.x
      });
      act.connected = true;
      act.hits++;
      act.rehit = s?.kind === 'rapid' ? 5 : s?.kind === 'lariat' ? 14 : 8;
      // A rush stops at the hit; the beast bounces back off it.
      if (s?.kind === 'rush' && (s.hits === undefined || act.hits >= s.hits)) {
        act.travel = 0;
        // The beast and the sumo bounce back off what they hit.
        if (atk.def.build === 'beast' || atk.def.build === 'heavy') {
          atk.vx = -atk.facing * 2.4;
          atk.vy = 4.2;
          atk.y = Math.max(atk.y, 1);
        }
      }
    });
  }
  for (const p of pending) p();
}

function hitTargets(fight: FightState, atk: FighterState, box: Box): void {
  const act = atk.action as Action;
  for (const t of fight.targets) {
    if (t.hp <= 0) continue;
    const tb: Box = { x0: t.x - t.w / 2, x1: t.x + t.w / 2, y0: t.y, y1: t.y + t.h };
    if (!overlap(box, tb)) continue;
    const dmg = act.normal ? act.normal.damage : (act.special as SpecialDef).damage[act.strength];
    t.hp = Math.max(0, t.hp - dmg);
    t.flash = 6;
    act.connected = true;
    act.hits++;
    act.rehit = 8;
    fight.hitstop = Math.max(fight.hitstop, HITSTOP[act.strength]);
    const at = { x: Math.max(tb.x0, Math.min(tb.x1, (box.x0 + box.x1) / 2)), y: (Math.max(box.y0, tb.y0) + Math.min(box.y1, tb.y1)) / 2 };
    award(fight, atk.side, dmg * 10, at.x, at.y);
    if (t.hp === 0) {
      t.broken = 0;
      award(fight, atk.side, t.kind === 'car' ? 2000 : 1000, t.x, t.y + t.h);
    }
    emit({ type: 'target', x: at.x, y: at.y, kind: t.kind, destroyed: t.hp === 0 });
    // Drums above a broken one drop to the floor.
    if (t.hp === 0) settleTargets(fight);
    return;
  }
}

function settleTargets(fight: FightState): void {
  for (const t of fight.targets) {
    if (t.hp <= 0 || t.y === 0) continue;
    const below = fight.targets.some(o => o !== t && o.hp > 0 && Math.abs(o.x - t.x) < (o.w + t.w) / 2 - 2 && Math.abs(o.y + o.h - t.y) < 1);
    if (!below) t.y = Math.max(0, t.y - t.h);
  }
}

function stepProjectiles(fight: FightState): void {
  const ps = fight.projectiles;
  for (const p of ps) {
    if (p.dead) continue;
    p.x += p.vx;
    p.t++;
  }
  // Two projectiles meeting cancel out.
  for (let i = 0; i < ps.length; i++) {
    for (let j = i + 1; j < ps.length; j++) {
      const a = ps[i];
      const b = ps[j];
      if (a.dead || b.dead || a.side === b.side) continue;
      if (Math.abs(a.x - b.x) < 24 && Math.abs(a.y - b.y) < 30) {
        a.dead = b.dead = true;
        emit({ type: 'clash', x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
      }
    }
  }
  for (const p of ps) {
    if (p.dead) continue;
    const box: Box = { x0: p.x - 14, x1: p.x + 14, y0: p.y - 10, y1: p.y + 10 };
    if (fight.mode === 'bonus') {
      for (const t of fight.targets) {
        if (t.hp <= 0) continue;
        if (overlap(box, { x0: t.x - t.w / 2, x1: t.x + t.w / 2, y0: t.y, y1: t.y + t.h })) {
          t.hp = Math.max(0, t.hp - p.damage);
          t.flash = 6;
          p.dead = true;
          award(fight, p.side, p.damage * 10, p.x, p.y);
          if (t.hp === 0) {
            t.broken = 0;
            award(fight, p.side, t.kind === 'car' ? 2000 : 1000, t.x, t.y + t.h);
            settleTargets(fight);
          }
          emit({ type: 'target', x: p.x, y: p.y, kind: t.kind, destroyed: t.hp === 0 });
          break;
        }
      }
    } else {
      const def = fight.fighters[p.side === 0 ? 1 : 0];
      const atk = fight.fighters[p.side];
      if (def && atk) {
        const inv = def.action?.special?.projInvuln && def.state === 'special';
        if (!inv && hurtboxes(def).some(h => overlap(box, h))) {
          p.dead = true;
          strike(fight, atk, def, {
            damage: p.damage,
            stun: 8,
            strength: p.strength,
            guard: p.guard,
            kind: 'projectile',
            knockdown: false,
            at: { x: p.x, y: p.y },
            fromX: p.x - Math.sign(p.vx) * 40
          });
        }
      }
    }
    if (Math.abs(p.x - fight.camera) > SCREEN_W / 2 + 40) p.dead = true;
  }
  fight.projectiles = ps.filter(p => !p.dead);
  for (const f of fight.fighters) if (f) f.projectileOut = fight.projectiles.some(p => p.side === f.side);
}

// --- Per-frame fighter update ---------------------------------------------------

function gravity(f: FighterState): boolean {
  f.vy -= GRAVITY;
  f.y += f.vy;
  f.x += f.vx;
  if (f.y <= 0) {
    f.y = 0;
    f.vy = 0;
    return true;
  }
  return false;
}

/** Advance a special move one frame. Returns true when it has finished. */
function stepSpecial(fight: FightState, f: FighterState, opp: FighterState | null): boolean {
  const a = f.action as Action;
  const s = a.special as SpecialDef;
  const st = a.strength;
  a.t++;
  if (a.rehit > 0) a.rehit--;
  const t = a.t;
  switch (s.kind) {
    case 'projectile': {
      const fire = s.style === 'sonic' ? 8 : 12;
      if (t === fire) {
        const speed = (s.speed ?? [3, 3.5, 4])[st];
        fight.projectiles.push({
          side: f.side,
          x: f.x + f.facing * 34,
          y: s.height ?? 60,
          vx: f.facing * speed,
          damage: s.damage[st],
          strength: st,
          style: s.style ?? 'spirit',
          guard: s.guard ?? 'mid',
          t: 0,
          dead: false
        });
        f.projectileOut = true;
      }
      return t >= (s.style === 'sonic' ? 38 : 44);
    }
    case 'rising':
    case 'flip': {
      if (t === 3) {
        f.vy = s.kind === 'rising' ? 6.2 + st * 1.1 : 7.2 + st * 0.6;
        f.vx = s.kind === 'rising' ? f.facing * (0.8 + st * 0.5) : -f.facing * 0.5;
        f.y = 1;
      }
      if (t > 3) {
        const landed = gravity(f);
        if (landed) {
          f.vx = 0;
          a.until = a.until || t;
          return t - a.until >= 14;
        }
      }
      return false;
    }
    case 'spin': {
      if (t < 6) {
        f.y = Math.min(36 + (f.def.build === 'slim' ? 14 : 0), f.y + 8);
        return false;
      }
      if (a.travel > 0) {
        const speed = (s.speed ?? [2.4, 2.8, 3.2])[st];
        f.x += f.facing * speed;
        a.travel -= speed;
        return false;
      }
      f.vy = f.vy || 0.1;
      if (gravity(f)) {
        a.until = a.until || t;
        return t - a.until >= 8;
      }
      return false;
    }
    case 'rapid': {
      // Keep mashing to keep it going, up to a limit.
      const mask = s.button === 'P' ? PUNCHES : KICKS;
      if (f.input.pressed & mask && a.until < 72) a.until = Math.max(a.until, t + 18);
      return t > a.until + 10;
    }
    case 'rush': {
      if (f.y > 0 || f.vy !== 0) {
        // The beast's bounce off a hit.
        if (gravity(f)) {
          f.vx = 0;
          return true;
        }
        return false;
      }
      if (t >= 8 && a.travel > 0) {
        const speed = (s.speed ?? [5, 6, 7])[st];
        f.x += f.facing * speed;
        a.travel -= speed;
        return false;
      }
      // A rush that runs out is a long, punishable recovery.
      if (t >= 8) {
        a.until = a.until || t;
        return t - a.until >= 22;
      }
      return false;
    }
    case 'grab': {
      if (t === 3 && opp && Math.abs(opp.x - f.x) < 52 + st * 6 && throwable(opp)) {
        beginThrow(f, opp, s.damage[st], false, true);
        return false;
      }
      return t >= 34;
    }
    case 'lariat': {
      f.x += f.input.x * 1.1;
      return t >= 56;
    }
    case 'breath':
      return t >= 50;
  }
}

function stepFighter(fight: FightState, f: FighterState, opp: FighterState | null): void {
  f.frame++;
  if (f.flash > 0) f.flash--;
  if (f.invuln > 0) f.invuln--;
  f.sinceHit++;
  if (f.sinceHit > STUN_HOLD && f.stunPoints > 0) f.stunPoints = Math.max(0, f.stunPoints - 0.25);
  // The slide of a hit or a block, decaying; a fighter pinned in the corner
  // pushes his attacker back instead (resolved in `separate`).
  if (f.slide !== 0) {
    f.x += f.slide;
    f.slide *= 0.82;
    if (Math.abs(f.slide) < 0.1) f.slide = 0;
  }
  switch (f.state) {
    case 'stand':
    case 'walk':
    case 'crouch':
    case 'guard':
      f.x += f.vx;
      if (f.state === 'crouch' && !isDown(numpad(f.input.x, f.input.y, f.facing))) setState(f, 'stand');
      break;
    case 'prejump':
      if (f.frame >= PREJUMP) {
        setState(f, 'jump');
        f.vy = JUMP_VY;
        f.vx = f.jumpDir * f.facing * f.def.jumpX;
        f.airAttacked = false;
        f.action = null;
      }
      break;
    case 'jump': {
      if (f.action) {
        // An air normal plays out on the fighter's frame while he flies.
        const n = f.action.normal as NormalDef;
        if (f.frame === n.startup) emit({ type: 'swing', side: f.side, strength: f.action.strength });
        if (f.frame >= n.startup + n.active + n.recovery) f.action = null;
      }
      if (gravity(f)) {
        setState(f, 'land');
        f.action = null;
        f.vx = 0;
        emit({ type: 'land', side: f.side });
      }
      break;
    }
    case 'land':
      if (f.frame >= LAND) setState(f, 'stand');
      break;
    case 'attack': {
      const n = f.action?.normal as NormalDef;
      if (f.frame === n.startup) emit({ type: 'swing', side: f.side, strength: (f.action as Action).strength });
      if (f.frame >= n.startup + n.active + n.recovery) {
        f.action = null;
        setState(f, isDown(numpad(f.input.x, f.input.y, f.facing)) ? 'crouch' : 'stand');
      }
      break;
    }
    case 'special':
      if (stepSpecial(fight, f, opp)) {
        f.action = null;
        f.y = 0;
        f.vy = 0;
        f.vx = 0;
        setState(f, 'stand');
      }
      break;
    case 'blockstun':
    case 'hitstun':
      if (--f.lock <= 0) {
        f.lock = 0;
        if (f.dizzyPending) {
          f.dizzyPending = false;
          setState(f, 'dizzy');
          emit({ type: 'dizzy', side: f.side });
        } else {
          setState(f, f.low ? 'crouch' : 'stand');
          f.comboTaken = 0;
        }
      }
      break;
    case 'fall':
      if (gravity(f)) {
        setState(f, 'down');
        f.vx = 0;
        emit({ type: 'knockdown', side: f.side, x: f.x });
      }
      break;
    case 'down':
      if (f.frame >= DOWN_FRAMES) {
        setState(f, 'getup');
        f.invuln = GETUP_FRAMES + 2;
      }
      break;
    case 'getup':
      if (f.frame >= GETUP_FRAMES) {
        f.comboTaken = 0;
        if (f.dizzyPending) {
          f.dizzyPending = false;
          setState(f, 'dizzy');
          emit({ type: 'dizzy', side: f.side });
        } else setState(f, 'stand');
      }
      break;
    case 'dizzy': {
      // Wiggling the stick and mashing shakes the stars off sooner.
      if (f.input.pressed) f.frame += 3;
      const d = f.buf.dirs;
      if (d.length > 1 && d[d.length - 1] !== d[d.length - 2]) f.frame += 2;
      if (f.frame >= DIZZY_FRAMES) {
        setState(f, 'stand');
        f.comboTaken = 0;
      }
      break;
    }
    case 'throw':
      stepThrow(fight, f, opp);
      break;
    case 'thrown':
      // Held by the thrower, who moves this fighter (see `stepThrow`).
      break;
    case 'ko':
      if (f.y > 0 || f.vy !== 0) {
        if (gravity(f)) emit({ type: 'knockdown', side: f.side, x: f.x });
      } else f.vx = 0;
      break;
    case 'win':
    case 'lose':
      break;
  }
}

function stepThrow(fight: FightState, f: FighterState, opp: FighterState | null): void {
  const g = f.grab;
  if (!opp || !g) {
    setState(f, 'stand');
    return;
  }
  const t = f.frame;
  // Lift him over the shoulder, then throw (or slam).
  const arc = Math.min(1, t / THROW_HOLD);
  const side = g.backward ? -1 : 1;
  opp.x = f.x + f.facing * side * (20 - 34 * arc * (g.backward ? 1 : 0)) + (g.backward ? 0 : f.facing * 14 * (1 - arc));
  opp.y = g.slam ? 30 * Math.sin(Math.PI * arc) + 6 : 26 * Math.sin(Math.PI * arc * 0.9);
  if (g.slam) f.y = 22 * Math.sin(Math.PI * arc);
  if (t === THROW_HOLD) {
    const away = g.backward ? -f.facing : f.facing;
    opp.facing = (away === 1 ? -1 : 1) as 1 | -1;
    opp.health = Math.max(0, opp.health - g.damage);
    opp.flash = 6;
    const at = { x: opp.x, y: opp.y + 40 };
    emit({ type: 'hit', side: f.side, x: at.x, y: at.y, strength: 2, blocked: false, damage: g.damage, kind: 'throw' });
    award(fight, f.side, POINTS.throw, at.x, at.y);
    fight.hitstop = Math.max(fight.hitstop, 10);
    if (opp.health <= 0) knockOut(fight, opp, f);
    else {
      launch(opp, away, g.slam ? 0.5 : 1.1);
      opp.stunPoints += 10;
      if (opp.stunPoints >= opp.def.stunMax) {
        opp.dizzyPending = true;
        opp.stunPoints = 0;
      }
    }
    f.grab = null;
    f.y = 0;
  }
  if (t >= THROW_HOLD + 12 && !f.grab) setState(f, 'stand');
}

/** Turn a grounded, idle fighter to face the opponent (or the nearest target). */
function faceOpponent(fight: FightState, f: FighterState, opp: FighterState | null): void {
  if (!(neutral(f) || f.state === 'land' || f.state === 'getup' || f.state === 'prejump')) return;
  let tx: number | null = opp ? opp.x : null;
  if (fight.mode === 'bonus') {
    const live = fight.targets.filter(t => t.hp > 0);
    if (live.length) tx = live.reduce((a, b) => (Math.abs(a.x - f.x) < Math.abs(b.x - f.x) ? a : b)).x;
  }
  if (tx === null || Math.abs(tx - f.x) < 2) return;
  f.facing = tx > f.x ? 1 : -1;
}

/** Keep the two bodies apart, and both on the screen and the stage. */
function separate(fight: FightState): void {
  const [a, b] = fight.fighters;
  if (b) {
    const overlapsY = a.y < b.y + b.def.height * 0.7 && b.y < a.y + a.def.height * 0.7;
    const passable = a.state === 'thrown' || b.state === 'thrown' || a.state === 'throw' || b.state === 'throw';
    const min = halfWidth(a) + halfWidth(b);
    const dx = b.x - a.x;
    if (overlapsY && !passable && Math.abs(dx) < min) {
      const push = (min - Math.abs(dx)) / 2;
      const s = dx === 0 ? (a.facing === 1 ? 1 : -1) : Math.sign(dx);
      // An airborne fighter landing on the other is pushed off; on the
      // ground both give way.
      if (a.y > 0 && b.y === 0) a.x -= s * push * 2;
      else if (b.y > 0 && a.y === 0) b.x += s * push * 2;
      else {
        a.x -= s * push;
        b.x += s * push;
      }
    }
  }
  // Solid bonus objects.
  if (fight.mode === 'bonus') {
    for (const t of fight.targets) {
      if (t.hp <= 0 || a.y >= t.y + t.h) continue;
      const min = t.w / 2 + halfWidth(a);
      if (Math.abs(a.x - t.x) < min) a.x = t.x + (a.x < t.x ? -min : min);
    }
  }
  // The camera follows the pair, and the screen edges hold them both in.
  const mid = b ? (a.x + b.x) / 2 : a.x + a.facing * 60;
  const target = Math.max(SCREEN_W / 2, Math.min(STAGE_W - SCREEN_W / 2, mid));
  fight.camera = b ? target : fight.camera + (target - fight.camera) * 0.12;
  const lo = Math.max(EDGE, fight.camera - SCREEN_W / 2 + EDGE);
  const hi = Math.min(STAGE_W - EDGE, fight.camera + SCREEN_W / 2 - EDGE);
  for (const f of fight.fighters) {
    if (!f) continue;
    if (f.x < lo || f.x > hi) {
      const pinned = f.x < lo ? lo : hi;
      // A fighter slid into the corner by a hit passes the push to his attacker.
      if (f.slide !== 0 && b) {
        const other = f === a ? b : a;
        other.x -= f.x - pinned;
      }
      f.x = pinned;
    }
  }
  if (b) {
    a.x = Math.max(lo, Math.min(hi, a.x));
    b.x = Math.max(lo, Math.min(hi, b.x));
  }
}

// --- Rounds ---------------------------------------------------------------------

/** Put both fighters back on their marks for the next round. */
function resetRound(fight: FightState): void {
  const mid = STAGE_W / 2;
  fight.fighters.forEach((f, i) => {
    if (!f) return;
    const fresh = createFighter(f.id, f.side, fight.mode === 'bonus' ? mid - 90 : mid + (i === 0 ? -START_GAP : START_GAP));
    fresh.wins = f.wins;
    fight.fighters[i] = fresh;
  });
  fight.projectiles = [];
  fight.timer = ROUND_TIME;
  fight.timerFrames = 0;
  fight.camera = mid;
  fight.roundWinner = null;
  fight.perfect = false;
  fight.doubleKo = false;
  fight.hitstop = 0;
  fight.slow = 0;
}

/** The fourth round, which only draws reach, is announced as the final one. */
export function isFinalRound(fight: FightState): boolean {
  return fight.round >= MAX_ROUNDS;
}

/** Frames the "ROUND n" and "FIGHT!" calls hold. */
export const INTRO_FRAMES = 40;
export const CALL_FRAMES = 110;
const FIGHT_CALL_AT = 70;
/** Frames between the KO and the winner's pose, and the result screen after. */
const KO_SETTLE = 120;
const ROUND_END_FRAMES = 170;

function decideRound(fight: FightState, winner: 0 | 1 | null, double: boolean): void {
  fight.roundWinner = winner;
  fight.doubleKo = double;
  const [a, b] = fight.fighters;
  if (winner !== null) {
    const w = fight.fighters[winner] as FighterState;
    w.wins++;
    fight.perfect = w.health === w.def.health;
    setState(w, 'win');
    w.action = null;
    const l = fight.fighters[winner === 0 ? 1 : 0];
    if (l && l.state !== 'ko') setState(l, 'lose');
    // The round's bonus, counted up on the result screen.
    const time = fight.timer * POINTS.time;
    const vitality = w.health * POINTS.vitality;
    const perfect = fight.perfect ? POINTS.perfect : 0;
    fight.points[winner] += time + vitality + perfect;
    emit({ type: 'roundBonus', side: winner, time, vitality, perfect });
  } else if (b) {
    if (a.state !== 'ko') setState(a, 'lose');
    if (b.state !== 'ko') setState(b, 'lose');
  }
  fight.phase = 'roundEnd';
  fight.phaseFrame = 0;
  emit({ type: 'roundEnd', winner, perfect: fight.perfect, double });
}

function stepPhase(fight: FightState): void {
  fight.phaseFrame++;
  const [a, b] = fight.fighters;
  switch (fight.phase) {
    case 'intro':
      if (fight.phaseFrame >= INTRO_FRAMES) {
        fight.phase = 'call';
        fight.phaseFrame = 0;
        if (fight.mode === 'match') emit({ type: 'roundCall', round: fight.round, final: isFinalRound(fight) });
      }
      break;
    case 'call':
      if (fight.phaseFrame === FIGHT_CALL_AT) emit({ type: 'fight' });
      if (fight.phaseFrame >= CALL_FRAMES) {
        fight.phase = 'fight';
        fight.phaseFrame = 0;
      }
      break;
    case 'fight':
      if (++fight.timerFrames >= TIMER_TICK) {
        fight.timerFrames = 0;
        fight.timer = Math.max(0, fight.timer - 1);
        if (fight.timer === 0) {
          if (fight.mode === 'bonus') {
            endBonus(fight, false);
            break;
          }
          fight.phase = 'timeover';
          fight.phaseFrame = 0;
          emit({ type: 'timeOver' });
        }
      }
      if (fight.mode === 'bonus' && fight.targets.every(t => t.hp <= 0)) endBonus(fight, true);
      break;
    case 'ko': {
      // Wait for every fighter to have landed, then the winner poses.
      const settled = fight.fighters.every(f => !f || (f.y === 0 && f.state !== 'fall' && f.state !== 'special' && f.state !== 'jump' && f.state !== 'throw' && f.state !== 'thrown'));
      if (fight.phaseFrame >= KO_SETTLE && settled && b) {
        const aOut = a.state === 'ko';
        const bOut = b.state === 'ko';
        decideRound(fight, aOut && bOut ? null : aOut ? 1 : 0, aOut && bOut);
      }
      break;
    }
    case 'timeover':
      if (fight.phaseFrame >= 60 && b) {
        const settled = [a, b].every(f => f.y === 0 && (neutral(f) || f.state === 'down' || f.state === 'dizzy' || f.state === 'hitstun' || f.state === 'blockstun' || f.state === 'land' || f.state === 'attack'));
        if (settled || fight.phaseFrame > 240) {
          const winner = a.health === b.health ? null : a.health > b.health ? 0 : 1;
          decideRound(fight, winner, false);
        }
      }
      break;
    case 'roundEnd':
      if (fight.mode === 'bonus') break;
      if (fight.phaseFrame >= ROUND_END_FRAMES && b) {
        const finished = a.wins >= ROUNDS_TO_WIN || b.wins >= ROUNDS_TO_WIN || fight.round >= MAX_ROUNDS;
        if (finished) {
          fight.winner = a.wins === b.wins ? null : a.wins > b.wins ? 0 : 1;
          fight.phase = 'matchEnd';
          fight.phaseFrame = 0;
          emit({ type: 'matchEnd', winner: fight.winner });
        } else {
          fight.round++;
          resetRound(fight);
          fight.phase = 'intro';
          fight.phaseFrame = 0;
        }
      }
      break;
    case 'matchEnd':
      break;
  }
}

function endBonus(fight: FightState, cleared: boolean): void {
  const bonus = cleared ? BONUS_CLEAR + fight.timer * POINTS.time * 2 : 0;
  if (bonus) fight.points[0] += bonus;
  const f = fight.fighters[0];
  setState(f, cleared ? 'win' : 'lose');
  f.action = null;
  fight.phase = 'roundEnd';
  fight.phaseFrame = 0;
  fight.roundWinner = cleared ? 0 : null;
  fight.perfect = cleared;
  emit({ type: 'bonusEnd', cleared, bonus });
}

/** Whether either fighter is low enough for the music to quicken. */
export function inDanger(fight: FightState): boolean {
  if (fight.mode === 'bonus') return fight.timer <= 10;
  return fight.fighters.some(f => !!f && f.health <= f.def.health * 0.25);
}

/**
 * Advance the match one frame. Inputs are read only while the fight is live;
 * the calls, the KO and the result screens play out on their own.
 */
export function tickFight(fight: FightState, inputs: readonly [FrameInput, FrameInput]): FightEvent[] {
  const events: FightEvent[] = [];
  fightEventsSink = events;
  try {
    const live = fight.phase === 'fight' || fight.phase === 'ko' || fight.phase === 'timeover';
    const controllable = fight.phase === 'fight';
    const dangerBefore = inDanger(fight);
    for (let i = 0; i < 2; i++) {
      const f = fight.fighters[i];
      if (!f) continue;
      f.input = controllable ? inputs[i] : { x: 0, y: 0, held: 0, pressed: 0 };
      pushFrame(f.buf, numpad(f.input.x, f.input.y, f.facing), f.input.pressed);
    }
    // Slow motion after a KO: one game frame in every few.
    if (fight.slow > 0) {
      fight.slow--;
      if (++fight.slowStep % KO_SLOW_RATE !== 0) return events;
    }
    fight.clock++;
    if (fight.hitstop > 0) {
      fight.hitstop--;
      // A special finished during the freeze cancels the normal that hit.
      if (controllable) for (const f of fight.fighters) if (f) cancelIntoSpecial(fight, f);
      return events;
    }
    if (live) {
      for (let i = 0; i < 2; i++) {
        const f = fight.fighters[i];
        if (!f) continue;
        const opp = fight.fighters[i === 0 ? 1 : 0];
        faceOpponent(fight, f, opp);
        if (controllable) {
          cancelIntoSpecial(fight, f);
          control(fight, f, opp);
        } else if (neutral(f)) {
          f.vx = 0;
          if (f.state !== 'stand') setState(f, 'stand');
        }
      }
      for (let i = 0; i < 2; i++) {
        const f = fight.fighters[i];
        if (f) stepFighter(fight, f, fight.fighters[i === 0 ? 1 : 0]);
      }
      separate(fight);
      if (controllable) {
        resolveHits(fight);
        stepProjectiles(fight);
      } else stepProjectiles(fight);
      for (const t of fight.targets) {
        if (t.flash > 0) t.flash--;
        if (t.broken >= 0) t.broken++;
      }
    } else {
      // Between rounds the bodies still settle and the winner still poses.
      for (const f of fight.fighters) if (f) f.frame++;
    }
    stepPhase(fight);
    const dangerAfter = inDanger(fight);
    if (dangerAfter !== dangerBefore && (fight.phase === 'fight' || !dangerAfter)) emit({ type: 'danger', on: dangerAfter });
    return events;
  } finally {
    fightEventsSink = null;
  }
}

/** A connected normal may be cancelled into a special, the genre's combo. */
function cancelIntoSpecial(fight: FightState, f: FighterState): void {
  const a = f.action;
  if (!a || a.type !== 'normal' || !a.connected || f.state !== 'attack') return;
  const n = a.normal as NormalDef;
  // The cancel window runs to a few frames past the active ones.
  if (f.frame > n.startup + n.active + 4) return;
  // Sweeps and the standing heavy kick do not cancel.
  if (a.button === 'K' && a.strength === 2) return;
  trySpecial(fight, f);
}

/** Whether a charge special is ready for this fighter (the CPU and HUD read it). */
export function charged(f: FighterState, motion: 'chargeBF' | 'chargeDU'): boolean {
  return (motion === 'chargeBF' ? f.buf.backCharge : f.buf.downCharge) >= CHARGE_FRAMES;
}
