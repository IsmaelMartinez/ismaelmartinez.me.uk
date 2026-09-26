/** @vitest-environment jsdom */
/**
 * Line Hold's terminal path, driven through the real page wiring.
 *
 * The defect these tests pin (issue #261): a breach used to be the only way out
 * of a run, so `board.show()` — and with it every submission — was reached
 * exclusively by defences that had failed. Worse than the two cabinets already
 * fixed, because clearing the whole authored campaign does not end the run
 * either: `waveCleared` rolls wave 18 into an endless assault on purpose, so a
 * player who held every wave had no terminal state at all except eventually
 * losing.
 *
 * So the assertions below are about a *holding* line reaching submission: the
 * keep never loses a life, and the run still charts. Asserting only that a
 * stand-down button exists would not have caught it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { initTowerDefenseGame } from '../../src/games/towerdefense';
import { fetchGlobal, submitGlobal } from '../../src/games/engine/globalScores';
import { doneKey } from '../../src/games/engine/progress';
import { GRID_W, GRID_H } from '../../src/games/towerdefense/path';
import { TOWERS, createTower, towerDps } from '../../src/games/towerdefense/towers';
import {
  createFrameDriver,
  hsPanelHtml,
  installCanvasContext,
  installJsdomShims,
  installLocalStorage,
  mountHtml,
  pressKey
} from './dom-helpers';

vi.mock('../../src/games/engine/globalScores', async () =>
  (await import('./dom-helpers')).mockGlobalScores()
);

/**
 * The score's adaptive hooks (#374) are observed through a mocked
 * `createGameAudio`, built in `vi.hoisted` because the factory runs when the
 * game's own import of the engine resolves (see tanks-dom.test.ts). None of
 * the other tests here listen to it, and in jsdom there is no AudioContext
 * for the real engine to play into anyway.
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

/**
 * Lets one test keep the keep standing through every leak, so an unguarded
 * run can walk all the way to the finale without anyone having to build a
 * defence good enough to hold eighteen waves in jsdom. Off by default, which
 * leaves `leak` exactly as the game has it for every other test.
 */
const keepStands = vi.hoisted(() => ({ on: false }));

vi.mock('../../src/games/towerdefense/economy', async importOriginal => {
  const actual = await importOriginal<typeof import('../../src/games/towerdefense/economy')>();
  return {
    ...actual,
    leak: (eco: Parameters<typeof actual.leak>[0], cost: number) => {
      const lives = actual.leak(eco, cost);
      return keepStands.on ? Math.max(lives, 1) : lives;
    }
  };
});

// Mirrors the projection constants in src/games/towerdefense/game.ts, which are
// module-private. Tile picking below re-derives the isometric centre the same
// way isoProject does, so a click lands on the tile a player would have hit.
const HALF_W = 20;
const HALF_H = 10;
const ORIGIN_X = GRID_H * HALF_W;
const ORIGIN_Y = 70;
const CANVAS_W = (GRID_W + GRID_H) * HALF_W;
const CANVAS_H = (GRID_W + GRID_H) * HALF_H + ORIGIN_Y + 16;

/**
 * The runtime skeleton of src/pages/[lang]/fun/towerdefense.astro — every
 * element the game module looks up, plus one focusable node *outside*
 * `#towerdefense-root` standing in for the site chrome the layout wraps the
 * game in. The prompt covers the battlefield and nothing else, so that link is
 * somewhere a player can genuinely put focus while it is open.
 */
const PAGE_HTML = `
  <a id="site-nav-link" href="/en/">Home</a>
  <div id="towerdefense-root"
       data-t-stood-down="Garrison Stood Down"
       data-t-stood-down-desc="You ended the watch with the line unbroken."
       data-t-game-over="The Line Has Fallen"
       data-t-game-over-desc="The horde marched through your defences.">
    <span id="money">0</span>
    <span id="lives">0</span>
    <span id="wave-num">—</span>
    <span id="score">0</span>
    <span id="record">0</span>
    <span id="seed">—</span>
    <div id="canvas-scroll"><canvas id="game-canvas"></canvas></div>
    <div id="toast-area"></div>
    <div id="start-overlay"><button id="start-btn">Man the Towers</button></div>
    <div id="over-overlay" style="display: none;">
      <span id="over-icon">💥</span>
      <h2 id="over-title" tabindex="-1"></h2>
      <p id="over-desc"></p>
      <p><strong id="final-score">0</strong></p>
      ${hsPanelHtml('towerdefense')}
      <button id="again-btn">Hold Again</button>
    </div>
    <div id="stand-down-overlay" style="display: none;" tabindex="-1"
         role="alertdialog"
         aria-labelledby="stand-down-title" aria-describedby="stand-down-desc">
      <h2 id="stand-down-title">Stand the garrison down?</h2>
      <p id="stand-down-desc">The run ends here.</p>
      <button type="button" id="stand-down-cancel">Hold the line</button>
      <button type="button" id="stand-down-confirm">Stand down</button>
    </div>
    <div class="tool-bar">
      <button class="tower-tool active" data-kind="bolt" disabled>
        <span class="tool-cost">70</span>
      </button>
      <button class="tower-tool" data-kind="blast" disabled>
        <span class="tool-cost">110</span>
      </button>
      <button class="tower-tool" data-kind="frost" disabled>
        <span class="tool-cost">90</span>
      </button>
    </div>
    <div class="action-bar">
      <span id="tower-info" hidden></span>
      <button id="upgrade-btn" hidden></button>
      <button id="wave-btn" disabled>▶</button>
    </div>
    <div class="run-controls">
      <button type="button" id="stand-down-btn" disabled><span aria-hidden="true">🏳️</span> Stand Down</button>
    </div>
  </div>`;

const frames = createFrameDriver();
const { advance } = frames;

/**
 * Runs the loop until `done` holds, up to `limitSeconds` of wall time. Line
 * Hold's phases are timed rather than counted — the build lull auto-launches
 * the next wave after 12 seconds — so a fixed advance would sail straight past
 * the state under test.
 */
function advanceUntil(done: () => boolean, limitSeconds: number): void {
  const limit = Math.ceil((limitSeconds * 1000) / 250);
  for (let i = 0; i < limit; i++) {
    advance(0.25);
    if (done()) return;
  }
  throw new Error(`condition not reached within ${limitSeconds}s`);
}

/** Clicks the centre of the tile at (x, y), touching nothing else. */
function clickTile(x: number, y: number): void {
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  canvas.dispatchEvent(
    new MouseEvent('click', {
      clientX: ORIGIN_X + (x - y) * HALF_W,
      clientY: ORIGIN_Y + (x + y + 1) * HALF_H,
      bubbles: true
    })
  );
}

/** Selects a tower kind and clicks the centre of the tile at (x, y). */
function buildAt(kind: string, x: number, y: number): void {
  document.querySelector<HTMLButtonElement>(`.tower-tool[data-kind="${kind}"]`)!.click();
  clickTile(x, y);
}

const num = (id: string) => Number(document.getElementById(id)!.textContent);
const panel = () => document.getElementById('highscores')!;
const overlayShown = () =>
  (document.getElementById('over-overlay') as HTMLElement).style.display === 'flex';

const standDownBtn = () => document.getElementById('stand-down-btn') as HTMLButtonElement;
const confirmBtn = () => document.getElementById('stand-down-confirm') as HTMLButtonElement;
const cancelBtn = () => document.getElementById('stand-down-cancel') as HTMLButtonElement;
const waveBtn = () => document.getElementById('wave-btn') as HTMLButtonElement;
const promptShown = () =>
  (document.getElementById('stand-down-overlay') as HTMLElement).style.display === 'flex';

const navLink = () => document.getElementById('site-nav-link') as HTMLAnchorElement;

/** Sends a key the way a player's keyboard would: from inside the dialog, bubbling. */
function pressInPrompt(key: string): void {
  pressKey(document.getElementById('stand-down-overlay')!, key);
}

/**
 * Stands the garrison down the only way a player can: open the prompt, then
 * confirm. Every assertion about what standing down *posts* goes through this,
 * so if the guard were ever reduced back to a single click these would still
 * pass — which is why the guard has its own tests below.
 */
function standDown(): void {
  standDownBtn().click();
  confirmBtn().click();
}

/** Starts a run and settles the HUD, leaving the build lull open. */
function startRun(): void {
  document.getElementById('start-btn')!.click();
  advance(0.25);
}

/**
 * Holds wave 1. Two bolt towers straddle the opening straight (the horde walks
 * y=2 from x=0 to x=17), so all six scouts die inside the kill corridor: the
 * keep is never touched and the wave scores its hold bonus on top of the
 * bounties. This is a *winning* run — the state that could never reach the
 * board before the stand-down door existed.
 */
function holdFirstWave(): void {
  startRun();
  buildAt('bolt', 10, 1);
  buildAt('bolt', 11, 1);
  waveBtn().click();
  // Stops at the build lull that opens once the wave is broken, rather than
  // after a fixed span: overshooting it auto-launches wave 2 and shuts the
  // door again.
  advanceUntil(() => !standDownBtn().disabled, 40);
}

beforeEach(() => {
  installLocalStorage();
  vi.clearAllMocks();
  keepStands.on = false;
  vi.mocked(fetchGlobal).mockResolvedValue(null);
  vi.mocked(submitGlobal).mockResolvedValue({ status: 'ok', rank: 1, table: [] });
  installJsdomShims();
  installCanvasContext();
  frames.install();
  mountHtml(PAGE_HTML, { canvasSize: [CANVAS_W, CANVAS_H] });
  initTowerDefenseGame();
  frames.syncClock();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Line Hold stand-down control', () => {
  it('a selected tower reads out what it does, not just its level (#263)', () => {
    // Cost was the only number the cabinet ever showed, and cost ranks the
    // three towers the wrong way round. A placed tower now carries its own
    // damage per second and reach, at the level it has actually reached.
    // holdFirstWave leaves bolts standing at (10, 1) and (11, 1); clicking an
    // occupied tile selects rather than builds.
    holdFirstWave();
    clickTile(10, 1);
    advance(0.25); // the HUD syncs on the next frame, not on the click
    const info = document.getElementById('tower-info')!;
    expect(info.hidden).toBe(false);
    const fresh = createTower('bolt', 0);
    expect(info.textContent).toContain(`⚔ ${Math.round(towerDps(fresh))}`);
    expect(info.textContent).toContain('◎ 2');
    // Bolt has neither, and saying so by omission is what makes the three read
    // as different tools rather than three prices.
    expect(info.textContent).not.toContain('💥');
    expect(info.textContent).not.toContain('❄');
    expect(TOWERS.bolt.splash).toBe(0);
  });

  it('shows the run seed once a run starts (#264)', () => {
    // The seed is only worth having if the player can read it: a run they want
    // to compare, or to tell someone else about, is identified by this number
    // and by nothing else on screen. Blank until there is a run to identify.
    const seedEl = () => document.getElementById('seed')!.textContent ?? '';
    expect(seedEl()).toBe('—');
    holdFirstWave();
    expect(seedEl()).toMatch(/^\d+$/);
    expect(Number(seedEl())).toBeLessThan(1000000);
  });

  it('lets a holding line end its run and reach the shared board', async () => {
    holdFirstWave();
    // The whole point: this line is not failing. A breach — the only terminal
    // state before the fix — is nowhere in sight, and the campaign has 17 more
    // waves before it would roll into the endless assault that never ends.
    expect(num('lives')).toBe(20);
    // 100 for the wave held with nothing through, plus six scout bounties at
    // 6 apiece. The hold bonus is the half that matters: it is only paid when
    // the keep is untouched, so its presence is what makes this a won wave
    // rather than a survived one.
    expect(num('score')).toBe(136);
    expect(overlayShown()).toBe(false);

    expect(standDownBtn().disabled).toBe(false);
    const held = num('score');
    standDown();

    expect(overlayShown()).toBe(true);
    expect(document.getElementById('over-title')!.textContent).toBe('Garrison Stood Down');
    // Whatever the breach path would have posted is what this posts: the score
    // already on the HUD, not a second scoring path invented for the door.
    expect(num('final-score')).toBe(held);
    // The leaderboard lives inside this overlay, so opening it is what makes
    // the board visible to a player who was never going to be overrun.
    expect(panel().hidden).toBe(false);

    const form = document.querySelector<HTMLFormElement>('.hs-entry')!;
    expect(form.hidden).toBe(false);
    document.querySelector<HTMLInputElement>('.hs-input')!.value = 'IMR';
    form.dispatchEvent(new Event('submit', { cancelable: true }));

    expect(submitGlobal).toHaveBeenCalledWith('towerdefense', 'IMR', held);
    expect(localStorage.getItem(doneKey('towerdefense'))).toBe('1');
  });

  it('offers the door only in the build lull, never mid-wave', () => {
    startRun();
    expect(standDownBtn().disabled).toBe(false);

    waveBtn().click();
    advance(0.25);

    // Marchers are on the field, so the run has points still in flight and
    // what a stand-down would post is ambiguous.
    expect(standDownBtn().disabled).toBe(true);
    standDownBtn().click();
    expect(promptShown()).toBe(false);
    expect(overlayShown()).toBe(false);
  });

  it('does nothing before a run has started', () => {
    expect(standDownBtn().disabled).toBe(true);
    standDownBtn().click();

    expect(promptShown()).toBe(false);
    expect(overlayShown()).toBe(false);
    expect(panel().hidden).toBe(true);
    expect(submitGlobal).not.toHaveBeenCalled();
  });

  it('banks nothing for a run that never fired a shot', () => {
    startRun();
    standDown();

    expect(num('final-score')).toBe(0);
    expect(document.querySelector<HTMLFormElement>('.hs-entry')!.hidden).toBe(true);
    expect(submitGlobal).not.toHaveBeenCalled();
  });
});

/**
 * The guard. Standing down is irreversible and a Line Hold run can be many
 * minutes long, so a single stray click must not end it. These tests are about
 * the click that does *not* end the run: what the first one does instead, and
 * that the defence on the other side of a cancel is the same defence, still
 * holding.
 */
describe('Line Hold stand-down confirmation', () => {
  it('asks first: one click on Stand Down ends nothing', () => {
    holdFirstWave();
    standDownBtn().click();

    expect(promptShown()).toBe(true);
    // Nothing terminal has happened: no overlay, no board, no submission.
    expect(overlayShown()).toBe(false);
    expect(panel().hidden).toBe(true);
    expect(submitGlobal).not.toHaveBeenCalled();
  });

  it('holds the run still while it asks, so no wave can roll in behind the prompt', () => {
    holdFirstWave();
    const wave = document.getElementById('wave-num')!.textContent;
    standDownBtn().click();

    // A stray build lands on the battlefield under the prompt, and far more
    // than a whole build countdown of wall time passes. Both are no-ops: the
    // run is frozen, which is what stops wave 2 from launching underneath the
    // question and changing the answer.
    const funds = num('money');
    buildAt('bolt', 12, 1);
    advance(30);

    expect(document.getElementById('wave-num')!.textContent).toBe(wave);
    expect(num('money')).toBe(funds);
    expect(overlayShown()).toBe(false);
  });

  it('cancelling leaves the run live and unharmed', () => {
    holdFirstWave();
    const held = num('score');
    const funds = num('money');

    standDownBtn().click();
    cancelBtn().click();

    expect(promptShown()).toBe(false);
    expect(overlayShown()).toBe(false);
    expect(panel().hidden).toBe(true);
    expect(submitGlobal).not.toHaveBeenCalled();
    expect(standDownBtn().disabled).toBe(false);

    // The board is buildable again, so the run really did come back rather
    // than being left frozen — and it still ends on the score it had.
    buildAt('bolt', 12, 1);
    advance(0.25);
    expect(num('money')).toBe(funds - 70);

    standDown();
    expect(overlayShown()).toBe(true);
    expect(num('final-score')).toBe(held);
  });

  it('cancels on Escape', () => {
    holdFirstWave();
    standDownBtn().click();
    pressInPrompt('Escape');

    expect(promptShown()).toBe(false);
    expect(overlayShown()).toBe(false);
    expect(submitGlobal).not.toHaveBeenCalled();
  });

  it('opens on the safe answer and hands focus back on cancel', () => {
    holdFirstWave();
    standDownBtn().click();
    // Cancel takes focus, so the key a keyboard user presses first holds the line.
    expect(document.activeElement).toBe(cancelBtn());

    // Tab stays inside the two answers rather than escaping to the tower tools.
    pressInPrompt('Tab');
    expect(document.activeElement).toBe(confirmBtn());
    pressInPrompt('Tab');
    expect(document.activeElement).toBe(cancelBtn());

    cancelBtn().click();
    expect(document.activeElement).toBe(standDownBtn());
  });

  /**
   * The trap has to reach as far as focus can go. The prompt is painted over
   * the battlefield, so it covers neither the tower tools nor the site chrome
   * around the game: a player can open it and then click a nav link, and focus
   * leaves `#towerdefense-root` entirely. A trap scoped to the root stops
   * seeing keys at that moment, which strands a keyboard-only player in front
   * of a prompt none of their keys can answer.
   */
  it('keeps trapping once focus has left the game root', () => {
    holdFirstWave();
    standDownBtn().click();

    navLink().focus();
    expect(document.activeElement).toBe(navLink());

    expect(pressKey(navLink(), 'Tab').defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(cancelBtn());

    navLink().focus();
    expect(pressKey(navLink(), 'Escape').defaultPrevented).toBe(true);
    expect(promptShown()).toBe(false);
    expect(overlayShown()).toBe(false);

    // Closed means released: the page gets its own keys back.
    expect(pressKey(navLink(), 'Tab').defaultPrevented).toBe(false);
  });

  it('ends the run only on the second, deliberate click', () => {
    holdFirstWave();
    standDownBtn().click();
    confirmBtn().click();

    expect(promptShown()).toBe(false);
    expect(overlayShown()).toBe(true);
    expect(document.getElementById('over-title')!.textContent).toBe('Garrison Stood Down');
  });

  /**
   * Confirming tears down the prompt that held focus, so something in the
   * result has to catch it: left alone the keyboard lands on `document.body`
   * and a screen reader is told nothing about how the run ended.
   */
  it('moves focus into the result on confirm', () => {
    // A run with nothing to post, so the board asks for no initials and the
    // overlay's own heading is the only thing that can be holding focus.
    startRun();
    standDown();

    expect(document.activeElement).not.toBe(document.body);
    expect(document.getElementById('over-overlay')!.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).toBe(document.getElementById('over-title'));
  });

  /**
   * The trap lives on the document, which survives a ClientRouter swap even
   * though this page's DOM does not. Retiring it on `astro:before-swap` — the
   * same idiom every other document-reaching listener here uses — is what stops
   * a dead prompt from swallowing the next page's keys.
   */
  it('releases the trap when the page swaps out from under an open prompt', () => {
    holdFirstWave();
    standDownBtn().click();
    expect(pressKey(navLink(), 'Tab').defaultPrevented).toBe(true);

    document.dispatchEvent(new Event('astro:before-swap'));

    expect(pressKey(navLink(), 'Tab').defaultPrevented).toBe(false);
    expect(pressKey(navLink(), 'Escape').defaultPrevented).toBe(false);
  });
});

/**
 * The score plays the defence (#374): the lead and the march are a layer that
 * comes in when a wave launches and goes when it ends, a horn stinger marks
 * the launch, the finale switches to the horde, and the stand-down prompt
 * muffles the music instead of stopping it. Everything here is driven by the
 * game's own buttons and clock, never by calling the audio directly.
 */
describe('Line Hold music', () => {
  /** The last `on` each named layer was set to. */
  const layerState = (name: string): boolean | undefined =>
    mockAudio.setLayer.mock.calls.filter(([track]) => track === name).at(-1)?.[1];

  it('starts a run on the build bed alone', () => {
    startRun();
    expect(mockAudio.start).toHaveBeenCalledTimes(1);
    expect(layerState('lead')).toBe(false);
    expect(layerState('drums')).toBe(false);
    expect(mockAudio.playStinger).not.toHaveBeenCalled();
  });

  it('brings the wave layer in with a horn call when a wave launches', () => {
    startRun();
    waveBtn().click();
    expect(layerState('lead')).toBe(true);
    expect(layerState('drums')).toBe(true);
    expect(mockAudio.playStinger).toHaveBeenCalledWith('launch');
    // Wave 1 is nowhere near the finale.
    expect(mockAudio.setDanger).not.toHaveBeenCalledWith(true);
  });

  it('launches with the layer too when the build countdown runs out on its own', () => {
    startRun();
    advanceUntil(() => mockAudio.playStinger.mock.calls.length > 0, 20);
    expect(layerState('lead')).toBe(true);
    expect(layerState('drums')).toBe(true);
  });

  it('takes the wave layer out again once the wave is held', () => {
    holdFirstWave();
    expect(num('lives')).toBe(20);
    expect(layerState('lead')).toBe(false);
    expect(layerState('drums')).toBe(false);
  });

  it('muffles the music while the stand-down prompt holds the run, and clears it on cancel', () => {
    holdFirstWave();
    standDownBtn().click();
    expect(mockAudio.setPaused).toHaveBeenLastCalledWith(true);
    // Muffled, not stopped: stopping and starting would restart the pass.
    expect(mockAudio.stop).not.toHaveBeenCalled();
    cancelBtn().click();
    expect(mockAudio.setPaused).toHaveBeenLastCalledWith(false);
  });

  it('clears the pause when the prompt ends the run, so the next run is not muffled', () => {
    holdFirstWave();
    standDown();
    expect(mockAudio.setPaused).toHaveBeenLastCalledWith(false);
    expect(mockAudio.stop).toHaveBeenCalledTimes(1);
  });

  it('marches the finale and every wave after it to the horde, and releases it between waves', () => {
    keepStands.on = true;
    startRun();
    const dangerCalls = (on: boolean) => mockAudio.setDanger.mock.calls.filter(([was]) => was === on).length;
    /** The launches (1-based) that switched the horde on. */
    const hordeLaunches: number[] = [];
    let launches = 0;
    let dangerSeen = 0;
    advanceUntil(() => {
      if (!waveBtn().disabled) waveBtn().click();
      launches = mockAudio.playStinger.mock.calls.length;
      if (dangerCalls(true) > dangerSeen) {
        dangerSeen = dangerCalls(true);
        hordeLaunches.push(launches);
      }
      return launches === 20;
    }, 3000);
    // Waves 1 to 17 are the march; 18, the finale, and the endless waves
    // after it are the horde.
    expect(hordeLaunches).toEqual([18, 19, 20]);
    // Every wave that ended, 18 and 19 among them, handed its lull back to the bed.
    expect(dangerCalls(false)).toBe(19);
  });
});
