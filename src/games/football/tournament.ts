/**
 * The run: one tournament, one sitting, no save, no password, no continue.
 * Eight of the twelve teams are drawn into two groups of four, the player
 * plays their three group fixtures while the other nine are simulated from
 * ratings, top two of each group qualify, and four qualifiers means semi-final
 * then final.
 *
 * Failing to qualify ends the run at the final group whistle. That is the
 * original's hard game over and it is kept on purpose — but unlike the audited
 * build, a player who goes out in the group has still banked matches, points
 * and goals, so their score is never zero and always reaches the shared board.
 *
 * `runScore` lives here and is the only place the number is computed.
 */
import { clamp } from '../engine/math';
import { drawGroups, teamByCode, teamStrength, GROUP_SIZE, type Team } from './teams';

export const POINTS_WIN = 2;
export const POINTS_DRAW = 1;

/** The score ledger. Nothing is ever subtracted and there is no time bonus. */
export const SCORE_GOAL = 100;
export const SCORE_GROUP_WIN = 400;
export const SCORE_GROUP_DRAW = 150;
export const SCORE_CLEAN_SHEET = 150;
export const SCORE_QUALIFIED = 750;
export const SCORE_SEMI_WON = 1000;
export const SCORE_FINAL_WON = 2000;
export const SCORE_CHAMPION = 2500;
export const SCORE_PENALTY_WIN = 500;
/**
 * A participation award the specification's table does not list. Without it a
 * winless, goalless group exit submits exactly zero, which contradicts 7.6's
 * "always submits a score above zero" and would drop the run off the board.
 */
export const SCORE_MATCH_PLAYED = 100;

export type RunStage = 'group' | 'semi' | 'final' | 'over';

export interface TableRow {
  code: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  gd: number;
  points: number;
  /** Stable seeded key, the last link in the tiebreak chain. */
  tiebreak: number;
}

export interface Fixture {
  home: string;
  away: string;
}

export interface MatchResult {
  goalsFor: number;
  goalsAgainst: number;
  /** Knockout only: the tie went to penalties and the player won them. */
  wonOnPenalties?: boolean;
}

export interface RunState {
  playerCode: string;
  groups: [Team[], Team[]];
  /** [group][matchday] -> the two fixtures played that day. */
  schedule: [Fixture[][], Fixture[][]];
  matchday: number;
  tables: [TableRow[], TableRow[]];
  stage: RunStage;
  /** The opponent for the match about to be played, null once the run is over. */
  opponent: string | null;
  /** The other semi-final, simulated, so the final has an opponent. */
  otherSemiWinner: string | null;
  matchesPlayed: number;
  goals: number;
  groupWins: number;
  groupDraws: number;
  cleanSheets: number;
  qualified: boolean;
  semiWon: boolean;
  finalWon: boolean;
  champion: boolean;
  penaltyWins: number;
  over: boolean;
  rng: () => number;
}

/** Difficulty by stage, per 4. The opponent's rating shifts it by +-0.08. */
const STAGE_DIFFICULTY = [0.25, 0.35, 0.45];
export const SEMI_DIFFICULTY = 0.65;
export const FINAL_DIFFICULTY = 0.85;

function freshRow(code: string, rng: () => number): TableRow {
  return {
    code,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    gf: 0,
    ga: 0,
    gd: 0,
    points: 0,
    tiebreak: rng()
  };
}

/**
 * Round-robin for four, circle method: every team plays once per matchday, so
 * the player has exactly one fixture on each. The matchday order is shuffled
 * so a run does not always open against the same seed.
 */
function roundRobin(teams: Team[], rng: () => number): Fixture[][] {
  const [a, b, c, d] = teams.map(t => t.code);
  const days: Fixture[][] = [
    [
      { home: a, away: d },
      { home: b, away: c }
    ],
    [
      { home: a, away: c },
      { home: d, away: b }
    ],
    [
      { home: a, away: b },
      { home: c, away: d }
    ]
  ];
  for (let i = days.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [days[i], days[j]] = [days[j], days[i]];
  }
  return days;
}

export function createRun(rng: () => number, playerCode: string): RunState {
  const draw = drawGroups(rng, playerCode);
  const groups: [Team[], Team[]] = [draw.a, draw.b];
  const run: RunState = {
    playerCode,
    groups,
    schedule: [roundRobin(draw.a, rng), roundRobin(draw.b, rng)],
    matchday: 0,
    tables: [
      draw.a.map(t => freshRow(t.code, rng)),
      draw.b.map(t => freshRow(t.code, rng))
    ],
    stage: 'group',
    opponent: null,
    otherSemiWinner: null,
    matchesPlayed: 0,
    goals: 0,
    groupWins: 0,
    groupDraws: 0,
    cleanSheets: 0,
    qualified: false,
    semiWon: false,
    finalWon: false,
    champion: false,
    penaltyWins: 0,
    over: false,
    rng
  };
  run.opponent = playerFixtureOpponent(run);
  return run;
}

/** Who the player faces on the current group matchday. */
function playerFixtureOpponent(run: RunState): string {
  const day = run.schedule[0][run.matchday];
  const fixture = day.find(f => f.home === run.playerCode || f.away === run.playerCode);
  if (!fixture) throw new Error('player has no fixture on this matchday');
  return fixture.home === run.playerCode ? fixture.away : fixture.home;
}

function rowFor(rows: TableRow[], code: string): TableRow {
  const row = rows.find(r => r.code === code);
  if (!row) throw new Error(`no table row for ${code}`);
  return row;
}

function applyResult(rows: TableRow[], home: string, away: string, hg: number, ag: number): void {
  const h = rowFor(rows, home);
  const a = rowFor(rows, away);
  h.played++;
  a.played++;
  h.gf += hg;
  h.ga += ag;
  a.gf += ag;
  a.ga += hg;
  h.gd = h.gf - h.ga;
  a.gd = a.gf - a.ga;
  if (hg > ag) {
    h.won++;
    a.lost++;
    h.points += POINTS_WIN;
  } else if (hg < ag) {
    a.won++;
    h.lost++;
    a.points += POINTS_WIN;
  } else {
    h.drawn++;
    a.drawn++;
    h.points += POINTS_DRAW;
    a.points += POINTS_DRAW;
  }
}

/**
 * A simulated scoreline: a Poisson-ish draw whose mean comes from one side's
 * attack against the other's defence, capped at 5 so no simulated table ever
 * shows a scoreline the player could not have produced.
 */
export function simulateGoals(attacker: Team, defender: Team, rng: () => number): number {
  const mean = clamp(0.55 + (attacker.skill - defender.defence) * 0.28 + attacker.speed * 0.08, 0.15, 3.2);
  let goals = 0;
  let p = Math.exp(-mean);
  let acc = p;
  const roll = rng();
  while (acc < roll && goals < 5) {
    goals++;
    p *= mean / goals;
    acc += p;
  }
  return goals;
}

function simulateFixture(run: RunState, group: 0 | 1, fixture: Fixture): void {
  const home = teamByCode(fixture.home);
  const away = teamByCode(fixture.away);
  const hg = simulateGoals(home, away, run.rng);
  const ag = simulateGoals(away, home, run.rng);
  applyResult(run.tables[group], fixture.home, fixture.away, hg, ag);
}

/** Points, then goal difference, then goals scored, then a stable seeded key. */
export function standings(rows: readonly TableRow[]): TableRow[] {
  return rows.slice().sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.gd !== a.gd) return b.gd - a.gd;
    if (b.gf !== a.gf) return b.gf - a.gf;
    return a.tiebreak - b.tiebreak;
  });
}

/** Difficulty for the match about to be played. */
export function difficultyFor(run: RunState): number {
  const base =
    run.stage === 'group'
      ? STAGE_DIFFICULTY[Math.min(run.matchday, STAGE_DIFFICULTY.length - 1)]
      : run.stage === 'semi'
        ? SEMI_DIFFICULTY
        : FINAL_DIFFICULTY;
  if (!run.opponent) return base;
  const strength = teamStrength(teamByCode(run.opponent));
  // Ratings put `teamStrength` in [0.45, 0.75] around a 0.65 middling side, so
  // 0.4 keeps the swing inside the specification's +-0.08. A strong draw is
  // felt; it never buys the CPU anything but better decisions.
  return clamp(base + (strength - 0.65) * 0.4, 0, 0.95);
}

/** The two sides the player might meet, in bracket order. */
function qualifiers(run: RunState): { a1: string; a2: string; b1: string; b2: string } {
  const a = standings(run.tables[0]);
  const b = standings(run.tables[1]);
  return { a1: a[0].code, a2: a[1].code, b1: b[0].code, b2: b[1].code };
}

function simulateOtherSemi(run: RunState, playerOpponent: string): string {
  const q = qualifiers(run);
  const pairs: Array<[string, string]> = [
    [q.a1, q.b2],
    [q.b1, q.a2]
  ];
  const other = pairs.find(
    ([h, aw]) =>
      !(h === run.playerCode || aw === run.playerCode) &&
      !(h === playerOpponent || aw === playerOpponent)
  );
  if (!other) return q.b1 === run.playerCode ? q.a2 : q.b1;
  const [h, aw] = other;
  const home = teamByCode(h);
  const away = teamByCode(aw);
  const hg = simulateGoals(home, away, run.rng);
  const ag = simulateGoals(away, home, run.rng);
  if (hg === ag) return run.rng() < 0.5 ? h : aw;
  return hg > ag ? h : aw;
}

/**
 * Fold the player's finished match into the run and advance the stage. This is
 * the only mutator: every counter `runScore` reads is written here.
 */
export function recordPlayerMatch(run: RunState, result: MatchResult): void {
  if (run.over) return;
  const { goalsFor, goalsAgainst } = result;
  run.matchesPlayed++;
  run.goals += goalsFor;
  if (goalsAgainst === 0) run.cleanSheets++;
  if (result.wonOnPenalties) run.penaltyWins++;

  if (run.stage === 'group') {
    const opponent = run.opponent!;
    for (const fixture of run.schedule[0][run.matchday]) {
      if (fixture.home === run.playerCode || fixture.away === run.playerCode) continue;
      simulateFixture(run, 0, fixture);
    }
    for (const fixture of run.schedule[1][run.matchday]) simulateFixture(run, 1, fixture);
    applyResult(run.tables[0], run.playerCode, opponent, goalsFor, goalsAgainst);
    if (goalsFor > goalsAgainst) run.groupWins++;
    else if (goalsFor === goalsAgainst) run.groupDraws++;

    run.matchday++;
    if (run.matchday < 3) {
      run.opponent = playerFixtureOpponent(run);
      return;
    }
    const table = standings(run.tables[0]);
    run.qualified = table[0].code === run.playerCode || table[1].code === run.playerCode;
    if (!run.qualified) {
      run.stage = 'over';
      run.opponent = null;
      run.over = true;
      return;
    }
    const q = qualifiers(run);
    run.stage = 'semi';
    run.opponent = run.playerCode === q.a1 ? q.b2 : run.playerCode === q.a2 ? q.b1 : q.a1;
    run.otherSemiWinner = simulateOtherSemi(run, run.opponent);
    return;
  }

  const won = goalsFor > goalsAgainst || !!result.wonOnPenalties;
  if (!won) {
    run.stage = 'over';
    run.opponent = null;
    run.over = true;
    return;
  }
  if (run.stage === 'semi') {
    run.semiWon = true;
    run.stage = 'final';
    run.opponent = run.otherSemiWinner;
    return;
  }
  run.finalWon = true;
  run.champion = true;
  run.stage = 'over';
  run.opponent = null;
  run.over = true;
}

/**
 * The run's submittable score. Pure, monotonically non-decreasing across every
 * legal transition, and the only place the number is computed: the HUD
 * readout, the game-over total and the value handed to the scoreboard are all
 * this one call.
 */
export function runScore(run: RunState): number {
  return (
    run.matchesPlayed * SCORE_MATCH_PLAYED +
    run.goals * SCORE_GOAL +
    run.groupWins * SCORE_GROUP_WIN +
    run.groupDraws * SCORE_GROUP_DRAW +
    run.cleanSheets * SCORE_CLEAN_SHEET +
    (run.qualified ? SCORE_QUALIFIED : 0) +
    (run.semiWon ? SCORE_SEMI_WON : 0) +
    (run.finalWon ? SCORE_FINAL_WON : 0) +
    (run.champion ? SCORE_CHAMPION : 0) +
    run.penaltyWins * SCORE_PENALTY_WIN
  );
}

/** True when this stage's tie must be settled by a shootout if it is level. */
export function isKnockout(run: RunState): boolean {
  return run.stage === 'semi' || run.stage === 'final';
}

/** The player's team, for kits and codes. */
export function playerTeam(run: RunState): Team {
  return teamByCode(run.playerCode);
}

/** The group the player is in is always A; index 1 is the other one. */
export const PLAYER_GROUP = 0;
export { GROUP_SIZE };
