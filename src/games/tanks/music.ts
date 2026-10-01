/**
 * Tank Duel's score: a PC-speaker field march, one tune per arena, a quickstep
 * for match point, a bugle call and drum roll-off to open the match, and
 * band endings.
 *
 * Reference (round 3, #415, rescored after the owner's audition of #436, who
 * asked for "everything" to change and for the original games as the model):
 *
 * - Kee Games' Tank (1974) had no music, only an explosion sound
 *   (https://en.wikipedia.org/wiki/Tank_(video_game)).
 * - QBasic Gorillas (1991) played the PC speaker through `PLAY` strings in MML:
 *   a 14 s through-composed intro at 120 bpm in 16ths and 32nds that ends on a
 *   bass figure repeated eight times at 160, and a victory dance that is one
 *   32nd-note figure played four times; its tunes bounce on repeated staccato
 *   16ths with 16th rests between them (https://www.vgmpf.com/Wiki/index.php?title=Introduction_-_QBasic_Gorillas_%28DOS%29,
 *   https://gist.github.com/paulera/2525813cc3e5314c5932e1212a1d811b).
 * - Scorched Earth (1991) had the PC speaker and nothing else; its AdLib
 *   support was planned and never shipped (https://tcrf.net/Scorched_Earth).
 * - Worms (1995, Bjorn Lynne) played no music in a match, only an ambience per
 *   landscape (wind, insects) with the odd sting, and its song is "a heroic
 *   military march" (https://www.hardcoregaming101.net/worms/,
 *   https://drawesome.bandcamp.com/album/worms-original-game-soundtrack).
 *
 * Brief. The lineage was silent while aiming, which is the score the owner
 * rejected, so the tune under the aim takes the two things that lineage did
 * have: Worms' heroic march and the Gorillas PC-speaker voice, at Gorillas'
 * 120 bpm. Worms' one ambience per landscape becomes one march per arena, each
 * in its own key and mode over a quiet bed of that landscape's air, and
 * Gorillas' jump to 160 becomes match point's quickstep. The match opens the
 * way a band does, a bugle call and then the drums' roll-off; the victory is
 * Gorillas' form (one quick figure, repeated) and every ending has the whole
 * band at the march's level. Nothing quotes either game: no `PLAY` string, no
 * Wormsong phrase, only the instrument, articulation, tempi and forms.
 *
 * Voices, and the trait each serves:
 *
 * - `lead`, the beeper: a plain square with an instant gate and no decay, a
 *   PC speaker. Every lead note goes through `beep`, sounding for 7/8 of its
 *   length, `PLAY`'s normal articulation, so repeated notes stay separate.
 * - `horn`: a triangle with a soft attack in the middle register, the band's
 *   inner voice, holding the chord's third and fifth in half notes.
 * - `bass`: a filtered sawtooth tuba in half notes, root then fifth, walking
 *   up through the chord into every fourth bar's turn.
 * - `drums`: the march cadence, bass drum on one and three, snare on two and
 *   four with ruffs into them, a roll at every phrase end.
 * - `wind`: the arena's air, filtered noise far under the band, after Worms:
 *   a breeze on the hills, a whistle in the canyon, warm air on the mesa,
 *   gusts on the ridges, a vent's hiss in the bunker.
 *
 * Dry and mono: a PC speaker is one channel and none of the references had
 * an echo.
 *
 * Form. Every bed is 16 bars at `BASE_TEMPO` (120), 32 s, four four-bar
 * phrases whose fourth bar turns to the dominant, so the loop hands back to
 * its top through V (the seam gate):
 *
 * - hills, D major, the home march, bright and square.
 * - canyon, E minor with the Phrygian F, darker, the same march in the shade.
 * - mesa, A Mixolydian, a loping dotted march with the flat seventh of the West.
 * - ridges, G major, the jauntiest, dotted 16ths climbing the crests.
 * - bunker, C minor, low and nervous, Gorillas' repeated staccato 16ths.
 *
 * Match point, `sudden`, is a D minor quickstep of 24 bars at
 * `SUDDEN_DEATH_TEMPO` (160, Gorillas' second tempo), 36 s, driven by
 * repeated-note eighths. The intro is four bars: a bugle call on D over a held
 * chord (bars 1 and 2), then the snare's roll-off alone (3 and 4), which leads
 * into any arena's march whatever its key.
 *
 * Gates: all three are on. Every bed syncopates at least once in each eight
 * bars (a note pushed onto an off-beat and held over the beat), has more than
 * three bar rhythms, and ends its pass on V.
 *
 * Adaptive hooks, wired in `game.ts`:
 *
 * - A match starts the music, whose intro opens it. The arena's scene is asked
 *   for one beat before the intro ends (`INTRO_BEATS`), so the move lands on
 *   the intro's last bar line and the march that follows is that arena's.
 *   The intro is the first round's opening, so that round plays no
 *   `roundStart`; every later round opens on it, a short bugle call.
 * - Match point switches to `sudden` as the round starts.
 * - A round that does not end the match plays a stinger on the beeper and the
 *   drums: `roundWon`, the victory figure twice onto D6; `roundLost`, a
 *   chromatic sag from F to D; `round`, an open fifth, in two-player and for a
 *   mutual destruction. After it (`STINGER_SECONDS`) the march is muffled
 *   behind the overlay, and the next round lifts it.
 * - The match ends on its phrase through `playEnding` (#417), the whole band:
 *   `matchWon`, the victory figure four times through D, G and A to a held
 *   D; `matchLost`, the bugle falling to D minor over a muffled drum;
 *   `matchOver`, in two-player, open fifths with no third, naming no loser.
 *   Muted, the effect stands in (`score`, or `gameover` when the CPU takes
 *   it), then the stop.
 */
import { p, REST, type DrumName, type GameAudioOptions, type MusicProfile, type Note } from '../engine';
import type { FormScene } from '../engine/audio';
import type { ArenaType } from './terrain';

/** Every arena is a scene, gated as its own loop; its march plays for a whole match. */
export const MUSIC_PROFILE: MusicProfile = {
  session: 'standard',
  scenes: {
    hills: { session: 'standard' },
    canyon: { session: 'standard' },
    mesa: { session: 'standard' },
    ridges: { session: 'standard' },
    bunker: { session: 'standard' }
  }
};

/** The marches' tempo, and so every jingle's outside match point. */
export const BASE_TEMPO = 120;
/** Match point's tempo, the danger order's own: Gorillas' second tempo. */
export const SUDDEN_DEATH_TEMPO = 160;
/** The match intro's length in beats: a bugle call and the drums' roll-off. */
export const INTRO_BEATS = 16;
/** Every round-end stinger's length in beats. */
export const STINGER_BEATS = 4;
/**
 * How long a round-end stinger lasts at the marches' tempo. Match point is
 * faster, so a stinger there ends sooner; this is the longest one can take.
 */
export const STINGER_SECONDS = (STINGER_BEATS * 60) / BASE_TEMPO;
/** The round-start bugle call's length in beats. */
export const ROUND_START_BEATS = 4;
/** Every match ending's length in beats: two bars, the last thing the match says. */
export const MATCH_END_BEATS = 8;

/** A pitched note, by name. */
const n = (name: string, beats: number, gain?: number): Note => ({ freq: p(name), beats, gain });
/** Silence. */
const r = (beats: number): Note => ({ freq: REST, beats });
/** A pitched note a number of semitones from a named one. */
const at = (name: string, semitones: number, beats: number, gain?: number): Note => ({
  freq: p(name) * 2 ** (semitones / 12),
  beats,
  gain
});
/** A drum hit. */
const d = (drum: DrumName, beats: number, gain?: number): Note => ({ freq: REST, beats, drum, gain });
/** A breath of wind: the noise voice's cutoff in Hz, which is its brightness. */
const gust = (hz: number, beats: number, gain?: number): Note => ({ freq: hz, beats, gain });
/** A beeper note, sounding for 7/8 of its length as `PLAY` plays one. */
const beep = (name: string, beats: number, gain?: number): Note[] => [n(name, (beats * 7) / 8, gain), r(beats / 8)];

/**
 * The beeper's line from bars in short hand, `NAME:beats` tokens split on
 * spaces and `-` for a rest, e.g. `'A4:.5 D5:.5 -:1'`. The downbeat is
 * accented and the half bar next, so the line is shaped as a player would
 * phrase it rather than sounding at one level.
 */
function lead(bars: string[]): Note[] {
  return bars.flatMap(bar => {
    let pos = 0;
    return bar
      .trim()
      .split(' ')
      .filter(Boolean)
      .flatMap(token => {
        const [name, len] = token.split(':');
        const beats = Number(len);
        const gain = pos === 0 ? 1 : pos === 2 ? 0.9 : 0.78;
        pos += beats;
        return name === '-' ? [r(beats)] : beep(name, beats, gain);
      });
  });
}

/** A bar's chord: its root in the bass octave, and whether its third is minor. */
interface Chord {
  root: string;
  third: 3 | 4;
  /** The fifth's distance, 6 for a diminished chord. */
  fifth?: 6 | 7;
}

/** Chords from short names, `D`, `Em`, `A7` (a seventh sounds as its triad here) and `Do` for diminished. */
function chords(names: string[]): Chord[] {
  return names.map(name => {
    const dim = name.endsWith('o');
    const minor = !dim && name.replace('7', '').endsWith('m');
    const letter = name.replace(/[m7o]/g, '');
    // Every root sits in the second octave, which keeps the tuba between A1 and G#2.
    const low = ['A', 'Bb', 'B'].includes(letter) ? `${letter}1` : `${letter}2`;
    return { root: low, third: minor || dim ? 3 : 4, fifth: dim ? 6 : 7 };
  });
}

/**
 * The tuba: root then fifth in half notes, and every fourth bar a walk up the
 * chord (root, third, fifth, sixth) into the next phrase, as a band's bass
 * turns the corner. The last bar of a pass is always a V bar, so the walk
 * there never lands on the tonic.
 */
function bassLine(harmony: Chord[]): Note[] {
  return harmony.flatMap((c, bar) =>
    bar % 4 === 3
      ? [at(c.root, 0, 1, 1), at(c.root, c.third, 1, 0.8), at(c.root, c.fifth ?? 7, 1, 0.85), at(c.root, 9, 1, 0.8)]
      : [at(c.root, 0, 2, 1), at(c.root, c.fifth ?? 7, 2, 0.85)]
  );
}

/** The horn: the chord's third, then its fifth, in half notes, two octaves up. */
function hornLine(harmony: Chord[]): Note[] {
  return harmony.flatMap(c => [at(c.root, 24 + c.third, 2, 0.9), at(c.root, 24 + (c.fifth ?? 7), 2, 0.8)]);
}

/** The march cadence: bass drum on one and three, snare on two and four with a ruff into four. */
const MARCH_BAR: Note[] = [d('kick', 1, 1), d('snare', 1, 0.8), d('kick', 1, 0.9), d('snare', 0.5, 0.45), d('snare', 0.5, 0.85)];
/** A phrase's last bar: the snare rolls into the next phrase. */
const ROLL_BAR: Note[] = [
  d('kick', 1, 1),
  d('snare', 1, 0.8),
  ...[0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.65, 0.75].map(g => d('snare', 0.25, g))
];

/** The drums under a pass, a march bar and a roll at each phrase end. */
function drumLine(bars: number): Note[] {
  return Array.from({ length: bars }, (_, bar) => (bar % 4 === 3 ? ROLL_BAR : MARCH_BAR)).flat();
}

/** An arena's air: gusts of `beats` at the given cutoffs, cycled to fill the pass. */
function air(bars: number, cutoffs: number[], beats: number, gain: number): Note[] {
  const count = (bars * 4) / beats;
  return Array.from({ length: count }, (_, i) => gust(cutoffs[i % cutoffs.length], beats, gain));
}

/** A section: the lead and harmony written, the band and the air derived. */
function march(bars: string[], harmony: string[], wind: Note[]): Note[][] {
  const h = chords(harmony);
  return [lead(bars), hornLine(h), bassLine(h), drumLine(bars.length), wind];
}

// --- hills: D major, the home march -----------------------------------------

const HILLS = march(
  [
    'A4:.5 D5:.5 D5:.75 E5:.25 F#5:1 D5:1',
    'A5:1.5 F#5:.5 D5:1 -:1',
    'B5:.75 A5:.25 G5:.5 F#5:.5 E5:1 D5:1',
    'C#5:.5 E5:1 A5:1.5 -:1',
    'A4:.5 D5:.5 D5:.75 E5:.25 F#5:1 A5:1',
    'B5:1.5 A5:.5 F#5:1 D5:1',
    'E5:.5 G#5:.5 B5:1 D6:1 B5:1',
    'A5:2 -:.5 A4:.5 B4:.5 C#5:.5',
    'D5:1 B4:.5 G4:.5 B4:1 D5:1',
    'F#5:1.5 E5:.5 D5:2',
    'G5:.5 G5:.5 B5:1 E5:1.5 -:.5',
    'C#5:.5 E5:1 G5:1 A5:1.5',
    'A4:.5 D5:.5 D5:.75 E5:.25 F#5:1 D5:1',
    'G5:1 B5:.5 A5:.5 G5:1 D5:1',
    'E5:1 G5:.5 B5:1.5 A5:1',
    'G5:.5 F#5:.5 E5:1 C#5:1 A4:1'
  ],
  ['D', 'D', 'G', 'A7', 'D', 'Bm', 'E7', 'A', 'G', 'D', 'Em', 'A7', 'D', 'G', 'Em', 'A7'],
  air(16, [520, 640, 480, 700], 8, 0.35)
);

// --- canyon: E minor with the Phrygian F --------------------------------------

const CANYON = march(
  [
    'E5:1 -:.5 E5:.5 G5:1 F5:1',
    'E5:1.5 B4:.5 E5:1 -:1',
    'F5:.5 A5:1 C6:1 A5:1.5',
    'G5:.5 F5:.5 E5:1 B4:2',
    'A5:1 C6:.5 B5:.5 A5:1 E5:1',
    'G5:1.5 F#5:.5 E5:1 B4:1',
    'A5:.5 C6:.5 F5:1 A5:1 C6:1',
    'B5:2 D#5:.5 F#5:.5 A5:1',
    'G5:1 E5:.5 G5:.5 B5:1.5 -:.5',
    'A5:.5 F#5:1 D5:1 A4:1.5',
    'G5:1 E5:1 C5:1 G4:1',
    'F#4:.5 A4:.5 B4:1 D#5:1 F#5:1',
    'E5:1 -:.5 E5:.5 G5:1 F5:1',
    'E5:.5 A5:1 C6:1.5 A5:1',
    'F5:1 A5:.5 G5:.5 F5:1 E5:1',
    'D#5:1.5 F#5:.5 A5:1 B5:1'
  ],
  ['Em', 'Em', 'F', 'Em', 'Am', 'Em', 'F', 'B7', 'Em', 'D', 'C', 'B7', 'Em', 'Am', 'F', 'B7'],
  air(16, [1900, 2400, 1700, 2200], 4, 0.22)
);

// --- mesa: A Mixolydian, a loping march with the flat seventh -----------------

const MESA = march(
  [
    'E5:.75 A5:.25 A5:1 C#6:1 A5:1',
    'G5:.5 E5:.5 C#5:1 E5:2',
    'D5:.5 G5:1 B5:1 D6:1.5',
    'C#6:1 A5:.5 G5:.5 E5:1 -:1',
    'F#5:.75 A5:.25 D6:1 A5:1 F#5:1',
    'E5:1.5 C#5:.5 A4:1 C#5:1',
    'D5:.5 B4:.5 G4:1 B4:1 D5:1',
    'E5:2 G#5:.5 B5:.5 E5:1',
    'A5:.75 G5:.25 E5:1 C#5:.5 E5:1.5',
    'A5:2 -:1 E5:1',
    'G5:.5 B5:1 D6:1 B5:1.5',
    'A5:1 F#5:1 D5:1 A4:1',
    'C#5:.75 E5:.25 A5:1 E5:1 C#5:1',
    'D5:1 G5:.5 B5:.5 D6:2',
    'F#5:1.5 D5:.5 A4:1 F#5:1',
    'E5:.5 G#5:1 B5:1 E5:1.5'
  ],
  ['A', 'A', 'G', 'A', 'D', 'A', 'G', 'E', 'A', 'A', 'G', 'D', 'A', 'G', 'D', 'E'],
  air(16, [260, 320, 240, 300], 16, 0.4)
);

// --- ridges: G major, the jauntiest ------------------------------------------

const RIDGES = march(
  [
    'D5:.5 G5:.75 A5:.25 B5:1 G5:1 D5:.5',
    'E5:.75 G5:.25 C6:1 E5:.5 G5:1.5',
    'F#5:1 A5:.5 D6:.5 C6:1 A5:1',
    'B5:1.5 A5:.5 G5:1 -:1',
    'D5:.5 G5:.75 A5:.25 B5:1 D6:1 B5:.5',
    'G5:1 E5:.5 G5:.5 B5:1 E5:1',
    'C#5:.5 E5:.5 A5:1 G5:1 E5:1',
    'F#5:2 -:.5 D5:.5 E5:.5 F#5:.5',
    'G5:.75 E5:.25 C5:1 E5:1 G5:1',
    'B4:.5 D5:1 G5:1 B5:1.5',
    'C6:1 A5:.5 E5:.5 C5:1 E5:1',
    'F#5:.75 A5:.25 D6:1 C6:1 A5:1',
    'B5:.5 G5:.5 D5:1 G5:.5 B5:1.5',
    'C6:1 E5:.5 G5:.5 C6:1 E6:1',
    'D6:1.5 B5:.5 G5:1 D5:1',
    'C5:.5 D5:.5 F#5:1 A5:1 C6:1'
  ],
  ['G', 'C', 'D', 'G', 'G', 'Em', 'A7', 'D', 'C', 'G', 'Am', 'D', 'G', 'C', 'G', 'D7'],
  Array.from({ length: 16 }, (_, i) => [gust(i % 2 === 0 ? 900 : 1150, 2, 0.32), r(1), gust(700, 1, 0.22)]).flat()
);

// --- bunker: C minor, low and nervous ----------------------------------------

const BUNKER = march(
  [
    'C5:.25 C5:.25 -:.25 C5:.25 Eb5:.5 G5:.5 C5:.25 C5:.25 -:.25 C5:.25 Eb5:1',
    'D5:.5 Eb5:.5 G5:1 Eb5:.5 C5:1.5',
    'Ab4:.25 Ab4:.25 -:.25 Ab4:.25 C5:.5 Eb5:.5 Ab5:1 G5:1',
    'G5:.5 F5:.5 Eb5:.5 D5:.5 B4:2',
    'C5:.25 C5:.25 -:.25 C5:.25 Eb5:.5 G5:.5 C6:1 Bb5:1',
    'Ab5:1.5 F5:.5 C5:1 Ab4:1',
    'G4:.5 B4:.5 D5:1 F5:1 D5:1',
    'B4:.5 D5:1 G5:2.5',
    'Ab5:1 Eb5:.5 C5:.5 Ab4:1 C5:1',
    'F5:.25 F5:.25 -:.25 F5:.25 Ab5:.5 C6:.5 F5:1 Ab5:1',
    'G5:1.5 Eb5:.5 C5:1 G4:1',
    'D5:.5 F5:.5 B4:1 D5:.5 G5:1.5',
    'C5:.25 C5:.25 -:.25 C5:.25 Eb5:.5 Ab5:.5 C6:1.5 Ab5:.5',
    'C6:.5 Ab5:1 F5:1 C5:1.5',
    'Ab4:.5 D5:.5 F5:1 Ab5:1 F5:1',
    'G5:.5 D5:.5 B4:1 G4:1 D5:1'
  ],
  ['Cm', 'Cm', 'Ab', 'G', 'Cm', 'Fm', 'G7', 'G', 'Ab', 'Fm', 'Cm', 'G', 'Ab', 'Fm', 'Do', 'G'],
  air(16, [150, 170], 8, 0.4)
);

// --- match point: the D minor quickstep ---------------------------------------

const SUDDEN = march(
  [
    'D5:.5 D5:.5 A5:.5 D5:.5 F5:1 E5:.5 D5:.5',
    'A5:1.5 G5:.5 F5:1 E5:1',
    'F5:.5 Bb5:1 D6:1 Bb5:1.5',
    'A5:.5 G5:.5 F5:.5 E5:.5 C#5:2',
    'D5:.5 D5:.5 A5:.5 D5:.5 F5:1 A5:1',
    'Bb5:1 G5:.5 D5:.5 Bb4:1 D5:1',
    'C#5:.5 E5:.5 A5:1 G5:.5 E5:1.5',
    'A5:2 -:1 A4:1',
    'D5:.5 F5:.5 A5:.5 D6:.5 C6:1 A5:1',
    'F5:1.5 E5:.5 D5:1 A4:1',
    'Bb4:.5 D5:.5 F5:1 Bb5:1 A5:1',
    'G5:.5 E5:1 C5:1 G5:1.5',
    'A5:1 F5:.5 C5:.5 A4:1 C5:1',
    'D5:.5 G5:.5 Bb5:1 D6:1 Bb5:1',
    'A5:.5 C#6:1 E6:1 C#6:1.5',
    'A5:2 E5:1 C#5:1',
    'G5:.5 Bb5:.5 D6:1 Bb5:.5 G5:1.5',
    'F5:1 A5:.5 F5:.5 D5:1 A4:1',
    'Bb4:.5 D5:.5 F5:.5 Bb5:.5 D6:1 Bb5:1',
    'A5:1.5 G5:.5 E5:1 C#5:1',
    'G5:.5 G5:.5 Bb5:.5 G5:.5 D6:1 Bb5:1',
    'A5:.5 F5:1 D5:1 F5:1.5',
    'G#5:1 B5:.5 G#5:.5 E5:1 D5:1',
    'C#5:.5 E5:.5 A5:1 E5:1 C#5:1'
  ],
  [
    'Dm', 'Dm', 'Bb', 'A', 'Dm', 'Gm', 'A', 'A',
    'Dm', 'Dm', 'Bb', 'C', 'F', 'Gm', 'A', 'A',
    'Gm', 'Dm', 'Bb', 'A', 'Gm', 'Dm', 'E7', 'A'
  ],
  air(24, [170], 16, 0.3)
);

// --- the match intro: a bugle call, then the roll-off -------------------------

const INTRO: Note[][] = [
  [...lead(['A4:.5 A4:.25 A4:.25 D5:1 F#5:.5 F#5:.25 F#5:.25 A5:1', 'F#5:.5 A5:.5 D6:2 -:1']), r(8)],
  [n('F#4', 4, 0.8), n('A4', 4, 0.85), r(8)],
  [n('D2', 4, 0.9), n('A1', 2, 0.8), n('D2', 2, 0.85), r(8)],
  [
    d('kick', 1, 0.9),
    r(3),
    d('kick', 1, 0.9),
    r(3),
    ...Array.from({ length: 16 }, (_, i) => d('snare', 0.25, 0.2 + i * 0.04)),
    d('kick', 0.5, 1),
    d('snare', 0.5, 0.8),
    d('snare', 0.25, 0.5),
    d('snare', 0.25, 0.6),
    d('snare', 0.5, 0.85),
    d('kick', 0.5, 1),
    d('snare', 0.5, 0.8),
    d('snare', 0.25, 0.5),
    d('snare', 0.25, 0.6),
    d('snare', 0.5, 0.9)
  ],
  [r(INTRO_BEATS)]
];

/** Every voice but the beeper and the drums silent for this many beats, for the round cues. */
const cue = (beats: number, beeper: Note[], drums: Note[]): Note[][] => [beeper, [r(beats)], [r(beats)], drums, [r(beats)]];

/** The victory figure, one beat of 32nds up and back through a chord from `root`. */
const figure = (root: string, major = true): Note[] =>
  [0, major ? 4 : 3, 7, 12, 7, major ? 4 : 3, 0, major ? 4 : 3].map(s => at(root, s, 0.125, s === 12 ? 1 : 0.85));

export const TANKS_MUSIC: GameAudioOptions = {
  tempo: BASE_TEMPO,
  volume: 0.13,
  tonic: p('D3'),
  tracks: [
    { name: 'lead', wave: 'square', adsr: { attack: 0.002, decay: 0.01, sustain: 1, release: 0.006 }, volume: 0.2 },
    {
      name: 'horn',
      wave: 'triangle',
      adsr: { attack: 0.04, decay: 0.3, sustain: 0.7, release: 0.12 },
      volume: 0.55
    },
    {
      name: 'bass',
      wave: 'sawtooth',
      filter: { cutoff: 520, q: 1.5 },
      adsr: { attack: 0.01, decay: 0.25, sustain: 0.55, release: 0.08 },
      volume: 0.6
    },
    { name: 'drums', volume: 0.7 },
    { name: 'wind', wave: 'noise', adsr: { attack: 1.5, decay: 0.5, sustain: 0.7, release: 2 }, volume: 0.6 }
  ],
  form: {
    intro: INTRO,
    sections: { hills: HILLS, canyon: CANYON, mesa: MESA, ridges: RIDGES, bunker: BUNKER, sudden: SUDDEN },
    order: ['hills'],
    // One scene per arena, named as the arena is, so `game.ts` selects it with `match.arena`.
    scenes: {
      hills: { order: ['hills'] },
      canyon: { order: ['canyon'] },
      mesa: { order: ['mesa'] },
      ridges: { order: ['ridges'] },
      bunker: { order: ['bunker'] }
    } satisfies Record<ArenaType, FormScene>,
    danger: { order: ['sudden'], tempo: SUDDEN_DEATH_TEMPO }
  },
  stingers: {
    // A bugle call up the D triad, the round's "ready", over a snare ruff.
    roundStart: cue(
      ROUND_START_BEATS,
      lead(['A4:.5 D5:.5 F#5:.5 A5:.5 D6:1.5 -:.5']),
      [d('snare', 0.25, 0.5), d('snare', 0.25, 0.6), d('snare', 0.5, 0.8), d('snare', 0.5, 0.8), d('snare', 0.5, 0.85), d('kick', 1.5, 1), r(0.5)]
    ),
    // Gorillas' victory form: one quick figure, twice, onto a held D6.
    roundWon: cue(
      STINGER_BEATS,
      [...figure('D5'), ...figure('D5'), ...beep('A5', 0.5), n('D6', 1.5)],
      [d('kick', 1, 1), d('kick', 1, 0.9), d('snare', 0.25, 0.6), d('snare', 0.25, 0.7), d('snare', 0.5, 0.9), d('kick', 1, 1)]
    ),
    // A chromatic sag, F to D: a round lost with the match still open.
    roundLost: cue(
      STINGER_BEATS,
      [...beep('F5', 1), ...beep('E5', 1), ...beep('Eb5', 1), ...beep('D5', 1)],
      [r(3), d('kick', 1, 0.8)]
    ),
    // An open fifth, neither major nor minor: a two-player round, or a draw.
    round: cue(STINGER_BEATS, [...beep('D5', 1), ...beep('A4', 1), ...beep('D5', 1), r(1)], [d('kick', 1, 0.9), r(1), d('kick', 1, 0.9), r(1)]),
    // The match endings, the whole band, played through `playEnding`.
    // The player takes the match: the victory figure through D, G and A, home to D.
    matchWon: [
      [...figure('D5'), ...figure('D5'), ...figure('G5'), ...figure('A4'), n('D6', 3), r(1)],
      [n('F#4', 1, 0.9), n('F#4', 1, 0.9), n('B4', 1, 0.9), n('C#5', 1, 0.9), n('F#4', 3, 1), r(1)],
      [n('D2', 1), n('D2', 1, 0.9), n('G2', 1), n('A1', 1), n('D2', 3), r(1)],
      [
        ...Array.from({ length: 4 }, () => [d('kick', 0.5, 1), d('snare', 0.5, 0.8)]).flat(),
        ...[0.4, 0.45, 0.5, 0.55, 0.6, 0.7, 0.8, 0.9].map(g => d('snare', 0.25, g)),
        d('kick', 1, 1),
        r(1)
      ],
      [r(MATCH_END_BEATS)]
    ],
    // The CPU takes it: the bugle falling into D minor over a muffled drum.
    matchLost: [
      [...beep('A5', 1), ...beep('F5', 1), ...beep('E5', 1), ...beep('C#5', 1), ...beep('D5', 1.5), ...beep('A4', 0.5), n('D4', 2)],
      [n('F4', 2, 0.85), n('E4', 2, 0.8), n('F4', 2, 0.8), n('D4', 2, 0.75)],
      [n('D2', 2), n('A1', 2, 0.85), n('Bb1', 1, 0.85), n('A1', 1, 0.8), n('D2', 2, 0.9)],
      [d('kick', 1, 0.8), r(1), d('kick', 1, 0.7), r(1), d('kick', 0.25, 0.6), d('kick', 0.25, 0.6), d('kick', 0.5, 0.7), r(1), d('kick', 2, 0.9)],
      [r(MATCH_END_BEATS)]
    ],
    // A two-player match names no loser: open fifths climbing to the octave, no third.
    matchOver: [
      [...beep('D5', 1), ...beep('A5', 1), ...beep('D5', 1), ...beep('A5', 1), n('D6', 3), r(1)],
      [n('A4', 4, 0.85), n('A4', 3, 0.9), r(1)],
      [n('D2', 4), n('D2', 3), r(1)],
      [d('kick', 1, 1), d('snare', 0.5, 0.7), d('snare', 0.5, 0.8), d('kick', 1, 1), ...[0.5, 0.6, 0.7, 0.8].map(g => d('snare', 0.25, g)), d('kick', 3, 1), r(1)],
      [r(MATCH_END_BEATS)]
    ]
  }
};
