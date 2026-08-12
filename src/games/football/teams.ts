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

export interface Team {
  /** Three-letter code shown in the HUD and the group tables. */
  code: string;
  name: string;
  /** Shirt colour. */
  primary: string;
  /** Shorts / trim colour. */
  trim: string;
  /** All four ratings are 1..5. */
  speed: number;
  skill: number;
  defence: number;
  keeper: number;
}

export const TEAMS: readonly Team[] = [
  { code: 'AQU', name: 'Aquile', primary: '#FF9200', trim: '#000049', speed: 4, skill: 3, defence: 3, keeper: 4 },
  { code: 'TOR', name: 'Tori', primary: '#DB0000', trim: '#FFFFFF', speed: 3, skill: 4, defence: 4, keeper: 3 },
  { code: 'LUP', name: 'Lupi', primary: '#9200DB', trim: '#DBDBDB', speed: 3, skill: 3, defence: 4, keeper: 4 },
  { code: 'LEO', name: 'Leoni', primary: '#FFDB00', trim: '#004900', speed: 5, skill: 4, defence: 3, keeper: 3 },
  { code: 'VIP', name: 'Vipere', primary: '#00B649', trim: '#000000', speed: 4, skill: 4, defence: 3, keeper: 3 },
  { code: 'ORC', name: 'Orche', primary: '#0049DB', trim: '#FFFFFF', speed: 3, skill: 3, defence: 5, keeper: 4 },
  { code: 'FAL', name: 'Falchi', primary: '#B6B6B6', trim: '#DB0000', speed: 4, skill: 3, defence: 3, keeper: 3 },
  { code: 'CIN', name: 'Cinghiali', primary: '#6D4900', trim: '#FFDB00', speed: 2, skill: 3, defence: 4, keeper: 3 },
  { code: 'GAM', name: 'Gamberi', primary: '#FF4900', trim: '#FFFFFF', speed: 3, skill: 2, defence: 3, keeper: 2 },
  { code: 'DEL', name: 'Delfini', primary: '#49DBFF', trim: '#000049', speed: 4, skill: 4, defence: 2, keeper: 2 },
  { code: 'COR', name: 'Corvi', primary: '#242424', trim: '#DB9249', speed: 3, skill: 4, defence: 4, keeper: 4 },
  { code: 'API', name: 'Api', primary: '#FFDB00', trim: '#242424', speed: 2, skill: 2, defence: 2, keeper: 3 }
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
