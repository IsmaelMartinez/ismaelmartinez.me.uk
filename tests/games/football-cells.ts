/**
 * One cell of the CALCIO '90 balance grid — a policy played out over a few
 * hundred seeded matches at one difficulty — and the ladder summaries the
 * acceptance suites read off it.
 *
 * It lives outside the test files for the same reason `football-paired.ts`
 * does: the balance gate is no longer one file. It was one 1,600-line file, and
 * Vitest gives a file one worker however many cores are free, so the gate ran
 * on a single core for half an hour while the rest of the machine sat idle. The
 * describes are separate files now and this is what they share.
 */
import type { Policy, PolicyName } from './football-policies';
import { POLICIES } from './football-policies';
import { playMatch } from './football-paired';
import { expect } from 'vitest';

/** Matches per cell. The specification asks for at least 300. */
export const MATCHES = 300;

/**
 * Matches per cadence per difficulty in the mash sweep, and per difficulty in
 * the per-verb comparisons.
 *
 * The cadence sweep is deliberately shallower per cell than `MATCHES`, because
 * it is wide instead: fifty-odd cadences across four difficulties. What it has
 * to resolve is a gap of about 0.4 points a match, and points per match have a
 * standard deviation near 0.85, so 30 matches at each of four difficulties puts
 * four and a half standard errors between the worst cadence and the scripted
 * competent player. Depth here would buy precision the assertion does not need
 * and would cost more than the whole rest of the file.
 */
export const MASH_MATCHES = 30;

export interface Cell {
  goalsFor: number;
  goalsAgainst: number;
  winRate: number;
  drawRate: number;
  nilNilRate: number;
  shots: number;
  onTargetShare: number;
  saveRate: number;
  catchShare: number;
  crossGoalShare: number;
  groundGoalShare: number;
  dribbledGoalShare: number;
  groundPassesCompleted: number;
  passCompletion: number;
  possessionSpell: number;
  turnovers: number;
  biggestScore: number;
  /** Matches in the cell where either side reached ten. */
  doubleFigures: number;
  /** Matches in the cell, so a rate can be pooled across cells afterwards. */
  matches: number;
  seconds: number;
}

export function sweep(name: PolicyName, difficulty: number, n = MATCHES): Cell {
  return sweepWith(() => POLICIES[name](), difficulty, n);
}

export function sweepWith(make: () => Policy, difficulty: number, n = MATCHES): Cell {
  let gf = 0;
  let ga = 0;
  let wins = 0;
  let draws = 0;
  let nils = 0;
  let shots = 0;
  let onTarget = 0;
  let saves = 0;
  let catches = 0;
  let cross = 0;
  let ground = 0;
  let dribbled = 0;
  let passes = 0;
  let passesOk = 0;
  let spellSum = 0;
  let spellN = 0;
  let turnovers = 0;
  let biggest = 0;
  let doubleFigures = 0;
  let seconds = 0;
  for (let i = 0; i < n; i++) {
    const { match: m, seconds: s } = playMatch(make(), difficulty, 1 + i * 7919);
    seconds += s;
    gf += m.score[0];
    ga += m.score[1];
    biggest = Math.max(biggest, m.score[0], m.score[1]);
    if (m.score[0] >= 10 || m.score[1] >= 10) doubleFigures++;
    if (m.score[0] > m.score[1]) wins++;
    if (m.score[0] === m.score[1]) draws++;
    if (m.score[0] + m.score[1] === 0) nils++;
    shots += m.stats.shots[0];
    onTarget += m.stats.onTarget[0];
    saves += m.stats.saves[1];
    catches += m.stats.catches[1];
    for (const g of m.goals) {
      if (g.side !== 0) continue;
      if (g.dribbled) dribbled++;
      else if (g.fromCross || g.contact !== 'ground') cross++;
      else ground++;
    }
    passes += m.stats.groundPasses[0];
    passesOk += m.stats.groundPassesCompleted[0];
    for (const spell of m.stats.spells) {
      spellSum += spell;
      spellN++;
    }
    turnovers += m.stats.turnovers;
  }
  const goals = cross + ground + dribbled;
  const faced = saves + gf;
  return {
    goalsFor: gf / n,
    goalsAgainst: ga / n,
    winRate: wins / n,
    drawRate: draws / n,
    nilNilRate: nils / n,
    shots: shots / n,
    onTargetShare: onTarget / Math.max(1, shots),
    // Every shot the keeper faces was on target by construction: an off-target
    // one never reaches his plane. Saves over saves-plus-goals is therefore
    // exactly 7.3's "save rate of shots on target".
    saveRate: saves / Math.max(1, faced),
    catchShare: catches / Math.max(1, saves),
    crossGoalShare: cross / Math.max(1, goals),
    groundGoalShare: ground / Math.max(1, goals),
    dribbledGoalShare: dribbled / Math.max(1, goals),
    groundPassesCompleted: passesOk / n,
    passCompletion: passesOk / Math.max(1, passes),
    possessionSpell: spellSum / Math.max(1, spellN),
    turnovers: turnovers / n,
    biggestScore: biggest,
    doubleFigures,
    matches: n,
    seconds: seconds / n
  };
}

/**
 * A run is a ladder, not a single difficulty, and points are its currency: the
 * group is scored 2-1-0 and qualification decides whether there is a knockout
 * at all. So the comparisons in the suites are made on **points per match
 * summed across the four difficulties**, which is both the thing the tournament
 * actually pays out on and four times the sample of any one cell.
 */
export function ladderPoints(cells: Cell[]): number {
  return cells.reduce((sum, c) => sum + 2 * c.winRate + c.drawRate, 0);
}

export function ladderGoals(cells: Cell[]): number {
  return cells.reduce((sum, c) => sum + c.goalsFor, 0) / cells.length;
}

/** Shots-on-target share pooled over the ladder rather than averaged per cell. */
export function ladderOnTarget(cells: Cell[]): number {
  const shots = cells.reduce((sum, c) => sum + c.shots, 0);
  return cells.reduce((sum, c) => sum + c.shots * c.onTargetShare, 0) / Math.max(1e-9, shots);
}

export function band(value: number, lo: number, hi: number, what: string): void {
  expect(value, `${what} = ${value.toFixed(3)}`).toBeGreaterThanOrEqual(lo);
  expect(value, `${what} = ${value.toFixed(3)}`).toBeLessThanOrEqual(hi);
}
