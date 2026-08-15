/**
 * The wing-cross sweep down the right flank. The sweep, and why it is a file per
 * flank, are documented in `football-wing-sweep.ts`; the left flank is
 * `football-wing-left.test.ts`.
 */
import { describe, it, expect } from 'vitest';
import { POLICIES } from './football-policies';
import { playMatch } from './football-paired';
import { stationsOutPointingAHuman } from './football-wing-sweep';

describe('the wing cross is answerable', () => {
  it('has no station on the right flank that out-points a scripted human', { timeout: 2700000 }, () => {
    const beaten = stationsOutPointingAHuman(1);
    expect(
      beaten,
      `right-flank wing stations that out-point a scripted human:\n  ${beaten.join('\n  ')}`
    ).toEqual([]);
  });

  /**
   * A guard on the fixture, and the lesson of the crossing verb that was
   * "healthy" in the suite for three rounds while the scripted player played
   * zero lofted balls a match: a routine that is not doing the thing it is
   * named after measures like a bad dribbler and proves nothing about crossing.
   * This asserts the winger really crosses and really heads before any of the
   * sweeps above are believed. It is asserted once rather than once per flank
   * because `POLICIES.winger` is one fixed station, not a flank.
   */
  it('really is crossing and heading', () => {
    const m = playMatch(POLICIES.winger(), 0.45, 12345).match;
    expect(m.stats.passes[0] - m.stats.groundPasses[0], 'lofted balls played').toBeGreaterThan(0);
    const headers = m.goals.filter(g => g.side === 0 && g.contact !== 'ground').length;
    expect(headers + m.stats.shots[0], 'contacts made in the box').toBeGreaterThan(0);
  });
});
