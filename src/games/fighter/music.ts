/**
 * STREET CHAMPION's score: a 1991 Capcom CPS-1 fighting game, one theme per
 * fighter's home stage.
 *
 * Reference and brief (ADR 003's round 3 amendment: sound like the reference,
 * never copy a melody). The cabinet homages Street Fighter II: The World
 * Warrior (Capcom, 1991), whose CPS-1 sound board carried a Yamaha YM2151
 * (eight four-operator FM channels) beside an OKI MSM6295 for sampled drums
 * and voices. Its music is late-eighties Japanese arcade rock: a punchy FM
 * brass or synth lead, a bright FM slap bass bouncing in octaves, sustained
 * FM strings under them, and driving sampled rock and funk drums, with a
 * different theme for each fighter's country in that country's idiom. All of
 * that is copyrighted and is evoked here by mode, tempo, timbre and form
 * only: every tune below is original.
 *
 * The idioms, per stage (see `SCENES`):
 *
 * - japan, D minor with the in scale's E flat, over straight rock eighths.
 * - usa, a heroic C mixolydian march-rock that turns home through bVI and bVII.
 * - china, G major pentatonic, an erhu-ish lead with grace slides, kung-fu snare.
 * - ussr, an A minor folk dance over an oom-pah bass, repeated-note pickups.
 * - india, C Bhairav (the flat second and sixth) over a tanpura drone and a tabla-ish kit.
 * - brazil, an E Dorian samba-funk with anticipated pushes and a surdo kick.
 * - vegas, a brassy F shuffle with a boogie bass and a tritone substitution.
 * - spain, A minor into the Andalusian cadence, Phrygian E at every turn, rasgueado bass.
 * - thailand, a modal D minor, a pi-flute lead over a slow two-step.
 * - final, a dark C minor drive with a flat-second Db, the dictator's temple.
 * - bonus, a fast E major rock bed for the car smash, no danger.
 * - select, the world map and the select screen, a bright A major pop-rock.
 * - ending, the credits, a warm G major ballad that turns home through bVI and bVII.
 *
 * Voices, every pitched one an FM patch because every pitched sound on the
 * YM2151 was one:
 *
 * - lead, FM brass: ratio 1 at a high index falling over half a second, a
 *   quick attack and a sustain above half, so it speaks like a section and
 *   holds; the chip's LFO gives it vibrato. Unfiltered, which is the CPS-1's
 *   brighter, harder brass against PRIME TIME's speaking filter.
 * - bass, FM slap: ratio 1 at a very high index collapsing in 40 ms, the knock
 *   of a slapped string, bouncing between root and octave.
 * - strings, FM pad: ratio 2 at a low index with a slow attack, sustained
 *   chord tones under the brass, two halves or a whole note a bar.
 * - drums, the OKI's sampled kit: the engine's kick, snare and hats, the
 *   snare loud and the hats ducked.
 *
 * Three pitched voices plus drums, inside ADR 003's limit. There is a short
 * echo send: Capcom's driver habitually doubled the lead on a spare FM channel
 * a few ticks late and quieter to fake a delay, and the send is the engine's
 * way of saying that (the ADR: echo is a bus send, not note data).
 *
 * Form. Every theme is one scene of the form, `${theme}-a` (eight bars),
 * `${theme}-b` (four), `${theme}-a` again and `${theme}-turn` (four), an AABA
 * shape of 24 bars, 96 beats. The form's `order` is the select theme, which is
 * what plays from `start()` until the game moves to a stage. No scene carries
 * its own tempo, deliberately: the engine ignores `setTempo` inside a scene
 * that has one, and SF2's famous trick is that the stage music speeds up when
 * a fighter is in danger, so the game drives the tempo itself with
 * `audio.setTempo(tempoFor(theme, danger))` on every scene change and when a
 * fighter's health drops under a quarter. Every `${theme}-turn` hands back to
 * the top through V, bVII or a half cadence, never V to I.
 *
 * Tempo and length (ADR 003). A match is two or three rounds of up to 99
 * seconds on one stage, so each stage is a standard session (30 s floor),
 * measured at its danger tempo, the fastest it plays: 96 beats is 36.6 s at
 * the fastest of them (china in danger, 157). The select screen is the form's
 * order and is gated at the fastest tempo `tempoFor` can return at all, as
 * the profile's `fastestTempo` must be.
 *
 * Gates. All three style gates are on in every scene: every theme pushes over
 * the beat in its lead, and every turn reaches the top through a chord that
 * is not the tonic.
 *
 * Stingers (`STINGERS`, through `playStinger`): the versus-screen crash, a
 * two-note "fight" call, the KO slam, a perfect's arpeggio, the win fanfare,
 * the lose phrase falling, the bonus clear and a continue-countdown tick. The
 * run's two endings go through `playEnding` (`ENDINGS`): game over, two bars
 * sinking chromatically onto A, and the ending, four bars of the credits
 * theme's G major landing home, the one V to I in the score.
 *
 * Beginnings. The form's `intro` is two bars, the coin-in crash: the brass up
 * the A major triad to a held E over a sixteenth-note snare roll, before the
 * select theme's first bar.
 */
import { p, REST, type DrumName, type GameAudioOptions, type MusicProfile, type Note } from '../engine';

export type MusicTheme =
  | 'select'
  | 'japan'
  | 'usa'
  | 'china'
  | 'ussr'
  | 'india'
  | 'brazil'
  | 'vegas'
  | 'spain'
  | 'thailand'
  | 'final'
  | 'bonus'
  | 'ending';

/** Every theme's own tempo, out of danger. */
const THEME_TEMPO: Record<MusicTheme, number> = {
  select: 126,
  japan: 138,
  usa: 132,
  china: 140,
  ussr: 126,
  india: 112,
  brazil: 136,
  vegas: 132,
  spain: 128,
  thailand: 120,
  final: 132,
  bonus: 150,
  ending: 112
};

/** The themes a fighter can be in danger on: the stages, not the menus, the bonus round or the credits. */
const FIGHT_THEMES = new Set<MusicTheme>(['japan', 'usa', 'china', 'ussr', 'india', 'brazil', 'vegas', 'spain', 'thailand', 'final']);

/** How much faster a stage plays while a fighter is under a quarter of their health: SF2's speed-up. */
const DANGER_SPEEDUP = 1.12;

/** The score's own tempo, the select screen's: what `start()` plays the form's order at. */
export const BASE_TEMPO = THEME_TEMPO.select;

/**
 * The tempo a theme plays at, faster while a fighter is in danger. Only the
 * fight stages speed up; the select screen, the bonus round and the credits
 * ignore `danger`. The game calls `audio.setTempo(tempoFor(theme, danger))`
 * beside every `setScene` and whenever danger starts or ends.
 */
export function tempoFor(theme: MusicTheme, danger: boolean): number {
  const base = THEME_TEMPO[theme];
  return danger && FIGHT_THEMES.has(theme) ? Math.round(base * DANGER_SPEEDUP) : base;
}

const THEMES = Object.keys(THEME_TEMPO) as MusicTheme[];

/** The scene each theme plays as, for `setScene`; every theme has its own. */
export const SCENES: Record<MusicTheme, string> = Object.fromEntries(THEMES.map(t => [t, t])) as Record<MusicTheme, string>;

/** The stingers' names, each a key of `FIGHTER_MUSIC.stingers`, for `playStinger`. */
export const STINGERS = {
  versus: 'versus',
  roundStart: 'roundStart',
  ko: 'ko',
  perfect: 'perfect',
  youWin: 'youWin',
  youLose: 'youLose',
  bonusClear: 'bonusClear',
  continueTick: 'continueTick'
} as const;

/** The endings' stinger names, for `playEnding`. */
export const ENDINGS = {
  /** No credits left: brass sinking chromatically onto A. */
  gameOver: 'game-over',
  /** The champion's ending: the credits theme landing home in G. */
  ending: 'ending'
} as const;

/** The fastest tempo `tempoFor` returns for any theme. */
const FASTEST = Math.max(...THEMES.flatMap(t => [tempoFor(t, false), tempoFor(t, true)]));

/**
 * A standard session everywhere. The order (the select screen) is measured at
 * the fastest tempo the cabinet ever plays; each scene at its own fastest,
 * which for a stage is its danger tempo.
 */
export const MUSIC_PROFILE: MusicProfile = {
  session: 'standard',
  fastestTempo: FASTEST,
  scenes: Object.fromEntries(
    THEMES.map(t => [SCENES[t], { session: 'standard' as const, fastestTempo: tempoFor(t, true) }])
  )
};

/* ------------------------------------------------------------------ */
/* notation                                                             */

const DRUMS: Record<string, DrumName> = { k: 'kick', s: 'snare', h: 'hat' };
/** The sampled kit's balance: the snare at full level, the kick just under, the hats ducked. */
const DRUM_GAIN: Record<string, number> = { k: 0.95, s: 1, h: 0.45 };

/**
 * A line in PRIME TIME's compact notation, one token per note: a pitch name
 * (`E5`), `r` for a rest, or `k`/`s`/`h` for a kick, snare or hat, then
 * `:beats`, which later tokens without one reuse, and an optional `@gain`.
 * `|` marks a bar line; with `bar` given, a bar that does not add up throws,
 * so a slip in the note data fails `music.test.ts` at import. A note starting
 * off the beat is ducked a little unless it writes its own level.
 */
function line(text: string, bar?: number): Note[] {
  const out: Note[] = [];
  let beats = 0.5;
  let at = 0;
  let inBar = 0;
  const close = () => {
    if (bar !== undefined && Math.abs(inBar - bar) > 1e-9) {
      throw new Error(`bar of ${inBar} beats, not ${bar}, near beat ${at} in "${text.trim().slice(0, 40)}..."`);
    }
    inBar = 0;
  };
  for (const token of text.match(/\||[^\s|]+/g) ?? []) {
    if (token === '|') {
      close();
      continue;
    }
    const [head, level] = token.split('@');
    const [name, len] = head.split(':');
    if (len !== undefined) beats = Number(len);
    const offBeat = Math.abs(at - Math.round(at)) > 1e-9;
    let note: Note;
    if (name === 'r') note = { freq: REST, beats };
    else if (DRUMS[name]) {
      const gain = level !== undefined ? Number(level) : DRUM_GAIN[name] * (offBeat ? 0.8 : 1);
      note = { freq: REST, beats, drum: DRUMS[name], gain };
    } else {
      const gain = level !== undefined ? Number(level) : offBeat ? 0.85 : undefined;
      note = { freq: p(name), beats, ...(gain !== undefined ? { gain } : {}) };
    }
    out.push(note);
    at += beats;
    inBar += beats;
  }
  if (inBar > 0) close();
  return out;
}

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** A pitch name moved by `semitones`, spelt with sharps. */
function shift(name: string, semitones: number): string {
  const m = name.match(/^([A-G])([#b]?)(-?\d+)$/);
  if (!m) throw new Error(`Unparseable note name: ${name}`);
  const [, letter, accidental, octave] = m;
  const base = NAMES.indexOf(letter) + (accidental === '#' ? 1 : accidental === 'b' ? -1 : 0);
  const midi = (Number(octave) + 1) * 12 + base + semitones;
  return `${NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}

type Figure = (root: string) => string;

/** One bar of a figure per root, joined. */
const over = (figure: Figure, roots: string): string => roots.trim().split(/\s+/).map(figure).join(' ');

/** The strings: per bar, `a/b` as two half notes or `a` as a whole one. */
const pads = (bars: string): string =>
  bars
    .trim()
    .split(/\s+/)
    .map(bar => {
      const [a, b] = bar.split('/');
      return b ? `${a}:2 ${b}:2 |` : `${a}:4 |`;
    })
    .join(' ');

/* ------------------------------------------------------------------ */
/* bass figures, one per idiom                                          */

const oct = (r: string) => shift(r, 12);
const fifth = (r: string) => shift(r, 7);

/** Straight rock eighths with the octave and the fifth (Japan). */
const rock: Figure = r => `${r}:.5 ${r} ${oct(r)} ${r} ${r} ${r} ${oct(r)} ${fifth(r)} |`;
/** March-rock eighths, root and fifth (USA). */
const marchRock: Figure = r => `${r}:.5 ${r} ${fifth(r)} ${r} ${oct(r)} ${r} ${fifth(r)} ${r} |`;
/** Pentatonic leaps up to a held octave (China). */
const leap: Figure = r => `${r}:.5 ${r} ${fifth(r)} ${oct(r)} ${r} ${fifth(r)} ${oct(r)}:1 |`;
/** Oom-pah, the fifth below on the off-beat, an octave pickup (USSR). */
const oomPah: Figure = r => {
  const low = shift(r, -5);
  return `${r}:.5 r:.5 ${low}:.5 r:.5 ${r}:.5 r:.5 ${low}:.5 ${oct(r)}:.5 |`;
};
/** A drone on the root with the fifth and the octave (India). */
const drone: Figure = r => `${r}:1.5 ${r}:.5 ${fifth(r)}:1 ${oct(r)}:1 |`;
/** The samba's surdo rhythm on the bass (Brazil). */
const samba: Figure = r =>
  `${r}:.75 ${r}:.25 ${oct(r)}:.5 ${r}:.5 ${r}:.75 ${fifth(r)}:.25 ${oct(r)}:.5 ${fifth(r)}:.5 |`;
/** A shuffled boogie, root, fifth, sixth, fifth (Vegas). */
const boogie: Figure = r => {
  const six = shift(r, 9);
  return `${r}:.75 ${r}:.25 ${fifth(r)}:.75 ${fifth(r)}:.25 ${six}:.75 ${six}:.25 ${fifth(r)}:.75 ${fifth(r)}:.25 |`;
};
/** A rasgueado's strum, a sixteenth flurry then eighths (Spain). */
const rasgueado: Figure = r =>
  `${r}:.5 ${r}:.25 ${r}:.25 ${fifth(r)}:.5 ${r}:.5 ${oct(r)}:.5 ${r}:.5 ${fifth(r)}:.5 ${r}:.5 |`;
/** A slow two-step on the root (Thailand). */
const twoStep: Figure = r => `${r}:1 ${r}:.5 ${fifth(r)}:.5 ${r}:1 ${oct(r)}:.5 ${fifth(r)}:.5 |`;
/** Eighths pounding the root with a flat-second knock (final). */
const pound: Figure = r => `${r}:.5 ${r} ${r} ${oct(r)} ${r} ${r} ${shift(r, 1)} ${oct(r)} |`;
/** The CPS-1 slap: the octave pop and a doubled sixteenth (select). */
const slap: Figure = r =>
  `${r}:.5 ${oct(r)}:.5 ${r}:.25 ${r}:.25 ${oct(r)}:.5 ${r}:.5 ${fifth(r)}:.5 ${oct(r)}:.5 ${fifth(r)}:.5 |`;
/** Disco octaves (bonus). */
const octaves: Figure = r => `${r}:.5 ${oct(r)} ${r} ${oct(r)} ${r} ${oct(r)} ${fifth(r)} ${oct(r)} |`;
/** A ballad's broken root-fifth-octave (ending). */
const ballad: Figure = r => `${r}:1.5 ${fifth(r)}:.5 ${oct(r)}:1 ${fifth(r)}:1 |`;

/* ------------------------------------------------------------------ */
/* drum bars                                                            */

const ROCK = 'k:.5 h:.5 s:.5 h:.5 k:.5 k:.5 s:.5 h:.5 |';
const MARCH = 'k:.5 s:.25@.5 s:.25@.6 s:.5 h:.5 k:.5 s:.25@.5 s:.25@.6 s:.5 h:.5 |';
const KUNGFU = 'k:.5 h:.5 s:.5 k:.5 h:.5 k:.5 s:.5 h:.25 h:.25 |';
const POLKA = 'k:.5 h:.5 s:.5 h:.5 k:.5 h:.5 s:.5 s:.25 s:.25 |';
const TABLA = 'k:.75 h:.25 h:.5 s:.5@.6 k:.5 k:.25 h:.25 s:.5 h:.5 |';
const SAMBA = 'k:.75 h:.25 s:.5 h:.25 k:.25 k:.75 h:.25 s:.5 h:.25 h:.25 |';
const SHUFFLE = 'k:.75 h:.25 s:.75 h:.25 k:.75 h:.25 s:.75 h:.25 |';
const PALMAS = 'k:.5 h:.25 h:.25 s:.5 h:.5 k:.25 k:.25 h:.5 s:.5 s:.25 h:.25 |';
const TWOSTEP = 'k:1 h:.5 h:.5 s:1 k:.5 h:.5 |';
const STOMP = 'k:.5 k:.5 s:.5 h:.5 k:.5 k:.5 s:.5 s:.5 |';
const DRIVE = 'k:.5 h:.5 s:.5 h:.5 k:.5 k:.5 s:.5 h:.25 h:.25 |';
const HALF = 'k:1 h:.5 h:.5 s:1 h:.5 k:.5 |';
/** A phrase-end fill: kick and snare trading, then four sixteenth snares climbing. */
const FILL = 'k:.5 s:.5 s:.25 s:.25 k:.5 s:.5 s:.25@.6 s:.25@.7 s:.25@.85 s:.25@1 k:.5 |';

/** `count` bars of `bar`, the last replaced by `fill` when one is given. */
const groove = (count: number, bar: string, fill?: string): string =>
  fill ? [...Array.from({ length: count - 1 }, () => bar), fill].join(' ') : Array.from({ length: count }, () => bar).join(' ');

/* ------------------------------------------------------------------ */
/* themes                                                               */

/** One part of a theme: the lead, the bass roots one a bar, and the strings (`pads`). */
interface Part {
  lead: string;
  roots: string;
  pad: string;
}

interface ThemeSpec {
  figure: Figure;
  beat: string;
  /** Eight bars. */
  a: Part;
  /** Four bars. */
  b: Part;
  /** Four bars, ending off the tonic. */
  turn: Part;
}

const part = (spec: ThemeSpec, x: Part, drums: string): Note[][] => [
  line(x.lead, 4),
  line(over(spec.figure, x.roots), 4),
  line(pads(x.pad), 4),
  line(drums, 4)
];

const SPECS: Record<MusicTheme, ThemeSpec> = {
  // The world map and the select screen: bright A major pop-rock, home through bVI and bVII.
  select: {
    figure: slap,
    beat: ROCK,
    a: {
      lead: `
        E5:.5 A5:.5 C#6:1 B5:.5 A5:1.5 | G#5:.5 B5:.5 E6:1 D6:.5 B5:1.5 |
        C#6:1 A5:.5 F#5:.5 A5:1 C#6:1 | D6:1.5 C#6:.5 B5:1 A5:1 |
        E5:.5 A5:.5 C#6:1 E6:1.5 D6:.5 | B5:1 G#5:.5 E5:.5 B5:2 |
        A5:.5 B5:.5 D6:1 F#6:1 E6:1 | E6:2 D6:.5 C#6:.5 B5:1 |`,
      roots: 'A1 G#1 F#1 D2 A1 E2 D2 E2',
      pad: 'C#4/E4 B3/E4 A3/C#4 F#4/A4 C#4/E4 B3/G#4 F#4/A4 G#4/B4'
    },
    b: {
      lead: `
        F#5:.5 A5:.5 C#6:1.5 B5:.5 A5:1 | G#5:1 E5:.5 G#5:.5 C#6:2 |
        D6:.75 C#6:.75 A5:.5 F#5:1 A5:1 | B5:.5 C#6:.5 D6:1 E6:2 |`,
      roots: 'F#1 C#2 D2 E2',
      pad: 'A3/C#4 G#3/E4 F#4/A4 G#4/B4'
    },
    turn: {
      lead: `
        F#5:.5 A5:.5 D6:1.5 C#6:.5 A5:1 | G#5:.5 B5:.5 E6:1 D6:.5 B5:1.5 |
        C6:1 A5:.5 F5:.5 C6:1 F6:1 | D6:.5 B5:.5 G5:1 D6:1 E6:1 |`,
      roots: 'D2 E2 F1 G1',
      pad: 'F#4/A4 G#4/B4 A3/C4 B3/D4'
    }
  },

  // The temple: D minor with the in scale's E flat, over straight rock eighths, home through A.
  japan: {
    figure: rock,
    beat: ROCK,
    a: {
      lead: `
        r:.5 D5:.5 F5:.5 G5:1 A5:1.5 | C6:.5 A5:.5 G5:1 F5:.5 G5:.5 A5:1 |
        Bb5:1.5 A5:.5 G5:1 F5:1 | G5:.5 A5:1 G5:.5 E5:2 |
        r:.5 D5:.5 F5:.5 G5:1 A5:.5 C6:1 | D6:1.5 C6:.5 A5:1 G5:1 |
        F5:.5 G5:.5 Bb5:1 A5:.5 G5:.5 F5:1 | E5:1 F5:.5 E5:.5 C#5:2 |`,
      roots: 'D2 D2 Bb1 C2 D2 D2 Bb1 A1',
      pad: 'F4/A4 F4/A4 D4/F4 E4/G4 F4/A4 F4/A4 D4/F4 C#4/E4'
    },
    b: {
      lead: `
        G5:1 Bb5:.5 A5:.5 G5:.5 D5:1.5 | Eb5:1 G5:.5 Bb5:1 Eb6:1.5 |
        D6:.5 C6:.5 Bb5:.5 A5:.5 G5:1 D5:1 | Eb5:1.5 D5:.5 C#5:1 E5:1 |`,
      roots: 'G1 Eb2 G1 A1',
      pad: 'Bb3/D4 G4/Bb4 Bb3/D4 C#4/E4'
    },
    turn: {
      lead: `
        r:.5 F5:.5 Bb5:1 A5:.5 G5:.5 F5:1 | E5:.5 G5:1 C6:1.5 Bb5:.5 A5:.5 |
        A5:1 F5:.5 D5:.5 A5:1 D6:1 | C#6:1.5 A5:.5 E5:1 C#5:1 |`,
      roots: 'Bb1 C2 D2 A1',
      pad: 'D4/F4 E4/G4 F4/A4 C#4/E4'
    }
  },

  // The air base: heroic C mixolydian march-rock, home through bVI and bVII.
  usa: {
    figure: marchRock,
    beat: MARCH,
    a: {
      lead: `
        C5:.5 E5:.5 G5:1.5 E5:.5 G5:1 | C6:1 B5:.5 C6:.5 G5:2 |
        Bb5:1 A5:.5 G5:.5 F5:1 D5:1 | F5:1.5 G5:.5 A5:1 C6:1 |
        C5:.5 E5:.5 G5:1.5 E5:.5 G5:1 | Ab5:1 G5:.5 F5:.5 Eb5:1 C5:1 |
        D5:.5 F5:.5 Bb5:1.5 A5:.5 Bb5:1 | B5:2 G5:1 D5:1 |`,
      roots: 'C2 C2 Bb1 F1 C2 Ab1 Bb1 G1',
      pad: 'E4/G4 E4/G4 D4/F4 A3/F4 E4/G4 C4/Eb4 D4/F4 B3/D4'
    },
    b: {
      lead: `
        A5:1.5 G5:.5 E5:1 C5:1 | F5:.5 A5:1 C6:.5 A5:1 F5:1 |
        D5:1 F5:.5 A5:1.5 G5:1 | G5:.5 A5:.5 B5:1 D6:2 |`,
      roots: 'A1 F1 D2 G1',
      pad: 'C4/E4 C4/A4 F4/A4 B3/D4'
    },
    turn: {
      lead: `
        r:.5 A5:.5 C6:1 A5:.5 F5:.5 C5:1 | D5:.5 G5:1 B5:1.5 D6:1 |
        C6:1 Eb6:.5 C6:.5 Ab5:1 Eb5:1 | F5:.5 Bb5:.5 D6:1 F6:1 D6:1 |`,
      roots: 'F1 G1 Ab1 Bb1',
      pad: 'A3/C4 B3/D4 C4/Eb4 D4/F4'
    }
  },

  // The market: G major pentatonic, an erhu-ish lead, home through D.
  china: {
    figure: leap,
    beat: KUNGFU,
    a: {
      lead: `
        D5:.5 E5:.5 G5:1 A5:.5 B5:1.5 | A5:.5 G5:.5 E5:1 D5:1 E5:1 |
        G5:1.5 E5:.5 D5:.5 E5:.5 G5:1 | A5:2 B5:.5 A5:.5 F#5:1 |
        D6:.5 B5:.5 A5:1 B5:.5 D6:1.5 | E6:1 D6:.5 B5:.5 G5:2 |
        A5:.5 B5:.5 A5:.5 G5:.5 E5:1 C5:1 | D5:1.5 E5:.5 A4:2 |`,
      roots: 'G1 E2 C2 D2 G1 E2 A1 D2',
      pad: 'B3/D4 B3/G4 E4/G4 F#4/A4 B3/D4 B3/G4 C4/E4 F#4/A4'
    },
    b: {
      lead: `
        B5:1 A5:.5 G5:.5 E5:2 | F#5:.5 A5:1 D6:1.5 A5:1 |
        G5:.5 E5:.5 C5:1 E5:.5 G5:1.5 | A5:1 G5:.5 A5:.5 D5:2 |`,
      roots: 'E2 D2 C2 D2',
      pad: 'G4/B4 F#4/A4 E4/G4 F#4/A4'
    },
    turn: {
      lead: `
        E5:.5 G5:.5 C6:1.5 B5:.5 A5:1 | F#5:1 A5:.5 D6:1 C6:.5 A5:1 |
        B5:1.5 A5:.5 F#5:1 D5:1 | E5:.5 F#5:.5 A5:1 D6:2 |`,
      roots: 'C2 D2 B1 D2',
      pad: 'E4/G4 F#4/A4 D4/F#4 F#4/A4'
    }
  },

  // The factory: an A minor folk dance over oom-pah, home through E.
  ussr: {
    figure: oomPah,
    beat: POLKA,
    a: {
      lead: `
        E5:.5 E5:.5 A5:1 E5:.5 C5:.5 A4:1 | D5:.5 F5:.5 A5:1.5 G5:.5 F5:1 |
        E5:.5 F5:.5 E5:.5 D5:.5 G#4:1 B4:1 | C5:.5 A4:1 B4:.5 A4:2 |
        E5:.5 E5:.5 A5:1 C6:.5 B5:.5 A5:1 | F5:.5 A5:.5 D6:1.5 C6:.5 A5:1 |
        G#5:1 B5:.5 D6:.5 E6:1 B5:1 | C6:1.5 B5:.5 A5:2 |`,
      roots: 'A1 D2 E2 A1 A1 D2 E2 A1',
      pad: 'C4/E4 D4/F4 B3/E4 C4/E4 C4/E4 D4/F4 G#3/D4 C4/E4'
    },
    b: {
      lead: `
        G5:.5 E5:.5 C5:1 E5:.5 G5:1.5 | B5:1 A5:.5 G5:.5 D5:2 |
        E5:.5 G#5:.5 B5:1 G#5:.5 E5:1.5 | A5:.5 B5:.5 C6:1 A5:2 |`,
      roots: 'C2 G1 E2 A1',
      pad: 'E4/G4 D4/G4 E4/G#4 C4/E4'
    },
    turn: {
      lead: `
        F5:.5 A5:.5 D6:1.5 C6:.5 A5:1 | E5:1 A5:.5 C6:.5 B5:1 A5:1 |
        A5:1.5 F5:.5 C5:1 F5:1 | E5:.5 F5:.5 G#5:1 B5:2 |`,
      roots: 'D2 A1 F1 E2',
      pad: 'D4/F4 C4/E4 A3/C4 G#3/B3'
    }
  },

  // The palace: C Bhairav over a tanpura drone, home through G.
  india: {
    figure: drone,
    beat: TABLA,
    a: {
      lead: `
        r:.5 C5:.5 Db5:.5 E5:1.5 F5:1 | G5:.5 Ab5:.25 G5:.25 F5:.5 E5:.5 Db5:1 C5:1 |
        E5:.5 F5:.5 G5:1 Ab5:.5 B5:.5 C6:1 | B5:.5 Ab5:.5 G5:2 r:1 |
        C6:.5 Db6:.5 C6:1 B5:.5 Ab5:1.5 | G5:.5 Ab5:.5 F5:.5 E5:.5 Db5:2 |
        E5:1 F5:.5 G5:1.5 Ab5:.5 G5:.5 | F5:.5 E5:.5 Db5:1 C5:2 |`,
      roots: 'C2 C2 F1 C2 C2 Db2 C2 C2',
      pad: 'G3/C4 G3/C4 Ab3/C4 G3/C4 G3/C4 Ab3/F4 G3/C4 G3/E4'
    },
    b: {
      lead: `
        G5:1.5 Ab5:.5 B5:1 C6:1 | Db6:1 C6:.5 B5:.5 Ab5:1 G5:1 |
        F5:.5 G5:.5 Ab5:1.5 G5:.5 F5:1 | E5:2 Db5:1 E5:1 |`,
      roots: 'F1 Db2 F1 C2',
      pad: 'Ab3/C4 Ab3/F4 Ab3/C4 G3/E4'
    },
    turn: {
      lead: `
        r:.5 G4:.5 C5:.5 Db5:1.5 E5:1 | F5:1 E5:.5 F5:.5 Ab5:2 |
        G5:.5 F5:.5 E5:.5 Db5:.5 C5:1 Db5:1 | B4:1.5 Db5:.5 B4:1 G4:1 |`,
      roots: 'C2 F1 Db2 G1',
      pad: 'G3/C4 Ab3/C4 Ab3/F4 G3/B3'
    }
  },

  // The river: an E Dorian samba-funk, home through B7.
  brazil: {
    figure: samba,
    beat: SAMBA,
    a: {
      lead: `
        r:.5 B5:.5 r:.25 B5:.75 A5:.5 G5:.5 E5:1 | G5:.5 A5:.25 C#6:.75 A5:.5 G5:.5 E5:1.5 |
        r:.5 B5:.5 r:.25 B5:.75 D6:.5 B5:.5 A5:1 | G5:.75 A5:.25 G5:.5 E5:.5 C#5:1 r:1 |
        r:.5 E6:.5 D6:.5 B5:1 G5:.5 E5:1 | F#5:.75 A5:.75 D#6:.5 C6:1 B5:1 |
        G5:.5 B5:.5 E6:1.5 D6:.5 B5:1 | A#5:1 C#6:.5 A#5:.5 F#5:2 |`,
      roots: 'E2 A1 E2 A1 C2 B1 E2 F#2',
      pad: 'D4/G4 C#4/G4 D4/G4 C#4/G4 E4/B4 D#4/A4 D4/G4 A#3/E4'
    },
    b: {
      lead: `
        C6:.75 B5:.75 A5:.5 E5:1 G5:1 | F#5:.5 A5:.5 C6:1.5 A5:.5 F#5:1 |
        D6:.75 B5:.75 G5:.5 F#5:1 D5:1 | E5:.5 G5:.5 Bb5:1.5 A5:.5 G5:1 |`,
      roots: 'A1 D2 G1 C2',
      pad: 'C4/G4 C4/F#4 B3/F#4 Bb3/E4'
    },
    turn: {
      lead: `
        r:.5 E6:.5 C6:.5 A5:1 G5:.5 E5:1 | D#5:.5 F#5:.5 A5:1 B5:1.5 A5:.5 |
        G5:.75 E5:.75 C5:.5 E5:1 G5:1 | F#5:.5 A5:.5 B5:1 D#6:2 |`,
      roots: 'A1 B1 C2 B1',
      pad: 'C4/G4 D#4/A4 E4/G4 D#4/A4'
    }
  },

  // The street: a brassy F shuffle, home through a tritone substitution onto C7.
  vegas: {
    figure: boogie,
    beat: SHUFFLE,
    a: {
      lead: `
        F5:.75 A5:.25 C6:1 A5:.5 C6:1.5 | D6:.75 C6:.25 A5:.5 F5:.5 G5:2 |
        Bb5:.75 D6:.25 F6:1.5 D6:.5 Bb5:1 | Ab5:.75 G5:.25 F5:1 D5:2 |
        F5:.75 A5:.25 C6:1 Eb6:.5 D6:1.5 | F#5:.75 A5:.25 C6:.5 D6:1.5 C6:1 |
        B5:.75 D6:.25 F6:1 D6:.5 B5:1.5 | C6:1 Bb5:.5 G5:.5 E5:2 |`,
      roots: 'F1 F1 Bb1 Bb1 F1 D2 G1 C2',
      pad: 'A3/Eb4 A3/Eb4 D4/Ab4 D4/Ab4 A3/Eb4 F#3/C4 B3/F4 Bb3/E4'
    },
    b: {
      lead: `
        Bb5:1.5 A5:.5 Bb5:.5 D6:1.5 | B5:.75 D6:.25 F6:1 Ab5:2 |
        A5:.75 C6:.25 F6:1.5 C6:.5 A5:1 | F#5:1 A5:.5 C6:1.5 Eb6:1 |`,
      roots: 'Bb1 B1 C2 D2',
      pad: 'D4/F4 D4/F4 A3/F4 F#3/C4'
    },
    turn: {
      lead: `
        Bb5:.75 A5:.25 G5:1 F5:.5 D5:1.5 | E5:.75 G5:.25 Bb5:1 C6:2 |
        Db6:.75 B5:.25 Ab5:1 F5:.5 Ab5:1.5 | G5:.75 E5:.25 C5:1 G5:.5 Bb5:1.5 |`,
      roots: 'G1 C2 C#2 C2',
      pad: 'Bb3/F4 Bb3/E4 B3/F4 Bb3/E4'
    }
  },

  // The cage: A minor into the Andalusian cadence, Phrygian E at every turn.
  spain: {
    figure: rasgueado,
    beat: PALMAS,
    a: {
      lead: `
        r:.5 E5:.5 F5:.5 E5:.5 D5:.25 C5:.25 B4:.5 A4:1 | B4:.5 C5:.5 D5:1.5 C5:.5 B4:1 |
        A4:.5 C5:.5 F5:1 E5:.5 D5:.5 C5:1 | B4:.25 C5:.25 B4:.5 G#4:1 E4:2 |
        r:.5 A5:.5 B5:.5 A5:.5 G5:.25 F5:.25 E5:.5 D5:1 | D5:.5 E5:.5 G5:1.5 F5:.5 E5:1 |
        F5:.5 A5:.5 C6:1 B5:.5 A5:.5 F5:1 | E5:1.5 F5:.5 E5:1 G#4:1 |`,
      roots: 'A1 G1 F1 E1 A1 G1 F1 E1',
      pad: 'C4/E4 B3/D4 A3/C4 G#3/B3 C4/E4 B3/D4 A3/C4 G#3/D4'
    },
    b: {
      lead: `
        D5:.5 F5:.5 A5:1.5 G5:.5 F5:1 | E5:1 C5:.5 E5:.5 A5:2 |
        F5:.5 G5:.25 F5:.25 E5:.5 D5:.5 F5:1 A5:1 | G#5:1.5 F5:.5 E5:1 B4:1 |`,
      roots: 'D2 A1 D2 E2',
      pad: 'D4/F4 C4/E4 D4/F4 G#3/B3'
    },
    turn: {
      lead: `
        A5:.75 G5:.25 F5:1 C5:.5 F5:1.5 | G5:.75 F5:.25 D5:1 B4:.5 D5:1.5 |
        F5:.5 E5:.5 D5:.5 C5:.5 A4:1 C5:1 | B4:.5 C5:.5 B4:.5 A4:.5 G#4:2 |`,
      roots: 'F1 G1 F1 E1',
      pad: 'A3/C4 B3/D4 A3/C4 G#3/B3'
    }
  },

  // The ruins: a modal D minor, a pi-flute lead over a slow two-step, home through A.
  thailand: {
    figure: twoStep,
    beat: TWOSTEP,
    a: {
      lead: `
        A4:1.5 C5:.5 D5:1 F5:1 | E5:.5 G5:1 E5:.5 C5:2 |
        D5:.5 F5:.5 A5:1.5 G5:.5 F5:1 | E5:2 C5:1 A4:1 |
        D6:1.5 C6:.5 A5:1 F5:1 | G5:.5 Bb5:1 A5:.5 F5:1 D5:1 |
        E5:.5 G5:.5 C6:1.5 Bb5:.5 G5:1 | A5:2 E5:1 C5:1 |`,
      roots: 'D2 C2 D2 A1 D2 Bb1 C2 A1',
      pad: 'F4/A4 E4/G4 F4/A4 C4/E4 F4/A4 D4/F4 E4/G4 C4/E4'
    },
    b: {
      lead: `
        Bb5:1 A5:.5 G5:.5 D5:2 | F5:.5 A5:1 D6:1.5 C6:1 |
        Bb5:.5 G5:.5 D5:1 G5:.5 Bb5:1.5 | A5:1.5 G5:.5 E5:1 C#5:1 |`,
      roots: 'G1 D2 G1 A1',
      pad: 'Bb3/D4 F4/A4 Bb3/D4 C#4/E4'
    },
    turn: {
      lead: `
        F5:.5 Bb5:1 A5:.5 F5:1 D5:1 | E5:.5 G5:.5 C6:2 Bb5:.5 A5:.5 |
        A5:1 F5:.5 D5:.5 F5:1 A5:1 | E5:1.5 C#5:.5 A4:2 |`,
      roots: 'Bb1 C2 D2 A1',
      pad: 'D4/F4 E4/G4 F4/A4 C#4/E4'
    }
  },

  // The dictator's temple: a dark C minor drive with a flat-second Db, home through G7.
  final: {
    figure: pound,
    beat: STOMP,
    a: {
      lead: `
        C5:.5 C5:.5 Eb5:.5 G5:1 F5:.5 Eb5:1 | D5:.5 Eb5:.5 C5:1 r:.5 G4:.5 C5:1 |
        Ab5:1.5 G5:.5 F5:1 Eb5:1 | F5:.5 G5:.5 Bb5:1 D6:2 |
        C6:.5 C6:.5 Bb5:.5 G5:1 Ab5:.5 G5:1 | Eb5:.5 F5:.5 G5:1.5 Eb5:.5 C5:1 |
        Db6:1 C6:.5 Ab5:.5 F5:1 Db5:1 | B4:1.5 D5:.5 G5:2 |`,
      roots: 'C2 C2 Ab1 Bb1 C2 C2 Db2 G1',
      pad: 'Eb4/G4 Eb4/G4 C4/Eb4 D4/F4 Eb4/G4 Eb4/G4 F4/Ab4 B3/D4'
    },
    b: {
      lead: `
        F5:.5 Ab5:.5 C6:1.5 Bb5:.5 Ab5:1 | Eb6:1 C6:.5 Ab5:.5 Eb5:2 |
        F5:.5 G5:.25 Ab5:.25 Bb5:1 C6:1 F5:1 | G5:1.5 B4:.5 D5:1 F5:1 |`,
      roots: 'F1 Ab1 F1 G1',
      pad: 'Ab3/C4 C4/Eb4 Ab3/C4 B3/D4'
    },
    turn: {
      lead: `
        r:.5 C6:.5 Ab5:.5 Eb5:1 C5:.5 Eb5:1 | D5:.5 F5:.5 Bb5:1.5 Ab5:.5 F5:1 |
        Db6:.5 C6:.5 Ab5:.5 F5:.5 Db5:2 | B4:.5 D5:.5 F5:1 Ab5:1 B5:1 |`,
      roots: 'Ab1 Bb1 Db2 G1',
      pad: 'C4/Eb4 D4/F4 F4/Ab4 B3/F4'
    }
  },

  // The car smash: fast E major rock, home through B.
  bonus: {
    figure: octaves,
    beat: DRIVE,
    a: {
      lead: `
        E5:.5 E5:.5 G#5:.5 B5:1 G#5:.5 E5:1 | F#5:.5 G#5:.5 E5:1 r:1 B4:1 |
        D5:.5 G5:.5 B5:1.5 A5:.5 G5:1 | A5:1 C#6:.5 E6:1.5 C#6:1 |
        E6:.5 E6:.5 D6:.5 B5:1 G#5:.5 E5:1 | G#5:.5 B5:.5 E6:2 r:1 |
        C6:1 G5:.5 E5:.5 G5:1 C6:1 | D6:1.5 C6:.5 A5:1 F#5:1 |`,
      roots: 'E2 E2 G1 A1 E2 E2 C2 D2',
      pad: 'G#3/B3 G#3/B3 B3/D4 A3/C#4 G#3/B3 G#3/B3 C4/E4 D4/F#4'
    },
    b: {
      lead: `
        A5:.5 C#6:.5 E6:1.5 C#6:.5 A5:1 | B5:1 A5:.5 F#5:.5 E5:2 |
        F#5:.5 A5:.5 D#6:1.5 B5:.5 F#5:1 | B5:2 A5:1 G#5:1 |`,
      roots: 'A1 A1 B1 B1',
      pad: 'A3/C#4 A3/E4 B3/D#4 B3/F#4'
    },
    turn: {
      lead: `
        G5:.5 C6:1 E6:.5 G6:1 E6:1 | F#6:.5 D6:.5 A5:1 D6:1 F#6:1 |
        D#6:1.5 B5:.5 F#5:1 D#5:1 | B4:.5 D#5:.5 F#5:1 B5:2 |`,
      roots: 'C2 D2 B1 B1',
      pad: 'C4/E4 D4/F#4 B3/D#4 B3/F#4'
    }
  },

  // The credits: a warm G major ballad, home through bVI and bVII.
  ending: {
    figure: ballad,
    beat: HALF,
    a: {
      lead: `
        D5:.5 G5:.5 B5:1.5 A5:.5 G5:1 | F#5:1.5 E5:.5 D5:2 |
        E5:.5 G5:.5 B5:1 D6:1.5 C6:.5 | C6:1 B5:.5 A5:.5 G5:1 E5:1 |
        D5:.5 G5:.5 B5:1.5 D6:.5 G6:1 | F#6:1 D6:.5 B5:.5 F#5:2 |
        G5:.5 A5:.5 C6:1 E6:1.5 D6:.5 | C6:.5 B5:.5 A5:1 D5:2 |`,
      roots: 'G1 F#1 E2 C2 G1 B1 C2 D2',
      pad: 'B3/D4 A3/D4 G3/B3 E4/G4 B3/D4 D4/F#4 E4/G4 F#4/A4'
    },
    b: {
      lead: `
        B5:1.5 A5:.5 G5:1 E5:1 | E5:.5 G5:.5 C6:2 B5:.5 A5:.5 |
        A5:1 C6:.5 E6:1.5 D6:.5 C6:.5 | B5:1 A5:1 F#5:2 |`,
      roots: 'E2 C2 A1 D2',
      pad: 'G3/B3 E4/G4 C4/E4 F#4/A4'
    },
    turn: {
      lead: `
        E5:.5 G5:.5 C6:1.5 B5:.5 G5:1 | F#5:.5 A5:.5 D6:1.5 C6:.5 A5:1 |
        G5:.5 Bb5:.5 Eb6:1.5 D6:.5 Bb5:1 | A5:.5 C6:.5 F6:1 E6:1 D6:1 |`,
      roots: 'C2 D2 Eb2 F2',
      pad: 'E4/G4 F#4/A4 G4/Bb4 A4/C5'
    }
  }
};

/** Every theme's sections, `${theme}-a`, `${theme}-b` and `${theme}-turn`. */
const SECTIONS: Record<string, Note[][]> = Object.fromEntries(
  THEMES.flatMap(theme => {
    const spec = SPECS[theme];
    return [
      [`${theme}-a`, part(spec, spec.a, groove(8, spec.beat, FILL))],
      [`${theme}-b`, part(spec, spec.b, groove(4, spec.beat))],
      [`${theme}-turn`, part(spec, spec.turn, groove(4, spec.beat, FILL))]
    ];
  })
);

/** A theme's loop: AABA, the turn as the last A's answer. */
const orderOf = (theme: MusicTheme): string[] => [`${theme}-a`, `${theme}-b`, `${theme}-a`, `${theme}-turn`];

/* ------------------------------------------------------------------ */
/* intro: the coin-in crash                                             */

const INTRO: Note[][] = [
  line('A4:.25 C#5:.25 E5:.25 A5:.25 E6:3 | r:2 E5:.5 E5:.5 E5:.5 G#5:.5 |', 4),
  line('A1:.5 A2:.5 A1:3 | E1:.5 E2:.5 E1:.5 E2:.5 E1:.5 E2:.5 E1:.5 E2:.5 |', 4),
  line(pads('E4 B3/G#4'), 4),
  line(
    'k:1 r:2 k:.5 k:.5 | s:.25@.4 s:.25@.5 s:.25@.55 s:.25@.6 s:.25@.7 s:.25@.8 s:.25@.9 s:.25@1 k:.5 s:.5 k:.5 s:.5 |',
    4
  )
];

/* ------------------------------------------------------------------ */
/* stingers and endings                                                 */

/** One line per track (lead, bass, strings, drums), each phrase short and in the same FM palette. */
const STINGER_LINES: Record<string, Note[][]> = {
  // The versus screen: one crash, the brass leaping a fifth over a low A.
  [STINGERS.versus]: [line('A5:.25 E6:1.75'), line('A1:2'), line('A3:.25 E4:1.75'), line('k:.25 s:.25 k:1.5')],
  // "Fight!": two brass notes up a fourth.
  [STINGERS.roundStart]: [line('D5:.5 G5:1.5'), line('G1:.5 G2:1.5'), line('r:.5 B3:1.5'), line('s:.5 k:1.5')],
  // The KO: a slam falling an octave and a fifth onto a low C.
  [STINGERS.ko]: [line('C6:.25 G5:.25 C5:1.5'), line('C2:.5 C1:1.5'), line('r:.25 Eb4:1.75'), line('k:.5 s:.5 k:1')],
  // A perfect: up the C major arpeggio to a held E.
  [STINGERS.perfect]: [
    line('C5:.25 E5:.25 G5:.25 C6:.25 E6:2'),
    line('C2:.5 C3:.5 C2:2'),
    line('r:1 G4:2'),
    line('k:.25 k:.25 s:.5 k:2')
  ],
  // You win: the fanfare, G repeated, then up to C and E.
  [STINGERS.youWin]: [
    line('G5:.5 G5:.25 G5:.25 C6:1 E6:2'),
    line('C2:.5 C2:.5 G1:1 C2:2'),
    line('E4:2 G4:2'),
    line('k:.5 s:.5 k:.5 s:.5 s:.25 s:.25 s:.25 s:.25 k:1')
  ],
  // You lose: the brass falling stepwise onto A over a walking-down bass.
  [STINGERS.youLose]: [
    line('E5:.5 D5:.5 C5:.5 B4:.5 A4:2'),
    line('A1:1 G1:1 F1:1 E1:1'),
    line('C4:2 G#3:2'),
    line('k:1 r:1 k:1 s:1')
  ],
  // The bonus round cleared: a quick E major run to a held E.
  [STINGERS.bonusClear]: [
    line('E5:.25 G#5:.25 B5:.25 E6:1.25'),
    line('E2:.5 E3:.5 E2:1'),
    line('r:.5 B3:1.5'),
    line('k:.5 s:.5 k:1')
  ],
  // One continue-countdown tick: a staccato A and a hat.
  [STINGERS.continueTick]: [line('A5:.25 r:.25'), line('r:.5'), line('r:.5'), line('h:.25 r:.25')],
  // Game over, through `playEnding`: two bars of brass sinking chromatically onto A.
  [ENDINGS.gameOver]: [
    line('E5:1 D#5:.5 D5:.5 C#5:1 C5:1 | B4:1 A#4:1 A4:2 |', 4),
    line('A1:1 A1:1 G#1:1 G1:1 | F#1:1 F1:1 A1:2 |', 4),
    line('C4:4 | D4:2 C4:2 |', 4),
    line('k:1 r:1 k:1 r:1 | k:.5 k:.5 s:1 k:2 |', 4)
  ],
  // The ending, through `playEnding`: four bars of the credits theme landing
  // home on G, the one V to I in the score.
  [ENDINGS.ending]: [
    line('D5:.5 G5:.5 B5:1 D6:1.5 C6:.5 | B5:1 A5:.5 G5:.5 A5:2 | B5:.5 C6:.5 D6:1 E6:1 F#6:1 | G6:4 |', 4),
    line('G1:1.5 D2:.5 G2:1 D2:1 | C2:1.5 G2:.5 C3:1 G2:1 | D2:1.5 A2:.5 D3:1 A2:1 | G1:4 |', 4),
    line('B3:2 D4:2 | E4:2 C4:2 | F#4:2 A4:2 | B4:4 |', 4),
    line(`${HALF} ${HALF} k:.5 s:.5 s:.5 s:.5 s:.25 s:.25 s:.25 s:.25 k:.5 s:.5 | k:4 |`, 4)
  ]
};

export const FIGHTER_MUSIC: GameAudioOptions = {
  tempo: BASE_TEMPO,
  // Three FM voices that hold their sustain run hot, as PRIME TIME's do, so
  // the bus is trimmed to sit with the rest of the floor.
  volume: 0.07,
  tonic: p('A3'),
  tracks: [
    {
      // LEAD, YM2151 brass: ratio 1 at a high index falling over half a
      // second, the quick attack and held sustain of a section, no filter, so
      // the CPS-1's harder brass; the chip's LFO as vibrato.
      name: 'lead',
      wave: 'sine',
      fm: { ratio: 1, index: 3.2, indexDecay: 0.5 },
      adsr: { attack: 0.012, decay: 0.18, sustain: 0.62, release: 0.08 },
      vibrato: 5,
      volume: 0.8
    },
    {
      // BASS, FM slap: ratio 1 at a very high index collapsing in 40 ms, the
      // knock of a slapped string, then a round body that dies away quickly.
      name: 'bass',
      wave: 'sine',
      fm: { ratio: 1, index: 6, indexDecay: 0.04 },
      adsr: { attack: 0.002, decay: 0.14, sustain: 0.25, release: 0.04 },
      volume: 0.85
    },
    {
      // STRINGS, FM pad: ratio 2 at a low index with a slow attack, a bowed
      // section swelling under the brass, as the CPS-1 themes hold their chords.
      name: 'strings',
      wave: 'sine',
      fm: { ratio: 2, index: 0.9 },
      adsr: { attack: 0.14, decay: 0.4, sustain: 0.7, release: 0.3 },
      volume: 0.38
    },
    {
      // DRUMS, the OKI's sampled kit: the snare loud on 2 and 4.
      name: 'drums',
      volume: 0.75
    }
  ],
  // Capcom's driver doubled the lead late on a spare channel; this is that, as a send.
  echo: { time: 0.16, feedback: 0.2, mix: 0.16 },
  form: {
    intro: INTRO,
    sections: SECTIONS,
    order: orderOf('select'),
    scenes: Object.fromEntries(THEMES.map(t => [SCENES[t], { order: orderOf(t) }]))
  },
  stingers: STINGER_LINES
};
