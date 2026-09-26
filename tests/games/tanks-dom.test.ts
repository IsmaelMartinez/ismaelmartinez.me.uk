/** @vitest-environment jsdom */
/**
 * Tank Duel's match-end sound, driven through the real page wiring (issue
 * #368). `showRoundOver` used to play the descending `gameover` sting on
 * every match end, a human win included — a trophy is for someone in this
 * room, and only the CPU actually taking a vs-CPU match should sound like a
 * loss.
 *
 * `createGameAudio` is mocked so `playSfx` is observable without a real
 * AudioContext. `tickMatch` is spied on once to fire a `roundOver` event
 * straight through the match's own `on` callback — the same synchronous path
 * `finishRound` uses — rather than playing out real projectile physics on the
 * chance of a hit.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { initTanksGame } from '../../src/games/tanks';
import * as matchModule from '../../src/games/tanks/match';
import {
  createFrameDriver,
  installCanvasContext,
  installJsdomShims,
  installLocalStorage,
  mountHtml
} from './dom-helpers';

const mockAudio = {
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
};

vi.mock('../../src/games/engine/audio', async importOriginal => {
  const actual = await importOriginal<typeof import('../../src/games/engine/audio')>();
  return { ...actual, createGameAudio: vi.fn(() => mockAudio) };
});

/** The runtime skeleton of src/pages/[lang]/fun/tanks.astro. */
const PAGE_HTML = `
  <div id="tanks-root" class="game-container">
    <div class="scores">
      <span class="score-label" id="p1-label"></span><span id="p1-wins">0</span>
      <span class="score-label" id="p2-label"></span><span id="p2-wins">0</span>
      <span id="score">0</span>
      <div id="score2-item" hidden><span id="score2">0</span></div>
      <div id="best-item"><span id="best">0</span></div>
    </div>
    <div class="game-area">
      <canvas id="game-canvas"></canvas>
      <div id="toast-area"></div>
      <div id="start-overlay" class="game-overlay">
        <button id="vs-cpu-btn">vs CPU</button>
        <button id="two-player-btn">2P</button>
      </div>
      <div id="round-overlay" class="game-overlay" style="display: none;">
        <span id="round-emoji"></span>
        <h2 id="round-message"></h2>
        <p id="match-score" style="display: none;"></p>
        <div id="local-scores" style="display: none;">
          <span id="local-p1"></span><span id="local-p2"></span>
        </div>
        <button id="next-round-btn"></button>
        <button id="play-again-btn" style="display: none;"></button>
      </div>
    </div>
    <div class="weapon-bar">
      <button class="weapon-btn active" data-weapon="missile"><span class="weapon-ammo"></span></button>
    </div>
    <div class="control-group">
      <span id="angle-value"></span>
      <input type="range" id="angle-slider" min="5" max="175" value="60" />
    </div>
    <div class="control-group">
      <span id="power-value"></span>
      <input type="range" id="power-slider" min="10" max="100" value="55" />
    </div>
    <button id="fire-btn"></button>
  </div>`;

const frames = createFrameDriver();

beforeEach(() => {
  installLocalStorage();
  installJsdomShims();
  installCanvasContext();
  frames.install();
  mountHtml(PAGE_HTML);
  initTanksGame();
  frames.syncClock();
});

afterEach(() => {
  document.dispatchEvent(new Event('astro:before-swap'));
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  mockAudio.playSfx.mockClear();
  mockAudio.stop.mockClear();
  mockAudio.start.mockClear();
});

/** Forces the next tick to end the match, straight through the real `on` callback. */
function forceMatchOver(winner: 0 | 1): void {
  vi.spyOn(matchModule, 'tickMatch').mockImplementationOnce(m => {
    m.on({ type: 'roundOver', winner, matchOver: true, awards: [] });
  });
  frames.step(1);
}

describe('Tank Duel match-end sound (#368)', () => {
  it('plays the win chime, not the loss sting, when the player takes a vs-CPU match', () => {
    document.getElementById('vs-cpu-btn')!.click();
    forceMatchOver(0);

    expect(mockAudio.playSfx).toHaveBeenCalledWith('score');
    expect(mockAudio.playSfx).not.toHaveBeenCalledWith('gameover');
  });

  it('keeps the loss sting when the CPU actually takes the match', () => {
    document.getElementById('vs-cpu-btn')!.click();
    forceMatchOver(1);

    expect(mockAudio.playSfx).toHaveBeenCalledWith('gameover');
    expect(mockAudio.playSfx).not.toHaveBeenCalledWith('score');
  });

  it('plays the win chime for a decided two-player match either way', () => {
    document.getElementById('two-player-btn')!.click();
    forceMatchOver(1);

    expect(mockAudio.playSfx).toHaveBeenCalledWith('score');
    expect(mockAudio.playSfx).not.toHaveBeenCalledWith('gameover');
  });
});
