/**
 * PRIME TIME's host through a fake speaker: what is said, in which language
 * and delivery, what cuts in on what, and that the mute and a missing API
 * both leave the host silent without a throw. The fake plays nothing until
 * the test ends a line itself, which is how the Web Speech API behaves: an
 * utterance is queued before it sounds, and its end arrives as a callback.
 */
import { describe, it, expect, vi } from 'vitest';
import { DELIVERY, MAX_LINE_MS, browserSpeaker, createHost, hostDecision, type Speaker } from '../../src/games/primetime/host';
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
  spoken: { text: string; lang: string; rate: number; pitch: number }[];
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
    speak: vi.fn((text, voice, onDone) => {
      s.spoken.push({ text, ...voice });
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

const unmuted = { isSfxMuted: () => false };
const said = (s: Fake) => s.spoken.map(x => x.text);

describe('the host decides what cuts in', () => {
  it('speaks anything into silence', () => {
    for (const line of Object.keys(DELIVERY) as HostLine[]) expect(hostDecision(null, line)).toBe('speak');
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
  it("speaks the page's own line, in its language, with the line's delivery", () => {
    const speaker = fakeSpeaker();
    const host = createHost(unmuted, LINES, 'ca', speaker);
    host.call('carnage');
    expect(speaker.spoken).toEqual([{ text: 'TOTAL CARNAGE!', lang: 'ca', rate: DELIVERY.carnage.rate, pitch: DELIVERY.carnage.pitch }]);
  });

  it('cuts a lesser line for a greater one and drops a lesser one while the greater is still queued', () => {
    const speaker = fakeSpeaker();
    const host = createHost(unmuted, LINES, 'en', speaker);
    host.call('bigMoney');
    host.call('goodLuck');
    expect(speaker.cancel).toHaveBeenCalledTimes(2);
    expect(said(speaker)).toEqual(['BIG MONEY!', "GOOD LUCK. YOU'LL NEED IT."]);
    // The warning has been handed over but has not begun to sound: it is
    // still the line in force, and the catchphrase waits.
    host.call('loveIt');
    expect(speaker.spoken).toHaveLength(2);
    // Once the warning has ended, the next catchphrase goes out.
    speaker.ends[1]();
    host.call('loveIt');
    expect(said(speaker)).toEqual(['BIG MONEY!', "GOOD LUCK. YOU'LL NEED IT.", 'I LOVE IT!']);
  });

  it('is not fooled by the late end of a line it cut', () => {
    const speaker = fakeSpeaker();
    const host = createHost(unmuted, LINES, 'en', speaker);
    host.call('bigMoney');
    host.call('newCar');
    // The cancelled catchphrase reports its end after the car has started.
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

  it('says nothing while effects are muted, and nothing for a line the page did not give it', () => {
    const speaker = fakeSpeaker();
    let muted = true;
    const host = createHost({ isSfxMuted: () => muted }, LINES, 'en', speaker);
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
    const host = createHost({ isSfxMuted: () => muted }, LINES, 'en', speaker);
    host.call('goodLuck');
    host.refresh();
    expect(speaker.queued).toBe(1);
    muted = true;
    host.refresh();
    expect(speaker.queued).toBe(0);
    // Unmuted again, the floor is clear: a catchphrase is not held under the cut warning.
    muted = false;
    host.call('bigMoney');
    expect(said(speaker)).toEqual(["GOOD LUCK. YOU'LL NEED IT.", 'BIG MONEY!']);
  });

  it('does not bring a paused line back with the game once the effects were muted meanwhile', () => {
    const speaker = fakeSpeaker();
    let muted = false;
    const host = createHost({ isSfxMuted: () => muted }, LINES, 'en', speaker);
    host.call('newCar');
    host.setPaused(true);
    expect(speaker.paused).toBe(true);
    muted = true;
    host.setPaused(false);
    expect(speaker.queued).toBe(0);
    // The synthesizer itself is unpaused, or the next line anywhere on the page would queue into silence.
    expect(speaker.paused).toBe(false);
  });

  it('pauses and resumes with the game, and a pause followed by dispose leaves the synthesizer unpaused', () => {
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
    // Disposed, the next line starts from silence rather than reading a stale current.
    host.call('bigMoney');
    expect(speaker.spoken.at(-1)?.text).toBe('BIG MONEY!');
  });

  it('is silent and safe where the browser has no speech synthesis', () => {
    expect(browserSpeaker()).toBeNull();
    const host = createHost(unmuted, LINES, 'en', null);
    expect(() => {
      host.call('welcome');
      host.setPaused(true);
      host.refresh();
      host.setPaused(false);
      host.dispose();
    }).not.toThrow();
  });
});
