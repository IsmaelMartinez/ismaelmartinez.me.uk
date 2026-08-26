/**
 * The three things 7.3's isolation rig could not say, and what it says now that
 * it can.
 *
 * `football-exploits.test.ts` opens with five nameable blind spots, each of them
 * a place where the suite was measuring something other than the game. This file
 * is the sixth, and it is the one that had been open longest, because it is not
 * a missing axis on top of the model — it is the *wrong quantity*:
 *
 *   (f) **the rig never measured the keeper's body.** `approachGap` takes
 *       `keeper.x`; `commitDive` takes `keeper.x` as its `restX`. Neither of
 *       them ever sees a rest position or a tracker. The rig wrote
 *       `gk.x = rest.x` — the keeper teleported onto his own target — so the
 *       walk lag was identically zero in every cell of every grid, and three
 *       consecutive rounds of keeper work were certified against
 *       `trackTarget`'s output rather than against the number the code reads.
 *       Measured live at d = 0.25, the body sits 21.5 px (competent) to 38.3 px
 *       (a wing routine) from the ball at aerial contact against a `REACH_BASE`
 *       of 26, and the tracker only accounts for half of that.
 *
 *       Worse, the rig struck every cell off the deck, so `airborne` was 0 and
 *       `trackTarget` returned its input unchanged: round 6's aerial fix was
 *       arithmetically inert in the grid that certified it, which `keeper.ts`
 *       says in as many words at `trackTarget`. And there is not one occurrence
 *       of `assist` in the rig's whole history, so `ASSIST_REACT_LOSS` — the
 *       largest single term in the shot model — was never charged in a cell,
 *       while live about three quarters of a competent player's shots are
 *       struck inside an open window.
 *
 * Issue #273, findings 1 and 6. The fix is in the rig rather than in the game:
 * `keeperRest` is exported from `match.ts` so the harness asks for the spot
 * instead of copying the rule, `walkLag` places the body somewhere other than
 * on it, and `assisted` arms the window. What is asserted here is deliberately
 * of two kinds and they are kept apart.
 *
 * **The axes are live.** Three regressions, one per axis, each of which fails
 * if the rig goes back to hiding the quantity. They are the direct guard
 * against this class of bug: a swept parameter the code does not consume is
 * worse than no parameter at all, because it reads as coverage.
 *
 * **And what the live axes measure.** The body-lag band table, which is the
 * tracker table's instrument pointed at the quantity the code reads, and 7.3's
 * own distance rows re-measured inside a live assist window. Both are reported
 * in full, because the numbers moved a long way and the whole point of the
 * round is that the old ones described something else.
 *
 * One thing the widened rig found is a live defect rather than a rig defect and
 * is **not** fixed here: see `CERTAINTY_CENSUS`.
 */
import { describe, it, expect } from 'vitest';
import { goalRate } from './football-shot-harness';
import {
  bandTable,
  lagTable,
  pool,
  rate,
  CONVERGED,
  LAG_BANDS,
  LAG_CONTACTS,
  LAG_GRID,
  STALE,
  type LagGrid
} from './football-lag-table';
import { KEEPER_JUMP_Z, SAVE_FLOOR } from '../../src/games/football/keeper';

/* ------------------------------------------------------------------ */
/* the axes are live                                                    */

/** Seeds per cell in the liveness regressions, which are a handful of cells. */
const LIVE_SEEDS = 3000;

/**
 * How far apart two cells have to read before the difference is the game rather
 * than the sample.
 *
 * A cell is `LIVE_SEEDS` Bernoulli trials, so the worst-case standard error of
 * one is `sqrt(0.25 / LIVE_SEEDS)` and a difference carries both. Four standard
 * errors of the difference is the bar, which at 3,000 seeds is about 0.026: far
 * above the noise and far below every effect being asserted, the smallest of
 * which is 0.09.
 */
const LIVE_MARGIN = 4 * Math.SQRT2 * Math.sqrt(0.25 / LIVE_SEEDS);

describe('7.3 the isolation rig can say what the keeper code reads', () => {
  /**
   * Finding 1, as a regression. Reverting the harness to `gk.x = rest.x` — the
   * line this issue is about — makes every pair below identical and this test
   * red on the first assertion.
   *
   * Both signs, because they are the two flanks, and the claim is that the cell
   * **moves**, not that it moves upward. Which way a displaced keeper is worth
   * is a property of the station and the aim rather than of the axis: dragged
   * off his near post he concedes the near post, and dragged toward the centre
   * of his goal he is standing in the way of the across-goal finish instead. The
   * pooled direction — further out of position is never cheaper for him — is the
   * band table's contract below, where it can be read off a whole grid rather
   * than off one shot.
   *
   * Measured at 3,000 seeds a cell, settled against +-30 px of body lag:
   *
   *   45 px dead centre, full stick   0.360   ->  0.980 / 0.566
   *   25 px, +55 offset, across goal  0.267   ->  0.209 / 0.546
   *   78 px, -55 offset, dead centre  0.227   ->  0.622 / 0.379
   *
   * The middle row is the one worth reading twice. Thirty pixels of body lag
   * toward the centre of the goal makes that shot *harder*, because the shot is
   * the across-goal finish and the lag has walked him into its path. Thirty the
   * other way nearly doubles it. A rig that swept one sign would have called the
   * axis worthless.
   */
  it('stands the keeper somewhere other than on his own target', { timeout: 120000 }, () => {
    const lines: string[] = [];
    for (const [distance, offsetX, aim] of [
      [45, 0, 1],
      [25, 55, -1],
      [78, -55, 0]
    ] as Array<[number, number, number]>) {
      const base = { distance, offsetX, aim, power: 1 } as const;
      const settled = goalRate(base, LIVE_SEEDS);
      const seen: number[] = [];
      for (const walkLag of [30, -30]) {
        const lagged = goalRate({ ...base, walkLag }, LIVE_SEEDS);
        seen.push(lagged);
        expect(
          Math.abs(lagged - settled),
          `d=${distance} off=${offsetX} aim=${aim}: body lag ${walkLag} reads ` +
            `${lagged.toFixed(3)} against ${settled.toFixed(3)} settled — the rig is ` +
            `teleporting the keeper onto his own target again (issue #273, finding 1)`
        ).toBeGreaterThan(LIVE_MARGIN);
      }
      lines.push(
        `d=${distance} off=${offsetX} aim=${aim}: settled ${settled.toFixed(3)}, ` +
          `lag +30 ${seen[0].toFixed(3)}, lag -30 ${seen[1].toFixed(3)}`
      );
    }
    // eslint-disable-next-line no-console
    console.log(`\nbody-lag liveness:\n  ${lines.join('\n  ')}\n`);
  });

  /**
   * Round 6's aerial fix, certified by a grid in which it can actually fire.
   *
   * `trackTarget` blends the keeper's lagged copy of the ball toward
   * `airMeetPoint` in proportion to `airborne(ballZ)`, so a keeper watching a
   * ball that is *up* sets from where it is coming down rather than from where
   * he last saw it. The claim is therefore exact rather than statistical: at
   * `KEEPER_JUMP_Z` the blend is complete, so **the tracker's staleness stops
   * mattering at all** and every lag reads the same cell. On the deck the same
   * staleness is worth two to four times the conversion.
   *
   * The exactness is a property of this rig rather than of play: the ball is
   * struck from a standing start, so the point it is coming down on is its own
   * position and the blend lands exactly on it. A cross has lateral pace and the
   * landing point is somewhere else, which is why round 6 left a residual and
   * said so. What the exactness pins is the arithmetic — that the lagged copy is
   * no longer what he sets from — and that is the thing that was inert.
   *
   * Measured over the three stations below, pooled at 1,000 seeds a cell: on
   * the deck a 60 px stale tracker takes a ground shot from 0.2813 to 0.7753 and
   * a header from 0.0713 to 0.5757; at `KEEPER_JUMP_Z` they read 0.2803 and
   * 0.0657 at lag 0, at lag 30 and at lag 60 alike.
   */
  it(
    'sets an airborne ball from its landing point rather than from the lagged copy',
    { timeout: 120000 },
    () => {
    const stations: Array<[number, number, number]> = [
      [12, -55, 1],
      [25, 0, 0],
      [45, 55, -1]
    ];
    const pooled = (ballZ: number, trackLag: number, contact: 'ground' | 'header'): number => {
      let goals = 0;
      let n = 0;
      for (const [distance, offsetX, aim] of stations) {
        goals += Math.round(
          goalRate({ distance, aim, power: 1, offsetX, contact, ballZ, trackLag }, 1000) * 1000
        );
        n += 1000;
      }
      return goals / n;
    };
    const rows: string[] = [];
    for (const contact of LAG_CONTACTS) {
      const deck = [0, 30, 60].map(trackLag => pooled(0, trackLag, contact));
      const up = [0, 30, 60].map(trackLag => pooled(KEEPER_JUMP_Z, trackLag, contact));
      const label =
        `${contact}: on the deck ${deck.map(v => v.toFixed(4)).join(' / ')}, ` +
        `at z=${KEEPER_JUMP_Z} ${up.map(v => v.toFixed(4)).join(' / ')}`;
      // On the deck the tracker is what he sets from, and staleness is expensive.
      expect(deck[2] - deck[0], `${label}: a stale tracker beats him on the deck`).toBeGreaterThan(
        LIVE_MARGIN
      );
      // Over his head it is not, and `trackTarget` is the whole of the reason.
      expect(up, `${label}: lag is inert once the ball is up`).toEqual([up[0], up[0], up[0]]);
      rows.push(label);
    }
    // eslint-disable-next-line no-console
    console.log(`\naerial tracking, tracker lag 0 / 30 / 60:\n  ${rows.join('\n  ')}\n`);
    }
  );

  /**
   * Finding 6, as a regression, and the shape of it is the interesting half.
   *
   * `armKeeper` charges an assisted strike half a dive (`ASSIST_DIVE_PENALTY`)
   * and 0.12 s of spent reaction (`ASSIST_REACT_LOSS`) — but only when the
   * contact is on the **ground**. A header off a cross collects neither, because
   * a delivery the keeper has watched arc into his own six-yard box is the one
   * ball on the pitch he is not surprised by, and round 6 removed that charge
   * deliberately. So the window is worth a great deal on a ground shot and
   * exactly nothing on a header, and both halves are asserted: the second is an
   * identity, and an identity is the strongest form a "this was removed" claim
   * can take.
   *
   * Measured at 3,000 seeds: a full-stick shot from the edge of the D reads
   * 0.3897 with no window and 0.8327 inside one, from 45 px 0.3600 and 0.4413,
   * and a three-quarter-stick shot from 120 px 0.2493 and 0.3247. The three
   * headers read 0.0663 / 0.0667, 0.0327 / 0.0327 and 0.1260 / 0.1303 — one of
   * them bit-identical, and none of them a goal apart in three thousand.
   */
  it(
    'charges an assisted ground strike and leaves an assisted header alone',
    { timeout: 120000 },
    () => {
    const lines: string[] = [];
    for (const [distance, aim] of [
      [80, 1],
      [45, 1],
      [120, 0.6]
    ] as Array<[number, number]>) {
      const cold = goalRate({ distance, aim, power: 1 }, LIVE_SEEDS);
      const warm = goalRate({ distance, aim, power: 1, assisted: true }, LIVE_SEEDS);
      expect(
        warm - cold,
        `d=${distance} aim=${aim}: ${cold.toFixed(3)} with no assist window against ` +
          `${warm.toFixed(3)} inside one — ASSIST_REACT_LOSS is not being charged`
      ).toBeGreaterThan(LIVE_MARGIN);
      lines.push(`ground d=${distance} aim=${aim}: ${cold.toFixed(4)} -> ${warm.toFixed(4)}`);
    }
    for (const [distance, offsetX] of [
      [20, 30],
      [34, 55],
      [45, -30]
    ] as Array<[number, number]>) {
      const base = { distance, aim: 1, power: 1, offsetX, contact: 'header' as const };
      const cold = goalRate(base, LIVE_SEEDS);
      const warm = goalRate({ ...base, assisted: true }, LIVE_SEEDS);
      expect(
        Math.abs(warm - cold),
        `header d=${distance} off=${offsetX}: ${cold.toFixed(4)} against ${warm.toFixed(4)} ` +
          `— the assist window is being charged on an aerial contact again`
      ).toBeLessThan(LIVE_MARGIN);
      lines.push(`header d=${distance} off=${offsetX}: ${cold.toFixed(4)} -> ${warm.toFixed(4)}`);
    }
    // eslint-disable-next-line no-console
    console.log(`\nassist window:\n  ${lines.join('\n  ')}\n`);
    }
  );
});

/* ------------------------------------------------------------------ */
/* what the body-lag axis measures                                      */

/**
 * The body-lag grid, and it is **sampled** where the tracker grid is exhaustive.
 *
 * The full grid costs about 150 s on its own, which is close to the whole of
 * what `#287` bought when it cut CI from 34 minutes to 7, and a second table of
 * that size would spend the saving on a diagnostic. Two of the three axes are
 * thinned — the offsets from seven to five, dropping the +-20 pair that sits
 * between the centre and the 55 px stations, and the aims from five to three,
 * dropping the half-stick pair — and the seeds from 400 to 150. That is a
 * quarter of the work, for a table whose stale column still pools 54,000 shots
 * per contact type and whose thinnest column pools 9,000.
 *
 * What the thinning costs is per-*station* resolution, which is why the
 * per-station breakdown the tracker table prints is not reproduced here; what it
 * keeps is the pooled shape, which is the reading that moved.
 */
const WALK_GRID: LagGrid = {
  distances: LAG_GRID.distances,
  offsets: [-100, -55, 0, 55, 100],
  aims: [-1, 0, 1],
  seeds: 150
};

const walkTable = lagTable('walkLag', WALK_GRID);

/**
 * How much better than the band before it a band has to read: two standard
 * errors of a difference at the **thinnest** column, which is `converged`,
 * because it pools one lag value where `stale` pools six. See the band table's
 * own docstring for why the ordering is asserted strictly.
 */
const THINNEST_COLUMN =
  WALK_GRID.distances.length * WALK_GRID.offsets.length * WALK_GRID.aims.length * WALK_GRID.seeds;
const BAND_STEP = 2 * Math.SQRT2 * Math.sqrt(0.25 / THINNEST_COLUMN);

/**
 * The exactly-100 % cells the widened rig found, which are a **live defect and
 * are deliberately not fixed here**.
 *
 * `keeper.ts` opens by forbidding them: "No configuration of distance, aim,
 * power and skill produces exactly 0 % or exactly 100 %." Three previous rounds
 * each found one and each converted it into a roll — `gap > reach`,
 * `parryLock > 0`, and (issue #300) `ball.z > KEEPER_JUMP_Z`. This is the
 * fourth, it has the same shape, and it was invisible for the same reason all
 * the others were: it lives on the axis the rig could not express.
 *
 * At 60 px of body lag, cells such as `(45 px, +55 offset, full stick)` and
 * `(12 px, -100 offset, half stick)` convert **1.0000 over 2,000 seeds**, and 18
 * of 1,680 swept cells sit above 0.99.
 *
 * The mechanism was measured rather than guessed. `keeperPlane` computes
 *
 *     const inFrame = Math.abs(m.ball.x - CENTRE_X) < GOAL_HALF;
 *
 * and hands `resolveSave` a floor of `SAVE_FLOOR` when it is true and 0 when it
 * is false, so that he is never credited with saving a shot that was missing
 * anyway. That test reads the ball's lateral position **at his own plane**, and
 * he stands 8 to 34 px in front of his line: a ball dragged across goal from a
 * wide angle is still outside the frame as it passes him and inside it when it
 * reaches the line. So the desperation floor is withheld from a shot that is
 * going in, the save probability falls to zero, and the cell is a result rather
 * than a chance. Projecting that one test to the goal line the way issue #300
 * already projected the *height* test takes all six of the 1.0000 cells to
 * exactly 0.9800, which is `1 - SAVE_FLOOR` and is the arithmetic confirming the
 * diagnosis.
 *
 * It is a one-line change to `match.ts` and it is a change to the game, so it is
 * not made in a rig round: this file reports the census and **issue #312**
 * carries the fix, exactly as issue #300 carried what issue #273 found about the
 * height cliff. Until then the census is printed and its *shape* is asserted, so
 * that a table which silently stopped measuring anything would still fail; the
 * assertion — no cell of the grid is a certainty — lands with the fix.
 */
const CERTAINTY_CENSUS = 0.99;
/**
 * A band's hottest cell has to read this to be worth re-measuring, and the
 * re-measure runs at enough seeds to tell 99 % from 100 % — `0.995 ^ 2000` is
 * five in a hundred thousand, so a genuinely certain cell cannot hide behind the
 * sample and a merely hot one cannot masquerade as certain.
 */
const CENSUS_SCAN = 0.96;
const CENSUS_SEEDS = 2000;

describe("7.3 the keeper's body lag, which is the lag the code reads", () => {
  /**
   * The band table, printed, and the one thing about it that is a contract.
   *
   * The tracker table's *ratio* bounds were demoted to a diagnostic in round 6
   * for a reason that applies here with more force, not less: the rig places the
   * keeper at the displacement the cell asks for, and a keeper standing 45 px
   * from where the ball passes him — against an effective reach of 13 to 21 px
   * for a contact arriving in 0.04 to 0.09 s — is not a keeper who guessed
   * wrong, he is a keeper who is not there. Asking him to save one of those is
   * asking for the deterministic absorber this module was rewritten to remove.
   *
   * What *is* a contract is the direction, and it is asserted **strictly**: each
   * band has to convert measurably better for the attacker than the one before
   * it, at both contact types. No amount of "a beaten keeper should concede"
   * argues that away, and strictness is what makes it a regression rather than a
   * platitude — a rig that stopped consuming the axis at all would leave the
   * four columns equal, and equal passes a non-strict ordering. (A flipped sign
   * would *not* fail it, and the reason is worth knowing: every band sweeps both
   * signs, so flipping one is a relabelling and the pooled columns come out
   * bit-identical. The axis's sign is pinned by the liveness test above, where
   * the two signs read 0.209 and 0.546 off the same station.)
   *
   * The margin is two standard errors of a difference at the thinnest column —
   * `converged` pools `WALK_GRID`'s aims once each, 9,000 shots — and the
   * tightest gap the build actually shows is seven times it.
   *
   * Measured on the build this file was written against, both axes on this same
   * sampled grid so the comparison is like for like:
   *
   *            converged  drifting  shoulder   stale
   *   body    ground  0.2712    0.3230    0.4834   0.7079   -> x2.61
   *           header  0.0580    0.1071    0.2735   0.5196   -> x8.96
   *   tracker ground  0.2712    0.3043    0.3806   0.5024   -> x1.85
   *           header  0.0580    0.0921    0.1737   0.2981   -> x5.14
   *
   * The converged column is identical down both halves, and has to be: at lag
   * zero the two axes describe the same keeper, so the grid is checking its own
   * arithmetic there. Everything to the right of it is finding 1. **At the same
   * displacement the keeper's body is worth 41 % more than his tracker on the
   * ground and 74 % more in the air**, and the gap widens with the displacement
   * rather than closing — which is what it means for three rounds to have been
   * certified against `trackTarget`'s output instead of against `keeper.x`.
   *
   * The reason is not subtle once the two are side by side. A stale tracker
   * moves the *angle* he stands on, and the bisector moves far less than the
   * ball does — from the middle of the pitch the two posts are almost the same
   * direction, which is the whole point of `narrowAngleX`. A body that has not
   * arrived is displaced by the full amount, in pixels, against a reach measured
   * in the same pixels.
   */
  it('reports the body-lag band table', { timeout: 900000 }, () => {
    const report: string[] = [];
    const wrong: string[] = [];
    for (const contact of LAG_CONTACTS) {
      const rows = walkTable.filter(r => r.contact === contact);
      const columns = LAG_BANDS.map((_, i) => rate(pool(rows, i)));
      report.push(
        `${contact}: stale/converged = ${(columns[STALE] / columns[CONVERGED]).toFixed(2)}\n` +
          bandTable(rows)
      );
      for (let i = 1; i < columns.length; i++) {
        if (columns[i] - columns[i - 1] > BAND_STEP) continue;
        wrong.push(
          `${contact}: ${LAG_BANDS[i].label.trim()} converts ${columns[i].toFixed(4)} ` +
            `against ${LAG_BANDS[i - 1].label.trim()} at ${columns[i - 1].toFixed(4)}, ` +
            `a step of ${(columns[i] - columns[i - 1]).toFixed(4)} against a required ` +
            `${BAND_STEP.toFixed(4)}`
        );
      }
    }
    // The census is two-stage on purpose. A band's own seeds cannot tell 99 %
    // from 100 %, so the scan only nominates each band's hottest constituent and
    // every nomination is then re-measured at `CENSUS_SEEDS`, which can.
    const certain = walkTable
      .flatMap(row => row.bands.map(band => ({ row, hot: band.hottest })))
      .filter(({ hot }) => hot.rate >= CENSUS_SCAN)
      .map(({ row, hot }) => ({
        row,
        hot,
        confirmed: goalRate(
          {
            distance: row.distance,
            aim: hot.aim,
            power: 1,
            offsetX: row.offsetX,
            contact: row.contact,
            walkLag: hot.lag
          },
          CENSUS_SEEDS
        )
      }))
      .filter(({ confirmed }) => confirmed > CERTAINTY_CENSUS)
      .sort((a, b) => b.confirmed - a.confirmed)
      .map(
        ({ row, hot, confirmed }) =>
          `      ${confirmed.toFixed(4)}  ${row.contact} ${row.distance} px, offset ` +
          `${row.offsetX >= 0 ? '+' : ''}${row.offsetX}, aim ${hot.aim}, body lag ` +
          `${hot.lag >= 0 ? '+' : ''}${hot.lag}`
      );
    // Printing is the point of this one: it is the instrument, and an instrument
    // nobody reads is a fifty-second no-op.
    // eslint-disable-next-line no-console
    console.log(
      `\nkeeper body-lag amplification (standing reach 26 px, ${WALK_GRID.seeds} seeds a cell):\n  ` +
        report.join('\n  ') +
        `\n  cells confirmed over ${CERTAINTY_CENSUS} at ${CENSUS_SEEDS} seeds ` +
        `(issue #312; SAVE_FLOOR is ${SAVE_FLOOR}):\n` +
        (certain.length > 0 ? certain.join('\n') : '      none') +
        '\n'
    );
    expect(
      wrong,
      `body-lag bands that do not rise with the displacement:\n  ${wrong.join('\n  ')}`
    ).toEqual([]);
    // A diagnostic that silently measured nothing would be worse than none, so
    // the shape of the grid is the other thing here that is a contract.
    expect(walkTable.length, 'stations measured').toBe(
      LAG_CONTACTS.length * WALK_GRID.distances.length * WALK_GRID.offsets.length
    );
    for (const row of walkTable) {
      for (const [i, band] of row.bands.entries()) {
        expect(band.n, `${row.contact} ${row.distance}/${row.offsetX} band ${i}`).toBe(
          WALK_GRID.aims.length * LAG_BANDS[i].lags.length * WALK_GRID.seeds
        );
      }
    }
  });
});

/* ------------------------------------------------------------------ */
/* 7.3's distance rows, inside the window the game actually charges     */

/** The distances 7.3's rows are read at, matching `football-shot-grid.test.ts`. */
const ASSIST_DISTANCES = [10, 14, 20, 45, 80, 120, 160, 200, 240] as const;
const ASSIST_AIMS = [0, 0.6, 1] as const;
const ASSIST_SEEDS = 1000;
/** The edge of the penalty area, where the response starts falling for real. */
const FROM_EDGE = ASSIST_DISTANCES.indexOf(80);
/** Two standard errors of a difference of two cells at `ASSIST_SEEDS`. */
const ASSIST_TOLERANCE = 2 * Math.SQRT2 * Math.sqrt(0.25 / ASSIST_SEEDS);

describe('7.3 the distance rows, measured inside a live assist window', () => {
  /**
   * 7.3's shape claims, re-read with the window open.
   *
   * The rows in `football-shot-grid.test.ts` are all struck by a player who
   * already had the ball, which is the honest reading for a man who has carried
   * it to a spot and the wrong one for the game as played: about three quarters
   * of a competent player's shots arrive inside an open window, and the window
   * is the largest single term in the model. So the shape has to survive being
   * measured there too, and the size of the term has to be on the record rather
   * than inferred.
   *
   * Both claims hold, and that is the finding: the assist window scales the rows
   * without bending them. Measured at 3,000 seeds a cell, full stick:
   *
   *   d      10     14     20     45     80    120    160    200    240
   *   cold  .347   .323   .353   .360   .390   .343   .307   .269   .240
   *   warm  .347   .362   .446   .441   .833   .558   .382   .327   .305
   *
   * Two things in that row are worth naming. The window is worth nothing at all
   * inside about 14 px, because `armKeeper` caps the reaction loss at the ball's
   * own flight time and a finish from touching distance arrives inside 0.12 s —
   * the cap is arithmetically a no-op there, exactly as `ASSIST_REACT_LOSS` says.
   * And the profit peak is at the **edge of the D** rather than in the six-yard
   * box: 0.833 at 80 px against 0.441 from 45. The old rows put the best cell in
   * the grid at 0.390, so the game's best chance was being understated by more
   * than a factor of two, and it was being understated at the one distance a
   * player actually shoots from. That is a balance reading rather than a rig
   * one and it belongs to the follow-up, but it is what the widened rig says.
   */
  it('keeps 7.3\'s shape with the window open', { timeout: 600000 }, () => {
    const rows: string[] = [];
    const warmRows: number[][] = [];
    for (const aim of ASSIST_AIMS) {
      const cold = ASSIST_DISTANCES.map(distance =>
        goalRate({ distance, aim, power: 1 }, ASSIST_SEEDS)
      );
      const warm = ASSIST_DISTANCES.map(distance =>
        goalRate({ distance, aim, power: 1, assisted: true }, ASSIST_SEEDS)
      );
      const label =
        `aim=${aim}\n      cold ${cold.map(v => v.toFixed(3)).join(' ')}` +
        `\n      warm ${warm.map(v => v.toFixed(3)).join(' ')}`;
      rows.push(label);
      warmRows.push(warm);
      // Falls with distance from the edge of the box outward, as 7.3 asks, and
      // the window does not change that: it is a penalty on the keeper's
      // execution, not a term in the distance response.
      for (let i = FROM_EDGE + 1; i < warm.length; i++) {
        expect(
          warm[i],
          `${label}: ${ASSIST_DISTANCES[i]} px no better than the one before`
        ).toBeLessThanOrEqual(warm[i - 1] + ASSIST_TOLERANCE);
      }
    }
    // ...and rises with the aim at every distance a player shoots from, again
    // with the window open, read off the same cells rather than re-measured:
    // the rows above already contain every one of them.
    for (let i = FROM_EDGE; i < ASSIST_DISTANCES.length; i++) {
      const row = warmRows.map(r => r[i]);
      const label = `d=${ASSIST_DISTANCES[i]} warm row=${row.map(v => v.toFixed(3)).join(' ')}`;
      expect(row[1], `${label}: aim 0.6 over centre`).toBeGreaterThan(row[0]);
      expect(row[2], `${label}: full stick over aim 0.6`).toBeGreaterThan(row[1]);
    }
    // eslint-disable-next-line no-console
    console.log(
      `\n7.3 distance rows with and without a live assist window ` +
        `(${ASSIST_SEEDS} seeds a cell, distances ${ASSIST_DISTANCES.join(' ')}):\n    ` +
        rows.join('\n    ') +
        '\n'
    );
  });
});
