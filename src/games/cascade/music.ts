/**
 * Cascade's score: Korobeiniki in A minor, the key the folk tune is sung in,
 * wound up level by level through `setTempo`.
 *
 * Key and mode. A minor with its leading tone. The tune's first and third
 * bars sit over E major with G sharp in the bass (E/G#), so the leading tone
 * is the first bass note the player hears and every return to the top leans
 * on it; the round 13 score framed the same tune in E minor, never played a G
 * sharp or a D sharp in its accompaniment, and so sounded suspended. The
 * borrowed colours are the house ones from ADR 003: F (bVI) and G (bVII) in
 * the second strain and in the closing phrase.
 *
 * Form, four eight-bar sections, a pass of 32 bars (128 beats), no intro:
 *   a   the folk tune as it is sung, both phrases, closing on A minor;
 *   a2  the same tune with a new bass and an altered ending that turns
 *       through F and G towards the relative major;
 *   b   an original strain (Korobeiniki's second half-phrase belongs to the
 *       folk song, the Game Boy's half-note bridge does not, so it is not
 *       borrowed here): a rising sequence of fourths, C to F, D to G, E to A,
 *       peaking on a held C6, then falling back through Dm and G to E;
 *   c   the tune's second phrase again, sequenced up a third over F and G,
 *       and a Dm to E half cadence. The bass ends the pass on E and walks up
 *       through F sharp into the G sharp that opens the next one, so the
 *       tonic never arrives at the seam: it arrives a bar later, where the
 *       tune itself puts it.
 * One pass is 61 s at the base tempo (126) and 38.8 s at the ramp's ceiling
 * (198), against the 30 s standard floor.
 *
 * Session and load. Runs are short to medium (a two-minute countdown, or a
 * marathon that rarely outlasts ten or fifteen minutes) and attention is high
 * throughout, so the score is a tune with a hook rather than a bed, and its
 * adaptivity follows the stack rather than the clock.
 *
 * Adaptive hooks, all wired in `game.ts`:
 *   - the tempo ramp, 126 + 9 per level, capped at `MAX_TEMPO`;
 *   - `setDanger` on the run's `danger` event: the stack reaching row 4 swaps
 *     in `rush`, a separately written tense variant (constant eighths, an
 *     E7 flat nine, octave-pumping bass), after NES Tetris's fast versions,
 *     played `DANGER_TEMPO_LIFT` faster; it is released, at the next bar
 *     line, once the stack is back down to row 7 (see `run.ts`);
 *   - the `drums` layer starts muted and enters at `DRUMS_FROM_LEVEL`, or in
 *     a countdown's final 20 seconds if that comes first;
 *   - the `levelUp` stinger on each level-up, and the `hurry` stinger with a
 *     tempo lift when a countdown enters its final 20 seconds.
 */
import { p, REST, type GameAudioOptions, type MusicProfile, type Note, type DrumName } from '../engine';

/** Starting tempo. The per-level ramp in `game.ts` winds up from here. */
export const BASE_TEMPO = 126;

/**
 * The ceiling the per-level ramp in `game.ts` stops at, reached at level 9.
 * It lives with the score rather than with the ramp because ADR 003 sizes a
 * ramping loop at its fastest tempo, so this is the number the score is
 * measured against.
 *
 * It was 240 while the tune ran in eighths; written in the tune's own quarter
 * notes it is half as busy at a given tempo, and 198 already takes it past the
 * Game Boy's level-0 pace. The lower cap also leaves room above it for the
 * danger variant's lift (about 228 at the top, NES Tetris's fast tune runs at
 * about 225), and the Sonotris study found that a tempo ramp synced to the
 * game makes Tetris measurably harder for novices, so the ramp is a
 * difficulty lever worth keeping short.
 */
export const MAX_TEMPO = 198;

/** How much faster the danger variant plays than the tempo the level has reached. */
export const DANGER_TEMPO_LIFT = 1.15;

/** The level at which the drum layer enters. */
export const DRUMS_FROM_LEVEL = 5;

/** A short, fast-paced run; the loop is measured at the ramp's ceiling. */
export const MUSIC_PROFILE: MusicProfile = {
  session: 'standard',
  fastestTempo: MAX_TEMPO
};

const n = (name: string, beats: number, gain?: number): Note =>
  gain === undefined ? { freq: p(name), beats } : { freq: p(name), beats, gain };
const r = (beats: number): Note => ({ freq: REST, beats });
const d = (drum: DrumName, beats: number, gain?: number): Note =>
  gain === undefined ? { freq: REST, beats, drum } : { freq: REST, beats, drum, gain };

/** Four beats of octave eighths on a root: the bass's driving bar. */
const pump = (low: string, high: string): Note[] =>
  [0, 1, 2, 3].flatMap(i => [n(low, 0.5, i % 2 ? 0.8 : 1), n(high, 0.5, 0.6)]);
/** A whole-bar chord third (or colour tone) for the pad. */
const hold = (...names: string[]): Note[] => names.map(name => n(name, 4));

/** A bar of backbeat: kick on 1 and 3 (and its push), snare on 2 and 4. */
const groove = (): Note[] => [
  d('kick', 0.5),
  d('hat', 0.5, 0.6),
  d('snare', 0.5),
  d('hat', 0.5, 0.6),
  d('kick', 0.5),
  d('kick', 0.5, 0.7),
  d('snare', 0.5),
  d('hat', 0.5, 0.6)
];
/** The last bar of a section: a snare pickup into the next. */
const fill = (): Note[] => [
  d('kick', 0.5),
  d('hat', 0.5, 0.6),
  d('snare', 0.5),
  d('hat', 0.5, 0.6),
  d('snare', 0.25, 0.7),
  d('snare', 0.25, 0.7),
  d('snare', 0.5, 0.85),
  d('kick', 0.5),
  d('snare', 0.5)
];
/** Eight bars of drums, the fill in the last. */
const drums = (): Note[] => [...Array.from({ length: 7 }, groove).flat(), ...fill()];
/** Danger's beat: the snare pushed onto the off-beat, hats doubled at the end. */
const rushBeat = (): Note[] => [
  d('kick', 0.5),
  d('hat', 0.5, 0.6),
  d('snare', 0.5),
  d('kick', 0.5, 0.8),
  d('kick', 0.5),
  d('hat', 0.5, 0.6),
  d('snare', 0.5),
  d('hat', 0.25, 0.5),
  d('hat', 0.25, 0.5)
];

// The folk tune's two phrases, as `a` states them. `a2` and `c` reuse bars of
// them, which is where the pass's repetition comes from.
const TUNE_1 = [
  // E/G#
  n('E5', 1), n('B4', 0.5, 0.8), n('C5', 0.5, 0.85), n('D5', 1, 0.95), n('C5', 0.5, 0.8), n('B4', 0.5, 0.8),
  // Am
  n('A4', 1), n('A4', 0.5, 0.8), n('C5', 0.5, 0.85), n('E5', 1, 0.95), n('D5', 0.5, 0.8), n('C5', 0.5, 0.8),
  // E/G#
  n('B4', 1.5), n('C5', 0.5, 0.8), n('D5', 1, 0.95), n('E5', 1, 0.95),
  // Am
  n('C5', 1), n('A4', 1, 0.9), n('A4', 1, 0.9), r(1)
];
const TUNE_2_HEAD = [
  // Dm: the eighth rest and the D held over the beat are the tune's own push.
  r(0.5), n('D5', 1), n('F5', 0.5, 0.85), n('A5', 1, 0.95), n('G5', 0.5, 0.8), n('F5', 0.5, 0.8),
  // C
  n('E5', 1.5), n('C5', 0.5, 0.8), n('E5', 1, 0.95), n('D5', 0.5, 0.8), n('C5', 0.5, 0.8)
];
const TUNE_2_CLOSE = [
  // E
  n('B4', 1), n('B4', 0.5, 0.8), n('C5', 0.5, 0.85), n('D5', 1, 0.95), n('E5', 1, 0.95),
  // Am
  n('C5', 1), n('A4', 1, 0.9), n('A4', 1, 0.9), r(1)
];

const A_LEAD = [...TUNE_1, ...TUNE_2_HEAD, ...TUNE_2_CLOSE];
const A_BASS = [
  // E/G#, Am, E/G#, Am: the leading tone under the tune's first bar.
  n('G#2', 1), n('E3', 1, 0.7), n('B2', 1, 0.85), n('E3', 1, 0.7),
  ...pump('A2', 'A3'),
  n('G#2', 1), n('B2', 1, 0.7), n('E3', 1, 0.85), n('B2', 1, 0.7),
  n('A2', 0.5), n('A3', 0.5, 0.6), n('A2', 0.5, 0.8), n('A3', 0.5, 0.6), n('A2', 1, 0.85), n('C3', 1, 0.7),
  // Dm, C, E, Am
  ...pump('D2', 'D3'),
  n('C3', 1), n('G2', 1, 0.7), n('C3', 1, 0.85), n('E3', 1, 0.7),
  n('E2', 1), n('G#2', 1, 0.7), n('B2', 1, 0.85), n('G#2', 1, 0.7),
  n('A2', 0.5), n('A3', 0.5, 0.6), n('A2', 0.5, 0.8), n('A3', 0.5, 0.6), n('A2', 1, 0.85), n('B2', 1, 0.7)
];
const A_PAD = hold('G#3', 'C4', 'G#3', 'C4', 'F4', 'E4', 'D4', 'C4');

const A2_LEAD = [
  ...TUNE_1,
  ...TUNE_2_HEAD,
  // F (bVI): the tune's seventh bar turned onto F.
  n('C5', 1), n('C5', 0.5, 0.8), n('D5', 0.5, 0.85), n('C5', 1, 0.95), n('A4', 1, 0.9),
  // G (bVII): a push onto G5 over the half bar, heading for C.
  n('B4', 1), n('D5', 0.5, 0.85), n('G5', 1.5), n('D5', 1, 0.85)
];
const A2_BASS = [
  // E/G#, Am, E/G#, Am, pumped where `a` walked and walked where it pumped.
  ...[0, 1, 2, 3].flatMap(i => [n('G#2', 0.5, i % 2 ? 0.8 : 1), n('E3', 0.5, 0.6)]),
  n('A2', 1), n('E3', 1, 0.7), n('A2', 1, 0.85), n('E3', 1, 0.7),
  n('G#2', 0.5), n('E3', 0.5, 0.6), n('G#2', 0.5, 0.8), n('E3', 0.5, 0.6),
  n('B2', 0.5, 0.85), n('E3', 0.5, 0.6), n('G#2', 0.5, 0.8), n('E3', 0.5, 0.6),
  n('A2', 1), n('C3', 1, 0.7), n('E3', 1, 0.85), n('C3', 1, 0.7),
  // Dm, C, F, G
  ...pump('D2', 'D3'),
  ...pump('C2', 'C3'),
  n('F2', 1), n('C3', 1, 0.7), n('A2', 1, 0.85), n('C3', 1, 0.7),
  n('G2', 0.5), n('G3', 0.5, 0.6), n('G2', 0.5, 0.8), n('G3', 0.5, 0.6), n('G2', 1, 0.85), n('B2', 1, 0.7)
];
const A2_PAD = hold('G#3', 'C4', 'G#3', 'C4', 'F4', 'E4', 'A3', 'B3');

const B_LEAD = [
  // C, F, G: the same bar three times, each a step higher, each a leap of a
  // fourth held over the half bar.
  n('G4', 1, 0.9), n('C5', 1.5), n('B4', 0.5, 0.8), n('C5', 1, 0.9),
  n('C5', 1, 0.9), n('F5', 1.5), n('E5', 0.5, 0.8), n('F5', 1, 0.9),
  n('D5', 1, 0.9), n('G5', 1.5), n('F5', 0.5, 0.8), n('G5', 1, 0.9),
  // Am: the peak, a held C6.
  n('E5', 0.5, 0.85), n('A5', 0.5, 0.9), n('C6', 2), n('B5', 0.5, 0.8), n('A5', 0.5, 0.8),
  // Dm, G: the fall, the Dm bar sequenced down a step.
  n('A5', 1.5), n('F5', 0.5, 0.8), n('D5', 1, 0.9), n('F5', 1, 0.85),
  n('G5', 1.5), n('D5', 0.5, 0.8), n('B4', 1, 0.9), n('D5', 1, 0.85),
  // Am, E
  n('E5', 1), n('C5', 1, 0.9), n('A4', 1, 0.9), n('C5', 0.5, 0.85), n('B4', 0.5, 0.8),
  n('B4', 2), n('G#4', 1, 0.9), r(1)
];
const B_BASS = [
  // C, F, G
  ...pump('C2', 'C3'),
  n('F2', 1), n('C3', 1, 0.7), n('F2', 1, 0.85), n('C3', 1, 0.7),
  n('G2', 1), n('D3', 1, 0.7), n('G2', 1, 0.85), n('D3', 1, 0.7),
  // Am
  n('A2', 0.5), n('A3', 0.5, 0.6), n('A2', 0.5, 0.8), n('A3', 0.5, 0.6), n('A2', 1, 0.85), n('C3', 1, 0.7),
  // Dm, G
  n('D2', 1), n('A2', 1, 0.7), n('D3', 1, 0.85), n('A2', 1, 0.7),
  n('G2', 1), n('D3', 1, 0.7), n('B2', 1, 0.85), n('D3', 1, 0.7),
  // Am, E
  n('A2', 1), n('C3', 1, 0.7), n('E3', 1, 0.85), n('C3', 1, 0.7),
  ...pump('E2', 'E3')
];
const B_PAD = hold('E4', 'A3', 'B3', 'C4', 'F4', 'B3', 'C4', 'G#3');

const C_LEAD = [
  ...TUNE_2_HEAD,
  ...TUNE_2_CLOSE,
  // F (bVI): the tune's push, sequenced up a third.
  r(0.5), n('F5', 1), n('A5', 0.5, 0.85), n('C6', 1, 0.95), n('B5', 0.5, 0.8), n('A5', 0.5, 0.8),
  // G (bVII)
  n('G5', 1.5), n('D5', 0.5, 0.8), n('G5', 1, 0.95), n('F5', 0.5, 0.8), n('E5', 0.5, 0.8),
  // Dm: a run of eighths down onto
  n('D5', 0.5), n('F5', 0.5, 0.8), n('E5', 0.5, 0.8), n('D5', 0.5, 0.85), n('C5', 0.5, 0.8), n('D5', 0.5, 0.8),
  n('B4', 0.5, 0.85), n('C5', 0.5, 0.8),
  // E, the half cadence: the leading tone in the tune for once.
  n('B4', 2), n('G#4', 1, 0.9), n('B4', 1, 0.8)
];
const C_BASS = [
  // Dm, C, E, Am
  ...pump('D2', 'D3'),
  n('C3', 1), n('G2', 1, 0.7), n('C3', 1, 0.85), n('E3', 1, 0.7),
  n('E2', 1), n('G#2', 1, 0.7), n('B2', 1, 0.85), n('G#2', 1, 0.7),
  n('A2', 0.5), n('A3', 0.5, 0.6), n('A2', 0.5, 0.8), n('A3', 0.5, 0.6), n('A2', 1, 0.85), n('G2', 1, 0.7),
  // F, G, Dm
  ...pump('F2', 'F3'),
  ...pump('G2', 'G3'),
  n('D2', 1), n('F2', 1, 0.7), n('A2', 1, 0.85), n('D3', 1, 0.7),
  // E, held off the tonic: E on both strong beats, then a walk up through F#
  // into the G# that opens the pass.
  n('E2', 1), n('E3', 1, 0.7), n('E2', 1, 0.85), n('F#2', 1, 0.75)
];
const C_PAD = hold('F4', 'E4', 'D4', 'C4', 'A3', 'B3', 'A3', 'G#3');

// The danger variant: written for the top of the well rather than sped up,
// constant eighths over octave-pumping bass, the E chord taking an F natural
// (E7 flat nine) and the harmony never reaching C major to rest.
const RUSH_LEAD = [
  // E
  n('E5', 0.5), n('B4', 0.5, 0.8), n('C5', 0.5, 0.85), n('D5', 0.5, 0.8),
  n('E5', 0.5, 0.95), n('D5', 0.5, 0.8), n('C5', 0.5, 0.85), n('B4', 0.5, 0.8),
  // Am
  n('A4', 0.5), n('C5', 0.5, 0.8), n('E5', 0.5, 0.85), n('A5', 0.5, 0.8),
  n('G#5', 0.5, 0.95), n('E5', 0.5, 0.8), n('C5', 0.5, 0.85), n('E5', 0.5, 0.8),
  // E7b9
  n('B4', 0.5), n('C5', 0.5, 0.8), n('D5', 0.5, 0.85), n('E5', 0.5, 0.8),
  n('F5', 0.5, 0.95), n('E5', 0.5, 0.8), n('D5', 0.5, 0.85), n('C5', 0.5, 0.8),
  // Am
  n('A4', 1), n('E5', 0.5, 0.85), n('A5', 1.5), n('G#5', 1, 0.9),
  // Dm
  n('D5', 0.5), n('F5', 0.5, 0.8), n('A5', 0.5, 0.85), n('F5', 0.5, 0.8),
  n('D5', 0.5, 0.95), n('F5', 0.5, 0.8), n('A5', 0.5, 0.85), n('G#5', 0.5, 0.8),
  // E
  n('G#5', 0.5), n('E5', 0.5, 0.8), n('B4', 0.5, 0.85), n('E5', 0.5, 0.8),
  n('G#5', 0.5, 0.95), n('B5', 0.5, 0.8), n('A5', 0.5, 0.85), n('G#5', 0.5, 0.8),
  // F
  n('A5', 0.5), n('F5', 0.5, 0.8), n('C5', 0.5, 0.85), n('F5', 0.5, 0.8),
  n('A5', 0.5, 0.95), n('C6', 0.5, 0.8), n('B5', 0.5, 0.85), n('A5', 0.5, 0.8),
  // E
  n('G#5', 1.5), n('E5', 0.5, 0.8), n('F5', 0.5, 0.85), n('E5', 0.5, 0.8), n('D5', 0.5, 0.85), n('B4', 0.5, 0.8)
];
const RUSH_BASS = [
  ...pump('E2', 'E3'),
  ...pump('A2', 'A3'),
  ...pump('E2', 'E3'),
  ...pump('A2', 'A3'),
  ...pump('D2', 'D3'),
  ...pump('E2', 'E3'),
  ...pump('F2', 'F3'),
  ...pump('E2', 'E3')
];
const RUSH_PAD = hold('G#3', 'C4', 'D4', 'C4', 'F4', 'G#3', 'A3', 'G#3');
const RUSH_DRUMS = Array.from({ length: 8 }, rushBeat).flat();

export const CASCADE_MUSIC: GameAudioOptions = {
  tempo: BASE_TEMPO,
  volume: 0.11,
  tonic: p('A3'),
  tracks: [
    // LEAD: a 25% pulse, the NES's reedier duty, with a singer's vibrato on
    // the held notes (the C6 and B4 of `b`, the push in `a2`).
    { name: 'lead', wave: 'pulse25', volume: 1.0, vibrato: 8 },
    // BASS: triangle, some bars pumping octave eighths, some walking quarters.
    { name: 'bass', wave: 'triangle', volume: 0.8 },
    // PAD: each chord's third (a seventh where it leads somewhere), an octave
    // above where the round 13 pad doubled the bass's roots.
    { name: 'pad', wave: 'triangle', envelope: 'pad', detune: 6, volume: 0.3 },
    // DRUMS: withheld until a level milestone (see `DRUMS_FROM_LEVEL`).
    { name: 'drums', volume: 0.5, startsMuted: true }
  ],
  form: {
    sections: {
      a: [A_LEAD, A_BASS, A_PAD, drums()],
      a2: [A2_LEAD, A2_BASS, A2_PAD, drums()],
      b: [B_LEAD, B_BASS, B_PAD, drums()],
      c: [C_LEAD, C_BASS, C_PAD, drums()],
      rush: [RUSH_LEAD, RUSH_BASS, RUSH_PAD, RUSH_DRUMS]
    },
    order: ['a', 'a2', 'b', 'c'],
    danger: { order: ['rush'] }
  },
  stingers: {
    // A level-up: an A major arpeggio, the picardy third the tune never
    // allows itself, over the root and fifth.
    levelUp: [
      [n('E5', 0.5, 0.85), n('A5', 0.5, 0.9), n('C#6', 0.5, 0.95), n('E6', 1)],
      [n('A2', 0.5), n('E3', 0.5, 0.7), n('A3', 0.5, 0.8), n('A2', 1)],
      [n('C#4', 2.5)],
      []
    ],
    // A countdown's last twenty seconds: a chromatic climb onto the dominant,
    // Super Mario Bros.'s warning before it resumes faster.
    hurry: [
      [n('E5', 0.5, 0.85), n('F5', 0.5, 0.85), n('F#5', 0.5, 0.9), n('G#5', 0.5, 0.95), n('B5', 1)],
      [n('E2', 0.5), n('E3', 0.5, 0.7), n('E2', 0.5, 0.8), n('E3', 0.5, 0.7), n('E2', 1)],
      [n('G#3', 3)],
      []
    ]
  }
};
