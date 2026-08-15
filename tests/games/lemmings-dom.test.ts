/** @vitest-environment jsdom */
/**
 * Critter Rescue's escape hatch and its *own* end conditions, driven through the
 * real game loop.
 *
 * The headless playthrough harness in lemmings.test.ts re-implements the loop
 * so it can play twenty-five levels in milliseconds, which means it proves the
 * levels are escapable but proves nothing about game.ts — the module that
 * actually decides when a level is over and when the player is told they look
 * stuck. That gap is what let a level hang in the browser while the whole suite
 * stayed green. These tests close it: they mount the page's markup, call
 * `initLemmingsGame`, and step the loop frame by frame, so the assertions below
 * fail if `update`'s end conditions or the stuck hint change.
 *
 * The guarantee they carry is the one the cabinet now makes: not that no level
 * runs forever, but that no level is ever *unescapable*. A level whose crowd can
 * no longer reach the exit stays open for as long as the player wants it open —
 * the game only ever offers the hint — and the Nuke button always ends it.
 *
 * jsdom has no canvas, so `getContext` is stubbed with a do-nothing 2D context
 * (the game's drawing is not under test here); everything else — the fixed
 * timestep, the overlays, the HUD, the skill taps — is the real thing.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { initLemmingsGame } from '../../src/games/lemmings/game';
import { LEVELS, LEVEL_W, LEVEL_H } from '../../src/games/lemmings/levels';
import { STUCK_TICKS } from '../../src/games/lemmings/stall';
import { levelBonuses } from '../../src/games/lemmings/score';
import { fetchGlobal, submitGlobal } from '../../src/games/engine/globalScores';

// The fixture now carries a real high-score panel, so the board these tests
// mount is the real scoreboard rather than the no-op one a missing panel
// yields. Its two network seams are stubbed: the assertions here are about
// which run reaches the board, not what the server does with it. (The module's
// own `canSubmit` gate is private to it, so stubbing the two exports replaces
// that decision wholesale rather than configuring it.)
vi.mock('../../src/games/engine/globalScores', () => ({
  fetchGlobal: vi.fn(async () => null),
  submitGlobal: vi.fn(async () => ({ status: 'failed' }))
}));

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
      <div class="hs-panel" id="highscores" data-hs-game="lemmings" hidden
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
      <button id="next-btn" data-play-again="Play Again" data-next-level="Next Level"></button>
      <button id="retry-btn"></button>
      <button id="end-run-btn" style="display: none;"></button>
    </div>
    <p id="level-hint" hidden></p>
    <p id="stuck-hint" role="status" data-hint="Nothing has moved for a while."></p>
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
/**
 * Whether the "you look stuck, here is the way out" notice is on screen — which
 * is a question about its *text*, not about a `hidden` attribute. The notice is
 * a `role="status"` live region, and assistive technology announces a change to
 * a region's contents; reading `hidden` here would let a hint that is never
 * announced pass as one that is.
 */
const stuckShown = () => (document.getElementById('stuck-hint') as HTMLElement).textContent !== '';
/** The player's escape hatch, pressed. */
const pressNuke = () => (document.getElementById('nuke-btn') as HTMLButtonElement).click();
const skillCount = (skill: string) =>
  Number(document.querySelector(`.skill-btn[data-skill="${skill}"] .skill-count`)!.textContent);

/** Picks a skill off the toolbar, the way a player does before tapping. */
const selectSkill = (skill: string) =>
  (document.querySelector(`.skill-btn[data-skill="${skill}"]`) as HTMLButtonElement).click();

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

/**
 * Steps until the stuck notice appears, returning the ticks it took (or null),
 * and failing if the level resolves on its own along the way — which is the
 * thing that must never happen again.
 */
function runUntilStuck(maxTicks: number): number | null {
  for (let ticks = TICKS_PER_FRAME; ticks <= maxTicks; ticks += TICKS_PER_FRAME) {
    step();
    expect(resultShown()).toBe(false);
    if (stuckShown()) return ticks;
  }
  return null;
}

beforeEach(() => {
  installLocalStorage();
  vi.mocked(fetchGlobal).mockResolvedValue(null);
  vi.mocked(submitGlobal).mockClear();
  vi.mocked(submitGlobal).mockResolvedValue({ status: 'failed' });
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

describe('game loop — no level is ever unescapable', () => {
  it('hangs an untouched level, raises the hint, and lets the nuke end it', () => {
    // Issue #256's headline repro: level 2 needs a basher, so with no input at
    // all every critter paces between the left wall and the pillar — nobody
    // dies, nobody blocks, and the crowd end condition never matches. The game
    // does not resolve that on the player's behalf, deliberately: it says so and
    // hands them the way out.
    expect(LEVELS[1].timeLimit).toBeUndefined();
    startLevel(1);

    // Nothing is claimed while the crowd is still spreading out.
    step(STUCK_TICKS / TICKS_PER_FRAME);
    expect(stuckShown()).toBe(false);

    // Once the field has genuinely frozen, the hint appears — and stays, with
    // the level still open however long it is left. This is the assertion that
    // fails if an automatic ending is ever put back.
    let hintedAt: number | null = null;
    for (let ticks = TICKS_PER_FRAME; ticks <= 12000; ticks += TICKS_PER_FRAME) {
      step();
      expect(resultShown()).toBe(false);
      if (hintedAt === null && stuckShown()) hintedAt = ticks;
    }
    expect(hintedAt).not.toBeNull();
    expect(stuckShown()).toBe(true);

    // And the button the hint names ends it, every time, with no clock involved.
    pressNuke();
    expect(stuckShown()).toBe(false);
    const ended = runUntilResult(1200);
    expect(ended).not.toBeNull();
    expect(num('saved-count')).toBe(0);
    expect(document.getElementById('result-title')!.textContent).toBe('Not Enough Rescued');
  });

  it('ends a timed level on its own clock, untouched', () => {
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

  /** The speed bonus a level would pay if the run on screen were billed at `ticks`. */
  const timeBonus = (level: (typeof LEVELS)[number], ticks: number) =>
    levelBonuses({
      saved: num('saved-count'),
      needed: level.needed,
      spawnCount: level.spawnCount,
      ticks,
      par: level.par
    }).time;
  const bonusAt = (ticks: number) => timeBonus(LEVELS[12], ticks);

  it('never closes a won level under the player, and pays the speed bonus when they end it', () => {
    // The regression that killed the previous two attempts: a player who pens
    // the surplus crowd and then reads the terrain is playing, not stalling, and
    // closing the level under them takes every remaining rescue and the perfect
    // bonus with it. So the frozen field never ends anything — it only offers
    // the hint — and the level waits for as long as it is left waiting.
    const ticks = winAndPenLevel13();
    const hinted = runUntilStuck(STUCK_TICKS * 12);
    expect(hinted).not.toBeNull();
    // The notice goes up exactly `STUCK_TICKS` after the field last moved, and
    // nothing has moved since, so this is the tick the level should be scored on
    // — known to within the one frame the loop steps in.
    const frozeAt = ticks + hinted! - STUCK_TICKS;

    // Left alone from here it simply stays open, for as long as it is left.
    const idled = STUCK_TICKS * 8;
    for (let t = 0; t < idled / TICKS_PER_FRAME; t++) {
      step();
      expect(resultShown()).toBe(false);
    }
    expect(num('out-count')).toBeGreaterThan(1);
    expect(stuckShown()).toBe(true);

    // The player ends it when they are ready, and it reads as the win it is.
    pressNuke();
    const rest = runUntilResult(1200);
    expect(rest).not.toBeNull();
    const endedAt = ticks + hinted! + idled + rest!;
    expect(document.getElementById('result-title')!.textContent).toBe('Level Complete!');
    // And the speed bonus survives the wait: the level is billed where the field
    // froze, so neither the staring nor the nuke chain that ended it eats the
    // bonus. Bracketed both ways by one frame's slack, since the bonus falls off
    // with the billed tick and `frozeAt` is only known that precisely.
    expect(document.getElementById('bonus-time-row')!.hidden).toBe(false);
    const paid = Number(document.getElementById('bonus-time-val')!.textContent!.slice(1));
    expect(paid).toBeGreaterThan(0);
    expect(paid).toBeGreaterThanOrEqual(bonusAt(frozeAt + TICKS_PER_FRAME));
    expect(paid).toBeLessThanOrEqual(bonusAt(Math.max(0, frozeAt - TICKS_PER_FRAME)));
    // Which is a real difference, not a rounding one: billing the tick it
    // actually closed on would have paid far less.
    expect(paid).toBeGreaterThan(bonusAt(endedAt));
    expect(frozeAt).toBeLessThan(LEVELS[12].par);
  });

  it('holds a won level open even with the whole stock spent', () => {
    // The same frozen field with nothing left to spend on it. An earlier round
    // took this as licence to close the level automatically, on the reasoning
    // that the player could no longer change anything — but `levelStock` hands
    // out a two-bomber reserve nobody is forced to spend, so "no stock left" was
    // a state the fast path could barely reach, and the levels that did reach it
    // were closed for the player rather than by them. Nothing ends here either:
    // the hint goes up and the button stays the only way out.
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

    // A long wait with an empty hand still resolves nothing, and the hint is up.
    for (let ticks = TICKS_PER_FRAME; ticks <= STUCK_TICKS * 8; ticks += TICKS_PER_FRAME) {
      step();
      expect(resultShown()).toBe(false);
    }
    expect(stuckShown()).toBe(true);
    // More than the two blockers are still standing there, so the crowd's own
    // "everyone out, only blockers left" ending genuinely has not matched.
    expect(num('out-count')).toBeGreaterThan(2);

    pressNuke();
    const rest = runUntilResult(1200);
    expect(rest).not.toBeNull();
    expect(document.getElementById('result-title')!.textContent).toBe('Level Complete!');
    expect(Number(document.getElementById('bonus-time-val')!.textContent!.slice(1))).toBeGreaterThan(
      0
    );
  });

  it('bills an authored clock for the whole clock, however still the field went', () => {
    // The scoring counterpart to the tests above. Nothing on a frozen field ends
    // a level any more, but a level with an authored `timeLimit` still has one
    // ending the player does not choose — and that ending has to be paid for at
    // the tick it really happened. Discounting the standstill out of it pays a
    // speed bonus for time a countdown on screen genuinely burned, and pays more
    // of it the longer the player stands still, because the watcher only ever
    // measures the *current* standstill: parking the crowd after the quota was
    // home would then be worth more than finishing the level.
    //
    // Level 14 is the fixture: the wall level against a 2,700-tick clock its own
    // 2,400-tick par expires inside, so a run that goes the distance must be paid
    // nothing at all for speed. Bash the pillar open, bank the quota, wall the
    // rest of the crowd in behind a blocker, and let the clock run out.
    const level = LEVELS[13];
    expect(level.timeLimit).toBe(2700);
    expect(level.par).toBeLessThan(level.timeLimit!);
    startLevel(13);

    let ticks = 0;
    const advance = () => {
      step();
      ticks += TICKS_PER_FRAME;
    };

    // Tunnel through the pillar. A basher pointed the wrong way walks off and
    // gives up, so keep tapping its face until one of them digs and the crowd
    // starts arriving at the exit.
    selectSkill('basher');
    while (num('saved-count') === 0 && skillCount('basher') > 0 && ticks < 1500) {
      tap(155, 154);
      advance();
    }
    while (num('saved-count') === 0 && ticks < 1500) advance();
    expect(num('saved-count')).toBeGreaterThan(0);

    // Bank the quota, then shut the door on whoever is left: a blocker on the
    // home straight walls the rest of the crowd into the long pocket behind it,
    // where they pace out the rest of the clock going nowhere.
    while (num('saved-count') < level.needed && ticks < 1500) advance();
    expect(num('saved-count')).toBeGreaterThanOrEqual(level.needed);
    selectSkill('blocker');
    while (skillCount('blocker') === 2 && ticks < 1800) {
      tap(250, 154);
      advance();
    }
    expect(skillCount('blocker')).toBe(1);

    // Wait the clock out doing nothing, which is the run the bug used to pay
    // for. The notice goes up `STUCK_TICKS` after the field last moved, so it
    // also dates the freeze: the tick the discount billed instead of this one.
    let hintedAt: number | null = null;
    while (!resultShown() && ticks < level.timeLimit! * 2) {
      advance();
      if (hintedAt === null && stuckShown()) hintedAt = ticks;
    }
    expect(hintedAt).not.toBeNull();
    expect(num('out-count')).toBeGreaterThan(1);
    expect(ticks).toBe(level.timeLimit);

    // It reads as the win it is, and it earns nothing at all for speed: the
    // clock the player watched expire is what the level is billed for.
    expect(document.getElementById('result-title')!.textContent).toBe('Level Complete!');
    expect(document.getElementById('bonus-time-row')!.hidden).toBe(true);
    expect(document.getElementById('bonus-time-val')!.textContent).toBe('+0');
    // And the discount it used to take was worth real points, so this is a
    // scoring change rather than a rounding one.
    expect(timeBonus(level, hintedAt! - STUCK_TICKS)).toBeGreaterThan(0);
  });

  it('withdraws the hint as soon as the field moves again', () => {
    // A hint that misfires must cost a line of text and nothing more, so it has
    // to be able to take itself back. Freeze level 13's left stream behind a
    // blocker, wait for the notice, then spend a skill: the field has changed,
    // the player is evidently still there, and the notice goes away by itself.
    winAndPenLevel13();
    expect(runUntilStuck(STUCK_TICKS * 12)).not.toBeNull();
    // And it is announced rather than merely revealed: the live region holds no
    // text until the standstill, then holds the page's wording, which is the
    // change a screen reader has to see to say anything at all.
    const hint = document.getElementById('stuck-hint') as HTMLElement;
    expect(hint.textContent).toBe(hint.dataset.hint);
    expect(hint.dataset.hint).toBeTruthy();

    // Whoever is left is pacing the left-hand pen, so sweep it until a tap
    // connects and a skill is actually spent.
    const stockLeft = () => SKILLS.reduce((n, s) => n + skillCount(s), 0);
    const before = stockLeft();
    let ticks = 0;
    while (stockLeft() === before && ticks < 3000) {
      tap(60 + ((ticks / TICKS_PER_FRAME) % 8) * 12, 154);
      step();
      ticks += TICKS_PER_FRAME;
    }
    expect(stockLeft()).toBeLessThan(before);
    expect(stuckShown()).toBe(false);
    expect(hint.textContent).toBe('');
    expect(resultShown()).toBe(false);
  });
});

/**
 * The shared board is the one every visitor sees, and until now a Critter
 * Rescue run could only reach it by failing or by clearing all twenty-five
 * levels: `board.show` was called from nowhere else, and the `board.hide` on a
 * mid-run clear commits nothing because nothing was ever pending. A player who
 * cleared a few levels and stopped banked a personal best and never appeared on
 * the board (#261). These pin the door that fixes it, and the deliberate
 * absence of one while the run is still going.
 */
describe('ending a run from a mid-run clear (#261)', () => {
  const flush = () => new Promise<void>(resolve => setTimeout(resolve, 0));
  const endRunBtn = () => document.getElementById('end-run-btn') as HTMLButtonElement;
  const nextBtn = () => document.getElementById('next-btn') as HTMLButtonElement;

  /** Clears level 1 — the teaching level, which resolves without any input. */
  function clearFirstLevel(): number {
    startLevel(0);
    const ticks = runUntilResult(6000);
    expect(ticks).not.toBeNull();
    expect(document.getElementById('result-title')!.textContent).toBe('Level Complete!');
    const runScore = num('result-score-val');
    expect(runScore).toBeGreaterThan(0);
    return runScore;
  }

  it('offers the exit on a mid-run clear and sends that run to the board', async () => {
    const runScore = clearFirstLevel();
    // The run is still open, so the screen carries the way out of it.
    expect(endRunBtn().style.display).toBe('inline-block');
    expect(submitGlobal).not.toHaveBeenCalled();

    endRunBtn().click();
    // The screen must not still be offering to carry a finished run onward.
    expect(endRunBtn().style.display).toBe('none');
    expect(nextBtn().textContent).toBe('Play Again');

    // `show` makes the run pending; the commit that submits it rides the next
    // `hide`, exactly as every other cabinet's game over does.
    nextBtn().click();
    await flush();
    expect(submitGlobal).toHaveBeenCalledWith('lemmings', expect.any(String), runScore);
  });

  it('starts a fresh run afterwards rather than resuming the finished one', async () => {
    clearFirstLevel();
    endRunBtn().click();
    nextBtn().click();
    await flush();
    // Back at level 1 with the points reset — not level 2 carrying the old
    // score, which is what an un-ended run would have done.
    expect(num('level-num')).toBe(1);
    expect(num('run-score')).toBe(0);
  });

  it('submits nothing when the player carries the run on to the next level', async () => {
    clearFirstLevel();
    // The bug's shape, kept as a guard: advancing is not an ending, so it must
    // not put a half-finished run on the shared board.
    expect(nextBtn().textContent).toBe('Next Level');
    nextBtn().click();
    await flush();
    expect(submitGlobal).not.toHaveBeenCalled();
    expect(num('level-num')).toBe(2);
  });
});
