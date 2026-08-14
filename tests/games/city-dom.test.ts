/** @vitest-environment jsdom */
/**
 * Microcity's terminal path, driven through the real page wiring.
 *
 * The defect these tests pin (issue #257): bankruptcy used to be the only way
 * out of a run, so `board.show()` — and with it every submission — was reached
 * exclusively by cities that had failed. A player whose city thrived could
 * never post a score and never even see the leaderboard, which lives inside
 * the game-over overlay. Measured over 25 audit runs, the survivors were
 * precisely the high scorers and none of them submitted anything.
 *
 * So the assertions below are about a *surviving* city reaching submission:
 * the treasury stays positive throughout, and the run still charts. Asserting
 * only that a retire button exists would not have caught it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { initCityGame } from '../../src/games/city';
import { fetchGlobal, submitGlobal } from '../../src/games/engine/globalScores';
import { doneKey } from '../../src/games/engine/progress';
import { CITY_W, CITY_H } from '../../src/games/city/tiles';

vi.mock('../../src/games/engine/globalScores', () => ({
  fetchGlobal: vi.fn(async () => null),
  submitGlobal: vi.fn(async () => ({ status: 'ok', rank: 1, table: [] }))
}));

// Mirrors the projection constants in src/games/city/game.ts, which are
// module-private. Tile picking below goes through the engine's own isoProject
// rather than re-deriving the isometric maths.
const HALF_W = 20;
const HALF_H = 10;
const ORIGIN_X = CITY_H * HALF_W;
const ORIGIN_Y = 60;
const CANVAS_W = (CITY_W + CITY_H) * HALF_W;
const CANVAS_H = (CITY_W + CITY_H) * HALF_H + ORIGIN_Y + 10;

/**
 * The runtime skeleton of src/pages/[lang]/fun/city.astro — every element the
 * game module looks up, and nothing else. A static fixture, parsed rather than
 * assigned, so no live node ever renders it.
 */
const PAGE_HTML = `
  <div id="city-root"
       data-t-retired="City Retired"
       data-t-retired-desc="You called time on a solvent city.">
    <span id="money">£2500</span>
    <span id="population">0</span>
    <span id="jobs">0</span>
    <span id="month">1</span>
    <span id="record">0</span>
    <span id="objective"></span>
    <div id="canvas-scroll"><canvas id="game-canvas"></canvas></div>
    <div id="toast-area"></div>
    <div id="start-overlay"><button id="start-btn">Found</button></div>
    <div id="over-overlay" style="display: none;">
      <span id="over-icon">💸</span>
      <h2 id="over-title">Bankrupt!</h2>
      <p id="over-desc">The city treasury ran dry.</p>
      <p><strong id="final-months">0</strong><strong id="final-pop">0</strong></p>
      <div class="hs-panel" id="highscores" data-hs-game="city" hidden
           data-t-world-loading="Loading world board"
           data-t-world-unavailable="World board unavailable"
           data-t-world-rank="World rank #{rank}"
           data-t-score-not-saved="Score not saved. Try again later">
        <form class="hs-entry" hidden>
          <input class="hs-input" type="text" maxlength="3" />
          <button type="submit" class="hs-ok">OK</button>
        </form>
        <ol class="hs-list"></ol>
        <p class="hs-empty" hidden></p>
        <p class="hs-note" hidden></p>
      </div>
      <button id="restart-btn">New City</button>
    </div>
    <div id="retire-overlay" style="display: none;" tabindex="-1"
         role="alertdialog" aria-modal="true"
         aria-labelledby="retire-confirm-title" aria-describedby="retire-confirm-desc">
      <h2 id="retire-confirm-title">Retire this city?</h2>
      <p id="retire-confirm-desc">The run ends here.</p>
      <button type="button" id="retire-cancel">Keep building</button>
      <button type="button" id="retire-confirm">Retire city</button>
    </div>
    <div class="toolbar">
      <button class="tool-btn active" data-tool="road"></button>
      <button class="tool-btn" data-tool="res"></button>
      <button class="tool-btn" data-tool="power"></button>
    </div>
    <div class="demand-meter">
      <div id="demand-res"></div><div id="demand-com"></div><div id="demand-ind"></div>
    </div>
    <div class="speed-controls">
      <button class="speed-btn" data-speed="0"></button>
      <button class="speed-btn active" data-speed="1"></button>
      <button class="speed-btn" data-speed="3"></button>
    </div>
    <div class="run-controls">
      <button type="button" id="retire-btn" disabled><span aria-hidden="true">🏁</span> Retire</button>
    </div>
  </div>`;

/**
 * A no-op 2D context. jsdom implements no canvas backend, and the render loop
 * only has to not throw — nothing here is asserted on.
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

function mountPage(): HTMLElement {
  const parsed = new DOMParser().parseFromString(PAGE_HTML, 'text/html');
  document.body.replaceChildren(...parsed.body.children);
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  // Logical size == CSS size, so pointer coordinates below are logical ones.
  canvas.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: CANVAS_W, height: CANVAS_H, right: CANVAS_W, bottom: CANVAS_H, x: 0, y: 0 }) as DOMRect;
  return document.getElementById('city-root')!;
}

/** Selects a tool from the toolbar and clicks the tile at (x, y). */
function buildAt(tool: string, x: number, y: number): void {
  document.querySelector<HTMLButtonElement>(`.tool-btn[data-tool="${tool}"]`)!.click();
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  canvas.dispatchEvent(
    new MouseEvent('click', {
      clientX: ORIGIN_X + (x - y) * HALF_W,
      clientY: ORIGIN_Y + (x + y + 1) * HALF_H,
      bubbles: true
    })
  );
}

const money = () => Number(document.getElementById('money')!.textContent!.replace(/[^\d-]/g, ''));
const finalPop = () => document.getElementById('final-pop')!.textContent;
const panel = () => document.getElementById('highscores')!;
const overlayShown = () =>
  (document.getElementById('over-overlay') as HTMLElement).style.display === 'flex';

const retireBtn = () => document.getElementById('retire-btn') as HTMLButtonElement;
const confirmBtn = () => document.getElementById('retire-confirm') as HTMLButtonElement;
const cancelBtn = () => document.getElementById('retire-cancel') as HTMLButtonElement;
const promptShown = () =>
  (document.getElementById('retire-overlay') as HTMLElement).style.display === 'flex';
const monthShown = () => document.getElementById('month')!.textContent;

/** Sends a key the way a player's keyboard would: from inside the dialog, bubbling. */
function pressInPrompt(key: string): void {
  document
    .getElementById('retire-overlay')!
    .dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

/**
 * Retires the run the only way a player can: open the prompt, then confirm.
 * Every assertion about what retiring *posts* goes through this, so if the
 * guard were ever reduced back to a single click these would still pass —
 * which is why the guard has its own tests below rather than relying on this.
 */
function retire(): void {
  retireBtn().click();
  confirmBtn().click();
}

/**
 * Founds a solvent little city: one power plant, one road, and two homes
 * beside it. Two growth ticks take both homes to level 1 (16 residents), at
 * which point residential demand hits zero and the population settles — no
 * month boundary is crossed, so the treasury is never touched again.
 *
 * Terrain generation and the simulation both draw on Math.random, so each
 * phase runs under a constant that fixes the outcome: 0.9 rolls a coastline
 * down the left four columns and no forest (leaving the build sites clear),
 * and 0.05 clears the growth roll (demand 16/70) while staying above every
 * disaster's ceiling (fire ignition caps at 0.02, and month 1 is inside the
 * disaster and event grace periods).
 */
function foundCity(): void {
  vi.spyOn(Math, 'random').mockReturnValue(0.9);
  document.getElementById('start-btn')!.click();
  vi.spyOn(Math, 'random').mockReturnValue(0.05);
  buildAt('power', 10, 7);
  buildAt('road', 10, 8);
  buildAt('res', 9, 8);
  buildAt('res', 11, 8);
  advance(3);
}

beforeEach(() => {
  installLocalStorage();
  vi.clearAllMocks();
  vi.mocked(fetchGlobal).mockResolvedValue(null);
  vi.mocked(submitGlobal).mockResolvedValue({ status: 'ok', rank: 1, table: [] });
  Element.prototype.scrollIntoView = vi.fn();
  // jsdom implements neither of these; the canvas helper watches DPR changes
  // through matchMedia and the game paints through a 2D context.
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
  mountPage();
  initCityGame();
  // The loop seeds its own `last` from performance.now() when it starts, which
  // initCityGame has just done. Starting the hand-driven clock at zero would
  // make the first frame's delta `250 - <process uptime>` — hugely negative,
  // leaving the accumulator so far behind that no simulation step ever runs.
  // The suite only got away with it while this file happened to be scheduled
  // early. Starting at or after that same reading makes every frame's delta
  // land on the loop's own 250ms cap, so tick counts are exact whenever the
  // file runs.
  clock = performance.now();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Microcity retire control', () => {
  it('lets a solvent city end its run and reach the shared board', async () => {
    foundCity();
    expect(document.getElementById('population')!.textContent).toBe('16');
    // The whole point: this city is not failing. Bankruptcy — the only
    // terminal state before the fix — is nowhere in sight.
    expect(money()).toBeGreaterThan(0);
    expect(overlayShown()).toBe(false);

    expect(retireBtn().disabled).toBe(false);
    retire();

    expect(money()).toBeGreaterThan(0);
    expect(overlayShown()).toBe(true);
    expect(document.getElementById('over-title')!.textContent).toBe('City Retired');
    expect(finalPop()).toBe('16');
    // The leaderboard is inside this overlay, so opening it is what makes the
    // board visible to a player who was never going bankrupt.
    expect(panel().hidden).toBe(false);

    const form = document.querySelector<HTMLFormElement>('.hs-entry')!;
    expect(form.hidden).toBe(false);
    document.querySelector<HTMLInputElement>('.hs-input')!.value = 'IMR';
    form.dispatchEvent(new Event('submit', { cancelable: true }));

    expect(submitGlobal).toHaveBeenCalledWith('city', 'IMR', 16);
    expect(localStorage.getItem(doneKey('city'))).toBe('1');
  });

  it('posts the same peak population a bankruptcy would', async () => {
    foundCity();
    const retiredPop = (() => {
      retire();
      return finalPop();
    })();
    expect(submitGlobal).not.toHaveBeenCalled();
    document.querySelector<HTMLInputElement>('.hs-input')!.value = 'IMR';
    document
      .querySelector<HTMLFormElement>('.hs-entry')!
      .dispatchEvent(new Event('submit', { cancelable: true }));
    const retiredScore = vi.mocked(submitGlobal).mock.calls[0][2];

    // Same city, same population, run into the ground instead: three more
    // power plants leave the treasury unable to cover its own upkeep, and it
    // goes negative at the month-4 books.
    vi.mocked(submitGlobal).mockClear();
    document.getElementById('restart-btn')!.click();
    foundCity();
    buildAt('power', 14, 7);
    buildAt('power', 16, 7);
    buildAt('power', 18, 7);
    advance(70);

    expect(money()).toBeLessThan(0);
    expect(overlayShown()).toBe(true);
    expect(document.getElementById('over-title')!.textContent).toBe('Bankrupt!');
    document.querySelector<HTMLInputElement>('.hs-input')!.value = 'IMR';
    document
      .querySelector<HTMLFormElement>('.hs-entry')!
      .dispatchEvent(new Event('submit', { cancelable: true }));

    // Retiring is neither a discount nor a bonus: both terminal paths post
    // peakPop, so the control cannot be farmed for a score the city never had.
    expect(finalPop()).toBe(retiredPop);
    expect(vi.mocked(submitGlobal).mock.calls[0][2]).toBe(retiredScore);
  });

  it('banks nothing for a city that never grew', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9);
    document.getElementById('start-btn')!.click();
    retire();

    expect(finalPop()).toBe('0');
    expect(document.querySelector<HTMLFormElement>('.hs-entry')!.hidden).toBe(true);
    expect(submitGlobal).not.toHaveBeenCalled();
  });

  it('does nothing before a run has started', () => {
    expect(retireBtn().disabled).toBe(true);
    retireBtn().click();

    expect(promptShown()).toBe(false);
    expect(overlayShown()).toBe(false);
    expect(panel().hidden).toBe(true);
    expect(submitGlobal).not.toHaveBeenCalled();
  });
});

/**
 * The guard. Retiring is irreversible and the control sits among buttons a
 * player uses constantly, so a single stray click must not be able to end a
 * city that took minutes to build. These tests are about the click that does
 * *not* end the run: what the first one does instead, and that the city on the
 * other side of a cancel is the same city, still running.
 */
describe('Microcity retire confirmation', () => {
  it('asks first: one click on Retire ends nothing', () => {
    foundCity();
    retireBtn().click();

    expect(promptShown()).toBe(true);
    // Nothing terminal has happened: no overlay, no board, no submission.
    expect(overlayShown()).toBe(false);
    expect(panel().hidden).toBe(true);
    expect(submitGlobal).not.toHaveBeenCalled();
  });

  it('holds the run still while it asks, so nothing can end it behind the prompt', () => {
    foundCity();
    const before = money();
    retireBtn().click();

    // A stray build lands on the canvas under the prompt, and a whole month of
    // wall time passes. Both are no-ops: the simulation is paused, which is
    // what stops a bankruptcy from firing a second overlay behind this one.
    buildAt('road', 10, 9);
    advance(25);

    expect(monthShown()).toBe('1');
    expect(money()).toBe(before);
    expect(overlayShown()).toBe(false);
  });

  it('cancelling leaves the run live and unharmed', () => {
    foundCity();
    const before = money();
    const peak = document.getElementById('population')!.textContent;

    retireBtn().click();
    cancelBtn().click();

    expect(promptShown()).toBe(false);
    expect(overlayShown()).toBe(false);
    expect(panel().hidden).toBe(true);
    expect(submitGlobal).not.toHaveBeenCalled();
    expect(retireBtn().disabled).toBe(false);

    // The city is buildable again, so the run really did come back rather than
    // being left paused — and it still ends on the peak it had before the scare.
    buildAt('road', 10, 9);
    advance(0.25); // the treasury readout is painted by the loop, not the click
    expect(money()).toBe(before - 10);

    retire();
    expect(overlayShown()).toBe(true);
    expect(finalPop()).toBe(peak);
  });

  it('cancels on Escape', () => {
    foundCity();
    retireBtn().click();
    pressInPrompt('Escape');

    expect(promptShown()).toBe(false);
    expect(overlayShown()).toBe(false);
    expect(submitGlobal).not.toHaveBeenCalled();
  });

  it('opens on the safe answer and hands focus back on cancel', () => {
    foundCity();
    retireBtn().click();
    // Cancel takes focus, so the key a keyboard user presses first keeps the city.
    expect(document.activeElement).toBe(cancelBtn());

    // Tab stays inside the two answers rather than escaping to the toolbar.
    pressInPrompt('Tab');
    expect(document.activeElement).toBe(confirmBtn());
    pressInPrompt('Tab');
    expect(document.activeElement).toBe(cancelBtn());

    cancelBtn().click();
    expect(document.activeElement).toBe(retireBtn());
  });

  it('ends the run only on the second, deliberate click', () => {
    foundCity();
    retireBtn().click();
    confirmBtn().click();

    expect(promptShown()).toBe(false);
    expect(overlayShown()).toBe(true);
    expect(document.getElementById('over-title')!.textContent).toBe('City Retired');
    expect(finalPop()).toBe('16');
  });
});
