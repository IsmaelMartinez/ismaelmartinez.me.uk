/**
 * The wing-cross sweep down the right flank. The sweep, and why it is a file per
 * flank, are documented in `football-wing-sweep.ts`; the left flank is
 * `football-wing-left.test.ts`.
 */
import { describe, it, expect } from 'vitest';
import { HEADER_AIMS, POLICIES, WING_REPS, winger } from './football-policies';
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

  /**
   * And a guard on the axis the routine spent five rounds without.
   *
   * The header aim was `const away = keeper.x <= CENTRE_X ? 1 : -1`, a constant
   * of the policy, so every sweep above measured one shot and reported it as
   * the wing. It is `HeaderAim` now, and this is what stops it quietly becoming
   * a constant again: a hard-coded aim collapses all four values onto one
   * number, and the spread between the best and the worst of them is nearly
   * three goals a match. Measured at 60 matches a cell on the build this was
   * written against: near 4.00, away 3.35, centre 1.92, far 1.13.
   *
   * The four rates themselves are held to nothing here. What the aim is worth
   * is the sweeps' business, and `HeaderAim` records both the numbers and why
   * this axis is not yet one of the gated ones.
   */
  it('honours the header aim rather than fixing it', { timeout: 120000 }, () => {
    const [wing, lateral, depth] = WING_REPS[0];
    const rates = HEADER_AIMS.map(aim => {
      let air = 0;
      for (let i = 0; i < 60; i++) {
        const m = playMatch(winger(wing, lateral, depth, aim), 0.25, 1 + i * 7919).match;
        for (const g of m.goals) {
          if (g.side === 0 && !g.dribbled && (g.fromCross || g.contact !== 'ground')) air++;
        }
      }
      return air / 60;
    });
    const label = HEADER_AIMS.map((a, i) => `${a} ${rates[i].toFixed(2)}`).join(', ');
    expect(Math.max(...rates) - Math.min(...rates), `air goals a match by aim: ${label}`)
      .toBeGreaterThan(1);
  });
});
