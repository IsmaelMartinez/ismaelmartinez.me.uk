/**
 * Snake's score: one phone buzzer playing an original ringtone in G major,
 * wound up by the snake.
 *
 * Reference and brief (#416, ADR 003's round 3 amendment). Blockade (1976)
 * beeped with the arrows and crashed; Nokia Snake (1998) ran on a phone's
 * monophonic buzzer, and the sound of the lineage is the ringtone palette:
 * one square voice, no harmony, no vibrato, no echo, hard note on and off,
 * short notes, phrases about four bars long with rests as punctuation. The
 * Nokia tune (a registered sound mark, from Tarrega's Gran Vals) and every
 * other ringtone melody are left alone; this is an original in the idiom,
 * and where it could sound like the Nokia tune it goes the other way (that
 * one opens on a falling step and a leap, this one climbs by step).
 *
 * The trait each choice serves:
 *   - one voice, `square` (a 50% duty buzzer): the phone had one tone
 *     generator and no second part, so there is no bass and no chord under
 *     the tune; the harmony is only what the line outlines;
 *   - an `adsr` that is a switch (2 ms on, full level held, 5 ms off) rather
 *     than the pluck: a buzzer does not decay, it is on or off, and every
 *     note plays at the one level because the phone had no per-note dynamics
 *     (so no `gain` anywhere);
 *   - no `vibrato`, no `echo`, no filter: the buzzer had none of them;
 *   - `ring()` below, the score written as ringtone text (`8G5` a quaver G,
 *     `16p` a semiquaver rest), since that is how these tunes were typed into
 *     a phone, and every note released a quarter of its value early
 *     (`tail`), so the line is staccato and a repeated note strikes again;
 *   - staccato quavers and semiquaver stutters (the repeated-note figure of
 *     phrase b), with rests on beats, which is where this idiom's bounce
 *     comes from rather than from notes held over the beat;
 *   - `Note.arp` sparingly: one D major chord in the loop, at the end of
 *     phrase b, spelled by fast alternation the way a ringtone composer
 *     implied a chord on one voice, and the trills of the two stingers.
 *     `arpRate` 30 is slow enough to read as a trill on a buzzer, where the
 *     default 50 would blur into a tone;
 *   - bright major, a high register (D5 to G6) where a small buzzer speaks
 *     best, and a hook that
 *     is a little cheeky: it climbs by step, turns back and answers itself
 *     with a single low D and a rest.
 *
 * Form, a two-bar intro once per run, then four four-bar phrases of 16 bars
 * (64 beats), each phrase a ringtone in length and each ending on a rest:
 *   intro  the phone picking up (#417): the G major chord climbed D5 G5 B5 D6
 *       to the top G6 and a rest, then phrase b's stutter on D6 twice, and
 *       B5 A5 down to the hook's own low D and a rest, so the run's first
 *       hook lands on the downbeat as the dominant's answer. It stays inside
 *       the loop's D5 to G6, so it is the same buzzer in the same register;
 *   a   the hook over G, the same climb pushed on to E6 and left hanging, a
 *       run down over C from the E6, and a half cadence on A over D;
 *   a2  the hook again, answered: a run down to F sharp, then home on G with
 *       the low D between;
 *   b   the contrast, the buzzer's stutter: semiquaver pairs on E6, then D6,
 *       broken thirds falling over Am, and the D major chord as an arpeggio;
 *   a3  the hook a last time, reaching the pass's apex on G6, then a
 *       staccato climb A B C D that asks the question the top answers.
 * The pass ends on D over the implied dominant, so the loop hands back to G
 * on the next downbeat rather than cadencing before it. One pass is 28.7 s at
 * the base tempo (134) and 20.6 s at the cap (186).
 *
 * Session and load (ADR 003). Runs are a minute or two and attention is
 * total, steering every step, so the profile is minimal: one voice, a
 * catchy line, nothing that competes for the ear. The rhythms gate stays on
 * (a ringtone varies its bar rhythm like any tune); the syncopation gate is
 * off, because it wants a note held over a beat in every eight bars and the
 * held push is exactly the Charleston cell this brief removes; the buzzer's
 * off-beat energy comes from rests on the beat instead, which the gate does
 * not count. The seam gate stays on and passes honestly: the pass ends on D.
 *
 * Adaptive hooks, wired in `game.ts`:
 *   - the tempo follows the snake. Every apple tightens the step interval,
 *     and `tempoForStep` maps it linearly onto BASE_TEMPO to MAX_TEMPO, so
 *     the ringtone winds up on the same apple the snake does and reaches the
 *     cap as the snake reaches its top speed. A note-grid step per snake step
 *     was considered and not taken: a semiquaver per step would run the tempo
 *     from 94 to 214 bpm, past the cap that `MAX_TEMPO` explains;
 *   - the `walls` stinger when an arena rung claims its walls: the phone
 *     rings twice (D6 trilling on A5). The buzzer is one voice, so the game
 *     cuts the tune while it rings (`BUZZER`) and brings it back after;
 *   - the `gameover` stinger in place of the shared effect: a run down to G5
 *     and a low G4 trilling on the semitone above for two beats, the buzzer's
 *     stand-in for Blockade's crash. It is the run's ending, so the game plays
 *     it through `playEnding` (#417), which stops the tune under it and closes
 *     the music once it has sounded; with the music muted it falls back to the
 *     `gameover` effect and a stop, as before;
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

/** The one voice's name, which the game cuts while a stinger has the buzzer. */
export const BUZZER = 'buzzer';

/**
 * Deliberately the minimal cabinet, and its runs are short; the loop is
 * measured at the cap. Syncopation is off because the brief's staccato
 * idiom holds nothing over a beat (see the module docstring).
 */
export const MUSIC_PROFILE: MusicProfile = {
  session: 'minimal',
  fastestTempo: MAX_TEMPO,
  gates: { syncopation: false }
};

/**
 * The music's tempo for a step interval: the base tempo at the run's opening
 * interval, the cap at the fastest, and linear in between.
 */
export function tempoForStep(interval: number): number {
  const t = (START_STEP - interval) / (START_STEP - FASTEST_STEP);
  return BASE_TEMPO + (MAX_TEMPO - BASE_TEMPO) * Math.min(1, Math.max(0, t));
}

/**
 * A note's silent tail, in beats: a quarter of its value, and never more than
 * a semiquaver. That is the staccato the brief asks for (a quaver sounds for
 * three quarters of itself, 168 ms of 224 at the base tempo), it makes a
 * repeated note strike again rather than merge into one tone, and the cap
 * keeps a long note from turning into a short one with a hole after it.
 */
const tail = (beats: number): number => Math.min(beats / 4, 1 / 4);

/** A sounding note of `beats`, released early, then its silent tail. */
function tone(freq: number, beats: number, arp?: number[]): Note[] {
  const note: Note = { freq, beats: beats - tail(beats) };
  if (arp) note.arp = arp;
  return [note, { freq: REST, beats: tail(beats) }];
}

/**
 * A line typed as ringtone text: space-separated tokens of a duration (1, 2,
 * 4, 8 or 16, a whole note down to a semiquaver, with a `.` for dotted) then
 * a pitch in `p()`'s spelling or `p` for a rest, e.g. `8G5 16p 4.D6`. An
 * unreadable token throws, as `p()` does on a bad name, so `music.test.ts`
 * catches a typo at import.
 */
function ring(text: string): Note[] {
  return text
    .trim()
    .split(/\s+/)
    .flatMap(token => {
      const m = /^(16|8|4|2|1)(\.?)(p|[A-G][#b]?\d)$/.exec(token);
      if (!m) throw new Error(`unreadable ringtone token: ${token}`);
      const beats = (4 / Number(m[1])) * (m[2] ? 1.5 : 1);
      return m[3] === 'p' ? [{ freq: REST, beats }] : tone(p(m[3]), beats);
    });
}

// The hook's two opening bars, the figure every phrase but b starts from.
const hook = '8G5 16A5 16B5 8C6 8B5 8A5 8p 8D5 8p   8G5 16A5 16B5 8C6 8D6 8E6 8p 4p';

export const SNAKE_MUSIC: GameAudioOptions = {
  tempo: BASE_TEMPO,
  volume: 0.14,
  tonic: p('G4'),
  tracks: [
    // The buzzer: a 50% square switched on and off, nothing else (see above).
    // A held square carries far more power than a plucked one that decays
    // (the old two-voice render measured 0.016 RMS, this voice at full level
    // 0.075), and it sits in the ear's most sensitive octaves, so it plays at
    // about a third of full level, which renders at 0.025 RMS.
    {
      name: BUZZER,
      wave: 'square',
      adsr: { attack: 0.002, decay: 0, sustain: 1, release: 0.005 },
      arpRate: 30,
      volume: 0.35
    }
  ],
  form: {
    // The phone picking up, once per run: the chord climbed to the top, the
    // stutter, and down to the low D the hook answers (see above).
    intro: [ring('8D5 8G5 8B5 8D6 4G6 4p   16D6 16D6 8p 16D6 16D6 8p 8B5 8A5 8D5 8p')],
    sections: {
      a: [ring(`${hook}   8C6 16D6 16E6 8D6 8C6 8B5 8C6 8A5 8p   8B5 8A5 8G5 8F#5 4A5 4p`)],
      a2: [ring(`${hook}   8E6 16D6 16C6 8A5 8C6 8B5 16A5 16G5 8F#5 8A5   8G5 8p 8D5 8p 4G5 4p`)],
      b: [
        [
          ...ring('16E6 16E6 8p 16E6 16E6 8p 8D6 8C6 8D6 8p'),
          ...ring('16D6 16D6 8p 16D6 16D6 8p 8C6 8B5 8C6 8p'),
          ...ring('8C6 8E6 8A5 8C6 8B5 8D6 8G5 8B5'),
          // The one chord in the loop: D major, spelled by the buzzer alone.
          ...ring('8A5 8B5 8C6 8D6'),
          ...tone(p('D5'), 2, [0, 4, 7, 12])
        ]
      ],
      a3: [ring(`${hook}   8C6 16D6 16E6 8G6 8E6 8D6 8C6 8B5 8p   8A5 8p 8B5 8p 8C6 8p 4D6`)]
    },
    order: ['a', 'a2', 'b', 'a3']
  },
  stingers: {
    // The walls closing in: the phone rings twice. A rung arrives on the step
    // an apple is eaten, so the line opens with a quaver's rest and the eat
    // effect sounds first, the ring answering it.
    walls: [[...ring('8p'), ...tone(p('D6'), 1, [0, -5]), ...ring('8p'), ...tone(p('D6'), 1, [0, -5])]],
    // The crash: a run down to G, then a low G trilling on the semitone above.
    gameover: [[...ring('16D6 16C6 16B5 16A5 8G5 8p'), ...tone(p('G4'), 2, [0, 1])]]
  }
};

/** How long a stinger sounds at `bpm`, in seconds, so the game knows when the buzzer is free again. */
export function stingerSeconds(name: string, bpm: number): number {
  const line = SNAKE_MUSIC.stingers?.[name]?.[0] ?? [];
  return (line.reduce((sum, note) => sum + note.beats, 0) * 60) / bpm;
}
