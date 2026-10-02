/**
 * Microcity's score: a piece per city size on a SNES palette, after Soyo
 * Oka's music for SimCity (1991).
 *
 * The brief (round 3, #411). Oka wrote one track per city size, Village,
 * Town, City, Capital, Metropolis and Megalopolis, each a minute and a half
 * to two and a half long, the village "soothing and slow" and each size
 * after it faster, denser and "more mechanized", with a xylophone as the
 * thread through most of them. She wanted music that would not annoy or
 * stress a player building for an hour. Her opening theme sits in C major
 * with sevenths, inversions, secondary dominants and a borrowed minor iv.
 * The hardware was the SNES S-DSP: eight sampled voices, soft through the
 * Gaussian interpolation, with an FIR echo on the whole mix. So this is not
 * one tune gaining instruments as the city grows, which is what it was
 * before, but three pieces, one per tier of `musicTier`, in three keys at
 * three tempos, played by the same small band. Evoked, never quoted: no
 * line here is Oka's.
 *
 * Session and load. A city is the longest session on the floor, up to forty
 * minutes, spent planning with no clock to beat: high but unhurried load,
 * music the player lives beside. Every tier piece is a long-session loop
 * (45 s floor, measured at its own tempo) and every one rests after two
 * passes, so a forty-minute city hears music about three quarters of the
 * time and each return starts from the top of its piece. The order rests
 * through `ScoreForm.rest`; the two scenes through `FormScene.rest`, which
 * the engine gained for this score because a scene otherwise loops without
 * a break (C418's silences between passes, the reason the old score rested).
 *
 * The band. Three pitched voices and a drum track, the brief's palette. The
 * lead is the mallet: a sine carrier with a sine modulator at three times
 * the pitch (a xylophone's bar is tuned to its twelfth) whose index falls
 * away in 80 ms, under an ADSR with no sustain so every note rings and dies
 * as a struck bar does, through a low-pass at 3.8 kHz for the S-DSP's
 * softness. It is the thread through all three pieces, as Oka's xylophone
 * is. The keys are a soft sampled-sounding keyboard, a wavetable of five
 * falling harmonics behind a 1.6 kHz low-pass that sustains at a quarter of
 * its peak; they carry the seventh chords one note at a time, each tier in
 * its own steady cell, a little left of centre (the SNES mixed in stereo,
 * and SimCity kept its panning mild). The bass is a round wavetable whose
 * filter opens an octave and a half on the attack and closes behind it, the
 * plucked-sample bass of the era. The drum track is silent in the village;
 * the town gets a soft kick and offbeat hats, the metropolis a sixteenth-note
 * machine with a snare on two and four, the "mechanized" percussion that
 * arrives as the city grows. One feedback delay at 0.3 s on the whole mix
 * stands in for the S-DSP's FIR echo.
 *
 * The three pieces. The harmony is the brief's bright major sevenths, with
 * Oka's borrowed minor iv in each piece (Bbm6 in F, Fm6 in C, Abm6 in Eb)
 * and a secondary dominant or two (D7, A7, C7, F7), and none of the flat-six
 * and flat-seven chords round 3 retired as the house colour. Each pass ends
 * on a suspended dominant, so the bass hands back to the top from the fifth
 * and never arrives home at the seam.
 *
 * The village is the `order`: F major at 84 bpm, three eight-bar sections (a
 * statement, its answer, a bridge on Dm9 and Gm9), 96 beats, 68.6 s. The
 * harmony changes every bar or two, the keys roll a 3+3+2 lilt through each
 * chord's third, seventh and fifth, and the bass holds the root for three
 * beats and steps to the fifth. The hook is a bar and a half: a breath, then
 * C, F, G rising to an A held over the bar line, answered a third higher
 * over Bbmaj7, the phrase arching to D6 over Dm7 and settling on the
 * suspension. No drums: this is the tier Oka called soothing.
 *
 * The town is the scene `town`: C major at 104 bpm, 28 bars (a verse, a
 * lyrical middle through the Fm6, the verse again and a four-bar
 * turnaround), 64.6 s. The keys become running eighths of the chord's four
 * tones, the bass bounces root, root, fifth, octave, and a soft kick and
 * offbeat hats enter. The hook is quicker, a two-bar call (E, G, up to B,
 * down to a G pushed over the third beat) answered a step higher.
 *
 * The metropolis is the scene `metropolis`: Eb major at 124 bpm, 32 bars (a
 * four-bar machine riff, a verse, a middle through the Abm6, the verse and a
 * turnaround), 61.9 s. The keys stab the offbeats, the bass runs a 3+3+2
 * sixteenth figure and the drums a sixteenth-note pattern with accents: the
 * city as clockwork, with the mallet's longer lines riding over it. The riff
 * is the machine idling before the tune, which is where each pass, and each
 * return from a rest, begins.
 *
 * Adaptivity. `musicTier` reads the population into the three tiers, with a
 * fifth's hysteresis so a fire that takes a block does not flap them, and
 * `game.ts` hands the tier to `setScene` through `TIER_SCENES`: the village
 * is the order, the town and the metropolis are scenes. A move lands on the
 * next bar line, so a milestone changes the piece within a bar; one reached
 * during a rest waits for the silence to end, which keeps the silence
 * silent. Falling back to the village resumes it where it was left.
 * Disasters get stingers in the band's own voices (`fire` when a fire
 * breaks out, `disaster` for a tornado or a quake, `red` when the books go
 * into the grace month) over the ducked score, and the sim's pause speed and
 * the Retire prompt muffle it with `setPaused` rather than stopping it.
 *
 * Beginnings and endings (#417), in 3/4 (#438). Every city is founded on a
 * two-bar intro, the mallet's flourish over Fmaj7 and the suspension, which
 * plays once before the village's first pass (a rest later returns to the
 * statement, never to the flourish), as SimCity opened on its own short theme
 * rather than dropping straight into the Village. That opening theme is the
 * one piece of Oka's score in 3/4 (Hooktheory has it in C at 131 bpm; the
 * menu, Village and Town are in 4/4), so the frames waltz and the tiers do
 * not: the score keeps one metre, the tiers' 4, and the engine needs no metre
 * per scene. A run ends through `playEnding` on one of two two-bar phrases,
 * named for `gameOver`'s reason: `bankrupt` falls through the borrowed Bbm6
 * to a bare F, and `retired` closes a thriving city home to Fmaj7 with the
 * mallet lifting to F6. Either plays at the tempo of the tier the city had
 * reached, and neither is a loop, so the seam gate's ban on arriving home
 * does not apply to them.
 *
 * Gates. All three style gates stay on: Oka's tier tracks are tuneful loops
 * of the kind they measure, with pushed notes and varied bar rhythms.
 */
import { p, REST, type DrumName, type GameAudioOptions, type MusicProfile, type Note } from '../engine';
import { POP_MILESTONES, METROPOLIS_INDEX } from './milestones';

/** The village's tempo, the score's own; each scene carries its own. */
const VILLAGE_TEMPO = 84;
const TOWN_TEMPO = 104;
const METROPOLIS_TEMPO = 124;

/** A city runs to forty minutes, and each tier's piece is a loop the player lives in. */
export const MUSIC_PROFILE: MusicProfile = {
  session: 'long',
  scenes: {
    town: { session: 'long', fastestTempo: TOWN_TEMPO },
    metropolis: { session: 'long', fastestTempo: METROPOLIS_TEMPO }
  }
};

/** A pitched note, by name. */
const n = (name: string, beats: number, gain?: number): Note => ({ freq: p(name), beats, gain });
/** Silence. */
const r = (beats: number): Note => ({ freq: REST, beats });

/** One drum per character, each `step` beats long: K kick, S snare, H an accented hat, h a soft one, `.` nothing. */
const DRUM_HITS: Record<string, [DrumName, number]> = {
  K: ['kick', 0.7],
  S: ['snare', 0.5],
  H: ['hat', 0.4],
  h: ['hat', 0.2]
};
function drums(pattern: string, step: number): Note[] {
  return [...pattern].map(ch => {
    const hit = DRUM_HITS[ch];
    return hit ? { freq: REST, beats: step, drum: hit[0], gain: hit[1] } : r(step);
  });
}

/** Four lines of a section, in the order of `tracks`. */
type Section = [lead: Note[], keys: Note[], bass: Note[], perc: Note[]];

// --- the village: F major, 84 bpm, no drums --------------------------------

/**
 * A village chord: its bass root and fifth, and the three colour tones the
 * keys lilt through (third, seventh, fifth, or the chord's nearest to them).
 */
const VILLAGE_CHORDS: Record<string, { root: string; fifth: string; lilt: [string, string, string] }> = {
  Fmaj7: { root: 'F2', fifth: 'C3', lilt: ['A3', 'E4', 'C4'] },
  Bbmaj7: { root: 'Bb1', fifth: 'F2', lilt: ['D4', 'A4', 'F4'] },
  Bbm6: { root: 'Bb1', fifth: 'F2', lilt: ['Db4', 'G4', 'F4'] },
  Am7: { root: 'A1', fifth: 'E2', lilt: ['C4', 'G4', 'E4'] },
  Dm7: { root: 'D2', fifth: 'A2', lilt: ['F3', 'C4', 'A3'] },
  Dm9: { root: 'D2', fifth: 'A2', lilt: ['F3', 'E4', 'C4'] },
  D7: { root: 'D2', fifth: 'A2', lilt: ['F#3', 'C4', 'A3'] },
  Gm7: { root: 'G1', fifth: 'D2', lilt: ['Bb3', 'F4', 'D4'] },
  Gm9: { root: 'G1', fifth: 'D2', lilt: ['Bb3', 'A4', 'F4'] },
  C9sus: { root: 'C2', fifth: 'G2', lilt: ['F4', 'D4', 'Bb3'] }
};

/** A village section: one chord a bar, the keys' 3+3+2 lilt and the bass's held root, under the lead. */
function village(chords: string[], lead: Note[]): Section {
  const bars = chords.map(name => VILLAGE_CHORDS[name]);
  return [
    lead,
    bars.flatMap(({ lilt: [third, seventh, fifth] }) => [n(third, 1.5, 0.8), n(seventh, 1.5, 0.7), n(fifth, 1, 0.6)]),
    bars.flatMap(({ root, fifth }) => [n(root, 3, 0.9), n(fifth, 1, 0.6)]),
    [r(chords.length * 4)]
  ];
}

const VILLAGE_STATEMENT = village(
  ['Fmaj7', 'Fmaj7', 'Bbmaj7', 'Bbmaj7', 'Am7', 'Dm7', 'Gm7', 'C9sus'],
  [
    // 1-2 Fmaj7, the hook: a breath, C, F, G, and an A held over the bar line
    r(1),
    n('C5', 1, 0.75),
    n('F5', 0.5, 0.8),
    n('G5', 0.5, 0.8),
    n('A5', 2, 1),
    n('G5', 1, 0.8),
    n('E5', 1, 0.75),
    n('C5', 1, 0.7),
    // 3-4 Bbmaj7, answered a third higher
    r(1),
    n('D5', 1, 0.75),
    n('F5', 0.5, 0.8),
    n('A5', 0.5, 0.8),
    n('C6', 2, 1),
    n('Bb5', 1, 0.8),
    n('A5', 1, 0.75),
    n('F5', 1, 0.7),
    // 5-6 Am7 to Dm7, climbing to the apex
    n('E5', 1.5, 0.8),
    n('G5', 0.5, 0.7),
    n('A5', 1, 0.8),
    n('C6', 1, 0.85),
    n('D6', 2, 1),
    n('C6', 1, 0.8),
    n('A5', 1, 0.75),
    // 7-8 Gm7 to the suspension, left open
    n('Bb5', 1.5, 0.85),
    n('A5', 0.5, 0.7),
    n('G5', 1, 0.75),
    n('F5', 1, 0.7),
    n('G5', 3, 0.8),
    r(1)
  ]
);

const VILLAGE_ANSWER = village(
  ['Fmaj7', 'Fmaj7', 'Bbmaj7', 'Bbm6', 'Am7', 'D7', 'Gm7', 'C9sus'],
  [
    // 1-2 the hook again, turning upward this time
    r(1),
    n('C5', 1, 0.75),
    n('F5', 0.5, 0.8),
    n('G5', 0.5, 0.8),
    n('A5', 2, 1),
    n('C6', 1, 0.85),
    n('A5', 1, 0.75),
    n('G5', 1, 0.7),
    // 3-4 Bbmaj7 to the borrowed Bbm6: D6 falls through its minor third
    r(1),
    n('D5', 1, 0.75),
    n('F5', 0.5, 0.8),
    n('A5', 0.5, 0.8),
    n('D6', 2, 1),
    n('Db6', 1, 0.85),
    n('Bb5', 1, 0.75),
    n('G5', 1, 0.7),
    // 5-6 Am7 to D7, the secondary dominant
    n('A5', 1.5, 0.8),
    n('G5', 0.5, 0.7),
    n('E5', 1, 0.75),
    n('C5', 1, 0.7),
    n('F#5', 2, 0.85),
    n('A5', 1, 0.8),
    n('C6', 1, 0.8),
    // 7-8 Gm7 to the suspension, resting on its fourth
    n('Bb5', 1.5, 0.85),
    n('A5', 0.5, 0.7),
    n('G5', 1, 0.75),
    n('D5', 1, 0.7),
    n('F5', 3, 0.8),
    r(1)
  ]
);

const VILLAGE_BRIDGE = village(
  ['Dm9', 'Dm9', 'Bbmaj7', 'Bbmaj7', 'Gm9', 'Gm9', 'Bbm6', 'C9sus'],
  [
    // 1-2 Dm9, sparser: two notes and a long A
    r(2),
    n('E5', 1, 0.7),
    n('F5', 1, 0.75),
    n('A5', 3, 0.9),
    n('G5', 1, 0.7),
    // 3-4 Bbmaj7, a C6 pushed over the third beat
    n('F5', 1.5, 0.8),
    n('D5', 0.5, 0.7),
    n('F5', 1, 0.75),
    n('A5', 1, 0.8),
    n('C6', 2.5, 0.95),
    n('A5', 1.5, 0.75),
    // 5-6 Gm9, stepping down and letting go
    n('Bb5', 1, 0.85),
    n('A5', 1, 0.8),
    n('G5', 1, 0.75),
    n('F5', 1, 0.7),
    n('D5', 2, 0.7),
    r(2),
    // 7-8 the borrowed Bbm6 over its own root, then the suspension
    r(1),
    n('Db5', 1, 0.75),
    n('F5', 1, 0.8),
    n('Bb5', 1, 0.85),
    n('G5', 2.5, 0.8),
    r(1.5)
  ]
);

// --- the town: C major, 104 bpm, a soft kick and hats ----------------------

/** A town chord: its bass root and fifth, and the four tones the keys run through. */
const TOWN_CHORDS: Record<string, { root: string; fifth: string; tones: [string, string, string, string] }> = {
  Cmaj7: { root: 'C2', fifth: 'G2', tones: ['C4', 'E4', 'G4', 'B4'] },
  Am7: { root: 'A1', fifth: 'E2', tones: ['A3', 'C4', 'E4', 'G4'] },
  Dm7: { root: 'D2', fifth: 'A2', tones: ['D4', 'F4', 'A4', 'C5'] },
  G9sus: { root: 'G1', fifth: 'D2', tones: ['G3', 'C4', 'F4', 'A4'] },
  Fmaj7: { root: 'F1', fifth: 'C2', tones: ['F3', 'A3', 'C4', 'E4'] },
  Fm6: { root: 'F1', fifth: 'C2', tones: ['F3', 'Ab3', 'C4', 'D4'] },
  Em7: { root: 'E2', fifth: 'B2', tones: ['E3', 'G3', 'B3', 'D4'] },
  A7: { root: 'A1', fifth: 'E2', tones: ['A3', 'C#4', 'E4', 'G4'] },
  Dm9: { root: 'D2', fifth: 'A2', tones: ['A3', 'C4', 'E4', 'F4'] },
  'Fmaj7/G': { root: 'G1', fifth: 'D2', tones: ['G3', 'A3', 'C4', 'E4'] }
};

/** The town's kick and hats, a bar at a time: every fourth bar the last hat doubles into the next. */
const TOWN_BEAT = drums('Kh.hKh.h', 0.5);
const TOWN_TURN = drums('Kh.hKhhh', 0.5);

/**
 * A town section: one chord a bar, the keys running the chord's four tones in
 * eighths (1 2 3 2 4 3 2 3), the bass bouncing root, root, fifth, octave.
 */
function town(chords: string[], lead: Note[]): Section {
  const bars = chords.map(name => TOWN_CHORDS[name]);
  return [
    lead,
    bars.flatMap(({ tones: [a, b, c, d] }) =>
      [a, b, c, b, d, c, b, c].map((tone, i) => n(tone, 0.5, i % 2 === 0 ? 0.7 : 0.5))
    ),
    bars.flatMap(({ root, fifth }) => [
      n(root, 1.5, 0.9),
      n(root, 0.5, 0.6),
      n(fifth, 1, 0.75),
      { freq: p(root) * 2, beats: 1, gain: 0.65 }
    ]),
    chords.flatMap((_, bar) => (bar % 4 === 3 ? TOWN_TURN : TOWN_BEAT))
  ];
}

const TOWN_VERSE = town(
  ['Cmaj7', 'Am7', 'Dm7', 'G9sus', 'Cmaj7', 'Am7', 'Dm7', 'G9sus'],
  [
    // 1-2 the call: E, G, up to B, down to a G pushed over the third beat
    n('E5', 0.5, 0.8),
    n('G5', 0.5, 0.8),
    n('B5', 1, 0.95),
    n('A5', 0.5, 0.75),
    n('G5', 1.5, 0.85),
    n('E5', 1, 0.8),
    n('C5', 0.5, 0.7),
    n('E5', 0.5, 0.75),
    n('A5', 2, 0.9),
    // 3-4 the answer a step higher, falling onto the suspension
    n('F5', 0.5, 0.8),
    n('A5', 0.5, 0.8),
    n('C6', 1, 0.95),
    n('B5', 0.5, 0.75),
    n('A5', 1.5, 0.85),
    n('G5', 1.5, 0.85),
    n('F5', 0.5, 0.7),
    n('D5', 2, 0.8),
    // 5-6 the call with a higher top
    n('E5', 0.5, 0.8),
    n('G5', 0.5, 0.8),
    n('B5', 1, 0.9),
    n('D6', 0.5, 0.85),
    n('C6', 1.5, 0.95),
    n('B5', 1, 0.85),
    n('A5', 0.5, 0.75),
    n('G5', 0.5, 0.75),
    n('E5', 2, 0.8),
    // 7-8 down to the suspension, held open
    n('F5', 0.5, 0.8),
    n('E5', 0.5, 0.75),
    n('D5', 1, 0.8),
    n('A5', 0.5, 0.8),
    n('F5', 1.5, 0.8),
    n('G5', 3, 0.85),
    r(1)
  ]
);

const TOWN_MIDDLE = town(
  ['Fmaj7', 'Fm6', 'Em7', 'A7', 'Dm9', 'Dm9', 'Fmaj7/G', 'G9sus'],
  [
    // 1-2 Fmaj7 to the borrowed Fm6, the line sighing through Ab
    n('A5', 1.5, 0.85),
    n('G5', 0.5, 0.7),
    n('A5', 1, 0.8),
    n('C6', 1, 0.9),
    n('Ab5', 2, 0.9),
    n('G5', 1, 0.75),
    n('F5', 1, 0.7),
    // 3-4 Em7 to A7, climbing to a C# pushed over the third beat
    n('G5', 1.5, 0.8),
    n('E5', 0.5, 0.7),
    n('D5', 1, 0.75),
    n('E5', 1, 0.75),
    n('E5', 1, 0.75),
    n('G5', 1, 0.8),
    n('A5', 0.5, 0.8),
    n('C#6', 1.5, 0.95),
    // 5-6 Dm9, the apex and a long fall
    n('D6', 2, 1),
    n('C6', 1, 0.85),
    n('A5', 1, 0.8),
    n('F5', 1.5, 0.8),
    n('E5', 0.5, 0.7),
    n('D5', 2, 0.75),
    // 7-8 a pickup run into the suspension
    r(0.5),
    n('C5', 0.5, 0.7),
    n('E5', 0.5, 0.75),
    n('G5', 0.5, 0.8),
    n('A5', 2, 0.9),
    n('G5', 1, 0.8),
    n('F5', 1, 0.75),
    n('D5', 2, 0.75)
  ]
);

const TOWN_TURNAROUND = town(
  ['Em7', 'A7', 'Dm7', 'G9sus'],
  [
    n('B5', 1.5, 0.85),
    n('A5', 0.5, 0.7),
    n('G5', 1, 0.8),
    n('E5', 1, 0.75),
    n('E5', 0.5, 0.75),
    n('G5', 0.5, 0.8),
    n('A5', 1, 0.85),
    n('C#6', 0.5, 0.85),
    n('E6', 1.5, 1),
    n('D6', 1, 0.9),
    n('C6', 1, 0.85),
    n('A5', 1, 0.8),
    n('F5', 1, 0.75),
    n('G5', 2.5, 0.8),
    r(1.5)
  ]
);

// --- the metropolis: Eb major, 124 bpm, a sixteenth-note machine ------------

/** A metropolis chord: its bass root, third and fifth, and the two tones the keys stab on the offbeats. */
const METRO_CHORDS: Record<string, { root: string; third: string; fifth: string; stabs: [string, string] }> = {
  Ebmaj7: { root: 'Eb2', third: 'G2', fifth: 'Bb2', stabs: ['G3', 'D4'] },
  Cm7: { root: 'C2', third: 'Eb2', fifth: 'G2', stabs: ['Eb4', 'Bb3'] },
  Abmaj7: { root: 'Ab1', third: 'C2', fifth: 'Eb2', stabs: ['C4', 'G4'] },
  Abm6: { root: 'Ab1', third: 'B1', fifth: 'Eb2', stabs: ['B3', 'F4'] },
  Bb7sus: { root: 'Bb1', third: 'Eb2', fifth: 'F2', stabs: ['Eb4', 'Ab3'] },
  Fm7: { root: 'F1', third: 'Ab1', fifth: 'C2', stabs: ['Ab3', 'Eb4'] },
  Fm9: { root: 'F1', third: 'Ab1', fifth: 'C2', stabs: ['Ab3', 'G4'] },
  Gm7: { root: 'G1', third: 'Bb1', fifth: 'D2', stabs: ['Bb3', 'F4'] },
  C7: { root: 'C2', third: 'E2', fifth: 'G2', stabs: ['E4', 'Bb3'] },
  F7: { root: 'F1', third: 'A1', fifth: 'C2', stabs: ['A3', 'Eb4'] },
  'Abmaj7/Bb': { root: 'Bb1', third: 'Eb2', fifth: 'F2', stabs: ['C4', 'G4'] }
};

/** The machine, sixteenths with accents: kick on one and three, snare on two and four, hats between. */
const METRO_BEAT = drums('KhHhShHhKhKhShHh', 0.25);
/** The last bar of the turnaround, a snare run back to the riff. */
const METRO_FILL = drums('KhHhShHhSShhSSSh', 0.25);

/**
 * A metropolis section: one chord a bar, the keys on the offbeats of every
 * beat, and the bass in a 3+3+2 sixteenth figure (root, root, fifth, root,
 * third, fifth). `fill` ends the section on the snare run.
 */
function metropolis(chords: string[], lead: Note[], fill = false): Section {
  const bars = chords.map(name => METRO_CHORDS[name]);
  return [
    lead,
    bars.flatMap(({ stabs: [x, y] }) => [x, y, x, y].flatMap((tone, i) => [r(0.5), n(tone, 0.5, i === 0 ? 0.75 : 0.6)])),
    bars.flatMap(({ root, third, fifth }) => [
      n(root, 0.75, 0.9),
      n(root, 0.75, 0.7),
      n(fifth, 0.5, 0.7),
      n(root, 0.75, 0.85),
      n(third, 0.75, 0.65),
      n(fifth, 0.5, 0.7)
    ]),
    chords.flatMap((_, bar) => (fill && bar === chords.length - 1 ? METRO_FILL : METRO_BEAT))
  ];
}

const METRO_RIFF = metropolis(
  ['Ebmaj7', 'Ebmaj7', 'Abmaj7', 'Abmaj7'],
  // The machine idles for three bars; the mallet picks up in the fourth.
  [r(12), r(2), n('Bb4', 0.5, 0.7), n('Eb5', 0.5, 0.75), n('F5', 0.5, 0.8), n('G5', 0.5, 0.85)]
);

const METRO_VERSE = metropolis(
  ['Ebmaj7', 'Cm7', 'Abmaj7', 'Bb7sus', 'Ebmaj7', 'Cm7', 'Fm7', 'Bb7sus'],
  [
    // 1-2 the hook: a Bb, a turn, and a G pushed over the third beat
    n('Bb5', 1.5, 0.95),
    n('G5', 0.5, 0.75),
    n('F5', 0.5, 0.75),
    n('G5', 1.5, 0.85),
    n('Eb5', 0.5, 0.75),
    n('G5', 0.5, 0.8),
    n('Bb5', 1, 0.9),
    n('C6', 0.5, 0.85),
    n('Bb5', 0.5, 0.8),
    n('G5', 1, 0.8),
    // 3-4 the same shape from C, over Abmaj7, to the suspension
    n('C6', 1.5, 0.95),
    n('Bb5', 0.5, 0.75),
    n('Ab5', 0.5, 0.75),
    n('G5', 1.5, 0.85),
    n('F5', 1, 0.8),
    n('Eb5', 0.5, 0.7),
    n('F5', 0.5, 0.75),
    n('Ab5', 2, 0.85),
    // 5-6 the hook, climbing to Eb6
    n('Bb5', 1.5, 0.95),
    n('G5', 0.5, 0.75),
    n('F5', 0.5, 0.75),
    n('G5', 1.5, 0.85),
    n('Eb6', 1, 1),
    n('D6', 0.5, 0.85),
    n('C6', 0.5, 0.8),
    n('Bb5', 2, 0.85),
    // 7-8 stepping down through Fm7, held open on the suspension
    n('Ab5', 1, 0.85),
    n('G5', 0.5, 0.75),
    n('F5', 0.5, 0.75),
    n('Eb5', 1, 0.75),
    n('F5', 1, 0.8),
    n('F5', 2.5, 0.8),
    r(1.5)
  ]
);

const METRO_MIDDLE = metropolis(
  ['Abmaj7', 'Abm6', 'Gm7', 'C7', 'Fm9', 'Fm9', 'Abmaj7/Bb', 'Bb7sus'],
  [
    // 1-2 long notes over the machine, through the borrowed Abm6's B
    n('C6', 2, 0.95),
    n('Bb5', 1, 0.8),
    n('G5', 1, 0.75),
    n('B5', 2, 0.9),
    n('Ab5', 1, 0.8),
    n('F5', 1, 0.75),
    // 3-4 Gm7 to C7, the secondary dominant, a C6 pushed over the third beat
    n('G5', 1.5, 0.85),
    n('F5', 0.5, 0.7),
    n('D5', 1, 0.75),
    n('F5', 1, 0.75),
    n('E5', 0.5, 0.75),
    n('G5', 0.5, 0.8),
    n('Bb5', 1.5, 0.9),
    n('C6', 1.5, 0.95),
    // 5-6 Fm9, an Ab held through the half bar and a fall to C
    n('Ab5', 2.5, 0.9),
    n('G5', 1.5, 0.8),
    n('F5', 1, 0.8),
    n('Eb5', 1, 0.75),
    n('C5', 2, 0.75),
    // 7-8 a run up into the suspension
    r(0.5),
    n('Eb5', 0.5, 0.75),
    n('G5', 0.5, 0.8),
    n('Bb5', 0.5, 0.85),
    n('C6', 2, 0.95),
    n('Bb5', 1, 0.85),
    n('Ab5', 1, 0.8),
    n('F5', 2, 0.8)
  ]
);

const METRO_TURNAROUND = metropolis(
  ['Cm7', 'F7', 'Abmaj7/Bb', 'Bb7sus'],
  [
    n('G5', 0.5, 0.8),
    n('Bb5', 0.5, 0.85),
    n('C6', 0.5, 0.9),
    n('Eb6', 1.5, 1),
    n('D6', 1, 0.85),
    n('C6', 1, 0.85),
    n('A5', 0.5, 0.8),
    n('F5', 0.5, 0.75),
    n('Eb5', 2, 0.8),
    n('G5', 1.5, 0.85),
    n('Ab5', 0.5, 0.8),
    n('Bb5', 1, 0.85),
    n('C6', 1, 0.9),
    n('Bb5', 2, 0.85),
    r(2)
  ],
  true
);

// --- beginnings and endings (#417), in 3/4 (#438) ---------------------------

/**
 * A phrase that frames a city, in 3/4: the bass's oom held through every
 * downbeat and the keys' pah-pah on two and three, under the mallet. SimCity
 * opens on a waltz before its tier tracks settle into common time, so the
 * founding and both endings waltz while every tier piece stays in 4/4. The
 * form's `beatsPerBar`, the grid a move to another piece lands on, is the
 * tiers' 4: the endings are stingers, which no grid touches, and a move asked
 * for during the founding would cut it on beat 4, but every city is founded
 * at population zero, which has to be zoned, powered and grown to the town's
 * floor before any move is asked for, and the flourish lasts four seconds.
 */
function waltz(lead: Note[], bars: { root: string; pah: [string, string] }[], perc?: Note[]): Section {
  return [
    lead,
    bars.flatMap(({ pah: [two, three] }) => [r(1), n(two, 1, 0.6), n(three, 1, 0.55)]),
    bars.flatMap(({ root }) => [n(root, 3, 0.9)]),
    perc ?? [r(bars.length * 3)]
  ];
}

/**
 * Every city is founded on a two-bar waltz flourish at the village's tempo:
 * the mallet runs up Fmaj7, holds its A over the third beat, and answers
 * itself over the suspension, landing on the D a step above the statement's
 * first C, so the hook follows on as the next phrase rather than as a second
 * start.
 */
const FOUNDING = waltz(
  [
    n('C5', 0.5, 0.7),
    n('F5', 0.5, 0.75),
    n('A5', 1.5, 0.9),
    n('C6', 0.5, 0.85),
    n('Bb5', 1, 0.85),
    n('G5', 1, 0.75),
    n('D5', 1, 0.7)
  ],
  [
    { root: 'F2', pah: ['A3', 'E4'] },
    { root: 'C2', pah: ['F4', 'Bb3'] }
  ]
);

/**
 * A bankrupt city: the mallet falls through Oka's borrowed Bbm6 and comes to
 * rest on a bare F with the keys' major third under it, a sad close that is
 * still the gentle music of a builder's game rather than a failure buzzer.
 */
const BANKRUPT = waltz(
  [n('Db6', 1, 0.85), n('C6', 0.5, 0.75), n('Bb5', 0.5, 0.7), n('G5', 1, 0.7), n('F5', 2.5, 0.8), r(0.5)],
  [
    { root: 'Bb1', pah: ['Db4', 'G4'] },
    { root: 'F1', pah: ['A3', 'C4'] }
  ]
);

/**
 * A retired city, solvent and thriving: the founding's climb again over C7,
 * then the full close home to Fmaj7, the mallet lifting to F6 above the
 * pieces' ceiling and a single soft kick under the arrival.
 */
const RETIRED = waltz(
  [n('C5', 0.5, 0.75), n('F5', 0.5, 0.8), n('A5', 0.5, 0.85), n('C6', 0.5, 0.9), n('Bb5', 1, 0.8), n('F6', 2, 1), r(1)],
  [
    { root: 'C2', pah: ['E4', 'Bb3'] },
    { root: 'F2', pah: ['A3', 'E4'] }
  ],
  [r(3), { freq: REST, beats: 1, drum: 'kick', gain: 0.6 }, r(2)]
);

// --- the city's tiers -----------------------------------------------------

/**
 * The population each tier starts at: the village from nothing, the town at
 * the second milestone, the metropolis at the prestige one.
 */
export const TIER_FLOORS: readonly number[] = [0, POP_MILESTONES[1], POP_MILESTONES[METROPOLIS_INDEX]];

/**
 * A tier is left only below this fraction of its floor, so a population that
 * hovers at a threshold, or a disaster that takes a block, does not flap the
 * music between pieces.
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

/** The piece each tier plays, for `setScene`: the village is the order (null), the others are scenes. */
export const TIER_SCENES: readonly (string | null)[] = [null, 'town', 'metropolis'];

// --- the score ------------------------------------------------------------

export const CITY_MUSIC: GameAudioOptions = {
  tempo: VILLAGE_TEMPO,
  volume: 0.12,
  tonic: p('F4'),
  echo: { time: 0.3, feedback: 0.35, mix: 0.25 },
  tracks: [
    // LEAD: the mallet, an FM bar tuned to its twelfth that rings and dies.
    {
      name: 'lead',
      wave: 'sine',
      fm: { ratio: 3, index: 2.2, indexDecay: 0.08 },
      adsr: { attack: 0.003, decay: 0.45, sustain: 0, release: 0.15 },
      filter: { cutoff: 3800, q: 0.7 },
      pan: 0.15,
      volume: 0.8
    },
    // KEYS: a soft sampled keyboard carrying the sevenths, a tier's cell at a time.
    {
      name: 'keys',
      wavetable: { harmonics: [1, 0.4, 0.2, 0.08, 0.05] },
      adsr: { attack: 0.01, decay: 0.6, sustain: 0.25, release: 0.35 },
      filter: { cutoff: 1600, q: 0.5 },
      pan: -0.3,
      volume: 0.45
    },
    // BASS: a round plucked bass whose filter opens on the attack.
    {
      name: 'bass',
      wavetable: { harmonics: [1, 0.6, 0.3, 0.15] },
      adsr: { attack: 0.005, decay: 0.3, sustain: 0.5, release: 0.1 },
      filter: { cutoff: 500, envAmount: 1.5, envDecay: 0.12 },
      volume: 0.7
    },
    // PERC: nothing in the village, a kick and hats in the town, a machine in the metropolis.
    { name: 'perc', volume: 0.45 }
  ],
  form: {
    intro: FOUNDING,
    sections: {
      'village-statement': VILLAGE_STATEMENT,
      'village-answer': VILLAGE_ANSWER,
      'village-bridge': VILLAGE_BRIDGE,
      'town-verse': TOWN_VERSE,
      'town-middle': TOWN_MIDDLE,
      'town-turnaround': TOWN_TURNAROUND,
      'metro-riff': METRO_RIFF,
      'metro-verse': METRO_VERSE,
      'metro-middle': METRO_MIDDLE,
      'metro-turnaround': METRO_TURNAROUND
    },
    order: ['village-statement', 'village-answer', 'village-bridge'],
    // Two passes (137 s), then 64 beats (46 s) of nothing.
    rest: { after: 2, beats: 64 },
    scenes: {
      // Two passes (129 s), then 64 beats (37 s).
      town: {
        order: ['town-verse', 'town-middle', 'town-verse', 'town-turnaround'],
        tempo: TOWN_TEMPO,
        rest: { after: 2, beats: 64 }
      },
      // Two passes (124 s), then 48 beats (23 s): the busier the city, the shorter the quiet.
      metropolis: {
        order: ['metro-riff', 'metro-verse', 'metro-middle', 'metro-verse', 'metro-turnaround'],
        tempo: METROPOLIS_TEMPO,
        rest: { after: 2, beats: 48 }
      }
    }
  },
  stingers: {
    // A new fire: the mallet alarms between C and Ab over the borrowed Fm's colour, a low Db under it.
    fire: [
      [n('C6', 0.25), n('Ab5', 0.25), n('C6', 0.25), n('Ab5', 0.25), n('C6', 0.25), n('Ab5', 0.25), n('G5', 1.5, 0.8)],
      [n('F4', 1.5), n('Ab4', 1.5, 0.8)],
      [n('Db2', 3)],
      []
    ],
    // A tornado or a quake: a mallet cascade down into F minor, with a kick under the landing.
    disaster: [
      [n('Eb6', 0.25), n('C6', 0.25), n('Ab5', 0.25), n('F5', 0.25), n('Eb5', 0.25), n('C5', 0.25), n('Ab4', 1.5, 0.8)],
      [r(1.5), n('Ab3', 1.5)],
      [r(1.5), n('F1', 1.5)],
      [r(1.5), { freq: REST, beats: 1.5, drum: 'kick', gain: 0.8 }]
    ],
    // Into the red: the line sags a semitone at a time over Bb.
    red: [[n('E5', 1), n('Eb5', 1), n('D5', 2, 0.8)], [n('Db4', 2), n('Bb3', 2)], [n('Bb1', 4)], []],
    // The two ways a run ends, by `gameOver`'s reason, played through `playEnding`.
    bankrupt: BANKRUPT,
    retired: RETIRED
  }
};
