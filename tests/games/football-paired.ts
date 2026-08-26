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
import { competent, expert, type Policy } from './football-policies';
import { lcg } from './football-shot-harness';
import { meanT } from './paired-stats';

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

export function points(m: MatchState): number {
  if (m.score[0] > m.score[1]) return 2;
  return m.score[0] === m.score[1] ? 1 : 0;
}

export function goalDiff(m: MatchState): number {
  return m.score[0] - m.score[1];
}

/**
 * The two scripted humans every sweep measures itself against, named rather
 * than passed as a factory so that the harness can recognise them.
 *
 * A sweep asks the same question of ninety camp spots or sixty wing stations,
 * and the control half of every one of those pairings is the *same seeded
 * match*: `competent` at d = 0.45 on seed 7920 plays out identically whether it
 * is being compared with a camper or a winger. Playing it once per cell was
 * about half of the whole cost of the two sweeps — 21,000 of the 48,000 matches
 * they ran between them.
 *
 * The name is the memo key, and it is a name rather than a caller-supplied
 * string precisely so that two different policies cannot be given the same one:
 * the mapping from name to policy lives here, next to the cache it feeds.
 */
export type ControlName = 'competent' | 'expert';

const CONTROLS: Record<ControlName, () => Policy> = { competent, expert };

/** A policy carrying a memo key; build one with `keyed`. */
interface KeyedPolicy {
  key: string;
  make: () => Policy;
}

/**
 * Either side of a pairing: a control by name, a bare policy to build, or a
 * keyed policy whose half of the pairing may be reused.
 */
export type Contender = ControlName | (() => Policy) | KeyedPolicy;

/**
 * A policy that is about to be compared with more than one opponent, so that
 * its own half of the pairing is played once rather than once per opponent —
 * the wing sweep re-measures each station against both scripted humans, and was
 * playing the station's six hundred matches twice to do it.
 *
 * **The key has to spell out every parameter the policy varies on**, because
 * two policies given the same key are one policy as far as the cache is
 * concerned. Build it from the arguments, never from a description.
 */
export function keyed(key: string, make: () => Policy): KeyedPolicy {
  return { key, make };
}

/** One side of one pairing, which is all a paired comparison reads of a match. */
interface Outcome {
  pts: number;
  gd: number;
}

/**
 * Memoised outcomes, keyed by contender, difficulty and seed — the whole of
 * what `playMatch` is a function of here, since a pairing never varies the
 * fixture or the knockout flag. Cleared by nothing: a test file is one process
 * and the cache is a few thousand entries of two numbers.
 */
const outcomeCache = new Map<string, Outcome>();

function outcomeOf(who: Contender, difficulty: number, seed: number): Outcome {
  const make = typeof who === 'string' ? CONTROLS[who] : typeof who === 'function' ? who : who.make;
  const label = typeof who === 'string' ? who : typeof who === 'function' ? null : who.key;
  if (label === null) {
    const m = playMatch(make(), difficulty, seed).match;
    return { pts: points(m), gd: goalDiff(m) };
  }
  const key = `${label}|${difficulty}|${seed}`;
  const hit = outcomeCache.get(key);
  if (hit) return hit;
  const m = playMatch(make(), difficulty, seed).match;
  const outcome = { pts: points(m), gd: goalDiff(m) };
  outcomeCache.set(key, outcome);
  return outcome;
}

/** Play `n` matched pairs of `a` against `b` at one difficulty. */
export function pairedAgainst(
  a: Contender,
  b: Contender,
  difficulty: number,
  n: number,
  seed0 = 1
): Paired {
  const pts: number[] = [];
  const gds: number[] = [];
  for (let i = 0; i < n; i++) {
    const seed = seed0 + i * 7919;
    const withIt = outcomeOf(a, difficulty, seed);
    const without = outcomeOf(b, difficulty, seed);
    pts.push(withIt.pts - without.pts);
    gds.push(withIt.gd - without.gd);
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
  a: Contender,
  b: Contender,
  pairs: number,
  seed0 = 1
): Paired[] {
  return DIFFICULTIES.map(d => pairedAgainst(a, b, d, pairs, seed0));
}
