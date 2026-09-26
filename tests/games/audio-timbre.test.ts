/**
 * The engine's opt-in instrument: drums, pulse duties, vibrato, slides, and
 * the offline render. Each is read off the recording context's graph log (see
 * `audio-graph.ts`), so an assertion names the exact node call it expects.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createGameAudio, renderScore, type GameAudioOptions, type Note } from '../../src/games/engine/audio';
import { REST } from '../../src/games/engine/pitch';
import { SNAKE_MUSIC } from '../../src/games/snake/music';
import { installLocalStorage } from './dom-helpers';
import { drive, makeRecordingContext } from './audio-graph';

/** One pass of a single-track score at 60 bpm, long enough for its first note only. */
function playLine(melody: Note[], track: Partial<GameAudioOptions['tracks'][number]> = {}, seconds = 0.5): string[] {
  return drive({ tempo: 60, tracks: [{ melody, ...track }] }, seconds).trim().split('\n');
}

/** The numeric arguments of every `<target>.<method>(...)` line, in order. */
function args(log: string[], target: string, method: string): number[][] {
  const head = `${target}.${method}(`;
  return log.filter(l => l.startsWith(head)).map(l => l.slice(head.length, -1).split(', ').map(Number));
}

beforeEach(() => {
  installLocalStorage();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// The first note of every line starts 50 ms after the clock, and a one-voice
// score with no echo makes the music master and bus as gain#1 and gain#2.
const T0 = 0.05;

describe('percussion', () => {
  it('plays a kick as a triangle dropping from 150 to 45 Hz in 60 ms, gone by 150 ms', () => {
    const log = playLine([{ freq: REST, beats: 1, drum: 'kick' }]);
    expect(log).toContain('osc#1.type = triangle');
    expect(args(log, 'osc#1.frequency', 'setValueAtTime')).toEqual([[150, T0]]);
    const [[drop, dropAt]] = args(log, 'osc#1.frequency', 'exponentialRampToValueAtTime');
    expect(drop).toBe(45);
    expect(dropAt).toBeCloseTo(T0 + 0.06, 9);
    const [[floor, endAt]] = args(log, 'gain#3.gain', 'exponentialRampToValueAtTime');
    expect(floor).toBe(0.0001);
    expect(endAt).toBeCloseTo(T0 + 0.15, 9);
    // A kick needs no noise.
    expect(log.some(l => l.startsWith('create buffer'))).toBe(false);
  });

  it('plays a snare as band-passed noise at 1.5 kHz over a 200 Hz triangle body', () => {
    const log = playLine([{ freq: REST, beats: 1, drum: 'snare' }]);
    expect(log).toContain('source#1.buffer = buffer#1');
    expect(log).toContain('filter#1.type = bandpass');
    expect(args(log, 'filter#1.frequency', 'setValueAtTime')).toEqual([[1500, T0]]);
    expect(log).toContain('source#1.connect(filter#1)');
    expect(log).toContain('osc#1.type = triangle');
    expect(args(log, 'osc#1.frequency', 'setValueAtTime')).toEqual([[200, T0]]);
    // The body holds its pitch; only the kick drops.
    expect(args(log, 'osc#1.frequency', 'exponentialRampToValueAtTime')).toEqual([]);
  });

  it('plays a closed hat as noise high-passed at 7 kHz that lasts 40 ms', () => {
    const log = playLine([{ freq: REST, beats: 1, drum: 'hat' }]);
    expect(log).toContain('filter#1.type = highpass');
    expect(args(log, 'filter#1.frequency', 'setValueAtTime')).toEqual([[7000, T0]]);
    const [[, endAt]] = args(log, 'gain#3.gain', 'exponentialRampToValueAtTime');
    expect(endAt).toBeCloseTo(T0 + 0.04, 9);
    expect(log.some(l => l.startsWith('create osc'))).toBe(false);
  });

  it('builds the noise buffer once per context and hands it to every hit', () => {
    const kit: Note[] = [
      { freq: REST, beats: 0.5, drum: 'hat' },
      { freq: REST, beats: 0.5, drum: 'snare' },
      { freq: REST, beats: 0.5, drum: 'hat' },
      { freq: REST, beats: 0.5, drum: 'snare' }
    ];
    const log = playLine(kit, {}, 4);
    expect(log.filter(l => l.startsWith('create buffer'))).toEqual(['create buffer#1(1, 44100, 44100)']);
    const handed = log.filter(l => /^source#\d+\.buffer = /.test(l));
    expect(handed.length).toBeGreaterThanOrEqual(8);
    expect(handed.every(l => l.endsWith('= buffer#1'))).toBe(true);
  });

  it('never ramps a drum to zero, which an exponential ramp cannot reach', () => {
    const log = playLine(
      (['kick', 'snare', 'hat'] as const).map(drum => ({ freq: REST, beats: 1, drum })),
      {},
      3
    );
    const targets = log.filter(l => l.includes('exponentialRampToValueAtTime(')).map(l => Number(l.split('(')[1].split(',')[0]));
    expect(targets.length).toBeGreaterThan(0);
    expect(targets.every(v => v > 0)).toBe(true);
  });

  it('scales a hit by the track volume and the note gain, like any other voice', () => {
    // VOICE_PEAK 0.8 * volume 0.5 * gain 0.5, times the kick's own level of 1.
    const log = playLine([{ freq: REST, beats: 1, drum: 'kick', gain: 0.5 }], { volume: 0.5 });
    expect(args(log, 'gain#3.gain', 'setValueAtTime')[0][0]).toBeCloseTo(0.2, 9);
  });

  it('makes no nodes for a drum while the music is muted', () => {
    const log = drive(
      { tempo: 60, tracks: [{ melody: [{ freq: REST, beats: 1, drum: 'snare' }] }] },
      3,
      [{ at: 0.5, run: a => a.setMusicMuted(true) }]
    );
    // The first hit went out before the mute; none after it.
    expect(log.match(/create source#/g)).toHaveLength(1);
  });
});

describe('pulse duties', () => {
  it('builds each duty once per context from the pulse train Fourier series', () => {
    const ctx = makeRecordingContext();
    const waves: { real: Float32Array; imag: Float32Array }[] = [];
    const create = ctx.createPeriodicWave as (r: Float32Array, i: Float32Array) => unknown;
    ctx.createPeriodicWave = (real: Float32Array, imag: Float32Array) => {
      waves.push({ real, imag });
      return create(real, imag);
    };
    vi.stubGlobal('window', {
      AudioContext: class {
        constructor() {
          return ctx;
        }
      }
    });
    const audio = createGameAudio({
      tempo: 120,
      tracks: [
        { wave: 'pulse12', detune: 6, melody: [{ freq: 440, beats: 0.5 }, { freq: 550, beats: 0.5 }] },
        { wave: 'pulse25', melody: [{ freq: 220, beats: 1 }] }
      ]
    });
    audio.start();
    for (let i = 1; i <= 80; i++) {
      ctx.currentTime = i * 0.025;
      vi.advanceTimersByTime(25);
    }
    audio.dispose();

    // Two duties in use, however many notes and twins played them.
    expect(waves).toHaveLength(2);
    const oscs = ctx.log.filter(l => /^create osc#/.test(l)).length;
    const periodic = ctx.log.filter(l => /\.setPeriodicWave\(wave#[12]\)$/.test(l)).length;
    expect(oscs).toBeGreaterThan(6);
    expect(periodic).toBe(oscs);
    // None of those oscillators was also given a stock shape.
    expect(ctx.log.some(l => /^osc#\d+\.type = /.test(l))).toBe(false);

    const [twelve] = waves;
    expect(twelve.real).toHaveLength(65);
    expect(twelve.real[0]).toBe(0);
    for (const n of [1, 2, 7, 8, 64]) {
      expect(twelve.real[n]).toBeCloseTo((2 / (n * Math.PI)) * Math.sin(n * Math.PI * 0.125), 6);
    }
    // The 8th harmonic of a 1/8 pulse is the series' first null.
    expect(twelve.real[8]).toBeCloseTo(0, 6);
    expect(Array.from(twelve.imag).every(v => v === 0)).toBe(true);
  });

  it('plays a 50% pulse through its own wave rather than the stock square', () => {
    const log = playLine([{ freq: 440, beats: 1 }], { wave: 'pulse50' });
    expect(log).toContain('osc#1.setPeriodicWave(wave#1)');
  });
});

describe('vibrato', () => {
  it('starts straight, begins at 150 ms and reaches its depth by 400 ms, on the voice and its twin', () => {
    const log = playLine([{ freq: 440, beats: 1 }], { vibrato: 8, detune: 6 });
    // The LFO is made first, so it is osc#1; the voice and its twin are 2 and 3.
    expect(log).toContain('osc#1.type = sine');
    expect(args(log, 'osc#1.frequency', 'setValueAtTime')).toEqual([[5.5, T0]]);
    const depth = 'gain#4.gain';
    const holds = args(log, depth, 'setValueAtTime');
    expect(holds[0]).toEqual([0, T0]);
    expect(holds[1][0]).toBe(0);
    expect(holds[1][1]).toBeCloseTo(T0 + 0.15, 9);
    const [[cents, fullAt]] = args(log, depth, 'linearRampToValueAtTime');
    expect(cents).toBe(8);
    expect(fullAt).toBeCloseTo(T0 + 0.4, 9);
    expect(log).toContain('gain#4.connect(osc#2.detune)');
    expect(log).toContain('gain#4.connect(osc#3.detune)');
  });

  it('leaves a note too short to waver alone', () => {
    // A quarter beat at 60 bpm plays for 0.225 s, under the 0.4 s it needs.
    const log = playLine([{ freq: 440, beats: 0.25 }], { vibrato: 8 });
    expect(log.filter(l => l.startsWith('create osc')).length).toBeGreaterThan(0);
    expect(log.some(l => l.endsWith('.type = sine'))).toBe(false);
    expect(log.some(l => l.includes('.detune)'))).toBe(false);
  });
});

describe('slides', () => {
  it('scoops into a note from slideFrom over the first 60 ms, transposed with the track', () => {
    const log = playLine([{ freq: 440, beats: 1, slideFrom: 330 }], { octaveShift: 1 });
    expect(args(log, 'osc#1.frequency', 'setValueAtTime')).toEqual([[660, T0]]);
    const [[to, at]] = args(log, 'osc#1.frequency', 'exponentialRampToValueAtTime');
    expect(to).toBe(880);
    expect(at).toBeCloseTo(T0 + 0.06, 9);
  });

  it('glides over the tail of a note into the next pitch of the line, wrapping at the loop', () => {
    const log = playLine(
      [
        { freq: 440, beats: 1, slideNext: true },
        { freq: 660, beats: 1, slideNext: true }
      ],
      {},
      1.5
    );
    // A pluck plays 0.9 of its beat, so the glide ends at 0.9 s after onset.
    const first = args(log, 'osc#1.frequency', 'setValueAtTime');
    expect(first[0]).toEqual([440, T0]);
    expect(first[1][0]).toBe(440);
    expect(first[1][1]).toBeCloseTo(T0 + 0.9 - 0.06, 9);
    const [[to, at]] = args(log, 'osc#1.frequency', 'exponentialRampToValueAtTime');
    expect(to).toBe(660);
    expect(at).toBeCloseTo(T0 + 0.9, 9);
    // The last note of the line slides back round to the first.
    expect(args(log, 'osc#2.frequency', 'exponentialRampToValueAtTime')[0][0]).toBe(440);
  });

  it('does not glide into a rest or a drum', () => {
    const log = playLine(
      [
        { freq: 440, beats: 1, slideNext: true },
        { freq: REST, beats: 1 },
        { freq: 440, beats: 1, slideNext: true },
        // A drum's freq is ignored, so even a pitched one is not a target.
        { freq: 440, beats: 1, drum: 'hat' }
      ],
      {},
      3.5
    );
    expect(log.some(l => /^osc#\d+\.frequency\.exponentialRamp/.test(l))).toBe(false);
  });
});

describe('renderScore', () => {
  it('resolves to null where there is no OfflineAudioContext', async () => {
    await expect(renderScore(SNAKE_MUSIC, 1)).resolves.toBeNull();
  });

  it('schedules the same notes the live engine plays over the same window', async () => {
    // Live, from a clock at -50 ms so its first note lands on 0 like the render's.
    const seconds = 4;
    const live = drive(SNAKE_MUSIC, seconds - 0.05, [], -0.05).split('\n');

    const ctx = makeRecordingContext(8000);
    const rendered = { length: 0 };
    let made: unknown[] = [];
    vi.stubGlobal('window', {
      OfflineAudioContext: class {
        constructor(...a: unknown[]) {
          made = a;
          return Object.assign(ctx, { startRendering: () => Promise.resolve(rendered) });
        }
      }
    });
    await expect(renderScore(SNAKE_MUSIC, seconds, 8000)).resolves.toBe(rendered);
    expect(made).toEqual([1, 32000, 8000]);
    expect(ctx.log.slice(0, 2)).toEqual(['create gain#1()', `gain#1.gain.value = ${SNAKE_MUSIC.volume}`]);

    // Node numbering differs (live interleaves voices per 100 ms window, the
    // render takes each voice in one pass), so compare what each note does.
    const notes = (log: string[]) =>
      log
        .filter(l => /^osc#\d+\.(frequency\.setValueAtTime|type|stop)/.test(l))
        .map(l => l.replace(/^osc#\d+/, 'osc'))
        .sort();
    const renderedNotes = notes(ctx.log);
    expect(renderedNotes.length).toBeGreaterThan(20);
    expect(renderedNotes).toEqual(notes(live));
  });

  it('refuses a length or a sample rate it cannot render at', async () => {
    vi.stubGlobal('window', { OfflineAudioContext: class {} });
    await expect(renderScore(SNAKE_MUSIC, 0)).resolves.toBeNull();
    await expect(renderScore(SNAKE_MUSIC, NaN)).resolves.toBeNull();
    await expect(renderScore(SNAKE_MUSIC, Infinity)).resolves.toBeNull();
    await expect(renderScore(SNAKE_MUSIC, 1, 0)).resolves.toBeNull();
    await expect(renderScore(SNAKE_MUSIC, 1, NaN)).resolves.toBeNull();
    await expect(renderScore(SNAKE_MUSIC, 1, Infinity)).resolves.toBeNull();
  });

  it('resolves to null when the browser rejects the rate, rather than throwing', async () => {
    vi.stubGlobal('window', {
      OfflineAudioContext: class {
        constructor() {
          throw new RangeError('unsupported sample rate');
        }
      }
    });
    await expect(renderScore(SNAKE_MUSIC, 1, 1000)).resolves.toBeNull();
  });
});
