import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createGameAudio, type GameAudioOptions, type SfxName } from '../../src/games/engine/audio';
import { p } from '../../src/games/engine/pitch';
import { installLocalStorage } from './dom-helpers';

/**
 * The effects against the music (#372, goal G5 of the music round 2 plan).
 *
 * Every real score is found by glob, as `music.test.ts` does, so a cabinet
 * nobody enrols is still held to the ceiling.
 */
const MODULES = import.meta.glob('../../src/games/*/music.ts', { eager: true }) as Record<
  string,
  Record<string, unknown>
>;

const SCORES: { name: string; music: GameAudioOptions }[] = Object.entries(MODULES)
  .map(([path, mod]) => ({
    name: path.split('/').at(-2) as string,
    music: Object.values(mod).find(
      v => typeof v === 'object' && v !== null && Array.isArray((v as GameAudioOptions).tracks)
    ) as GameAudioOptions
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

const ALL_SFX: SfxName[] = ['blip', 'score', 'hit', 'explosion', 'gameover', 'rescue'];

/** G5's ceiling: no effect more than 6 dB over the loudest music voice. */
const CEILING_DB = 6;

/**
 * A voice's peak as the engine plays it: `VOICE_PEAK` (0.8, pinned by the
 * per-note gain tests in `audio.test.ts`) times the track volume times the
 * master. Restated here rather than imported so the reference does not come
 * from the code under test.
 */
function loudestVoice(music: GameAudioOptions): number {
  const master = music.volume ?? 0.14;
  return Math.max(...music.tracks.map(t => 0.8 * (t.volume ?? 1) * master));
}

const dB = (ratio: number): number => 20 * Math.log10(ratio);

type Param = ReturnType<typeof param>;
function param() {
  return {
    value: 0,
    setValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
    setTargetAtTime: vi.fn(),
    // Vibrato's depth ramp and a layer's fade, which a score using them reaches.
    linearRampToValueAtTime: vi.fn(),
    cancelScheduledValues: vi.fn()
  };
}

/** A fake context that records how nodes are wired, so a test can follow the graph. */
function makeContext() {
  const destination = { id: 'destination' };
  const node = () => {
    const n = {
      gain: param(),
      frequency: param(),
      detune: param(),
      Q: param(),
      type: 'square',
      buffer: null as unknown,
      target: null as unknown,
      connect: vi.fn((to: unknown) => {
        n.target = to;
      }),
      disconnect: vi.fn(),
      setPeriodicWave: vi.fn(),
      start: vi.fn(),
      stop: vi.fn()
    };
    return n;
  };
  const ctx = {
    currentTime: 0,
    sampleRate: 44100,
    state: 'running',
    destination,
    resume: vi.fn(() => Promise.resolve()),
    suspend: vi.fn(() => Promise.resolve()),
    close: vi.fn(() => Promise.resolve()),
    createGain: vi.fn(node),
    createOscillator: vi.fn(node),
    // Pulse duties, drums and the pause filter, for scores that use them.
    createPeriodicWave: vi.fn(() => ({})),
    createBiquadFilter: vi.fn(node),
    createBufferSource: vi.fn(node),
    createBuffer: vi.fn((_channels: number, length: number) => ({ getChannelData: () => new Float32Array(length) })),
    createDelay: vi.fn(() => ({ delayTime: param(), connect: vi.fn() }))
  };
  vi.stubGlobal('window', {
    AudioContext: class {
      constructor() {
        return ctx;
      }
    }
  });
  return ctx;
}
type Ctx = ReturnType<typeof makeContext>;
type FakeNode = ReturnType<Ctx['createGain']>;

/**
 * Level of a gain envelope at time `t`, following the engine's automation:
 * points joined by exponential ramps, silent before the first.
 */
function envelopeAt(g: Param, t: number): number {
  const points = [
    ...g.setValueAtTime.mock.calls.map(([v, at]) => ({ v: v as number, at: at as number })),
    ...g.exponentialRampToValueAtTime.mock.calls.map(([v, at]) => ({ v: v as number, at: at as number }))
  ].sort((a, b) => a.at - b.at);
  if (points.length === 0 || t < points[0].at) return 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (t <= b.at) return a.v * Math.pow(b.v / a.v, (t - a.at) / (b.at - a.at));
  }
  return points[points.length - 1].v;
}

/**
 * Plays one effect and returns its peak at the speakers: the sum of every
 * tone's envelope, sampled every 0.5 ms, times the effect's output gain. The
 * envelope sum is an upper bound on the waveform's peak, so the measure never
 * flatters an effect whose tones overlap.
 */
function effectPeak(music: GameAudioOptions, name: SfxName): number {
  const ctx = makeContext();
  const audio = createGameAudio(music);
  audio.start();
  const before = ctx.createGain.mock.results.length;
  audio.playSfx(name);
  const made = ctx.createGain.mock.results.slice(before).map(r => r.value as FakeNode);
  const out = made.find(n => n.target === ctx.destination) as FakeNode;
  const tones = made.filter(n => n.target === out);
  let peak = 0;
  for (let t = 0; t < 1; t += 0.0005) {
    const sum = tones.reduce((s, n) => s + envelopeAt(n.gain, t), 0);
    peak = Math.max(peak, sum);
  }
  audio.dispose();
  return peak * out.gain.value;
}

/** Frequencies handed to the oscillators by one effect. */
function effectPitches(music: GameAudioOptions, name: SfxName): number[] {
  const ctx = makeContext();
  const audio = createGameAudio(music);
  audio.setMusicMuted(true);
  audio.playSfx(name);
  const freqs = ctx.createOscillator.mock.results.map(
    r => (r.value as FakeNode).frequency.setValueAtTime.mock.calls[0][0] as number
  );
  audio.dispose();
  return freqs;
}

beforeEach(() => {
  installLocalStorage();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('effects against the music (G5)', () => {
  it('finds every cabinet score', () => {
    expect(SCORES.length).toBeGreaterThanOrEqual(9);
    for (const { name, music } of SCORES) expect(music, name).toBeDefined();
  });

  it.each(SCORES)('keeps every effect within 6 dB of the loudest voice in $name', ({ music }) => {
    const lead = loudestVoice(music);
    for (const name of ALL_SFX) {
      const over = dB(effectPeak(music, name) / lead);
      expect(over, `${name} at ${over.toFixed(2)} dB`).toBeLessThanOrEqual(CEILING_DB);
    }
  });

  it.each(SCORES)('keeps every effect at least as loud as the lead in $name', ({ music }) => {
    // The floor that keeps the rebalance honest: an effect under the lead
    // would disappear into the mix, and muting the music does not raise it.
    const lead = loudestVoice(music);
    for (const name of ALL_SFX) {
      expect(effectPeak(music, name), name).toBeGreaterThanOrEqual(lead);
    }
  });

  it('plays effects at the same level whether or not the music is muted', () => {
    const music = SCORES[0].music;
    const ctx = makeContext();
    const audio = createGameAudio(music);
    audio.start();
    audio.playSfx('blip');
    const level = (): number =>
      (ctx.createGain.mock.results.map(r => r.value as FakeNode).filter(n => n.target === ctx.destination).at(-1) as FakeNode)
        .gain.value;
    const unmuted = level();
    audio.setMusicMuted(true);
    ctx.currentTime = 1;
    audio.playSfx('blip');
    expect(level()).toBe(unmuted);
    audio.dispose();
  });
});

describe('effect rate limit', () => {
  const music: GameAudioOptions = { tracks: [{ melody: [{ freq: 440, beats: 1 }] }] };

  it('drops a repeat of hit inside 120 ms and plays it after', () => {
    const ctx = makeContext();
    const audio = createGameAudio(music);
    audio.setMusicMuted(true);
    const oscillators = (): number => ctx.createOscillator.mock.calls.length;

    audio.playSfx('hit');
    const one = oscillators();
    expect(one).toBe(2);

    ctx.currentTime = 0.1;
    audio.playSfx('hit');
    expect(oscillators()).toBe(one);

    ctx.currentTime = 0.13;
    audio.playSfx('hit');
    expect(oscillators()).toBe(one * 2);
    audio.dispose();
  });

  it('limits each effect on its own clock', () => {
    const ctx = makeContext();
    const audio = createGameAudio(music);
    audio.setMusicMuted(true);
    audio.playSfx('hit');
    const afterHit = ctx.createOscillator.mock.calls.length;
    // A different effect in the same instant is not held back by the hit.
    audio.playSfx('blip');
    expect(ctx.createOscillator.mock.calls.length).toBe(afterHit + 1);
    audio.dispose();
  });
});

describe('effects in the score key', () => {
  it('keeps the original pitches when the score names no tonic', () => {
    const music: GameAudioOptions = { tracks: [{ melody: [{ freq: 440, beats: 1 }] }] };
    expect(effectPitches(music, 'hit')).toEqual([180, 110]);
    expect(effectPitches(music, 'score')).toEqual([784, 1047]);
  });

  it('draws every pitched effect from the tonic and fifth of the named key', () => {
    const music: GameAudioOptions = { tonic: p('A3'), tracks: [{ melody: [{ freq: 440, beats: 1 }] }] };
    // Line Hold's worst offender: 180 and 110 Hz became E3 and A2.
    const hit = effectPitches(music, 'hit');
    expect(hit[0]).toBeCloseTo(p('E3'), 6);
    expect(hit[1]).toBeCloseTo(p('A2'), 6);
    for (const name of ['blip', 'score', 'hit', 'gameover', 'rescue'] as SfxName[]) {
      for (const f of effectPitches(music, name)) {
        const semis = Math.round(12 * Math.log2(f / p('A3')));
        expect(12 * Math.log2(f / p('A3'))).toBeCloseTo(semis, 6);
        expect([0, 7], `${name} at ${f.toFixed(1)} Hz`).toContain(((semis % 12) + 12) % 12);
      }
    }
  });

  it('sets Line Hold in A', () => {
    const lineHold = SCORES.find(s => s.name === 'towerdefense');
    expect(lineHold?.music.tonic).toBeCloseTo(p('A3'), 6);
  });
});

describe('ducking the music under an effect', () => {
  const music: GameAudioOptions = { volume: 0.2, tracks: [{ melody: [{ freq: 440, beats: 1 }] }] };

  /**
   * Where a gain driven only by setTargetAtTime settles: the target of the
   * event that starts last, the later-written one on a tie, as Web Audio
   * orders its timeline.
   */
  function settlesAt(g: Param): number {
    const events = g.setTargetAtTime.mock.calls.map(([v, at], i) => ({ v: v as number, at: at as number, i }));
    events.sort((a, b) => a.at - b.at || a.i - b.i);
    return events.length ? events[events.length - 1].v : g.value;
  }

  function setup() {
    vi.useFakeTimers();
    const ctx = makeContext();
    const audio = createGameAudio(music);
    audio.start();
    const master = ctx.createGain.mock.results[0].value as FakeNode;
    return { ctx, audio, master };
  }

  it('dips the music under an explosion and brings it back', () => {
    const { ctx, audio, master } = setup();
    audio.playSfx('explosion');
    const dipped = settlesAt(master.gain);
    expect(dB(dipped / 0.2)).toBeLessThan(-4);
    expect(dB(dipped / 0.2)).toBeGreaterThan(-6);
    ctx.currentTime = 0.25;
    vi.advanceTimersByTime(250);
    expect(settlesAt(master.gain)).toBe(0.2);
    audio.dispose();
  });

  it('does not duck under a blip or a hit', () => {
    const { audio, master } = setup();
    master.gain.setTargetAtTime.mockClear();
    audio.playSfx('blip');
    audio.playSfx('hit');
    expect(master.gain.setTargetAtTime).not.toHaveBeenCalled();
    audio.dispose();
  });

  it('never lifts muted music', () => {
    const { ctx, audio, master } = setup();
    audio.setMusicMuted(true);
    audio.playSfx('explosion');
    ctx.currentTime = 0.25;
    vi.advanceTimersByTime(250);
    expect(settlesAt(master.gain)).toBe(0);
    audio.dispose();
  });

  it('never lifts music muted during the duck', () => {
    const { ctx, audio, master } = setup();
    audio.playSfx('gameover');
    ctx.currentTime = 0.05;
    audio.setMusicMuted(true);
    ctx.currentTime = 0.25;
    vi.advanceTimersByTime(250);
    expect(settlesAt(master.gain)).toBe(0);
    audio.dispose();
  });

  it('never lifts a master stopped during the duck', () => {
    const { ctx, audio, master } = setup();
    audio.playSfx('score');
    ctx.currentTime = 0.05;
    audio.stop();
    ctx.currentTime = 0.25;
    vi.advanceTimersByTime(250);
    expect(settlesAt(master.gain)).toBe(0);
    audio.dispose();
  });
});
