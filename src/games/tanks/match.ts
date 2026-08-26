/**
 * The Tank Duel match state machine: rounds, turns, whose shot it is, when a
 * round ends, when the match ends, and how the ledger is fed.
 *
 * This was the last live cabinet with no path to a headless match — the whole
 * flow lived inside the DOM-bound `game.ts`, so a test could only hand the
 * ledger a scripted award sequence and never play the game. Everything here is
 * DOM-free: `game.ts` owns rendering, input binding, audio and the scoreboard,
 * and drives this module the way `src/games/cascade/run.ts` is driven.
 *
 * Presentation reaches `game.ts` through a **synchronous** `onEvent` handler
 * rather than a returned event array, and that is load-bearing rather than
 * stylistic. An impact spawns a dirt burst whose particle maths draws from the
 * same `Math.random` the terrain roll and the wind draw from, so a deferred
 * handler would move those draws behind the ones a later step of the same tick
 * makes and the seeded output would change. The handler is called at the exact
 * point the old inline code ran, so the draw order is identical by
 * construction. Handlers therefore must not mutate the match.
 *
 * Two fields here are read by the renderer rather than by the rules: a shot's
 * `trail` and a blast's `t`. The blast list is genuinely part of the flow (a
 * turn cannot end while one is still playing), and the trail rides along with
 * the shot it belongs to; neither draws randomness, so both stay put.
 */
import { generateTerrain, surfaceYAt, carveCrater, arenaSolid, isSolidColumn, type ArenaType } from './terrain';
import {
  launchProjectile,
  stepProjectile,
  bounceOffSurface,
  stepFall,
  explosionDamage,
  type Projectile
} from './physics';
import { createScoreLedger, type ScoreLedger, type TankMode } from './scoring';
import { chooseAiShot, cpuDifficulty, cpuPickWeapon, type Difficulty } from './ai';
import { WEAPONS, freshAmmo, splitCluster, type Ammo, type WeaponId } from './weapons';

export const WIDTH = 800;
export const HEIGHT = 450;
export const TANK_W = 34;
export const TANK_H = 14;
export const BARREL_LEN = 24;
export const EXPLOSION_TIME = 0.55;
const DIRECT_HIT_RADIUS = 14;
const MAX_WIND = 50;
/** Speed a Skipper shell keeps after each ground bounce (0..1). */
const BOUNCE_RESTITUTION = 0.62;
export const WINS_PER_MATCH = 3;
const CPU_THINK_TIME = 1.1;
const SAFE_DROP = 30; // px a tank can fall without damage

export interface Tank {
  x: number;
  y: number;
  hp: number;
  angle: number;
  power: number;
  weapon: WeaponId;
  ammo: Ammo;
  /** y where the current fall started, or null when grounded. */
  fallFrom: number | null;
  fallVy: number;
}

export interface Shot {
  p: Projectile;
  weapon: WeaponId;
  /** Ground bounces left before this shell detonates (Skipper only). */
  bounces: number;
  canSplit: boolean;
  flightTime: number;
  /** Recent positions, drawn as the shell's tail. */
  trail: { x: number; y: number }[];
}

/** A detonation, alive for EXPLOSION_TIME. A turn cannot end while one runs. */
export interface Blast {
  x: number;
  y: number;
  t: number;
  radius: number;
}

export type Phase = 'idle' | 'aim' | 'cpu-think' | 'fly' | 'round-over';

/** A points award to one player, in the order the ledger paid it. */
export interface Award {
  player: number;
  points: number;
}

export type MatchEvent =
  /** A fresh round: terrain, tanks and shells are all new. */
  | { type: 'roundStart' }
  /** A turn is now the current tank's; the controls should follow it. */
  | { type: 'turn' }
  /** A shell left the barrel at (x, y). */
  | { type: 'fire'; x: number; y: number }
  /** A Skipper shell skipped off the dirt. */
  | { type: 'bounce' }
  /** A shell detonated; the crater is already cut. */
  | { type: 'impact'; x: number; y: number; radius: number }
  /** Armour came off a tank. `points` is what the shooter was paid for it. */
  | { type: 'damage'; target: number; amount: number; shooter: number | null; points: number }
  /** A shell landed on a hull, before the blast damage that follows it. */
  | { type: 'directHit'; shooter: number; points: number }
  /** The round is decided; `awards` are in the order the ledger paid them. */
  | { type: 'roundOver'; winner: number | null; matchOver: boolean; awards: Award[] };

export interface MatchState {
  mode: TankMode;
  difficulty: Difficulty;
  arena: ArenaType;
  /** Destructible heightmap, and the columns a crater must leave alone. */
  ground: number[];
  solid: boolean[];
  tanks: Tank[];
  current: number;
  wind: number;
  wins: number[];
  /** Rounds decided so far this match, feeding the CPU's accuracy ramp. */
  roundsDecided: number;
  phase: Phase;
  shots: Shot[];
  blasts: Blast[];
  cpuTimer: number;
  cpuShotPending: boolean;
  /** Damage landed, direct hits, rounds taken and (once) surviving armour. */
  ledger: ScoreLedger;
  random: () => number;
  on: (event: MatchEvent) => void;
}

export interface MatchOptions {
  mode?: TankMode;
  difficulty?: Difficulty;
  arena?: ArenaType;
  random?: () => number;
  onEvent?: (event: MatchEvent) => void;
}

export function createMatch(options: MatchOptions = {}): MatchState {
  return {
    mode: options.mode ?? 'cpu',
    difficulty: options.difficulty ?? 'gunner',
    arena: options.arena ?? 'hills',
    ground: [],
    solid: [],
    tanks: [],
    current: 0,
    wind: 0,
    wins: [0, 0],
    roundsDecided: 0,
    phase: 'idle',
    shots: [],
    blasts: [],
    cpuTimer: 0,
    cpuShotPending: false,
    ledger: createScoreLedger(),
    random: options.random ?? Math.random,
    on: options.onEvent ?? (() => {})
  };
}

/** Roll a fresh heightmap and its uncarveable mask for the current arena. */
export function rollTerrain(m: MatchState): void {
  m.ground = generateTerrain(WIDTH, HEIGHT, m.random, m.arena);
  m.solid = arenaSolid(m.arena, WIDTH);
}

export const isHumanTurn = (m: MatchState): boolean =>
  m.phase === 'aim' && !(m.mode === 'cpu' && m.current === 1);

const tanksSettled = (m: MatchState): boolean => m.tanks.every(t => t.fallFrom === null);

function newWind(m: MatchState): void {
  m.wind = Math.round((m.random() * 2 - 1) * MAX_WIND);
}

function makeTank(m: MatchState, x: number, angle: number): Tank {
  return {
    x,
    y: surfaceYAt(m.ground, x),
    hp: 100,
    angle,
    power: 55,
    weapon: 'missile',
    ammo: freshAmmo(),
    fallFrom: null,
    fallVy: 0
  };
}

/**
 * Clears the match ledger and the round tally for a new match. Does not start
 * the first round: the cabinet lays out its header for the chosen mode in
 * between, and a test that plays matches back to back wants the same seam.
 */
export function resetMatch(m: MatchState, mode: TankMode): void {
  m.mode = mode;
  m.wins = [0, 0];
  m.roundsDecided = 0;
  m.ledger.reset();
}

export function startRound(m: MatchState): void {
  rollTerrain(m);
  const p1x = 70 + m.random() * 90;
  const p2x = WIDTH - 70 - m.random() * 90;
  m.tanks = [makeTank(m, p1x, 60), makeTank(m, p2x, 120)];
  m.shots = [];
  m.blasts = [];
  m.on({ type: 'roundStart' });
  m.current = m.random() < 0.5 ? 0 : 1;
  newWind(m);
  startTurn(m);
}

function startTurn(m: MatchState): void {
  const tank = m.tanks[m.current];
  if (tank.ammo[tank.weapon] <= 0) tank.weapon = 'missile';
  if (m.mode === 'cpu' && m.current === 1) {
    m.phase = 'cpu-think';
    m.cpuTimer = CPU_THINK_TIME;
    m.cpuShotPending = true;
  } else {
    m.phase = 'aim';
  }
  m.on({ type: 'turn' });
}

export function barrelTip(tank: Tank): { x: number; y: number } {
  const rad = (tank.angle * Math.PI) / 180;
  return {
    x: tank.x + Math.cos(rad) * BARREL_LEN,
    y: tank.y - TANK_H - Math.sin(rad) * BARREL_LEN
  };
}

/** Fires the current tank's selected weapon. A dry rack fires nothing. */
export function fire(m: MatchState): void {
  const tank = m.tanks[m.current];
  const weapon = WEAPONS[tank.weapon];
  if (tank.ammo[tank.weapon] <= 0) return;
  if (tank.ammo[tank.weapon] !== Infinity) tank.ammo[tank.weapon]--;
  const tip = barrelTip(tank);
  m.shots = [
    {
      p: launchProjectile(tip.x, tip.y, tank.angle, tank.power),
      weapon: tank.weapon,
      bounces: weapon.bounces ?? 0,
      canSplit: weapon.cluster > 1,
      flightTime: 0,
      trail: []
    }
  ];
  m.phase = 'fly';
  m.on({ type: 'fire', x: tip.x, y: tip.y });
}

/**
 * Damage landing on `index`, credited to `shooter` (null for fall damage,
 * which nobody is paid for). The award follows the armour actually removed,
 * so overkill on a nearly-dead tank is not worth more than the tank was.
 */
function applyDamage(
  m: MatchState,
  index: number,
  amount: number,
  shooter: number | null
): void {
  const tank = m.tanks[index];
  if (amount <= 0 || tank.hp <= 0) return;
  const removed = Math.min(tank.hp, amount);
  tank.hp = Math.max(0, tank.hp - amount);
  m.on({
    type: 'damage',
    target: index,
    amount,
    shooter,
    points: m.ledger.damage(shooter, index, removed)
  });
}

function impactAt(m: MatchState, x: number, y: number, weaponId: WeaponId, shooter: number): void {
  const weapon = WEAPONS[weaponId];
  m.blasts.push({ x, y, t: 0, radius: weapon.radius });
  carveCrater(m.ground, HEIGHT, x, y, weapon.radius, m.solid);
  m.on({ type: 'impact', x, y, radius: weapon.radius });
  m.tanks.forEach((tank, index) => {
    applyDamage(
      m,
      index,
      explosionDamage(x, y, tank.x, tank.y - TANK_H / 2, weapon.radius, weapon.maxDamage),
      shooter
    );
  });
}

function endTurn(m: MatchState): void {
  const dead = m.tanks.map(t => t.hp <= 0);
  if (dead[0] || dead[1]) {
    finishRound(m, dead[0] && dead[1] ? null : dead[0] ? 1 : 0);
    return;
  }
  m.current = m.current === 0 ? 1 : 0;
  newWind(m);
  startTurn(m);
}

function finishRound(m: MatchState, winner: number | null): void {
  m.phase = 'round-over';
  // A decided round (win or mutual destruction) tightens the CPU next round.
  m.roundsDecided++;
  m.on({ type: 'turn' });
  const awards: Award[] = [];
  if (winner !== null) {
    m.wins[winner]++;
    awards.push({ player: winner, points: m.ledger.roundWin(winner) });
  }
  const matchOver = winner !== null && m.wins[winner] >= WINS_PER_MATCH;
  if (matchOver) {
    // Surviving armour is folded in exactly once, when the match is over.
    m.tanks.forEach((tank, index) => {
      awards.push({ player: index, points: m.ledger.survivingArmour(index, tank.hp) });
    });
  }
  m.on({ type: 'roundOver', winner, matchOver, awards });
}

/** Tanks above the (possibly freshly cratered) surface fall and take damage.
 *  A drop is nobody's shot, so it pays nobody. */
function updateFalls(m: MatchState, dt: number): void {
  m.tanks.forEach((tank, index) => {
    const drop = stepFall(tank, surfaceYAt(m.ground, tank.x), dt);
    if (drop !== null && drop > SAFE_DROP) {
      applyDamage(m, index, Math.min(30, Math.round((drop - SAFE_DROP) * 0.5)), null);
    }
  });
}

function stepShot(m: MatchState, shot: Shot, dt: number, spawned: Shot[]): boolean {
  stepProjectile(shot.p, m.wind, dt);
  shot.flightTime += dt;
  const p = shot.p;
  shot.trail.push({ x: p.x, y: p.y });
  if (shot.trail.length > 40) shot.trail.shift();

  // MIRV splits at apex into a fan of warheads
  if (shot.canSplit && p.vy >= 0) {
    const parts = splitCluster(p, WEAPONS[shot.weapon].cluster);
    spawned.push(
      ...parts.map(part => ({
        p: part,
        weapon: shot.weapon,
        bounces: 0,
        canSplit: false,
        flightTime: shot.flightTime,
        trail: [] as { x: number; y: number }[]
      }))
    );
    return false;
  }

  if (p.x < -100 || p.x > WIDTH + 100 || p.y > HEIGHT) return false;

  // Direct hit on a tank detonates mid-air (own tank only after clearing the barrel)
  const hitIndex = m.tanks.findIndex(
    (tank, idx) =>
      (idx !== m.current || shot.flightTime > 0.25) &&
      Math.hypot(p.x - tank.x, p.y - (tank.y - TANK_H / 2)) < DIRECT_HIT_RADIUS
  );
  if (hitIndex >= 0) {
    // Putting a shell on the hull itself is the skill this game is about, so
    // it pays a bonus on top of the blast damage that follows — but only on a
    // live tank. A wreck keeps stopping shells (the hull is still there) and
    // a MIRV's five warheads fly on until the last one lands, so without the
    // hp the ledger checks, a finishing kill would be paid for four more
    // times over the same corpse.
    m.on({
      type: 'directHit',
      shooter: m.current,
      points: m.ledger.directHit(m.current, hitIndex, m.tanks[hitIndex].hp)
    });
    impactAt(m, p.x, p.y, shot.weapon, m.current);
    return false;
  }
  if (p.x >= 0 && p.x < WIDTH && p.y >= surfaceYAt(m.ground, p.x)) {
    if (shot.bounces > 0 && !isSolidColumn(m.solid, p.x, WIDTH)) {
      // Skip off the dirt: reflect upward, bleed speed, keep flying. A solid
      // column (the bunker pillar) is not skippable, so the shot detonates
      // against it instead — that is what makes the cover matter.
      shot.bounces--;
      bounceOffSurface(p, surfaceYAt(m.ground, p.x), BOUNCE_RESTITUTION);
      m.on({ type: 'bounce' });
      return true;
    }
    impactAt(m, p.x, p.y, shot.weapon, m.current);
    return false;
  }
  return true;
}

/** Advances the match by `dt` seconds: blasts, the CPU's turn, shells, falls. */
export function tickMatch(m: MatchState, dt: number): void {
  m.blasts = m.blasts.filter(b => (b.t += dt) < EXPLOSION_TIME);

  if (m.phase === 'cpu-think' && m.cpuShotPending) {
    m.cpuTimer -= dt;
    if (m.cpuTimer <= 0) {
      m.cpuShotPending = false;
      const cpu = m.tanks[1];
      const foe = m.tanks[0];
      const shot = chooseAiShot(
        m.ground,
        WIDTH,
        HEIGHT,
        { x: cpu.x, y: cpu.y - TANK_H },
        { x: foe.x, y: foe.y },
        m.wind,
        cpuDifficulty(m.difficulty, m.roundsDecided),
        m.random
      );
      cpu.angle = shot.angle;
      cpu.power = shot.power;
      cpu.weapon = cpuPickWeapon(cpu.ammo, Math.abs(foe.x - cpu.x), foe.hp, m.random);
      fire(m);
    }
  }

  if (m.phase === 'fly') {
    const steps = 2;
    for (let i = 0; i < steps; i++) {
      const spawned: Shot[] = [];
      m.shots = m.shots.filter(shot => stepShot(m, shot, dt / steps, spawned));
      m.shots.push(...spawned);
    }
    updateFalls(m, dt);
    if (!m.shots.length && !m.blasts.length && tanksSettled(m)) {
      endTurn(m);
    }
  } else if (m.tanks.length) {
    updateFalls(m, dt);
  }
}
