/**
 * PRIME TIME: the arcade's twin-stick cabinet, after Smash TV (1990).
 *
 * The rules live in `run.ts` and its neighbours (DOM-free, played headlessly
 * by the tests); `render.ts` draws, `input.ts` reads the sticks, `sound.ts`
 * and `music.ts` are the ears. This module owns the wiring: the page's
 * elements, the loop, which run event becomes which flash, floater, toast,
 * stinger or HUD write, the scoreboard, and the overlays. It expects the
 * markup in src/pages/[lang]/fun/primetime.astro.
 */
import {
  createEffects,
  createGameAudio,
  createGameLoop,
  createStaticLayer,
  createToaster,
  initScoreboard,
  listenUntilSwap,
  mountCabinet,
  setupHiDpiCanvas,
  wireSoundToggles
} from '../engine';
import { CANVAS_H, CANVAS_W } from './arena';
import { ENEMIES } from './enemies';
import { ITEMS, type ItemId } from './items';
import { createTwinStick } from './input';
import { ENDINGS, PRIMETIME_MUSIC, SCENES, STINGERS } from './music';
import {
  DOME_THEME,
  ENEMY_COLOR,
  THEMES,
  drawBanner,
  drawBossBar,
  drawDomeHud,
  drawDoorContents,
  drawDoors,
  drawEnemies,
  drawItems,
  drawMap,
  drawPaused,
  drawPlayer,
  drawShock,
  drawShots,
  drawSticks,
  paintStudio,
  type StudioTheme
} from './render';
import { CIRCUITS } from './rooms';
import { NO_INPUT, createRun, tickRun, type HostLine, type RunEvent, type RunInput, type RunState } from './run';
import { createArenaSound } from './sound';
import type { WeaponId } from './weapons';

type Phase = 'idle' | 'play' | 'paused' | 'over';

/** Seconds a host line stays up. */
const BANNER_SECONDS = 1.8;
/** Seconds the muzzle flash lasts after a shot. */
const FLASH_SECONDS = 0.05;

export function initPrimeTimeGame(): void {
  const mounted = mountCabinet('primetime-root');
  if (!mounted) return;
  const { root, canvas, ctx, el } = mounted;
  const startOverlay = el('start-overlay');
  const overOverlay = el('over-overlay');
  const startBtn = el('start-btn');
  const againBtn = el('again-btn');
  const finalScoreEl = el('final-score');
  const cashEl = el('cash');
  const livesEl = el('lives');
  const keysEl = el('keys');
  const weaponEl = el('weapon');
  const studioEl = el('studio');
  const recordEl = el('record');
  const overIcon = el('over-icon');
  const overTitle = el('over-title');
  const overDesc = el('over-desc');

  const t = (key: string): string => root.dataset[key] ?? '';
  const strings = {
    host: {
      bigMoney: t('tBigMoney'),
      bigPrizes: t('tBigPrizes'),
      loveIt: t('tLoveIt'),
      carnage: t('tCarnage'),
      goodLuck: t('tGoodLuck'),
      newCar: t('tNewCar'),
      noKeys: t('tNoKeys'),
      extraLife: t('tExtraLife')
    } satisfies Record<HostLine, string>,
    studio: t('tStudio'),
    studioClear: t('tStudioClear'),
    dome: t('tDome'),
    lastLife: t('tLastLife'),
    paused: t('tPaused'),
    newRecord: t('tNewRecord'),
    gameOver: t('tGameOver'),
    gameOverDesc: t('tGameOverDesc'),
    winner: t('tWinner'),
    winnerDesc: t('tWinnerDesc'),
    weapons: {
      machine: t('tWeaponMachine'),
      spread: t('tWeaponSpread'),
      grenade: t('tWeaponGrenade'),
      rocket: t('tWeaponRocket')
    } satisfies Record<WeaponId, string>,
    gear: {
      shield: t('tItemShield'),
      boots: t('tItemBoots'),
      bomb: t('tItemBomb'),
      life: t('tItemLife')
    } as Partial<Record<ItemId, string>>
  };

  const showToast = createToaster(document.getElementById('toast-area')).show;

  // --- Canvas ------------------------------------------------------------------
  let theme: StudioTheme = THEMES[0];
  const ground = createStaticLayer(CANVAS_W, CANVAS_H, target => paintStudio(target, theme));
  const hidpi = setupHiDpiCanvas(canvas, ctx, CANVAS_W, CANVAS_H, { onApply: ground.rebuild });
  function setTheme(next: StudioTheme) {
    if (next === theme) return;
    theme = next;
    ground.rebuild();
  }

  // --- State --------------------------------------------------------------------
  let phase: Phase = 'idle';
  let run: RunState = createRun();
  let clock = 0;
  let flashT = 0;
  let banner = { text: '', life: 0, colour: '#fff' };
  let shock: { x: number; y: number; t: number; radius: number } | null = null;
  /** A white flash over the floor (the smart bomb). */
  let whiteout = 0;
  /** The DOM test's hand on the sticks; null means the real ones. */
  let devInput: RunInput | null = null;
  /** Seconds until a won run's overlay goes up; 0 is none pending. */
  let pendingEnd = 0;
  const hud = { cash: -1, lives: -1, keys: -1, weapon: '', studio: -1 };

  const fx = createEffects({
    gravityScale: 0,
    burstSpeed: 120,
    burstSize: 2,
    burstLife: 0.45,
    glowBlur: 6,
    floaterSize: 13,
    floaterRise: 26,
    floaterLife: 1
  });

  const board = initScoreboard(document.getElementById('highscores'));
  const dollars = (n: number) => `$${n.toLocaleString('en-US')}`;
  recordEl.textContent = dollars(board.best());

  const audio = createGameAudio(PRIMETIME_MUSIC);
  wireSoundToggles(audio);
  const sound = createArenaSound(audio);

  const sticks = createTwinStick(canvas, hidpi.toLogical, listenUntilSwap, () => phase === 'play');

  // --- Helpers --------------------------------------------------------------------
  function say(text: string, colour = theme.trim) {
    banner = { text, life: BANNER_SECONDS, colour };
  }

  function bankScore() {
    const { best, newRecord } = board.bank(run.cash);
    if (newRecord) showToast(`🏅 ${strings.newRecord}`);
    recordEl.textContent = dollars(best);
  }

  function updateHud() {
    if (hud.cash !== run.cash) {
      hud.cash = run.cash;
      cashEl.textContent = dollars(run.cash);
    }
    if (hud.lives !== run.lives) {
      hud.lives = run.lives;
      livesEl.textContent = `${run.lives}`;
    }
    if (hud.keys !== run.keys) {
      hud.keys = run.keys;
      keysEl.textContent = `${run.keys}`;
    }
    const weapon = run.player.weapon === 'machine' ? strings.weapons.machine : `${strings.weapons[run.player.weapon]} ${run.player.ammo}`;
    if (hud.weapon !== weapon) {
      hud.weapon = weapon;
      weaponEl.textContent = weapon;
    }
    const studio = run.phase === 'dome' ? 4 : run.circuit + 1;
    if (hud.studio !== studio) {
      hud.studio = studio;
      studioEl.textContent = run.phase === 'dome' ? '★' : `${studio}`;
    }
  }

  function themeFor(r: RunState): StudioTheme {
    return r.phase === 'dome' ? DOME_THEME : THEMES[Math.min(THEMES.length - 1, r.circuit)];
  }

  // --- Run lifecycle ------------------------------------------------------------------
  function startRun() {
    run = createRun(Math.floor(Math.random() * 1_000_000));
    fx.clear();
    banner.life = 0;
    shock = null;
    whiteout = 0;
    flashT = 0;
    pendingEnd = 0;
    setTheme(themeFor(run));
    board.beginRun();
    recordEl.textContent = dollars(board.best());
    sticks.release();
    phase = 'play';
    audio.setDanger(false);
    audio.setScene(null);
    audio.start();
    say(strings.studio.replace('{n}', '1'));
    updateHud();
  }

  function endRun(kind: 'over' | 'won') {
    phase = 'over';
    sticks.release();
    if (!audio.playEnding(kind === 'won' ? ENDINGS.winner : ENDINGS.gameOver)) {
      audio.playSfx(kind === 'won' ? 'rescue' : 'gameover');
      audio.stop();
    }
    bankScore();
    updateHud();
    finalScoreEl.textContent = dollars(run.cash);
    overIcon.textContent = kind === 'won' ? '🏆' : '📺';
    overTitle.textContent = kind === 'won' ? strings.winner : strings.gameOver;
    overDesc.textContent = kind === 'won' ? strings.winnerDesc : strings.gameOverDesc;
    overOverlay.style.display = 'flex';
    board.show(run.cash);
  }

  function handleEvents(events: RunEvent[]) {
    for (const ev of events) {
      switch (ev.type) {
        case 'cash':
          fx.floater(ev.x, ev.y - 14, `+${dollars(ev.amount)}`, '#fde047', ev.amount >= 5000 ? { size: 18, glow: true, life: 1.4 } : {});
          bankScore();
          break;
        case 'kill': {
          const big = ev.kind === 'tank' || ev.kind === 'shrapnel' || ev.kind === 'snake';
          fx.burst(ev.x, ev.y, big ? 14 : 6, ENEMY_COLOR[ev.kind], big ? { speed: 160, life: 0.6, size: 2.5 } : {});
          if (ev.kind in ENEMIES) sound.play(big ? 'bigKill' : 'kill');
          break;
        }
        case 'shot':
          flashT = FLASH_SECONDS;
          sound.play(ev.weapon);
          break;
        case 'hit':
          fx.burst(ev.x, ev.y, 2, '#fff', { speed: 60, life: 0.2, size: 1.2 });
          if (run.boss && Math.hypot(ev.x - run.boss.x, ev.y - run.boss.y) <= run.boss.r + 8) sound.play('bossHit');
          break;
        case 'blast':
          fx.burst(ev.x, ev.y, 26, '#fb923c', { speed: ev.radius * 2.4, life: 0.5, size: 3, glow: true });
          fx.burst(ev.x, ev.y, 10, '#fef3c7', { speed: ev.radius * 1.2, life: 0.3, size: 2 });
          sound.play('blast');
          break;
        case 'pickup': {
          const def = ITEMS[ev.item];
          if (def.worth > 0) {
            sound.play('prize');
            audio.playStinger(ev.item === 'car' ? STINGERS.car : STINGERS.prize);
          } else {
            sound.play('pickup');
            if (ev.item === 'life') audio.playStinger(STINGERS.extraLife);
            const name = def.weapon ? strings.weapons[def.weapon] : strings.gear[ev.item];
            if (name) showToast(name);
          }
          fx.burst(ev.x, ev.y, 10, '#facc15', { speed: 90, life: 0.5, size: 2, glow: true });
          break;
        }
        case 'death':
          fx.burst(ev.x, ev.y, 30, '#ef4444', { speed: 180, life: 0.8, size: 3 });
          fx.burst(ev.x, ev.y, 12, '#fbbf24', { speed: 90, life: 0.6, size: 2.5 });
          sound.play('death');
          audio.playStinger(STINGERS.death);
          break;
        case 'respawn':
          shock = { x: ev.x, y: ev.y, t: 0, radius: ev.radius };
          sound.play('respawn');
          if (run.lives === 1) {
            say(strings.lastLife, '#ef4444');
            audio.setDanger(true);
          }
          break;
        case 'roomClear':
          // A boss room's clear is the boss's fall, which has its own phrase;
          // the generic clear stinger would cut it (the clear can also trail
          // the fall by the sweep of the boss's last shots, so the room is
          // read, not the batch).
          if (!CIRCUITS[run.circuit].rooms[run.roomKey].boss) audio.playStinger(STINGERS.roomClear);
          sound.play('doors');
          break;
        case 'host':
          say(strings.host[ev.line], ev.line === 'carnage' ? '#ef4444' : ev.line === 'newCar' ? '#facc15' : theme.trim);
          break;
        case 'enterRoom':
          setTheme(themeFor(run));
          audio.setScene(ev.boss ? SCENES.boss : null);
          // A scene change takes the score out of the danger variant (see
          // Cascade's tune changes), so the last life is asserted again here.
          audio.setDanger(run.lives === 1);
          if (ev.key === CIRCUITS[ev.circuit].start && run.roomsCleared > 0) say(strings.studio.replace('{n}', String(ev.circuit + 1)));
          break;
        case 'bossStage':
          if (run.boss) fx.burst(run.boss.x, run.boss.y, 24, '#fff', { speed: 200, life: 0.5, size: 2.5, glow: true });
          sound.play('bigKill');
          break;
        case 'bossDown':
          for (let i = 0; i < 5; i++) {
            fx.burst(ev.x + (Math.random() - 0.5) * 50, ev.y + (Math.random() - 0.5) * 50, 20, ENEMY_COLOR[ev.kind], { speed: 220, life: 0.9, size: 3, glow: true });
          }
          sound.play('bomb');
          audio.playStinger(STINGERS.bossDown);
          break;
        case 'studioClear':
          audio.playStinger(STINGERS.studioClear);
          showToast(strings.studioClear.replace('{n}', String(ev.studio)).replace('{bonus}', ev.bonus.toLocaleString('en-US')));
          if (run.lives > 1) audio.setDanger(false);
          break;
        case 'bomb':
          whiteout = 0.5;
          sound.play('bomb');
          break;
        case 'dome':
          setTheme(DOME_THEME);
          audio.setScene(SCENES.dome);
          audio.setDanger(false);
          say(strings.dome, '#facc15');
          break;
        case 'gameOver':
          endRun('over');
          break;
        case 'won':
          // A win in the same tick as a host line (no keys for the dome)
          // would hide the line under the overlay: let it be read first.
          pendingEnd = Math.max(0.05, banner.life);
          break;
        case 'doorsOpen':
        case 'exit':
          break;
      }
      if (ev.type === 'pickup' && ev.item === 'life' && run.lives > 1) audio.setDanger(false);
    }
  }

  // --- Pause -------------------------------------------------------------------------
  function setPaused(on: boolean) {
    if (on && phase === 'play') {
      phase = 'paused';
      sticks.release();
      audio.setPaused(true);
    } else if (!on && phase === 'paused') {
      phase = 'play';
      audio.setPaused(false);
    }
  }
  listenUntilSwap(document, 'keydown', e => {
    // A held key repeats, and a repeat would resume what the press paused.
    if (e.repeat) return;
    if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
      if (phase === 'play') setPaused(true);
      else if (phase === 'paused') setPaused(false);
    }
  });
  // A hidden tab pauses the show. `visibilitychange` is a document event the
  // engine's `listenUntilSwap` (typed on window events) does not cover, so it
  // retires itself the same way by hand.
  const onVisibility = () => {
    if (document.hidden) setPaused(true);
  };
  document.addEventListener('visibilitychange', onVisibility);
  document.addEventListener('astro:before-swap', () => document.removeEventListener('visibilitychange', onVisibility), {
    once: true
  });
  // A tap on the pause card resumes, for a touch player with no P key; the
  // header's pause button is their way in.
  canvas.addEventListener('pointerdown', () => {
    if (phase === 'paused') setPaused(false);
  });
  document.getElementById('pause-btn')?.addEventListener('click', () => {
    if (phase === 'play') setPaused(true);
    else if (phase === 'paused') setPaused(false);
  });
  // Alt-tabbing away without hiding the tab would leave a held key latched.
  listenUntilSwap(window, 'blur', () => sticks.release());

  // --- Loop ----------------------------------------------------------------------------
  function update(dt: number) {
    clock += dt;
    flashT = Math.max(0, flashT - dt);
    banner.life = Math.max(0, banner.life - dt);
    whiteout = Math.max(0, whiteout - dt);
    if (shock) shock.t += dt;
    fx.update(dt);
    if (phase !== 'play') return;
    if (pendingEnd > 0) {
      pendingEnd -= dt;
      if (pendingEnd <= 0) {
        pendingEnd = 0;
        endRun('won');
      }
      return;
    }
    const input = devInput ?? sticks.read(run.player);
    handleEvents(tickRun(run, input, dt));
    updateHud();
  }

  function render() {
    ground.draw(ctx);
    if (run.phase === 'map') {
      drawMap(ctx, run, { studio: strings.studio, dome: strings.dome }, theme);
    } else {
      drawDoors(ctx, run, clock, theme);
      drawDoorContents(ctx, run);
      drawItems(ctx, run.items, clock);
      drawEnemies(ctx, run, clock);
      drawShots(ctx, run);
      drawPlayer(ctx, run, clock, flashT);
      fx.draw(ctx);
      drawShock(ctx, shock);
      drawBossBar(ctx, run);
      if (run.phase === 'dome') drawDomeHud(ctx, run, { studio: strings.studio, dome: strings.dome });
      if (whiteout > 0) {
        ctx.fillStyle = `rgba(255, 255, 255, ${whiteout * 1.6})`;
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      }
      drawBanner(ctx, banner.text, banner.life, banner.colour);
      drawSticks(ctx, sticks.move, sticks.fire);
    }
    if (phase === 'paused') drawPaused(ctx, strings.paused);
  }

  const loop = createGameLoop(update, render);

  startBtn.addEventListener('click', () => {
    startOverlay.style.display = 'none';
    startRun();
  });
  againBtn.addEventListener('click', () => {
    board.hide();
    overOverlay.style.display = 'none';
    startRun();
  });

  updateHud();
  loop.start();

  // A hand on the sticks for the DOM suite and for play-testing bots, only
  // when the page is opened with #dev, as Cascade's `cascadeDev`; retired
  // with the page so a ClientRouter swap cannot leave it pointing at a dead
  // run. Never read by the game itself.
  if (window.location.hash === '#dev') {
    const devWindow = window as unknown as Record<string, unknown>;
    devWindow.primetimeDev = {
      getRun: () => run,
      setInput: (input: RunInput | null) => {
        devInput = input;
      },
      noInput: NO_INPUT
    };
    document.addEventListener('astro:before-swap', () => delete devWindow.primetimeDev, { once: true });
  }
}
