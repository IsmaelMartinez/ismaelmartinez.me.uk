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
 * The air-goals gate at the bottom of this file is per flank for the same
 * reason, and shares the ladder scan's matches through the same memo.
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
  tailOf,
  type Contender,
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
 * 7.2's double-figure anti-goal as a rate over the flank's own scan.
 *
 * Named for the flank rather than plainly, because this is the third place in
 * the football suites to state the same anti-goal and the three are not
 * interchangeable. The **odds** are deliberately one number everywhere — 7.2
 * makes one claim about the game — and `football-exploits.test.ts` owns it; if
 * this and that ever disagree, that file is right. The **budget** is a property
 * of the sample and differs at each site: 9 over `football-balance.test.ts`'s
 * 4,800 pooled matches, 10 over `football-exploits.test.ts`'s 6,000, and 6 over
 * a flank's 1,920. Reading a plain `DOUBLE_FIGURE_BUDGET` at a call site and
 * assuming it is the one next door is exactly the confusion the prefix removes.
 * The arithmetic behind this one is at `flankTail`.
 */
export const FLANK_DOUBLE_FIGURE_ODDS = 2000;
export const FLANK_DOUBLE_FIGURE_BUDGET = 6;

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
 * One station's policy, with the memo key that lets its matches be played once
 * and read by every sweep on this flank.
 *
 * The key is built here rather than at each call site because `keyed`'s own
 * warning is that two policies given one key are one policy as far as the cache
 * is concerned, and this file now asks for the same station from three places.
 */
function stationPolicy(wing: -1 | 1, lateral: number, depth: number): Contender {
  return keyed(`winger|${wing}|${lateral}|${depth}`, () => winger(wing, lateral, depth));
}

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
      pairedAgainst(stationPolicy(wing, lateral, depth), 'competent', d, WING_SCAN_PAIRS)
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
    const routine = stationPolicy(wing, station.lateral, station.depth);
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
const sweeps = new Map<-1 | 1, FlankSweep>();

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

/* ------------------------------------------------------------------ */
/* 7.4's air-goals ceiling, on a station the scan chose                 */

/**
 * 7.4's ceiling on what a purely aerial routine may score out of the air, per
 * difficulty rung.
 *
 * Stated here rather than imported for the reason `FLANK_DOUBLE_FIGURE_ODDS`
 * gives above: `football-exploits.test.ts` owns this row, it is one claim about
 * the game rather than one per suite, and if the two ever disagree that file is
 * right. What it is and why it is 7.2's goals-a-match row with six tenths on
 * top, including the measurement showing that the only lever that moves it is a
 * cliff rather than a dial, is written out at its `AIR_GOALS_CEILING`.
 */
const FLANK_AIR_CEILING = [4.0, 3.6, 3.4, 3.0];

/**
 * The rung the ceiling actually binds at, which is why the scan below walks one
 * of the four rather than all of them.
 *
 * The cap is per rung and the routine is not equally dangerous at all of them.
 * Measured at 300 matches a cell on the hottest station either flank has,
 * `(-1, 90, 30)` reads 3.50 / 2.03 / 1.48 / 1.50 against 4.0 / 3.6 / 3.4 / 3.0,
 * so it stands half a goal under its ceiling at d = 0.25 and a goal and a half
 * under at every other rung. Deep-scanning thirty stations costs matches, and
 * spending them on three rungs that are a goal and a half clear buys nothing
 * this flank can fail on. The other three rungs are still gated, on the
 * catalogue, by `football-exploits.test.ts`; what they are not is gated on the
 * grid, and that is a budget decision rather than a claim that they cannot move.
 */
const AIR_RUNG = 0;

/**
 * Matches per station in the air scan, and the number this whole test turns on.
 *
 * The ladder scan above ranks stations off `WING_SCAN_PAIRS` = 16 matches, and
 * it can, because a paired comparison cancels the seed: both halves of a pair
 * play the same seeded run of the ball, so what is left is the policy. An
 * air-goal *rate* has no second half to cancel against, and 16 matches of it are
 * nowhere near enough to rank a flank. Measured on the left flank's hottest
 * station over eight disjoint blocks of 16, the rate reads 1.50, 3.63, 4.50,
 * 3.50, 3.94, 4.50, 2.06 and 4.13 against a true 3.5 taken at 1,200 matches: a
 * block standard deviation of 1.11 on a field whose top few stations sit within
 * half a goal of each other.
 *
 * On this build that is not a hypothetical. The ladder scan's own sixteen seeds
 * score that station 1.50, fifteenth of the flank's thirty at this rung, so a
 * nomination made off those matches promotes `(120, 50)`, `(105, 30)` and
 * `(90, 40)`, which confirm at 2.78, 2.66 and 2.40, and never looks at the
 * station that confirms at 3.39. That is a weaker cell than the pinned station
 * the grid was supposed to replace, which is a loss of coverage dressed up as a
 * gain, and it is the failure this constant exists to avoid.
 *
 * The same eight-block measurement at deeper samples gives 0.65 at 32, 0.27 at
 * 64, 0.19 at 150 and 0.13 at 300. 64 is where the scan's spread drops below the
 * gap between the flank's best station and its third best, which is all the
 * ranking has to resolve, and at 64 the nomination does pick that station first.
 * 16 of those 64 matches are the ladder scan's own and come out of the cache, so
 * the scan costs 48 new matches a station.
 */
const AIR_SCAN = 64;

/**
 * How many of the scan's hottest stations are re-measured against the ceiling.
 * Exported so each flank's test can check the sample really is the shape the
 * arithmetic above assumed rather than trusting it.
 */
export const AIR_FINALISTS = 3;

/**
 * Matches per nominated station in the confirm, and the seed the confirm starts
 * from.
 *
 * 300 is `football-exploits.test.ts`'s own depth for this same claim, and at the
 * block spread above it puts a standard deviation of 0.13 on the rate, so the
 * hottest station either flank has sits six tenths of a goal under the ceiling,
 * which is four and a half of them. That is the split the keeper rig's census
 * already uses at `CENSUS_SCAN` and `CENSUS_SEEDS`, for the reason it gives
 * there, and it is the whole point of running two stages: the scan ranks, and it
 * is allowed to be noisy because being ranked third rather than first changes
 * nothing; the confirm decides, and it is the only number the ceiling ever sees.
 *
 * The seed is far enough from the scan's that the two samples share no match.
 * The scan reaches seed 498,898 and the confirm runs from 3,000,001, so the
 * confirm is a fresh sample of the station rather than a longer look at the
 * matches that nominated it, and the winner's curse in the nomination cannot
 * follow it through.
 */
const AIR_CONFIRM = 300;
const AIR_CONFIRM_SEED0 = 3000001;

export interface AirVerdict {
  /** One line per nominated station: what it scanned, and what it confirmed. */
  measured: string[];
  /** The subset of those over the ceiling, which is the assertion. */
  over: string[];
}

/**
 * 7.4's air-goals ceiling, measured against the station this flank's own scan
 * picked out (issue #273, finding 4, the half PR #313 left open).
 *
 * The cap had one home, `football-exploits.test.ts`, where it is read off the
 * two stations in `WING_REPS`. Those two are good stations, and the scan here
 * re-elects the left one, but "a human pinned the strongest station he could
 * find in 2026-08" is a claim with a shelf life: it was false the last time it
 * was made, when the catalogue winger stood on the station the grid ranks
 * fifty-third of sixty, and nothing about pinning stops it going stale again.
 * The grid is the thing that does not go stale, so the cap is measured off the
 * grid. On the right flank it already matters: the scan's winner is `(120, 30)`
 * and confirms a quarter of a goal hotter than the pinned `(130, 30)` beside it.
 *
 * The scan's matches are deliberately **not** pooled into `flankTail`. The
 * double-figure budget above is sized on exactly 1,920 matches a flank and its
 * Poisson arithmetic is written down at that number; folding another 2,340 in
 * would move the expected count without moving the budget, which is how a bound
 * quietly becomes a different bound.
 *
 * Measured on the build this was written against, as scanned over `AIR_SCAN` =
 * 64 and then confirmed over `AIR_CONFIRM` = 300, against a 4.0 ceiling:
 *
 *   wing -1 (90, 30)    3.44 -> 3.39     wing +1 (120, 30)  2.91 -> 3.26
 *   wing -1 (105, 30)   2.83 -> 2.66     wing +1 (130, 30)  2.55 -> 3.02
 *   wing -1 (120, 50)   2.64 -> 2.78     wing +1 (130, 40)  2.23 -> 2.34
 *
 * Both flanks pass, and the hottest cell passes with 15 % of headroom rather
 * than comfortably. That is the same tightness the catalogue test already runs
 * at on the same station, so it is not a new risk; it is the old risk, now
 * measured on a station the grid chose.
 */
export function airGoalsOverCeiling(wing: -1 | 1): AirVerdict {
  const difficulty = DIFFICULTIES[AIR_RUNG];
  const ceiling = FLANK_AIR_CEILING[AIR_RUNG];
  const scanned = WING_STATIONS.map(([lateral, depth]) => {
    const seen = tailOf(stationPolicy(wing, lateral, depth), difficulty, AIR_SCAN);
    return { lateral, depth, rate: seen.air / seen.matches };
  });
  const nominees = scanned.slice().sort((a, b) => b.rate - a.rate).slice(0, AIR_FINALISTS);

  const measured: string[] = [];
  const over: string[] = [];
  for (const station of nominees) {
    const seen = tailOf(
      stationPolicy(wing, station.lateral, station.depth),
      difficulty,
      AIR_CONFIRM,
      AIR_CONFIRM_SEED0
    );
    const rate = seen.air / seen.matches;
    const line =
      `winger w${station.lateral} d${station.depth} on wing ${wing} at d=${difficulty}: ` +
      `scanned ${station.rate.toFixed(2)} over ${AIR_SCAN} matches, confirmed ${rate.toFixed(2)} ` +
      `over ${seen.matches} against a ${ceiling.toFixed(1)} ceiling`;
    measured.push(line);
    if (rate > ceiling) over.push(line);
  }
  return { measured, over };
}
