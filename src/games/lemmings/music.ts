/**
 * Critter Rescue's scores: a tune per act, rotated as the player progresses,
 * played the way Amiga Lemmings played its music.
 *
 * The brief (round 3, #414; the plan's "What the originals sounded like" and
 * ADR 003's round 3 table): Lemmings (1991) scored its levels with ProTracker
 * modules by Brian Johnston and Tim Wright, on Paula's four 8-bit sample
 * channels, two hard left and two hard right, arranging public-domain classics
 * and nursery tunes in a bouncy music-hall manner over tracker drums, with a
 * dry mix. So every act here is those four channels and nothing else, and each
 * choice below names the trait it serves:
 *
 * - Four channels, hard-panned as Paula wired them (0 and 3 left, 1 and 2
 *   right): the lead and the drums at `pan: -1`, the bass and the chords at
 *   `pan: 1`. On headphones the tune and its accompaniment sit in opposite
 *   ears, which is the most recognisable thing about an Amiga module, and it
 *   is also what keeps a chord channel in the lead's register from masking it.
 * - Sampled-sounding voices: the lead, bass and chords are 32-step, 8-bit
 *   single-cycle wavetables (`harmonics` quantised with `bits: 8`, the
 *   ProTracker "chip" loop), with short ADSR shapes standing in for a sample's
 *   attack and volume slide, all through one fixed low-pass near 4.4 kHz
 *   (`PAULA_FILTER`) for the A500's output filter. Each act gets its own lead
 *   sample, as each module brought its own instruments.
 * - An arpeggiated chord channel instead of a sustained pad: one voice plays
 *   whole chords as tracker arpeggios (`Note.arp`, the 0xy effect, cycled at a
 *   PAL tick, `arpRate` 50), on the "pah" of an oom-pah.
 * - A light tracker kit (kick, a snappy snare, hats) on its own channel, a
 *   different groove per act, and cut-time or 2/4 oom-pah underneath.
 * - Dry: no echo send, and no vibrato or detuned twin, which a four-channel
 *   module could not spare a channel for.
 *
 * The acts move to the public-domain canon the original arranged (ADR 003's
 * round 3 default), one piece per act chosen for the act's mood. Each is its
 * own `GameAudioOptions`, played by its own audio instance, rather than a
 * scene of one form, because the acts differ in tempo, key (which the `tonic`
 * carries into the effects), lead sample, stingers and danger variant, and a
 * scene shares all of those. `game.ts` swaps the instance when play crosses
 * into a new act (`ACT_STARTS` in levels.ts) and otherwise leaves it running,
 * so a retry or the next level of the same act carries on where the music is.
 *
 * - Act I, teaching (levels 1-6): "London Bridge" (nursery, traditional),
 *   G major, 132 bpm. The simplest tune anyone knows, for the levels that
 *   teach; its answer bars get cheeky octave pops, and a trio in C major sits
 *   in the middle as a music-hall march has one.
 * - Act II, skill chains (7-13): Mozart's Rondo alla Turca (K. 331, 1783),
 *   A minor, 120 bpm. Running sixteenths in chains, for the levels that chain
 *   skills; the left hand is Mozart's own (a bass note, then three chord
 *   eighths), the kick is the janissary bass drum on every beat.
 * - Act III, rule twists (14-19): Pachelbel's Canon in D (c. 1700), D major,
 *   116 bpm. A ground that never changes while the part above it keeps
 *   changing the rules, for the act that twists them: the ground is taken at
 *   half notes, and the upper part runs through four of Pachelbel's own
 *   variations (halves, the suspensions, the eighths, the sixteenths, each at
 *   half speed) and one original jig.
 * - Act IV, endgame (20-25): Offenbach's Galop infernal (Orphée aux enfers,
 *   1858), the Can-Can, C major, 148 bpm. The fastest, loudest thing in the
 *   canon for the last act, with an original kick-line trio in F.
 *
 * Every arrangement is original; only the tunes are Offenbach's, Mozart's,
 * Pachelbel's and the nursery's. Form: sections of eight bars (four in the
 * Canon, the length of its ground), each carrying at least one pushed note
 * (a music-hall anticipation, or in the Canon a Baroque suspension), and
 * every pass handing back to the top from the dominant: Act I on D under a
 * first-inversion G, Act II on E, Act III on the ground's own G to A, Act IV on
 * G7. One pass: Act I 32 bars (58.2 s), Act II 24 (48.0 s), Act III 24
 * (49.7 s), Act IV 32 (51.9 s), none of which ramps. After every second pass
 * there are eight beats of rest.
 *
 * Session and load (ADR 003): a level runs 40 to 90 seconds and a whole run of
 * twenty-five levels can pass thirty minutes, so this is a long-session
 * cabinet (a 45 s floor), and the cognitive load is moderate: a puzzle played
 * against a slow crowd, where the music should be jaunty company rather than a
 * clock. All three style gates stay on: the pushes and suspensions above are
 * how each tune clears the syncopation gate without being bent out of shape.
 *
 * Beginnings and endings (#417): every act opens on an `intro`, the music
 * hall's "vamp till ready", two bars of its own accompaniment and kit on the
 * dominant with a pickup into the tune. An intro plays on every `start()` of
 * stopped music, which here is once per run and once per act: the score
 * carries on from one level to the next on purpose (#414), and an intro a
 * level would break into it every minute. A run then ends on one of three
 * phrases through `playEnding`, which stops the music once it has sounded:
 * `over` on a missed quota (the sad trombone), `victory` after the last level
 * (a four-bar big finish), and `curtain` when the player ends a good run from
 * a mid-run clear (a one-bar play-off, since banking a run is neither a
 * failure nor the whole game won).
 *
 * Adaptive hooks, all driven from `game.ts`:
 * - Act rotation: a new score, from its top, when play crosses into a new act.
 * - `setDanger`: Acts III and IV hold the only timed levels, and their scores
 *   carry a `danger` variant, which a timed level switches to for its last ten
 *   seconds (while its clock flashes red) and releases when the level ends.
 *   Each is its tune's own kind of hurry: the Canon at the harmonic rhythm
 *   Pachelbel wrote (a chord a beat, twice as fast as the act's) with its
 *   sixteenth-note variation at full speed, and the Can-Can faster over a
 *   galloping kick and snare.
 * - Stingers: `cleared` on a level cleared (a tracker "ta-da" with a snare
 *   roll), and `perfect` on one cleared with the perfect bonus ("shave and a
 *   haircut, two bits", 1899, public domain: the cheekiest ending there is),
 *   both on all four channels and in the act's key. Act II's are in A major,
 *   the key the Rondo's own coda turns to.
 * - `setPaused`: only when the `over` ending cannot play (the music muted), a
 *   failed level's result screen muffles the music rather than stopping it.
 */
import { p, REST, type GameAudioOptions, type MusicProfile, type Note, type Track } from '../engine';

/** A run is up to twenty-five levels, over thirty minutes, under these scores. */
export const MUSIC_PROFILE: MusicProfile = {
  session: 'long'
};

/** The kit's three instruments, by their tracker-pattern letters. */
const DRUMS: Record<string, Note['drum']> = { k: 'kick', s: 'snare', h: 'hat' };

/**
 * A line from a compact string: space-separated `name:beats` tokens, with `r`
 * for a rest, `k`, `s` and `h` for the kit, an optional `@gain`, and `|`
 * between bars for the reader. A bad name throws through `p()`, and so does a
 * length that is not positive, so `music.test.ts` catches either at import.
 */
function line(src: string): Note[] {
  return src
    .trim()
    .split(/\s+/)
    .filter(token => token !== '|')
    .map(token => {
      const [body, gain] = token.split('@');
      const [name, length] = body.split(':');
      const beats = Number(length);
      if (!(beats > 0)) throw new Error(`score: bad length in "${token}"`);
      const drum = DRUMS[name];
      const note: Note = drum ? { freq: REST, beats, drum } : { freq: name === 'r' ? REST : p(name), beats };
      if (gain !== undefined) note.gain = Number(gain);
      return note;
    });
}

/**
 * A drum channel for `bars` bars: the `groove` bar, with the `fill` bar in
 * place of every `every`-th, the way a tracker pattern ends its phrase.
 */
function kit(groove: string, fill: string, bars: number, every: number): Note[] {
  return Array.from({ length: bars }, (_, bar) => line((bar + 1) % every === 0 ? fill : groove)).flat();
}

/** A chord as the two accompanying channels need it. */
interface Chord {
  /** The bass note, between E2 and D#3 (a slash chord's bass, else its root). */
  bass: number;
  /** The fifth above the bass, or the fourth below when that would climb past E3. */
  fifth: number;
  /** The arpeggio's root, between F3 and E4, under the lead and panned away from it. */
  root: number;
  /** The tracker arpeggio's semitone offsets. */
  arp: number[];
}

const QUALITIES: Record<string, number[]> = { '': [0, 4, 7], m: [0, 3, 7], '7': [0, 4, 7, 10] };

/** A note name placed in the lowest octave at or above `floor`. */
function placed(name: string, floor: string): number {
  const lowest = p(floor) * (1 - 1e-9);
  let hz = p(`${name}1`);
  while (hz < lowest) hz *= 2;
  return hz;
}

/** A chord symbol: `G`, `Am`, `D7`, or a slash chord such as `G/B`. Throws on anything else. */
function chordOf(symbol: string): Chord {
  const m = /^([A-G][#b]?)(m|7)?(?:\/([A-G][#b]?))?$/.exec(symbol);
  if (!m) throw new Error(`score: bad chord "${symbol}"`);
  const [, root, quality = '', over = root] = m;
  const bass = placed(over, 'E2');
  const up = bass * Math.pow(2, 7 / 12);
  return {
    bass,
    fifth: up <= p('E3') * (1 + 1e-9) ? up : bass / Math.pow(2, 5 / 12),
    root: placed(root, 'F3'),
    arp: QUALITIES[quality]
  };
}

const tone = (freq: number, beats: number, gain?: number): Note => (gain === undefined ? { freq, beats } : { freq, beats, gain });
const rest = (beats: number): Note => ({ freq: REST, beats });
const stab = (c: Chord, beats: number, gain?: number): Note => ({ ...tone(c.root, beats, gain), arp: c.arp });

/**
 * How an act's bass and chord channels play one chord for `beats` beats;
 * `again` is true when the chord was already sounding, so the bass can move
 * to its fifth instead of restriking the root.
 */
type Comp = (c: Chord, beats: number, again: boolean) => [Note[], Note[]];

/**
 * The bass and chord channels from a chord chart: bars split by `|`, each one,
 * two or four chords, sharing the bar's four beats equally. A bar of one chord
 * is played as two halves of it.
 */
function comp(style: Comp, chart: string): [Note[], Note[]] {
  const bass: Note[] = [];
  const chords: Note[] = [];
  let previous = '';
  for (const bar of chart.split('|')) {
    let symbols = bar.trim().split(/\s+/);
    if (symbols.length === 1) symbols = [symbols[0], symbols[0]];
    if (![2, 4].includes(symbols.length)) throw new Error(`score: bad bar "${bar}"`);
    for (const symbol of symbols) {
      const [b, c] = style(chordOf(symbol), 4 / symbols.length, symbol === previous);
      bass.push(...b);
      chords.push(...c);
      previous = symbol;
    }
  }
  return [bass, chords];
}

/** A section: the lead, the bass and chords from a chart in an act's style, and the drums, in track order. */
function section(lead: string, style: Comp, chart: string, drums: Note[]): Note[][] {
  const [bass, chords] = comp(style, chart);
  return [line(lead), bass, chords, drums];
}

/** One act's tracker pattern: the groove bar, and the fill that ends a phrase. */
interface KitBars {
  groove: string;
  fill: string;
}

/**
 * An act's intro, the music hall's "vamp till ready": two bars of the act's
 * own accompaniment on its dominant seventh, the groove then the fill on the
 * kit, and the lead silent until a pickup up the chord in the second bar that
 * steps into the tune's first note. It never lands home, so the tune does.
 */
function vamp(style: Comp, dominant: string, pickup: string, drums: KitBars): Note[][] {
  return section(`r:4 | r:2 ${pickup}`, style, `${dominant} | ${dominant}`, line(`${drums.groove} ${drums.fill}`));
}

/** Moves every pitched note of a stinger by `semitones`, so one pair of stingers serves every key. */
function transpose(lines: Note[][], semitones: number): Note[][] {
  const ratio = Math.pow(2, semitones / 12);
  return lines.map(l => l.map(n => ({ ...n, freq: n.freq > 0 ? n.freq * ratio : n.freq })));
}

/**
 * The stingers, written in C major on all four channels and moved into each
 * act's key. Each lands on the tonic, which a stinger may do: the first two
 * play over the loop rather than closing it, and the other three are endings
 * (`playEnding`), which close the music for good.
 */
const STINGERS_IN_C: Record<string, Note[][]> = {
  // A tracker "ta-da": up the triad over a snare roll into one kick.
  cleared: [
    line('G5:.25 E5:.25 C5:.25 E5:.25 G5:.5 C6:1.5'),
    line('C3:.5 G2:.5 E2:.5 C2:1.5'),
    [rest(1), stab(chordOf('C'), 2)],
    line('s:.25@.6 s:.25@.7 s:.25@.8 s:.25 k:.5 r:1.5')
  ],
  // "Shave and a haircut, two bits", with the two bits on the snare.
  perfect: [
    line('C5:.5 G4:.25 G4:.25 A4:.5 G4:.5 r:.5 B4:.5 C5:1'),
    line('C3:.5 r:2 G2:.5 C2:1'),
    [stab(chordOf('C'), 1.5), rest(1), stab(chordOf('G7'), .5), stab(chordOf('C'), 1)],
    line('k:.5 r:2 s:.5 s:.5 k:.5')
  ],
  // The run is over (a quota missed): the music hall's sad trombone, a
  // chromatic fall in the lead and bass together onto the minor tonic.
  over: [
    line('E5:1 D#5:1 D5:1 C#5:1 | C5:2 r:2'),
    line('G2:1 F#2:1 F2:1 E2:1 | C2:2 r:2'),
    [rest(4), stab(chordOf('Cm'), 2), rest(2)],
    line('r:3 s:.25@.5 s:.25@.6 s:.5@.7 | k:1 r:3')
  ],
  // The whole game won: a music-hall big finish, up the tonic to C6, through
  // IV and V, three hits on the tonic and a held last chord over a snare roll.
  victory: [
    line('G4:.5 C5:.5 E5:.5 G5:.5 C6:1.5 G5:.5 | A5:.5 F5:.5 A5:.5 C6:.5 B5:1.5 G5:.5 | C6:1 r:.5 C6:.5 r:.5 C6:.5 r:1 | C6:3 r:1'),
    line('C3:1 G2:1 E2:1 G2:1 | F2:1 C3:1 G2:1 D3:1 | C3:1 r:.5 C3:.5 r:.5 C3:.5 r:1 | C2:3 r:1'),
    [
      stab(chordOf('C'), 4),
      stab(chordOf('F'), 2),
      stab(chordOf('G7'), 2),
      stab(chordOf('C'), 1),
      rest(0.5),
      stab(chordOf('C'), 0.5),
      rest(0.5),
      stab(chordOf('C'), 0.5),
      rest(1),
      stab(chordOf('C'), 3),
      rest(1)
    ],
    line(`k:.5 h:.5@.5 s:.5 h:.5@.5 k:.5 h:.5@.5 s:.5 h:.5@.5 | k:.5 h:.5@.5 s:.5 h:.5@.5 k:.5 h:.5@.5 s:.5 h:.5@.5 |
          k:1 r:.5 s:.5 r:.5 s:.5 r:1 | s:.25@.5 s:.25@.55 s:.25@.6 s:.25@.65 s:.25@.7 s:.25@.8 s:.25@.9 s:.25 k:1 r:1`)
  ],
  // The player ends a good run themselves: neither a failure nor the whole
  // game won, so a turn's short play-off, the bow before the curtain.
  curtain: [
    line('E5:.5 D5:.5 C5:.5 G4:.5 C5:1 r:1'),
    line('C3:.5 r:.5 G2:.5 r:.5 C2:1 r:1'),
    [rest(2), stab(chordOf('C'), 1), rest(1)],
    line('h:.5@.5 h:.5@.5 s:.5@.6 r:.5 k:1 r:1')
  ]
};

function stingersIn(semitones: number): Record<string, Note[][]> {
  return Object.fromEntries(
    Object.entries(STINGERS_IN_C).map(([name, lines]) => [name, transpose(lines, semitones)])
  );
}

/** The A500's fixed output filter, roughly: every pitched channel goes through it. */
const PAULA_FILTER: Track['filter'] = { type: 'lowpass', cutoff: 4400, q: 0.7 };

/** One act's lead sample: a single-cycle wave and the envelope the sample gave it. */
interface LeadSample {
  wavetable: Track['wavetable'];
  adsr: Track['adsr'];
}

/**
 * The four channels, in Paula's layout, shared by every act so a stinger
 * sounds like the act it lands in; only the lead's sample and the chord
 * arpeggio's speed change between acts.
 */
function channels(lead: LeadSample, arpRate: number): Track[] {
  return [
    // Channel 0, left: the tune.
    { name: 'lead', ...lead, filter: PAULA_FILTER, pan: -1, volume: 0.75 },
    // Channel 1, right: a sampled bass, plucked and quickly damped.
    {
      name: 'bass',
      wavetable: { harmonics: [1, 0.6, 0.3, 0.15, 0.08], bits: 8 },
      adsr: { attack: 0.003, decay: 0.2, sustain: 0.4, release: 0.05 },
      filter: PAULA_FILTER,
      pan: 1,
      volume: 0.8
    },
    // Channel 2, right: the chords, as tracker arpeggios on a square chip loop.
    {
      name: 'chords',
      wavetable: { samples: [1, 1, 1, 1, 1, 1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1], bits: 8 },
      adsr: { attack: 0.002, decay: 0.1, sustain: 0.45, release: 0.03 },
      filter: PAULA_FILTER,
      arpRate,
      pan: 1,
      volume: 0.3
    },
    // Channel 3, left: the kit.
    { name: 'drums', pan: -1, volume: 0.55 }
  ];
}

/** Every act: dry, as a four-channel module is, and polite under play. */
const MIX = { volume: 0.1 };

/** Eight beats of quiet after every second pass: a run is long, and the gap helps. */
const REST_PASSES = { after: 2, beats: 8 };

/** A PAL tracker's arpeggio: one step every 50th of a second, the buzzing chord. */
const PAL_TICK = 50;

/** Cut-time oom-pah: the bass on 1 and 3 (root, then fifth), the chord stab on 2 and 4. */
const OOM_PAH: Comp = (c, beats, again) => [
  [tone(again ? c.fifth : c.bass, beats / 2), rest(beats / 2)],
  [rest(beats / 2), stab(c, beats / 2, 0.9)]
];

/** The lightest kit on the floor, for the teaching levels: kick and snare only. */
const NURSERY: KitBars = { groove: 'k:1 s:1@.5 k:1 s:1@.5', fill: 'k:1 s:1@.5 k:.5 s:.5@.5 s:.25@.6 s:.25@.7 s:.5@.8' };
const NURSERY_KIT = kit(NURSERY.groove, NURSERY.fill, 8, 8);

const BRIDGE_CHART = 'G | G | D7 | G | G | G | D7 | G';
const BRIDGE_TUNE = `
  D5:1.5 E5:.5 D5:1 C5:1 | B4:1 C5:1 D5:2 | A4:1 B4:1 C5:2 | B4:1 C5:.5 D5:2.5 |
  D5:1.5 E5:.5 D5:1 C5:1 | B4:1 C5:1 D5:2 | A4:2 D5:2 |`;

/** Recorder-like: nearly a sine, with a breath of attack. */
const WHISTLE: LeadSample = {
  wavetable: { harmonics: [1, 0.25, 0.12, 0.05], bits: 8 },
  adsr: { attack: 0.01, decay: 0.15, sustain: 0.7, release: 0.06 }
};

/**
 * Act I, "London Bridge". The tune, with "down" pushed ahead of the beat; the
 * tune again with cheeky octave pops answering each "falling down"; a trio in
 * the subdominant, C major, that walks through A7 and D7 back to the tune;
 * and the tune once more, its last bar turned onto D7 over a B in the bass.
 */
export const ACT_I_MUSIC: GameAudioOptions = {
  tempo: 132,
  tonic: p('G3'),
  ...MIX,
  tracks: channels(WHISTLE, PAL_TICK),
  form: {
    // Up D7 to C, which steps into the tune's D.
    intro: vamp(OOM_PAH, 'D7', 'D4:.5 F#4:.5 A4:.5 C5:.5', NURSERY),
    order: ['tune', 'pops', 'trio', 'tune-open'],
    rest: REST_PASSES,
    sections: {
      tune: section(`${BRIDGE_TUNE} B4:1 G4:3`, OOM_PAH, BRIDGE_CHART, NURSERY_KIT),
      pops: section(
        `D5:1.5 E5:.5 D5:1 C5:1 | B4:.5 C5:.5 D5:1 r:.5 G5:.5 D5:1 |
         A4:.5 B4:.5 C5:1 r:.5 F#5:.5 C5:1 | B4:.5 C5:.5 D5:1 r:.5 G5:1.5 |
         D5:1.5 E5:.5 D5:1 C5:1 | B4:.5 C5:.5 D5:1 r:.5 G5:.5 D5:1 |
         A4:1 C5:1 F#5:1 A5:1 | G5:.5 D5:.5 B4:.5 A4:.5 G4:2`,
        OOM_PAH,
        BRIDGE_CHART,
        NURSERY_KIT
      ),
      trio: section(
        `E5:1 G5:.5 E5:.5 C5:1 E5:1 | D5:.5 C5:.5 B4:.5 C5:.5 D5:2 |
         D5:1 F5:.5 D5:.5 B4:1 D5:1 | C5:.5 D5:.5 E5:.5 D5:.5 C5:2 |
         A5:1 F5:.5 A5:.5 C6:1 A5:1 | G5:.5 E5:.5 C5:.5 E5:1 G5:1.5 |
         C#5:.5 E5:.5 G5:.5 A5:.5 G5:1 E5:1 | F#5:1 E5:.5 D5:.5 C5:1 A4:1`,
        OOM_PAH,
        'C | C G7 | G7 | C | F | C | A7 | D7',
        NURSERY_KIT
      ),
      'tune-open': section(`${BRIDGE_TUNE} B4:1 G4:1 A4:.5 C5:1.5`, OOM_PAH, 'G | G | D7 | G | G | G | D7 | G/B D7', NURSERY_KIT)
    }
  },
  stingers: stingersIn(-5)
};

/** Mozart's left hand: a bass note on the beat, then the chord in eighths behind it. */
const TURCA: Comp = (c, beats, again) => [
  [tone(again ? c.fifth : c.bass, 0.5), rest(beats - 0.5)],
  [rest(0.5), ...Array.from({ length: beats * 2 - 1 }, (_, i) => stab(c, 0.5, i === 0 ? 0.9 : 0.75))]
];

/** The janissary band: the bass drum on every beat, a cymbal on every off-beat, a snare roll to end a phrase. */
const JANISSARY: KitBars = {
  groove: 'k:.5 h:.5@.6 k:.5 h:.5@.6 k:.5 h:.5@.6 k:.5 h:.5@.6',
  fill: 'k:.5 h:.5@.6 k:.5 h:.5@.6 k:.5 s:.5@.7 s:.5@.8 s:.5'
};
const JANISSARY_KIT = kit(JANISSARY.groove, JANISSARY.fill, 8, 4);

/** The opening: the turn up to C and to E, the run on the dominant, and the leap to C6. */
const RONDO_OPENING = `
  C5:.5 r:.5 D5:.25 C5:.25 B4:.25 C5:.25 E5:.5 r:.5 F5:.25 E5:.25 D#5:.25 E5:.25 |
  B5:.25 A5:.25 G#5:.25 A5:.25 B5:.25 A5:.25 G#5:.25 A5:.25 C6:1 A5:.5 C6:.5 |`;
const RONDO_OPENING_CHART = 'Am | E Am';

/** Harpsichord-like: bright, plucked, and gone quickly. */
const HARPSICHORD: LeadSample = {
  wavetable: { harmonics: [1, 0.7, 0.5, 0.45, 0.3, 0.25, 0.2, 0.15], bits: 8 },
  adsr: { attack: 0.002, decay: 0.3, sustain: 0.3, release: 0.05 }
};

/**
 * Act II, Rondo alla Turca. Mozart's first period, whose half cadence on E
 * pushes its E ahead of the beat and ends on the upbeat back into the tune; his
 * C major episode, with an original second half that climbs to C6; and the
 * first period again, stopping on E with the upbeat that hands back to the top.
 */
export const ACT_II_MUSIC: GameAudioOptions = {
  tempo: 120,
  tonic: p('A3'),
  ...MIX,
  tracks: channels(HARPSICHORD, PAL_TICK),
  form: {
    // Up E7 to D, which falls a step into the tune's C.
    intro: vamp(TURCA, 'E7', 'E4:.5 G#4:.5 B4:.5 D5:.5', JANISSARY),
    order: ['rondo', 'episode', 'rondo-open'],
    rest: REST_PASSES,
    sections: {
      rondo: section(
        `${RONDO_OPENING}
         B5:.5 A5:.5 G#5:.5 A5:.5 B5:.5 A5:.5 G#5:.5 A5:.5 |
         B5:.5 A5:.5 G#5:.5 F#5:.25 E5:1.25 B4:.25 A4:.25 G#4:.25 A4:.25 |
         ${RONDO_OPENING}
         B5:.5 A5:.5 G#5:.5 A5:.5 C6:.5 A5:.5 B5:.5 G#5:.5 | A5:1 E5:.5 C5:.5 A4:2`,
        TURCA,
        `${RONDO_OPENING_CHART} | E | B7 E | ${RONDO_OPENING_CHART} | E E Am E | Am`,
        JANISSARY_KIT
      ),
      episode: section(
        `E5:.5 F5:.5 G5:.5 G5:.5 A5:.25 G5:.25 F5:.25 E5:.25 D5:1 |
         E5:.5 F5:.5 G5:.5 G5:.5 A5:.25 G5:.25 F5:.25 E5:.25 D5:1 |
         C5:.5 D5:.5 E5:.5 E5:.5 F5:.25 E5:.25 D5:.25 C5:.25 B4:1 |
         C5:.5 D5:.5 E5:.5 E5:.5 F5:.25 E5:.25 D5:.25 C5:.25 B4:1 |
         E5:.5 F5:.5 G5:.5 C6:1.5 B5:.5 A5:.5 |
         G5:.25 F5:.25 E5:.25 D5:.25 G5:1 B4:.5 D5:.5 G5:1 |
         C5:.5 D5:.5 E5:.5 E5:.5 F5:.25 E5:.25 D5:.25 C5:.25 B4:1 |
         C5:.25 B4:.25 A4:.25 B4:.25 E5:1 r:1 B4:.25 A4:.25 G#4:.25 A4:.25`,
        TURCA,
        'C G | C G | Am E | Am E | C | G | Am E | Am E',
        JANISSARY_KIT
      ),
      'rondo-open': section(
        `${RONDO_OPENING}
         B5:.5 A5:.5 G#5:.5 A5:.5 B5:.5 A5:.5 G#5:.5 A5:.5 |
         B5:.5 A5:.5 G#5:.5 F#5:.25 E5:1.25 B4:.25 A4:.25 G#4:.25 A4:.25 |
         ${RONDO_OPENING}
         B5:.5 A5:.5 G#5:.5 A5:.5 B5:.5 A5:.5 G#5:.5 F#5:.5 |
         E5:2 r:1 B4:.25 A4:.25 G#4:.25 A4:.25`,
        TURCA,
        `${RONDO_OPENING_CHART} | E | B7 E | ${RONDO_OPENING_CHART} | E | E`,
        JANISSARY_KIT
      )
    }
  },
  // A major: the Rondo's own coda turns to it, and the level is won.
  stingers: stingersIn(-3)
};

/** The ground as a tracker plays it: the bass holds each chord and the arpeggio turns under it. */
const GROUND: Comp = (c, beats) => [[tone(c.bass, beats)], [stab(c, beats)]];

/** Half-time: kick on 1, snare on 3, a hat between, and a roll into each new ground. */
const CONTINUO: KitBars = { groove: 'k:1 h:1@.45 s:1@.55 h:1@.45', fill: 'k:1 h:1@.45 s:.5@.55 s:.5@.65 s:.5@.75 s:.5@.85' };
const CANON_KIT = kit(CONTINUO.groove, CONTINUO.fill, 4, 4);

/** Pachelbel's ground, two chords a bar at half notes: four bars. */
const GROUND_CHART = 'D A | Bm F#m | G D | G A';

/** Pachelbel's sixteenth-note variation, here as eighths: two bars of the ground. */
const CANON_RUNS = `
  D5:.5 C#5:.5 D5:.5 D4:.5 C#4:.5 A4:.5 E4:.5 F#4:.5 |
  D4:.5 D5:.5 C#5:.5 B4:.5 C#5:.5 F#5:.5 A5:.5 B5:.5 |
  G5:.5 F#5:.5 E5:.5 G5:.5 F#5:.5 E5:.5 D5:.5 C#5:.5 |
  B4:.5 A4:.5 G4:.5 F#4:.5 E4:.5 G4:.5 F#4:.5 E4:.5`;
/** Pachelbel's eighth-note variation, here as quarters. */
const CANON_BROKEN = 'D5:1 F#5:1 A5:1 G5:1 | F#5:1 D5:1 F#5:1 E5:1 | D5:1 B4:1 D5:1 A5:1 | G5:1 B5:1 A5:.5 G5:1.5';

/** String-like: a sawtooth's partials, bowed in. */
const STRINGS: LeadSample = {
  wavetable: { harmonics: [1, 0.5, 0.33, 0.25, 0.2, 0.17, 0.14], bits: 8 },
  adsr: { attack: 0.03, decay: 0.2, sustain: 0.8, release: 0.12 }
};

/**
 * Act III, Pachelbel's Canon. The ground at half notes throughout, under the
 * violin's first two variations in half notes (the second with its
 * suspensions, a note tied over the half bar), the eighth and sixteenth
 * variations at half speed, an original jig that pushes across the beat, and
 * the first variation again, whose ground ends on G and A. The danger variant
 * is the Canon at Pachelbel's own harmonic rhythm, a chord a beat, with the
 * sixteenths at full speed.
 */
export const ACT_III_MUSIC: GameAudioOptions = {
  tempo: 116,
  tonic: p('D4'),
  ...MIX,
  // A slower arpeggio than the other acts: 25 steps a second reads as a
  // broken chord on a continuo rather than a buzz.
  tracks: channels(STRINGS, 25),
  form: {
    // Up A7 to G, which falls a step into the violin's F#.
    intro: vamp(GROUND, 'A7', 'A4:.5 C#5:.5 E5:.5 G5:.5', CONTINUO),
    order: ['canon', 'suspensions', 'broken', 'runs', 'jig', 'canon'],
    rest: REST_PASSES,
    danger: { order: ['hurry'], tempo: 128 },
    sections: {
      canon: section('F#5:2 E5:2 | D5:2 C#5:2 | B4:2 A4:2 | B4:2 C#5:2', GROUND, GROUND_CHART, CANON_KIT),
      suspensions: section('D5:2 C#5:2 | B4:1 A4:3 | G4:2 F#4:2 | G4:1 E4:3', GROUND, GROUND_CHART, CANON_KIT),
      broken: section(CANON_BROKEN, GROUND, GROUND_CHART, CANON_KIT),
      runs: section(CANON_RUNS, GROUND, GROUND_CHART, CANON_KIT),
      jig: section(
        `F#5:.5 A5:1 F#5:.5 E5:.5 C#5:1 A4:.5 | B4:.5 D5:1 F#5:.5 F#5:.5 C#5:1 A4:.5 |
         G4:.5 B4:1 D5:.5 F#5:.5 A5:1 F#5:.5 | G5:1 D5:.5 B4:.5 A4:.5 C#5:.5 E5:1`,
        GROUND,
        GROUND_CHART,
        CANON_KIT
      ),
      hurry: section(
        `D5:.25 C#5:.25 D5:.25 D4:.25 C#4:.25 A4:.25 E4:.25 F#4:.25 D4:.25 D5:.25 C#5:.25 B4:.25 C#5:.25 F#5:.25 A5:.25 B5:.25 |
         G5:.25 F#5:.25 E5:.25 G5:.25 F#5:.25 E5:.25 D5:.25 C#5:.25 B4:.25 A4:.25 G4:.25 F#4:.25 E4:.25 G4:.25 F#4:.25 E4:.25 |
         D5:.5 F#5:.5 A5:.5 G5:.5 F#5:.5 D5:.5 F#5:.5 E5:.5 | D5:.5 B4:.5 D5:.5 A5:.5 G5:.5 B5:.5 A5:.25 G5:.75`,
        GROUND,
        'D A Bm F#m | G D G A | D A Bm F#m | G D G A',
        kit(
          'k:.5 h:.25@.4 h:.25@.4 s:.5@.6 h:.25@.4 h:.25@.4 k:.5 h:.25@.4 h:.25@.4 s:.5@.6 h:.25@.4 h:.25@.4',
          'k:.5 h:.25@.4 h:.25@.4 s:.5@.6 h:.25@.4 h:.25@.4 s:.25@.6 s:.25@.7 s:.25@.8 s:.25@.9 s:.5 k:.5',
          4,
          4
        )
      )
    }
  },
  stingers: stingersIn(2)
};

/** The galop's oom-pah in eighths over a half bar: root and fifth on the beats, the chord on every off-beat. */
const GALOP: Comp = c => [
  [tone(c.bass, 0.5), rest(0.5), tone(c.fifth, 0.5, 0.85), rest(0.5)],
  [rest(0.5), stab(c, 0.5, 0.9), rest(0.5), stab(c, 0.5, 0.75)]
];

const GALLOP: KitBars = {
  groove: 'k:.5 h:.5@.5 s:.5 h:.5@.5 k:.5 h:.5@.5 s:.5 h:.5@.5',
  fill: 'k:.5 h:.5@.5 s:.5 h:.5@.5 s:.25@.6 s:.25@.7 s:.25@.8 s:.25@.9 s:.5 k:.5'
};
const GALOP_KIT = kit(GALLOP.groove, GALLOP.fill, 8, 4);
/** Danger: kick and snare galloping on every eighth. */
const RIOT_KIT = kit(
  'k:.5 s:.5@.7 k:.5 s:.5@.7 k:.5 s:.5@.7 k:.5 s:.5@.7',
  's:.25@.6 s:.25@.7 s:.25@.8 s:.25@.9 k:.5 s:.5@.7 k:.5 s:.5@.7 s:.25@.7 s:.25@.8 s:.25@.9 s:.25',
  8,
  4
);

/** The Can-Can's first seven bars, and its chart to the eighth. */
const CANCAN = `
  C5:1 D5:.5 F5:.5 E5:.5 D5:.5 G5:1 | G5:1 G5:.5 A5:.5 E5:.5 F5:.5 D5:1 |
  D5:1 D5:.5 F5:.5 E5:.5 D5:.5 C5:.5 C6:.5 | B5:.5 A5:.5 G5:.5 F5:.5 E5:.5 D5:.5 C5:.5 G4:.5 |
  C5:1 D5:.5 F5:.5 E5:.5 D5:.5 G5:1 | G5:1 G5:.5 A5:.5 E5:.5 F5:.5 D5:1 |
  D5:1 D5:.5 F5:.5 E5:.5 D5:.5 C5:.5 G5:.5 |`;
/** The same seven bars with every long note restruck, a line of high kicks. */
const CANCAN_KICKS = `
  C5:.5 C5:.5 D5:.5 F5:.5 E5:.5 D5:.5 G5:1 | G5:.5 G5:.5 G5:.5 A5:.5 E5:.5 F5:.5 D5:1 |
  D5:.5 D5:.5 D5:.5 F5:.5 E5:.5 D5:.5 C5:.5 C6:.5 | B5:.5 A5:.5 G5:.5 F5:.5 E5:.5 D5:.5 C5:.5 G4:.5 |
  C5:.5 C5:.5 D5:.5 F5:.5 E5:.5 D5:.5 G5:1 | G5:.5 G5:.5 G5:.5 A5:.5 E5:.5 F5:.5 D5:1 |
  D5:.5 D5:.5 D5:.5 F5:.5 E5:.5 D5:.5 C5:.5 G5:.5 |`;
const CANCAN_CHART = 'C | G7 | G7 C | G7 C | C | G7 | G7 C';

/** Accordion-like: odd partials strong, the even ones a trace. */
const ACCORDION: LeadSample = {
  wavetable: { harmonics: [1, 0.1, 0.6, 0.1, 0.4, 0.1, 0.25], bits: 8 },
  adsr: { attack: 0.006, decay: 0.1, sustain: 0.65, release: 0.05 }
};

const GALOP_LAST = 'D5:.5 E5:1 C5:1.5 r:1';
const KICKS_LAST = 'E5:.5 G5:1.5 C6:1 r:1';

/**
 * Act IV, the Galop infernal. Offenbach's tune, ending with its C thrown in
 * early; the tune again with every long note kicked twice and a "hey!" on C6;
 * an original kick-line trio in F on repeated high notes, turning through D7
 * and G7; and the tune a last time, stopping on G. Danger is the tune and its
 * kicks faster, over a kick and snare that gallop on every eighth.
 */
export const ACT_IV_MUSIC: GameAudioOptions = {
  tempo: 148,
  tonic: p('C4'),
  ...MIX,
  tracks: channels(ACCORDION, PAL_TICK),
  form: {
    // Up G7 to F, which drops a fourth to the tune's C, the Can-Can's own leap.
    intro: vamp(GALOP, 'G7', 'G4:.5 B4:.5 D5:.5 F5:.5', GALLOP),
    order: ['galop', 'kicks', 'trio', 'galop-open'],
    rest: REST_PASSES,
    danger: { order: ['riot', 'riot-kicks'], tempo: 176 },
    sections: {
      galop: section(`${CANCAN} ${GALOP_LAST}`, GALOP, `${CANCAN_CHART} | C`, GALOP_KIT),
      kicks: section(`${CANCAN_KICKS} ${KICKS_LAST}`, GALOP, `${CANCAN_CHART} | C`, GALOP_KIT),
      trio: section(
        `A5:.5 A5:.5 A5:.5 r:.5 A5:.5 G5:.5 F5:.5 A5:.5 | C6:1 A5:.5 F5:.5 C5:2 |
         G5:.5 G5:.5 G5:.5 r:.5 G5:.5 F5:.5 E5:.5 G5:.5 | Bb5:.5 A5:1 G5:.5 F5:2 |
         D5:.5 F5:.5 Bb5:.5 r:.5 Bb5:.5 A5:.5 G5:.5 F5:.5 | A5:.5 C6:1 A5:.5 F5:2 |
         F#5:.5 A5:.5 C6:.5 A5:.5 B5:.5 G5:.5 F5:.5 D5:.5 | G5:1 F5:.5 D5:.5 B4:1 r:1`,
        GALOP,
        'F | F | C7 | F | Bb | F | D7 G7 | G7',
        GALOP_KIT
      ),
      'galop-open': section(`${CANCAN} D5:.5 E5:1 D5:.5 B4:.5 G4:1.5`, GALOP, `${CANCAN_CHART} | G7`, GALOP_KIT),
      riot: section(`${CANCAN} ${GALOP_LAST}`, GALOP, `${CANCAN_CHART} | C`, RIOT_KIT),
      'riot-kicks': section(`${CANCAN_KICKS} ${KICKS_LAST}`, GALOP, `${CANCAN_CHART} | C`, RIOT_KIT)
    }
  },
  stingers: stingersIn(0)
};

/** The acts' scores, in act order; `game.ts` plays `ACT_MUSIC[actOf(level)]`. */
export const ACT_MUSIC: readonly GameAudioOptions[] = [ACT_I_MUSIC, ACT_II_MUSIC, ACT_III_MUSIC, ACT_IV_MUSIC];
