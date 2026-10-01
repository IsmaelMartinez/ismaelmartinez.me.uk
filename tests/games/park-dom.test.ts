/** @vitest-environment jsdom */
/**
 * Pixel Park's ending, driven through the page markup: a bankrupt park closes
 * on the organ's `closed` phrase through `playEnding` (#417), and only falls
 * back to the shared effect and a plain stop when the music refuses it.
 *
 * The cabinet is parked and unrouted, so this is the only place its music
 * wiring is exercised before a revival.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { initParkGame } from '../../src/games/park';
import { DAY_SECONDS } from '../../src/games/park/economy';
import { ENDINGS } from '../../src/games/park/music';
import {
  createFrameDriver,
  hsPanelHtml,
  installCanvasContext,
  installJsdomShims,
  installLocalStorage,
  mountHtml
} from './dom-helpers';

/** Built in `vi.hoisted` because the audio mock's factory runs before this file's bindings exist. */
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
  setPaused: vi.fn(),
  playStinger: vi.fn((_name: string) => true),
  playEnding: vi.fn((_name: string) => true),
  setLayer: vi.fn(),
  dispose: vi.fn()
}));

vi.mock('../../src/games/engine/audio', async importOriginal => {
  const actual = await importOriginal<typeof import('../../src/games/engine/audio')>();
  return { ...actual, createGameAudio: vi.fn(() => mockAudio) };
});

vi.mock('../../src/games/engine/globalScores', async () => (await import('./dom-helpers')).mockGlobalScores());

/** Every day's bill bankrupts the park, so the first day's end is the game's own bankruptcy. */
vi.mock('../../src/games/park/economy', async importOriginal => {
  const actual = await importOriginal<typeof import('../../src/games/park/economy')>();
  return { ...actual, operatingCost: () => 1_000_000 };
});

/** The runtime skeleton of src/pages/[lang]/fun/_park.astro. */
const PAGE_HTML = `
  <div id="park-root">
    <span id="money">£1500</span>
    <span id="guest-count">0</span>
    <span id="rating">50%</span>
    <span id="day">1</span>
    <span id="record">0</span>
    <span id="objective"></span>
    <div class="game-area">
      <div id="canvas-scroll"><canvas id="game-canvas"></canvas></div>
      <div id="toast-area"></div>
      <div id="start-overlay"><button id="start-btn">Open</button></div>
      <div id="over-overlay" style="display: none;">
        <strong id="final-days">0</strong>
        <strong id="final-welcomed">0</strong>
        <strong id="final-peak">0</strong>
        ${hsPanelHtml('park')}
        <button id="restart-btn">Play Again</button>
      </div>
    </div>
    <button class="tool-btn active" data-tool="path">Path</button>
    <button class="speed-btn active" data-speed="1">Play</button>
  </div>`;

const frames = createFrameDriver();

const overShown = () => document.getElementById('over-overlay')!.style.display !== 'none';

/** Opens the park and runs it to the end of its first day, when the bill lands. */
function goBankrupt(): void {
  document.getElementById('start-btn')!.click();
  frames.advance(DAY_SECONDS + 0.5);
}

beforeEach(() => {
  installLocalStorage();
  vi.clearAllMocks();
  mockAudio.playEnding.mockImplementation(() => true);
  installJsdomShims();
  installCanvasContext();
  frames.install();
  mountHtml(PAGE_HTML, { canvasSize: [800, 600] });
  initParkGame();
  frames.syncClock();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Pixel Park's ending (#417)", () => {
  it('plays the park out on the closing phrase, which stops the music itself', () => {
    goBankrupt();
    expect(overShown()).toBe(true);
    expect(mockAudio.playEnding.mock.calls).toEqual([[ENDINGS.closed]]);
    // playEnding closes the music when the phrase ends; a stop() here would cut it.
    expect(mockAudio.stop).not.toHaveBeenCalled();
    expect(mockAudio.playSfx).not.toHaveBeenCalledWith('gameover');
  });

  it('marks the ending with the effect and stops the music when the phrase is refused', () => {
    mockAudio.playEnding.mockImplementation(() => false);
    goBankrupt();
    expect(overShown()).toBe(true);
    expect(mockAudio.playEnding).toHaveBeenCalledTimes(1);
    expect(mockAudio.playSfx).toHaveBeenCalledWith('gameover');
    expect(mockAudio.stop).toHaveBeenCalledTimes(1);
  });
});
