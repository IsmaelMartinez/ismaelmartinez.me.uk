/** @vitest-environment jsdom */
/**
 * Critter Rescue's *own* end conditions, driven through the real game loop.
 *
 * The headless playthrough harness in lemmings.test.ts re-implements the loop
 * so it can play twenty-five levels in milliseconds, which means it proves the
 * levels are solvable but proves nothing about game.ts — the module that
 * actually decides when a level is over. That gap is what let a level hang in
 * the browser while the whole suite stayed green. These tests close it: they
 * mount the page's markup, call `initLemmingsGame`, and step the loop frame by
 * frame, so the assertions below fail if `update`'s end conditions change.
 *
 * jsdom has no canvas, so `getContext` is stubbed with a do-nothing 2D context
 * (the game's drawing is not under test here); everything else — the fixed
 * timestep, the overlays, the HUD, the skill taps — is the real thing.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { initLemmingsGame } from '../../src/games/lemmings/game';
import { LEVELS, LEVEL_W, LEVEL_H } from '../../src/games/lemmings/levels';
import { STUCK_TICKS, ABANDONED_TICKS } from '../../src/games/lemmings/stall';
import { levelBonuses } from '../../src/games/lemmings/score';

const SKILLS = ['blocker', 'digger', 'basher', 'builder', 'floater', 'bomber'];

/**
 * The page's markup (src/pages/[lang]/fun/lemmings.astro), trimmed to what the
 * game wires. Static fixture text, parsed rather than assigned so no live node
 * ever renders it.
 */
const GAME_HTML = `
  <div id="lemmings-root"
       data-t-complete="Level Complete!"
       data-t-failed="Not Enough Rescued"
       data-t-time-up="Time Up!"
       data-t-stalled="Rescue Stalled"
       data-t-victory="Every Critter Home!"
       data-t-complete-desc="You rescued {n} of {m}!"
       data-t-failed-desc="Only {n} of {m} made it. Try again!"
       data-t-victory-desc="You cleared every level!"
       data-t-level="Level"
       data-t-locked="Locked">
    <button id="music-btn"></button>
    <button id="sfx-btn"></button>
    <span id="level-num">1</span>
    <span id="saved-count">0</span>
    <span id="needed-count">0</span>
    <span id="out-count">0</span>
    <span id="run-score">0</span>
    <span id="best-level">0</span>
    <div id="progress-bar" role="progressbar" aria-valuenow="0" aria-valuemax="1">
      <div id="progress-fill"></div>
    </div>
    <canvas id="game-canvas"></canvas>
    <div id="start-overlay">
      <button id="start-btn"></button>
      <button id="level-select-btn"></button>
    </div>
    <div id="level-select-overlay" style="display: none;">
      <div id="level-grid"></div>
      <button id="level-back-btn"></button>
    </div>
    <div id="result-overlay" style="display: none;">
      <span id="result-emoji"></span>
      <h2 id="result-title"></h2>
      <p id="result-desc"></p>
      <ul>
        <li id="bonus-time-row" hidden><span id="bonus-time-val"></span></li>
        <li id="bonus-perfect-row" hidden><span id="bonus-perfect-val"></span></li>
        <li id="bonus-quota-row" hidden><span id="bonus-quota-val"></span></li>
      </ul>
      <span id="result-score-val">0</span>
      <button id="next-btn"></button>
      <button id="retry-btn"></button>
    </div>
    <p id="level-hint" hidden></p>
    <div class="skill-bar">
      ${SKILLS.map(
        s => `<button class="skill-btn" data-skill="${s}"><span class="skill-count">0</span></button>`
      ).join('')}
    </div>
    <input type="range" id="spawn-slider" min="1" max="10" value="1" />
    <button id="nuke-btn"></button>
  </div>`;

/**
 * A 2D context that swallows every call. The gradient and ImageData factories
 * return the shapes the game actually reads back (`addColorStop`, `.data`);
 * everything else is a no-op, which is all the drawing needs to be for the
 * simulation to run.
 */
function stubContext(): CanvasRenderingContext2D {
  const gradient = { addColorStop: () => {} };
  return new Proxy(
    {},
    {
      get: (_target, prop) => {
        if (prop === 'createLinearGradient' || prop === 'createRadialGradient') {
          return () => gradient;
        }
        if (prop === 'createImageData') {
          return (w: number, h: number) => ({
            data: new Uint8ClampedArray(w * h * 4),
            width: w,
            height: h
          });
        }
        if (prop === 'measureText') return () => ({ width: 0 });
        return () => {};
      },
      set: () => true
    }
  ) as unknown as CanvasRenderingContext2D;
}

/** Minimal in-memory localStorage, as in scoreboard-dom.test.ts (Node's shadows jsdom's). */
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

/**
 * Drives `createGameLoop`'s requestAnimationFrame by hand. Each frame advances
 * the clock by the loop's own 250ms frame cap, which is exactly 15 fixed steps
 * (250 / (1000/60)) with nothing left in the accumulator — so a frame is always
 * 15 simulation ticks and the tick counts below are exact.
 */
const TICKS_PER_FRAME = 15;

let pendingFrame: FrameRequestCallback | null = null;
let clock = 0;
let realGetContext: typeof HTMLCanvasElement.prototype.getContext;

function step(frames = 1): void {
  for (let i = 0; i < frames; i++) {
    clock += 250;
    const cb = pendingFrame;
    pendingFrame = null;
    cb?.(clock);
  }
}

/** Mounts the page, unlocks every level, and starts the given 0-based level. */
function startLevel(index: number): void {
  const parsed = new DOMParser().parseFromString(GAME_HTML, 'text/html');
  document.body.replaceChildren(...parsed.body.children);
  localStorage.setItem('critter-cleared-levels', String(LEVELS.length));
  initLemmingsGame();
  // After init, so the clock starts at or after the loop's own `last`: every
  // frame's delta is then at least the 250ms cap and lands exactly 15 ticks.
  clock = performance.now();
  // The canvas has no layout in jsdom; give it one so pointer taps map 1:1
  // onto level coordinates through the hi-DPI helper's toLogical.
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  canvas.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: LEVEL_W, height: LEVEL_H }) as DOMRect;
  (document.getElementById('level-select-btn') as HTMLButtonElement).click();
  const cell = document.getElementById('level-grid')!.children[index] as HTMLButtonElement;
  expect(cell.disabled).toBe(false);
  cell.click();
}

const num = (id: string) => Number(document.getElementById(id)!.textContent);
const resultShown = () =>
  (document.getElementById('result-overlay') as HTMLElement).style.display === 'flex';
const skillCount = (skill: string) =>
  Number(document.querySelector(`.skill-btn[data-skill="${skill}"] .skill-count`)!.textContent);

/** Taps the field at a level coordinate, the way a player assigns a skill. */
function tap(x: number, y: number): void {
  document
    .getElementById('game-canvas')!
    .dispatchEvent(new MouseEvent('pointerdown', { clientX: x, clientY: y, cancelable: true }));
}

/** Steps until the level resolves, returning the ticks it took (or null). */
function runUntilResult(maxTicks: number): number | null {
  for (let ticks = TICKS_PER_FRAME; ticks <= maxTicks; ticks += TICKS_PER_FRAME) {
    step();
    if (resultShown()) return ticks;
  }
  return null;
}

beforeEach(() => {
  installLocalStorage();
  realGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = stubContext as unknown as typeof realGetContext;
  pendingFrame = null;
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    pendingFrame = cb;
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {
    pendingFrame = null;
  });
  // jsdom has no matchMedia; the hi-DPI helper watches one to catch a monitor
  // change. A query that already matches keeps it from re-arming.
  vi.stubGlobal('matchMedia', (media: string) => ({
    media,
    matches: true,
    addEventListener: () => {},
    removeEventListener: () => {}
  }));
});

afterEach(() => {
  HTMLCanvasElement.prototype.getContext = realGetContext;
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe('game loop — a level always ends', () => {
  it('ends an untouched level once the field stops changing, framed as a stall', () => {
    // Issue #256's headline repro: level 2 needs a basher, so with no input at
    // all every critter paces between the left wall and the pillar — nobody
    // dies, nobody blocks, and the crowd end condition never matches. The
    // abandoned-field fallback is the only thing that ends it, and this is the
    // test that fails if it stops being applied to untimed levels.
    expect(LEVELS[1].timeLimit).toBeUndefined();
    startLevel(1);

    // The crowd is still spreading out well past the short standstill window,
    // so nothing resolves on the player's behalf while there is anything left
    // to see; the level only gives up after a full minute of a frozen field.
    const ended = runUntilResult(ABANDONED_TICKS * 2);
    expect(ended).not.toBeNull();
    expect(ended!).toBeGreaterThan(ABANDONED_TICKS);
    expect(num('saved-count')).toBe(0);
    expect(document.getElementById('result-title')!.textContent).toBe('Rescue Stalled');
    expect(document.getElementById('result-emoji')!.textContent).toBe('🧱');
  });

  it('ends a timed level on its own clock rather than the fallback', () => {
    const level = LEVELS[13];
    expect(level.timeLimit).toBe(2700);
    startLevel(13);

    step(level.timeLimit! / TICKS_PER_FRAME - 1);
    expect(resultShown()).toBe(false);

    step();
    expect(resultShown()).toBe(true);
    expect(document.getElementById('result-title')!.textContent).toBe('Time Up!');
  });

  /**
   * Level 13 sends two streams at one shared door between two end walls, and is
   * the standstill fixture for both tests below: play it untouched until the
   * quota is home, then wall the left stream off with a blocker so those
   * critters pace a pocket. The level is won, the field is frozen, and what
   * happens next is the whole question.
   *
   * Returns the ticks elapsed when the blocker landed.
   */
  function winAndPenLevel13(): number {
    const level = LEVELS[12];
    expect(level.timeLimit).toBeUndefined();
    startLevel(12);

    let ticks = 0;
    while (num('saved-count') < level.needed && ticks < 3000) {
      step();
      ticks += TICKS_PER_FRAME;
    }
    expect(num('saved-count')).toBeGreaterThanOrEqual(level.needed);
    expect(resultShown()).toBe(false);

    // Tap the left approach until a blocker lands there (blocker is the level's
    // first stocked skill, so it is already the selected one).
    expect(skillCount('blocker')).toBe(2);
    while (skillCount('blocker') === 2 && ticks < 3000) {
      tap(100, 154);
      step();
      ticks += TICKS_PER_FRAME;
    }
    expect(skillCount('blocker')).toBe(1);
    return ticks;
  }

  /** The time bonus the level would pay if it were billed at `ticks`. */
  const bonusAt = (ticks: number) =>
    levelBonuses({
      saved: num('saved-count'),
      needed: LEVELS[12].needed,
      spawnCount: LEVELS[12].spawnCount,
      ticks,
      par: LEVELS[12].par
    }).time;

  it('leaves a won level open while the player still has a skill to spend', () => {
    // The regression: a player who pens the surplus crowd and then reads the
    // terrain for a while is playing, not stalling. Closing the level under
    // them takes every remaining rescue and the perfect bonus with it, so the
    // frozen field alone is not enough — a blocker, a pair of umbrellas and the
    // bomber reserve are all still in hand here, and the level must wait.
    const ticks = winAndPenLevel13();
    step((STUCK_TICKS * 3) / TICKS_PER_FRAME);
    expect(resultShown()).toBe(false);
    expect(num('out-count')).toBeGreaterThan(1);

    // It does end, though — a minute of a field going nowhere is nobody
    // playing — and it reads as the win it is, not as a stall or a timeout.
    const rest = runUntilResult(ABANDONED_TICKS * 2);
    expect(rest).not.toBeNull();
    const endedAt = ticks + STUCK_TICKS * 3 + rest!;
    expect(document.getElementById('result-title')!.textContent).toBe('Level Complete!');
    // And the speed bonus survives the wait: the level is billed at the tick
    // the field froze, so the window spent confirming it never eats the bonus.
    // What is paid is therefore at least a full window's worth more than
    // billing the resolution tick would give — `endedAt` is only known to a
    // frame here, and a whole window is far wider than that slack.
    expect(document.getElementById('bonus-time-row')!.hidden).toBe(false);
    const paid = Number(document.getElementById('bonus-time-val')!.textContent!.slice(1));
    expect(paid).toBeGreaterThan(0);
    expect(paid).toBeGreaterThanOrEqual(bonusAt(endedAt - ABANDONED_TICKS));
    expect(paid).toBeGreaterThan(bonusAt(endedAt));
    expect(endedAt - ABANDONED_TICKS).toBeLessThan(LEVELS[12].par);
  });

  it('resolves a won level at once when nothing is left to change it', () => {
    // The same frozen field, but with the stock spent: there is now no move the
    // player could make, so waiting out the long window would be dead time. The
    // level resolves on the short one instead.
    winAndPenLevel13();
    const stockLeft = () => SKILLS.reduce((n, s) => n + skillCount(s), 0);
    // Pen the right-hand stream too, then spend the rest on whoever is pacing
    // either pocket. Selection auto-advances as each skill runs out, so the
    // taps go on to the umbrellas and then the blasts by themselves; the taps
    // alternate between the two pens because a tap picks the nearest critter
    // and the same one cannot take the same skill twice.
    let spent = 0;
    while (stockLeft() > 0 && spent < 6000) {
      const frame = spent / TICKS_PER_FRAME;
      tap(skillCount('blocker') > 0 ? 220 : frame % 2 ? 60 : 270, 154);
      step();
      spent += TICKS_PER_FRAME;
    }
    expect(stockLeft()).toBe(0);
    expect(resultShown()).toBe(false);

    const rest = runUntilResult(ABANDONED_TICKS);
    expect(rest).not.toBeNull();
    // Seconds, not a minute: the short standstill window plus whatever was
    // still in flight when the last skill was spent.
    expect(rest!).toBeLessThan(ABANDONED_TICKS / 2);
    // More than the two blockers are still standing there, so this is the
    // standstill ending and not the "everyone out, only blockers left" one.
    expect(num('out-count')).toBeGreaterThan(2);
    expect(document.getElementById('result-title')!.textContent).toBe('Level Complete!');
    expect(Number(document.getElementById('bonus-time-val')!.textContent!.slice(1))).toBeGreaterThan(
      0
    );
  });
});
