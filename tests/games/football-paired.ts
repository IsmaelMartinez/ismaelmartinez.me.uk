/**
 * The one implementation of "play a whole match headlessly" and of the paired
 * common-random-numbers comparison every policy claim in the CALCIO '90 suites
 * is made with.
 *
 * It lives outside the test files because there is now more than one of them,
 * and two copies of a comparison method is how two suites end up disagreeing
 * about whether an exploit exists. The method itself is not a refinement: an
 * unpaired comparison of two policies at 300 matches a cell carries about 0.14
 * of sampling error on a ladder-points difference, which is the same size as
 * the effects being argued about, and a previous round of this work spent
 * itself chasing a +0.013 difference that was 0.09 sigma. Pairing removes the
 * draw, the fixture and the seeded run of the ball, and leaves the policy.
 */
import { createMatch, tickMatch, type MatchState } from '../../src/games/football/match';
import { teamByCode, type Team } from '../../src/games/football/teams';
import type { Policy } from './football-policies';
import { lcg } from './football-shot-harness';

export const DT = 1 / 60;

/** A match cannot legitimately outlast this many ticks; a hang fails loudly. */
export const TICK_CAP = 12000;

export const DIFFICULTIES = [0.25, 0.45, 0.65, 0.85] as const;

/** A fixed, middling pairing so a cell measures the curve and not the draw. */
export const HOME = teamByCode('ESP');
export const AWAY = teamByCode('ENG');

export interface Played {
  match: MatchState;
  /** Real seconds the match occupied, stoppages and celebrations included. */
  seconds: number;
}

export function playMatch(
  policy: Policy,
  difficulty: number,
  seed: number,
  teams: [Team, Team] = [HOME, AWAY],
  knockout = false
): Played {
  const m = createMatch({ rng: lcg(seed), difficulty, teams, knockout });
  let ticks = 0;
  while (m.phase !== 'over' && ticks < TICK_CAP) {
    tickMatch(m, DT, policy(m, DT));
    ticks++;
  }
  if (ticks >= TICK_CAP) throw new Error(`match never finished at seed ${seed}`);
  return { match: m, seconds: ticks * DT };
}

export interface Paired {
  /** Mean per-match difference in tournament points (2-1-0). */
  pts: number;
  ptsT: number;
  /** Mean per-match difference in goal difference, which does not saturate. */
  gd: number;
  gdT: number;
  n: number;
}

export function meanT(xs: number[]): { mean: number; t: number } {
  const mean = xs.reduce((sum, x) => sum + x, 0) / xs.length;
  const variance =
    xs.reduce((sum, x) => sum + (x - mean) * (x - mean), 0) / Math.max(1, xs.length - 1);
  const se = Math.sqrt(variance / xs.length);
  return { mean, t: se > 0 ? mean / se : 0 };
}

export function points(m: MatchState): number {
  if (m.score[0] > m.score[1]) return 2;
  return m.score[0] === m.score[1] ? 1 : 0;
}

export function goalDiff(m: MatchState): number {
  return m.score[0] - m.score[1];
}

/** Play `n` matched pairs of `a` against `b` at one difficulty. */
export function pairedAgainst(
  a: () => Policy,
  b: () => Policy,
  difficulty: number,
  n: number,
  seed0 = 1
): Paired {
  const pts: number[] = [];
  const gds: number[] = [];
  for (let i = 0; i < n; i++) {
    const seed = seed0 + i * 7919;
    const withIt = playMatch(a(), difficulty, seed).match;
    const without = playMatch(b(), difficulty, seed).match;
    pts.push(points(withIt) - points(without));
    gds.push(goalDiff(withIt) - goalDiff(without));
  }
  const p = meanT(pts);
  const g = meanT(gds);
  return { pts: p.mean, ptsT: p.t, gd: g.mean, gdT: g.t, n };
}

/** The paired difference summed over the ladder, the tournament's currency. */
export function ladderDiff(rows: Paired[]): number {
  return rows.reduce((sum, r) => sum + r.pts, 0);
}

/**
 * The standard error of that ladder sum: four independent cells, each row's
 * own t giving its standard error back.
 */
export function ladderSe(rows: Paired[]): number {
  return Math.sqrt(rows.reduce((sum, r) => sum + (r.ptsT === 0 ? 0 : (r.pts / r.ptsT) ** 2), 0));
}

/** Every comparison reports its t-statistic, per difficulty, in its own message. */
export function pairedLine(rows: Paired[]): string {
  return DIFFICULTIES.map(
    (d, i) =>
      `d=${d}: ${rows[i].pts.toFixed(3)} pts (t=${rows[i].ptsT.toFixed(2)}), ` +
      `${rows[i].gd.toFixed(3)} gd (t=${rows[i].gdT.toFixed(2)})`
  ).join(' | ');
}

/** One policy against another over the whole ladder, on matched pairs. */
export function ladderPaired(
  a: () => Policy,
  b: () => Policy,
  pairs: number,
  seed0 = 1
): Paired[] {
  return DIFFICULTIES.map(d => pairedAgainst(a, b, d, pairs, seed0));
}
