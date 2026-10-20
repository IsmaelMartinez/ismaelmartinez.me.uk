/**
 * STREET CHAMPION's announcer through a fake effects bus and a stubbed fetch:
 * every line has its rendered file on disk, which URL each line is fetched
 * from, decode-once-then-play, a new line cutting the old (sounding or still
 * loading), the effects mute, the pause, and every failure staying silent.
 */
import { describe, it, expect, vi } from 'vitest';
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ANNOUNCER_AUDIO_BASE, ANNOUNCER_LINES, announcerAudioUrl, createAnnouncer } from '../../src/games/fighter/announcer';

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
const audioWith = (bus: unknown, muted: () => boolean = () => false) => ({ isSfxMuted: muted, effectsBus: () => bus as never });

describe('the rendered announcer files', () => {
  it('has one non-empty MP3 under public/ for every line, and its credits', () => {
    const dir = join(process.cwd(), 'public', ANNOUNCER_AUDIO_BASE);
    for (const line of ANNOUNCER_LINES) {
      const file = join(dir, `${line}.mp3`);
      expect(existsSync(file), file).toBe(true);
      expect(statSync(file).size).toBeGreaterThan(1000);
    }
    expect(existsSync(join(dir, 'CREDITS.txt'))).toBe(true);
  });

  it('lists every line once', () => {
    expect(new Set(ANNOUNCER_LINES).size).toBe(ANNOUNCER_LINES.length);
    expect(ANNOUNCER_LINES).toContain('fight');
    expect(ANNOUNCER_LINES).toContain('ko');
  });

  it('builds URLs from the site root, the same files in every locale', () => {
    expect(announcerAudioUrl('fight')).toBe('/fun/fighter/announcer/fight.mp3');
    expect(announcerAudioUrl('ko', '/base')).toBe('/base/fun/fighter/announcer/ko.mp3');
  });
});

describe('the announcer', () => {
  it('fetches every line on the first say, decodes a line once, and plays it through the effects bus', async () => {
    const { bus, sources, gains, ctx } = fakeBus();
    const f = okFetch();
    const a = createAnnouncer(audioWith(bus), f);
    expect(f).not.toHaveBeenCalled();
    a.say('round1');
    await flush();
    expect(f.mock.calls.map(c => c[0]).sort()).toEqual(ANNOUNCER_LINES.map(l => announcerAudioUrl(l)).sort());
    expect(sources).toHaveLength(1);
    expect(sources[0].started).toBe(true);
    expect(gains[0].value).toBeCloseTo(0.7);
    sources[0].onended?.();
    a.say('round1');
    await flush();
    expect(ctx.decodeAudioData).toHaveBeenCalledTimes(1);
    expect(sources).toHaveLength(2);
    expect(f).toHaveBeenCalledTimes(ANNOUNCER_LINES.length);
  });

  it('cuts the sounding line for a new one', async () => {
    const { bus, sources } = fakeBus();
    const a = createAnnouncer(audioWith(bus), okFetch());
    a.say('round1');
    await flush();
    a.say('fight');
    expect(sources[0].stopped).toBe(true);
    await flush();
    expect(sources).toHaveLength(2);
    expect(sources[1].started).toBe(true);
    expect(sources[1].stopped).toBe(false);
  });

  it('never plays a line that was replaced while it was still loading', async () => {
    const { bus, sources } = fakeBus();
    const a = createAnnouncer(audioWith(bus), okFetch());
    a.say('round1');
    a.say('fight');
    await flush();
    expect(sources).toHaveLength(1);
    expect(sources[0].started).toBe(true);
  });

  it('plays nothing while effects are muted, and refresh cuts a line the toggle just muted', async () => {
    const { bus, sources } = fakeBus();
    let muted = true;
    const a = createAnnouncer(audioWith(bus, () => muted), okFetch());
    a.say('fight');
    await flush();
    expect(sources).toHaveLength(0);
    muted = false;
    a.say('fight');
    await flush();
    a.refresh();
    expect(sources[0].stopped).toBe(false);
    muted = true;
    a.refresh();
    expect(sources[0].stopped).toBe(true);
  });

  it('cuts the line on pause and says nothing until the pause lifts', async () => {
    const { bus, sources } = fakeBus();
    const a = createAnnouncer(audioWith(bus), okFetch());
    a.say('perfect');
    await flush();
    a.setPaused(true);
    expect(sources[0].stopped).toBe(true);
    a.say('youWin');
    await flush();
    expect(sources).toHaveLength(1);
    a.setPaused(false);
    a.say('youWin');
    await flush();
    expect(sources).toHaveLength(2);
  });

  it('says nothing after dispose', async () => {
    const { bus, sources } = fakeBus();
    const a = createAnnouncer(audioWith(bus), okFetch());
    a.say('ko');
    await flush();
    a.dispose();
    expect(sources[0].stopped).toBe(true);
    a.say('gameOver');
    await flush();
    expect(sources).toHaveLength(1);
  });

  it('stays silent without throwing when a fetch fails, a file is missing, a decode fails, or there is no audio', async () => {
    const a = fakeBus();
    const throwing = vi.fn(async (_url: string): Promise<{ ok: boolean; arrayBuffer(): Promise<ArrayBuffer> }> => {
      throw new Error('offline');
    });
    expect(() => createAnnouncer(audioWith(a.bus), throwing).say('fight')).not.toThrow();
    await flush();
    expect(a.sources).toHaveLength(0);

    const missing = vi.fn(async (_url: string) => ({ ok: false, arrayBuffer: async () => new ArrayBuffer(0) }));
    createAnnouncer(audioWith(a.bus), missing).say('fight');
    await flush();
    expect(a.sources).toHaveLength(0);

    const b = fakeBus(async () => {
      throw new Error('bad mp3');
    });
    createAnnouncer(audioWith(b.bus), okFetch()).say('fight');
    await flush();
    expect(b.sources).toHaveLength(0);

    const noFetch = createAnnouncer(audioWith(a.bus), undefined);
    expect(() => noFetch.say('fight')).not.toThrow();
    await flush();
    expect(a.sources).toHaveLength(0);

    expect(() => createAnnouncer(audioWith(null), okFetch()).say('fight')).not.toThrow();
  });
});
