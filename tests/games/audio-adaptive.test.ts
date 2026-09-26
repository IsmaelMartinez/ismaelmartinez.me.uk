/**
 * Adaptive music: layers, section jumps, the danger variant, stingers and the
 * pause filter. Read off the recording context's graph log (see
 * `audio-graph.ts`) like the form tests, with the cursor and form state read
 * through `section()`. The claim each of these makes is about what the
 * scheduler does with its cursors, so most compare onsets against a run of
 * the same score with the feature left alone.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createGameAudio, renderScore, type GameAudioOptions, type Note } from '../../src/games/engine/audio';
import { installLocalStorage } from './dom-helpers';
import { drive, expectTimes, makeRecordingContext, onsets, timesOf, type Cue } from './audio-graph';

const n = (freq: number, beats: number): Note => ({ freq, beats });
const run = (n: number, freq: number, beats = 1): Note[] => Array.from({ length: n }, () => ({ freq, beats }));

type Section = { name: string; start: number; danger: boolean };

/** Where each tone at `freq` was routed: the node its envelope gain connects to. */
function routeOf(log: string, freq: number): Set<string> {
  const lines = log.split('\n');
  const gainDest = new Map<string, string>();
  const oscGain = new Map<string, string>();
  for (const line of lines) {
    let m = /^(gain#\d+)\.connect\((.+)\)$/.exec(line);
    if (m && !gainDest.has(m[1])) gainDest.set(m[1], m[2]);
    m = /^(osc#\d+)\.connect\((gain#\d+)\)$/.exec(line);
    if (m) oscGain.set(m[1], m[2]);
  }
  const out = new Set<string>();
  for (const line of lines) {
    const m = /^(osc#\d+)\.frequency\.setValueAtTime\(([^,]+), /.exec(line);
    if (m && Number(m[2]) === freq) out.add(gainDest.get(oscGain.get(m[1]) ?? '') ?? '?');
  }
  return out;
}

/** Every automation line written to one param, e.g. `gain#3.gain`. */
function writes(log: string, param: string): string[] {
  return log.split('\n').filter(l => l.startsWith(`${param}.`));
}

beforeEach(() => {
  installLocalStorage();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// Without echo the music graph is master gain#1 and bus gain#2, so a score with
// layers gets its lane at gain#3 and one gain per voice from gain#4.
const LAYERED: GameAudioOptions = {
  tempo: 60,
  tracks: [
    { wave: 'triangle', name: 'lead', melody: run(4, 440) },
    { wave: 'triangle', name: 'drums', startsMuted: true, melody: run(4, 220) }
  ]
};

describe('layers', () => {
  it('routes each named voice through its own gain, a muted layer starting at zero', () => {
    const log = drive(LAYERED, 2);
    expect(log).toContain('create gain#3()\ngain#3.gain.value = 1\ngain#3.connect(gain#2)');
    expect(log).toContain('gain#4.gain.value = 1\ngain#4.connect(gain#3)');
    expect(log).toContain('gain#5.gain.value = 0\ngain#5.connect(gain#3)');
    expect(routeOf(log, 440)).toEqual(new Set(['gain#4']));
    expect(routeOf(log, 220)).toEqual(new Set(['gain#5']));
  });

  it('fades a layer in and out on its own gain without moving a single note', () => {
    const cues: Cue[] = [
      { at: 1, run: a => a.setLayer('drums', true, 2) },
      { at: 3, run: a => a.setLayer(1, false, 0) }
    ];
    const log = drive(LAYERED, 5, cues);
    expect(writes(log, 'gain#5.gain')).toEqual([
      'gain#5.gain.value = 0',
      'gain#5.gain.cancelScheduledValues(1)',
      'gain#5.gain.setTargetAtTime(1, 1, 0.5)',
      'gain#5.gain.cancelScheduledValues(3)',
      'gain#5.gain.setValueAtTime(0, 3)'
    ]);
    expect(writes(log, 'gain#4.gain')).toEqual(['gain#4.gain.value = 1']);
    expect(onsets(log)).toEqual(onsets(drive(LAYERED, 5)));
  });

  it('ignores a voice it cannot find', () => {
    const log = drive(LAYERED, 2, [
      { at: 1, run: a => a.setLayer('bass', true) },
      { at: 1, run: a => a.setLayer(7, true) }
    ]);
    expect(log).not.toContain('cancelScheduledValues');
  });

  it('gives a score that declares none its gains on the first setLayer, and no sooner', () => {
    const plain: GameAudioOptions = { tempo: 60, tracks: [{ wave: 'triangle', melody: run(4, 440) }] };
    const log = drive(plain, 4, [{ at: 1.5, run: a => a.setLayer(0, false) }]);
    const lines = log.split('\n');
    // The lane is made at the setLayer, right after the notes committed before it.
    const at = lines.findIndex(l => /^gain#\d+\.connect\(gain#2\)$/.test(l) && lines[lines.indexOf(l) - 1]?.endsWith('.gain.value = 1'));
    expect(at).toBeGreaterThan(0);
    const laneId = /^(gain#\d+)/.exec(lines[at])![1];
    const before = lines.slice(0, at).join('\n');
    const after = lines.slice(at).join('\n');
    expect(routeOf(before, 440)).toEqual(new Set(['gain#2']));
    expectTimes(timesOf(before, 440), [0.05, 1.05]);
    const layer = /^(gain#\d+)\.connect\(/.exec(lines.find(l => l.endsWith(`.connect(${laneId})`))!)![1];
    expect(routeOf(after, 440)).toEqual(new Set([layer]));
    expect(writes(after, `${layer}.gain`)).toEqual([
      `${layer}.gain.value = 1`,
      `${layer}.gain.cancelScheduledValues(1.5)`,
      `${layer}.gain.setTargetAtTime(0, 1.5, 0.125)`
    ]);
  });
});

// Two voices, one plucked on the beat and one pad, in eight-beat sections.
const SECTIONS: GameAudioOptions = {
  tempo: 60,
  tracks: [{ wave: 'triangle' }, { wave: 'triangle', envelope: 'pad' }],
  form: {
    sections: {
      a: [run(8, 200), [n(201, 2), n(202, 6)]],
      b: [run(8, 300), [n(301, 8)]],
      short: [run(2, 400), [n(401, 2)]]
    },
    order: ['a', 'b']
  }
};

describe('setSection', () => {
  it('lands on the next bar line with every voice, shortening a note that would cross it', () => {
    const seen: Section[] = [];
    const log = drive(SECTIONS, 6, [
      { at: 1.5, run: a => expect(a.setSection('b')).toBe(true) },
      { at: 4.5, run: a => seen.push(a.section()!) }
    ]);
    // At 1.5 the notes up to 2.05 were committed, beat 2 of the section, so
    // the bar line is beat 4: 4.05. a's lead stops at its fourth beat.
    expectTimes(timesOf(log, 200), [0.05, 1.05, 2.05, 3.05]);
    expectTimes(timesOf(log, 300), [4.05, 5.05, 6.05]);
    expectTimes(timesOf(log, 301), [4.05]);
    // The pad's six-beat note from 2.05 closes its envelope at the bar line.
    expect(log).toMatch(/gain#\d+\.gain\.exponentialRampToValueAtTime\(0\.0001, 4\.05\)/);
    expect(log).not.toMatch(/exponentialRampToValueAtTime\(0\.0001, 8\.05\)/);
    expect(seen[0]).toMatchObject({ name: 'b', danger: false });
    expect(seen[0].start).toBeCloseTo(4.05, 9);
  });

  it('counts bars in the form’s beatsPerBar', () => {
    const waltz: GameAudioOptions = { ...SECTIONS, form: { ...SECTIONS.form!, beatsPerBar: 3 } };
    const log = drive(waltz, 5, [{ at: 1.5, run: a => a.setSection('b') }]);
    expectTimes(timesOf(log, 300).slice(0, 1), [3.05]);
  });

  it('takes the section’s own end when that comes before the bar line', () => {
    const shortFirst: GameAudioOptions = { ...SECTIONS, form: { ...SECTIONS.form!, order: ['short', 'a', 'b'] } };
    const log = drive(shortFirst, 4, [{ at: 0.5, run: a => a.setSection('b') }]);
    expectTimes(timesOf(log, 300).slice(0, 1), [2.05]);
    expect(timesOf(log, 200)).toEqual([]);
  });

  it('moves its bar line with a tempo change made while it waits', () => {
    const log = drive(SECTIONS, 5, [
      { at: 1.5, run: a => a.setSection('b') },
      { at: 2.5, run: a => a.setTempo(120) }
    ]);
    // 1.55 s of the wait was left at 2.5 s; at double speed that is 0.775 s.
    expectTimes(timesOf(log, 301), [3.275]);
  });

  it('lands at once when the music is un-muted while it waits', () => {
    const log = drive(SECTIONS, 5, [
      { at: 1, run: a => a.setMusicMuted(true) },
      { at: 1.5, run: a => a.setSection('b') },
      { at: 3, run: a => a.setMusicMuted(false) }
    ]);
    expectTimes(timesOf(log, 301), [3.05]);
    expectTimes(timesOf(log, 200), [0.05, 1.05]);
  });

  it('forgets a jump still waiting when the score is stopped and started again from the top', () => {
    const log = drive(SECTIONS, 8, [
      { at: 1.5, run: a => a.setSection('b') },
      { at: 2, run: a => a.stop() },
      { at: 3, run: a => a.start() }
    ]);
    expect(timesOf(log, 300)).toEqual([]);
    expectTimes(timesOf(log, 200).slice(-6), [3.05, 4.05, 5.05, 6.05, 7.05, 8.05]);
  });

  it('refuses a section the order does not have, and a score that is not playing', () => {
    const results: boolean[] = [];
    const log = drive(SECTIONS, 6, [
      { at: 0.5, run: a => results.push(a.setSection('nope')) },
      { at: 1, run: a => a.stop() },
      { at: 1.5, run: a => results.push(a.setSection('b')) },
      { at: 2, run: a => a.start() }
    ]);
    expect(results).toEqual([false, false]);
    // Restarted from the top of a, with no jump left waiting.
    expectTimes(timesOf(log, 200).slice(-5), [2.05, 3.05, 4.05, 5.05, 6.05]);
    expect(createGameAudio(SECTIONS).setSection('b')).toBe(false);
  });
});

const DANGER: GameAudioOptions = {
  tempo: 60,
  tracks: [{ wave: 'triangle' }],
  form: {
    sections: { a: [run(8, 200)], b: [run(8, 300)], fast: [run(4, 900)] },
    order: ['a', 'b'],
    danger: { order: ['fast'], tempo: 120 }
  }
};

describe('setDanger', () => {
  it('switches to the authored variant at its tempo on a bar line, and back to where the order goes next', () => {
    const seen: Section[] = [];
    const log = drive(DANGER, 11, [
      { at: 1.5, run: a => a.setDanger(true) },
      { at: 5, run: a => seen.push(a.section()!) },
      { at: 6, run: a => a.setDanger(false) },
      { at: 8.5, run: a => seen.push(a.section()!) }
    ]);
    expectTimes(timesOf(log, 200), [0.05, 1.05, 2.05, 3.05]);
    // Two passes of the variant at 120 bpm, the second cut short of nothing
    // because its four beats end on the bar line.
    expectTimes(timesOf(log, 900), [4.05, 4.55, 5.05, 5.55, 6.05, 6.55, 7.05, 7.55]);
    // Back to b, which is what followed the a that danger interrupted, at 60 bpm.
    expectTimes(timesOf(log, 300), [8.05, 9.05, 10.05, 11.05]);
    expect(seen[0]).toMatchObject({ name: 'fast', danger: true });
    expect(seen[1]).toMatchObject({ name: 'b', danger: false });
    expect(seen[1].start).toBeCloseTo(8.05, 9);
  });

  it('keeps the variant’s own tempo through setTempo, which then sets the tempo it returns to', () => {
    const log = drive(DANGER, 10, [
      { at: 1.5, run: a => a.setDanger(true) },
      { at: 5, run: a => a.setTempo(120) },
      { at: 6, run: a => a.setDanger(false) }
    ]);
    expectTimes(timesOf(log, 900), [4.05, 4.55, 5.05, 5.55, 6.05, 6.55, 7.05, 7.55]);
    expectTimes(timesOf(log, 300).slice(0, 3), [8.05, 8.55, 9.05]);
  });

  it('stays put when released before the switch lands', () => {
    const seen: Section[] = [];
    const log = drive(DANGER, 10, [
      { at: 1.5, run: a => a.setDanger(true) },
      { at: 2, run: a => a.setDanger(false) },
      { at: 5, run: a => seen.push(a.section()!) }
    ]);
    expect(timesOf(log, 900)).toEqual([]);
    expect(seen[0]).toMatchObject({ name: 'a', danger: false });
    expect(seen[0].start).toBeCloseTo(0.05, 9);
    expectTimes(timesOf(log, 300).slice(0, 1), [8.05]);
  });

  it('does nothing on a score without a variant', () => {
    const log = drive(SECTIONS, 6, [{ at: 1.5, run: a => a.setDanger(true) }]);
    expect(log).toBe(drive(SECTIONS, 6));
  });
});

const STUNG: GameAudioOptions = {
  tempo: 120,
  tracks: [{ wave: 'triangle', melody: run(8, 440) }, { wave: 'triangle', envelope: 'pad', melody: [n(110, 4)] }],
  stingers: { horn: [[n(880, 1), n(990, 1)], [n(770, 2)]] }
};

describe('playStinger', () => {
  it('plays over the loop, which carries on underneath in the same place', () => {
    const played: boolean[] = [];
    const log = drive(STUNG, 6, [{ at: 2, run: a => played.push(a.playStinger('horn')) }]);
    expect(played).toEqual([true]);
    expectTimes(timesOf(log, 880), [2.05]);
    expectTimes(timesOf(log, 990), [2.55]);
    expectTimes(timesOf(log, 770), [2.05]);
    const loop = (l: string) => onsets(l).filter(([f]) => f === 440 || f === 110);
    expect(loop(log)).toEqual(loop(drive(STUNG, 6)));
    // Straight to the bus, past the lane it ducks.
    expect(routeOf(log, 880)).toEqual(new Set(['gain#2']));
    expect(routeOf(log, 440)).toEqual(new Set(['gain#4']));
  });

  it('ducks the lane under the phrase and lifts it when the phrase ends, never touching the master', () => {
    const log = drive(STUNG, 4, [{ at: 2, run: a => a.playStinger('horn') }]);
    expect(writes(log, 'gain#3.gain')).toEqual([
      'gain#3.gain.value = 1',
      'gain#3.gain.cancelScheduledValues(2)',
      'gain#3.gain.setTargetAtTime(0.25, 2, 0.025)',
      'gain#3.gain.setTargetAtTime(1, 3.05, 0.05)'
    ]);
    expect(writes(log, 'gain#1.gain')).toEqual(writes(drive(STUNG, 4), 'gain#1.gain'));
  });

  it('keeps a form’s pass and section, so nothing restarts', () => {
    const score: GameAudioOptions = { ...SECTIONS, stingers: { hit: [[n(880, 1)], []] } };
    const seen: Section[] = [];
    const log = drive(score, 12, [
      { at: 3, run: a => seen.push(a.section()!) },
      { at: 3, run: a => a.playStinger('hit') },
      { at: 3.5, run: a => seen.push(a.section()!) }
    ]);
    expect(seen[1]).toEqual(seen[0]);
    expectTimes(timesOf(log, 200), [0.05, 1.05, 2.05, 3.05, 4.05, 5.05, 6.05, 7.05]);
    expectTimes(timesOf(log, 300).slice(0, 1), [8.05]);
  });

  it('is silent when the music is muted or stopped, and for a name it does not know', () => {
    const played: boolean[] = [];
    const log = drive(STUNG, 5, [
      { at: 1, run: a => played.push(a.playStinger('nope')) },
      { at: 1.5, run: a => a.setMusicMuted(true) },
      { at: 2, run: a => played.push(a.playStinger('horn')) },
      { at: 2.5, run: a => a.setMusicMuted(false) },
      { at: 3, run: a => a.stop() },
      { at: 3.5, run: a => played.push(a.playStinger('horn')) }
    ]);
    expect(played).toEqual([false, false, false]);
    expect(timesOf(log, 880)).toEqual([]);
  });
});

describe('setPaused', () => {
  const INTRO: GameAudioOptions = {
    tempo: 60,
    tracks: [{ wave: 'triangle' }],
    form: { intro: [[n(100, 1)]], sections: { a: [run(4, 200)] }, order: ['a'] }
  };

  it('muffles the music behind a low-pass after the master, and never moves a cursor', () => {
    const log = drive(INTRO, 8, [
      { at: 2, run: a => a.setPaused(true) },
      { at: 5, run: a => a.setPaused(false) }
    ]);
    expect(log).toContain(
      [
        'create filter#1()',
        'filter#1.type = lowpass',
        'filter#1.frequency.value = 22050',
        'filter#1.Q.value = 0',
        'create gain#',
      ].join('\n')
    );
    expect(log).toMatch(/gain#1\.disconnect\(\)\ngain#1\.connect\(filter#1\)\nfilter#1\.connect\((gain#\d+)\)\n\1\.connect\(destination\)/);
    expect(log).toContain('filter#1.frequency.setTargetAtTime(600, 2, 0.05)');
    expect(log).toContain('filter#1.frequency.setTargetAtTime(22050, 5, 0.05)');
    expect(log).toMatch(/gain#\d+\.gain\.setTargetAtTime\(0\.5, 2, 0\.05\)/);
    expect(log).toMatch(/gain#\d+\.gain\.setTargetAtTime\(1, 5, 0\.05\)/);
    expect(onsets(log)).toEqual(onsets(drive(INTRO, 8)));
    expectTimes(timesOf(log, 100), [0.05]);
    expect(writes(log, 'gain#1.gain')).toEqual(writes(drive(INTRO, 8), 'gain#1.gain'));
  });

  it('applies a pause set before the music started once the context exists', () => {
    const ctx = makeRecordingContext();
    vi.stubGlobal('window', { AudioContext: class { constructor() { return ctx; } } });
    const audio = createGameAudio(INTRO);
    audio.setPaused(true);
    audio.start();
    expect(ctx.log).toContain('filter#1.frequency.setTargetAtTime(600, 0, 0.05)');
    audio.dispose();
  });
});

describe('renderScore from a given state', () => {
  async function render(options: GameAudioOptions, seconds: number, from: Parameters<typeof renderScore>[3]): Promise<string> {
    const ctx = makeRecordingContext(8000);
    vi.stubGlobal('window', {
      OfflineAudioContext: class {
        constructor() {
          return Object.assign(ctx, { startRendering: () => Promise.resolve({}) });
        }
      }
    });
    await renderScore(options, seconds, 8000, from);
    return ctx.log.join('\n');
  }

  it('starts with the layers it is given', async () => {
    const log = await render(LAYERED, 2, { layers: { drums: true, '0': false } });
    expect(log).toContain('gain#4.gain.value = 0');
    expect(log).toContain('gain#5.gain.value = 1');
  });

  it('starts in the danger variant at its tempo, or at a named section', async () => {
    expectTimes(timesOf(await render(DANGER, 2, { danger: true }), 900), [0, 0.5, 1, 1.5]);
    const log = await render(DANGER, 9, { section: 'b' });
    expectTimes(timesOf(log, 300).slice(0, 2), [0, 1]);
    expectTimes(timesOf(log, 200).slice(0, 1), [8]);
  });
});
