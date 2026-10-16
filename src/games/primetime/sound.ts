/**
 * PRIME TIME's effects: the guns, the crowd of grunts going down, the prizes
 * ringing up, the contestant's death and return. The score (`music.ts`) is
 * music and mutes with the music; this is everything else, synthesised here
 * from the engine's seeded noise and a few oscillators and played through
 * `GameAudio.effectsBus`, so it follows the effects toggle and never the
 * music's, as CALCIO '90's `sound.ts` does for the stand.
 *
 * A machine gun fires nine times a second, and the same click nine times a
 * second reads as a buzzer, so every sound is nudged in pitch and level from
 * this module's own seeded stream. It never draws from the run's `rng`, so a
 * seeded run plays out the same with the sound on or off.
 */
import { noiseBuffer, seededRng, type EffectsBus, type GameAudio } from '../engine';
import type { WeaponId } from './weapons';

export type SoundName =
  | WeaponId
  | 'flak'
  | 'kill'
  | 'bigKill'
  | 'blast'
  | 'pickup'
  | 'prize'
  | 'death'
  | 'respawn'
  | 'doors'
  | 'bossHit'
  | 'bomb';

export interface ArenaSound {
  play(name: SoundName): void;
}

/** Shortest gap between two plays of one sound, so a frame's many kills are one pop, not a chord. */
const MIN_GAP: Partial<Record<SoundName, number>> = { kill: 0.04, bigKill: 0.08, flak: 0.06, bossHit: 0.05, pickup: 0.1 };

/** A pitched thump: an oscillator whose pitch falls from `from` to `to` over `decay`. */
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

/** A burst of filtered noise. */
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

/** A short held tone with a quick fade, for chimes. */
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

export function createArenaSound(audio: GameAudio, seed = 0x5a75): ArenaSound {
  const rng = seededRng(seed);
  const last: Partial<Record<SoundName, number>> = {};
  /** A nudge of ±`spread` around 1. */
  const vary = (spread: number) => 1 + (rng() * 2 - 1) * spread;

  return {
    play(name) {
      const bus = audio.effectsBus();
      if (!bus) return;
      const now = bus.ctx.currentTime;
      const gap = MIN_GAP[name] ?? 0.02;
      if (last[name] !== undefined && now - (last[name] as number) < gap) return;
      last[name] = now;
      const L = bus.level;
      switch (name) {
        case 'machine':
          thump(bus, now, 'square', 880 * vary(0.08), 320, 0.05, L * 0.45);
          burst(bus, now, 'highpass', 3000, 0.04, L * 0.35);
          break;
        case 'spread':
          thump(bus, now, 'square', 620 * vary(0.08), 240, 0.07, L * 0.5);
          burst(bus, now, 'bandpass', 2200, 0.05, L * 0.4, 0.8);
          break;
        case 'grenade':
          thump(bus, now, 'triangle', 260 * vary(0.05), 90, 0.12, L * 0.7);
          burst(bus, now, 'lowpass', 900, 0.08, L * 0.4);
          break;
        case 'rocket':
          burst(bus, now, 'bandpass', 1200 * vary(0.1), 0.18, L * 0.55, 0.7);
          thump(bus, now, 'sawtooth', 200, 420, 0.15, L * 0.3);
          break;
        case 'flak':
          thump(bus, now, 'sawtooth', 300 * vary(0.1), 140, 0.08, L * 0.35);
          break;
        case 'kill':
          burst(bus, now, 'bandpass', 700 * vary(0.25), 0.09, L * 0.6, 1.2);
          thump(bus, now, 'triangle', 180 * vary(0.15), 60, 0.08, L * 0.4);
          break;
        case 'bigKill':
          burst(bus, now, 'lowpass', 1400, 0.25, L * 0.8);
          thump(bus, now, 'triangle', 140, 40, 0.22, L * 0.7);
          break;
        case 'blast':
          burst(bus, now, 'lowpass', 500, 0.42, L * 1.1);
          thump(bus, now, 'sine', 110, 35, 0.35, L * 0.9);
          break;
        case 'bossHit':
          thump(bus, now, 'square', 240 * vary(0.1), 120, 0.05, L * 0.3);
          burst(bus, now, 'highpass', 2500, 0.03, L * 0.25);
          break;
        case 'pickup':
          tone(bus, now, 'square', 880, 0.08, L * 0.5);
          tone(bus, now + 0.07, 'square', 1320, 0.12, L * 0.5);
          break;
        case 'prize':
          // The cash register: two bright dings.
          tone(bus, now, 'triangle', 1760, 0.18, L * 0.7);
          tone(bus, now + 0.09, 'triangle', 2217, 0.26, L * 0.7);
          burst(bus, now, 'highpass', 5000, 0.05, L * 0.3);
          break;
        case 'death':
          thump(bus, now, 'sawtooth', 520, 60, 0.55, L * 0.9);
          burst(bus, now, 'lowpass', 1200, 0.35, L * 0.8);
          break;
        case 'respawn':
          thump(bus, now, 'sine', 180, 900, 0.3, L * 0.6);
          burst(bus, now, 'highpass', 1500, 0.3, L * 0.3);
          break;
        case 'doors':
          burst(bus, now, 'bandpass', 600, 0.35, L * 0.5, 0.6);
          tone(bus, now + 0.05, 'square', 660, 0.1, L * 0.35);
          tone(bus, now + 0.15, 'square', 990, 0.14, L * 0.35);
          break;
        case 'bomb':
          burst(bus, now, 'lowpass', 300, 0.9, L * 1.2);
          thump(bus, now, 'sine', 90, 30, 0.8, L * 1);
          burst(bus, now + 0.05, 'highpass', 2000, 0.5, L * 0.4);
          break;
      }
    }
  };
}
