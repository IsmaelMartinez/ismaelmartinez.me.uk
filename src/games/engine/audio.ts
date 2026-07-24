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
 * warmth, and the whole mix can run through a feedback-delay echo send. A bare
 * `melody` is still accepted and wrapped as a single track.
 *
 * Music and sound effects mute independently, each under its own global
 * localStorage key, so a preference set in one cabinet carries to the rest.
 */
import { loadScore, saveScore } from './storage';

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
}

/** One simultaneous voice of the music. */
export interface Track {
  /** This voice's looping line. */
  melody: Note[];
  /** Oscillator type. Defaults to 'square'. */
  wave?: OscillatorType;
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

export interface GameAudioOptions {
  /** Parallel voices; all share `tempo`. Preferred over `melody`. */
  tracks?: Track[];
  /** Legacy single voice; wrapped into one track when `tracks` is absent. */
  melody?: Note[];
  /** Tempo in beats per minute. Defaults to 120. */
  tempo?: number;
  /** Oscillator type used for the `melody` shim. Defaults to 'square'. */
  wave?: OscillatorType;
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
   * Stop the music, drop the lifecycle listeners, and close the AudioContext.
   * Runs automatically when the page navigates away (the site uses Astro's
   * ClientRouter, so leaving a game is a DOM swap rather than a full unload and
   * the music would otherwise keep playing). Safe to call manually; idempotent.
   */
  dispose(): void;
  /** @deprecated Combined controls kept during the split-mute migration; toggle both channels together. */
  isMuted(): boolean;
  setMuted(muted: boolean): void;
  toggleMute(): boolean;
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

/** @deprecated Combined read kept during the split-mute migration (both channels muted). */
export function loadMuted(): boolean {
  return loadMusicMuted() && loadSfxMuted();
}

type AudioCtor = typeof AudioContext;

function getAudioContextCtor(): AudioCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    AudioContext?: AudioCtor;
    webkitAudioContext?: AudioCtor;
  };
  return w.AudioContext || w.webkitAudioContext || null;
}

/**
 * Tempo ceiling. Beyond this, note durations get so short that
 * scheduleAhead's ~100ms lookahead loop has to schedule thousands of notes
 * per tick, which can freeze the tab. No cabinet plays anywhere near this.
 */
const MAX_BPM = 1000;

/** Peak gain of a single voice before its relative `volume` scaling. */
const VOICE_PEAK = 0.8;

interface NormTrack {
  melody: Note[];
  wave: OscillatorType;
  volume: number;
  envelope: 'pluck' | 'pad';
  octaveShift: number;
  detune: number;
}

/** Fills in per-track defaults and folds a bare `melody` into one track. */
function normalizeTracks(options: GameAudioOptions): NormTrack[] {
  const raw: Track[] =
    options.tracks ?? (options.melody ? [{ melody: options.melody, wave: options.wave }] : []);
  return raw.map(t => ({
    melody: t.melody,
    wave: t.wave ?? 'square',
    volume: t.volume ?? 1,
    envelope: t.envelope ?? 'pluck',
    octaveShift: t.octaveShift ?? 0,
    detune: t.detune ?? 0
  }));
}

export function createGameAudio(options: GameAudioOptions): GameAudio {
  migrateLegacyMute();

  const volume = options.volume ?? 0.14;
  // Same finite-positive-bounded rule as setTempo: a 0/NaN/Infinity tempo
  // would give scheduleAhead zero-length notes and a non-terminating
  // lookahead loop.
  const requestedTempo = options.tempo ?? 120;
  let secondsPerBeat =
    60 /
    (Number.isFinite(requestedTempo) && requestedTempo > 0
      ? Math.min(requestedTempo, MAX_BPM)
      : 120);

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
  const voice = tracks.map(() => ({ next: 0, idx: 0 }));
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
      musicMaster = ctx.createGain();
      musicMaster.gain.value = volume;
      musicMaster.connect(ctx.destination);
      musicBus = ctx.createGain();
      musicBus.gain.value = 1;
      musicBus.connect(musicMaster);
      if (options.echo) {
        // Dry stays on musicBus → musicMaster; a delay line with feedback taps
        // the bus and mixes a wet copy back in under the dry signal.
        const time = Math.min(Math.max(options.echo.time, 0.001), 0.95);
        const delay = ctx.createDelay(1);
        delay.delayTime.value = time;
        const feedback = ctx.createGain();
        feedback.gain.value = Math.min(Math.max(options.echo.feedback, 0), 0.9);
        const wet = ctx.createGain();
        wet.gain.value = Math.max(options.echo.mix, 0);
        musicBus.connect(delay);
        delay.connect(feedback);
        feedback.connect(delay);
        delay.connect(wet);
        wet.connect(musicMaster);
      }
    } catch {
      ctx = null;
      musicMaster = null;
      musicBus = null;
    }
    return ctx;
  }

  function playTone(
    freq: number,
    start: number,
    duration: number,
    type: OscillatorType,
    peak: number,
    destination: AudioNode,
    envelope: 'pluck' | 'pad' = 'pluck',
    detune = 0
  ): void {
    if (!ctx || freq <= 0) return;
    const gain = ctx.createGain();
    if (envelope === 'pad') {
      // Slow swell then a long decay across the whole note: a soft sustained bed.
      const attack = Math.min(duration * 0.4, 0.25);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(peak, start + attack);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    } else {
      // Short attack then exponential decay for a plucky chiptune envelope.
      // Cap the attack to a fraction of the note so very short notes don't
      // schedule the decay ramp before the attack peak (which glitches Web Audio).
      const attack = Math.min(0.01, duration * 0.5);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(peak, start + attack);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    }
    gain.connect(destination);
    const spawn = (cents: number): void => {
      const osc = ctx!.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, start);
      if (cents) osc.detune.setValueAtTime(cents, start);
      osc.connect(gain);
      osc.start(start);
      osc.stop(start + duration + 0.02);
    };
    spawn(0);
    // A slightly detuned twin thickens the voice into a warm chorus.
    if (detune > 0) spawn(detune);
  }

  function scheduleAhead(): void {
    if (!ctx || !musicBus || tracks.length === 0) return;
    const horizon = ctx.currentTime + 0.1;
    // Schedule every track's notes due within the next ~100ms window.
    for (let t = 0; t < tracks.length; t++) {
      const track = tracks[t];
      if (track.melody.length === 0) continue;
      const v = voice[t];
      while (v.next < horizon) {
        const note = track.melody[v.idx];
        const dur = note.beats * secondsPerBeat;
        // When muted, keep each cursor advancing but skip oscillator creation so
        // we don't burn CPU synthesising silent tones; timing stays in sync on unmute.
        if (!musicMuted) {
          // Pads play their full length so they sustain and connect; plucks trim
          // to leave the terse gap that reads as chiptune.
          const playDur = track.envelope === 'pad' ? dur : dur * 0.9;
          const freq = note.freq > 0 ? note.freq * Math.pow(2, track.octaveShift) : note.freq;
          playTone(
            freq,
            v.next,
            playDur,
            track.wave,
            VOICE_PEAK * track.volume,
            musicBus,
            track.envelope,
            track.detune
          );
        }
        v.next += dur;
        v.idx = (v.idx + 1) % track.melody.length;
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
    musicMaster.gain.value = musicMuted ? 0 : volume;
    const t0 = context.currentTime + 0.05;
    for (const v of voice) {
      v.next = t0;
      v.idx = 0;
    }
    scheduler = setInterval(scheduleAhead, 25);
    scheduleAhead();
  }

  function stop(): void {
    running = false;
    if (scheduler !== null) {
      clearInterval(scheduler);
      scheduler = null;
    }
  }

  function applyMusicMute(): void {
    if (musicMaster && ctx) {
      musicMaster.gain.setTargetAtTime(musicMuted ? 0 : volume, ctx.currentTime, 0.02);
    }
  }

  function setMusicMuted(value: boolean): void {
    musicMuted = value;
    saveScore(MUSIC_MUTED_KEY, value ? 1 : 0);
    applyMusicMute();
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
        playTone(660, now, 0.08, 'square', 0.5, out);
        break;
      case 'score':
        playTone(784, now, 0.09, 'square', 0.5, out);
        playTone(1047, now + 0.08, 0.1, 'square', 0.5, out);
        break;
      case 'hit':
        playTone(180, now, 0.14, 'sawtooth', 0.6, out);
        playTone(110, now + 0.04, 0.16, 'sawtooth', 0.5, out);
        break;
      case 'explosion': {
        // Detuned descending tones approximate a noisy boom without buffers.
        for (let i = 0; i < 4; i++) {
          playTone(220 - i * 40, now + i * 0.03, 0.2, 'sawtooth', 0.45, out);
        }
        break;
      }
      case 'gameover':
        playTone(440, now, 0.18, 'triangle', 0.5, out);
        playTone(330, now + 0.16, 0.18, 'triangle', 0.5, out);
        playTone(220, now + 0.32, 0.3, 'triangle', 0.5, out);
        break;
      case 'rescue': {
        // A bright ascending bell arpeggio — the "critter reached home" twinkle.
        // Deliberately a soft triangle voice and a rising four-note run so it is
        // unmistakably distinct from the terser square 'score' blip and the rest.
        const bells = [880, 1108.73, 1318.51, 1760];
        for (let i = 0; i < bells.length; i++) {
          const last = i === bells.length - 1;
          playTone(bells[i], now + i * 0.06, last ? 0.2 : 0.1, 'triangle', 0.5, out);
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
      if (Number.isFinite(bpm) && bpm > 0) secondsPerBeat = 60 / Math.min(bpm, MAX_BPM);
    },
    dispose,
    // Deprecated combined controls: drive both channels together so the legacy
    // single 🔊 button keeps working until every cabinet moves to two buttons.
    isMuted: () => musicMuted && sfxMuted,
    setMuted(value: boolean) {
      setMusicMuted(value);
      setSfxMuted(value);
    },
    toggleMute() {
      const next = !(musicMuted && sfxMuted);
      setMusicMuted(next);
      setSfxMuted(next);
      return next;
    }
  };
}
