/**
 * The wing-cross sweep down the left flank. The sweep, and why it is a file per
 * flank, are documented in `football-wing-sweep.ts`; the right flank is
 * `football-wing-right.test.ts`, and the guard that the routine really is
 * crossing and heading rides with it rather than being asserted twice.
 */
import { describe, it, expect } from 'vitest';
import { stationsOutPointingAHuman } from './football-wing-sweep';

describe('the wing cross is answerable', () => {
  it('has no station on the left flank that out-points a scripted human', { timeout: 2700000 }, () => {
    const beaten = stationsOutPointingAHuman(-1);
    expect(
      beaten,
      `left-flank wing stations that out-point a scripted human:\n  ${beaten.join('\n  ')}`
    ).toEqual([]);
  });
});
