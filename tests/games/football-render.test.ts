/**
 * The presentation layer's two testable invariants, per the specification's
 * section 11: font coverage and palette legality. Everything else in
 * render.ts needs a canvas, and the repo's vitest run has no DOM, so drawing
 * is verified in a browser rather than asserted here.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  FALLBACK,
  GLYPHS,
  GLYPH_H,
  GLYPH_W,
  GLYPH_SOURCE,
  hasGlyph,
  normaliseText,
  textWidth
} from '../../src/games/football/font';
import { CROWD_COLOURS, PALETTE } from '../../src/games/football/sprites';
import { DEFAULT_TEXT, FB_H, FB_W, integerScale } from '../../src/games/football/render';
import {
  ALL_TEAMS,
  GRASS,
  KEEPER_KITS,
  KIT_CLASH,
  SECRET_TEAM,
  SHIRT_NUMBERS,
  TEAMS,
  firstKit,
  fixtureKits,
  kitDistance,
  kitLostOnGrass,
  playerName,
  shirtNumber,
  teamByCode
} from '../../src/games/football/teams';
import { TEAM_SIZE } from '../../src/games/football/pitch';
import { translations, locales } from '../../src/i18n/translations';

/** The Mega Drive's 3-bit-per-channel ladder, per 8.1. */
const LADDER = ['00', '24', '49', '6D', '92', 'B6', 'DB', 'FF'];

function isLadderLegal(hex: string): boolean {
  if (!/^#[0-9A-F]{6}$/.test(hex)) return false;
  for (let i = 1; i < 7; i += 2) {
    if (!LADDER.includes(hex.slice(i, i + 2))) return false;
  }
  return true;
}

const SOURCE_FILES = ['font.ts', 'sprites.ts', 'render.ts'];

function sourceOf(file: string): string {
  return readFileSync(resolve(process.cwd(), 'src/games/football', file), 'utf8');
}

describe('font table', () => {
  it('gives every glyph a 7 x 5 cell', () => {
    for (const [ch, art] of Object.entries(GLYPH_SOURCE)) {
      const rows = art.split('|');
      expect(rows, `glyph ${ch} row count`).toHaveLength(GLYPH_H);
      for (const row of rows) {
        expect(row.length, `glyph ${ch} row "${row}"`).toBe(GLYPH_W);
        expect(row).toMatch(/^[.#]+$/);
      }
    }
  });

  it('covers the alphabet, the digits and the fallback', () => {
    for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ') {
      expect(hasGlyph(ch), `missing glyph for "${ch}"`).toBe(true);
    }
    expect(hasGlyph(FALLBACK)).toBe(true);
  });

  it('measures text as glyph cells plus tracking', () => {
    expect(textWidth('')).toBe(0);
    expect(textWidth('A')).toBe(GLYPH_W);
    expect(textWidth('AB')).toBe(GLYPH_W * 2 + 1);
    expect(textWidth('AB', 3)).toBe((GLYPH_W * 2 + 1) * 3);
  });

  /**
   * The regression the specification asks for: every character the cabinet
   * can put on screen has a glyph, and the `?` fallback never fires. The
   * corpus is every string the renderer owns, every team name and code, and
   * every `fun.football.*` string in all three locales — which is what forces
   * the accented capitals Spanish and Catalan need.
   */
  it('has a glyph for every character the game can display', () => {
    const corpus: string[] = [];
    for (const value of Object.values(DEFAULT_TEXT)) {
      if (Array.isArray(value)) corpus.push(...value);
      else corpus.push(value as string);
    }
    for (const team of ALL_TEAMS) {
      corpus.push(team.code, team.name);
      // Every man who can appear on a full-time scorer line.
      for (let idx = 0; idx < TEAM_SIZE; idx++) corpus.push(playerName(team, idx));
    }
    for (const locale of locales) {
      const table = translations[locale] as Record<string, string>;
      for (const [key, value] of Object.entries(table)) {
        if (key.startsWith('fun.football.')) corpus.push(value);
      }
    }
    // Placeholders such as {team} are substituted before anything is drawn.
    const missing = new Set<string>();
    for (const entry of corpus) {
      for (const ch of normaliseText(entry.replace(/\{[^}]*\}/g, ''))) {
        if (!(ch in GLYPHS)) missing.add(ch);
      }
    }
    expect([...missing].join(''), 'characters with no glyph').toBe('');
  });
});

describe('palette', () => {
  it('keeps every declared colour on the Mega Drive ladder', () => {
    for (const [role, hex] of Object.entries(PALETTE)) {
      expect(isLadderLegal(hex), `${role} = ${hex}`).toBe(true);
    }
    for (const hex of CROWD_COLOURS) {
      expect(isLadderLegal(hex), hex).toBe(true);
    }
    for (const team of ALL_TEAMS) {
      expect(isLadderLegal(team.primary), `${team.code} primary`).toBe(true);
      expect(isLadderLegal(team.trim), `${team.code} trim`).toBe(true);
      expect(isLadderLegal(team.alt.primary), `${team.code} change primary`).toBe(true);
      expect(isLadderLegal(team.alt.trim), `${team.code} change trim`).toBe(true);
    }
    for (const kit of KEEPER_KITS) {
      expect(isLadderLegal(kit), kit).toBe(true);
    }
  });

  /**
   * No colour is drawn outside the declared palette: the pixel layer's source
   * files may not carry a hex literal that is not a `PALETTE` value. Team
   * kits reach the sprites as arguments, never as literals, so this catches a
   * stray `#333` the moment it is typed.
   */
  it('draws no colour that is not a palette entry', () => {
    const declared = new Set<string>([...Object.values(PALETTE), ...CROWD_COLOURS]);
    for (const file of SOURCE_FILES) {
      const literals = sourceOf(file).match(/#[0-9A-Fa-f]{3,8}\b/g) ?? [];
      for (const literal of literals) {
        expect(isLadderLegal(literal.toUpperCase()), `${file}: ${literal}`).toBe(true);
        expect(declared.has(literal.toUpperCase()), `${file}: ${literal} is not in PALETTE`).toBe(true);
      }
    }
  });
});

/**
 * The integer blit, which is the whole of 2.1 and the thing a stylesheet is
 * most able to undo. `integerScale` answers in *device* pixels: the canvas's
 * backing store is the framebuffer times this number and its CSS box is that
 * many device pixels, so one framebuffer pixel is always a whole square block
 * of screen. The regression this pins is the shipped one — a 960-wide backing
 * store displayed in a 716 px box, a 0.746x downscale, a quarter of the rows
 * and columns dropped by the browser's resampler.
 */
describe('integer scaling', () => {
  it('never returns a fractional or zero scale', () => {
    for (let width = 40; width <= 4000; width += 7) {
      for (const dpr of [1, 1.5, 2, 2.625, 3]) {
        const scale = integerScale(width, 4000, dpr);
        expect(Number.isInteger(scale)).toBe(true);
        expect(scale).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('fits the box it is given, at every device ratio', () => {
    for (let width = 320; width <= 2000; width += 13) {
      for (const dpr of [1, 1.5, 2, 2.625, 3]) {
        const scale = integerScale(width, 4000, dpr);
        // The drawn width in device pixels never exceeds the box's, and one
        // scale more would not have fitted — this is the *largest* whole one.
        expect(FB_W * scale).toBeLessThanOrEqual(width * dpr);
        expect(FB_W * (scale + 1)).toBeGreaterThan(width * dpr);
      }
    }
  });

  it('is bound by height when height is the tighter axis', () => {
    // A landscape phone: plenty of width, very little height.
    expect(integerScale(1200, 240, 1)).toBe(1);
    expect(integerScale(1200, 460, 1)).toBe(2);
    expect(integerScale(1200, 700, 1)).toBe(3);
  });

  it('lands on the scales the real page uses', () => {
    // The 720 px container, less its 2 px borders, at each common ratio.
    expect(integerScale(716, 900, 1)).toBe(2);
    expect(integerScale(716, 900, 2)).toBe(4);
    expect(integerScale(716, 900, 3)).toBe(6);
    // A phone at 360 CSS px: still a whole scale, never a resample.
    expect(integerScale(360, 800, 2)).toBe(2);
    expect(integerScale(360, 800, 3)).toBe(3);
  });

  it('keeps the framebuffer aspect exact at every scale', () => {
    for (const dpr of [1, 2, 3]) {
      const scale = integerScale(1000, 1000, dpr);
      expect((FB_W * scale) / (FB_H * scale)).toBeCloseTo(FB_W / FB_H, 10);
    }
  });
});

/**
 * Change strips. The playtest's finding was that the draw put teams on the
 * pitch in kits nobody could tell apart — Corvi's black against Cinghiali's
 * brown, Aquile's orange against Gamberi's vermilion, and Vipere's green
 * against the grass itself. Real football answers that with a change strip
 * and so does the cabinet, decided once per fixture.
 */
describe('kit clashes', () => {
  it('leaves every fixture in two strips that read apart, on grass', () => {
    for (const home of ALL_TEAMS) {
      for (const away of ALL_TEAMS) {
        if (home === away) continue;
        const [homeKit, awayKit] = fixtureKits(home, away);
        const label = `${home.code} v ${away.code}`;
        expect(kitDistance(homeKit.primary, awayKit.primary), label).toBeGreaterThanOrEqual(KIT_CLASH);
        expect(kitLostOnGrass(homeKit), `${label} home on grass`).toBe(false);
        expect(kitLostOnGrass(awayKit), `${label} away on grass`).toBe(false);
      }
    }
  });

  it('keeps both first strips when they already read apart', () => {
    // Tori's red against Orche's blue: nothing to solve, so nobody changes.
    const [homeKit, awayKit] = fixtureKits(teamByCode('TOR'), teamByCode('ORC'));
    expect(homeKit).toEqual(firstKit(teamByCode('TOR')));
    expect(awayKit).toEqual(firstKit(teamByCode('ORC')));
  });

  it('changes the away side for each clash the playtest named', () => {
    const clashes: Array<[string, string]> = [
      ['COR', 'CIN'],
      ['AQU', 'GAM'],
      ['LEO', 'API']
    ];
    for (const [homeCode, awayCode] of clashes) {
      const home = teamByCode(homeCode);
      const away = teamByCode(awayCode);
      // The pair has to be a clash in the first place, or the test proves
      // nothing about the resolution.
      expect(kitDistance(home.primary, away.primary), `${homeCode}/${awayCode}`).toBeLessThan(KIT_CLASH);
      const [homeKit, awayKit] = fixtureKits(home, away);
      expect(homeKit, `${homeCode} keeps its first strip`).toEqual(firstKit(home));
      expect(awayKit, `${awayCode} changes`).toEqual(away.alt);
    }
  });

  it('takes Vipere out of their grass-green shirt in every fixture', () => {
    const vipere = teamByCode('VIP');
    expect(kitDistance(vipere.primary, GRASS)).toBeLessThan(KIT_CLASH);
    for (const other of ALL_TEAMS) {
      if (other === vipere) continue;
      expect(fixtureKits(vipere, other)[0], `VIP at home v ${other.code}`).toEqual(vipere.alt);
      expect(fixtureKits(other, vipere)[1], `VIP away at ${other.code}`).toEqual(vipere.alt);
    }
  });
});

/**
 * Squads. The full-time screen used to read `NO 6` for almost every goal,
 * because it drew the squad index and the striker is index 6; a scorer is now
 * a shirt number from the formation and a name from his side's squad.
 */
describe('squads', () => {
  it('numbers the seven shirts by position, with no repeats', () => {
    expect(SHIRT_NUMBERS).toHaveLength(TEAM_SIZE);
    expect(new Set(SHIRT_NUMBERS).size).toBe(TEAM_SIZE);
    // The keeper is index 0 and wears 1; the lone striker wears 9.
    expect(shirtNumber(0)).toBe(1);
    expect(shirtNumber(TEAM_SIZE - 1)).toBe(9);
  });

  it('fields seven different, stable names per side', () => {
    for (const team of ALL_TEAMS) {
      const squad = Array.from({ length: TEAM_SIZE }, (_, idx) => playerName(team, idx));
      expect(new Set(squad).size, `${team.code} squad ${squad.join()}`).toBe(TEAM_SIZE);
      for (const name of squad) {
        expect(name).toMatch(/^[A-Z]+$/);
        // Long enough to read as a name, short enough to sit beside a minute.
        expect(name.length).toBeGreaterThanOrEqual(4);
        expect(name.length).toBeLessThanOrEqual(8);
      }
      expect(playerName(team, 3), 'the same shirt is the same man').toBe(squad[3]);
    }
  });
});

/**
 * The hidden thirteenth side. It is a reward, so it has to be better than the
 * roster — and it is not a cheat, so it has to be beatable and it must never
 * turn up as somebody else's opponent.
 */
describe('the secret team', () => {
  it('stays out of the roster the draw and the grid read', () => {
    expect(TEAMS).toHaveLength(12);
    expect(TEAMS.some(t => t.code === SECRET_TEAM.code)).toBe(false);
    expect(ALL_TEAMS).toHaveLength(13);
    expect(ALL_TEAMS[ALL_TEAMS.length - 1]).toBe(SECRET_TEAM);
  });

  it('carries a three-letter code nobody else uses', () => {
    expect(SECRET_TEAM.code).toHaveLength(3);
    expect(TEAMS.filter(t => t.code === SECRET_TEAM.code)).toHaveLength(0);
    expect(TEAMS.filter(t => t.name === SECRET_TEAM.name)).toHaveLength(0);
  });

  it('rates at the top of the range without being unbeatable', () => {
    const total = (t: typeof SECRET_TEAM) => t.speed + t.skill + t.defence + t.keeper;
    const best = Math.max(...TEAMS.map(total));
    expect(total(SECRET_TEAM)).toBeGreaterThan(best);
    // Short of a perfect side: the run still has to be won.
    expect(total(SECRET_TEAM)).toBeLessThan(20);
    for (const rating of [SECRET_TEAM.speed, SECRET_TEAM.skill, SECRET_TEAM.defence, SECRET_TEAM.keeper]) {
      expect(rating).toBeGreaterThanOrEqual(1);
      expect(rating).toBeLessThanOrEqual(5);
    }
  });
});
