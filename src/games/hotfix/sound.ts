/**
 * HOTFIX's effects: the engine under the bonnet, tyres, the knocks and bangs
 * of bad driving, the phone boxes, the sonar job's pings and the weather. The
 * score (`music.ts`) is the car radio and mutes with the music; this is
 * everything else, synthesised from the engine's seeded noise and a few
 * oscillators and played through `GameAudio.effectsBus`, so it follows the
 * effects toggle live, as PRIME TIME's `sound.ts` does.
 *
 * Three sounds are continuous (the engine note, the sirens, the rain) and are
 * held as running nodes whose levels `drive()` sets each frame; everything
 * else is a one-shot. Variation comes from this module's own seeded stream,
 * never the run's, so a seeded shift plays out the same with the sound off.
 */
import { noiseBuffer, seededRng, type EffectsBus, type GameAudio } from '../engine';

export type SoundName =
  | 'crash'
  | 'bump'
  | 'squash'
  | 'door'
  | 'horn'
  | 'ring'
  | 'ping'
  | 'cash'
  | 'checkpoint'
  | 'yelp'
  | 'explode'
  | 'wash'
  | 'tick'
  | 'whistle';

export interface Continuous {
  /** Road speed as a share of the car's top speed, or null on foot. */
  engine: number | null;
  /** Sideways slip, 0-1. */
  skid: number;
  /** How close the nearest chasing police car is, 0 none to 1 on the bumper. */
  siren: number;
  rain: number;
}

export interface CitySound {
  /** `level` scales the sound, for distance; `pitch` is the ping's place on the signal, 0-1. */
  play(name: SoundName, level?: number, pitch?: number): void;
  drive(state: Continuous): void;
  /** Silences the continuous sounds: for a pause, and for the end of the shift. */
  quiet(): void;
}

const MIN_GAP: Partial<Record<SoundName, number>> = { horn: 0.38, crash: 0.08, bump: 0.08, squash: 0.05, yelp: 0.25, tick: 0.2, cash: 0.08 };

function thump(bus: EffectsBus, at: number, wave: OscillatorType, from: number, to: number, decay: number, peak: number): void {
  const { ctx, out } = bus;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = wave;
  osc.frequency.setValueAtTime(from, at);
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), at + decay);
  gain.gain.setValueAtTime(peak, at);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + decay + 0.02);
  osc.connect(gain);
  gain.connect(out);
  osc.start(at);
  osc.stop(at + decay + 0.05);
}

function burst(bus: EffectsBus, at: number, type: BiquadFilterType, hz: number, decay: number, peak: number, q = 1): void {
  const { ctx, out } = bus;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.setValueAtTime(hz, at);
  filter.Q.setValueAtTime(q, at);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(peak, at);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + decay);
  src.connect(filter);
  filter.connect(gain);
  gain.connect(out);
  src.start(at);
  src.stop(at + decay + 0.02);
}

function tone(bus: EffectsBus, at: number, wave: OscillatorType, hz: number, length: number, peak: number): void {
  const { ctx, out } = bus;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = wave;
  osc.frequency.setValueAtTime(hz, at);
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(peak, at + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
  osc.connect(gain);
  gain.connect(out);
  osc.start(at);
  osc.stop(at + length + 0.02);
}

interface Running {
  ctx: BaseAudioContext;
  engine: OscillatorNode;
  engineFilter: BiquadFilterNode;
  engineGain: GainNode;
  skidGain: GainNode;
  siren: OscillatorNode;
  sirenGain: GainNode;
  rainGain: GainNode;
}

export function createCitySound(audio: GameAudio, seed = 0x407f1): CitySound {
  const rng = seededRng(seed);
  const last: Partial<Record<SoundName, number>> = {};
  const vary = (spread: number) => 1 + (rng() * 2 - 1) * spread;
  let running: Running | null = null;

  /** Builds the continuous voices on first use, on whatever context the bus is on. */
  function ensure(bus: EffectsBus): Running {
    if (running && running.ctx === bus.ctx) return running;
    const { ctx, out } = bus;
    const engine = ctx.createOscillator();
    engine.type = 'sawtooth';
    engine.frequency.value = 50;
    const engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 300;
    const engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    engine.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(out);
    engine.start();

    const loop = (type: BiquadFilterType, hz: number, q: number): GainNode => {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer(ctx);
      src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = type;
      filter.frequency.value = hz;
      filter.Q.value = q;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(filter);
      filter.connect(gain);
      gain.connect(out);
      src.start();
      return gain;
    };
    const skidGain = loop('bandpass', 1900, 5);
    const rainGain = loop('highpass', 3200, 0.5);

    const siren = ctx.createOscillator();
    siren.type = 'square';
    siren.frequency.value = 700;
    const sirenFilter = ctx.createBiquadFilter();
    sirenFilter.type = 'lowpass';
    sirenFilter.frequency.value = 1800;
    const sirenGain = ctx.createGain();
    sirenGain.gain.value = 0;
    siren.connect(sirenFilter);
    sirenFilter.connect(sirenGain);
    sirenGain.connect(out);
    siren.start();

    running = { ctx, engine, engineFilter, engineGain, skidGain, siren, sirenGain, rainGain };
    return running;
  }

  return {
    play(name, level = 1, pitch = 0) {
      const bus = audio.effectsBus();
      if (!bus || level <= 0.02) return;
      const now = bus.ctx.currentTime;
      const gap = MIN_GAP[name] ?? 0.02;
      if (last[name] !== undefined && now - (last[name] as number) < gap) return;
      last[name] = now;
      const L = bus.level * level;
      switch (name) {
        case 'crash':
          burst(bus, now, 'lowpass', 1500 * vary(0.2), 0.3, L * 1);
          thump(bus, now, 'triangle', 150 * vary(0.1), 45, 0.22, L * 0.8);
          burst(bus, now + 0.03, 'highpass', 4200, 0.16, L * 0.35);
          break;
        case 'bump':
          thump(bus, now, 'triangle', 170 * vary(0.15), 70, 0.1, L * 0.6);
          burst(bus, now, 'lowpass', 900, 0.08, L * 0.4);
          break;
        case 'squash':
          thump(bus, now, 'square', 420 * vary(0.2), 90, 0.09, L * 0.4);
          burst(bus, now, 'bandpass', 1300 * vary(0.2), 0.07, L * 0.5, 2);
          break;
        case 'door':
          thump(bus, now, 'triangle', 210, 80, 0.07, L * 0.55);
          burst(bus, now + 0.02, 'lowpass', 600, 0.05, L * 0.3);
          break;
        case 'horn':
          tone(bus, now, 'square', 392, 0.34, L * 0.3);
          tone(bus, now, 'square', 494, 0.34, L * 0.3);
          break;
        case 'ring':
          // A phone box: the double ring, two bells a third apart.
          for (const at of [0, 0.3]) {
            for (let k = 0; k < 4; k++) {
              tone(bus, now + at + k * 0.045, 'sine', 1320, 0.05, L * 0.45);
              tone(bus, now + at + k * 0.045 + 0.02, 'sine', 1660, 0.05, L * 0.45);
            }
          }
          break;
        case 'ping':
          // The sonar job: the nearer the kit, the higher the ping.
          tone(bus, now, 'sine', 420 * Math.pow(2, pitch * 2), 0.32, L * 0.6);
          tone(bus, now + 0.04, 'sine', 840 * Math.pow(2, pitch * 2), 0.2, L * 0.2);
          break;
        case 'cash':
          tone(bus, now, 'triangle', 1568, 0.14, L * 0.55);
          tone(bus, now + 0.08, 'triangle', 2093, 0.24, L * 0.55);
          break;
        case 'checkpoint':
          tone(bus, now, 'square', 988, 0.08, L * 0.35);
          tone(bus, now + 0.07, 'square', 1319, 0.14, L * 0.35);
          break;
        case 'yelp':
          thump(bus, now, 'sawtooth', 500 * vary(0.2), 900 * vary(0.2), 0.12, L * 0.22);
          break;
        case 'explode':
          burst(bus, now, 'lowpass', 420, 0.9, L * 1.2);
          thump(bus, now, 'sine', 95, 30, 0.7, L * 1);
          burst(bus, now + 0.05, 'highpass', 2400, 0.45, L * 0.4);
          break;
        case 'wash':
          burst(bus, now, 'bandpass', 2600, 0.9, L * 0.5, 0.7);
          thump(bus, now + 0.1, 'sine', 300, 1200, 0.5, L * 0.25);
          break;
        case 'tick':
          tone(bus, now, 'square', 1100, 0.05, L * 0.3);
          break;
        case 'whistle':
          tone(bus, now, 'sine', 2300, 0.2, L * 0.5);
          tone(bus, now + 0.24, 'sine', 2300, 0.45, L * 0.5);
          break;
      }
    },
    drive(state) {
      const bus = audio.effectsBus();
      if (!bus) return;
      const r = ensure(bus);
      const now = bus.ctx.currentTime;
      const L = bus.level;
      const set = (param: AudioParam, value: number) => param.setTargetAtTime(value, now, 0.05);
      if (state.engine === null) set(r.engineGain.gain, 0);
      else {
        const rev = Math.min(1.2, Math.abs(state.engine));
        set(r.engine.frequency, 46 + rev * 96);
        set(r.engineFilter.frequency, 260 + rev * 700);
        set(r.engineGain.gain, L * (0.16 + rev * 0.14));
      }
      set(r.skidGain.gain, state.engine === null ? 0 : L * Math.min(0.4, state.skid * 0.5));
      // Two tones, a second apart: nee, naw.
      set(r.siren.frequency, Math.floor(now * 1.6) % 2 ? 650 : 870);
      set(r.sirenGain.gain, L * 0.16 * state.siren);
      set(r.rainGain.gain, L * 0.13 * state.rain);
    },
    quiet() {
      if (!running) return;
      const now = running.ctx.currentTime;
      for (const gain of [running.engineGain, running.skidGain, running.sirenGain, running.rainGain]) {
        gain.gain.setTargetAtTime(0, now, 0.04);
      }
    }
  };
}
