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

/**
 * A no-op 2D context, as in city-dom.test.ts: jsdom implements no canvas
 * backend and the render loop only has to not throw.
 */
function stubContext(): CanvasRenderingContext2D {
  const gradient = { addColorStop: () => {} };
  const own: Record<string, unknown> = {};
  return new Proxy(own, {
    get(target, prop) {
      if (prop in target) return target[prop as string];
      if (prop === 'measureText') return () => ({ width: 8 });
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return () => gradient;
      return () => undefined;
    },
    set(target, prop, value) {
      target[prop as string] = value;
      return true;
    }
  }) as unknown as CanvasRenderingContext2D;
}

/** In-memory localStorage, as in scoreboard-dom.test.ts (Node's own global shadows jsdom's). */
function installLocalStorage(): void {
  const store: Record<string, string> = {};
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => {
      store[k] = String(v);
    },
    removeItem: (k: string) => {
      delete store[k];
    },
    clear: () => {
      for (const k of Object.keys(store)) delete store[k];
    }
  });
}

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

function press(key: string): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  document.dispatchEvent(event);
  return event;
}

const GAME_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd'];

let frameCallback: FrameRequestCallback | null = null;
let clock = 0;

/** Runs the game loop forward over `seconds` of wall time, 250ms per frame (its own cap). */
function advance(seconds: number): void {
  const frames = Math.ceil((seconds * 1000) / 250);
  for (let i = 0; i < frames; i++) {
    const cb = frameCallback;
    if (!cb) throw new Error('game loop is not running');
    clock += 250;
    cb(clock);
  }
}

const gameOverShown = () =>
  document.getElementById('game-over-overlay')!.style.display !== 'none';

beforeEach(() => {
  installLocalStorage();
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    media: '',
    addEventListener: () => {},
    removeEventListener: () => {}
  }));
  HTMLCanvasElement.prototype.getContext = (() =>
    stubContext()) as unknown as HTMLCanvasElement['getContext'];
  frameCallback = null;
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    frameCallback = cb;
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {
    frameCallback = null;
  });
  const parsed = new DOMParser().parseFromString(PAGE_HTML, 'text/html');
  document.body.replaceChildren(...parsed.body.children);
  initSnakeGame();
  // The loop seeds its own `last` from performance.now(); starting the
  // hand-driven clock behind that reading would make the first frame's delta
  // hugely negative and no simulation step would ever run (see city-dom).
  clock = performance.now();
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
