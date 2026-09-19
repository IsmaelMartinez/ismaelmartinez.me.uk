/**
 * Shared scaffolding for the suites that drive a cabinet through its real page
 * wiring under jsdom, in the manner of `seeded-random.ts` and
 * `board-fixtures.ts`. Each helper here was copied verbatim into five or more
 * suites before this module existed, and the copies had already drifted: the
 * high-score panel fixture in three of them lacked the `.hs-record` line the
 * component carries, and none of the four had the two `data-t-score-*`
 * attributes it grew for the 429 and out-of-range notices.
 *
 * Nothing here is asserted on; it is the environment the assertions run in.
 * Every stub installed through `vi.stubGlobal` is retired by the calling
 * suite's own `vi.unstubAllGlobals()`, so the installers are meant to run in
 * `beforeEach`, not once per file.
 */
import { vi } from 'vitest';

/**
 * Minimal in-memory localStorage stand-in. Node's own experimental
 * `localStorage` global (undefined without --localstorage-file) shadows
 * jsdom's, so the real one is unreachable from a test whichever environment
 * the file runs under. Returns the backing store for suites that seed or
 * inspect keys directly.
 */
export function installLocalStorage(): Record<string, string> {
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
  return store;
}

/**
 * A 2D context that swallows every call. jsdom implements no canvas backend
 * and the render loop only has to not throw. The factories return the shapes
 * a game reads back (`addColorStop`, an ImageData's `.data`, a text width);
 * property writes are kept so a read-back of `fillStyle` and the like sees
 * what was set, which is the superset of what the per-suite copies did.
 */
export function stubContext(): CanvasRenderingContext2D {
  const gradient = { addColorStop: () => {} };
  const own: Record<string, unknown> = {};
  return new Proxy(own, {
    get(target, prop) {
      if (prop in target) return target[prop as string];
      if (prop === 'measureText') return () => ({ width: 8 });
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return () => gradient;
      if (prop === 'createImageData') {
        return (w: number, h: number) => ({
          data: new Uint8ClampedArray(w * h * 4),
          width: w,
          height: h
        });
      }
      return () => undefined;
    },
    set(target, prop, value) {
      target[prop as string] = value;
      return true;
    }
  }) as unknown as CanvasRenderingContext2D;
}

/**
 * Points every canvas's `getContext` at `stubContext`. Returns a restore for
 * the suites that put the prototype back in `afterEach`; the patch is a plain
 * assignment rather than a spy, so `vi.restoreAllMocks()` does not undo it.
 */
export function installCanvasContext(): () => void {
  const real = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = (() =>
    stubContext()) as unknown as HTMLCanvasElement['getContext'];
  return () => {
    HTMLCanvasElement.prototype.getContext = real;
  };
}

/**
 * The two things jsdom leaves out that the engine touches on the way to a
 * frame: `matchMedia` (the hi-DPI helper watches a resolution query to catch
 * a monitor change) and `scrollIntoView` (the scoreboard scrolls the lit row
 * into view on commit).
 *
 * `matches` is `false` by default. The helper only reads `media` when
 * `matches` is true, so echoing the query back is safe for both settings; a
 * suite that passes `matches: true` gets a query that already matches, which
 * keeps the watcher from re-arming on every resize.
 */
export function installJsdomShims({ matches = false }: { matches?: boolean } = {}): void {
  vi.stubGlobal('matchMedia', (media: string) => ({
    media,
    matches,
    addEventListener: () => {},
    removeEventListener: () => {}
  }));
  Element.prototype.scrollIntoView = vi.fn();
}

/** The frame cap `createGameLoop` clamps a frame's delta to, in milliseconds. */
const FRAME_MS = 250;

export interface FrameDriver {
  /** Stubs `requestAnimationFrame`/`cancelAnimationFrame` afresh and forgets any pending frame. */
  install(): void;
  /**
   * Starts the hand-driven clock at `performance.now()`. Call *after* the
   * game's init: the loop seeds its own `last` from that reading when it
   * starts, and a clock behind it makes the first frame's delta hugely
   * negative, leaving the accumulator so far behind that no simulation step
   * ever runs. Starting at or after it lands every frame's delta on the
   * loop's own cap, so tick counts are exact whenever the file happens to be
   * scheduled.
   */
  syncClock(): void;
  /**
   * Runs the loop forward over `seconds` of wall time, one capped frame at a
   * time, and fails if the loop is not running.
   */
  advance(seconds: number): void;
  /**
   * Runs `frames` capped frames, consuming each pending callback as it goes;
   * a stopped loop is simply not stepped. Each frame is exactly 15 fixed
   * steps (250 / (1000/60)) with nothing left in the accumulator.
   */
  step(frames?: number): void;
}

/**
 * Drives `createGameLoop`'s requestAnimationFrame by hand. Create once per
 * file so the module-level helpers can close over `advance`/`step`; `install`
 * goes in `beforeEach` because the suite's `vi.unstubAllGlobals()` retires
 * the stubs after every test.
 */
export function createFrameDriver(): FrameDriver {
  let pending: FrameRequestCallback | null = null;
  let clock = 0;
  return {
    install() {
      pending = null;
      vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
        pending = cb;
        return 1;
      });
      vi.stubGlobal('cancelAnimationFrame', () => {
        pending = null;
      });
    },
    syncClock() {
      clock = performance.now();
    },
    advance(seconds) {
      const frames = Math.ceil((seconds * 1000) / FRAME_MS);
      for (let i = 0; i < frames; i++) {
        const cb = pending;
        if (!cb) throw new Error('game loop is not running');
        clock += FRAME_MS;
        cb(clock);
      }
    },
    step(frames = 1) {
      for (let i = 0; i < frames; i++) {
        clock += FRAME_MS;
        const cb = pending;
        pending = null;
        cb?.(clock);
      }
    }
  };
}

/**
 * The runtime skeleton of `HighScoreTable.astro`'s panel, element for element
 * and attribute for attribute, so a fixture cannot silently lack something
 * `initScoreboard` looks up. The copy is fixture copy, not the translations:
 * the suites assert on these strings, and the component's are localized at
 * build time.
 */
export function hsPanelHtml(gameId: string): string {
  return `
      <div class="hs-panel" id="highscores" data-hs-game="${gameId}" hidden
           data-t-world-loading="Loading world board"
           data-t-world-unavailable="World board unavailable"
           data-t-world-rank="World rank #{rank}"
           data-t-score-not-saved="Score not saved. Try again later"
           data-t-score-rate-limited="Too many scores submitted. Try again later"
           data-t-score-out-of-range="Score is off the scale. The board cannot hold it">
        <form class="hs-entry" hidden>
          <p class="hs-new">New high score!</p>
          <label class="hs-prompt" for="hs-input-${gameId}">Enter your initials</label>
          <div class="hs-entry-row">
            <input id="hs-input-${gameId}" class="hs-input" type="text" maxlength="3" />
            <button type="submit" class="hs-ok">OK</button>
          </div>
        </form>
        <p class="hs-record" hidden>New personal best!</p>
        <h3 class="hs-title">World high scores</h3>
        <ol class="hs-list" aria-live="polite"></ol>
        <p class="hs-empty" hidden></p>
        <p class="hs-note" hidden></p>
      </div>`;
}

/**
 * Parses a static fixture into the document body, replacing whatever the last
 * test left there. Parsed rather than assigned so no live node ever renders
 * it. With `canvasSize`, `#game-canvas` is given that layout box (jsdom lays
 * nothing out), logical size equal to CSS size, so pointer coordinates in the
 * suite are logical ones through the hi-DPI helper's `toLogical`.
 */
export function mountHtml(html: string, { canvasSize }: { canvasSize?: [number, number] } = {}): void {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  document.body.replaceChildren(...parsed.body.children);
  if (canvasSize) {
    const [width, height] = canvasSize;
    const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    canvas.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width, height, right: width, bottom: height, x: 0, y: 0 }) as DOMRect;
  }
}

/**
 * Sends a key the way a browser would: from whatever holds focus, bubbling
 * and cancellable. Returns the event so a caller can assert the page's own
 * default (the browser's Tab, which jsdom does not implement) was suppressed.
 */
export function pressKey(target: EventTarget, key: string): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
}

/** Lets every settled promise's continuation run before the next assertion. */
export const flush = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

/**
 * The shape a suite hands `vi.mock('../../src/games/engine/globalScores', …)`.
 * `vi.mock` itself has to stay in each file (it is hoisted above the imports
 * there), but the factory can be `async () => (await import('./dom-helpers')).mockGlobalScores()`.
 * The defaults are placeholders: every suite re-sets both in `beforeEach`.
 */
export function mockGlobalScores() {
  return {
    fetchGlobal: vi.fn(async () => null),
    submitGlobal: vi.fn(async () => ({ status: 'failed' as const }))
  };
}
