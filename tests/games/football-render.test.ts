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
import { DEFAULT_TEXT } from '../../src/games/football/render';
import { KEEPER_KITS, TEAMS } from '../../src/games/football/teams';
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
    for (const team of TEAMS) corpus.push(team.code, team.name);
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
    for (const team of TEAMS) {
      expect(isLadderLegal(team.primary), `${team.code} primary`).toBe(true);
      expect(isLadderLegal(team.trim), `${team.code} trim`).toBe(true);
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
