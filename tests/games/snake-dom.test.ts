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
import { stepInterval } from '../../src/games/snake/logic';
import { BASE_TEMPO, tempoForStep } from '../../src/games/snake/music';
import {
  createFrameDriver,
  installCanvasContext,
  installJsdomShims,
  installLocalStorage,
  mountHtml,
  pressKey
} from './dom-helpers';

/**
 * Mocked so the audio suites below (issues #368 and #380) can observe the
 * music calls without a real AudioContext. Harmless to every other test in
 * this file: none of them assert on sound.
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
  setPaused: vi.fn(),
  playStinger: vi.fn(() => true),
  dispose: vi.fn()
}));

vi.mock('../../src/games/engine/audio', async importOriginal => {
  const actual = await importOriginal<typeof import('../../src/games/engine/audio')>();
  return { ...actual, createGameAudio: vi.fn(() => mockAudio) };
});

/**
 * Where the apples go. 'ahead' drops every apple on the cell in front of the
 * head, so a run left to go straight eats on every step: the snake opens at
 * x = 10 heading right, so it eats nine apples along its row and dies at the
 * wall on the tenth step. 'away' puts it in the corner, off that row, so the
 * same run eats nothing. Either way it is the game's own `step` doing the
 * eating, and so its own apple count, step interval and arena ladder the
 * music follows. Null leaves the apples where the game put them.
 */
const feed = vi.hoisted(() => ({ mode: null as 'ahead' | 'away' | null }));

vi.mock('../../src/games/snake/logic', async importOriginal => {
  const actual = await importOriginal<typeof import('../../src/games/snake/logic')>();
  type State = ReturnType<typeof actual.createSnakeState>;
  const placeAhead = (s: State) => {
    if (feed.mode === 'ahead') s.food = { x: s.snake[0].x + s.direction.x, y: s.snake[0].y + s.direction.y };
    if (feed.mode === 'away') s.food = { x: 0, y: 0 };
  };
  return {
    ...actual,
    createSnakeState: (random?: () => number) => {
      const s = actual.createSnakeState(random);
      placeAhead(s);
      return s;
    },
    step: (s: State, random?: () => number) => {
      const event = actual.step(s, random);
      placeAhead(s);
      return event;
    }
  };
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
  feed.mode = null;
  for (const fn of Object.values(mockAudio)) fn.mockClear();
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

describe('Snake pause muffles the music rather than stopping it (#368, #380)', () => {
  it('pauses the score in place and unpauses it without a restart', () => {
    document.getElementById('start-btn')!.click();
    expect(mockAudio.start).toHaveBeenCalledTimes(1);

    press('p');
    expect(mockAudio.setPaused).toHaveBeenLastCalledWith(true);
    press('p');
    expect(mockAudio.setPaused).toHaveBeenLastCalledWith(false);
    // A stop and a start would have gone back to the top of the pass.
    expect(mockAudio.stop).not.toHaveBeenCalled();
    expect(mockAudio.start).toHaveBeenCalledTimes(1);
  });
});

describe('Snake music follows the snake (#380)', () => {
  /** The tempos the game has asked for since the run began, in order. */
  const tempos = () => mockAudio.setTempo.mock.calls.map(([bpm]) => bpm as number);

  it('opens every run at the base tempo', () => {
    document.getElementById('start-btn')!.click();
    expect(tempos()).toEqual([BASE_TEMPO]);
    // The base tempo is set before the music starts, so a run never opens at the last one's pace.
    expect(mockAudio.setTempo.mock.invocationCallOrder[0]).toBeLessThan(mockAudio.start.mock.invocationCallOrder[0]);
  });

  it('winds the tempo up on every apple, to the tempo of the step the snake is on', () => {
    feed.mode = 'ahead';
    document.getElementById('start-btn')!.click();
    advance(6);
    expect(gameOverShown()).toBe(true);
    // Nine apples along the row, one tempo each, following the step interval.
    const expected = Array.from({ length: 9 }, (_, i) => tempoForStep(stepInterval(i + 1)));
    expect(tempos()).toEqual([BASE_TEMPO, ...expected]);
    expect(expected[8]).toBeGreaterThan(BASE_TEMPO);
  });

  it('leaves the tempo alone on a step that eats nothing', () => {
    feed.mode = 'away';
    document.getElementById('start-btn')!.click();
    advance(6);
    expect(gameOverShown()).toBe(true);
    expect(tempos()).toEqual([BASE_TEMPO]);
  });

  it('plays the walls stinger when the eighth apple brings the first rung', () => {
    feed.mode = 'ahead';
    document.getElementById('start-btn')!.click();
    advance(6);
    expect(mockAudio.playStinger.mock.calls).toEqual([['walls']]);
    // It came on the eighth apple's step: after that step's tempo change (call 8) and before the ninth's.
    const order = (fn: { mock: { invocationCallOrder: number[] } }, i: number) => fn.mock.invocationCallOrder[i];
    expect(order(mockAudio.playStinger, 0)).toBeGreaterThan(order(mockAudio.setTempo, 8));
    expect(order(mockAudio.playStinger, 0)).toBeLessThan(order(mockAudio.setTempo, 9));
  });

  it('starts the next run back at the base tempo', () => {
    feed.mode = 'ahead';
    document.getElementById('start-btn')!.click();
    advance(6);
    mockAudio.setTempo.mockClear();
    document.getElementById('restart-btn')!.click();
    expect(tempos()).toEqual([BASE_TEMPO]);
    expect(mockAudio.setPaused).toHaveBeenLastCalledWith(false);
  });
});
