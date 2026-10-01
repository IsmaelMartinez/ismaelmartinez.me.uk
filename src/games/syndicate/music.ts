/**
 * Syndicate's score: a neon arpeggiator under a brass theme, in E with the
 * Phrygian F, for a city that is always raining.
 *
 * The brief (round 3, rescored after the owner's audition of #436, where the
 * round 13 score of a drone, a sparse lead and stray blips was "not that
 * great"). What the sources did:
 *
 * - Syndicate (1993, Bullfrog) was scored by Russell Shaw as Protracker
 *   modules, four Amiga channels, and the press read the game through Blade
 *   Runner and Neuromancer ("Think Blade Runner. Think Robocop."). Its music is
 *   remembered as atmosphere first: dark, cold, pulsing rather than tuneful.
 * - Syndicate Wars (1996, Shaw and Adrian Moore) went further into ambient:
 *   "ominous synths, strange high-pitched wailing and oriental sounding
 *   instruments", three CD tracks of about ten minutes, each looping for a
 *   whole level, and one of them quoting a motif from the 1993 game.
 * - Blade Runner (1982, Vangelis): the Yamaha CS-80's brass is two sawtooths
 *   through an enveloped low-pass with a slow attack and long release, drowned
 *   in a Lexicon 224's hall, and the End Titles drive on the CS-80's own
 *   arpeggiator under a soaring brass lead. Percussion is minimal. The main
 *   theme sits in E; "Blush Response" moves to D Phrygian.
 *
 * So: one key centre, E, minor with the Phrygian flat second (F) as the dread
 * chord; a sixteenth-note arpeggiator through a resonant low-pass as the pulse
 * that keeps a tactics player moving; a detuned sawtooth brass that swells into
 * a theme a player can hum; a string pad; a high sine wail after Syndicate
 * Wars; and a sparse kit, a heartbeat kick and a backbeat only when the theme
 * climbs. A long echo at three quarters of a beat stands in for the hall.
 *
 * Sources: https://en.wikipedia.org/wiki/Syndicate_(1993_video_game);
 * https://www.exotica.org.uk/wiki/Syndicate_(game) (Protracker modules);
 * https://www.choicestgames.com/2017/12/choicest-vgm-vgm-310-syndicate-wars.html;
 * https://en.wikipedia.org/wiki/Syndicate_Wars;
 * https://alijamieson.co.uk/2021/12/14/replicating-blade-runner-soundtrack/;
 * https://reverbmachine.com/blog/vangelis-blade-runner-synth-sounds/. No
 * melody is taken from any of them: only the key, the mode, the textures and
 * the pacing.
 *
 * Form. A once-only intro of four bars, the arpeggiator fading in under the
 * brass's first swell, then a 24-bar pass at 92 bpm (62.6 s): `a` states the
 * theme over the heartbeat, `b` climbs with it over a backbeat, and `c` is the
 * breakdown, pad and wail with the brass in fragments, until a snare roll hands
 * back to the top through B7, so the seam never lands home. The music runs
 * through the debriefs, so a mission's extraction is a stinger over it and only
 * the campaign's end, either way, is an ending.
 *
 * The cabinet is parked (see CLAUDE.md), so this is not currently reachable in
 * the arcade. It is kept in step with the rest so a revival is a page rename
 * and nothing else.
 */
import { p, REST, type DrumName, type GameAudioOptions, type MusicProfile, type Note } from '../engine';

/** Parked and unrouted, so it has no measured session; held to the standard floor and every style gate. */
export const MUSIC_PROFILE: MusicProfile = {
  session: 'standard'
};

export const BASE_TEMPO = 92;

const n = (name: string, beats: number, gain?: number): Note => ({ freq: p(name), beats, gain });
const r = (beats: number): Note => ({ freq: REST, beats });
const d = (drum: DrumName, beats: number, gain?: number): Note => ({ freq: REST, beats, drum, gain });
/** A note that scoops into its pitch from another, the CS-80 ribbon and the Syndicate Wars wail. */
const glide = (from: string, to: string, beats: number, gain?: number): Note => ({ ...n(to, beats, gain), slideFrom: p(from) });

/** A chord as the bass root, the four arpeggiated tones and the pad's colour tone. */
interface Chord {
  bass: string;
  arp: [string, string, string, string];
  pad: string;
}

const CHORDS: Record<string, Chord> = {
  Em: { bass: 'E2', arp: ['E3', 'B3', 'E4', 'G4'], pad: 'G3' },
  F: { bass: 'F2', arp: ['F3', 'C4', 'E4', 'A4'], pad: 'A3' },
  C: { bass: 'C2', arp: ['C3', 'G3', 'B3', 'E4'], pad: 'B3' },
  Am: { bass: 'A1', arp: ['A2', 'E3', 'A3', 'C4'], pad: 'C4' },
  G: { bass: 'G1', arp: ['G2', 'D3', 'G3', 'B3'], pad: 'B3' },
  Bsus: { bass: 'B1', arp: ['B2', 'F#3', 'B3', 'E4'], pad: 'E4' },
  B7: { bass: 'B1', arp: ['B2', 'F#3', 'A3', 'D#4'], pad: 'D#4' },
  E: { bass: 'E2', arp: ['E3', 'B3', 'E4', 'G#4'], pad: 'G#3' },
  A: { bass: 'A1', arp: ['A2', 'E3', 'A3', 'C#4'], pad: 'C#4' }
};

const chords = (spec: string): Chord[] => spec.trim().split(/\s+/).map(name => CHORDS[name]);

/** The arpeggiator's sixteenth-note order over a chord's four tones, up and back. */
const ARP_ORDER = [0, 1, 2, 3, 2, 1, 2, 3, 0, 1, 2, 3, 2, 3, 1, 2];

/** One bar of the arpeggiator at `level`, the beat's first step accented. */
const arpBar = (chord: Chord, level: number): Note[] =>
  ARP_ORDER.map((tone, step) => n(chord.arp[tone], 0.25, level * (step % 4 === 0 ? 1 : 0.6)));

const arp = (cs: Chord[], level: number): Note[] => cs.flatMap(c => arpBar(c, level));

/** The bass pushes: a dotted root, a pickup, the root again and its octave. */
function bassPulse(chord: Chord): Note[] {
  const root = p(chord.bass);
  return [
    { freq: root, beats: 1.5, gain: 1 },
    { freq: root, beats: 0.5, gain: 0.7 },
    { freq: root, beats: 1, gain: 0.85 },
    { freq: root * 2, beats: 1, gain: 0.6 }
  ];
}

/** The breakdown's bass: one root on the downbeat, left to ring. */
const bassHeart = (chord: Chord): Note[] => [n(chord.bass, 1, 0.9), r(3)];

const pad = (cs: Chord[], gain = 0.8): Note[] => cs.map(c => n(c.pad, 4, gain));

/** Bar of kit under `a`: a kick on the downbeat and a syncopated heartbeat on the and of three. */
const KIT_HEART: Note[] = [d('kick', 1), d('hat', 0.5, 0.35), d('hat', 0.5, 0.25), r(0.5), d('kick', 0.5, 0.8), d('hat', 1, 0.35)];
/** Bar of kit under `b`: the heartbeat with a backbeat on two and four. */
const KIT_BACKBEAT: Note[] = [d('kick', 1), d('snare', 1, 0.6), d('hat', 0.5, 0.35), d('kick', 0.5, 0.8), d('snare', 1, 0.6)];
/** The breakdown's kit: one distant kick a bar. */
const KIT_DISTANT: Note[] = [d('kick', 4, 0.7)];
/** A bar's snare roll back to the top, the kick on the downbeat. */
const KIT_ROLL: Note[] = [
  d('kick', 1, 0.8),
  ...[0.3, 0.4, 0.5, 0.6].map(g => d('snare', 0.5, g)),
  ...[0.7, 0.8].map(g => d('snare', 0.5, g))
];

const kit = (bar: Note[], count: number): Note[] => Array.from({ length: count }, () => bar).flat();

const A_CHORDS = chords('Em Em F Em C Am F B7');
const B_CHORDS = chords('Am F C G Am F Bsus B7');
const C_CHORDS = chords('Em F Em F C F Bsus B7');

/** The theme: a rising minor triad that pushes over the half bar, then the Phrygian sigh and the cold D sharp. */
const A_LEAD: Note[] = [
  n('E4', 1, 0.8), n('G4', 0.5, 0.75), n('B4', 2.5, 0.9),
  n('A4', 1, 0.75), n('G4', 1, 0.7), n('F#4', 2, 0.75),
  n('C5', 3, 0.9), n('B4', 0.5, 0.7), n('A4', 0.5, 0.7),
  n('B4', 4, 0.8),
  n('E5', 1.5, 0.9), n('D5', 0.5, 0.75), n('C5', 1, 0.8), n('B4', 1, 0.75),
  n('C5', 2, 0.8), n('E5', 2, 0.85),
  n('A5', 2, 0.95), n('G5', 0.5, 0.75), n('F5', 1.5, 0.85),
  n('D#5', 3, 0.9), r(1)
];

/** The climb: the theme an octave up in its answer, peaking on C6 over the F. */
const B_LEAD: Note[] = [
  r(1), n('E5', 1, 0.8), n('A5', 2, 0.9),
  n('G5', 1.5, 0.85), n('F5', 0.5, 0.75), n('E5', 2, 0.8),
  n('E5', 1, 0.8), n('D5', 0.5, 0.75), n('C5', 2.5, 0.85),
  n('D5', 4, 0.8),
  n('C5', 1, 0.8), n('E5', 1, 0.85), n('A5', 1.5, 0.9), n('B5', 0.5, 0.8),
  n('C6', 3, 1), n('B5', 1, 0.85),
  n('A5', 2, 0.85), n('E5', 2, 0.8),
  n('D#5', 2, 0.9), n('F#5', 1, 0.8), r(1)
];

/** The breakdown: the brass in fragments over the pad, the F held across the beat. */
const C_LEAD: Note[] = [
  r(4),
  r(2.5), n('F5', 1.5, 0.75),
  n('E5', 4, 0.7),
  r(4),
  n('G4', 1.5, 0.7), n('B4', 2.5, 0.75),
  n('A4', 4, 0.75),
  r(2), n('E5', 2, 0.75),
  n('D#5', 4, 0.7)
];

export const SYNDICATE_MUSIC: GameAudioOptions = {
  tempo: BASE_TEMPO,
  volume: 0.1,
  tonic: p('E3'),
  // Three quarters of a beat at 92 bpm, long and wet: the hall Vangelis had.
  echo: { time: 0.49, feedback: 0.42, mix: 0.3 },
  tracks: [
    {
      // The CS-80 brass: two detuned sawtooths whose low-pass opens as the note swells.
      name: 'lead',
      wave: 'sawtooth',
      detune: 12,
      vibrato: 10,
      volume: 0.75,
      adsr: { attack: 0.12, decay: 0.5, sustain: 0.7, release: 0.9 },
      filter: { cutoff: 2200, q: 2, envAmount: -1.5, envDecay: 0.35 }
    },
    {
      // The arpeggiator: a resonant sawtooth pluck, sixteenths, left of centre.
      name: 'arp',
      wave: 'sawtooth',
      volume: 0.4,
      pan: -0.5,
      filter: { cutoff: 1100, q: 8, envAmount: 1.5, envDecay: 0.09 }
    },
    {
      // A sub bass with a growl on the attack: an FM sine whose index falls fast.
      name: 'bass',
      wave: 'sine',
      volume: 0.9,
      fm: { ratio: 1, index: 2, indexDecay: 0.2 }
    },
    {
      // The string pad, one colour tone a bar, right of centre.
      name: 'pad',
      wave: 'sawtooth',
      envelope: 'pad',
      detune: 9,
      volume: 0.35,
      pan: 0.45,
      filter: { cutoff: 900 }
    },
    {
      // The Syndicate Wars wail: a high sine sliding into its note, far right.
      name: 'wail',
      wave: 'sine',
      vibrato: 14,
      volume: 0.3,
      pan: 0.7,
      adsr: { attack: 1, decay: 0.5, sustain: 0.8, release: 1.2 }
    },
    { name: 'drums', volume: 0.55 }
  ],
  form: {
    intro: [
      [r(8), glide('E4', 'B4', 3, 0.8), n('C5', 1, 0.7), n('B4', 2, 0.7), r(2)],
      [...arpBar(CHORDS.Em, 0.25), ...arpBar(CHORDS.Em, 0.4), ...arpBar(CHORDS.F, 0.5), ...arpBar(CHORDS.Em, 0.6)],
      [r(8), n('F2', 4, 0.8), n('E2', 1.5, 0.9), r(2.5)],
      [n('G3', 8, 0.8), n('A3', 4, 0.8), n('G3', 4, 0.8)],
      [r(4), glide('E5', 'G5', 6, 0.45), r(6)],
      [r(12), d('kick', 1, 0.6), r(1), ...[0.3, 0.4, 0.5, 0.6].map(g => d('snare', 0.25, g)), d('snare', 0.5, 0.7), d('snare', 0.5, 0.8)]
    ],
    sections: {
      a: [A_LEAD, arp(A_CHORDS, 0.7), A_CHORDS.flatMap(bassPulse), pad(A_CHORDS), [r(32)], kit(KIT_HEART, 8)],
      b: [
        B_LEAD,
        arp(B_CHORDS, 0.75),
        B_CHORDS.flatMap(bassPulse),
        pad(B_CHORDS),
        [r(16), glide('E5', 'B5', 8, 0.5), r(8)],
        kit(KIT_BACKBEAT, 8)
      ],
      c: [
        C_LEAD,
        arp(C_CHORDS, 0.45),
        [...C_CHORDS.slice(0, 6).flatMap(bassHeart), ...C_CHORDS.slice(6).flatMap(bassPulse)],
        pad(C_CHORDS, 0.95),
        [r(4), glide('B5', 'E6', 8, 0.45), r(4), glide('F#5', 'D#6', 8, 0.45), r(8)],
        [...kit(KIT_DISTANT, 7), ...KIT_ROLL]
      ]
    },
    order: ['a', 'b', 'c']
  },
  stingers: {
    // A mission's extraction, over the running loop: the theme's head turned major.
    extracted: [
      [n('E5', 0.5, 0.8), n('B4', 0.5, 0.7), n('E5', 0.5, 0.85), n('G#5', 2.5, 0.9)],
      arpBar(CHORDS.E, 0.6),
      [n('E2', 1, 0.9), r(3)],
      [n('G#3', 4, 0.8)],
      [r(4)],
      [d('kick', 1, 0.7), r(3)]
    ],
    // The campaign won: the theme's push in E major, through A, home on E.
    victory: [
      [
        n('B4', 1, 0.8), n('E5', 0.5, 0.85), n('G#5', 2.5, 0.9),
        n('A5', 2, 0.9), n('C#6', 1, 0.85), n('B5', 1, 0.8),
        n('G#5', 1, 0.8), n('E5', 3, 0.85)
      ],
      [...arpBar(CHORDS.E, 0.7), ...arpBar(CHORDS.A, 0.65), ...arpBar(CHORDS.E, 0.4)],
      [...bassPulse(CHORDS.E).slice(0, 3), n('B1', 1, 0.6), ...bassPulse(CHORDS.A).slice(0, 3), n('B1', 1, 0.6), n('E2', 4, 0.9)],
      [n('G#3', 4, 0.8), n('C#4', 4, 0.8), n('G#3', 4, 0.8)],
      [r(4), glide('E5', 'B5', 8, 0.4)],
      [...KIT_BACKBEAT, ...KIT_BACKBEAT, d('kick', 1), d('snare', 0.5, 0.9), r(2.5)]
    ],
    // The squad lost: the Phrygian cadence, F sinking onto a bare E minor.
    fallen: [
      [n('C5', 2, 0.85), n('B4', 1, 0.8), n('A4', 1, 0.75), n('A4', 1.5, 0.75), n('G4', 0.5, 0.7), n('F4', 2, 0.75), n('E4', 4, 0.7)],
      [...arpBar(CHORDS.F, 0.55), ...arpBar(CHORDS.F, 0.45), ...arpBar(CHORDS.Em, 0.3)],
      [n('F2', 4, 0.85), n('F2', 4, 0.8), n('E2', 4, 0.85)],
      [n('A3', 8, 0.8), n('G3', 4, 0.8)],
      [r(4), glide('B5', 'E5', 8, 0.4)],
      [d('kick', 4, 0.8), d('kick', 4, 0.6), d('kick', 1, 0.7), r(3)]
    ]
  }
};
