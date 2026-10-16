/**
 * The three end-of-studio bosses, each a pattern the contestant can learn:
 * Mutoid Man's fans of shots and the grunts he calls in, Scarface's
 * telegraphed charges and his rings, and Cobra Death's weaving body. All three
 * have a second stage at half health that tightens the pattern. They share
 * `Enemy` with the ordinary kinds so the simulation's collisions, damage and
 * cash need no special case; only `stepBoss` is theirs.
 */
import { ARENA, dist, toward, type Pt, type Side } from './arena';
import { fireAt, followTail, type BossKind, type Enemy, type Flak } from './enemies';

export interface BossDef {
  hp: number;
  speed: number;
  r: number;
  worth: number;
}

export const BOSSES: Record<BossKind, BossDef> = {
  mutoid: { hp: 150, speed: 34, r: 34, worth: 10000 },
  scarface: { hp: 190, speed: 52, r: 30, worth: 20000 },
  cobra: { hp: 230, speed: 118, r: 22, worth: 40000 }
};

/** What a boss asks the simulation to do beyond moving and shooting. */
export interface BossCall {
  /** Grunts to send in through doors right now. */
  grunts: number;
}

export const COBRA_SEGMENTS = 12;
export const COBRA_GAP = 15;
/** Mutoid's fan: shots per volley, their speed and the volley's full width, by stage. */
const MUTOID_FAN = [4, 6];
const MUTOID_RELOAD = [2.1, 1.6];
const MUTOID_SHOT = 165;
const MUTOID_SPREAD = [Math.PI / 4.5, Math.PI / 3.6];
/** Seconds between Mutoid's calls for grunts, and how many each brings. */
const MUTOID_CALL = 5.5;
const MUTOID_CALL_GRUNTS = 4;
/** Scarface's cycle: hover, a shaking wind-up that telegraphs the charge, then the charge. */
const SCARFACE_HOVER = [2.2, 1.6];
export const SCARFACE_WINDUP = 0.6;
const SCARFACE_CHARGE = 0.9;
export const SCARFACE_CHARGE_SPEED = 360;
const SCARFACE_RING = 10;
const SCARFACE_RING_RELOAD = 2.4;
const SCARFACE_RING_SPEED = 150;
/** Cobra: shots a burst, the reload by stage, the weave. */
const COBRA_BURST = 3;
const COBRA_RELOAD = [1.9, 1.3];
const COBRA_SHOT = 190;
const COBRA_WEAVE = 0.55;
const COBRA_WEAVE_RATE = 3.2;

export const SCARFACE_PHASE = { hover: 0, windup: 1, charge: 2 } as const;

/** Where a boss makes its entrance: the far side of the floor from the west door the contestant arrives by. */
export function bossEntry(kind: BossKind): Pt {
  const def = BOSSES[kind];
  return { x: ARENA.x + ARENA.w - def.r - 40, y: ARENA.y + ARENA.h / 2 };
}

export function spawnBoss(id: number, kind: BossKind, rng: () => number): Enemy {
  const def = BOSSES[kind];
  const at = bossEntry(kind);
  const e: Enemy = {
    id,
    kind,
    boss: true,
    x: at.x,
    y: at.y,
    r: def.r,
    hp: def.hp,
    maxHp: def.hp,
    speed: def.speed,
    worth: def.worth,
    t: 0,
    jitter: rng() * Math.PI * 2,
    timer: 1.2,
    phase: 0,
    vx: 0,
    vy: 0,
    armed: true,
    entered: true
  };
  if (kind === 'cobra') e.tail = Array.from({ length: COBRA_SEGMENTS }, () => ({ x: at.x, y: at.y }));
  return e;
}

/** A boss's stage, 0 or 1: the pattern tightens under half health. */
export function bossStage(e: Enemy): number {
  return e.hp * 2 <= e.maxHp ? 1 : 0;
}

/** Keeps a boss's body on the floor; a charging Scarface bounces instead. */
function keepIn(e: Enemy): Side | null {
  let hit: Side | null = null;
  if (e.x - e.r < ARENA.x) {
    e.x = ARENA.x + e.r;
    hit = 'w';
  } else if (e.x + e.r > ARENA.x + ARENA.w) {
    e.x = ARENA.x + ARENA.w - e.r;
    hit = 'e';
  }
  if (e.y - e.r < ARENA.y) {
    e.y = ARENA.y + e.r;
    hit = 'n';
  } else if (e.y + e.r > ARENA.y + ARENA.h) {
    e.y = ARENA.y + ARENA.h - e.r;
    hit = 's';
  }
  return hit;
}

/** A fan of `n` shots centred on the contestant, `spread` wide in all. */
function fan(from: Pt, at: Pt, n: number, spread: number, speed: number): Flak[] {
  const centre = Math.atan2(at.y - from.y, at.x - from.x);
  return Array.from({ length: n }, (_, i) => {
    const a = centre - spread / 2 + (spread * i) / (n - 1);
    return { x: from.x, y: from.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, r: 4, life: 6 };
  });
}

/** A ring of `n` shots in every direction. */
function ring(from: Pt, n: number, speed: number, phase: number): Flak[] {
  return Array.from({ length: n }, (_, i) => {
    const a = phase + (i * Math.PI * 2) / n;
    return { x: from.x, y: from.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, r: 4, life: 6 };
  });
}

/**
 * One tick of a boss. Shots go into `out`; anything else it wants (grunts
 * through the doors) comes back in the `BossCall`.
 */
export function stepBoss(e: Enemy, player: Pt, dt: number, out: Flak[]): BossCall {
  e.t += dt;
  const stage = bossStage(e);
  const call: BossCall = { grunts: 0 };
  switch (e.kind) {
    case 'mutoid': {
      // Treads: a slow, relentless track on the contestant.
      const d = toward(e, player);
      const speed = e.speed * (stage ? 1.7 : 1);
      e.vx = d.x * speed;
      e.vy = d.y * speed;
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      keepIn(e);
      e.timer -= dt;
      if (e.timer <= 0) {
        e.timer = MUTOID_RELOAD[stage];
        out.push(...fan(e, player, MUTOID_FAN[stage], MUTOID_SPREAD[stage], MUTOID_SHOT * (stage ? 1.12 : 1)));
      }
      // The second clock, kept in `jitter`'s neighbour `phase` as a countdown
      // so no new field is needed: grunts summoned every few seconds.
      e.phase -= dt;
      if (e.phase <= 0) {
        e.phase = MUTOID_CALL;
        call.grunts = MUTOID_CALL_GRUNTS + stage * 2;
      }
      break;
    }
    case 'scarface': {
      e.timer -= dt;
      if (e.phase === SCARFACE_PHASE.hover) {
        const d = toward(e, player);
        e.vx = d.x * e.speed;
        e.vy = d.y * e.speed;
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        keepIn(e);
        if (stage) {
          // `jitter` doubles as the ring clock once the fight is in its second stage.
          e.jitter -= dt;
          if (e.jitter <= 0) {
            e.jitter = SCARFACE_RING_RELOAD;
            out.push(...ring(e, SCARFACE_RING, SCARFACE_RING_SPEED, e.t));
          }
        }
        if (e.timer <= 0) {
          e.phase = SCARFACE_PHASE.windup;
          e.timer = SCARFACE_WINDUP;
          // The charge is aimed where the contestant stands at the start of
          // the wind-up, which is what makes it readable: move and it misses.
          const aim = toward(e, player);
          e.vx = aim.x * SCARFACE_CHARGE_SPEED;
          e.vy = aim.y * SCARFACE_CHARGE_SPEED;
        }
      } else if (e.phase === SCARFACE_PHASE.windup) {
        if (e.timer <= 0) {
          e.phase = SCARFACE_PHASE.charge;
          e.timer = SCARFACE_CHARGE;
        }
      } else {
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        const wall = keepIn(e);
        if (wall === 'w' || wall === 'e') e.vx = -e.vx;
        if (wall === 'n' || wall === 's') e.vy = -e.vy;
        if (e.timer <= 0) {
          e.phase = SCARFACE_PHASE.hover;
          e.timer = SCARFACE_HOVER[stage];
        }
      }
      break;
    }
    case 'cobra': {
      const d = toward(e, player);
      const weave = Math.sin(e.t * COBRA_WEAVE_RATE) * COBRA_WEAVE;
      const speed = e.speed * (stage ? 1.2 : 1);
      e.vx = (d.x - d.y * weave) * speed;
      e.vy = (d.y + d.x * weave) * speed;
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      keepIn(e);
      if (e.tail) followTail(e, e.tail, COBRA_GAP);
      e.timer -= dt;
      if (e.timer <= 0) {
        e.timer = COBRA_RELOAD[stage];
        for (let i = 0; i < COBRA_BURST; i++) {
          const shot = fireAt(e, player, COBRA_SHOT * (1 - i * 0.12));
          out.push(shot);
        }
      }
      break;
    }
  }
  return call;
}

/** How far a boss is from the contestant, for the renderer's and the AI's threat reads. */
export const bossRange = (e: Enemy, player: Pt): number => dist(e, player) - e.r;
