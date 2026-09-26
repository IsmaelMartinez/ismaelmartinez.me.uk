/**
 * Snake's score: a lean Nokia-era chiptune in C major that speeds up with the
 * snake.
 *
 * This cabinet is deliberately the minimal one, two voices with no pad and no
 * echo, and stays that way (a test pins it, and ADR 003 exempts it to a 20 s
 * floor). What round 2 changed is everything inside those two voices.
 *
 * Key and mode. C major, with A flat (bVI) and B flat (bVII) borrowed from
 * C minor for the answer phrase and the seam, the house colour ADR 003 names.
 * `tonic` is C, so the eat and game-over effects sit in the key.
 *
 * Form, four four-bar sections, a pass of 16 bars (64 beats), no intro:
 *   a   the hook, the old arpeggio figure over C Am F G, arching up to C6 in
 *       its third bar and landing on G with a push over the half bar;
 *   a2  the hook again over C Em F G, with an altered ending that climbs to a
 *       held D6 instead of settling, a question for the answer to take up;
 *   b   the answer: a stepwise line falling C Bb Ab over A flat, the same
 *       figure a step higher over B flat, then down through F to a Gsus4
 *       resolving to G, over a bass that walks chromatically between roots;
 *   c   the hook's first two bars, then its third bar sequenced onto A flat
 *       (peaking on E flat 6) and a held D6 over B flat.
 * The bass ends the pass on B flat and F, so the loop hands back to the top
 * through bVII rather than V to I; the tonic arrives on the next downbeat.
 * Every bar of the lead that is not a straight repeat varies the rhythm
 * (dotted quarters, Charleston pushes, rests as breath), and the bass has a
 * dotted bounce and walking bars in place of the old sixteen half notes.
 * One pass is 28.7 s at the base tempo (134) and 20.6 s at the cap (186).
 *
 * Session and load. Runs are short, a minute or two, and attention is total:
 * the player is steering every step, so the score is a terse two-voice tune
 * with a hook and nothing that competes for the ear.
 *
 * Adaptive hooks, wired in `game.ts`:
 *   - the tempo follows the snake. Every apple tightens the step interval,
 *     and `tempoForStep` maps it linearly onto BASE_TEMPO to MAX_TEMPO, so
 *     the music winds up on the same apple the snake does and reaches the cap
 *     as the snake reaches its top speed, after Space Invaders' bass march;
 *   - the `walls` stinger when an arena rung claims its walls (falling to A
 *     flat and G, bVI to V), played on the same two voices in place of a
 *     second `score` blip the rung used to fire on the eat blip's own step,
 *     where the effects' rate limit dropped one of the two;
 *   - pause muffles the score with `setPaused` rather than stopping it.
 */
import { p, REST, type GameAudioOptions, type MusicProfile, type Note } from '../engine';
import { FASTEST_STEP, START_STEP } from './logic';

/** The tempo a run starts at, with the snake at its slowest. */
export const BASE_TEMPO = 134;

/**
 * The tempo the music reaches as the snake reaches its top speed, and never
 * passes. The snake's step rate rises 2.3 times over a run; following it all
 * the way would take the score past 300 bpm, and the Sonotris study found a
 * tempo ramp synced to the game makes play measurably harder, so the music
 * follows the direction of the speed-up, not its size. The ceiling is also
 * what keeps the loop long enough: 64 beats stay above the minimal 20 s floor
 * up to 192 bpm, and 186 leaves a margin under that.
 */
export const MAX_TEMPO = 186;

/** Deliberately the minimal cabinet, and its runs are short; the loop is measured at the cap. */
export const MUSIC_PROFILE: MusicProfile = {
  session: 'minimal',
  fastestTempo: MAX_TEMPO
};

/**
 * The music's tempo for a step interval: the base tempo at the run's opening
 * interval, the cap at the fastest, and linear in between.
 */
export function tempoForStep(interval: number): number {
  const t = (START_STEP - interval) / (START_STEP - FASTEST_STEP);
  return BASE_TEMPO + (MAX_TEMPO - BASE_TEMPO) * Math.min(1, Math.max(0, t));
}

type Cell = [name: string | null, beats: number];

/**
 * A bar of the lead from `[note, beats]` cells, null for a rest. A short note
 * that starts off the beat is eased to 0.8 so the line leans on its beats; a
 * push held over the beat keeps its full level, because it is the accent.
 */
function bar(...cells: Cell[]): Note[] {
  let at = 0;
  return cells.map(([name, beats]) => {
    const note: Note = name === null ? { freq: REST, beats } : { freq: p(name), beats };
    if (name !== null && beats <= 0.5 && Math.abs(at - Math.round(at)) > 1e-9) note.gain = 0.8;
    at += beats;
    return note;
  });
}

const n = (name: string, beats: number, gain?: number): Note =>
  gain === undefined ? { freq: p(name), beats } : { freq: p(name), beats, gain };

/** A bass bar's dotted bounce: root, its octave on the pickup, the fifth, the octave again. */
const bounce = (root: string, octave: string, fifth: string): Note[] => [
  n(root, 1.5),
  n(octave, 0.5, 0.6),
  n(fifth, 1.5, 0.75),
  n(octave, 0.5, 0.6)
];
/** A bass bar that walks: the root held, the fifth, then a step into the next root. */
const walk = (root: string, fifth: string, into: string): Note[] => [n(root, 2), n(fifth, 1, 0.7), n(into, 1, 0.7)];

// The lead's bars, in the order the pass first plays them.
const hookC = bar(['G5', 0.5], ['E5', 0.5], ['C5', 0.5], ['E5', 0.5], ['G5', 1], ['E5', 0.5], ['G5', 0.5]);
const hookAm = bar(['A5', 0.5], ['E5', 0.5], ['C5', 0.5], ['E5', 0.5], ['A5', 1.5], ['G5', 0.5]);
const hookF = bar(['F5', 0.5], ['A5', 0.5], ['C6', 1], ['A5', 0.5], ['F5', 0.5], ['E5', 0.5], ['F5', 0.5]);
const landG = bar(['G5', 0.5], ['B5', 0.5], ['D6', 0.5], ['B5', 1], ['G5', 1], [null, 0.5]);
const hookEm = bar(['E5', 0.5], ['G5', 0.5], ['B5', 0.5], ['G5', 0.5], ['E5', 1], ['D5', 0.5], ['E5', 0.5]);
const climbF = bar(['F5', 0.5], ['A5', 0.5], ['C6', 0.5], ['A5', 0.5], ['F5', 1], ['G5', 0.5], ['A5', 0.5]);
const askG = bar(['B5', 1.5], ['A5', 0.5], ['B5', 0.5], ['D6', 1.5]);
const answerAb = bar(['C6', 1.5], ['Bb5', 1.5], ['Ab5', 1]);
const answerBb = bar(['D6', 1.5], ['C6', 1.5], ['Bb5', 1]);
const descendF = bar(['A5', 0.5], ['Bb5', 0.5], ['C6', 1], ['Bb5', 0.5], ['A5', 0.5], ['G5', 0.5], ['F5', 0.5]);
const susG = bar(['G5', 0.5], ['A5', 0.5], ['B5', 0.5], ['C6', 1], ['B5', 0.5], [null, 1]);
const peakAb = bar(['Ab5', 0.5], ['C6', 0.5], ['Eb6', 1], ['C6', 0.5], ['Ab5', 0.5], ['G5', 0.5], ['Ab5', 0.5]);
const seamBb = bar(['Bb5', 0.5], ['C6', 0.5], ['D6', 2.5], [null, 0.5]);

export const SNAKE_MUSIC: GameAudioOptions = {
  tempo: BASE_TEMPO,
  volume: 0.14,
  tonic: p('C4'),
  tracks: [
    // LEAD: the NES's 25% pulse, thinner and more nasal than the old square,
    // with a little vibrato that only notes of a beat or more live long enough
    // to get (and near the cap, only the pushes and the held D6s).
    { wave: 'pulse25', vibrato: 6 },
    // BASS: triangle, bouncing under the hook and walking under the answer.
    { wave: 'triangle', volume: 0.9 }
  ],
  form: {
    sections: {
      a: [
        [...hookC, ...hookAm, ...hookF, ...landG],
        [
          ...bounce('C3', 'C4', 'G2'),
          ...bounce('A2', 'A3', 'E2'),
          ...bounce('F2', 'F3', 'C3'),
          n('G2', 1.5), n('G3', 0.5, 0.6), n('D3', 1, 0.75), n('B2', 1, 0.7)
        ]
      ],
      a2: [
        [...hookC, ...hookEm, ...climbF, ...askG],
        [
          ...bounce('C3', 'C4', 'G2'),
          ...bounce('E2', 'E3', 'B2'),
          ...bounce('F2', 'F3', 'C3'),
          n('G2', 1.5), n('G3', 0.5, 0.6), n('D3', 1, 0.75), n('G2', 1, 0.7)
        ]
      ],
      b: [
        [...answerAb, ...answerBb, ...descendF, ...susG],
        [
          ...walk('Ab2', 'Eb3', 'A2'),
          ...walk('Bb2', 'F2', 'E2'),
          ...walk('F2', 'C3', 'F#2'),
          n('G2', 1.5), n('G2', 0.5, 0.6), n('D3', 1, 0.75), n('B2', 1, 0.7)
        ]
      ],
      c: [
        [...hookC, ...hookAm, ...peakAb, ...seamBb],
        [
          ...bounce('C3', 'C4', 'G2'),
          ...bounce('A2', 'A3', 'E2'),
          ...bounce('Ab2', 'Ab3', 'Eb3'),
          ...bounce('Bb2', 'Bb3', 'F2')
        ]
      ]
    },
    order: ['a', 'a2', 'b', 'c']
  },
  stingers: {
    // The walls closing in: C Bb Ab G over A flat to G, bVI to V, three beats.
    // A rung arrives on the step an apple is eaten, so each line opens with an
    // eighth's rest and the eat effect sounds first, the stinger answering it.
    walls: [
      [{ freq: REST, beats: 0.5 }, n('C6', 0.5), n('Bb5', 0.5), n('Ab5', 0.5), n('G5', 1)],
      [{ freq: REST, beats: 0.5 }, n('Ab2', 1.5), n('G2', 1)]
    ]
  }
};
