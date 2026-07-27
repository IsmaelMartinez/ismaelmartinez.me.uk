import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createGameAudio,
  loadMusicMuted,
  loadSfxMuted,
  type Note
} from '../../src/games/engine/audio';

const MELODY: Note[] = [
  { freq: 440, beats: 1 },
  { freq: 0, beats: 1 }
];

/** Minimal in-memory localStorage stand-in (the suite runs under node by default). */
function installLocalStorage(): Record<string, string> {
  const store: Record<string, string> = {};
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => {
      store[k] = String(v);
    },
    removeItem: (k: string) => {
      delete store[k];
    },
    clear: () => {
      for (const k of Object.keys(store)) delete store[k];
    }
  });
  return store;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createGameAudio without AudioContext', () => {
  beforeEach(() => {
    installLocalStorage();
    // No `window` / AudioContext in node: every method must be a safe no-op.
  });

  it('exposes the full API and never throws when audio is unavailable', () => {
    const audio = createGameAudio({ tracks: [{ melody: MELODY }] });
    expect(typeof audio.start).toBe('function');
    expect(typeof audio.stop).toBe('function');
    expect(typeof audio.toggleMusicMute).toBe('function');
    expect(typeof audio.isMusicMuted).toBe('function');
    expect(typeof audio.setMusicMuted).toBe('function');
    expect(typeof audio.toggleSfxMute).toBe('function');
    expect(typeof audio.isSfxMuted).toBe('function');
    expect(typeof audio.setSfxMuted).toBe('function');
    expect(typeof audio.playSfx).toBe('function');
    expect(typeof audio.dispose).toBe('function');

    expect(() => {
      audio.start();
      audio.playSfx('blip');
      audio.playSfx('explosion');
      audio.playSfx('rescue');
      audio.stop();
      audio.dispose();
      // Idempotent: a second dispose (or one before any audio existed) is safe.
      audio.dispose();
    }).not.toThrow();
  });

  it('defaults to unmuted on both channels (music and effects enabled)', () => {
    const audio = createGameAudio({ tracks: [{ melody: MELODY }] });
    expect(audio.isMusicMuted()).toBe(false);
    expect(audio.isSfxMuted()).toBe(false);
  });
});

describe('split mute: toggles, independence, and shared persistence', () => {
  beforeEach(() => {
    installLocalStorage();
  });

  it('toggles each channel independently and returns the new value', () => {
    const audio = createGameAudio({ tracks: [{ melody: MELODY }] });
    expect(audio.toggleMusicMute()).toBe(true);
    expect(audio.isMusicMuted()).toBe(true);
    // Muting music must not touch effects.
    expect(audio.isSfxMuted()).toBe(false);

    expect(audio.toggleSfxMute()).toBe(true);
    expect(audio.isSfxMuted()).toBe(true);
    expect(audio.isMusicMuted()).toBe(true);

    expect(audio.toggleMusicMute()).toBe(false);
    expect(audio.isMusicMuted()).toBe(false);
    expect(audio.isSfxMuted()).toBe(true);
  });

  it('persists each channel under its own global key so a fresh game inherits it', () => {
    const audio = createGameAudio({ tracks: [{ melody: MELODY }] });
    audio.setMusicMuted(true);
    expect(loadMusicMuted()).toBe(true);
    expect(loadSfxMuted()).toBe(false);

    // A fresh instance (a different cabinet) picks up the shared choice.
    const other = createGameAudio({ tracks: [{ melody: MELODY }] });
    expect(other.isMusicMuted()).toBe(true);
    expect(other.isSfxMuted()).toBe(false);

    other.setSfxMuted(true);
    other.setMusicMuted(false);
    expect(loadMusicMuted()).toBe(false);
    expect(loadSfxMuted()).toBe(true);
  });

  it('migrates the pre-split single mute into both channels', () => {
    localStorage.setItem('arcade-muted', '1');
    const audio = createGameAudio({ tracks: [{ melody: MELODY }] });
    expect(audio.isMusicMuted()).toBe(true);
    expect(audio.isSfxMuted()).toBe(true);
    // Sticky under the new keys, so later reads don't depend on the legacy key.
    expect(loadMusicMuted()).toBe(true);
    expect(loadSfxMuted()).toBe(true);
  });

  it('does not re-mute from the legacy key once a channel was set post-split', () => {
    localStorage.setItem('arcade-muted', '1');
    localStorage.setItem('arcade-music-muted', '0');
    const audio = createGameAudio({ tracks: [{ melody: MELODY }] });
    expect(audio.isMusicMuted()).toBe(false);
  });
});

describe('createGameAudio with a stubbed AudioContext', () => {
  beforeEach(() => {
    installLocalStorage();
  });

  it('lazily constructs the AudioContext only on first gesture', () => {
    const ctor = vi.fn(() => makeFakeContext());
    vi.stubGlobal('window', { AudioContext: ctor });

    const audio = createGameAudio({ tracks: [{ melody: MELODY }] });
    // Creating the controller must not touch the AudioContext yet.
    expect(ctor).not.toHaveBeenCalled();

    audio.start();
    expect(ctor).toHaveBeenCalledTimes(1);
    audio.stop();
  });

  it('schedules an oscillator for every voice in a multi-track score', () => {
    const ctx = makeFakeContext();
    vi.stubGlobal('window', {
      AudioContext: class {
        constructor() {
          return ctx;
        }
      }
    });

    const audio = createGameAudio({
      tracks: [
        { melody: [{ freq: 440, beats: 1 }] },
        { melody: [{ freq: 110, beats: 1 }], wave: 'triangle' }
      ],
      tempo: 120
    });
    // start()'s immediate scheduleAhead schedules the first note of each track.
    audio.start();
    expect(ctx.createOscillator).toHaveBeenCalledTimes(2);
    audio.stop();
  });

  it('layers a detuned twin voice when a track sets detune', () => {
    const ctx = makeFakeContext();
    vi.stubGlobal('window', {
      AudioContext: class {
        constructor() {
          return ctx;
        }
      }
    });

    const audio = createGameAudio({
      tracks: [{ melody: [{ freq: 440, beats: 1 }], detune: 8 }],
      tempo: 120
    });
    audio.start();
    // One note → the main voice plus its detuned twin.
    expect(ctx.createOscillator).toHaveBeenCalledTimes(2);
    const twin = ctx.createOscillator.mock.results[1].value;
    expect(twin.detune.setValueAtTime).toHaveBeenCalledWith(8, expect.any(Number));
    audio.stop();
  });

  it('builds a feedback-delay echo send when echo options are given', () => {
    const ctx = makeFakeContext();
    vi.stubGlobal('window', {
      AudioContext: class {
        constructor() {
          return ctx;
        }
      }
    });

    const audio = createGameAudio({
      tracks: [{ melody: [{ freq: 440, beats: 1 }] }],
      tempo: 120,
      echo: { time: 0.25, feedback: 0.3, mix: 0.4 }
    });
    audio.start();
    expect(ctx.createDelay).toHaveBeenCalledTimes(1);
    audio.stop();
  });

  it('skips a zero-length note instead of spinning the scheduler forever', () => {
    const ctx = makeFakeContext();
    vi.stubGlobal('window', {
      AudioContext: class {
        constructor() {
          return ctx;
        }
      }
    });

    // A bad authoring value (beats: 0) would never advance the cursor past the
    // lookahead horizon; the guard skips the note so start() must return.
    const audio = createGameAudio({
      tracks: [{ melody: [{ freq: 440, beats: 0 }] }],
      tempo: 120
    });
    audio.start();
    expect(ctx.createOscillator).not.toHaveBeenCalled();
    audio.stop();
  });

  it('muting music drops the master gain while effects still play', () => {
    const ctx = makeFakeContext();
    vi.stubGlobal('window', {
      AudioContext: class {
        constructor() {
          return ctx;
        }
      }
    });

    const audio = createGameAudio({ tracks: [{ melody: [{ freq: 440, beats: 1 }] }], tempo: 120 });
    audio.start();
    // The first gain created is the music master (before musicBus / per-note gains).
    const master = ctx.createGain.mock.results[0].value;
    const gainsBefore = ctx.createGain.mock.calls.length;

    audio.setMusicMuted(true);
    expect(master.gain.setTargetAtTime).toHaveBeenCalledWith(0, expect.any(Number), expect.any(Number));

    // Effects are a separate channel: playSfx still builds its output graph.
    audio.playSfx('blip');
    expect(ctx.createGain.mock.calls.length).toBeGreaterThan(gainsBefore);
    audio.stop();
  });

  it('muting effects makes playSfx a silent no-op', () => {
    const ctx = makeFakeContext();
    vi.stubGlobal('window', {
      AudioContext: class {
        constructor() {
          return ctx;
        }
      }
    });

    const audio = createGameAudio({ tracks: [{ melody: [{ freq: 440, beats: 1 }] }], tempo: 120 });
    audio.start();
    audio.setSfxMuted(true);
    const gainsBefore = ctx.createGain.mock.calls.length;
    const oscBefore = ctx.createOscillator.mock.calls.length;

    audio.playSfx('explosion');
    expect(ctx.createGain.mock.calls.length).toBe(gainsBefore);
    expect(ctx.createOscillator.mock.calls.length).toBe(oscBefore);
    audio.stop();
  });

  it('dispose closes the AudioContext so the music cannot outlive the page', () => {
    const ctx = makeFakeContext();
    let constructed = 0;
    // A real constructor (not a vi.fn) so `new AudioContext()` yields our fake:
    // vitest mocks don't honor an object returned from the implementation when
    // invoked with `new`, which would leave the synth without a context.
    vi.stubGlobal('window', {
      AudioContext: class {
        constructor() {
          constructed++;
          return ctx;
        }
      }
    });

    const audio = createGameAudio({ tracks: [{ melody: MELODY }] });
    audio.start();
    expect(constructed).toBe(1);
    expect(ctx.close).not.toHaveBeenCalled();

    audio.dispose();
    expect(ctx.close).toHaveBeenCalledTimes(1);

    // After disposal, start()/playSfx() must not resurrect a leaked context
    // (its teardown listeners are already gone).
    audio.start();
    audio.playSfx('blip');
    expect(constructed).toBe(1);

    // A second dispose is a no-op (the context is already gone).
    audio.dispose();
    expect(ctx.close).toHaveBeenCalledTimes(1);
  });
});

describe('setTempo', () => {
  beforeEach(() => {
    installLocalStorage();
  });

  /** Scheduled length of the nth note: osc.stop time minus osc.start time. */
  function noteLength(ctx: ReturnType<typeof makeFakeContext>, n: number): number {
    const osc = ctx.createOscillator.mock.results[n].value;
    return osc.stop.mock.calls[0][0] - osc.start.mock.calls[0][0];
  }

  it('changes the duration of subsequently scheduled notes and rejects junk', () => {
    vi.useFakeTimers();
    const ctx = makeFakeContext();
    vi.stubGlobal('window', {
      AudioContext: class {
        constructor() {
          return ctx;
        }
      }
    });

    // One whole-beat note at 60 bpm = 1s; playTone trims to 0.9 + 0.02 stop pad.
    const audio = createGameAudio({ tracks: [{ melody: [{ freq: 440, beats: 1 }] }], tempo: 60 });
    audio.start();
    expect(noteLength(ctx, 0)).toBeCloseTo(0.92);

    // Double the tempo: the next scheduled note is half as long.
    audio.setTempo(120);
    ctx.currentTime = 1.0; // first note ended at 1.05; lookahead window reaches it
    vi.advanceTimersByTime(25);
    expect(ctx.createOscillator.mock.results.length).toBeGreaterThan(1);
    expect(noteLength(ctx, 1)).toBeCloseTo(0.47);

    // Zero, negative, NaN, and Infinity must all be ignored — Infinity
    // would zero the beat length and spin the scheduler loop forever.
    audio.setTempo(0);
    audio.setTempo(-30);
    audio.setTempo(NaN);
    audio.setTempo(Infinity);
    ctx.currentTime = 1.6; // next note due at 1.55
    vi.advanceTimersByTime(25);
    expect(noteLength(ctx, 2)).toBeCloseTo(0.47);

    audio.stop();
    vi.useRealTimers();
  });

  it('sanitises a non-finite constructor tempo to the 120 bpm default', () => {
    const ctx = makeFakeContext();
    vi.stubGlobal('window', {
      AudioContext: class {
        constructor() {
          return ctx;
        }
      }
    });
    const audio = createGameAudio({ tracks: [{ melody: [{ freq: 440, beats: 1 }] }], tempo: Infinity });
    audio.start(); // must not spin the lookahead loop
    // One beat at the sanitised 120 bpm default = 0.5s → 0.45 + 0.02 pad.
    expect(noteLength(ctx, 0)).toBeCloseTo(0.47);
    audio.stop();
  });

  it('clamps an absurdly large tempo so scheduling work stays bounded', () => {
    const ctx = makeFakeContext();
    vi.stubGlobal('window', {
      AudioContext: class {
        constructor() {
          return ctx;
        }
      }
    });
    // 1e6 bpm would schedule ~1,600 notes per 100ms lookahead window; the
    // clamp (1000 bpm) keeps a whole beat at 60ms → 0.054 + 0.02 stop pad.
    const audio = createGameAudio({ tracks: [{ melody: [{ freq: 440, beats: 1 }] }], tempo: 1e6 });
    audio.start();
    expect(noteLength(ctx, 0)).toBeCloseTo(0.074);

    const before = ctx.createOscillator.mock.calls.length;
    audio.setTempo(1e9); // clamped too, not ignored
    expect(before).toBeLessThan(10);
    audio.stop();
  });
});

describe('navigation teardown via Astro ClientRouter', () => {
  beforeEach(() => {
    installLocalStorage();
  });

  it('tears down on astro:before-swap so music stops when leaving the page', () => {
    // The site swaps the DOM in place on navigation (links and the back button
    // alike) rather than reloading, so the engine must stop the music itself.
    // A real EventTarget lets us dispatch the actual lifecycle event and prove
    // the wiring, end to end.
    const doc = new EventTarget() as unknown as Document & EventTarget;
    (doc as unknown as { hidden: boolean }).hidden = false;
    vi.stubGlobal('document', doc);

    const ctx = makeFakeContext();
    vi.stubGlobal('window', {
      AudioContext: class {
        constructor() {
          return ctx;
        }
      }
    });

    const audio = createGameAudio({ tracks: [{ melody: MELODY }] });
    audio.start();
    expect(ctx.close).not.toHaveBeenCalled();

    // Astro dispatches this on `document` right before replacing the page.
    doc.dispatchEvent(new Event('astro:before-swap'));
    expect(ctx.close).toHaveBeenCalledTimes(1);

    // The handler removed itself, so a later navigation event is inert.
    doc.dispatchEvent(new Event('astro:before-swap'));
    expect(ctx.close).toHaveBeenCalledTimes(1);
  });
});

/** A tiny fake just rich enough for the synth scheduling code paths. */
function makeFakeContext() {
  const param = () => ({
    value: 0,
    setValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
    setTargetAtTime: vi.fn()
  });
  const node = () => ({
    gain: param(),
    frequency: param(),
    detune: param(),
    type: 'square',
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn()
  });
  return {
    currentTime: 0,
    state: 'running',
    destination: {},
    resume: vi.fn(() => Promise.resolve()),
    suspend: vi.fn(() => Promise.resolve()),
    close: vi.fn(() => Promise.resolve()),
    createGain: vi.fn(node),
    createOscillator: vi.fn(node),
    createDelay: vi.fn(() => ({ delayTime: param(), connect: vi.fn() }))
  };
}
