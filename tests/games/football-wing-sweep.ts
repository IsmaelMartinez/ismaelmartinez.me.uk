/**
 * The wing-cross sweep, one flank at a time.
 *
 * The audit's first finding, and the headline one: a fixed routine — carry to
 * `CENTRE_X +- 130`, 55 px off the goal line, cross to the most advanced
 * teammate, head every dropping ball — beat `expert` at **every** difficulty by
 * +0.177 to +0.285 points a match at t = 8.9 to 10.8, and was champion in
 * 94.0 % of runs against the expert's 78.2 %. It does that while steering at
 * 0.17 s, the `competent` player's reaction and nearly three times slower than
 * the expert's 0.066 s, so none of the margin is an input artefact.
 *
 * **Both flanks are swept, because a routine that only works down one flank has
 * still not been beaten.** They are swept in a file each — see
 * `football-wing-left.test.ts` and `football-wing-right.test.ts` — and the split
 * is exact rather than a sample: the scan already ranked its finalists per
 * flank, and the pinned station was already added per flank, so a flank's
 * thirty stations, its three finalists and its two re-measures never depended on
 * anything the other flank did. What the split buys is a worker each. Together
 * they were the most expensive assertion in the repo at eight minutes of CI on
 * their own, and Vitest gives a file one worker however many cores are free.
 */
import { winger, WING_DEPTH, WING_LATERAL, WING_STATIONS } from './football-policies';
import {
  DIFFICULTIES,
  keyed,
  ladderDiff,
  ladderPaired,
  ladderSe,
  pairedAgainst,
  pairedLine
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

/** Matched pairs per wing station per difficulty in the scan, as for the camps. */
const WING_SCAN_PAIRS = 16;
/** How many of the scan's best stations on this flank are re-measured properly. */
const WING_FINALISTS = 3;

/**
 * The thirty stations of one flank, scanned cheaply, with the strongest
 * re-measured properly against both scripted humans. Returns the ones that
 * out-point a human, so the assertion is an empty array and every failure is
 * reported together with its number.
 *
 * The pinned station is kept in the finalist set unconditionally rather than
 * having to earn its place, so that its own number is always on the record
 * beside the winner's. That is the whole diagnosis of the round in one line: at
 * `(130, 55)` the routine is -0.053 against `competent` and the suite was right
 * about it, and 25 px shallower it is +0.740, which the suite could not see
 * because it never asked.
 *
 * Measured on the build this test was written against, at `WING_SCAN_PAIRS` =
 * 16 for the scan and `PAIRS` = 150 for the re-measure:
 *
 *   wing -1 (90, 30)   +0.740 +- 0.130 vs competent, +0.420 +- 0.113 vs expert
 *   wing +1 (145, 40)  +0.667 +- 0.129 vs competent, +0.347 +- 0.117 vs expert
 *   wing +1 (120, 30)  +0.353 +- 0.133 vs competent, +0.033 +- 0.126 vs expert
 *   wing +1 (130, 55)  -0.053 +- 0.148 vs competent, -0.373 +- 0.136 vs expert
 *
 * Both opponents are measured, because beating a competent player and beating
 * an expert are different claims and the audit made the second one.
 */
export function stationsOutPointingAHuman(wing: -1 | 1): string[] {
  const scan = WING_STATIONS.map(([lateral, depth]) => ({
    lateral,
    depth,
    diff: ladderDiff(
      DIFFICULTIES.map(d =>
        pairedAgainst(() => winger(wing, lateral, depth), 'competent', d, WING_SCAN_PAIRS)
      )
    )
  }));
  const finalists = scan.slice().sort((a, b) => b.diff - a.diff).slice(0, WING_FINALISTS);
  // ...plus the station this suite used to pin, always, so the round's
  // diagnosis stays legible in the output.
  if (!finalists.some(f => f.lateral === WING_LATERAL && f.depth === WING_DEPTH)) {
    finalists.push({ lateral: WING_LATERAL, depth: WING_DEPTH, diff: NaN });
  }

  const beaten: string[] = [];
  for (const station of finalists) {
    // Keyed, so the station's own six hundred matches are played once and
    // shared by both opponents rather than replayed for the second.
    const routine = keyed(`winger|${wing}|${station.lateral}|${station.depth}`, () =>
      winger(wing, station.lateral, station.depth)
    );
    for (const opponent of ['competent', 'expert'] as const) {
      const rows = ladderPaired(routine, opponent, PAIRS);
      const diff = ladderDiff(rows);
      if (diff < LADDER_CEILING) continue;
      beaten.push(
        `winger w${station.lateral} d${station.depth} on wing ${wing} vs ${opponent} ` +
          `= ${diff.toFixed(3)} +- ${ladderSe(rows).toFixed(3)} ladder points | ${pairedLine(rows)}`
      );
    }
  }
  return beaten;
}
