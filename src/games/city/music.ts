/**
 * Microcity's score: one motif in C major that grows with the city.
 *
 * Session and load. A city is the longest session on the floor, up to forty
 * minutes, spent planning (zoning, reading the demand meter, balancing the
 * books) with no clock to beat: high but unhurried cognitive load, and the
 * music is something the player lives beside rather than listens to. So the
 * brief is Soyo Oka's for SNES SimCity, taken literally: one motif, varied
 * "from the simple to the grandiose" as the city grows, "without any feeling
 * of an ending", and after C418, silence between passes.
 *
 * Form. Three eight-bar sections at 90 bpm, `a`, `b` and `a2`, so one pass is
 * 24 bars and 64 s (the long-session floor is 45 s; the tempo never ramps, so
 * the base and fastest figures are the same). The harmony moves once every two
 * bars. `a` states the motif over Cmaj7 and Em7, climbs to its apex over Fmaj7
 * and floats off on a Gsus with no third, which steps up to Am9 rather than
 * resolving. `b` carries the motif down the borrowed chords a whole step at a
 * time, Bbmaj9 (bVII) then Abmaj7 (bVI), and Ab moves to C by a third, not by
 * a cadence. `a2` repeats `a` until its last two bars, which turn to Dm9 and
 * hand back to the top from D: the lowest voice is on A and D in bar 24, never
 * on C, and nothing in the pass goes V to I. After every two passes the form
 * rests for 96 beats, one pass length, so a forty-minute city hears music two
 * thirds of the time. A gap that long reads as silence rather than a breath in
 * the phrase, and each return then starts from the motif's first statement.
 * No intro: a city starts from an empty map, which the rest already sounds
 * like.
 *
 * The tune. The motif is a bar: E, D, then a leap of a seventh up to C, held
 * over the half bar, and a step down to B. It is sequenced rather than
 * replaced: a sixth over Em7, a whole step down twice over the borrowed
 * chords, a step up over Dm9. The apex is E6 over Fmaj7 in bar 5, and the
 * phrases breathe on long notes and rests.
 *
 * Harmony and register. Every chord is a seventh or a ninth. Each track
 * plays one note at a time, so the chord is spread across the voices, as a
 * chiptune trio would: the bass the root, the pad the colour tones (the third
 * and then the seventh or ninth, two bars of four-beat swells), the lead the
 * melody. Only the bass sits below C3, on roots and fifths from Ab1 to E3; the
 * pad stays between G3 and A4. No percussion: this is the calm cabinet, and by
 * ADR 003's amendment percussion is the sound of motion.
 *
 * Adaptivity. `musicTier` reads the city's population into three tiers, and
 * each tier is a set of layers (`TIER_LAYERS`), so the arrangement grows with
 * the city: a village (under 120) hears the motif as a sine bell over the pad;
 * a town (from 120, the second milestone) adds the bass; a metropolis (from
 * 1000, the prestige milestone) hands the tune from the bell to the horn, the
 * same line on a sustained, vibrato 25% pulse an octave down. A tier is left
 * only when the population falls a fifth below its floor, so a fire that
 * takes a block does not flap the arrangement. The tiers are layers rather
 * than `setSection` jumps because a form's order runs on into its next
 * section: a jump cannot hold a section, and re-jumping every pass would never
 * finish a pass, which is what counts the rests. Disasters get stingers
 * (`fire` when a fire breaks out, `disaster` for a tornado or a quake, `red` when
 * the books go into the grace month) over the ducked score, and the sim's
 * pause speed and the Retire prompt muffle it with `setPaused` rather than
 * stopping it.
 */
import { p, REST, type GameAudioOptions, type MusicProfile, type Note } from '../engine';
import { POP_MILESTONES, METROPOLIS_INDEX } from './milestones';

/** A city runs to forty minutes, the longest session in the arcade. */
export const MUSIC_PROFILE: MusicProfile = {
  session: 'long'
};

/** A pitched note, by name. */
const n = (name: string, beats: number, gain?: number): Note => ({ freq: p(name), beats, gain });
/** Silence. */
const r = (beats: number): Note => ({ freq: REST, beats });

// --- lead ---------------------------------------------------------------

/** Bars 1 to 6 of `a`, which `a2` repeats. */
const LEAD_A_HEAD: Note[] = [
  // 1 Cmaj7, the motif: E, D, a seventh up to C held over the half bar, B
  n('E5', 1, 0.85),
  n('D5', 0.5, 0.7),
  n('C6', 1.5, 1),
  n('B5', 1, 0.8),
  // 2 Cmaj7, settling on a long note
  n('G5', 3, 0.85),
  r(1),
  // 3 Em7, the motif again, the leap a sixth
  n('E5', 1, 0.85),
  n('D5', 0.5, 0.7),
  n('B5', 1.5, 0.95),
  n('A5', 1, 0.8),
  // 4 Em7
  n('G5', 1.5, 0.85),
  n('E5', 0.5, 0.7),
  n('D5', 2, 0.8),
  // 5 Fmaj7, climbing to the apex
  n('A5', 1, 0.85),
  n('C6', 0.5, 0.8),
  n('E6', 1.5, 1),
  n('D6', 1, 0.85),
  // 6 Fmaj7, falling away
  n('C6', 2, 0.85),
  n('A5', 1, 0.75),
  n('F5', 1, 0.75)
];

const LEAD_A: Note[] = [
  ...LEAD_A_HEAD,
  // 7 Gsus, no leading tone anywhere in the bar
  n('G5', 1.5, 0.85),
  n('F5', 0.5, 0.7),
  n('D5', 1, 0.75),
  n('C5', 1, 0.75),
  // 8 Gsus, held open into b
  n('D5', 3, 0.8),
  r(1)
];

const LEAD_B: Note[] = [
  // 9 Am9, the motif a half beat late
  r(0.5),
  n('E5', 0.5, 0.75),
  n('D5', 0.5, 0.7),
  n('B5', 1.5, 0.95),
  n('A5', 1, 0.8),
  // 10 Am9
  n('G5', 2, 0.85),
  n('E5', 1, 0.75),
  n('D5', 1, 0.75),
  // 11 Fmaj7, the apex again
  n('A5', 1, 0.85),
  n('C6', 0.5, 0.8),
  n('E6', 1.5, 1),
  n('D6', 1, 0.85),
  // 12 Fmaj7
  n('C6', 3, 0.85),
  r(1),
  // 13 Bbmaj9, bVII: bar 1 a whole step down
  n('D5', 1, 0.85),
  n('C5', 0.5, 0.7),
  n('Bb5', 1.5, 0.95),
  n('A5', 1, 0.8),
  // 14 Bbmaj9, bar 2 a whole step down
  n('F5', 3, 0.8),
  r(1),
  // 15 Abmaj7, bVI: another whole step down
  n('C5', 1, 0.8),
  n('Bb4', 0.5, 0.7),
  n('Ab5', 1.5, 0.95),
  n('G5', 1, 0.8),
  // 16 Abmaj7, rising into the top of a2, held over the half bar
  n('Eb5', 1, 0.75),
  n('F5', 0.5, 0.75),
  n('G5', 2.5, 0.85)
];

const LEAD_A2: Note[] = [
  ...LEAD_A_HEAD,
  // 23 Dm9, bar 1 a step up
  n('F5', 1, 0.85),
  n('E5', 0.5, 0.7),
  n('D6', 1.5, 0.95),
  n('C6', 1, 0.8),
  // 24 Dm9, left on the ninth
  n('A5', 1.5, 0.8),
  n('G5', 0.5, 0.7),
  n('E5', 2, 0.75)
];

// --- pad ----------------------------------------------------------------

/** One chord over two bars: its third, then its seventh or ninth. */
const colour = (third: string, upper: string): Note[] => [n(third, 4, 0.85), n(upper, 4, 0.75)];

const PAD_A_HEAD: Note[] = [
  ...colour('E4', 'B3'), // Cmaj7
  ...colour('G4', 'D4'), // Em7
  ...colour('A4', 'E4') // Fmaj7
];
const PAD_A: Note[] = [...PAD_A_HEAD, ...colour('C4', 'A3')]; // Gsus, fourth then ninth
const PAD_B: Note[] = [
  ...colour('C4', 'B3'), // Am9
  ...colour('A3', 'E4'), // Fmaj7
  ...colour('D4', 'A3'), // Bbmaj9
  ...colour('C4', 'G3') // Abmaj7
];
const PAD_A2: Note[] = [...PAD_A_HEAD, ...colour('F4', 'E4')]; // Dm9

// --- bass ---------------------------------------------------------------

/** One chord over two bars: the root, then its fifth and the root again. */
const roots = (root: string, fifth: string): Note[] => [n(root, 4, 0.9), n(fifth, 2, 0.7), n(root, 2, 0.75)];

const BASS_A_HEAD: Note[] = [...roots('C2', 'G2'), ...roots('E2', 'B2'), ...roots('F2', 'C3')];
const BASS_A: Note[] = [...BASS_A_HEAD, ...roots('G2', 'D3')];
const BASS_B: Note[] = [...roots('A2', 'E3'), ...roots('F2', 'C3'), ...roots('Bb1', 'F2'), ...roots('Ab1', 'Eb2')];
// Bar 24 is on A then D: the pass hands back to the top without arriving on C.
const BASS_A2: Note[] = [...BASS_A_HEAD, ...roots('D2', 'A2')];

// --- the city's tiers -----------------------------------------------------

/**
 * The population each tier starts at: the village from nothing, the town at
 * the second milestone, the metropolis at the prestige one.
 */
export const TIER_FLOORS: readonly number[] = [0, POP_MILESTONES[1], POP_MILESTONES[METROPOLIS_INDEX]];

/**
 * A tier is left only below this fraction of its floor, so a population that
 * hovers at a threshold, or a disaster that takes a block, does not flap the
 * arrangement.
 */
export const TIER_HYSTERESIS = 0.8;

/**
 * The tier a city's population puts the score in, given the tier it is in
 * now: up as soon as a floor is reached, down only once the population has
 * fallen a fifth below the floor of the tier it is in.
 */
export function musicTier(population: number, current: number): number {
  let tier = Math.max(0, Math.min(current, TIER_FLOORS.length - 1));
  while (tier + 1 < TIER_FLOORS.length && population >= TIER_FLOORS[tier + 1]) tier++;
  while (tier > 0 && population < TIER_FLOORS[tier] * TIER_HYSTERESIS) tier--;
  return tier;
}

/** Which named voices play in each tier; the simple arrangement first. */
export const TIER_LAYERS: readonly Readonly<Record<'lead' | 'pad' | 'bass' | 'horn', boolean>>[] = [
  { lead: true, pad: true, bass: false, horn: false },
  { lead: true, pad: true, bass: true, horn: false },
  { lead: false, pad: true, bass: true, horn: true }
];

// --- the score ------------------------------------------------------------

export const CITY_MUSIC: GameAudioOptions = {
  tempo: 90,
  volume: 0.12,
  tonic: p('C4'),
  echo: { time: 0.33, feedback: 0.25, mix: 0.2 },
  tracks: [
    // LEAD: the motif as a light sine bell, the village's and the town's voice.
    { name: 'lead', wave: 'sine', envelope: 'pluck', volume: 0.85 },
    // PAD: the chord's colour tones, a slow swell every bar.
    { name: 'pad', wave: 'triangle', envelope: 'pad', detune: 6, volume: 0.45 },
    // BASS: roots and fifths, from the town up.
    { name: 'bass', wave: 'triangle', volume: 0.7, startsMuted: true },
    // HORN: the same line sustained on a pulse an octave down, the metropolis's voice.
    {
      name: 'horn',
      wave: 'pulse25',
      envelope: 'pad',
      octaveShift: -1,
      vibrato: 8,
      detune: 4,
      volume: 0.45,
      startsMuted: true
    }
  ],
  form: {
    sections: {
      a: [LEAD_A, PAD_A, BASS_A, LEAD_A],
      b: [LEAD_B, PAD_B, BASS_B, LEAD_B],
      a2: [LEAD_A2, PAD_A2, BASS_A2, LEAD_A2]
    },
    order: ['a', 'b', 'a2'],
    rest: { after: 2, beats: 96 }
  },
  stingers: {
    // A new fire: the bell alarms between C and Ab over the borrowed bVI.
    fire: [[n('C6', 0.5), n('Ab5', 0.5), n('C6', 0.5), n('Ab5', 1.5, 0.8)], [n('Eb4', 3)], [n('Ab1', 3)], []],
    // A tornado or a quake: a fall into Fm, the borrowed iv.
    disaster: [[n('Eb5', 0.5), n('D5', 0.5), n('C5', 0.5), n('Ab4', 2.5, 0.8)], [n('F4', 4)], [n('F2', 0.5), n('F2', 0.5), n('F2', 3)], []],
    // Into the red: the line sags a semitone at a time over Bb.
    red: [[n('E5', 1), n('Eb5', 1), n('D5', 2, 0.8)], [n('Bb3', 4)], [n('Bb1', 4)], []]
  }
};
