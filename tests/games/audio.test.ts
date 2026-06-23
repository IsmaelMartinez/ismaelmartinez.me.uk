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
    // A real constructor (not a vi.fn) so `new AudioContext()` yields our fake:
    // vitest mocks don't honor an object returned from the implementation when
    // invoked with `new`, which would leave the synth without a context.
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

    audio.dispose();
    expect(ctx.close).toHaveBeenCalledTimes(1);

    // A second dispose is a no-op (the context is already gone).
    audio.dispose();
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
