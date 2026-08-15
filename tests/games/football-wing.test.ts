/**
 * Blind spot (b) of `football-exploits.test.ts`, and the most expensive
 * assertion the cabinet has: the wing-cross routine, swept station by station
 * across both flanks and re-measured against both scripted humans.
 *
 * `winger` pinned its lateral and depth for a whole round and the sweep varied
 * only the *side*, on a mirror-symmetric pitch — which is the one axis a
 * mirror-symmetric pitch guarantees nothing lives on. The exploit had moved by
 * 25 px of depth. `WING_STATIONS` sets out the grid; this is the assertion it
 * feeds.
 *
 * It is its own file rather than a describe inside `football-exploits.test.ts`
 * because it is sixty stations and eight re-measures at 150 matched pairs a
 * rung, and Vitest gives a file one worker however many cores are free. It also
 * leaves the goal-mix sweep behind, which it never read.
 */
import { describe, it, expect } from 'vitest';
import {
  POLICIES,
  winger,
  WING_DEPTH,
  WING_LATERAL,
  WING_STATIONS
} from './football-policies';
import {
  DIFFICULTIES,
  keyed,
  ladderDiff,
  ladderPaired,
  ladderSe,
  pairedAgainst,
  pairedLine,
  playMatch
} from './football-paired';

/** Matched pairs per difficulty in the re-measure. */
const PAIRS = 150;

/**
 * The ceiling a policy comparison has to clear to be called a win for the
 * exploit, and it is the same 0.4 ladder points the camp sweep already uses:
 * two standard errors of a ladder sum at this many pairs is about 0.2, so a
 * routine worth even a fifth of what the audit measured fails it.
 */
const LADDER_CEILING = 0.4;

/** Both flanks, always: a routine that only works down one has not been beaten. */
const FLANKS = [-1, 1] as const;
/** Matched pairs per wing station per difficulty in the scan, as for the camps. */
const WING_SCAN_PAIRS = 16;
/** How many of the scan's best stations per flank are re-measured properly. */
const WING_FINALISTS = 3;

describe('the wing cross is answerable', () => {
  /**
   * The audit's first finding, and the headline one: a fixed routine — carry
   * to `CENTRE_X +- 130`, 55 px off the goal line, cross to the most advanced
   * teammate, head every dropping ball — beat `expert` at **every** difficulty
   * by +0.177 to +0.285 points a match at t = 8.9 to 10.8, and was champion in
   * 94.0 % of runs against the expert's 78.2 %.
   *
   * It does that while steering at 0.17 s, the `competent` player's reaction
   * and nearly three times slower than the expert's 0.066 s, so none of the
   * margin is an input artefact. Both wings are measured, because a routine
   * that only works down one flank has still not been beaten.
   */
  /**
   * The sixty stations, scanned cheaply, and the strongest re-measured
   * properly against both scripted humans. `WING_STATIONS` sets out why the
   * grid exists at all; this is the assertion it feeds.
   *
   * The pinned station is kept in the finalist set unconditionally rather than
   * having to earn its place, so that its own number is always on the record
   * beside the winner's. That is the whole diagnosis of this round in one
   * line: at `(130, 55)` the routine is -0.053 against `competent` and the
   * suite was right about it, and 25 px shallower it is +0.740, which the
   * suite could not see because it never asked.
   *
   * Measured on the build this test was written against, at
   * `WING_SCAN_PAIRS` = 16 for the scan and `PAIRS` = 150 for the re-measure:
   *
   *   wing -1 (90, 30)   +0.740 +- 0.130 vs competent, +0.420 +- 0.113 vs expert
   *   wing +1 (145, 40)  +0.667 +- 0.129 vs competent, +0.347 +- 0.117 vs expert
   *   wing +1 (120, 30)  +0.353 +- 0.133 vs competent, +0.033 +- 0.126 vs expert
   *   wing +1 (130, 55)  -0.053 +- 0.148 vs competent, -0.373 +- 0.136 vs expert
   *
   * Both flanks are swept, because a routine that only works down one flank
   * has still not been beaten, and both opponents are measured, because
   * beating a competent player and beating an expert are different claims and
   * the audit made the second one.
   */
  it('has no station on either flank that out-points a scripted human', { timeout: 2700000 }, () => {
    const scan = FLANKS.flatMap(wing =>
      WING_STATIONS.map(([lateral, depth]) => ({
        wing,
        lateral,
        depth,
        diff: ladderDiff(
          DIFFICULTIES.map(d =>
            pairedAgainst(() => winger(wing, lateral, depth), 'competent', d, WING_SCAN_PAIRS)
          )
        )
      }))
    );
    // Finalists per flank, so a strong left-wing station cannot crowd the
    // right wing out of the re-measure — the same reasoning the camp sweep
    // uses to take its finalists per aim.
    const finalists = FLANKS.flatMap(wing =>
      scan
        .filter(s => s.wing === wing)
        .sort((a, b) => b.diff - a.diff)
        .slice(0, WING_FINALISTS)
    );
    // ...plus the station this file used to pin, always, so the round's
    // diagnosis stays legible in the output.
    for (const wing of FLANKS) {
      if (!finalists.some(f => f.wing === wing && f.lateral === WING_LATERAL && f.depth === WING_DEPTH)) {
        finalists.push({ wing, lateral: WING_LATERAL, depth: WING_DEPTH, diff: NaN });
      }
    }

    const beaten: string[] = [];
    for (const station of finalists) {
      // Keyed, so the station's own six hundred matches are played once and
      // shared by both opponents rather than replayed for the second.
      const routine = keyed(`winger|${station.wing}|${station.lateral}|${station.depth}`, () =>
        winger(station.wing, station.lateral, station.depth)
      );
      for (const opponent of ['competent', 'expert'] as const) {
        const rows = ladderPaired(routine, opponent, PAIRS);
        const diff = ladderDiff(rows);
        if (diff < LADDER_CEILING) continue;
        beaten.push(
          `winger w${station.lateral} d${station.depth} on wing ${station.wing} vs ${opponent} ` +
            `= ${diff.toFixed(3)} +- ${ladderSe(rows).toFixed(3)} ladder points | ${pairedLine(rows)}`
        );
      }
    }
    expect(
      beaten,
      `wing stations that out-point a scripted human:\n  ${beaten.join('\n  ')}`
    ).toEqual([]);
  });

  /**
   * A guard on the fixture, and the lesson of the crossing verb that was
   * "healthy" in the suite for three rounds while the scripted player played
   * zero lofted balls a match: a routine that is not doing the thing it is
   * named after measures like a bad dribbler and proves nothing about
   * crossing. This asserts the winger really crosses and really heads before
   * any of the assertions above are believed.
   */
  it('really is crossing and heading', () => {
    const m = playMatch(POLICIES.winger(), 0.45, 12345).match;
    expect(m.stats.passes[0] - m.stats.groundPasses[0], 'lofted balls played').toBeGreaterThan(0);
    const headers = m.goals.filter(g => g.side === 0 && g.contact !== 'ground').length;
    expect(headers + m.stats.shots[0], 'contacts made in the box').toBeGreaterThan(0);
  });
});
