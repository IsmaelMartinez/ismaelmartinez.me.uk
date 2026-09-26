/**
 * CALCIO '90's score: a terrace anthem in D major, and the tournament around it.
 *
 * The cabinet is an Italia '90 homage, so the tune is the thing a tournament
 * theme is: massed brass over a stadium backbeat, major key, sung rather than
 * played. That is what separates it from the arcade's other march. Tank Duel is
 * a bouncy oom-pah with the weight on beats 1 and 3; this one puts every accent
 * on 2 and 4, where a terrace claps, in the bass's third eighth and in the
 * snare, and hangs long held notes over the top of it. The echo is the other
 * half of the identity, a long wash rather than Tank Duel's tight slap, which is
 * what an open stand sounds like.
 *
 * Key and mode. D major throughout, with the parallel minor's bVI (Bb) and bVII
 * (C) as the house colour: the chorus turns through C and Bb before it comes
 * back, and the final's own strain climbs Bb, C into the chorus. The shootout
 * bed sits on an A pedal under Bb and G minor, the dominant held and never
 * resolved, and hands back to its top on A over E, the cadential six-four.
 *
 * Form. One `form` holds four scenes, each a group of sections, and the game
 * moves between them with `setSection` and `setDanger` (see `SCENES`):
 *
 * - menu, 18 bars (title-a, title-b, title-turn): the title and team-select
 *   theme, also heard on the full-time, tables, bracket and end screens. No
 *   drums and a half-time bass; the anthem's repeated-note pickup is its hook.
 * - match, 32 bars (match-a, match-b, match-a2, match-c, match-turn): the
 *   anthem. A call and answer, a chorus through bVII and bVI, the call again
 *   with an altered answer, and a bridge in B minor that walks up to the turn.
 * - final, 32 bars, the danger order (final-a, final-b, match-b, final-c): a
 *   separately written final theme after Nintendo World Cup's, with a driving
 *   octave bass and its own drum pattern, at `FINAL_TEMPO`. It borrows the
 *   chorus rather than the call, so it is recognisably the same tournament.
 * - shootout, 13 bars (shootout, shootout-turn): a tension bed over a
 *   heartbeat, the lead in long held notes and repeated-note figures.
 *
 * Each scene's last section is a single-bar turn, and every turn reaches the
 * scene's top through V (the match, the menu, the final) or the six-four (the
 * shootout), never V to I. The game holds a scene by asking for its first
 * section while the turn plays, so it loops instead of running on into the next
 * scene; a single bar is what lets that request land on the turn's own end.
 *
 * Length. One pass of the whole order is 63 bars: 114.5 s at `BASE_TEMPO`, 99.5
 * s at `FINAL_TEMPO`. The part a player actually hears on repeat is shorter,
 * and it is sized on its own: the match is 58.2 s at 132 (group) and 53.7 s at
 * 143 (semi), the final 50.5 s at 152, the menu 32.7 s at 132 and the shootout
 * 20.5 s at 152. `tests/games/football-music.test.ts` holds each scene to the
 * gates on its own.
 *
 * Session and load. A run is a whole tournament, three group matches, a semi
 * and a final of about 65 to 90 s each plus the screens between them and up to
 * two shootouts, so the session is long, which is the floor the profile below
 * sets. The load is high during play (the player is steering, passing and
 * shooting against the clock), which is why the lead stays diatonic and
 * singable and the drums come in only while the ball is live.
 *
 * Adaptive hooks, all wired in `game.ts` from events the match already raises:
 * the drums are a `startsMuted` layer that the kick-off brings in and half-time
 * and full time take out, the stage ramp winds the tempo (132, 143, then the
 * final's own 152), the final switches to the danger order, the shootout jumps
 * to its bed, the static screens jump to the menu theme, and `STINGERS` mark
 * the kick-off, a goal for, a goal against, half-time and the final whistle.
 * Pause muffles the music with `setPaused`, and attract mode keeps it off.
 *
 * A crowd layer of filtered noise swelling on shots was in scope only if the
 * engine's drums made it cheap. They do not: a drum is a fixed hit of at most
 * 0.15 s, so a sustained roar would be a roll of snares, which reads as a
 * snare roll. It is left out.
 */
import { p, REST, type DrumName, type GameAudioOptions, type MusicProfile, type Note } from '../engine';

/**
 * The score's own tempo, the pace it was written at and the one the group
 * stage and the menus play. It lives here and not in `game.ts` for the same
 * reason Cascade's does: it is a property of the arrangement, whereas how far a
 * run winds it up is policy about the game. `stageTempo()` keeps the ramp.
 *
 * A stage change is safe mid-loop: the engine's `setTempo` rescales every
 * pending cursor by the tempo ratio, so the voices re-time together instead of
 * the sustained pad sliding behind the plucked ones.
 */
export const BASE_TEMPO = 132;

/**
 * The final's tempo, the fastest `stageTempo()` winds the score to and the
 * danger order's own. It lives here with `BASE_TEMPO` because ADR 003 sizes a
 * ramping loop at its fastest tempo, so this is the number the score is
 * measured against.
 */
export const FINAL_TEMPO = 152;

/** A run is a whole tournament, so the loop is held to the long-session floor at the final's tempo. */
export const MUSIC_PROFILE: MusicProfile = {
  session: 'long',
  fastestTempo: FINAL_TEMPO
};

/** The scenes the game moves the score between. The final is the danger order, not a group of `order`. */
export type Scene = 'menu' | 'match' | 'shootout';

/**
 * Each scene's sections in `order`, first to last. The last one is the scene's
 * one-bar turn: while it plays the game asks for the first, which is how a
 * scene loops on its own inside the one order.
 */
export const SCENES: Record<Scene, readonly string[]> = {
  menu: ['title-a', 'title-b', 'title-turn'],
  match: ['match-a', 'match-b', 'match-a2', 'match-c', 'match-turn'],
  shootout: ['shootout', 'shootout-turn']
};

/** The final's order, looping on its own while the final is played. */
export const FINAL_ORDER: readonly string[] = ['final-a', 'final-b', 'match-b', 'final-c'];

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

/** The same bar, `times` over. */
function times(count: number, bar: () => Note[]): Note[] {
  return Array.from({ length: count }, bar).flat();
}

/* ------------------------------------------------------------------ */
/* bass figures                                                         */

/**
 * The terrace backbeat: two low eighths and then the accent on the fifth,
 * twice a bar, boom-boom-clap. The accent lands on beats 2 and 4, which is what
 * makes it read as a crowd rather than a marching band. `second` replaces the
 * second fifth, for a seventh.
 */
function terrace(root: string, fifth: string, lift = 0, second = fifth): Note[] {
  return [
    n(root, 0.5, 0.8 + lift),
    n(root, 0.5, 0.6 + lift),
    n(fifth, 1),
    n(root, 0.5, 0.8 + lift),
    n(root, 0.5, 0.6 + lift),
    n(second, 1)
  ];
}

/** The menu's half-time bass: root on the downbeat, fifth on the half bar, no clap. */
function halfTime(root: string, fifth: string): Note[] {
  return [n(root, 2, 0.8), n(fifth, 2, 0.6)];
}

/** The bridge's walking quarters, leaning on 2 and 4. */
function walk(a: string, b: string, c: string, d: string): Note[] {
  return [n(a, 1, 0.75), n(b, 1), n(c, 1, 0.75), n(d, 1)];
}

/** The final's driving octaves, eighths with the accent still on 2 and 4. */
function drive(root: string, octave: string): Note[] {
  return [
    n(root, 0.5, 0.75),
    n(octave, 0.5, 0.55),
    n(root, 0.5),
    n(octave, 0.5, 0.55),
    n(root, 0.5, 0.75),
    n(octave, 0.5, 0.55),
    n(root, 0.5),
    n(octave, 0.5, 0.55)
  ];
}

/** The shootout's heartbeat, lub-dub twice a bar. */
function heartbeat(root: string): Note[] {
  return [n(root, 0.5, 0.9), n(root, 0.5, 0.55), r(1), n(root, 0.5, 0.8), n(root, 0.5, 0.5), r(1)];
}

/* ------------------------------------------------------------------ */
/* drum figures                                                         */

/** Kick on 1 and 3, the terrace's clap on 2 and 4, hats between. */
function groove(): Note[] {
  return [
    hit('kick', 0.5),
    hit('hat', 0.5, 0.6),
    hit('snare', 0.5),
    hit('hat', 0.5, 0.6),
    hit('kick', 0.5, 0.9),
    hit('hat', 0.5, 0.6),
    hit('snare', 0.5),
    hit('hat', 0.5, 0.6)
  ];
}

/** The final's groove: an extra kick pushing into beat 3. */
function finalGroove(): Note[] {
  return [
    hit('kick', 0.5),
    hit('hat', 0.5, 0.6),
    hit('snare', 0.5),
    hit('kick', 0.5, 0.7),
    hit('kick', 0.5, 0.9),
    hit('hat', 0.5, 0.6),
    hit('snare', 0.5),
    hit('hat', 0.5, 0.7)
  ];
}

/** A phrase-end fill: half a bar of groove and a run of snares into the next downbeat. */
function fill(): Note[] {
  return [
    hit('kick', 0.5),
    hit('hat', 0.5, 0.6),
    hit('snare', 0.5),
    hit('hat', 0.5, 0.6),
    hit('snare', 0.25, 0.55),
    hit('snare', 0.25, 0.65),
    hit('snare', 0.25, 0.75),
    hit('snare', 0.25, 0.85),
    hit('kick', 0.5),
    hit('snare', 0.5)
  ];
}

/** The shootout's kick, doubling the bass heartbeat. */
function pulse(): Note[] {
  return [hit('kick', 0.5, 0.9), hit('kick', 0.5, 0.55), r(1), hit('kick', 0.5, 0.8), hit('kick', 0.5, 0.5), r(1)];
}

/** The shootout's last four bars: the heartbeat with ticking hats. */
function ticking(): Note[] {
  return [
    hit('kick', 0.5, 0.9),
    hit('hat', 0.5, 0.5),
    hit('hat', 0.5, 0.55),
    hit('hat', 0.5, 0.6),
    hit('kick', 0.5, 0.8),
    hit('hat', 0.5, 0.5),
    hit('hat', 0.5, 0.55),
    hit('hat', 0.5, 0.6)
  ];
}

/* ------------------------------------------------------------------ */
/* menu: the title and team-select theme                                */

// title-a: D | C | G | D | Bm | G | Bb | A
const TITLE_A: Note[][] = [
  [
    // The anthem's repeated-note pickup, then a long note to sing on.
    n('A4', 0.5, 0.75), n('A4', 0.5, 0.7), n('D5', 3),
    n('E5', 1.5, 0.9), n('D5', 0.5, 0.8), n('C5', 1, 0.85), n('G4', 1, 0.8),
    n('B4', 2, 0.9), n('D5', 1, 0.85), n('G5', 1),
    n('F#5', 3), r(1),
    // The same figure a third up, the pickup leaping a fifth.
    n('B4', 0.5, 0.75), n('B4', 0.5, 0.7), n('F#5', 3),
    n('G5', 1.5, 0.9), n('F#5', 0.5, 0.8), n('E5', 1, 0.85), n('D5', 1, 0.85),
    n('D5', 1, 0.85), n('F5', 2), n('D5', 1, 0.8),
    n('E5', 3, 0.9), r(0.5), n('A4', 0.5, 0.7)
  ],
  [
    ...halfTime('D2', 'A2'), ...halfTime('C3', 'G2'), ...halfTime('G2', 'D3'), ...halfTime('D2', 'A2'),
    ...halfTime('B2', 'F#2'), ...halfTime('G2', 'D3'), ...halfTime('Bb2', 'F2'), ...halfTime('A2', 'E2')
  ],
  [
    n('A3', 4, 0.55), n('G3', 4, 0.55), n('B3', 4, 0.6), n('A3', 4, 0.6),
    n('D4', 4, 0.6), n('B3', 4, 0.65), n('D4', 4, 0.7), n('C#4', 4, 0.7)
  ],
  [r(32)]
];

// title-b: G | D/F# | Em | A | Bm | C | G | Bb
const TITLE_B: Note[][] = [
  [
    n('B4', 0.5, 0.75), n('D5', 0.5, 0.8), n('G5', 3),
    n('F#5', 1.5, 0.9), n('E5', 0.5, 0.8), n('D5', 1, 0.85), n('A4', 1, 0.8),
    // The arch's top.
    n('E5', 0.5, 0.8), n('G5', 0.5, 0.85), n('B5', 3),
    n('A5', 1.5, 0.95), n('G5', 0.5, 0.85), n('E5', 1, 0.9), n('C#5', 1, 0.85),
    n('D5', 2, 0.9), n('B4', 1, 0.8), n('D5', 1, 0.85),
    n('E5', 1.5, 0.9), n('D5', 0.5, 0.8), n('C5', 2, 0.85),
    n('B4', 3, 0.85), r(1),
    n('D5', 1, 0.85), n('F5', 1.5, 0.9), n('D5', 0.5, 0.8), n('Bb4', 1, 0.8)
  ],
  [
    ...halfTime('G2', 'D3'), ...halfTime('F#2', 'A2'), ...halfTime('E2', 'B2'), ...halfTime('A2', 'E3'),
    ...halfTime('B2', 'F#2'), ...halfTime('C3', 'G2'), ...halfTime('G2', 'D3'), ...halfTime('Bb2', 'F2')
  ],
  [
    n('D4', 4, 0.6), n('A3', 4, 0.6), n('G3', 4, 0.65), n('C#4', 4, 0.7),
    n('D4', 4, 0.7), n('E4', 4, 0.7), n('D4', 4, 0.65), n('D4', 4, 0.7)
  ],
  [r(32)]
];

// title-turn: A, a half cadence back to the D at the top.
const TITLE_TURN: Note[][] = [
  [n('C#5', 1, 0.8), n('E5', 1.5, 0.85), r(1.5)],
  [...halfTime('A2', 'E2')],
  [n('C#4', 4, 0.7)],
  [r(4)]
];

/* ------------------------------------------------------------------ */
/* match: the anthem                                                    */

/** The call, bars 1 to 4 of both statements: D | G | A | D. */
const CALL_LEAD: Note[] = [
  n('A4', 0.5, 0.75), n('A4', 0.5, 0.7), n('D5', 1.5), n('E5', 0.5, 0.85), n('F#5', 1),
  n('E5', 1.5, 0.9), n('F#5', 0.5, 0.8), n('G5', 1), n('E5', 1, 0.85),
  n('F#5', 1.5, 0.9), n('E5', 0.5, 0.8), n('D5', 1, 0.85), n('E5', 1, 0.85),
  // A held tonic and a bar's breath; the terrace answers here.
  n('D5', 2, 0.9), r(1), n('A4', 1, 0.75)
];
const CALL_BASS: Note[] = [
  ...terrace('D2', 'A2'), ...terrace('G2', 'D3'), ...terrace('A2', 'E3'), ...terrace('D2', 'A2')
];
const CALL_CHOIR: Note[] = [n('F#3', 4, 0.6), n('G3', 4, 0.65), n('E3', 4, 0.65), n('F#3', 4, 0.7)];

/** The answer's first half, the call's shape a third lower: Bm | G. */
const ANSWER_LEAD: Note[] = [
  n('B4', 0.5, 0.75), n('B4', 0.5, 0.7), n('F#5', 1.5), n('E5', 0.5, 0.85), n('D5', 1, 0.85),
  n('G5', 1.5, 0.9), n('F#5', 0.5, 0.8), n('E5', 1, 0.85), n('D5', 1, 0.85)
];

// match-a: D G A D | Bm G A D
const MATCH_A: Note[][] = [
  [
    ...CALL_LEAD,
    ...ANSWER_LEAD,
    // The C#5 is the leading tone, leaning back to the tonic.
    n('C#5', 1.5, 0.9), n('D5', 0.5, 0.8), n('E5', 1, 0.85), n('F#5', 1, 0.9),
    // Then the leap up a fifth that launches the chorus.
    n('D5', 2, 0.9), r(0.5), n('A5', 1.5)
  ],
  [...CALL_BASS, ...terrace('B2', 'F#3'), ...terrace('G2', 'D3'), ...terrace('A2', 'E3'), ...terrace('D2', 'A2')],
  [...CALL_CHOIR, n('F#3', 4, 0.75), n('G3', 4, 0.8), n('A3', 4, 0.85), n('F#3', 4, 0.85)],
  [...times(7, groove), ...fill()]
];

// match-b, the chorus: G D A7 D | C G Bb A
const MATCH_B: Note[][] = [
  [
    n('B5', 1.5), n('A5', 0.5, 0.9), n('G5', 1, 0.95), n('A5', 1, 0.95),
    // The D6 is the ceiling of the arrangement, hit once.
    n('F#5', 1.5), n('A5', 0.5, 0.9), n('D6', 1), n('A5', 1, 0.95),
    n('B5', 1.5), n('A5', 0.5, 0.9), n('G5', 1, 0.95), n('F#5', 1, 0.9),
    n('E5', 0.5, 0.85), n('F#5', 0.5, 0.9), n('D5', 2.5), r(0.5),
    // bVII: a pushed repeated G, the terrace chanting it back.
    r(0.5), n('G5', 0.5, 0.85), n('G5', 0.5, 0.85), n('A5', 1), n('G5', 0.5, 0.9), n('E5', 1, 0.9),
    n('D5', 1.5, 0.9), n('E5', 0.5, 0.85), n('G5', 2),
    // bVI, the borrowed F natural.
    n('F5', 1.5), n('G5', 0.5, 0.9), n('F5', 1, 0.9), n('D5', 1, 0.85),
    n('E5', 2.5, 0.9), n('C#5', 1, 0.85), r(0.5)
  ],
  [
    ...terrace('G2', 'D3', 0.1), ...terrace('D2', 'A2', 0.1), ...terrace('A2', 'E3', 0.1, 'G3'),
    ...terrace('D2', 'A2', 0.1), ...terrace('C3', 'G3', 0.1), ...terrace('G2', 'D3', 0.1),
    ...terrace('Bb2', 'F3', 0.1), ...terrace('A2', 'E3', 0.1)
  ],
  [
    n('B3', 2, 0.95), n('G3', 2, 0.95), n('A3', 2), n('F#3', 2), n('G3', 2), n('E3', 2, 0.95),
    n('F#3', 2, 0.85), n('D3', 2, 0.75), n('G3', 2, 0.85), n('E3', 2, 0.85), n('B3', 2, 0.85),
    n('D4', 2, 0.85), n('D4', 2, 0.9), n('F3', 2, 0.9), n('C#4', 4, 0.9)
  ],
  [...times(7, groove), ...fill()]
];

// match-a2: the call again, answered differently: D G A D | Bm G C A
const MATCH_A2: Note[][] = [
  [
    ...CALL_LEAD,
    ...ANSWER_LEAD,
    n('E5', 1.5, 0.9), n('D5', 0.5, 0.8), n('C5', 1, 0.85), n('D5', 1, 0.85),
    n('A4', 0.5, 0.75), n('C#5', 0.5, 0.8), n('E5', 1.5, 0.9), n('A5', 1.5)
  ],
  [...CALL_BASS, ...terrace('B2', 'F#3'), ...terrace('G2', 'D3'), ...terrace('C3', 'G3'), ...terrace('A2', 'E3')],
  [...CALL_CHOIR, n('F#3', 4, 0.75), n('G3', 4, 0.8), n('E3', 4, 0.85), n('E3', 4, 0.85)],
  [...times(7, groove), ...fill()]
];

// match-c, the bridge: Bm G Em A Bm Bb C, walking up to the turn.
const MATCH_C: Note[][] = [
  [
    n('F#5', 0.5, 0.85), n('F#5', 0.5, 0.8), n('F#5', 1, 0.9), n('E5', 0.5, 0.8), n('D5', 1.5, 0.9),
    n('B4', 2, 0.85), n('D5', 1, 0.85), n('G5', 1, 0.9),
    // The first bar's figure again, a third up: a sequence.
    n('G5', 0.5, 0.85), n('G5', 0.5, 0.8), n('G5', 1, 0.9), n('F#5', 0.5, 0.8), n('E5', 1.5, 0.9),
    n('C#5', 2, 0.85), n('E5', 1, 0.85), n('A5', 1, 0.9),
    n('B5', 1.5), n('A5', 0.5, 0.9), n('F#5', 1, 0.9), n('D5', 1, 0.85),
    n('D5', 1.5, 0.9), n('F5', 0.5, 0.85), n('Bb5', 1), n('F5', 1, 0.9),
    n('G5', 1, 0.9), n('E5', 0.5, 0.85), n('G5', 1), n('C6', 1.5)
  ],
  [
    ...walk('B2', 'D3', 'F#3', 'D3'), ...walk('G2', 'B2', 'D3', 'B2'), ...walk('E2', 'G2', 'B2', 'G2'),
    ...walk('A2', 'C#3', 'E3', 'C#3'), ...walk('B2', 'D3', 'F#3', 'D3'), ...walk('Bb2', 'D3', 'F3', 'D3'),
    ...walk('C3', 'E3', 'G3', 'E3')
  ],
  [
    n('D4', 4, 0.7), n('D4', 4, 0.75), n('B3', 4, 0.8), n('C#4', 4, 0.85), n('D4', 4, 0.85),
    n('D4', 4, 0.9), n('E4', 4, 0.95)
  ],
  [...times(7, groove)]
];

// match-turn: A7, the half cadence.
const MATCH_TURN: Note[][] = [
  [n('A5', 1.5, 0.95), n('G5', 0.5, 0.85), n('E5', 1, 0.9), n('C#5', 1, 0.85)],
  [...terrace('A2', 'E3', 0.1, 'G3')],
  [n('C#4', 4, 0.9)],
  [...fill()]
];

/* ------------------------------------------------------------------ */
/* final: the danger order                                              */

// final-a: the call rewritten over bVII: D C G D | Bb C D A
const FINAL_A: Note[][] = [
  [
    n('A4', 0.5, 0.75), n('A4', 0.5, 0.7), n('D5', 1.5), n('E5', 0.5, 0.85), n('F#5', 1),
    n('G5', 1.5, 0.9), n('E5', 0.5, 0.8), n('C5', 1, 0.85), n('E5', 1, 0.85),
    n('D5', 1.5, 0.9), n('E5', 0.5, 0.8), n('G5', 1), n('B5', 1),
    n('A5', 2.5), n('F#5', 1.5, 0.9),
    n('D5', 0.5, 0.75), n('D5', 0.5, 0.7), n('F5', 1.5), n('G5', 0.5, 0.85), n('A5', 1),
    n('G5', 1.5), n('E5', 0.5, 0.85), n('C6', 1), n('G5', 1, 0.9),
    n('A5', 1.5), n('B5', 0.5, 0.9), n('A5', 1, 0.9), n('F#5', 1, 0.85),
    n('E5', 2, 0.9), r(0.5), n('A5', 1.5)
  ],
  [
    ...drive('D2', 'D3'), ...drive('C2', 'C3'), ...drive('G2', 'G3'), ...drive('D2', 'D3'),
    ...drive('Bb1', 'Bb2'), ...drive('C2', 'C3'), ...drive('D2', 'D3'), ...drive('A1', 'A2')
  ],
  [
    n('A3', 4, 0.8), n('G3', 4, 0.8), n('B3', 4, 0.85), n('A3', 4, 0.85),
    n('D4', 4, 0.85), n('E4', 4, 0.9), n('F#4', 4, 0.9), n('E4', 2, 0.9), n('C#4', 2, 0.9)
  ],
  [...times(7, finalGroove), ...fill()]
];

// final-b, the final's own strain: G A F#m Bm | G A Bb C, climbing into the chorus.
const FINAL_B: Note[][] = [
  [
    n('B5', 2), n('A5', 1, 0.9), n('G5', 1, 0.9),
    n('E5', 0.5, 0.85), n('A5', 1), n('C#6', 1.5), n('A5', 1, 0.9),
    n('A5', 1.5, 0.95), n('F#5', 0.5, 0.85), n('C#5', 1, 0.85), n('F#5', 1, 0.9),
    n('B5', 3), r(1),
    n('B5', 1.5), n('A5', 0.5, 0.9), n('G5', 1, 0.9), n('D5', 1, 0.85),
    n('E5', 1.5, 0.9), n('F#5', 0.5, 0.85), n('G5', 1, 0.9), n('A5', 1),
    n('F5', 0.5, 0.85), n('F5', 0.5, 0.85), n('Bb5', 1.5), n('A5', 0.5, 0.85), n('F5', 1, 0.85),
    n('G5', 0.5, 0.85), n('G5', 0.5, 0.85), n('C6', 3)
  ],
  [
    ...drive('G2', 'G3'), ...drive('A2', 'A3'), ...drive('F#2', 'F#3'), ...drive('B2', 'B3'),
    ...drive('G2', 'G3'), ...drive('A2', 'A3'), ...drive('Bb2', 'Bb3'), ...drive('C3', 'C4')
  ],
  [
    n('D4', 4, 0.85), n('C#4', 4, 0.85), n('A3', 4, 0.85), n('D4', 4, 0.9),
    n('B3', 4, 0.9), n('C#4', 4, 0.9), n('D4', 4, 0.95), n('E4', 4)
  ],
  [...times(7, finalGroove), ...fill()]
];

// final-c, the way back to the top: Em A D Bm | G A C A
const FINAL_C: Note[][] = [
  [
    n('G5', 1.5, 0.9), n('F#5', 0.5, 0.85), n('E5', 1, 0.85), n('B4', 1, 0.8),
    n('C#5', 1.5, 0.85), n('D5', 0.5, 0.8), n('E5', 1, 0.85), n('A5', 1, 0.9),
    n('F#5', 1, 0.9), n('A5', 1.5), n('F#5', 0.5, 0.85), n('D5', 1, 0.85),
    n('D5', 1.5, 0.9), n('C#5', 0.5, 0.8), n('B4', 2, 0.85),
    n('B4', 0.5, 0.8), n('D5', 0.5, 0.85), n('G5', 1.5), n('F#5', 0.5, 0.85), n('E5', 1, 0.85),
    n('C#5', 1, 0.85), n('E5', 1, 0.9), n('A5', 2),
    n('G5', 1.5), n('E5', 0.5, 0.85), n('C5', 1, 0.85), n('E5', 1, 0.85),
    n('E5', 2.5, 0.9), n('C#5', 1.5, 0.85)
  ],
  [
    ...drive('E2', 'E3'), ...drive('A2', 'A3'), ...drive('D2', 'D3'), ...drive('B2', 'B3'),
    ...drive('G2', 'G3'), ...drive('A2', 'A3'), ...drive('C3', 'C4'), ...drive('A2', 'A3')
  ],
  [
    n('G3', 4, 0.85), n('C#4', 4, 0.85), n('A3', 4, 0.85), n('D4', 4, 0.9),
    n('B3', 4, 0.9), n('C#4', 4, 0.9), n('E4', 4, 0.95), n('E4', 4)
  ],
  [...times(7, finalGroove), ...fill()]
];

/* ------------------------------------------------------------------ */
/* shootout: the tension bed                                            */

// A pedal under A | Bb/A | A | Gm/A, twice, then Bb/A | A | Bb | C.
const SHOOTOUT: Note[][] = [
  [
    r(2), n('E5', 2, 0.8),
    n('F5', 2.5, 0.85), n('E5', 1.5, 0.8),
    n('E5', 4, 0.8),
    r(1), n('G4', 0.5, 0.7), n('Bb4', 0.5, 0.75), n('D5', 2, 0.8),
    r(2), n('A5', 2, 0.85),
    n('Bb5', 2.5, 0.9), n('A5', 1.5, 0.85),
    n('A5', 4, 0.85),
    r(1), n('G5', 1, 0.8), n('F5', 1, 0.8), n('E5', 1, 0.8),
    // The repeated notes tighten: the run-up.
    n('F5', 0.5, 0.8), n('F5', 0.5, 0.8), n('F5', 0.5, 0.8), n('F5', 0.5, 0.85), n('G5', 1, 0.9), n('F5', 1, 0.85),
    n('E5', 0.5, 0.8), n('E5', 0.5, 0.8), n('E5', 0.5, 0.85), n('E5', 0.5, 0.85), n('F5', 1, 0.9), n('E5', 1, 0.85),
    n('F5', 1.5, 0.9), n('G5', 0.5, 0.85), n('A5', 1, 0.9), n('Bb5', 1, 0.95),
    n('G5', 2.5, 0.95), n('E5', 1.5, 0.9)
  ],
  [...times(10, () => heartbeat('A2')), ...heartbeat('Bb2'), ...heartbeat('C3')],
  [
    n('E4', 4, 0.55), n('F4', 4, 0.6), n('E4', 4, 0.55), n('D4', 4, 0.6),
    n('E4', 4, 0.6), n('F4', 4, 0.65), n('E4', 4, 0.6), n('D4', 4, 0.65),
    n('F4', 4, 0.7), n('E4', 4, 0.7), n('D4', 4, 0.75), n('E4', 4, 0.8)
  ],
  [...times(8, pulse), ...times(4, ticking)]
];

// shootout-turn: A over E, the six-four that will not resolve.
const SHOOTOUT_TURN: Note[][] = [
  [n('C#5', 2, 0.85), n('E5', 2, 0.9)],
  [...heartbeat('E2')],
  [n('C#4', 4, 0.8)],
  [...times(8, () => [hit('snare', 0.25, 0.5)]), hit('snare', 0.5, 0.7), hit('snare', 0.5, 0.8), hit('kick', 1)]
];

/* ------------------------------------------------------------------ */
/* stingers                                                             */

/**
 * The match's moments, one line per track (lead, bass, choir, drums). They
 * play over the running music, which ducks under them, so the loop keeps its
 * place. The drums sound here even while the drum layer is out.
 */
const STINGERS: Record<string, Note[][]> = {
  // A snare roll and a brass hit: the whistle has gone.
  'kick-off': [
    [r(1), n('A4', 0.5, 0.8), n('D5', 1.5)],
    [r(1), n('D2', 2)],
    [r(1), n('F#3', 2, 0.7)],
    [hit('snare', 0.25, 0.5), hit('snare', 0.25, 0.6), hit('snare', 0.25, 0.7), hit('snare', 0.25, 0.85), hit('kick', 2)]
  ],
  // The whole chord run up to the ceiling, the loudest thing the score does.
  'goal-for': [
    [n('D5', 0.5, 0.85), n('F#5', 0.5, 0.9), n('A5', 0.5, 0.95), n('D6', 2.5)],
    [n('D2', 0.5), n('A2', 0.5), n('D3', 0.5), n('D2', 2.5)],
    [n('A3', 4, 0.8)],
    [hit('snare', 0.25), hit('snare', 0.25), hit('kick', 0.5), hit('snare', 0.5), hit('kick', 0.5), hit('kick', 2)]
  ],
  // A sigh down through the borrowed bVI: the stand goes quiet.
  'goal-against': [
    [n('F5', 1, 0.8), n('E5', 1, 0.75), n('D5', 2, 0.7)],
    [n('Bb2', 2, 0.8), n('A2', 2, 0.7)],
    [n('F3', 2, 0.6), n('E3', 2, 0.55)],
    [hit('kick', 1, 0.7), r(3)]
  ],
  // A plagal amen, G to D: the half is over and nothing is lost.
  'half-time': [
    [n('B4', 1, 0.8), n('A4', 3, 0.8)],
    [n('G2', 2, 0.8), n('D2', 2, 0.75)],
    [n('G3', 2, 0.6), n('F#3', 2, 0.6)],
    [r(4)]
  ],
  // Three blasts on A, peep, peep, peeeep, the anthem's own repeated note.
  'full-time': [
    [n('A5', 0.5), r(0.5), n('A5', 0.5), r(0.5), n('A5', 2)],
    [n('D2', 0.5, 0.8), r(0.5), n('D2', 0.5, 0.8), r(0.5), n('D2', 2, 0.8)],
    [r(2), n('F#3', 2, 0.6)],
    [hit('snare', 0.5), r(0.5), hit('snare', 0.5), r(0.5), hit('kick', 2)]
  ]
};

export const FOOTBALL_MUSIC: GameAudioOptions = {
  tempo: BASE_TEMPO,
  volume: 0.1,
  tonic: p('D3'),
  // A long wash, around a dotted eighth at base tempo, fed back hard enough to
  // leave a tail under the next phrase. It falls off the grid as the knockout
  // stages wind the tempo up, which is wanted: the wash should read as a room,
  // not as a fifth voice keeping time.
  echo: { time: 0.3, feedback: 0.28, mix: 0.24 },
  tracks: [
    {
      // LEAD, massed brass. The wide detune is the point: a single sawtooth is
      // one trumpet, a detuned pair is a section. A slight vibrato on the held
      // notes is the section breathing; the short steps stay straight.
      name: 'lead',
      wave: 'sawtooth',
      volume: 0.95,
      detune: 12,
      vibrato: 6
    },
    {
      // BASS, the terrace backbeat in the match, half-time on the menus,
      // driving octaves in the final and a heartbeat in the shootout.
      name: 'bass',
      wave: 'triangle',
      volume: 0.85
    },
    {
      // CHOIR, a sustained chord tone a bar, the third or the seventh where it
      // can, so the harmony is spelled between it and the bass. Its levels
      // climb across each scene: that arc is the pad's whole job.
      name: 'choir',
      wave: 'sawtooth',
      envelope: 'pad',
      detune: 7,
      volume: 0.34
    },
    {
      // DRUMS, a layer the kick-off brings in and half-time and full time take
      // out. Silent on the menus, where the line is written as rests.
      name: 'drums',
      volume: 0.55,
      startsMuted: true
    }
  ],
  form: {
    sections: {
      'title-a': TITLE_A,
      'title-b': TITLE_B,
      'title-turn': TITLE_TURN,
      'match-a': MATCH_A,
      'match-b': MATCH_B,
      'match-a2': MATCH_A2,
      'match-c': MATCH_C,
      'match-turn': MATCH_TURN,
      'final-a': FINAL_A,
      'final-b': FINAL_B,
      'final-c': FINAL_C,
      shootout: SHOOTOUT,
      'shootout-turn': SHOOTOUT_TURN
    },
    // The menu first, since that is where the music starts; the order only
    // runs on from one scene into the next if the game misses a turn.
    order: [...SCENES.menu, ...SCENES.match, ...SCENES.shootout],
    danger: { order: [...FINAL_ORDER], tempo: FINAL_TEMPO }
  },
  stingers: STINGERS
};
