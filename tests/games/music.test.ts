import { describe, it, expect } from 'vitest';
import { pitch, p } from '../../src/games/engine/pitch';
import { scoreSeconds, type GameAudioOptions, type MusicProfile, type Note } from '../../src/games/engine/audio';
import {
  PASS_FLOOR_SECONDS,
  barRhythms,
  failedGates,
  leadIndex,
  lowestVoiceIndex,
  passLine,
  passSecondsAtFastest,
  seamArrivals,
  unsyncopatedWindows
} from './music-gates';
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

/** The directory a score module sits in, which is the cabinet's name. */
const cabinetOf = (path: string): string => path.split('/').at(-2) as string;

/**
 * Every score every module exports, with the module's profile. The profile is
 * found by its export name, `MUSIC_PROFILE`, which every score module carries
 * beside its `GameAudioOptions`. A cabinet with one score is named after its
 * directory; one with several (Critter Rescue's four acts) gets an entry per
 * score, named `cabinet/EXPORT`, so no score it plays escapes the gates.
 */
const DISCOVERED: { name: string; cabinet: string; music: GameAudioOptions; profile: MusicProfile }[] =
  Object.entries(MODULES)
    .flatMap(([path, mod]) => {
      const scores = Object.entries(mod).filter(([, value]) => isScore(value));
      return scores.map(([exported, music]) => ({
        name: scores.length > 1 ? `${cabinetOf(path)}/${exported}` : cabinetOf(path),
        cabinet: cabinetOf(path),
        music: music as GameAudioOptions,
        profile: mod.MUSIC_PROFILE as MusicProfile
      }));
    })
    .sort((a, b) => a.name.localeCompare(b.name));

/**
 * The loop length each cabinet had before the 2026-08-14 music round, whose
 * brief was "at least double the length". The exact beat count that round set
 * is no longer pinned: round 2's floor is in seconds (`PASS_FLOOR_SECONDS`, at
 * the fastest tempo) and every rescore would otherwise have to edit one shared
 * table. The old figure stays as a floor in beats because it is the only
 * length guard on a cabinet whose `gatePending` still switches the seconds
 * floor off, so a score cannot be quietly trimmed back while it waits.
 *
 * Unlike the invariants, this table cannot be derived — but a cabinet missing
 * from it is caught below rather than silently skipped.
 */
const WAS_BEATS: Record<string, number> = {
  snake: 8,
  cascade: 14,
  tanks: 8,
  city: 16,
  lemmings: 16,
  towerdefense: 16,
  park: 24,
  syndicate: 16,
  // Football is the one cabinet whose "before" was not a single loop length.
  // It predated the round with its score inline in `game.ts` and its voices
  // running 11, 8 and 8 beats — lines that never realigned, which is the bug
  // the equal-length invariant below exists to catch. 11 is the longest of the
  // three, so it is both the honest reading of how much music there was and
  // the strictest bar for the doubling assertion.
  football: 11
};

/** Total length of one pass through a voice's looping line, in beats. */
function trackBeats(melody: { beats: number }[]): number {
  return melody.reduce((sum, n) => sum + n.beats, 0);
}

/**
 * The blocks a score is built from, each one line per track: a score without
 * a form is one block, its tracks' melodies, and one with a form is its intro
 * and each of its sections. Every invariant on lines is checked per block.
 */
function blocks(music: GameAudioOptions): { label: string; lines: Note[][] }[] {
  if (!music.form) return [{ label: 'loop', lines: music.tracks.map(t => t.melody ?? []) }];
  const { intro, sections } = music.form;
  return [
    ...(intro ? [{ label: 'intro', lines: intro }] : []),
    ...Object.entries(sections).map(([label, lines]) => ({ label, lines }))
  ];
}

/**
 * The blocks whose lines do not all last the same number of beats, or that do
 * not give every track a line. The voices share a clock, so inside a block
 * unequal lengths do not drift and recover, they slide; a form re-aligns its
 * voices at each section boundary, but a short line still leaves a hole at
 * the end of its section.
 */
function unequalBlocks(music: GameAudioOptions): string[] {
  return blocks(music)
    .filter(({ lines }) => {
      if (lines.length !== music.tracks.length) return true;
      const first = trackBeats(lines[0]);
      return lines.some(line => Math.abs(trackBeats(line) - first) > 1e-6);
    })
    .map(b => b.label);
}

/** One pass of a score's loop in beats, intro and rests left out. At 60 bpm a beat is a second. */
function passBeats(music: GameAudioOptions): number {
  return scoreSeconds(music, 60).pass;
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
    for (const path of Object.keys(MODULES)) {
      const cabinet = cabinetOf(path);
      expect(DISCOVERED.some(d => d.cabinet === cabinet), `${cabinet}/music.ts exports no GameAudioOptions`).toBe(true);
      expect(WAS_BEATS[cabinet], `${cabinet} has no entry in WAS_BEATS`).toBeDefined();
    }
  });

  it.each(DISCOVERED)('$name loops every voice at the same length, in every section', ({ music }) => {
    // The voices advance on independent cursors, so unequal lengths do not
    // desynchronise gradually — they slide permanently. A lead of 25 beats over
    // a bass of 24 puts the tune's downbeat on a different bass note every time
    // round, which sounds like a mistake long before anyone can name it.
    expect(unequalBlocks(music)).toEqual([]);
  });

  it.each(DISCOVERED)('$name is at least twice the length it was', ({ cabinet, music }) => {
    expect(passBeats(music)).toBeGreaterThanOrEqual(WAS_BEATS[cabinet] * 2);
  });

  it.each(DISCOVERED)('$name has a playable tempo and at least two voices', ({ music }) => {
    expect(music.tempo).toBeGreaterThan(0);
    expect(Number.isFinite(music.tempo)).toBe(true);
    expect(music.tracks.length).toBeGreaterThanOrEqual(2);
  });

  it.each(DISCOVERED)('$name has no note the scheduler would have to skip', ({ music }) => {
    for (const line of blocks(music).flatMap(b => b.lines)) {
      expect(line.length).toBeGreaterThan(0);
      for (const note of line) {
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
    for (const line of blocks(music).flatMap(b => b.lines)) {
      for (const note of line) {
        if (note.gain === undefined) continue;
        // Both bounds are the engine's, not arbitrary: it clamps to 0.05-1, so
        // a gain outside that range is silently moved rather than rejected.
        expect(note.gain).toBeGreaterThanOrEqual(0.05);
        expect(note.gain).toBeLessThanOrEqual(1);
      }
    }
  });

  it('checks each section and the intro of a form on its own, not only the whole score', () => {
    // No cabinet has a form yet, so the per-score cases above cannot show that
    // the check reaches inside one. These synthetic scores do.
    const n = (beats: number): Note => ({ freq: 440, beats });
    const tracks = [{}, {}];
    const good: GameAudioOptions = {
      tracks,
      form: {
        intro: [[n(1), n(1)], [n(2)]],
        sections: { a: [[n(4)], [n(2), n(2)]], b: [[n(3)], [n(1), n(2)]] },
        order: ['a', 'b', 'a']
      }
    };
    expect(unequalBlocks(good)).toEqual([]);
    // Each voice totals 7 beats over a and b together, so only a per-section
    // check can see that b is a beat short in the lead and a beat long in the bass.
    const sliding: GameAudioOptions = {
      tracks,
      form: { sections: { a: [[n(4)], [n(3)]], b: [[n(3)], [n(4)]] }, order: ['a', 'b'] }
    };
    expect(unequalBlocks(sliding)).toEqual(['a', 'b']);
    const shortIntro: GameAudioOptions = { tracks, form: { ...good.form!, intro: [[n(2)], [n(1)]] } };
    expect(unequalBlocks(shortIntro)).toEqual(['intro']);
    const missingVoice: GameAudioOptions = { tracks, form: { sections: { a: [[n(4)]] }, order: ['a'] } };
    expect(unequalBlocks(missingVoice)).toEqual(['a']);
  });

  it.each(DISCOVERED)('$name resolves to a pass of the loop, so a form names only sections it has', ({ music }) => {
    // The engine throws on an unknown name, which in a cabinet would be a dead
    // music start; resolving every score's length here is what catches it first.
    expect(() => scoreSeconds(music)).not.toThrow();
    expect(scoreSeconds(music).pass).toBeGreaterThan(0);
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

/**
 * Round 2's floors (ADR 003's 2026-09-26 amendment, goals G2 and G3). The
 * definitions live in `music-gates.ts` so a rescore can probe a draft against
 * them; the synthetic scores below pin what each one does and does not count.
 */
describe('the round 2 gates', () => {
  const n = (name: string, beats: number): Note => ({ freq: p(name), beats });
  const rest = (beats: number): Note => ({ freq: 0, beats });
  /** A bar of straight quarters. */
  const quarters = (name: string): Note[] => [n(name, 1), n(name, 1), n(name, 1), n(name, 1)];
  /** A bar of straight eighths. */
  const eighths = (name: string): Note[] => Array.from({ length: 8 }, () => n(name, 0.5));
  /** The Charleston: a dotted quarter, then an eighth held over the half bar. */
  const charleston = (name: string): Note[] => [n(name, 1.5), n(name, 2.5)];
  /** A bass bar: root, then fifth at the half bar. */
  const bassBar = (root: string, fifth: string): Note[] => [n(root, 2), n(fifth, 2)];
  /** A lead of 16 bars, each chosen by its index. */
  const leadOf = (pick: (bar: number) => Note[]): Note[] => Array.from({ length: 16 }, (_, bar) => pick(bar)).flat();
  /** Replaces the last bar of the bass. */
  const endBass = (music: GameAudioOptions, last: Note[]): void => {
    const bass = music.tracks[1].melody!;
    music.tracks[1].melody = [...bass.slice(0, -2), ...last];
  };

  /**
   * A 16-bar score at 120 bpm (32 s) that clears every gate: its lead uses
   * three bar rhythms with a Charleston in each eight-bar window, and its bass
   * opens on C and hands back to the top from G, a half cadence.
   */
  function passing(): GameAudioOptions {
    const bass: Note[] = [];
    for (let bar = 0; bar < 16; bar++) bass.push(...(bar === 15 ? bassBar('G2', 'D3') : bassBar('C3', 'G2')));
    const lead = leadOf(bar => (bar % 8 === 3 ? charleston('E5') : bar % 2 ? eighths('G5') : quarters('C5')));
    return { tempo: 120, tracks: [{ melody: lead }, { melody: bass }] };
  }
  const standard: MusicProfile = { session: 'standard' };

  it('passes a score written to clear them', () => {
    expect(failedGates(passing(), standard)).toEqual([]);
  });

  it('measures the pass in seconds at the fastest tempo, not the base one', () => {
    const music = passing();
    expect(passSecondsAtFastest(music, standard)).toBeCloseTo(32, 6);
    // The same 64 beats wound up to 150 bpm are 25.6 s, under the 30 s floor.
    expect(failedGates(music, { session: 'standard', fastestTempo: 150 })).toEqual(['seconds']);
    // A long session wants 45 s; a minimal one is content with 20.
    expect(failedGates(music, { session: 'long' })).toEqual(['seconds']);
    expect(failedGates(music, { session: 'minimal', fastestTempo: 180 })).toEqual([]);
    expect(PASS_FLOOR_SECONDS).toEqual({ long: 45, standard: 30, minimal: 20 });
  });

  it('counts bar rhythms without their pitches, and wants three', () => {
    expect(new Set(barRhythms([...quarters('C5'), ...quarters('A5')], 4)).size).toBe(1);
    const two = passing();
    two.tracks[0].melody = leadOf(bar => (bar % 2 ? eighths('G5') : quarters('C5')));
    expect(failedGates(two, standard)).toEqual(['rhythms', 'syncopation']);
  });

  it('marks a note tied into the bar as a rhythm of its own', () => {
    // A whole note starting on beat 3 carries two beats into the next bar.
    const tied = [n('C5', 2), n('E5', 4), n('G5', 2)];
    expect(barRhythms(tied, 4)).toEqual(['0.000-2.000 2.000-4.000', '~0.000-2.000 2.000-4.000']);
  });

  it('counts a held push or a tie as syncopation, and straight or dotted figures as not', () => {
    const sync = (line: Note[]) => unsyncopatedWindows(line, 4).length === 0;
    expect(sync(eighths('C5'))).toBe(false);
    expect(sync(quarters('C5'))).toBe(false);
    // Dotted eighth and sixteenth land back on every beat.
    expect(sync(Array.from({ length: 4 }, () => [n('C5', 0.75), n('C5', 0.25)]).flat())).toBe(false);
    // A half note on the downbeat is held over nothing stronger than itself.
    expect(sync([n('C5', 2), n('C5', 2)])).toBe(false);
    // Nor is a note held from one downbeat over the next: that is a long note, not a push.
    expect(sync([n('C5', 8)])).toBe(false);
    // An eighth off the beat followed by silence is not held over the beat.
    expect(sync([n('C5', 1), n('C5', 0.5), rest(2.5)])).toBe(false);
    expect(sync(charleston('C5'))).toBe(true);
    // Quarter, half, quarter: the half starts on beat 2 and is held over the half bar.
    expect(sync([n('C5', 1), n('C5', 2), n('C5', 1)])).toBe(true);
    // An off-beat eighth held into beat 2.
    expect(sync([n('C5', 0.5), n('C5', 1), n('C5', 0.5), n('C5', 2)])).toBe(true);
    // A note tied over the bar line.
    expect(sync([n('C5', 3), n('C5', 2), n('C5', 3)])).toBe(true);
  });

  it('wants a syncopation in every eight bars, not one somewhere in the pass', () => {
    const music = passing();
    // Bar 11 keeps its own rhythm but loses the push, so bars 8 to 15 have none.
    music.tracks[0].melody = leadOf(bar =>
      bar === 3 ? charleston('E5') : bar === 11 ? [n('E5', 1.5), n('E5', 0.5), n('E5', 2)] : bar % 2 ? eighths('G5') : quarters('C5')
    );
    expect(unsyncopatedWindows(music.tracks[0].melody, 4)).toEqual([1]);
    expect(failedGates(music, standard)).toEqual(['syncopation']);
  });

  it('fails a pass whose lowest voice arrives home in its last bar, on either strong beat', () => {
    // V to I: the last bar lands on C, the pitch class the bass opens with.
    const home = passing();
    endBass(home, bassBar('C3', 'G2'));
    expect(seamArrivals(home)).toEqual([60]);
    expect(failedGates(home, standard)).toEqual(['seam']);
    // G then C inside the bar is the same cadence, arriving on the half bar.
    const late = passing();
    endBass(late, bassBar('G2', 'C3'));
    expect(seamArrivals(late)).toEqual([62]);
    // Another octave of the tonic is still the tonic.
    const octave = passing();
    endBass(octave, bassBar('C2', 'G2'));
    expect(seamArrivals(octave)).toEqual([60]);
    // bVII hands back to the top without arriving.
    const flatSeven = passing();
    endBass(flatSeven, bassBar('Bb2', 'F2'));
    expect(seamArrivals(flatSeven)).toEqual([]);
  });

  it('lets the lowest voice walk up into the opening pitch on a weak beat', () => {
    const walk = passing();
    endBass(walk, [n('G2', 1), n('A2', 1), n('B2', 1), n('C3', 1)]);
    expect(seamArrivals(walk)).toEqual([]);
  });

  it('reads the seam from the lowest pitched voice, drums left out and octave shifts counted', () => {
    const music = passing();
    // The engine ignores a drum hit's freq, so a low one here must not make the kick the bass.
    const drums: Note[] = Array.from({ length: 32 }, () => ({ freq: p('C1'), beats: 2, drum: 'kick' as const }));
    // A drone an octave below the bass, on C throughout, is the voice that counts.
    const drone: Note[] = Array.from({ length: 16 }, () => n('C2', 4));
    music.tracks.push({ melody: drums }, { melody: drone });
    expect(lowestVoiceIndex(music)).toBe(3);
    expect(failedGates(music, standard)).toEqual(['seam']);
    music.tracks[3].octaveShift = 2;
    expect(lowestVoiceIndex(music)).toBe(1);
    expect(failedGates(music, standard)).toEqual([]);
  });

  it("takes the lead from the track named 'lead', and track 0 otherwise", () => {
    const music = passing();
    // A one-rhythm drone put first is judged as the lead while nothing is named.
    music.tracks.unshift({ melody: Array.from({ length: 16 }, () => n('C4', 4)) });
    expect(leadIndex(music)).toBe(0);
    expect(failedGates(music, standard)).toEqual(['rhythms', 'syncopation']);
    music.tracks[1].name = 'lead';
    expect(leadIndex(music)).toBe(1);
    expect(failedGates(music, standard)).toEqual([]);
  });

  it('reads a score with a form across its sections in order, intro left out', () => {
    const [lead, bass] = passing().tracks.map(t => t.melody!);
    const music: GameAudioOptions = {
      tempo: 120,
      tracks: [{}, {}],
      form: {
        // A one-rhythm intro that stays home would fail two gates on its own.
        intro: [quarters('C5'), bassBar('C3', 'G2')],
        sections: {
          a: [lead.slice(0, lead.length / 2), bass.slice(0, bass.length / 2)],
          b: [lead.slice(lead.length / 2), bass.slice(bass.length / 2)]
        },
        order: ['a', 'b']
      }
    };
    expect(passLine(music, 0)).toEqual(lead);
    expect(failedGates(music, standard)).toEqual([]);
    // Played b then a, the pass ends on a's last bar, which is home.
    music.form!.order = ['b', 'a'];
    expect(failedGates(music, standard)).toEqual(['seam']);
  });

  it('finds a profile beside every score, with a session and a ramp no slower than its base', () => {
    for (const { name, music, profile } of DISCOVERED) {
      expect(profile, `${name}/music.ts exports no MUSIC_PROFILE`).toBeDefined();
      expect(Object.keys(PASS_FLOOR_SECONDS)).toContain(profile.session);
      if (profile.fastestTempo !== undefined) expect(profile.fastestTempo).toBeGreaterThanOrEqual(music.tempo!);
    }
  });

  it.each(DISCOVERED)(
    '$name clears every gate, or still fails one while it waits for its rescore',
    ({ name, music, profile }) => {
      const failed = failedGates(music, profile);
      if (profile.gatePending) {
        // A pending flag on a score that already clears the floor is stale:
        // the rescore that cleared it removes the flag, and this goes red until it does.
        expect(failed, `${name} clears every gate; remove its gatePending`).not.toEqual([]);
      } else {
        expect(failed, `${name} fails ${failed.join(', ')}`).toEqual([]);
      }
    }
  );
});
