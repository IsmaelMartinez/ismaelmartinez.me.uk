/** @vitest-environment jsdom */
/**
 * Syndicate's campaign-end sound, driven through the real page wiring (issue
 * #368). `endCampaign` played the descending `gameover` sting on a finished
 * campaign whichever way it ended, victory included; only running out of
 * agents or cash should sound like a loss.
 *
 * Syndicate is parked (its page is unrouted, `_syndicate.astro`), but its
 * modules are unchanged and still wired the same way, so this drives the real
 * `initSyndicateGame` the same as a live cabinet's DOM suite would.
 *
 * `createGameAudio` is mocked so `playSfx` is observable without a real
 * AudioContext. `./missions` is mocked to a single real mission (`MISSIONS[0]`
 * from the real module, so `spawnMission` still gets a valid spec) with
 * `missionStatus` forced to `'won'`, so the very first tick completes the
 * whole (one-mission) campaign — rather than playing three real missions to
 * get there.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { initSyndicateGame } from '../../src/games/syndicate';
import {
  createFrameDriver,
  installCanvasContext,
  installJsdomShims,
  installLocalStorage,
  mountHtml
} from './dom-helpers';

/**
 * Built inside `vi.hoisted` because the mock factory below runs when
 * `initSyndicateGame`'s own import of the engine's audio module is resolved,
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

vi.mock('../../src/games/syndicate/missions', async importOriginal => {
  const actual = await importOriginal<typeof import('../../src/games/syndicate/missions')>();
  return { ...actual, MISSIONS: [actual.MISSIONS[0]], missionStatus: vi.fn(() => 'won') };
});

/** The runtime skeleton of the parked src/pages/[lang]/fun/_syndicate.astro. */
const PAGE_HTML = `
  <div id="syndicate-root" class="game-container">
    <span id="money">£0</span>
    <span id="followers">0</span>
    <span id="mission-num">—</span>
    <span id="record">£0</span>
    <p id="objective-text"></p>
    <div class="game-area">
      <div id="canvas-scroll"><canvas id="game-canvas"></canvas></div>
      <div id="toast-area"></div>
      <div id="start-overlay" class="game-overlay">
        <h2 id="brief-title"></h2>
        <p id="brief-text"></p>
        <button id="start-btn">Start</button>
      </div>
      <div id="over-overlay" class="game-overlay" style="display: none;">
        <span id="over-icon"></span>
        <h2 id="over-title"></h2>
        <p id="over-desc"></p>
        <span id="final-cash"></span>
        <button id="next-btn"></button>
      </div>
    </div>
    <button id="select-all"></button>
    <button id="boost-btn" disabled></button>
  </div>`;

const frames = createFrameDriver();

beforeEach(() => {
  installLocalStorage();
  installJsdomShims();
  installCanvasContext();
  frames.install();
  mountHtml(PAGE_HTML);
  initSyndicateGame();
  frames.syncClock();
});

afterEach(() => {
  document.dispatchEvent(new Event('astro:before-swap'));
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  mockAudio.playSfx.mockClear();
});

describe('Syndicate campaign-end sound (#368)', () => {
  it('plays the win chime, not the loss sting, on a finished campaign', () => {
    document.getElementById('start-btn')!.click();
    frames.step(1);

    expect(document.getElementById('over-title')!.textContent).toBe('Campaign complete');
    expect(mockAudio.playSfx).toHaveBeenCalledWith('score');
    expect(mockAudio.playSfx).not.toHaveBeenCalledWith('gameover');
  });
});
