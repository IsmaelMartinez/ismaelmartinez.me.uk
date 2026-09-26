/**
 * Score form: a once-only intro, named sections in an authored order, and a
 * rest between passes. Read off the recording context's graph log (see
 * `audio-graph.ts`), where every plain tone's first frequency write is its
 * onset, so each assertion names when a pitch started.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createGameAudio, renderScore, scoreSeconds, type GameAudioOptions, type Note } from '../../src/games/engine/audio';
import { SNAKE_MUSIC } from '../../src/games/snake/music';
import { installLocalStorage } from './dom-helpers';
import { drive, makeRecordingContext, type Cue } from './audio-graph';

const n = (freq: number, beats: number): Note => ({ freq, beats });

/** Every tone's onset as [frequency, time], in the order the tones were made. */
function onsets(log: string): [number, number][] {
  const seen = new Set<string>();
  const out: [number, number][] = [];
  for (const line of log.split('\n')) {
    const m = /^(osc#\d+)\.frequency\.setValueAtTime\(([^,]+), ([^)]+)\)$/.exec(line);
    if (!m || seen.has(m[1])) continue;
    seen.add(m[1]);
    out.push([Number(m[2]), Number(m[3])]);
  }
  return out;
}

/** The onset times of one frequency. */
function timesOf(log: string, freq: number): number[] {
  return onsets(log)
    .filter(([f]) => f === freq)
    .map(([, t]) => t);
}

function expectTimes(actual: number[], expected: number[]): void {
  expect(actual).toHaveLength(expected.length);
  expected.forEach((t, i) => expect(actual[i]).toBeCloseTo(t, 9));
}

beforeEach(() => {
  installLocalStorage();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// Two plain voices; the form supplies their lines.
const TWO: GameAudioOptions['tracks'] = [{ wave: 'triangle' }, { wave: 'triangle', envelope: 'pad' }];

describe('intro', () => {
  const score: GameAudioOptions = {
    tempo: 60,
    tracks: TWO,
    form: {
      intro: [[n(100, 1)], [n(101, 1)]],
      sections: { a: [[n(200, 1), n(210, 1)], [n(201, 2)]] },
      order: ['a']
    }
  };

  it('plays once before the order, which then loops without it', () => {
    const log = drive(score, 9);
    expectTimes(timesOf(log, 100), [0.05]);
    expectTimes(timesOf(log, 101), [0.05]);
    expectTimes(timesOf(log, 201), [1.05, 3.05, 5.05, 7.05, 9.05]);
    expectTimes(timesOf(log, 210), [2.05, 4.05, 6.05, 8.05]);
  });

  it('plays again from a fresh start(), since that starts the score from the top', () => {
    const log = drive(score, 8, [
      { at: 3, run: a => a.stop() },
      { at: 5, run: a => a.start() }
    ]);
    expectTimes(timesOf(log, 100), [0.05, 5.05]);
    // The pass at 3.05 was already scheduled when the music stopped.
    expectTimes(timesOf(log, 201), [1.05, 3.05, 6.05, 8.05]);
  });
});

describe('sections in order', () => {
  it('plays the order and loops it, a repeated name being how a second-time ending is written', () => {
    const log = drive(
      {
        tempo: 60,
        tracks: [{ wave: 'triangle' }],
        form: {
          sections: { a: [[n(300, 1)]], first: [[n(310, 1)]], second: [[n(320, 1)]] },
          order: ['a', 'first', 'a', 'second']
        }
      },
      7.9
    );
    expect(onsets(log).map(([f]) => f)).toEqual([300, 310, 300, 320, 300, 310, 300, 320]);
  });

  it('starts every voice of a section at the very same time, whatever rounding each line gathered', () => {
    // A lead in thirds of a beat against a bass in one long note: at 137 bpm the
    // lead's six additions and the bass's one land a rounding error apart, and
    // left to themselves the lines would carry that from section to section.
    const third = 1 / 3;
    const lead = (f: number): Note[] => Array.from({ length: 6 }, () => n(f, third));
    const log = drive(
      {
        tempo: 137,
        tracks: TWO,
        form: {
          sections: { a: [lead(400), [n(401, 2)]], b: [lead(500), [n(501, 2)]] },
          order: ['a', 'b']
        }
      },
      20
    );
    const leadTimes = new Set(onsets(log).filter(([f]) => f === 400 || f === 500).map(([, t]) => t));
    const bassTimes = [...timesOf(log, 401), ...timesOf(log, 501)];
    expect(bassTimes.length).toBeGreaterThan(20);
    for (const t of bassTimes) expect(leadTimes.has(t), `bass at ${t}`).toBe(true);
  });

  it('glides a slideNext across a section boundary, but not across a rest', () => {
    const log = drive(
      {
        tempo: 60,
        tracks: [{ wave: 'triangle' }],
        form: {
          sections: { a: [[{ freq: 440, beats: 1, slideNext: true }]], b: [[{ freq: 660, beats: 1, slideNext: true }]] },
          order: ['a', 'b'],
          rest: { after: 1, beats: 1 }
        }
      },
      2.5
    );
    expect(log).toMatch(/^osc#1\.frequency\.exponentialRampToValueAtTime\(660, /m);
    expect(log.includes('osc#2.frequency.exponentialRamp')).toBe(false);
  });

  it('reports the section it is in and the boundary it started at, and null without a form', () => {
    const seen: { name: string; start: number }[] = [];
    const look: Cue['run'] = a => seen.push(a.section()!);
    drive(
      {
        tempo: 60,
        tracks: [{ wave: 'triangle' }],
        form: { intro: [[n(100, 1)]], sections: { a: [[n(200, 2)]], b: [[n(300, 2)]] }, order: ['a', 'b'] }
      },
      6,
      [0.5, 2, 4].map(at => ({ at, run: look }))
    );
    expect(seen.map(s => s.name)).toEqual(['intro', 'a', 'b']);
    expectTimes(
      seen.map(s => s.start),
      [0.05, 1.05, 3.05]
    );
    expect(createGameAudio(SNAKE_MUSIC).section()).toBeNull();
  });

  it('throws on an order naming a section the score does not have', () => {
    const bad: GameAudioOptions = { tracks: [{}], form: { sections: { a: [[n(1, 1)]] }, order: ['a', 'b'] } };
    expect(() => createGameAudio(bad)).toThrow(/no section named "b"/);
    expect(() => scoreSeconds(bad)).toThrow(/no section named "b"/);
  });

  it('plays an order with no notes in it as silence rather than hanging', () => {
    const log = drive({ tempo: 60, tracks: TWO, form: { sections: { a: [[], []] }, order: ['a'] } }, 1);
    expect(onsets(log)).toEqual([]);
  });
});

describe('rest', () => {
  const score: GameAudioOptions = {
    tempo: 60,
    tracks: [{ wave: 'triangle' }],
    form: { sections: { a: [[n(600, 1), n(610, 1)]] }, order: ['a'], rest: { after: 2, beats: 3 } }
  };

  it('falls silent for its beats after every so many passes, then resumes from the top of the order', () => {
    const log = drive(score, 15);
    expectTimes(timesOf(log, 600), [0.05, 2.05, 7.05, 9.05, 14.05]);
    expectTimes(timesOf(log, 610), [1.05, 3.05, 8.05, 10.05, 15.05]);
  });

  it('shortens with the tempo when the tempo changes during it', () => {
    const seen: { name: string; start: number }[] = [];
    const log = drive(score, 8, [
      { at: 5, run: a => a.setTempo(120) },
      { at: 5.5, run: a => seen.push(a.section()!) }
    ]);
    // 2.05 s of rest were left at 5 s; at double speed that is 1.025 s.
    expectTimes(timesOf(log, 600), [0.05, 2.05, 6.025, 7.025]);
    expect(seen[0].name).toBe('a');
    expect(seen[0].start).toBeCloseTo(6.025, 9);
  });
});

describe('tempo, mute and restarts under a form', () => {
  it('keeps the voices together through a tempo change in the middle of a section', () => {
    const log = drive(
      {
        tempo: 60,
        tracks: TWO,
        form: {
          sections: {
            a: [[n(700, 1), n(700, 1), n(700, 1), n(700, 1)], [n(701, 4)]],
            b: [[n(800, 1), n(800, 1), n(800, 1), n(800, 1)], [n(801, 4)]]
          },
          order: ['a', 'b']
        }
      },
      5.5,
      [{ at: 2, run: a => a.setTempo(120) }]
    );
    // Section a started at 0.05 and had 2.05 s left at 2 s, so at double speed
    // it ends at 3.025 and b, four beats of half a second, at 5.025.
    const [lead] = timesOf(log, 800);
    const [bass] = timesOf(log, 801);
    expect(lead).toBe(bass);
    expect(lead).toBeCloseTo(3.025, 9);
    expectTimes(timesOf(log, 701), [0.05, 5.025]);
  });

  it('un-mutes every voice together from the top of the section it had reached, not the intro', () => {
    const seen: { name: string; start: number }[] = [];
    const log = drive(
      {
        tempo: 60,
        tracks: TWO,
        form: {
          intro: [[n(100, 1)], [n(101, 1)]],
          sections: {
            a: [[n(200, 1), n(200, 1), n(200, 1), n(200, 1)], [n(201, 4)]],
            b: [[n(300, 1), n(310, 1), n(320, 1), n(330, 1)], [n(301, 4)]]
          },
          order: ['a', 'b']
        }
      },
      12,
      [
        { at: 5.5, run: a => a.setMusicMuted(true) },
        { at: 7, run: a => a.setMusicMuted(false) },
        { at: 7.5, run: a => seen.push(a.section()!) }
      ]
    );
    // intro 0.05, a 1.05, b 5.05; muted from 5.5, then b again in one piece at 7.05.
    expectTimes(timesOf(log, 100), [0.05]);
    expectTimes(timesOf(log, 301), [5.05, 7.05]);
    expectTimes(timesOf(log, 300), [5.05, 7.05]);
    expectTimes(timesOf(log, 310), [8.05]);
    expectTimes(timesOf(log, 201), [1.05, 11.05]);
    expect(seen[0].name).toBe('b');
    expect(seen[0].start).toBeCloseTo(7.05, 9);
  });
});

describe('scoreSeconds', () => {
  it('reports the intro, one pass of the order and the rest apart', () => {
    const score: GameAudioOptions = {
      tempo: 120,
      tracks: TWO,
      form: {
        intro: [[n(1, 2)], [n(1, 2)]],
        // b's lines disagree, which music.test.ts forbids; it lasts as long as
        // its longest, because that is how long the scheduler waits.
        sections: { a: [[n(1, 4)], [n(1, 4)]], b: [[n(1, 2)], [n(1, 3)]] },
        order: ['a', 'b', 'a'],
        rest: { after: 2, beats: 4 }
      }
    };
    expect(scoreSeconds(score)).toEqual({ intro: 1, pass: 5.5, rest: 2, restEvery: 2 });
    // At a faster tempo, which is what a ramping cabinet is sized at.
    expect(scoreSeconds(score, 240)).toEqual({ intro: 0.5, pass: 2.75, rest: 1, restEvery: 2 });
  });

  it('reads a score without a form as one pass of its loop', () => {
    expect(scoreSeconds(SNAKE_MUSIC).pass).toBeCloseTo((32 * 60) / 134, 9);
    expect(scoreSeconds(SNAKE_MUSIC)).toMatchObject({ intro: 0, rest: 0, restEvery: 0 });
  });
});

describe('renderScore with a form', () => {
  it('renders the intro once and then the order, as the live engine plays it', async () => {
    const score: GameAudioOptions = {
      tempo: 90,
      tracks: TWO,
      form: {
        intro: [[n(100, 2)], [n(101, 2)]],
        sections: { a: [[n(200, 1), n(210, 1)], [n(201, 2)]], b: [[n(300, 2)], [n(301, 1), n(311, 1)]] },
        order: ['a', 'b'],
        rest: { after: 1, beats: 2 }
      }
    };
    const seconds = 12;
    const live = drive(score, seconds - 0.05, [], -0.05);

    const ctx = makeRecordingContext(8000);
    vi.stubGlobal('window', {
      OfflineAudioContext: class {
        constructor() {
          return Object.assign(ctx, { startRendering: () => Promise.resolve({}) });
        }
      }
    });
    await renderScore(score, seconds, 8000);
    const rendered = ctx.log.join('\n');
    const sorted = (log: string) => onsets(log).map(([f, t]) => `${f}@${t.toFixed(9)}`).sort();
    expect(timesOf(rendered, 100)).toEqual([0]);
    expect(timesOf(rendered, 200).length).toBeGreaterThan(1);
    expect(sorted(rendered)).toEqual(sorted(live));
  });
});
