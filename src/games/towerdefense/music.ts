/**
 * Line Hold's score: a preparation cue and a battle cue for each of the
 * campaign's three arcs, and the horde for the finale.
 *
 * The brief (round 3, #410, rescored after the owner's audition of #436: the
 * marimba ostinato "did not work"). Measured from Kingdom Rush (2011, José
 * Antonini), whose soundtrack Ironhide publishes in full:
 *
 * - Each region has a Preparation loop and a separate Battle loop, and the
 *   pair is what Line Hold's arcs copy (Forest, Mountain, Wasteland, Shadowmoon).
 * - The loops are short and repeat: self-similarity puts them at 32 to 35 s,
 *   and Antonini writes that "many of the tracks were loops", doubled for the
 *   album "to avoid tracks of 20 seconds".
 * - The keys cluster on D: Forest in D major for both cues, Mountain's
 *   preparation in D minor, Wasteland in F major and D minor. Battles run at
 *   about 118 to 144 bpm.
 * - A battle is 3 to 8 dB louder than its region's preparation, and bottom
 *   heavy: 76 to 80 per cent of its energy under 250 Hz against 51 to 73 per
 *   cent for a preparation, which carries more of its level in the melodic mid.
 * - It is melodic, orchestral fantasy (tags "orchestral", "pre battle"), with a
 *   tune on top and the drive underneath, never a riff standing still.
 *
 * Sources: https://archive.org/details/kingdom-rush-series-ost (the tracks,
 * measured here for tempo, key, loop length, level and band balance);
 * https://joseantonini.bandcamp.com/album/kingdom-rush-soundtrack (credits
 * and the note on loops). No melody is taken from it: only the pairing, the
 * key centre, the lengths, the balance and the texture.
 *
 * Session and load. A run is the longest on the floor, about thirteen and a
 * half minutes over eighteen authored waves and then an endless assault, and
 * it alternates a 12 second build lull spent reading the map and placing
 * towers with a wave the towers fight while the player watches and patches.
 * A preparation is a lilting tune that asks for no attention; a battle is the
 * same key's march at full weight, whose tune the player can hum.
 *
 * Palette. Four pitched voices and a kit, the one cabinet the ADR allows a
 * fourth:
 *
 * - `lead`, the violins: a detuned sawtooth whose low-pass opens as the bow
 *   bites, with a delayed vibrato. Always on; it has every tune, preparation
 *   and battle, between D4 and D6.
 * - `horn`, the brass: a sawtooth under a low-pass that opens as the note
 *   speaks. Sustained harmony under a preparation; in battle a held counter-
 *   line in the first half of each cue and fanfare stabs in the second.
 * - `winds`, a fife: a triangle with a quick vibrato, high, the Celtic colour.
 *   The last layer in, a reel-like ornament figure above the tune.
 * - `basses`, the cellos and basses: a sawtooth that snaps shut behind a
 *   spiccato attack. A gallop on the chord's root in battle, which is where
 *   the measured weight under 250 Hz comes from; pizzicato roots under a
 *   preparation.
 * - `drums`, the military band's bass drum and snare, with the hat as the
 *   cymbal. The first battle layer.
 *
 * There is no pad and no echo. An orchestra's room is reverb, which the engine
 * does not have, and a feedback delay would smear the gallop.
 *
 * Keys and tempo. One tempo per arc for both its cues, so a launch never
 * lurches, rising as the arcs do, all on D:
 *
 * - Teaching (waves 1 to 6), 120 bpm, D major, with the flat seventh (C) in
 *   the battle for the fantasy colour.
 * - Pressure (7 to 12), 126 bpm, D minor.
 * - Escalation (13 to 18), 132 bpm, D minor darkened by its Phrygian E flat.
 * - The horde (the finale and the endless assault), 144 bpm, D minor, the
 *   E flat and the dominant every other bar.
 *
 * Form. Every cue is a scene of one form (`CUES` names them for `game.ts`).
 * A battle is two sixteen-bar sections, a tune and its development: 128 beats,
 * 58 to 64 seconds a pass at its arc's tempo, over the long session's 45 s
 * floor (Kingdom Rush's loops are shorter, but the ADR's floor has no switch).
 * A preparation is one sixteen-bar tune, whose first four bars are a complete
 * phrase because a 12 second lull starts it from the top. Every pass ends on
 * the dominant with the basses on A, so it hands back to the top through V.
 * The form's `order` is the teaching preparation, which a run opens on after
 * a two-bar `intro` (#417): a horn call to arms up the D major triad over a
 * string tremolo, handing its F#4 to the preparation's held F#4, while the
 * violins pick up into the tune.
 *
 * Gates. All three stay on. The lead pushes a note over the beat at least
 * once in every eight bars, uses more than three bar rhythms, and every pass
 * reaches the top off the tonic.
 *
 * Adaptivity, all wired in `game.ts` (the policy lives there, the names here):
 *
 * - Each arc's lull moves to its `prep` scene and each launch to its `battle`
 *   scene, at the next bar line and from the scene's top, so every wave hears
 *   its tune from the first note.
 * - Layers grow through an arc, Plants vs. Zombies' stacking: the kit comes in
 *   with every battle, the horn from an arc's third wave and the fife from its
 *   fifth, each change section-aligned (`setLayer(..., 'section')`); a lull
 *   takes the kit and the fife out and brings the horn back.
 * - The launch stinger is a string tremolo swelling into a low D, a snare roll
 *   and a bass drum beside it, half a bar, under the tune's register.
 * - The finale switches to the `danger` variant, the horde, and holds it
 *   through every endless wave and the lulls between them.
 * - The stand-down prompt muffles the score with `setPaused`.
 * - A run ends on one of two phrases through `playEnding` (#417): `fallen`
 *   when the keep falls, the horn sinking down half steps to D over a dying
 *   tremolo, and `held` for a line that held, a bugle call up D major.
 */
import { p, REST, type DrumName, type GameAudioOptions, type MusicProfile, type Note } from '../engine';

/** The teaching arc's tempo, the score's own; the later arcs and the horde set theirs on their scenes. */
export const BASE_TEMPO = 120;
/** The pressure arc's tempo. */
export const PRESSURE_TEMPO = 126;
/** The escalation arc's tempo. */
export const ESCALATION_TEMPO = 132;
/** The horde's tempo, the danger variant's own. */
export const HORDE_TEMPO = 144;

/** The launch stinger, on D like every cue. */
const LAUNCH = 'launch-d';

/**
 * Each arc's two cues and its launch stinger, by the arc's place in the
 * campaign (teaching, pressure, escalation). The teaching preparation is also
 * the form's `order`, which a run starts on.
 */
export const CUES = [
  { prep: 'prep-1', battle: 'battle-1', launch: LAUNCH },
  { prep: 'prep-2', battle: 'battle-2', launch: LAUNCH },
  { prep: 'prep-3', battle: 'battle-3', launch: LAUNCH }
] as const;
/** The horde's launch stinger. */
export const HORDE_LAUNCH = LAUNCH;

/**
 * A run is eighteen waves and then endless, about thirteen and a half minutes,
 * under one score. The `order` and the preparation scenes are what a 12 second
 * build lull plays from its top, so the minimal floor is the honest one for
 * them; the battles are what a wave lives in, and are long.
 */
export const MUSIC_PROFILE: MusicProfile = {
  session: 'minimal',
  scenes: {
    'prep-1': { session: 'minimal' },
    'battle-1': { session: 'long' },
    'prep-2': { session: 'minimal', fastestTempo: PRESSURE_TEMPO },
    'battle-2': { session: 'long', fastestTempo: PRESSURE_TEMPO },
    'prep-3': { session: 'minimal', fastestTempo: ESCALATION_TEMPO },
    'battle-3': { session: 'long', fastestTempo: ESCALATION_TEMPO }
  }
};

/** A pitched note, by name. */
const n = (name: string, beats: number, gain?: number): Note => ({ freq: p(name), beats, gain });
/** Silence. */
const r = (beats: number): Note => ({ freq: REST, beats });
/** A drum hit. */
const d = (drum: DrumName, beats: number, gain?: number): Note => ({ freq: REST, beats, drum, gain });
/** Cells played `times` over. */
const again = (times: number, ...cell: Note[][]): Note[] => Array.from({ length: times }, () => cell.flat()).flat();
/** Bars of silence, a bar at a time: a scene move waits for everything a voice has scheduled. */
const tacet = (bars: number): Note[] => again(bars, [r(4)]);

/**
 * A line written as `NOTE:BEATS` tokens (`r` a rest), shaped by where each
 * note falls: a downbeat at full level, the other beats a little under and
 * the notes between them lighter still, which is how a section bows a tune.
 * `@0.6` after a token sets its level by hand.
 */
function line(spec: string): Note[] {
  let at = 0;
  return spec
    .trim()
    .split(/\s+/)
    .map(token => {
      const [body, level] = token.split('@');
      const [name, beats] = body.split(':');
      const length = Number(beats);
      const inBar = at % 4;
      at += length;
      if (name === 'r') return r(length);
      const shaped = inBar < 1e-6 ? 0.95 : Math.abs(inBar - Math.round(inBar)) < 1e-6 ? 0.8 : 0.66;
      return n(name, length, level ? Number(level) : shaped);
    });
}

/**
 * A string tremolo: sixteenths on one note over `beats`, swelling from `from`
 * to `to`, the orchestra's way of holding a note it cannot sustain.
 */
function tremolo(name: string, beats: number, from: number, to: number): Note[] {
  const strokes = Math.round(beats * 4);
  return Array.from({ length: strokes }, (_, i) => n(name, 0.25, from + ((to - from) * i) / Math.max(1, strokes - 1)));
}

/** A snare roll in sixteenths, swelling the same way. */
function snareRoll(beats: number, from: number, to: number): Note[] {
  const strokes = Math.round(beats * 4);
  return Array.from({ length: strokes }, (_, i) => d('snare', 0.25, from + ((to - from) * i) / Math.max(1, strokes - 1)));
}

// --- harmony ---------------------------------------------------------------

const PC: Record<string, number> = {
  C: 0, 'C#': 1, D: 2, Eb: 3, E: 4, F: 5, 'F#': 6, G: 7, Ab: 8, A: 9, Bb: 10, B: 11
};
const NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
/** The triads the cues use: root, third, fifth. */
const CHORDS: Record<string, [string, string, string]> = {
  D: ['D', 'F#', 'A'],
  Dm: ['D', 'F', 'A'],
  Em: ['E', 'G', 'B'],
  Eb: ['Eb', 'G', 'Bb'],
  F: ['F', 'A', 'C'],
  'F#m': ['F#', 'A', 'C#'],
  G: ['G', 'B', 'D'],
  Gm: ['G', 'Bb', 'D'],
  A: ['A', 'C#', 'E'],
  Am: ['A', 'C', 'E'],
  Bb: ['Bb', 'D', 'F'],
  Bm: ['B', 'D', 'F#'],
  C: ['C', 'E', 'G']
};

/** A pitch class placed in the octave at or above `floor` (a note name). */
function place(pc: string, floor: string): string {
  const m = /^([A-G][#b]?)(\d)$/.exec(floor)!;
  const floorMidi = PC[m[1]] + 12 * (Number(m[2]) + 1);
  let midi = PC[pc] + 12 * (Number(m[2]) + 1);
  while (midi < floorMidi) midi += 12;
  return `${NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

/** A progression, one chord a bar, written as space-separated chord names. */
const bars = (spec: string): [string, string, string][] => spec.trim().split(/\s+/).map(c => CHORDS[c]);

/** The basses' battle gallop: the root in eighth-and-two-sixteenths three times, then the fifth and root. */
const gallop = (chords: [string, string, string][]): Note[] =>
  chords.flatMap(([root, , fifth]) => {
    const low = place(root, 'D2');
    return [
      ...again(3, [n(low, 0.5, 0.95), n(low, 0.25, 0.55), n(low, 0.25, 0.65)]),
      n(place(fifth, 'A2'), 0.5, 0.8),
      n(low, 0.5, 0.7)
    ];
  });

/** Pizzicato roots under a preparation: the root on one, the fifth on three. */
const pizzRoots = (chords: [string, string, string][]): Note[] =>
  chords.flatMap(([root, , fifth]) => [n(place(root, 'D2'), 1, 0.8), r(1), n(place(fifth, 'A2'), 1, 0.6), r(1)]);

/** The horn holding the chord's third, the fifth under it every other bar. */
const hornHeld = (chords: [string, string, string][], floor = 'A3'): Note[] =>
  chords.flatMap(([, third, fifth], i) =>
    i % 2 === 0 ? [n(place(third, floor), 4, 0.8)] : [n(place(fifth, floor), 2, 0.75), n(place(third, floor), 2, 0.8)]
  );

/** Fanfare stabs: the root, a snap, then the fifth and third. */
const hornStabs = (chords: [string, string, string][]): Note[] =>
  chords.flatMap(([root, third, fifth]) => [
    n(place(root, 'A3'), 1.5, 0.9), n(place(root, 'A3'), 0.5, 0.6), n(place(fifth, 'A3'), 1, 0.8), n(place(third, 'A3'), 1, 0.8)
  ]);

/** The fife's reel ornament over the chord, high: a cut, a held tone, a turn. */
const fife = (chords: [string, string, string][]): Note[] =>
  chords.flatMap(chord => {
    const [a, b, c] = chord.map(pc => place(pc, 'D5')).sort((x, y) => p(x) - p(y));
    return [n(c, 0.5, 0.8), n(b, 0.25, 0.55), n(c, 0.25, 0.6), n(a, 1, 0.75), n(b, 0.5, 0.65), n(c, 0.5, 0.7), n(b, 1, 0.7)];
  });

/**
 * The march: bass drum on one and three, snare answering with a ruff; the
 * cymbal (the hat) takes the downbeat that opens each eight bars, and a snare
 * roll between two bass drums closes each four.
 */
function march(barCount: number, busy: boolean): Note[] {
  const plain = busy
    ? [d('kick', 0.5, 0.9), d('snare', 0.25, 0.5), d('snare', 0.25, 0.6), d('snare', 0.5, 0.85), d('kick', 0.5, 0.7),
       d('kick', 0.5, 0.85), d('snare', 0.25, 0.5), d('snare', 0.25, 0.6), d('snare', 1, 0.85)]
    : [d('kick', 1, 0.85), d('snare', 1, 0.75), d('kick', 1, 0.8), d('snare', 0.5, 0.75), d('snare', 0.25, 0.45), d('snare', 0.25, 0.55)];
  const cymbal = [d('hat', plain[0].beats, 0.8), ...plain.slice(1)];
  const fill = [d('kick', 1, 0.9), ...snareRoll(2, 0.4, 0.85), d('kick', 1, 1)];
  return Array.from({ length: barCount }, (_, b) => (b % 4 === 3 ? fill : b % 8 === 0 ? cymbal : plain)).flat();
}

// --- the teaching arc: D major, 120 bpm ------------------------------------

const P1_CHORDS = bars('D G D A D Bm G A G D Em A D G Em A');
const P1_LEAD = line(`
  A4:1.5 B4:0.5 A4:1 F#4:1   G4:1.5 A4:0.5 B4:2   A4:1 D5:1.5 C#5:0.5 B4:1   A4:3 r:1
  F#4:1.5 G4:0.5 A4:1 D5:1   F#5:2 E5:1 D5:1   B4:1.5 C#5:0.5 D5:1 B4:1   C#5:2 B4:1 A4:1
  B4:1.5 A4:0.5 G4:1 B4:1   A4:1 F#5:1.5 E5:0.5 D5:1   G4:2 B4:1 E5:1   C#5:3 r:1
  D5:1.5 E5:0.5 F#5:1 A5:1   G5:1.5 F#5:0.5 E5:1 D5:1   B4:1.5 C#5:0.5 D5:1 E5:1   C#5:2 A4:2
`);

const B1A_CHORDS = bars('D C G D D C G A Bm G D A Bm G Em A');
const B1A_LEAD = line(`
  D5:1 F#5:0.5 A5:1.5 G5:0.5 F#5:0.5   E5:1.5 D5:0.5 C5:1 E5:1   D5:0.75 B4:0.25 G4:1 B4:0.5 D5:0.5 G5:1   F#5:3 r:1
  D5:1 F#5:0.5 A5:1.5 B5:0.5 A5:0.5   G5:1.5 E5:0.5 C5:1 G5:1   B5:0.75 A5:0.25 G5:1 F#5:0.5 G5:0.5 B4:1   A5:2 E5:1 C#5:1
  B4:0.5 D5:0.5 F#5:1 E5:0.5 D5:0.5 F#5:1   G5:1.5 F#5:0.5 E5:1 D5:1   F#5:0.5 A5:1 F#5:0.5 D5:1 A4:1   C#5:1 E5:1 A5:2
  B5:1 A5:0.5 F#5:0.5 D5:1 F#5:1   G5:1 B5:1 D6:1.5 B5:0.5   A5:1.5 G5:0.5 E5:1 G5:1   A5:2 G5:1 E5:1
`);
const B1B_CHORDS = bars('G A F#m Bm G A D D C G D Bm G A Bm A');
const B1B_LEAD = line(`
  B4:0.5 D5:0.5 G5:1.5 F#5:0.5 E5:1   C#5:1 E5:1 A5:1.5 G5:0.5   F#5:1.5 E5:0.5 C#5:1 A4:1   B4:2 D5:1 F#5:1
  G5:1 B5:1 A5:0.5 G5:0.5 F#5:1   E5:1.5 F#5:0.5 G5:1 A5:1   F#5:0.75 E5:0.25 D5:1 A4:1 D5:1   F#5:2 E5:1 F#5:1
  G5:1 E5:0.5 G5:1.5 C6:1   B5:1.5 A5:0.5 G5:1 D5:1   F#5:1 A5:1 D6:1.5 C#6:0.5   B5:1.5 A5:0.5 F#5:1 D5:1
  G5:0.5 A5:0.5 B5:1 A5:0.5 G5:0.5 E5:1   A5:1.5 G5:0.5 E5:1 C#5:1   D5:1 F#5:0.5 B5:1.5 A5:0.5 F#5:0.5   E5:2 C#5:1 A4:1
`);

// --- the pressure arc: D minor, 126 bpm ------------------------------------

const P2_CHORDS = bars('Dm Bb Dm A Dm Gm C F Bb Gm Dm A Dm Bb Gm A');
const P2_LEAD = line(`
  A4:1.5 G4:0.5 F4:1 D4:1   F4:1.5 G4:0.5 A4:2   D5:1 C5:1.5 A4:0.5 G4:1   E4:3 r:1
  F4:1.5 E4:0.5 D4:1 A4:1   Bb4:2 A4:1 G4:1   C5:1.5 Bb4:0.5 A4:1 G4:1   A4:2 C5:1 F5:1
  D5:1.5 C5:0.5 Bb4:1 F4:1   G4:1 Bb4:1.5 A4:0.5 G4:1   F4:2 A4:1 D5:1   C#5:3 r:1
  D5:1.5 E5:0.5 F5:1 A5:1   F5:1.5 D5:0.5 Bb4:1 D5:1   G4:1.5 A4:0.5 Bb4:1 D5:1   C#5:2 A4:2
`);

const B2A_CHORDS = bars('Dm Bb C Dm Dm Bb Gm A Bb C Dm Dm Gm Bb Gm A');
const B2A_LEAD = line(`
  D5:0.75 D5:0.25 F5:0.5 A5:1.5 G5:1   F5:1.5 D5:0.5 Bb4:1 D5:1   E5:1 G5:1 C6:1.5 Bb5:0.5   A5:3 r:1
  D5:0.75 D5:0.25 F5:0.5 A5:1.5 D6:1   D6:1.5 C6:0.5 Bb5:1 F5:1   G5:1 Bb5:0.5 A5:0.5 G5:1 D5:1   E5:1.5 C#5:0.5 E5:1 A5:1
  F5:1 D5:0.5 F5:1.5 Bb5:1   G5:1.5 E5:0.5 C5:1 E5:1   F5:1 A5:1 D6:2   C6:1 A5:1 F5:1 D5:1
  Bb5:1.5 A5:0.5 G5:1 D5:1   F5:1.5 G5:0.5 Bb5:1 D6:1   C6:1 Bb5:0.5 A5:0.5 G5:1 Bb5:1   A5:2 E5:1 C#5:1
`);
const B2B_CHORDS = bars('Bb C Am Dm Gm C F A Bb F Gm Dm Bb C Gm A');
const B2B_LEAD = line(`
  Bb4:0.5 D5:0.5 F5:1 Bb5:1.5 A5:0.5   G5:1.5 E5:0.5 C5:1 G5:1   A5:1 E5:0.5 A5:1.5 C6:1   D6:2 C6:1 A5:1
  Bb5:1 G5:0.5 D5:0.5 G5:1 Bb5:1   C6:1.5 Bb5:0.5 G5:1 E5:1   F5:0.5 A5:1 C6:0.5 A5:1 F5:1   E5:3 r:1
  D5:1 F5:1 Bb5:1.5 C6:0.5   A5:1.5 G5:0.5 F5:1 C5:1   D5:1 G5:0.5 Bb5:1.5 A5:0.5 G5:0.5   F5:2 E5:1 D5:1
  F5:1 Bb5:1 D6:1.5 C6:0.5   Bb5:1.5 A5:0.5 G5:1 E5:1   G5:1 Bb5:1 A5:1 G5:1   A5:2 G5:0.5 F5:0.5 E5:1
`);

// --- the escalation arc: D minor and its E flat, 132 bpm -------------------

const P3_CHORDS = bars('Dm Eb Dm A Dm Eb Bb A Gm Eb Dm A Bb Eb Gm A');
const P3_LEAD = line(`
  A4:1.5 Bb4:0.5 A4:1 F4:1   G4:1.5 Eb4:0.5 G4:2   F4:1 A4:1.5 G4:0.5 F4:1   E4:3 r:1
  D4:1.5 F4:0.5 A4:1 D5:1   Eb5:2 D5:1 Bb4:1   F4:1.5 G4:0.5 Bb4:1 D5:1   C#5:2 E4:1 A4:1
  Bb4:1.5 A4:0.5 G4:1 D4:1   G4:1 Bb4:1.5 A4:0.5 G4:1   F4:2 A4:1 D5:1   E5:3 r:1
  D5:1.5 C5:0.5 Bb4:1 F4:1   Eb5:1.5 D5:0.5 Bb4:1 G4:1   Bb4:1.5 A4:0.5 G4:1 Bb4:1   A4:2 E4:2
`);

const B3A_CHORDS = bars('Dm Eb Dm Eb Bb C Gm A Dm Eb Bb Gm C Bb Eb A');
const B3A_LEAD = line(`
  D5:0.5 D5:0.25 D5:0.25 F5:0.5 A5:1.5 F5:1   G5:1 Eb5:0.5 G5:0.5 Bb5:1 G5:1   F5:0.5 F5:0.25 F5:0.25 A5:0.5 D6:1.5 C6:1   Bb5:1.5 G5:0.5 Eb5:2
  D5:1 F5:0.5 Bb5:1.5 A5:0.5 F5:0.5   G5:1 E5:1 C5:1 E5:1   D5:1.5 G5:0.5 Bb5:1 A5:0.5 G5:0.5   A5:2 C#5:1 E5:1
  D6:1 C6:0.5 A5:0.5 F5:1 A5:1   G5:0.5 Bb5:1 G5:0.5 Eb5:1 G5:1   F5:1 D5:0.5 F5:0.5 Bb5:2   A5:1 G5:1 D5:1 G5:1
  E5:0.5 G5:0.5 C6:1.5 Bb5:0.5 G5:1   F5:1.5 D5:0.5 Bb4:1 D5:1   Eb5:1 G5:1 Bb5:1 G5:1   A5:2 E5:1 C#5:1
`);
const B3B_CHORDS = bars('Gm Eb Bb A Dm Eb F C Bb Gm Eb A Dm Bb Gm A');
const B3B_LEAD = line(`
  G5:0.5 G5:0.25 G5:0.25 Bb5:0.5 D6:1.5 Bb5:1   G5:1.5 Eb5:0.5 G5:1 Bb5:1   F5:1 D5:0.5 F5:1.5 Bb5:1   A5:3 r:1
  D5:0.5 D5:0.25 D5:0.25 F5:0.5 A5:1.5 D6:1   C6:1 Bb5:1 G5:1 Eb5:1   F5:1.5 A5:0.5 C6:1 A5:1   G5:2 E5:1 C5:1
  D5:1 F5:1 Bb5:1.5 A5:0.5   G5:1.5 F5:0.5 D5:1 G5:1   Bb5:0.5 G5:1 Eb5:0.5 G5:1 Bb5:1   A5:2 G5:1 E5:1
  F5:1 A5:1 D6:2   D6:1.5 C6:0.5 Bb5:1 F5:1   G5:1 Bb5:0.5 A5:0.5 G5:1 E5:1   C#5:2 E5:1 A5:1
`);

// --- the horde (danger): D minor, 144 bpm ----------------------------------

const HORDE_CHORDS = bars('Dm Bb Eb A Dm Bb Eb A Dm Bb Eb A Dm Bb Eb A');
const HORDE_LEAD = line(`
  ${'D5:0.5 F5:0.5 A5:0.5 D6:1.5 C6:1   Bb5:1 F5:0.5 D5:0.5 F5:1 Bb5:1   G5:1.5 Bb5:0.5 G5:1 Eb5:1   E5:0.5 G5:0.5 A5:1 C#6:2 '.repeat(3)}
  D5:0.5 F5:0.5 A5:0.5 D6:1.5 C6:1   Bb5:1 F5:0.5 D5:0.5 F5:1 Bb5:1   G5:1.5 Bb5:0.5 G5:1 Eb5:1   A5:2 E5:1 C#5:1
`);
const HORDE_B_CHORDS = bars('Gm Eb Dm A Gm Eb Dm A Gm Eb Dm A Bb C Eb A');
const HORDE_B_LEAD = line(`
  ${'G5:0.5 Bb5:0.5 D6:1.5 C6:0.5 Bb5:1   G5:1 Eb5:1 G5:1 Bb5:1   A5:1.5 F5:0.5 D5:1 F5:1   E5:2 C#5:1 E5:1 '.repeat(3)}
  D6:1 Bb5:1 F5:1 D5:1   E5:1 G5:1 C6:2   Bb5:1.5 G5:0.5 Eb5:2   A5:2 E5:1 C#5:1
`);

/** A line played `by` times softer, which is how a preparation sits under its battle. */
const softer = (notes: Note[], by: number): Note[] => notes.map(note => (note.freq > 0 ? { ...note, gain: (note.gain ?? 1) * by } : note));

/**
 * A preparation: the tune, the horn holding the harmony, pizzicato roots; the
 * fife and the kit tacet. Played down, since Kingdom Rush's preparations sit
 * 3 to 8 dB under their battles.
 */
const prep = (lead: Note[], chords: [string, string, string][]): Note[][] => [
  softer(lead, 0.65),
  softer(hornHeld(chords, 'D4'), 0.7),
  tacet(chords.length),
  softer(pizzRoots(chords), 0.75),
  tacet(chords.length)
];
/** A battle section: the tune over the gallop and the march, the horn held or stabbing, the fife on top. */
const battle = (lead: Note[], chords: [string, string, string][], stabs: boolean, busy: boolean): Note[][] => [
  lead,
  stabs ? hornStabs(chords) : hornHeld(chords),
  fife(chords),
  gallop(chords),
  march(chords.length, busy)
];

// --- the intro and the two endings (#417) ----------------------------------

/**
 * The call to arms, two bars at the teaching tempo before the first
 * preparation: the horn up the D major triad and down onto the F#4 the
 * preparation's horn then holds, over a string tremolo swelling into a stroke
 * on D; the violins pick up into the tune's first A. The fife and the kit are
 * the layers a build lull has out, so they rest.
 */
const INTRO: Note[][] = [
  [r(4), r(3), n('F#4', 0.5, 0.55), n('G4', 0.5, 0.6)],
  [n('D4', 0.75, 0.85), n('D4', 0.25, 0.6), n('F#4', 1, 0.9), n('A4', 2, 1), n('D5', 1, 0.9), n('A4', 1, 0.8), n('F#4', 2, 0.75)],
  [r(4), r(4)],
  [...tremolo('D2', 3, 0.3, 0.85), n('D2', 1, 1), n('A2', 1, 0.8), r(1), n('D2', 1, 0.7), r(1)],
  [r(4), r(4)]
];

/** The endings' stinger names, for `game.ts`'s `playEnding`. */
export const ENDINGS = {
  /** The keep falls: the line broken before the campaign was held. */
  fallen: 'fallen',
  /** A held line: the garrison stood down, or the keep fell only after all eighteen waves had held. */
  held: 'held'
} as const;

/**
 * The keep falls, two bars: the horn sinks down half steps, F to E to E flat
 * to D, past the leading tone home; the basses strike D once and their
 * tremolo dies away under it, one violin D and a single bass drum all that is
 * left of the band.
 */
const FALLEN: Note[][] = [
  [r(4), n('D4', 1, 0.7), r(3)],
  [n('F4', 1, 0.9), n('E4', 1, 0.85), n('Eb4', 1, 0.8), n('D4', 1, 0.8), n('C#4', 1, 0.75), n('D4', 3, 0.7)],
  [],
  [n('D2', 1, 1), r(1), n('A2', 1, 0.8), n('D2', 1, 0.75), ...tremolo('D2', 2, 0.7, 0.2), n('D2', 1, 0.4), r(1)],
  [d('kick', 1, 0.9), r(3), r(4)]
];

/**
 * The line held, two bars in D major: a bugle's dotted call up the triad and
 * down onto D, the violins running up the chord to a high D, the fife on its
 * top, a snare ruff into the last bar and every section landing together.
 */
const HELD: Note[][] = [
  [r(4), n('D5', 0.5, 0.7), n('F#5', 0.5, 0.75), n('A5', 0.5, 0.8), n('D6', 1.5, 0.95), r(1)],
  [n('A3', 0.75, 0.85), n('A3', 0.25, 0.6), n('D4', 1, 0.9), n('F#4', 1, 0.9), n('A4', 1, 0.95), n('F#4', 1, 0.85), n('D4', 3, 0.9)],
  [r(4), n('A5', 0.5, 0.75), n('D6', 0.5, 0.85), r(3)],
  [n('D2', 1, 0.95), r(1), n('A2', 1, 0.8), n('A2', 1, 0.7), ...tremolo('D2', 2, 0.4, 0.9), n('D2', 1, 1), r(1)],
  [r(3), d('snare', 0.25, 0.45), d('snare', 0.25, 0.55), d('snare', 0.5, 0.7), d('kick', 1, 0.9), r(3)]
];

/** The launch: a low string tremolo into a stroke on D, a snare roll and a bass drum beside it, half a bar. */
const LAUNCH_LINES: Note[][] = [
  [],
  [],
  [],
  [...tremolo('D2', 1.5, 0.35, 0.8), n('D2', 0.5, 1)],
  [...snareRoll(1.5, 0.35, 0.8), d('kick', 0.5, 1)]
];

export const TOWERDEFENSE_MUSIC: GameAudioOptions = {
  tempo: BASE_TEMPO,
  volume: 0.09,
  tonic: p('D3'),
  tracks: [
    // The violins: a detuned pair whose low-pass opens as the bow bites.
    {
      name: 'lead',
      wave: 'sawtooth',
      detune: 7,
      vibrato: 9,
      filter: { cutoff: 2600, q: 0.5, envAmount: -0.8, envDecay: 0.12 },
      adsr: { attack: 0.035, decay: 0.25, sustain: 0.7, release: 0.18 },
      volume: 0.5
    },
    // Brass swells: the low-pass opens an octave and a half as the note speaks.
    {
      name: 'horn',
      wave: 'sawtooth',
      filter: { cutoff: 1400, q: 0.7, envAmount: -1.5, envDecay: 0.25 },
      adsr: { attack: 0.07, decay: 0.3, sustain: 0.65, release: 0.3 },
      volume: 0.36
    },
    // A fife: a triangle with a quick vibrato, high over the tune.
    {
      name: 'winds',
      wave: 'triangle',
      vibrato: 14,
      adsr: { attack: 0.015, decay: 0.1, sustain: 0.8, release: 0.08 },
      volume: 0.42,
      startsMuted: true
    },
    // Cellos and basses: a spiccato stroke, the filter snapping shut behind it.
    {
      name: 'basses',
      wave: 'sawtooth',
      filter: { cutoff: 650, q: 1, envAmount: 1.2, envDecay: 0.08 },
      adsr: { attack: 0.005, decay: 0.18, sustain: 0.35, release: 0.08 },
      volume: 0.75
    },
    // The military band: bass drum and snare, the hat as its cymbal.
    { name: 'drums', volume: 0.6, startsMuted: true }
  ],
  form: {
    intro: INTRO,
    sections: {
      p1: prep(P1_LEAD, P1_CHORDS),
      b1a: battle(B1A_LEAD, B1A_CHORDS, false, false),
      b1b: battle(B1B_LEAD, B1B_CHORDS, true, false),
      p2: prep(P2_LEAD, P2_CHORDS),
      b2a: battle(B2A_LEAD, B2A_CHORDS, false, false),
      b2b: battle(B2B_LEAD, B2B_CHORDS, true, true),
      p3: prep(P3_LEAD, P3_CHORDS),
      b3a: battle(B3A_LEAD, B3A_CHORDS, false, true),
      b3b: battle(B3B_LEAD, B3B_CHORDS, true, true),
      horde: battle(HORDE_LEAD, HORDE_CHORDS, true, true),
      'horde-b': battle(HORDE_B_LEAD, HORDE_B_CHORDS, true, true)
    },
    order: ['p1'],
    scenes: {
      'prep-1': { order: ['p1'] },
      'battle-1': { order: ['b1a', 'b1b'] },
      'prep-2': { order: ['p2'], tempo: PRESSURE_TEMPO },
      'battle-2': { order: ['b2a', 'b2b'], tempo: PRESSURE_TEMPO },
      'prep-3': { order: ['p3'], tempo: ESCALATION_TEMPO },
      'battle-3': { order: ['b3a', 'b3b'], tempo: ESCALATION_TEMPO }
    },
    danger: { order: ['horde', 'horde-b'], tempo: HORDE_TEMPO }
  },
  stingers: {
    [LAUNCH]: LAUNCH_LINES,
    [ENDINGS.fallen]: FALLEN,
    [ENDINGS.held]: HELD
  }
};
