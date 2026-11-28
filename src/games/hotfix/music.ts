/**
 * HOTFIX's score: the car radio, an original funk vamp in E dorian.
 *
 * Brief. The top-down city games of 1997 are remembered by their radios: you
 * got into a car and it was already playing something with a breakbeat and a
 * bass line that would not sit still. So this is a band on a radio and not a
 * chip: a filtered saw for the lead, a pulse bass that walks, off-beat chord
 * chops spelled as tracker arpeggios (one voice implying a chord, as the
 * arcade's other scores do), and a breakbeat. Nothing here quotes a tune from
 * any of those games.
 *
 * Form. A two-bar pickup once per shift, then two eight-bar sections: `a`, the
 * riff over E and A with a turnaround on B, and `b`, a lift through C and D
 * back to E. One pass is 16 bars, 34.3 s at 112.
 *
 * Adaptive hooks, wired in `game.ts`:
 *   - `danger` while the police are after you (heat two and up): the `chase`
 *     section at 124, a two-tone figure over straight driving eighths and four
 *     on the floor, played twice per pass (31 s);
 *   - stingers for a job answered, done and failed, and for a bust;
 *   - the shift's end through `playEnding('shiftOver')`;
 *   - pause muffles the radio with `setPaused`.
 *
 * The seam: the pass ends on B in the bass, a bar of the dominant, and the
 * top of `a` answers it on E.
 */
import { p, REST, type DrumName, type GameAudioOptions, type MusicProfile, type Note } from '../engine';

export const BASE_TEMPO = 112;
export const CHASE_TEMPO = 124;

/** Shifts run three to six minutes with the player's attention on the road: a standard loop. */
export const MUSIC_PROFILE: MusicProfile = { session: 'standard' };

export const STINGERS = { job: 'job', done: 'done', failed: 'failed', busted: 'busted' } as const;
export const ENDING = 'shiftOver';

const DRUMS: Record<string, DrumName> = { k: 'kick', s: 'snare', h: 'hat' };

/**
 * A line in compact notation: `E4:1.5` a pitch and its beats, `-:.5` a rest,
 * `k`/`s`/`h` a drum. A `!` after a pitch ducks the note to 60%. An unreadable
 * token throws, as `p()` does, so `music.test.ts` catches a typo at import.
 */
function line(text: string, arp?: (name: string) => number[] | undefined): Note[] {
  return text
    .trim()
    .split(/\s+/)
    .map(token => {
      const m = /^([A-G][#b]?\d|-|[ksh])(!?):(\d*\.?\d+)$/.exec(token);
      if (!m) throw new Error(`unreadable score token: ${token}`);
      const beats = Number(m[3]);
      const gain = m[2] ? 0.6 : undefined;
      if (m[1] === '-') return { freq: REST, beats };
      if (DRUMS[m[1]]) return { freq: REST, beats, drum: DRUMS[m[1]], gain };
      const note: Note = { freq: p(m[1]), beats, gain };
      const chord = arp?.(m[1]);
      if (chord) note.arp = chord;
      return note;
    });
}

const MINOR = [0, 3, 7];
const MAJOR = [0, 4, 7];
/** One bar of off-beat chops on a chord, named by its root. */
const chops = (root: string, major = false): Note[] =>
  line(`-:.5 ${root}:.25 -:.75 ${root}!:.25 -:.75 ${root}:.25 -:.75 ${root}!:.25 -:.25`, () => (major ? MAJOR : MINOR));

const BEAT = 'k:.5 h!:.5 s:.5 h!:.25 k:.25 h!:.5 k:.5 s:.5 h!:.5';
const FILL = 'k:.5 h!:.5 s:.5 h!:.5 s!:.25 s!:.25 s:.25 s:.25 k:.5 s:.5';
const FLOOR = 'k:.5 h!:.5 s:.5 h!:.5 k:.5 h!:.5 s:.5 h!:.5';
const bars = (...items: string[]): Note[] => line(items.join(' '));

const BASS_E1 = 'E2:.75 E2!:.25 -:.5 G2:.5 A2:.5 -:.25 B2!:.25 D3:.5 E3:.5';
const BASS_E2 = 'E2:.75 E2!:.25 -:.5 D2:.5 E2:1 -:.5 B1:.5';
const BASS_A1 = 'A2:.75 A2!:.25 -:.5 C3:.5 D3:.5 -:.25 E3!:.25 G3:.5 A3:.5';
const BASS_A2 = 'A2:.75 A2!:.25 -:.5 G2:.5 A2:1 -:.5 E2:.5';

const LEAD_1 = '-:.5 E4:.5 G4:.5 A4:1 G4!:.5 E4:.5 D4!:.5';
const LEAD_2 = 'E4:1.5 -:.5 B3!:.5 D4:.5 E4:1';

const A: Note[][] = [
  bars(
    LEAD_1,
    LEAD_2,
    '-:.5 E4:.5 G4:.5 A4:1 B4!:.5 A4:.5 G4!:.5',
    'A4:1.5 -:.5 G4!:.5 E4:.5 D4:1',
    '-:.5 A4:.5 C5:.5 D5:1 C5!:.5 A4:.5 G4!:.5',
    'A4:1.5 -:.5 E4!:.5 G4:.5 A4:1',
    '-:.5 E4:.5 G4:.5 A4:1 B4!:.5 D5:.5 E5:.5',
    'F#5:1.5 E5!:.5 D5:.5 B4!:.5 A4:.5 F#4!:.5'
  ),
  bars(BASS_E1, BASS_E2, BASS_E1, BASS_E2, BASS_A1, BASS_A2, BASS_E1, 'B1:.75 B1!:.25 -:.5 D2:.5 F#2:1 A2:.5 B2:.5'),
  [...chops('E4'), ...chops('E4'), ...chops('E4'), ...chops('E4'), ...chops('A4'), ...chops('A4'), ...chops('E4'), ...chops('B3')],
  bars(BEAT, BEAT, BEAT, BEAT, BEAT, BEAT, BEAT, FILL)
];

const LIFT_C = 'G5:1.5 E5!:.5 -:.5 G5:.5 E5!:.5 C5:.5';
const LIFT_D = 'A5:1.5 F#5!:.5 -:.5 A5:.5 F#5!:.5 D5:.5';
const BASS_C = 'C2:.75 C2!:.25 -:.5 E2:.5 G2:.5 -:.5 C3:.5 B2!:.5';
const BASS_D = 'D2:.75 D2!:.25 -:.5 F#2:.5 A2:.5 -:.5 D3:.5 C#3!:.5';

const B: Note[][] = [
  bars(
    LIFT_C,
    LIFT_D,
    'B5:.75 A5:.75 G5!:.5 E5:1.5 -:.5',
    '-:.5 E5:.5 D5!:.5 B4:.5 D5!:.5 E5:1 -:.5',
    LIFT_C,
    LIFT_D,
    'C5!:.5 E5:.5 A5:1.5 G5!:.5 E5:.5 C5!:.5',
    'B4:.5 D5!:.5 F#5:.5 A5!:.5 B5:1.5 -:.5'
  ),
  bars(
    BASS_C,
    BASS_D,
    'E2:.75 E2!:.25 -:.5 G2:.5 B2:1 -:.5 E3:.5',
    'E2:.5 -:.5 E3:.5 D3!:.5 B2:.5 A2!:.5 G2:.5 F#2!:.5',
    BASS_C,
    BASS_D,
    'A2:.75 A2!:.25 -:.5 C3:.5 E3:1 -:.5 A2:.5',
    'B1:1 -:.5 B1!:.5 D2:.5 F#2:.5 A2:.5 B2:.5'
  ),
  [
    ...chops('C4', true),
    ...chops('D4', true),
    ...chops('E4'),
    ...chops('E4'),
    ...chops('C4', true),
    ...chops('D4', true),
    ...chops('A3'),
    ...chops('B3')
  ],
  bars(BEAT, BEAT, BEAT, FILL, BEAT, BEAT, BEAT, FILL)
];

const TWO_TONE = 'E5:1 B4!:1 E5:1 B4!:1';
const RUN_UP = 'E5!:.5 G5:.5 A5:1.5 G5!:.5 E5:1';
/** A bar of driving eighths on a root, bouncing the octave. */
const drive = (root: string, top: string): string => `${root}:.5 ${top}!:.5 ${root}:.5 ${top}!:.5 ${root}:.5 ${top}!:.5 ${root}:.5 ${top}!:.5`;

const CHASE: Note[][] = [
  bars(
    TWO_TONE,
    RUN_UP,
    'D5:1 A4!:1 D5:1 A4!:1',
    'D5!:.5 E5:.5 G5:1.5 E5!:.5 D5:1',
    TWO_TONE,
    RUN_UP,
    'A5:1 E5!:1 A5:1 E5!:1',
    'B5:.5 A5!:.5 G5:.5 F#5!:.5 E5:.5 D5!:.5 B4:1'
  ),
  bars(
    drive('E2', 'E3'),
    drive('E2', 'E3'),
    drive('D2', 'D3'),
    drive('D2', 'D3'),
    drive('E2', 'E3'),
    drive('E2', 'E3'),
    drive('A2', 'A3'),
    drive('B1', 'B2')
  ),
  [...chops('E4'), ...chops('E4'), ...chops('D4', true), ...chops('D4', true), ...chops('E4'), ...chops('E4'), ...chops('A3'), ...chops('B3')],
  bars(FLOOR, FLOOR, FLOOR, FLOOR, FLOOR, FLOOR, FLOOR, FILL)
];

/** The pickup: the drums count the band in over a bass climbing to the riff. */
const INTRO: Note[][] = [
  bars('-:4', '-:2 B3!:.5 D4:.5 E4:.5 D4!:.5'),
  bars('-:4', 'B1:.5 B1!:.5 D2:.5 D2!:.5 F#2:.5 A2:.5 B2:.5 D3!:.5'),
  bars('-:4', '-:4'),
  bars('h!:1 h!:1 h!:1 h!:1', FILL)
];

/** A stinger on the lead and bass alone, the chops and drums resting under it. */
const sting = (lead: string, bass: string): Note[][] => {
  const top = line(lead);
  const beats = top.reduce((sum, n) => sum + n.beats, 0);
  return [top, line(bass), [{ freq: REST, beats }], [{ freq: REST, beats }]];
};

export const HOTFIX_MUSIC: GameAudioOptions = {
  tempo: BASE_TEMPO,
  volume: 0.15,
  tonic: p('E3'),
  tracks: [
    {
      name: 'lead',
      wave: 'sawtooth',
      filter: { cutoff: 2100, q: 2.5 },
      adsr: { attack: 0.008, decay: 0.16, sustain: 0.5, release: 0.07 },
      vibrato: 4,
      volume: 0.5
    },
    {
      name: 'bass',
      wave: 'pulse25',
      filter: { cutoff: 640, q: 3 },
      adsr: { attack: 0.004, decay: 0.2, sustain: 0.35, release: 0.05 },
      volume: 0.85
    },
    {
      name: 'chops',
      wave: 'pulse12',
      adsr: { attack: 0.002, decay: 0.07, sustain: 0.2, release: 0.03 },
      arpRate: 42,
      pan: 0.3,
      volume: 0.3
    },
    { name: 'drums', volume: 0.75 }
  ],
  form: {
    intro: INTRO,
    sections: { a: A, b: B, chase: CHASE },
    order: ['a', 'b'],
    danger: { order: ['chase', 'chase'], tempo: CHASE_TEMPO }
  },
  stingers: {
    // The phone picked up: two quick notes and a question.
    [STINGERS.job]: sting('B4:.25 E5:.25 -:.5 B4:.25 E5:.25 G5:.5', 'E2:1 E2:1'),
    // Paid: up the scale and home.
    [STINGERS.done]: sting('E5:.25 G5:.25 A5:.25 B5:.25 D6:.5 E6:1.5', 'E2:1 B2:.5 E3:1.5'),
    // Too late: down it again.
    [STINGERS.failed]: sting('E5:.5 D5:.5 B4:.5 G4:.5 E4:1', 'E2:2 E2:1'),
    // Nicked: the two-tone, sagging.
    [STINGERS.busted]: sting('E5:.5 B4:.5 E5:.5 B4:.5 D5:.5 A4:.5 C5:.5 G4:1.5', 'E2:2 D2:1 C2:2'),
    // The shift is over: the riff's first bar, slowed to a full stop on E.
    [ENDING]: [
      line('E4:.5 G4:.5 A4:1 G4:.5 E4:.5 D4:1 E4:3 -:1'),
      line('E2:1 E2:1 A2:1 B2:1 E2:3 -:1'),
      [...chops('E4'), { freq: REST, beats: 4 }],
      line('k:1 s:1 k:1 s:.5 s:.5 k:3 -:1')
    ]
  }
};
