/**
 * PRIME TIME's host through a fake speaker: what is said, in which language
 * and delivery, what cuts in on what, and that the mute and a missing API
 * both leave the host silent without a throw.
 */
import { describe, it, expect, vi } from 'vitest';
import { DELIVERY, browserSpeaker, createHost, hostDecision, type Speaker } from '../../src/games/primetime/host';
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

function fakeSpeaker(): Speaker & { busy: boolean; spoken: { text: string; lang: string; rate: number; pitch: number }[] } {
  const spoken: { text: string; lang: string; rate: number; pitch: number }[] = [];
  const s = {
    busy: false,
    spoken,
    speak: vi.fn((text: string, voice: { lang: string; rate: number; pitch: number }) => {
      spoken.push({ text, ...voice });
      s.busy = true;
    }),
    cancel: vi.fn(() => {
      s.busy = false;
    }),
    pause: vi.fn(),
    resume: vi.fn(),
    speaking: () => s.busy
  };
  return s;
}

const unmuted = { isSfxMuted: () => false };

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

  it('cuts a lesser line for a greater one and drops a lesser one while the greater speaks', () => {
    const speaker = fakeSpeaker();
    const host = createHost(unmuted, LINES, 'en', speaker);
    host.call('bigMoney');
    host.call('goodLuck');
    expect(speaker.cancel).toHaveBeenCalledTimes(2);
    expect(speaker.spoken.map(s => s.text)).toEqual(['BIG MONEY!', "GOOD LUCK. YOU'LL NEED IT."]);
    host.call('loveIt');
    expect(speaker.spoken).toHaveLength(2);
    // Once the warning has been said, the next catchphrase goes out.
    speaker.busy = false;
    host.call('loveIt');
    expect(speaker.spoken.map(s => s.text)).toEqual(['BIG MONEY!', "GOOD LUCK. YOU'LL NEED IT.", 'I LOVE IT!']);
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

  it('pauses and resumes with the game, and is cut on dispose', () => {
    const speaker = fakeSpeaker();
    const host = createHost(unmuted, LINES, 'es', speaker);
    host.call('welcome');
    host.setPaused(true);
    expect(speaker.pause).toHaveBeenCalledTimes(1);
    host.setPaused(false);
    expect(speaker.resume).toHaveBeenCalledTimes(1);
    host.dispose();
    expect(speaker.busy).toBe(false);
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
      host.setPaused(false);
      host.dispose();
    }).not.toThrow();
  });
});
