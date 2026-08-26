/**
 * The wing-cross sweep down the left flank. The sweep, and why it is a file per
 * flank, are documented in `football-wing-sweep.ts`; the right flank is
 * `football-wing-right.test.ts`, and the guard that the routine really is
 * crossing and heading rides with it rather than being asserted twice.
 */
import { describe, it, expect } from 'vitest';
import {
  flankTail,
  stationsOutPointingAHuman,
  DOUBLE_FIGURE_BUDGET,
  DOUBLE_FIGURE_ODDS
} from './football-wing-sweep';

describe('the wing cross is answerable', () => {
  it('has no station on the left flank that out-points a scripted human', { timeout: 2700000 }, () => {
    const beaten = stationsOutPointingAHuman(-1);
    expect(
      beaten,
      `left-flank wing stations that out-point a scripted human:\n  ${beaten.join('\n  ')}`
    ).toEqual([]);
  });

  /**
   * 7.2's double-figure anti-goal, measured against the grid the sweep above
   * explores rather than against a catalogue (issue #273, finding 4). The
   * budget's arithmetic, and what 1,920 seeded matches per flank can and cannot
   * resolve, are at `flankTail`.
   */
  it('keeps a double-figure scoreline rare across every left-flank station', { timeout: 2700000 }, () => {
    const tail = flankTail(-1);
    expect(tail.matches, 'scanned sample').toBeGreaterThan(0);
    expect(
      tail.doubleFigures,
      `${tail.doubleFigures} of ${tail.matches} scanned left-flank matches in double figures ` +
        `against a budget of ${DOUBLE_FIGURE_BUDGET} for a claimed 1 in ${DOUBLE_FIGURE_ODDS}; ` +
        `biggest scoreline ${tail.biggest}`
    ).toBeLessThanOrEqual(DOUBLE_FIGURE_BUDGET);
  });
});
