/**
 * Scripted contestants for PRIME TIME's headless runs, in the manner of
 * `football-policies.ts`: a policy reads the run and answers with both sticks.
 * None of them is a player; `idle` is the floor (does nothing), `competent`
 * is a cautious twin-stick habit (shoot the nearest thing, back away from the
 * crowd, dodge what is flying at you, walk to the door when it opens) that
 * the balance assertions in `primetime.test.ts` are measured against.
 */
import { ARENA, dist, toward, type Pt } from '../../src/games/primetime/arena';
import { MINE_BLAST, contactPoints } from '../../src/games/primetime/enemies';
import {
  NO_INPUT,
  createRun,
  exitTarget,
  nearestEnemy,
  tickRun,
  type RunEvent,
  type RunInput,
  type RunState
} from '../../src/games/primetime/run';

export type Policy = (run: RunState) => RunInput;

export const idle: Policy = () => NO_INPUT;

/** Fires at the nearest enemy and never moves: the test of whether standing still is death. */
export const turret: Policy = run => {
  const e = nearestEnemy(run);
  if (!e) return NO_INPUT;
  const d = toward(run.player, e);
  return { moveX: 0, moveY: 0, fireX: d.x, fireY: d.y };
};

/** How close a threat has to be before the contestant backs off it. */
const FLEE = 135;
/** How close a flying shot's path has to pass before the contestant sidesteps it. */
const DODGE = 60;
/** The contestant keeps at least this far from a boss's body. */
const BOSS_SPACE = 240;

export const competent: Policy = run => {
  const p = run.player;
  const centre: Pt = { x: ARENA.x + ARENA.w / 2, y: ARENA.y + ARENA.h / 2 };
  let mx = 0;
  let my = 0;

  if (run.phase === 'dome') {
    let best: Pt | null = null;
    let bestD = Infinity;
    for (const it of run.items) {
      const d = dist(it, p);
      if (d < bestD) {
        bestD = d;
        best = it;
      }
    }
    if (!best) return NO_INPUT;
    const d = toward(p, best);
    return { moveX: d.x, moveY: d.y, fireX: 0, fireY: 0 };
  }

  // Back away from everything that kills on contact, harder the closer it
  // is; a boss is kept at arm's length by circling it rather than backing off
  // it, which is how a contestant avoids being pinned in a corner.
  let threats = 0;
  for (const e of run.enemies) {
    if (e.kind === 'mine') continue;
    for (const c of contactPoints(e)) {
      const d = dist(c, p);
      const reach = e.boss ? BOSS_SPACE : FLEE;
      if (d > reach) continue;
      threats++;
      const w = (reach - d) / reach;
      const ax = (p.x - c.x) / Math.max(1, d);
      const ay = (p.y - c.y) / Math.max(1, d);
      if (e.boss && e.speed > 100) {
        // A chaser (Cobra Death) is nearly as fast as the contestant and
        // homes, so no spot is safe: run a wide circle round the floor in the
        // direction that opens the angle to it, and shoot back over the
        // shoulder.
        const bearing = Math.atan2(p.y - centre.y, p.x - centre.x);
        const bossBearing = Math.atan2(e.y - centre.y, e.x - centre.x);
        let gap = bearing - bossBearing;
        while (gap > Math.PI) gap -= Math.PI * 2;
        while (gap < -Math.PI) gap += Math.PI * 2;
        const spin = gap >= 0 ? 1 : -1;
        const a = bearing + spin * 0.6;
        const spot = { x: centre.x + Math.cos(a) * 150, y: centre.y + Math.sin(a) * 150 };
        const d = toward(p, spot);
        mx += d.x * 3 + ax * w * w * 4;
        my += d.y * 3 + ay * w * w * 4;
      } else if (e.boss) {
        // A boss is kept at arm's length from the open side of the floor: the
        // contestant heads for the spot `BOSS_SPACE` from the boss on its
        // centre-facing side, so the retreat never ends in a corner, and a
        // fan of shots is met from a distance it can be dodged at.
        // The spot is reached round the boss, never through it: the bearing
        // swings from where the contestant stands toward the centre-facing
        // side by at most fifty degrees a step.
        const bearing = Math.atan2(p.y - e.y, p.x - e.x);
        const open = dist(e, centre) > 40 ? Math.atan2(centre.y - e.y, centre.x - e.x) : bearing;
        let swing = open - bearing;
        while (swing > Math.PI) swing -= Math.PI * 2;
        while (swing < -Math.PI) swing += Math.PI * 2;
        const a = bearing + Math.max(-0.9, Math.min(0.9, swing));
        const spot = { x: e.x + Math.cos(a) * BOSS_SPACE, y: e.y + Math.sin(a) * BOSS_SPACE };
        const d = toward(p, spot);
        const far = Math.min(1, dist(p, spot) / 60);
        const close = d.x * ax + d.y * ay < 0 && dist(p, e) < 150 ? 6 : 2;
        mx += d.x * 3 * far + ax * w * w * close;
        my += d.y * 3 * far + ay * w * w * close;
      } else {
        mx += ax * w * w * 3;
        my += ay * w * w * 3;
      }
    }
  }
  // Mines are stepped round, not fled.
  for (const e of run.enemies) {
    if (e.kind !== 'mine') continue;
    const d = dist(e, p);
    if (d > 70) continue;
    const w = (70 - d) / 70;
    mx += ((p.x - e.x) / Math.max(1, d)) * w * 4;
    my += ((p.y - e.y) / Math.max(1, d)) * w * 4;
  }
  // Sidestep shots whose path passes close. A fan is dodged as one thing:
  // the shots' headings are averaged and the contestant steps off the fan's
  // centre line to the side they are already on, where dodging each shot on
  // its own has the two halves of a fan pushing against each other.
  let dirX = 0;
  let dirY = 0;
  let perpSum = 0;
  let dodgeW = 0;
  for (const f of run.flak) {
    const speed = Math.hypot(f.vx, f.vy);
    if (speed < 1) continue;
    const ux = f.vx / speed;
    const uy = f.vy / speed;
    const rx = p.x - f.x;
    const ry = p.y - f.y;
    const along = rx * ux + ry * uy;
    if (along < 0 || along > 320) continue;
    const perp = rx * uy - ry * ux;
    if (Math.abs(perp) > DODGE) continue;
    threats++;
    const w = (DODGE - Math.abs(perp)) / DODGE;
    dirX += ux * w;
    dirY += uy * w;
    perpSum += perp * w;
    dodgeW += w;
  }
  if (dodgeW > 0) {
    const m = Math.hypot(dirX, dirY) || 1;
    const ux = dirX / m;
    const uy = dirY / m;
    // Dead on the centre line the sign would flip every tick and the
    // contestant would jitter in place, so the tie goes to the side with the
    // most floor: the one the arena's centre is on.
    const cPerp = (centre.x - p.x) * uy - (centre.y - p.y) * ux;
    const side = Math.abs(perpSum) > 6 ? (perpSum >= 0 ? 1 : -1) : cPerp >= 0 ? 1 : -1;
    mx += uy * side * 6;
    my += -ux * side * 6;
  }
  // Walls are where crowds pin you: push off them, hard near a corner.
  const edge = 90;
  const wall = (gap: number) => (gap < edge ? ((edge - gap) / edge) ** 2 * 4 : 0);
  mx += wall(p.x - ARENA.x) - wall(ARENA.x + ARENA.w - p.x);
  my += wall(p.y - ARENA.y) - wall(ARENA.y + ARENA.h - p.y);

  if (run.phase === 'cleared') {
    const door = exitTarget(run);
    if (door) {
      const d = toward(p, door);
      // With the floor quiet, the door is the only thing that matters, and
      // the wall push above would otherwise hold the contestant off it.
      if (threats === 0) return { moveX: d.x, moveY: d.y, fireX: 0, fireY: 0 };
      mx += d.x;
      my += d.y;
    }
  } else if (threats === 0) {
    // Quiet: collect what is near, else hold the middle of the floor.
    let best: Pt | null = null;
    let bestD = 220;
    for (const it of run.items) {
      const d = dist(it, p);
      if (d < bestD) {
        bestD = d;
        best = it;
      }
    }
    const goal = best ?? centre;
    if (dist(goal, p) > 8) {
      const d = toward(p, goal);
      mx += d.x;
      my += d.y;
    }
  }

  // Shoot the nearest thing that moves; a mine only when it is in line.
  let target = null as ReturnType<typeof nearestEnemy>;
  let targetD = Infinity;
  for (const e of run.enemies) {
    const d = dist(e, p) - e.r;
    if (e.kind === 'mine') {
      // Only a mine in line with one of the eight ways, and never one close
      // enough for its blast to come back.
      const dx = Math.abs(e.x - p.x);
      const dy = Math.abs(e.y - p.y);
      const inLine = dx < 12 || dy < 12 || Math.abs(dx - dy) < 12;
      if (!inLine || d < MINE_BLAST + 40) continue;
    }
    if (d < targetD) {
      targetD = d;
      target = e;
    }
  }
  const fire = target ? toward(p, target) : { x: 0, y: 0 };
  const m = Math.hypot(mx, my);
  return {
    moveX: m > 1e-6 ? mx / m : 0,
    moveY: m > 1e-6 ? my / m : 0,
    fireX: fire.x,
    fireY: fire.y
  };
};

export interface PlayResult {
  run: RunState;
  ticks: number;
  events: RunEvent[];
  /** Rooms entered, in order, as `studio:key`. */
  path: string[];
}

export const TICK = 1 / 60;

/**
 * Plays a run to its end, or to `maxTicks`. The guard is a plain literal in
 * every caller (CLAUDE.md's rule for playthrough tests): it must not be
 * derived from anything under test.
 */
export function playRun(seed: number, policy: Policy, maxTicks: number): PlayResult {
  const run = createRun(seed);
  const events: RunEvent[] = [];
  const path = [`${run.circuit}:${run.roomKey}`];
  let ticks = 0;
  while (run.phase !== 'over' && run.phase !== 'won' && ticks < maxTicks) {
    const out = tickRun(run, policy(run), TICK);
    for (const ev of out) {
      events.push(ev);
      if (ev.type === 'enterRoom') path.push(`${ev.circuit}:${ev.key}`);
    }
    ticks++;
  }
  return { run, ticks, events, path };
}
