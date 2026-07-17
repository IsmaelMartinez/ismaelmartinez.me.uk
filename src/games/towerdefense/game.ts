/**
 * Line Hold — an isometric tower-defense cabinet.
 *
 * Pure rules live in path.ts / waves.ts / towers.ts / enemies.ts /
 * economy.ts; this module owns DOM wiring, input, and canvas rendering. It
 * expects the markup defined in src/pages/[lang]/fun/towerdefense.astro.
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
  drawBlock,
  forEachTileBackToFront,
  shadeColor,
  chebyshev,
  createGameAudio,
  wireSoundButton,
  type IsoView
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
import { WAVES, hpScale, createSpawner, spawnerDone, stepSpawner, type Spawner } from './waves';
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

const VIEW: IsoView = { halfW: 16, halfH: 8, originX: GRID_H * 16, originY: 64 };
const CANVAS_W = (GRID_W + GRID_H) * VIEW.halfW;
const CANVAS_H = (GRID_W + GRID_H) * VIEW.halfH + VIEW.originY + 14;
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
}

interface Ring {
  x: number;
  y: number;
  r: number;
  maxR: number;
  life: number;
}

interface Floater {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
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

  // --- Static ground bake -------------------------------------------------
  // The battlefield never changes mid-run (one authored path, towers drawn
  // live), so the sky, grass, path and the spawn/goal dressings bake into a
  // device-resolution layer rebuilt only on DPR changes.
  const ground = createStaticLayer(CANVAS_W, CANVAS_H, target => {
    const sky = target.createLinearGradient(0, 0, 0, CANVAS_H);
    sky.addColorStop(0, '#101828');
    sky.addColorStop(1, '#1a2740');
    target.fillStyle = sky;
    target.fillRect(0, 0, CANVAS_W, CANVAS_H);

    forEachTileBackToFront(GRID_W, GRID_H, (x, y, i) => {
      if (map.path[i]) {
        // The invaders' trampled road, edged with kerb stones.
        fillTile(target, VIEW, x, y, (x + y) % 2 === 0 ? '#8a6d4b' : '#94764f');
        strokeTile(target, VIEW, x, y, 'rgba(58, 44, 26, 0.55)', 1);
      } else {
        const buildable = map.buildable[i];
        const base = (x + y) % 2 === 0 ? '#31563a' : '#365d3f';
        // Ground beyond tower reach reads darker, so the buildable shelf
        // beside the path stands out without any UI chrome.
        fillTile(target, VIEW, x, y, buildable ? base : shadeColor(base, 0.72));
      }
    });

    // Spawn arch: a dark portal the horde marches out of.
    const sp = isoProject(VIEW, (map.spawn % GRID_W) + 0.5, Math.floor(map.spawn / GRID_W) + 0.5);
    const portal = target.createRadialGradient(sp.x, sp.y - 8, 1, sp.x, sp.y - 8, 16);
    portal.addColorStop(0, '#2e1065');
    portal.addColorStop(1, 'rgba(46, 16, 101, 0)');
    target.fillStyle = portal;
    target.fillRect(sp.x - 16, sp.y - 24, 32, 32);

    // Goal keep: the little fort the line defends.
    const gx = map.goal % GRID_W;
    const gy = Math.floor(map.goal / GRID_W);
    drawBlock(target, VIEW, gx, gy, 14, '#64748b', 0.16);
    const gp = isoProject(VIEW, gx + 0.5, gy + 0.5);
    target.fillStyle = '#cbd5e1';
    target.fillRect(gp.x - 1, gp.y - 26, 2, 12);
    target.fillStyle = '#4ade80';
    target.beginPath();
    target.moveTo(gp.x + 1, gp.y - 26);
    target.lineTo(gp.x + 9, gp.y - 23.5);
    target.lineTo(gp.x + 1, gp.y - 21);
    target.closePath();
    target.fill();
  });
  const hiDpi = setupHiDpiCanvas(canvas, ctx, CANVAS_W, CANVAS_H, { onApply: ground.rebuild });

  // --- Game state ---------------------------------------------------------
  let phase: Phase = 'idle';
  let eco: Economy = createEconomy();
  let towers: Tower[] = [];
  let enemies: Enemy[] = [];
  let waveIdx = 0;
  let spawner: Spawner = createSpawner(WAVES[0]);
  let buildTimer = BUILD_TIME;
  let selectedTool: TowerKind | null = 'bolt';
  let selectedTower: Tower | null = null;
  let hoverTile = -1;
  let clock = 0;
  let shots: Shot[] = [];
  let rings: Ring[] = [];
  let floaters: Floater[] = [];

  const board = initScoreboard(document.getElementById('highscores'));
  let record = board.top()?.score ?? 0;
  let runStartRecord = 0;
  let recordCelebrated = false;
  recordEl.textContent = `${record}`;

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

  function showToast(text: string) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = text;
    toastArea.appendChild(toast);
    while (toastArea.children.length > 3) toastArea.removeChild(toastArea.firstChild!);
    setTimeout(() => toast.remove(), 2400);
  }

  function addFloater(tx: number, ty: number, text: string, color: string) {
    const p = isoProject(VIEW, tx, ty);
    floaters.push({ x: p.x, y: p.y - 20, text, color, life: 1.1 });
  }

  /** Announces (once per run) that the score beat the table's best. */
  function celebrateRecord() {
    if (recordCelebrated || runStartRecord <= 0) return;
    if (score(eco) <= runStartRecord) return;
    recordCelebrated = true;
    showToast(`🏅 ${strings.newRecord}`);
  }

  function towerAt(tile: number): Tower | null {
    return towers.find(t => t.tile === tile) ?? null;
  }

  function startRun() {
    eco = createEconomy();
    towers = [];
    enemies = [];
    waveIdx = 0;
    spawner = createSpawner(WAVES[0]);
    buildTimer = BUILD_TIME;
    selectedTower = null;
    selectedTool = 'bolt';
    shots = [];
    rings = [];
    floaters = [];
    runStartRecord = record;
    recordCelebrated = false;
    phase = 'build';
    audio.start();
    refreshToolbar();
  }

  function launchWave() {
    phase = 'wave';
    spawner = createSpawner(WAVES[waveIdx]);
    showToast(`⚔️ ${strings.waveNow.replace('{n}', String(waveIdx + 1))}`);
  }

  function endRun(victory: boolean) {
    phase = 'over';
    audio.playSfx('gameover');
    audio.stop();
    celebrateRecord();
    record = Math.max(record, score(eco));
    recordEl.textContent = `${record}`;
    overIcon.textContent = victory ? '🏆' : '💥';
    overTitle.textContent = victory ? strings.victory : strings.gameOver;
    overDesc.textContent = victory ? strings.victoryDesc : strings.gameOverDesc;
    finalScoreEl.textContent = `${score(eco)}`;
    overOverlay.style.display = 'flex';
    // After the overlay is visible, so the initials input can take focus.
    board.show(score(eco));
  }

  function waveCleared() {
    const interest = clearWave(eco);
    celebrateRecord();
    record = Math.max(record, score(eco));
    recordEl.textContent = `${record}`;
    // A defence can run long — bank the run's score at every wave boundary
    // so a closed tab never loses a record (same guarantee as the sims).
    board.stash(score(eco));
    const gp = routePosition(map.route, routeLast);
    addFloater(gp.x, gp.y - 1, `+${interest} ${strings.interest}`, '#4ade80');
    showToast(`🛡️ ${strings.waveCleared} +${WAVE_BASE} · +${interest} ${strings.interest}`);
    audio.playSfx('score');
    waveIdx++;
    if (waveIdx >= WAVES.length) {
      endRun(true);
      return;
    }
    phase = 'build';
    buildTimer = BUILD_TIME;
  }

  function update(dt: number) {
    clock += dt;
    floaters = floaters.filter(f => {
      f.life -= dt;
      f.y -= 16 * dt;
      return f.life > 0;
    });
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
      for (const kind of stepSpawner(spawner, WAVES[waveIdx], dt)) {
        enemies.push(spawnEnemy(kind, hpScale(waveIdx)));
      }
    }

    const leaks = stepEnemies(enemies, map.route.length, dt);
    for (const leaked of leaks) {
      const lives = leak(eco, leaked.livesCost);
      const gp = routePosition(map.route, routeLast);
      addFloater(gp.x, gp.y, `-${leaked.livesCost} ♥`, '#f87171');
      audio.playSfx('explosion');
      if (lives <= 0) {
        showToast(`💥 ${strings.breach}`);
        endRun(false);
        return;
      }
    }

    const events = stepTowers(towers, enemies, map.route, dt);
    let firedThisStep = false;
    for (const event of events) {
      if (event.type === 'shot') {
        const from = towerTop(towerAt(event.from)!);
        shots.push({ fx: from.x, fy: from.y, tx: event.tx, ty: event.ty, kind: event.kind, life: SHOT_LIFE });
        if (event.kind === 'blast') {
          const p = isoProject(VIEW, event.tx, event.ty);
          rings.push({ x: p.x, y: p.y - 6, r: 0, maxR: TOWERS.blast.splash * VIEW.halfW, life: 0.3 });
        }
        firedThisStep = true;
      } else {
        awardKill(eco, event.bounty);
        addFloater(event.x, event.y, `+${event.bounty}`, '#fbbf24');
      }
    }
    // One blip per step keeps a full battery from machine-gunning the mixer.
    if (firedThisStep) audio.playSfx('hit');

    // Clean the fallen out of the march once their floaters have spawned.
    if (enemies.length > 32) enemies = enemies.filter(e => e.alive);

    if (phase === 'wave' && spawnerDone(spawner, WAVES[waveIdx]) && enemies.every(e => !e.alive)) {
      waveCleared();
    }
  }

  // --- Rendering ----------------------------------------------------------

  /** Screen point of a tower's muzzle (top of its block). */
  function towerTop(tower: Tower): { x: number; y: number } {
    const x = tower.tile % GRID_W;
    const y = Math.floor(tower.tile / GRID_W);
    const p = isoProject(VIEW, x + 0.5, y + 0.5);
    return { x: p.x, y: p.y - blockHeight(tower) - 6 };
  }

  function blockHeight(tower: Tower): number {
    return 10 + tower.level * 6;
  }

  function drawTower(tower: Tower, x: number, y: number) {
    const color = TOWER_COLORS[tower.kind];
    const height = blockHeight(tower);
    drawBlock(ctx, VIEW, x, y, height, color, 0.18);
    const c = isoProject(VIEW, x + 0.5, y + 0.5);
    const topY = c.y - height;
    const charging = tower.cooldown <= 0.08;
    if (tower.kind === 'bolt') {
      // Mast with a glowing coil orb.
      ctx.strokeStyle = shadeColor(color, 0.5);
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(c.x, topY);
      ctx.lineTo(c.x, topY - 7);
      ctx.stroke();
      ctx.save();
      ctx.shadowColor = '#fde68a';
      ctx.shadowBlur = charging ? 8 : 4;
      ctx.fillStyle = charging ? '#fef3c7' : '#fbbf24';
      ctx.beginPath();
      ctx.arc(c.x, topY - 8, 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else if (tower.kind === 'blast') {
      // Squat mortar: a dark muzzle ring set into the top face.
      ctx.fillStyle = shadeColor(color, 0.4);
      ctx.beginPath();
      ctx.ellipse(c.x, topY, 5, 2.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1c1917';
      ctx.beginPath();
      ctx.ellipse(c.x, topY - 0.5, 3, 1.6, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Frost crystal: a pale spike catching the light.
      ctx.save();
      ctx.shadowColor = '#bae6fd';
      ctx.shadowBlur = 5;
      ctx.fillStyle = '#e0f2fe';
      ctx.beginPath();
      ctx.moveTo(c.x, topY - 10);
      ctx.lineTo(c.x + 3, topY - 3);
      ctx.lineTo(c.x, topY);
      ctx.lineTo(c.x - 3, topY - 3);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    // Level pips on the near face.
    ctx.fillStyle = '#fef9c3';
    for (let pip = 0; pip < tower.level; pip++) {
      ctx.fillRect(c.x - 5 + pip * 4, c.y - 4, 2, 2);
    }
  }

  function drawEnemy(enemy: Enemy) {
    const pos = routePosition(map.route, enemy.progress);
    const p = isoProject(VIEW, pos.x, pos.y);
    const color = enemy.slow > 0 ? '#7dd3fc' : ENEMY_COLORS[enemy.kind];
    const stride = Math.sin(clock * 9 + enemy.id) * 1.2;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + 1, enemy.kind === 'warlord' ? 8 : 4.5, enemy.kind === 'warlord' ? 3.6 : 2, 0, 0, Math.PI * 2);
    ctx.fill();

    if (enemy.kind === 'scout') {
      // A little round beetle with waggling antennae.
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y - 4, 3.4, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = shadeColor(color, 0.6);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(p.x - 1.5, p.y - 7);
      ctx.lineTo(p.x - 2.5 - stride * 0.4, p.y - 10);
      ctx.moveTo(p.x + 1.5, p.y - 7);
      ctx.lineTo(p.x + 2.5 + stride * 0.4, p.y - 10);
      ctx.stroke();
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(p.x - 2, p.y - 5.5, 1.4, 1.4);
      ctx.fillRect(p.x + 0.6, p.y - 5.5, 1.4, 1.4);
    } else if (enemy.kind === 'sprinter') {
      // A lean dart leaning into its run.
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(p.x + 5, p.y - 5);
      ctx.lineTo(p.x - 3, p.y - 8 + stride * 0.5);
      ctx.lineTo(p.x - 3, p.y - 1);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = shadeColor(color, 0.55);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(p.x - 2, p.y - 2);
      ctx.lineTo(p.x - 4 - stride, p.y + 1);
      ctx.stroke();
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(p.x + 1.5, p.y - 5.5, 1.5, 1.5);
    } else if (enemy.kind === 'brute') {
      // A wide-shouldered shellback trudging under its plates.
      ctx.fillStyle = shadeColor(color, 0.7);
      ctx.fillRect(p.x - 5, p.y - 4, 10, 4);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y - 6, 6, 5, 0, Math.PI, 0);
      ctx.fill();
      ctx.strokeStyle = shadeColor(color, 0.5);
      ctx.lineWidth = 1;
      for (let plate = -1; plate <= 1; plate++) {
        ctx.beginPath();
        ctx.moveTo(p.x + plate * 3.4, p.y - 10.5);
        ctx.lineTo(p.x + plate * 4.2, p.y - 5);
        ctx.stroke();
      }
      ctx.fillStyle = '#fef08a';
      ctx.fillRect(p.x - 2.6, p.y - 6.5, 1.6, 1.6);
      ctx.fillRect(p.x + 1, p.y - 6.5, 1.6, 1.6);
    } else {
      // The warlord: broad, spiked, and lit from within.
      ctx.save();
      ctx.shadowColor = color;
      ctx.shadowBlur = 8;
      ctx.fillStyle = shadeColor(color, 0.75);
      ctx.beginPath();
      ctx.ellipse(p.x, p.y - 7, 8, 7.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = shadeColor(color, 0.45);
      for (let spike = -2; spike <= 2; spike++) {
        ctx.beginPath();
        ctx.moveTo(p.x + spike * 3.4, p.y - 13);
        ctx.lineTo(p.x + spike * 4 + 1.2, p.y - 18 - Math.abs(stride));
        ctx.lineTo(p.x + spike * 4 + 2, p.y - 12.5);
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillStyle = '#fef08a';
      ctx.fillRect(p.x - 3.4, p.y - 8.5, 2, 2);
      ctx.fillRect(p.x + 1.4, p.y - 8.5, 2, 2);
    }

    if (enemy.slow > 0) {
      ctx.strokeStyle = 'rgba(186, 230, 253, 0.9)';
      ctx.lineWidth = 1;
      const r = enemy.kind === 'warlord' ? 9 : 5;
      for (let flake = 0; flake < 3; flake++) {
        const a = clock * 3 + flake * 2.1 + enemy.id;
        ctx.strokeRect(p.x + Math.cos(a) * r - 0.7, p.y - 6 + Math.sin(a) * 3 - 0.7, 1.4, 1.4);
      }
    }

    if (enemy.hp < enemy.maxHp) {
      const frac = Math.max(0, enemy.hp / enemy.maxHp);
      const w = enemy.kind === 'warlord' ? 16 : 10;
      const top = enemy.kind === 'warlord' ? 22 : 13;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.fillRect(p.x - w / 2, p.y - top, w, 2);
      ctx.fillStyle = frac > 0.5 ? '#4ade80' : frac > 0.25 ? '#fbbf24' : '#f87171';
      ctx.fillRect(p.x - w / 2, p.y - top, w * frac, 2);
    }
  }

  /** Diamond outline around every tile within `range` of `tile`. */
  function drawRangeOverlay(tile: number, range: number, color: string) {
    for (let i = 0; i < map.path.length; i++) {
      if (chebyshev(tile, i, GRID_W) > range) continue;
      fillTile(ctx, VIEW, i % GRID_W, Math.floor(i / GRID_W), color);
    }
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

    // Spawn portal pulse (the bake holds its static glow).
    const sp = isoProject(VIEW, (map.spawn % GRID_W) + 0.5, Math.floor(map.spawn / GRID_W) + 0.5);
    ctx.strokeStyle = `rgba(167, 139, 250, ${0.35 + 0.25 * Math.sin(clock * 3)})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(sp.x, sp.y - 6, 7, 10, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Enemies interleave with tower blocks by diagonal so towers occlude
    // the march correctly (same trick as Syndicate's units).
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
      const tower = towerAt(i);
      if (tower) drawTower(tower, x, y);
      if (i === hoverTile && phase !== 'idle' && phase !== 'over') {
        const ok = selectedTool && map.buildable[i] && !tower;
        strokeTile(ctx, VIEW, x, y, ok ? 'rgba(74, 222, 128, 0.9)' : 'rgba(248, 113, 113, 0.7)', 1.5);
      }
      if (selectedTower && selectedTower.tile === i) {
        strokeTile(ctx, VIEW, x, y, 'rgba(125, 211, 252, 0.9)', 2);
      }
    });
    if (lastDiag >= 0) enemiesByDiag[lastDiag].forEach(drawEnemy);

    // Shots: bolt jags, frost beams, blast tracers + splash rings.
    for (const shot of shots) {
      const to = isoProject(VIEW, shot.tx, shot.ty);
      ctx.globalAlpha = Math.max(0, shot.life / SHOT_LIFE);
      if (shot.kind === 'bolt') {
        ctx.strokeStyle = '#fde68a';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(shot.fx, shot.fy);
        const midX = (shot.fx + to.x) / 2 + Math.sin(clock * 40) * 3;
        const midY = (shot.fy + to.y - 6) / 2;
        ctx.lineTo(midX, midY);
        ctx.lineTo(to.x, to.y - 6);
        ctx.stroke();
      } else if (shot.kind === 'frost') {
        ctx.strokeStyle = '#bae6fd';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(shot.fx, shot.fy);
        ctx.lineTo(to.x, to.y - 6);
        ctx.stroke();
      } else {
        ctx.strokeStyle = '#fda4af';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(shot.fx, shot.fy);
        ctx.lineTo(to.x, to.y - 6);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    for (const ring of rings) {
      ctx.strokeStyle = `rgba(253, 164, 175, ${Math.max(0, ring.life / 0.3)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(ring.x, ring.y, ring.r, ring.r * 0.5, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.font = 'bold 10px monospace';
    for (const f of floaters) {
      ctx.globalAlpha = Math.max(0, Math.min(1, f.life / 0.4));
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;

    refreshHud();
  }

  function refreshHud() {
    moneyEl.textContent = `${eco.money}`;
    livesEl.textContent = `${eco.lives}`;
    scoreEl.textContent = `${score(eco)}`;
    waveEl.textContent =
      phase === 'idle' ? '—' : `${Math.min(waveIdx + 1, WAVES.length)}/${WAVES.length}`;

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
