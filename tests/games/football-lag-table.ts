/**
 * The keeper-lag instrument: conversion across the penalty area, banded by how
 * far out of position the keeper is when the ball is struck.
 *
 * It exists once and takes the axis as an argument, because there are **two**
 * lags and the suites spent six rounds measuring only the first of them.
 *
 *  - `trackLag` is a lag in what he *believes*. `restPosition` is fed
 *    `gk.trackX`, an exponentially lagged copy of `ball.x`, so he stands on the
 *    angle from where he thinks the ball is. A ball crossed along the face of
 *    goal at 200-300 px/s leaves that copy 30-50 px stale.
 *  - `walkLag` is a lag in where he *is*. His body walks to `keeperRest` at
 *    `KEEPER_WALK` = 120 px/s and arrives late whenever the target moves faster
 *    than he does. **This is the one the keeper code reads**: `approachGap`
 *    takes `keeper.x` and `commitDive` takes it as `restX`, and neither of them
 *    ever sees a rest position or a tracker.
 *
 * Both are measured against a standing reach of `REACH_BASE` = 26. Past his own
 * reach he is not a keeper who guessed wrong, he is a keeper who is not there.
 *
 * The table is banded on the mechanism and quantified over the whole grid
 * rather than attached to a named routine, and that is deliberate: five rounds
 * each asserted "this particular policy does not win" and the exploit each time
 * moved a parameter and carried on — the camp moved spot, then moved aim, then
 * the wing routine moved depth. The thing that does not move is the mechanism.
 * Any routine that engineers either lag inherits whatever this table says,
 * whatever station it stands on and whatever it aims at.
 */
import { goalRate } from './football-shot-harness';
import { BOX_DEPTH } from '../../src/games/football/pitch';

/** Which of the keeper's two lags a table bands on. */
export type LagAxis = 'trackLag' | 'walkLag';

export const LAG_CONTACTS = ['ground', 'header'] as const;

/**
 * What a table sweeps. It is an argument rather than a set of constants so that
 * a second axis can be measured on a **sampled** grid without either table
 * quietly becoming a different measurement from the other: the stations, the
 * aims and the seeds are all stated at the call site and printed with the
 * result.
 */
export interface LagGrid {
  distances: readonly number[];
  offsets: readonly number[];
  aims: readonly number[];
  /** Seeds per (station, aim, lag) cell. */
  seeds: number;
}

/**
 * The full grid: the whole penalty area, since `BOX_DEPTH` is 78 and `BOX_HALF`
 * is 108, and every aerial contact this cabinet has ever been broken by happens
 * inside it.
 *
 * Full stick either way and the halves between, pooled. Aim is swept rather
 * than chosen because a class-level property must not depend on modelling what
 * the attacker was trying to do: "the keeper's staleness decides the shot" has
 * to be false for a player aiming anywhere, including straight at him.
 */
export const LAG_GRID: LagGrid = {
  distances: [12, 25, 45, BOX_DEPTH],
  offsets: [-100, -55, -20, 0, 20, 55, 100],
  aims: [-1, -0.5, 0, 0.5, 1],
  seeds: 400
};

/**
 * The lag buckets.
 *
 * They are the audit's — settled under 20 px, stale at 30 and beyond — with two
 * refinements the isolation rig forces.
 *
 * The 20-29 shoulder is a band of its own and is reported rather than asserted,
 * because that is where `REACH_BASE` sits and the shape of the cliff is the
 * diagnosis rather than the claim.
 *
 * And the settled band is split into a `converged` column at lag 0 and a
 * `drifting` column at +-10, because in this rig they are not the same thing
 * and in the audit's live instrumentation they were. Live, everything under
 * 25 px measured flat at 0.068-0.108; here, 10 px of lag already converts a
 * header at 0.131 against 0.079. The rig is harsher on purpose and honestly so:
 * it places the keeper at the displacement the cell asks for, whereas in play
 * his body chases the target at `KEEPER_WALK` and smooths a transient 10 px
 * wobble into much less than 10 px. Pooling the two into one denominator
 * therefore charges the settled band with an error the live keeper never
 * carries, and the ratio that comes out understates the effect by about a
 * third. Both denominators are reported, separately, so that neither reading
 * can be quoted without the other.
 *
 * Both signs of every lag are swept. They are the two flanks, and a sweep that
 * tries one has swept one wing.
 */
export const LAG_BANDS: Array<{ label: string; lags: number[] }> = [
  { label: 'converged (lag 0)   ', lags: [0] },
  { label: 'drifting  (10-19)   ', lags: [10, -10] },
  { label: 'shoulder  (20-29)   ', lags: [22, -22, 26, -26] },
  { label: 'stale     (>= 30)   ', lags: [30, -30, 45, -45, 60, -60] }
];
export const CONVERGED = 0;
export const DRIFTING = 1;
export const STALE = 3;

/** One (aim, lag) cell of a band, which is what a band pools. */
export interface LagSubCell {
  aim: number;
  lag: number;
  rate: number;
}

export interface LagCell {
  goals: number;
  n: number;
  /**
   * The hottest single (aim, lag) cell pooled into this band.
   *
   * A pooled column cannot see a certainty: `keeper.ts` forbids any *cell* from
   * reading exactly 0 % or exactly 100 %, and averaging one in with a dozen
   * others hides it by construction — which is how three of the four
   * exactly-1.000 cells in this module's history survived a sweep that ran over
   * them. So each band remembers its own worst constituent, and a caller that
   * cares re-measures that one at seeds that can tell 99 % from 100 %.
   */
  hottest: LagSubCell;
}

export interface LagRow {
  contact: (typeof LAG_CONTACTS)[number];
  distance: number;
  offsetX: number;
  bands: LagCell[];
}

function lagCell(
  axis: LagAxis,
  grid: LagGrid,
  contact: (typeof LAG_CONTACTS)[number],
  distance: number,
  offsetX: number,
  lags: number[]
): LagCell {
  let goals = 0;
  let n = 0;
  let hottest: LagSubCell = { aim: grid.aims[0], lag: lags[0], rate: -1 };
  for (const aim of grid.aims) {
    for (const lag of lags) {
      const r = goalRate({ distance, aim, power: 1, offsetX, contact, [axis]: lag }, grid.seeds);
      if (r > hottest.rate) hottest = { aim, lag, rate: r };
      goals += Math.round(r * grid.seeds);
      n += grid.seeds;
    }
  }
  return { goals, n, hottest };
}

/** The whole table, one row per station and one column per band. */
export function lagTable(axis: LagAxis, grid: LagGrid = LAG_GRID): LagRow[] {
  return LAG_CONTACTS.flatMap(contact =>
    grid.distances.flatMap(distance =>
      grid.offsets.map(offsetX => ({
        contact,
        distance,
        offsetX,
        bands: LAG_BANDS.map(b => lagCell(axis, grid, contact, distance, offsetX, b.lags))
      }))
    )
  );
}

export const rate = (c: LagCell): number => c.goals / c.n;

export function pool(rows: LagRow[], band: number): LagCell {
  return rows.reduce<LagCell>(
    (acc, r) => ({
      goals: acc.goals + r.bands[band].goals,
      n: acc.n + r.bands[band].n,
      hottest: r.bands[band].hottest.rate > acc.hottest.rate ? r.bands[band].hottest : acc.hottest
    }),
    { goals: 0, n: 0, hottest: { aim: 0, lag: 0, rate: -1 } }
  );
}

/** The band table as text, so a failure carries the whole shape of the cliff. */
export function bandTable(rows: LagRow[]): string {
  return LAG_BANDS.map((b, i) => {
    const c = pool(rows, i);
    return `    ${b.label}  ${rate(c).toFixed(4)}  (${c.goals} of ${c.n})`;
  }).join('\n');
}

/** The audit's own low band: everything under 20 px, converged and drifting. */
export function settledBand(bands: LagCell[]): LagCell {
  const hotter =
    bands[CONVERGED].hottest.rate >= bands[DRIFTING].hottest.rate
      ? bands[CONVERGED].hottest
      : bands[DRIFTING].hottest;
  return {
    goals: bands[CONVERGED].goals + bands[DRIFTING].goals,
    n: bands[CONVERGED].n + bands[DRIFTING].n,
    hottest: hotter
  };
}
