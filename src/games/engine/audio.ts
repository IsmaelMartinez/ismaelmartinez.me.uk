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
 * Music and sound effects mute independently, each under its own global
 * localStorage key, so a preference set in one cabinet carries to the rest.
 *
 * Beyond the four stock oscillator shapes the synth has three NES pulse duties,
 * three drums built from one shared noise buffer, per-note delayed vibrato and
 * slides. All of it is opt-in per track or per note: a score that uses none of
 * it builds exactly the graph it built before these existed, which
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
}

/** The three drum instruments a percussion track can play. */
export type DrumName = 'kick' | 'snare' | 'hat';

/**
 * NES pulse duties, the 2A03's 12.5%, 25% and 50% cycles. 75% is left out
 * because it sounds identical to 25%. 'pulse50' is band-limited from the same
 * series as the others, so it is close to, not the same as, 'square'.
 */
export type PulseWave = 'pulse12' | 'pulse25' | 'pulse50';

/** A voice's timbre: a stock oscillator shape or a pulse duty. */
export type Wave = OscillatorType | PulseWave;

/** One simultaneous voice of the music. */
export interface Track {
  /**
   * This voice's looping line. A score with a `form` takes its lines from the
   * form instead and leaves this out.
   */
  melody?: Note[];
  /** Oscillator type or pulse duty. Defaults to 'square'. */
  wave?: Wave;
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
}

export type SfxName = 'blip' | 'score' | 'hit' | 'explosion' | 'gameover' | 'rescue';

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
   * Games whose pace ramps (Cascade's per-level speed-up) lean on this.
   */
  setTempo(bpm: number): void;
  /**
   * Where a score with a `form` is: the section playing or about to (the intro
   * reads as `intro`) and the audio-clock time its first notes start at, which
   * is the section boundary. Null for a score without a form.
   */
  section(): { name: string; start: number } | null;
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
const noiseBuffers = new WeakMap<BaseAudioContext, AudioBuffer>();
const pulseWaves = new WeakMap<BaseAudioContext, Map<PulseWave, PeriodicWave>>();

function isPulse(wave: Wave): wave is PulseWave {
  return wave in PULSE_DUTY;
}

/**
 * The context's pulse wave at `duty`, built on first use from the pulse
 * train's Fourier series: cosine terms (2 / n pi) sin(n pi d), no sine terms.
 */
function pulseWave(ctx: BaseAudioContext, wave: PulseWave): PeriodicWave {
  let cache = pulseWaves.get(ctx);
  if (!cache) {
    cache = new Map();
    pulseWaves.set(ctx, cache);
  }
  let built = cache.get(wave);
  if (!built) {
    const d = PULSE_DUTY[wave];
    const real = new Float32Array(PULSE_HARMONICS + 1);
    const imag = new Float32Array(PULSE_HARMONICS + 1);
    for (let n = 1; n <= PULSE_HARMONICS; n++) {
      real[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * d);
    }
    built = ctx.createPeriodicWave(real, imag);
    cache.set(wave, built);
  }
  return built;
}

/** The context's one second of seeded white noise, built on first use. */
function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  let buffer = noiseBuffers.get(ctx);
  if (!buffer) {
    const length = Math.ceil(ctx.sampleRate * NOISE_SECONDS);
    buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    const rng = seededRng(NOISE_SEED);
    for (let i = 0; i < length; i++) data[i] = rng() * 2 - 1;
    noiseBuffers.set(ctx, buffer);
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
    vibrato: t.vibrato ?? 0
  }));
}

/** The optional pitch movement of one tone. */
interface ToneMotion {
  /** Frequency the tone starts at and glides from into its own. */
  slideFrom?: number;
  /** Frequency the tone glides into over its tail. */
  slideTo?: number;
  /** Vibrato depth in cents. */
  vibrato?: number;
}

/**
 * Schedules one enveloped tone. The order and values of the graph calls for a
 * tone with no `motion` are the ones the engine has always made; the motion
 * adds calls after them and never changes them.
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
  motion: ToneMotion = {}
): void {
  if (freq <= 0) return;
  const gain = ctx.createGain();
  // A pad swells slowly then decays across the whole note, a soft sustained
  // bed; a pluck has a short attack then an exponential decay, the chiptune
  // envelope. Either attack is capped to a fraction of the note so a very
  // short note never schedules the decay ramp before the attack peak (which
  // glitches Web Audio).
  const attack = envelope === 'pad' ? Math.min(duration * 0.4, 0.25) : Math.min(0.01, duration * 0.5);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  gain.connect(destination);
  const slide = Math.min(SLIDE_TIME, duration / 2);
  const slideFrom = motion.slideFrom ?? 0;
  const scoop = slideFrom > 0;
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
    lfo.stop(start + duration + 0.02);
  }
  const spawn = (cents: number): void => {
    const osc = ctx.createOscillator();
    if (isPulse(type)) osc.setPeriodicWave(pulseWave(ctx, type));
    else osc.type = type;
    osc.frequency.setValueAtTime(scoop ? slideFrom : freq, start);
    if (cents) osc.detune.setValueAtTime(cents, start);
    osc.connect(gain);
    osc.start(start);
    osc.stop(start + duration + 0.02);
    if (scoop) osc.frequency.exponentialRampToValueAtTime(freq, start + slide);
    if (motion.slideTo !== undefined && motion.slideTo > 0) {
      osc.frequency.setValueAtTime(freq, start + duration - slide);
      osc.frequency.exponentialRampToValueAtTime(motion.slideTo, start + duration);
    }
    if (depth) depth.connect(osc.detune);
  };
  spawn(0);
  // A slightly detuned twin thickens the voice into a warm chorus.
  if (detune > 0) spawn(detune);
}

/** A burst of the shared noise through a filter, decaying to silence. */
function noiseHit(
  ctx: BaseAudioContext,
  start: number,
  decay: number,
  peak: number,
  filterType: BiquadFilterType,
  cutoff: number,
  destination: AudioNode
): void {
  const source = ctx.createBufferSource();
  source.buffer = noiseBuffer(ctx);
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
 * high-passed at 7 kHz.
 */
function playDrum(ctx: BaseAudioContext, name: DrumName, start: number, peak: number, destination: AudioNode): void {
  const { decay, level } = DRUMS[name];
  const p = peak * level;
  switch (name) {
    case 'kick':
      toneHit(ctx, start, decay, p, 150, 45, destination);
      break;
    case 'snare':
      noiseHit(ctx, start, decay, p, 'bandpass', 1500, destination);
      toneHit(ctx, start, 0.08, p * 0.6, 200, 200, destination);
      break;
    case 'hat':
      noiseHit(ctx, start, decay, p, 'highpass', 7000, destination);
      break;
  }
}

/** A voice's place in its line: when its next note starts and which it is. */
interface Cursor {
  next: number;
  idx: number;
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
}

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
}

/** A score's form and where it has got to, for one performance of it. */
interface FormState {
  form: NormForm;
  pos: FormPosition;
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
  const order = form.order.map(name => {
    const lines = Object.hasOwn(form.sections, name) ? form.sections[name] : undefined;
    if (!lines) throw new Error(`score form: no section named "${name}"`);
    return fit(name, lines);
  });
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
    restBeats: resting ? beats : 0
  };
}

/** The top of a form: the intro if it has one, else the first section. */
function formTop(form: NormForm, at: number): FormPosition {
  return { step: form.intro ? -1 : 0, pass: 0, start: at };
}

function partAt(form: NormForm, step: number): Part {
  return step < 0 ? (form.intro as Part) : form.order[step];
}

/** What follows the current part, and whether a rest comes first: the one place the form's next move is decided. */
function nextStep(form: NormForm, pos: FormPosition): { step: number; pass: number; rest: boolean } {
  if (pos.step + 1 < form.order.length) return { step: pos.step + 1, pass: pos.pass, rest: false };
  const pass = pos.pass + 1;
  return { step: 0, pass, rest: form.restAfter > 0 && pass % form.restAfter === 0 };
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
  if (note.drum) {
    playDrum(ctx, note.drum, at, peak, bus);
    return;
  }
  // Pads play their full length so they sustain and connect; plucks trim
  // to leave the terse gap that reads as chiptune.
  const playDur = track.envelope === 'pad' ? dur : dur * 0.9;
  const shift = (f: number | undefined): number | undefined =>
    f !== undefined && f > 0 ? f * Math.pow(2, track.octaveShift) : f;
  const freq = note.freq > 0 ? note.freq * Math.pow(2, track.octaveShift) : note.freq;
  const motion: ToneMotion = {
    vibrato: track.vibrato,
    slideFrom: shift(note.slideFrom),
    slideTo: note.slideNext && following && !following.drum ? shift(following.freq) : undefined
  };
  playTone(ctx, freq, at, playDur, track.wave, peak, bus, track.envelope, track.detune, motion);
}

/**
 * Schedules every track's notes that start before `horizon` onto `bus`,
 * advancing each cursor past them. This is the whole of the scheduler: the
 * live engine calls it every 25 ms with a horizon ~100 ms ahead, and
 * `renderScore` calls it once with the horizon at the end of the render.
 * `silent` advances the cursors without making any nodes (the music mute).
 * A score with a form goes to `scheduleForm`; one without keeps every voice
 * wrapping its own line, exactly as it always has.
 */
function scheduleWindow(
  ctx: BaseAudioContext,
  bus: AudioNode,
  tracks: NormTrack[],
  cursors: Cursor[],
  horizon: number,
  secondsPerBeat: number,
  silent: boolean,
  state: FormState | null
): void {
  if (state) {
    scheduleForm(ctx, bus, tracks, cursors, horizon, secondsPerBeat, silent, state);
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
        playNote(ctx, bus, track, note, track.melody[(v.idx + 1) % track.melody.length], v.next, dur);
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
 */
function scheduleForm(
  ctx: BaseAudioContext,
  bus: AudioNode,
  tracks: NormTrack[],
  cursors: Cursor[],
  horizon: number,
  secondsPerBeat: number,
  silent: boolean,
  { form, pos }: FormState
): void {
  if (form.order.length === 0 || tracks.length === 0) return;
  for (;;) {
    const lines = partAt(form, pos.step).lines;
    let playing = false;
    for (let t = 0; t < tracks.length; t++) {
      const line = lines[t];
      const v = cursors[t];
      while (v.idx < line.length && v.next < horizon) {
        const note = line[v.idx];
        const dur = note.beats * secondsPerBeat;
        // The same guard as above: a bad length still steps one beat.
        if (dur <= 0) {
          v.next += secondsPerBeat;
          v.idx++;
          continue;
        }
        if (!silent) {
          let following: Note | undefined = line[v.idx + 1];
          if (!following) {
            const after = nextStep(form, pos);
            following = after.rest ? undefined : partAt(form, after.step).lines[t][0];
          }
          playNote(ctx, bus, tracks[t], note, following, v.next, dur);
        }
        v.next += dur;
        v.idx++;
      }
      if (v.idx < line.length) playing = true;
    }
    if (playing) return;
    // The form moves on only once the boundary is inside the window, so until
    // then it still names the part that is sounding.
    const end = Math.max(...cursors.map(v => v.next));
    if (end >= horizon) return;
    const after = nextStep(form, pos);
    pos.step = after.step;
    pos.pass = after.pass;
    pos.start = end + (after.rest ? form.restBeats * secondsPerBeat : 0);
    for (const v of cursors) {
      v.next = pos.start;
      v.idx = 0;
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

/**
 * Renders the first `seconds` of a score, from the top, into a mono
 * `AudioBuffer` through an `OfflineAudioContext`, using the same graph and the
 * same scheduler the live engine plays it with. For development tools (the
 * jukebox) that need to hear or compare a score without a game around it.
 * Resolves to null where there is no `OfflineAudioContext` (SSR, Node), or
 * the length or sample rate is not one it can render at.
 */
export async function renderScore(
  options: GameAudioOptions,
  seconds: number,
  sampleRate = 44100
): Promise<AudioBuffer | null> {
  const Ctor = getOfflineContextCtor();
  if (!Ctor || !Number.isFinite(seconds) || seconds <= 0) return null;
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) return null;
  let ctx: OfflineAudioContext;
  try {
    ctx = new Ctor(1, Math.ceil(seconds * sampleRate), sampleRate);
  } catch {
    // A rate the browser does not support is a RangeError from the constructor.
    return null;
  }
  const { bus } = buildMusicGraph(ctx, options.volume ?? DEFAULT_VOLUME, options.echo);
  const tracks = normalizeTracks(options);
  const cursors = tracks.map(() => ({ next: 0, idx: 0 }));
  const form = normalizeForm(options);
  const state = form && { form, pos: formTop(form, 0) };
  scheduleWindow(ctx, bus, tracks, cursors, seconds, beatSeconds(options.tempo), false, state);
  return ctx.startRendering();
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
  const voice: Cursor[] = tracks.map(() => ({ next: 0, idx: 0 }));
  // A score with a form also carries where in the form it is; null without one.
  const formPlan = normalizeForm(options);
  const form: FormState | null = formPlan && { form: formPlan, pos: formTop(formPlan, 0) };
  let scheduler: ReturnType<typeof setInterval> | null = null;

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
    } catch {
      ctx = null;
      musicMaster = null;
      musicBus = null;
    }
    return ctx;
  }

  function scheduleAhead(): void {
    if (!ctx || !musicBus || tracks.length === 0) return;
    // Schedule every track's notes due within the next ~100ms window.
    scheduleWindow(ctx, musicBus, tracks, voice, ctx.currentTime + 0.1, secondsPerBeat, musicMuted, form);
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
    }
    if (form) {
      if (fromTop) form.pos = formTop(form.form, t0);
      else form.pos.start = t0;
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
    // a time, so a cabinet with a sustained voice (Tank Duel's horn is 4 beats,
    // just over two seconds at its tempo) would go on droning over the
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

  function playSfx(name: SfxName): void {
    if (sfxMuted) return;
    const context = ensureContext();
    if (!context) return;
    if (context.state === 'suspended') void context.resume();
    const now = context.currentTime;
    // Each sfx routes through its own gain so it ignores the music master mix.
    const out = context.createGain();
    out.gain.value = 0.6;
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
        playTone(context, 660, now, 0.08, 'square', 0.5, out);
        break;
      case 'score':
        playTone(context, 784, now, 0.09, 'square', 0.5, out);
        playTone(context, 1047, now + 0.08, 0.1, 'square', 0.5, out);
        break;
      case 'hit':
        playTone(context, 180, now, 0.14, 'sawtooth', 0.6, out);
        playTone(context, 110, now + 0.04, 0.16, 'sawtooth', 0.5, out);
        break;
      case 'explosion': {
        // Detuned descending tones approximate a noisy boom without buffers.
        for (let i = 0; i < 4; i++) {
          playTone(context, 220 - i * 40, now + i * 0.03, 0.2, 'sawtooth', 0.45, out);
        }
        break;
      }
      case 'gameover':
        playTone(context, 440, now, 0.18, 'triangle', 0.5, out);
        playTone(context, 330, now + 0.16, 0.18, 'triangle', 0.5, out);
        playTone(context, 220, now + 0.32, 0.3, 'triangle', 0.5, out);
        break;
      case 'rescue': {
        // A bright ascending bell arpeggio — the "critter reached home" twinkle.
        // Deliberately a soft triangle voice and a rising four-note run so it is
        // unmistakably distinct from the terser square 'score' blip and the rest.
        const bells = [880, 1108.73, 1318.51, 1760];
        for (let i = 0; i < bells.length; i++) {
          const last = i === bells.length - 1;
          playTone(context, bells[i], now + i * 0.06, last ? 0.2 : 0.1, 'triangle', 0.5, out);
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
      // Each cursor holds the end of the last note already handed to the audio
      // graph, in seconds worked out at the *old* tempo. Left alone, a voice
      // whose notes are long stays on old-tempo timing for the whole of its
      // in-flight note while short-note voices re-time within the 0.1s
      // lookahead — so every tempo change slides the voices further apart and
      // none of it comes back. Cascade is the only cabinet that ramps, and
      // across its thirteen level-ups its sustained voice ended up around a
      // beat and a half behind the melody, which reads as the previous bar's
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
      }
    },
    section() {
      if (!form) return null;
      return { name: partAt(form.form, form.pos.step)?.name ?? '', start: form.pos.start };
    },
    dispose
  };
}
