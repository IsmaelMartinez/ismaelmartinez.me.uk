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

describe('per-note gain', () => {
  beforeEach(() => {
    installLocalStorage();
  });

  /**
   * Peak level the first scheduled note ramps to. Without an echo send the
   * gain nodes are created in a fixed order — music master, music bus, then
   * one per note — so index 2 is the first note's envelope.
   */
  function firstNotePeak(ctx: ReturnType<typeof makeFakeContext>): number {
    const noteGain = ctx.createGain.mock.results[2].value;
    return noteGain.gain.exponentialRampToValueAtTime.mock.calls[0][0];
  }

  function playOne(note: Note, volume?: number): number {
    const ctx = makeFakeContext();
    vi.stubGlobal('window', {
      AudioContext: class {
        constructor() {
          return ctx;
        }
      }
    });
    const audio = createGameAudio({ tracks: [{ melody: [note], volume }], tempo: 120 });
    audio.start();
    const peak = firstNotePeak(ctx);
    audio.stop();
    return peak;
  }

  it('plays a note without a gain at the voice peak', () => {
    // VOICE_PEAK (0.8) times the track volume, which defaults to 1.
    expect(playOne({ freq: 440, beats: 1 })).toBeCloseTo(0.8, 6);
  });

  it('attenuates a note in proportion to its gain', () => {
    expect(playOne({ freq: 440, beats: 1, gain: 0.5 })).toBeCloseTo(0.4, 6);
    expect(playOne({ freq: 440, beats: 1, gain: 0.75 })).toBeCloseTo(0.6, 6);
  });

  it('scales under the track volume rather than replacing it', () => {
    // A ducked note in a quiet voice is quieter still: 0.8 * 0.5 * 0.5.
    expect(playOne({ freq: 440, beats: 1, gain: 0.5 }, 0.5)).toBeCloseTo(0.2, 6);
  });

  it('clamps above 1 so a note can never exceed its track volume', () => {
    // Attenuation only: boosting is not how these lines are shaped, and a note
    // louder than the voice would break the balance the mix was set at.
    expect(playOne({ freq: 440, beats: 1, gain: 4 })).toBeCloseTo(0.8, 6);
  });

  it('clamps at a positive floor, since exponential ramps cannot reach zero', () => {
    // A zero target would be an invalid ramp, not silence — a rest is freq 0.
    expect(playOne({ freq: 440, beats: 1, gain: 0 })).toBeCloseTo(0.04, 6);
    expect(playOne({ freq: 440, beats: 1, gain: -3 })).toBeCloseTo(0.04, 6);
  });

  it('ignores a non-finite gain rather than silencing the note', () => {
    expect(playOne({ freq: 440, beats: 1, gain: NaN })).toBeCloseTo(0.8, 6);
    expect(playOne({ freq: 440, beats: 1, gain: Infinity })).toBeCloseTo(0.8, 6);
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

describe('sustained voices: tempo changes, stopping, and un-muting', () => {
  beforeEach(() => {
    installLocalStorage();
  });

  function stubContext() {
    const ctx = makeFakeContext();
    vi.stubGlobal('window', {
      AudioContext: class {
        constructor() {
          return ctx;
        }
      }
    });
    return ctx;
  }

  /** Every start time handed to an oscillator so far. */
  function startTimes(ctx: ReturnType<typeof makeFakeContext>): number[] {
    return ctx.createOscillator.mock.results.map(r => r.value.start.mock.calls[0][0]);
  }

  it('rescales every pending cursor on a tempo change, so voices cannot slide apart', () => {
    // A long-note voice against a short-note one — the shape that made
    // Cascade's pad drift a beat and a half behind its melody across a run.
    vi.useFakeTimers();
    const ctx = stubContext();
    const audio = createGameAudio({
      tracks: [
        { melody: [{ freq: 440, beats: 4 }] }, // 4s per note at 60 bpm
        { melody: [{ freq: 220, beats: 1 }] } // 1s per note
      ],
      tempo: 60
    });
    audio.start(); // first note of each voice at t0 = 0.05
    audio.setTempo(120); // half the beat length, so every pending gap halves

    ctx.currentTime = 2.0;
    vi.advanceTimersByTime(25);
    const starts = startTimes(ctx);

    // Both voices are now on the new tempo's grid: the short voice's next note
    // lands at 0.525 rather than the 1.05 it was already committed to, and the
    // long voice's at 2.025 rather than 4.05. Left un-rescaled, the long voice
    // would keep old-tempo timing for its whole in-flight note and every later
    // tempo change would add another slip that never comes back.
    //
    // Matched within a tolerance rather than by exact equality. The arithmetic
    // is deterministic, so this is not about flakiness — it is that the claim
    // being made is "the cursor was rescaled", not "the sum rounded to this
    // exact double", and a later refactor that reassociates the arithmetic
    // should not fail by an ULP. The positions being told apart here are
    // 0.5 apart, so the tolerance discriminates with enormous margin.
    const scheduledNear = (t: number): boolean => starts.some(s => Math.abs(s - t) < 1e-9);
    expect(scheduledNear(0.525)).toBe(true);
    expect(scheduledNear(2.025)).toBe(true);
    expect(scheduledNear(1.05)).toBe(false);
    expect(scheduledNear(4.05)).toBe(false);

    audio.stop();
    vi.useRealTimers();
  });

  it('silences the music on stop instead of letting a long note ring on', () => {
    // Dropping the scheduler leaves already-scheduled notes playing to their
    // end — up to two seconds for a 4-beat voice, over the game-over sting.
    const ctx = stubContext();
    const audio = createGameAudio({ tracks: [{ melody: [{ freq: 440, beats: 4 }] }], tempo: 116 });
    audio.start();
    const master = ctx.createGain.mock.results[0].value;
    master.gain.setTargetAtTime.mockClear();

    audio.stop();
    expect(master.gain.setTargetAtTime).toHaveBeenCalledWith(0, expect.any(Number), expect.any(Number));
  });

  it('lifts the music again on a restart after that stop', () => {
    const ctx = stubContext();
    const audio = createGameAudio({
      tracks: [{ melody: [{ freq: 440, beats: 4 }] }],
      tempo: 116,
      volume: 0.2
    });
    audio.start();
    audio.stop();
    const master = ctx.createGain.mock.results[0].value;
    master.gain.setTargetAtTime.mockClear();

    audio.start();
    expect(master.gain.setTargetAtTime).toHaveBeenCalledWith(0.2, expect.any(Number), expect.any(Number));
    audio.stop();
  });

  it('brings every voice back together when the music is un-muted', () => {
    // While muted the cursors advance but no oscillators are made, so a voice
    // that stepped over a long note has nothing to play when sound returns.
    vi.useFakeTimers();
    const ctx = stubContext();
    const audio = createGameAudio({
      tracks: [
        {
          melody: [
            { freq: 440, beats: 1 },
            { freq: 880, beats: 1 }
          ]
        }
      ],
      tempo: 60
    });
    audio.start();
    audio.setMusicMuted(true);

    // Let the muted cursor run well past the first note of the line.
    ctx.currentTime = 5.0;
    vi.advanceTimersByTime(25);
    const madeWhileMuted = ctx.createOscillator.mock.calls.length;

    ctx.currentTime = 10.0;
    audio.setMusicMuted(false);
    vi.advanceTimersByTime(25);

    // Sound resumes at once and from the top of the line, rather than the voice
    // staying silent until whatever note the cursor had already stepped over.
    expect(ctx.createOscillator.mock.calls.length).toBeGreaterThan(madeWhileMuted);
    const resumed = ctx.createOscillator.mock.results[madeWhileMuted].value;
    expect(resumed.frequency.setValueAtTime).toHaveBeenCalledWith(440, 10.05);

    audio.stop();
    vi.useRealTimers();
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
