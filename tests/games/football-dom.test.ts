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
import { BASE_TEMPO, FINAL_TEMPO, SEMI_TEMPO } from '../../src/games/football/music';
import { CROWD_CHANCE_HOLD, CROWD_GOAL_HOLD } from '../../src/games/football/game';
import * as shootoutModule from '../../src/games/football/shootout';
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
  section: vi.fn((): { name: string; start: number; danger: boolean; scene: string | null } | null => null),
  setLayer: vi.fn(),
  setScene: vi.fn(() => true),
  setSection: vi.fn(() => true),
  setDanger: vi.fn(),
  playStinger: vi.fn(() => true),
  playEnding: vi.fn(() => true),
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
  mockAudio.playEnding.mockImplementation(() => true);
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
    expect(mockAudio.setScene).toHaveBeenLastCalledWith(null);
    expect(mockAudio.setTempo).toHaveBeenLastCalledWith(BASE_TEMPO);
  });

  it('leaves the looping to the engine rather than steering it every frame (#398)', () => {
    tapCanvas(); // title -> select, the menu theme starts
    mockAudio.setScene.mockClear();
    // Even on the scene's last bar, which the game used to catch and re-request.
    mockAudio.section.mockImplementation(() => ({ name: 'title-turn', start: 20, danger: false, scene: null }));
    frames.advance(2);
    expect(mockAudio.setScene).not.toHaveBeenCalled();
    expect(mockAudio.setSection).not.toHaveBeenCalled();
  });
});

describe("CALCIO '90 match music", () => {
  it('holds the drums back until the kick-off, then brings them in with its stinger', () => {
    startAMatch();
    expect(mockAudio.setScene).toHaveBeenLastCalledWith('match');
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
    expect(mockAudio.setLayer).toHaveBeenCalledWith('drums', false);
    expect(mockAudio.setLayer).not.toHaveBeenLastCalledWith('drums', true);
  });

  it('blows the final whistle and goes back to the menu theme at full time', () => {
    startAMatch();
    mockAudio.setScene.mockClear();
    nextTickRaises({ type: 'end', winner: 0, pendingShootout: false }, m => {
      m.phase = 'over';
      m.winner = 0;
    });
    expect(stingers()).toContain('full-time');
    expect(mockAudio.setScene).toHaveBeenLastCalledWith(null);
    expect(mockAudio.setTempo).toHaveBeenLastCalledWith(BASE_TEMPO);
    expect(mockAudio.stop).not.toHaveBeenCalled();
  });

  it('plays the final on its own theme, at the final tempo', () => {
    const realCreateRun = tournamentModule.createRun;
    vi.spyOn(tournamentModule, 'createRun').mockImplementation((rng, code) => {
      const run = realCreateRun(rng, code);
      run.stage = 'final';
      return run;
    });
    startAMatch();
    expect(mockAudio.setScene).toHaveBeenLastCalledWith('final');
    expect(mockAudio.setTempo).toHaveBeenLastCalledWith(FINAL_TEMPO);
  });

  it('keeps the group match off the final theme', () => {
    startAMatch();
    expect(mockAudio.setScene).not.toHaveBeenCalledWith('final');
  });
});

describe("CALCIO '90 shootout", () => {
  it('moves to the tension bed with the drums in, rather than stopping the music', () => {
    startAMatch();
    endLevelWithShootout();
    expect(mockAudio.setScene).toHaveBeenLastCalledWith('shootout');
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
    expect(mockAudio.playEnding).not.toHaveBeenCalled();
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

describe("CALCIO '90 ends a run on its own phrase (#417)", () => {
  /** Plays one match that finishes the run, `champion` or knocked out, and taps through to the end screen. */
  function finishTheRun(champion: boolean): void {
    const realRecord = tournamentModule.recordPlayerMatch;
    vi.spyOn(tournamentModule, 'recordPlayerMatch').mockImplementation((run, result) => {
      realRecord(run, result);
      run.over = true;
      run.champion = champion;
    });
    startAMatch();
    nextTickRaises({ type: 'end', winner: champion ? 0 : 1, pendingShootout: false }, m => {
      m.phase = 'over';
      m.winner = champion ? 0 : 1;
    });
    tapCanvas(); // full time -> the end screen, which finishes the run
  }

  it('ends a knockout on the eliminated phrase in place of the game-over effect', () => {
    finishTheRun(false);
    expect(mockAudio.playEnding).toHaveBeenCalledTimes(1);
    expect(mockAudio.playEnding).toHaveBeenLastCalledWith('eliminated');
    expect(mockAudio.playSfx).not.toHaveBeenCalledWith('gameover');
  });

  it('ends a won tournament on the champion phrase in place of the victory effect', () => {
    finishTheRun(true);
    expect(mockAudio.playEnding).toHaveBeenLastCalledWith('champion');
    expect(mockAudio.playSfx).not.toHaveBeenCalledWith('rescue');
  });

  it('falls back to the effect, with the menu theme still on, when the phrase cannot play', () => {
    mockAudio.playEnding.mockImplementation(() => false);
    finishTheRun(false);
    expect(mockAudio.playSfx).toHaveBeenCalledWith('gameover');
    tapCanvas(); // the end screen -> title
    expect(mockAudio.start).toHaveBeenCalledTimes(1);
  });

  it('starts the music again, intro first, when the end screen goes back to the title', () => {
    finishTheRun(true);
    expect(mockAudio.start).toHaveBeenCalledTimes(1);
    tapCanvas(); // the end screen -> title
    expect(mockAudio.start).toHaveBeenCalledTimes(2);
    expect(mockAudio.setScene).toHaveBeenLastCalledWith(null);
  });

  it('never ends a match that does not end the run', () => {
    startAMatch();
    nextTickRaises({ type: 'end', winner: 0, pendingShootout: false }, m => {
      m.phase = 'over';
      m.winner = 0;
    });
    tapCanvas(); // full time -> the tables
    expect(mockAudio.playEnding).not.toHaveBeenCalled();
  });
});

/** Starts a match on a run doctored first, e.g. to a later matchday or stage. */
function startAMatchWith(doctor: (run: tournamentModule.RunState) => void): void {
  const realCreateRun = tournamentModule.createRun;
  vi.spyOn(tournamentModule, 'createRun').mockImplementation((rng, code) => {
    const run = realCreateRun(rng, code);
    doctor(run);
    return run;
  });
  startAMatch();
}

describe("CALCIO '90 rotates its three match themes (#413)", () => {
  it('plays the first theme for the first group match', () => {
    startAMatch();
    expect(mockAudio.setScene).toHaveBeenLastCalledWith('match');
  });

  it.each([
    [1, 'match-2'],
    [2, 'match-3']
  ])('plays the right theme after %i matches', (played, theme) => {
    startAMatchWith(run => {
      run.matchesPlayed = played;
    });
    expect(mockAudio.setScene).toHaveBeenLastCalledWith(theme);
    expect(mockAudio.setTempo).toHaveBeenLastCalledWith(BASE_TEMPO);
  });

  it('comes round to the first theme for the semi, at the semi tempo', () => {
    startAMatchWith(run => {
      run.matchesPlayed = 3;
      run.stage = 'semi';
    });
    expect(mockAudio.setScene).toHaveBeenLastCalledWith('match');
    expect(mockAudio.setTempo).toHaveBeenLastCalledWith(SEMI_TEMPO);
  });

  it('keeps the final on its own theme whatever the count', () => {
    startAMatchWith(run => {
      run.matchesPlayed = 4;
      run.stage = 'final';
    });
    expect(mockAudio.setScene).toHaveBeenLastCalledWith('final');
  });
});

describe("CALCIO '90's crowd swells on a chance (#413)", () => {
  const crowdCalls = () =>
    mockAudio.setLayer.mock.calls.filter(call => (call as unknown[])[0] === 'crowd').map(call => (call as unknown[])[1]);
  /** Lets play run with nothing happening on the pitch. */
  const quietPitch = () => vi.spyOn(matchModule, 'tickMatch').mockImplementation(() => []);
  const shot: MatchEvent = { type: 'shot', side: 0, onTarget: true, contact: 'ground' };

  it('starts every match with the crowd down', () => {
    startAMatch();
    expect(crowdCalls()).toEqual([false]);
  });

  it('rises on a shot, holds, and falls away once the hold runs out', () => {
    startAMatch();
    mockAudio.setLayer.mockClear();
    nextTickRaises(shot);
    expect(mockAudio.setLayer).toHaveBeenLastCalledWith('crowd', true, expect.any(Number));
    quietPitch();
    frames.advance(CROWD_CHANCE_HOLD - 0.3);
    expect(crowdCalls()).toEqual([true]);
    frames.advance(0.6);
    expect(crowdCalls()).toEqual([true, false]);
  });

  it('holds longer for a goal than for a chance', () => {
    startAMatch();
    mockAudio.setLayer.mockClear();
    nextTickRaises(goal(1));
    quietPitch();
    frames.advance(CROWD_CHANCE_HOLD + 0.5);
    expect(crowdCalls()).toEqual([true]);
    frames.advance(CROWD_GOAL_HOLD - CROWD_CHANCE_HOLD);
    expect(crowdCalls()).toEqual([true, false]);
  });

  it('extends a swell already up rather than raising it again', () => {
    startAMatch();
    mockAudio.setLayer.mockClear();
    nextTickRaises(shot);
    const quiet = quietPitch();
    frames.advance(CROWD_CHANCE_HOLD - 0.5);
    quiet.mockRestore();
    nextTickRaises({ type: 'save', side: 1, caught: false });
    quietPitch();
    frames.advance(1);
    // The first hold would have run out by now; the save carried it on.
    expect(crowdCalls()).toEqual([true]);
    frames.advance(CROWD_CHANCE_HOLD);
    expect(crowdCalls()).toEqual([true, false]);
  });

  it('does not count paused time against the hold', () => {
    startAMatch();
    mockAudio.setLayer.mockClear();
    nextTickRaises(shot);
    quietPitch();
    document.getElementById('btn-pause')!.click();
    frames.advance(CROWD_CHANCE_HOLD + 1);
    expect(crowdCalls()).toEqual([true]);
  });

  it('goes down with the half-time whistle', () => {
    startAMatch();
    nextTickRaises(shot);
    nextTickRaises({ type: 'halfTime' });
    expect(crowdCalls().at(-1)).toBe(false);
  });

  it('rises for each penalty in a shootout', () => {
    startAMatch();
    endLevelWithShootout();
    mockAudio.setLayer.mockClear();
    vi.spyOn(shootoutModule, 'tickShootout').mockImplementationOnce(() => [
      { type: 'kick', kick: { side: 0, zone: 0, keeperZone: 2, result: 'scored' } }
    ]);
    frames.step(1);
    expect(crowdCalls()).toEqual([true]);
  });
});
