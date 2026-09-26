/** @vitest-environment jsdom */
/**
 * Snake's keyboard wiring, driven through the real page markup.
 *
 * The defect these tests pin (issue #271): the keydown listener is on
 * `document`, and it called `preventDefault()` on every arrow and WASD press
 * *before* checking the phase. A visitor sitting on the idle or game-over
 * screen therefore could not scroll the page with the arrow keys, on a page
 * that is taller than the viewport. Asserting only that the arrows steer the
 * snake would not have caught it, so the assertions below are about what a
 * key does when the game is *not* running.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { initSnakeGame } from '../../src/games/snake';
import {
  createFrameDriver,
  installCanvasContext,
  installJsdomShims,
  installLocalStorage,
  mountHtml,
  pressKey
} from './dom-helpers';

/**
 * Mocked so the pause-audio suite below (issue #368) can observe `start` /
 * `stop` without a real AudioContext. Harmless to every other test in this
 * file: none of them assert on sound.
 *
 * Built inside `vi.hoisted` because the mock factory below runs when
 * `initSnakeGame`'s own import of the engine's audio module is resolved,
 * which happens before this file's own bindings exist (see
 * `tests/api/scores.test.ts`'s `blob` for the same reasoning).
 */
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
  dispose: vi.fn()
}));

vi.mock('../../src/games/engine/audio', async importOriginal => {
  const actual = await importOriginal<typeof import('../../src/games/engine/audio')>();
  return { ...actual, createGameAudio: vi.fn(() => mockAudio) };
});

/** The runtime skeleton of src/pages/[lang]/fun/snake.astro. */
const PAGE_HTML = `
  <div id="snake-root" data-t-arena-advance="The walls close in!">
    <span id="score">0</span>
    <span id="high-score">0</span>
    <span id="arena">1/5</span>
    <div class="game-area">
      <canvas id="game-canvas"></canvas>
      <div id="game-overlay"><button id="start-btn">Play</button></div>
      <div id="game-over-overlay" style="display: none;">
        <span id="final-score">0</span>
        <button id="restart-btn">Play Again</button>
      </div>
    </div>
  </div>`;

const press = (key: string) => pressKey(document, key);

const GAME_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd'];

const frames = createFrameDriver();
const { advance } = frames;

const gameOverShown = () =>
  document.getElementById('game-over-overlay')!.style.display !== 'none';

beforeEach(() => {
  installLocalStorage();
  installJsdomShims();
  installCanvasContext();
  frames.install();
  mountHtml(PAGE_HTML);
  initSnakeGame();
  frames.syncClock();
});

afterEach(() => {
  // The keydown listener lives on `document` and outlives the page's own DOM;
  // the module retires it on Astro's swap event, so the teardown here is the
  // same one a real navigation performs. Without it every test would leave a
  // live handler behind, still holding the phase its own run ended in.
  document.dispatchEvent(new Event('astro:before-swap'));
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  mockAudio.start.mockClear();
  mockAudio.stop.mockClear();
});

describe('Snake keyboard handling off the board (issue #271)', () => {
  it('leaves arrow and WASD presses alone on the idle screen, so the page still scrolls', () => {
    for (const key of GAME_KEYS) {
      expect(press(key).defaultPrevented).toBe(false);
    }
  });

  it('swallows them only while a run is actually playing', () => {
    document.getElementById('start-btn')!.click();
    for (const key of GAME_KEYS) {
      expect(press(key).defaultPrevented).toBe(true);
    }
  });

  it('gives the keys back once the game-over screen is up', () => {
    document.getElementById('start-btn')!.click();
    expect(press('ArrowUp').defaultPrevented).toBe(true);

    // The run opens moving right from the middle of the board, so left alone
    // it drives into the far wall and dies. Ten steps plus the death delay.
    advance(6);
    expect(gameOverShown()).toBe(true);

    for (const key of GAME_KEYS) {
      expect(press(key).defaultPrevented).toBe(false);
    }
  });
});

describe('Snake pause leaves the music running (#368)', () => {
  it('stops the music on pause and resumes it on unpause', () => {
    document.getElementById('start-btn')!.click();
    expect(mockAudio.start).toHaveBeenCalledTimes(1);

    press('p');
    expect(mockAudio.stop).toHaveBeenCalledTimes(1);
    expect(mockAudio.start).toHaveBeenCalledTimes(1);

    press('p');
    expect(mockAudio.start).toHaveBeenCalledTimes(2);
  });
});
