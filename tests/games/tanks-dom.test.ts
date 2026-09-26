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
import { STINGER_SECONDS } from '../../src/games/tanks/music';
import * as matchModule from '../../src/games/tanks/match';
import {
  createFrameDriver,
  installCanvasContext,
  installJsdomShims,
  installLocalStorage,
  mountHtml
} from './dom-helpers';

/**
 * Built inside `vi.hoisted` because the mock factory below runs when
 * `initTanksGame`'s own import of the engine's audio module is resolved,
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
  vi.useRealTimers();
  for (const fn of Object.values(mockAudio)) fn.mockClear();
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

/** The real `tickMatch`, taken before any test spies on it. */
const realTick = matchModule.tickMatch;

/**
 * Ends the round through the match's own rules: the losing tank's armour is
 * gone and its shell has landed, so the next real tick ends the turn, and
 * `finishRound` tallies the win, decides whether the match is over and fires
 * `roundOver`, exactly as a killing shot would. `both` is a mutual destruction.
 */
function loseRound(loser: 0 | 1 | 'both'): void {
  vi.spyOn(matchModule, 'tickMatch').mockImplementationOnce((m, dt) => {
    for (const i of loser === 'both' ? [0, 1] : [loser]) m.tanks[i].hp = 0;
    m.shots = [];
    m.blasts = [];
    m.phase = 'fly';
    realTick(m, dt);
  });
  frames.step(1);
}

const click = (id: string) => document.getElementById(id)!.click();
const nextRound = () => click('next-round-btn');

describe('Tank Duel music answers the match (#379)', () => {
  beforeEach(() => {
    // Only the timers: the frame driver owns the clock the game loop reads.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });

  it('plays the won stinger when the player takes a round, then muffles the bed behind the overlay', () => {
    click('vs-cpu-btn');
    loseRound(1);

    expect(mockAudio.playStinger).toHaveBeenCalledTimes(1);
    expect(mockAudio.playStinger).toHaveBeenCalledWith('roundWon');
    // The pause filter would muffle the stinger too, so it waits for it.
    vi.advanceTimersByTime(STINGER_SECONDS * 1000 - 1);
    expect(mockAudio.setPaused).not.toHaveBeenCalledWith(true);
    vi.advanceTimersByTime(1);
    expect(mockAudio.setPaused).toHaveBeenLastCalledWith(true);

    nextRound();
    expect(mockAudio.setPaused).toHaveBeenLastCalledWith(false);
    expect(mockAudio.stop).not.toHaveBeenCalled();
  });

  it('plays the lost stinger when the CPU takes a round', () => {
    click('vs-cpu-btn');
    loseRound(0);

    expect(mockAudio.playStinger).toHaveBeenCalledTimes(1);
    expect(mockAudio.playStinger).toHaveBeenCalledWith('roundLost');
  });

  it.each([0, 1] as const)('plays the neutral stinger whoever takes a two-player round (loser %i)', loser => {
    click('two-player-btn');
    loseRound(loser);

    expect(mockAudio.playStinger).toHaveBeenCalledTimes(1);
    expect(mockAudio.playStinger).toHaveBeenCalledWith('round');
  });

  it('plays the neutral stinger for a mutual destruction against the CPU', () => {
    click('vs-cpu-btn');
    loseRound('both');

    expect(mockAudio.playStinger).toHaveBeenCalledTimes(1);
    expect(mockAudio.playStinger).toHaveBeenCalledWith('round');
  });

  it('leaves the bed unmuffled when the next round starts before the stinger has finished', () => {
    click('vs-cpu-btn');
    loseRound(1);
    nextRound();
    vi.advanceTimersByTime(STINGER_SECONDS * 1000);

    expect(mockAudio.setPaused).not.toHaveBeenCalledWith(true);
  });

  it.each([
    ['the player', 1],
    ['the CPU', 0]
  ] as const)('switches to Sudden Death and brings the drums in when %s reaches match point', (_, loser) => {
    click('vs-cpu-btn');
    loseRound(loser);
    nextRound();
    // One round up is not match point: no danger, and the drums stay out.
    expect(mockAudio.setDanger).toHaveBeenLastCalledWith(false);
    expect(mockAudio.setLayer).not.toHaveBeenCalledWith('drums', true);

    loseRound(loser);
    nextRound();
    expect(mockAudio.setDanger).toHaveBeenLastCalledWith(true);
    expect(mockAudio.setLayer).toHaveBeenLastCalledWith('drums', true);
  });

  it('ends the match on the effects sting and a stop, with no round stinger and no muffle', () => {
    click('vs-cpu-btn');
    loseRound(1);
    nextRound();
    loseRound(1);
    nextRound();
    mockAudio.playStinger.mockClear();
    mockAudio.setPaused.mockClear();

    loseRound(1);
    vi.advanceTimersByTime(STINGER_SECONDS * 1000);
    expect(mockAudio.playSfx).toHaveBeenCalledWith('score');
    expect(mockAudio.stop).toHaveBeenCalledTimes(1);
    expect(mockAudio.playStinger).not.toHaveBeenCalled();
    expect(mockAudio.setPaused).not.toHaveBeenCalledWith(true);
  });

  it('takes Sudden Death and the drums away again for a new match', () => {
    click('vs-cpu-btn');
    loseRound(1);
    nextRound();
    loseRound(1);
    nextRound();
    loseRound(1);
    click('play-again-btn');
    click('vs-cpu-btn');

    expect(mockAudio.setDanger).toHaveBeenLastCalledWith(false);
    expect(mockAudio.setLayer).toHaveBeenLastCalledWith('drums', false);
  });
});
