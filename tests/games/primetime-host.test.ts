/**
 * PRIME TIME's host: the priority logic through a fake speaker (what is said,
 * what cuts in on what, the mute, the pause), and the sample player through
 * a fake effects bus and a stubbed fetch (which file for which line, the
 * decode-then-play, a cut during the load, and every failure ending the line
 * quietly). The fake speaker plays nothing until the test ends a line itself,
 * which is how a file behaves: it is handed over, then loads, then sounds.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  DELIVERY,
  HOST_AUDIO_BASE,
  HOST_LINES,
  MAX_LINE_MS,
  createHost,
  hostAudioUrl,
  hostDecision,
  sampleSpeaker,
  type Speaker
} from '../../src/games/primetime/host';
import type { HostLine } from '../../src/games/primetime/run';

const LINES: Record<HostLine, string> = {
  welcome: 'WELCOME TO PRIME TIME!',
  bigMoney: 'BIG MONEY!',
  bigPrizes: 'BIG PRIZES!',
  loveIt: 'I LOVE IT!',
  carnage: 'TOTAL CARNAGE!',
  goodLuck: "GOOD LUCK. YOU'LL NEED IT.",
  newCar: 'A NEW CAR!',
  noKeys: 'NOT ENOUGH KEYS FOR THE DOME!',
  extraLife: 'EXTRA LIFE!'
};

interface Fake extends Speaker {
  spoken: { line: HostLine; text: string; lang: string; rate: number; pitch: number }[];
  /** The end callbacks of every line handed over, in order. */
  ends: (() => void)[];
  paused: boolean;
  /** Lines handed over and not yet cancelled or ended. */
  queued: number;
}

function fakeSpeaker(): Fake {
  const s: Fake = {
    spoken: [],
    ends: [],
    paused: false,
    queued: 0,
    speak: vi.fn((u, onDone) => {
      s.spoken.push({ ...u });
      s.ends.push(onDone);
      s.queued++;
    }),
    cancel: vi.fn(() => {
      s.queued = 0;
    }),
    pause: vi.fn(() => {
      s.paused = true;
    }),
    resume: vi.fn(() => {
      s.paused = false;
    })
  };
  return s;
}

const unmuted = { isSfxMuted: () => false, effectsBus: () => null };
const said = (s: Fake) => s.spoken.map(x => x.text);

describe('the host decides what cuts in', () => {
  it('speaks anything into silence', () => {
    for (const line of HOST_LINES) expect(hostDecision(null, line)).toBe('speak');
  });

  it('drops a catchphrase under the boss warning and lets the warning cut a catchphrase', () => {
    expect(hostDecision('goodLuck', 'bigMoney')).toBe('drop');
    expect(hostDecision('bigMoney', 'goodLuck')).toBe('speak');
  });

  it('lets an equal line cut in, so the clear lines keep rotating', () => {
    expect(hostDecision('bigMoney', 'bigPrizes')).toBe('speak');
    expect(hostDecision('carnage', 'extraLife')).toBe('speak');
  });

  it('ranks the car and the boss warning above everything else', () => {
    const top = Math.max(...Object.values(DELIVERY).map(d => d.priority));
    expect(DELIVERY.newCar.priority).toBe(top);
    expect(DELIVERY.goodLuck.priority).toBe(top);
    expect(DELIVERY.bigMoney.priority).toBeLessThan(top);
  });
});

describe('the host through a speaker', () => {
  it("hands over the page's own line, its language and the line's delivery", () => {
    const speaker = fakeSpeaker();
    const host = createHost(unmuted, LINES, 'ca', speaker);
    host.call('carnage');
    expect(speaker.spoken).toEqual([{ line: 'carnage', text: 'TOTAL CARNAGE!', lang: 'ca', rate: DELIVERY.carnage.rate, pitch: DELIVERY.carnage.pitch }]);
  });

  it('cuts a lesser line for a greater one and drops a lesser one while the greater is still loading', () => {
    const speaker = fakeSpeaker();
    const host = createHost(unmuted, LINES, 'en', speaker);
    host.call('bigMoney');
    host.call('goodLuck');
    expect(speaker.cancel).toHaveBeenCalledTimes(2);
    expect(said(speaker)).toEqual(['BIG MONEY!', "GOOD LUCK. YOU'LL NEED IT."]);
    host.call('loveIt');
    expect(speaker.spoken).toHaveLength(2);
    speaker.ends[1]();
    host.call('loveIt');
    expect(said(speaker)).toEqual(['BIG MONEY!', "GOOD LUCK. YOU'LL NEED IT.", 'I LOVE IT!']);
  });

  it('is not fooled by the late end of a line it cut', () => {
    const speaker = fakeSpeaker();
    const host = createHost(unmuted, LINES, 'en', speaker);
    host.call('bigMoney');
    host.call('newCar');
    speaker.ends[0]();
    host.call('bigPrizes');
    expect(said(speaker)).toEqual(['BIG MONEY!', 'A NEW CAR!']);
    speaker.ends[1]();
    host.call('bigPrizes');
    expect(said(speaker)).toEqual(['BIG MONEY!', 'A NEW CAR!', 'BIG PRIZES!']);
  });

  it('gives up on a line whose end never arrives', () => {
    const speaker = fakeSpeaker();
    let t = 1000;
    const host = createHost(unmuted, LINES, 'en', speaker, () => t);
    host.call('goodLuck');
    t += MAX_LINE_MS - 1;
    host.call('bigMoney');
    expect(speaker.spoken).toHaveLength(1);
    t += 2;
    host.call('bigMoney');
    expect(said(speaker)).toEqual(["GOOD LUCK. YOU'LL NEED IT.", 'BIG MONEY!']);
  });

  it('does not count time spent paused against a line', () => {
    const speaker = fakeSpeaker();
    let t = 0;
    const host = createHost(unmuted, LINES, 'en', speaker, () => t);
    host.call('goodLuck');
    t += 1000;
    host.setPaused(true);
    t += MAX_LINE_MS * 2;
    host.setPaused(false);
    host.call('bigMoney');
    expect(speaker.spoken).toHaveLength(1);
    t += MAX_LINE_MS;
    host.call('bigMoney');
    expect(said(speaker)).toEqual(["GOOD LUCK. YOU'LL NEED IT.", 'BIG MONEY!']);
  });

  it('says nothing while effects are muted, and nothing for a line the page did not give it', () => {
    const speaker = fakeSpeaker();
    let muted = true;
    const host = createHost({ ...unmuted, isSfxMuted: () => muted }, LINES, 'en', speaker);
    host.call('bigMoney');
    expect(speaker.speak).not.toHaveBeenCalled();
    muted = false;
    const partial = createHost(unmuted, { ...LINES, welcome: '' }, 'en', speaker);
    partial.call('welcome');
    expect(speaker.speak).not.toHaveBeenCalled();
    host.call('bigMoney');
    expect(speaker.speak).toHaveBeenCalledTimes(1);
  });

  it('cuts a sounding line when the effects button mutes, and leaves it alone otherwise', () => {
    const speaker = fakeSpeaker();
    let muted = false;
    const host = createHost({ ...unmuted, isSfxMuted: () => muted }, LINES, 'en', speaker);
    host.call('goodLuck');
    host.refresh();
    expect(speaker.queued).toBe(1);
    muted = true;
    host.refresh();
    expect(speaker.queued).toBe(0);
    muted = false;
    host.call('bigMoney');
    expect(said(speaker)).toEqual(["GOOD LUCK. YOU'LL NEED IT.", 'BIG MONEY!']);
  });

  it('does not bring a paused line back with the game once the effects were muted meanwhile', () => {
    const speaker = fakeSpeaker();
    let muted = false;
    const host = createHost({ ...unmuted, isSfxMuted: () => muted }, LINES, 'en', speaker);
    host.call('newCar');
    host.setPaused(true);
    expect(speaker.paused).toBe(true);
    muted = true;
    host.setPaused(false);
    expect(speaker.queued).toBe(0);
    expect(speaker.paused).toBe(false);
  });

  it('pauses and resumes with the game, and a pause followed by dispose leaves the speaker unpaused', () => {
    const speaker = fakeSpeaker();
    const host = createHost(unmuted, LINES, 'es', speaker);
    host.call('welcome');
    host.setPaused(true);
    host.setPaused(true);
    expect(speaker.pause).toHaveBeenCalledTimes(1);
    host.setPaused(false);
    expect(speaker.resume).toHaveBeenCalledTimes(1);
    expect(speaker.paused).toBe(false);
    host.setPaused(true);
    host.dispose();
    expect(speaker.queued).toBe(0);
    expect(speaker.paused).toBe(false);
    host.call('bigMoney');
    expect(speaker.spoken.at(-1)?.text).toBe('BIG MONEY!');
  });
});

// --- The sample player --------------------------------------------------------------

interface FakeSource {
  buffer: unknown;
  started: boolean;
  stopped: boolean;
  onended: (() => void) | null;
  connect: () => void;
  start: () => void;
  stop: () => void;
}

function fakeBus(decode: (data: ArrayBuffer) => Promise<unknown> = async () => ({ duration: 1 })) {
  const sources: FakeSource[] = [];
  const gains: { value: number }[] = [];
  const ctx = {
    currentTime: 0,
    decodeAudioData: vi.fn(decode),
    createBufferSource: () => {
      const src: FakeSource = {
        buffer: null,
        started: false,
        stopped: false,
        onended: null,
        connect: () => {},
        start: () => {
          src.started = true;
        },
        stop: () => {
          src.stopped = true;
          src.onended?.();
        }
      };
      sources.push(src);
      return src;
    },
    createGain: () => {
      const g = { gain: { value: 1 }, connect: () => {} };
      gains.push(g.gain);
      return g;
    }
  };
  const bus = { ctx, out: {}, level: 0.5 };
  return { bus: bus as never, sources, gains, ctx };
}

const okFetch = () => vi.fn(async (_url: string) => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(16) }));
const flush = () => new Promise(r => setTimeout(r, 0));
const u = (line: HostLine) => ({ line, text: LINES[line], lang: 'ca', ...DELIVERY[line] });

describe('the sample player', () => {
  it("fetches every line's file for the page's language up front", () => {
    const f = okFetch();
    sampleSpeaker({ effectsBus: () => null }, 'ca', f);
    const urls = f.mock.calls.map(c => c[0]).sort();
    expect(urls).toEqual(HOST_LINES.map(l => hostAudioUrl('ca', l)).sort());
    expect(hostAudioUrl('es', 'bigMoney')).toBe(`${HOST_AUDIO_BASE}es/bigMoney.mp3`);
  });

  it('decodes a line once, plays it through the bus a touch over the effects level, and reports its end', async () => {
    const { bus, sources, gains, ctx } = fakeBus();
    const s = sampleSpeaker({ effectsBus: () => bus }, 'ca', okFetch());
    const done = vi.fn();
    s.speak(u('bigMoney'), done);
    await flush();
    expect(sources).toHaveLength(1);
    expect(sources[0].started).toBe(true);
    expect(gains[0].value).toBeCloseTo(0.6);
    expect(done).not.toHaveBeenCalled();
    sources[0].onended?.();
    expect(done).toHaveBeenCalledTimes(1);
    s.speak(u('bigMoney'), vi.fn());
    await flush();
    expect(ctx.decodeAudioData).toHaveBeenCalledTimes(1);
    expect(sources).toHaveLength(2);
  });

  it('stops the sounding line on cancel and on pause, completing it, and a line cut while loading completes without playing', async () => {
    const { bus, sources } = fakeBus();
    const s = sampleSpeaker({ effectsBus: () => bus }, 'ca', okFetch());
    const first = vi.fn();
    s.speak(u('goodLuck'), first);
    await flush();
    s.pause();
    expect(sources[0].stopped).toBe(true);
    expect(first).toHaveBeenCalledTimes(1);
    const late = vi.fn();
    s.speak(u('newCar'), late);
    s.cancel();
    expect(late).toHaveBeenCalledTimes(1);
    await flush();
    expect(sources).toHaveLength(1);
    expect(late).toHaveBeenCalledTimes(1);
  });

  it('through the host, a paused boss warning gives the floor back on resume', async () => {
    const { bus, sources } = fakeBus();
    const audio = { isSfxMuted: () => false, effectsBus: () => bus };
    const host = createHost(audio, LINES, 'ca', sampleSpeaker(audio, 'ca', okFetch()));
    host.call('goodLuck');
    await flush();
    expect(sources).toHaveLength(1);
    host.setPaused(true);
    host.setPaused(false);
    // The pause cut the warning; nothing is sounding, so a catchphrase goes out at once.
    host.call('bigMoney');
    await flush();
    expect(sources).toHaveLength(2);
    expect(sources[1].started).toBe(true);
  });

  it('ends a line at once, without a sound, when the file is missing, fails to decode, or there is no audio', async () => {
    const missing = vi.fn(async (_url: string) => ({ ok: false, arrayBuffer: async () => new ArrayBuffer(0) }));
    const a = fakeBus();
    const s1 = sampleSpeaker({ effectsBus: () => a.bus }, 'ca', missing);
    const d1 = vi.fn();
    s1.speak(u('bigMoney'), d1);
    await flush();
    expect(d1).toHaveBeenCalledTimes(1);
    expect(a.sources).toHaveLength(0);

    const b = fakeBus(async () => {
      throw new Error('bad mp3');
    });
    const s2 = sampleSpeaker({ effectsBus: () => b.bus }, 'ca', okFetch());
    const d2 = vi.fn();
    s2.speak(u('bigMoney'), d2);
    await flush();
    expect(d2).toHaveBeenCalledTimes(1);
    expect(b.sources).toHaveLength(0);

    const s3 = sampleSpeaker({ effectsBus: () => null }, 'ca', okFetch());
    const d3 = vi.fn();
    s3.speak(u('bigMoney'), d3);
    expect(d3).toHaveBeenCalledTimes(1);

    const s4 = sampleSpeaker({ effectsBus: () => a.bus }, 'ca', undefined);
    const d4 = vi.fn();
    s4.speak(u('bigMoney'), d4);
    await flush();
    expect(d4).toHaveBeenCalledTimes(1);
  });
});
