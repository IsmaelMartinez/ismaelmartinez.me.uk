/**
 * Line Hold's score: a garrison march in A minor that plays the defence.
 *
 * Session and load. A run is the longest on the floor, about thirteen and a
 * half minutes over eighteen authored waves and then an endless assault, and
 * it alternates two states the player feels in the body: a 12 second build
 * lull spent reading the map and placing towers (planning, high cognitive
 * load, no time pressure beyond the countdown), then a wave of marchers the
 * towers fight on their own while the player watches and patches (reactive,
 * lower load, high tension). The score is built around that switch, after
 * Kingdom Rush's split between preparation and attack and Plants vs. Zombies
 * holding its drums back until the waves come.
 *
 * Form. Four voices in `form` sections, 24 bars at 120 bpm, so one pass lasts
 * 48 s (the long-session floor is 45 s; the tempo never ramps, so base and
 * fastest are the same). `a` (8 bars) states the tune and half-closes on E,
 * `b` (8 bars) answers it with a falling circle of fifths (Dm G C F) and a
 * Phrygian bII, Bb, into E again, and `a2` repeats `a` until its last bar,
 * which swaps E for G, bVII, so the pass hands back to the top without ever
 * landing on A: the bass sits on G and D in bar 24. There is no intro, since
 * the build lull is itself the introduction, and no `rest`: a rest counts
 * passes rather than listening to the game, so it would sooner or later fall
 * in the middle of a wave, and the build bed already gives the ear a lighter
 * texture every forty seconds or so.
 *
 * Harmony and register. A minor with the parallel-major borrowings the ADR
 * names as house colour (bVI F and bVII G carry most of the weight, and Bb
 * darkens the answer phrase), with E major kept for the two half cadences.
 * The low register is open: the bass alone lives below C3, on roots and
 * fifths from F2 to E3, and the pad sits an octave and more above it (A3 to
 * F4), which is what the old score's E2 bass under a G#2 walk and an A2 drone
 * did not do.
 *
 * The tune. The lead is an arch: a repeated-note call on E5 that leaps a
 * fourth to A5 (the hook, held over the half bar), a sequence of it on F5 over
 * D minor, the apex on C6 in bar 7 and a fall to the leading tone. `b` slows
 * down into long tied notes (syncopated over the half bar) and climbs in plain
 * quarters to C6 again before the Bb. Sustained lead notes carry a light
 * vibrato on a 25% pulse, which reads as a bugle rather than a buzzer.
 *
 * Adaptivity. The voices are named so `game.ts` can play the state of the
 * run rather than a fixed loop:
 *
 * - `pad` and `bass` are the build bed and always play.
 * - `lead` and `drums` start muted and are the wave layer: `launchWave` fades
 *   them in and the end of a wave (held or leaked, both go back to building)
 *   fades them out.
 * - The `launch` stinger is a horn call over a snare roll, played on every
 *   wave launch, so the moment the marchers start is heard as well as seen.
 * - The `danger` order is the horde, a faster (138 bpm) section of driving
 *   eighth-note bass, repeated-note lead and a busier kit, switched on when
 *   the finale (wave 18) or any endless wave launches and released when that
 *   wave ends, so each build lull after it is still the calm bed.
 * - The stand-down prompt holds the run still, and the score is muffled with
 *   `setPaused` for as long as it is open rather than stopped and restarted.
 */
import { p, REST, type DrumName, type GameAudioOptions, type MusicProfile, type Note } from '../engine';

/** A run is eighteen waves and then endless, about thirteen and a half minutes, under one score. */
export const MUSIC_PROFILE: MusicProfile = {
  session: 'long'
};

/** The score's tempo; the horde runs at its own `HORDE_TEMPO` rather than ramping this one. */
export const BASE_TEMPO = 120;
/** The finale's tempo, the danger order's own. */
export const HORDE_TEMPO = 138;

/** A pitched note, by name. */
const n = (name: string, beats: number, gain?: number): Note => ({ freq: p(name), beats, gain });
/** Silence. */
const r = (beats: number): Note => ({ freq: REST, beats });
/** A drum hit. */
const d = (drum: DrumName, beats: number, gain?: number): Note => ({ freq: REST, beats, drum, gain });

// --- lead ---------------------------------------------------------------

/** The hook: a repeated-note call that leaps a fourth and holds over the half bar. */
const call = (low: string, high: string, turn: string): Note[] => [
  n(low, 0.5, 0.8),
  n(low, 0.5, 0.7),
  n(high, 1.5, 1),
  n(turn, 0.5, 0.75),
  n(low, 1, 0.85)
];

/** Bars 1 to 7 of `a`, which `a2` repeats. */
const LEAD_A_HEAD: Note[] = [
  // 1 Am, the call
  ...call('E5', 'A5', 'G5'),
  // 2 Am, stepping back down with a breath
  n('D5', 0.5, 0.75),
  n('C5', 0.5, 0.75),
  n('B4', 1, 0.8),
  n('A4', 1.5, 0.85),
  r(0.5),
  // 3 F, rising again, held over the half bar
  n('C5', 1, 0.8),
  n('F5', 1.5, 0.95),
  n('E5', 0.5, 0.75),
  n('F5', 1, 0.85),
  // 4 G, a long note to breathe on
  n('G5', 3, 0.9),
  r(1),
  // 5 Am, the call again
  ...call('E5', 'A5', 'G5'),
  // 6 Dm, the call in sequence a third higher
  ...call('F5', 'A5', 'G5'),
  // 7 F, the apex of the arch
  n('C6', 1.5, 1),
  n('A5', 0.5, 0.8),
  n('G5', 0.5, 0.75),
  n('F5', 0.5, 0.75),
  n('E5', 1, 0.85)
];

const LEAD_A: Note[] = [
  ...LEAD_A_HEAD,
  // 8 E, the half cadence: an appoggiatura, a breath, the leading tone
  n('F5', 0.5, 0.85),
  n('E5', 1.5, 0.9),
  r(0.5),
  n('B4', 0.5, 0.75),
  n('G#4', 1, 0.85)
];

const LEAD_B: Note[] = [
  // 9 Dm, long notes tied over the half bar
  r(0.5),
  n('A4', 0.5, 0.75),
  n('D5', 0.5, 0.8),
  n('F5', 2.5, 0.95),
  // 10 G
  n('E5', 0.5, 0.8),
  n('D5', 0.5, 0.75),
  n('B4', 3, 0.85),
  // 11 C, bar 9 a step down
  r(0.5),
  n('G4', 0.5, 0.75),
  n('C5', 0.5, 0.8),
  n('E5', 2.5, 0.95),
  // 12 F, bar 10 a step down
  n('D5', 0.5, 0.8),
  n('C5', 0.5, 0.75),
  n('A4', 3, 0.85),
  // 13 Dm, climbing in plain quarters
  n('D5', 1, 0.8),
  n('E5', 1, 0.85),
  n('F5', 1, 0.9),
  n('A5', 1, 0.95),
  // 14 Am, the apex again
  n('C6', 2, 1),
  n('B5', 1, 0.85),
  n('A5', 1, 0.85),
  // 15 Bb, the Phrygian darkening
  n('Bb5', 1.5, 0.95),
  n('A5', 0.5, 0.8),
  n('F5', 1, 0.85),
  n('D5', 1, 0.8),
  // 16 E7, falling to the leading tone
  n('E5', 1.5, 0.9),
  n('D5', 0.5, 0.75),
  n('B4', 1, 0.8),
  n('G#4', 1, 0.85)
];

const LEAD_A2: Note[] = [
  ...LEAD_A_HEAD,
  // 24 G, bVII: held over the half bar, handing back to the call on E
  n('D5', 0.5, 0.8),
  n('E5', 0.5, 0.8),
  n('G5', 2.5, 0.95),
  r(0.5)
];

// --- pad ----------------------------------------------------------------

/** Two half notes, the chord's inner voices one after the other. */
const halves = (first: string, second: string, gain = 0.85): Note[] => [n(first, 2, gain), n(second, 2, gain * 0.9)];

const PAD_A_HEAD: Note[] = [
  ...halves('C4', 'E4'), // Am
  ...halves('E4', 'C4'), // Am
  ...halves('C4', 'A3'), // F
  ...halves('B3', 'D4'), // G
  ...halves('C4', 'E4'), // Am
  ...halves('F4', 'D4'), // Dm
  ...halves('C4', 'F4') // F
];
const PAD_A: Note[] = [...PAD_A_HEAD, ...halves('B3', 'G#3')]; // E
const PAD_B: Note[] = [
  n('F4', 4, 0.8), // Dm
  n('D4', 4, 0.75), // G
  n('E4', 4, 0.8), // C
  n('C4', 4, 0.75), // F
  n('F4', 4, 0.8), // Dm
  n('E4', 4, 0.85), // Am
  n('D4', 4, 0.9), // Bb
  n('B3', 4, 0.9) // E
];
const PAD_A2: Note[] = [...PAD_A_HEAD, ...halves('D4', 'B3')]; // G

// --- bass ---------------------------------------------------------------

/** The march bar: root, root, fifth, root, the first long. */
const march = (root: string, fifth: string, accent = 0.9): Note[] => [
  n(root, 1.5, accent),
  n(root, 0.5, 0.6),
  n(fifth, 1, 0.8),
  n(root, 1, 0.7)
];

const BASS_A_HEAD: Note[] = [
  ...march('A2', 'E3'), // Am
  ...march('A2', 'E3', 0.85), // Am
  ...march('F2', 'C3'), // F
  ...march('G2', 'D3'), // G
  ...march('A2', 'E3'), // Am
  ...march('D3', 'A2'), // Dm
  ...march('F2', 'C3') // F
];
const BASS_A: Note[] = [...BASS_A_HEAD, ...march('E3', 'B2', 0.95)]; // E
const BASS_B: Note[] = [
  n('D3', 2, 0.9), n('A2', 2, 0.75), // Dm
  n('G2', 2, 0.9), n('D3', 2, 0.75), // G
  n('C3', 2, 0.9), n('G2', 2, 0.75), // C
  n('F2', 2, 0.9), n('C3', 2, 0.75), // F
  n('D3', 2, 0.9), n('A2', 2, 0.75), // Dm
  n('A2', 2, 0.9), n('E3', 2, 0.75), // Am
  n('Bb2', 2, 0.95), n('F2', 2, 0.8), // Bb
  n('E3', 2, 0.95), n('B2', 1, 0.8), n('G#2', 1, 0.8) // E, walking up to the top
];
// Bar 24 on G, walking up through B: the pass never lands on A before the top.
const BASS_A2: Note[] = [...BASS_A_HEAD, n('G2', 1.5, 0.9), n('G2', 0.5, 0.6), n('D3', 1, 0.8), n('B2', 1, 0.75)];

// --- drums --------------------------------------------------------------

/** The march: kick on one and three, snare on two and four, hats between. */
const STEP: Note[] = [
  d('kick', 0.5, 0.9),
  d('hat', 0.5, 0.6),
  d('snare', 0.5, 0.85),
  d('hat', 0.5, 0.6),
  d('kick', 0.5, 0.85),
  d('kick', 0.5, 0.6),
  d('snare', 0.5, 0.85),
  d('hat', 0.5, 0.6)
];
/** The lighter kit under the answer phrase. */
const WALK: Note[] = [d('kick', 0.5, 0.85), d('hat', 0.5, 0.5), d('snare', 1, 0.75), d('kick', 0.5, 0.8), d('hat', 0.5, 0.5), d('snare', 1, 0.75)];
/** The phrase-end fill: a rising snare roll. */
const FILL: Note[] = [
  d('kick', 0.5, 0.9),
  d('hat', 0.5, 0.6),
  d('snare', 0.5, 0.8),
  d('snare', 0.5, 0.6),
  d('snare', 0.25, 0.5),
  d('snare', 0.25, 0.6),
  d('snare', 0.25, 0.7),
  d('snare', 0.25, 0.8),
  d('snare', 0.5, 0.9),
  d('kick', 0.5, 1)
];
const bars = (pattern: Note[], count: number): Note[] => Array.from({ length: count }, () => pattern).flat();
const DRUMS_A: Note[] = [...bars(STEP, 7), ...FILL];
const DRUMS_B: Note[] = [...bars(WALK, 7), ...FILL];

// --- the horde (danger order) -------------------------------------------

/** The horde's hook: three repeated eighths and a push held over the half bar. */
const charge = (note: string, top: string, turn: string): Note[] => [
  n(note, 0.5, 0.85),
  n(note, 0.5, 0.7),
  n(note, 0.5, 0.75),
  n(top, 1, 1),
  n(turn, 0.5, 0.8),
  n(note, 1, 0.85)
];
/** Driving eighths on the root, turning to the fifth in the second half. */
const drive = (root: string, fifth: string): Note[] => [
  n(root, 0.5, 0.95),
  n(root, 0.5, 0.6),
  n(root, 0.5, 0.75),
  n(root, 0.5, 0.6),
  n(fifth, 0.5, 0.85),
  n(fifth, 0.5, 0.6),
  n(root, 0.5, 0.75),
  n(root, 0.5, 0.6)
];
const RUSH: Note[] = [
  d('kick', 0.5, 0.95),
  d('hat', 0.25, 0.5),
  d('hat', 0.25, 0.6),
  d('snare', 0.5, 0.9),
  d('hat', 0.5, 0.6),
  d('kick', 0.5, 0.9),
  d('kick', 0.5, 0.7),
  d('snare', 0.5, 0.9),
  d('hat', 0.25, 0.5),
  d('hat', 0.25, 0.6)
];

const HORDE: Note[][] = [
  [
    ...charge('A5', 'C6', 'B5'), // Am
    ...charge('Bb5', 'D6', 'C6'), // Bb
    ...charge('A5', 'C6', 'B5'), // Am
    n('Bb5', 1.5, 0.95), n('A5', 0.5, 0.8), n('F5', 1, 0.85), n('D5', 1, 0.8), // Bb
    n('A5', 1.5, 0.9), n('G5', 0.5, 0.75), n('F5', 1, 0.8), n('E5', 1, 0.8), // F
    n('D5', 0.5, 0.8), n('E5', 0.5, 0.8), n('G5', 2, 0.95), n('B5', 1, 0.9), // G
    n('G#5', 2, 1), n('E5', 1, 0.8), n('B4', 1, 0.8), // E
    n('E5', 2, 0.9), r(1), n('E5', 0.5, 0.75), n('E5', 0.5, 0.8) // E, the pickup
  ],
  [
    ...halves('E4', 'C4', 0.8), // Am
    ...halves('F4', 'D4', 0.85), // Bb
    ...halves('E4', 'C4', 0.8), // Am
    ...halves('D4', 'F4', 0.85), // Bb
    ...halves('C4', 'A3', 0.8), // F
    ...halves('D4', 'B3', 0.8), // G
    ...halves('B3', 'G#3', 0.9), // E
    ...halves('B3', 'D4', 0.9) // E7
  ],
  [
    ...drive('A2', 'E3'),
    ...drive('Bb2', 'F2'),
    ...drive('A2', 'E3'),
    ...drive('Bb2', 'F2'),
    ...drive('F2', 'C3'),
    ...drive('G2', 'D3'),
    ...drive('E3', 'B2'),
    ...drive('E3', 'B2')
  ],
  [...bars(RUSH, 7), ...FILL]
];

const HORDE_B: Note[][] = [
  [
    ...charge('F5', 'A5', 'G5'), // Dm
    n('E5', 1.5, 0.9), n('C5', 0.5, 0.75), n('A4', 2, 0.85), // Am
    n('A5', 0.5, 0.85), n('A5', 0.5, 0.7), n('A5', 0.5, 0.75), n('C6', 1, 1), n('A5', 0.5, 0.8), n('F5', 1, 0.85), // F
    n('G5', 3, 0.9), r(1), // G
    ...charge('F5', 'A5', 'G5'), // Dm
    n('E5', 1.5, 0.9), n('D5', 0.5, 0.75), n('C5', 1, 0.8), n('B4', 1, 0.8), // Am
    n('D5', 0.5, 0.8), n('F5', 0.5, 0.85), n('Bb5', 2.5, 1), r(0.5), // Bb
    n('G#5', 1.5, 0.95), n('F5', 0.5, 0.8), n('E5', 1, 0.85), n('D5', 1, 0.8) // E7
  ],
  [
    n('F4', 4, 0.8), // Dm
    n('E4', 4, 0.8), // Am
    n('C4', 4, 0.8), // F
    n('D4', 4, 0.8), // G
    n('F4', 4, 0.85), // Dm
    n('E4', 4, 0.85), // Am
    n('D4', 4, 0.9), // Bb
    n('B3', 4, 0.9) // E
  ],
  [
    ...drive('D3', 'A2'),
    ...drive('A2', 'E3'),
    ...drive('F2', 'C3'),
    ...drive('G2', 'D3'),
    ...drive('D3', 'A2'),
    ...drive('A2', 'E3'),
    ...drive('Bb2', 'F2'),
    ...drive('E3', 'B2')
  ],
  [...bars(RUSH, 7), ...FILL]
];

export const TOWERDEFENSE_MUSIC: GameAudioOptions = {
  tempo: BASE_TEMPO,
  volume: 0.12,
  tonic: p('A3'),
  echo: { time: 0.25, feedback: 0.22, mix: 0.18 },
  tracks: [
    // The wave layer's tune: a 25% pulse, vibrato on its long notes.
    { name: 'lead', wave: 'pulse25', volume: 0.85, vibrato: 8, startsMuted: true },
    // The build bed's upper half: the chord's inner voices, an open octave and more over the bass.
    { name: 'pad', wave: 'sawtooth', envelope: 'pad', volume: 0.35, detune: 6 },
    // The build bed's floor: roots and fifths, alone below C3.
    { name: 'bass', wave: 'triangle', volume: 0.75 },
    // The wave layer's march.
    { name: 'drums', volume: 0.6, startsMuted: true }
  ],
  form: {
    sections: {
      a: [LEAD_A, PAD_A, BASS_A, DRUMS_A],
      b: [LEAD_B, PAD_B, BASS_B, DRUMS_B],
      a2: [LEAD_A2, PAD_A2, BASS_A2, DRUMS_A],
      horde: HORDE,
      'horde-b': HORDE_B
    },
    order: ['a', 'b', 'a2'],
    danger: { order: ['horde', 'horde', 'horde-b'], tempo: HORDE_TEMPO }
  },
  stingers: {
    // A bugle call on the tonic and fifth over a rising snare roll: the gate opens.
    launch: [
      [n('E5', 0.5, 0.85), n('E5', 0.25, 0.7), n('E5', 0.25, 0.75), n('A5', 1.5, 1), n('G5', 0.5, 0.8), n('A5', 1, 0.9)],
      [n('A3', 1, 0.8), n('E4', 3, 0.85)],
      [n('A2', 1, 0.9), r(3)],
      [d('snare', 0.25, 0.5), d('snare', 0.25, 0.6), d('snare', 0.25, 0.7), d('snare', 0.25, 0.8), d('kick', 1, 1), r(2)]
    ]
  }
};
