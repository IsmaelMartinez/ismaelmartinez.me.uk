/**
 * STREET CHAMPION's effects: the swings, the hits, the blocks, the fireballs,
 * the bodies hitting the floor and the bonus stage's car coming apart. The
 * score (`music.ts`) is music and mutes with the music; this is everything
 * else, synthesised here from the engine's seeded noise and a few oscillators
 * and played through `GameAudio.effectsBus`, so it follows the effects toggle
 * and never the music's, as PRIME TIME's `sound.ts` does.
 *
 * The hits are the heart of the game. The CPS-1 played them as OKI ADPCM
 * samples pitched well down: a fat, low, crunchy whack. Here each is a
 * low-passed noise burst (the crunch) over a falling sine thump (the body),
 * and a heavier hit is lower, longer and louder in both. A block is a short
 * bright clack instead, a swing a band-passed whoosh, and a fireball a rising
 * airy swirl.
 *
 * A flurry of light punches lands several times a second, and the same thud
 * each time reads as a machine, so every sound is nudged in pitch and level
 * from this module's own seeded stream. It never draws from the fight's rng,
 * so a seeded match plays out the same with the sound on or off.
 */
import { noiseBuffer, seededRng, type EffectsBus, type GameAudio } from '../engine';

export type FightSoundName =
  | 'swingLight'
  | 'swingHeavy'
  | 'hitLight'
  | 'hitMedium'
  | 'hitHeavy'
  | 'block'
  | 'projectile'
  | 'projectileHit'
  | 'projectileClash'
  | 'throw'
  | 'land'
  | 'knockdown'
  | 'ko'
  | 'dizzy'
  | 'electric'
  | 'flame'
  | 'crash'
  | 'shatter'
  | 'clank'
  | 'cursor'
  | 'confirm'
  | 'tick';

export interface FightSound {
  play(name: FightSoundName): void;
}

/** Shortest gap between two plays of one sound, so a frame's double report is one sound, not a chord. */
const MIN_GAP: Partial<Record<FightSoundName, number>> = {
  swingLight: 0.05,
  swingHeavy: 0.08,
  hitLight: 0.04,
  hitMedium: 0.05,
  hitHeavy: 0.06,
  block: 0.04,
  electric: 0.12,
  flame: 0.12,
  dizzy: 0.5,
  ko: 0.5,
  crash: 0.06,
  shatter: 0.1,
  clank: 0.06,
  cursor: 0.03
};

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

/**
 * A noise burst whose filter sweeps from `from` to `to` Hz over its length: a
 * whoosh when it falls, an airy swirl when it rises. Rises in level over
 * `attack` rather than starting at its peak, so it moves air instead of hitting.
 */
function sweep(
  bus: EffectsBus,
  at: number,
  type: BiquadFilterType,
  from: number,
  to: number,
  length: number,
  peak: number,
  q = 1,
  attack = 0.02
): void {
  const { ctx, out } = bus;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.setValueAtTime(from, at);
  filter.frequency.exponentialRampToValueAtTime(Math.max(20, to), at + length);
  filter.Q.setValueAtTime(q, at);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(peak, at + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
  src.connect(filter);
  filter.connect(gain);
  gain.connect(out);
  src.start(at);
  src.stop(at + length + 0.02);
}

/** A short held tone with a quick fade, for chimes and the menu. */
function tone(bus: EffectsBus, at: number, wave: OscillatorType, hz: number, length: number, peak: number): void {
  const { ctx, out } = bus;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = wave;
  osc.frequency.setValueAtTime(hz, at);
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(peak, at + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
  osc.connect(gain);
  gain.connect(out);
  osc.start(at);
  osc.stop(at + length + 0.02);
}

export function createFightSound(audio: GameAudio, seed = 0x5f2c): FightSound {
  const rng = seededRng(seed);
  const last: Partial<Record<FightSoundName, number>> = {};
  /** A nudge of ±`spread` around 1. */
  const vary = (spread: number) => 1 + (rng() * 2 - 1) * spread;

  /**
   * One hit, the CPS-1's pitched-down sample: a low-passed noise crunch over a
   * falling sine body, and a square click on the very front for the contact.
   * `weight` 0 is a jab, 1 a fierce: lower, longer and louder as it rises.
   */
  const whack = (bus: EffectsBus, at: number, weight: number) => {
    const L = bus.level;
    const pitch = vary(0.08);
    // The crunch: the noise low-passed lower and held longer as the hit gets heavier.
    burst(bus, at, 'lowpass', (2400 - weight * 1400) * pitch, 0.07 + weight * 0.12, L * (0.6 + weight * 0.35), 1.4);
    // The body: a sine thump falling into the floor of the range.
    thump(bus, at, 'sine', (190 - weight * 90) * pitch, 45 - weight * 15, 0.09 + weight * 0.16, L * (0.6 + weight * 0.4));
    // The contact: a very short square click, which is what makes it read as a smack rather than a thud.
    thump(bus, at, 'square', (520 - weight * 220) * pitch, 160, 0.025, L * 0.25);
  };

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
        case 'swingLight':
          sweep(bus, now, 'bandpass', 2600 * vary(0.1), 1200, 0.1, L * 0.3, 1.2, 0.02);
          break;
        case 'swingHeavy':
          sweep(bus, now, 'bandpass', 1500 * vary(0.1), 450, 0.2, L * 0.42, 1, 0.04);
          break;
        case 'hitLight':
          whack(bus, now, 0);
          break;
        case 'hitMedium':
          whack(bus, now, 0.5);
          break;
        case 'hitHeavy':
          whack(bus, now, 1);
          // A second, lower crunch just after: the fierce's weight landing.
          burst(bus, now + 0.03, 'lowpass', 500 * vary(0.1), 0.18, L * 0.5);
          break;
        case 'block':
          // A short bright clack: a high band of noise and a hard square tick.
          burst(bus, now, 'bandpass', 3200 * vary(0.08), 0.05, L * 0.55, 3);
          thump(bus, now, 'square', 1300 * vary(0.06), 700, 0.03, L * 0.35);
          break;
        case 'projectile':
          // The rising airy swirl, with a sine rising underneath it for the charge.
          sweep(bus, now, 'bandpass', 500 * vary(0.08), 2600, 0.4, L * 0.45, 2, 0.06);
          thump(bus, now, 'sine', 220 * vary(0.05), 660, 0.3, L * 0.3);
          break;
        case 'projectileHit':
          whack(bus, now, 0.7);
          sweep(bus, now, 'highpass', 4000, 1200, 0.25, L * 0.35, 0.8, 0.005);
          break;
        case 'projectileClash':
          // Two fireballs cancelling: a burst of air and a hollow pop.
          burst(bus, now, 'bandpass', 1400 * vary(0.08), 0.3, L * 0.6, 0.7);
          thump(bus, now, 'triangle', 600, 120, 0.15, L * 0.4);
          break;
        case 'throw':
          // A grab's cloth and a heave: a short low whoosh with a grunt of a thump.
          sweep(bus, now, 'lowpass', 1800, 300, 0.22, L * 0.4, 1, 0.03);
          thump(bus, now, 'triangle', 160 * vary(0.08), 90, 0.12, L * 0.4);
          break;
        case 'land':
          // Feet on the stage after a jump: a soft low tap.
          thump(bus, now, 'sine', 110 * vary(0.1), 55, 0.06, L * 0.4);
          burst(bus, now, 'lowpass', 600, 0.04, L * 0.2);
          break;
        case 'knockdown':
          // A body hitting the floor: a big low thud, then a smaller bounce.
          thump(bus, now, 'sine', 120 * vary(0.06), 35, 0.3, L * 0.9);
          burst(bus, now, 'lowpass', 700, 0.22, L * 0.7, 1.2);
          thump(bus, now + 0.16, 'sine', 90, 35, 0.15, L * 0.45);
          break;
        case 'ko':
          // The big slam: the heaviest whack, a long low boom and a tail that hangs in the hall.
          whack(bus, now, 1);
          thump(bus, now, 'sine', 90, 25, 0.9, L * 1);
          burst(bus, now, 'lowpass', 900, 0.7, L * 0.8, 0.8);
          burst(bus, now + 0.12, 'bandpass', 600, 0.6, L * 0.3, 0.6);
          burst(bus, now + 0.26, 'bandpass', 500, 0.5, L * 0.18, 0.6);
          break;
        case 'dizzy':
          // The birds circling: three little chirps up and down.
          tone(bus, now, 'triangle', 1760, 0.08, L * 0.35);
          tone(bus, now + 0.1, 'triangle', 2093, 0.08, L * 0.35);
          tone(bus, now + 0.2, 'triangle', 1568, 0.1, L * 0.35);
          break;
        case 'electric':
          // The beast's shock: a buzzing sawtooth and a crackle of high noise.
          thump(bus, now, 'sawtooth', 70 * vary(0.05), 60, 0.35, L * 0.4);
          thump(bus, now, 'square', 1400 * vary(0.1), 900, 0.3, L * 0.15);
          burst(bus, now, 'highpass', 4500, 0.35, L * 0.35, 0.7);
          break;
        case 'flame':
          // The yogi's fire: a roaring band of noise swelling and falling.
          sweep(bus, now, 'lowpass', 900 * vary(0.08), 2400, 0.45, L * 0.55, 0.8, 0.08);
          thump(bus, now, 'sawtooth', 90, 55, 0.4, L * 0.2);
          break;
        case 'crash':
          // The car's body denting: a metallic band of noise over a hollow thump.
          burst(bus, now, 'bandpass', 900 * vary(0.12), 0.25, L * 0.7, 4);
          thump(bus, now, 'triangle', 260 * vary(0.1), 90, 0.2, L * 0.6);
          thump(bus, now, 'square', 180 * vary(0.08), 140, 0.12, L * 0.2);
          break;
        case 'shatter':
          // Glass breaking: a bright high crash and tinkling shards after it.
          burst(bus, now, 'highpass', 3000, 0.35, L * 0.7);
          tone(bus, now + 0.05, 'triangle', 3520 * vary(0.08), 0.1, L * 0.25);
          tone(bus, now + 0.12, 'triangle', 4186 * vary(0.08), 0.1, L * 0.2);
          tone(bus, now + 0.2, 'triangle', 2960 * vary(0.08), 0.12, L * 0.18);
          break;
        case 'clank':
          // The oil drum: a ringing low metal bong.
          tone(bus, now, 'triangle', 220 * vary(0.06), 0.4, L * 0.55);
          tone(bus, now, 'square', 587 * vary(0.06), 0.18, L * 0.18);
          burst(bus, now, 'bandpass', 1800, 0.08, L * 0.35, 5);
          break;
        case 'cursor':
          tone(bus, now, 'square', 1046, 0.05, L * 0.3);
          break;
        case 'confirm':
          tone(bus, now, 'square', 784, 0.07, L * 0.35);
          tone(bus, now + 0.06, 'square', 1568, 0.14, L * 0.35);
          break;
        case 'tick':
          tone(bus, now, 'square', 1760, 0.04, L * 0.3);
          break;
      }
    }
  };
}
