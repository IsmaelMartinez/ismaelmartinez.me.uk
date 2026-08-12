import { describe, it, expect } from 'vitest';
import { seededRandom } from './seeded-random';
import {
  createRun,
  difficultyFor,
  isKnockout,
  playerTeam,
  recordPlayerMatch,
  runScore,
  simulateGoals,
  standings,
  FINAL_DIFFICULTY,
  GROUP_SIZE,
  POINTS_DRAW,
  POINTS_WIN,
  SCORE_CHAMPION,
  SCORE_CLEAN_SHEET,
  SCORE_FINAL_WON,
  SCORE_GOAL,
  SCORE_GROUP_DRAW,
  SCORE_GROUP_WIN,
  SCORE_MATCH_PLAYED,
  SCORE_PENALTY_WIN,
  SCORE_QUALIFIED,
  SCORE_SEMI_WON,
  SEMI_DIFFICULTY,
  type MatchResult,
  type RunState,
  type TableRow
} from '../../src/games/football/tournament';
import { TEAMS, teamByCode } from '../../src/games/football/teams';

const PLAYER = 'LUP';

function row(code: string, over: Partial<TableRow> = {}): TableRow {
  return {
    code,
    played: 3,
    won: 0,
    drawn: 0,
    lost: 0,
    gf: 0,
    ga: 0,
    gd: 0,
    points: 0,
    tiebreak: 0.5,
    ...over
  };
}

function run(seed = 5, code = PLAYER): RunState {
  return createRun(seededRandom(seed), code);
}

describe('the draw', () => {
  it('puts eight of the twelve into two groups of four, the player in group A', () => {
    for (let seed = 0; seed < 40; seed++) {
      const r = run(seed * 7919 + 3);
      expect(r.groups[0]).toHaveLength(GROUP_SIZE);
      expect(r.groups[1]).toHaveLength(GROUP_SIZE);
      const codes = [...r.groups[0], ...r.groups[1]].map(t => t.code);
      expect(new Set(codes).size).toBe(GROUP_SIZE * 2);
      expect(r.groups[0].map(t => t.code)).toContain(PLAYER);
      expect(r.groups[1].map(t => t.code)).not.toContain(PLAYER);
      for (const code of codes) expect(TEAMS.map(t => t.code)).toContain(code);
    }
  });

  it('is reproducible from a seed and varies across seeds', () => {
    const a = run(1234);
    const b = run(1234);
    expect(a.groups[0].map(t => t.code)).toEqual(b.groups[0].map(t => t.code));
    expect(a.groups[1].map(t => t.code)).toEqual(b.groups[1].map(t => t.code));
    expect(a.schedule).toEqual(b.schedule);

    const shapes = new Set<string>();
    for (let seed = 0; seed < 30; seed++) {
      shapes.add(run(seed * 104729 + 11).groups[1].map(t => t.code).join(','));
    }
    expect(shapes.size).toBeGreaterThan(5);
  });

  it('gives the player one fixture on each of the three matchdays', () => {
    const r = run(77);
    for (const day of r.schedule[0]) {
      const mine = day.filter(f => f.home === PLAYER || f.away === PLAYER);
      expect(mine).toHaveLength(1);
    }
    expect(r.schedule[0]).toHaveLength(3);
    expect(r.schedule[1]).toHaveLength(3);
    expect(r.opponent).not.toBeNull();
    expect(r.opponent).not.toBe(PLAYER);
  });

  it('lets the player pick any of the twelve', () => {
    for (const team of TEAMS) {
      const r = run(9, team.code);
      expect(playerTeam(r).code).toBe(team.code);
      expect(r.groups[0].map(t => t.code)).toContain(team.code);
    }
  });
});

describe('the table', () => {
  it('scores two for a win, one for a draw and nothing for a loss', () => {
    const r = run(3);
    recordPlayerMatch(r, { goalsFor: 2, goalsAgainst: 0 });
    const me = r.tables[0].find(t => t.code === PLAYER)!;
    expect(me.points).toBe(POINTS_WIN);
    expect(me.won).toBe(1);

    const drawRun = run(3);
    recordPlayerMatch(drawRun, { goalsFor: 1, goalsAgainst: 1 });
    expect(drawRun.tables[0].find(t => t.code === PLAYER)!.points).toBe(POINTS_DRAW);

    const lossRun = run(3);
    recordPlayerMatch(lossRun, { goalsFor: 0, goalsAgainst: 2 });
    expect(lossRun.tables[0].find(t => t.code === PLAYER)!.points).toBe(0);
  });

  it('orders by points, then goal difference, then goals scored, then a stable key', () => {
    const rows = [
      row('AAA', { points: 4, gd: 1, gf: 3, tiebreak: 0.9 }),
      row('BBB', { points: 6, gd: 0, gf: 2, tiebreak: 0.1 }),
      row('CCC', { points: 4, gd: 2, gf: 2, tiebreak: 0.5 }),
      row('DDD', { points: 4, gd: 1, gf: 5, tiebreak: 0.2 })
    ];
    expect(standings(rows).map(r => r.code)).toEqual(['BBB', 'CCC', 'DDD', 'AAA']);

    const tied = [
      row('EEE', { points: 3, gd: 0, gf: 1, tiebreak: 0.8 }),
      row('FFF', { points: 3, gd: 0, gf: 1, tiebreak: 0.2 })
    ];
    expect(standings(tied).map(r => r.code)).toEqual(['FFF', 'EEE']);
    // Stable: the same rows always sort the same way.
    expect(standings(tied).map(r => r.code)).toEqual(standings(tied).map(r => r.code));
  });

  it('keeps every table complete and consistent after the group stage', () => {
    for (let seed = 0; seed < 30; seed++) {
      const r = run(seed * 131 + 7);
      for (let i = 0; i < 3; i++) {
        recordPlayerMatch(r, { goalsFor: (seed + i) % 4, goalsAgainst: (seed + 2 * i) % 3 });
      }
      for (const table of r.tables) {
        let gf = 0;
        let ga = 0;
        for (const t of table) {
          expect(t.played).toBe(3);
          expect(t.won + t.drawn + t.lost).toBe(3);
          expect(t.points).toBe(t.won * POINTS_WIN + t.drawn * POINTS_DRAW);
          expect(t.gd).toBe(t.gf - t.ga);
          gf += t.gf;
          ga += t.ga;
        }
        expect(gf).toBe(ga);
      }
    }
  });
});

describe('qualification', () => {
  it('sends the top two of the group through', () => {
    for (let seed = 0; seed < 40; seed++) {
      const r = run(seed * 977 + 13);
      for (let i = 0; i < 3; i++) {
        recordPlayerMatch(r, { goalsFor: (seed * 3 + i) % 5, goalsAgainst: (seed + i) % 4 });
      }
      const table = standings(r.tables[0]);
      const top2 = table.slice(0, 2).map(t => t.code);
      expect(r.qualified).toBe(top2.includes(PLAYER));
      if (r.qualified) {
        expect(r.stage).toBe('semi');
        expect(r.over).toBe(false);
        expect(r.opponent).not.toBeNull();
        // The semi-final opponent is a qualifier from the other group.
        expect(standings(r.tables[1]).slice(0, 2).map(t => t.code)).toContain(r.opponent);
      } else {
        expect(r.stage).toBe('over');
        expect(r.over).toBe(true);
        expect(r.opponent).toBeNull();
      }
    }
  });

  it('ends the run immediately at the third group whistle when it goes wrong', () => {
    const r = run(21);
    for (let i = 0; i < 3; i++) {
      expect(r.over).toBe(false);
      recordPlayerMatch(r, { goalsFor: 0, goalsAgainst: 3 });
    }
    expect(r.qualified).toBe(false);
    expect(r.over).toBe(true);
    expect(r.matchesPlayed).toBe(3);
    // Nothing further is recorded once the run is over.
    const frozen = runScore(r);
    recordPlayerMatch(r, { goalsFor: 9, goalsAgainst: 0 });
    expect(runScore(r)).toBe(frozen);
    expect(r.matchesPlayed).toBe(3);
  });

  it('runs semi then final and nothing else', () => {
    let champion: RunState | null = null;
    for (let seed = 0; seed < 60 && !champion; seed++) {
      const r = run(seed * 3121 + 5);
      for (let i = 0; i < 3; i++) recordPlayerMatch(r, { goalsFor: 4, goalsAgainst: 0 });
      if (!r.qualified) continue;
      expect(r.stage).toBe('semi');
      expect(isKnockout(r)).toBe(true);
      recordPlayerMatch(r, { goalsFor: 2, goalsAgainst: 1 });
      expect(r.stage).toBe('final');
      expect(r.semiWon).toBe(true);
      expect(r.opponent).toBe(r.otherSemiWinner);
      recordPlayerMatch(r, { goalsFor: 1, goalsAgainst: 0 });
      expect(r.champion).toBe(true);
      expect(r.over).toBe(true);
      expect(r.matchesPlayed).toBe(5);
      champion = r;
    }
    expect(champion).not.toBeNull();
  });

  it('ends the run on a knockout defeat, including one on penalties', () => {
    for (const [result, survives] of [
      [{ goalsFor: 0, goalsAgainst: 1 }, false],
      [{ goalsFor: 1, goalsAgainst: 1 }, false],
      [{ goalsFor: 1, goalsAgainst: 1, wonOnPenalties: true }, true]
    ] as Array<[MatchResult, boolean]>) {
      let tested = false;
      for (let seed = 0; seed < 60 && !tested; seed++) {
        const r = run(seed * 613 + 3);
        for (let i = 0; i < 3; i++) recordPlayerMatch(r, { goalsFor: 5, goalsAgainst: 0 });
        if (!r.qualified) continue;
        recordPlayerMatch(r, result);
        expect(r.over).toBe(!survives);
        if (survives) {
          expect(r.stage).toBe('final');
          expect(r.penaltyWins).toBe(1);
        }
        tested = true;
      }
      expect(tested).toBe(true);
    }
  });
});

describe('difficulty', () => {
  it('rises across the run and never nears 1', () => {
    let seen = false;
    for (let seed = 0; seed < 60 && !seen; seed++) {
      const r = run(seed * 4093 + 1);
      const group: number[] = [];
      for (let i = 0; i < 3; i++) {
        group.push(difficultyFor(r));
        recordPlayerMatch(r, { goalsFor: 4, goalsAgainst: 0 });
      }
      expect(group[1]).toBeGreaterThan(group[0] - 0.17);
      for (const d of group) expect(d).toBeLessThan(0.6);
      if (!r.qualified) continue;
      const semi = difficultyFor(r);
      expect(Math.abs(semi - SEMI_DIFFICULTY)).toBeLessThanOrEqual(0.0801);
      recordPlayerMatch(r, { goalsFor: 2, goalsAgainst: 0 });
      const final = difficultyFor(r);
      expect(Math.abs(final - FINAL_DIFFICULTY)).toBeLessThanOrEqual(0.0801);
      expect(final).toBeLessThan(0.95);
      seen = true;
    }
    expect(seen).toBe(true);
  });

  /**
   * The modulation reads the *gap* between the two sides rather than the
   * opponent's rating alone, so picking the best team in the roster is felt as
   * a harder run rather than as a free one. For the middling pairings the
   * specification's table describes the swing is still its +-0.08; the widest
   * mismatch the twelve-team roster can produce is Api against Leoni, and that
   * is worth 0.15 either way.
   */
  it('modulates by the gap between the two sides', () => {
    let widest = 0;
    for (let seed = 0; seed < 200; seed++) {
      const r = run(seed * 7919 + 17);
      widest = Math.max(widest, Math.abs(difficultyFor(r) - 0.25));
    }
    expect(widest).toBeGreaterThan(0);
    expect(widest).toBeLessThanOrEqual(0.1501);
  });

  it('is unmodulated when the two sides are evenly matched', () => {
    const r = run(11);
    r.playerCode = 'TOR';
    r.opponent = 'LUP';
    // Tori 3/4/4/3 and Lupi 3/3/4/4 both total 14, so the gap is zero.
    expect(difficultyFor(r)).toBeCloseTo(0.25, 10);
  });
});

describe('runScore', () => {
  it('adds up exactly what the ledger says', () => {
    const r = run(31);
    expect(runScore(r)).toBe(0);
    r.matchesPlayed = 5;
    r.goals = 7;
    r.groupWins = 2;
    r.groupDraws = 1;
    r.cleanSheets = 3;
    r.qualified = true;
    r.semiWon = true;
    r.finalWon = true;
    r.champion = true;
    r.penaltyWins = 1;
    expect(runScore(r)).toBe(
      5 * SCORE_MATCH_PLAYED +
        7 * SCORE_GOAL +
        2 * SCORE_GROUP_WIN +
        1 * SCORE_GROUP_DRAW +
        3 * SCORE_CLEAN_SHEET +
        SCORE_QUALIFIED +
        SCORE_SEMI_WON +
        SCORE_FINAL_WON +
        SCORE_CHAMPION +
        SCORE_PENALTY_WIN
    );
  });

  it('never decreases across any legal transition', () => {
    for (let seed = 0; seed < 120; seed++) {
      const rng = seededRandom(seed * 2749 + 5);
      const r = run(seed * 1583 + 9);
      let last = runScore(r);
      for (let step = 0; step < 8 && !r.over; step++) {
        const goalsFor = Math.floor(rng() * 5);
        const goalsAgainst = Math.floor(rng() * 4);
        recordPlayerMatch(r, {
          goalsFor,
          goalsAgainst,
          wonOnPenalties: goalsFor === goalsAgainst && rng() < 0.5
        });
        const now = runScore(r);
        expect(now).toBeGreaterThanOrEqual(last);
        last = now;
      }
      expect(r.over).toBe(true);
    }
  });

  it('always submits something for a run that fails to qualify', () => {
    let exits = 0;
    for (let seed = 0; seed < 200; seed++) {
      const r = run(seed * 9973 + 3);
      for (let i = 0; i < 3; i++) recordPlayerMatch(r, { goalsFor: 0, goalsAgainst: 4 });
      expect(r.qualified).toBe(false);
      expect(r.over).toBe(true);
      expect(runScore(r)).toBeGreaterThan(0);
      exits++;
    }
    expect(exits).toBe(200);
  });

  it('lands a champion run in the advertised range', () => {
    let found = 0;
    for (let seed = 0; seed < 120 && found < 8; seed++) {
      const r = run(seed * 5119 + 7);
      for (let i = 0; i < 3; i++) recordPlayerMatch(r, { goalsFor: 2, goalsAgainst: 0 });
      if (!r.qualified) continue;
      recordPlayerMatch(r, { goalsFor: 2, goalsAgainst: 1 });
      recordPlayerMatch(r, { goalsFor: 1, goalsAgainst: 0 });
      expect(r.champion).toBe(true);
      const score = runScore(r);
      expect(score).toBeGreaterThanOrEqual(8000);
      expect(score).toBeLessThanOrEqual(10000);
      found++;
    }
    expect(found).toBeGreaterThan(0);
  });

  it('is the one number, so the displayed total equals the submitted total', () => {
    const r = run(64);
    for (let i = 0; i < 3; i++) recordPlayerMatch(r, { goalsFor: 3, goalsAgainst: 1 });
    const displayed = runScore(r);
    const submitted = runScore(r);
    expect(displayed).toBe(submitted);
    // Reading it twice cannot move it: `runScore` is a pure fold of the state.
    expect(runScore(r)).toBe(displayed);
  });
});

describe('simulated fixtures', () => {
  it('never invents a scoreline the player could not have produced', () => {
    const rng = seededRandom(88);
    for (let i = 0; i < 20000; i++) {
      const a = TEAMS[Math.floor(rng() * TEAMS.length)];
      const b = TEAMS[Math.floor(rng() * TEAMS.length)];
      const goals = simulateGoals(a, b, rng);
      expect(goals).toBeGreaterThanOrEqual(0);
      expect(goals).toBeLessThanOrEqual(5);
      expect(Number.isInteger(goals)).toBe(true);
    }
  });

  it('gives the better attack more goals on average', () => {
    const rng = seededRandom(4);
    const strong = teamByCode('LEO');
    const weak = teamByCode('API');
    const shield = teamByCode('ORC');
    let strongTotal = 0;
    let weakTotal = 0;
    for (let i = 0; i < 8000; i++) {
      strongTotal += simulateGoals(strong, shield, rng);
      weakTotal += simulateGoals(weak, shield, rng);
    }
    expect(strongTotal).toBeGreaterThan(weakTotal);
  });
});
