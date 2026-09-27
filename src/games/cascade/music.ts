/**
 * Cascade's score: three tunes on a Game Boy, after Hirokazu Tanaka's
 * Tetris (1989), rotated by level band (#412).
 *
 * The brief (ADR 003, round 3). Game Boy Tetris offers three tunes, Type A
 * (Korobeiniki), Type B (an original) and Type C (the Menuet from Bach's
 * French Suite No. 3), at about 150 bpm on the Game Boy's APU: two duty-cycle
 * pulses, a 4-bit, 32-step wave channel for the bass and a noise channel, in
 * mono, with no pads and no echo. Its signature is folk-minor or Baroque
 * material on two pulses moving in thirds and sixths, a wave-channel bass
 * bouncing in octaves, noise-channel ticks, and a speed-up tied to the stack.
 * Korobeiniki is not used: a US sound mark on an electronic Korobeiniki in
 * video games is reported (the round 3 plan's owner default), so the A slot
 * is an original in the same folk-minor manner rather than the tune.
 *
 * The three tunes, one per level band (`TUNE_BAND_LEVELS`), cycling:
 *   folk (the `order`, levels 1 to 3), D minor, 2/4: an original dance in a
 *       Russian folk-minor manner. Its hook is one cell, a note, a push a
 *       third above it held over the beat, and a step back, climbing by
 *       thirds (D, F, G) to a B flat peak and falling home, an arch; the
 *       second strain turns to the relative major and sequences down by
 *       step; the third (`fc`) is a stamping close over an A pedal that hands
 *       back to the top on the dominant.
 *   dance (scene, levels 4 to 6), E minor with the Dorian C sharp, 2/4: an
 *       original in the manner of the Type B slot, a dotted gallop that
 *       sequences down a step per bar pair (Em A, D G, C D7), a second strain
 *       in G major that climbs to a C6 peak, and a close on B7.
 *   menuet (scene, levels 7 to 9), B minor, 3/4: Bach's Menuet from the French
 *       Suite No. 3, BWV 814 (public domain), as written: the right hand's
 *       broken-chord eighths on the lead, the left hand on the wave bass, where
 *       Bach already bounces it in octaves (B3 B2, B2 B3, A2 A3). Both strains
 *       are played with their repeats, and the second pulse joins only on the
 *       repeat, holding thirds and sixths under the right hand, so the first
 *       time through is Bach's two voices and the repeat is the Game Boy's three.
 * Level 10 starts the folk tune again from its top, and so on round.
 *
 * Voices, and the reference trait each serves:
 *   lead, a 50% pulse with a Game Boy-style volume envelope (a hard attack
 *     decaying to a held level, no vibrato): pulse channel 1;
 *   harmony, a 25% pulse under the lead, mostly in parallel thirds and sixths,
 *     sometimes a slower countermelody: pulse channel 2 and the "two pulses in
 *     thirds" signature. It rests the first time through each tune, so the
 *     texture fills as a tune settles in;
 *   bass, a 32-step wavetable quantised to 4 bits, with no decay (the wave
 *     channel has only fixed levels): the wave channel, bouncing in octaves
 *     under the folk tune, root-octave-fifth under the dance, and Bach's own
 *     line under the menuet;
 *   ticks, the NES/Game Boy short (metallic) noise on hats and a noise snare,
 *     no kick (the noise channel has none): the noise channel. Always on in
 *     the two originals, silent in the menuet, which is a keyboard piece.
 * Mono (no pan), dry (no echo), no pad, no detuned twin: the Game Boy had none
 * of them, and ADR 003's round 3 amendment says not to reach for a feature
 * the platform lacked.
 *
 * Metre. The form's bar is 6 beats, the common multiple of the originals' 2/4
 * and the menuet's 3/4, so `setScene` and `setDanger` always land on a bar
 * line of whichever tune is playing (every third 2/4 bar, every other 3/4 bar),
 * at worst 6 beats (2.5 s at the base tempo) after the call.
 *
 * Tempo and length. `BASE_TEMPO` 144, the Game Boy's pace, winds up 3 bpm per
 * level to `MAX_TEMPO` 168 (level 9), and every loop is sized there: the folk
 * tune and the dance are 96 beats (34.3 s at 168, 40 s at 144), the menuet 216
 * (77 s at 168). Session: standard, runs of a few minutes to a quarter of an
 * hour with high attention, so each band is a tune with a hook, not a bed.
 *
 * Adaptive hooks, all wired in `game.ts`:
 *   - the level band picks the tune (`tuneFor`), moving on a bar line at the
 *     level-up that crosses into a new band; the band change is what a player
 *     hears as progress, which is why the drum layer of the round 2 score is
 *     gone: the Game Boy's noise ticks play from the first bar, as they do
 *     under Type A, so they are part of the palette rather than a reward;
 *   - the tempo ramp above, and the danger variant `rush` when the stack
 *     reaches row 4, played `DANGER_TEMPO_LIFT` faster, after Game Boy and NES
 *     Tetris speeding up near the top of the well. It is one variant for all
 *     three tunes: the pulses climb a sequence in parallel thirds over a
 *     throbbing dominant pedal (a single pitch, not the octave bounce), with
 *     sixteenth ticks. A band change that comes while the stack is in danger
 *     waits until it recovers;
 *   - the `levelUp` stinger, a D major arpeggio in thirds on the two pulses,
 *     and the `hurry` stinger, a semitone alarm on both pulses, when a
 *     countdown enters its final 20 seconds, with the tempo lift.
 *
 * Gates. The originals are held to all three style gates. The menuet scene
 * switches two off, because the brief is Bach's piece as written: a Baroque
 * minuet has no syncopation, and it closes on its own tonic cadence, which
 * the Game Boy's Type C loops unaltered, so the seam arrives home.
 */
import { p, REST, type DrumName, type GameAudioOptions, type MusicProfile, type Note } from '../engine';

/** Starting tempo, the Game Boy's pace. The per-level ramp in `game.ts` winds up from here. */
export const BASE_TEMPO = 144;

/**
 * The ceiling the per-level ramp in `game.ts` stops at, reached at level 9.
 * It lives with the score because ADR 003 sizes a ramping loop at its fastest
 * tempo. It was 198 in round 2; the Game Boy's tunes sit near 150 and do not
 * ramp with the level at all (only the stack speeds them up), and the
 * Sonotris study found a synced ramp makes Tetris measurably harder for
 * novices, so the ramp is kept short: enough to be felt, never a different
 * piece. The danger lift takes it to 193 at the top.
 */
export const MAX_TEMPO = 168;

/** How much faster the danger variant plays than the tempo the level has reached. */
export const DANGER_TEMPO_LIFT = 1.15;

/** Levels per tune: 1 to 3 the folk tune, 4 to 6 the dance, 7 to 9 the menuet, then round again. */
export const TUNE_BAND_LEVELS = 3;

/** The tunes in band order; null is the form's `order` (the folk tune), the rest are scenes. */
export const TUNES = [null, 'dance', 'menuet'] as const;

/** The tune a level plays: the scene name, or null for the folk tune. */
export function tuneFor(level: number): (typeof TUNES)[number] {
  const band = Math.floor((Math.max(1, level) - 1) / TUNE_BAND_LEVELS);
  return TUNES[band % TUNES.length];
}

/** The first section of the folk tune, where the band cycle comes back to. */
export const FOLK_TOP = 'fa';

/** A short, fast-paced run; every tune is measured at the ramp's ceiling. */
export const MUSIC_PROFILE: MusicProfile = {
  session: 'standard',
  fastestTempo: MAX_TEMPO,
  scenes: {
    dance: { session: 'standard', fastestTempo: MAX_TEMPO },
    // Bach as written: no syncopation, and his own final cadence at the seam.
    menuet: { session: 'standard', fastestTempo: MAX_TEMPO, gates: { syncopation: false, seam: false } }
  }
};

const DRUMS: Record<string, DrumName> = { h: 'hat', s: 'snare' };

/**
 * A line in a compact notation, one token per note: a pitch name (`D5`), `r`
 * for a rest, or `h`/`s` for a noise hat or snare, then `:beats`, which later
 * tokens without one reuse (as LilyPond carries a duration over). `|` marks a
 * bar line; with `bar` given, a bar that does not add up throws, so a slip in
 * the note data fails `music.test.ts` at import rather than sliding a voice.
 * A note starting off the beat is ducked a little, which is all the accent a
 * Game Boy envelope gives: the strong beats are the ones left at full level.
 */
function line(text: string, bar?: number): Note[] {
  const out: Note[] = [];
  let beats = 0.5;
  let at = 0;
  let inBar = 0;
  const close = () => {
    if (bar !== undefined && Math.abs(inBar - bar) > 1e-9) {
      throw new Error(`bar of ${inBar} beats, not ${bar}, near beat ${at} in "${text.slice(0, 40)}..."`);
    }
    inBar = 0;
  };
  for (const token of text.match(/\||[^\s|]+/g) ?? []) {
    if (token === '|') {
      close();
      continue;
    }
    const [name, len] = token.split(':');
    if (len !== undefined) beats = Number(len);
    const offBeat = Math.abs(at - Math.round(at)) > 1e-9;
    const gain = offBeat ? 0.82 : undefined;
    let note: Note;
    if (name === 'r') note = { freq: REST, beats };
    else if (DRUMS[name]) note = { freq: REST, beats, drum: DRUMS[name], ...(offBeat ? { gain: 0.6 } : {}) };
    else note = { freq: p(name), beats, ...(gain ? { gain } : {}) };
    out.push(note);
    at += beats;
    inBar += beats;
  }
  if (inBar > 0) close();
  return out;
}

/** The same pitch name an octave up. */
const up = (name: string): string => name.replace(/\d+$/, o => String(Number(o) + 1));

/** The folk tune's bass: a 2/4 bar of the wave channel bouncing root and octave in eighths. */
const bounce = (roots: string): string =>
  roots
    .trim()
    .split(/\s+/)
    .map(r => `${r}:.5 ${up(r)} ${r} ${up(r)} |`)
    .join(' ');
/** The folk tune's first time through: the same roots, a quarter each on root and octave. */
const stride = (roots: string): string =>
  roots
    .trim()
    .split(/\s+/)
    .map(r => `${r}:1 ${up(r)} |`)
    .join(' ');
/** The dance's bass: root, octave, fifth, octave, the fifth written as a pitch name. */
const hop = (bars: string): string =>
  bars
    .trim()
    .split(/\s+/)
    .map(pair => {
      const [root, fifth] = pair.split('/');
      return `${root}:.5 ${up(root)} ${fifth} ${up(root)} |`;
    })
    .join(' ');
/**
 * A voice resting for `bars` bars, one rest per bar. Never one long rest: the
 * engine commits a whole note before it moves on, so a 32-beat rest would
 * hold every `setScene` and `setDanger` back until it ran out.
 */
const silent = (bars: number, beats: number): Note[] => Array.from({ length: bars }, () => ({ freq: REST, beats }));
/** `n` bars of a 2/4 tick pattern. */
const ticks = (bar: string, n: number): string => Array.from({ length: n }, () => `${bar} |`).join(' ');

// ---------------------------------------------------------------------------
// The folk tune, D minor, 2/4. 16-bar strains: the theme (Dm A Dm A7 Gm Dm A7
// Dm), the second strain (F F C7 C Dm Bb A7 A7), and the close.

const FOLK_THEME = `
  D5:.5 F5:1 E5:.5 | D5:.5 C#5 D5 E5 | F5:.5 A5:1 G5:.5 | F5:.5 E5 D5 C#5 |
  G5:.5 Bb5:1 A5:.5 | G5:.5 F5 E5 D5 | E5:.5 C#5 A4 C#5 | D5:1.5 r:.5 |`;
const FOLK_SECOND = `
  C5:.5 F5 F5 G5 | A5:1 G5:.5 F5 | Bb4:.5 E5 E5 F5 | G5:1 F5:.5 E5 |
  A4:.5 D5 D5 E5 | F5:1 E5:.5 D5 | C#5:.5 E5 A5 G5 | F5:.5 E5 D5 C#5 |`;
const FOLK_CLOSE = `
  D5:.5 F5 Bb5:1 | A5:.5 G5 F5:1 | Bb4:.5 D5 G5:1 | F5:.5 E5 C#5:1 |
  A4:.5 D5 F5 A5 | Bb5:.5 A5:1 G5:.5 | G5:.5 F5 E5 D5 | C#5:1 E5 |
  A5:.5 A5 G5 F5 | E5:.5 F5:1 D5:.5 | C#5:.5 C#5 D5 E5 | F5:1 E5 |
  D5:.5 D5 E5 F5 | G5:.5 F5 E5 D5 | C#5:.5 D5 E5 G5 | E5:1 A4:.5 r |`;

// The second pulse: sixths and thirds under the theme and second strain,
// then a countermelody through the close.
const FOLK_THEME_THIRDS = `
  F4:.5 A4:1 G4:.5 | F4:.5 E4 F4 G4 | D5:.5 F5:1 E5:.5 | A4:.5 G4 F4 E4 |
  Bb4:.5 D5:1 C5:.5 | Bb4:.5 A4 G4 F4 | C#5:.5 A4 E4 A4 | F4:1.5 r:.5 |`;
const FOLK_SECOND_THIRDS = `
  A4:.5 C5 A4 C5 | F5:1 E5:.5 C5 | G4:.5 C5 C5 A4 | E5:1 D5:.5 C5 |
  F4:.5 A4 A4 C5 | D5:1 C5:.5 Bb4 | A4:.5 C#5 E5 E5 | A4:.5 G4 F4 E4 |`;
const FOLK_CLOSE_COUNTER = `
  Bb4:2 | A4:1 C5 | G4:2 | A4:1 E4 |
  F4:2 | D5:1 Bb4 | Bb4:1 G4 | A4:2 |
  C#5:1 C#5 | A4:2 | A4:1 G4 | D5:1 C#5 |
  Bb4:2 | E5:.5 D5 C#5 Bb4 | A4:.5 Bb4 C#5 E5 | C#5:1 E4:.5 r |`;

const FOLK_ROOTS = 'D2 A2 D2 A2 G2 D2 A2 D2 F2 F2 C2 C2 D2 Bb1 A1 A1';
const FOLK_CLOSE_ROOTS = 'Bb1 F2 G2 A2 D2 G2 E2 A2 A2 A2 A2 A2 Bb1 A1 A1 A1';

const FOLK_TICK = 'h:.5 h s h';

// ---------------------------------------------------------------------------
// The dance, E minor with the Dorian C sharp, 2/4.

const DANCE_THEME_HEAD = `
  E5:.75 F#5:.25 G5:.5 E5 | F#5:.5 E5 C#5:1 | D5:.75 E5:.25 F#5:.5 D5 | E5:.5 D5 B4:1 |
  C5:.75 D5:.25 E5:.5 C5 | D5:.5 C5 A4:1 | B4:.5 E5 G5 B5 | A5:.5 G5 F#5:1 |
  E5:.75 F#5:.25 G5:.5 E5 | F#5:.5 E5 C#5:1 | D5:.75 E5:.25 F#5:.5 D5 | E5:.5 D5 B4:1 |
  C5:.5 E5:1 A5:.5 | G5:.5 F#5 E5 D#5 |`;
const DANCE_THEME_HOME = 'E5:.5 B4 G4 B4 | E5:1 r |';
const DANCE_THEME_AWAY = 'E5:.5 G5 C6 B5 | A5:.5 F#5 D#5:1 |';
const DANCE_SECOND = `
  B5:1 A5:.5 G5 | F#5:1 E5:.5 D5 | E5:.5 G5:1 E5:.5 | D5:1.5 B4:.5 |
  C5:.5 E5 A5 G5 | F#5:.5 E5 D5 A4 | B4:.5 G5:1 F#5:.5 | F#5:1 D#5 |
  G5:.5 E5 C5 E5 | A5:1 G5:.5 E5 | F#5:.5 D5 A4 D5 | B5:1 G5 |
  E5:.5 G5:1 C6:.5 | B5:.5 A5 G5 E5 | F#5:.5 A5 G5 F#5 | D#5:1 B4 |`;

const DANCE_THEME_THIRDS = `
  G4:.75 A4:.25 B4:.5 G4 | A4:.5 C#5 A4:1 | F#4:.75 G4:.25 A4:.5 F#4 | G4:.5 B4 G4:1 |
  E4:.75 E4:.25 G4:.5 E4 | F#4:.5 A4 F#4:1 | G4:.5 B4 E5 G5 | F#5:.5 E5 D#5:1 |
  G4:.75 A4:.25 B4:.5 G4 | A4:.5 C#5 A4:1 | F#4:.75 G4:.25 A4:.5 F#4 | G4:.5 B4 G4:1 |
  A4:.5 C5:1 E5:.5 | E5:.5 D#5 B4 F#4 | C5:.5 E5 G5 G5 | F#5:.5 D#5 B4:1 |`;
const DANCE_SECOND_COUNTER = `
  D5:1 B4 | A4:2 | G4:1 C5 | B4:2 |
  E4:1 A4 | D5:1 C5 | G4:2 | A4:1 F#4 |
  C5:1 G4 | E5:1 C5 | A4:1 F#4 | D5:2 |
  C5:1 E5 | E5:1 C5 | D#5:2 | A4:1 F#4 |`;

const DANCE_THEME_BASS = hop('E2/B2 A2/E3 D2/A2 G2/D3 C2/G2 D2/A2 E2/B2 B1/F#2 E2/B2 A2/E3 D2/A2 G2/D3 A2/E3 B1/F#2');
const DANCE_BASS_HOME = hop('E2/B2 E2/B2');
const DANCE_BASS_AWAY = hop('C2/G2 B1/F#2');
const DANCE_SECOND_BASS = hop(
  'G2/D3 D2/A2 C2/G2 G2/D3 A2/E3 D2/A2 E2/B2 B1/F#2 C2/G2 A2/E3 D2/A2 G2/D3 C2/G2 A2/E3 B1/F#2 B1/F#2'
);

/** The dance's ticks: the gallop's own long-short figure on the noise channel. */
const DANCE_TICK = 'h:.75 h:.25 s:.5 h';

// ---------------------------------------------------------------------------
// The menuet: Bach, BWV 814, as written (transcribed from the Mutopia
// Project's engraving, maintained by Knute Snortum). B minor, 3/4.

const MENUET_A_RH = `
  D5:.5 F#5 B5 F#5 C#5 F#5 | D5 F#5 B4 F#5 A#4 F#5 | B4 F#5 B5 F#5 C#5 F#5 | D5 F#5 B4 F#5 A#4 F#5 |
  D5 F#5 D5 B4 G5 E5 | C#5 E5 C#5 A4 F#5 D5 | B4 F#5 E5 D5 C#5 B4 | A#4 F#4 A#4 C#5 F#5 E5 |
  D5 F#5 B5 F#5 C#5 F#5 | D5 F#5 B4 F#5 A#4 F#5 | B4 F#5 B5 F#5 C#5 F#5 | D5 F#5 B4 F#5 A#4 F#5 |
  D5 F#5 D5 B4 G5 E5 | C#5 E5 C#5 A4 A5 E5 | F#5 A5 F#5 D5 A4 C#5 | D5:3 |`;
const MENUET_A_LH = `
  B3:1 B2 A#3 | B3 D4 F#4 | D4 B3 A#3 | B3 D3 F#3 |
  B2 B3 E3 | A2 A3 D3 | G2 G3 E3 | F#3:.5 G3 F#3 E3 D3 C#3 |
  B2:1 B3 A#3 | B3 D4 F#4 | D4 B3 A#3 | B3 D3 F#3 |
  B2 B3 E3 | A2 A3 C#3 | D3 F#3 A3 | D3 A2 D2 |`;
const MENUET_B_RH = `
  A5:.5 G5 F#5 E5 D5 C#5 | D5 E5 F#5 D5 E5 G5 | F#5 G5 A5:1 C#5 | D5 F#5 E5 |
  F#5 B5 G#5 | B4:.5 C#5 D5:1 C#5 | B4:.5 A4 G#4 F#4 G#4 E#4 | F#4:3 |
  A4:1.5 B4:.25 C5 B4:1 | A4:.5 G4 A4 F#4 G4 E4 | B4:1.5 C#5:.25 D5 C#5:1 | B4:.5 A#4 B4 G#4 A#4 F#4 |
  E5 C#5 F#4 C#5 E5 F#5 | G5 C#5 F#5 C#5 E5 C#5 | D5 B4 F#4 B4 D5 B4 | F#5 B4 E5 B4 D5 B4 |
  C#5 B4 D5 B4 E5 B4 | F#5 B4 G5 B4 E5 B4 | F#5:1 E5:.5 D5 C#5 D5 | B4:3 |`;
const MENUET_B_LH = `
  F#3:.5 A3 D4 A3 C#4 A3 | F#3 A3 D3 A3 C#3 A3 | D3 A3 D4 A3 C#4 A3 | F#3 A3 D3 A3 C#3 A3 |
  D3 F#3 D3 B2 B3 G#3 | E#3 G#3 E#3 C#3 G#3 E#3 | F#3:1 C#4 C#3 | F#3:.5 A3 C#4 A3 E3 A3 |
  D#3 F#3 B2 F#3 D#3 F#3 | E3:1 B2 E2 | E#3:.5 G#3 C#3 G#3 E#3 G#3 | F#3:1 C#3 F#2 |
  A#2 C#3 F#3 | A#3 F#3 A#3 | B2 D3 F#3 | B3 C#4 D4 |
  E4 F#4 G4 | D4 E4 C#4 | D4 E4 F#4 | B3 F#3 B2 |`;
// The second pulse, on the repeats only: a held third or sixth under the right
// hand's figure, and in the second strain's last bars a line in tenths over
// Bach's rising bass.
const MENUET_A_P2 = `
  B4:2 A#4:1 | B4:1 F#4:2 | F#4:2 A#4:1 | B4:1 F#4:2 |
  B4:2 E5:1 | A4:2 D5:1 | G4:2 A#4:1 | E4:3 |
  D4:2 C#4:1 | D4:1 F#4:2 | F#4:2 E4:1 | D4:1 F#4:2 |
  F#4:2 G4:1 | E4:2 G4:1 | F#4:2 E4:1 | F#4:3 |`;
const MENUET_B_P2 = `
  A4:2 G4:1 | F#4:2 E4:1 | F#4:2 G4:1 | A4:2 G4:1 |
  D5:2 B4:1 | G#4:2 E#4:1 | C#5:2 G#4:1 | A4:3 |
  F#4:2 D#4:1 | B4:3 | G#4:2 E#4:1 | C#5:3 |
  A#4:3 | E4:3 | D4:3 | D4:1 E4 F#4 |
  G4:1 A4 B4 | F#4:1 G4 E4 | F#4:1 G4 A#4 | F#4:3 |`;

// ---------------------------------------------------------------------------
// The danger variant, D minor over an A pedal: the pulses climb in parallel
// thirds, a four-note cell a step higher every other bar, while the wave bass
// throbs on the dominant and the ticks run in sixteenths.

const RUSH_LEAD = `
  A4:.5 C#5 D5 E5 | F5 E5 D5 C#5 | Bb4 D5 E5 F5 | G5 F5 E5 D5 |
  C#5 E5 F5 G5 | A5 G5 F5 E5 | D5 F5 G5 A5 | Bb5 A5 G5 F5 |
  E5 G5 Bb5 A5 | G#5:1 A5 | F5:.5 E5 D5 C#5 | D5:.5 F5:1 E5:.5 |
  C#5:.5 E5 A5 G5 | F5 E5 D5 C#5 | E5 D5 C#5 Bb4 | A4:1 C#5 |`;
const RUSH_THIRDS = `
  F4:.5 A4 Bb4 C#5 | D5 C#5 Bb4 A4 | G4 Bb4 C#5 D5 | E5 D5 C#5 Bb4 |
  A4 C#5 D5 E5 | F5 E5 D5 C#5 | Bb4 D5 E5 F5 | G5 F5 E5 D5 |
  C#5 E5 G5 F5 | E5:1 C#5 | D5:.5 C#5 Bb4 A4 | Bb4:.5 D5:1 C#5:.5 |
  A4:.5 C#5 F5 E5 | D5 C#5 Bb4 A4 | C#5 Bb4 A4 G4 | E4:1 A4 |`;
const RUSH_BASS = `${Array.from({ length: 14 }, () => 'A2:.5 A2 A2 A2 |').join(' ')} Bb2:.5 Bb2 Bb2 Bb2 | A2:.5 A2 A2 A2 |`;
const RUSH_TICK = 'h:.25 h h h s h h h';


export const CASCADE_MUSIC: GameAudioOptions = {
  tempo: BASE_TEMPO,
  volume: 0.11,
  tonic: p('D3'),
  tracks: [
    // Pulse channel 1: a 50% duty, a hard attack settling onto a held level,
    // no vibrato.
    { name: 'lead', wave: 'pulse50', volume: 0.9, adsr: { attack: 0.003, decay: 0.16, sustain: 0.55, release: 0.03 } },
    // Pulse channel 2: the thinner 25% duty, quicker to settle, under the lead.
    { name: 'harmony', wave: 'pulse25', volume: 0.55, adsr: { attack: 0.003, decay: 0.1, sustain: 0.45, release: 0.03 } },
    // The wave channel: a 32-step trapezoid (a square with its edges cut),
    // quantised to the Game Boy's 4 bits, held at one level as the channel's
    // volume shift holds it.
    {
      name: 'bass',
      volume: 0.85,
      wavetable: {
        samples: [
          0, 0.25, 0.5, 0.75, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0.75, 0.5, 0.25, 0, -0.25, -0.5, -0.75, -1, -1, -1, -1, -1, -1, -1,
          -1, -1, -0.75, -0.5, -0.25
        ],
        bits: 4
      },
      adsr: { attack: 0.002, decay: 0.05, sustain: 0.9, release: 0.02 }
    },
    // The noise channel in its short (metallic) mode.
    { name: 'ticks', volume: 0.3, noise: 'short' }
  ],
  form: {
    beatsPerBar: 6,
    sections: {
      // The folk tune: lead and bass with offbeat ticks, then the pulses in thirds, then the close.
      fa: [
        line(FOLK_THEME + FOLK_SECOND, 2),
        silent(16, 2),
        line(stride(FOLK_ROOTS), 2),
        line(ticks('r:.5 h r h', 16), 2)
      ],
      fb: [
        line(FOLK_THEME + FOLK_SECOND, 2),
        line(FOLK_THEME_THIRDS + FOLK_SECOND_THIRDS, 2),
        line(bounce(FOLK_ROOTS), 2),
        line(ticks(FOLK_TICK, 16), 2)
      ],
      fc: [
        line(FOLK_CLOSE, 2),
        line(FOLK_CLOSE_COUNTER, 2),
        line(bounce(FOLK_CLOSE_ROOTS), 2),
        line(`${ticks(FOLK_TICK, 15)} h:.25 h h h s:.5 s`, 2)
      ],
      // The dance: the theme alone, the second strain with a countermelody,
      // the theme in thirds turning away onto B7.
      ba: [
        line(DANCE_THEME_HEAD + DANCE_THEME_HOME, 2),
        silent(16, 2),
        line(DANCE_THEME_BASS + DANCE_BASS_HOME, 2),
        line(ticks('h:.5 r h h', 16), 2)
      ],
      bb: [
        line(DANCE_SECOND, 2),
        line(DANCE_SECOND_COUNTER, 2),
        line(DANCE_SECOND_BASS, 2),
        line(ticks(DANCE_TICK, 16), 2)
      ],
      bc: [
        line(DANCE_THEME_HEAD + DANCE_THEME_AWAY, 2),
        line(DANCE_THEME_THIRDS, 2),
        line(DANCE_THEME_BASS + DANCE_BASS_AWAY, 2),
        line(ticks(DANCE_TICK, 16), 2)
      ],
      // The menuet: each strain as Bach's two voices, then its repeat with the second pulse.
      ma: [line(MENUET_A_RH, 3), silent(16, 3), line(MENUET_A_LH, 3), silent(16, 3)],
      ma2: [line(MENUET_A_RH, 3), line(MENUET_A_P2, 3), line(MENUET_A_LH, 3), silent(16, 3)],
      mb: [line(MENUET_B_RH, 3), silent(20, 3), line(MENUET_B_LH, 3), silent(20, 3)],
      mb2: [line(MENUET_B_RH, 3), line(MENUET_B_P2, 3), line(MENUET_B_LH, 3), silent(20, 3)],
      rush: [line(RUSH_LEAD, 2), line(RUSH_THIRDS, 2), line(RUSH_BASS, 2), line(ticks(RUSH_TICK, 16), 2)]
    },
    order: ['fa', 'fb', 'fc'],
    scenes: {
      dance: { order: ['ba', 'bb', 'bc'] },
      menuet: { order: ['ma', 'ma2', 'mb', 'mb2'] }
    },
    danger: { order: ['rush'] }
  },
  stingers: {
    // A level-up: D major rising in thirds on the two pulses, the wave channel
    // leaping its octave, a noise snare on the arrival.
    levelUp: [
      line('D5:.25 F#5 A5 D6:.75'),
      line('A4:.25 D5 F#5 A5:.75'),
      line('D2:.5 D3:1'),
      line('h:.25 h s:1')
    ],
    // A countdown's last twenty seconds: both pulses shaking a semitone apart
    // over the dominant, then the leading tone.
    hurry: [
      line('E5:.25 F5 E5 F5 E5 F5 G#5:1'),
      line('C#5:.25 D5 C#5 D5 C#5 D5 E5:1'),
      line('A2:.5 A2 A2 A2:1'),
      line('h:.25 h h h h h s:1')
    ]
  }
};
