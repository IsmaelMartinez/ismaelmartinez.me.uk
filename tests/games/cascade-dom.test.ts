/** @vitest-environment jsdom */
/**
 * Cascade's score following the game (#375, #412), driven through the real
 * page wiring. The run state machine decides when the stack is in danger and
 * when a countdown enters its final stretch (`cascade.test.ts` plays both
 * headlessly); this suite checks that `game.ts` hands each of them, the level
 * ramp and the level band's tune, to the music.
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
import { BASE_TEMPO, DANGER_TEMPO_LIFT, FOLK_TOP, TUNE_BAND_LEVELS } from '../../src/games/cascade/music';
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
  setScene: vi.fn(() => true),
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

/**
 * Clears a line that takes the run to `level`, then lets the clear flash and
 * the landslide play out so the next piece is falling.
 */
function levelUpTo(run: CascadeRun, level: number): void {
  run.lines = (level - 1) * 10 - 1;
  run.level = level - 1;
  run.well.fill(0);
  primeLine(run);
  hardDrop();
  expect(run.level).toBe(level);
  frames.step(4);
  expect(run.phase).toBe('falling');
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

describe('Cascade score following the game (#375, #412)', () => {
  it("starts each run at the base tempo on the folk tune, the form's own order", () => {
    start();
    expect(mockAudio.setTempo).toHaveBeenLastCalledWith(BASE_TEMPO);
    expect(mockAudio.start).toHaveBeenCalledTimes(1);
    expect(mockAudio.setScene).not.toHaveBeenCalled();
    expect(mockAudio.setLayer).not.toHaveBeenCalled();
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
    // Still level 1's band, so recovering changes no tune.
    expect(mockAudio.setScene).not.toHaveBeenCalled();
  });

  it('plays the level-up stinger on every level and winds the tempo up three a level', () => {
    start();
    levelUpTo(liveRun(), 2);
    expect(mockAudio.playStinger).toHaveBeenCalledWith('levelUp');
    expect(mockAudio.setTempo).toHaveBeenLastCalledWith(BASE_TEMPO + 3);
    // Level 2 is still the folk tune's band.
    expect(mockAudio.setScene).not.toHaveBeenCalled();
  });

  it('moves to the next tune at each level band, and back round to the folk tune from its top', () => {
    start();
    const run = liveRun();
    levelUpTo(run, TUNE_BAND_LEVELS);
    expect(mockAudio.setScene).not.toHaveBeenCalled();

    levelUpTo(run, TUNE_BAND_LEVELS + 1);
    expect(mockAudio.setScene.mock.calls).toEqual([['dance']]);
    levelUpTo(run, TUNE_BAND_LEVELS + 2);
    expect(mockAudio.setScene.mock.calls).toEqual([['dance']]);

    levelUpTo(run, 2 * TUNE_BAND_LEVELS + 1);
    expect(mockAudio.setScene.mock.calls).toEqual([['dance'], ['menuet']]);
    expect(mockAudio.setSection).not.toHaveBeenCalled();

    levelUpTo(run, 3 * TUNE_BAND_LEVELS + 1);
    expect(mockAudio.setScene.mock.calls).toEqual([['dance'], ['menuet'], [null]]);
    expect(mockAudio.setSection.mock.calls).toEqual([[FOLK_TOP]]);
    // After the return to the order, so the jump lands in it rather than in the menuet.
    expect(mockAudio.setSection.mock.invocationCallOrder[0]).toBeGreaterThan(
      mockAudio.setScene.mock.invocationCallOrder[2]
    );
    expect(mockAudio.playStinger).toHaveBeenCalledTimes(5);
  });

  it('holds a band change back while the stack is in danger, and makes it on recovery', () => {
    start();
    const run = liveRun();
    // A supported column from the danger row down, so the clear below leaves the stack high.
    for (let y = DANGER_ENTER_ROW; y < WELL_H - 1; y++) run.well[y * WELL_W] = 1;
    frames.step(1);
    expect(mockAudio.setDanger.mock.calls).toEqual([[true]]);

    run.lines = TUNE_BAND_LEVELS * 10 - 1;
    run.level = TUNE_BAND_LEVELS;
    primeLine(run);
    hardDrop();
    expect(run.level).toBe(TUNE_BAND_LEVELS + 1);
    frames.step(4);
    expect(run.danger).toBe(true);
    expect(mockAudio.setScene).not.toHaveBeenCalled();

    stackTo(run, DANGER_EXIT_ROW);
    frames.step(1);
    expect(mockAudio.setDanger.mock.calls).toEqual([[true], [false]]);
    expect(mockAudio.setScene.mock.calls).toEqual([['dance']]);
    // After the release, so the scene change replaces the return to the old tune.
    expect(mockAudio.setScene.mock.invocationCallOrder[0]).toBeGreaterThan(
      mockAudio.setDanger.mock.invocationCallOrder[1]
    );
  });

  it('opens a new run on the folk tune whatever band the last one reached', () => {
    start();
    levelUpTo(liveRun(), TUNE_BAND_LEVELS + 1);
    expect(mockAudio.setScene.mock.calls).toEqual([['dance']]);
    // start() puts the score back on its order, so the game must forget the band too.
    document.getElementById('start-btn')!.click();
    levelUpTo(liveRun(), TUNE_BAND_LEVELS + 1);
    expect(mockAudio.setScene.mock.calls).toEqual([['dance'], ['dance']]);
  });

  it("sounds the warning and lifts the tempo for a countdown's final stretch", () => {
    start('countdown');
    const run = liveRun();
    run.timeLeft = FINAL_STRETCH + 0.1;
    frames.step(1);
    expect(mockAudio.playStinger).toHaveBeenCalledWith('hurry');
    expect(mockAudio.setTempo).toHaveBeenLastCalledWith(lifted(BASE_TEMPO));
  });

  it('keeps a marathon out of the final stretch', () => {
    start();
    frames.step(8);
    expect(mockAudio.playStinger).not.toHaveBeenCalledWith('hurry');
  });
});
