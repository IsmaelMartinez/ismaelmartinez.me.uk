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
  addTail,
  emptyTail,
  DIFFICULTIES,
  keyed,
  ladderDiff,
  ladderPaired,
  ladderSe,
  pairedAgainst,
  pairedLine,
  type Tail
} from './football-paired';

/** Matched pairs per difficulty in the re-measure. */
const PAIRS = 150;

interface FlankSweep {
  /** Stations that out-point a scripted human, with their numbers. */
  beaten: string[];
  /** Every scoreline the scan played, pooled; see `flankTail`. */
  tail: Tail;
}

/**
 * 7.2's double-figure anti-goal as a rate over the flank's own scan. The odds
 * are the ones `football-exploits.test.ts` owns; the budget's arithmetic is at
 * `flankTail`.
 */
export const DOUBLE_FIGURE_ODDS = 2000;
export const DOUBLE_FIGURE_BUDGET = 6;

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
 * re-measured properly against both scripted humans. It answers two things off
 * the one set of matches: the stations that out-point a human, so that
 * assertion is an empty array and every failure is reported together with its
 * number, and the scoreline tail of the whole scanned grid — see `flankTail`.
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
function sweep(wing: -1 | 1): FlankSweep {
  let tail = emptyTail();
  const scan = WING_STATIONS.map(([lateral, depth]) => {
    const rungs = DIFFICULTIES.map(d =>
      pairedAgainst(
        keyed(`winger|${wing}|${lateral}|${depth}`, () => winger(wing, lateral, depth)),
        'competent',
        d,
        WING_SCAN_PAIRS
      )
    );
    // The station's own scorelines, which the scan has already played and used
    // to be throwing away. See `Tail` and `flankTail` below.
    for (const rung of rungs) tail = addTail(tail, rung.tail);
    return { lateral, depth, diff: ladderDiff(rungs) };
  });
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
  return { beaten, tail };
}

/**
 * One sweep per flank, memoised, because the flank's two contracts are read off
 * the same thirty stations and playing them twice would double the most
 * expensive assertion in the repo.
 */
const sweeps = new Map<number, FlankSweep>();

function flankSweep(wing: -1 | 1): FlankSweep {
  const hit = sweeps.get(wing);
  if (hit) return hit;
  const fresh = sweep(wing);
  sweeps.set(wing, fresh);
  return fresh;
}

export function stationsOutPointingAHuman(wing: -1 | 1): string[] {
  return flankSweep(wing).beaten;
}

/**
 * The flank's scoreline tail, pooled over the **scanned grid** rather than over
 * a pinned station.
 *
 * Issue #273's finding 4: 7.2's double-figure cap is measured in two places and
 * both of them ask a catalogue rather than a grid. `football-balance.test.ts`
 * pools four named policies; `football-exploits.test.ts` pools a five-entry
 * `MIXED` whose only wing members are the two hard-coded `WING_REPS`. The audit
 * that filed the issue found four offending stations at 1 in 150 matches apiece
 * and **not one of them was a catalogued policy** — worse, two of the four carry
 * negative ladder margins, so no finalist selection made on points would ever
 * promote them into the catalogue either.
 *
 * The fix is to stop selecting at all for this cap. The scan already plays every
 * station on the flank, so the tail is pooled over all thirty of them and costs
 * nothing beyond one integer per match: 30 stations x 4 rungs x
 * `WING_SCAN_PAIRS` = 1,920 seeded matches per flank, against 300 for one
 * catalogued station at one rung.
 *
 * What that buys and what it does not. The claim is the same one both other
 * files make — a double-figure scoreline stays rarer than one match in
 * `DOUBLE_FIGURE_ODDS` — so a flank sitting exactly on the cap expects
 * `lambda` = 1920 / 2000 = 0.96 of them, counts of a rare event over a fixed
 * sample are Poisson to well inside the precision that matters, and
 * P(X > 6 | lambda = 0.96) = 0.021 %, so `DOUBLE_FIGURE_BUDGET` = 6 fails a
 * build that is exactly on the cap about once in five thousand runs. At 64
 * matches per station the sample cannot resolve a *single* station at 1 in 150 —
 * that is 0.4 expected — but four such stations are 1.7, and the audit found
 * four. What it can no longer do is miss them because they were not in a list.
 */
export function flankTail(wing: -1 | 1): Tail {
  return flankSweep(wing).tail;
}
