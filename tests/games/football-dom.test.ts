/** @vitest-environment jsdom */
/**
 * CALCIO '90's audio wiring, driven through the real page markup (issue #368).
 *
 * Two defects. `togglePause` used to call `audio.start()` on every unpause
 * without checking whether music was actually meant to be playing, so
 * unpausing during the penalty shootout — a screen that deliberately silences
 * the anthem — brought it straight back underneath the tension it was
 * silenced for. And attract mode replayed a real seeded match through the same
 * `handleMatchEvents` a live match uses, so the demo's own goals, saves and
 * shots fired sound effects (including the player-goal fanfare) over what is
 * supposed to be a silent cabinet demoing itself to an empty room.
 *
 * `createGameAudio` is mocked so `start`/`stop`/`playSfx` are observable
 * without a real AudioContext; `tickMatch` is spied on once to force the
 * shootout test's match straight to a level, pending-shootout full time
 * without playing out ninety seconds of real match physics to get there by
 * chance.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { initFootballGame } from '../../src/games/football';
import * as matchModule from '../../src/games/football/match';
import {
  createFrameDriver,
  installCanvasContext,
  installJsdomShims,
  installLocalStorage,
  mountHtml
} from './dom-helpers';

/**
 * Built inside `vi.hoisted` because the mock factory below runs when
 * `initFootballGame`'s own import of the engine's audio module is resolved,
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

/** The runtime skeleton of src/pages/[lang]/fun/football.astro. */
const PAGE_HTML = `
  <div id="football-root" class="game-container">
    <button id="btn-pause">pause</button>
    <div class="game-area">
      <canvas id="game-canvas"></canvas>
      <div id="toast-area"></div>
    </div>
    <div id="stick"><div id="stick-nub"></div></div>
    <button id="btn-shoot"></button>
    <button id="btn-cross"></button>
    <button id="btn-pass"></button>
  </div>`;

const frames = createFrameDriver();

beforeEach(() => {
  installLocalStorage();
  installJsdomShims();
  installCanvasContext();
  frames.install();
  mountHtml(PAGE_HTML);
  initFootballGame();
  frames.syncClock();
});

afterEach(() => {
  document.dispatchEvent(new Event('astro:before-swap'));
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  mockAudio.start.mockClear();
  mockAudio.stop.mockClear();
  mockAudio.playSfx.mockClear();
});

/** The one "yes" every static screen answers: a tap on the canvas. */
function tapCanvas(): void {
  document.getElementById('game-canvas')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

/** Title -> select -> confirming -> startRun(), the cursor's own first team. */
function startAMatch(): void {
  tapCanvas(); // title -> select
  tapCanvas(); // select -> confirming (opens on YES)
  tapCanvas(); // confirming -> startRun()
}

describe("CALCIO '90 pause during the shootout (#368)", () => {
  it('does not restart the anthem the shootout deliberately silenced', () => {
    startAMatch();
    expect(mockAudio.start).toHaveBeenCalledTimes(1);

    // Force the live match straight to a level, pending-shootout full time —
    // the real terminal transition `finishHalf` reaches at 90 minutes, without
    // playing out real match physics on the chance of a scoreless game.
    vi.spyOn(matchModule, 'tickMatch').mockImplementationOnce(m => {
      m.phase = 'over';
      m.pendingShootout = true;
      m.winner = null;
      return [{ type: 'end', winner: null, pendingShootout: true }];
    });
    frames.step(1);

    // Entering the shootout stops the anthem.
    expect(mockAudio.stop).toHaveBeenCalled();
    const stopsBeforePause = mockAudio.stop.mock.calls.length;

    document.getElementById('btn-pause')!.click();
    expect(mockAudio.stop.mock.calls.length).toBeGreaterThan(stopsBeforePause);

    // The bug: unpausing here used to call audio.start() unconditionally,
    // bringing the anthem back under the shootout's own tension bed.
    document.getElementById('btn-pause')!.click();
    expect(mockAudio.start).toHaveBeenCalledTimes(1);
  });
});

describe("CALCIO '90 attract mode is silent (#368)", () => {
  it('plays no sound effect while the cabinet demos itself', () => {
    // Deterministic seed (9): a real, seeded demo match that is known to
    // score for both sides inside the first five seconds, so the assertion
    // below is not vacuously true for a demo that never gets the chance.
    vi.spyOn(Math, 'random').mockReturnValue(2.2118911152267575e-9);

    // 12 s idle crosses ATTRACT_DELAY and starts the demo; a further several
    // seconds of real seeded match time carries it past both goals.
    frames.advance(18);

    expect(mockAudio.playSfx).not.toHaveBeenCalled();
  });
});
