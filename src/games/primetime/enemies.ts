/**
 * The show's contestants-in-waiting: every ordinary enemy kind, its figures
 * and its one behaviour. Each steps itself with `stepEnemy`, reading the
 * contestant's position and writing nothing but its own fields and, for the
 * ones that shoot, new hostile shots into `out`. Bosses live in `bosses.ts`
 * with the same contract.
 *
 * Touching any of them kills (Smash TV's rule, kept); the simulation in
 * `run.ts` decides that, not the enemy, so the kinds stay pure movers.
 */
import { dist, toward, type Pt } from './arena';

export type EnemyKind = 'grunt' | 'orb' | 'mine' | 'shrapnel' | 'tank' | 'snake';
export type BossKind = 'mutoid' | 'scarface' | 'cobra';

export interface EnemyDef {
  hp: number;
  speed: number;
  r: number;
  /** Cash a kill pays. */
  worth: number;
}

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  grunt: { hp: 1, speed: 112, r: 10, worth: 100 },
  orb: { hp: 3, speed: 78, r: 11, worth: 250 },
  mine: { hp: 2, speed: 0, r: 10, worth: 150 },
  shrapnel: { hp: 4, speed: 52, r: 12, worth: 500 },
  tank: { hp: 10, speed: 38, r: 16, worth: 1000 },
  snake: { hp: 6, speed: 150, r: 10, worth: 750 }
};

/** A hostile shot (the only thing an enemy fires); the contestant dies on contact. */
export interface Flak {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  /** Seconds left before it is swept up, a backstop for a shot that never meets a wall. */
  life: number;
}

export interface Enemy {
  id: number;
  kind: EnemyKind | BossKind;
  boss: boolean;
  x: number;
  y: number;
  r: number;
  hp: number;
  maxHp: number;
  speed: number;
  worth: number;
  /** Seconds alive. */
  t: number;
  /** A per-enemy phase so a crowd of one kind does not move in lockstep. */
  jitter: number;
  /** General-purpose cooldown (the next shot, the next charge). */
  timer: number;
  /** Behaviour phase: a boss's stage, Scarface's hover/windup/charge, an orb's drift. */
  phase: number;
  /** Current heading, for the kinds that steer rather than beeline. */
  vx: number;
  vy: number;
  /** Trailing body for a snake or the cobra, head first. */
  tail?: Pt[];
  /** Whether this enemy's orbs shoot (a room flag, so a first-studio orb is harmless). */
  armed: boolean;
  /**
   * Set once the enemy has walked onto the floor from its door. From then on
   * it is kept inside the walls: an orb that overshoots the contestant would
   * otherwise sail out through the wall and circle the studio where no shot
   * can reach it, which stalled a room for good.
   */
  entered: boolean;
}

/** The slowest and fastest a grunt may run, as a multiple of the kind's speed. */
export const GRUNT_SPEED_SPREAD: [number, number] = [0.82, 1.18];
/** Segments a snake trails behind its head, and the spacing between them. */
export const SNAKE_SEGMENTS = 7;
export const SEGMENT_GAP = 13;
/** Shots a shrapnel man bursts into when he dies, and how fast they fly. */
export const SHRAPNEL_SHARDS = 8;
export const SHRAPNEL_SPEED = 190;
/** A mine's blast radius against the crowd. */
export const MINE_BLAST = 64;
/**
 * How close an unshielded contestant must be for a mine's blast to kill them:
 * standing on it, in effect. The crowd radius above used to apply to the
 * contestant too, and a round that missed a wobbling grunt and flew on into
 * a mine 60 px away was a fifth of all deaths in mine rooms (the playtest
 * round's census), for a hazard worth 150 that does not even gate the clear.
 */
export const MINE_PLAYER_BLAST = 30;
/** Seconds between a tank's shells, and between an armed orb's shots. */
export const TANK_RELOAD = 2.3;
export const ORB_RELOAD = 2.6;
export const TANK_SHELL_SPEED = 170;
export const ORB_SHOT_SPEED = 150;
/** An armed orb holds its fire inside this distance, and glows for this long before a shot. */
export const ORB_MIN_RANGE = 120;
export const ORB_CHARGE = 0.3;
/** How far an orb can turn a second, in radians: it rounds on the contestant rather than tracking. */
const ORB_TURN = 2.2;
/** How fast a snake's head weaves across its heading, and how wide. */
const SNAKE_WEAVE_RATE = 5;
const SNAKE_WEAVE = 0.55;

/**
 * A fresh enemy of `kind` at a point, its jitter drawn from `rng`. The id is
 * the caller's (the run keeps its own counter), so two runs on one seed are
 * identical object for object.
 */
export function spawnEnemy(id: number, kind: EnemyKind, x: number, y: number, rng: () => number, armed = false): Enemy {
  const def = ENEMIES[kind];
  const spread = kind === 'grunt' ? GRUNT_SPEED_SPREAD[0] + rng() * (GRUNT_SPEED_SPREAD[1] - GRUNT_SPEED_SPREAD[0]) : 1;
  const e: Enemy = {
    id,
    kind,
    boss: false,
    x,
    y,
    r: def.r,
    hp: def.hp,
    maxHp: def.hp,
    speed: def.speed * spread,
    worth: def.worth,
    t: 0,
    jitter: rng() * Math.PI * 2,
    timer: kind === 'tank' ? TANK_RELOAD * 0.6 : ORB_RELOAD * (0.5 + rng() * 0.5),
    phase: 0,
    vx: 0,
    vy: 0,
    armed,
    entered: false
  };
  if (kind === 'snake') e.tail = Array.from({ length: SNAKE_SEGMENTS }, () => ({ x, y }));
  return e;
}

/** Drags a trailing body after a head, each segment staying `gap` behind the one before. */
export function followTail(head: Pt, tail: Pt[], gap: number): void {
  let lead: Pt = head;
  for (const seg of tail) {
    const d = dist(lead, seg);
    if (d > gap) {
      const k = (d - gap) / d;
      seg.x += (lead.x - seg.x) * k;
      seg.y += (lead.y - seg.y) * k;
    }
    lead = seg;
  }
}

/** A hostile shot from `from` toward `at`, at `speed`. */
export function fireAt(from: Pt, at: Pt, speed: number, r = 4): Flak {
  const d = toward(from, at);
  return { x: from.x, y: from.y, vx: d.x * speed, vy: d.y * speed, r, life: 6 };
}

/**
 * One tick of an ordinary enemy. Shooters push their shots into `out`. The
 * contestant's position is read, never written; whether the enemy has caught
 * the contestant is the simulation's question.
 */
export function stepEnemy(e: Enemy, player: Pt, dt: number, out: Flak[]): void {
  e.t += dt;
  switch (e.kind) {
    case 'grunt': {
      // A beeline with a sideways wobble, so a stream from one door fans out
      // into a crowd rather than arriving as a queue.
      const d = toward(e, player);
      const wob = Math.sin(e.t * 4 + e.jitter) * 0.35;
      e.vx = (d.x - d.y * wob) * e.speed;
      e.vy = (d.y + d.x * wob) * e.speed;
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      break;
    }
    case 'orb': {
      // Steers toward the contestant at a limited turn rate: it rounds on
      // you, so running across its path is what beats it.
      const want = Math.atan2(player.y - e.y, player.x - e.x);
      const have = e.t === dt ? want : Math.atan2(e.vy, e.vx);
      let delta = want - have;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      const turn = Math.max(-ORB_TURN * dt, Math.min(ORB_TURN * dt, delta));
      const a = have + turn;
      e.vx = Math.cos(a) * e.speed;
      e.vy = Math.sin(a) * e.speed;
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      if (e.armed) {
        // Never point-blank: a shot from inside `ORB_MIN_RANGE` arrives in a
        // quarter of a second, which no eight-way step can answer. The clock
        // waits at its charge instead, so the renderer's charge flash (the
        // last `ORB_CHARGE` seconds of `timer`) is also the telegraph.
        if (e.timer > ORB_CHARGE || dist(e, player) > ORB_MIN_RANGE) e.timer -= dt;
        if (e.timer <= 0) {
          e.timer = ORB_RELOAD;
          out.push(fireAt(e, player, ORB_SHOT_SPEED));
        }
      }
      break;
    }
    case 'mine':
      break;
    case 'shrapnel': {
      const d = toward(e, player);
      e.vx = d.x * e.speed;
      e.vy = d.y * e.speed;
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      break;
    }
    case 'tank': {
      // Keeps rolling at the contestant, slowly, and shells them on a clock.
      const d = toward(e, player);
      e.vx = d.x * e.speed;
      e.vy = d.y * e.speed;
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      e.timer -= dt;
      if (e.timer <= 0) {
        e.timer = TANK_RELOAD;
        out.push(fireAt(e, player, TANK_SHELL_SPEED, 5));
      }
      break;
    }
    case 'snake': {
      const d = toward(e, player);
      const weave = Math.sin(e.t * SNAKE_WEAVE_RATE + e.jitter) * SNAKE_WEAVE;
      e.vx = (d.x - d.y * weave) * e.speed;
      e.vy = (d.y + d.x * weave) * e.speed;
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      if (e.tail) followTail(e, e.tail, SEGMENT_GAP);
      break;
    }
  }
}

/** The shots a dying shrapnel man throws out, one per compass point. */
export function shrapnelBurst(at: Pt): Flak[] {
  return Array.from({ length: SHRAPNEL_SHARDS }, (_, i) => {
    const a = (i * Math.PI * 2) / SHRAPNEL_SHARDS;
    return { x: at.x, y: at.y, vx: Math.cos(a) * SHRAPNEL_SPEED, vy: Math.sin(a) * SHRAPNEL_SPEED, r: 4, life: 6 };
  });
}

/** Every point of an enemy that kills on contact: its body, and each tail segment. */
export function contactPoints(e: Enemy): { x: number; y: number; r: number }[] {
  const pts: { x: number; y: number; r: number }[] = [{ x: e.x, y: e.y, r: e.r }];
  if (e.tail) {
    const segR = e.boss ? e.r * 0.65 : e.r * 0.85;
    for (const s of e.tail) pts.push({ x: s.x, y: s.y, r: segR });
  }
  return pts;
}
