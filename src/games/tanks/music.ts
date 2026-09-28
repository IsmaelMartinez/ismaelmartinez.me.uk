/**
 * Tank Duel's score: an artillery duel's near-silence, one ambience bed per
 * arena, PC-speaker jingles at the edges of a round, and a tune kept back for
 * match point.
 *
 * Reference and brief (round 3, #415; ADR 003's round 3 amendment). Kee Games'
 * Tank (1974) had effects and no music, so the reference is the artillery
 * games the cabinet actually plays like, and they were nearly silent while
 * aiming. QBasic Gorillas (1991) had a short PC-speaker intro of stepwise
 * quarter notes in a narrow range and a fast 32nd-note victory flourish, and
 * nothing at all during play. Worms (1995, Bjorn Lynne) had a title theme and
 * one long ambience bed per landscape, wind and distant tones rather than a
 * tune. The brief takes the silence and the beds from Worms and the jingles
 * from Gorillas, and saves the melody for match point, which is this cabinet's
 * Sudden Death. Nothing here quotes either game: the jingles evoke Gorillas by
 * instrument, articulation, range and rhythm, never by its PLAY strings.
 *
 * Voices, and the trait each serves:
 *
 * - `lead`, the beeper: a plain square with an instant gate and no decay, no
 *   vibrato and no echo, which is a PC speaker (one square wave switched on
 *   and off, at one level). Every jingle is written through `beep`, which
 *   sounds 7/8 of each note and leaves the rest silent, the articulation QBasic
 *   PLAY uses unless told otherwise. It is silent in every bed.
 * - `drone`: a sawtooth under a low-pass, swelling in over a second and
 *   releasing slowly, in the bass. The "low filtered drone" of the brief; it
 *   holds each root for bars at a time, so a bed's harmony changes slowly.
 * - `tone`: a sine ping that decays to nothing, for the sparse distant tones
 *   of a Worms landscape (a call on the hills, drips off the canyon walls, a
 *   radar ping in the bunker). The canyon and bunker echoes are written as
 *   quieter repeats, because the score is dry. At match point the same voice
 *   plays low with a pitch drop, a distant gun.
 * - `wind`: sustained noise through a low-pass whose cutoff is the note's
 *   frequency, written in Hz (`gust`), swelling and dying like air moving.
 *
 * The mix is mono and dry: no pan, because a PC speaker is one channel and a
 * Worms bed is heard as a place rather than a stereo image, and no echo send,
 * because neither reference had one. Three pitched voices and a noise voice.
 *
 * Key, tempo and form. Everything runs at `BASE_TEMPO` (120), so a jingle is
 * the same speed wherever it plays, and each bed's rhythm is written in long
 * values. The form's `order` is the hills bed after a silent one-bar intro;
 * every arena, hills included, is a scene of the same name, which the game
 * selects at the start of a match, so the choice on the start screen is what you hear.
 * Each bed is in its own mode and has its own rhythmic cell:
 *
 * - hills, D Dorian, 24 bars (48 s): the drone breathes every two bars (six
 *   beats held, two off) through D, C, G and Bb; a two-note call every four.
 * - canyon, E Phrygian, 20 bars (40 s): the drone never breathes, E leaning
 *   on F, the flat second; a single drip every four bars with three repeats
 *   falling away, and a high whistle of wind.
 * - mesa, A Aeolian, 24 bars (48 s): the stillest, four-bar roots, one ping
 *   every eight bars, and a low warm wind.
 * - ridges, G Mixolydian, 24 bars (48 s): the drone steps between two notes
 *   every half bar, a ridge line; a rising three-note figure every four bars
 *   and short gusts.
 * - bunker, C Phrygian, 24 bars (48 s): a mains-hum drone on C, Db and Ab, a
 *   radar ping every two bars with one echo, and a constant vent hiss.
 *
 * The danger order, `sudden`, is the only place a melody plays: 16 bars at
 * `SUDDEN_DEATH_TEMPO` (126), 30.5 s, in D minor on the beeper. Its hook is the
 * jingles' stepwise quarters grown into an arch: a scale climbing from D to G,
 * over the top to Bb and down to D (bars 1 to 4), answered a third higher up
 * to D6 and down to a half close on A (5 to 8); a sequence of turning eighths
 * falls a step a bar (9 to 12), and the hook comes back and stops on A, so
 * the loop hands back through V. Under it the drone moves a bar at a time and
 * the tone voice fires a gun on the downbeat and the off-beat after two, the
 * one rhythmic cell in the score, over a low rumble.
 *
 * Gates. `gates` switches all three style gates off, which ADR 003's round 3
 * amendment allows for exactly this cabinet. `rhythms` and `syncopation` read
 * the lead, and in the beds the lead is silent by design: near-silence under
 * the aim is the brief, so a bed has one lead rhythm, the empty bar. `seam`
 * forbids arriving home at the loop's top, and a drone has no cadence to
 * avoid; the hills and canyon beds hold their tonic pedal into the top. The
 * seconds floor stays on, and every bed clears the standard 30 s.
 *
 * Session and load. A match is first to three rounds, three to eight minutes,
 * and most of it is the held breath of aiming: reading the wind, setting angle
 * and power, waiting on a shell. High attention with nothing moving, which is
 * why the beds carry no tune (ADR 003 asked for structural rests here) and
 * why the melody arrives only when one shot may end the match.
 *
 * Adaptive hooks, wired in `game.ts`:
 *
 * - A match starts the music and moves it to the arena's scene
 *   (`setScene(arena)`), under the silent intro, so the bed that swells in is
 *   the one for the ground picked on the start screen.
 * - Every round opens on `roundStart`, the Gorillas-style intro: six stepwise
 *   beeper quarters in the range of a fifth over the ducked bed.
 * - Match point (either side one round from winning) switches to the danger
 *   order as the round starts, and a new match starts again from its arena.
 * - A round that does not end the match plays a stinger: `roundWon`, a
 *   flourish of 32nd notes up to D6, or `roundLost`, a chromatic sag from F
 *   to D, against the CPU; the neutral `round`, an open fifth, in two-player
 *   and for a mutual destruction. After it (`STINGER_SECONDS`) the bed is
 *   muffled behind the overlay with `setPaused`, and the next round lifts it.
 * - The match end keeps its effects sting (`score`, or `gameover` when the CPU
 *   takes it) and stops the music.
 */
import { p, REST, type GameAudioOptions, type MusicProfile, type Note } from '../engine';
import type { FormScene } from '../engine/audio';
import type { ArenaType } from './terrain';

/** Every arena is a scene, gated as its own loop; the bed plays for a whole match. */
export const MUSIC_PROFILE: MusicProfile = {
  session: 'standard',
  // Near-silence under the aim: the lead is silent in every bed, so the lead's
  // rhythm and syncopation gates have nothing to read, and a drone has no
  // cadence for the seam gate to forbid. See the docstring.
  gates: { seam: false, syncopation: false, rhythms: false },
  scenes: {
    hills: { session: 'standard' },
    canyon: { session: 'standard' },
    mesa: { session: 'standard' },
    ridges: { session: 'standard' },
    bunker: { session: 'standard' }
  }
};

/** The beds' tempo, and so every jingle's outside match point. */
export const BASE_TEMPO = 120;
/** Match point's tempo, the danger order's own. */
export const SUDDEN_DEATH_TEMPO = 126;
/** Every round-end stinger's length in beats. */
export const STINGER_BEATS = 4;
/**
 * How long a round-end stinger lasts at the beds' tempo. Match point is faster,
 * so a stinger there ends sooner; this is the longest one can take.
 */
export const STINGER_SECONDS = (STINGER_BEATS * 60) / BASE_TEMPO;
/** The round-start jingle's length in beats. */
export const ROUND_START_BEATS = 6;

/** A pitched note, by name. */
const n = (name: string, beats: number, gain?: number): Note => ({ freq: p(name), beats, gain });
/** Silence. */
const r = (beats: number): Note => ({ freq: REST, beats });
/** A breath of wind: the noise voice's cutoff in Hz, which is its brightness. */
const gust = (hz: number, beats: number, gain?: number): Note => ({ freq: hz, beats, gain });
/**
 * A beeper note, QBasic PLAY's normal articulation: sounding for 7/8 of its
 * length and silent for the last eighth, so repeated and stepwise notes stay
 * separate, as a PC speaker switched off between them does.
 */
const beep = (name: string, beats: number, gain?: number): Note[] => [n(name, (beats * 7) / 8, gain), r(beats / 8)];
/** A distant gun: the tone voice low, dropping an octave onto its pitch. */
const gun = (name: string, beats: number, gain?: number): Note => ({
  ...n(name, beats, gain),
  pitchEnv: { semitones: 12, time: 0.06 }
});

/** Every voice silent for this many beats. */
const silence = (beats: number): Note[][] => [[r(beats)], [r(beats)], [r(beats)], [r(beats)]];

// --- hills: D Dorian, the drone breathing every two bars -------------------

const HILLS_DRONE: Note[] = ['D2', 'D2', 'C2', 'D2', 'D2', 'G1', 'D2', 'D2', 'Bb1', 'C2', 'D2', 'A1'].flatMap(
  (root, i) => [n(root, 6, i % 2 === 0 ? 0.9 : 0.8), r(2)]
);
/** A two-note call every four bars, falling or rising by a step or a fourth. */
const HILLS_TONE: Note[] = [
  ['A4', 'D5'],
  ['E5', 'D5'],
  ['D5', 'B4'],
  ['A4', 'D5'],
  ['D5', 'C5'],
  ['E5', 'A4']
].flatMap(([a, b]) => [r(6), n(a, 1, 0.6), n(b, 1.5, 0.5), r(7.5)]);
const HILLS_WIND: Note[] = Array.from({ length: 12 }, (_, i) => [
  gust([420, 560, 380, 640][i % 4], 6, [0.6, 0.8, 0.55, 0.9][i % 4]),
  r(2)
]).flat();

// --- canyon: E Phrygian, a drone that never breathes -----------------------

const CANYON_DRONE: Note[] = [
  n('E2', 16, 0.9),
  n('F2', 8, 0.85),
  n('E2', 16, 0.9),
  n('D2', 8, 0.8),
  n('E2', 8, 0.9),
  n('F2', 8, 0.85),
  n('E2', 8, 0.9),
  n('D2', 8, 0.8)
];
/** One drip every four bars, its three repeats falling away off the walls. */
const CANYON_TONE: Note[] = ['B4', 'C5', 'G4', 'B4', 'E5'].flatMap(drip => [
  r(5),
  n(drip, 0.5, 0.7),
  n(drip, 0.5, 0.35),
  n(drip, 0.5, 0.18),
  n(drip, 0.5, 0.09),
  r(9)
]);
/** A high whistle through the gorge, and a thinner one after it. */
const CANYON_WIND: Note[] = [
  [1800, 2400],
  [1500, 2100],
  [2000, 2600],
  [1600, 2200],
  [1900, 2500]
].flatMap(([low, high]) => [gust(low, 10, 0.5), r(2), gust(high, 3, 0.3), r(1)]);

// --- mesa: A Aeolian, the stillest --------------------------------------

const MESA_DRONE: Note[] = ['A2', 'A2', 'G2', 'A2', 'F2', 'E2'].flatMap(root => [n(root, 15, 0.85), r(1)]);
/** One ping every eight bars, in the middle of the stretch. */
const MESA_TONE: Note[] = ['E5', 'D5', 'C5'].flatMap(ping => [r(12), n(ping, 2, 0.45), r(18)]);
const MESA_WIND: Note[] = [240, 300, 220, 280, 260, 200].flatMap((hz, i) => [gust(hz, 14, i % 2 === 0 ? 0.7 : 0.6), r(2)]);

// --- ridges: G Mixolydian, the drone stepping every half bar -----------------

const RIDGES_DRONE: Note[] = [
  ['G2', 'A2'],
  ['G2', 'A2'],
  ['F2', 'G2'],
  ['G2', 'A2'],
  ['C2', 'D2'],
  ['F2', 'G2']
].flatMap(([low, high]) => Array.from({ length: 4 }, () => [n(low, 2, 0.9), n(high, 2, 0.7)]).flat());
/** A rising three-note figure at the end of every four bars. */
const RIDGES_TONE: Note[] = [
  ['D5', 'E5', 'G5'],
  ['D5', 'E5', 'A5'],
  ['C5', 'D5', 'F5'],
  ['D5', 'E5', 'G5'],
  ['G4', 'A4', 'D5'],
  ['C5', 'D5', 'F5']
].flatMap(([a, b, c]) => [r(12), n(a, 0.5, 0.5), n(b, 0.5, 0.55), n(c, 1, 0.6), r(2)]);
/** Short gusts over the crests, two to every two bars. */
const RIDGES_WIND: Note[] = Array.from({ length: 12 }, (_, i) => [
  r(2),
  gust(i % 2 === 0 ? 900 : 1100, 2, 0.6),
  r(1),
  gust(i % 2 === 0 ? 650 : 700, 3, 0.45)
]).flat();

// --- bunker: C Phrygian, a hum and a radar ----------------------------------

const BUNKER_DRONE: Note[] = ['C2', 'C2', 'Db2', 'C2', 'Ab1', 'G1'].map(root => n(root, 16, 0.9));
/** A ping every two bars with one echo off the concrete. */
const BUNKER_TONE: Note[] = ['G5', 'G5', 'G5', 'G5', 'Ab5', 'Ab5', 'G5', 'G5', 'Eb5', 'Eb5', 'D5', 'D5'].flatMap(ping => [
  n(ping, 0.5, 0.6),
  n(ping, 0.5, 0.22),
  r(7)
]);
const BUNKER_WIND: Note[] = [160, 140, 160, 140, 160, 140].map(hz => gust(hz, 16, 0.55));

// --- match point: the one tune -------------------------------------------

/** The melody, a bar to a row: quarters and eighths through `beep`. */
const SUDDEN_BARS: [string, number][][] = [
  // 1-4, the hook: up the scale, over the top to Bb, down to D
  [['D5', 1], ['E5', 1], ['F5', 1], ['G5', 1]],
  [['A5', 1.5], ['Bb5', 1], ['A5', 1.5]],
  [['G5', 1], ['F5', 1], ['E5', 1], ['C5', 1]],
  [['D5', 3], ['', 1]],
  // 5-8, the answer a third higher, to a half close on A
  [['F5', 1], ['G5', 1], ['A5', 1], ['C6', 1]],
  [['D6', 1.5], ['C6', 1], ['Bb5', 1.5]],
  [['A5', 1], ['G5', 1], ['F5', 1], ['E5', 1]],
  [['A5', 3], ['', 1]],
  // 9-12, turning eighths falling a step a bar
  [['Bb5', 0.5], ['A5', 0.5], ['G5', 0.5], ['A5', 0.5], ['Bb5', 2]],
  [['A5', 0.5], ['G5', 0.5], ['F5', 0.5], ['G5', 0.5], ['A5', 2]],
  [['G5', 0.5], ['F5', 0.5], ['E5', 0.5], ['F5', 0.5], ['G5', 1], ['E5', 1]],
  [['C#5', 2], ['E5', 1], ['A4', 1]],
  // 13-16, the hook again, stopping on A so the loop hands back through V
  [['D5', 1], ['E5', 1], ['F5', 1], ['G5', 1]],
  [['A5', 1.5], ['Bb5', 1], ['A5', 1.5]],
  [['G5', 1], ['F5', 1], ['E5', 1], ['G5', 1]],
  [['E5', 2], ['C#5', 1], ['', 1]]
];
const SUDDEN_LEAD: Note[] = SUDDEN_BARS.flat().flatMap(([name, beats]) => (name ? beep(name, beats) : [r(beats)]));
/** The root under each bar of the tune. */
const SUDDEN_ROOTS = ['D2', 'D2', 'C2', 'D2', 'F2', 'Bb1', 'A1', 'A1', 'Bb1', 'F2', 'C2', 'A1', 'D2', 'D2', 'C2', 'A1'];
const SUDDEN_DRONE: Note[] = SUDDEN_ROOTS.map(root => n(root, 4, 0.85));
/** A gun on the downbeat and the off-beat after two, an octave over the root; a quicker volley into the top. */
const SUDDEN_GUNS: Note[] = SUDDEN_ROOTS.flatMap((root, bar) => {
  const up = root.replace(/\d$/, d => String(Number(d) + 1));
  return bar === SUDDEN_ROOTS.length - 1
    ? [gun(up, 1, 0.9), gun(up, 0.5, 0.6), gun(up, 0.5, 0.7), gun(up, 2, 0.95)]
    : [gun(up, 1.5, 0.9), gun(up, 2.5, 0.65)];
});
const SUDDEN_WIND: Note[] = Array.from({ length: 4 }, () => gust(170, 16, 0.55));

export const TANKS_MUSIC: GameAudioOptions = {
  tempo: BASE_TEMPO,
  volume: 0.1,
  tonic: p('D3'),
  tracks: [
    { name: 'lead', wave: 'square', adsr: { attack: 0.002, decay: 0.01, sustain: 1, release: 0.006 }, volume: 0.15 },
    {
      name: 'drone',
      wave: 'sawtooth',
      filter: { cutoff: 380, q: 2 },
      adsr: { attack: 1, decay: 0.6, sustain: 0.8, release: 0.8 },
      volume: 0.2
    },
    { name: 'tone', wave: 'sine', adsr: { attack: 0.005, decay: 1.2, sustain: 0, release: 0.4 }, volume: 0.8 },
    { name: 'wind', wave: 'noise', adsr: { attack: 1.5, decay: 0.5, sustain: 0.7, release: 2 }, volume: 1 }
  ],
  form: {
    // A silent bar the match moves out of into its arena's scene: the round
    // start jingle plays over nothing, and the bed swells in after it.
    intro: silence(4),
    sections: {
      hills: [[r(96)], HILLS_DRONE, HILLS_TONE, HILLS_WIND],
      canyon: [[r(80)], CANYON_DRONE, CANYON_TONE, CANYON_WIND],
      mesa: [[r(96)], MESA_DRONE, MESA_TONE, MESA_WIND],
      ridges: [[r(96)], RIDGES_DRONE, RIDGES_TONE, RIDGES_WIND],
      bunker: [[r(96)], BUNKER_DRONE, BUNKER_TONE, BUNKER_WIND],
      sudden: [SUDDEN_LEAD, SUDDEN_DRONE, SUDDEN_GUNS, SUDDEN_WIND]
    },
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
    // The Gorillas-style intro: stepwise quarters inside a fifth, up to A.
    roundStart: [
      [...beep('D5', 1), ...beep('E5', 1), ...beep('F#5', 1), ...beep('E5', 1), ...beep('F#5', 1), ...beep('A5', 1)],
      ...silence(ROUND_START_BEATS).slice(1)
    ],
    // The victory flourish: two beats of 32nd notes, a run and a trill, onto D6.
    roundWon: [
      [
        ...['D5', 'E5', 'F#5', 'G5', 'A5', 'B5', 'C#6', 'D6', 'A5', 'B5', 'C#6', 'D6', 'C#6', 'D6', 'C#6', 'D6'].map(name =>
          n(name, 0.125)
        ),
        n('D6', 1.5),
        r(0.5)
      ],
      ...silence(STINGER_BEATS).slice(1)
    ],
    // A chromatic sag, F to D: a round lost with the match still open.
    roundLost: [
      [...beep('F5', 1), ...beep('E5', 1), ...beep('Eb5', 1), ...beep('D5', 1)],
      ...silence(STINGER_BEATS).slice(1)
    ],
    // An open fifth, neither major nor minor: a two-player round, or a draw.
    round: [[...beep('D5', 1), ...beep('A4', 1), ...beep('D5', 1), r(1)], ...silence(STINGER_BEATS).slice(1)]
  }
};
