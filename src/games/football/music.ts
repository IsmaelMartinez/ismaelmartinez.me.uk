/**
 * CALCIO '90's score: a Mega Drive tournament soundtrack in F major.
 *
 * Reference and brief (round 3, #413; ADR 003's round 3 amendment). The
 * cabinet homages Sega's World Cup Italia '90 on the Mega Drive, which had
 * title and menu music and three in-match themes that rotated between
 * matches, played on the YM2612 (six four-operator FM channels, one of which
 * could stream PCM drum samples) and the SN76489 PSG (three squares and a
 * noise channel), with no hardware echo. The anthems of that summer, "Un'estate
 * italiana" and "World in Motion", are copyrighted and are evoked here and never
 * quoted: a major key near 124 bpm, dance-pop and pop-rock drums with a loud
 * snare, and a big chanted hook that leans on a borrowed chord (bVII, Eb, and
 * the minor iv, Bbm). Each choice below names the trait it serves.
 *
 * Voices, the Mega Drive's split between its two chips:
 *
 * - lead, FM brass (YM2612). A sine carrier at modulator ratio 1 with a high
 *   index is the sawtooth-bright brass FM is known for, and the adsr's 40 ms
 *   swell is the brass "speaking". The index falls slowly, so a short stab stays
 *   bright and a held note mellows as a section's would. Its light vibrato is
 *   the chip's own LFO. It sits A4 to A5, a chanting register rather than the
 *   C5-to-A5 soprano the other cabinets' leads share.
 * - bass, FM slap (YM2612). Ratio 1 with a large index that collapses in 90 ms
 *   is the percussive twang of the Mega Drive slap bass, and every figure
 *   bounces between a root and its octave, the platform's signature bass line.
 * - psg, the SN76489. A plain square, no vibrato, no twin, playing each chord as
 *   one fast arpeggio (`Note.arp` at 60 steps a second, the NTSC frame) where
 *   the old score had a detuned pad: the PSG never had a pad, it had arpeggios.
 * - drums, the DAC channel. The kick is a pitched sine on this voice whose pitch
 *   envelope drops it two octaves in 35 ms, the thump of a sampled kick; the
 *   snare is the engine's noise snare written at full level on 2 and 4, the loud
 *   snare the brief asks for; hats are quieter noise ticks.
 * - crowd, sustained low-passed noise, the stadium. A layer that is silent until
 *   the match gives it something to shout about (see the adaptive hooks), and
 *   quiet when it comes: it is there to swell under the tune, never over it.
 *
 * Three pitched voices plus drums and a noise bed, inside ADR 003's limit (the
 * crowd and the DAC kick are percussion, not pitched lines). There is no echo:
 * the hardware had none, and the old score's long wash is gone.
 *
 * Form. One `form` holds six scenes; the menu is its `order` and the rest its
 * `scenes`, moved between with `setScene` (see `SCENES`). Every section is its
 * own writing; only the final borrows, from the first theme's hook.
 *
 * - menu, 16 bars (title-a, title-b, title-turn): the title and team-select
 *   theme, also heard on the full-time, tables, bracket and end screens. No
 *   drums, a strolling bass and held arpeggios; a relaxed brass tune.
 * - match, 26 bars (m1-hook, m1-verse, m1-hook, m1-tag): the first match theme,
 *   pop-rock. The hook is the chanted one, sung twice around a lower verse, as
 *   a terrace repeats a chant; the tag is two bars on C, the dominant.
 * - match-2, 28 bars (m2-riff, m2-chant, m2-riff, m2-lift): the second theme,
 *   dance-pop. A brass riff of short stabs over a Mixolydian F, Eb, Bb vamp
 *   (the bVII anthem colour), a repeated-note chant turning through the
 *   borrowed Bbm, and a four-bar lift. Disco octaves in the bass, stabbed PSG
 *   chords, a sixteenth-note kick pattern.
 * - match-3, 26 bars (m3-verse, m3-chorus, m3-chorus-2, m3-turn): the third
 *   theme, a half-time pop ballad that opens on the relative minor and rises
 *   into a chorus through Eb and then Bbm.
 * - final, 26 bars (final-a, final-b, m1-hook, final-tag): the final's own
 *   fanfare and strain, then the first theme's hook, so the last match of the
 *   run sounds like the first, at `FINAL_TEMPO` over a sixteenth-note groove
 *   and a galloping bass.
 * - shootout, 12 bars (shootout, shootout-turn): a tension bed on a C pedal, the
 *   dominant, under Db and Bbm, with a heartbeat kick and a snare roll into its
 *   top; the brass holds long notes and tightens into repeated ones.
 *
 * Three rotating match themes are the Mega Drive game's own practice: group
 * matches one, two and three each get a theme, and the semi comes round to the
 * first again (`game.ts` picks by matches played). The key stays F major in
 * all of them so the stingers, which play over whichever theme is running,
 * always belong to it.
 *
 * Every scene hands back to its top through C, the dominant (the shootout
 * through G, the dominant's own), never V to I: the bass does not land on its
 * opening pitch on a strong beat of a scene's last bar.
 *
 * Tempo. `BASE_TEMPO` is 124, the anthems' pace, for the menus and the group
 * stage; `SEMI_TEMPO` 130 and `FINAL_TEMPO` 136 are the knockout ramp, which
 * keeps the run audibly getting harder without leaving dance-pop tempo.
 *
 * Length and session (ADR 003). A run is a whole tournament, five matches of
 * about 65 to 90 s each plus the screens between them and up to two
 * shootouts, so it is a long session; the load during play is high (steering,
 * passing and shooting against the clock), which is why the tunes stay
 * diatonic and chantable, with one borrowed chord at a time. Each scene is
 * sized on its own at the fastest tempo it is played at: the match 48.0 s at
 * 130 (it is the semi's theme), match-2 54.2 s and match-3 50.3 s at 124, the
 * final 45.9 s at 136, the menu 31.0 s at 124 and the shootout 21.2 s at 136.
 *
 * Adaptive hooks, wired in `game.ts` from events the match already raises:
 * the drums are a `startsMuted` layer the kick-off brings in and half-time and
 * full time take out; the crowd is a `startsMuted` layer a shot, save, post,
 * goal or penalty kick swells in and a timer lets fall away again; the rotation
 * above and the stage ramp pick the scene and the tempo; the shootout moves to
 * its bed; the static screens go back to the menu; and `STINGERS` mark the
 * kick-off, a goal for, a goal against, half-time and the final whistle, in
 * the same FM palette, with the crowd's roar written into the goal's. Pause
 * muffles the music with `setPaused`, and attract mode keeps it off.
 *
 * Beginnings and endings (#417). The form's `intro` is a two-bar title
 * fanfare, heard each time the music starts from silence, which is where the
 * cartridge played its title jingle; attract mode never starts the music, so
 * the demo never hears it. A finished run ends through `playEnding` on one of
 * `ENDINGS`: `eliminated`, two bars sinking through the borrowed iv, or
 * `champion`, four bars of the final's fanfare, the score's one V to I.
 */
import { p, REST, type DrumName, type GameAudioOptions, type MusicProfile, type Note } from '../engine';

/**
 * The score's own tempo, the pace it was written at and the one the group
 * stage and the menus play: 124, the anthems' dance-pop pace. It lives here and
 * not in `game.ts` for the same reason Cascade's does: it is a property of the
 * arrangement, whereas how far a run winds it up is policy about the game.
 * `stageTempo()` keeps the ramp.
 *
 * A stage change is safe mid-loop: the engine's `setTempo` rescales every
 * pending cursor by the tempo ratio, so the voices re-time together.
 */
export const BASE_TEMPO = 124;

/**
 * The semi-final's tempo, the first step of the knockout ramp. It lives here
 * beside the others because the first match theme is the semi's too, so it is
 * the tempo that theme's loop is measured against.
 */
export const SEMI_TEMPO = 130;

/**
 * The final's tempo, the fastest `stageTempo()` winds the score to and the
 * final scene's own. ADR 003 sizes a ramping loop at its fastest tempo, so
 * this is the number the final and the shootout are measured against.
 */
export const FINAL_TEMPO = 136;

/**
 * The seam gate is off for the whole cabinet, and only because of how it
 * reads a score: it takes the lowest pitched voice, and the DAC kick is a
 * pitched note on the drum voice, an octave under the bass, so the gate would
 * judge the seam by the kick drum's one pitch. The rule itself still holds for
 * the bass, and `tests/games/football-music.test.ts` checks it there for every
 * scene. The syncopation and bar-rhythm gates stay on: pushes over the beat are
 * the dance-pop feel the brief asks for.
 *
 * The menu is the form's `order`, heard between matches at the base tempo, so
 * it is held to the standard floor. A run is a whole tournament, so the match
 * themes and the final are held to the long floor, each at the fastest tempo it
 * plays at (the first theme is the semi's too), and the shootout, a minute at
 * most, to the minimal one at the final's tempo.
 */
export const MUSIC_PROFILE: MusicProfile = {
  session: 'standard',
  fastestTempo: BASE_TEMPO,
  gates: { seam: false },
  scenes: {
    match: { session: 'long', fastestTempo: SEMI_TEMPO },
    'match-2': { session: 'long', fastestTempo: BASE_TEMPO },
    'match-3': { session: 'long', fastestTempo: BASE_TEMPO },
    final: { session: 'long', fastestTempo: FINAL_TEMPO },
    shootout: { session: 'minimal', fastestTempo: FINAL_TEMPO }
  }
};

/** The scenes the game moves the score between: the menu is the form's `order`, the rest its `scenes`. */
export type Scene = 'menu' | 'match' | 'match-2' | 'match-3' | 'final' | 'shootout';

/** The three match themes in the order a run meets them; the semi comes round to the first again. */
export const MATCH_THEMES = ['match', 'match-2', 'match-3'] as const satisfies readonly Scene[];

/** Each scene's sections, first to last; each loops on its own while the game holds it. */
export const SCENES: Record<Scene, readonly string[]> = {
  menu: ['title-a', 'title-b', 'title-turn'],
  match: ['m1-hook', 'm1-verse', 'm1-hook', 'm1-tag'],
  'match-2': ['m2-riff', 'm2-chant', 'm2-riff', 'm2-lift'],
  'match-3': ['m3-verse', 'm3-chorus', 'm3-chorus-2', 'm3-turn'],
  final: ['final-a', 'final-b', 'm1-hook', 'final-tag'],
  shootout: ['shootout', 'shootout-turn']
};

/* ------------------------------------------------------------------ */
/* note helpers                                                         */

/** A pitched note, with an optional attenuation. */
function n(name: string, beats: number, gain?: number): Note {
  return gain === undefined ? { freq: p(name), beats } : { freq: p(name), beats, gain };
}

function r(beats: number): Note {
  return { freq: REST, beats };
}

function hit(drum: DrumName, beats: number, gain?: number): Note {
  return gain === undefined ? { freq: REST, beats, drum } : { freq: REST, beats, drum, gain };
}

/**
 * The DAC kick: a pitched note on the drum voice, which the voice's pitch
 * envelope sweeps down onto A1 in 35 ms. A sampled kick has one pitch
 * whatever the key, so this one does too.
 */
function kick(beats: number, gain = 0.85): Note {
  return { freq: p('A1'), beats, gain };
}

/**
 * The crowd: a stretch of noise low-passed at `hz`. Written in hertz rather
 * than as a note name because it is a brightness, not a pitch: 500 is a groan,
 * 700 a murmur, 2,500 a roar.
 */
function roar(hz: number, beats: number, gain?: number): Note {
  return gain === undefined ? { freq: hz, beats } : { freq: hz, beats, gain };
}

/** The same name an octave up: the slap bass's pop. */
function up(name: string): string {
  return name.replace(/\d+$/, octave => String(Number(octave) + 1));
}

/* ------------------------------------------------------------------ */
/* chords                                                               */

const MAJOR = [0, 4, 7];
const MINOR = [0, 3, 7];
/** A major triad with the octave on top, the final's brighter four-step arpeggio. */
const MAJOR_OCT = [0, 4, 7, 12];

/**
 * Every chord the score uses: the bass root (the pop is an octave above it)
 * and the PSG's arpeggio, rooted between Bb3 and F4 so the chip stays in one
 * register whichever chord it spells.
 */
const CHORDS = {
  F: { bass: 'F2', psg: 'F4', arp: MAJOR },
  C: { bass: 'C2', psg: 'C4', arp: MAJOR },
  Dm: { bass: 'D2', psg: 'D4', arp: MINOR },
  Bb: { bass: 'Bb1', psg: 'Bb3', arp: MAJOR },
  Eb: { bass: 'Eb2', psg: 'Eb4', arp: MAJOR },
  Gm: { bass: 'G2', psg: 'G3', arp: MINOR },
  Am: { bass: 'A2', psg: 'A3', arp: MINOR },
  Bbm: { bass: 'Bb1', psg: 'Bb3', arp: MINOR },
  Db: { bass: 'Db2', psg: 'Db4', arp: MAJOR },
  G: { bass: 'G2', psg: 'G3', arp: MAJOR }
} as const;

type Chord = keyof typeof CHORDS;

/** One bar of a figure per chord. */
function over(figure: (chord: Chord) => Note[], chords: Chord[]): Note[] {
  return chords.flatMap(figure);
}

/* ------------------------------------------------------------------ */
/* bass figures: every one bounces between the root and its octave       */

/** The first theme's pop-rock slap: root, a ghosted root, the pop, and the pop again on the and of 2 and of 4. */
function slap(chord: Chord): Note[] {
  const root = CHORDS[chord].bass;
  const pop = up(root);
  return [
    n(root, 0.5), n(root, 0.25, 0.5), n(pop, 0.25, 0.8), r(0.5), n(pop, 0.5, 0.85),
    n(root, 0.5, 0.95), n(root, 0.25, 0.5), n(pop, 0.25, 0.8), r(0.5), n(pop, 0.5, 0.85)
  ];
}

/** The second theme's disco octaves, root and pop in eighths with a sixteenth doubled root on beat 2. */
function disco(chord: Chord): Note[] {
  const root = CHORDS[chord].bass;
  const pop = up(root);
  return [
    n(root, 0.5), n(pop, 0.5, 0.8), n(root, 0.25, 0.55), n(root, 0.25, 0.65), n(pop, 0.5, 0.8),
    n(root, 0.5, 0.95), n(pop, 0.5, 0.8), n(root, 0.5, 0.9), n(pop, 0.5, 0.8)
  ];
}

/** The third theme's half-time slap: a long root, a quick pop, space, then a second bounce. */
function halfSlap(chord: Chord): Note[] {
  const root = CHORDS[chord].bass;
  const pop = up(root);
  return [n(root, 0.75), n(pop, 0.25, 0.8), r(1), n(root, 0.5, 0.85), n(pop, 0.5, 0.8), r(0.5), n(pop, 0.5, 0.75)];
}

/** The final's gallop: root, ghosted root, pop, on every beat. */
function gallop(chord: Chord): Note[] {
  const root = CHORDS[chord].bass;
  const pop = up(root);
  return Array.from({ length: 4 }, (_, beat) => [
    n(root, 0.5, beat % 2 === 0 ? 1 : 0.9), n(root, 0.25, 0.5), n(pop, 0.25, 0.8)
  ]).flat();
}

/** The menu's stroll: a held root, the pop, a breath, and a lighter bounce. */
function stroll(chord: Chord): Note[] {
  const root = CHORDS[chord].bass;
  const pop = up(root);
  return [n(root, 1.5, 0.85), n(pop, 0.5, 0.7), r(1), n(root, 0.5, 0.75), n(pop, 0.5, 0.7)];
}

/** The shootout's heartbeat, lub-dub twice a bar with the space after it longer than the beat. */
function thump(chord: Chord): Note[] {
  const root = CHORDS[chord].bass;
  return [n(root, 0.5, 0.95), n(root, 0.25, 0.6), r(1.25), n(root, 0.5, 0.85), n(root, 0.25, 0.55), r(1.25)];
}

/* ------------------------------------------------------------------ */
/* PSG figures: a chord is one note cycling its arpeggio                */

function psg(chord: Chord, beats: number, gain?: number, arp: readonly number[] = CHORDS[chord].arp): Note {
  const note: Note = { freq: p(CHORDS[chord].psg), beats, arp: [...arp] };
  return gain === undefined ? note : { ...note, gain };
}

/** A whole bar held, the arpeggio buzzing under it. */
function held(chord: Chord): Note[] {
  return [psg(chord, 4, 0.9)];
}

/** Struck on the downbeat and again on the half bar, the lighter second. */
function restruck(chord: Chord): Note[] {
  return [psg(chord, 2, 0.9), psg(chord, 2, 0.75)];
}

/** The second theme's off-beat stabs. */
function stab(chord: Chord): Note[] {
  return [r(0.5), psg(chord, 1, 0.9), r(0.5), psg(chord, 0.5, 0.75), r(1), psg(chord, 0.5, 0.7)];
}

/** The final's held bar on the brighter four-step arpeggio. */
function blaze(chord: Chord): Note[] {
  return [psg(chord, 4, 0.9, CHORDS[chord].arp === MAJOR ? MAJOR_OCT : CHORDS[chord].arp)];
}

/* ------------------------------------------------------------------ */
/* drum figures                                                         */

/** Pop-rock: kick on 1 and 3 with a push on the and of 3, the loud snare on 2 and 4, hats between. */
function rock(): Note[] {
  return [
    kick(0.5), hit('hat', 0.5, 0.45), hit('snare', 0.5), hit('hat', 0.5, 0.45),
    kick(0.5), kick(0.5, 0.65), hit('snare', 0.5), hit('hat', 0.5, 0.45)
  ];
}

/** Dance-pop: sixteenth hats, the snare on 2 and 4, a kick pushing into beat 4. */
function italo(): Note[] {
  return [
    kick(0.5), hit('hat', 0.25, 0.4), hit('hat', 0.25, 0.5), hit('snare', 0.5), kick(0.5),
    kick(0.5, 0.65), hit('hat', 0.5, 0.45), hit('snare', 0.5), hit('hat', 0.25, 0.4), kick(0.25, 0.6)
  ];
}

/** Half-time: the kick on 1, the snare on 3, which is what makes the third theme feel broader. */
function broad(): Note[] {
  return [kick(1), hit('hat', 0.5, 0.45), hit('hat', 0.5, 0.4), hit('snare', 1), hit('hat', 0.5, 0.45), kick(0.5, 0.65)];
}

/** The final's groove: sixteenth hats and a double kick in the middle of the bar. */
function drive(): Note[] {
  return [
    kick(0.5), hit('hat', 0.25, 0.45), hit('hat', 0.25, 0.4), hit('snare', 0.5), hit('hat', 0.25, 0.45), kick(0.25, 0.6),
    kick(0.5), hit('hat', 0.25, 0.45), hit('hat', 0.25, 0.4), hit('snare', 0.5), hit('snare', 0.25, 0.5), hit('hat', 0.25, 0.45)
  ];
}

/** A phrase-end fill: kick and snare trading, then four sixteenths climbing into the next downbeat. */
function fill(): Note[] {
  return [
    kick(0.5), hit('snare', 0.25, 0.6), hit('snare', 0.25, 0.7), kick(0.5), hit('snare', 0.5),
    hit('snare', 0.25, 0.6), hit('snare', 0.25, 0.7), hit('snare', 0.25, 0.8), hit('snare', 0.25, 0.9),
    kick(0.5), hit('snare', 0.5)
  ];
}

/** The shootout's kick, doubling the bass heartbeat. */
function heart(): Note[] {
  return [kick(0.5, 0.9), kick(0.25, 0.6), r(1.25), kick(0.5, 0.8), kick(0.25, 0.55), r(1.25)];
}

/** A bar of sixteenth snares swelling from nothing, the run-up to a penalty. */
function snareRoll(): Note[] {
  return Array.from({ length: 16 }, (_, i) => hit('snare', 0.25, 0.3 + (0.7 * i) / 15));
}

/** `count` bars of a groove, the last replaced by the fill. */
function groove(count: number, bar: () => Note[]): Note[] {
  return [...Array.from({ length: count - 1 }, bar).flat(), ...fill()];
}

/* ------------------------------------------------------------------ */
/* the crowd                                                            */

/**
 * The crowd's line through a match section: a murmur for the first half and a
 * brighter one for the second, so a swell that holds across a section rises
 * with the phrase. Heard only while the layer is up.
 */
function stand(bars: number, from = 650, to = 800): Note[] {
  const half = (bars * 4) / 2;
  return [roar(from, half, 0.85), roar(to, half)];
}

/** Silence where no crowd belongs: the menus. */
function hush(bars: number): Note[] {
  return [r(bars * 4)];
}

/* ------------------------------------------------------------------ */
/* menu: the title and team-select theme                                */

// title-a: F Am Bb C | F Am Bb Eb
const TITLE_A: Note[][] = [
  [
    n('C5', 2, 0.9), n('A4', 1, 0.8), n('C5', 1, 0.85),
    n('E5', 1, 0.9), n('D5', 0.5, 0.8), n('C5', 1, 0.85), n('A4', 1.5, 0.8),
    n('Bb4', 0.5, 0.8), n('C5', 0.5, 0.85), n('D5', 2, 0.9), n('F5', 1),
    n('E5', 2.5, 0.9), r(0.5), n('G4', 0.5, 0.75), n('A4', 0.5, 0.8),
    n('C5', 2, 0.9), n('A4', 1, 0.8), n('F5', 1),
    n('E5', 1, 0.9), n('C5', 0.5, 0.8), n('E5', 1, 0.9), n('A5', 1.5),
    n('G5', 1, 0.9), n('F5', 0.5, 0.85), n('D5', 0.5, 0.8), n('Bb4', 1, 0.8), n('D5', 1, 0.85),
    n('Eb5', 2, 0.9), n('G5', 1, 0.9), n('F5', 1, 0.85)
  ],
  over(stroll, ['F', 'Am', 'Bb', 'C', 'F', 'Am', 'Bb', 'Eb']),
  over(held, ['F', 'Am', 'Bb', 'C', 'F', 'Am', 'Bb', 'Eb']),
  [r(32)],
  hush(8)
];

// title-b: Dm Bb Gm C Dm Bb
const TITLE_B: Note[][] = [
  [
    n('F5', 1), n('E5', 0.5, 0.85), n('D5', 0.5, 0.8), n('A4', 2, 0.85),
    n('Bb4', 0.5, 0.8), n('D5', 0.5, 0.85), n('F5', 1), n('D5', 2, 0.85),
    n('G4', 0.5, 0.75), n('Bb4', 0.5, 0.8), n('D5', 1.5, 0.9), n('C5', 0.5, 0.8), n('Bb4', 1, 0.8),
    n('C5', 1, 0.85), n('E5', 1, 0.9), n('G5', 2),
    n('A5', 1), n('G5', 0.5, 0.9), n('F5', 0.5, 0.85), n('D5', 2, 0.9),
    n('F5', 0.5, 0.85), n('D5', 0.5, 0.8), n('Bb4', 3, 0.85)
  ],
  over(stroll, ['Dm', 'Bb', 'Gm', 'C', 'Dm', 'Bb']),
  over(restruck, ['Dm', 'Bb', 'Gm', 'C', 'Dm', 'Bb']),
  [r(24)],
  hush(6)
];

// title-turn: Bbm, the borrowed iv, then C.
const TITLE_TURN: Note[][] = [
  [n('F5', 2, 0.9), n('Db5', 1, 0.85), n('Bb4', 1, 0.8), r(0.5), n('E5', 1, 0.9), n('G5', 0.5, 0.85), n('C5', 2, 0.85)],
  over(stroll, ['Bbm', 'C']),
  over(held, ['Bbm', 'C']),
  [r(8)],
  hush(2)
];

/* ------------------------------------------------------------------ */
/* match: the first theme, pop-rock                                     */

// m1-hook, the chanted hook: F C Dm Bb | F C Bb Eb
const M1_HOOK: Note[][] = [
  [
    // The chant: up the triad to a held F pushed over the half bar.
    n('A4', 0.5, 0.8), n('C5', 0.5, 0.85), n('F5', 1.5), n('E5', 0.5, 0.85), n('D5', 1, 0.85),
    n('C5', 1.5, 0.9), r(0.5), n('C5', 0.5, 0.8), n('D5', 0.5, 0.85), n('E5', 1, 0.9),
    n('F5', 1), n('E5', 0.5, 0.85), n('D5', 1, 0.9), n('A4', 1.5, 0.85),
    n('Bb4', 2, 0.9), r(1), n('A4', 0.5, 0.75), n('Bb4', 0.5, 0.8),
    // The answer climbs a third higher to the A5 it has been holding back.
    n('C5', 0.5, 0.85), n('C5', 0.5, 0.85), n('F5', 1.5), n('G5', 0.5, 0.9), n('A5', 1),
    n('G5', 1.5, 0.95), n('F5', 0.5, 0.85), n('E5', 1, 0.9), n('C5', 1, 0.85),
    n('D5', 0.5, 0.85), n('F5', 1), n('Bb5', 1.5), n('A5', 0.5, 0.9), n('G5', 0.5, 0.85),
    // bVII, the anthem's borrowed colour.
    n('G5', 2), n('Eb5', 1, 0.9), r(0.5), n('C5', 0.5, 0.8)
  ],
  over(slap, ['F', 'C', 'Dm', 'Bb', 'F', 'C', 'Bb', 'Eb']),
  over(held, ['F', 'C', 'Dm', 'Bb', 'F', 'C', 'Bb', 'Eb']),
  groove(8, rock),
  stand(8, 750, 950)
];

// m1-verse, lower and answering in two-bar phrases: Dm Bb F C | Dm Bb Gm C
const M1_VERSE: Note[][] = [
  [
    n('A4', 1, 0.85), n('A4', 0.5, 0.75), n('Bb4', 0.5, 0.8), n('C5', 1, 0.85), n('A4', 1, 0.8),
    n('Bb4', 1, 0.85), n('A4', 0.5, 0.8), n('G4', 0.5, 0.75), n('F4', 2, 0.85),
    n('A4', 1, 0.85), n('A4', 0.5, 0.75), n('Bb4', 0.5, 0.8), n('C5', 1, 0.85), n('F5', 1),
    n('E5', 2.5, 0.9), r(0.5), n('C5', 0.5, 0.8), n('D5', 0.5, 0.85),
    n('F5', 1), n('E5', 0.5, 0.85), n('D5', 1, 0.9), n('C5', 0.5, 0.8), n('A4', 1, 0.8),
    n('Bb4', 0.5, 0.8), n('C5', 0.5, 0.85), n('D5', 3, 0.9),
    n('D5', 1, 0.9), n('C5', 0.5, 0.8), n('Bb4', 1, 0.85), n('G4', 1.5, 0.8),
    n('C5', 0.5, 0.8), n('D5', 0.5, 0.85), n('E5', 1, 0.9), n('G5', 1), r(1)
  ],
  over(slap, ['Dm', 'Bb', 'F', 'C', 'Dm', 'Bb', 'Gm', 'C']),
  over(restruck, ['Dm', 'Bb', 'F', 'C', 'Dm', 'Bb', 'Gm', 'C']),
  groove(8, rock),
  stand(8)
];

// m1-tag: Csus4 to C, two bars on the dominant.
const M1_TAG: Note[][] = [
  [r(0.5), n('F5', 1), n('E5', 0.5, 0.85), n('F5', 1, 0.9), n('G5', 1), n('E5', 3, 0.9), r(1)],
  over(slap, ['C', 'C']),
  [psg('C', 4, 0.9, [0, 5, 7]), psg('C', 4, 0.9)],
  [...rock(), ...fill()],
  stand(2, 900, 900)
];

/* ------------------------------------------------------------------ */
/* match-2: the second theme, dance-pop                                 */

// m2-riff, brass stabs over the Mixolydian vamp: F Eb Bb F | F Eb Bb C
const M2_RIFF: Note[][] = [
  [
    n('F5', 0.5), r(0.5), n('F5', 0.5, 0.85), n('C5', 0.5, 0.8), r(0.5), n('F5', 1), n('G5', 0.5, 0.85),
    n('G5', 0.5), r(0.5), n('G5', 0.5, 0.85), n('Eb5', 0.5, 0.8), r(0.5), n('G5', 1), n('Bb5', 0.5, 0.85),
    n('Bb5', 1), n('A5', 0.5, 0.85), n('F5', 1, 0.9), n('D5', 1.5, 0.85),
    n('C5', 2, 0.85), r(1), n('A4', 0.5, 0.75), n('C5', 0.5, 0.8),
    n('F5', 0.5), r(0.5), n('F5', 0.5, 0.85), n('C5', 0.5, 0.8), r(0.5), n('F5', 1), n('G5', 0.5, 0.85),
    n('G5', 0.5), r(0.5), n('G5', 0.5, 0.85), n('Eb5', 0.5, 0.8), r(0.5), n('G5', 1), n('Bb5', 0.5, 0.85),
    n('Bb5', 1), n('A5', 0.5, 0.85), n('F5', 1, 0.9), n('D5', 1.5, 0.85),
    n('E5', 1, 0.9), n('C5', 0.5, 0.8), n('D5', 0.5, 0.85), n('E5', 2, 0.9)
  ],
  over(disco, ['F', 'Eb', 'Bb', 'F', 'F', 'Eb', 'Bb', 'C']),
  over(stab, ['F', 'Eb', 'Bb', 'F', 'F', 'Eb', 'Bb', 'C']),
  groove(8, italo),
  stand(8, 700, 850)
];

// m2-chant, repeated notes the stand can shout back: Dm C Bb C | Dm C Bbm C
const M2_CHANT: Note[][] = [
  [
    n('D5', 0.5, 0.9), n('D5', 0.5, 0.8), n('D5', 0.5, 0.85), n('E5', 0.5, 0.85), n('F5', 1), n('D5', 1, 0.85),
    n('E5', 0.5, 0.9), n('E5', 0.5, 0.8), n('E5', 0.5, 0.85), n('F5', 0.5, 0.85), n('G5', 1.5), r(0.5),
    n('F5', 0.5, 0.9), n('F5', 0.5, 0.8), n('F5', 0.5, 0.85), n('G5', 0.5, 0.85), n('A5', 1), n('F5', 1, 0.85),
    n('G5', 2.5), r(0.5), n('E5', 0.5, 0.8), n('C5', 0.5, 0.8),
    n('D5', 0.5, 0.9), n('D5', 0.5, 0.8), n('D5', 0.5, 0.85), n('E5', 0.5, 0.85), n('F5', 1), n('A5', 1),
    n('G5', 0.5, 0.9), n('G5', 0.5, 0.8), n('E5', 0.5, 0.85), n('G5', 1), n('A5', 1.5),
    // The borrowed iv: the chant turns minor for a bar before the dominant.
    n('F5', 1), n('Db5', 1, 0.85), n('F5', 0.5, 0.85), n('Ab5', 1.5),
    n('G5', 3), r(1)
  ],
  over(disco, ['Dm', 'C', 'Bb', 'C', 'Dm', 'C', 'Bbm', 'C']),
  over(stab, ['Dm', 'C', 'Bb', 'C', 'Dm', 'C', 'Bbm', 'C']),
  groove(8, italo),
  stand(8, 800, 1000)
];

// m2-lift: Bb C Dm C, climbing back to the riff.
const M2_LIFT: Note[][] = [
  [
    n('D5', 1, 0.85), n('F5', 1, 0.9), n('Bb5', 1.5), n('A5', 0.5, 0.85),
    n('G5', 1), n('E5', 0.5, 0.85), n('C5', 1, 0.85), n('E5', 1.5, 0.9),
    n('F5', 1, 0.9), n('A5', 1), n('G5', 0.5, 0.9), n('F5', 0.5, 0.85), n('E5', 1, 0.85),
    n('E5', 0.5, 0.85), n('F5', 0.5, 0.9), n('G5', 3)
  ],
  over(disco, ['Bb', 'C', 'Dm', 'C']),
  over(held, ['Bb', 'C', 'Dm', 'C']),
  groove(4, italo),
  stand(4, 900, 1100)
];

/* ------------------------------------------------------------------ */
/* match-3: the third theme, a half-time ballad                         */

// m3-verse, on the relative minor: Dm Bb F C | Dm Bb C C
const M3_VERSE: Note[][] = [
  [
    r(0.5), n('A4', 0.5, 0.8), n('D5', 1, 0.9), n('E5', 0.5, 0.85), n('F5', 1.5),
    n('D5', 2, 0.9), r(0.5), n('Bb4', 0.5, 0.8), n('C5', 0.5, 0.85), n('D5', 0.5, 0.85),
    n('C5', 1, 0.85), n('A4', 1, 0.8), n('C5', 0.5, 0.85), n('F5', 1.5),
    n('E5', 3, 0.9), r(1),
    r(0.5), n('A4', 0.5, 0.8), n('D5', 1, 0.9), n('E5', 0.5, 0.85), n('F5', 1.5),
    n('G5', 1), n('F5', 0.5, 0.85), n('D5', 1, 0.9), n('Bb4', 1.5, 0.85),
    n('C5', 1, 0.85), n('E5', 1, 0.9), n('G5', 1), n('E5', 1, 0.85),
    n('D5', 0.5, 0.85), n('E5', 0.5, 0.85), n('C5', 3, 0.9)
  ],
  over(halfSlap, ['Dm', 'Bb', 'F', 'C', 'Dm', 'Bb', 'C', 'C']),
  over(restruck, ['Dm', 'Bb', 'F', 'C', 'Dm', 'Bb', 'C', 'C']),
  groove(8, broad),
  stand(8, 600, 700)
];

/** The chorus's first six bars, Bb C F Dm Bb C, shared by both statements. */
const M3_CHORUS_LEAD: Note[] = [
  n('D5', 0.5, 0.85), n('F5', 0.5, 0.9), n('Bb5', 2), n('A5', 0.5, 0.9), n('G5', 0.5, 0.85),
  n('G5', 1), n('E5', 0.5, 0.85), n('G5', 1), n('E5', 1.5, 0.85),
  // The C6 is the ceiling of the arrangement, reached once a chorus.
  n('F5', 0.5, 0.85), n('A5', 0.5, 0.9), n('C6', 2), n('A5', 1, 0.9),
  n('F5', 2.5, 0.9), r(0.5), n('D5', 0.5, 0.8), n('E5', 0.5, 0.85),
  n('F5', 0.5, 0.85), n('D5', 0.5, 0.8), n('Bb5', 2), n('A5', 0.5, 0.9), n('G5', 0.5, 0.85),
  n('G5', 1), n('E5', 0.5, 0.85), n('G5', 1), n('C5', 1.5, 0.85)
];
const M3_CHORUS_CHORDS: Chord[] = ['Bb', 'C', 'F', 'Dm', 'Bb', 'C'];

// m3-chorus: ... Eb C, through bVII.
const M3_CHORUS: Note[][] = [
  [...M3_CHORUS_LEAD, n('Eb5', 1, 0.9), n('G5', 1, 0.9), n('Bb5', 1.5), n('G5', 0.5, 0.85), n('G5', 4, 0.95)],
  over(halfSlap, [...M3_CHORUS_CHORDS, 'Eb', 'C']),
  over(held, [...M3_CHORUS_CHORDS, 'Eb', 'C']),
  groove(8, broad),
  stand(8, 750, 900)
];

// m3-chorus-2: ... Bbm C, through the borrowed iv the second time.
const M3_CHORUS_2: Note[][] = [
  [...M3_CHORUS_LEAD, n('Db5', 1, 0.9), n('F5', 1, 0.9), n('Ab5', 1.5), n('F5', 0.5, 0.85), n('E5', 2, 0.9), n('G5', 2)],
  over(halfSlap, [...M3_CHORUS_CHORDS, 'Bbm', 'C']),
  over(held, [...M3_CHORUS_CHORDS, 'Bbm', 'C']),
  groove(8, broad),
  stand(8, 800, 1000)
];

// m3-turn: C, then C7 back to the Dm at the top.
const M3_TURN: Note[][] = [
  [r(0.5), n('C5', 1, 0.85), n('E5', 0.5, 0.85), n('G5', 2), n('Bb5', 2), n('A5', 1, 0.9), n('G5', 1, 0.85)],
  over(halfSlap, ['C', 'C']),
  [psg('C', 4, 0.9), psg('C', 4, 0.9, [0, 4, 7, 10])],
  [...broad(), ...fill()],
  stand(2, 900, 900)
];

/* ------------------------------------------------------------------ */
/* final: its own fanfare and strain, then the first theme's hook       */

// final-a, a triadic fanfare: F Bb F C | F Bb Eb C
const FINAL_A: Note[][] = [
  [
    n('C5', 0.5, 0.85), n('F5', 0.5, 0.9), n('A5', 1), n('G5', 0.5, 0.85), n('F5', 1), n('C5', 0.5, 0.8),
    n('D5', 0.5, 0.85), n('F5', 0.5, 0.9), n('Bb5', 1.5), n('A5', 0.5, 0.85), n('F5', 1, 0.9),
    n('A5', 1), n('G5', 0.5, 0.85), n('F5', 0.5, 0.85), n('C5', 1, 0.85), n('F5', 1, 0.9),
    n('G5', 3), r(0.5), n('C5', 0.5, 0.8),
    n('C5', 0.5, 0.85), n('F5', 0.5, 0.9), n('A5', 1), n('G5', 0.5, 0.85), n('F5', 1), n('C5', 0.5, 0.8),
    n('D5', 0.5, 0.85), n('F5', 0.5, 0.9), n('Bb5', 1.5), n('C6', 0.5), n('Bb5', 1, 0.9),
    n('G5', 1), n('Eb5', 0.5, 0.85), n('G5', 1), n('Bb5', 1.5),
    n('G5', 2, 0.95), n('E5', 1, 0.9), n('C5', 1, 0.85)
  ],
  over(gallop, ['F', 'Bb', 'F', 'C', 'F', 'Bb', 'Eb', 'C']),
  over(blaze, ['F', 'Bb', 'F', 'C', 'F', 'Bb', 'Eb', 'C']),
  groove(8, drive),
  stand(8, 900, 1100)
];

// final-b, the final's own strain: Dm Bb F C | Gm Bb Bbm C
const FINAL_B: Note[][] = [
  [
    n('F5', 1, 0.9), n('E5', 0.5, 0.85), n('D5', 0.5, 0.85), n('A4', 1, 0.8), n('D5', 1, 0.85),
    n('F5', 0.5, 0.85), n('G5', 0.5, 0.9), n('F5', 1, 0.9), n('D5', 2, 0.85),
    n('C5', 0.5, 0.8), n('F5', 1), n('A5', 1), n('G5', 0.5, 0.85), n('F5', 1, 0.9),
    n('E5', 2, 0.9), n('G5', 2),
    n('Bb5', 1), n('A5', 0.5, 0.9), n('G5', 0.5, 0.85), n('D5', 1, 0.85), n('G5', 1, 0.9),
    n('F5', 0.5, 0.85), n('D5', 0.5, 0.8), n('F5', 1, 0.9), n('Bb5', 2),
    n('Ab5', 1), n('F5', 0.5, 0.85), n('Db5', 1, 0.85), n('F5', 1.5, 0.9),
    n('E5', 0.5, 0.85), n('F5', 0.5, 0.9), n('G5', 3)
  ],
  over(gallop, ['Dm', 'Bb', 'F', 'C', 'Gm', 'Bb', 'Bbm', 'C']),
  over(blaze, ['Dm', 'Bb', 'F', 'C', 'Gm', 'Bb', 'Bbm', 'C']),
  groove(8, drive),
  stand(8, 1000, 1200)
];

// final-tag: C, then C7 back to the fanfare.
const FINAL_TAG: Note[][] = [
  [r(0.5), n('G5', 1), n('E5', 0.5, 0.85), n('G5', 1, 0.9), n('A5', 1), n('Bb5', 2), n('G5', 1, 0.9), n('E5', 1, 0.85)],
  over(gallop, ['C', 'C']),
  [psg('C', 4, 0.9, MAJOR_OCT), psg('C', 4, 0.9, [0, 4, 7, 10])],
  [...drive(), ...fill()],
  stand(2, 1200, 1200)
];

/* ------------------------------------------------------------------ */
/* shootout: the tension bed                                            */

// A C pedal under C | Db/C | C | Bbm/C, twice, then Db | Eb.
const SHOOTOUT: Note[][] = [
  [
    r(2), n('G4', 2, 0.8),
    n('Ab4', 2.5, 0.85), n('G4', 1.5, 0.8),
    n('G4', 4, 0.8),
    r(1), n('F4', 0.5, 0.75), n('Ab4', 1, 0.8), n('Db5', 1.5, 0.85),
    r(2), n('C5', 2, 0.85),
    n('Db5', 2.5, 0.9), n('C5', 1.5, 0.85),
    n('C5', 4, 0.85),
    r(1), n('Bb4', 1, 0.8), n('Ab4', 1, 0.8), n('G4', 1, 0.8),
    // The repeated notes tighten: the run-up.
    n('Ab4', 0.5, 0.8), n('Ab4', 0.5, 0.8), n('Ab4', 0.5, 0.85), n('Ab4', 0.5, 0.85), n('Bb4', 1, 0.9), n('Ab4', 1, 0.85),
    n('Bb4', 0.5, 0.8), n('Bb4', 0.5, 0.85), n('Bb4', 0.5, 0.85), n('Bb4', 0.5, 0.9), n('C5', 1, 0.9), n('Bb4', 0.5, 0.85), n('G4', 0.5, 0.8)
  ],
  [...Array.from({ length: 8 }, () => thump('C')).flat(), ...thump('Db'), ...thump('Eb')],
  [...over(held, ['C', 'Db', 'C', 'Bbm', 'C', 'Db', 'C', 'Bbm']), ...over(restruck, ['Db', 'Eb'])],
  Array.from({ length: 10 }, heart).flat(),
  [roar(500, 32, 0.7), roar(600, 8, 0.8)]
];

// shootout-turn: Db, then G, the dominant's dominant, which will not resolve.
const SHOOTOUT_TURN: Note[][] = [
  [n('Ab4', 0.5, 0.85), n('Db5', 1), n('C5', 0.5, 0.85), n('Ab4', 2, 0.85), n('B4', 2, 0.9), n('D5', 2, 0.9)],
  over(thump, ['Db', 'G']),
  over(held, ['Db', 'G']),
  [...heart(), ...snareRoll()],
  [roar(700, 8, 0.9)]
];

/* ------------------------------------------------------------------ */
/* intro: the title fanfare                                             */

/**
 * Two bars before the menu's first, played once each time the music starts
 * from silence: the press of start, the return from attract mode, and the
 * title screen after a run has ended. That is where a Mega Drive cartridge put
 * its title jingle, between the Sega logo and the menu theme. A brass run up
 * the F triad over the octave-bouncing slap bass, then C7 held, which hands
 * the dominant to the menu's opening F. No drums or crowd: both voices are
 * layers the match owns, and the menu they lead into has neither.
 */
const INTRO: Note[][] = [
  [
    n('F4', 0.5, 0.8), n('A4', 0.5, 0.85), n('C5', 0.5, 0.85), n('F5', 0.5, 0.9), n('A5', 1), r(0.5), n('G5', 0.5, 0.85),
    n('E5', 0.5, 0.85), n('G5', 0.5, 0.9), n('Bb5', 1, 0.95), n('C6', 2)
  ],
  [
    n('F2', 0.5), n('F3', 0.5, 0.8), n('F2', 0.5, 0.9), n('F3', 0.5, 0.8), n('F2', 1, 0.9), r(1),
    n('C2', 0.5), n('C3', 0.5, 0.8), n('C2', 0.5, 0.9), n('C3', 0.5, 0.8), n('C2', 2, 0.85)
  ],
  [psg('F', 4, 0.85, MAJOR_OCT), psg('C', 4, 0.85, [0, 4, 7, 10])],
  [r(8)],
  hush(2)
];

/* ------------------------------------------------------------------ */
/* stingers                                                             */

/**
 * The match's moments, one line per track (lead, bass, psg, drums, crowd).
 * They play over the running music, which ducks under them, so the loop keeps
 * its place. A stinger goes past the layers, so its drums and its crowd sound
 * even while those layers are out: the goal's roar is written here.
 */
const STINGERS: Record<string, Note[][]> = {
  // A snare pickup and a brass hit: the whistle has gone.
  'kick-off': [
    [r(1), n('C5', 0.5, 0.85), n('F5', 2.5)],
    [r(1), n('F2', 0.5), n('F3', 2.5, 0.8)],
    [r(1), psg('F', 3, 0.9)],
    [hit('snare', 0.25, 0.5), hit('snare', 0.25, 0.65), hit('snare', 0.25, 0.8), hit('snare', 0.25, 0.95), kick(1, 1), r(2)],
    [r(1), roar(1200, 3, 0.8)]
  ],
  // The triad run up to the ceiling over the roar, the loudest thing the score does.
  'goal-for': [
    [n('C5', 0.5, 0.85), n('F5', 0.5, 0.9), n('A5', 0.5, 0.95), n('C6', 2.5)],
    [n('F2', 0.5), n('F3', 0.5, 0.8), n('F2', 0.5), n('F3', 2.5, 0.85)],
    [psg('F', 4, 0.9, MAJOR_OCT)],
    [hit('snare', 0.25), hit('snare', 0.25), kick(0.5, 1), hit('snare', 0.5), kick(0.5, 1), kick(2, 1)],
    [roar(2400, 4)]
  ],
  // A sigh down through the borrowed iv, and a groan from the stand.
  'goal-against': [
    [n('Db5', 1, 0.8), n('C5', 1, 0.75), n('Bb4', 2, 0.7)],
    [n('Bb1', 2, 0.8), n('F2', 2, 0.7)],
    [psg('Bbm', 2, 0.7), psg('F', 2, 0.6)],
    [kick(1, 0.6), r(3)],
    [roar(450, 3, 0.6), r(1)]
  ],
  // A plagal amen, Bb to F, over a murmur of applause: nothing is lost yet.
  'half-time': [
    [n('A4', 1, 0.8), n('G4', 1, 0.75), n('F4', 2, 0.75)],
    [n('Bb1', 2, 0.8), n('F2', 2, 0.75)],
    [psg('Bb', 2, 0.7), psg('F', 2, 0.7)],
    [r(4)],
    [roar(700, 4, 0.5)]
  ],
  // Three blasts on C, peep, peep, peeeep, and the stand rising after them.
  'full-time': [
    [n('C6', 0.5), r(0.5), n('C6', 0.5), r(0.5), n('C6', 2)],
    [n('F2', 0.5, 0.8), r(0.5), n('F2', 0.5, 0.8), r(0.5), n('F2', 2, 0.8)],
    [r(2), psg('F', 2, 0.8)],
    [hit('snare', 0.5), r(0.5), hit('snare', 0.5), r(0.5), kick(2, 1)],
    [r(2), roar(1500, 2, 0.8)]
  ],
  // The run's two endings, played through `playEnding`: the loop stops under
  // them and they sound alone, then the music is off until the title screen
  // starts it again. An ending may land home, which a loop's seam may not.
  //
  // Knocked out: two bars sinking through the borrowed iv, F to Bbm to F, the
  // bass bouncing its octaves more slowly each time, and the stand groaning.
  eliminated: [
    [n('C5', 1, 0.85), n('Bb4', 0.5, 0.8), n('A4', 0.5, 0.8), n('Db5', 2, 0.8), n('C5', 1, 0.75), n('A4', 1, 0.7), n('F4', 2, 0.7)],
    [n('F2', 1, 0.85), n('F3', 1, 0.7), n('Bb1', 1, 0.8), n('Bb2', 1, 0.65), n('F2', 4, 0.7)],
    [psg('F', 2, 0.7), psg('Bbm', 2, 0.7), psg('F', 4, 0.6)],
    [kick(1, 0.6), r(3), kick(1, 0.5), r(3)],
    [roar(450, 4, 0.6), roar(400, 4, 0.45)]
  ],
  // Champions: four bars of the final's fanfare, F Bb C F, the one V to I in
  // the score, over its galloping bass and groove and the loudest roar.
  champion: [
    [
      n('C5', 0.5, 0.85), n('F5', 0.5, 0.9), n('A5', 0.5, 0.95), n('C6', 1.5), n('A5', 0.5, 0.9), n('C6', 0.5),
      n('Bb5', 1.5), n('A5', 0.5, 0.9), n('F5', 1, 0.9), n('Bb5', 1),
      n('C6', 1), n('Bb5', 0.5, 0.9), n('A5', 0.5, 0.9), n('G5', 1, 0.9), n('E5', 0.5, 0.85), n('G5', 0.5, 0.9),
      n('F5', 0.5), n('A5', 0.5, 0.95), n('C6', 3)
    ],
    [...over(gallop, ['F', 'Bb', 'C']), n('F2', 0.5), n('F3', 0.5, 0.85), n('F2', 0.5), n('F3', 2.5, 0.85)],
    [...over(blaze, ['F', 'Bb', 'C']), psg('F', 4, 0.9, MAJOR_OCT)],
    [...drive(), ...drive(), ...fill(), kick(1, 1), hit('snare', 0.5), hit('snare', 0.5), kick(2, 1)],
    [roar(1800, 8, 0.85), roar(2400, 8)]
  ]
};

/** The stingers that end a run, through `playEnding`; every other one marks a moment in a match. */
export const ENDINGS = ['eliminated', 'champion'] as const;

export const FOOTBALL_MUSIC: GameAudioOptions = {
  tempo: BASE_TEMPO,
  // FM voices that hold their sustain are louder for their peak than the old
  // plucks: at 0.1 the match measured 8.5 dB hotter (RMS) than before, so the
  // bus is trimmed to sit near the rest of the floor.
  volume: 0.065,
  tonic: p('F3'),
  tracks: [
    {
      // LEAD, YM2612 brass: ratio 1 at a high index is the bright FM brass
      // tone, the adsr's 40 ms rise is the swell as it speaks, and the slow
      // index fall lets a held note mellow. The vibrato is the chip's LFO.
      name: 'lead',
      wave: 'sine',
      fm: { ratio: 1, index: 2.6, indexDecay: 0.9 },
      adsr: { attack: 0.04, decay: 0.3, sustain: 0.72, release: 0.12 },
      vibrato: 5,
      volume: 0.8
    },
    {
      // BASS, YM2612 slap: a large index collapsing in 90 ms is the twang,
      // then the note settles to a round sine for its octave bounce.
      name: 'bass',
      wave: 'sine',
      fm: { ratio: 1, index: 4.5, indexDecay: 0.09 },
      adsr: { attack: 0.002, decay: 0.2, sustain: 0.35, release: 0.04 },
      volume: 0.85
    },
    {
      // PSG, the SN76489: a bare square cycling each chord at the NTSC frame
      // rate, the chip's way of playing harmony on one channel. Kept under the
      // brass, as the PSG sat under the FM.
      name: 'psg',
      wave: 'square',
      arpRate: 60,
      adsr: { attack: 0.002, decay: 0.25, sustain: 0.55, release: 0.05 },
      volume: 0.26
    },
    {
      // DRUMS, the DAC channel: the kick is this voice's pitched note, swept
      // two octaves down in 35 ms; the snare and hats are the engine's noise.
      // A layer the kick-off brings in and half-time and full time take out.
      name: 'drums',
      wave: 'sine',
      pitchEnv: { semitones: 24, time: 0.035 },
      adsr: { attack: 0.001, decay: 0.16, sustain: 0, release: 0.03 },
      volume: 0.7,
      startsMuted: true
    },
    {
      // CROWD, sustained noise under a low-pass at each note's frequency in
      // hertz. Slow to rise and slow to fall, like a stand, and low in the mix:
      // a shot or a goal swells it in and `game.ts` lets it fall away again.
      // A low-passed murmur carries little energy, so the level is high on
      // paper; rendered, the crowd sits about 14 dB under the tune.
      name: 'crowd',
      wave: 'noise',
      adsr: { attack: 0.35, decay: 0.5, sustain: 0.8, release: 0.9 },
      volume: 0.8,
      startsMuted: true
    }
  ],
  form: {
    intro: INTRO,
    sections: {
      'title-a': TITLE_A,
      'title-b': TITLE_B,
      'title-turn': TITLE_TURN,
      'm1-hook': M1_HOOK,
      'm1-verse': M1_VERSE,
      'm1-tag': M1_TAG,
      'm2-riff': M2_RIFF,
      'm2-chant': M2_CHANT,
      'm2-lift': M2_LIFT,
      'm3-verse': M3_VERSE,
      'm3-chorus': M3_CHORUS,
      'm3-chorus-2': M3_CHORUS_2,
      'm3-turn': M3_TURN,
      'final-a': FINAL_A,
      'final-b': FINAL_B,
      'final-tag': FINAL_TAG,
      shootout: SHOOTOUT,
      'shootout-turn': SHOOTOUT_TURN
    },
    // The menu is where the music starts, and where every screen between matches goes back to.
    order: [...SCENES.menu],
    scenes: {
      match: { order: [...SCENES.match] },
      'match-2': { order: [...SCENES['match-2']] },
      'match-3': { order: [...SCENES['match-3']] },
      final: { order: [...SCENES.final], tempo: FINAL_TEMPO },
      shootout: { order: [...SCENES.shootout] }
    }
  },
  stingers: STINGERS
};
