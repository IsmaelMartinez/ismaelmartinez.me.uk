/**
 * The CALCIO '90 roster: twelve invented Italian-flavoured sides, eight of
 * which enter any given run. Real national squads, the Italia '90 licence and
 * its mascot are trademarked and are not reproduced here — these are original
 * nicknames with invented kits, so the names read the same in all three
 * locales.
 *
 * A thirteenth side, `SECRET_TEAM`, sits outside `TEAMS` — it is unlocked by
 * the Konami code on the select screen and is deliberately not in the pool the
 * draw reads, so it can only ever be *your* team.
 *
 * Every colour is on the Mega Drive's 3-bit-per-channel ladder
 * (00/24/49/6D/92/B6/DB/FF), which render.ts asserts.
 */
import { PALETTE } from './sprites';

/** A strip: shirt colour and the trim that goes with it. */
export interface Kit {
  primary: string;
  trim: string;
}

export interface Team {
  /** Three-letter code shown in the HUD and the group tables. */
  code: string;
  name: string;
  /** Shirt colour. */
  primary: string;
  /** Shorts / trim colour. */
  trim: string;
  /**
   * The change strip, worn when the first one would be unreadable in this
   * fixture — either against the opponent's or against the grass. Every side
   * carries one, exactly as a real squad does.
   */
  alt: Kit;
  /** All four ratings are 1..5. */
  speed: number;
  skill: number;
  defence: number;
  keeper: number;
}

export const TEAMS: readonly Team[] = [
  {
    code: 'AQU', name: 'Aquile', primary: '#FF9200', trim: '#000049',
    alt: { primary: '#FFFFFF', trim: '#000049' },
    speed: 4, skill: 3, defence: 3, keeper: 4
  },
  {
    code: 'TOR', name: 'Tori', primary: '#DB0000', trim: '#FFFFFF',
    alt: { primary: '#000049', trim: '#DB0000' },
    speed: 3, skill: 4, defence: 4, keeper: 3
  },
  {
    code: 'LUP', name: 'Lupi', primary: '#9200DB', trim: '#DBDBDB',
    alt: { primary: '#DBDBDB', trim: '#9200DB' },
    speed: 3, skill: 3, defence: 4, keeper: 4
  },
  {
    code: 'LEO', name: 'Leoni', primary: '#FFDB00', trim: '#004900',
    alt: { primary: '#004900', trim: '#FFDB00' },
    speed: 5, skill: 4, defence: 3, keeper: 3
  },
  {
    code: 'VIP', name: 'Vipere', primary: '#00B649', trim: '#000000',
    alt: { primary: '#FFFFFF', trim: '#00B649' },
    speed: 4, skill: 4, defence: 3, keeper: 3
  },
  {
    code: 'ORC', name: 'Orche', primary: '#0049DB', trim: '#FFFFFF',
    alt: { primary: '#FFDB00', trim: '#0049DB' },
    speed: 3, skill: 3, defence: 5, keeper: 4
  },
  {
    code: 'FAL', name: 'Falchi', primary: '#B6B6B6', trim: '#DB0000',
    alt: { primary: '#DB0000', trim: '#FFFFFF' },
    speed: 4, skill: 3, defence: 3, keeper: 3
  },
  {
    code: 'CIN', name: 'Cinghiali', primary: '#6D4900', trim: '#FFDB00',
    alt: { primary: '#49DBFF', trim: '#6D4900' },
    speed: 2, skill: 3, defence: 4, keeper: 3
  },
  {
    code: 'GAM', name: 'Gamberi', primary: '#FF4900', trim: '#FFFFFF',
    alt: { primary: '#000049', trim: '#FF4900' },
    speed: 3, skill: 2, defence: 3, keeper: 2
  },
  {
    code: 'DEL', name: 'Delfini', primary: '#49DBFF', trim: '#000049',
    alt: { primary: '#000049', trim: '#49DBFF' },
    speed: 4, skill: 4, defence: 2, keeper: 2
  },
  {
    code: 'COR', name: 'Corvi', primary: '#242424', trim: '#DB9249',
    alt: { primary: '#DBDBDB', trim: '#242424' },
    speed: 3, skill: 4, defence: 4, keeper: 4
  },
  {
    code: 'API', name: 'Api', primary: '#FFDB00', trim: '#242424',
    alt: { primary: '#B6B6B6', trim: '#242424' },
    speed: 2, skill: 2, defence: 2, keeper: 3
  }
];

/**
 * The thirteenth side: not in `TEAMS`, so it is never drawn as an opponent and
 * never appears on the select grid until the cabinet's Konami code unlocks it.
 *
 * It is a reward, not a cheat. 5/5/4/4 is one rung above the best of the
 * twelve (Leoni's 5/4/3/3 and Corvi's 3/4/4/4 both total 15, this totals 18)
 * and a long way short of 5/5/5/5 — the run still has to be won, and the
 * difficulty ladder in `tournament.ts` is untouched by who you picked. Like
 * the rest of the roster it is an invented nickname with an invented kit: no
 * national side, no licence, no mascot.
 */
export const SECRET_TEAM: Team = {
  code: 'FEN',
  name: 'Fenice',
  primary: '#DB2492',
  trim: '#FFDB00',
  alt: { primary: '#242424', trim: '#DB2492' },
  speed: 5,
  skill: 5,
  defence: 4,
  keeper: 4
};

/** The roster plus the secret side: what `teamByCode` resolves against. */
export const ALL_TEAMS: readonly Team[] = [...TEAMS, SECRET_TEAM];

/**
 * Keepers wear a third colour so they are never mistaken for an outfielder —
 * a readability win the original did not have. Index by side.
 */
export const KEEPER_KITS: readonly [string, string] = ['#00DB92', '#DB00DB'];

/* ------------------------------------------------------------------ */
/* strips: who changes, and against what                               */

/** The turf a strip has to be legible against, straight from the palette. */
export const GRASS = PALETTE.grass;

/**
 * How far apart two shirt colours have to be before a 14 px blob of one can
 * be told from a 14 px blob of the other, on the metric below.
 *
 * Calibrated against the three pairs the playtest called out — Corvi's black
 * on Cinghiali's brown (47), Aquile's orange on Gamberi's vermilion (49), and
 * Leoni and Api, who wear the *same* yellow (0) — and set just below the
 * closest pair that still reads, Tori's red on Cinghiali's brown at 71.
 */
export const KIT_CLASH = 70;

/**
 * The same metric against the grass. Deliberately tighter than `KIT_CLASH`:
 * the pitch is a constant, so a strip only changes for it when it genuinely
 * disappears into it. Vipere's `#00B649` (36) is the one kit on the roster
 * that does; the next closest, Cinghiali's brown, sits at 63 and stays.
 */
export const GRASS_CLASH = 50;

function channels(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16)
  ];
}

/**
 * Distance between two kit colours, green-weighted.
 *
 * Plain RGB distance calls `#242424` and `#6D4900` far apart because the red
 * channel does most of the work in the sum, while on screen they are two dark
 * blobs. The 2:4:3 weighting is the standard cheap stand-in for how much of
 * brightness each channel carries, and dividing by three keeps the numbers in
 * the same 0-255 range as the channels themselves.
 */
export function kitDistance(a: string, b: string): number {
  const [ar, ag, ab] = channels(a);
  const [br, bg, bb] = channels(b);
  const dr = ar - br;
  const dg = ag - bg;
  const db = ab - bb;
  return Math.round(Math.sqrt(2 * dr * dr + 4 * dg * dg + 3 * db * db) / 3);
}

/** True when a strip disappears into the turf. */
export function kitLostOnGrass(kit: Kit): boolean {
  return kitDistance(kit.primary, GRASS) < GRASS_CLASH;
}

export function firstKit(team: Team): Kit {
  return { primary: team.primary, trim: team.trim };
}

/**
 * Which strips a fixture is played in.
 *
 * Four combinations exist (each side's first strip or its change strip) and
 * this scores all four: a clash costs a flat 40 plus 3 a point of shortfall, a
 * strip lost in the grass costs 200, and *changing* costs 10 for the home side
 * and 6 for the away side. So an unclashing fixture is always played in first
 * strips, and when there is a clash the away side changes first — which is the
 * rule real football uses, and the flat part of the clash penalty is what
 * makes even a one-point clash worth a change strip.
 *
 * `home` is the player's side. Over the whole 13 x 13 roster every ordered
 * fixture comes out at least `KIT_CLASH` apart with both strips readable,
 * which `football-teams.test.ts` asserts by exhaustion.
 */
export function fixtureKits(home: Team, away: Team): [Kit, Kit] {
  const options: Array<[Kit, boolean]>[] = [
    [
      [firstKit(home), false],
      [home.alt, true]
    ],
    [
      [firstKit(away), false],
      [away.alt, true]
    ]
  ];
  let best: [Kit, Kit] = [firstKit(home), firstKit(away)];
  let bestScore = -Infinity;
  for (const [homeKit, homeChanged] of options[0]) {
    for (const [awayKit, awayChanged] of options[1]) {
      const gap = kitDistance(homeKit.primary, awayKit.primary);
      let score = 0;
      if (gap < KIT_CLASH) score -= 40 + (KIT_CLASH - gap) * 3;
      if (kitLostOnGrass(homeKit)) score -= 200;
      if (kitLostOnGrass(awayKit)) score -= 200;
      if (homeChanged) score -= 10;
      if (awayChanged) score -= 6;
      if (score > bestScore) {
        bestScore = score;
        best = [homeKit, awayKit];
      }
    }
  }
  return best;
}

/* ------------------------------------------------------------------ */
/* squads: names and shirt numbers                                     */

/**
 * Invented surnames in the same Italian flavour as the nicknames — no real
 * player is named here, for the same reason no real squad is. Uppercase A-Z
 * only, which is all the cabinet's 5 x 7 font carries, and short enough to sit
 * beside a minute on the full-time screen.
 */
const SURNAMES: readonly string[] = [
  'BRUNI', 'CALVI', 'DONATI', 'FALCO', 'GRECO', 'MARINI', 'NERI', 'ORLANDI',
  'PIRAS', 'QUARTA', 'RIZZO', 'SALVI', 'TOSI', 'VENTURI', 'ZANETTI', 'BELLINI',
  'CONTI', 'DURANTE', 'GALLO', 'IANNI', 'LUPINI', 'MORELLI', 'NIGRO', 'PAGANI',
  'RANIERI', 'SARTI', 'TIRELLI', 'VIOLA', 'ZOLA', 'AMATO', 'BERTI', 'CROCE'
];

/**
 * Shirt numbers by squad index, so a scorer line reads like a result rather
 * than "NO 6" every time. The formation is 2-3-1 in front of the keeper, and
 * the numbers follow it: 1 in goal, 2 and 5 at the back, 4, 8 and 10 across
 * the middle, 9 up front.
 */
export const SHIRT_NUMBERS: readonly number[] = [1, 2, 5, 4, 8, 10, 9];

export function shirtNumber(idx: number): number {
  return SHIRT_NUMBERS[idx] ?? idx + 1;
}

/**
 * The man wearing that shirt. A team's squad is a fixed slice of the surname
 * pool, offset by its code, so the same side always fields the same seven
 * names and a scorer is somebody rather than a number.
 */
export function playerName(team: Team, idx: number): string {
  let offset = 0;
  for (let i = 0; i < team.code.length; i++) offset += team.code.charCodeAt(i) * (i + 3);
  return SURNAMES[(offset + idx * 5) % SURNAMES.length];
}

/** How many teams enter a run, and how many sit in each group. */
export const GROUP_SIZE = 4;
export const RUN_TEAMS = GROUP_SIZE * 2;

export function teamByCode(code: string): Team {
  const team = ALL_TEAMS.find(t => t.code === code);
  if (!team) throw new Error(`unknown team code: ${code}`);
  return team;
}

/** A team's overall strength, 0..1, used to modulate difficulty and sims. */
export function teamStrength(team: Team): number {
  return (team.speed + team.skill + team.defence + team.keeper) / 20;
}

/** Fisher-Yates over a copy, drawing from the injected RNG. */
export function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export interface GroupDraw {
  /** Group A always contains the player's team. */
  a: Team[];
  b: Team[];
}

/**
 * Draw eight of the twelve into two groups of four. The player picks first, so
 * their team is placed into group A at a random slot and the remaining seven
 * are drawn from the rest of the roster.
 */
export function drawGroups(rng: () => number, playerCode: string): GroupDraw {
  const player = teamByCode(playerCode);
  const pool = shuffle(
    TEAMS.filter(t => t.code !== playerCode),
    rng
  ).slice(0, RUN_TEAMS - 1);
  const a = pool.slice(0, GROUP_SIZE - 1);
  const b = pool.slice(GROUP_SIZE - 1);
  a.splice(Math.floor(rng() * GROUP_SIZE), 0, player);
  return { a, b };
}
