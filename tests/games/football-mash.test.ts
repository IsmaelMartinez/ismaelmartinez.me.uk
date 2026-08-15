/**
 * Skill has to beat mashing — the dominant strategy the old suite never made an
 * assertion about, swept cadence by cadence.
 *
 * An independent audit of the previous build found that it did not: "run at the
 * ball and press A on a fixed cycle" won 84.5 % / 84.5 % / 76.0 % / 71.5 %
 * across the ladder at 2.85 goals a match, beat `competent` at every difficulty
 * and `expert` at three of four, and held up at every cadence tested — and none
 * of it was visible, because nothing in the suite ever put a masher on the
 * pitch.
 *
 * These assertions are comparative on purpose. Absolute win rates move with
 * every tuning pass; the *ordering* is the design commitment, and it is the one
 * thing a balance suite for an arcade cabinet has to hold.
 *
 * It is its own file rather than a describe inside `football-balance.test.ts`
 * because it is fifty-one cadences at four difficulties and Vitest parallelises
 * across files, not within one. The `competent` and `expert` cells it compares
 * against are swept here as well as there; two thousand four hundred duplicated
 * matches is the price of the two files running side by side, and it is a tenth
 * of what the split saves.
 */
import { describe, it, expect } from 'vitest';
import { masher, MASH_CADENCES } from './football-policies';
import { DIFFICULTIES } from './football-paired';
import {
  MASH_MATCHES,
  ladderGoals,
  ladderOnTarget,
  ladderPoints,
  sweep,
  sweepWith
} from './football-cells';

const competent = DIFFICULTIES.map(d => sweep('competent', d));
const expert = DIFFICULTIES.map(d => sweep('expert', d));
const mashers = MASH_CADENCES.map(([period, hold]) => ({
  label: `${period}/${hold}`,
  cells: DIFFICULTIES.map(d => sweepWith(() => masher(period, hold), d, MASH_MATCHES))
}));

describe('skill beats mashing, at the same reaction', () => {
  const compPoints = ladderPoints(competent);
  const expPoints = ladderPoints(expert);

  /**
   * **The claim is "at the same reaction", and it is stated in the describe
   * name because it is not true without that clause.**
   *
   * Every cadence swept below steers on the same 170 ms decision latency the
   * `competent` policy uses (`MASH_REACTION`). Give the masher a *zero*
   * latency instead — re-aiming his run every single frame — and four of the
   * fifty-one cadences out-point the competent player. That is the honest
   * comparison and it is what the assertion below pins: an opponent who reacts
   * instantly beats one who reacts in 170 ms, at any cadence, which is a
   * statement about reflexes and not about the cabinet. No human holds a
   * controller like that, and nothing in the design can or should stop a
   * hypothetical one who does.
   *
   * What the design does have to stop is a *human* out-playing a human by
   * hammering a button, and that is the equal-latency sweep. The two claims
   * are different and the file used to make only the first while implying the
   * second.
   */
  const ZERO_LATENCY_CADENCES: Array<[number, number]> = [
    [5, 1],
    [9, 4],
    [21, 10],
    [40, 20],
    [66, 33],
    [120, 33]
  ];

  it('leaves every mash cadence behind a competent player', () => {
    // The whole sweep, cadence by cadence, on the tournament's own currency.
    // A previous round of this asserted three cadences — 8, 21 and 40 ticks —
    // and passed while a 66-tick cadence, the first period with room for the
    // full 0.55 s charge, was still winning 0.80 / 0.66 / 0.53 / 0.54 across
    // the ladder and out-scoring the competent player. Testing the cadences
    // someone happened to think of is how that survived.
    for (const { label, cells } of mashers) {
      const pts = ladderPoints(cells);
      expect(
        pts,
        `mash ${label} points ${pts.toFixed(3)} vs competent ${compPoints.toFixed(3)}`
      ).toBeLessThan(compPoints);
      expect(
        pts,
        `mash ${label} points ${pts.toFixed(3)} vs expert ${expPoints.toFixed(3)}`
      ).toBeLessThan(expPoints);
    }
  });

  it('leaves every mash cadence behind at every single difficulty too', () => {
    // The aggregate above is the low-variance statement and the one that
    // matches how a run is scored. This is the blunt one: no cadence may
    // out-point the competent player at any rung of the ladder by more than
    // the sampling error of a 30-match cell, which at a points standard
    // deviation of 0.85 is one standard error.
    const tolerance = 0.16;
    for (const { label, cells } of mashers) {
      DIFFICULTIES.forEach((d, i) => {
        const pts = 2 * cells[i].winRate + cells[i].drawRate;
        const comp = 2 * competent[i].winRate + competent[i].drawRate;
        expect(
          pts,
          `mash ${label} points ${pts.toFixed(2)} vs competent ${comp.toFixed(2)} at d=${d}`
        ).toBeLessThan(comp + tolerance);
      });
    }
  });

  it('scores no more than a competent player at any cadence', () => {
    const compGoals = ladderGoals(competent);
    for (const { label, cells } of mashers) {
      const goals = ladderGoals(cells);
      expect(
        goals,
        `mash ${label} goals ${goals.toFixed(2)} vs competent ${compGoals.toFixed(2)}`
      ).toBeLessThan(compGoals);
    }
  });

  it('leaves mashing well short of the rates the audit measured', () => {
    // The audit's own numbers, cadence by cadence, were 0.72-0.85 win and
    // 2.45-2.87 goals a match. Nothing may come near that again.
    for (const { label, cells } of mashers) {
      for (let i = 0; i < DIFFICULTIES.length; i++) {
        expect(cells[i].winRate, `mash ${label} win rate at d=${DIFFICULTIES[i]}`).toBeLessThan(0.7);
        expect(cells[i].goalsFor, `mash ${label} goals at d=${DIFFICULTIES[i]}`).toBeLessThan(2.1);
      }
    }
  });

  it('is beaten by a masher with no reaction time at all, and says so', { timeout: 300000 }, () => {
    // The caveat, measured rather than asserted away. A masher who re-aims
    // every frame is out-reacting the scripted humans by 170 ms, and at some
    // cadences that is worth more than everything the competent player knows
    // about football; the sweep records how much. The bound is on the *size*
    // of that superhuman edge, so a future change that made instant reflexes
    // worth a whole extra win a match would still fail here — what it cannot
    // do is pretend the edge is not there.
    const worst = ZERO_LATENCY_CADENCES.map(([period, hold]) => {
      const cells = DIFFICULTIES.map(d => sweepWith(() => masher(period, hold, 0), d, MASH_MATCHES));
      return { label: `${period}/${hold}`, pts: ladderPoints(cells) };
    }).sort((a, b) => b.pts - a.pts)[0];
    expect(
      worst.pts,
      `zero-latency mash ${worst.label} = ${worst.pts.toFixed(3)} vs competent ${compPoints.toFixed(3)}`
    ).toBeLessThan(compPoints + 1.2);
  });

  it('makes a rushed shot measurably worse than a struck one', () => {
    // The mechanism behind the ordering above, asserted directly so that a
    // future change cannot keep the win rates and lose the reason for them: a
    // masher's shots miss the target more often than a player's who picks his
    // moment. The margin is stated without a cushion because the cadences that
    // hold A for the whole charge do get the charge's accuracy — what they
    // cannot buy is the position, the pressure and the range that the rest of
    // `strikeRush` reads, and the pooled figure is what carries that.
    const compOnTarget = ladderOnTarget(competent);
    for (const { label, cells } of mashers) {
      const ot = ladderOnTarget(cells);
      expect(
        ot,
        `mash ${label} on-target ${ot.toFixed(2)} vs competent ${compOnTarget.toFixed(2)}`
      ).toBeLessThan(compOnTarget);
    }
  });
});
