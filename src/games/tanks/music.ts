/**
 * Tank Duel's score: a night-watch bed in D minor that leaves room to aim,
 * with one change at match point, after Worms.
 *
 * Session and load. A match is first to three round wins, about three to
 * eight minutes, and most of it is the held breath of aiming: the player
 * reads the wind, sets angle and power and waits on a shell's flight, with a
 * 1.1 s think whenever it is the CPU's turn. That is high attention with long
 * stretches of nothing moving, so the score is pad-led and sparse rather than
 * the continuous march it replaced (ADR 003 asked for exactly this: structural
 * rests rather than a melody that keeps arriving while the player concentrates).
 * Worms keeps one long bed per arena and saves its one musical change for
 * Sudden Death; this cabinet does the same, with match point as its Sudden
 * Death.
 *
 * Form. Four voices in `form` sections at 80 bpm: `a` (8 bars), `b` (8 bars)
 * and `a2` (8 bars), so one pass is 96 beats, 72 s. The tempo never ramps, so
 * base and fastest are the same; the danger order has its own tempo and is
 * sized on its own (below). No intro, because the first aim is its own
 * introduction, and no `rest`, because a match is a standard session rather
 * than a long one and the bed is already half silence in the lead.
 *
 * Harmony and register. D minor with the house borrowings: bVI (Bb) and bVII
 * (C) carry most of the weight, and a Dorian G major in bars 6 and 22 lifts
 * the answer phrase before Bb darkens it again. `a` and `b` half-close on A
 * (the one leading tone in the score, C# in the pad), and `a` steps from its A
 * up to `b`'s Bb, a deceptive V to bVI rather than home; `a2` swaps the A for C,
 * bVII, so the pass hands back to the top through bVII and the bass sits on C
 * and G in its last bar, never on D. Only the bass goes below C3 (it spans E2
 * to D3, roots and fifths in whole and half notes), and the pad voices each
 * chord above it as two half-note chord tones (A3 to G4), so bass and pad
 * together sound the triad.
 *
 * The tune. The hook is an arch with one leap: a pickup D5 that jumps a fifth
 * to A5, held across the half bar, then steps down to rest on D5. The answer
 * is the same figure a third higher on F5 to C6, landing on the Dorian B5.
 * Between phrases the lead rests for whole bars, two at a time in `a`, which is
 * the room to aim. `b` turns lyrical (long notes tied over the half bar, the
 * sequence up to D6 in bar 13) and `a2` repeats `a` until its sixth bar, where
 * the answer keeps climbing to D6 and falls through Bb in place of resting. The
 * lead is a 25% pulse with a light vibrato on its held notes, over a detuned
 * sawtooth pad and a triangle bass.
 *
 * Adaptivity. `game.ts` plays the match from its own events:
 *
 * - Match point (either side one round from winning) switches to the `danger`
 *   order at `SUDDEN_DEATH_TEMPO` (100 bpm) as the round starts: the same hook
 *   with no whole-bar rests between phrases, a repeated-note figure leaning on Bb, and a
 *   pulsing eighth-note bass. One pass is 64 beats, 38.4 s.
 * - `drums` starts muted and is percussion only in the danger sections; match
 *   point fades it in as a layer alongside the switch, and a new match takes
 *   it out again, so no drum sounds before match point.
 * - Every round that does not end the match plays a stinger over the ducked
 *   bed: `roundWon` (a D major Picardy lift) or `roundLost` (Bb falling to A)
 *   against the CPU, and the neutral `round` (an open Dsus2) in two-player,
 *   where one person's win is the other's loss, and for a mutual destruction.
 *   Once the stinger has played (`STINGER_SECONDS`), the bed is muffled with
 *   `setPaused` behind the round-over overlay, and the next round lifts it.
 * - The match end keeps its effects sting (`score` for a win in the room,
 *   `gameover` when the CPU takes it) and stops the music.
 */
import { p, REST, type DrumName, type GameAudioOptions, type MusicProfile, type Note } from '../engine';

/** A match is a few minutes of turns; the bed never ramps. */
export const MUSIC_PROFILE: MusicProfile = {
  session: 'standard'
};

/** The bed's tempo. */
export const BASE_TEMPO = 80;
/** Match point's tempo, the danger order's own. */
export const SUDDEN_DEATH_TEMPO = 100;
/** Every stinger's length in beats. */
export const STINGER_BEATS = 4;
/**
 * How long a stinger lasts at the bed's tempo. Match point is faster, so a
 * stinger there ends sooner; this is the longest one can take.
 */
export const STINGER_SECONDS = (STINGER_BEATS * 60) / BASE_TEMPO;

/** A pitched note, by name. */
const n = (name: string, beats: number, gain?: number): Note => ({ freq: p(name), beats, gain });
/** Silence. */
const r = (beats: number): Note => ({ freq: REST, beats });
/** A drum hit. */
const d = (drum: DrumName, beats: number, gain?: number): Note => ({ freq: REST, beats, drum, gain });

// --- lead ---------------------------------------------------------------

/** The hook, bar 1: a pickup that leaps a fifth and holds across the half bar. */
const HOOK: Note[] = [r(1), n('D5', 0.5, 0.8), n('A5', 1, 1), n('G5', 0.5, 0.75), n('F5', 1, 0.85)];
/** Bar 2: stepping back down to rest on D. */
const HOOK_FALL: Note[] = [n('E5', 1.5, 0.9), n('F5', 0.5, 0.75), n('D5', 2, 0.85)];
/** Bar 5: the hook a third higher, over Dm. */
const ANSWER: Note[] = [r(1), n('F5', 0.5, 0.8), n('C6', 1, 1), n('Bb5', 0.5, 0.75), n('A5', 1, 0.85)];

/** Bars 1 to 5 of `a`, which `a2` repeats: call, two bars to aim, answer. */
const LEAD_A_HEAD: Note[] = [...HOOK, ...HOOK_FALL, r(8), ...ANSWER];

const LEAD_A: Note[] = [
  ...LEAD_A_HEAD,
  // 6 G, the Dorian lift, resting on B
  n('G5', 1.5, 0.9),
  n('A5', 0.5, 0.75),
  n('B5', 2, 0.9),
  // 7 Bb, 8 A: two bars to aim over the half cadence
  r(8)
];

const LEAD_B: Note[] = [
  // 9 Bb, a long F tied across the half bar
  r(0.5),
  n('F5', 0.5, 0.75),
  n('D5', 0.5, 0.75),
  n('F5', 2.5, 0.95),
  // 10 F, walking down
  n('A5', 1, 0.9),
  n('G5', 1, 0.8),
  n('F5', 1, 0.8),
  n('E5', 0.5, 0.7),
  n('F5', 0.5, 0.75),
  // 11 Gm, held
  n('G5', 3, 0.9),
  r(1),
  // 12 Dm, a bar to aim
  r(4),
  // 13 Bb, bar 9 in sequence up to the apex
  r(0.5),
  n('F5', 0.5, 0.75),
  n('Bb5', 0.5, 0.8),
  n('D6', 2.5, 1),
  // 14 C7, falling
  n('C6', 1.5, 0.95),
  n('Bb5', 0.5, 0.75),
  n('G5', 1, 0.8),
  n('E5', 1, 0.8),
  // 15 Gm, 16 A: two bars to aim
  r(8)
];

const LEAD_A2: Note[] = [
  ...LEAD_A_HEAD,
  // 22 G, the answer keeps climbing, pushed onto the off-beat
  n('G5', 1.5, 0.9),
  n('A5', 0.5, 0.75),
  n('B5', 0.5, 0.8),
  n('D6', 1.5, 1),
  // 23 Bb, a C appoggiatura into Bb and down to F
  n('C6', 1, 0.85),
  n('Bb5', 1, 0.85),
  n('A5', 0.5, 0.75),
  n('F5', 1.5, 0.85),
  // 24 C, bVII: a bar to aim before the top
  r(4)
];

// --- pad ----------------------------------------------------------------

/** Two half notes, the chord's inner voices one after the other. */
const halves = (first: string, second: string, gain = 0.85): Note[] => [n(first, 2, gain), n(second, 2, gain * 0.9)];

const PAD_A_HEAD: Note[] = [
  ...halves('F4', 'A3'), // Dm
  ...halves('D4', 'F4'), // Dm
  ...halves('D4', 'F4'), // Bb
  ...halves('E4', 'G4'), // C
  ...halves('F4', 'A3'), // Dm
  ...halves('D4', 'B3'), // G
  ...halves('D4', 'F4') // Bb
];
const PAD_A: Note[] = [...PAD_A_HEAD, ...halves('C#4', 'E4', 0.9)]; // A
const PAD_B: Note[] = [
  n('D4', 4, 0.8), // Bb
  ...halves('C4', 'A3'), // F
  n('Bb3', 4, 0.8), // Gm
  ...halves('A3', 'F4'), // Dm
  ...halves('D4', 'F4'), // Bb
  ...halves('E4', 'Bb3'), // C7
  ...halves('D4', 'Bb3'), // Gm
  ...halves('C#4', 'E4', 0.9) // A
];
const PAD_A2: Note[] = [...PAD_A_HEAD, ...halves('E4', 'G4')]; // C

// --- bass ---------------------------------------------------------------

const BASS_A_HEAD: Note[] = [
  n('D3', 4, 0.9), // Dm
  n('D3', 3, 0.8), n('A2', 1, 0.7), // Dm
  n('Bb2', 4, 0.9), // Bb
  n('C3', 2, 0.85), n('G2', 2, 0.75), // C
  n('D3', 4, 0.9), // Dm
  n('G2', 3, 0.85), n('B2', 1, 0.7), // G
  n('Bb2', 4, 0.85) // Bb
];
// A, which `b` answers deceptively: up a half step to Bb rather than home to D.
const BASS_A: Note[] = [...BASS_A_HEAD, n('A2', 2, 0.9), n('E2', 1, 0.7), n('A2', 1, 0.75)];
const BASS_B: Note[] = [
  n('Bb2', 4, 0.9), // Bb
  n('F2', 2, 0.85), n('C3', 2, 0.75), // F
  n('G2', 4, 0.85), // Gm
  n('D3', 3, 0.85), n('A2', 1, 0.7), // Dm
  n('Bb2', 4, 0.9), // Bb
  n('C3', 4, 0.85), // C7
  n('G2', 2, 0.85), n('Bb2', 2, 0.75), // Gm
  n('A2', 4, 0.9) // A
];
// Bar 24 on C, walking up through G and A: the pass never lands on D before the top.
const BASS_A2: Note[] = [...BASS_A_HEAD, n('C3', 2, 0.85), n('G2', 1, 0.75), n('A2', 1, 0.8)];

// --- sudden death (the danger order) ------------------------------------

const SUDDEN_LEAD_HEAD: Note[] = [
  // 1-2 Dm, the hook without its breath after it
  ...HOOK,
  ...HOOK_FALL,
  // 3 Bb, the hook up a third
  r(1),
  n('F5', 0.5, 0.8),
  n('D6', 1, 1),
  n('C6', 0.5, 0.75),
  n('Bb5', 1, 0.85),
  // 4 C
  n('A5', 1.5, 0.9),
  n('Bb5', 0.5, 0.75),
  n('G5', 2, 0.85),
  // 5 Dm, repeated notes on the fifth
  n('A5', 0.5, 0.85),
  n('A5', 0.5, 0.7),
  n('A5', 0.5, 0.75),
  n('A5', 0.5, 0.7),
  n('A5', 1, 0.9),
  r(1),
  // 6 Dm, leaning on the flat sixth and pushed into A
  n('Bb5', 0.5, 0.85),
  n('Bb5', 0.5, 0.7),
  n('Bb5', 0.5, 0.75),
  n('A5', 1.5, 0.9),
  r(1),
  // 7 Bb
  n('D6', 2, 1),
  n('C6', 1, 0.85),
  n('Bb5', 1, 0.85)
];
const SUDDEN_LEAD: Note[] = [...SUDDEN_LEAD_HEAD, n('A5', 3, 0.95), r(1)]; // 8 A
const SUDDEN_LEAD_2: Note[] = [...SUDDEN_LEAD_HEAD, n('G5', 2, 0.9), n('E5', 1, 0.8), n('C5', 1, 0.8)]; // 8 C

const SUDDEN_PAD_HEAD: Note[] = [
  ...halves('F4', 'A3'), // Dm
  ...halves('D4', 'F4'), // Dm
  ...halves('D4', 'F4'), // Bb
  ...halves('E4', 'G4'), // C
  ...halves('F4', 'A3'), // Dm
  ...halves('F4', 'Bb3'), // Dm, Bb over the pedal
  ...halves('D4', 'F4') // Bb
];
const SUDDEN_PAD: Note[] = [...SUDDEN_PAD_HEAD, ...halves('C#4', 'E4', 0.9)]; // A
const SUDDEN_PAD_2: Note[] = [...SUDDEN_PAD_HEAD, ...halves('E4', 'G4')]; // C

/** A bar of driving eighths on a root, its octave on the off-beats of two and four. */
const pulse = (root: string, octave: string): Note[] => [
  n(root, 0.5, 0.95),
  n(root, 0.5, 0.6),
  n(octave, 0.5, 0.8),
  n(root, 0.5, 0.6),
  n(root, 0.5, 0.9),
  n(root, 0.5, 0.6),
  n(octave, 0.5, 0.8),
  n(root, 0.5, 0.6)
];
const SUDDEN_BASS_HEAD: Note[] = [
  ...pulse('D2', 'D3'),
  ...pulse('D2', 'D3'),
  ...pulse('Bb1', 'Bb2'),
  ...pulse('C2', 'C3'),
  ...pulse('D2', 'D3'),
  ...pulse('D2', 'D3'),
  ...pulse('Bb1', 'Bb2')
];
const SUDDEN_BASS: Note[] = [...SUDDEN_BASS_HEAD, ...pulse('A1', 'A2')];
const SUDDEN_BASS_2: Note[] = [...SUDDEN_BASS_HEAD, ...pulse('C2', 'C3')];

// --- drums --------------------------------------------------------------

/** A war drum in half time: a long kick and its pickup, a snare on three. */
const WAR: Note[] = [d('kick', 1.5, 0.95), d('kick', 0.5, 0.7), d('snare', 1, 0.85), d('hat', 0.5, 0.5), d('hat', 0.5, 0.6)];
/** The eighth bar: a snare roll into the top. */
const FILL: Note[] = [
  d('kick', 1, 0.9),
  d('snare', 0.5, 0.7),
  d('snare', 0.5, 0.75),
  d('snare', 0.25, 0.6),
  d('snare', 0.25, 0.65),
  d('snare', 0.25, 0.7),
  d('snare', 0.25, 0.75),
  d('snare', 1, 0.95)
];
const SUDDEN_DRUMS: Note[] = [...Array.from({ length: 7 }, () => WAR).flat(), ...FILL];

/** The bed's sections have no percussion: it is withheld for match point. */
const NO_DRUMS: Note[] = [r(32)];

export const TANKS_MUSIC: GameAudioOptions = {
  tempo: BASE_TEMPO,
  volume: 0.1,
  tonic: p('D3'),
  echo: { time: 0.375, feedback: 0.22, mix: 0.14 },
  tracks: [
    { name: 'lead', wave: 'pulse25', volume: 0.7, vibrato: 8 },
    { name: 'pad', wave: 'sawtooth', envelope: 'pad', detune: 8, volume: 0.5 },
    { name: 'bass', wave: 'triangle', volume: 1 },
    { name: 'drums', volume: 0.6, startsMuted: true }
  ],
  form: {
    sections: {
      a: [LEAD_A, PAD_A, BASS_A, NO_DRUMS],
      b: [LEAD_B, PAD_B, BASS_B, NO_DRUMS],
      a2: [LEAD_A2, PAD_A2, BASS_A2, NO_DRUMS],
      sudden: [SUDDEN_LEAD, SUDDEN_PAD, SUDDEN_BASS, SUDDEN_DRUMS],
      sudden2: [SUDDEN_LEAD_2, SUDDEN_PAD_2, SUDDEN_BASS_2, SUDDEN_DRUMS]
    },
    order: ['a', 'b', 'a2'],
    danger: { order: ['sudden', 'sudden2'], tempo: SUDDEN_DEATH_TEMPO }
  },
  stingers: {
    // A D major Picardy lift: the minor bed turns major for a round won.
    roundWon: [
      [n('A4', 0.5, 0.8), n('D5', 0.5, 0.85), n('F#5', 0.5, 0.9), n('A5', 2.5, 1)],
      [n('F#4', 4, 0.9)],
      [n('D3', 0.5, 0.9), n('A2', 0.5, 0.7), n('D3', 3, 0.9)],
      [r(STINGER_BEATS)]
    ],
    // Bb falling to A, bVI to V: a round lost, with the match still open.
    roundLost: [
      [n('D5', 1, 0.9), n('C5', 0.5, 0.8), n('Bb4', 0.5, 0.8), n('A4', 2, 0.9)],
      [n('F4', 2, 0.85), n('E4', 2, 0.85)],
      [n('Bb2', 2, 0.9), n('A2', 2, 0.9)],
      [r(STINGER_BEATS)]
    ],
    // An open Dsus2, neither major nor minor: a round in two-player, or a draw.
    round: [
      [n('A4', 0.5, 0.8), n('D5', 0.5, 0.85), n('E5', 3, 0.9)],
      [n('A3', 4, 0.85)],
      [n('D3', 4, 0.85)],
      [r(STINGER_BEATS)]
    ]
  }
};
