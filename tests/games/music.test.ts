import { describe, it, expect } from 'vitest';
import { pitch, p } from '../../src/games/engine/pitch';
import type { GameAudioOptions } from '../../src/games/engine/audio';
import { SNAKE_MUSIC } from '../../src/games/snake/music';
import { CASCADE_MUSIC, BASE_TEMPO } from '../../src/games/cascade/music';
import {
  FOOTBALL_MUSIC,
  BASE_TEMPO as FOOTBALL_BASE_TEMPO
} from '../../src/games/football/music';

/**
 * Every cabinet's score, discovered rather than listed.
 *
 * The invariants below are only worth having if they cover a cabinet nobody
 * remembered to enrol, so the modules are found by glob and imported eagerly.
 * That import is load-bearing twice over: the scores are module-level
 * constants built from `pitch()` calls, which throw on a bad note name, so
 * merely pulling every `music.ts` into this suite is what turns a typo from a
 * dead cabinet page in production into a failure here. Nothing else catches
 * it — the build bundles these modules without ever running them.
 */
const MODULES = import.meta.glob('../../src/games/*/music.ts', { eager: true }) as Record<
  string,
  Record<string, unknown>
>;

function isScore(value: unknown): value is GameAudioOptions {
  return (
    typeof value === 'object' &&
    value !== null &&
    Array.isArray((value as GameAudioOptions).tracks)
  );
}

/** `{cabinet name} → its score`, keyed by the directory the module sits in. */
const DISCOVERED: { name: string; music: GameAudioOptions }[] = Object.entries(MODULES)
  .map(([path, mod]) => ({
    name: path.split('/').at(-2) as string,
    music: Object.values(mod).find(isScore) as GameAudioOptions
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

/**
 * The loop length each cabinet is written to, and the length it had before the
 * 2026-08-14 music round. The owner's brief was "at least double the length",
 * so the old figure is kept as the guarantee rather than as trivia: it is what
 * makes a future edit that quietly trims a score back fail rather than pass.
 *
 * Unlike the invariants, this table cannot be derived — but a cabinet missing
 * from it is caught below rather than silently skipped.
 */
const EXPECTED: Record<string, { beats: number; wasBeats: number }> = {
  snake: { beats: 32, wasBeats: 8 },
  cascade: { beats: 32, wasBeats: 14 },
  tanks: { beats: 32, wasBeats: 8 },
  city: { beats: 48, wasBeats: 16 },
  lemmings: { beats: 48, wasBeats: 16 },
  towerdefense: { beats: 48, wasBeats: 16 },
  park: { beats: 48, wasBeats: 24 },
  syndicate: { beats: 48, wasBeats: 16 },
  // Football is the one cabinet whose "before" was not a single loop length.
  // It predated the round with its score inline in `game.ts` and its voices
  // running 11, 8 and 8 beats — lines that never realigned, which is the bug
  // the equal-length invariant below exists to catch. 11 is the longest of the
  // three, so it is both the honest reading of how much music there was and
  // the strictest bar for the doubling assertion.
  football: { beats: 48, wasBeats: 11 }
};

/** Total length of one pass through a voice's looping line, in beats. */
function trackBeats(melody: { beats: number }[]): number {
  return melody.reduce((sum, n) => sum + n.beats, 0);
}

describe('pitch', () => {
  it('anchors on A4 = 440 Hz and doubles every octave', () => {
    expect(pitch('A4')).toBe(440);
    expect(pitch('A5')).toBeCloseTo(880, 6);
    expect(pitch('A3')).toBeCloseTo(220, 6);
    expect(pitch('A0')).toBeCloseTo(27.5, 6);
  });

  it('places the naturals at equal temperament', () => {
    expect(pitch('C4')).toBeCloseTo(261.63, 2);
    expect(pitch('E4')).toBeCloseTo(329.63, 2);
    expect(pitch('G4')).toBeCloseTo(392.0, 2);
    expect(pitch('B4')).toBeCloseTo(493.88, 2);
    // The C above middle C, i.e. the octave boundary is between B and C.
    expect(pitch('C5')).toBeCloseTo(523.25, 2);
  });

  it('treats a sharp and its enharmonic flat as the same pitch', () => {
    expect(pitch('A#3')).toBeCloseTo(pitch('Bb3'), 6);
    expect(pitch('D#5')).toBeCloseTo(pitch('Eb5'), 6);
    // A semitone up from A4 is the twelfth root of two.
    expect(pitch('A#4') / pitch('A4')).toBeCloseTo(Math.pow(2, 1 / 12), 6);
  });

  it('throws on an unparseable name rather than returning a silent fallback', () => {
    // These are authored constants evaluated at module load: a typo must fail
    // the build and this suite, not ship as a wrong or missing note.
    expect(() => pitch('H4')).toThrow();
    expect(() => pitch('C')).toThrow();
    expect(() => pitch('')).toThrow();
    expect(() => pitch('C4x')).toThrow();
    expect(() => pitch('Cb#4')).toThrow();
  });

  it('exports p as the same function, for terse score authoring', () => {
    expect(p).toBe(pitch);
    expect(p('C5')).toBe(pitch('C5'));
  });
});

describe('the arcade scores', () => {
  it('finds a score module for every cabinet, and expectations for every score', () => {
    // Guards the discovery itself: if the glob stopped matching, every
    // it.each below would vacuously pass over an empty list.
    expect(DISCOVERED.length).toBeGreaterThan(0);
    for (const { name, music } of DISCOVERED) {
      expect(music, `${name}/music.ts exports no GameAudioOptions`).toBeDefined();
      expect(EXPECTED[name], `${name} has no entry in EXPECTED`).toBeDefined();
    }
  });

  it.each(DISCOVERED)('$name loops every voice at the same length', ({ music }) => {
    // The voices advance on independent cursors, so unequal lengths do not
    // desynchronise gradually — they slide permanently. A lead of 25 beats over
    // a bass of 24 puts the tune's downbeat on a different bass note every time
    // round, which sounds like a mistake long before anyone can name it.
    const lengths = music.tracks.map(t => trackBeats(t.melody));
    for (const length of lengths) {
      expect(length).toBeCloseTo(lengths[0], 6);
    }
  });

  it.each(DISCOVERED)('$name is at least twice the length it was', ({ name, music }) => {
    const { beats, wasBeats } = EXPECTED[name];
    expect(trackBeats(music.tracks[0].melody)).toBeCloseTo(beats, 6);
    expect(beats).toBeGreaterThanOrEqual(wasBeats * 2);
  });

  it.each(DISCOVERED)('$name has a playable tempo and at least two voices', ({ music }) => {
    expect(music.tempo).toBeGreaterThan(0);
    expect(Number.isFinite(music.tempo)).toBe(true);
    expect(music.tracks.length).toBeGreaterThanOrEqual(2);
  });

  it.each(DISCOVERED)('$name has no note the scheduler would have to skip', ({ music }) => {
    for (const track of music.tracks) {
      expect(track.melody.length).toBeGreaterThan(0);
      for (const note of track.melody) {
        // A non-positive length is the one authoring value the engine has to
        // defend itself against (it would never advance the lookahead cursor).
        expect(note.beats).toBeGreaterThan(0);
        // A rest is freq 0; anything sounding stays inside the audible band.
        expect(note.freq === 0 || (note.freq >= 20 && note.freq <= 20000)).toBe(true);
      }
    }
  });

  it.each(DISCOVERED)('$name writes per-note levels as attenuation only', ({ music }) => {
    // The engine clamps, so an out-of-range value is inaudible rather than
    // broken — which is exactly why it is worth catching here instead.
    for (const track of music.tracks) {
      for (const note of track.melody) {
        if (note.gain === undefined) continue;
        // Both bounds are the engine's, not arbitrary: it clamps to 0.05-1, so
        // a gain outside that range is silently moved rather than rejected.
        expect(note.gain).toBeGreaterThanOrEqual(0.05);
        expect(note.gain).toBeLessThanOrEqual(1);
      }
    }
  });

  it('gives Cascade a base tempo its per-level ramp can wind up from', () => {
    expect(BASE_TEMPO).toBe(126);
    expect(CASCADE_MUSIC.tempo).toBe(BASE_TEMPO);
  });

  it('gives Football a base tempo its knockout ramp can wind up from', () => {
    // Same split as Cascade: the pace the score was written at belongs to the
    // arrangement, the stage ramp in `game.ts` belongs to the game.
    expect(FOOTBALL_BASE_TEMPO).toBe(132);
    expect(FOOTBALL_MUSIC.tempo).toBe(FOOTBALL_BASE_TEMPO);
  });

  it('keeps Snake to two voices, the cabinet that is deliberately minimal', () => {
    expect(SNAKE_MUSIC.tracks).toHaveLength(2);
    expect(SNAKE_MUSIC.echo).toBeUndefined();
    expect(SNAKE_MUSIC.tracks.every(t => t.envelope === undefined)).toBe(true);
  });
});
