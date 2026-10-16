/** @vitest-environment jsdom */
/**
 * PRIME TIME through its real page wiring: the sticks on the keyboard, the
 * cash on the HUD and in the bank, three deaths to the board, the boss and
 * last-life music hooks, the pause, and the win. The run is reached through
 * the page's own `primetimeDev` handle (the one a playtesting bot drives) and
 * edited in place to put the contestant where each case needs them, as the
 * Cascade suite does with its well.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { initPrimeTimeGame } from '../../src/games/primetime';
import { fetchGlobal, submitGlobal } from '../../src/games/engine/globalScores';
import { doneKey } from '../../src/games/engine/progress';
import { bestKey } from '../../src/games/engine/highscores';
import { ARENA, CANVAS_H, CANVAS_W, doorCentre } from '../../src/games/primetime/arena';
import { ENEMIES, spawnEnemy } from '../../src/games/primetime/enemies';
import { ENDINGS, SCENES } from '../../src/games/primetime/music';
import { CIRCUITS } from '../../src/games/primetime/rooms';
import { DEATH_SECONDS, MAP_SECONDS, jumpToRoom, type RunInput, type RunState } from '../../src/games/primetime/run';
import {
  createFrameDriver,
  hsPanelHtml,
  installCanvasContext,
  installJsdomShims,
  installLocalStorage,
  mountHtml,
  pressKey
} from './dom-helpers';
import { seededRandom } from './seeded-random';

vi.mock('../../src/games/engine/globalScores', async () =>
  (await import('./dom-helpers')).mockGlobalScores()
);

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
  effectsBus: vi.fn(() => null),
  setTempo: vi.fn(),
  section: vi.fn(() => null),
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

/** The runtime skeleton of src/pages/[lang]/fun/primetime.astro. */
const PAGE_HTML = `
  <div id="primetime-root" class="game-container"
       data-t-big-money="BIG MONEY!" data-t-big-prizes="BIG PRIZES!" data-t-love-it="I LOVE IT!"
       data-t-carnage="TOTAL CARNAGE!" data-t-good-luck="GOOD LUCK" data-t-new-car="A NEW CAR!"
       data-t-no-keys="NOT ENOUGH KEYS" data-t-extra-life="EXTRA LIFE!"
       data-t-studio="STUDIO {n}" data-t-studio-clear="Studio {n} cleared +\${bonus}" data-t-dome="PLEASURE DOME"
       data-t-last-life="LAST LIFE!" data-t-paused="PAUSED" data-t-new-record="New record!"
       data-t-game-over="That's all, folks" data-t-game-over-desc="The contestant has left."
       data-t-winner="Grand champion!" data-t-winner-desc="The show is yours."
       data-t-weapon-machine="Machine gun" data-t-weapon-spread="Spread" data-t-weapon-grenade="Grenades" data-t-weapon-rocket="Rockets"
       data-t-item-shield="Shield!" data-t-item-boots="Speed boots!" data-t-item-bomb="Smart bomb!" data-t-item-life="Extra life!">
    <span id="cash">$0</span><span id="lives">3</span><span id="keys">0</span>
    <span id="weapon">Machine gun</span><span id="studio">1</span><span id="record">0</span>
    <div class="game-area">
      <canvas id="game-canvas"></canvas>
      <div id="toast-area"></div>
      <button id="pause-btn"></button>
      <div id="start-overlay" class="game-overlay"><button id="start-btn"></button></div>
      <div id="over-overlay" class="game-overlay" style="display: none;">
        <span id="over-icon"></span><h2 id="over-title"></h2><p id="over-desc"></p>
        <strong id="final-score">$0</strong>
        ${hsPanelHtml('primetime')}
        <button id="again-btn"></button>
      </div>
    </div>
  </div>`;

const frames = createFrameDriver();
const { advance } = frames;

interface Dev {
  getRun: () => RunState;
  setInput: (input: RunInput | null) => void;
}
const dev = (): Dev => (window as unknown as { primetimeDev: Dev }).primetimeDev;
const run = (): RunState => dev().getRun();
const text = (id: string) => document.getElementById(id)!.textContent ?? '';
const overlayShown = () => (document.getElementById('over-overlay') as HTMLElement).style.display === 'flex';
const rng = seededRandom(3);

function startRun(): void {
  document.getElementById('start-btn')!.click();
  advance(0.25);
}

/** An empty, quiet floor: the script thrown away, nothing on the floor. */
function quiet(r: RunState): void {
  r.schedule = [];
  r.itemSchedule = [];
  r.enemies = [];
  r.player.invuln = 0;
}

/** Puts a grunt on the contestant and lets the death freeze pass. */
function killPlayer(): void {
  const r = run();
  r.player.invuln = 0;
  r.player.shield = 0;
  r.enemies.push(spawnEnemy(9000 + r.deaths, 'grunt', r.player.x, r.player.y, rng));
  advance(DEATH_SECONDS + 0.5);
}

/** Walks the contestant out of the room's first open door and through the map. */
function walkOut(): void {
  const r = run();
  const side = r.openDoors[0];
  const c = doorCentre(side);
  const inward = side === 'e' ? { x: -1, y: 0 } : side === 'w' ? { x: 1, y: 0 } : side === 'n' ? { x: 0, y: 1 } : { x: 0, y: -1 };
  r.player.x = c.x + inward.x * 30;
  r.player.y = c.y + inward.y * 30;
  dev().setInput({ moveX: -inward.x, moveY: -inward.y, fireX: 0, fireY: 0 });
  advance(1.5);
  dev().setInput(null);
  advance(MAP_SECONDS + 0.5);
}

beforeEach(() => {
  installLocalStorage();
  vi.clearAllMocks();
  vi.mocked(fetchGlobal).mockResolvedValue(null);
  vi.mocked(submitGlobal).mockResolvedValue({ status: 'ok', rank: 1, table: [] });
  installJsdomShims();
  installCanvasContext();
  frames.install();
  vi.spyOn(Math, 'random').mockReturnValue(0.123456);
  mountHtml(PAGE_HTML, { canvasSize: [CANVAS_W, CANVAS_H] });
  // The dev handle only exists on a page opened with #dev, as Cascade's does.
  window.location.hash = '#dev';
  initPrimeTimeGame();
  frames.syncClock();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('PRIME TIME through the page', () => {
  it('starts the show: the music from the arena, the HUD at zero, the contestant mid-floor', () => {
    startRun();
    expect(mockAudio.start).toHaveBeenCalledTimes(1);
    expect(mockAudio.setScene).toHaveBeenLastCalledWith(null);
    expect(mockAudio.setDanger).toHaveBeenLastCalledWith(false);
    expect(text('cash')).toBe('$0');
    expect(text('lives')).toBe('3');
    expect(run().player.x).toBeCloseTo(ARENA.x + ARENA.w / 2);
  });

  it('moves on WASD and fires on the arrows, each on its own stick', () => {
    startRun();
    quiet(run());
    const x0 = run().player.x;
    pressKey(document.body, 'd');
    advance(0.5);
    expect(run().player.x).toBeGreaterThan(x0 + 40);
    // No arrow held: no shot fired.
    expect(run().shots).toEqual([]);
    const up = new KeyboardEvent('keyup', { key: 'd', bubbles: true });
    document.body.dispatchEvent(up);
    pressKey(document.body, 'ArrowUp');
    const x1 = run().player.x;
    advance(0.5);
    // Fire does not move the contestant, and every shot travels north.
    expect(run().player.x).toBe(x1);
    expect(run().shots.length).toBeGreaterThan(0);
    for (const s of run().shots) expect(s.vy).toBeLessThan(0);
  });

  it('puts every kill on the HUD and banks the run as it grows', () => {
    startRun();
    const r = run();
    quiet(r);
    r.enemies.push(spawnEnemy(1, 'grunt', r.player.x + 60, r.player.y, rng));
    dev().setInput({ moveX: 0, moveY: 0, fireX: 1, fireY: 0 });
    advance(0.5);
    expect(text('cash')).toBe(`$${ENEMIES.grunt.worth}`);
    expect(text('record')).toBe(`$${ENEMIES.grunt.worth}`);
    expect(Number(localStorage.getItem(bestKey('primetime')))).toBe(ENEMIES.grunt.worth);
  });

  it('ends the show on the third death: the overlay, the board, the ending and the floor flag', async () => {
    startRun();
    const r = run();
    quiet(r);
    r.enemies.push(spawnEnemy(1, 'grunt', r.player.x + 60, r.player.y, rng));
    dev().setInput({ moveX: 0, moveY: 0, fireX: 1, fireY: 0 });
    advance(0.5);
    dev().setInput(null);
    const cash = run().cash;
    expect(cash).toBeGreaterThan(0);
    killPlayer();
    expect(text('lives')).toBe('2');
    expect(mockAudio.setDanger).not.toHaveBeenCalledWith(true);
    killPlayer();
    expect(text('lives')).toBe('1');
    // The last life brings the danger variant in.
    expect(mockAudio.setDanger).toHaveBeenLastCalledWith(true);
    expect(overlayShown()).toBe(false);
    killPlayer();
    expect(overlayShown()).toBe(true);
    expect(text('over-title')).toBe("That's all, folks");
    expect(text('final-score')).toBe(`$${cash}`);
    expect(mockAudio.playEnding).toHaveBeenCalledWith(ENDINGS.gameOver);
    expect(document.getElementById('highscores')!.hidden).toBe(false);
    // Committed with the remembered initials when the player plays again.
    document.getElementById('again-btn')!.click();
    await Promise.resolve();
    expect(submitGlobal).toHaveBeenCalledWith('primetime', expect.any(String), cash);
    expect(localStorage.getItem(doneKey('primetime'))).not.toBeNull();
  });

  it('moves the music to the boss cue on entering a boss room, and back for the next studio', () => {
    startRun();
    const r = run();
    // The room before the first boss, cleared.
    r.roomKey = 'D';
    quiet(r);
    advance(0.25);
    expect(r.phase).toBe('cleared');
    expect(r.openDoors).toEqual(['e']);
    walkOut();
    expect(run().roomKey).toBe(CIRCUITS[0].boss);
    expect(run().boss).not.toBeNull();
    expect(mockAudio.setScene).toHaveBeenLastCalledWith(SCENES.boss);
    // Entering the boss room is a scene change, which leaves the danger
    // variant, so the last-life state is asserted again after it.
    expect(mockAudio.setDanger).toHaveBeenLastCalledWith(false);
    run().lives = 1;
    // Beat it and walk out: the next studio opens on the arena loop again.
    run().enemies = [];
    advance(0.25);
    expect(run().phase).toBe('cleared');
    const livesBefore = run().lives;
    walkOut();
    expect(run().circuit).toBe(1);
    expect(run().lives).toBe(livesBefore + 1);
    expect(mockAudio.playStinger).toHaveBeenCalledWith('studioClear');
    expect(mockAudio.setScene).toHaveBeenLastCalledWith(null);
    // Lives were set to 1 before the studio's bonus life, so entering studio
    // 2 (lives 2) re-asserts the danger state off rather than on.
    expect(mockAudio.setDanger).toHaveBeenLastCalledWith(false);
    expect(text('studio')).toBe('2');
  });

  it('wins the show past the last boss, with the winner ending and its overlay', () => {
    startRun();
    jumpToRoom(run(), 2, CIRCUITS[2].boss);
    quiet(run());
    advance(0.25);
    expect(run().phase).toBe('cleared');
    // Out of the east door by hand, so the moment of arrival can be caught.
    const c = doorCentre('e');
    run().player.x = c.x - 30;
    run().player.y = c.y;
    dev().setInput({ moveX: 1, moveY: 0, fireX: 0, fireY: 0 });
    advance(1.5);
    dev().setInput(null);
    advance(MAP_SECONDS);
    expect(run().phase).toBe('won');
    // No keys: the host's line is read before the overlay goes up.
    expect(overlayShown()).toBe(false);
    advance(2.5);
    expect(overlayShown()).toBe(true);
    expect(text('over-title')).toBe('Grand champion!');
    expect(mockAudio.playEnding).toHaveBeenCalledWith(ENDINGS.winner);
  });

  it('stays paused while the pause key is held: a key repeat is not a second press', () => {
    startRun();
    quiet(run());
    pressKey(document.body, 'p');
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', bubbles: true, cancelable: true, repeat: true }));
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', bubbles: true, cancelable: true, repeat: true }));
    const t0 = run().t;
    advance(0.5);
    expect(run().t).toBe(t0);
    expect(mockAudio.setPaused).toHaveBeenLastCalledWith(true);
  });

  it("lets a boss's fall be the room's fanfare, and plays the extra-life phrase on a life", () => {
    startRun();
    const r = run();
    jumpToRoom(r, 0, CIRCUITS[0].boss);
    quiet(r);
    const boss = spawnEnemy(5000, 'mine', 0, 0, rng);
    // A one-shot boss standing on the contestant's line of fire.
    // Past his entrance, with his fan and his grunt call both far off, so the
    // only thing left in the room is the boss himself.
    Object.assign(boss, { kind: 'mutoid', boss: true, hp: 1, maxHp: 150, x: r.player.x + 80, y: r.player.y, r: 34, worth: 25000, t: 5, timer: 100, phase: 100 });
    r.enemies = [boss];
    r.boss = boss;
    mockAudio.playStinger.mockClear();
    dev().setInput({ moveX: 0, moveY: 0, fireX: 1, fireY: 0 });
    advance(0.5);
    dev().setInput(null);
    // The clear waits for the boss's last shots to leave the floor.
    advance(4);
    expect(run().phase).toBe('cleared');
    const played = mockAudio.playStinger.mock.calls.map(c => (c as unknown[])[0]);
    expect(played).toContain('bossDown');
    expect(played).not.toContain('roomClear');
    // An extra life has its own phrase.
    run().items.push({ id: 77, item: 'life', x: run().player.x, y: run().player.y, ttl: 9, r: 14 });
    advance(0.25);
    expect(mockAudio.playStinger).toHaveBeenCalledWith('extraLife');
  });

  it('pauses from the header button too, for a touch player with no keyboard', () => {
    startRun();
    document.getElementById('pause-btn')!.click();
    expect(mockAudio.setPaused).toHaveBeenLastCalledWith(true);
    document.getElementById('pause-btn')!.click();
    expect(mockAudio.setPaused).toHaveBeenLastCalledWith(false);
  });

  it('pauses on P with the music muffled, and resumes on the next P', () => {
    startRun();
    quiet(run());
    const t0 = run().t;
    pressKey(document.body, 'p');
    advance(0.5);
    expect(mockAudio.setPaused).toHaveBeenLastCalledWith(true);
    expect(run().t).toBe(t0);
    pressKey(document.body, 'p');
    advance(0.5);
    expect(mockAudio.setPaused).toHaveBeenLastCalledWith(false);
    expect(run().t).toBeGreaterThan(t0);
  });

  it('wires nothing twice: a second init on the same root is a no-op', () => {
    initPrimeTimeGame();
    startRun();
    expect(mockAudio.start).toHaveBeenCalledTimes(1);
  });
});
