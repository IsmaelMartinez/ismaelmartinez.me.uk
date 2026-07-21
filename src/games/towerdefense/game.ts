/**
 * Line Hold — an isometric tower-defense cabinet.
 *
 * Pure rules live in path.ts / waves.ts / towers.ts / enemies.ts /
 * economy.ts; this module owns DOM wiring, input, and canvas rendering. It
 * expects the markup defined in src/pages/[lang]/fun/towerdefense.astro.
 *
 * Rendering splits three ways: the battlefield (sky, ground slab, mottled
 * grass, cobbled road) is baked once into a static layer; tile-anchored
 * scenery with height (trees, rocks, the spawn arch, the keep) precomputes
 * at init but draws inside the painter sweep so towers and enemies occlude
 * correctly; everything that moves draws per frame on top.
 */
import {
  createGameLoop,
  createStaticLayer,
  initScoreboard,
  setupHiDpiCanvas,
  isoProject,
  isoTileFromPoint,
  fillTile,
  strokeTile,
  blockFaceCorners,
  blockSeamPath,
  drawBlock,
  forEachTileBackToFront,
  shadeColor,
  chebyshev,
  createGameAudio,
  wireSoundButton,
  createToaster,
  createEffects,
  type IsoView,
  hash01 as hash
} from '../engine';
import { GRID_W, GRID_H, createTdMap, routePosition, type TdMap } from './path';
import { spawnEnemy, stepEnemies, type Enemy, type EnemyKind } from './enemies';
import {
  TOWERS,
  createTower,
  upgradeCost,
  towerRange,
  stepTowers,
  type Tower,
  type TowerKind
} from './towers';
import { waveDef, AUTHORED_WAVES, hpScale, createSpawner, spawnerDone, stepSpawner, type Spawner } from './waves';
import {
  WAVE_BASE,
  createEconomy,
  spend,
  awardKill,
  leak,
  clearWave,
  score,
  type Economy
} from './economy';

const VIEW: IsoView = { halfW: 20, halfH: 10, originX: GRID_H * 20, originY: 70 };
const CANVAS_W = (GRID_W + GRID_H) * VIEW.halfW;
const CANVAS_H = (GRID_W + GRID_H) * VIEW.halfH + VIEW.originY + 16;
/** Seconds of building time before the next wave rolls in on its own. */
const BUILD_TIME = 12;

const TOWER_COLORS: Record<TowerKind, string> = {
  bolt: '#f59e0b',
  blast: '#f43f5e',
  frost: '#38bdf8'
};
const ENEMY_COLORS: Record<EnemyKind, string> = {
  scout: '#4ade80',
  sprinter: '#fb923c',
  brute: '#a78bfa',
  warlord: '#f87171'
};

interface Shot {
  fx: number;
  fy: number;
  tx: number;
  ty: number;
  kind: TowerKind;
  life: number;
  /** Stable jitter seed so a bolt's zigzag doesn't reroll every frame. */
  seed: number;
}

interface Ring {
  x: number;
  y: number;
  r: number;
  maxR: number;
  life: number;
}

interface Scenery {
  kind: 'pine' | 'rock' | 'bush';
  /** Deterministic 0–1 variation roll. */
  v: number;
}

const SHOT_LIFE = 0.14;

type Phase = 'idle' | 'build' | 'wave' | 'over';

export function initTowerDefenseGame(): void {
  const root = document.getElementById('towerdefense-root');
  const canvasEl = document.getElementById('game-canvas') as HTMLCanvasElement | null;
  if (!root || !canvasEl) return;
  // A ClientRouter swap brings a fresh, unwired root; the flag only blocks
  // re-entry on a root this module has already wired.
  if (root.dataset.gameWired) return;
  const canvas: HTMLCanvasElement = canvasEl;
  const context = canvas.getContext('2d');
  if (!context) return;
  const ctx: CanvasRenderingContext2D = context;
  root.dataset.gameWired = 'true';

  const el = (id: string) => document.getElementById(id) as HTMLElement;
  const startOverlay = el('start-overlay');
  const overOverlay = el('over-overlay');
  const startBtn = el('start-btn');
  const againBtn = el('again-btn');
  const overIcon = el('over-icon');
  const overTitle = el('over-title');
  const overDesc = el('over-desc');
  const finalScoreEl = el('final-score');
  const moneyEl = el('money');
  const livesEl = el('lives');
  const waveEl = el('wave-num');
  const scoreEl = el('score');
  const recordEl = el('record');
  const waveBtn = el('wave-btn') as HTMLButtonElement;
  const upgradeBtn = el('upgrade-btn') as HTMLButtonElement;
  const towerInfoEl = el('tower-info');
  const toastArea = el('toast-area');
  const { show: showToast } = createToaster(toastArea);
  const toolButtons = Array.from(root.querySelectorAll<HTMLButtonElement>('.tower-tool'));

  const s = (key: string, fallback: string) => root.dataset[key] || fallback;
  const strings = {
    waveIn: s('tWaveIn', 'Wave {n} in {s}s'),
    waveNow: s('tWaveNow', 'Wave {n} incoming!'),
    waveCleared: s('tWaveCleared', 'Wave cleared'),
    interest: s('tInterest', 'interest'),
    newRecord: s('tNewRecord', 'New record!'),
    breach: s('tBreach', 'The line is breached!'),
    victory: s('tVictory', 'Line held!'),
    victoryDesc: s('tVictoryDesc', 'Every wave broke against your towers.'),
    gameOver: s('tGameOver', 'The line has fallen'),
    gameOverDesc: s('tGameOverDesc', 'The horde marched through your defences.'),
    maxLevel: s('tMaxLevel', 'MAX'),
    level: s('tLevel', 'Lv'),
    towerNames: {
      bolt: s('tTowerBolt', 'Bolt'),
      blast: s('tTowerBlast', 'Blast'),
      frost: s('tTowerFrost', 'Frost')
    } as Record<TowerKind, string>
  };

  const map: TdMap = createTdMap();
  const routeLast = map.route.length - 1;

  // --- Scenery placement (once per init; drawn inside the painter sweep) --
  // Trees and rocks only stand beyond tower reach, so the buildable shelf
  // stays clean and the scenery never has to fight a tower for a tile.
  const scenery = new Map<number, Scenery>();
  for (let i = 0; i < map.path.length; i++) {
    if (map.path[i] || map.buildable[i]) continue;
    const r = hash(i, 3);
    if (r < 0.11) scenery.set(i, { kind: 'pine', v: hash(i, 4) });
    else if (r < 0.17) scenery.set(i, { kind: 'bush', v: hash(i, 5) });
    else if (r < 0.21) scenery.set(i, { kind: 'rock', v: hash(i, 6) });
  }

  // --- Static battlefield bake ------------------------------------------
  // Flat ground only: anything with vertical extent draws in the sweep.
  const ground = createStaticLayer(CANVAS_W, CANVAS_H, target => {
    // Dusk sky with a scatter of faint stars above the horizon.
    const sky = target.createLinearGradient(0, 0, 0, CANVAS_H);
    sky.addColorStop(0, '#0c1322');
    sky.addColorStop(0.55, '#16233c');
    sky.addColorStop(1, '#1d2c49');
    target.fillStyle = sky;
    target.fillRect(0, 0, CANVAS_W, CANVAS_H);
    for (let star = 0; star < 70; star++) {
      const sx = hash(star, 11) * CANVAS_W;
      const sy = hash(star, 12) * VIEW.originY * 1.4;
      target.globalAlpha = 0.25 + hash(star, 13) * 0.5;
      target.fillStyle = '#dbeafe';
      target.fillRect(sx, sy, hash(star, 14) < 0.2 ? 2 : 1, 1);
    }
    target.globalAlpha = 1;

    // The board is a slab of earth, not a floating sheet: dark soil faces
    // hang from its two southern edges.
    const slab = 16;
    const nEdge = isoProject(VIEW, GRID_W, 0);
    const sEdge = isoProject(VIEW, GRID_W, GRID_H);
    const wEdge = isoProject(VIEW, 0, GRID_H);
    target.fillStyle = '#2b2116';
    target.beginPath();
    target.moveTo(wEdge.x, wEdge.y);
    target.lineTo(sEdge.x, sEdge.y);
    target.lineTo(sEdge.x, sEdge.y + slab);
    target.lineTo(wEdge.x, wEdge.y + slab);
    target.closePath();
    target.fill();
    target.fillStyle = '#1f1810';
    target.beginPath();
    target.moveTo(sEdge.x, sEdge.y);
    target.lineTo(nEdge.x, nEdge.y);
    target.lineTo(nEdge.x, nEdge.y + slab);
    target.lineTo(sEdge.x, sEdge.y + slab);
    target.closePath();
    target.fill();
    // A few strata lines so the cut earth reads as layers.
    target.strokeStyle = 'rgba(0, 0, 0, 0.25)';
    target.lineWidth = 1;
    for (const dy of [5, 10]) {
      target.beginPath();
      target.moveTo(wEdge.x, wEdge.y + dy);
      target.lineTo(sEdge.x, sEdge.y + dy);
      target.lineTo(nEdge.x, nEdge.y + dy);
      target.stroke();
    }

    // Ground tiles: mottled grass, lighter on the buildable shelf, cobbled
    // road along the route.
    forEachTileBackToFront(GRID_W, GRID_H, (x, y, i) => {
      if (map.path[i]) {
        const dirt = hash(i, 1) < 0.5 ? '#8a6d4b' : '#93744e';
        fillTile(target, VIEW, x, y, dirt);
      } else {
        const buildable = map.buildable[i];
        const mottle = 0.92 + hash(i, 2) * 0.16;
        const base = (x + y) % 2 === 0 ? '#31563a' : '#365d3f';
        fillTile(target, VIEW, x, y, shadeColor(base, buildable ? mottle : mottle * 0.7));
      }
    });

    // Trampled wheel-rut line down the middle of the road.
    target.strokeStyle = 'rgba(58, 42, 22, 0.5)';
    target.lineWidth = VIEW.halfH * 0.9;
    target.lineJoin = 'round';
    target.lineCap = 'round';
    target.beginPath();
    for (let r = 0; r <= routeLast; r++) {
      const t = map.route[r];
      const c = isoProject(VIEW, (t % GRID_W) + 0.5, Math.floor(t / GRID_W) + 0.5);
      if (r === 0) target.moveTo(c.x, c.y);
      else target.lineTo(c.x, c.y);
    }
    target.stroke();

    // Cobbles and kerb stones on every road tile, and grass tufts / tiny
    // flowers off it. All flat, so they belong in the bake.
    forEachTileBackToFront(GRID_W, GRID_H, (x, y, i) => {
      const c = isoProject(VIEW, x + 0.5, y + 0.5);
      if (map.path[i]) {
        for (let p = 0; p < 5; p++) {
          const ox = (hash(i, 20 + p) - 0.5) * VIEW.halfW * 1.1;
          const oy = (hash(i, 30 + p) - 0.5) * VIEW.halfH * 1.1;
          target.fillStyle = shadeColor('#8a6d4b', 0.75 + hash(i, 40 + p) * 0.45);
          target.beginPath();
          target.ellipse(c.x + ox, c.y + oy, 2.4, 1.4, 0, 0, Math.PI * 2);
          target.fill();
        }
        strokeTile(target, VIEW, x, y, 'rgba(52, 38, 20, 0.35)', 1);
      } else {
        if (hash(i, 7) < 0.3) {
          // Grass tufts: three short blades.
          const gx = c.x + (hash(i, 8) - 0.5) * VIEW.halfW;
          const gy = c.y + (hash(i, 9) - 0.5) * VIEW.halfH;
          target.strokeStyle = 'rgba(134, 190, 120, 0.5)';
          target.lineWidth = 1;
          target.beginPath();
          for (let b = -1; b <= 1; b++) {
            target.moveTo(gx + b * 1.5, gy + 2);
            target.lineTo(gx + b * 2.2, gy - 2);
          }
          target.stroke();
        }
        if (map.buildable[i] && hash(i, 10) < 0.12) {
          // The odd wildflower on the buildable shelf.
          const fx = c.x + (hash(i, 15) - 0.5) * VIEW.halfW;
          const fy = c.y + (hash(i, 16) - 0.5) * VIEW.halfH;
          target.fillStyle = hash(i, 17) < 0.5 ? '#fde68a' : '#fda4af';
          target.fillRect(fx - 1, fy - 1, 2, 2);
        }
      }
    });
  });
  const hiDpi = setupHiDpiCanvas(canvas, ctx, CANVAS_W, CANVAS_H, { onApply: ground.rebuild });

  // --- Game state ---------------------------------------------------------
  let phase: Phase = 'idle';
  let eco: Economy = createEconomy();
  let towers: Tower[] = [];
  let enemies: Enemy[] = [];
  let waveIdx = 0;
  // Set once the authored campaign is broken and the endless assault begins.
  let clearedCampaign = false;
  let spawner: Spawner = createSpawner(waveDef(0));
  let buildTimer = BUILD_TIME;
  let selectedTool: TowerKind | null = 'bolt';
  let selectedTower: Tower | null = null;
  let hoverTile = -1;
  let clock = 0;
  let shots: Shot[] = [];
  let rings: Ring[] = [];
  const fx = createEffects({
    gravityScale: 130,
    // Downward velocities squashed for the isometric battlefield.
    vySquash: 0.55,
    launchKick: 25,
    burstSpeed: 60,
    burstSize: 1.6,
    glowBlur: 4,
    floaterSize: 11,
    floaterRise: 16,
    floaterLife: 1.1
  });
  /** Seconds left on the "WAVE N" banner splash. */
  let bannerTimer = 0;
  let bannerText = '';
  /** Seconds left on the keep's red breach flash. */
  let keepFlash = 0;

  const board = initScoreboard(document.getElementById('highscores'));
  recordEl.textContent = `${board.best()}`;

  // A brisk minor-key march — drums to hold a line to.
  const audio = createGameAudio({
    tempo: 138,
    wave: 'square',
    volume: 0.12,
    melody: [
      { freq: 220.0, beats: 0.5 },
      { freq: 220.0, beats: 0.5 },
      { freq: 261.63, beats: 1 },
      { freq: 220.0, beats: 1 },
      { freq: 329.63, beats: 1 },
      { freq: 293.66, beats: 0.5 },
      { freq: 261.63, beats: 0.5 },
      { freq: 246.94, beats: 1 },
      { freq: 0, beats: 0.5 },
      { freq: 196.0, beats: 0.5 },
      { freq: 220.0, beats: 1.5 },
      { freq: 0, beats: 0.5 }
    ]
  });
  wireSoundButton(document.getElementById('sound-btn'), audio);

  function addFloater(tx: number, ty: number, text: string, color: string) {
    const p = isoProject(VIEW, tx, ty);
    fx.floater(p.x, p.y - 24, text, color);
  }

  const spawnBurst = fx.burst;

  /** Banks the run's score; announces (once per run) a beaten table best. */
  function bankScore() {
    const { best, newRecord } = board.bank(score(eco));
    if (newRecord) showToast(`🏅 ${strings.newRecord}`);
    recordEl.textContent = `${best}`;
  }

  function towerAt(tile: number): Tower | null {
    return towers.find(t => t.tile === tile) ?? null;
  }

  function startRun() {
    eco = createEconomy();
    towers = [];
    enemies = [];
    waveIdx = 0;
    clearedCampaign = false;
    spawner = createSpawner(waveDef(0));
    buildTimer = BUILD_TIME;
    selectedTower = null;
    selectedTool = 'bolt';
    shots = [];
    rings = [];
    fx.clear();
    bannerTimer = 0;
    keepFlash = 0;
    board.beginRun();
    phase = 'build';
    audio.start();
    refreshToolbar();
  }

  function launchWave() {
    phase = 'wave';
    spawner = createSpawner(waveDef(waveIdx));
    bannerText = strings.waveNow.replace('{n}', String(waveIdx + 1));
    bannerTimer = 1.8;
    showToast(`⚔️ ${bannerText}`);
  }

  function endRun() {
    phase = 'over';
    selectedTower = null;
    audio.playSfx('gameover');
    audio.stop();
    bankScore();
    // A run only ends when the line falls; clearing the whole authored
    // campaign first still earns the trophy screen for how far it held.
    overIcon.textContent = clearedCampaign ? '🏆' : '💥';
    overTitle.textContent = clearedCampaign ? strings.victory : strings.gameOver;
    overDesc.textContent = clearedCampaign ? strings.victoryDesc : strings.gameOverDesc;
    finalScoreEl.textContent = `${score(eco)}`;
    overOverlay.style.display = 'flex';
    // After the overlay is visible, so the initials input can take focus.
    board.show(score(eco));
  }

  function waveCleared() {
    const interest = clearWave(eco);
    // A defence can run long — bank the run's score at every wave boundary
    // so a closed tab never loses a record (same guarantee as the sims).
    bankScore();
    const gp = routePosition(map.route, routeLast);
    addFloater(gp.x, gp.y - 1, `+${interest} ${strings.interest}`, '#4ade80');
    showToast(`🛡️ ${strings.waveCleared} +${WAVE_BASE} · +${interest} ${strings.interest}`);
    audio.playSfx('score');
    waveIdx++;
    if (waveIdx === AUTHORED_WAVES) {
      // No victory wall: clearing the last authored wave rolls the run into an
      // endless assault so a strong defence keeps chasing score.
      clearedCampaign = true;
      showToast(`🏆 ${strings.victory}`);
      audio.playSfx('score');
    }
    phase = 'build';
    buildTimer = BUILD_TIME;
  }

  function update(dt: number) {
    clock += dt;
    bannerTimer = Math.max(0, bannerTimer - dt);
    keepFlash = Math.max(0, keepFlash - dt);
    fx.update(dt);
    shots = shots.filter(shot => (shot.life -= dt) > 0);
    rings = rings.filter(ring => {
      ring.life -= dt;
      ring.r = ring.maxR * (1 - Math.max(0, ring.life) / 0.3);
      return ring.life > 0;
    });
    if (phase !== 'build' && phase !== 'wave') return;

    if (phase === 'build') {
      buildTimer -= dt;
      if (buildTimer <= 0) launchWave();
    } else {
      for (const kind of stepSpawner(spawner, waveDef(waveIdx), dt)) {
        enemies.push(spawnEnemy(kind, hpScale(waveIdx)));
        // Marchers materialise out of the arch in a purple shimmer.
        const sp = isoProject(VIEW, (map.spawn % GRID_W) + 0.5, Math.floor(map.spawn / GRID_W) + 0.5);
        spawnBurst(sp.x, sp.y - 8, 6, '#a78bfa', { speed: 30, life: 0.4, size: 1.4, glow: true });
      }
    }

    const leaks = stepEnemies(enemies, map.route.length, dt);
    let leakedThisStep = false;
    for (const leaked of leaks) {
      const lives = leak(eco, leaked.livesCost);
      const gp = routePosition(map.route, routeLast);
      const kp = isoProject(VIEW, gp.x, gp.y);
      addFloater(gp.x, gp.y, `-${leaked.livesCost} ♥`, '#f87171');
      spawnBurst(kp.x, kp.y - 12, 12, '#f87171', { speed: 70, life: 0.5, size: 1.8, glow: true });
      keepFlash = 0.45;
      leakedThisStep = true;
      if (lives <= 0) {
        showToast(`💥 ${strings.breach}`);
        endRun();
        return;
      }
    }
    // One boom per step keeps a cluster of leaks from stacking the mixer.
    if (leakedThisStep) audio.playSfx('explosion');

    const events = stepTowers(towers, enemies, map.route, dt);
    let firedThisStep = false;
    for (const event of events) {
      if (event.type === 'shot') {
        const from = towerTop(towerAt(event.from)!);
        shots.push({
          fx: from.x,
          fy: from.y,
          tx: event.tx,
          ty: event.ty,
          kind: event.kind,
          life: SHOT_LIFE,
          seed: Math.random() * 1000
        });
        const impact = isoProject(VIEW, event.tx, event.ty);
        if (event.kind === 'blast') {
          rings.push({ x: impact.x, y: impact.y - 6, r: 0, maxR: TOWERS.blast.splash * VIEW.halfW, life: 0.3 });
          spawnBurst(impact.x, impact.y - 8, 8, '#fdba74', { speed: 85, life: 0.35, size: 1.8, gravity: 1, glow: true });
          spawnBurst(impact.x, impact.y - 8, 5, '#78716c', { speed: 40, life: 0.6, size: 2.2 });
        } else if (event.kind === 'frost') {
          spawnBurst(impact.x, impact.y - 8, 6, '#bae6fd', { speed: 30, life: 0.5, size: 1.3, glow: true });
        } else {
          spawnBurst(impact.x, impact.y - 8, 4, '#fde68a', { speed: 55, life: 0.2, size: 1.3, glow: true });
        }
        firedThisStep = true;
      } else {
        awardKill(eco, event.bounty);
        addFloater(event.x, event.y, `+${event.bounty}`, '#fbbf24');
        const kp = isoProject(VIEW, event.x, event.y);
        spawnBurst(kp.x, kp.y - 8, 10, ENEMY_COLORS[event.kind], {
          speed: 80,
          life: 0.5,
          size: 1.7,
          gravity: 1,
          glow: true
        });
      }
    }
    // One blip per step keeps a full battery from machine-gunning the mixer.
    if (firedThisStep) audio.playSfx('hit');

    // Clean the fallen out of the march once their bursts have spawned.
    if (enemies.length > 32) enemies = enemies.filter(e => e.alive);

    if (phase === 'wave' && spawnerDone(spawner, waveDef(waveIdx)) && enemies.every(e => !e.alive)) {
      waveCleared();
    }
  }

  // --- Rendering ----------------------------------------------------------

  function blockHeight(tower: Tower): number {
    return 12 + tower.level * 7;
  }

  /** Screen point of a tower's muzzle (top of its block). */
  function towerTop(tower: Tower): { x: number; y: number } {
    const x = tower.tile % GRID_W;
    const y = Math.floor(tower.tile / GRID_W);
    const p = isoProject(VIEW, x + 0.5, y + 0.5);
    return { x: p.x, y: p.y - blockHeight(tower) - 7 };
  }

  function drawTower(tower: Tower, x: number, y: number) {
    const color = TOWER_COLORS[tower.kind];
    const height = blockHeight(tower);
    const c = isoProject(VIEW, x + 0.5, y + 0.5);
    // Stone plinth under every tower, then the coloured body on top of it.
    drawBlock(ctx, VIEW, x, y, 4, '#57534e', 0.1);
    // Mortar coursing on the plinth faces.
    const pc = blockFaceCorners(VIEW, x, y, 0.1);
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.lineWidth = 0.75;
    ctx.beginPath();
    blockSeamPath(ctx, pc, 2);
    ctx.moveTo((pc.w.x + pc.s.x) / 2, (pc.w.y + pc.s.y) / 2 - 2);
    ctx.lineTo((pc.w.x + pc.s.x) / 2, (pc.w.y + pc.s.y) / 2);
    ctx.moveTo((pc.s.x + pc.e.x) / 2, (pc.s.y + pc.e.y) / 2 - 4);
    ctx.lineTo((pc.s.x + pc.e.x) / 2, (pc.s.y + pc.e.y) / 2 - 2);
    ctx.stroke();
    drawBlock(ctx, VIEW, x, y, height, color, 0.2, 4);
    const topY = c.y - height - 4;
    const charging = tower.cooldown <= 0.08;
    const pulse = 0.5 + 0.5 * Math.sin(clock * 4 + tower.tile);

    if (tower.kind === 'bolt') {
      // Mast, crossbars, and a crackling coil orb.
      ctx.strokeStyle = shadeColor(color, 0.45);
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(c.x, topY);
      ctx.lineTo(c.x, topY - 9);
      ctx.moveTo(c.x - 3.5, topY - 4);
      ctx.lineTo(c.x + 3.5, topY - 4);
      ctx.stroke();
      // Ceramic insulator rings up the mast.
      ctx.fillStyle = '#e7e5e4';
      ctx.fillRect(c.x - 1.5, topY - 6.4, 3, 1);
      ctx.fillRect(c.x - 1.2, topY - 8, 2.4, 1);
      ctx.save();
      ctx.shadowColor = '#fde68a';
      ctx.shadowBlur = charging ? 10 : 5 + pulse * 3;
      ctx.fillStyle = charging ? '#fef3c7' : '#fbbf24';
      ctx.beginPath();
      ctx.arc(c.x, topY - 10, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      // Static sparks that flicker around the orb between shots.
      if (hash(Math.floor(clock * 10), tower.tile) < 0.4) {
        ctx.strokeStyle = '#fef9c3';
        ctx.lineWidth = 1;
        ctx.beginPath();
        const a = hash(Math.floor(clock * 10), tower.tile + 1) * Math.PI * 2;
        ctx.moveTo(c.x + Math.cos(a) * 3.5, topY - 10 + Math.sin(a) * 3.5);
        ctx.lineTo(c.x + Math.cos(a) * 6.5, topY - 10 + Math.sin(a) * 6.5);
        ctx.stroke();
      }
    } else if (tower.kind === 'blast') {
      // Mortar tub: rim ring, dark muzzle, side rivets.
      ctx.fillStyle = shadeColor(color, 0.45);
      ctx.beginPath();
      ctx.ellipse(c.x, topY, 6.5, 3.4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = shadeColor(color, 1.3);
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = charging ? '#451a03' : '#1c1917';
      ctx.beginPath();
      ctx.ellipse(c.x, topY - 0.6, 3.8, 2, 0, 0, Math.PI * 2);
      ctx.fill();
      if (charging) {
        ctx.fillStyle = '#fdba74';
        ctx.beginPath();
        ctx.ellipse(c.x, topY - 0.6, 1.6 + pulse, 0.9 + pulse * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      // Reinforcing band round the tub and a shell stack ready beside it.
      ctx.strokeStyle = shadeColor(color, 0.8);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(c.x, topY + 1.2, 6.1, 3.1, 0, 0.2, Math.PI - 0.2);
      ctx.stroke();
      ctx.fillStyle = '#292524';
      ctx.beginPath();
      ctx.arc(c.x - 5.5, topY + 3.4, 1.1, 0, Math.PI * 2);
      ctx.arc(c.x - 3.3, topY + 3.8, 1.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#44403c';
      ctx.beginPath();
      ctx.arc(c.x - 4.4, topY + 2, 1.1, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Frost crystal cluster catching the light.
      ctx.save();
      ctx.shadowColor = '#bae6fd';
      ctx.shadowBlur = 5 + pulse * 3;
      ctx.fillStyle = '#e0f2fe';
      ctx.beginPath();
      ctx.moveTo(c.x, topY - 13);
      ctx.lineTo(c.x + 3.6, topY - 4);
      ctx.lineTo(c.x, topY);
      ctx.lineTo(c.x - 3.6, topY - 4);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#7dd3fc';
      ctx.beginPath();
      ctx.moveTo(c.x - 4.5, topY - 7);
      ctx.lineTo(c.x - 2.2, topY - 2);
      ctx.lineTo(c.x - 5.5, topY - 1);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(c.x + 4.8, topY - 6);
      ctx.lineTo(c.x + 2.5, topY - 2);
      ctx.lineTo(c.x + 5.8, topY - 1);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      // Ice fringe skirting the crystal's base.
      ctx.fillStyle = 'rgba(186, 230, 253, 0.8)';
      for (let ice = -2; ice <= 2; ice++) {
        ctx.beginPath();
        ctx.moveTo(c.x + ice * 2.4 - 0.9, topY + 0.6);
        ctx.lineTo(c.x + ice * 2.4, topY + 2.6 + (ice % 2 === 0 ? 1 : 0));
        ctx.lineTo(c.x + ice * 2.4 + 0.9, topY + 0.6);
        ctx.closePath();
        ctx.fill();
      }
    }
    // Level pips on the near face.
    ctx.fillStyle = '#fef9c3';
    for (let pip = 0; pip < tower.level; pip++) {
      ctx.fillRect(c.x - 6 + pip * 5, c.y - 5, 2.4, 2.4);
    }
  }

  function drawScenery(tile: number, deco: Scenery, x: number, y: number) {
    const c = isoProject(VIEW, x + 0.5, y + 0.5);
    if (deco.kind === 'pine') {
      const h = 15 + deco.v * 8;
      ctx.fillStyle = '#3b2c1a';
      ctx.fillRect(c.x - 1.2, c.y - 4, 2.4, 4);
      const green = shadeColor('#1e4d31', 0.85 + deco.v * 0.4);
      for (let layer = 0; layer < 3; layer++) {
        const ly = c.y - 3 - (h / 3.2) * layer;
        const lw = 9 - layer * 2.4;
        ctx.fillStyle = layer === 2 ? shadeColor(green, 1.25) : green;
        ctx.beginPath();
        ctx.moveTo(c.x, ly - h / 2.6);
        ctx.lineTo(c.x + lw, ly);
        ctx.lineTo(c.x - lw, ly);
        ctx.closePath();
        ctx.fill();
      }
    } else if (deco.kind === 'bush') {
      const green = shadeColor('#2c5e3b', 0.8 + deco.v * 0.5);
      ctx.fillStyle = green;
      ctx.beginPath();
      ctx.ellipse(c.x - 3, c.y - 3, 4.5, 3.4, 0, 0, Math.PI * 2);
      ctx.ellipse(c.x + 3.5, c.y - 2.5, 3.8, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = shadeColor(green, 1.35);
      ctx.beginPath();
      ctx.ellipse(c.x - 2, c.y - 4.5, 2.6, 1.8, 0, 0, Math.PI * 2);
      ctx.fill();
      if (deco.v < 0.4) {
        ctx.fillStyle = '#f87171';
        ctx.fillRect(c.x - 4, c.y - 4, 1.6, 1.6);
        ctx.fillRect(c.x + 2, c.y - 3, 1.6, 1.6);
      }
    } else {
      const grey = shadeColor('#64748b', 0.75 + deco.v * 0.4);
      ctx.fillStyle = grey;
      ctx.beginPath();
      ctx.ellipse(c.x, c.y - 2.5, 5.5, 3.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = shadeColor(grey, 1.3);
      ctx.beginPath();
      ctx.ellipse(c.x - 1.5, c.y - 4, 2.4, 1.4, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    void tile;
  }

  /** The stone arch the horde marches out of, with its swirling portal. */
  function drawSpawnArch(x: number, y: number) {
    const c = isoProject(VIEW, x + 0.5, y + 0.5);
    const h = 24;
    // Portal shimmer behind the pillars.
    const pulse = 0.5 + 0.5 * Math.sin(clock * 3);
    ctx.save();
    ctx.shadowColor = '#a78bfa';
    ctx.shadowBlur = 8 + pulse * 6;
    ctx.fillStyle = `rgba(76, 29, 149, ${0.7 + pulse * 0.3})`;
    ctx.beginPath();
    ctx.ellipse(c.x, c.y - h / 2 - 2, 7, h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = `rgba(196, 181, 253, ${0.5 + pulse * 0.4})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.ellipse(c.x, c.y - h / 2 - 2, 4.5 + pulse * 1.5, (h / 2) * 0.7, 0.4, 0, Math.PI * 2);
    ctx.stroke();
    // Counter-rotating inner swirl deepens the vortex.
    ctx.strokeStyle = `rgba(233, 213, 255, ${0.35 + pulse * 0.3})`;
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.ellipse(c.x, c.y - h / 2 - 2, 2.6 + (1 - pulse) * 1.4, (h / 2) * 0.45, -0.5, 0, Math.PI * 2);
    ctx.stroke();
    // Cracked flagstones where the horde has worn the threshold.
    ctx.strokeStyle = 'rgba(30, 24, 46, 0.55)';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(c.x - 6, c.y + 2);
    ctx.lineTo(c.x - 2.5, c.y + 3.6);
    ctx.lineTo(c.x - 3.5, c.y + 5.4);
    ctx.moveTo(c.x + 4, c.y + 1.6);
    ctx.lineTo(c.x + 6.5, c.y + 3.4);
    ctx.moveTo(c.x - 0.5, c.y + 4);
    ctx.lineTo(c.x + 1.8, c.y + 5.2);
    ctx.stroke();
    // Weathered pillars and the lintel across them.
    for (const side of [-1, 1]) {
      ctx.fillStyle = side < 0 ? '#7b8494' : '#5b6472';
      ctx.fillRect(c.x + side * 9 - 2.5, c.y - h, 5, h);
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
      ctx.lineWidth = 1;
      for (let seg = 1; seg < 4; seg++) {
        ctx.beginPath();
        ctx.moveTo(c.x + side * 9 - 2.5, c.y - (h / 4) * seg);
        ctx.lineTo(c.x + side * 9 + 2.5, c.y - (h / 4) * seg);
        ctx.stroke();
      }
      // Carved rune, glowing faintly with the portal's pulse.
      ctx.strokeStyle = `rgba(196, 181, 253, ${0.35 + pulse * 0.35})`;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      const rx = c.x + side * 9;
      const ry = c.y - h * 0.55;
      ctx.moveTo(rx - 1.2, ry - 2.4);
      ctx.lineTo(rx + 1.2, ry - 1.2);
      ctx.lineTo(rx - 1.2, ry);
      ctx.lineTo(rx + 1.2, ry + 1.2);
      ctx.stroke();
    }
    ctx.fillStyle = '#8b93a3';
    ctx.fillRect(c.x - 13, c.y - h - 5, 26, 6);
    ctx.fillStyle = '#6b7280';
    ctx.fillRect(c.x - 13, c.y - h - 1, 26, 2);
    // Keystone notch on the lintel.
    ctx.fillStyle = '#79808f';
    ctx.fillRect(c.x - 2, c.y - h - 5, 4, 6);
  }

  /** The keep the line defends: walls, gate, crenellations, waving banner. */
  function drawKeep(x: number, y: number) {
    const c = isoProject(VIEW, x + 0.5, y + 0.5);
    drawBlock(ctx, VIEW, x, y, 20, '#6b7280', 0.1);
    const topY = c.y - 20;
    // Stone coursing and an arrow slit on each visible face.
    const kc = blockFaceCorners(VIEW, x, y, 0.1);
    const { w: kw, s: ks, e: ke } = kc;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.22)';
    ctx.lineWidth = 0.75;
    ctx.beginPath();
    for (const zz of [6, 11, 16]) blockSeamPath(ctx, kc, zz);
    // Staggered vertical joints between the courses.
    for (let j = 0; j < 3; j++) {
      const t = 0.25 + j * 0.25;
      const jx = kw.x + (ks.x - kw.x) * t;
      const jy = kw.y + (ks.y - kw.y) * t;
      ctx.moveTo(jx, jy - (j % 2 === 0 ? 11 : 16));
      ctx.lineTo(jx, jy - (j % 2 === 0 ? 6 : 11));
      const kx = ks.x + (ke.x - ks.x) * t;
      const ky = ks.y + (ke.y - ks.y) * t;
      ctx.moveTo(kx, ky - (j % 2 === 0 ? 16 : 11));
      ctx.lineTo(kx, ky - (j % 2 === 0 ? 11 : 6));
    }
    ctx.stroke();
    // Arrow slits with a pale reveal on the lit side.
    ctx.fillStyle = '#1c2028';
    const slitW = kw.x + (ks.x - kw.x) * 0.62;
    const slitWy = kw.y + (ks.y - kw.y) * 0.62;
    ctx.fillRect(slitW - 0.6, slitWy - 14.5, 1.2, 4);
    const slitE = ks.x + (ke.x - ks.x) * 0.38;
    const slitEy = ks.y + (ke.y - ks.y) * 0.38;
    ctx.fillRect(slitE - 0.6, slitEy - 14.5, 1.2, 4);
    ctx.fillStyle = 'rgba(226, 232, 240, 0.35)';
    ctx.fillRect(slitW - 1.1, slitWy - 14.5, 0.5, 4);
    ctx.fillRect(slitE - 1.1, slitEy - 14.5, 0.5, 4);
    // Crenellations along the two visible top rims, over a walkway line.
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.lineWidth = 0.75;
    ctx.beginPath();
    ctx.moveTo(c.x - 13, topY + 0.5);
    ctx.lineTo(c.x + 13, topY + 0.5);
    ctx.stroke();
    ctx.fillStyle = shadeColor('#6b7280', 1.1);
    for (let m = -2; m <= 2; m++) {
      ctx.fillRect(c.x + m * 6 - 1.6, topY - 4, 3.2, 4);
    }
    // Shadowed embrasure notches between the merlons.
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    for (let m = -2; m < 2; m++) {
      ctx.fillRect(c.x + m * 6 + 1.8, topY - 1.4, 2.4, 1.4);
    }
    // Gate facing the road (the SW face), with a raised portcullis grid.
    const gw = isoProject(VIEW, x + 0.24, y + 0.76);
    ctx.fillStyle = '#2b2118';
    ctx.beginPath();
    ctx.ellipse(gw.x, gw.y - 5, 4.2, 6.5, -0.4, Math.PI * 0.9, Math.PI * 2.1);
    ctx.fill();
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.5)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(gw.x - 2.5, gw.y - 8);
    ctx.lineTo(gw.x - 2.5, gw.y - 1);
    ctx.moveTo(gw.x, gw.y - 9.5);
    ctx.lineTo(gw.x, gw.y - 1);
    ctx.moveTo(gw.x + 2.5, gw.y - 8);
    ctx.lineTo(gw.x + 2.5, gw.y - 1);
    ctx.stroke();
    // Banner pole and a green pennant that ripples in the wind.
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(c.x, topY - 3);
    ctx.lineTo(c.x, topY - 17);
    ctx.stroke();
    const wave1 = Math.sin(clock * 6) * 1.6;
    const wave2 = Math.sin(clock * 6 + 1.2) * 2.2;
    ctx.fillStyle = '#4ade80';
    ctx.beginPath();
    ctx.moveTo(c.x + 0.5, topY - 17);
    ctx.quadraticCurveTo(c.x + 7, topY - 16 + wave1, c.x + 13, topY - 14 + wave2);
    ctx.lineTo(c.x + 0.5, topY - 11.5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#22c55e';
    ctx.beginPath();
    ctx.moveTo(c.x + 0.5, topY - 13.5);
    ctx.quadraticCurveTo(c.x + 5, topY - 13 + wave1 * 0.6, c.x + 9, topY - 12.4 + wave2 * 0.7);
    ctx.lineTo(c.x + 0.5, topY - 11.5);
    ctx.closePath();
    ctx.fill();
    // Breach flash: the whole keep blinks red as a marcher gets in.
    if (keepFlash > 0) {
      ctx.globalAlpha = Math.min(0.55, keepFlash * 1.4);
      drawBlock(ctx, VIEW, x, y, 20, '#dc2626', 0.1);
      ctx.globalAlpha = 1;
    }
  }

  /** Facing: +1 when the enemy's next step moves right on screen. */
  function enemyFacing(enemy: Enemy): number {
    const here = routePosition(map.route, enemy.progress);
    const ahead = routePosition(map.route, Math.min(enemy.progress + 0.3, routeLast));
    const dx = isoProject(VIEW, ahead.x, ahead.y).x - isoProject(VIEW, here.x, here.y).x;
    return dx >= 0 ? 1 : -1;
  }

  function drawEnemy(enemy: Enemy) {
    const pos = routePosition(map.route, enemy.progress);
    const p = isoProject(VIEW, pos.x, pos.y);
    const chilled = enemy.slow > 0;
    const color = chilled ? '#7dd3fc' : ENEMY_COLORS[enemy.kind];
    const dir = enemyFacing(enemy);
    const stride = Math.sin(clock * 10 + enemy.id) * 1.4;
    const bob = Math.abs(Math.sin(clock * (chilled ? 4 : 9) + enemy.id)) * 1.4;
    const big = enemy.kind === 'warlord';

    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + 1, big ? 10 : 5.5, big ? 4.4 : 2.6, 0, 0, Math.PI * 2);
    ctx.fill();

    if (enemy.kind === 'scout') {
      // A round beetle scuttling on stubby legs, antennae waving.
      ctx.strokeStyle = shadeColor(color, 0.45);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (const leg of [-1, 1]) {
        ctx.moveTo(p.x + leg * 2.5, p.y - 2.5);
        ctx.lineTo(p.x + leg * (3.6 + Math.abs(stride) * 0.5), p.y + 0.5);
      }
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y - 5 - bob * 0.4, 4.4, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      // Grounding outline so the shell reads against the road.
      ctx.strokeStyle = 'rgba(10, 16, 28, 0.5)';
      ctx.lineWidth = 0.75;
      ctx.stroke();
      // Segmented carapace lines across the shell.
      ctx.strokeStyle = shadeColor(color, 0.6);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - 9 - bob * 0.4);
      ctx.lineTo(p.x, p.y - 2);
      ctx.stroke();
      ctx.strokeStyle = shadeColor(color, 0.7);
      ctx.lineWidth = 0.75;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y - 5 - bob * 0.4, 4.4, 5, 0, Math.PI * 1.15, Math.PI * 1.85);
      ctx.ellipse(p.x, p.y - 3.4 - bob * 0.4, 4.2, 4.4, 0, Math.PI * 1.2, Math.PI * 1.8);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(p.x - 2, p.y - 9 - bob * 0.4);
      ctx.lineTo(p.x - 3.5 - stride * 0.5, p.y - 12.5 - bob * 0.4);
      ctx.moveTo(p.x + 2, p.y - 9 - bob * 0.4);
      ctx.lineTo(p.x + 3.5 + stride * 0.5, p.y - 12.5 - bob * 0.4);
      ctx.stroke();
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(p.x + dir * 2.4 - 1.8, p.y - 6.6 - bob * 0.4, 1.8, 1.8);
      ctx.fillRect(p.x + dir * 0.2 - 0.9, p.y - 6.6 - bob * 0.4, 1.8, 1.8);
    } else if (enemy.kind === 'sprinter') {
      // A lean dart leaning hard into its run, dust at its heels.
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(p.x + dir * 7, p.y - 5.5 - bob * 0.3);
      ctx.lineTo(p.x - dir * 4, p.y - 9.5 + stride * 0.4);
      ctx.lineTo(p.x - dir * 3.2, p.y - 1.5);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = shadeColor(color, 1.3);
      ctx.beginPath();
      ctx.moveTo(p.x + dir * 7, p.y - 5.5 - bob * 0.3);
      ctx.lineTo(p.x - dir * 4, p.y - 9.5 + stride * 0.4);
      ctx.lineTo(p.x - dir * 1, p.y - 6.5);
      ctx.closePath();
      ctx.fill();
      // Dorsal fin cutting the air behind the nose.
      ctx.fillStyle = shadeColor(color, 0.7);
      ctx.beginPath();
      ctx.moveTo(p.x - dir * 1.5, p.y - 8.6 + stride * 0.3);
      ctx.lineTo(p.x - dir * 4.2, p.y - 12.2 + stride * 0.5);
      ctx.lineTo(p.x - dir * 4.6, p.y - 8.8 + stride * 0.4);
      ctx.closePath();
      ctx.fill();
      // Grounding outline along the belly edge.
      ctx.strokeStyle = 'rgba(10, 16, 28, 0.5)';
      ctx.lineWidth = 0.75;
      ctx.beginPath();
      ctx.moveTo(p.x + dir * 7, p.y - 5.5 - bob * 0.3);
      ctx.lineTo(p.x - dir * 3.2, p.y - 1.5);
      ctx.stroke();
      ctx.strokeStyle = shadeColor(color, 0.55);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(p.x - dir * 2, p.y - 2);
      ctx.lineTo(p.x - dir * (5 + stride), p.y + 1);
      ctx.moveTo(p.x + dir * 1, p.y - 2);
      ctx.lineTo(p.x + dir * (1 - stride), p.y + 1);
      ctx.stroke();
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(p.x + dir * 4.4 - 0.9, p.y - 6.2, 1.8, 1.8);
    } else if (enemy.kind === 'brute') {
      // A wide shellback trudging under armour plates.
      ctx.strokeStyle = shadeColor(color, 0.45);
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (const leg of [-1, 1]) {
        ctx.moveTo(p.x + leg * 3.6, p.y - 3);
        ctx.lineTo(p.x + leg * 3.6 + leg * stride * 0.6, p.y + 1);
      }
      ctx.stroke();
      ctx.fillStyle = shadeColor(color, 0.7);
      ctx.fillRect(p.x - 6.5, p.y - 5 - bob * 0.3, 13, 5);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y - 8 - bob * 0.3, 7.5, 6.4, 0, Math.PI, 0);
      ctx.fill();
      ctx.strokeStyle = shadeColor(color, 0.5);
      ctx.lineWidth = 1.2;
      for (let plate = -1; plate <= 1; plate++) {
        ctx.beginPath();
        ctx.moveTo(p.x + plate * 4.4, p.y - 13.6 - bob * 0.3);
        ctx.lineTo(p.x + plate * 5.4, p.y - 6);
        ctx.stroke();
      }
      // Rivets stud the armour plates.
      ctx.fillStyle = shadeColor(color, 1.5);
      for (let plate = -1; plate <= 1; plate++) {
        ctx.beginPath();
        ctx.arc(p.x + plate * 4.9 - 1.6, p.y - 11 - bob * 0.3, 0.6, 0, Math.PI * 2);
        ctx.arc(p.x + plate * 4.9 - 1.8, p.y - 8, 0.6, 0, Math.PI * 2);
        ctx.fill();
      }
      // Grounding outline over the shell dome.
      ctx.strokeStyle = 'rgba(10, 16, 28, 0.5)';
      ctx.lineWidth = 0.75;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y - 8 - bob * 0.3, 7.5, 6.4, 0, Math.PI, 0);
      ctx.stroke();
      // Horn stubs and sullen eyes.
      ctx.fillStyle = shadeColor(color, 1.35);
      ctx.beginPath();
      ctx.moveTo(p.x - 6.5, p.y - 12);
      ctx.lineTo(p.x - 8.5, p.y - 15);
      ctx.lineTo(p.x - 5, p.y - 13.4);
      ctx.closePath();
      ctx.moveTo(p.x + 6.5, p.y - 12);
      ctx.lineTo(p.x + 8.5, p.y - 15);
      ctx.lineTo(p.x + 5, p.y - 13.4);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#fef08a';
      ctx.fillRect(p.x + dir * 3 - 2.6, p.y - 8.5, 2, 2);
      ctx.fillRect(p.x + dir * 3 + 1, p.y - 8.5, 2, 2);
    } else {
      // The warlord: a hulking crowned mass, lit from within.
      ctx.save();
      ctx.shadowColor = color;
      ctx.shadowBlur = 10;
      ctx.fillStyle = shadeColor(color, 0.7);
      ctx.beginPath();
      ctx.ellipse(p.x, p.y - 9 - bob * 0.3, 10, 9.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = shadeColor(color, 0.5);
      ctx.beginPath();
      ctx.ellipse(p.x, p.y - 5, 10, 5, 0, 0, Math.PI);
      ctx.fill();
      // Iron crown of spikes.
      ctx.fillStyle = '#3f3f46';
      for (let spike = -2; spike <= 2; spike++) {
        ctx.beginPath();
        ctx.moveTo(p.x + spike * 4.2 - 1.4, p.y - 16.5);
        ctx.lineTo(p.x + spike * 4.6, p.y - 22 - Math.abs(stride) * 0.8);
        ctx.lineTo(p.x + spike * 4.2 + 1.6, p.y - 16);
        ctx.closePath();
        ctx.fill();
      }
      ctx.strokeStyle = '#52525b';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p.x - 9, p.y - 15.5);
      ctx.lineTo(p.x + 9, p.y - 15.5);
      ctx.stroke();
      // Jewels glint along the crown band.
      for (let jewel = -1; jewel <= 1; jewel++) {
        const glint = 0.5 + 0.5 * Math.sin(clock * 5 + jewel * 2 + enemy.id);
        ctx.fillStyle = jewel === 0 ? `rgba(252, 211, 77, ${0.5 + glint * 0.5})` : `rgba(125, 211, 252, ${0.4 + glint * 0.5})`;
        ctx.fillRect(p.x + jewel * 5 - 0.9, p.y - 16.4, 1.8, 1.8);
      }
      ctx.fillStyle = '#fef08a';
      ctx.fillRect(p.x + dir * 3 - 3, p.y - 10.5, 2.6, 2.6);
      ctx.fillRect(p.x + dir * 3 + 1.4, p.y - 10.5, 2.6, 2.6);
    }

    if (chilled) {
      // Frost rime: drifting flakes and an icy sheen.
      ctx.strokeStyle = 'rgba(186, 230, 253, 0.9)';
      ctx.lineWidth = 1;
      const r = big ? 11 : 6;
      for (let flake = 0; flake < 4; flake++) {
        const a = clock * 2.5 + flake * 1.6 + enemy.id;
        const fx = p.x + Math.cos(a) * r;
        const fy = p.y - 7 + Math.sin(a) * 3.5;
        ctx.beginPath();
        ctx.moveTo(fx - 1.4, fy);
        ctx.lineTo(fx + 1.4, fy);
        ctx.moveTo(fx, fy - 1.4);
        ctx.lineTo(fx, fy + 1.4);
        ctx.stroke();
      }
    }

    if (enemy.hp < enemy.maxHp) {
      const frac = Math.max(0, enemy.hp / enemy.maxHp);
      const w = big ? 20 : 12;
      const top = big ? 27 : 16;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.fillRect(p.x - w / 2, p.y - top, w, 2.4);
      ctx.fillStyle = frac > 0.5 ? '#4ade80' : frac > 0.25 ? '#fbbf24' : '#f87171';
      ctx.fillRect(p.x - w / 2, p.y - top, w * frac, 2.4);
    }
  }

  /** Soft fill over every tile within `range` of `tile`. */
  function drawRangeOverlay(tile: number, range: number, color: string) {
    for (let i = 0; i < map.path.length; i++) {
      if (chebyshev(tile, i, GRID_W) > range) continue;
      fillTile(ctx, VIEW, i % GRID_W, Math.floor(i / GRID_W), color);
    }
  }

  function drawShot(shot: Shot) {
    const to = isoProject(VIEW, shot.tx, shot.ty);
    const alpha = Math.max(0, shot.life / SHOT_LIFE);
    ctx.globalAlpha = alpha;
    if (shot.kind === 'bolt') {
      // Jagged lightning: fixed jitter per shot, glowing core over a haze.
      const segs = 4;
      const pts: Array<[number, number]> = [[shot.fx, shot.fy]];
      for (let seg = 1; seg < segs; seg++) {
        const t = seg / segs;
        const jitter = (hash(Math.floor(shot.seed), seg) - 0.5) * 9;
        pts.push([
          shot.fx + (to.x - shot.fx) * t + jitter,
          shot.fy + (to.y - 6 - shot.fy) * t + jitter * 0.5
        ]);
      }
      pts.push([to.x, to.y - 6]);
      ctx.save();
      ctx.shadowColor = '#fde68a';
      ctx.shadowBlur = 6;
      for (const [width, style] of [
        [3, 'rgba(253, 230, 138, 0.35)'],
        [1.4, '#fef9c3']
      ] as const) {
        ctx.strokeStyle = style;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let n = 1; n < pts.length; n++) ctx.lineTo(pts[n][0], pts[n][1]);
        ctx.stroke();
      }
      ctx.restore();
    } else if (shot.kind === 'frost') {
      // A pale beam with ice shards riding it.
      ctx.save();
      ctx.shadowColor = '#bae6fd';
      ctx.shadowBlur = 5;
      ctx.strokeStyle = 'rgba(186, 230, 253, 0.9)';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(shot.fx, shot.fy);
      ctx.lineTo(to.x, to.y - 6);
      ctx.stroke();
      ctx.fillStyle = '#e0f2fe';
      for (const t of [0.35, 0.65]) {
        const cx = shot.fx + (to.x - shot.fx) * t;
        const cy = shot.fy + (to.y - 6 - shot.fy) * t;
        ctx.beginPath();
        ctx.moveTo(cx, cy - 2.4);
        ctx.lineTo(cx + 1.8, cy);
        ctx.lineTo(cx, cy + 2.4);
        ctx.lineTo(cx - 1.8, cy);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    } else {
      // Mortar shell: a tracer with a bright shell riding down it.
      ctx.strokeStyle = 'rgba(253, 164, 175, 0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(shot.fx, shot.fy);
      ctx.lineTo(to.x, to.y - 6);
      ctx.stroke();
      const t = 1 - alpha;
      const sx = shot.fx + (to.x - shot.fx) * t;
      const sy = shot.fy + (to.y - 6 - shot.fy) * t - Math.sin(t * Math.PI) * 10;
      ctx.save();
      ctx.shadowColor = '#fda4af';
      ctx.shadowBlur = 5;
      ctx.fillStyle = '#fecdd3';
      ctx.beginPath();
      ctx.arc(sx, sy, 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  function render() {
    ground.draw(ctx);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Range preview under everything that moves.
    if (selectedTower) {
      drawRangeOverlay(selectedTower.tile, towerRange(selectedTower), 'rgba(125, 211, 252, 0.16)');
    } else if (selectedTool && hoverTile >= 0 && map.buildable[hoverTile] && !towerAt(hoverTile)) {
      drawRangeOverlay(hoverTile, TOWERS[selectedTool].range, 'rgba(253, 230, 138, 0.14)');
    }

    // Enemies interleave with everything tall by diagonal so towers, trees,
    // and the keep occlude the march correctly (Syndicate's trick).
    const diagonals = GRID_W + GRID_H - 1;
    const enemiesByDiag: Enemy[][] = Array.from({ length: diagonals }, () => []);
    for (const enemy of enemies) {
      if (!enemy.alive) continue;
      const pos = routePosition(map.route, enemy.progress);
      const d = Math.min(diagonals - 1, Math.max(0, Math.floor(pos.x) + Math.floor(pos.y)));
      enemiesByDiag[d].push(enemy);
    }
    let lastDiag = -1;
    forEachTileBackToFront(GRID_W, GRID_H, (x, y, i, diag) => {
      if (diag !== lastDiag) {
        if (lastDiag >= 0) enemiesByDiag[lastDiag].forEach(drawEnemy);
        lastDiag = diag;
      }
      if (i === map.spawn) drawSpawnArch(x, y);
      if (i === map.goal) drawKeep(x, y);
      const deco = scenery.get(i);
      if (deco) drawScenery(i, deco, x, y);
      const tower = towerAt(i);
      if (tower) drawTower(tower, x, y);
      if (i === hoverTile && (phase === 'build' || phase === 'wave')) {
        const ok = selectedTool && map.buildable[i] && !tower;
        if (ok && selectedTool) {
          // Ghost preview of the tower about to be raised.
          ctx.globalAlpha = 0.45;
          drawBlock(ctx, VIEW, x, y, 12 + 7, TOWER_COLORS[selectedTool], 0.2);
          ctx.globalAlpha = 1;
        }
        strokeTile(ctx, VIEW, x, y, ok ? 'rgba(74, 222, 128, 0.9)' : 'rgba(248, 113, 113, 0.7)', 1.5);
      }
      if (selectedTower && selectedTower.tile === i) {
        strokeTile(ctx, VIEW, x, y, 'rgba(125, 211, 252, 0.9)', 2);
      }
    });
    if (lastDiag >= 0) enemiesByDiag[lastDiag].forEach(drawEnemy);

    for (const shot of shots) drawShot(shot);

    for (const ring of rings) {
      ctx.strokeStyle = `rgba(253, 164, 175, ${Math.max(0, ring.life / 0.3)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(ring.x, ring.y, ring.r, ring.r * 0.5, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    fx.draw(ctx);

    // "WAVE N" splash banner.
    if (bannerTimer > 0) {
      const a = Math.min(1, bannerTimer / 0.4) * Math.min(1, (1.8 - bannerTimer) / 0.25 + 0.2);
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, a));
      ctx.shadowColor = '#f59e0b';
      ctx.shadowBlur = 12;
      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 24px monospace';
      ctx.fillText(bannerText.toUpperCase(), CANVAS_W / 2, VIEW.originY - 26);
      ctx.restore();
    }

    refreshHud();
  }

  function refreshHud() {
    moneyEl.textContent = `${eco.money}`;
    livesEl.textContent = `${eco.lives}`;
    scoreEl.textContent = `${score(eco)}`;
    waveEl.textContent =
      phase === 'idle'
        ? '—'
        : waveIdx < AUTHORED_WAVES
          ? `${waveIdx + 1}/${AUTHORED_WAVES}`
          : `${waveIdx + 1} ∞`;

    if (phase === 'build') {
      waveBtn.disabled = false;
      waveBtn.textContent = `▶ ${strings.waveIn
        .replace('{n}', String(waveIdx + 1))
        .replace('{s}', String(Math.max(1, Math.ceil(buildTimer))))}`;
    } else if (phase === 'wave') {
      waveBtn.disabled = true;
      const left = enemies.filter(e => e.alive).length;
      waveBtn.textContent = `⚔️ ${left > 0 ? left : '…'}`;
    } else {
      waveBtn.disabled = true;
      waveBtn.textContent = '▶';
    }

    toolButtons.forEach(button => {
      const kind = button.dataset.kind as TowerKind;
      button.classList.toggle('active', selectedTool === kind && !selectedTower);
      button.disabled = phase === 'idle' || phase === 'over' || eco.money < TOWERS[kind].cost;
    });

    if (selectedTower) {
      const cost = upgradeCost(selectedTower);
      towerInfoEl.textContent = `${strings.towerNames[selectedTower.kind]} ${strings.level}${selectedTower.level}`;
      towerInfoEl.hidden = false;
      upgradeBtn.hidden = false;
      if (cost === null) {
        upgradeBtn.disabled = true;
        upgradeBtn.textContent = strings.maxLevel;
      } else {
        upgradeBtn.disabled = eco.money < cost;
        upgradeBtn.textContent = `⬆ ${cost}`;
      }
    } else {
      towerInfoEl.hidden = true;
      upgradeBtn.hidden = true;
    }
  }

  // --- Input wiring -------------------------------------------------------

  function tileFromEvent(e: MouseEvent): number {
    // Logical (not backing-store) coordinates: the backing store is
    // DPR-scaled, so canvas.width/rect.width would land tiles wide.
    const p = hiDpi.toLogical(e);
    return isoTileFromPoint(VIEW, p.x, p.y, GRID_W, GRID_H);
  }

  canvas.addEventListener('mousemove', e => {
    hoverTile = tileFromEvent(e);
  });
  canvas.addEventListener('mouseleave', () => {
    hoverTile = -1;
  });

  canvas.addEventListener('click', e => {
    if (phase !== 'build' && phase !== 'wave') return;
    const tile = tileFromEvent(e);
    if (tile < 0) {
      selectedTower = null;
      return;
    }
    const existing = towerAt(tile);
    if (existing) {
      // Tap a tower to inspect/upgrade it; tap it again to dismiss.
      selectedTower = selectedTower === existing ? null : existing;
      return;
    }
    selectedTower = null;
    if (!selectedTool || !map.buildable[tile]) return;
    const def = TOWERS[selectedTool];
    if (!spend(eco, def.cost)) return;
    towers.push(createTower(selectedTool, tile));
    const x = (tile % GRID_W) + 0.5;
    const y = Math.floor(tile / GRID_W) + 0.5;
    addFloater(x, y, `-${def.cost}`, '#fca5a5');
    // Construction dust as the tower lands.
    const c = isoProject(VIEW, x, y);
    spawnBurst(c.x, c.y - 4, 8, '#a8a29e', { speed: 45, life: 0.4, size: 1.6 });
    audio.playSfx('blip');
  });

  toolButtons.forEach(button => {
    button.addEventListener('click', () => {
      selectedTool = button.dataset.kind as TowerKind;
      selectedTower = null;
    });
  });

  upgradeBtn.addEventListener('click', () => {
    if (!selectedTower) return;
    const cost = upgradeCost(selectedTower);
    if (cost === null || !spend(eco, cost)) return;
    selectedTower.level++;
    const x = (selectedTower.tile % GRID_W) + 0.5;
    const y = Math.floor(selectedTower.tile / GRID_W) + 0.5;
    addFloater(x, y, `-${cost}`, '#fca5a5');
    const c = isoProject(VIEW, x, y);
    spawnBurst(c.x, c.y - blockHeight(selectedTower), 8, TOWER_COLORS[selectedTower.kind], {
      speed: 40,
      life: 0.45,
      size: 1.5,
      glow: true
    });
    audio.playSfx('blip');
  });

  waveBtn.addEventListener('click', () => {
    if (phase === 'build') launchWave();
  });

  startBtn.addEventListener('click', () => {
    startOverlay.style.display = 'none';
    startRun();
  });

  againBtn.addEventListener('click', () => {
    overOverlay.style.display = 'none';
    board.hide();
    startRun();
  });

  function refreshToolbar() {
    toolButtons.forEach(button => {
      const kind = button.dataset.kind as TowerKind;
      const costEl = button.querySelector<HTMLElement>('.tool-cost');
      if (costEl) costEl.textContent = `${TOWERS[kind].cost}`;
    });
  }
  refreshToolbar();

  createGameLoop(update, render).start();
}
