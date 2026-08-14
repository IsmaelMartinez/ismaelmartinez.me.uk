import { describe, it, expect } from 'vitest';
import { pitch, p } from '../../src/games/engine/pitch';
import type { GameAudioOptions } from '../../src/games/engine/audio';
import { SNAKE_MUSIC } from '../../src/games/snake/music';
import { CASCADE_MUSIC, BASE_TEMPO } from '../../src/games/cascade/music';
import { TANKS_MUSIC } from '../../src/games/tanks/music';
import { CITY_MUSIC } from '../../src/games/city/music';
import { LEMMINGS_MUSIC } from '../../src/games/lemmings/music';
import { TOWERDEFENSE_MUSIC } from '../../src/games/towerdefense/music';
import { PARK_MUSIC } from '../../src/games/park/music';
import { SYNDICATE_MUSIC } from '../../src/games/syndicate/music';

/**
 * Every cabinet's score, with the loop length it is written to and the length
 * it had before the 2026-08-14 music round. The owner's brief for that round
 * was "at least double the length", so the old figure is kept here as the
 * guarantee rather than as trivia: it is what makes a future edit that quietly
 * trims a score back fail rather than pass.
 */
const SCORES: { name: string; music: GameAudioOptions; beats: number; wasBeats: number }[] = [
  { name: 'snake', music: SNAKE_MUSIC, beats: 32, wasBeats: 8 },
  { name: 'cascade', music: CASCADE_MUSIC, beats: 32, wasBeats: 14 },
  { name: 'tanks', music: TANKS_MUSIC, beats: 32, wasBeats: 8 },
  { name: 'city', music: CITY_MUSIC, beats: 48, wasBeats: 16 },
  { name: 'lemmings', music: LEMMINGS_MUSIC, beats: 48, wasBeats: 16 },
  { name: 'towerdefense', music: TOWERDEFENSE_MUSIC, beats: 48, wasBeats: 16 },
  { name: 'park', music: PARK_MUSIC, beats: 48, wasBeats: 24 },
  { name: 'syndicate', music: SYNDICATE_MUSIC, beats: 48, wasBeats: 16 }
];

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
  it.each(SCORES)('$name loops every voice at the same length', ({ music, beats }) => {
    // The voices advance on independent cursors, so unequal lengths do not
    // desynchronise gradually — they slide permanently. A lead of 25 beats over
    // a bass of 24 puts the tune's downbeat on a different bass note every time
    // round, which sounds like a mistake long before anyone can name it.
    for (const track of music.tracks) {
      expect(trackBeats(track.melody)).toBeCloseTo(beats, 6);
    }
  });

  it.each(SCORES)('$name is at least twice the length it was', ({ beats, wasBeats }) => {
    expect(beats).toBeGreaterThanOrEqual(wasBeats * 2);
  });

  it.each(SCORES)('$name has a playable tempo and at least two voices', ({ music }) => {
    expect(music.tempo).toBeGreaterThan(0);
    expect(Number.isFinite(music.tempo)).toBe(true);
    expect(music.tracks.length).toBeGreaterThanOrEqual(2);
  });

  it.each(SCORES)('$name has no note the scheduler would have to skip', ({ music }) => {
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

  it.each(SCORES)('$name writes per-note levels as attenuation only', ({ music }) => {
    // The engine clamps, so an out-of-range value is inaudible rather than
    // broken — which is exactly why it is worth catching here instead.
    for (const track of music.tracks) {
      for (const note of track.melody) {
        if (note.gain === undefined) continue;
        expect(note.gain).toBeGreaterThan(0);
        expect(note.gain).toBeLessThanOrEqual(1);
      }
    }
  });

  it('gives Cascade a base tempo its per-level ramp can wind up from', () => {
    expect(BASE_TEMPO).toBe(126);
    expect(CASCADE_MUSIC.tempo).toBe(BASE_TEMPO);
  });

  it('keeps Snake to two voices, the cabinet that is deliberately minimal', () => {
    expect(SNAKE_MUSIC.tracks).toHaveLength(2);
    expect(SNAKE_MUSIC.echo).toBeUndefined();
    expect(SNAKE_MUSIC.tracks.every(t => t.envelope === undefined)).toBe(true);
  });
});
