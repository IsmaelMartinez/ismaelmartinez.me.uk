/**
 * Procedural chiptune audio for the arcade games.
 *
 * No binary assets: background music and sfx are synthesised at runtime with
 * the Web Audio API (oscillators + gain envelopes). The AudioContext is created
 * lazily on the first user gesture so it respects browser autoplay policy and
 * never touches `window` during SSR / Node / jsdom tests.
 *
 * The muted preference is shared across every game via a single localStorage
 * key, so toggling sound in one cabinet carries to the rest.
 */
import { loadScore, saveScore } from './storage';

const MUTED_KEY = 'arcade-muted';

/** A note in the looping melody: a frequency (Hz, or 0 for a rest) and a beat length. */
export interface Note {
  /** Frequency in Hz; 0 (or negative) plays a rest. */
  freq: number;
  /** Duration in beats. */
  beats: number;
}

export interface GameAudioOptions {
  /** Looping background melody. */
  melody: Note[];
  /** Tempo in beats per minute. Defaults to 120. */
  tempo?: number;
  /** Oscillator type used for the melody voice. Defaults to 'square'. */
  wave?: OscillatorType;
  /** Master music volume 0–1. Defaults to 0.14 (chiptune sits politely under play). */
  volume?: number;
}

export type SfxName = 'blip' | 'score' | 'hit' | 'explosion' | 'gameover' | 'rescue';

export interface GameAudio {
  /** Begin (or resume) the looping music. Safe to call repeatedly. */
  start(): void;
  /** Stop the music and release scheduling timers. */
  stop(): void;
  /** Flip the muted preference and return the new value. */
  toggleMute(): boolean;
  isMuted(): boolean;
  setMuted(muted: boolean): void;
  /** Play a one-shot sound effect. No-op when muted or audio is unavailable. */
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
}

/** Reads the shared muted flag (1 = muted). Defaults to enabled (not muted). */
export function loadMuted(): boolean {
  return loadScore(MUTED_KEY) === 1;
}

function persistMuted(muted: boolean): void {
  saveScore(MUTED_KEY, muted ? 1 : 0);
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

export function createGameAudio(options: GameAudioOptions): GameAudio {
  const wave = options.wave ?? 'square';
  const volume = options.volume ?? 0.14;
  let secondsPerBeat = 60 / (options.tempo ?? 120);

  let muted = loadMuted();
  let running = false;
  let disposed = false;
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let nextNoteTime = 0;
  let noteIndex = 0;
  let scheduler: ReturnType<typeof setInterval> | null = null;

  /** Lazily create the AudioContext on first gesture. Returns null if unsupported. */
  function ensureContext(): AudioContext | null {
    // Once disposed (the page navigated away) never resurrect a context: its
    // teardown listeners are gone, so it would play on and leak.
    if (disposed) return null;
    if (ctx) return ctx;
    const Ctor = getAudioContextCtor();
    if (!Ctor) return null;
    try {
      ctx = new Ctor();
      master = ctx.createGain();
      master.gain.value = volume;
      master.connect(ctx.destination);
    } catch {
      ctx = null;
      master = null;
    }
    return ctx;
  }

  function playTone(
    freq: number,
    start: number,
    duration: number,
    type: OscillatorType,
    peak: number,
    destination: AudioNode
  ): void {
    if (!ctx || freq <= 0) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    // Short attack then exponential decay for a plucky chiptune envelope.
    // Cap the attack to a fraction of the note so very short notes don't
    // schedule the decay ramp before the attack peak (which glitches Web Audio).
    const attack = Math.min(0.01, duration * 0.5);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain);
    gain.connect(destination);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }

  function scheduleAhead(): void {
    if (!ctx || !master || options.melody.length === 0) return;
    // Schedule any notes due within the next ~100ms window.
    while (nextNoteTime < ctx.currentTime + 0.1) {
      const note = options.melody[noteIndex];
      const dur = note.beats * secondsPerBeat;
      // When muted, keep the clock advancing but skip oscillator creation so we
      // don't burn CPU synthesising silent tones; timing stays in sync on unmute.
      if (!muted) {
        playTone(note.freq, nextNoteTime, dur * 0.9, wave, 0.8, master);
      }
      nextNoteTime += dur;
      noteIndex = (noteIndex + 1) % options.melody.length;
    }
  }

  function start(): void {
    if (running) return;
    const context = ensureContext();
    if (!context || !master) return;
    // Resuming is needed when the context starts suspended (autoplay policy).
    if (context.state === 'suspended') void context.resume();
    running = true;
    master.gain.value = muted ? 0 : volume;
    nextNoteTime = context.currentTime + 0.05;
    noteIndex = 0;
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

  function applyMuteToMaster(): void {
    if (master && ctx) {
      master.gain.setTargetAtTime(muted ? 0 : volume, ctx.currentTime, 0.02);
    }
  }

  function setMuted(value: boolean): void {
    muted = value;
    persistMuted(muted);
    applyMuteToMaster();
  }

  function toggleMute(): boolean {
    setMuted(!muted);
    return muted;
  }

  function playSfx(name: SfxName): void {
    if (muted) return;
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
      master = null;
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
    toggleMute,
    isMuted: () => muted,
    setMuted,
    playSfx,
    setTempo(bpm: number) {
      if (bpm > 0) secondsPerBeat = 60 / bpm;
    },
    dispose
  };
}
