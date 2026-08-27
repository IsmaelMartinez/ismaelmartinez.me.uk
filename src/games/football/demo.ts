/**
 * Attract mode: the cabinet playing itself.
 *
 * Every arcade machine of 1990 demoed itself to an empty room, and this one
 * does too — after {@link ATTRACT_DELAY} idle seconds on the title screen a
 * CPU-versus-CPU match plays out in full view with the HUD live, and any input
 * drops straight into the real game.
 *
 * There is **no second simulation**. The demo is an ordinary `MatchState`
 * stepped by the ordinary `tickMatch`; side 1 is already the CPU, and this
 * module supplies side 0's `MatchInput` from the same `ai.ts` the CPU thinks
 * with. That is the whole of it: a driver on the stick, not a copy of the
 * game. Everything here is DOM-free and draws only from the match's own
 * injected RNG plus its own tick counters, so a demo is reproducible from its
 * seed — which is what `tests/games/football-demo.test.ts` asserts.
 *
 * The demo never touches the run, the scoreboard or the personal best; that
 * is `game.ts`'s side of the contract and it keeps the demo state in its own
 * variable so no full-time path can reach a `RunState` at all.
 */
import { clamp } from '../engine/math';
import {
  canAirStrike,
  CHARGE_TIME,
  NEUTRAL_INPUT,
  TACKLE_R,
  type MatchInput,
  type MatchState
} from './match';
import { CENTRE_X, attackGoalY, dist } from './pitch';
import { SHOOT_RANGE, dribbleTarget, laneBlockers, planCarrier } from './ai';

/** Idle seconds on the title screen before the cabinet starts demoing itself. */
export const ATTRACT_DELAY = 12;

/**
 * Seconds of football in each demo half. A demo is a trailer, not a fixture:
 * a full 2 x 30 s match would leave a passer-by watching a goalless midfield
 * for a minute, where two 14 s halves loop back to the title often enough that
 * the wordmark is never off screen for long.
 */
export const DEMO_HALF_SECONDS = 14;

/** Difficulty both demo sides are matched at: an even, watchable game. */
export const DEMO_DIFFICULTY = 0.5;

/** Quantise to the eight directions the cabinet's stick can express. */
function quantise8(x: number, y: number): { x: number; y: number } {
  const len = Math.hypot(x, y);
  if (len < 0.001) return { x: 0, y: 0 };
  const qx = Math.abs(x) / len > 0.383 ? Math.sign(x) : 0;
  const qy = Math.abs(y) / len > 0.383 ? Math.sign(y) : 0;
  if (qx === 0 && qy === 0) return { x: 0, y: Math.sign(y) || 1 };
  return { x: qx, y: qy };
}

/** Ticks A is held to charge a shot to roughly full power. */
const CHARGE_TICKS = Math.round(CHARGE_TIME * 60) + 2;
/** Two frames of A: the press fires a header or a slide, the release lets go. */
const TAP_TICKS = 2;
/** Demo reaction time, in seconds: a decent but unhurried player. */
const REACTION = 0.14;
/** Seconds a demo player waits after a slide before considering another. */
const SLIDE_REST = 1.1;

export type DemoDriver = (m: MatchState, dt: number) => MatchInput;

/**
 * Side 0's stick and buttons for a demo match.
 *
 * It asks `planCarrier` — the CPU's own brain — what to do with the ball, and
 * expresses the answer through the human control scheme, which is what makes
 * the demo a demonstration: everything on screen is something a player could
 * have done with the same three buttons. The one place it overrules the brain
 * is when to shoot, and the reason is at that branch.
 */
export function createDemoDriver(): DemoDriver {
  let think = 0;
  let held: MatchInput = NEUTRAL_INPUT;
  let holding = 0;
  let slideRest = 0;

  return (m: MatchState, dt: number): MatchInput => {
    slideRest = Math.max(0, slideRest - dt);
    // A charge in progress is never interrupted: the release is what fires it.
    if (holding > 0) {
      holding--;
      if (holding === 0) return { ...held, a: false };
      return held;
    }

    const p = m.players[0][m.controlled];
    const owns = !!m.owner && m.owner.side === 0 && m.owner.idx === m.controlled;
    const goalY = attackGoalY(0, m.swapped);

    // Attacking a dropping cross is a reflex, not a decision, so it sits
    // outside the reaction gate — the headable window is a few frames wide.
    if (!owns && canAirStrike(m, 0, m.controlled) && Math.abs(goalY - m.ball.y) < 150) {
      const keeper = m.players[1][0];
      const away = keeper.x <= CENTRE_X ? 1 : -1;
      held = { x: away * 0.8, y: Math.sign(goalY - p.y), a: true, b: false, c: false };
      holding = TAP_TICKS;
      return held;
    }

    think -= dt;
    if (think > 0) return held;
    think = REACTION;

    if (owns) {
      const plan = planCarrier(m, 0, m.controlled);
      const goalDist = dist(p.x, p.y, CENTRE_X, goalY);
      // The demo shoots on a *player's* gate rather than the CPU's. The CPU
      // brain only lets go from a corridor it can see daylight through, which
      // is right for an opponent and wrong for a shop window: on the CPU's own
      // gate a demo took two shots a match and passed the rest of it sideways.
      // Inside the box two bodies in the way are worth chancing, from range
      // only one, which is the same judgement `competent` makes in the suites.
      if (goalDist <= SHOOT_RANGE && laneBlockers(m, 0, p) <= (goalDist < 150 ? 2 : 1)) {
        // Toward the gap beside the keeper, give or take: the wander comes out
        // of the match's own RNG so a seeded demo still replays identically.
        const keeper = m.players[1][0];
        const away = keeper.x <= CENTRE_X ? 1 : -1;
        const aim = away * clamp(0.8 + (m.rng() * 2 - 1) * 0.25, 0, 1);
        held = { x: aim, y: Math.sign(goalY - p.y), a: true, b: false, c: false };
        holding = Math.max(1, Math.round(CHARGE_TICKS * clamp(0.5 + goalDist / 320, 0.35, 1)));
        return held;
      }
      if ((plan.action === 'pass' || plan.action === 'loft') && plan.target >= 0) {
        const mate = m.players[0][plan.target];
        const q = quantise8(mate.x - p.x, mate.y - p.y);
        held = {
          x: q.x,
          y: q.y,
          a: false,
          b: plan.action === 'loft',
          c: plan.action === 'pass'
        };
        holding = TAP_TICKS;
        return held;
      }
      const t = dribbleTarget(m, 0, m.controlled);
      const q = quantise8(t.x - p.x, t.y - p.y);
      held = { x: q.x, y: q.y, a: false, b: false, c: false };
      return held;
    }

    // Out of possession: chase the carrier, or where a loose ball is going,
    // and slide only when it is genuinely on. A wild slide costs 0.8 s on the
    // floor and a demo that spends the match grounded sells nothing.
    const carrier =
      m.owner && m.owner.side === 1 && m.owner.idx !== 0 ? m.players[1][m.owner.idx] : null;
    const chase = carrier ?? { x: m.ball.x + m.ball.vx * 0.15, y: m.ball.y + m.ball.vy * 0.15 };
    const q = quantise8(chase.x - p.x, chase.y - p.y);
    let slide = false;
    if (carrier && slideRest === 0) {
      const d = dist(p.x, p.y, carrier.x, carrier.y);
      const toX = (carrier.x - p.x) / (d || 1);
      const toY = (carrier.y - p.y) / (d || 1);
      const headOn = -(carrier.fx * toX + carrier.fy * toY) > 0.5;
      slide = d < TACKLE_R && headOn;
    }
    held = { x: q.x, y: q.y, a: slide, b: false, c: false };
    if (slide) {
      holding = TAP_TICKS;
      slideRest = SLIDE_REST;
    }
    return held;
  };
}

/** Two different sides for a demo match, drawn from the visible roster. */
export function demoPairing(rng: () => number, roster: readonly { code: string }[]): [number, number] {
  const first = Math.floor(rng() * roster.length) % roster.length;
  const step = 1 + Math.floor(rng() * (roster.length - 1));
  return [first, (first + step) % roster.length];
}
