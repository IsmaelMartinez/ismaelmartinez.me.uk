/**
 * No fixed spot on the pitch may be the answer. The sweep itself is documented
 * on the assertion below; what is worth saying here is only why it has a file
 * to itself: it is one of the two most expensive assertions in the repo, and
 * Vitest gives a file one worker however many cores are free, so leaving it
 * inside `football-balance.test.ts` ran it on the same core as the rest of the
 * gate. Nothing about the sweep moved with it.
 */
import { describe, it, expect } from 'vitest';
import { camper, CAMP_AIMS, CAMP_SPOTS, type CampAim } from './football-policies';
import {
  DIFFICULTIES,
  ladderDiff,
  ladderSe,
  pairedAgainst,
  pairedLine
} from './football-paired';

/** Matched pairs per spot per difficulty in the scan, and in the re-measure. */
const CAMP_SCAN_PAIRS = 16;
const CAMP_PAIRS = 80;
/** How many of the scan's best spots are re-measured properly. */
const CAMP_FINALISTS = 3;

/**
 * The camp sweep, and the direct regression for the strongest thing any audit
 * has measured in this cabinet.
 *
 * "Carry the ball to the corner of the penalty box and shoot across goal",
 * steering at the same 170 ms reaction as `competent`, scored 6.615-6.804
 * ladder points against the expert's 5.897 and the competent player's 4.807.
 * It won 94.1 % of matches at d = 0.25, qualified from the group in 99.8 % of
 * runs and was champion in 43.8-48.3 % of them. That is not a strategy, it is
 * a hole in the geometry in front of goal, and the reason it existed is that
 * the keeper tracked the ball's lateral coordinate: from a wide position he
 * stood where the ball was and the far side of the goal was open by
 * construction.
 *
 * **The spot is not the bug.** Patching the corner of the box would have moved
 * the exploit rather than removed it, and this suite has watched it move: with
 * the keeper put on the angle, the best fixed spot jumped to the top of the
 * six-yard box (a keeper who comes out cannot smother a carrier one pixel
 * outside his own box, which is why he now smothers inside the penalty area),
 * and when that closed it jumped again to the edge of the D. So the assertion
 * is over the whole attacking third: forty-five fixed positions, scanned
 * cheaply, and the three that come nearest re-measured against `competent` on
 * matched pairs. None of them may out-point him.
 *
 * **And over both aims, which it was not.** The sweep had exactly one blind
 * spot and it was a fatal one: `camper` hard-coded the across-goal shot, so
 * every one of the forty-five spots was measured with the shot the previous
 * round had just fixed and not one of them with the near-post shot from the
 * same place. A fourth audit found the near-post aim beating `competent` at
 * every difficulty from spots this test had already certified — the sweep was
 * as wide as it looked and half as deep. Ninety cells now, not forty-five, and
 * the finalists are taken per aim so a strong spot on one aim cannot crowd the
 * other out of the re-measure.
 */
describe('no fixed camp position beats playing football', () => {
  it('sweeps the attacking third at both aims and finds nothing better than a competent player', { timeout: 1800000 }, () => {
    const scan = CAMP_AIMS.flatMap((aim: CampAim) =>
      CAMP_SPOTS.map(([x, depth]) => ({
        x,
        depth,
        aim,
        diff: ladderDiff(
          DIFFICULTIES.map(d =>
            pairedAgainst(() => camper(x, depth, aim), 'competent', d, CAMP_SCAN_PAIRS)
          )
        )
      }))
    );
    const finalists = CAMP_AIMS.flatMap((aim: CampAim) =>
      scan
        .filter(s => s.aim === aim)
        .sort((a, b) => b.diff - a.diff)
        .slice(0, CAMP_FINALISTS)
    );
    // Every finalist is re-measured and every failure reported together rather
    // than the assertion stopping at the first. Which *aims* beat a competent
    // player, and from where, is the whole content of the finding: an exploit
    // that has now moved four times is not diagnosed by one spot's number.
    const beat: string[] = [];
    for (const spot of finalists) {
      const rows = DIFFICULTIES.map(d =>
        pairedAgainst(() => camper(spot.x, spot.depth, spot.aim), 'competent', d, CAMP_PAIRS)
      );
      const diff = ladderDiff(rows);
      // Two standard errors of the ladder sum at `CAMP_PAIRS` pairs is about
      // 0.25, so the bound is a real one rather than an allowance: a camp spot
      // worth even a third of the audit's +1.8 would fail it.
      if (diff < 0.4) continue;
      beat.push(
        `camp (${spot.x}, ${spot.depth}) aiming ${spot.aim} = ${diff.toFixed(3)} ` +
          `+- ${ladderSe(rows).toFixed(3)} ladder points | ${pairedLine(rows)}`
      );
    }
    expect(beat, `camp spots that beat a competent player:\n  ${beat.join('\n  ')}`).toEqual([]);
  });
});
