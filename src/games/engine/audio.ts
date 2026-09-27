/**
 * Procedural chiptune audio for the arcade games.
 *
 * No binary assets: background music and sfx are synthesised at runtime with
 * the Web Audio API (oscillators + gain envelopes). The AudioContext is created
 * lazily on the first user gesture so it respects browser autoplay policy and
 * never touches `window` during SSR / Node / jsdom tests.
 *
 * Music is multi-voice: a game supplies parallel `tracks` (a lead, a bass, a
 * pad, an arpeggio…) that share one tempo, each advancing on its own note
 * lengths, with its own wave, envelope, octave and optional detuned twin for
 * warmth, and the whole mix can run through a feedback-delay echo send. A
 * score can also carry a `form`, a once-only intro and named sections in a
 * looping order with an optional rest between passes, whose voices cross each
 * section boundary together.
 *
 * A running score can also answer the game: a named voice fades in and out as
 * a layer, the form jumps to a section or to an authored danger variant at the
 * next bar line, a stinger ducks the music under a short phrase without
 * moving the loop, and a pause muffles the music behind a low-pass instead of
 * stopping it.
 *
 * Music and sound effects mute independently, each under its own global
 * localStorage key, so a preference set in one cabinet carries to the rest.
 *
 * Beyond the four stock oscillator shapes the synth has three NES pulse duties,
 * three drums built from one shared noise buffer, per-note delayed vibrato and
 * slides, and a stereo pan per voice; round 3 added an ADSR envelope, a swept
 * filter, wavetables, the NES short noise and a sustained noise voice,
 * two-operator FM, pitch envelopes and arpeggios. All of it is opt-in per
 * track or per note: a score that uses none of it builds exactly the graph it
 * built before these existed, which
 * `tests/games/audio-graph.test.ts` checks call for call. The scheduler that
 * plays a score live is the same one `renderScore` runs into an
 * `OfflineAudioContext`, so a render is what the page would have played.
 */
import { loadScore, saveScore } from './storage';
import { seededRng } from './math';

const MUSIC_MUTED_KEY = 'arcade-music-muted';
const SFX_MUTED_KEY = 'arcade-sfx-muted';
/** Pre-split single mute; migrated once into the two keys above. */
const LEGACY_MUTED_KEY = 'arcade-muted';

/** A note in a looping line: a frequency (Hz, or 0 for a rest) and a beat length. */
export interface Note {
  /** Frequency in Hz; 0 (or negative) plays a rest. */
  freq: number;
  /** Duration in beats. */
  beats: number;
  /**
   * Per-note level, 0.05–1, multiplying the track's `volume`. Defaults to 1.
   *
   * Attenuation only, deliberately: a line is shaped by ducking its weak beats
   * rather than boosting its strong ones, which keeps every voice's ceiling at
   * the track volume the mix was balanced at. Without this every note in a
   * voice fires at one level, which is what makes an otherwise decent line read
   * as a machine playing it. The floor is not zero because the envelope ramps
   * are exponential and cannot legally reach it — write a rest as `freq: 0`.
   */
  gain?: number;
  /**
   * Plays this drum instead of a pitched tone; `freq` is ignored, so write it
   * as `REST`. A percussion track is an ordinary track whose sounding notes all
   * carry one, which keeps it under the same equal-length loop rule as every
   * other voice. The hit has its own fixed length whatever `beats` says; the
   * beats only place the next one. The track's `volume` and the note's `gain`
   * apply, its wave, envelope, octave, detune and vibrato do not.
   */
  drum?: DrumName;
  /**
   * Starts the note at this frequency (Hz, transposed by the track's
   * `octaveShift` like `freq`) and glides up or down into `freq` over the
   * first 60 ms of the note (`SLIDE_TIME`, or half a shorter note): a scoop
   * into the pitch.
   */
  slideFrom?: number;
  /**
   * Glides over the last 60 ms (`SLIDE_TIME`) of the note into the next note of the
   * line (wrapping at the loop, or crossing into the voice's line in the next
   * section), portamento into the next pitch. Ignored when the next note is a
   * rest or a drum, or when a form's rest comes between them.
   */
  slideNext?: boolean;
  /**
   * This note's pitch envelope, in place of the track's `pitchEnv`. Ignored
   * when the note has a `slideFrom`, which is the same scoop written in Hz.
   */
  pitchEnv?: PitchEnv;
  /**
   * A chord in one voice, the tracker and PSG way: semitone offsets from
   * `freq` (e.g. `[0, 4, 7]` for a major triad) that the note cycles through
   * at the track's `arpRate`, starting on the first, for its whole length. The
   * steps are in seconds, not beats, so a tempo change alters how many fit in
   * a note but never how fast they go. The note's slides and pitch envelope
   * are dropped, as a tracker's arpeggio overrides its portamento.
   */
  arp?: number[];
}

/**
 * A pitch envelope: the note starts `semitones` away from its pitch (above
 * when positive) and glides into it over `time` seconds, or the whole note if
 * that is shorter. A few semitones over 30 ms is a DAC-style kick or a tom
 * punch, a couple over 100 ms a timpani, an octave or more over a beat a sweep.
 * It is a `slideFrom` measured from the note, so on a noise voice it moves the cutoff.
 */
export interface PitchEnv {
  semitones: number;
  time: number;
}

/**
 * Two-operator FM, the Mega Drive's YM2612 cut down to one modulator: a sine
 * at `ratio` times the note's frequency swings the carrier's frequency by
 * `index` times the note's frequency either side of it. Ratio 1 with an index
 * falling from 3 or so is brass; ratio 1 or 2 with a fast fall is a slap
 * bass; a ratio like 3.5 is a bell. The carrier is the voice's own wave, so
 * a pulse or a wavetable can be modulated too. Each note costs one more
 * oscillator and one more gain than it would without FM (a detuned twin
 * shares them). Measured on 2026-09-27 in Chrome's offline render, four
 * voices of eighth notes took 6.4 s to render a minute as FM sines against
 * 6.2 s as plain squares, while a detuned twin doubled it, so FM is the
 * cheap way to a rich voice and a twin on top of it the expensive one.
 */
export interface FmOptions {
  /** Modulator frequency over the note's; a whole number keeps the tone harmonic. */
  ratio: number;
  /** Peak frequency swing over the note's frequency; 0 is a plain tone, 5 is harsh. */
  index: number;
  /**
   * Seconds the index takes to fall to 5% of itself from onset, the bright
   * attack that settles into a rounder tone. Left out, it holds.
   */
  indexDecay?: number;
}

/** The three drum instruments a percussion track can play. */
export type DrumName = 'kick' | 'snare' | 'hat';

/**
 * NES pulse duties, the 2A03's 12.5%, 25% and 50% cycles. 75% is left out
 * because it sounds identical to 25%. 'pulse50' is band-limited from the same
 * series as the others, so it is close to, not the same as, 'square'.
 */
export type PulseWave = 'pulse12' | 'pulse25' | 'pulse50';

/**
 * A voice's timbre: a stock oscillator shape, a pulse duty, or 'noise', which
 * plays the voice's `noise` for the whole note through a low-pass whose cutoff
 * is the note's frequency in Hz, so a higher note is a brighter hiss: a crowd,
 * wind, surf. The envelope, `adsr`, `filter`, pan and levels apply to it and
 * a slide moves its cutoff; `detune`, `vibrato` and `wavetable` do not.
 */
export type Wave = OscillatorType | PulseWave | 'noise';

/**
 * The noise a voice's drums and noise notes use. 'white' is the shared seeded
 * buffer; 'short' is the NES noise channel's short mode, a 15-bit LFSR fed
 * back from bit 6 that repeats every 93 steps, which through the hat's
 * high-pass is a metallic ring rather than a hiss. Both are levelled to the
 * same RMS, so a kit keeps its balance whichever it uses.
 */
export type NoiseKind = 'white' | 'short';

/**
 * A single-cycle wavetable, the Game Boy wave channel's 32 steps or a Namco
 * or Amiga-style custom cycle, played through a `PeriodicWave` built once per
 * context. Give `samples` or `harmonics`.
 */
export interface Wavetable {
  /**
   * One cycle as levels in -1..1, any number of steps, held flat between them
   * as a wave RAM plays them: the steps are part of the sound, so the wave is
   * built from the stepped shape's own series (64 harmonics), not a smoothed one.
   */
  samples?: number[];
  /**
   * Levels of the sine partials 1, 2, 3 and so on, used when `samples` is
   * left out. With `bits` they are first drawn into a 32-step cycle.
   */
  harmonics?: number[];
  /**
   * Quantises the cycle to 2^bits levels across -1..1 before it is built, 4
   * for the Game Boy's wave channel. Left out, the levels are kept as written.
   */
  bits?: number;
}

/** One simultaneous voice of the music. */
export interface Track {
  /**
   * This voice's looping line. A score with a `form` takes its lines from the
   * form instead and leaves this out.
   */
  melody?: Note[];
  /** Oscillator type, pulse duty or 'noise'. Defaults to 'square'. */
  wave?: Wave;
  /** A custom single-cycle wave in place of `wave`, which it overrides for pitched notes. */
  wavetable?: Wavetable;
  /** The noise this voice's snares, hats and noise notes use. Defaults to 'white'. */
  noise?: NoiseKind;
  /** Two-operator FM on every pitched note of the voice; ignored by drums and noise notes. */
  fm?: FmOptions;
  /** A pitch envelope for every note of the voice that does not carry its own. */
  pitchEnv?: PitchEnv;
  /**
   * Steps a second for this voice's `Note.arp`, capped at 1000. Defaults to
   * 50, a PAL tracker's tick; 60 is the NES frame, and slower rates read as a
   * broken chord rather than a buzzing one.
   */
  arpRate?: number;
  /** Relative mix level 0–1 within the music bus. Defaults to 1. */
  volume?: number;
  /**
   * 'pluck' (default) is the terse fast-decay chiptune envelope; 'pad' gives a
   * slow swell and long decay so the voice sustains as an atmosphere bed.
   */
  envelope?: 'pluck' | 'pad';
  /** Whole-octave transpose applied to every note. Defaults to 0. */
  octaveShift?: number;
  /** When > 0, a second voice detuned by this many cents is layered for warmth. */
  detune?: number;
  /**
   * Delayed vibrato depth in cents (about 8 is a singer's, not a siren). The
   * note starts dead straight, the wobble begins `VIBRATO_DELAY` after onset
   * and reaches this depth by `VIBRATO_FULL`, which is also the shortest note
   * that gets any: on anything shorter it would never be heard. Defaults to 0.
   */
  vibrato?: number;
  /** Names the voice for `setLayer`, which also takes its index in `tracks`. */
  name?: string;
  /**
   * A layer that begins silent and enters on `setLayer(name, true)`, as Plants
   * vs. Zombies holds its drums back until the waves build. The voice is still
   * scheduled while silent, so it enters in step with the others.
   */
  startsMuted?: boolean;
  /**
   * Where the voice sits in the stereo field, -1 hard left to 1 hard right,
   * through an equal-power `StereoPannerNode`. Defaults to 0, the centre,
   * which makes no panner at all, so an unpanned score builds the graph it
   * always has and renders the same samples in both channels. Amiga Paula's
   * two-left, two-right split is `pan: -1` and `pan: 1`. Each note gets its
   * own panner between its envelope and wherever the voice plays to, so the
   * pan follows the voice through a layer gain and into a stinger, which goes
   * past the layers. Out of range clamps; anything not finite is the centre.
   */
  pan?: number;
  /**
   * An attack, decay, sustain, release envelope in place of `envelope`'s two
   * fixed shapes, which it overrides. The note holds its sustain for its whole
   * length (no pluck's trimmed gap) and then releases, so a release longer
   * than the gap to the next note overlaps it, as a synth's does.
   */
  adsr?: Adsr;
  /**
   * A filter on every note of the voice, between its oscillators and its
   * envelope, with its own sweep: SNES softness, brass that opens as it
   * speaks, a bass that closes after the pluck. Drums ignore it.
   */
  filter?: VoiceFilter;
}

/**
 * A voice's amplitude envelope, in seconds except `sustain`. A note shorter
 * than `attack` never reaches the peak: it gets the share of it its length
 * allows, then releases. One shorter than `attack + decay` releases from part
 * way down the decay. Negative or non-finite times are 0.
 */
export interface Adsr {
  /** Linear rise from silence to the note's peak. */
  attack: number;
  /** Exponential fall from the peak to the sustain level. */
  decay: number;
  /** The level held until the note ends, 0–1 of the peak. */
  sustain: number;
  /** Exponential fall to silence after the note ends; at least 5 ms, so it never clicks. */
  release: number;
}

/** A voice's per-note filter; see `Track.filter`. */
export interface VoiceFilter {
  /** Defaults to 'lowpass'. */
  type?: 'lowpass' | 'highpass' | 'bandpass';
  /** Where the filter settles, in Hz, clamped to the audible range. */
  cutoff: number;
  /** Web Audio's own `Q`: resonance in dB for a low- or high-pass, the width for a band-pass. Defaults to 1. */
  q?: number;
  /**
   * How far above the cutoff the note starts, in octaves, falling back to the
   * cutoff over `envDecay`; negative starts below and opens up. Defaults to 0,
   * a fixed filter.
   */
  envAmount?: number;
  /** Seconds the sweep takes from note onset. Defaults to 0.1. */
  envDecay?: number;
}

/** Feedback-delay send applied to the whole music mix. */
export interface EchoOptions {
  /** Delay time in seconds (clamped to a sane range). */
  time: number;
  /** Feedback amount 0–0.9 (higher = longer tail). */
  feedback: number;
  /** Wet level 0–1 mixed back under the dry signal. */
  mix: number;
}

/**
 * A score's form: what plays in what order. Without one a score is a single
 * block, every track looping its own `melody`. With one, each track keeps its
 * instrument (wave, envelope, volume, octave, detune, vibrato) and the form
 * supplies the lines, one per track in the order of `tracks`, all of a
 * passage the same length in beats. Every voice crosses a section boundary at
 * the same moment, so a passage cannot slide against the next one.
 */
export interface ScoreForm {
  /** Played once from the top on every `start()`, before the first pass of `order`, and never by the loop. */
  intro?: Note[][];
  /** The score's passages by name, each one line per track. */
  sections: Record<string, Note[][]>;
  /**
   * Section names in play order; the order loops. A name may appear more than
   * once, which is how first- and second-time endings are written: `['a',
   * 'a-first', 'a', 'a-second']`. A name with no section throws, as `pitch()`
   * does on a bad note name, so `music.test.ts` catches it.
   */
  order: string[];
  /**
   * Silence between passes, for cabinets whose sessions run long: after every
   * `after` passes of `order`, `beats` of nothing, then the order resumes. In
   * beats so that it scales with the tempo like the music around it.
   */
  rest?: { after: number; beats: number };
  /**
   * Beats in a bar, the grid `setSection` and `setDanger` land on. Defaults to
   * 4; a waltz writes 3.
   */
  beatsPerBar?: number;
  /**
   * An authored variant for when the game is going badly, after NES Tetris's
   * separately written fast tune near the top of the well: its own order of
   * `sections` (looping, with no rest) and optionally its own tempo, clamped
   * like any other. `setDanger(true)` switches to it at the next bar line and
   * `setDanger(false)` comes back, at the next bar line, to the section that
   * would have followed the one danger interrupted. It is the scene named
   * `danger`, which `setDanger` drives, and is written here and only here.
   */
  danger?: FormScene;
  /**
   * Scenes: orders of `sections` that loop on their own for as long as a game
   * state lasts, a menu theme, a shootout bed, a final, instead of running on
   * into the next part of `order`. `setScene(name)` moves to one at the next
   * bar line and `setScene(null)` comes back to `order` where it left off.
   * A scene loops with no rest, and plays at its own tempo if it has one.
   * `danger` is reserved for `ScoreForm.danger` and throws here.
   */
  scenes?: Record<string, FormScene>;
}

/** An order of a form's sections that loops by itself; see `ScoreForm.scenes`. */
export interface FormScene {
  order: string[];
  /** Beats per minute while the scene plays, clamped like any other; left out, the score's. */
  tempo?: number;
}

export interface GameAudioOptions {
  /** Parallel voices; all share `tempo`. */
  tracks: Track[];
  /** Optional intro, sections and rest; see `ScoreForm`. */
  form?: ScoreForm;
  /** Tempo in beats per minute. Defaults to 120. */
  tempo?: number;
  /** Master music volume 0–1. Defaults to 0.14 (chiptune sits politely under play). */
  volume?: number;
  /** Optional echo send on the whole music mix. */
  echo?: EchoOptions;
  /**
   * Short phrases for `playStinger`, each one line per track in the order of
   * `tracks`, played in those tracks' instruments at the tempo in force.
   */
  stingers?: Record<string, Note[][]>;
  /**
   * The score's key centre in Hz, authored as `p('A3')` (the octave does not
   * matter). When set, the pitched effects are drawn from its tonic and fifth,
   * which sit in the key whether it is major or minor; left out, they keep the
   * fixed pitches they have always had.
   */
  tonic?: number;
}

/**
 * What a cabinet's score is measured against, exported beside it from its
 * `music.ts` as `MUSIC_PROFILE`; `tests/games/music.test.ts` holds each score
 * to the floors ADR 003's round 2 amendment sets for its session, and to the
 * round 3 amendment's rule that no two cabinets share an instrument set.
 */
export interface MusicProfile {
  /**
   * How long a player stays with the music, which sets the floor on one pass
   * of the loop: 'long' is 45 s, 'standard' 30 s, 'minimal' 20 s.
   */
  session: 'long' | 'standard' | 'minimal';
  /** The fastest tempo the game ramps the score to; the floor is checked there. Left out when it never ramps. */
  fastestTempo?: number;
  /**
   * Why the score does not meet the gates yet. While it is set the test
   * asserts that at least one gate still fails, so a flag left behind by a
   * rescore that cleared them all goes red; the rescore removes it.
   */
  gatePending?: string;
  /**
   * Which of the style gates this cabinet's brief keeps (ADR 003's round 3
   * amendment). Each is on unless set to false, so a profile without `gates`
   * is held to all three; the seconds floor is not a choice and has no switch.
   * `seam` bans arriving home on the last bar, `syncopation` wants a push in
   * every eight bars of the lead, and `rhythms` wants three bar rhythms in it:
   * right for a pop-song loop, wrong for a buzzer tune or an artillery drone.
   */
  gates?: MusicGates;
  /**
   * Why this cabinet still shares its instrument set (each voice's wave,
   * envelope and register band, plus echo) with another cabinet, naming the
   * rescore that will change it. While it is set the test asserts the
   * collision still exists, so the rescore that ends it removes the flag.
   */
  palettePending?: string;
  /**
   * A profile for each of the form's `scenes`, since each one is what a player
   * hears on repeat while it holds; the top-level fields then measure `order`.
   * Every scene needs one, and `danger` none (it is a short variant, not a
   * loop a player lives in). A scene's `gates` override the cabinet's key by key.
   */
  scenes?: Record<string, Pick<MusicProfile, 'session' | 'fastestTempo' | 'gates'>>;
}

/** The style gates a cabinet may switch off; see `MusicProfile.gates`. */
export interface MusicGates {
  seam?: boolean;
  syncopation?: boolean;
  rhythms?: boolean;
}

export type SfxName = 'blip'| 'score' | 'hit' | 'explosion' | 'gameover' | 'rescue';

export interface GameAudio {
  /** Begin (or resume) the looping music. Safe to call repeatedly. */
  start(): void;
  /** Stop the music and release scheduling timers. */
  stop(): void;
  /** Flip the music mute preference and return the new value. */
  toggleMusicMute(): boolean;
  isMusicMuted(): boolean;
  setMusicMuted(muted: boolean): void;
  /** Flip the sound-effects mute preference and return the new value. */
  toggleSfxMute(): boolean;
  isSfxMuted(): boolean;
  setSfxMuted(muted: boolean): void;
  /** Play a one-shot sound effect. No-op when effects are muted or audio is unavailable. */
  playSfx(name: SfxName): void;
  /**
   * Change the loop's tempo on the fly (already-scheduled notes keep their
   * old length; the ~100ms lookahead means the shift lands almost at once).
   * Games whose pace ramps (Cascade's levels, Snake's step interval, CALCIO
   * '90's knockout stages) lean on this.
   */
  setTempo(bpm: number): void;
  /**
   * Where a score with a `form` is: the section playing or about to (the intro
   * reads as `intro`) and the audio-clock time its first notes start at, which
   * is the section boundary, and the scene it belongs to (null for `order`,
   * `danger` in the danger variant). Null for a score without a form.
   */
  section(): { name: string; start: number; danger: boolean; scene: string | null } | null;
  /**
   * Fades a voice, by `Track.name` or index, in or out over `fadeSeconds`
   * (default 0.5; 0 is a cut). A score that names a voice, starts one muted or
   * has stingers routes every voice through its own gain from the first note;
   * any other score gets them on its first `setLayer`, so a note already in
   * flight at that moment plays out at full level.
   */
  setLayer(track: number | string, on: boolean, fadeSeconds?: number): void;
  /**
   * Moves a playing score with a form into the scene `name` from its top, or
   * with null back to `order` where the score left it, at the next bar line or
   * the section's own end if that comes first. The scene then loops until the
   * next call. Asking for the scene already playing cancels any move still
   * waiting for its bar line. False when there is no such scene or the music
   * is not playing.
   */
  setScene(name: string | null): boolean;
  /**
   * Jumps a playing score with a form to the first `name` in the order in force
   * (the scene's order while in a scene), at the next bar line or the section's
   * own end if that comes first; every voice moves together and a note that
   * would cross the bar line is shortened to it, its envelope intact. False
   * when there is no such section or the music is not playing.
   */
  setSection(name: string): boolean;
  /**
   * Switches a playing score to its `form.danger` variant, or back, at the next
   * bar line; `setScene('danger')` and a return to the scene danger was entered
   * from. No-op without one. `start()` always begins outside danger, and
   * `setTempo` while in a danger variant with its own tempo only sets the
   * tempo the score returns to.
   */
  setDanger(on: boolean): void;
  /**
   * Plays a stinger over the running music: the music ducks under it and comes
   * back when it ends, and the loop carries on underneath, so no pass restarts.
   * Stingers are music: muted or stopped music plays none, and the duck is its
   * own gain, so it never lifts a mute or a stop. False when it did not play.
   */
  playStinger(name: string): boolean;
  /**
   * Muffles the music behind a low-pass and a lower level while the game is
   * paused, instead of stopping it: the score keeps its place, so unpausing
   * neither restarts it nor replays the intro, which `stop()` then `start()`
   * would.
   */
  setPaused(on: boolean): void;
  /**
   * Stop the music, drop the lifecycle listeners, and close the AudioContext.
   * Runs automatically when the page navigates away (the site uses Astro's
   * ClientRouter, so leaving a game is a DOM swap rather than a full unload and
   * the music would otherwise keep playing). Safe to call manually; idempotent.
   */
  dispose(): void;
}

function rawHasKey(key: string): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(key) !== null;
  } catch {
    return false;
  }
}

/**
 * One-time migration from the pre-split single mute: if neither new channel key
 * has been written yet but the old key says muted, seed both channels muted so
 * a returning player who silenced everything stays silenced.
 */
function migrateLegacyMute(): void {
  if (
    !rawHasKey(MUSIC_MUTED_KEY) &&
    !rawHasKey(SFX_MUTED_KEY) &&
    loadScore(LEGACY_MUTED_KEY) === 1
  ) {
    saveScore(MUSIC_MUTED_KEY, 1);
    saveScore(SFX_MUTED_KEY, 1);
  }
}

/** Reads the shared music-mute flag (1 = muted). Defaults to enabled (not muted). */
export function loadMusicMuted(): boolean {
  return loadScore(MUSIC_MUTED_KEY) === 1;
}

/** Reads the shared effects-mute flag (1 = muted). Defaults to enabled (not muted). */
export function loadSfxMuted(): boolean {
  return loadScore(SFX_MUTED_KEY) === 1;
}

type AudioCtor = typeof AudioContext;
type OfflineCtor = typeof OfflineAudioContext;

function getAudioContextCtor(): AudioCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    AudioContext?: AudioCtor;
    webkitAudioContext?: AudioCtor;
  };
  return w.AudioContext || w.webkitAudioContext || null;
}

function getOfflineContextCtor(): OfflineCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    OfflineAudioContext?: OfflineCtor;
    webkitOfflineAudioContext?: OfflineCtor;
  };
  return w.OfflineAudioContext || w.webkitOfflineAudioContext || null;
}

/**
 * Tempo ceiling. Beyond this, note durations get so short that
 * scheduleAhead's ~100ms lookahead loop has to schedule thousands of notes
 * per tick, which can freeze the tab. No cabinet plays anywhere near this.
 */
const MAX_BPM = 1000;

/** Master music volume when a score does not set one. */
const DEFAULT_VOLUME = 0.14;

/** Peak gain of a single voice before its relative `volume` scaling. */
const VOICE_PEAK = 0.8;

/** How long a `slideFrom` scoop or a `slideNext` glide takes, in seconds. */
const SLIDE_TIME = 0.06;

/** `Track.arpRate` when a voice does not set one, and the most it may. */
const ARP_RATE = 50;
const MAX_ARP_RATE = 1000;

/** Vibrato LFO rate in Hz. */
const VIBRATO_RATE = 5.5;
/** Seconds after onset that a note starts to waver. */
const VIBRATO_DELAY = 0.15;
/** Seconds after onset that the waver reaches its full depth. */
const VIBRATO_FULL = 0.4;

/** Harmonics summed into each pulse duty's `PeriodicWave`. */
const PULSE_HARMONICS = 64;

const PULSE_DUTY: Record<PulseWave, number> = { pulse12: 0.125, pulse25: 0.25, pulse50: 0.5 };

/** Length of the shared white-noise buffer, in seconds. */
const NOISE_SECONDS = 1;

/**
 * Seed for the noise buffer. Fixed so that two renders of a score with drums
 * are sample-identical, which is what lets a jukebox comparison mean anything.
 */
const NOISE_SEED = 0x2a03;

/**
 * Every drum is a fixed-length hit whose level decays from the note's peak to
 * silence over `decay` seconds. `level` balances the three against each other
 * so a score can write them all at gain 1 and get a sensible kit.
 */
const DRUMS: Record<DrumName, { decay: number; level: number }> = {
  kick: { decay: 0.15, level: 1 },
  snare: { decay: 0.15, level: 0.7 },
  hat: { decay: 0.04, level: 0.35 }
};

/**
 * Per-context caches. A `PeriodicWave` or an `AudioBuffer` belongs to the
 * context that made it, and both are worth making once rather than per note,
 * so they are keyed on the context and go when it does.
 */
const noiseBuffers = new WeakMap<BaseAudioContext, Map<NoiseKind, AudioBuffer>>();
/** Pulse duties by name, wavetables by the object a score wrote. */
const periodicWaves = new WeakMap<BaseAudioContext, Map<PulseWave | Wavetable, PeriodicWave>>();

function isPulse(wave: Wave): wave is PulseWave {
  return wave in PULSE_DUTY;
}

/**
 * The context's pulse wave at `duty`, built on first use from the pulse
 * train's Fourier series: cosine terms (2 / n pi) sin(n pi d), no sine terms.
 */
function pulseWave(ctx: BaseAudioContext, wave: PulseWave): PeriodicWave {
  return cachedWave(ctx, wave, () => {
    const d = PULSE_DUTY[wave];
    const real = new Float32Array(PULSE_HARMONICS + 1);
    const imag = new Float32Array(PULSE_HARMONICS + 1);
    for (let n = 1; n <= PULSE_HARMONICS; n++) {
      real[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * d);
    }
    return [real, imag];
  });
}

/** The context's `PeriodicWave` for `key`, built from `build`'s coefficients on first use. */
function cachedWave(
  ctx: BaseAudioContext,
  key: PulseWave | Wavetable,
  build: () => [Float32Array, Float32Array]
): PeriodicWave {
  let cache = periodicWaves.get(ctx);
  if (!cache) {
    cache = new Map();
    periodicWaves.set(ctx, cache);
  }
  let built = cache.get(key);
  if (!built) {
    const [real, imag] = build();
    built = ctx.createPeriodicWave(real, imag);
    cache.set(key, built);
  }
  return built;
}

/** Steps a `harmonics` table is drawn into before it is quantised: the Game Boy's wave RAM. */
const TABLE_STEPS = 32;

/**
 * The stepped cycle a table plays, quantised if it asks to be, or null for a
 * `harmonics` table played smooth.
 */
function tableCycle(table: Wavetable): number[] | null {
  let cycle = table.samples?.length ? table.samples : null;
  const bits = table.bits !== undefined && Number.isFinite(table.bits) ? Math.floor(table.bits) : 0;
  if (!cycle && bits >= 1 && table.harmonics?.length) {
    const partials = table.harmonics;
    const drawn = Array.from({ length: TABLE_STEPS }, (_, k) =>
      partials.reduce((sum, level, i) => sum + level * Math.sin((2 * Math.PI * (i + 1) * k) / TABLE_STEPS), 0)
    );
    const top = Math.max(...drawn.map(Math.abs));
    cycle = top > 0 ? drawn.map(v => v / top) : drawn;
  }
  if (!cycle || bits < 1) return cycle;
  const top = 2 ** bits - 1;
  return cycle.map(v => (Math.round(((Math.min(Math.max(v, -1), 1) + 1) / 2) * top) * 2) / top - 1);
}

/**
 * The context's wave for a wavetable, built on first use. A stepped cycle of N
 * levels v_k is the series of the flat-topped shape itself: harmonic n has
 * cosine term sum v_k (sin(2 pi n (k+1) / N) - sin(2 pi n k / N)) / (pi n) and
 * sine term sum v_k (cos(2 pi n k / N) - cos(2 pi n (k+1) / N)) / (pi n),
 * taken to the same 64 harmonics as a pulse duty. A smooth `harmonics` table
 * is its partials as sine terms.
 */
function tableWave(ctx: BaseAudioContext, table: Wavetable): PeriodicWave {
  return cachedWave(ctx, table, () => {
    const cycle = tableCycle(table);
    if (!cycle) {
      const partials = table.harmonics ?? [];
      const imag = new Float32Array(partials.length + 1);
      partials.forEach((level, i) => (imag[i + 1] = level));
      return [new Float32Array(partials.length + 1), imag];
    }
    const real = new Float32Array(PULSE_HARMONICS + 1);
    const imag = new Float32Array(PULSE_HARMONICS + 1);
    const steps = cycle.length;
    for (let n = 1; n <= PULSE_HARMONICS; n++) {
      const w = (2 * Math.PI * n) / steps;
      for (let k = 0; k < steps; k++) {
        real[n] += (cycle[k] * (Math.sin(w * (k + 1)) - Math.sin(w * k))) / (Math.PI * n);
        imag[n] += (cycle[k] * (Math.cos(w * k) - Math.cos(w * (k + 1)))) / (Math.PI * n);
      }
    }
    return [real, imag];
  });
}

/**
 * How fast the short noise's LFSR steps, in Hz, whatever the context's rate:
 * one step a sample at 44.1 kHz, so its 93-step cycle buzzes at about 474 Hz.
 */
const SHORT_NOISE_CLOCK = 44100;

/**
 * One cycle of the NES noise channel's short mode: a 15-bit shift register
 * from 1, fed back from bits 0 and 6, read on bit 0, until it comes round.
 */
function shortNoiseCycle(): number[] {
  const cycle: number[] = [];
  let reg = 1;
  do {
    cycle.push(reg & 1);
    reg = (reg >> 1) | (((reg ^ (reg >> 6)) & 1) << 14);
  } while (reg !== 1);
  return cycle;
}

/**
 * The context's one second of a noise, built on first use: seeded white noise,
 * or the short mode's cycle with its DC offset taken out (it is mostly zeros)
 * and scaled to white noise's RMS.
 */
function noiseBuffer(ctx: BaseAudioContext, kind: NoiseKind = 'white'): AudioBuffer {
  let cache = noiseBuffers.get(ctx);
  if (!cache) {
    cache = new Map();
    noiseBuffers.set(ctx, cache);
  }
  let buffer = cache.get(kind);
  if (!buffer) {
    const length = Math.ceil(ctx.sampleRate * NOISE_SECONDS);
    buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    if (kind === 'short') {
      const cycle = shortNoiseCycle();
      const mean = cycle.reduce((a, b) => a + b, 0) / cycle.length;
      const rms = Math.sqrt(cycle.reduce((sum, bit) => sum + (bit - mean) ** 2, 0) / cycle.length);
      const scale = 1 / Math.sqrt(3) / rms;
      for (let i = 0; i < length; i++) {
        data[i] = (cycle[Math.floor((i * SHORT_NOISE_CLOCK) / ctx.sampleRate) % cycle.length] - mean) * scale;
      }
    } else {
      const rng = seededRng(NOISE_SEED);
      for (let i = 0; i < length; i++) data[i] = rng() * 2 - 1;
    }
    cache.set(kind, buffer);
  }
  return buffer;
}

/**
 * Clamps a note's optional level into the legal attenuation range. The floor is
 * positive because `playTone`'s envelope uses exponential ramps, which cannot
 * target zero; the ceiling is 1 so a note can only duck below its track volume.
 */
function noteGain(gain: number | undefined): number {
  if (gain === undefined || !Number.isFinite(gain)) return 1;
  return Math.min(Math.max(gain, 0.05), 1);
}

/**
 * Seconds per beat for a requested tempo. A 0/NaN/Infinity tempo would give
 * the scheduler zero-length notes and a non-terminating lookahead loop, so
 * anything not finite and positive falls back to 120, and anything above
 * MAX_BPM is capped.
 */
function beatSeconds(bpm: number | undefined): number {
  const requested = bpm ?? 120;
  return 60 / (Number.isFinite(requested) && requested > 0 ? Math.min(requested, MAX_BPM) : 120);
}

interface NormTrack {
  melody: Note[];
  wave: Wave;
  volume: number;
  envelope: 'pluck' | 'pad';
  octaveShift: number;
  detune: number;
  vibrato: number;
  name: string | undefined;
  startsMuted: boolean;
  pan: number;
  adsr: Adsr | undefined;
  filter: VoiceFilter | undefined;
  wavetable: Wavetable | undefined;
  noise: NoiseKind;
  fm: FmOptions | undefined;
  pitchEnv: PitchEnv | undefined;
  arpRate: number;
}

/** Fills in per-track defaults. */
function normalizeTracks(options: GameAudioOptions): NormTrack[] {
  return options.tracks.map(t => ({
    melody: t.melody ?? [],
    wave: t.wave ?? 'square',
    volume: t.volume ?? 1,
    envelope: t.envelope ?? 'pluck',
    octaveShift: t.octaveShift ?? 0,
    detune: t.detune ?? 0,
    vibrato: t.vibrato ?? 0,
    name: t.name,
    startsMuted: t.startsMuted ?? false,
    pan: t.pan !== undefined && Number.isFinite(t.pan) ? Math.min(Math.max(t.pan, -1), 1) : 0,
    adsr: t.adsr,
    filter: t.filter,
    wavetable: t.wavetable,
    noise: t.noise ?? 'white',
    fm: t.fm,
    pitchEnv: t.pitchEnv,
    arpRate: t.arpRate !== undefined && Number.isFinite(t.arpRate) && t.arpRate > 0 ? Math.min(t.arpRate, MAX_ARP_RATE) : ARP_RATE
  }));
}

/** The optional pitch movement of one tone. */
interface ToneMotion {
  /** Frequency the tone starts at and glides from into its own. */
  slideFrom?: number;
  /** How long that glide takes, in seconds; left out, `SLIDE_TIME`. */
  slideFromTime?: number;
  /** Frequency the tone glides into over its tail. */
  slideTo?: number;
  /** Vibrato depth in cents. */
  vibrato?: number;
  /** A `Note.arp` to cycle through, and its steps a second. */
  arp?: number[];
  arpRate?: number;
}

/** The optional shaping of one tone's sound, from its voice's fields of the same names. */
interface ToneColour {
  adsr?: Adsr;
  filter?: VoiceFilter;
  wavetable?: Wavetable;
  noise?: NoiseKind;
  fm?: FmOptions;
}

/** Shortest release an `Adsr` gets, in seconds; an instant drop to silence clicks. */
const MIN_RELEASE = 0.005;
/** How long a filter's sweep takes when `envDecay` is left out, in seconds. */
const FILTER_ENV_DECAY = 0.1;

/** A time in seconds from an authored value: 0 for anything negative or not finite. */
function authoredSeconds(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Schedules an `Adsr` on a tone's level for a note held `duration` seconds,
 * and returns how long its release rings on after that. A note cut short in
 * its attack or decay stops at the level the envelope had reached, which for
 * the exponential decay is `peak * (level / peak) ^ fraction`.
 */
function shapeAdsr(level: AudioParam, start: number, duration: number, peak: number, adsr: Adsr): number {
  const attack = authoredSeconds(adsr.attack);
  const decay = authoredSeconds(adsr.decay);
  const release = Math.max(authoredSeconds(adsr.release), MIN_RELEASE);
  const sustain = Math.max(peak * Math.min(Math.max(Number.isFinite(adsr.sustain) ? adsr.sustain : 1, 0), 1), 0.0001);
  const end = start + duration;
  level.setValueAtTime(0, start);
  let held: number;
  if (attack >= duration) {
    held = peak * (attack > 0 ? duration / attack : 1);
    level.linearRampToValueAtTime(held, end);
  } else {
    level.linearRampToValueAtTime(peak, start + attack);
    const reach = Math.min(decay, duration - attack);
    held = decay > 0 ? peak * Math.pow(sustain / peak, reach / decay) : sustain;
    level.exponentialRampToValueAtTime(held, start + attack + reach);
    level.setValueAtTime(held, end);
  }
  level.exponentialRampToValueAtTime(0.0001, end + release);
  return release;
}

/** A tone's filter from its voice's `filter`, swept from onset, feeding `into`. */
function toneFilter(ctx: BaseAudioContext, spec: VoiceFilter, start: number, into: AudioNode): BiquadFilterNode {
  const nyquist = ctx.sampleRate / 2;
  const clamp = (hz: number) => Math.min(Math.max(hz, 20), nyquist);
  const cutoff = clamp(Number.isFinite(spec.cutoff) ? spec.cutoff : nyquist);
  const filter = ctx.createBiquadFilter();
  filter.type = spec.type ?? 'lowpass';
  filter.Q.setValueAtTime(spec.q !== undefined && Number.isFinite(spec.q) ? spec.q : 1, start);
  const octaves = spec.envAmount !== undefined && Number.isFinite(spec.envAmount) ? spec.envAmount : 0;
  const from = clamp(cutoff * Math.pow(2, octaves));
  filter.frequency.setValueAtTime(from, start);
  if (from !== cutoff) {
    const sweep = spec.envDecay === undefined ? FILTER_ENV_DECAY : authoredSeconds(spec.envDecay);
    filter.frequency.exponentialRampToValueAtTime(cutoff, start + sweep);
  }
  filter.connect(into);
  return filter;
}

/**
 * Schedules one enveloped tone. The order and values of the graph calls for a
 * tone with no `motion` and no `colour` are the ones the engine has always
 * made; either adds calls and never changes the ones a tone without it makes.
 */
function playTone(
  ctx: BaseAudioContext,
  freq: number,
  start: number,
  duration: number,
  type: Wave,
  peak: number,
  destination: AudioNode,
  envelope: 'pluck' | 'pad' = 'pluck',
  detune = 0,
  motion: ToneMotion = {},
  colour: ToneColour = {}
): void {
  if (freq <= 0) return;
  const gain = ctx.createGain();
  // How long the tone sounds past `duration`: an ADSR's release, else none.
  let ring = 0;
  if (colour.adsr) {
    ring = shapeAdsr(gain.gain, start, duration, peak, colour.adsr);
  } else {
    // A pad swells slowly then decays across the whole note, a soft sustained
    // bed; a pluck has a short attack then an exponential decay, the chiptune
    // envelope. Either attack is capped to a fraction of the note so a very
    // short note never schedules the decay ramp before the attack peak (which
    // glitches Web Audio).
    const attack = envelope === 'pad' ? Math.min(duration * 0.4, 0.25) : Math.min(0.01, duration * 0.5);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  }
  gain.connect(destination);
  // The oscillators feed the filter when the voice has one, else the envelope.
  const input: AudioNode = colour.filter ? toneFilter(ctx, colour.filter, start, gain) : gain;
  const stopAt = start + duration + ring + 0.02;
  const slide = Math.min(SLIDE_TIME, duration / 2);
  const slideFrom = motion.slideFrom ?? 0;
  const scoop = slideFrom > 0;
  const scoopTime = motion.slideFromTime === undefined ? slide : Math.min(motion.slideFromTime, duration);
  // A tone's frequency, or a noise note's cutoff, after its onset value: the
  // scoop into it and the glide out of it, all times `scale` for an FM
  // modulator, which follows the carrier at its ratio.
  const glide = (f: AudioParam, scale = 1): void => {
    if (scoop) f.exponentialRampToValueAtTime(freq * scale, start + scoopTime);
    if (motion.slideTo !== undefined && motion.slideTo > 0) {
      f.setValueAtTime(freq * scale, start + duration - slide);
      f.exponentialRampToValueAtTime(motion.slideTo * scale, start + duration);
    }
  };
  // An arpeggio holds each step until the next, so it starts on its first
  // offset and moves on at every step that begins inside the note.
  const arp = motion.arp?.length ? motion.arp : null;
  const arpRate = motion.arpRate ?? ARP_RATE;
  const arpFreq = (i: number): number => (arp ? freq * Math.pow(2, arp[i % arp.length] / 12) : freq);
  const onset = scoop ? slideFrom : arpFreq(0);
  const arpeggiate = (f: AudioParam, scale = 1): void => {
    if (!arp) return;
    for (let i = 1; i / arpRate < duration; i++) f.setValueAtTime(arpFreq(i) * scale, start + i / arpRate);
  };
  if (type === 'noise') {
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer(ctx, colour.noise);
    // The buffer is a second long; a longer note loops it.
    source.loop = true;
    const cutoff = ctx.createBiquadFilter();
    cutoff.type = 'lowpass';
    cutoff.frequency.setValueAtTime(onset, start);
    glide(cutoff.frequency);
    arpeggiate(cutoff.frequency);
    source.connect(cutoff);
    cutoff.connect(input);
    source.start(start);
    source.stop(stopAt);
    return;
  }
  // One LFO per note, shared by the twin so the two waver together. It feeds
  // `detune`, which is in cents, so the depth gain is the depth in cents.
  let depth: GainNode | null = null;
  const vibrato = motion.vibrato ?? 0;
  if (vibrato > 0 && duration >= VIBRATO_FULL) {
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(VIBRATO_RATE, start);
    depth = ctx.createGain();
    depth.gain.setValueAtTime(0, start);
    depth.gain.setValueAtTime(0, start + VIBRATO_DELAY);
    depth.gain.linearRampToValueAtTime(vibrato, start + VIBRATO_FULL);
    lfo.connect(depth);
    lfo.start(start);
    lfo.stop(stopAt);
  }
  // One modulator per note, shared by the twin, into the carriers' frequency
  // through a gain whose level is the swing in Hz.
  let swing: GainNode | null = null;
  const fm = colour.fm;
  if (fm && Number.isFinite(fm.ratio) && fm.ratio > 0 && Number.isFinite(fm.index)) {
    const modulator = ctx.createOscillator();
    modulator.type = 'sine';
    modulator.frequency.setValueAtTime(onset * fm.ratio, start);
    glide(modulator.frequency, fm.ratio);
    arpeggiate(modulator.frequency, fm.ratio);
    swing = ctx.createGain();
    swing.gain.setValueAtTime(fm.index * freq, start);
    if (fm.indexDecay !== undefined && authoredSeconds(fm.indexDecay) > 0) {
      swing.gain.setTargetAtTime(0, start, fm.indexDecay / 3);
    }
    modulator.connect(swing);
    modulator.start(start);
    modulator.stop(stopAt);
    // The vibrato moves the modulator with the carrier, so the ratio holds.
    if (depth) depth.connect(modulator.detune);
  }
  const spawn = (cents: number): void => {
    const osc = ctx.createOscillator();
    if (colour.wavetable) osc.setPeriodicWave(tableWave(ctx, colour.wavetable));
    else if (isPulse(type)) osc.setPeriodicWave(pulseWave(ctx, type));
    else osc.type = type;
    osc.frequency.setValueAtTime(onset, start);
    if (cents) osc.detune.setValueAtTime(cents, start);
    osc.connect(input);
    osc.start(start);
    osc.stop(stopAt);
    glide(osc.frequency);
    arpeggiate(osc.frequency);
    if (depth) depth.connect(osc.detune);
    if (swing) swing.connect(osc.frequency);
  };
  spawn(0);
  // A slightly detuned twin thickens the voice into a warm chorus.
  if (detune > 0) spawn(detune);
}

/** A burst of a shared noise through a filter, decaying to silence. */
function noiseHit(
  ctx: BaseAudioContext,
  start: number,
  decay: number,
  peak: number,
  filterType: BiquadFilterType,
  cutoff: number,
  destination: AudioNode,
  noise: NoiseKind
): void {
  const source = ctx.createBufferSource();
  source.buffer = noiseBuffer(ctx, noise);
  const filter = ctx.createBiquadFilter();
  filter.type = filterType;
  filter.frequency.setValueAtTime(cutoff, start);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(peak, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + decay);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(destination);
  source.start(start);
  source.stop(start + decay + 0.02);
}

/** A triangle whose level (and, for the kick, pitch) falls away at once. */
function toneHit(
  ctx: BaseAudioContext,
  start: number,
  decay: number,
  peak: number,
  from: number,
  to: number,
  destination: AudioNode
): void {
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(from, start);
  if (to !== from) osc.frequency.exponentialRampToValueAtTime(to, start + 0.06);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(peak, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + decay);
  osc.connect(gain);
  gain.connect(destination);
  osc.start(start);
  osc.stop(start + decay + 0.02);
}

/**
 * The three drums. The kick is a triangle dropping from 150 to 45 Hz in 60 ms,
 * the NES's own trick for a kick on a channel with no noise in it; the snare
 * is band-passed noise over a short 200 Hz triangle body; the hat is noise
 * high-passed at 7 kHz. The noise is the voice's own (`Track.noise`).
 */
function playDrum(
  ctx: BaseAudioContext,
  name: DrumName,
  start: number,
  peak: number,
  destination: AudioNode,
  noise: NoiseKind = 'white'
): void {
  const { decay, level } = DRUMS[name];
  const p = peak * level;
  switch (name) {
    case 'kick':
      toneHit(ctx, start, decay, p, 150, 45, destination);
      break;
    case 'snare':
      noiseHit(ctx, start, decay, p, 'bandpass', 1500, destination, noise);
      toneHit(ctx, start, 0.08, p * 0.6, 200, 200, destination);
      break;
    case 'hat':
      noiseHit(ctx, start, decay, p, 'highpass', 7000, destination, noise);
      break;
  }
}

/**
 * A voice's place in its line: when its next note starts, which it is, and
 * (under a form) how many beats of the part it has played, which is what a
 * bar line is counted in so that a tempo change mid-part cannot move it.
 */
interface Cursor {
  next: number;
  idx: number;
  beat: number;
}

/** One passage of a form, a line per track. */
interface Part {
  name: string;
  lines: Note[][];
}

/** A form with its names resolved and one line per track in every part. */
interface NormForm {
  intro: Part | null;
  order: Part[];
  /** Passes of `order` between rests; 0 for no rest. */
  restAfter: number;
  restBeats: number;
  beatsPerBar: number;
  /** Each scene's order and its seconds per beat (null keeps the score's); `danger` among them. */
  scenes: Map<string, { order: Part[]; spb: number | null }>;
}

/** The scene `form.danger` becomes and `setDanger` drives. */
const DANGER = 'danger';

/**
 * Where a score with a form is. The scheduler advances it, and only `start()`
 * and an un-mute put it back. `step` is -1 for the intro, otherwise an index
 * into the order; `pass` counts completed passes of the order; `start` is
 * when the part's first notes play, the boundary every voice crosses together.
 */
interface FormPosition {
  step: number;
  pass: number;
  start: number;
  /** The scene whose order `step` indexes, or null for the form's `order`. */
  scene: string | null;
}

/** A requested move (`setSection`, `setScene`, `setDanger`) and the bar line it lands on. */
interface Jump {
  step: number;
  pass: number;
  scene: string | null;
  cut: number;
}

/** A score's form and where it has got to, for one performance of it. */
interface FormState {
  form: NormForm;
  pos: FormPosition;
  /** A jump waiting for its bar line, or null. */
  pending: Jump | null;
  /** Where the order picks up again when the score comes back from a scene. */
  resume: { step: number; pass: number } | null;
  /** The scene danger was entered from, which releasing it returns to. */
  beforeDanger: string | null;
}

/** The beats a line lasts as the scheduler plays it: a non-positive length still steps one beat. */
function lineBeats(line: Note[]): number {
  return line.reduce((sum, n) => sum + (n.beats > 0 ? n.beats : 1), 0);
}

/** How long a part lasts: its longest line. */
function partBeats(part: Part): number {
  return Math.max(0, ...part.lines.map(lineBeats));
}

/** Resolves a score's form, or null for a score without one. */
function normalizeForm(options: GameAudioOptions): NormForm | null {
  const form = options.form;
  if (!form) return null;
  const voices = options.tracks.length;
  const fit = (name: string, lines: Note[][]): Part => ({
    name,
    lines: Array.from({ length: voices }, (_, t) => lines[t] ?? [])
  });
  const resolve = (names: string[]): Part[] =>
    names.map(name => {
      const lines = Object.hasOwn(form.sections, name) ? form.sections[name] : undefined;
      if (!lines) throw new Error(`score form: no section named "${name}"`);
      return fit(name, lines);
    });
  const order = resolve(form.order);
  // One way to write it, so every reader of a form (the gates, the jukebox)
  // finds the danger variant in the same place.
  if (form.scenes && Object.hasOwn(form.scenes, DANGER)) {
    throw new Error('score form: "danger" is reserved; write the danger variant as form.danger');
  }
  const scenes = new Map<string, { order: Part[]; spb: number | null }>();
  const written: Record<string, FormScene> = { ...form.scenes, ...(form.danger && { [DANGER]: form.danger }) };
  for (const [name, scene] of Object.entries(written)) {
    const parts = resolve(scene.order);
    // A scene with no notes would loop without moving the clock; it is left
    // out, so asking for it is refused rather than hanging the scheduler.
    if (parts.some(part => partBeats(part) > 0)) {
      scenes.set(name, { order: parts, spb: scene.tempo === undefined ? null : beatSeconds(scene.tempo) });
    }
  }
  const bar = form.beatsPerBar ?? 4;
  const intro = form.intro ? fit('intro', form.intro) : null;
  const after = Math.floor(form.rest?.after ?? 0);
  const beats = form.rest?.beats ?? 0;
  const resting = after >= 1 && Number.isFinite(beats) && beats > 0;
  return {
    intro: intro && partBeats(intro) > 0 ? intro : null,
    // An order with no notes anywhere would advance forever without moving
    // the clock, so it plays as silence instead.
    order: order.some(part => partBeats(part) > 0) ? order : [],
    restAfter: resting ? after : 0,
    restBeats: resting ? beats : 0,
    beatsPerBar: Number.isFinite(bar) && bar > 0 ? bar : 4,
    scenes
  };
}

/** The top of a form: the intro if it has one, else the first section. */
function formTop(form: NormForm, at: number): FormPosition {
  return { step: form.intro ? -1 : 0, pass: 0, start: at, scene: null };
}

function orderOf(form: NormForm, scene: string | null): Part[] {
  return (scene !== null && form.scenes.get(scene)?.order) || form.order;
}

function partAt(form: NormForm, pos: { step: number; scene: string | null }): Part {
  return pos.step < 0 ? (form.intro as Part) : orderOf(form, pos.scene)[pos.step];
}

/** Seconds per beat where the form is: the scene's own tempo, if it has one, else the score's. */
function formBeatSeconds(form: NormForm, scene: string | null, spb: number): number {
  return (scene !== null && form.scenes.get(scene)?.spb) || spb;
}

/**
 * What follows the current part, and whether a rest comes first: the one place
 * the form's next move is decided. A pending jump takes the place of the
 * order's next step; a scene loops its own order without rests.
 */
function nextStep(state: FormState): { step: number; pass: number; scene: string | null; rest: boolean } {
  const { form, pos, pending } = state;
  if (pending) return { step: pending.step, pass: pending.pass, scene: pending.scene, rest: false };
  const order = orderOf(form, pos.scene);
  if (pos.step + 1 < order.length) return { step: pos.step + 1, pass: pos.pass, scene: pos.scene, rest: false };
  if (pos.scene !== null) return { step: 0, pass: pos.pass, scene: pos.scene, rest: false };
  const pass = pos.pass + 1;
  return { step: 0, pass, scene: null, rest: form.restAfter > 0 && pass % form.restAfter === 0 };
}

/**
 * The first bar line at or after everything the voices have already handed to
 * the audio graph, so a jump never overlaps a note that is already sounding.
 * Bars are counted in the part's own beats from its start; a voice that has
 * not reached its part (a rest) gives the part's start.
 */
function nextBarLine(state: FormState, cursors: Cursor[], spb: number): number {
  let lead = cursors[0];
  for (const v of cursors) if (v.next > lead.next) lead = v;
  if (!lead || lead.next <= state.pos.start) return state.pos.start;
  const bar = state.form.beatsPerBar;
  const beats = Math.ceil(lead.beat / bar - 1e-9) * bar - lead.beat;
  return lead.next + Math.max(0, beats) * formBeatSeconds(state.form, state.pos.scene, spb);
}

/**
 * Schedules one note of a line onto `bus`. `following` is the note the line
 * goes on to, for a `slideNext`, or undefined when there is none to glide to.
 */
function playNote(
  ctx: BaseAudioContext,
  bus: AudioNode,
  track: NormTrack,
  note: Note,
  following: Note | undefined,
  at: number,
  dur: number
): void {
  const peak = VOICE_PEAK * track.volume * noteGain(note.gain);
  // A rest makes no nodes, so it gets no panner either.
  const sounds = !!note.drum || note.freq > 0;
  const out = track.pan === 0 || !sounds ? bus : panTo(ctx, bus, track.pan, at);
  if (note.drum) {
    playDrum(ctx, note.drum, at, peak, out, track.noise);
    return;
  }
  // Pads and ADSR voices play their full length so they sustain and connect
  // (an ADSR's release then rings past it); plucks trim to leave the terse
  // gap that reads as chiptune.
  const playDur = track.envelope === 'pad' || track.adsr ? dur : dur * 0.9;
  const shift = (f: number | undefined): number | undefined =>
    f !== undefined && f > 0 ? f * Math.pow(2, track.octaveShift) : f;
  const freq = note.freq > 0 ? note.freq * Math.pow(2, track.octaveShift) : note.freq;
  const motion: ToneMotion = {
    vibrato: track.vibrato,
    slideFrom: shift(note.slideFrom),
    slideTo: note.slideNext && following && !following.drum ? shift(following.freq) : undefined
  };
  const env = note.pitchEnv ?? track.pitchEnv;
  if (motion.slideFrom === undefined && env && freq > 0 && Number.isFinite(env.semitones) && env.semitones !== 0) {
    motion.slideFrom = freq * Math.pow(2, env.semitones / 12);
    motion.slideFromTime = authoredSeconds(env.time);
  }
  if (note.arp?.length) {
    // The arpeggio owns the pitch for the whole note.
    motion.slideFrom = undefined;
    motion.slideTo = undefined;
    motion.arp = note.arp;
    motion.arpRate = track.arpRate;
  }
  const colour: ToneColour = {
    adsr: track.adsr,
    filter: track.filter,
    wavetable: track.wavetable,
    noise: track.noise,
    fm: track.fm
  };
  playTone(ctx, freq, at, playDur, track.wave, peak, out, track.envelope, track.detune, motion, colour);
}

/** A panner at `pan` feeding `bus`, for one note of a panned voice. */
function panTo(ctx: BaseAudioContext, bus: AudioNode, pan: number, at: number): StereoPannerNode {
  const panner = ctx.createStereoPanner();
  panner.pan.setValueAtTime(pan, at);
  panner.connect(bus);
  return panner;
}

/**
 * Schedules every track's notes that start before `horizon`, each onto its own
 * entry of `buses` (the music bus, or the voice's layer gain), advancing each
 * cursor past them. This is the whole of the scheduler: the live engine calls
 * it every 25 ms with a horizon ~100 ms ahead, and `renderScore` calls it once
 * with the horizon at the end of the render. `silent` advances the cursors
 * without making any nodes (the music mute). A score with a form goes to
 * `scheduleForm`; one without keeps every voice wrapping its own line, exactly
 * as it always has.
 */
function scheduleWindow(
  ctx: BaseAudioContext,
  buses: AudioNode[],
  tracks: NormTrack[],
  cursors: Cursor[],
  horizon: number,
  secondsPerBeat: number,
  silent: boolean,
  state: FormState | null
): void {
  if (state) {
    scheduleForm(ctx, buses, tracks, cursors, horizon, secondsPerBeat, silent, state);
    return;
  }
  for (let t = 0; t < tracks.length; t++) {
    const track = tracks[t];
    if (track.melody.length === 0) continue;
    const v = cursors[t];
    while (v.next < horizon) {
      const note = track.melody[v.idx];
      const dur = note.beats * secondsPerBeat;
      // A non-positive beat length would never advance the cursor past the
      // horizon, spinning this loop forever; skip the note but still step the
      // cursor by a beat so a bad authoring value can't freeze the tab.
      if (dur <= 0) {
        v.next += secondsPerBeat;
        v.idx = (v.idx + 1) % track.melody.length;
        continue;
      }
      // When muted, keep each cursor advancing but skip oscillator creation so
      // we don't burn CPU synthesising silent tones; timing stays in sync on unmute.
      if (!silent) {
        playNote(ctx, buses[t], track, note, track.melody[(v.idx + 1) % track.melody.length], v.next, dur);
      }
      v.next += dur;
      v.idx = (v.idx + 1) % track.melody.length;
    }
  }
}

/**
 * The form half of `scheduleWindow`. Each voice plays its line of the current
 * part and then waits at its end; once every voice has finished, the form
 * moves on and every cursor restarts at one shared boundary, the latest of
 * their ends plus any rest. Snapping to one time is what keeps the voices
 * together across boundaries, whatever rounding or tempo change came before.
 * A pending jump ends the part early at its bar line instead: no voice starts
 * a note at or after it, and a note that would cross it is shortened to end
 * there, so the part stops on the bar with every envelope closed.
 */
function scheduleForm(
  ctx: BaseAudioContext,
  buses: AudioNode[],
  tracks: NormTrack[],
  cursors: Cursor[],
  horizon: number,
  secondsPerBeat: number,
  silent: boolean,
  state: FormState
): void {
  const { form, pos } = state;
  if (form.order.length === 0 || tracks.length === 0) return;
  for (;;) {
    const lines = partAt(form, pos).lines;
    const spb = formBeatSeconds(form, pos.scene, secondsPerBeat);
    const cut = state.pending ? state.pending.cut : Infinity;
    let playing = false;
    for (let t = 0; t < tracks.length; t++) {
      const line = lines[t];
      const v = cursors[t];
      while (v.idx < line.length && v.next < horizon && v.next < cut) {
        const note = line[v.idx];
        const dur = note.beats * spb;
        // The same guard as above: a bad length still steps one beat.
        if (dur <= 0) {
          v.next = Math.min(v.next + spb, cut);
          v.beat += 1;
          v.idx++;
          continue;
        }
        const end = Math.min(v.next + dur, cut);
        if (!silent) {
          let following: Note | undefined = end < v.next + dur ? undefined : line[v.idx + 1];
          if (!following && end === v.next + dur) {
            const after = nextStep(state);
            following = after.rest ? undefined : partAt(form, after).lines[t][0];
          }
          playNote(ctx, buses[t], tracks[t], note, following, v.next, end - v.next);
        }
        v.next = end;
        v.beat += note.beats;
        v.idx++;
      }
      if (v.idx < line.length && v.next < cut) playing = true;
    }
    if (playing) return;
    // The form moves on only once the boundary is inside the window, so until
    // then it still names the part that is sounding.
    const end = Math.max(...cursors.map(v => v.next));
    if (end >= horizon) return;
    const after = nextStep(state);
    // Leaving the order for a scene remembers where the order would have gone
    // next, which is where coming back picks up; danger also remembers the
    // scene it interrupted, which is where releasing it goes.
    if (after.scene !== null && pos.scene === null) {
      const resume = nextStep({ ...state, pending: null });
      state.resume = { step: resume.step, pass: resume.pass };
    }
    if (after.scene === DANGER && pos.scene !== DANGER) state.beforeDanger = pos.scene;
    if (after.scene === null) state.resume = null;
    state.pending = null;
    pos.step = after.step;
    pos.pass = after.pass;
    pos.scene = after.scene;
    pos.start = end + (after.rest ? form.restBeats * spb : 0);
    for (const v of cursors) {
      v.next = pos.start;
      v.idx = 0;
      v.beat = 0;
    }
  }
}

/**
 * How long a score lasts at `tempo` (its own when left out), in seconds: the
 * once-only intro, one pass of the loop, and the rest that follows every
 * `restEvery` passes (both 0 without one). A score without a form is one pass
 * of its longest line. The intro and the rest are kept apart from the pass
 * because neither is music the player hears over and over.
 */
export function scoreSeconds(
  options: GameAudioOptions,
  tempo = options.tempo
): { intro: number; pass: number; rest: number; restEvery: number } {
  const spb = beatSeconds(tempo);
  const form = normalizeForm(options);
  if (!form) {
    const longest = Math.max(0, ...options.tracks.map(t => lineBeats(t.melody ?? [])));
    return { intro: 0, pass: longest * spb, rest: 0, restEvery: 0 };
  }
  return {
    intro: (form.intro ? partBeats(form.intro) : 0) * spb,
    pass: form.order.reduce((sum, part) => sum + partBeats(part), 0) * spb,
    rest: form.restBeats * spb,
    restEvery: form.restAfter
  };
}

/**
 * The music graph: `master` carries the volume and feeds the destination;
 * `bus` is the dry sum of every voice and the echo send's input.
 */
function buildMusicGraph(
  ctx: BaseAudioContext,
  volume: number,
  echo: EchoOptions | undefined
): { master: GainNode; bus: GainNode } {
  const master = ctx.createGain();
  master.gain.value = volume;
  master.connect(ctx.destination);
  const bus = ctx.createGain();
  bus.gain.value = 1;
  bus.connect(master);
  if (echo) {
    // Dry stays on bus → master; a delay line with feedback taps the bus and
    // mixes a wet copy back in under the dry signal.
    const time = Math.min(Math.max(echo.time, 0.001), 0.95);
    const delay = ctx.createDelay(1);
    delay.delayTime.value = time;
    const feedback = ctx.createGain();
    feedback.gain.value = Math.min(Math.max(echo.feedback, 0), 0.9);
    const wet = ctx.createGain();
    wet.gain.value = Math.max(echo.mix, 0);
    bus.connect(delay);
    delay.connect(feedback);
    feedback.connect(delay);
    delay.connect(wet);
    wet.connect(master);
  }
  return { master, bus };
}

/** How far a stinger pulls the music down under it (about -12 dB). */
const STINGER_DUCK = 0.25;
/** Where the pause filter closes to, and the level the paused music keeps. */
const PAUSE_CUTOFF = 600;
const PAUSE_GAIN = 0.5;
/** Time constant of the pause filter's and the stinger duck's ramps, in seconds. */
const ADAPT_RAMP = 0.05;
/** A layer's fade when `setLayer` is not given one, in seconds. */
const LAYER_FADE = 0.5;

/** Whether a score declares anything that needs per-voice gains from its first note. */
function wantsLayers(options: GameAudioOptions): boolean {
  return !!options.stingers || options.tracks.some(t => t.name !== undefined || t.startsMuted);
}

/**
 * The adaptive half of the music graph: a gain per voice, for layers, into
 * one `lane` gain that a stinger ducks, into the bus. A stinger itself goes
 * straight to the bus, past both, so neither a muted layer nor its own duck
 * can silence it.
 */
function buildLayers(
  ctx: BaseAudioContext,
  bus: AudioNode,
  tracks: NormTrack[],
  on: (t: number) => boolean
): { lane: GainNode; gains: GainNode[] } {
  const lane = ctx.createGain();
  lane.gain.value = 1;
  lane.connect(bus);
  const gains = tracks.map((_, t) => {
    const g = ctx.createGain();
    g.gain.value = on(t) ? 1 : 0;
    g.connect(lane);
    return g;
  });
  return { lane, gains };
}

/** The index of a voice named by index or by `Track.name`, or -1. */
function trackIndex(tracks: NormTrack[], track: number | string): number {
  if (typeof track === 'number') return Number.isInteger(track) && track >= 0 && track < tracks.length ? track : -1;
  return tracks.findIndex(t => t.name === track);
}

/** Where a render starts: which layers sound, whether in danger, and at which section. */
export interface RenderState {
  /** Each named or indexed voice on or off; the rest start as their score says. */
  layers?: Record<string, boolean>;
  /** Starts in the form's danger variant, at its tempo; the same as `scene: 'danger'`, and wins over `scene`. */
  danger?: boolean;
  /** Starts in this scene, at its tempo, skipping the intro. */
  scene?: string;
  /** Starts at the first of this section in the order (or the scene's order), skipping the intro. */
  section?: string;
}

/**
 * Renders the first `seconds` of a score, from the top, into a stereo
 * `AudioBuffer` through an `OfflineAudioContext`, using the same graph and the
 * same scheduler the live engine plays it with. For development tools (the
 * jukebox) that need to hear or compare a score without a game around it.
 * Resolves to null where there is no `OfflineAudioContext` (SSR, Node), or
 * the length or sample rate is not one it can render at.
 */
export async function renderScore(
  options: GameAudioOptions,
  seconds: number,
  sampleRate = 44100,
  from: RenderState = {}
): Promise<AudioBuffer | null> {
  const Ctor = getOfflineContextCtor();
  if (!Ctor || !Number.isFinite(seconds) || seconds <= 0) return null;
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) return null;
  let ctx: OfflineAudioContext;
  try {
    // Stereo, for `Track.pan`. Every node before a panner is mono, and the
    // destination up-mixes a mono input by copying it to both sides, so an
    // unpanned score renders today's mono samples in each channel.
    ctx = new Ctor(2, Math.ceil(seconds * sampleRate), sampleRate);
  } catch {
    // A rate the browser does not support is a RangeError from the constructor.
    return null;
  }
  const { bus } = buildMusicGraph(ctx, options.volume ?? DEFAULT_VOLUME, options.echo);
  const tracks = normalizeTracks(options);
  const cursors = tracks.map(() => ({ next: 0, idx: 0, beat: 0 }));
  const form = normalizeForm(options);
  const state: FormState | null = form && { form, pos: formTop(form, 0), pending: null, resume: null, beforeDanger: null };
  let buses: AudioNode[] = tracks.map(() => bus);
  const layers = from.layers ?? {};
  if (wantsLayers(options) || Object.keys(layers).length > 0) {
    const picked = new Map<number, boolean>();
    for (const [key, on] of Object.entries(layers)) {
      const t = trackIndex(tracks, /^\d+$/.test(key) ? Number(key) : key);
      if (t >= 0) picked.set(t, on);
    }
    buses = buildLayers(ctx, bus, tracks, t => picked.get(t) ?? !tracks[t].startsMuted).gains;
  }
  if (state) {
    // Danger wins, as it does live, where it lands after the scene it interrupts.
    const scene = from.danger && state.form.scenes.has(DANGER) ? DANGER : from.scene;
    state.pos.scene = scene !== undefined && state.form.scenes.has(scene) ? scene : null;
    if (state.pos.scene !== null || from.section !== undefined) {
      const step = from.section === undefined ? 0 : orderOf(state.form, state.pos.scene).findIndex(p => p.name === from.section);
      if (step >= 0) state.pos.step = step;
      else if (state.pos.scene !== null) state.pos.step = 0;
    }
  }
  scheduleWindow(ctx, buses, tracks, cursors, seconds, beatSeconds(options.tempo), false, state);
  return ctx.startRendering();
}

/**
 * Effects level, as a multiple of the score's loudest voice at its peak.
 *
 * Effects used to go out at a fixed 0.6, which with tone peaks of 0.5 to 0.6
 * put a single `hit` about 12 dB over Line Hold's lead. The level is tied to
 * the score rather than lowered to a new constant because the cabinets' music
 * masters differ: the loudest voice runs from 0.068 (Critter Rescue) to 0.112
 * (Snake), so one fixed level that clears the 6 dB ceiling on the quietest
 * score would sit 4.3 dB lower against the loudest. It is read from the
 * options and not from the live master gain, so muting the music leaves the
 * effects exactly where they were. At 3, a tone peaking at 0.6 lands at 1.8x
 * the lead, +5.1 dB.
 */
const SFX_OVER_MUSIC = 3;

/**
 * Shortest gap, in seconds of audio time, between two plays of one effect.
 * Line Hold fires `hit` six or seven times a second in its late waves, and two
 * copies of one effect started together add in phase, +6 dB on their own. The
 * default only stops same-frame duplicates.
 */
const SFX_MIN_INTERVAL: Partial<Record<SfxName, number>> = { hit: 0.12, blip: 0.12 };
const SFX_DEFAULT_INTERVAL = 0.05;

/** Effects that mark an event rather than an action, and duck the music under them. */
const DUCKING_SFX: ReadonlySet<SfxName> = new Set(['explosion', 'gameover', 'rescue', 'score']);
/** Duck depth (about -5 dB) and how long it is held before the music comes back. */
const DUCK_GAIN = 0.56;
const DUCK_HOLD_MS = 200;

/**
 * Each pitched effect's fixed pitches, and the same line written as semitones
 * above the tonic, used when the score names one. Only the tonic, fifth and
 * their octaves are used, since a third would have to know the mode. The
 * explosion is left out on purpose: it is a detuned cluster standing in for
 * noise, not a line.
 */
const SFX_PITCH: Partial<Record<SfxName, { hz: number[]; semis: number[] }>> = {
  blip: { hz: [660], semis: [7] },
  score: { hz: [784, 1047], semis: [7, 12] },
  hit: { hz: [180, 110], semis: [7, 0] },
  gameover: { hz: [440, 330, 220], semis: [12, 7, 0] },
  rescue: { hz: [880, 1108.73, 1318.51, 1760], semis: [-5, 0, 7, 12] }
};

/**
 * An effect's pitches: the fixed ones, or the in-key line moved by whole
 * octaves so its first note lands nearest the fixed first note. The whole line
 * moves by one octave count, which keeps its contour and its register.
 */
function sfxPitches(name: SfxName, tonic: number | undefined): number[] {
  const line = SFX_PITCH[name];
  if (!line) return [];
  if (tonic === undefined || !Number.isFinite(tonic) || tonic <= 0) return line.hz;
  const first = tonic * Math.pow(2, line.semis[0] / 12);
  const octaves = Math.round(Math.log2(line.hz[0] / first));
  return line.semis.map(s => tonic * Math.pow(2, s / 12 + octaves));
}

export function createGameAudio(options: GameAudioOptions): GameAudio {
  migrateLegacyMute();

  const volume = options.volume ?? DEFAULT_VOLUME;
  let secondsPerBeat = beatSeconds(options.tempo);

  const tracks = normalizeTracks(options);

  let musicMuted = loadMusicMuted();
  let sfxMuted = loadSfxMuted();
  let running = false;
  let disposed = false;
  let ctx: AudioContext | null = null;
  // musicMaster carries volume + the music mute and feeds the destination;
  // musicBus is the dry sum of every voice and the echo send's input.
  let musicMaster: GainNode | null = null;
  let musicBus: GainNode | null = null;
  // One scheduling cursor per track: they advance independently on their own
  // note lengths so a slow bass and a busy lead stay locked to the same clock.
  const voice: Cursor[] = tracks.map(() => ({ next: 0, idx: 0, beat: 0 }));
  // A score with a form also carries where in the form it is; null without one.
  const formPlan = normalizeForm(options);
  const form: FormState | null = formPlan && { form: formPlan, pos: formTop(formPlan, 0), pending: null, resume: null, beforeDanger: null };
  let scheduler: ReturnType<typeof setInterval> | null = null;
  // Where each voice's notes go: the bus, until layers exist, then its own gain.
  let buses: AudioNode[] = [];
  let lane: GainNode | null = null;
  let layerGains: GainNode[] | null = null;
  const layerOn = tracks.map(t => !t.startsMuted);
  const stingers = new Map(
    Object.entries(options.stingers ?? {}).map(([name, lines]) => [
      name,
      tracks.map((_, t) => lines[t] ?? [])
    ])
  );
  let paused = false;
  let pauseFilter: BiquadFilterNode | null = null;
  let pauseGain: GainNode | null = null;

  /** Lazily create the AudioContext + music graph on first gesture. Returns null if unsupported. */
  function ensureContext(): AudioContext | null {
    // Once disposed (the page navigated away) never resurrect a context: its
    // teardown listeners are gone, so it would play on and leak.
    if (disposed) return null;
    if (ctx) return ctx;
    const Ctor = getAudioContextCtor();
    if (!Ctor) return null;
    try {
      ctx = new Ctor();
      const graph = buildMusicGraph(ctx, volume, options.echo);
      musicMaster = graph.master;
      musicBus = graph.bus;
      buses = tracks.map(() => graph.bus);
      if (wantsLayers(options)) ensureLayers();
      if (paused) applyPause();
    } catch {
      ctx = null;
      musicMaster = null;
      musicBus = null;
    }
    return ctx;
  }

  /** Puts a gain on every voice and the stinger lane in front of the bus, once. */
  function ensureLayers(): GainNode | null {
    if (!ctx || !musicBus) return null;
    if (!lane) {
      const built = buildLayers(ctx, musicBus, tracks, t => layerOn[t]);
      lane = built.lane;
      layerGains = built.gains;
      buses = built.gains;
    }
    return lane;
  }

  /**
   * Ramps the pause filter and level in or out. The filter and its gain sit
   * after the master, built the first time a pause needs them, so they muffle
   * everything already scheduled as well as what comes next, and they never
   * touch the master gain that the mute and `stop()` own.
   */
  function applyPause(): void {
    if (!ctx || !musicMaster) return;
    if (!pauseFilter || !pauseGain) {
      pauseFilter = ctx.createBiquadFilter();
      pauseFilter.type = 'lowpass';
      pauseFilter.frequency.value = ctx.sampleRate / 2;
      pauseFilter.Q.value = 0;
      pauseGain = ctx.createGain();
      pauseGain.gain.value = 1;
      musicMaster.disconnect();
      musicMaster.connect(pauseFilter);
      pauseFilter.connect(pauseGain);
      pauseGain.connect(ctx.destination);
    }
    const now = ctx.currentTime;
    pauseFilter.frequency.setTargetAtTime(paused ? PAUSE_CUTOFF : ctx.sampleRate / 2, now, ADAPT_RAMP);
    pauseGain.gain.setTargetAtTime(paused ? PAUSE_GAIN : 1, now, ADAPT_RAMP);
  }

  function scheduleAhead(): void {
    if (!ctx || !musicBus || tracks.length === 0) return;
    // Schedule every track's notes due within the next ~100ms window.
    scheduleWindow(ctx, buses, tracks, voice, ctx.currentTime + 0.1, secondsPerBeat, musicMuted, form);
  }

  /** Queues a move of the form for the next bar line. */
  function requestJump(step: number, pass: number, scene: string | null): void {
    if (!form) return;
    form.pending = { step, pass, scene, cut: nextBarLine(form, voice, secondsPerBeat) };
  }

  /** The scene the form is in, or heading to once a waiting jump lands. */
  function headingScene(state: FormState): string | null {
    return state.pending ? state.pending.scene : state.pos.scene;
  }

  /** Moves to a scene's top, or with null back to where the order left off; see `setScene`. */
  function moveToScene(state: FormState, name: string | null): void {
    // Changing its mind before the move has landed just stays where it is.
    if (name === state.pos.scene) {
      state.pending = null;
      return;
    }
    if (name === null) requestJump(state.resume?.step ?? 0, state.resume?.pass ?? state.pos.pass, null);
    else requestJump(0, state.pos.pass, name);
  }

  /**
   * Puts every voice back at the top of its line, together. With a form,
   * `fromTop` goes back to the intro (or the first section) and otherwise the
   * section the form is in starts again.
   */
  function resetCursors(fromTop: boolean): void {
    if (!ctx) return;
    const t0 = ctx.currentTime + 0.05;
    for (const v of voice) {
      v.next = t0;
      v.idx = 0;
      v.beat = 0;
    }
    if (form) {
      if (fromTop) {
        form.pos = formTop(form.form, t0);
        form.pending = null;
        form.resume = null;
        form.beforeDanger = null;
      } else {
        form.pos.start = t0;
        // Nothing of the part has been played again yet, so a waiting jump
        // lands at once rather than a bar into a section it is leaving.
        if (form.pending) form.pending.cut = t0;
      }
    }
  }

  function start(): void {
    if (running) return;
    const context = ensureContext();
    if (!context || !musicBus || !musicMaster) return;
    // Resuming is needed when the context starts suspended (autoplay policy).
    if (context.state === 'suspended') void context.resume();
    running = true;
    // Ramped rather than assigned, because stop() ducks this same gain and a
    // scheduled ramp outranks a later write to `.value`.
    musicMaster.gain.setTargetAtTime(musicMuted ? 0 : volume, context.currentTime, 0.02);
    resetCursors(true);
    scheduler = setInterval(scheduleAhead, 25);
    scheduleAhead();
  }

  function stop(): void {
    running = false;
    if (scheduler !== null) {
      clearInterval(scheduler);
      scheduler = null;
    }
    // Dropping the scheduler only stops *new* notes. Everything already handed
    // to the audio graph plays to its end, and a voice commits a whole note at
    // a time, so a cabinet with a sustained voice (a 4-beat pad note is two
    // to three seconds at the arcade's tempos) would go on droning over the
    // game-over sting and the results overlay. Ducking the master is what
    // actually stops the music; start() lifts it again.
    if (musicMaster && ctx) {
      musicMaster.gain.setTargetAtTime(0, ctx.currentTime, 0.02);
    }
  }

  function applyMusicMute(): void {
    if (musicMaster && ctx) {
      musicMaster.gain.setTargetAtTime(musicMuted ? 0 : volume, ctx.currentTime, 0.02);
    }
  }

  function setMusicMuted(value: boolean): void {
    const wasMuted = musicMuted;
    musicMuted = value;
    saveScore(MUSIC_MUTED_KEY, value ? 1 : 0);
    applyMusicMute();
    // While muted the cursors keep advancing but no oscillators are made, so a
    // voice that stepped over a long note has nothing left to play when the
    // sound comes back: the plucked voices return within the lookahead window
    // and a sustained one stays missing for up to its whole note, which makes
    // the mix reassemble itself in stages. Restarting every cursor together
    // brings it back in one piece, from the top of the loop, or with a form
    // from the top of the section it had reached (a rest it was in ends early).
    if (wasMuted && !value && running) resetCursors(false);
  }

  function toggleMusicMute(): boolean {
    setMusicMuted(!musicMuted);
    return musicMuted;
  }

  function setSfxMuted(value: boolean): void {
    sfxMuted = value;
    saveScore(SFX_MUTED_KEY, value ? 1 : 0);
  }

  function toggleSfxMute(): boolean {
    setSfxMuted(!sfxMuted);
    return sfxMuted;
  }

  // The loudest voice at its peak, the reference the effects are set against.
  // A score with no voices is treated as one voice at full track volume, so
  // its effects are not silenced along with it.
  const loudestTrack = tracks.reduce((m, t) => Math.max(m, t.volume), 0) || 1;
  const sfxLevel = SFX_OVER_MUSIC * VOICE_PEAK * volume * loudestTrack;
  const lastSfx: Partial<Record<SfxName, number>> = {};
  let duckTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Pulls the music master down under an effect and lifts it back after
   * DUCK_HOLD_MS. The lift is a timer rather than a ramp scheduled now for
   * later: a future automation event outranks one written in the meantime,
   * so a pre-scheduled lift would undo a mute or a stop() issued during the
   * duck. The timer re-checks both before it lifts.
   */
  function duckMusic(): void {
    if (!ctx || !musicMaster || !running || musicMuted) return;
    musicMaster.gain.setTargetAtTime(volume * DUCK_GAIN, ctx.currentTime, 0.01);
    if (duckTimer !== null) clearTimeout(duckTimer);
    duckTimer = setTimeout(() => {
      duckTimer = null;
      if (ctx && musicMaster && running && !musicMuted) {
        musicMaster.gain.setTargetAtTime(volume, ctx.currentTime, 0.05);
      }
    }, DUCK_HOLD_MS);
  }

  function playSfx(name: SfxName): void {
    if (sfxMuted) return;
    const context = ensureContext();
    if (!context) return;
    if (context.state === 'suspended') void context.resume();
    const now = context.currentTime;
    const lastPlayed = lastSfx[name];
    if (lastPlayed !== undefined && now - lastPlayed < (SFX_MIN_INTERVAL[name] ?? SFX_DEFAULT_INTERVAL)) return;
    lastSfx[name] = now;
    if (DUCKING_SFX.has(name)) duckMusic();
    const hz = sfxPitches(name, options.tonic);
    // Each sfx routes through its own gain so it ignores the music master mix.
    const out = context.createGain();
    out.gain.value = sfxLevel;
    out.connect(context.destination);
    // Some browsers don't GC gain nodes wired to destination once their sources
    // stop, so release it shortly after the longest sfx finishes.
    setTimeout(() => {
      try {
        out.disconnect();
      } catch {
        /* already disconnected */
      }
    }, 1000);

    switch (name) {
      case 'blip':
        playTone(context, hz[0], now, 0.08, 'square', 0.5, out);
        break;
      case 'score':
        playTone(context, hz[0], now, 0.09, 'square', 0.5, out);
        playTone(context, hz[1], now + 0.08, 0.1, 'square', 0.5, out);
        break;
      case 'hit':
        playTone(context, hz[0], now, 0.14, 'sawtooth', 0.6, out);
        playTone(context, hz[1], now + 0.04, 0.16, 'sawtooth', 0.5, out);
        break;
      case 'explosion': {
        // Detuned descending tones approximate a noisy boom without buffers.
        for (let i = 0; i < 4; i++) {
          playTone(context, 220 - i * 40, now + i * 0.03, 0.2, 'sawtooth', 0.45, out);
        }
        break;
      }
      case 'gameover':
        playTone(context, hz[0], now, 0.18, 'triangle', 0.5, out);
        playTone(context, hz[1], now + 0.16, 0.18, 'triangle', 0.5, out);
        playTone(context, hz[2], now + 0.32, 0.3, 'triangle', 0.5, out);
        break;
      case 'rescue': {
        // A bright ascending bell arpeggio — the "critter reached home" twinkle.
        // Deliberately a soft triangle voice and a rising four-note run so it is
        // unmistakably distinct from the terser square 'score' blip and the rest.
        for (let i = 0; i < hz.length; i++) {
          const last = i === hz.length - 1;
          playTone(context, hz[i], now + i * 0.06, last ? 0.2 : 0.1, 'triangle', 0.5, out);
        }
        break;
      }
    }
  }

  // Background tabs throttle timers, which would starve the ~100ms lookahead and
  // make the music stutter. Suspend the context while hidden and resume on return.
  function onVisibilityChange(): void {
    if (!ctx) return;
    if (document.hidden) {
      void ctx.suspend();
    } else if (running) {
      void ctx.resume();
    }
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    stop();
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      document.removeEventListener('astro:before-swap', dispose);
    }
    if (ctx) {
      void ctx.close();
      ctx = null;
      musicMaster = null;
      musicBus = null;
      lane = null;
      layerGains = null;
      pauseFilter = null;
      pauseGain = null;
    }
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibilityChange);
    // Astro's ClientRouter swaps the DOM in place on navigation (including the
    // browser back button) instead of unloading the page, so without this the
    // scheduler and AudioContext outlive the game and the music plays forever.
    document.addEventListener('astro:before-swap', dispose);
  }

  return {
    start,
    stop,
    toggleMusicMute,
    isMusicMuted: () => musicMuted,
    setMusicMuted,
    toggleSfxMute,
    isSfxMuted: () => sfxMuted,
    setSfxMuted,
    playSfx,
    setTempo(bpm: number) {
      // Finite-positive only, capped at MAX_BPM: Infinity would zero
      // secondsPerBeat and spin scheduleAhead's lookahead loop forever, and
      // a huge finite bpm would flood it with near-zero-length notes.
      if (!Number.isFinite(bpm) || bpm <= 0) return;
      const updated = 60 / Math.min(bpm, MAX_BPM);
      const ratio = updated / secondsPerBeat;
      secondsPerBeat = updated;
      // A scene with its own tempo keeps it: this is then only the tempo the
      // score comes back to, and nothing sounding moves.
      if (form?.pos.scene != null && form.form.scenes.get(form.pos.scene)?.spb) return;
      // Each cursor holds the end of the last note already handed to the audio
      // graph, in seconds worked out at the *old* tempo. Left alone, a voice
      // whose notes are long stays on old-tempo timing for the whole of its
      // in-flight note while short-note voices re-time within the 0.1s
      // lookahead — so every tempo change slides the voices further apart and
      // none of it comes back. Cascade was the first cabinet to ramp (Snake
      // and CALCIO '90 have since joined it), and across its thirteen
      // level-ups its sustained voice ended up around a beat and a half
      // behind the melody, which reads as the previous bar's
      // chord still sounding under the current one. Rescaling the outstanding
      // gap by the same ratio for every voice restates them all in the new
      // tempo; the cost is one sub-note seam where the tempo changes.
      if (ctx) {
        const now = ctx.currentTime;
        for (const v of voice) {
          if (v.next > now) v.next = now + (v.next - now) * ratio;
        }
        // A boundary still ahead (a rest, or a section the voices have queued)
        // moves with them, by the same arithmetic so it stays equal to theirs.
        if (form && form.pos.start > now) form.pos.start = now + (form.pos.start - now) * ratio;
        // So does a jump's bar line, which is counted in the same beats.
        if (form?.pending && form.pending.cut > now) form.pending.cut = now + (form.pending.cut - now) * ratio;
      }
    },
    section() {
      if (!form) return null;
      return {
        name: partAt(form.form, form.pos)?.name ?? '',
        start: form.pos.start,
        danger: form.pos.scene === DANGER,
        scene: form.pos.scene
      };
    },
    setLayer(track: number | string, on: boolean, fadeSeconds = LAYER_FADE) {
      const t = trackIndex(tracks, track);
      if (t < 0) return;
      // Built at the level the voice had, so that a first fade is a fade.
      const ready = ensureLayers();
      layerOn[t] = on;
      if (!ready || !ctx || !layerGains) return;
      const g = layerGains[t].gain;
      const now = ctx.currentTime;
      g.cancelScheduledValues(now);
      // A time constant of a quarter of the fade is within 2% of the target by
      // its end; a linear ramp would need the level it starts from, which a
      // fade already in progress does not report.
      if (Number.isFinite(fadeSeconds) && fadeSeconds > 0) g.setTargetAtTime(on ? 1 : 0, now, fadeSeconds / 4);
      else g.setValueAtTime(on ? 1 : 0, now);
    },
    setScene(name: string | null) {
      if (!form || !running || !ctx) return false;
      if (name !== null && !form.form.scenes.has(name)) return false;
      if (name !== headingScene(form)) moveToScene(form, name);
      return true;
    },
    setSection(name: string) {
      if (!form || !running || !ctx) return false;
      const scene = headingScene(form);
      const step = orderOf(form.form, scene).findIndex(p => p.name === name);
      if (step < 0) return false;
      requestJump(step, form.pending ? form.pending.pass : form.pos.pass, scene);
      return true;
    },
    setDanger(on: boolean) {
      if (!form || !form.form.scenes.has(DANGER) || !running || !ctx) return;
      const heading = headingScene(form);
      if (on === (heading === DANGER)) return;
      if (on) {
        moveToScene(form, DANGER);
        return;
      }
      // Released before it landed, the score stays in the scene it is in;
      // released in danger, it goes back to the scene danger interrupted.
      moveToScene(form, form.pos.scene === DANGER ? form.beforeDanger : form.pos.scene);
    },
    playStinger(name: string) {
      const lines = stingers.get(name);
      if (!lines || !running || musicMuted || !ctx || !musicBus) return false;
      const duck = ensureLayers();
      if (!duck) return false;
      const now = ctx.currentTime;
      const at = now + 0.05;
      const spb = form ? formBeatSeconds(form.form, form.pos.scene, secondsPerBeat) : secondsPerBeat;
      let end = at;
      lines.forEach((line, t) => {
        let time = at;
        line.forEach((note, i) => {
          const dur = note.beats * spb;
          if (dur > 0) playNote(ctx as AudioContext, musicBus as GainNode, tracks[t], note, line[i + 1], time, dur);
          time += dur > 0 ? dur : spb;
        });
        end = Math.max(end, time);
      });
      duck.gain.cancelScheduledValues(now);
      duck.gain.setTargetAtTime(STINGER_DUCK, now, ADAPT_RAMP / 2);
      duck.gain.setTargetAtTime(1, end, ADAPT_RAMP);
      return true;
    },
    setPaused(on: boolean) {
      if (on === paused) return;
      paused = on;
      applyPause();
    },
    dispose
  };
}
