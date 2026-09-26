/** @vitest-environment jsdom */
/**
 * CALCIO '90's audio wiring, driven through the real page markup.
 *
 * Issue #368 fixed two defects here: unpausing during the penalty shootout
 * used to call `audio.start()` and bring the anthem back, and attract mode
 * replayed a real seeded match through the same `handleMatchEvents` a live
 * match uses, so the demo fired sound effects over what should be a silent
 * cabinet. Issue #377 then gave the score scenes, stingers and a drum layer,
 * all moved from the match's own events, which the rest of this file drives.
 *
 * `createGameAudio` is mocked so every call the game makes on it is
 * observable without a real AudioContext; `tickMatch` is spied on to hand the
 * game a chosen event without playing out real match physics to get there by
 * chance.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { initFootballGame } from '../../src/games/football';
import * as matchModule from '../../src/games/football/match';
import * as tournamentModule from '../../src/games/football/tournament';
import type { MatchEvent } from '../../src/games/football/match';
import { BASE_TEMPO, FINAL_TEMPO } from '../../src/games/football/music';
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
  section: vi.fn((): { name: string; start: number; danger: boolean } | null => null),
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
  for (const fn of Object.values(mockAudio)) fn.mockClear();
  mockAudio.section.mockImplementation(() => null);
  mockAudio.playStinger.mockImplementation(() => true);
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

/** Hands the live match one event on the next frame, in place of a real tick. */
function nextTickRaises(event: MatchEvent, settle?: (m: matchModule.MatchState) => void): void {
  vi.spyOn(matchModule, 'tickMatch').mockImplementationOnce(m => {
    settle?.(m);
    return [event];
  });
  frames.step(1);
}

/** Ends the live match level, with a shootout owed, the way `finishHalf` does at 90 minutes. */
function endLevelWithShootout(): void {
  nextTickRaises({ type: 'end', winner: null, pendingShootout: true }, m => {
    m.phase = 'over';
    m.pendingShootout = true;
    m.winner = null;
  });
}

const goal = (side: 0 | 1): MatchEvent => ({
  type: 'goal',
  side,
  record: { side, scorer: 6, minute: 20, contact: 'ground', dribbled: false, fromCross: false }
});

const stingers = () => mockAudio.playStinger.mock.calls.map(call => (call as unknown as [string])[0]);

describe("CALCIO '90 menu theme", () => {
  it('starts on the first press of start, not on the silent title before it', () => {
    frames.advance(1);
    expect(mockAudio.start).not.toHaveBeenCalled();

    tapCanvas(); // title -> select
    expect(mockAudio.start).toHaveBeenCalledTimes(1);
    expect(mockAudio.setSection).toHaveBeenLastCalledWith('title-a');
    expect(mockAudio.setTempo).toHaveBeenLastCalledWith(BASE_TEMPO);
  });

  it('loops the menu by asking for its top while the one-bar turn plays, once per turn', () => {
    tapCanvas(); // title -> select, the menu theme starts
    mockAudio.setSection.mockClear();

    // Still inside the scene: nothing to do.
    mockAudio.section.mockImplementation(() => ({ name: 'title-b', start: 10, danger: false }));
    frames.advance(0.5);
    expect(mockAudio.setSection).not.toHaveBeenCalled();

    // The turn: ask for the top once, however many frames it plays for.
    mockAudio.section.mockImplementation(() => ({ name: 'title-turn', start: 20, danger: false }));
    frames.advance(0.5);
    expect(mockAudio.setSection).toHaveBeenCalledTimes(1);
    expect(mockAudio.setSection).toHaveBeenCalledWith('title-a');
  });
});

describe("CALCIO '90 match music", () => {
  it('holds the drums back until the kick-off, then brings them in with its stinger', () => {
    startAMatch();
    expect(mockAudio.setSection).toHaveBeenLastCalledWith('match-a');
    expect(mockAudio.setLayer).not.toHaveBeenCalledWith('drums', true);
    expect(stingers()).not.toContain('kick-off');

    // The real match: the kick-off freeze ends and the ball goes live.
    frames.advance(1);
    expect(stingers()).toContain('kick-off');
    expect(mockAudio.setLayer).toHaveBeenLastCalledWith('drums', true);
  });

  it("marks the player's goal and the CPU's with different stingers", () => {
    startAMatch();
    nextTickRaises(goal(0));
    expect(mockAudio.playStinger).toHaveBeenLastCalledWith('goal-for');
    nextTickRaises(goal(1));
    expect(mockAudio.playStinger).toHaveBeenLastCalledWith('goal-against');
    // The stingers played, so the effects they replace did not.
    expect(mockAudio.playSfx).not.toHaveBeenCalledWith('rescue');
    expect(mockAudio.playSfx).not.toHaveBeenCalledWith('hit');
  });

  it('falls back to the goal effect when the music is muted and the stinger cannot play', () => {
    startAMatch();
    mockAudio.playStinger.mockImplementation(() => false);
    nextTickRaises(goal(0));
    expect(mockAudio.playSfx).toHaveBeenLastCalledWith('rescue');
  });

  it('takes the drums out at half-time under its stinger', () => {
    startAMatch();
    frames.advance(1); // kick-off: drums in
    nextTickRaises({ type: 'halfTime' });
    expect(mockAudio.playStinger).toHaveBeenLastCalledWith('half-time');
    expect(mockAudio.setLayer).toHaveBeenLastCalledWith('drums', false);
  });

  it('blows the final whistle and goes back to the menu theme at full time', () => {
    startAMatch();
    mockAudio.setSection.mockClear();
    nextTickRaises({ type: 'end', winner: 0, pendingShootout: false }, m => {
      m.phase = 'over';
      m.winner = 0;
    });
    expect(stingers()).toContain('full-time');
    expect(mockAudio.setSection).toHaveBeenLastCalledWith('title-a');
    expect(mockAudio.setTempo).toHaveBeenLastCalledWith(BASE_TEMPO);
    expect(mockAudio.stop).not.toHaveBeenCalled();
  });

  it('plays the final on its own theme, the danger order at the final tempo', () => {
    const realCreateRun = tournamentModule.createRun;
    vi.spyOn(tournamentModule, 'createRun').mockImplementation((rng, code) => {
      const run = realCreateRun(rng, code);
      run.stage = 'final';
      return run;
    });
    startAMatch();
    expect(mockAudio.setDanger).toHaveBeenLastCalledWith(true);
    expect(mockAudio.setTempo).toHaveBeenLastCalledWith(FINAL_TEMPO);
  });

  it('keeps the group match off the final theme', () => {
    startAMatch();
    expect(mockAudio.setDanger).not.toHaveBeenCalledWith(true);
  });
});

describe("CALCIO '90 shootout", () => {
  it('moves to the tension bed with the drums in, rather than stopping the music', () => {
    startAMatch();
    endLevelWithShootout();
    expect(mockAudio.setSection).toHaveBeenLastCalledWith('shootout');
    expect(mockAudio.setLayer).toHaveBeenLastCalledWith('drums', true);
    expect(mockAudio.stop).not.toHaveBeenCalled();
  });

  it('pauses by muffling the score, never by stopping and restarting it (#368)', () => {
    startAMatch();
    endLevelWithShootout();
    expect(mockAudio.start).toHaveBeenCalledTimes(1);

    document.getElementById('btn-pause')!.click();
    expect(mockAudio.setPaused).toHaveBeenLastCalledWith(true);
    document.getElementById('btn-pause')!.click();
    expect(mockAudio.setPaused).toHaveBeenLastCalledWith(false);

    // The bug #368 fixed: unpausing here used to call start() and bring the anthem back.
    expect(mockAudio.start).toHaveBeenCalledTimes(1);
    expect(mockAudio.stop).not.toHaveBeenCalled();
  });
});

describe("CALCIO '90 attract mode is silent (#368)", () => {
  it('plays no sound effect, stinger or music while the cabinet demos itself', () => {
    // Deterministic seed (9): a real, seeded demo match that is known to
    // score for both sides inside the first five seconds, so the assertion
    // below is not vacuously true for a demo that never gets the chance.
    vi.spyOn(Math, 'random').mockReturnValue(2.2118911152267575e-9);

    // 12 s idle crosses ATTRACT_DELAY and starts the demo; a further several
    // seconds of real seeded match time carries it past both goals.
    frames.advance(18);

    expect(mockAudio.playSfx).not.toHaveBeenCalled();
    expect(mockAudio.playStinger).not.toHaveBeenCalled();
    expect(mockAudio.setLayer).not.toHaveBeenCalled();
    expect(mockAudio.start).not.toHaveBeenCalled();
  });

  it('stops the menu theme when the title screen falls into the demo', () => {
    // A run that is over after one match, so full time leads to the end screen and back to the title.
    const realRecord = tournamentModule.recordPlayerMatch;
    vi.spyOn(tournamentModule, 'recordPlayerMatch').mockImplementation((run, result) => {
      realRecord(run, result);
      run.over = true;
    });
    startAMatch();
    nextTickRaises({ type: 'end', winner: 1, pendingShootout: false }, m => {
      m.phase = 'over';
      m.winner = 1;
    });
    tapCanvas(); // full time -> game over
    tapCanvas(); // game over -> title, still on the menu theme
    expect(mockAudio.stop).not.toHaveBeenCalled();

    frames.advance(13); // idle past ATTRACT_DELAY
    expect(mockAudio.stop).toHaveBeenCalledTimes(1);
  });
});
