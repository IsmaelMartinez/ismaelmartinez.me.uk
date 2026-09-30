/**
 * The engine's opt-in instrument: drums, pulse duties, vibrato, slides, pan,
 * ADSR envelopes, filters, wavetables, noise, FM, pitch envelopes, arpeggios,
 * and the offline render. Each is read off the recording context's graph log
 * (see `audio-graph.ts`), so an assertion names the exact node call it
 * expects.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createGameAudio, renderScore, type GameAudioOptions, type Note } from '../../src/games/engine/audio';
import { REST } from '../../src/games/engine/pitch';
import { SNAKE_ROUND13_MUSIC } from './snake-round13-score';
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

describe('pan', () => {
  it('puts a panned note through its own panner, set at the onset, into the bus', () => {
    const log = playLine([{ freq: 440, beats: 1 }], { pan: -1 });
    expect(log).toContain('create panner#1()');
    expect(args(log, 'panner#1.pan', 'setValueAtTime')).toEqual([[-1, T0]]);
    expect(log).toContain('panner#1.connect(gain#2)');
    // The note's envelope feeds the panner, not the bus.
    expect(log).toContain('gain#3.connect(panner#1)');
    expect(log).not.toContain('gain#3.connect(gain#2)');
  });

  it('pans a drum the same way', () => {
    const log = playLine([{ freq: REST, beats: 1, drum: 'kick' }], { pan: 0.5 });
    expect(args(log, 'panner#1.pan', 'setValueAtTime')).toEqual([[0.5, T0]]);
    expect(log).toContain('gain#3.connect(panner#1)');
  });

  it('makes no panner for a rest', () => {
    const log = playLine([{ freq: REST, beats: 1 }], { pan: 1 });
    expect(log.some(l => l.startsWith('create panner'))).toBe(false);
  });

  it('makes no panner at the centre, and clamps or centres a bad value', () => {
    for (const pan of [0, NaN, Infinity]) {
      expect(playLine([{ freq: 440, beats: 1 }], { pan }).some(l => l.startsWith('create panner'))).toBe(false);
    }
    expect(args(playLine([{ freq: 440, beats: 1 }], { pan: 3 }), 'panner#1.pan', 'setValueAtTime')).toEqual([[1, T0]]);
    expect(args(playLine([{ freq: 440, beats: 1 }], { pan: -3 }), 'panner#1.pan', 'setValueAtTime')).toEqual([[-1, T0]]);
  });

  it('pans through a layer gain, and a stinger past the layers through its own gate to the bus', () => {
    const log = drive(
      {
        tempo: 60,
        tracks: [{ name: 'lead', pan: 1, melody: [{ freq: 440, beats: 4 }] }],
        stingers: { win: [[{ freq: 880, beats: 1 }]] }
      },
      1,
      [{ at: 0.5, run: a => a.playStinger('win') }]
    ).split('\n');
    // Master, bus, lane, then the voice's layer gain is gain#4.
    expect(log).toContain('panner#1.connect(gain#4)');
    const gate = log.map(l => /^panner#2\.connect\((gain#\d+)\)$/.exec(l)?.[1]).find(Boolean);
    expect(gate).toBeDefined();
    expect(log).toContain(`${gate}.connect(gain#2)`);
    expect(args(log, 'panner#2.pan', 'setValueAtTime')[0][0]).toBe(1);
  });
});

describe('adsr', () => {
  // One beat at 60 bpm, at full track volume: a one-second gate peaking at 0.8.
  const ENV = 'gain#3.gain';

  it('rises, decays to the sustain, holds it for the whole beat, then releases', () => {
    const log = playLine([{ freq: 440, beats: 1 }], { adsr: { attack: 0.1, decay: 0.2, sustain: 0.5, release: 0.3 } });
    expect(args(log, ENV, 'setValueAtTime')).toEqual([
      [0, T0],
      [0.4, T0 + 1]
    ]);
    const [[peak, peakAt]] = args(log, ENV, 'linearRampToValueAtTime');
    expect(peak).toBeCloseTo(0.8, 9);
    expect(peakAt).toBeCloseTo(T0 + 0.1, 9);
    const [[held, heldAt], [floor, goneAt]] = args(log, ENV, 'exponentialRampToValueAtTime');
    expect(held).toBeCloseTo(0.4, 9);
    expect(heldAt).toBeCloseTo(T0 + 0.3, 9);
    expect(floor).toBe(0.0001);
    expect(goneAt).toBeCloseTo(T0 + 1.3, 9);
    // The oscillator rings on through the release.
    const [[stop]] = args(log, 'osc#1', 'stop');
    expect(stop).toBeCloseTo(T0 + 1.32, 9);
  });

  it('stops part way up an attack longer than the note', () => {
    const log = playLine([{ freq: 440, beats: 1 }], { adsr: { attack: 2, decay: 0, sustain: 1, release: 0.1 } });
    const [[top, at]] = args(log, ENV, 'linearRampToValueAtTime');
    expect(top).toBeCloseTo(0.4, 9);
    expect(at).toBeCloseTo(T0 + 1, 9);
    expect(args(log, ENV, 'exponentialRampToValueAtTime')).toHaveLength(1);
  });

  it('releases from part way down a decay longer than the note, where the curve had got to', () => {
    // Half of a decay from 0.8 towards 0.2 is 0.8 * (0.2 / 0.8) ^ 0.5 = 0.4.
    const log = playLine([{ freq: 440, beats: 1 }], { adsr: { attack: 0.1, decay: 1.8, sustain: 0.25, release: 0.1 } });
    const [[held, heldAt]] = args(log, ENV, 'exponentialRampToValueAtTime');
    expect(held).toBeCloseTo(0.4, 9);
    expect(heldAt).toBeCloseTo(T0 + 1, 9);
  });

  it('overrides the pad envelope, and never releases in under 5 ms', () => {
    const log = playLine([{ freq: 440, beats: 1 }], {
      envelope: 'pad',
      adsr: { attack: 0, decay: 0, sustain: 0, release: -1 }
    });
    // A sustain of 0 holds at the exponential floor rather than zero.
    expect(args(log, ENV, 'setValueAtTime')).toEqual([
      [0, T0],
      [0.0001, T0 + 1]
    ]);
    const release = args(log, ENV, 'exponentialRampToValueAtTime').at(-1) as number[];
    expect(release[1]).toBeCloseTo(T0 + 1.005, 9);
  });
});

describe('filter', () => {
  it('puts a filter between the oscillators and the envelope, swept down from above the cutoff', () => {
    const log = playLine([{ freq: 440, beats: 1 }], {
      detune: 6,
      filter: { cutoff: 800, q: 4, envAmount: 2, envDecay: 0.2 }
    });
    expect(log).toContain('filter#1.type = lowpass');
    expect(args(log, 'filter#1.Q', 'setValueAtTime')).toEqual([[4, T0]]);
    expect(args(log, 'filter#1.frequency', 'setValueAtTime')).toEqual([[3200, T0]]);
    const [[to, at]] = args(log, 'filter#1.frequency', 'exponentialRampToValueAtTime');
    expect(to).toBe(800);
    expect(at).toBeCloseTo(T0 + 0.2, 9);
    expect(log).toContain('filter#1.connect(gain#3)');
    // The voice and its twin both go through it.
    expect(log).toContain('osc#1.connect(filter#1)');
    expect(log).toContain('osc#2.connect(filter#1)');
    expect(log).not.toContain('osc#1.connect(gain#3)');
  });

  it('holds a filter with no sweep, of the type asked for, and keeps it under Nyquist', () => {
    const fixed = playLine([{ freq: 440, beats: 1 }], { filter: { type: 'bandpass', cutoff: 1200 } });
    expect(fixed).toContain('filter#1.type = bandpass');
    expect(args(fixed, 'filter#1.Q', 'setValueAtTime')).toEqual([[1, T0]]);
    expect(args(fixed, 'filter#1.frequency', 'setValueAtTime')).toEqual([[1200, T0]]);
    expect(args(fixed, 'filter#1.frequency', 'exponentialRampToValueAtTime')).toEqual([]);
    const high = playLine([{ freq: 440, beats: 1 }], { filter: { cutoff: 30000, envAmount: 1 } });
    expect(args(high, 'filter#1.frequency', 'setValueAtTime')).toEqual([[22050, T0]]);
  });

  it('opens up from below when the sweep is negative, over 0.1 s by default', () => {
    const log = playLine([{ freq: 440, beats: 1 }], { filter: { cutoff: 2000, envAmount: -1 } });
    expect(args(log, 'filter#1.frequency', 'setValueAtTime')).toEqual([[1000, T0]]);
    const [[to, at]] = args(log, 'filter#1.frequency', 'exponentialRampToValueAtTime');
    expect(to).toBe(2000);
    expect(at).toBeCloseTo(T0 + 0.1, 9);
  });

  it('leaves drums alone', () => {
    const log = playLine([{ freq: REST, beats: 1, drum: 'kick' }], { filter: { cutoff: 500 } });
    expect(log.some(l => l.startsWith('create filter'))).toBe(false);
  });
});

/**
 * Plays `options` for `seconds` on a recording context at `rate` and hands
 * back every periodic wave and buffer the engine made, for the tests that need
 * the numbers inside them rather than the calls around them.
 */
function capture(options: GameAudioOptions, seconds: number, rate = 44100) {
  const ctx = makeRecordingContext(rate);
  const waves: { real: Float32Array; imag: Float32Array }[] = [];
  const buffers: Float32Array[] = [];
  const createWave = ctx.createPeriodicWave as (r: Float32Array, i: Float32Array) => unknown;
  ctx.createPeriodicWave = (real: Float32Array, imag: Float32Array) => {
    waves.push({ real, imag });
    return createWave(real, imag);
  };
  const createBuffer = ctx.createBuffer as (c: number, l: number, r: number) => { getChannelData(c: number): Float32Array };
  ctx.createBuffer = (channels: number, length: number, r: number) => {
    const buffer = createBuffer(channels, length, r);
    buffers.push(buffer.getChannelData(0));
    return buffer;
  };
  vi.stubGlobal('window', {
    AudioContext: class {
      constructor() {
        return ctx;
      }
    }
  });
  const audio = createGameAudio(options);
  audio.start();
  for (let i = 1; i <= Math.round(seconds / 0.025); i++) {
    ctx.currentTime = i * 0.025;
    vi.advanceTimersByTime(25);
  }
  audio.dispose();
  return { log: ctx.log, waves, buffers };
}

/** A square wave's series, which a four-step [1, 1, -1, -1] cycle is exactly: 4 / (n pi) on the odd sine terms. */
function expectSquareSeries(wave: { real: Float32Array; imag: Float32Array }, level = 1): void {
  expect(wave.imag).toHaveLength(65);
  for (let n = 1; n <= 64; n++) {
    expect(wave.real[n]).toBeCloseTo(0, 6);
    expect(wave.imag[n]).toBeCloseTo(n % 2 ? (4 * level) / (n * Math.PI) : 0, 6);
  }
}

describe('wavetables', () => {
  it('builds a stepped cycle from its own series, once per table, for every note and twin', () => {
    const table = { samples: [1, 1, -1, -1] };
    const { log, waves } = capture(
      {
        tempo: 120,
        tracks: [{ wave: 'pulse12', wavetable: table, detune: 6, melody: [{ freq: 440, beats: 0.5 }, { freq: 550, beats: 0.5 }] }]
      },
      2
    );
    // The table wins over the pulse duty, which is never built.
    expect(waves).toHaveLength(1);
    expectSquareSeries(waves[0]);
    const oscs = log.filter(l => /^create osc#/.test(l)).length;
    expect(oscs).toBeGreaterThan(4);
    expect(log.filter(l => l.endsWith('.setPeriodicWave(wave#1)'))).toHaveLength(oscs);
  });

  it('quantises the cycle to 2^bits levels before building it', () => {
    // One bit rounds every level to the nearer of -1 and 1: a square.
    expectSquareSeries(capture({ tracks: [{ wavetable: { samples: [0.9, 0.2, -0.3, -0.8], bits: 1 }, melody: [{ freq: 440, beats: 1 }] }] }, 0.5).waves[0]);
    // Four bits: 0.5 is step round(0.75 * 15) = 11 of 15, which is 11 * 2 / 15 - 1.
    const four = capture({ tracks: [{ wavetable: { samples: [0.5, 0.5, -0.5, -0.5], bits: 4 }, melody: [{ freq: 440, beats: 1 }] }] }, 0.5);
    expectSquareSeries(four.waves[0], (11 * 2) / 15 - 1);
  });

  it('plays a harmonics table as smooth sine partials, or draws it into 32 steps when it is quantised', () => {
    const smooth = capture({ tracks: [{ wavetable: { harmonics: [1, 0, 0.5] }, melody: [{ freq: 440, beats: 1 }] }] }, 0.5).waves[0];
    expect(Array.from(smooth.imag)).toEqual([0, 1, 0, 0.5]);
    expect(Array.from(smooth.real)).toEqual([0, 0, 0, 0]);
    const stepped = capture({ tracks: [{ wavetable: { harmonics: [1], bits: 4 }, melody: [{ freq: 440, beats: 1 }] }] }, 0.5).waves[0];
    // A 32-step sine: the fundamental, then images either side of 32 and 64.
    expect(stepped.imag).toHaveLength(65);
    expect(Math.abs(stepped.imag[1])).toBeGreaterThan(0.9);
    expect(Math.abs(stepped.imag[31]) + Math.abs(stepped.real[31])).toBeGreaterThan(0.01);
    expect(Math.abs(stepped.imag[2]) + Math.abs(stepped.real[2])).toBeLessThan(0.01);
  });
});

describe('noise', () => {
  it('builds the short mode as a 93-step cycle with no DC, at the level of white noise', () => {
    const { buffers } = capture({ tracks: [{ noise: 'short', melody: [{ freq: REST, beats: 1, drum: 'hat' }] }] }, 0.5);
    expect(buffers).toHaveLength(1);
    const [data] = buffers;
    for (let i = 0; i < 1000; i++) expect(data[i + 93]).toBe(data[i]);
    expect(new Set(data.slice(0, 93)).size).toBe(2);
    const cycle = Array.from(data.slice(0, 93));
    const mean = cycle.reduce((a, b) => a + b, 0) / 93;
    const rms = Math.sqrt(cycle.reduce((a, b) => a + b * b, 0) / 93);
    expect(mean).toBeCloseTo(0, 6);
    expect(rms).toBeCloseTo(1 / Math.sqrt(3), 6);
  });

  it('steps the short mode at the same rate whatever the sample rate of the context', () => {
    const { buffers } = capture({ tracks: [{ noise: 'short', melody: [{ freq: REST, beats: 1, drum: 'hat' }] }] }, 0.5, 88200);
    const [data] = buffers;
    // Each step lasts two samples at twice the rate, so the cycle is 186 long.
    for (let i = 0; i < 1000; i += 2) expect(data[i + 1]).toBe(data[i]);
    for (let i = 0; i < 1000; i++) expect(data[i + 186]).toBe(data[i]);
    expect(data.slice(0, 186).some((v, i) => v !== data[i + 93])).toBe(true);
  });

  it('gives each voice its own noise for its snare and hat, white unless it asks', () => {
    const { log, buffers } = capture(
      {
        tempo: 60,
        tracks: [
          { noise: 'short', melody: [{ freq: REST, beats: 1, drum: 'snare' }] },
          { melody: [{ freq: REST, beats: 1, drum: 'hat' }] }
        ]
      },
      0.5
    );
    expect(buffers).toHaveLength(2);
    // The short buffer repeats every 93 samples and the white one does not.
    const short = buffers.find(b => b[500] === b[593] && b[501] === b[594]);
    expect(short).toBeDefined();
    expect(buffers.filter(b => b !== short)).toHaveLength(1);
    expect(log.filter(l => /^source#\d+\.buffer = /.test(l)).sort()).toEqual(['source#1.buffer = buffer#1', 'source#2.buffer = buffer#2']);
  });

  it('plays a noise note for its whole length through a low-pass at its pitch, looping the buffer', () => {
    const log = playLine([{ freq: 440, beats: 1 }], { wave: 'noise', octaveShift: 1, envelope: 'pad', detune: 6, vibrato: 8 });
    expect(log.some(l => l.startsWith('create osc'))).toBe(false);
    expect(log).toContain('source#1.buffer = buffer#1');
    expect(log).toContain('source#1.loop = true');
    expect(log).toContain('filter#1.type = lowpass');
    expect(args(log, 'filter#1.frequency', 'setValueAtTime')).toEqual([[880, T0]]);
    expect(log).toContain('source#1.connect(filter#1)');
    expect(log).toContain('filter#1.connect(gain#3)');
    expect(args(log, 'source#1', 'start')).toEqual([[T0]]);
    const [[stop]] = args(log, 'source#1', 'stop');
    expect(stop).toBeCloseTo(T0 + 1.02, 9);
  });

  it('plays a noise note from the short mode when the voice asks for it', () => {
    const { buffers } = capture({ tracks: [{ wave: 'noise', noise: 'short', melody: [{ freq: 1000, beats: 1 }] }] }, 0.5);
    expect(buffers).toHaveLength(1);
    for (let i = 0; i < 1000; i++) expect(buffers[0][i + 93]).toBe(buffers[0][i]);
  });

  it('slides the cutoff of a noise note, and runs it through the voice filter', () => {
    const log = playLine([{ freq: 2000, beats: 1, slideFrom: 500 }], { wave: 'noise', filter: { type: 'highpass', cutoff: 300 } });
    expect(args(log, 'filter#2.frequency', 'setValueAtTime')).toEqual([[500, T0]]);
    const [[to, at]] = args(log, 'filter#2.frequency', 'exponentialRampToValueAtTime');
    expect(to).toBe(2000);
    expect(at).toBeCloseTo(T0 + 0.06, 9);
    // Source, then its cutoff, then the voice's filter, then the envelope.
    expect(log).toContain('source#1.connect(filter#2)');
    expect(log).toContain('filter#2.connect(filter#1)');
    expect(log).toContain('filter#1.connect(gain#3)');
  });
});

describe('fm', () => {
  // With no vibrato the modulator is osc#1 and its swing gain#4, after the
  // master, the bus and the note's envelope; the carrier and its twin follow.
  it('swings the carrier and its twin from one modulator at the ratio, the index falling over indexDecay', () => {
    const log = playLine([{ freq: 440, beats: 1 }], { detune: 6, fm: { ratio: 2, index: 3, indexDecay: 0.3 } });
    expect(log).toContain('osc#1.type = sine');
    expect(args(log, 'osc#1.frequency', 'setValueAtTime')).toEqual([[880, T0]]);
    expect(args(log, 'gain#4.gain', 'setValueAtTime')).toEqual([[1320, T0]]);
    const [[target, at, constant]] = args(log, 'gain#4.gain', 'setTargetAtTime');
    expect([target, at]).toEqual([0, T0]);
    expect(constant).toBeCloseTo(0.1, 9);
    expect(log).toContain('osc#1.connect(gain#4)');
    expect(log).toContain('gain#4.connect(osc#2.frequency)');
    expect(log).toContain('gain#4.connect(osc#3.frequency)');
    // The modulator never reaches the output on its own.
    expect(log.filter(l => l.startsWith('osc#1.connect('))).toEqual(['osc#1.connect(gain#4)']);
    const [[stop]] = args(log, 'osc#1', 'stop');
    expect(stop).toBeCloseTo(T0 + 0.92, 9);
  });

  it('holds the index when there is no indexDecay', () => {
    const log = playLine([{ freq: 440, beats: 1 }], { fm: { ratio: 1, index: 2 } });
    expect(args(log, 'gain#4.gain', 'setValueAtTime')).toEqual([[880, T0]]);
    expect(args(log, 'gain#4.gain', 'setTargetAtTime')).toEqual([]);
  });

  it('keeps the modulator at its ratio through a slide and under the vibrato', () => {
    const log = playLine([{ freq: 440, beats: 1, slideFrom: 330 }], { vibrato: 8, fm: { ratio: 2, index: 1 } });
    // The vibrato LFO is osc#1 and its depth gain#4, so the modulator is osc#2.
    expect(args(log, 'osc#2.frequency', 'setValueAtTime')).toEqual([[660, T0]]);
    const [[to, at]] = args(log, 'osc#2.frequency', 'exponentialRampToValueAtTime');
    expect(to).toBe(880);
    expect(at).toBeCloseTo(T0 + 0.06, 9);
    expect(log).toContain('gain#4.connect(osc#2.detune)');
  });

  it('leaves drums and noise notes alone', () => {
    const drum = playLine([{ freq: REST, beats: 1, drum: 'hat' }], { fm: { ratio: 2, index: 3 } });
    expect(drum.some(l => l.startsWith('create osc'))).toBe(false);
    const noise = playLine([{ freq: 440, beats: 1 }], { wave: 'noise', fm: { ratio: 2, index: 3 } });
    expect(noise.some(l => l.startsWith('create osc'))).toBe(false);
  });
});

describe('pitch envelope', () => {
  it('starts a note of the voice its semitones away and glides into it over its time', () => {
    const log = playLine([{ freq: 440, beats: 1 }], { octaveShift: 1, pitchEnv: { semitones: 12, time: 0.03 } });
    expect(args(log, 'osc#1.frequency', 'setValueAtTime')).toEqual([[1760, T0]]);
    const [[to, at]] = args(log, 'osc#1.frequency', 'exponentialRampToValueAtTime');
    expect(to).toBe(880);
    expect(at).toBeCloseTo(T0 + 0.03, 9);
  });

  it('lets a note carry its own, and a slideFrom beat both', () => {
    const own = playLine([{ freq: 440, beats: 1, pitchEnv: { semitones: -12, time: 0.2 } }], {
      pitchEnv: { semitones: 12, time: 0.03 }
    });
    expect(args(own, 'osc#1.frequency', 'setValueAtTime')).toEqual([[220, T0]]);
    expect(args(own, 'osc#1.frequency', 'exponentialRampToValueAtTime')[0][1]).toBeCloseTo(T0 + 0.2, 9);
    const scoop = playLine([{ freq: 440, beats: 1, slideFrom: 330, pitchEnv: { semitones: -12, time: 0.2 } }]);
    expect(args(scoop, 'osc#1.frequency', 'setValueAtTime')).toEqual([[330, T0]]);
    expect(args(scoop, 'osc#1.frequency', 'exponentialRampToValueAtTime')[0][1]).toBeCloseTo(T0 + 0.06, 9);
  });

  it('never glides for longer than the note, and does nothing at 0 semitones', () => {
    // A pluck plays 0.9 of its one-second beat.
    const long = playLine([{ freq: 440, beats: 1 }], { pitchEnv: { semitones: 7, time: 5 } });
    expect(args(long, 'osc#1.frequency', 'exponentialRampToValueAtTime')[0][1]).toBeCloseTo(T0 + 0.9, 9);
    const flat = playLine([{ freq: 440, beats: 1 }], { pitchEnv: { semitones: 0, time: 0.1 } });
    expect(args(flat, 'osc#1.frequency', 'exponentialRampToValueAtTime')).toEqual([]);
  });
});

describe('arpeggio', () => {
  /** Every step of one oscillator's frequency as [Hz, seconds after the first note]. */
  const steps = (log: string[], osc: string) =>
    args(log, `${osc}.frequency`, 'setValueAtTime').map(([hz, at]) => [hz, Math.round((at - T0) * 1e6) / 1e6]);

  it('cycles the note and its twin through the chord at the rate, from the first offset, inside the note', () => {
    // A pluck plays 0.9 of its one-second beat, so ten steps a second fit nine.
    const log = playLine([{ freq: 440, beats: 1, arp: [0, 4, 7] }], { detune: 6, arpRate: 10 });
    const third = 440 * Math.pow(2, 4 / 12);
    const fifth = 440 * Math.pow(2, 7 / 12);
    const expected = Array.from({ length: 9 }, (_, i) => [[440, third, fifth][i % 3], i / 10]);
    for (const osc of ['osc#1', 'osc#2']) {
      const got = steps(log, osc);
      expect(got).toHaveLength(9);
      got.forEach(([hz, at], i) => {
        expect(hz).toBeCloseTo(expected[i][0], 9);
        expect(at).toBeCloseTo(expected[i][1], 9);
      });
    }
  });

  it('runs at 50 steps a second unless the voice says otherwise, and drops the slides', () => {
    const log = playLine(
      [{ freq: 440, beats: 0.25, arp: [12, 0], slideFrom: 220, slideNext: true, pitchEnv: { semitones: 5, time: 0.1 } }],
      { pitchEnv: { semitones: 5, time: 0.1 } }
    );
    // A quarter beat at 60 bpm plays for 0.225 s: onset plus steps at 20 ms to 220 ms.
    const got = steps(log, 'osc#1');
    expect(got).toHaveLength(12);
    expect(got[0][0]).toBe(880);
    expect(got[1][0]).toBe(440);
    expect(got[11][1]).toBeCloseTo(0.22, 9);
    expect(args(log, 'osc#1.frequency', 'exponentialRampToValueAtTime')).toEqual([]);
  });

  it('keeps an FM modulator on the chord at its ratio', () => {
    const log = playLine([{ freq: 440, beats: 1, arp: [0, 12] }], { arpRate: 4, fm: { ratio: 2, index: 1 } });
    expect(steps(log, 'osc#1').map(([hz]) => hz)).toEqual([880, 1760, 880, 1760]);
    expect(steps(log, 'osc#2').map(([hz]) => hz)).toEqual([440, 880, 440, 880]);
  });

  it('keeps its rate through a tempo change, fitting as many steps as the new notes hold', () => {
    const line = drive(
      { tempo: 60, tracks: [{ arpRate: 10, melody: [{ freq: 440, beats: 1, arp: [0, 7] }] }] },
      3.6,
      [{ at: 1.5, run: a => a.setTempo(120) }]
    ).split('\n');
    const notes = line.filter(l => /^create osc#/.test(l)).map(l => l.slice(7, -2));
    const per = notes.map(osc => args(line, `${osc}.frequency`, 'setValueAtTime').map(([, at]) => at));
    const gaps = per.flatMap(times => times.slice(1).map((t, i) => t - times[i]));
    for (const gap of gaps) expect(gap).toBeCloseTo(0.1, 9);
    // Nine steps in each 0.9 s note before the change, and fewer after it.
    expect(per[0]).toHaveLength(9);
    const after = per.at(-1) as number[];
    expect(after.length).toBeLessThan(9);
    expect(after.length).toBeGreaterThan(0);
  });

  it('clamps a rate that would flood the scheduler, and ignores one that is not a rate', () => {
    const flood = playLine([{ freq: 440, beats: 0.105, arp: [0, 7] }], { arpRate: 1e9 });
    // At the 1000-step cap a 0.0945 s note holds its onset and 94 steps.
    expect(steps(flood, 'osc#1')).toHaveLength(95);
    const bad = playLine([{ freq: 440, beats: 0.105, arp: [0, 7] }], { arpRate: NaN });
    // At the default 50 a second it holds its onset and 4.
    expect(steps(bad, 'osc#1')).toHaveLength(5);
  });
});

describe('renderScore', () => {
  it('resolves to null where there is no OfflineAudioContext', async () => {
    await expect(renderScore(SNAKE_ROUND13_MUSIC, 1)).resolves.toBeNull();
  });

  it('schedules the same notes the live engine plays over the same window', async () => {
    // Live, from a clock at -50 ms so its first note lands on 0 like the render's.
    const seconds = 4;
    const live = drive(SNAKE_ROUND13_MUSIC, seconds - 0.05, [], -0.05).split('\n');

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
    await expect(renderScore(SNAKE_ROUND13_MUSIC, seconds, 8000)).resolves.toBe(rendered);
    expect(made).toEqual([2, 32000, 8000]);
    expect(ctx.log.slice(0, 2)).toEqual(['create gain#1()', `gain#1.gain.value = ${SNAKE_ROUND13_MUSIC.volume}`]);

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
    await expect(renderScore(SNAKE_ROUND13_MUSIC, 0)).resolves.toBeNull();
    await expect(renderScore(SNAKE_ROUND13_MUSIC, NaN)).resolves.toBeNull();
    await expect(renderScore(SNAKE_ROUND13_MUSIC, Infinity)).resolves.toBeNull();
    await expect(renderScore(SNAKE_ROUND13_MUSIC, 1, 0)).resolves.toBeNull();
    await expect(renderScore(SNAKE_ROUND13_MUSIC, 1, NaN)).resolves.toBeNull();
    await expect(renderScore(SNAKE_ROUND13_MUSIC, 1, Infinity)).resolves.toBeNull();
  });

  it('resolves to null when the browser rejects the rate, rather than throwing', async () => {
    vi.stubGlobal('window', {
      OfflineAudioContext: class {
        constructor() {
          throw new RangeError('unsupported sample rate');
        }
      }
    });
    await expect(renderScore(SNAKE_ROUND13_MUSIC, 1, 1000)).resolves.toBeNull();
  });
});
