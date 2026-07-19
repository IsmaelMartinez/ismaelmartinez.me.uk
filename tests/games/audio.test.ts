import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createGameAudio, loadMuted, type Note } from '../../src/games/engine/audio';

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
    const audio = createGameAudio({ melody: MELODY });
    expect(typeof audio.start).toBe('function');
    expect(typeof audio.stop).toBe('function');
    expect(typeof audio.toggleMute).toBe('function');
    expect(typeof audio.isMuted).toBe('function');
    expect(typeof audio.setMuted).toBe('function');
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

  it('defaults to unmuted (music enabled)', () => {
    const audio = createGameAudio({ melody: MELODY });
    expect(audio.isMuted()).toBe(false);
  });
});

describe('mute toggle and shared persistence', () => {
  beforeEach(() => {
    installLocalStorage();
  });

  it('toggleMute flips state and returns the new value', () => {
    const audio = createGameAudio({ melody: MELODY });
    expect(audio.isMuted()).toBe(false);
    expect(audio.toggleMute()).toBe(true);
    expect(audio.isMuted()).toBe(true);
    expect(audio.toggleMute()).toBe(false);
    expect(audio.isMuted()).toBe(false);
  });

  it('setMuted persists the preference under the shared arcade key', () => {
    const audio = createGameAudio({ melody: MELODY });
    audio.setMuted(true);
    expect(loadMuted()).toBe(true);
    // A fresh instance (a different game) picks up the shared choice.
    const other = createGameAudio({ melody: MELODY });
    expect(other.isMuted()).toBe(true);

    other.setMuted(false);
    expect(loadMuted()).toBe(false);
  });
});

describe('createGameAudio with a stubbed AudioContext', () => {
  beforeEach(() => {
    installLocalStorage();
  });

  it('lazily constructs the AudioContext only on first gesture', () => {
    const ctor = vi.fn(() => makeFakeContext());
    vi.stubGlobal('window', { AudioContext: ctor });

    const audio = createGameAudio({ melody: MELODY });
    // Creating the controller must not touch the AudioContext yet.
    expect(ctor).not.toHaveBeenCalled();

    audio.start();
    expect(ctor).toHaveBeenCalledTimes(1);
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

    const audio = createGameAudio({ melody: MELODY });
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
    const audio = createGameAudio({ melody: [{ freq: 440, beats: 1 }], tempo: 60 });
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

    const audio = createGameAudio({ melody: MELODY });
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
    createOscillator: vi.fn(node)
  };
}
