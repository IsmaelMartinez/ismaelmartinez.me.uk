/**
 * A fake Web Audio context that writes down every graph call made on it.
 *
 * `audio.test.ts` carries a leaner `vi.fn` fake for asserting one call at a
 * time; this one exists for the question that fake cannot answer, which is
 * whether a change to the engine altered anything at all. Every node created,
 * every property assigned, every connection and every automation event lands
 * in `log` as one line, with nodes named by kind and creation order, so two
 * runs of the same score compare as plain text and a difference reads as a
 * diff rather than as a failed count.
 *
 * Numbers are written with `String()`, which round-trips a double exactly, so
 * a refactor that reassociates the arithmetic shows up here even when every
 * note still sounds the same. That is the point: the claim the snapshots make
 * is "the same graph calls", not "the same music to the ear".
 */
import { vi } from 'vitest';
import { createGameAudio, type GameAudioOptions } from '../../src/games/engine/audio';

type Loggable = { __id?: string };

function fmt(value: unknown): string {
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && '__id' in value) return (value as Loggable).__id as string;
  if (value instanceof Float32Array) return `Float32Array(${value.length})`;
  return JSON.stringify(value);
}

const PARAM_METHODS = [
  'setValueAtTime',
  'linearRampToValueAtTime',
  'exponentialRampToValueAtTime',
  'setTargetAtTime',
  'cancelScheduledValues'
] as const;

export interface RecordingContext {
  log: string[];
  currentTime: number;
  sampleRate: number;
  state: string;
  destination: Loggable;
  [method: string]: unknown;
}

/** Wraps an object so that every property assignment on it is logged. */
function logged<T extends object>(target: T, id: string, log: string[]): T {
  return new Proxy(target, {
    set(t, key, value) {
      log.push(`${id}.${String(key)} = ${fmt(value)}`);
      (t as Record<string | symbol, unknown>)[key] = value;
      return true;
    }
  });
}

export function makeRecordingContext(sampleRate = 44100): RecordingContext {
  const log: string[] = [];
  const counts: Record<string, number> = {};
  const nextId = (kind: string): string => {
    counts[kind] = (counts[kind] ?? 0) + 1;
    return `${kind}#${counts[kind]}`;
  };

  function param(owner: string, name: string) {
    const id = `${owner}.${name}`;
    const target: Record<string, unknown> = { __id: id, value: 0 };
    for (const m of PARAM_METHODS) {
      target[m] = (...args: unknown[]) => {
        log.push(`${id}.${m}(${args.map(fmt).join(', ')})`);
      };
    }
    return logged(target, id, log);
  }

  function node(kind: string, params: string[], args: unknown[] = []) {
    const id = nextId(kind);
    log.push(`create ${id}(${args.map(fmt).join(', ')})`);
    const target: Record<string, unknown> = {
      __id: id,
      connect: (dest: unknown) => {
        log.push(`${id}.connect(${fmt(dest)})`);
        return dest;
      },
      disconnect: () => {
        log.push(`${id}.disconnect()`);
      },
      start: (...a: unknown[]) => {
        log.push(`${id}.start(${a.map(fmt).join(', ')})`);
      },
      stop: (...a: unknown[]) => {
        log.push(`${id}.stop(${a.map(fmt).join(', ')})`);
      },
      setPeriodicWave: (wave: unknown) => {
        log.push(`${id}.setPeriodicWave(${fmt(wave)})`);
      }
    };
    for (const p of params) target[p] = param(id, p);
    return logged(target, id, log);
  }

  const ctx: RecordingContext = {
    log,
    currentTime: 0,
    sampleRate,
    state: 'running',
    destination: { __id: 'destination' },
    resume: vi.fn(() => Promise.resolve()),
    suspend: vi.fn(() => Promise.resolve()),
    close: vi.fn(() => Promise.resolve()),
    createGain: () => node('gain', ['gain']),
    createOscillator: () => node('osc', ['frequency', 'detune']),
    createDelay: (max: number) => node('delay', ['delayTime'], [max]),
    createBiquadFilter: () => node('filter', ['frequency', 'Q', 'gain', 'detune']),
    createBufferSource: () => node('source', ['playbackRate', 'detune']),
    createBuffer: (channels: number, length: number, rate: number) => {
      const id = nextId('buffer');
      log.push(`create ${id}(${channels}, ${length}, ${rate})`);
      const data = Array.from({ length: channels }, () => new Float32Array(length));
      return {
        __id: id,
        length,
        sampleRate: rate,
        numberOfChannels: channels,
        getChannelData: (c: number) => data[c]
      };
    },
    createPeriodicWave: (real: Float32Array, imag: Float32Array) => {
      const id = nextId('wave');
      log.push(`create ${id}(${fmt(real)}, ${fmt(imag)})`);
      return { __id: id, real, imag };
    }
  };
  return ctx;
}

/** Stubs `window.AudioContext` so the engine's `new AudioContext()` yields `ctx`. */
export function installRecordingContext(ctx: RecordingContext): void {
  vi.stubGlobal('window', {
    AudioContext: class {
      constructor() {
        return ctx;
      }
    }
  });
}

const TICK_MS = 25;

export interface Cue {
  at: number;
  run: (audio: ReturnType<typeof createGameAudio>) => void;
}

/**
 * Plays `options` for `seconds` of fake time in the engine's own 25 ms
 * scheduler ticks, firing each cue once the clock passes it, and returns the
 * graph log. The clock starts at `from`; the engine puts its first note 50 ms
 * after it. Needs `vi.useFakeTimers()`.
 */
export function drive(options: GameAudioOptions, seconds: number, cues: Cue[] = [], from = 0): string {
  const ctx = makeRecordingContext();
  installRecordingContext(ctx);
  ctx.currentTime = from;
  const audio = createGameAudio(options);
  audio.start();
  const pending = [...cues].sort((a, b) => a.at - b.at);
  const ticks = Math.round((seconds * 1000) / TICK_MS);
  for (let i = 1; i <= ticks; i++) {
    ctx.currentTime = from + (i * TICK_MS) / 1000;
    while (pending.length && pending[0].at <= ctx.currentTime) pending.shift()!.run(audio);
    vi.advanceTimersByTime(TICK_MS);
  }
  audio.dispose();
  vi.advanceTimersByTime(2000);
  return ctx.log.join('\n') + '\n';
}
