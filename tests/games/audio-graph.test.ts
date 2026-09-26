/**
 * The engine's additive-change guarantee, checked as text.
 *
 * Each case drives `createGameAudio` through a real cabinet score on a
 * recording context (see `audio-graph.ts`) and compares the full log of graph
 * calls with a snapshot taken before the engine grew percussion, pulse duties,
 * vibrato, slides and the offline render. A score that uses none of those must
 * still build exactly the same nodes with exactly the same values at exactly
 * the same times, and this is the test that says so. If a snapshot changes, the
 * engine changed what an existing cabinet plays: that needs a reason in the
 * PR, not a `-u`.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createGameAudio, type SfxName } from '../../src/games/engine/audio';
import { TANKS_MUSIC } from '../../src/games/tanks/music';
import { CASCADE_ROUND13_MUSIC } from './cascade-round13-score';
import { installLocalStorage } from './dom-helpers';
import { drive } from './audio-graph';

const EVERY_SFX: SfxName[] = ['blip', 'score', 'hit', 'explosion', 'gameover', 'rescue'];

beforeEach(() => {
  installLocalStorage();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('graph calls for scores that use no new engine fields', () => {
  it('Tank Duel: a full loop with a pad, detuned twins, echo, every sfx, a mute and a restart', async () => {
    const log = drive(TANKS_MUSIC, 17.5, [
      ...EVERY_SFX.map((name, i) => ({ at: 1 + i * 0.5, run: (a: ReturnType<typeof createGameAudio>) => a.playSfx(name) })),
      { at: 8, run: a => a.setMusicMuted(true) },
      { at: 9, run: a => a.setMusicMuted(false) },
      { at: 15, run: a => a.stop() },
      { at: 16, run: a => a.start() }
    ]);
    await expect(log).toMatchFileSnapshot('./__snapshots__/audio-graph/tanks.txt');
  });

  it('Cascade (its round 13 score): the per-level tempo ramp from its base tempo to the ceiling', async () => {
    const log = drive(
      CASCADE_ROUND13_MUSIC,
      16,
      Array.from({ length: 13 }, (_, i) => ({
        at: 1 + i,
        run: (a: ReturnType<typeof createGameAudio>) => a.setTempo(Math.min(126 + (i + 1) * 9, 240))
      }))
    );
    await expect(log).toMatchFileSnapshot('./__snapshots__/audio-graph/cascade.txt');
  });

  it('a synthetic score for the fields no cabinet uses today (octave shift, clamped gains, rests)', async () => {
    const log = drive(
      {
        tempo: 150,
        tracks: [
          {
            octaveShift: 1,
            wave: 'triangle',
            melody: [
              { freq: 220, beats: 0.5, gain: 4 },
              { freq: 0, beats: 0.5 },
              { freq: 330, beats: 0.25, gain: 0 },
              { freq: 440, beats: 0 },
              { freq: 262, beats: 0.75, gain: NaN }
            ]
          },
          { envelope: 'pad', octaveShift: -1, detune: 12, melody: [{ freq: 110, beats: 2 }] }
        ]
      },
      4
    );
    await expect(log).toMatchFileSnapshot('./__snapshots__/audio-graph/synthetic.txt');
  });
});
