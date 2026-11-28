/**
 * HOTFIX: the arcade's open-city cabinet, after the top-down city games of
 * 1997. One on-call shift in a town that is half Edinburgh and half
 * Barcelona: answer the ringing phone boxes, borrow whatever has wheels, and
 * run errands that are each a joke about something the owner maintains.
 *
 * The rules live in `run.ts` over `map.ts` and `jobs.ts` (DOM-free, played
 * headlessly by the tests); `render.ts` draws, `input.ts` reads the controls,
 * `sound.ts` and `music.ts` are the ears. This module owns the wiring: the
 * page's elements, the loop and the camera, which run event becomes which
 * sound, floater, toast, banner or HUD write, the scoreboard, and the
 * overlays. It expects the markup in src/pages/[lang]/fun/hotfix.astro.
 */
import {
  createEffects,
  createGameAudio,
  createGameLoop,
  createToaster,
  formatClock,
  initScoreboard,
  listenUntilSwap,
  mountCabinet,
  setupHiDpiCanvas,
  wireSoundToggles
} from '../engine';
import { createControls } from './input';
import type { JobId } from './jobs';
import { CITY, DISTRICT_NAMES, WORLD_H, WORLD_W, type PlaceId, type Point } from './map';
import { ENDING, HOTFIX_MUSIC, STINGERS } from './music';
import {
  VIEW_H,
  VIEW_W,
  createCityLayer,
  drawArrow,
  drawBeam,
  drawBug,
  drawCar,
  drawDusk,
  drawHeadlights,
  drawHud,
  drawMarker,
  drawPerson,
  drawPhone,
  drawPlayer,
  drawRain,
  drawStick,
  drawWash,
  type Camera
} from './render';
import {
  CAR_SPECS,
  NO_INPUT,
  carSpeed,
  createRun,
  heatLevel,
  nearestObjective,
  objective,
  playerPos,
  sonarSignal,
  tickRun,
  type RunEvent,
  type RunInput,
  type RunState
} from './run';
import { createCitySound } from './sound';

type Phase = 'idle' | 'play' | 'paused' | 'over';

interface Strings {
  jobs: Record<JobId, { title: string; brief: string }>;
  places: Record<PlaceId, string>;
  ui: Record<string, string>;
}

/** Seconds of shift over which the afternoon turns to night. */
const DUSK_SECONDS = 150;
const money = (n: number): string => `£${n.toLocaleString('en-GB')}`;
const fill = (text: string, values: Record<string, string | number>): string =>
  text.replace(/\{(\w+)\}/g, (_, key: string) => `${values[key] ?? ''}`);

export function initHotfixGame(): void {
  const mounted = mountCabinet('hotfix-root');
  if (!mounted) return;
  const { root, canvas, ctx, el } = mounted;
  const startOverlay = el('start-overlay');
  const overOverlay = el('over-overlay');
  const startBtn = el('start-btn');
  const againBtn = el('again-btn');
  const cashEl = el('cash');
  const multEl = el('mult');
  const clockEl = el('clock');
  const heatEl = el('heat');
  const recordEl = el('record');
  const objectiveEl = el('objective');
  const finalScoreEl = el('final-score');
  const finalJobsEl = el('final-jobs');
  const finalBugsEl = el('final-bugs');

  const parse = <V>(key: string): V => JSON.parse(root.dataset[key] ?? '{}') as V;
  const strings: Strings = { jobs: parse('tJobs'), places: parse('tPlaces'), ui: parse('tUi') };
  const ui = (key: string): string => strings.ui[key] ?? '';

  const toastArea = document.getElementById('toast-area');
  const showToast = createToaster(toastArea).show;
  // A job's brief is a sentence or two, and wants reading at the wheel.
  const showBrief = createToaster(toastArea, { durationMs: 6500 }).show;

  // --- Canvas ------------------------------------------------------------------
  const city = createCityLayer();
  const hidpi = setupHiDpiCanvas(canvas, ctx, VIEW_W, VIEW_H, { onApply: city.reset });

  // --- State --------------------------------------------------------------------
  let phase: Phase = 'idle';
  let run: RunState = createRun();
  let clock = 0;
  const cam: Camera = { x: CITY.places.home.x, y: CITY.places.home.y, zoom: 1.45 };
  let banner = { text: '', left: 0, color: '#fff' };
  let shake = 0;
  let rain = 0;
  let ringIn = 0;
  let pingIn = 0;
  let tickIn = 0;
  let smokeIn = 0;
  let skids: { x: number; y: number; a: number; life: number }[] = [];
  let stains: { x: number; y: number; life: number }[] = [];
  /** The DOM test's hand on the wheel; null means the real controls. */
  let devInput: RunInput | null = null;
  const hud = { cash: -1, mult: -1, clock: -1, heat: -1, objective: '' };

  const fx = createEffects({
    gravityScale: 0,
    burstSpeed: 110,
    burstSize: 2,
    burstLife: 0.5,
    floaterSize: 12,
    floaterRise: 24,
    floaterLife: 1.1
  });

  const board = initScoreboard(document.getElementById('highscores'));
  recordEl.textContent = money(board.best());

  const audio = createGameAudio(HOTFIX_MUSIC);
  wireSoundToggles(audio);
  const sound = createCitySound(audio);

  const controls = createControls(canvas, hidpi.toLogical, listenUntilSwap, () => phase === 'play', {
    action: document.getElementById('btn-action'),
    handbrake: document.getElementById('btn-brake'),
    horn: document.getElementById('btn-horn')
  });

  // --- Helpers --------------------------------------------------------------------
  const say = (text: string, color = '#f8fafc', seconds = 1.8) => {
    banner = { text, left: seconds, color };
  };
  /** How loud something at a point is from where the player stands: 1 beside them, 0 out of earshot. */
  const near = (x: number, y: number, range = 460): number => {
    const p = playerPos(run);
    return Math.max(0, 1 - Math.hypot(x - p.x, y - p.y) / range);
  };

  function bankScore() {
    const { best, newRecord } = board.bank(run.cash);
    if (newRecord) showToast(`🏅 ${ui('newRecord')}`);
    recordEl.textContent = money(best);
  }

  function objectiveText(): string {
    const job = run.job;
    if (!job) return ui('objPhone');
    const stage = job.def.stages[job.stage];
    if (stage.type === 'goto') return fill(ui('objGoto'), { place: strings.places[stage.place] });
    if (stage.type === 'sweep') return fill(ui('objSweep'), { places: job.remaining.map(id => strings.places[id]).join(' · ') });
    if (stage.type === 'squash') return fill(ui('objSquash'), { n: job.count });
    if (stage.type === 'collect') return fill(ui(run.player.car ? 'objCollectCar' : 'objCollect'), { n: job.count });
    return ui('objSonar');
  }

  function updateHud() {
    if (hud.cash !== run.cash) {
      hud.cash = run.cash;
      cashEl.textContent = money(run.cash);
    }
    if (hud.mult !== run.mult) {
      hud.mult = run.mult;
      multEl.textContent = `×${run.mult}`;
    }
    const seconds = Math.ceil(run.clock);
    if (hud.clock !== seconds) {
      hud.clock = seconds;
      clockEl.textContent = formatClock(seconds);
      clockEl.classList.toggle('urgent', seconds <= 10);
    }
    const level = heatLevel(run);
    if (hud.heat !== level) {
      hud.heat = level;
      heatEl.textContent = level ? '🚨'.repeat(level) : '—';
    }
    const text = objectiveText();
    if (hud.objective !== text) {
      hud.objective = text;
      objectiveEl.textContent = text;
    }
  }

  // --- Run lifecycle ------------------------------------------------------------------
  function startRun() {
    run = createRun(Math.floor(Math.random() * 1_000_000));
    fx.clear();
    skids = [];
    stains = [];
    banner.left = 0;
    shake = 0;
    rain = 0;
    cam.x = run.player.x;
    cam.y = run.player.y;
    cam.zoom = 1.45;
    board.beginRun();
    recordEl.textContent = money(board.best());
    controls.release();
    phase = 'play';
    audio.setDanger(false);
    audio.setPaused(false);
    audio.start();
    say(DISTRICT_NAMES[run.district], '#fde68a', 2.4);
    updateHud();
  }

  function endRun() {
    phase = 'over';
    controls.release();
    sound.quiet();
    if (!audio.playEnding(ENDING)) {
      audio.playSfx('gameover');
      audio.stop();
    }
    bankScore();
    updateHud();
    finalScoreEl.textContent = money(run.cash);
    finalJobsEl.textContent = `${run.jobsDone}`;
    finalBugsEl.textContent = `${run.squashed}`;
    overOverlay.style.display = 'flex';
    board.show(run.cash);
  }

  function handleEvents(events: RunEvent[]) {
    for (const ev of events) {
      switch (ev.type) {
        case 'cash':
          fx.floater(ev.x, ev.y - 12, `+${money(ev.amount)}`, '#fde047', ev.amount >= 200 ? { size: 17, glow: true, life: 1.6 } : {});
          bankScore();
          break;
        case 'crash': {
          const level = Math.min(1, ev.speed / 220) * near(ev.x, ev.y);
          sound.play(ev.speed > 110 ? 'crash' : 'bump', level);
          fx.burst(ev.x, ev.y, ev.speed > 110 ? 10 : 4, '#fde68a', { speed: 60 + ev.speed * 0.5, life: 0.3, size: 1.5 });
          if (ev.player) shake = Math.max(shake, Math.min(9, ev.speed / 26));
          break;
        }
        case 'squash':
          stains.push({ x: ev.x, y: ev.y, life: 30 });
          sound.play('squash');
          fx.burst(ev.x, ev.y, 9, ev.gold ? '#facc15' : '#84cc16', { speed: 90, life: 0.4, size: 2 });
          break;
        case 'dive':
          sound.play('yelp', near(ev.x, ev.y, 300));
          break;
        case 'enter':
        case 'exit':
          sound.play('door');
          break;
        case 'jack':
          fx.floater(run.player.x, run.player.y - 16, ui('oi'), '#fca5a5');
          break;
        case 'job': {
          const job = strings.jobs[ev.id];
          showBrief(`📟 ${job.title}: ${job.brief}`);
          if (!audio.playStinger(STINGERS.job)) audio.playSfx('blip');
          break;
        }
        case 'stage':
          sound.play('checkpoint');
          break;
        case 'jobDone':
          say(`${strings.jobs[ev.id].title} ✓`, '#86efac', 2.2);
          sound.play('cash');
          if (!audio.playStinger(STINGERS.done)) audio.playSfx('score');
          fx.burst(playerPos(run).x, playerPos(run).y, 26, '#fde047', { speed: 170, life: 0.8, size: 2.5, glow: true });
          break;
        case 'jobFailed':
          showToast(`⌛ ${fill(ui('jobFailed'), { job: strings.jobs[ev.id].title })}`);
          if (!audio.playStinger(STINGERS.failed)) audio.playSfx('hit');
          break;
        case 'heat':
          audio.setDanger(ev.level >= 2);
          break;
        case 'busted':
          say(ui('busted'), '#93c5fd', 2.6);
          showToast(`🚓 ${ui('bustedDesc')}`);
          sound.play('whistle');
          if (!audio.playStinger(STINGERS.busted)) audio.playSfx('hit');
          cam.x = run.player.x;
          cam.y = run.player.y;
          break;
        case 'burning':
          showToast(`🔥 ${ui('burning')}`);
          break;
        case 'explode': {
          const level = near(ev.x, ev.y, 700);
          sound.play('explode', level);
          shake = Math.max(shake, 14 * level);
          fx.burst(ev.x, ev.y, 34, '#fb923c', { speed: 220, life: 0.7, size: 3.5, glow: true });
          fx.burst(ev.x, ev.y, 16, '#fef3c7', { speed: 110, life: 0.4, size: 2.5 });
          fx.burst(ev.x, ev.y, 18, '#44403c', { speed: 70, life: 1.3, size: 4 });
          stains.push({ x: ev.x, y: ev.y, life: 60 });
          break;
        }
        case 'wrecked':
          showToast(`💥 ${ui('wrecked')}`);
          break;
        case 'rain':
          if (ev.on) showToast(`🌧️ ${ui('rain')}`);
          break;
        case 'wash':
          sound.play('wash');
          showToast(`🫧 ${ui('washed')}`);
          fx.burst(playerPos(run).x, playerPos(run).y, 24, '#e0f2fe', { speed: 80, life: 0.9, size: 3 });
          break;
        case 'collect':
          sound.play('checkpoint');
          fx.floater(ev.x, ev.y - 10, '🐧', '#fff', { size: 16 });
          break;
        case 'checkpoint':
          sound.play('checkpoint');
          fx.floater(ev.x, ev.y - 14, '✓', '#86efac', { size: 20, glow: true });
          break;
        case 'bump':
          fx.floater(playerPos(run).x, playerPos(run).y - 18, ui('ahem'), '#e2e8f0');
          break;
        case 'district':
          say(DISTRICT_NAMES[ev.id], '#fde68a', 2.2);
          break;
        case 'horn':
          sound.play('horn');
          break;
        case 'warn':
          showToast(`⏰ ${ui('warn')}`);
          break;
        case 'over':
          endRun();
          break;
      }
    }
  }

  // --- Pause -------------------------------------------------------------------------
  function setPaused(on: boolean) {
    if (on && phase === 'play') {
      phase = 'paused';
      controls.release();
      sound.quiet();
      audio.setPaused(true);
    } else if (!on && phase === 'paused') {
      phase = 'play';
      audio.setPaused(false);
    }
  }
  const togglePause = () => setPaused(phase === 'play');
  listenUntilSwap(document, 'keydown', e => {
    // A held key repeats, and a repeat would resume what the press paused.
    if (e.repeat) return;
    if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') togglePause();
  });
  // A hidden tab pauses the shift. `visibilitychange` is a document event the
  // engine's `listenUntilSwap` (typed on window events) does not cover, so it
  // retires itself the same way by hand.
  const onVisibility = () => {
    if (document.hidden) setPaused(true);
  };
  document.addEventListener('visibilitychange', onVisibility);
  document.addEventListener('astro:before-swap', () => document.removeEventListener('visibilitychange', onVisibility), {
    once: true
  });
  canvas.addEventListener('pointerdown', () => {
    if (phase === 'paused') setPaused(false);
  });
  document.getElementById('pause-btn')?.addEventListener('click', togglePause);
  // Alt-tabbing away without hiding the tab would leave a held key latched.
  listenUntilSwap(window, 'blur', () => controls.release());

  // --- Loop ----------------------------------------------------------------------------
  function followCamera(dt: number) {
    const car = run.player.car;
    const p = playerPos(run);
    const vx = car ? car.vx : 0;
    const vy = car ? car.vy : 0;
    const speed = car ? carSpeed(car) : 0;
    // Look ahead of a moving car, and pull back as it gathers speed.
    const wantZoom = car ? 1.2 - Math.min(1, speed / 240) * 0.38 : 1.45;
    cam.zoom += (wantZoom - cam.zoom) * Math.min(1, dt * 2);
    const k = Math.min(1, dt * 5);
    cam.x += (p.x + vx * 0.35 - cam.x) * k;
    cam.y += (p.y + vy * 0.35 - cam.y) * k;
    const halfW = VIEW_W / 2 / cam.zoom;
    const halfH = VIEW_H / 2 / cam.zoom;
    cam.x = Math.min(WORLD_W - halfW, Math.max(halfW, cam.x));
    cam.y = Math.min(WORLD_H - halfH, Math.max(halfH, cam.y));
  }

  function ambience(dt: number) {
    const car = run.player.car;
    rain += ((run.raining ? 1 : 0) - rain) * Math.min(1, dt * 0.8);
    let siren = 0;
    for (const c of run.cars) if (c.driver === 'cop') siren = Math.max(siren, 0.25 + 0.75 * near(c.x, c.y, 520));
    sound.drive({
      engine: car ? carSpeed(car) / CAR_SPECS[car.kind].top : null,
      skid: car ? car.slide / 90 : 0,
      siren,
      rain
    });

    // Tyre marks behind a sliding car, smoke off a hurt one.
    for (const c of run.cars) {
      if (c.dead || c.slide < 55 || carSpeed(c) < 40) continue;
      skids.push({ x: c.x - Math.cos(c.angle) * 8, y: c.y - Math.sin(c.angle) * 8, a: c.angle, life: 14 });
    }
    if (skids.length > 420) skids.splice(0, skids.length - 420);
    for (const s of skids) s.life -= dt;
    for (const s of stains) s.life -= dt;
    skids = skids.filter(s => s.life > 0);
    stains = stains.filter(s => s.life > 0);
    smokeIn -= dt;
    if (smokeIn <= 0) {
      smokeIn = 0.09;
      for (const c of run.cars) {
        const hurt = c.hp / CAR_SPECS[c.kind].hp;
        if (c.dead > 6 || hurt > 0.4) continue;
        const flame = c.burning > 0;
        fx.emit({
          x: c.x + Math.cos(c.angle) * 8,
          y: c.y + Math.sin(c.angle) * 8,
          vx: (Math.random() - 0.5) * 16,
          vy: -18 - Math.random() * 14,
          life: 0.8,
          maxLife: 0.8,
          color: flame ? (Math.random() < 0.5 ? '#fb923c' : '#facc15') : '#78716c',
          size: flame ? 3.5 : 3,
          shape: 'circle'
        });
      }
    }

    // The phone boxes ring when there is a job to be had, louder the nearer the box.
    const goal = objective(run);
    ringIn -= dt;
    if (goal.phone && goal.points.length && ringIn <= 0) {
      ringIn = 2.2;
      const nearest = nearestObjective(run);
      if (nearest) sound.play('ring', near(nearest.x, nearest.y, 420));
    }
    // The sonar job: pings that quicken and climb as the kit gets nearer.
    const signal = sonarSignal(run);
    pingIn -= dt;
    if (signal > 0 && pingIn <= 0) {
      pingIn = 1.5 - signal * 1.28;
      sound.play('ping', 1, signal);
    }
    tickIn -= dt;
    if (run.clock <= 10 && tickIn <= 0) {
      tickIn = 1;
      sound.play('tick');
    }
  }

  function update(dt: number) {
    clock += dt;
    banner.left = Math.max(0, banner.left - dt);
    shake = Math.max(0, shake - 34 * dt);
    fx.update(dt);
    if (phase !== 'play') return;
    handleEvents(tickRun(run, devInput ?? controls.read(), dt));
    if (phase !== 'play') return;
    followCamera(dt);
    ambience(dt);
    updateHud();
  }

  function render() {
    ctx.fillStyle = '#0b0d14';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    const world = () => {
      ctx.save();
      ctx.translate(VIEW_W / 2, VIEW_H / 2);
      if (shake > 0) ctx.translate(Math.round((Math.random() - 0.5) * 2 * shake), Math.round((Math.random() - 0.5) * 2 * shake));
      ctx.scale(cam.zoom, cam.zoom);
      ctx.translate(-cam.x, -cam.y);
    };
    world();
    city.draw(ctx, cam);

    for (const s of stains) {
      ctx.fillStyle = `rgba(63, 98, 18, ${Math.min(0.5, s.life / 12)})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 7, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(12, 10, 9, 0.3)';
    for (const s of skids) {
      const ox = -Math.sin(s.a) * 5;
      const oy = Math.cos(s.a) * 5;
      ctx.fillRect(s.x + ox - 1.5, s.y + oy - 1.5, 3, 3);
      ctx.fillRect(s.x - ox - 1.5, s.y - oy - 1.5, 3, 3);
    }

    const level = heatLevel(run);
    for (const wash of CITY.washes) drawWash(ctx, wash, clock, level > 0);
    const goal = objective(run);
    const ringing = phase !== 'idle' && goal.phone && goal.points.length > 0;
    for (const phone of CITY.phones) drawPhone(ctx, phone, ringing, clock);
    if (!goal.phone && !goal.hidden) {
      const stage = run.job?.def.stages[run.job.stage];
      const small = stage?.type === 'squash' || stage?.type === 'collect';
      for (const point of goal.points as Point[]) drawMarker(ctx, point, small ? 13 : 44, small ? '#facc15' : '#fde047', clock);
    }

    for (const bug of run.bugs) drawBug(ctx, bug, clock);
    for (const person of run.people) drawPerson(ctx, person, rain > 0.5);
    for (const car of run.cars) drawCar(ctx, car, clock);
    drawPlayer(ctx, run, clock);
    ctx.textAlign = 'center';
    fx.draw(ctx);
    ctx.restore();

    const dusk = Math.min(1, run.time / DUSK_SECONDS);
    drawDusk(ctx, dusk);
    world();
    drawHeadlights(ctx, run, dusk);
    drawBeam(ctx, clock);
    ctx.restore();
    drawRain(ctx, clock, rain);

    if (phase === 'play' || phase === 'paused') {
      const target = goal.hidden ? null : nearestObjective(run);
      if (target) drawArrow(ctx, playerPos(run), target, cam, goal.phone ? '#f87171' : '#fde047', clock);
      drawHud(
        ctx,
        run,
        {
          job: run.job ? strings.jobs[run.job.def.id].title : '',
          banner: banner.text,
          bannerLeft: banner.left,
          bannerColor: banner.color,
          paused: phase === 'paused' ? ui('paused') : '',
          signal: ui('signal')
        },
        sonarSignal(run),
        clock
      );
      drawStick(ctx, controls.stickOrigin(), controls.stickAt());
    }
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

  // A hand on the wheel for the DOM suite and for play-testing bots, only
  // when the page is opened with #dev, as PRIME TIME's `primetimeDev`; retired
  // with the page so a ClientRouter swap cannot leave it pointing at a dead
  // run. Never read by the game itself.
  if (window.location.hash === '#dev') {
    const devWindow = window as unknown as Record<string, unknown>;
    devWindow.hotfixDev = {
      getRun: () => run,
      setInput: (input: RunInput | null) => {
        devInput = input;
      },
      noInput: NO_INPUT
    };
    document.addEventListener('astro:before-swap', () => delete devWindow.hotfixDev, { once: true });
  }
}
