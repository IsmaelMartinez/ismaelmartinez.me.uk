/**
 * Scripted players for HOTFIX's headless shifts, in the manner of
 * `primetime-policies.ts`: a policy reads the run and answers with the stick.
 * `idle` is the floor. `competent` is a plain courier's habit (answer the
 * nearest phone, find a car, take the shortest way round the buildings, slow down to
 * arrive, back out when stuck) that the playthrough assertions in
 * `hotfix.test.ts` are measured against. It reads a sonar job's hidden place
 * straight off the run, which a player cannot: it stands in for a player who
 * can hear, and the signal a real one follows is tested on its own.
 */
import { wayTo, type Point } from '../../src/games/hotfix/map';
import {
  NO_INPUT,
  carSpeed,
  createRun,
  nearestObjective,
  playerPos,
  tickRun,
  type RunEvent,
  type RunInput,
  type RunState
} from '../../src/games/hotfix/run';
import type { JobId } from '../../src/games/hotfix/jobs';

export const TICK = 1 / 60;
export type Policy = (run: RunState) => RunInput;

export const idle = (): Policy => () => NO_INPUT;

const dist = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);

/** The point to head for now on the way to `target`, round the buildings. */
const waypoint = (from: Point, target: Point, width: number): Point => wayTo(from.x, from.y, target.x, target.y, width);

export function competent(): Policy {
  let reversing = 0;
  let stuckFor = 0;
  let last: Point = { x: 0, y: 0 };
  let lastAt = 0;
  let pressed = false;

  return run => {
    const player = run.player;
    const here = playerPos(run);
    const tap = (): boolean => {
      // The run acts on a press, so a held button has to be let go between presses.
      pressed = !pressed;
      return pressed;
    };
    const base: RunInput = { ...NO_INPUT, mode: 'stick' };
    const target = nearestObjective(run);
    if (!target) return base;
    const stage = run.job?.def.stages[run.job.stage];
    const onFootJob = stage?.type === 'collect';
    const away = dist(here, target);

    // Notice being stuck: no ground covered in a second of trying.
    if (run.time - lastAt >= 1) {
      stuckFor = dist(here, last) < 8 ? stuckFor + 1 : 0;
      last = { x: here.x, y: here.y };
      lastAt = run.time;
      if (stuckFor >= 1 && player.car) {
        reversing = 0.9;
        stuckFor = 0;
      }
    }

    if (!player.car) {
      if (onFootJob && away < 260) {
        const to = waypoint(here, target, 5);
        return { ...base, moveX: to.x - here.x, moveY: to.y - here.y };
      }
      // Find wheels: the nearest car that is not burning, wrecked or the law's.
      let car: Point | null = null;
      let best = Infinity;
      for (const c of run.cars) {
        if (c.dead || c.burning || c.driver === 'cop') continue;
        const d = dist(c, here);
        if (d < best) {
          best = d;
          car = c;
        }
      }
      if (!car || away < 60) {
        const to = waypoint(here, target, 5);
        return { ...base, moveX: to.x - here.x, moveY: to.y - here.y };
      }
      const to = waypoint(here, car, 5);
      return { ...base, moveX: to.x - here.x, moveY: to.y - here.y, action: best < 26 ? tap() : false };
    }

    const car = player.car;
    if (car.burning) return { ...base, handbrake: true, action: tap() };
    if (onFootJob && away < 110) return { ...base, handbrake: true, action: carSpeed(car) < 50 ? tap() : false };
    if (reversing > 0) {
      reversing -= TICK;
      return { ...base, moveX: -Math.cos(car.angle + 0.5), moveY: -Math.sin(car.angle + 0.5) };
    }
    const to = waypoint(here, target, 12);
    const d = dist(here, to) || 1;
    // Ease off to arrive, and for the corner at each crossing.
    const mag = away < 150 ? 0.45 : d < 70 ? 0.6 : 1;
    return { ...base, moveX: ((to.x - here.x) / d) * mag, moveY: ((to.y - here.y) / d) * mag };
  };
}

export interface Shift {
  run: RunState;
  events: RunEvent[];
  seconds: number;
}

/** Plays a shift to its end, or to `maxSeconds`, which no policy should ever reach. */
export function playShift(seed: number, policy: Policy, maxSeconds = 1200, deck?: JobId[]): Shift {
  const run = createRun(seed);
  if (deck) run.deck = deck;
  const events: RunEvent[] = [];
  let ticks = 0;
  while (!run.over && ticks * TICK < maxSeconds) {
    events.push(...tickRun(run, policy(run), TICK));
    ticks++;
  }
  return { run, events, seconds: ticks * TICK };
}
