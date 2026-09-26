/** @vitest-environment jsdom */
/**
 * Cascade's score following the game (#375), driven through the real page
 * wiring. The run state machine decides when the stack is in danger and when
 * a countdown enters its final stretch (`cascade.test.ts` plays both
 * headlessly); this suite checks that `game.ts` hands each of them, and the
 * level ramp, to the music.
 *
 * `createGameAudio` is mocked so the calls are observable without a real
 * AudioContext. The run is reached through the page's own `#dev` handle, the
 * one a playtesting bot drives, and its well is edited in place to put the
 * stack where each case needs it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { initCascadeGame } from '../../src/games/cascade';
import { WELL_W, WELL_H } from '../../src/games/cascade/well';
import { DANGER_ENTER_ROW, DANGER_EXIT_ROW, FINAL_STRETCH, type CascadeRun } from '../../src/games/cascade/run';
import { BASE_TEMPO, DANGER_TEMPO_LIFT, DRUMS_FROM_LEVEL } from '../../src/games/cascade/music';
import {
  createFrameDriver,
  installCanvasContext,
  installJsdomShims,
  installLocalStorage,
  mountHtml
} from './dom-helpers';

const mockAudio = vi.hoisted(() => ({
  start: vi.fn(),
  stop: vi.fn(),
  toggleMusicMute: vi.fn(() => false),
  isMusicMuted: vi.fn(() => false),
  setMusicMuted: vi.fn(),
  toggleSfxMute: vi.fn(() => false),
  isSfxMuted: vi.fn(() => false),
  setSfxMuted: vi.fn(),
  playSfx: vi.fn(),
  setTempo: vi.fn(),
  section: vi.fn(() => null),
  setLayer: vi.fn(),
  setSection: vi.fn(() => true),
  setDanger: vi.fn(),
  playStinger: vi.fn(() => true),
  setPaused: vi.fn(),
  dispose: vi.fn()
}));

vi.mock('../../src/games/engine/audio', async importOriginal => {
  const actual = await importOriginal<typeof import('../../src/games/engine/audio')>();
  return { ...actual, createGameAudio: vi.fn(() => mockAudio) };
});

/** The runtime skeleton of src/pages/[lang]/fun/cascade.astro. */
const PAGE_HTML = `
  <div id="cascade-root" class="game-container">
    <span id="score">0</span><span id="lines">0</span><span id="level">1</span>
    <div id="clock-item" hidden><span id="clock">2:00</span></div>
    <span id="record">0</span>
    <div class="game-area">
      <canvas id="game-canvas"></canvas>
      <div id="toast-area"></div>
      <div id="start-overlay" class="game-overlay">
        <div class="modes">
          <button id="mode-marathon" class="mode-btn is-active" data-mode="marathon"></button>
          <button id="mode-countdown" class="mode-btn" data-mode="countdown"></button>
        </div>
        <span id="blurb-marathon"></span><span id="blurb-countdown" hidden></span>
        <button id="start-btn"></button>
      </div>
      <div id="over-overlay" class="game-overlay" style="display: none;">
        <div id="over-topout"></div><div id="over-timeup" hidden></div>
        <strong id="final-score">0</strong>
        <button id="again-btn"></button>
        <button id="change-mode-btn" class="mode-btn change-mode"></button>
      </div>
    </div>
  </div>`;

const frames = createFrameDriver();

/** The live run, through the page's `#dev` handle. */
function liveRun(): CascadeRun {
  const dev = (window as unknown as { cascadeDev: { getRun: () => CascadeRun } }).cascadeDev;
  return dev.getRun();
}

function hardDrop(): void {
  (window as unknown as { cascadeDev: { hardDrop: () => void } }).cascadeDev.hardDrop();
}

/** Puts the stack's top at `row`, in column 0, which the spawning piece never touches. */
function stackTo(run: CascadeRun, row: number): void {
  run.well.fill(0);
  run.well[row * WELL_W] = 1;
}

/** Fills the bottom row, so the next lock clears it and scores its line. */
function primeLine(run: CascadeRun): void {
  run.well.fill(1, (WELL_H - 1) * WELL_W, WELL_H * WELL_W);
}

function start(mode: 'marathon' | 'countdown' = 'marathon'): void {
  document.getElementById(`mode-${mode}`)!.click();
  document.getElementById('start-btn')!.click();
}

const lifted = (tempo: number) => Math.round(tempo * DANGER_TEMPO_LIFT);

beforeEach(() => {
  installLocalStorage();
  installJsdomShims();
  installCanvasContext();
  frames.install();
  window.location.hash = '#dev';
  mountHtml(PAGE_HTML);
  initCascadeGame();
  frames.syncClock();
});

afterEach(() => {
  document.dispatchEvent(new Event('astro:before-swap'));
  document.body.replaceChildren();
  window.location.hash = '';
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const fn of Object.values(mockAudio)) fn.mockClear();
});

describe('Cascade score following the game (#375)', () => {
  it('starts each run at the base tempo with the drums held back', () => {
    start();
    expect(mockAudio.setTempo).toHaveBeenLastCalledWith(BASE_TEMPO);
    expect(mockAudio.setLayer).toHaveBeenCalledWith('drums', false, 0);
    // Taken out before the music starts, so a run that ended with them in
    // does not open the next one with a bar of drums.
    expect(mockAudio.setLayer.mock.invocationCallOrder[0]).toBeLessThan(mockAudio.start.mock.invocationCallOrder[0]);
  });

  it('swaps in the danger variant when the stack reaches the top, and releases it only on recovery', () => {
    start();
    const run = liveRun();
    stackTo(run, DANGER_ENTER_ROW);
    frames.step(1);
    expect(mockAudio.setDanger.mock.calls).toEqual([[true]]);
    expect(mockAudio.setTempo).toHaveBeenLastCalledWith(lifted(BASE_TEMPO));

    // A row of recovery is not enough: no flapping inside the band.
    stackTo(run, DANGER_EXIT_ROW - 1);
    frames.step(1);
    expect(mockAudio.setDanger.mock.calls).toEqual([[true]]);

    stackTo(run, DANGER_EXIT_ROW);
    frames.step(1);
    expect(mockAudio.setDanger.mock.calls).toEqual([[true], [false]]);
    expect(mockAudio.setTempo).toHaveBeenLastCalledWith(BASE_TEMPO);
  });

  it('plays the level-up stinger on every level, and brings the drums in at the milestone', () => {
    start();
    const run = liveRun();
    run.lines = 9;
    primeLine(run);
    hardDrop();
    expect(run.level).toBe(2);
    expect(mockAudio.playStinger).toHaveBeenCalledWith('levelUp');
    expect(mockAudio.setLayer).toHaveBeenLastCalledWith('drums', false, undefined);
    expect(mockAudio.setTempo).toHaveBeenLastCalledWith(BASE_TEMPO + 9);

    // Let the clear flash and the landslide play out, so the next piece is falling.
    frames.step(4);
    expect(run.phase).toBe('falling');
    run.lines = (DRUMS_FROM_LEVEL - 1) * 10 - 1;
    run.level = DRUMS_FROM_LEVEL - 1;
    run.well.fill(0);
    primeLine(run);
    hardDrop();
    expect(run.level).toBe(DRUMS_FROM_LEVEL);
    expect(mockAudio.playStinger).toHaveBeenCalledTimes(2);
    expect(mockAudio.setLayer).toHaveBeenLastCalledWith('drums', true, undefined);
    expect(mockAudio.setTempo).toHaveBeenLastCalledWith(BASE_TEMPO + 9 * (DRUMS_FROM_LEVEL - 1));
  });

  it("sounds the warning, lifts the tempo and brings the drums in for a countdown's final stretch", () => {
    start('countdown');
    const run = liveRun();
    run.timeLeft = FINAL_STRETCH + 0.1;
    frames.step(1);
    expect(mockAudio.playStinger).toHaveBeenCalledWith('hurry');
    expect(mockAudio.setLayer).toHaveBeenLastCalledWith('drums', true, undefined);
    expect(mockAudio.setTempo).toHaveBeenLastCalledWith(lifted(BASE_TEMPO));
  });

  it('keeps a marathon out of the final stretch', () => {
    start();
    frames.step(8);
    expect(mockAudio.playStinger).not.toHaveBeenCalledWith('hurry');
  });
});
