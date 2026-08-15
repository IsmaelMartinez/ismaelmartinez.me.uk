/**
 * The CALCIO '90 roster: twelve national sides, eight of which enter any given
 * run. All twelve played at the 1990 tournament the cabinet homages, which is
 * where the spread of strength comes from — the hosts and the champions at the
 * top, Cameroon's raw pace and Scotland's group-stage exit at the bottom.
 *
 * Countries, not clubs, and no squads: the Italia '90 licence, its mascot and
 * every player of the era are somebody's property, but a country's name and
 * the colours it plays in are not. Names are the three-letter codes' countries
 * in plain unaccented capitals, so they read the same in all three site
 * locales and every character has a glyph in the cabinet's 5 x 7 font. Ten
 * letters is the ceiling: `YUGOSLAVIA` is 59 px at scale 1 and a select-grid
 * cell has 60 px inside it. That is also why the Dutch side is the
 * era-correct HOL / HOLLAND rather than an eleven-letter NETHERLANDS, which
 * would have run out of its cell and into its neighbour.
 *
 * A thirteenth side, `SECRET_TEAM`, sits outside `TEAMS` — it is unlocked by
 * the Konami code on the select screen and is deliberately not in the pool the
 * draw reads, so it can only ever be *your* team.
 *
 * Every colour is a national colour quantised to the Mega Drive's
 * 3-bit-per-channel ladder (00/24/49/6D/92/B6/DB/FF), which render.ts asserts.
 * Real sides clash far more than invented ones do — three blues, two identical
 * whites and two identical reds sit in these twelve — so each change strip is
 * picked to resolve its side's clashes rather than to look pretty, and
 * `football-render.test.ts` proves by exhaustion that every one of the 13 x 13
 * ordered fixtures comes out readable.
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
  // Hosts. The azzurri blue, and the meanest defence in the field.
  {
    code: 'ITA', name: 'Italy', primary: '#0049B6', trim: '#FFFFFF',
    alt: { primary: '#FFFFFF', trim: '#0049B6' },
    speed: 3, skill: 4, defence: 5, keeper: 3
  },
  // The canary yellow, with the change strip Brazil actually carries: blue.
  {
    code: 'BRA', name: 'Brazil', primary: '#FFDB00', trim: '#009249',
    alt: { primary: '#0024B6', trim: '#FFDB00' },
    speed: 4, skill: 5, defence: 3, keeper: 3
  },
  // Champions. White with black trim; the change strip is the green one, taken
  // as dark as the ladder allows so it clears the grass (see GRASS_CLASH).
  {
    code: 'GER', name: 'Germany', primary: '#FFFFFF', trim: '#000000',
    alt: { primary: '#004900', trim: '#FFFFFF' },
    speed: 3, skill: 4, defence: 4, keeper: 4
  },
  // Sky blue, and a navy change strip — it has to be dark, because Argentina's
  // sky reads as neither Italy's blue nor Uruguay's.
  {
    code: 'ARG', name: 'Argentina', primary: '#92DBFF', trim: '#FFFFFF',
    alt: { primary: '#000049', trim: '#92DBFF' },
    speed: 3, skill: 5, defence: 3, keeper: 3
  },
  // HOL, not NED: the era's code, and a name that fits a select-grid cell.
  {
    code: 'HOL', name: 'Holland', primary: '#FF6D00', trim: '#FFFFFF',
    alt: { primary: '#FFFFFF', trim: '#FF6D00' },
    speed: 4, skill: 5, defence: 3, keeper: 2
  },
  // White like Germany, so the red change strip does all the work.
  {
    code: 'ENG', name: 'England', primary: '#FFFFFF', trim: '#000049',
    alt: { primary: '#DB0000', trim: '#FFFFFF' },
    speed: 3, skill: 3, defence: 4, keeper: 4
  },
  // Red like Belgium and like Cameroon's change strip; navy resolves all three.
  {
    code: 'ESP', name: 'Spain', primary: '#DB0000', trim: '#000049',
    alt: { primary: '#000049', trim: '#DB0000' },
    speed: 3, skill: 4, defence: 4, keeper: 3
  },
  {
    code: 'BEL', name: 'Belgium', primary: '#DB0000', trim: '#FFDB00',
    alt: { primary: '#242424', trim: '#FFDB00' },
    speed: 3, skill: 3, defence: 3, keeper: 4
  },
  {
    code: 'YUG', name: 'Yugoslavia', primary: '#2449DB', trim: '#FFFFFF',
    alt: { primary: '#FFFFFF', trim: '#2449DB' },
    speed: 3, skill: 4, defence: 3, keeper: 2
  },
  {
    code: 'URU', name: 'Uruguay', primary: '#49B6FF', trim: '#000000',
    alt: { primary: '#000000', trim: '#49B6FF' },
    speed: 2, skill: 3, defence: 4, keeper: 3
  },
  // The one side that disappears into the pitch, so it plays every fixture in
  // its red change strip. Fastest legs on the roster and the rawest finishing.
  {
    code: 'CMR', name: 'Cameroon', primary: '#009249', trim: '#DB0000',
    alt: { primary: '#DB0000', trim: '#009249' },
    speed: 5, skill: 2, defence: 2, keeper: 2
  },
  {
    code: 'SCO', name: 'Scotland', primary: '#000049', trim: '#FFFFFF',
    alt: { primary: '#FFFFFF', trim: '#000049' },
    speed: 2, skill: 2, defence: 3, keeper: 2
  }
];

/**
 * The thirteenth side: not in `TEAMS`, so it is never drawn as an opponent and
 * never appears on the select grid until the cabinet's Konami code unlocks it.
 *
 * France is the side that is *not* in the twelve: the one great European team
 * of the era that never made it to the 1990 finals at all. Hiding it behind
 * the Konami code is the joke — the cabinet only lets you play as les Bleus if
 * you know the code.
 *
 * It is a reward, not a cheat. 5/5/4/4 is one rung above the best of the
 * twelve (Italy, Brazil and Germany all total 15, this totals 18) and a long
 * way short of 5/5/5/5 — the run still has to be won, and the difficulty
 * ladder in `tournament.ts` is untouched by who you picked.
 *
 * Its blue is a rung darker than Italy's azzurri and Yugoslavia's royal, which
 * is not enough to read apart on its own (53 and 67, both under `KIT_CLASH`);
 * the white change strip is what settles those fixtures.
 */
export const SECRET_TEAM: Team = {
  code: 'FRA',
  name: 'France',
  primary: '#000092',
  trim: '#FFFFFF',
  alt: { primary: '#FFFFFF', trim: '#000092' },
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
 * Calibrated against the pairs a real field throws up — England and Germany,
 * who wear the *same* white (0), Spain and Belgium, who wear the same red (0),
 * Italy's azzurri on Yugoslavia's royal blue (27) and Argentina's sky on
 * Uruguay's (42) — and left just below the closest pair that still reads,
 * Brazil's yellow on Holland's orange at 73. That 73 is also the tightest
 * first-strip fixture in the whole 13 x 13 matrix, so it is the pair the
 * threshold is really holding the line for.
 */
export const KIT_CLASH = 70;

/**
 * The same metric against the grass. Deliberately tighter than `KIT_CLASH`:
 * the pitch is a constant, so a strip only changes for it when it genuinely
 * disappears into it. Cameroon's `#009249` (27) is the one first strip on the
 * roster that does, so Cameroon plays every fixture in red; the next closest
 * kit anywhere is Germany's dark-green change strip at 56, which clears it and
 * stays. Green is the colour this rule is about — a lighter bottle green sits
 * in the thirties and a side wearing it is invisible.
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
 * which `football-render.test.ts` asserts by exhaustion.
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
