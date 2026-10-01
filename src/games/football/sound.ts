/**
 * CALCIO '90's match sound: the stand and the ball, on the effects channel.
 *
 * The score (`music.ts`) is music and mutes with the music. What a match sounds
 * like underneath it is not: the murmur of a stand, its roar at a goal, its
 * "ooh" at a chance that went begging, the thud of a pass, the crack of a shot,
 * the referee's whistle. All of it is synthesised here from the engine's seeded
 * noise and a few oscillators, the way a Mega Drive cartridge made its crowd
 * and its kicks from the SN76489's noise channel and a short FM thump, and all
 * of it goes through `GameAudio.effectsBus`, so it follows the effects toggle
 * (live, for the crowd bed that is already sounding) and never the music's.
 *
 * Levels are set against the bus's `level`, the reference the engine scales
 * its own effects to over the music. Rendered offline against the match theme
 * with its drums in (RMS -31.7 dBFS, peak -20), the bed is -46 RMS at a
 * murmur, -44 in open play and -36 with a shot on, so it never masks the tune;
 * a goal's roar reaches the tune's level (-31.5 over its first second) while
 * the goal stinger ducks the music anyway; the "ooh" and the groan sit near
 * -37; and the strikes peak between -28 (a throw) and -18 (a shot), about
 * where the engine's own effects do.
 *
 * Variety. Strikes are frequent (both sides pass several times a second at
 * times), and the same thud at the same pitch reads as a machine gun, so each
 * sound is nudged in pitch, brightness and level from this module's own seeded
 * stream. It never draws from `Math.random` or a match's `rng`: a seeded match
 * or demo plays out the same with the sound on or off.
 */
import { clamp, noiseBuffer, seededRng, type EffectsBus, type GameAudio } from '../engine';
import type { MatchState, StrikeKind } from './match';
import { BOX_DEPTH, BOX_HALF, CENTRE_X, PITCH_L } from './pitch';
import { shotArmed } from './render';

/** Every one-shot the match makes: the strikes by kind, the keeper, the woodwork, the referee. */
export type MatchSoundName =
  | StrikeKind
  | 'tackle'
  | 'save'
  | 'catch'
  | 'post'
  | 'whistle'
  | 'whistle-half'
  | 'whistle-full';

export interface Crowd {
  /** Brings the bed up from silence; a no-op while it is already up. */
  start(): void;
  /** Takes the bed and anything the stand is still shouting down over `fade` seconds. */
  stop(fade?: number): void;
  /** How worked up the stand is, 0 (a stoppage's murmur) to 1 (a shot on). */
  tension(level: number): void;
  /** A goal for: the roar, rising fast and dying away over a few seconds. */
  roar(): void;
  /** A goal against: the stand deflating, low and short. */
  groan(): void;
  /** A save, the woodwork, a shot just wide: the rising-then-falling "ooh". */
  ooh(): void;
  /** True while the bed is up. */
  readonly on: boolean;
}

export interface MatchSound {
  play(name: MatchSoundName): void;
  crowd: Crowd;
}

/**
 * The stand's tension from the state of play, pure. A stoppage is a murmur
 * (0); open play in midfield is 0.15 and it climbs as the ball nears either
 * goal, so an attack the CPU is making on the player's box lifts it as much as
 * one of the player's own; the ball in a box is 0.75, and a shot armed (the
 * same cue that turns the player's marker red) is 0.9.
 */
export function playTension(m: MatchState): number {
  if (m.phase !== 'play') return 0;
  const toGoal = Math.min(m.ball.y, PITCH_L - m.ball.y);
  if (toGoal <= BOX_DEPTH && Math.abs(m.ball.x - CENTRE_X) <= BOX_HALF) {
    return shotArmed(m) ? 0.9 : 0.75;
  }
  const near = clamp(1 - (toGoal - BOX_DEPTH) / (PITCH_L / 2 - BOX_DEPTH), 0, 1);
  const t = 0.15 + 0.45 * near * near;
  return shotArmed(m) ? Math.max(t, 0.9) : t;
}

/* ------------------------------------------------------------------ */
/* levels, all relative to the bus's `level`                            */

/** The bed's level at a murmur and at full tension. */
const BED_FLOOR = 0.28;
const BED_TOP = 0.65;
/** Its brightness at the same two ends, as a low-pass in hertz. */
const BED_DARK = 900;
const BED_BRIGHT = 2200;
/** Time constant of a change in tension: a stand rises and settles, it does not switch. */
const BED_GLIDE = 0.45;
/** How long the bed takes to come up from silence. */
const BED_FADE_IN = 1.2;
/** The roar's peak and how long it takes to die. */
const ROAR_PEAK = 1.5;
const ROAR_DECAY = 4.5;
const OOH_PEAK = 4;
const GROAN_PEAK = 3;
/** Ignore a tension change smaller than this, so the loop is not writing automation every frame. */
const TENSION_STEP = 0.02;
/** Shortest gap between two plays of one sound, in seconds: no same-frame doubles. */
const MIN_GAP = 0.05;

/** A pitched thump: the body of a strike, its pitch falling away in 40 ms. */
interface Thump {
  wave: OscillatorType;
  from: number;
  to: number;
  decay: number;
  peak: number;
}

/** A filtered noise burst: the contact of a strike, the slap of a glove. */
interface Burst {
  filter: BiquadFilterType;
  hz: number;
  q?: number;
  decay: number;
  peak: number;
}

const STRIKES: Record<StrikeKind | 'tackle' | 'save' | 'catch', { thump?: Thump; burst: Burst }> = {
  // A ground pass: a soft, low thud with a little leather on it.
  pass: {
    thump: { wave: 'sine', from: 150, to: 70, decay: 0.09, peak: 0.55 },
    burst: { filter: 'lowpass', hz: 1500, decay: 0.02, peak: 0.25 }
  },
  // A lofted pass or a cross: struck harder, and from under the ball.
  loft: {
    thump: { wave: 'sine', from: 130, to: 60, decay: 0.12, peak: 0.65 },
    burst: { filter: 'lowpass', hz: 2200, decay: 0.03, peak: 0.35 }
  },
  // A hoof, a goal kick, a keeper's punt: firmer still.
  clear: {
    thump: { wave: 'sine', from: 125, to: 50, decay: 0.15, peak: 0.65 },
    burst: { filter: 'lowpass', hz: 2600, decay: 0.035, peak: 0.45 }
  },
  // A shot: the hardest strike, with a crack on top of the thump.
  shot: {
    thump: { wave: 'sine', from: 145, to: 45, decay: 0.18, peak: 0.7 },
    burst: { filter: 'bandpass', hz: 2800, q: 0.8, decay: 0.05, peak: 0.55 }
  },
  // A header: duller and higher, a knock rather than a thump.
  header: {
    thump: { wave: 'triangle', from: 260, to: 170, decay: 0.07, peak: 0.6 },
    burst: { filter: 'lowpass', hz: 700, decay: 0.05, peak: 0.35 }
  },
  // A throw-in: two hands on the ball, barely a sound.
  throw: {
    thump: { wave: 'sine', from: 200, to: 120, decay: 0.05, peak: 0.25 },
    burst: { filter: 'lowpass', hz: 900, decay: 0.04, peak: 0.3 }
  },
  // A slide that wins the ball: a scuff of turf and a body.
  tackle: {
    thump: { wave: 'sine', from: 90, to: 60, decay: 0.08, peak: 0.45 },
    burst: { filter: 'bandpass', hz: 900, q: 0.7, decay: 0.1, peak: 0.45 }
  },
  // A parry: the slap of a glove.
  save: {
    thump: { wave: 'sine', from: 160, to: 90, decay: 0.08, peak: 0.5 },
    burst: { filter: 'bandpass', hz: 1800, q: 1, decay: 0.06, peak: 0.75 }
  },
  // A catch: the ball smothered into the chest, muffled.
  catch: {
    thump: { wave: 'sine', from: 110, to: 70, decay: 0.14, peak: 0.75 },
    burst: { filter: 'lowpass', hz: 500, decay: 0.08, peak: 0.4 }
  }
};

/** The referee's pea whistle: a high tone with the pea's rattle on it, as blast lengths and gaps. */
const WHISTLES: Record<'whistle' | 'whistle-half' | 'whistle-full', number[]> = {
  whistle: [0.16],
  // Two for the half, the second held.
  'whistle-half': [0.16, 0.12, 0.5],
  // Three for the end, peep peep peeeep.
  'whistle-full': [0.16, 0.12, 0.16, 0.12, 0.7]
};
const WHISTLE_HZ = 2950;
const WHISTLE_TRILL_HZ = 34;
const WHISTLE_TRILL_DEPTH = 90;
const WHISTLE_PEAK = 0.45;

export function createMatchSound(audio: GameAudio, seed = 0x1990): MatchSound {
  const rng = seededRng(seed);
  const last = new Map<MatchSoundName, number>();
  /** A factor within `spread` of 1, from this module's own stream. */
  const vary = (spread: number) => 1 + (rng() * 2 - 1) * spread;

  function bus(): EffectsBus | null {
    return audio.effectsBus();
  }

  /** A gain at `peak` times the bus level, into `into`, released once the sound is done. */
  function voiceGain(b: EffectsBus, into: AudioNode, at: number, peak: number, decay: number): GainNode {
    const g = b.ctx.createGain();
    g.gain.setValueAtTime(peak, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + decay);
    g.connect(into);
    return g;
  }

  function thump(b: EffectsBus, at: number, spec: Thump, pitch: number, level: number): void {
    const osc = b.ctx.createOscillator();
    osc.type = spec.wave;
    osc.frequency.setValueAtTime(spec.from * pitch, at);
    osc.frequency.exponentialRampToValueAtTime(spec.to * pitch, at + 0.04);
    osc.connect(voiceGain(b, b.out, at, spec.peak * level * b.level, spec.decay));
    osc.start(at);
    osc.stop(at + spec.decay + 0.02);
  }

  function burst(b: EffectsBus, at: number, spec: Burst, bright: number, level: number): void {
    const src = b.ctx.createBufferSource();
    src.buffer = noiseBuffer(b.ctx);
    // A different stretch of the one-second buffer each time, so two bursts in a row differ.
    const offset = rng() * 0.9;
    const filter = b.ctx.createBiquadFilter();
    filter.type = spec.filter;
    filter.frequency.setValueAtTime(spec.hz * bright, at);
    if (spec.q !== undefined) filter.Q.setValueAtTime(spec.q, at);
    src.connect(filter);
    filter.connect(voiceGain(b, b.out, at, spec.peak * level * b.level, spec.decay));
    src.start(at, offset);
    src.stop(at + spec.decay + 0.02);
  }

  function whistle(b: EffectsBus, at: number, pattern: number[]): void {
    const osc = b.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(WHISTLE_HZ * vary(0.02), at);
    // The pea: a fast square wobble on the pitch.
    const trill = b.ctx.createOscillator();
    trill.type = 'square';
    trill.frequency.setValueAtTime(WHISTLE_TRILL_HZ, at);
    const depth = b.ctx.createGain();
    depth.gain.setValueAtTime(WHISTLE_TRILL_DEPTH, at);
    trill.connect(depth);
    depth.connect(osc.frequency);
    const g = b.ctx.createGain();
    g.gain.setValueAtTime(0, at);
    let t = at;
    pattern.forEach((len, i) => {
      if (i % 2 === 0) {
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(WHISTLE_PEAK * b.level, t + 0.01);
        g.gain.setValueAtTime(WHISTLE_PEAK * b.level, t + len - 0.03);
        g.gain.linearRampToValueAtTime(0, t + len);
      }
      t += len;
    });
    osc.connect(g);
    g.connect(b.out);
    osc.start(at);
    trill.start(at);
    osc.stop(t + 0.02);
    trill.stop(t + 0.02);
  }

  /** The woodwork: an inharmonic pair, the FM bell a Mega Drive game used for a post. */
  function post(b: EffectsBus, at: number, pitch: number): void {
    for (const [hz, decay, peak] of [
      [640, 0.45, 0.35],
      [1530, 0.25, 0.2]
    ] as const) {
      const osc = b.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(hz * pitch, at);
      osc.connect(voiceGain(b, b.out, at, peak * b.level, decay));
      osc.start(at);
      osc.stop(at + decay + 0.02);
    }
    thump(b, at, { wave: 'sine', from: 180, to: 120, decay: 0.06, peak: 0.4 }, pitch, 1);
  }

  function play(name: MatchSoundName): void {
    if (audio.isSfxMuted()) return;
    const b = bus();
    if (!b) return;
    const now = b.ctx.currentTime;
    const prev = last.get(name);
    if (prev !== undefined && now - prev < MIN_GAP) return;
    last.set(name, now);
    if (name === 'whistle' || name === 'whistle-half' || name === 'whistle-full') {
      whistle(b, now, WHISTLES[name]);
      return;
    }
    const pitch = vary(0.07);
    if (name === 'post') {
      post(b, now, pitch);
      return;
    }
    const spec = STRIKES[name];
    const level = vary(0.12);
    if (spec.thump) thump(b, now, spec.thump, pitch, level);
    burst(b, now, spec.burst, vary(0.15), level);
  }

  /* ---------------------------------------------------------------- */
  /* the crowd                                                         */

  interface Bed {
    master: GainNode;
    level: GainNode;
    tone: BiquadFilterNode;
    sources: AudioScheduledSourceNode[];
  }
  let bed: Bed | null = null;
  let lastTension = -1;

  /** A looped noise, filtered, into `into`; two at different rates never line up, so the loop is not heard. */
  function noiseLoop(b: EffectsBus, rate: number, into: AudioNode, at: number): AudioBufferSourceNode {
    const src = b.ctx.createBufferSource();
    src.buffer = noiseBuffer(b.ctx);
    src.loop = true;
    src.playbackRate.setValueAtTime(rate, at);
    src.connect(into);
    src.start(at);
    return src;
  }

  /** A slow sine moving `param` by `depth` around where it is set: the stand's breathing. */
  function sway(b: EffectsBus, hz: number, depth: number, param: AudioParam, at: number): OscillatorNode {
    const lfo = b.ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(hz, at);
    const amount = b.ctx.createGain();
    amount.gain.setValueAtTime(depth, at);
    lfo.connect(amount);
    amount.connect(param);
    lfo.start(at);
    return lfo;
  }

  function tensionAt(t: number): { gain: number; hz: number } {
    const k = clamp(t, 0, 1);
    return { gain: BED_FLOOR + (BED_TOP - BED_FLOOR) * k, hz: BED_DARK + (BED_BRIGHT - BED_DARK) * k };
  }

  const crowd: Crowd = {
    get on() {
      return bed !== null;
    },
    start() {
      if (bed) return;
      const b = bus();
      if (!b) return;
      const now = b.ctx.currentTime;
      const master = b.ctx.createGain();
      master.gain.setValueAtTime(0, now);
      master.gain.setTargetAtTime(b.level, now, BED_FADE_IN / 4);
      master.connect(b.out);
      const level = b.ctx.createGain();
      const start = tensionAt(0);
      level.gain.setValueAtTime(start.gain, now);
      level.connect(master);
      // The murmur: voices sit between a few hundred hertz and a couple of
      // thousand, so a broad band-pass round 650 and a low-pass that opens
      // with the tension, which is what makes an excited stand brighter as
      // well as louder.
      const tone = b.ctx.createBiquadFilter();
      tone.type = 'lowpass';
      tone.frequency.setValueAtTime(start.hz, now);
      tone.connect(level);
      const band = b.ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.setValueAtTime(650, now);
      band.Q.setValueAtTime(0.6, now);
      const breath = b.ctx.createGain();
      breath.gain.setValueAtTime(0.8, now);
      band.connect(breath);
      breath.connect(tone);
      const sources: AudioScheduledSourceNode[] = [
        noiseLoop(b, 0.83, band, now),
        noiseLoop(b, 1.17, band, now),
        sway(b, 0.11, 0.2, breath.gain, now),
        sway(b, 0.047, 120, band.frequency, now)
      ];
      bed = { master, level, tone, sources };
      lastTension = 0;
    },
    stop(fade = 0.6) {
      if (!bed) return;
      const b = bus();
      const { master, sources } = bed;
      bed = null;
      lastTension = -1;
      if (!b) return;
      const now = b.ctx.currentTime;
      master.gain.cancelScheduledValues(now);
      if (fade > 0) master.gain.setTargetAtTime(0, now, fade / 4);
      else master.gain.setValueAtTime(0, now);
      for (const s of sources) s.stop(now + fade + 0.1);
    },
    tension(t: number) {
      if (!bed || Math.abs(t - lastTension) < TENSION_STEP) return;
      const b = bus();
      if (!b) return;
      lastTension = t;
      const now = b.ctx.currentTime;
      const to = tensionAt(t);
      bed.level.gain.setTargetAtTime(to.gain, now, BED_GLIDE);
      bed.tone.frequency.setTargetAtTime(to.hz, now, BED_GLIDE);
    },
    roar() {
      shout(ROAR_PEAK, 0.25, ROAR_DECAY, [[1400, 650, 0.5]]);
    },
    groan() {
      shout(GROAN_PEAK, 0.15, 1.4, [
        [420, 300, 3],
        [800, 620, 4]
      ]);
    },
    ooh() {
      shout(OOH_PEAK, 0.18, 1.2, [
        [380, 460, 4],
        [760, 900, 5]
      ]);
    }
  };

  /**
   * The stand reacting: noise through one or more band-passes swept from
   * one centre to another (two make a vowel, an "ooh" or an "aww"), rising in
   * `rise` and dying away over `decay`. It goes through the bed's master, so
   * stopping the crowd stops it.
   */
  function shout(peak: number, rise: number, decay: number, bands: [number, number, number][]): void {
    if (!bed) return;
    const b = bus();
    if (!b) return;
    const now = b.ctx.currentTime;
    const src = b.ctx.createBufferSource();
    src.buffer = noiseBuffer(b.ctx);
    src.loop = true;
    const g = b.ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(peak * vary(0.1), now + rise);
    g.gain.setTargetAtTime(0.0001, now + rise, decay / 4);
    g.connect(bed.master);
    for (const [from, to, q] of bands) {
      const f = b.ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.setValueAtTime(from, now);
      f.frequency.linearRampToValueAtTime(to, now + rise + decay * 0.5);
      f.Q.setValueAtTime(q, now);
      src.connect(f);
      f.connect(g);
    }
    src.start(now);
    src.stop(now + rise + decay + 0.1);
  }

  return { play, crowd };
}
