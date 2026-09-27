/**
 * Line Hold's score: a preparation cue and a battle cue for each of the
 * campaign's three arcs, and the horde for the finale.
 *
 * The brief (round 3, #410; ADR 003's round 3 amendment). Kingdom Rush (2011)
 * pairs a sparse "Preparation" cue with a separate "Battle" cue for each
 * region, orchestral in palette; Plants vs. Zombies (2009, Laura Shigihara)
 * keeps one groove going and stacks instruments on it as the waves intensify,
 * with "marching band percussion and swing beats" and "lots of half steps" in
 * a darkish minor. The shared signature is an ostinato that stays put while
 * the player thinks: a one- or two-bar riff in the middle register within
 * about a sixth, over a pedal or a two-chord vamp, with intensity from added
 * layers and percussion rather than new melody, and a distinct, suspended
 * build cue. The owner's complaint about the round 2 score was that it "jumps
 * all over the place"; the answer here is that the battle tune does not move
 * at all, and everything that grows is a layer on top of it.
 *
 * Session and load. A run is the longest on the floor, about thirteen and a
 * half minutes over eighteen authored waves and then an endless assault, and
 * it alternates two states: a 12 second build lull spent reading the map and
 * placing towers (planning, high cognitive load), then a wave the towers
 * fight while the player watches and patches (reactive, lower load, high
 * tension). The riff never asks to be listened to, which is what a planning
 * player needs from music under them, and it is the same riff for a whole arc
 * of six waves, so the ear stops tracking it and hears only the layers change.
 *
 * Palette (Kingdom Rush's orchestra, Plants vs. Zombies' mallets). Four
 * pitched voices and a kit, the one cabinet the ADR allows a fourth:
 *
 * - `riff`, the ostinato, a marimba: a sine carrier under a 4:1 FM modulator
 *   whose index falls away in 40 ms, a struck bar with no sustain. Always on.
 *   It plays every battle riff between G#3 and A4 and every preparation
 *   figure between A3 and A4, so it never changes register.
 * - `horn`, brass swells: a sawtooth under a low-pass that opens as the note
 *   speaks, with a slow attack and a held sustain. The preparation cue's
 *   suspended long notes, and in battle the counter-riff layer.
 * - `pizz`, plucked strings: a sawtooth whose filter snaps shut in 60 ms under
 *   a short decay. The last layer in, an off-beat or broken-chord figure above
 *   the riff.
 * - `timpani`: a triangle struck two semitones sharp and settling in 90 ms,
 *   with a long ring. The pedal (tonic and fifth, as two tuned drums), and a
 *   soft roll under the preparation cues.
 * - `drums`, the marching band's snare and bass drum: the first battle layer.
 *
 * There is no pad and no echo. An orchestra's room is reverb, which the
 * engine does not have, and a feedback delay on a marimba ostinato smears the
 * one thing the cue is built on.
 *
 * Keys and tempo. All three arcs sit in the A minor family, one tempo per arc
 * for both of its cues so a launch never lurches, rising as the arcs do:
 *
 * - Teaching (waves 1 to 6), 108 bpm, A minor: a two-bar riff over a vamp of
 *   Am for four bars and Dm for four, the turn bar tipping onto E.
 * - Pressure (7 to 12), 116 bpm, the E Phrygian dominant (A minor's fifth
 *   with its G sharp): a dotted, marching riff over E for four bars and the
 *   half step above, F, for four. The kit swings its hats here, Shigihara's
 *   swing beats.
 * - Escalation (13 to 18), 124 bpm, A minor with its Phrygian B flat: the vamp
 *   quickens to Am and Bb every two bars, a half step apart, and the snare
 *   rolls.
 * - The horde (the finale and the endless assault), 138 bpm: the escalation's
 *   material pressed into a one-bar chromatic riff on A, the vamp flipping
 *   every bar.
 *
 * Form. Every cue is a scene of one form (`CUES` names them for `game.ts`),
 * so the instruments and the key family are shared and only the lines change.
 * A battle cue is three eight-bar phrases, 24 bars, 46 to 53 seconds a pass
 * at its tempo, over the long session's 45 s floor. The riff is literally the
 * same in every phrase; the second phrase gives the horn a more rhythmic
 * counter-riff and the strings a broken chord instead of the off-beat plucks,
 * which is the only development the cue has. A battle pass ends on the vamp's
 * second chord (Dm to E, F, or E) with the timpani off the tonic, so it hands
 * back to the top through a half step or the dominant, which is how a vamp
 * behaves anyway.
 *
 * A preparation cue is twelve bars of suspension over a pedal: the horn holds
 * sus4 and sus2 tones in slow swells, the marimba plays a sparse quartal
 * figure with a bar of silence in every four, and the timpani rolls softly
 * into the phrase. It is written in long notes and rests at the battle's
 * tempo, not as the battle with instruments missing: none of its lines is a
 * battle line. Its session is minimal (20 s): a build lull is 12 seconds and
 * each one starts the cue from its top, so its first four bars (8 to 9
 * seconds) are a complete call and answer, and the rest is heard only while
 * the stand-down prompt holds the lull. The form's `order` is the teaching
 * arc's preparation, which is what a run opens on.
 *
 * Gates. All three stay on. The riff is the lead the gates read (track 0), and
 * each riff pushes one note over a beat (the syncopation), turns its phrase
 * with a bar of its own (the third bar rhythm), and every pass reaches the
 * top off the tonic (the seam).
 *
 * Adaptivity, all wired in `game.ts` (the policy lives there, the names here):
 *
 * - Each arc's lull moves to its `prep` scene and each launch to its `battle`
 *   scene, at the next bar line and from the scene's top, so every wave hears
 *   its riff from the first note.
 * - Layers grow through an arc, Plants vs. Zombies' stacking: the kit comes in
 *   with every battle, the horn's counter-riff joins from an arc's third wave
 *   and the plucked strings from its fifth. Every layer change is
 *   section-aligned (`setLayer(..., 'section')`), so it lands on the bar line
 *   the scene change lands on, and a lull takes the kit and the strings out
 *   and brings the horn back for the preparation.
 * - The launch stinger is a timpani roll into a low stroke with a snare roll
 *   beside it, on the arc's tonic (`launch-a`, or `launch-e` for the pressure
 *   arc on E), half a bar long. Nothing in the riff's voice or register, so it
 *   never sits on the riff's first note.
 * - The finale switches to the `danger` variant, the horde, and holds it from
 *   wave 18 through every endless wave and the lulls between them, with the
 *   lulls taking the same layers out. Releasing it each wave used to flip
 *   tempo, section and register twice a cycle.
 * - The stand-down prompt muffles the score with `setPaused` rather than
 *   stopping it.
 */
import { p, REST, type DrumName, type GameAudioOptions, type MusicProfile, type Note } from '../engine';

/** The teaching arc's tempo, the score's own; the later arcs and the horde set theirs on their scenes. */
export const BASE_TEMPO = 108;
/** The pressure arc's tempo. */
export const PRESSURE_TEMPO = 116;
/** The escalation arc's tempo. */
export const ESCALATION_TEMPO = 124;
/** The horde's tempo, the danger variant's own. */
export const HORDE_TEMPO = 138;

/**
 * Each arc's two cues and its launch stinger, by the arc's place in the
 * campaign (teaching, pressure, escalation). The teaching preparation is also
 * the form's `order`, which a run starts on.
 */
export const CUES = [
  { prep: 'prep-1', battle: 'battle-1', launch: 'launch-a' },
  { prep: 'prep-2', battle: 'battle-2', launch: 'launch-e' },
  { prep: 'prep-3', battle: 'battle-3', launch: 'launch-a' }
] as const;
/** The horde's launch stinger: it is in A, like the escalation it grows out of. */
export const HORDE_LAUNCH = 'launch-a';

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
/** A two-bar cell played `times` over. */
const again = (times: number, ...cell: Note[][]): Note[] => Array.from({ length: times }, () => cell.flat()).flat();
/** Swung eighths: the long and short halves of a beat, Shigihara's swing. */
const LONG = 2 / 3;
const SHORT = 1 / 3;

/**
 * A timpani roll: sixteenths on one drum over `beats`, swelling from `from`
 * to `to`, the orchestra's way of holding a note it cannot sustain.
 */
function roll(name: string, beats: number, from: number, to: number): Note[] {
  const strokes = Math.round(beats * 4);
  return Array.from({ length: strokes }, (_, i) => n(name, 0.25, from + ((to - from) * i) / Math.max(1, strokes - 1)));
}

/** A snare roll in sixteenths, swelling the same way. */
function snareRoll(beats: number, from: number, to: number): Note[] {
  const strokes = Math.round(beats * 4);
  return Array.from({ length: strokes }, (_, i) => d('snare', 0.25, from + ((to - from) * i) / Math.max(1, strokes - 1)));
}

// --- the teaching arc: A minor, Am and Dm, 108 bpm ------------------------

/** The riff's first bar: up the triad to E, pushed over beat two, and down the scale. */
const RIFF_1A: Note[] = [
  n('A3', 0.5, 0.9),
  n('A3', 0.5, 0.6),
  n('C4', 0.5, 0.75),
  n('E4', 1, 1),
  n('D4', 0.5, 0.7),
  n('C4', 0.5, 0.7),
  n('B3', 0.5, 0.65)
];
/** Its answer: home through the chromatic lower neighbour, then a beat of air. */
const RIFF_1B: Note[] = [n('C4', 1, 0.85), n('A3', 0.5, 0.7), n('G#3', 0.5, 0.6), n('A3', 1, 0.8), r(1)];
/** The phrase's last bar, over Dm and then E: down to the leading tone. */
const TURN_1: Note[] = [n('E4', 1, 0.9), n('D4', 0.5, 0.7), n('C4', 0.5, 0.7), n('B3', 1, 0.8), n('G#3', 1, 0.75)];
const RIFF_1: Note[] = [...again(3, RIFF_1A, RIFF_1B), ...RIFF_1A, ...TURN_1];

/** The horn's counter-riff, long: an answer in the riff's rest, over Am, then Dm, then the turn. */
const HORN_1A: Note[] = [
  ...again(2, [r(2), n('C5', 2, 0.8)], [n('B4', 1.5, 0.9), n('A4', 0.5, 0.7), n('E4', 2, 0.8)]),
  ...[r(2), n('D5', 2, 0.8)],
  ...[n('C5', 1.5, 0.9), n('A4', 0.5, 0.7), n('F4', 2, 0.8)],
  ...[r(2), n('D5', 2, 0.85)],
  ...[n('C5', 2, 0.9), n('B4', 2, 0.85)]
];
/** And rhythmic, for the second phrase: the same answer in march time. */
const HORN_1B: Note[] = [
  ...again(2, [n('A4', 1.5, 0.9), n('E4', 0.5, 0.7), n('A4', 1, 0.8), n('C5', 1, 0.85)], [n('B4', 3, 0.85), r(1)]),
  ...[n('A4', 1.5, 0.9), n('F4', 0.5, 0.7), n('A4', 1, 0.8), n('D5', 1, 0.85)],
  ...[n('C5', 3, 0.85), r(1)],
  ...[n('A4', 1.5, 0.9), n('F4', 0.5, 0.7), n('A4', 1, 0.8), n('D5', 1, 0.85)],
  ...[n('C5', 2, 0.9), n('B4', 2, 0.85)]
];

/** Off-beat plucks, the band's after-beat, on two chord tones. */
const afterBeat = (top: string, low: string): Note[] => [
  r(0.5), n(top, 0.5, 0.8), r(0.5), n(low, 0.5, 0.65), r(0.5), n(top, 0.5, 0.75), r(0.5), n(low, 0.5, 0.65)
];
/** A broken chord in eighths, root, fifth, third, fifth, twice. */
const broken = (root: string, fifth: string, third: string): Note[] =>
  again(2, [n(root, 0.5, 0.8), n(fifth, 0.5, 0.6), n(third, 0.5, 0.7), n(fifth, 0.5, 0.6)]);

const PIZZ_1A: Note[] = [
  ...again(4, afterBeat('E5', 'C5')),
  ...again(3, afterBeat('F5', 'D5')),
  ...[r(0.5), n('F5', 0.5, 0.8), r(0.5), n('D5', 0.5, 0.65), r(0.5), n('E5', 0.5, 0.8), r(0.5), n('B4', 0.5, 0.7)]
];
const PIZZ_1B: Note[] = [
  ...again(4, broken('A4', 'E5', 'C5')),
  ...again(3, broken('D5', 'A5', 'F5')),
  ...[n('D5', 0.5, 0.8), n('A5', 0.5, 0.6), n('F5', 0.5, 0.7), n('A5', 0.5, 0.6), n('E5', 0.5, 0.8), n('B4', 0.5, 0.6), n('G#4', 0.5, 0.7), n('B4', 0.5, 0.6)]
];

/** The pedal, two tuned drums: the root on one, a pair of eighths on three's pickup, the fifth on four. */
const pedal = (root: string, fifth: string): Note[] => [
  n(root, 1, 0.95), r(1), n(root, 0.5, 0.55), n(root, 0.5, 0.7), n(fifth, 1, 0.8)
];
/** Bar 8: D, then E, walking back up to A through B; never A on a strong beat. */
const TIMP_1: Note[] = [
  ...again(4, pedal('A2', 'E3')),
  ...again(3, pedal('D3', 'A2')),
  ...[n('D3', 1, 0.9), r(1), n('E3', 1, 0.9), n('B2', 0.5, 0.6), n('E3', 0.5, 0.7)]
];

/** The teaching march: bass drum on one and three, snare on two and a ruff into four. */
const MARCH_1: Note[] = [
  d('kick', 1, 0.8), d('snare', 1, 0.7), d('kick', 1, 0.75), d('snare', 0.5, 0.7), d('snare', 0.25, 0.45), d('snare', 0.25, 0.55)
];
const FILL_1: Note[] = [d('kick', 1, 0.85), ...snareRoll(1, 0.45, 0.7), d('snare', 0.5, 0.8), d('snare', 0.5, 0.6), d('kick', 1, 0.9)];
const DRUMS_1: Note[] = [...again(7, MARCH_1), ...FILL_1];

/** Teaching preparation: a quartal marimba figure over an A pedal, a bar of silence in every four. */
const PREP_RIFF_1: Note[] = [
  ...again(
    2,
    [r(0.5), n('A3', 0.5, 0.6), n('D4', 0.5, 0.65), n('E4', 2.5, 0.8)],
    [r(2), n('B3', 0.5, 0.55), n('D4', 1.5, 0.7)],
    [r(0.5), n('A3', 0.5, 0.6), n('D4', 0.5, 0.65), n('E4', 1, 0.75), n('A4', 1.5, 0.8)],
    [r(4)]
  ),
  ...[r(0.5), n('A3', 0.5, 0.6), n('D4', 0.5, 0.65), n('E4', 2.5, 0.8)],
  ...[r(2), n('B3', 0.5, 0.55), n('D4', 1.5, 0.7)],
  ...[r(0.5), n('A3', 0.5, 0.6), n('D4', 0.5, 0.65), n('E4', 1, 0.75), n('A4', 1.5, 0.8)],
  // Esus4: the call that hands the lull to the launch.
  ...[r(1), n('B3', 1, 0.6), n('E4', 2, 0.7)]
];
/** Sus4 falling to the fourth, never to the third; over A, then D, then A tipping to Esus4. */
const PREP_HORN_1: Note[] = [
  ...[r(1), n('E4', 3, 0.8)], ...[n('D4', 4, 0.75)], ...[r(1), n('E4', 1, 0.75), n('A4', 2, 0.85)], ...[n('B4', 3, 0.8), r(1)],
  ...[r(1), n('A4', 3, 0.8)], ...[n('G4', 4, 0.75)], ...[r(1), n('E4', 1, 0.75), n('D4', 2, 0.8)], ...[n('E4', 3, 0.8), r(1)],
  ...[r(1), n('E4', 3, 0.8)], ...[n('D4', 4, 0.75)], ...[r(1), n('E4', 1, 0.75), n('A4', 2, 0.85)], ...[n('B4', 4, 0.8)]
];
/**
 * The preparation's silent voices, a bar of rest at a time: a scene move waits
 * for the bar line after everything a voice has scheduled, and one 48-beat
 * rest would hold a launch off until the lull's cue had finished.
 */
const TACET: Note[] = again(12, [r(4)]);
/** A soft roll into each phrase, a stroke to land on, then nothing but the horn. */
const prepTimp = (root: string, fifth: string): Note[] => [
  ...roll(root, 2, 0.25, 0.6), n(root, 2, 0.75), r(4), r(4), r(2), n(fifth, 1, 0.45), r(1)
];
const PREP_TIMP_1: Note[] = [
  ...prepTimp('A2', 'E3'),
  ...prepTimp('D3', 'A2'),
  // The last phrase rolls on A and then rests on the dominant.
  ...roll('A2', 2, 0.25, 0.6), n('A2', 2, 0.75), r(4), r(4), n('E3', 1, 0.6), r(3)
];

// --- the pressure arc: E Phrygian dominant, E and F, 116 bpm ---------------

/** A dotted call, the marching band's figure, pushed up to the G sharp. */
const riff2a = (top: string): Note[] => [
  n('E4', 0.75, 0.9), n('E4', 0.25, 0.6), n('F4', 0.5, 0.75), n(top, 1.5, 1), n('F4', 0.5, 0.7), n('E4', 0.5, 0.7)
];
/** Its answer in plain eighths, settling for two beats. */
const riff2b = (turn: string, home: string): Note[] => [
  n('C4', 0.5, 0.8), n(turn, 0.5, 0.7), n('C4', 0.5, 0.75), n('D4', 0.5, 0.7), n(home, 2, 0.85)
];
const TURN_2: Note[] = [n('F4', 1, 0.9), n('E4', 0.5, 0.7), n('D4', 0.5, 0.7), n('C4', 1, 0.8), n('B3', 1, 0.75)];
const RIFF_2: Note[] = [
  ...again(2, riff2a('G#4'), riff2b('B3', 'B3')),
  ...riff2a('A4'), ...riff2b('A3', 'C4'),
  ...riff2a('A4'), ...TURN_2
];

const HORN_2A: Note[] = [
  ...again(2, [r(2), n('B4', 2, 0.8)], [n('G#4', 1.5, 0.9), n('A4', 0.5, 0.7), n('B4', 2, 0.8)]),
  ...[r(2), n('C5', 2, 0.8)],
  ...[n('A4', 1.5, 0.9), n('F4', 0.5, 0.7), n('A4', 2, 0.8)],
  ...[r(2), n('C5', 2, 0.85)],
  ...[n('A4', 2, 0.9), n('G#4', 2, 0.85)]
];
const HORN_2B: Note[] = [
  ...again(2, [n('B4', 0.75, 0.9), n('B4', 0.25, 0.65), n('G#4', 1, 0.8), n('E4', 1, 0.8), n('B4', 1, 0.85)], [n('A4', 3, 0.85), r(1)]),
  ...[n('C5', 0.75, 0.9), n('C5', 0.25, 0.65), n('A4', 1, 0.8), n('F4', 1, 0.8), n('C5', 1, 0.85)],
  ...[n('B4', 3, 0.85), r(1)],
  ...[n('C5', 0.75, 0.9), n('C5', 0.25, 0.65), n('A4', 1, 0.8), n('F4', 1, 0.8), n('C5', 1, 0.85)],
  ...[n('A4', 2, 0.9), n('G#4', 2, 0.85)]
];

const PIZZ_2A: Note[] = [...again(4, afterBeat('E5', 'B4')), ...again(4, afterBeat('F5', 'C5'))];
const PIZZ_2B: Note[] = [...again(4, broken('E5', 'B5', 'G#5')), ...again(4, broken('F5', 'C6', 'A5'))];

/** The pressure pedal: a dotted stroke on the root, the fifth on three, the root again on four. */
const pedal2 = (root: string, fifth: string): Note[] => [n(root, 0.75, 0.95), n(root, 0.25, 0.55), r(1), n(fifth, 1, 0.8), n(root, 1, 0.75)];
const TIMP_2: Note[] = [...again(4, pedal2('E3', 'B2')), ...again(4, pedal2('F2', 'C3'))];

/** The pressure kit: the march with its hats swung. */
const SWING: Note[] = [
  d('kick', LONG, 0.85), d('hat', SHORT, 0.45), d('snare', LONG, 0.75), d('hat', SHORT, 0.45),
  d('kick', LONG, 0.8), d('hat', SHORT, 0.45), d('snare', LONG, 0.75), d('hat', SHORT, 0.55)
];
const FILL_2: Note[] = [
  d('kick', LONG, 0.85), d('hat', SHORT, 0.45), d('snare', LONG, 0.75), d('snare', SHORT, 0.5),
  d('snare', SHORT, 0.55), d('snare', SHORT, 0.65), d('snare', SHORT, 0.75), d('kick', 1, 0.9)
];
const DRUMS_2: Note[] = [...again(7, SWING), ...FILL_2];

/** Pressure preparation: the half step E to F, rung softly and left hanging. */
const PREP_RIFF_2: Note[] = [
  ...again(
    2,
    [r(0.5), n('B3', 0.5, 0.6), n('E4', 0.5, 0.65), n('F4', 2.5, 0.8)],
    [r(2), n('E4', 0.5, 0.55), n('B3', 1.5, 0.7)],
    [r(0.5), n('B3', 0.5, 0.6), n('E4', 0.5, 0.65), n('A4', 1, 0.75), n('G#4', 1.5, 0.8)],
    [r(4)]
  ),
  ...[r(0.5), n('B3', 0.5, 0.6), n('E4', 0.5, 0.65), n('F4', 2.5, 0.8)],
  ...[r(2), n('E4', 0.5, 0.55), n('B3', 1.5, 0.7)],
  ...[r(0.5), n('B3', 0.5, 0.6), n('E4', 0.5, 0.65), n('A4', 1, 0.75), n('G#4', 1.5, 0.8)],
  ...[r(1), n('C4', 1, 0.6), n('F4', 2, 0.7)]
];
const PREP_HORN_2: Note[] = [
  ...[r(1), n('B4', 3, 0.8)], ...[n('A4', 4, 0.75)], ...[r(1), n('F4', 1, 0.75), n('E4', 2, 0.85)], ...[n('B3', 3, 0.8), r(1)],
  ...[r(1), n('C5', 3, 0.8)], ...[n('B4', 4, 0.75)], ...[r(1), n('G#4', 1, 0.75), n('A4', 2, 0.8)], ...[n('B4', 3, 0.8), r(1)],
  ...[r(1), n('B4', 3, 0.8)], ...[n('A4', 4, 0.75)], ...[r(1), n('F4', 1, 0.75), n('E4', 2, 0.85)], ...[n('F4', 4, 0.8)]
];
const PREP_TIMP_2: Note[] = [
  ...prepTimp('E3', 'B2'),
  ...prepTimp('E3', 'B2'),
  // Ending on F, the half step above the pedal, which the top resolves.
  ...roll('E3', 2, 0.25, 0.6), n('E3', 2, 0.75), r(4), r(4), n('F2', 1, 0.6), r(3)
];

// --- the escalation arc: A minor and its B flat, every two bars, 124 bpm ---

/** A two-bar riff, now in sixteenths at the front, the B flat a half step over the root. */
const riff3a = (root: string, step: string, third: string, top: string, back: string): Note[] => [
  n(root, 0.5, 0.9), n(root, 0.25, 0.55), n(root, 0.25, 0.65), n(step, 0.5, 0.7), n(top, 1, 1), n(back, 0.5, 0.7), n(third, 0.5, 0.75), n(step, 0.5, 0.65)
];
const riff3b = (top: string, back: string, third: string, step: string, root: string): Note[] => [
  n(top, 0.5, 0.85), n(back, 0.5, 0.7), n(third, 0.5, 0.75), n(step, 0.5, 0.65), n(root, 1, 0.8), r(1)
];
const RIFF_3_AM = [riff3a('A3', 'Bb3', 'C4', 'E4', 'D4'), riff3b('E4', 'D4', 'C4', 'Bb3', 'A3')];
const RIFF_3_BB = [riff3a('Bb3', 'A3', 'D4', 'F4', 'E4'), riff3b('F4', 'E4', 'D4', 'C4', 'Bb3')];
/** The turn, over E: a chromatic fall from F to the leading tone. */
const TURN_3: Note[] = [n('E4', 0.5, 0.85), n('F4', 0.5, 0.8), n('E4', 0.5, 0.75), n('D4', 0.5, 0.7), n('C4', 0.5, 0.75), n('Bb3', 0.5, 0.7), n('G#3', 1, 0.8)];
const RIFF_3: Note[] = [...RIFF_3_AM.flat(), ...RIFF_3_BB.flat(), ...RIFF_3_AM.flat(), ...RIFF_3_BB[0], ...TURN_3];

const HORN_3A: Note[] = [
  ...[r(2), n('C5', 2, 0.85)], ...[n('B4', 1.5, 0.9), n('A4', 0.5, 0.7), n('E4', 2, 0.8)],
  ...[r(2), n('D5', 2, 0.85)], ...[n('C5', 1.5, 0.9), n('Bb4', 0.5, 0.7), n('F4', 2, 0.8)],
  ...[r(2), n('C5', 2, 0.85)], ...[n('B4', 1.5, 0.9), n('A4', 0.5, 0.7), n('E4', 2, 0.8)],
  ...[r(2), n('D5', 2, 0.85)], ...[n('B4', 2, 0.9), n('G#4', 2, 0.85)]
];
/** Brass stabs on the off-beats, the counter-riff at full cry. */
const stabs = (a: string, b: string): Note[] => [r(0.5), n(a, 0.5, 0.85), r(0.5), n(a, 0.5, 0.75), r(0.5), n(b, 1.5, 0.9)];
const HORN_3B: Note[] = [
  ...stabs('A4', 'C5'), ...[n('B4', 3, 0.85), r(1)],
  ...stabs('Bb4', 'D5'), ...[n('C5', 3, 0.85), r(1)],
  ...stabs('A4', 'C5'), ...[n('B4', 3, 0.85), r(1)],
  ...stabs('Bb4', 'D5'), ...[n('B4', 2, 0.9), n('G#4', 2, 0.85)]
];

const PIZZ_3A: Note[] = [
  ...afterBeat('E5', 'C5'), ...afterBeat('E5', 'A4'), ...afterBeat('F5', 'D5'), ...afterBeat('F5', 'Bb4'),
  ...afterBeat('E5', 'C5'), ...afterBeat('E5', 'A4'), ...afterBeat('F5', 'D5'), ...afterBeat('E5', 'G#4')
];
const PIZZ_3B: Note[] = [
  ...again(2, broken('A4', 'E5', 'C5')), ...again(2, broken('Bb4', 'F5', 'D5')),
  ...again(2, broken('A4', 'E5', 'C5')), ...broken('Bb4', 'F5', 'D5'), ...broken('G#4', 'E5', 'B4')
];

/** The escalation pedal: a stroke and two eighths driving to the fifth. */
const pedal3 = (root: string, fifth: string): Note[] => [n(root, 1, 0.95), n(root, 0.5, 0.6), n(root, 0.5, 0.7), r(0.5), n(fifth, 0.5, 0.7), n(fifth, 1, 0.85)];
const TIMP_3: Note[] = [
  ...again(2, pedal3('A2', 'E3')), ...again(2, pedal3('Bb2', 'F3')),
  ...again(2, pedal3('A2', 'E3')), ...pedal3('Bb2', 'F3'), ...pedal3('E3', 'B2')
];

/** The escalation kit: a ruff into two and into four, the bass drum on one and three. */
const ROLLING: Note[] = [
  d('kick', 0.5, 0.9), d('snare', 0.25, 0.5), d('snare', 0.25, 0.6), d('snare', 0.5, 0.85), d('hat', 0.5, 0.45),
  d('kick', 0.5, 0.85), d('snare', 0.25, 0.5), d('snare', 0.25, 0.6), d('snare', 0.5, 0.85), d('hat', 0.5, 0.45)
];
const FILL_3: Note[] = [d('kick', 0.5, 0.9), ...snareRoll(2.5, 0.4, 0.85), d('kick', 1, 1)];
const DRUMS_3: Note[] = [...again(7, ROLLING), ...FILL_3];

/** Escalation preparation: the B flat shadowing the root, hung on a suspension. */
const PREP_RIFF_3: Note[] = [
  ...again(
    2,
    [r(0.5), n('A3', 0.5, 0.6), n('D4', 0.5, 0.65), n('E4', 2.5, 0.8)],
    [r(2), n('Bb3', 0.5, 0.6), n('D4', 1.5, 0.7)],
    [r(0.5), n('A3', 0.5, 0.6), n('Bb3', 0.5, 0.6), n('E4', 1, 0.75), n('F4', 1.5, 0.8)],
    [r(4)]
  ),
  ...[r(0.5), n('A3', 0.5, 0.6), n('D4', 0.5, 0.65), n('E4', 2.5, 0.8)],
  ...[r(2), n('Bb3', 0.5, 0.6), n('D4', 1.5, 0.7)],
  ...[r(0.5), n('A3', 0.5, 0.6), n('Bb3', 0.5, 0.6), n('E4', 1, 0.75), n('F4', 1.5, 0.8)],
  ...[r(1), n('B3', 1, 0.6), n('E4', 2, 0.7)]
];
const PREP_HORN_3: Note[] = [
  ...[r(1), n('E4', 3, 0.8)], ...[n('F4', 4, 0.8)], ...[r(1), n('E4', 1, 0.75), n('D4', 2, 0.85)], ...[n('E4', 3, 0.8), r(1)],
  ...[r(1), n('A4', 3, 0.8)], ...[n('Bb4', 4, 0.8)], ...[r(1), n('A4', 1, 0.75), n('D4', 2, 0.8)], ...[n('E4', 3, 0.8), r(1)],
  ...[r(1), n('E4', 3, 0.8)], ...[n('F4', 4, 0.8)], ...[r(1), n('E4', 1, 0.75), n('D4', 2, 0.85)], ...[n('B4', 4, 0.8)]
];
/** Two rolls a phrase now, the second on the B flat. */
const prepTimp3: Note[] = [...roll('A2', 2, 0.25, 0.6), n('A2', 2, 0.75), r(4), ...roll('Bb2', 2, 0.2, 0.5), n('Bb2', 2, 0.65), r(4)];
const PREP_TIMP_3: Note[] = [
  ...prepTimp3,
  ...prepTimp3,
  ...roll('A2', 2, 0.25, 0.6), n('A2', 2, 0.75), r(4), r(4), n('E3', 1, 0.6), r(3)
];

// --- the horde (danger): A minor, Am and Bb every bar, 138 bpm -------------

/** The horde's riff, one bar: the root hammered, the half step, the push to the fifth. */
const hordeRiff = (root: string, step: string, top: string, third: string): Note[] => [
  n(root, 0.5, 0.9), n(root, 0.5, 0.55), n(step, 0.5, 0.7), n(top, 1, 1), n(root, 0.5, 0.6), n(step, 0.5, 0.65), n(third, 0.5, 0.75)
];
const HORDE_RIFF: Note[] = [
  ...again(3, hordeRiff('A3', 'Bb3', 'E4', 'C4'), hordeRiff('Bb3', 'A3', 'F4', 'D4')),
  ...[n('E4', 0.5, 0.9), n('E4', 0.5, 0.55), n('F4', 0.5, 0.7), n('G#4', 1, 1), n('F4', 0.5, 0.65), n('E4', 0.5, 0.7), n('D4', 0.5, 0.7)],
  ...[n('C4', 0.5, 0.8), n('B3', 0.5, 0.7), n('Bb3', 0.5, 0.7), n('A3', 0.5, 0.75), n('G#3', 2, 0.85)]
];
const HORDE_HORN_A: Note[] = [
  ...again(3, stabs('A4', 'C5'), stabs('Bb4', 'D5')),
  ...stabs('B4', 'D5'), ...[n('B4', 2, 0.9), n('G#4', 2, 0.9)]
];
const HORDE_HORN_B: Note[] = [
  ...again(3, [n('E5', 3, 0.9), n('C5', 1, 0.8)], [n('F5', 3, 0.9), n('D5', 1, 0.8)]),
  ...[n('E5', 2, 0.9), n('D5', 2, 0.85)], ...[n('B4', 4, 0.9)]
];
const HORDE_PIZZ: Note[] = [
  ...again(3, broken('A4', 'E5', 'C5'), broken('Bb4', 'F5', 'D5')),
  ...broken('E5', 'B5', 'G#5'), ...broken('G#4', 'E5', 'B4')
];
/** The horde pedal: every eighth of the bar's front half on the root, then the fifth. */
const hordePedal = (root: string, fifth: string): Note[] => [
  n(root, 0.5, 0.95), n(root, 0.25, 0.5), n(root, 0.25, 0.6), n(fifth, 0.5, 0.8), n(root, 0.5, 0.6), n(root, 1, 0.9), n(fifth, 1, 0.8)
];
const HORDE_TIMP: Note[] = [...again(3, hordePedal('A2', 'E3'), hordePedal('Bb2', 'F3')), ...again(2, hordePedal('E3', 'B2'))];
const STORM: Note[] = [
  d('kick', 0.5, 0.95), d('snare', 0.25, 0.5), d('snare', 0.25, 0.6), d('kick', 0.5, 0.85), d('snare', 0.5, 0.9),
  d('kick', 0.5, 0.9), d('snare', 0.25, 0.5), d('snare', 0.25, 0.6), d('kick', 0.5, 0.85), d('snare', 0.5, 0.9)
];
const HORDE_DRUMS: Note[] = [...again(7, STORM), d('kick', 0.5, 1), ...snareRoll(3.5, 0.45, 0.95)];

/** The launch: a timpani roll into a low stroke on the arc's tonic, a snare roll beside it, half a bar. */
const launch = (root: string): Note[][] => [
  [],
  [],
  [],
  [...roll(root, 1.5, 0.35, 0.8), n(root, 0.5, 1)],
  [...snareRoll(1.5, 0.35, 0.8), d('kick', 0.5, 1)]
];

export const TOWERDEFENSE_MUSIC: GameAudioOptions = {
  tempo: BASE_TEMPO,
  volume: 0.09,
  tonic: p('A3'),
  tracks: [
    // The ostinato: a marimba, a sine struck by a 4:1 modulator that dies in 40 ms.
    {
      name: 'riff',
      wave: 'sine',
      fm: { ratio: 4, index: 1.8, indexDecay: 0.04 },
      adsr: { attack: 0.002, decay: 0.35, sustain: 0, release: 0.12 },
      volume: 0.9
    },
    // Brass swells: the low-pass opens an octave and a half as the note speaks.
    {
      name: 'horn',
      wave: 'sawtooth',
      filter: { cutoff: 1600, q: 0.7, envAmount: -1.5, envDecay: 0.2 },
      adsr: { attack: 0.06, decay: 0.3, sustain: 0.6, release: 0.25 },
      volume: 0.38
    },
    // Plucked strings: the filter snaps shut behind the attack.
    {
      name: 'pizz',
      wave: 'sawtooth',
      filter: { cutoff: 900, q: 1.5, envAmount: 2, envDecay: 0.06 },
      adsr: { attack: 0.002, decay: 0.14, sustain: 0, release: 0.06 },
      volume: 0.4,
      startsMuted: true
    },
    // Timpani: struck two semitones sharp, settling as the head does.
    {
      name: 'timpani',
      wave: 'triangle',
      pitchEnv: { semitones: 2, time: 0.09 },
      adsr: { attack: 0.003, decay: 0.8, sustain: 0, release: 0.3 },
      volume: 0.95
    },
    // The marching band: bass drum and snare, hats only for the swing.
    { name: 'drums', volume: 0.55, startsMuted: true }
  ],
  form: {
    sections: {
      'p1': [PREP_RIFF_1, PREP_HORN_1, TACET, PREP_TIMP_1, TACET],
      'b1a': [RIFF_1, HORN_1A, PIZZ_1A, TIMP_1, DRUMS_1],
      'b1b': [RIFF_1, HORN_1B, PIZZ_1B, TIMP_1, DRUMS_1],
      'p2': [PREP_RIFF_2, PREP_HORN_2, TACET, PREP_TIMP_2, TACET],
      'b2a': [RIFF_2, HORN_2A, PIZZ_2A, TIMP_2, DRUMS_2],
      'b2b': [RIFF_2, HORN_2B, PIZZ_2B, TIMP_2, DRUMS_2],
      'p3': [PREP_RIFF_3, PREP_HORN_3, TACET, PREP_TIMP_3, TACET],
      'b3a': [RIFF_3, HORN_3A, PIZZ_3A, TIMP_3, DRUMS_3],
      'b3b': [RIFF_3, HORN_3B, PIZZ_3B, TIMP_3, DRUMS_3],
      horde: [HORDE_RIFF, HORDE_HORN_A, HORDE_PIZZ, HORDE_TIMP, HORDE_DRUMS],
      'horde-b': [HORDE_RIFF, HORDE_HORN_B, HORDE_PIZZ, HORDE_TIMP, HORDE_DRUMS]
    },
    order: ['p1'],
    scenes: {
      'prep-1': { order: ['p1'] },
      'battle-1': { order: ['b1a', 'b1b', 'b1a'] },
      'prep-2': { order: ['p2'], tempo: PRESSURE_TEMPO },
      'battle-2': { order: ['b2a', 'b2b', 'b2a'], tempo: PRESSURE_TEMPO },
      'prep-3': { order: ['p3'], tempo: ESCALATION_TEMPO },
      'battle-3': { order: ['b3a', 'b3b', 'b3a'], tempo: ESCALATION_TEMPO }
    },
    danger: { order: ['horde', 'horde', 'horde-b'], tempo: HORDE_TEMPO }
  },
  stingers: {
    'launch-a': launch('A2'),
    'launch-e': launch('E3')
  }
};
