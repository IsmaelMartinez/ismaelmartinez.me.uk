/**
 * The defensive header (issue #308).
 *
 * The near-post header aim cleared 7.4's air-goals ceiling and no keeper model
 * could close it, because a header met 20 px in front of the keeper arrives in
 * 0.07 s, which is three pixels of dive. The contest that was actually missing
 * happens a beat earlier, in the air: `cpuAirStrike` was gated on the CPU's
 * *attacking* goal alone, so a defender stood under a cross dropping in his own
 * box had no path to touch it. Measured on the wing routine at the pinned
 * station `(-1, 90, 30)`, a CPU defender satisfied `canAirStrike` on 320 of the
 * 516 ticks where the human could head it, and that gate opened on 0 of them.
 *
 * The two halves below are deliberately different kinds of test. The mechanism
 * block is cheap and exact and pins the shape of the rule — who challenges,
 * for which balls, and what a defensive header does to the ball. The measured
 * block is the one that can go red for a balance reason rather than a coding
 * one, and it is the reason the mechanism block is not the whole file: a rule
 * that fires correctly and still leaves the exploit above the ceiling would
 * pass every assertion in the first block.
 */
import { describe, it, expect } from 'vitest';
import {
  createMatch,
  tickMatch,
  canAirStrike,
  AIR_STRIKE_MIN_TRAVEL,
  HEADER_Z,
  TRAP_Z,
  type MatchInput,
  type MatchState
} from '../../src/games/football/match';
import {
  CENTRE_X,
  PITCH_L,
  TEAM_SIZE,
  attackDir,
  ownGoalY
} from '../../src/games/football/pitch';
import { teamByCode } from '../../src/games/football/teams';
import { winger, HEADER_AIMS } from './football-policies';
import { keyed, tailOf, DIFFICULTIES } from './football-paired';
import { FLANK_AIR_CEILING, AIR_RUNG } from './football-wing-sweep';

const DT = 1 / 60;
const TEAMS: [ReturnType<typeof teamByCode>, ReturnType<typeof teamByCode>] = [
  teamByCode('ENG'),
  teamByCode('ESP')
];
const NEUTRAL: MatchInput = { x: 0, y: 0, a: false, b: false, c: false };

/**
 * A cross dropping in the CPU's own box with exactly one defender able to reach
 * it, everyone else parked off the scene.
 *
 * `roll` is what `m.rng` answers, which is the whole of the contest: the CPU
 * gets one roll per ball at `AIR_WIN_CHANCE`, so 0 makes him win it and 0.99
 * makes him lose it. Fixing the roll rather than seeding it is what lets the
 * two outcomes be asserted as a pair instead of hunted for across seeds.
 */
function crossIntoCpuBox(roll: number): MatchState {
  const m = createMatch({ rng: () => roll, difficulty: 0.45, teams: TEAMS });
  m.phase = 'play';
  m.phaseTimer = 0;
  m.owner = null;
  m.kickGrace = null;
  const goal = ownGoalY(1, m.swapped);
  const y = goal + attackDir(1, m.swapped) * 40;
  m.ball.x = CENTRE_X + 30;
  m.ball.y = y;
  m.ball.z = (TRAP_Z + HEADER_Z) / 2;
  m.ball.vx = 0;
  m.ball.vy = 0;
  m.ball.vz = -40;
  // Delivered by the human, from far enough away to be a real cross.
  m.lastFromCross = true;
  m.passInFlight = 0;
  m.passLofted = true;
  m.kickFrom = { x: m.ball.x, y: m.ball.y + AIR_STRIKE_MIN_TRAVEL + 40 };
  // Park everyone, then bring one defender back to the ball.
  for (const side of [0, 1] as const) {
    for (let idx = 1; idx < TEAM_SIZE; idx++) {
      const p = m.players[side][idx];
      p.x = 10 + idx * 6;
      p.y = PITCH_L / 2;
      p.strike = 0;
      p.down = 0;
      p.slide = 0;
    }
  }
  const back = m.players[1][1];
  back.x = m.ball.x + 6;
  back.y = m.ball.y;
  return m;
}

describe('a cross into the CPU box is contested (#308)', () => {
  it('leaves a defender able to head it, so the contest is about the rule', () => {
    const m = crossIntoCpuBox(0);
    expect(canAirStrike(m, 1, 1)).toBe(true);
  });

  it('is headed clear when the CPU wins the roll', () => {
    const m = crossIntoCpuBox(0);
    const shots = m.stats.shots[1];
    tickMatch(m, DT, NEUTRAL);
    // Away from his own goal: `clearUpfield` drives it in his attacking
    // direction, which is the one thing a defensive header has to do.
    expect(Math.sign(m.ball.vy)).toBe(attackDir(1, m.swapped));
    // And it is a clearance, not a shot at a goal four hundred pixels away —
    // `airStrike` would have counted one and kept the ball a cross.
    expect(m.stats.shots[1]).toBe(shots);
    expect(m.lastFromCross).toBe(false);
  });

  /**
   * A clearance is not a pass, and `clearUpfield` did not say so. `shoot` clears
   * `passInFlight` explicitly and `kick` does not do it for either of them, so
   * after a defensive header the ball stayed marked as an in-flight pass from
   * the side that crossed it. That reaches three places: `tryCapture` grades
   * intercept and receive radii off it, `offBallTarget` sends two attackers to
   * `airMeetPoint` for a ball their side no longer has in flight, and the gate
   * above would let the CPU challenge the same clearance again on the way down,
   * since the ball leaves the heading band and re-arms the roll.
   */
  it('stops the cleared ball being the crosser\'s pass', () => {
    const m = crossIntoCpuBox(0);
    tickMatch(m, DT, NEUTRAL);
    expect(m.passInFlight).toBeNull();
  });

  it('is left alone when the CPU loses the roll', () => {
    const m = crossIntoCpuBox(0.99);
    tickMatch(m, DT, NEUTRAL);
    expect(m.lastFromCross).toBe(true);
    expect(m.ball.vy).toBe(0);
  });

  /**
   * The narrow gate, and the reason it is narrow. Challenging for every ball
   * airborne over his own box — a rebound, a parry, a hoof, his own keeper's
   * goal kick — took `expert` under 7.2's win-rate floor at d = 0.25, which is
   * the same floor, with the same five matches of slack, that ruled out
   * `HEADER_SPREAD` as the lever for this issue.
   */
  it('ignores a ball in the same place that nobody delivered', () => {
    const m = crossIntoCpuBox(0);
    m.passInFlight = null;
    tickMatch(m, DT, NEUTRAL);
    expect(m.ball.vy).toBe(0);
  });

  it('ignores a ball its own side put there', () => {
    const m = crossIntoCpuBox(0);
    m.passInFlight = 1;
    tickMatch(m, DT, NEUTRAL);
    expect(m.ball.vy).toBe(0);
  });

  /**
   * `lastFromCross` records that the ball in the air was crossed, never by
   * whom, so heading an opponent's cross away used to collect the delivered-
   * ball reward for the side that had nothing to do with delivering it.
   * Nothing exercised it before — the only defensive header in the game was the
   * human pressing A in his own box — but it was already wrong there, and the
   * CPU's new one would have collected it on every clearance.
   */
  it('pays no assist for heading away a cross the other side delivered', () => {
    const m = createMatch({ rng: () => 0, difficulty: 0.45, teams: TEAMS });
    m.phase = 'play';
    m.phaseTimer = 0;
    m.owner = null;
    m.kickGrace = null;
    m.assist = null;
    const p = m.players[0][m.controlled];
    p.x = CENTRE_X;
    p.y = PITCH_L / 2;
    p.strike = 0;
    m.ball.x = CENTRE_X + 6;
    m.ball.y = PITCH_L / 2;
    m.ball.z = (TRAP_Z + HEADER_Z) / 2;
    m.lastFromCross = true;
    m.passInFlight = 1;
    m.kickFrom = { x: m.ball.x, y: m.ball.y + AIR_STRIKE_MIN_TRAVEL + 40 };
    expect(canAirStrike(m, 0, m.controlled)).toBe(true);
    tickMatch(m, DT, { ...NEUTRAL, a: true });
    expect(m.assist).toBeNull();
  });
});

/**
 * The bound the issue is actually judged on.
 *
 * `football-exploits.test.ts` and `football-wing-sweep.ts` both gate the wing
 * routine, and both do it on the aim `winger` ships with (`away`). The near
 * aim — the post the man heading it is stood beside — is the one that cleared
 * the ceiling, and no suite swept the aim axis, which is why it survived a
 * round of keeper work aimed at it. An aim nothing sweeps is an exploit nothing
 * can find, exactly as `CampAim` and `HeaderAim` already say.
 *
 * Gated on the rate rather than on the ladder margin, which is the cheaper half
 * of the plan's fallback: 300 matches a cell is one number per aim, where the
 * ladder margin is four paired rungs at 150 apiece. The whole file measures at
 * 17.6 s standalone — the two tests below share their matches through `keyed`,
 * so the second is nearly free — against a validate wall of seven minutes over
 * three shards.
 */
describe('the header aim axis stays under the ceiling (#308)', () => {
  const RATE_MATCHES = 300;
  const RATE_SEED0 = 3000001;

  function airRate(aim: (typeof HEADER_AIMS)[number]): number {
    const who = keyed(`air|${aim}`, () => winger(-1, 90, 30, aim));
    const seen = tailOf(who, DIFFICULTIES[AIR_RUNG], RATE_MATCHES, RATE_SEED0);
    return seen.air / seen.matches;
  }

  it('holds every aim under 7.4 air-goals ceiling at the pinned station', () => {
    const ceiling = FLANK_AIR_CEILING[AIR_RUNG];
    const measured = HEADER_AIMS.map(aim => `${aim}=${airRate(aim).toFixed(3)}`);
    const over = HEADER_AIMS.filter(aim => airRate(aim) > ceiling);
    expect(over, `against ${ceiling}: ${measured.join(' ')}`).toEqual([]);
  }, 120000);

  /**
   * And the nerf has to reshape rather than flatten. Before the defensive
   * header the four aims ran near 4.047 / away 3.393 / centre 2.233 / far
   * 1.277 air goals a match; after it the near cell runs 2.893.
   * The order is the thing being kept: a fix that made every aim equally
   * useless would clear the ceiling above and be a worse cabinet.
   *
   * The near-away pair is deliberately not asserted. It is the one comparison
   * the sample cannot resolve — 0.39 of a goal apart against a standard error
   * of about 0.13 a cell — so pinning it would be pinning noise, and the
   * separations that carry the claim are the ones against `centre` and `far`.
   */
  it('keeps the aims ordered rather than flattening them', () => {
    const near = airRate('near');
    const away = airRate('away');
    const centre = airRate('centre');
    const far = airRate('far');
    const seen = `near=${near.toFixed(3)} away=${away.toFixed(3)} centre=${centre.toFixed(3)} far=${far.toFixed(3)}`;
    expect(near, seen).toBeGreaterThan(centre);
    expect(away, seen).toBeGreaterThan(centre);
    expect(centre, seen).toBeGreaterThan(far);
    // The shipped aim stays a live threat rather than collapsing towards `far`.
    expect(away, seen).toBeGreaterThan(2);
  }, 120000);
});
