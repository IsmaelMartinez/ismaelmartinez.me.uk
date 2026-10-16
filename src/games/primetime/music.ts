/**
 * PRIME TIME's score: a 1990 American arcade game show in E minor.
 *
 * Reference and brief (ADR 003's round 3 amendment: sound like the reference,
 * never copy a melody). The cabinet homages Williams' Smash TV (1990), whose
 * Y-unit sound board carried a Yamaha YM2151 (eight four-operator FM channels)
 * and a DAC for sampled drums and the announcer's voice. Jon Hey's music for
 * it is brash late-eighties American arcade: game-show fanfare brass, a
 * driving synth-funk bed with a slap bass in octaves and sixteenths, bright FM
 * electric-piano stabs on the off-beats, big sampled-sounding drums with a
 * loud snare on 2 and 4 and busy hats, and a faster, tenser cue for the
 * bosses. All of that is copyrighted and is evoked here by mode, tempo, timbre
 * and form only: every tune below is original, in a minor funk key with the
 * chromatic brass turnarounds a game show plays its contestants on with.
 *
 * Voices, every pitched one an FM patch because every pitched sound on the
 * Y-unit was one (the chip had no other kind of oscillator), and each named
 * for the trait it serves:
 *
 * - lead, FM brass (YM2151). A sine carrier at modulator ratio 1 with a high
 *   index that falls slowly is the sawtooth-bright brass FM is known for; the
 *   30 ms attack and a sustain above half are a section holding a note rather
 *   than plucking it; a low-pass that starts closed and opens over 60 ms is
 *   the brass "speaking" (the filter envelope is written negative so the note
 *   opens up rather than closing down). It sits G4 to F sharp 6, a trumpet
 *   register, with the top only reached at the boss cue's climax.
 * - bass, FM synth-funk. Ratio 2 with a large index that collapses in 60 ms is
 *   the knock of a slapped string, and a resonant low-pass whose cutoff drops
 *   two octaves in 90 ms closes behind the pluck as a synth bass's does. Every
 *   figure bounces between a root and its octave, in eighths and sixteenths.
 * - stabs, FM electric piano. Ratio 1 at a modest index decaying in 400 ms is
 *   a tine piano; it plays chord tones on the off-beats, call and response
 *   with the brass, and never on a downbeat in the arena.
 * - drums, the DAC channel: the engine's kick, snare and hats, the snare on 2
 *   and 4 at full level and the hats ducked, which is the sampled kit's balance.
 *   They sound from the arena's first bar, because the show is already running
 *   when the contestant walks in; the intro is where they are withheld, and
 *   the kit crashing in on the arena's downbeat is the moment that means
 *   something (the Plants vs. Zombies lesson, applied to a fanfare).
 *
 * Three pitched voices plus drums, inside ADR 003's limit. There is no echo:
 * the Y-unit had no hardware echo and its samples were dry, and a slap on the
 * send would smear the sixteenth-note bass that carries the groove. The space
 * a stab needs is written as the rest after it.
 *
 * Form. One `form` holds the arena and two scenes, moved between with
 * `setScene` (see `SCENES`):
 *
 * - the arena, the form's `order`, 28 bars (hook, hook-2, strain, turn) at
 *   `BASE_TEMPO`: an eight-bar brass hook over a four-bar E minor vamp into
 *   iv, VI and V, answered by an eight-bar variant that leaves through bVII; a
 *   second strain in the relative major, G, climbing to a C6; and a four-bar
 *   game-show turnaround up chromatic roots, C, C sharp diminished, D, that
 *   lands on B7 so the pass hands back to the hook's E on the dominant.
 * - boss, 24 bars (boss-a, boss-b, boss-c) at `BOSS_TEMPO`: E Phrygian, the
 *   F natural a semitone over the tonic and the B flat a tritone from it in
 *   the bass's sixteenths, a chromatic brass line that descends where the
 *   arena's rises, and a last section stepping up the scale, C to B flat, into
 *   B7. Darker and faster, and still in E so every stinger belongs to it.
 * - dome, 16 bars (dome-a, dome-b) at `DOME_TEMPO`: the Pleasure Dome, a
 *   prize-rain jingle in the parallel major, E, with disco octaves in the
 *   bass, four-on-the-floor drums and two borrowed chords (C and D) before
 *   the B7 that turns it round. The dome lasts `DOME_SECONDS` (15 s), so the
 *   scene never loops in play and is held to the minimal floor.
 * - danger, the last life (`setDanger(true)` on the contestant's third life):
 *   one eight-bar section, last-life, at `DANGER_TEMPO`, the arena's bass
 *   figure tightened to sixteenths on an E pedal under a two-note brass alarm
 *   a semitone apart, after NES Tetris's separately written fast variant.
 *
 * Every pass hands back to its top through B, the dominant, never V to I: the
 * bass does not sound E on a strong beat of any pass's last bar.
 *
 * Tempo and length (ADR 003). `BASE_TEMPO` 128 is a synth-funk pace;
 * `BOSS_TEMPO` 140 is the boss cue's lift, `DOME_TEMPO` 132 the jingle's
 * bounce, `DANGER_TEMPO` 136 the last life's. A run is three studios of a few
 * rooms each, a few minutes to ten, with high attention (two sticks against a
 * room filling with grunts), so the session is standard and the arena is one
 * tune with a hook rather than a bed: 112 beats, 52.5 s at 128. The boss scene
 * is 96 beats, 41.1 s at 140; the dome 64 beats, 29.1 s at 132, against the
 * minimal floor its fifteen seconds earn.
 *
 * Gates. All three style gates are on: pushes over the beat are the funk, and
 * a chromatic turnaround into V is the game show.
 *
 * Adaptive hooks, for `game.ts` to wire from the events `run.ts` already
 * raises: `setScene(SCENES.boss)` on an `enterRoom` with a boss and
 * `setScene(null)` when the room is cleared; `setScene(SCENES.dome)` on
 * `dome`; `setDanger(true)` when `lives` falls to one and `setDanger(false)`
 * on an extra life; the `STINGERS` on `roomClear`, a prize `pickup`, the
 * `car`, a `death`, an extra `life`, `bossDown` and `studioClear`, each a short
 * phrase over the ducked loop in the same FM palette; and the run's two
 * endings through `playEnding` on one of `ENDINGS`: `game-over`, two bars of
 * brass sinking chromatically onto the tonic, or `winner`, four bars of the
 * dome's E major fanfare. Pause muffles the music with `setPaused`.
 *
 * Beginnings. The form's `intro` is a two-bar fanfare, "you're on!", heard
 * each time the music starts from silence: a brass call up the E major triad
 * (the show's bright face, before the arena turns it minor) over the slap
 * bass, a snare roll, and B7 held into the hook's first E.
 */
import { p, REST, type DrumName, type GameAudioOptions, type MusicProfile, type Note } from '../engine';

/** The arena loop's tempo, a synth-funk pace; the score was written at it. */
export const BASE_TEMPO = 128;

/** The boss scene's tempo: the same groove lifted, tense rather than a different piece. */
export const BOSS_TEMPO = 140;

/** The Pleasure Dome's tempo, the jingle's bounce. */
export const DOME_TEMPO = 132;

/** The last life's tempo, between the arena's and the boss's. */
export const DANGER_TEMPO = 136;

/** The scenes the game moves the score between with `setScene`; null is the arena. */
export const SCENES = { boss: 'boss', dome: 'dome' } as const;

/** The stingers' names, each a key of `PRIMETIME_MUSIC.stingers`, for `playStinger`. */
export const STINGERS = {
  roomClear: 'roomClear',
  prize: 'prize',
  car: 'car',
  death: 'death',
  extraLife: 'extraLife',
  bossDown: 'bossDown',
  studioClear: 'studioClear'
} as const;

/** The endings' stinger names, for `game.ts`'s `playEnding`. */
export const ENDINGS = {
  /** The last life spent: brass sinking chromatically onto the tonic. */
  gameOver: 'game-over',
  /** Out of the dome alive: the E major fanfare, held. */
  winner: 'winner'
} as const;

/**
 * A standard session, measured at the arena's own tempo (nothing ramps it).
 * Each scene is measured at its own tempo: the boss cue to the standard floor,
 * the dome to the minimal one, since `DOME_SECONDS` is fifteen seconds and the
 * scene never comes round in play.
 */
export const MUSIC_PROFILE: MusicProfile = {
  session: 'standard',
  fastestTempo: BASE_TEMPO,
  scenes: {
    boss: { session: 'standard', fastestTempo: BOSS_TEMPO },
    dome: { session: 'minimal', fastestTempo: DOME_TEMPO }
  }
};

/* ------------------------------------------------------------------ */
/* notation                                                             */

const DRUMS: Record<string, DrumName> = { k: 'kick', s: 'snare', h: 'hat' };
/** The kit's balance: the snare at full level, the kick just under, the hats ducked. */
const DRUM_GAIN: Record<string, number> = { k: 0.95, s: 1, h: 0.45 };

/**
 * A line in a compact notation (Cascade's, with a drum kit and a level), one
 * token per note: a pitch name (`E5`), `r` for a rest, or `k`/`s`/`h` for a
 * kick, snare or hat, then `:beats`, which later tokens without one reuse, and
 * an optional `@gain`. `|` marks a bar line; with `bar` given, a bar that does
 * not add up throws, so a slip in the note data fails `music.test.ts` at import
 * rather than sliding a voice. A note starting off the beat is ducked a little
 * unless it writes its own level, so the pushes bite without shouting.
 */
function line(text: string, bar?: number): Note[] {
  const out: Note[] = [];
  let beats = 0.5;
  let at = 0;
  let inBar = 0;
  const close = () => {
    if (bar !== undefined && Math.abs(inBar - bar) > 1e-9) {
      throw new Error(`bar of ${inBar} beats, not ${bar}, near beat ${at} in "${text.trim().slice(0, 40)}..."`);
    }
    inBar = 0;
  };
  for (const token of text.match(/\||[^\s|]+/g) ?? []) {
    if (token === '|') {
      close();
      continue;
    }
    const [head, level] = token.split('@');
    const [name, len] = head.split(':');
    if (len !== undefined) beats = Number(len);
    const offBeat = Math.abs(at - Math.round(at)) > 1e-9;
    let note: Note;
    if (name === 'r') note = { freq: REST, beats };
    else if (DRUMS[name]) {
      const gain = level !== undefined ? Number(level) : DRUM_GAIN[name] * (offBeat ? 0.8 : 1);
      note = { freq: REST, beats, drum: DRUMS[name], gain };
    } else {
      const gain = level !== undefined ? Number(level) : offBeat ? 0.85 : undefined;
      note = { freq: p(name), beats, ...(gain !== undefined ? { gain } : {}) };
    }
    out.push(note);
    at += beats;
    inBar += beats;
  }
  if (inBar > 0) close();
  return out;
}

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** A pitch name moved by `semitones`, spelt with sharps; the bass figures build their octaves and colour tones from a root. */
function shift(name: string, semitones: number): string {
  const m = name.match(/^([A-G])([#b]?)(-?\d+)$/);
  if (!m) throw new Error(`Unparseable note name: ${name}`);
  const [, letter, accidental, octave] = m;
  const base = NAMES.indexOf(letter) + (accidental === '#' ? 1 : accidental === 'b' ? -1 : 0);
  const midi = (Number(octave) + 1) * 12 + base + semitones;
  return `${NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}

/** One bar of a figure per root, joined. */
const over = (figure: (root: string) => string, roots: string): string =>
  roots.trim().split(/\s+/).map(figure).join(' ');

/* ------------------------------------------------------------------ */
/* bass figures: every one bounces between the root and its octave      */

/** The arena's synth-funk bar: root, a doubled sixteenth, the octave pop, a breath, and a b7 pickup into the pop. */
const funk = (root: string): string => {
  const oct = shift(root, 12);
  const b7 = shift(root, 10);
  return `${root}:.5 ${root}:.25 ${root}:.25 ${oct}:.5 r:.5 ${root}:.5 r:.25 ${oct}:.25 ${b7}:.5 ${oct}:.5 |`;
};

/** The boss's sixteenths: a pedal on the root with the octave on the fourth, the b2 and the tritone as passing knocks. */
const drive = (root: string): string => {
  const oct = shift(root, 12);
  const b2 = shift(root, 1);
  const tt = shift(root, 6);
  return `${root}:.25 ${root} ${root} ${oct} ${root} ${root} ${b2} ${root} ${root} ${root} ${oct} ${root} ${tt} ${root} ${root} ${oct} |`;
};

/** The dome's disco octaves, eighths all the way. */
const disco = (root: string): string => {
  const oct = shift(root, 12);
  return `${root}:.5 ${oct} ${root} ${oct} ${root} ${oct} ${root} ${oct} |`;
};

/* ------------------------------------------------------------------ */
/* stab figures: the electric piano on the off-beats                    */

/** Two chord tones on the ands: the and of 1, the and of 2 held a breath, the and of 3. */
const stab = (a: string, b: string): string => `r:.5 ${a}:.5 r:1 ${b}:.5 r:.5 ${a}:.5 r:.5 |`;
/** The answering shape: the and of 1 and the and of 2, then a longer wait and the and of 4. */
const stab2 = (a: string, b: string): string => `r:.5 ${a}:.5 r:.5 ${b}:.5 r:1.5 ${a}:.5 |`;
/** The dome's: every and, alternating. */
const skank = (a: string, b: string): string => `r:.5 ${a}:.5 r:.5 ${b}:.5 r:.5 ${a}:.5 r:.5 ${b}:.5 |`;
/** `pairs` as `a/b` per bar, each through `figure`. */
const stabs = (figure: (a: string, b: string) => string, pairs: string): string =>
  pairs
    .trim()
    .split(/\s+/)
    .map(pair => {
      const [a, b] = pair.split('/');
      return figure(a, b);
    })
    .join(' ');

/* ------------------------------------------------------------------ */
/* drum bars                                                            */

/** The arena's kit: kick on 1 and a doubled 3, the loud snare on 2 and 4, hats between. */
const BEAT = 'k:.5 h:.5 s:.5 h:.5 k:.25 k:.25 h:.5 s:.5 h:.5 |';
/** The same with sixteenth hats, the busier second half of a phrase. */
const BUSY = 'k:.5 h:.25 h:.25 s:.5 h:.5 k:.5 h:.25 h:.25 s:.5 h:.25 h:.25 |';
/** A phrase-end fill: kick and snare trading, then four sixteenth snares climbing into the next downbeat. */
const FILL = 'k:.5 s:.5 s:.25 s:.25 k:.5 s:.5 s:.25@.6 s:.25@.7 s:.25@.85 s:.25@1 k:.5 |';
/** The boss's kit: double kicks, sixteenth hats, the snare still on 2 and 4. */
const HEAVY = 'k:.25 k:.25 h:.25 h:.25 s:.5 h:.25 k:.25 k:.5 h:.25 h:.25 s:.5 h:.25 k:.25 |';
/** The dome's four-on-the-floor with open-feeling hats on every and. */
const FOUR = 'k:.5 h:.5 s:.5@.9 h:.5 k:.5 h:.5 s:.5@.9 h:.5 |';
/** The last life's: sixteenth hats throughout, the kick doubled under every beat. */
const PANIC = 'k:.25 h:.25 k:.25 h:.25 s:.25 h:.25 k:.25 h:.25 k:.25 h:.25 k:.25 h:.25 s:.25 h:.25 s:.25 h:.25 |';

/** `count` bars of `bar`, the last replaced by `fill`. */
const groove = (count: number, bar: string, fill = FILL): string =>
  [...Array.from({ length: count - 1 }, () => bar), fill].join(' ');

/* ------------------------------------------------------------------ */
/* the arena: E minor synth-funk                                        */

// hook: Em Em Em Em | Am Am C B7. The brass hook pushes its E over the beat
// and answers itself a fourth down; bar 8 is the chromatic game-show turn.
const HOOK: Note[][] = [
  line(
    `
    r:.5 E5:1 D5:.5 B4:1 r:.5 G4:.5 | A4:.5 B4:.5 D5:1.5 B4:.5 r:1 |
    r:.5 E5:1 D5:.5 B4:.5 D5:.5 E5:.5 G5:.5 | F#5:1.5 E5:.5 D5:1 B4:1 |
    r:.5 A4:.5 C5:.5 E5:1.5 D5:.5 C5:.5 | B4:.5 C5:.5 A4:2 r:1 |
    r:.5 G5:.5 E5:.5 C5:.5 G4:.5 C5:.5 E5:1 | F#5:.5 F5:.5 E5:.5 D#5:.5 B4:1 r:.5 A4:.5 |`,
    4
  ),
  line(over(funk, 'E2 E2 E2 E2 A1 A1 C2 B1'), 4),
  line(stabs(stab, 'G4/B4 G4/B4 B4/E5 G4/B4 C5/E5 A4/C5 E5/G5 D#5/F#5'), 4),
  line(groove(4, BEAT) + groove(4, BUSY), 4)
];

// hook-2: the same vamp, the brass answering higher and leaving through D, bVII, for the strain.
const HOOK_2: Note[][] = [
  line(
    `
    r:.5 E5:.5 G5:1 F#5:.5 E5:.5 D5:1 | B4:1.5 D5:.5 E5:2 |
    r:.5 E5:.5 G5:1 F#5:.5 E5:.5 B5:1 | A5:1 G5:.5 F#5:.5 E5:1 r:1 |
    r:1 C5:.5 E5:.5 A5:1.5 G5:.5 | E5:.5 D5:.5 C5:.5 A4:.5 B4:2 |
    r:.5 C5:.5 E5:.5 G5:1.5 E5:1 | A4:1 B4:.5 C5:.5 D5:1 F#5:1 |`,
    4
  ),
  line(over(funk, 'E2 E2 E2 E2 A1 A1 C2 D2'), 4),
  line(stabs(stab2, 'G4/B4 B4/E5 G4/B4 B4/E5 C5/E5 A4/C5 E5/G5 F#5/A5'), 4),
  line(groove(4, BEAT) + groove(4, BUSY), 4)
];

// strain: G G C D | Em C Am D, the relative major, the brass climbing to C6.
const STRAIN: Note[][] = [
  line(
    `
    r:.5 G5:1 F#5:.5 G5:.5 A5:.5 B5:1 | D5:.5 G5:.5 B5:2 A5:.5 G5:.5 |
    r:.5 E5:.5 G5:.5 C6:1.5 B5:.5 A5:.5 | A5:1 F#5:.5 D5:1.5 r:1 |
    r:.5 E5:.5 G5:.5 B5:1.5 A5:.5 G5:.5 | E5:1 C5:.5 E5:.5 G5:1 A5:1 |
    C6:1.5 B5:.5 A5:1 E5:1 | F#5:.5 G5:.5 A5:1 F#5:.5 D5:.5 C5:1 |`,
    4
  ),
  line(over(funk, 'G2 G2 C2 D2 E2 C2 A1 D2'), 4),
  line(stabs(stab, 'B4/D5 B4/D5 C5/E5 A4/D5 G4/B4 C5/E5 A4/C5 F#5/A5'), 4),
  line(groove(4, BEAT) + groove(4, BUSY), 4)
];

// turn: C C#dim D B7, chromatic roots climbing into the dominant, which hands back to the hook's E.
const TURN: Note[][] = [
  line(
    `
    r:.5 G5:1 E5:.5 C5:.5 E5:.5 G5:1 | r:.5 G5:1 E5:.5 C#5:.5 E5:.5 A#5:1 |
    A5:1 F#5:.5 D5:.5 A5:1 B5:.5 C6:.5 | D#6:.5 D6:.5 C#6:.5 B5:.5 A5:1 F#5:.5 D#5:.5 |`,
    4
  ),
  line(over(funk, 'C2 C#2 D2 B1'), 4),
  line(stabs(stab, 'E5/G5 E5/G5 F#5/A5 D#5/A5'), 4),
  line(groove(4, BUSY), 4)
];

/* ------------------------------------------------------------------ */
/* boss: E Phrygian, faster, the brass descending                       */

// boss-a: Em Em F F Em Em F G, over the sixteenth pedal.
const BOSS_A: Note[][] = [
  line(
    `
    r:.5 E5:1 F5:.5 E5:.5 D5:.5 B4:1 | r:1 B4:.5 D5:.5 F5:1.5 E5:.5 |
    r:.5 E5:1 F5:.5 E5:.5 G5:.5 A5:1 | A#5:1 A5:.5 G5:.5 F5:1 E5:1 |
    r:.5 E5:1 F5:.5 E5:.5 D5:.5 B4:1 | C5:.5 D5:.5 F5:2 E5:1 |
    F5:.5 A5:.5 C6:1.5 A#5:.5 A5:1 | G5:.5 F#5:.5 G5:.5 A5:.5 B5:1 D6:.5 F5:.5 |`,
    4
  ),
  line(over(drive, 'E2 E2 F2 F2 E2 E2 F2 G2'), 4),
  line(stabs(stab, 'G4/B4 F4/B4 A4/C5 A4/C5 G4/B4 F4/B4 A4/C5 B4/D5'), 4),
  line(groove(8, HEAVY), 4)
];

// boss-b: Am Am F F Em Em G B7.
const BOSS_B: Note[][] = [
  line(
    `
    r:.5 A5:1 G5:.5 E5:.5 C5:.5 A4:1 | r:1 A4:.5 C5:.5 E5:1.5 D5:.5 |
    F5:1.5 E5:.5 F5:1 A5:1 | C6:.5 A#5:.5 A5:.5 G5:.5 F5:2 |
    r:.5 E5:1 F5:.5 E5:.5 D5:.5 B4:1 | r:.5 B4:.5 E5:.5 G5:1.5 F5:.5 E5:.5 |
    D5:.5 G5:.5 B5:1 D6:1 B5:1 | D#6:.5 C6:.5 B5:.5 A5:.5 F#5:1 D#5:.5 F5:.5 |`,
    4
  ),
  line(over(drive, 'A1 A1 F2 F2 E2 E2 G2 B1'), 4),
  line(stabs(stab2, 'C5/E5 C5/E5 A4/C5 A4/C5 G4/B4 F4/B4 B4/D5 D#5/F#5'), 4),
  line(groove(8, HEAVY), 4)
];

// boss-c: C D Em F G Am Bb B7, stepping up the scale to the dominant.
const BOSS_C: Note[][] = [
  line(
    `
    r:.5 G5:1 E5:.5 C5:.5 E5:.5 G5:1 | A5:.5 F#5:.5 D5:.5 F#5:.5 A5:2 |
    B5:1.5 G5:.5 E5:1 G5:1 | C6:.5 A5:.5 F5:1.5 A5:.5 C6:1 |
    D6:1 B5:.5 G5:.5 B5:1 D6:1 | E6:.5 C6:.5 A5:1.5 C6:.5 E6:1 |
    F6:.5 D6:.5 A#5:1 D6:1 F6:1 | F#6:.5 F6:.5 E6:.5 D#6:.5 B5:1 A5:.5 F5:.5 |`,
    4
  ),
  line(over(drive, 'C2 D2 E2 F2 G2 A1 A#1 B1'), 4),
  line(stabs(stab, 'E5/G5 F#5/A5 G5/B5 A5/C6 B5/D6 C6/E6 D6/F6 D#6/F#6'), 4),
  line(groove(8, HEAVY), 4)
];

/* ------------------------------------------------------------------ */
/* dome: the prize room, E major                                        */

// dome-a: E E A B | E C#m A B.
const DOME_A: Note[][] = [
  line(
    `
    r:.5 E5:.5 G#5:.5 B5:1 G#5:.5 E5:1 | F#5:.5 G#5:.5 F#5:.5 E5:.5 B4:2 |
    r:.5 A5:1 G#5:.5 F#5:.5 E5:.5 C#5:1 | D#5:.5 E5:.5 F#5:1.5 A5:.5 G#5:.5 F#5:.5 |
    r:.5 E5:.5 G#5:.5 B5:1 G#5:.5 E6:1 | D#6:.5 C#6:.5 B5:.5 G#5:.5 C#6:2 |
    A5:1 C#6:.5 B5:.5 A5:1 F#5:1 | G#5:.5 F#5:.5 E5:.5 D#5:.5 F#5:1 r:.5 D#5:.5 |`,
    4
  ),
  line(over(disco, 'E2 E2 A1 B1 E2 C#2 A1 B1'), 4),
  line(stabs(skank, 'G#4/B4 G#4/B4 A4/C#5 B4/D#5 G#4/B4 G#4/C#5 A4/C#5 A4/D#5'), 4),
  line(groove(8, FOUR), 4)
];

// dome-b: E G#m A B | C D A B7, the two borrowed chords the prize rain falls through.
const DOME_B: Note[][] = [
  line(
    `
    r:.5 B5:1 G#5:.5 E5:.5 G#5:.5 B5:1 | D#6:.5 B5:.5 G#5:1 B5:1 D#6:1 |
    E6:.5 C#6:.5 A5:1.5 C#6:.5 E6:1 | F#6:1 D#6:.5 B5:.5 F#5:1 D#5:1 |
    r:.5 E5:.5 G5:.5 C6:1 G5:.5 E5:1 | F#5:.5 A5:.5 D6:1 A5:.5 F#5:.5 D5:1 |
    C#6:.5 A5:.5 E5:1 A5:.5 C#6:.5 E6:1 | D#6:.5 E6:.5 D#6:.5 C#6:.5 B5:1 A5:.5 F#5:.5 |`,
    4
  ),
  line(over(disco, 'E2 G#1 A1 B1 C2 D2 A1 B1'), 4),
  line(stabs(skank, 'G#4/B4 G#4/B4 A4/C#5 B4/D#5 G4/C5 A4/D5 A4/C#5 A4/D#5'), 4),
  line(groove(8, FOUR), 4)
];

/* ------------------------------------------------------------------ */
/* danger: the last life                                                */

// last-life: an E pedal in sixteenths under a two-note alarm a semitone apart, the bass leaving on B.
const LAST_LIFE: Note[][] = [
  line(
    `
    r:.5 E5:.5 F5:.5 E5:.5 A#4:1 B4:1 | r:.5 E5:.5 F5:.5 E5:.5 G5:.5 F5:.5 E5:1 |
    r:.5 E5:.5 F5:.5 E5:.5 A#4:1 B4:1 | C5:.5 B4:.5 A#4:.5 A4:.5 G#4:1 B4:1 |
    r:.5 B5:.5 C6:.5 B5:.5 F5:1 F#5:1 | r:.5 B5:.5 C6:.5 B5:.5 D6:.5 C6:.5 B5:1 |
    r:.5 B5:.5 C6:.5 B5:.5 F5:1 F#5:1 | G5:.5 F#5:.5 F5:.5 E5:.5 D#5:1 F#5:1 |`,
    4
  ),
  line(over(drive, 'E2 E2 E2 E2 E2 E2 E2 B1'), 4),
  line(stabs(stab2, 'F4/B4 F4/B4 F4/B4 F4/B4 F5/B5 F5/B5 F5/B5 D#5/A5'), 4),
  line(groove(8, PANIC), 4)
];

/* ------------------------------------------------------------------ */
/* intro: "you're on!"                                                  */

/**
 * Two bars before the hook, once each time the music starts from silence: a
 * brass call up the E major triad, the bright game-show face the arena then
 * turns minor, over the slap bass and a snare roll, and B7 held into the
 * hook's first E. The kit crashes in on the downbeat of the bar that follows.
 */
const INTRO: Note[][] = [
  line('E5:.5 E5:.5 E5:.5 G#5:.5 B5:2 | r:.5 A5:.5 G#5:.5 F#5:.5 D#5:2 |', 4),
  line('E2:.5 E2:.5 E3:.5 E2:.5 E2:1 r:1 | B1:.5 B1:.5 B2:.5 B1:.5 B1:2 |', 4),
  line('r:.5 E4:.5 r:.5 G#4:.5 B4:2 | r:.5 A4:.5 r:.5 F#4:.5 D#4:2 |', 4),
  line('r:2 s:.25@.4 s:.25@.5 s:.25@.6 s:.25@.7 s:.25@.8 s:.25@.9 s:.25@1 s:.25@1 | k:.5 s:.5 r:1 k:1 r:1 |', 4)
];

/* ------------------------------------------------------------------ */
/* stingers and endings                                                 */

/**
 * The show's moments, one line per track (lead, bass, stabs, drums). They play
 * over the running music, which ducks under them, so the loop keeps its place.
 * Each is in E so it belongs over whichever scene is running; the ones the
 * contestant hears most, a room cleared and a prize, are the shortest.
 */
const STINGER_LINES: Record<string, Note[][]> = {
  // A room cleared: the brass up the triad to a held E.
  [STINGERS.roomClear]: [
    line('E5:.25 G5:.25 B5:.5 E6:1'),
    line('E2:.5 E3:.5 E2:1'),
    line('r:.5 B4:.5 E5:1'),
    line('k:.5 s:.5 k:.5 s:.5')
  ],
  // A prize: one ding on the electric piano, a brass tick above it.
  [STINGERS.prize]: [line('r:.5 E6:.5'), line('r:1'), line('E5:.25 G#5:.25 B5:.5'), line('r:1')],
  // A new car! The fanfare at full stretch over a snare roll.
  [STINGERS.car]: [
    line('E5:.5 G#5:.5 B5:.5 E6:1.5 D#6:.5 E6:.5'),
    line('E2:.5 E3:.5 E2:.5 E3:.5 B1:1 E2:1'),
    line('r:.5 G#4:.5 r:.5 B4:.5 r:.5 G#4:.5 B4:1'),
    line('k:.5 s:.5 k:.5 s:.5 s:.25@.6 s:.25@.75 s:.25@.9 s:.25@1 k:1')
  ],
  // A death: the brass slipping a semitone at a time onto F over the tritone.
  [STINGERS.death]: [
    line('G5:.5 F#5:.5 F5:1'),
    line('E2:1 A#1:1'),
    line('r:.5 A#4:.5 r:1'),
    line('k:.5 k:.5 s:1')
  ],
  // An extra life: a quick rise to a held E on the brass, the piano a third under.
  [STINGERS.extraLife]: [
    line('E5:.25 G#5:.25 B5:.25 E6:1.25'),
    line('E2:.5 E3:.5 E2:1'),
    line('r:.5 E5:.5 G#5:1'),
    line('r:.5 s:.5 k:1')
  ],
  // A boss down: three hits on B and the E above, the kit on every one.
  [STINGERS.bossDown]: [
    line('B5:.5 B5:.5 B5:.5 E6:2.5'),
    line('E2:.5 E2:.5 E2:.5 E3:2.5'),
    line('r:.5 G4:.5 r:.5 B4:2.5'),
    line('k:.5 k:.5 k:.5 s:.5 k:2')
  ],
  // A studio cleared: the game-show tag, up the triad and down through D over the bass stepping C, D, E.
  [STINGERS.studioClear]: [
    line('E5:.5 G5:.5 B5:.5 E6:.5 D6:.5 B5:.5 G5:1'),
    line('E2:.5 E3:.5 C2:.5 C3:.5 D2:.5 D3:.5 E2:1'),
    line('r:.5 B4:.5 r:.5 C5:.5 r:.5 D5:.5 E5:1'),
    line('k:.5 s:.5 k:.5 s:.5 k:.5 s:.5 s:.25 s:.25 k:.5')
  ],
  // The run's two endings, played through `playEnding`: the loop stops under
  // them and they sound alone. An ending may land home, which a loop's seam
  // may not.
  //
  // Game over: two bars of brass sinking chromatically from B onto E, the
  // bass walking down under it, the kit falling to single hits.
  [ENDINGS.gameOver]: [
    line('B5:1 A#5:.5 A5:.5 G#5:1 G5:1 | F#5:1 F5:1 E5:2 |', 4),
    line('E2:1 E2:1 D2:1 C#2:1 | C2:1 B1:1 E2:2 |', 4),
    line('r:.5 E5:.5 r:.5 D#5:.5 r:.5 D5:.5 r:.5 C#5:.5 | C5:1 B4:1 G4:2 |', 4),
    line('k:1 r:1 k:1 r:1 | k:.5 k:.5 s:1 k:2 |', 4)
  ],
  // Winner: four bars of the dome's E major fanfare, I vi IV V and home, the
  // one V to I in the score, over disco octaves and the four-on-the-floor kit.
  [ENDINGS.winner]: [
    line(
      `
      E5:.5 G#5:.5 B5:.5 E6:1 D#6:.5 E6:1 | F#6:1 E6:.5 D#6:.5 B5:1 G#5:1 |
      A5:.5 B5:.5 C#6:1 B5:.5 A5:.5 G#5:1 | F#5:.5 G#5:.5 B5:1 E6:2 |`,
      4
    ),
    line(`${disco('E2')} ${disco('C#2')} ${disco('A1')} B1:.5 B2:.5 B1:.5 B2:.5 E2:2 |`, 4),
    line(`${skank('G#4', 'B4')} ${skank('G#4', 'C#5')} ${skank('A4', 'C#5')} r:.5 A4:.5 r:.5 D#5:.5 G#4:2 |`, 4),
    line(`${FOUR} ${FOUR} ${FILL} k:.5 s:.5 k:.5 s:.5 k:2 |`, 4)
  ]
};

export const PRIMETIME_MUSIC: GameAudioOptions = {
  tempo: BASE_TEMPO,
  // Three FM voices that hold their sustain run hot for their peak, as CALCIO
  // '90's do, so the bus is trimmed to sit with the rest of the floor.
  volume: 0.07,
  tonic: p('E3'),
  tracks: [
    {
      // LEAD, YM2151 brass: ratio 1 at a high index falling slowly is the
      // bright FM brass tone; the 30 ms attack and the held sustain are a
      // section rather than a pluck; the low-pass starts an octave and a bit
      // under its cutoff and opens over 60 ms, the brass speaking. The
      // vibrato is the chip's LFO.
      name: 'lead',
      wave: 'sine',
      fm: { ratio: 1, index: 3, indexDecay: 0.7 },
      adsr: { attack: 0.03, decay: 0.2, sustain: 0.6, release: 0.1 },
      filter: { cutoff: 2200, q: 0.8, envAmount: -1.2, envDecay: 0.06 },
      vibrato: 6,
      volume: 0.8
    },
    {
      // BASS, FM synth-funk: ratio 2 with a large index collapsing in 60 ms is
      // the knock of a slapped string; the resonant low-pass opens two
      // octaves on the attack and shuts in 90 ms, closing behind the pluck.
      name: 'bass',
      wave: 'sine',
      fm: { ratio: 2, index: 3.5, indexDecay: 0.06 },
      adsr: { attack: 0.002, decay: 0.16, sustain: 0.3, release: 0.05 },
      filter: { cutoff: 420, q: 2, envAmount: 2.2, envDecay: 0.09 },
      volume: 0.8
    },
    {
      // STABS, FM electric piano: ratio 1 at a modest index decaying over
      // 400 ms is a tine, bright at the strike and rounding off; a pluck that
      // rings a little, under the brass.
      name: 'stabs',
      wave: 'sine',
      fm: { ratio: 1, index: 1.6, indexDecay: 0.4 },
      adsr: { attack: 0.002, decay: 0.35, sustain: 0.2, release: 0.15 },
      volume: 0.5
    },
    {
      // DRUMS, the DAC channel: the engine's kit, the snare loud on 2 and 4.
      name: 'drums',
      volume: 0.75
    }
  ],
  form: {
    intro: INTRO,
    sections: {
      hook: HOOK,
      'hook-2': HOOK_2,
      strain: STRAIN,
      turn: TURN,
      'boss-a': BOSS_A,
      'boss-b': BOSS_B,
      'boss-c': BOSS_C,
      'dome-a': DOME_A,
      'dome-b': DOME_B,
      'last-life': LAST_LIFE
    },
    order: ['hook', 'hook-2', 'strain', 'turn'],
    scenes: {
      [SCENES.boss]: { order: ['boss-a', 'boss-b', 'boss-c'], tempo: BOSS_TEMPO },
      [SCENES.dome]: { order: ['dome-a', 'dome-b'], tempo: DOME_TEMPO }
    },
    danger: { order: ['last-life'], tempo: DANGER_TEMPO }
  },
  stingers: STINGER_LINES
};
