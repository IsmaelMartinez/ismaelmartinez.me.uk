/**
 * Pixel Park's score: a carousel waltz in G major, 3/4, played by a band organ
 * heard from across the park rather than from beside the ride.
 *
 * The brief (round 3, #402, rescored after the owner's audition: the old score
 * was "far too punchy"). Drawn from the park sims and the instrument they
 * borrowed:
 *
 * - Theme Park (Bullfrog, 1994) was scored by Russell Shaw for the MT-32,
 *   General MIDI and AdLib, one cue per ride (Merry-Go-Round, Bouncy Castle,
 *   Ghost House and the rest) beside arrangements of Fučík, Rosas and Chopin.
 *   Rosas is the waltz composer, which is the fairground's own repertoire.
 *   https://www.vgmpf.com/Wiki/index.php/Theme_Park_(DOS)
 * - RollerCoaster Tycoon's Merry-Go-Round plays band organ recordings, The
 *   Blue Danube and Tales from the Vienna Woods among them, made in 1976 from
 *   the Voigt Model 35 at Bressingham Steam Museum, with Allister Brimble
 *   writing the rest of the soundtrack (second-hand, from the RCT wiki's ride
 *   page as quoted in search results; the page itself would not load).
 *   https://rct.fandom.com/wiki/Merry-Go-Round,
 *   https://en.wikipedia.org/wiki/Allister_Brimble
 * - The Wurlitzer 153, the commonest American carousel organ, carries flute,
 *   violin and stopped-diapason ranks over a three-note bass of wood trombones
 *   and diapasons, plays "traditional marches and waltzes", and sits most
 *   comfortably in C and G. Its larger sibling the 157 adds piccolos and bells.
 *   https://www.mechanicalmusic.org/post/wurlitzer-153-band-organs,
 *   https://www.bandorganmusic.com/COMETOTHEFAIR.htm
 * - A fairground organ is built to be "loud enough to be heard above the
 *   noises of crowds and fairground machinery".
 *   https://en.wikipedia.org/wiki/Fairground_organ
 *
 * That last point is why this score does not imitate the organ at close
 * range. Pixel Park is a management sim played for many minutes with the
 * player's attention on the map, so the music is the carousel drifting over
 * from the far side of the park: the waltz, the oom-pah-pah and the flute
 * ranks, with the brass, the drums and the bite taken off by distance. No
 * melody is taken from any of the sources; the tunes below are original.
 *
 * What made the old score punchy, measured through `renderScore`: a detuned
 * square lead with a 10 ms pluck attack, up between G5 and E6, carried almost
 * the whole mix (alone it rendered at -15.1 dBFS peak and -30.5 dBFS RMS
 * against the full mix's -12.4 and -30.0) and its weak beats sat at 0.8 of its
 * accents; the plucked triangle bass had a 20 dB crest; and at 156 bpm with a
 * 0.25 feedback echo every attack came round again. The full mix's crest was
 * 17.6 dB, the highest peak on the floor bar Cascade. Rescored, a pass renders
 * at -20.0 dBFS peak, -33.5 RMS and a 13.6 dB crest, in the middle of the
 * live cabinets (-17 to -23 peak, -30 to -38 RMS).
 *
 * Palette, three pitched voices and no percussion:
 *
 * - `lead`, the flute ranks: a triangle under a gentle low-pass, a 40 ms
 *   attack that swells rather than strikes, and a slight detuned twin for the
 *   beating of two ranks a few cents apart. An octave below the old tune, G4
 *   to E5, weak beats ducked to about 0.55 of the downbeat.
 * - `bass`, the wood basses and the accompaniment: oom on the root, then two
 *   short pahs on the chord's third and fifth, ducked to 0.4, a filtered
 *   triangle with a soft attack instead of the old pluck.
 * - `bed`, a sine pad holding the chord's third or fifth in the tenor, the
 *   organ's sustained accompaniment pipes.
 *
 * The echo is a short, light send (0.12 feedback, 0.1 mix): the room, not a
 * repeat. There are no drums, though a band organ has them: percussion is the
 * sound of motion (ADR 003's round 2 amendment), and the park is the calm end
 * of the arcade.
 *
 * Form, at 126 bpm: a two-bar vamp intro, the bass and bed alone with the
 * flute's pickup into the tune, then two sixteen-bar strains, A in G and B
 * turning to C with a borrowed C minor before it comes home. 96 beats, 45.7 s
 * a pass. The pass ends on D with the tune on A, a half cadence back to the
 * top.
 *
 * Gates. All three stay on. The lead carries a lilt (crotchet, quaver, a
 * dotted crotchet held over the third beat) or a suspension tied over the bar
 * line in every eight bars, uses many bar rhythms, and the bass never arrives
 * on G at the seam.
 *
 * Ending (`ENDINGS.closed`, through `playEnding`): the park closes, three bars
 * of a plagal close through C and the borrowed C minor, the tune settling on
 * G as the organ winds down.
 *
 * The cabinet is parked (see CLAUDE.md), so this is not currently reachable in
 * the arcade. It is kept in step with the rest so a revival is a page rename
 * and nothing else.
 */
import { p, REST, type GameAudioOptions, type MusicProfile, type Note } from '../engine';

/** The score's tempo; the park never ramps it. */
export const BASE_TEMPO = 126;

/**
 * Parked and unrouted, so it has no measured session. Held to the standard
 * floor rather than exempted, so a revival (#381) brings a score that meets
 * the live floor's default bar.
 */
export const MUSIC_PROFILE: MusicProfile = {
  session: 'standard'
};

/** The endings' stinger names, for `game.ts`'s `playEnding`. */
export const ENDINGS = {
  /** The park goes bankrupt and closes its gates. */
  closed: 'closed'
} as const;

/** A downbeat's level in the lead, and a weak beat's or an off-beat's under it. */
export const LEAD_DOWNBEAT = 0.9;
export const LEAD_WEAK = 0.55;

/**
 * A line written as `NOTE:BEATS` tokens in 3/4 (`r` a rest): a downbeat at
 * `LEAD_DOWNBEAT` and everything else at `LEAD_WEAK`, which is the waltz's
 * lilt. A note tied over the bar line keeps the level of the beat it starts on.
 */
function line(spec: string): Note[] {
  let at = 0;
  return spec
    .trim()
    .split(/\s+/)
    .map(token => {
      const [name, beats] = token.split(':');
      const length = Number(beats);
      const downbeat = at % 3 < 1e-6;
      at += length;
      if (name === 'r') return { freq: REST, beats: length };
      return { freq: p(name), beats: length, gain: downbeat ? LEAD_DOWNBEAT : LEAD_WEAK };
    });
}

/** The pahs' level against the oom. */
const PAH = 0.4;

/**
 * Oom-pah-pah, one bar per chord written as `root/third/fifth` names: the
 * root on the downbeat, then the third and the fifth as short pahs with a
 * breath after each, the band organ's staccato accompaniment.
 */
function waltzBass(spec: string): Note[] {
  return spec
    .trim()
    .split(/\s+/)
    .flatMap(chord => {
      const [root, third, fifth] = chord.split('/');
      return [
        { freq: p(root), beats: 1, gain: 0.85 },
        { freq: p(third), beats: 0.5, gain: PAH },
        { freq: REST, beats: 0.5 },
        { freq: p(fifth), beats: 0.5, gain: PAH },
        { freq: REST, beats: 0.5 }
      ];
    });
}

/** The bed: one held note a bar, written as names. */
function bed(spec: string): Note[] {
  return spec
    .trim()
    .split(/\s+/)
    .map(name => ({ freq: p(name), beats: 3, gain: 0.8 }));
}

// --- the A strain: G major --------------------------------------------------

const A_LEAD = line(`
  G4:1 B4:1 D5:1   E5:1 D5:0.5 B4:1.5   A4:2 C5:1   F#4:1 A4:1 C5:1
  D5:1 C5:1 A4:1   F#4:1 A4:0.5 D5:1.5   B4:2 A4:1   G4:2 r:1
  E4:1 G4:1 C5:1   E5:1 D5:0.5 C5:1.5   B4:1 D5:2   E5:2 B4:1
  A4:1 C#5:0.5 E5:1.5   G4:1 A4:1 C#5:1   D5:2 C5:1   A4:1 F#4:1 A4:1
`);
const A_BASS = waltzBass(`
  G2/B3/D4 G2/B3/D4 D2/F#3/C4 D2/F#3/C4
  D2/F#3/A3 D2/F#3/C4 G2/B3/D4 G2/B3/D4
  C3/E3/G3 C3/E3/G3 G2/B3/D4 E2/G3/B3
  A2/C#3/E3 A2/C#3/G3 D2/F#3/A3 D2/F#3/C4
`);
const A_BED = bed(`
  B3 D4 C4 C4   A3 C4 B3 D4
  E4 G3 B3 G3   C#4 E4 F#3 A3
`);

// --- the B strain: to C, a borrowed C minor, and back to D -----------------

const B_LEAD = line(`
  G4:1 C5:1 E5:1   D5:1 E5:0.5 C5:1.5   B4:1 D5:1 G4:1   A4:1 G4:1 B4:2
  C5:1 A4:1   F#4:1 A4:0.5 D5:1.5   D5:1 B4:1 G4:1   E4:2 G4:1
  E5:1 D5:1 C5:1   Eb5:2 C5:1   B4:1 D5:0.5 G4:1.5   G#4:1 B4:1 D5:1
  C5:2 A4:1   F#4:1 A4:1 C5:1   B4:1 A4:0.5 G4:1.5   A4:2 F#4:1
`);
const B_BASS = waltzBass(`
  C3/E3/G3 C3/E3/G3 G2/B3/D4 G2/B3/D4
  A2/C3/E3 D2/F#3/A3 G2/B3/D4 E2/G3/B3
  C3/E3/G3 C3/Eb3/G3 G2/B3/D4 E2/G#3/D4
  A2/C3/E3 D2/F#3/C4 G2/B3/D4 D2/F#3/A3
`);
const B_BED = bed(`
  E4 G3 B3 D4   C4 F#3 B3 G3
  E4 Eb4 D4 G#3   C4 C4 B3 F#3
`);

// --- the intro and the ending ------------------------------------------------

/** Two bars of the vamp on G, the bed on the third, the flute's D picking up into the tune. */
const INTRO: Note[][] = [
  [{ freq: REST, beats: 5 }, { freq: p('D4'), beats: 1, gain: LEAD_WEAK }],
  waltzBass('G2/B3/D4 G2/B3/D4'),
  bed('B3 B3')
];

/**
 * The park closes: a plagal close through C and the borrowed C minor, the
 * tune falling to G and holding it while the bass and the bed settle under it.
 */
const CLOSED: Note[][] = [
  [...line('E5:1 D5:1 C5:1   Eb5:2 D5:1'), { freq: p('G4'), beats: 3, gain: 0.75 }],
  [...waltzBass('C3/E3/G3 C3/Eb3/G3'), { freq: p('G2'), beats: 3, gain: 0.7 }],
  bed('E4 Eb4 D4')
];

export const PARK_MUSIC: GameAudioOptions = {
  tempo: BASE_TEMPO,
  volume: 0.075,
  tonic: p('G3'),
  echo: { time: 0.24, feedback: 0.12, mix: 0.1 },
  tracks: [
    // The flute ranks: a round triangle that swells in, two ranks beating a few cents apart.
    {
      name: 'lead',
      wave: 'triangle',
      detune: 4,
      filter: { cutoff: 2200, q: 0.5 },
      adsr: { attack: 0.04, decay: 0.3, sustain: 0.7, release: 0.2 },
      volume: 0.65
    },
    // The wood basses and the staccato accompaniment, filtered and soft-edged.
    {
      name: 'bass',
      wave: 'triangle',
      filter: { cutoff: 700, q: 0.5 },
      adsr: { attack: 0.02, decay: 0.25, sustain: 0.4, release: 0.1 },
      volume: 0.7
    },
    // The sustained accompaniment pipes.
    { name: 'bed', wave: 'sine', envelope: 'pad', volume: 0.45 }
  ],
  form: {
    beatsPerBar: 3,
    intro: INTRO,
    sections: {
      a: [A_LEAD, A_BASS, A_BED],
      b: [B_LEAD, B_BASS, B_BED]
    },
    order: ['a', 'b']
  },
  stingers: {
    [ENDINGS.closed]: CLOSED
  }
};
