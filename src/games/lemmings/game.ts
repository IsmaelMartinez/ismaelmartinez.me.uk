/**
 * Critter Rescue — a pocket Lemmings.
 *
 * Pure rules live in bitmap.ts (per-pixel terrain), critter.ts (the FSM and the
 * five skills), and levels.ts (vector level authoring); this module owns the
 * canvas, the DOM wiring, and the simulation loop. It runs on the shared
 * fixed-timestep engine loop because critter movement is per-tick, and persists
 * the highest level reached through the shared scoreboard (which is backed by
 * engine/storage.ts) — the high-score analogue for a level-progression game.
 *
 * It expects the markup defined in src/pages/[lang]/fun/lemmings.astro.
 */
import { createGameLoop, initScoreboard, createGameAudio, wireSoundButton } from '../engine';
import { TerrainBitmap, AIR, EARTH } from './bitmap';
import {
  createCritter,
  assignSkill,
  stepCritter,
  isActive,
  CRITTER_H,
  type Critter,
  type CritterWorld,
  type Skill
} from './critter';
import { buildLevel, atExit, LEVELS, LEVEL_W, LEVEL_H, HATCH_W, EXIT_H, EXIT_HALF_W } from './levels';

const SKILL_ORDER: Skill[] = ['blocker', 'digger', 'basher', 'builder', 'floater'];
const PICK_RADIUS = 12; // px (level space) a tap may miss a critter by
const NUKE_INTERVAL = 4; // ticks between successive detonations during a nuke

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

export function initLemmingsGame(): void {
  const root = document.getElementById('lemmings-root');
  const canvasEl = document.getElementById('game-canvas') as HTMLCanvasElement | null;
  if (!root || !canvasEl) return;
  if (root.dataset.gameWired) return;
  const canvas: HTMLCanvasElement = canvasEl;
  const context = canvas.getContext('2d');
  if (!context) return;
  const ctx: CanvasRenderingContext2D = context;
  root.dataset.gameWired = 'true';

  const el = (id: string) => document.getElementById(id) as HTMLElement;
  const startOverlay = el('start-overlay');
  const resultOverlay = el('result-overlay');
  const startBtn = el('start-btn') as HTMLButtonElement;
  const nextBtn = el('next-btn') as HTMLButtonElement;
  const retryBtn = el('retry-btn') as HTMLButtonElement;
  const nukeBtn = el('nuke-btn') as HTMLButtonElement;
  const spawnSlider = el('spawn-slider') as HTMLInputElement;
  const resultEmoji = el('result-emoji');
  const resultTitle = el('result-title');
  const resultDesc = el('result-desc');
  const savedCount = el('saved-count');
  const neededCount = el('needed-count');
  const outCount = el('out-count');
  const levelNum = el('level-num');
  const bestLevel = el('best-level');
  const skillButtons = Array.from(root.querySelectorAll<HTMLButtonElement>('.skill-btn'));

  const strings = {
    complete: root.dataset.tComplete || 'Level Complete!',
    failed: root.dataset.tFailed || 'Not Enough Rescued',
    victory: root.dataset.tVictory || 'Every Critter Home!',
    completeDesc: root.dataset.tCompleteDesc || 'You rescued {n} of {m}!',
    failedDesc: root.dataset.tFailedDesc || 'Only {n} of {m} made it. Try again!',
    victoryDesc: root.dataset.tVictoryDesc || 'You cleared every level!'
  };
  const fill = (tpl: string, n: number, m: number) =>
    tpl.replace('{n}', n.toString()).replace('{m}', m.toString());

  canvas.width = LEVEL_W;
  canvas.height = LEVEL_H;

  // Offscreen terrain layer, rebuilt only when the bitmap changes version.
  const terrainCanvas = document.createElement('canvas');
  terrainCanvas.width = LEVEL_W;
  terrainCanvas.height = LEVEL_H;
  const terrainCtx = terrainCanvas.getContext('2d');
  const terrainImage = terrainCtx ? terrainCtx.createImageData(LEVEL_W, LEVEL_H) : null;
  let terrainVersion = -1;

  const board = initScoreboard(document.getElementById('highscores'));

  // Bright, bouncy chiptune in C major to march the critters along.
  const audio = createGameAudio({
    tempo: 132,
    wave: 'square',
    volume: 0.09,
    melody: [
      { freq: 523.25, beats: 0.5 },
      { freq: 659.25, beats: 0.5 },
      { freq: 783.99, beats: 0.5 },
      { freq: 659.25, beats: 0.5 },
      { freq: 587.33, beats: 0.5 },
      { freq: 783.99, beats: 0.5 },
      { freq: 698.46, beats: 0.5 },
      { freq: 523.25, beats: 0.5 }
    ]
  });
  wireSoundButton(document.getElementById('sound-btn'), audio);

  // --- Mutable game state ---
  let levelIndex = 0;
  let def = LEVELS[0];
  let bmp = new TerrainBitmap(LEVEL_W, LEVEL_H);
  let critters: Critter[] = [];
  let particles: Particle[] = [];
  let stock: Record<Skill, number> = blankStock();
  let selected: Skill | null = null;
  let spawned = 0;
  let saved = 0;
  let spawnTimer = 0;
  let nextId = 1;
  let phase: 'title' | 'playing' | 'result' = 'title';
  let nuking = false;
  let nukeTimer = 0;
  let cleared = board.top()?.score ?? 0;

  bestLevel.textContent = cleared.toString();

  function blankStock(): Record<Skill, number> {
    return { blocker: 0, digger: 0, basher: 0, builder: 0, floater: 0 };
  }

  function spawnInterval(): number {
    // Slider 1 (trickle) … 10 (flood) → ticks between spawns.
    const rate = parseInt(spawnSlider.value, 10) || 5;
    return (11 - rate) * 8;
  }

  // The world the FSM sees: terrain edits plus where blockers stand.
  const world: CritterWorld = {
    width: LEVEL_W,
    height: LEVEL_H,
    solid: (x, y) => bmp.solid(x, y),
    eraseRect: (x, y, w, h) => bmp.eraseRect(x, y, w, h),
    buildRow: (x, y, w) => bmp.buildRow(x, y, w),
    blockerAt: (x, y) =>
      critters.some(
        c => c.state === 'blocker' && Math.abs(x - c.x) <= 2 && y <= c.y && y >= c.y - (CRITTER_H - 1)
      )
  };

  function loadLevel(index: number) {
    levelIndex = index;
    def = LEVELS[index];
    bmp = buildLevel(def);
    terrainVersion = -1;
    critters = [];
    particles = [];
    saved = 0;
    spawned = 0;
    spawnTimer = 0;
    nuking = false;
    stock = blankStock();
    for (const key of SKILL_ORDER) stock[key] = def.stock[key] ?? 0;
    selected = SKILL_ORDER.find(s => stock[s] > 0) ?? null;
    levelNum.textContent = (index + 1).toString();
    neededCount.textContent = def.needed.toString();
    syncHud();
    syncToolbar();
  }

  function syncHud() {
    savedCount.textContent = saved.toString();
    outCount.textContent = critters.filter(isActive).length.toString();
    bestLevel.textContent = cleared.toString();
  }

  function syncToolbar() {
    for (const btn of skillButtons) {
      const skill = btn.dataset.skill as Skill;
      const count = stock[skill] ?? 0;
      const countEl = btn.querySelector('.skill-count');
      if (countEl) countEl.textContent = count.toString();
      btn.disabled = count <= 0 || phase !== 'playing';
      btn.classList.toggle('active', selected === skill && count > 0);
    }
  }

  function selectSkill(skill: Skill) {
    if ((stock[skill] ?? 0) <= 0) return;
    selected = skill;
    syncToolbar();
  }

  function spawnParticles(x: number, y: number, color: string, n = 10) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 20 + Math.random() * 60;
      particles.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - 20,
        life: 0.4 + Math.random() * 0.4,
        color
      });
    }
  }

  function applySkillAt(px: number, py: number) {
    if (phase !== 'playing' || !selected || (stock[selected] ?? 0) <= 0) return;
    let best: Critter | null = null;
    let bestDist = PICK_RADIUS;
    for (const c of critters) {
      if (!isActive(c)) continue;
      // Measure to the critter's body centre.
      const dist = Math.hypot(c.x - px, c.y - CRITTER_H / 2 - py);
      if (dist < bestDist) {
        bestDist = dist;
        best = c;
      }
    }
    if (best && assignSkill(best, selected)) {
      stock[selected] -= 1;
      audio.playSfx('blip');
      if (stock[selected] <= 0) selected = SKILL_ORDER.find(s => stock[s] > 0) ?? selected;
      syncToolbar();
    }
  }

  function startNuke() {
    if (phase !== 'playing' || nuking) return;
    nuking = true;
    nukeTimer = 0;
    spawned = def.spawnCount; // no more critters emerge
    audio.playSfx('explosion');
  }

  function finishLevel() {
    if (phase === 'result') return;
    phase = 'result';
    syncToolbar();
    audio.stop();
    const won = saved >= def.needed;
    const last = levelIndex === LEVELS.length - 1;
    if (won) {
      cleared = Math.max(cleared, levelIndex + 1);
      board.stash(cleared);
      bestLevel.textContent = cleared.toString();
    }
    const victory = won && last;
    resultEmoji.textContent = victory ? '🏆' : won ? '🎉' : '💔';
    resultTitle.textContent = victory ? strings.victory : won ? strings.complete : strings.failed;
    resultDesc.textContent = won
      ? victory
        ? strings.victoryDesc
        : fill(strings.completeDesc, saved, def.needed)
      : fill(strings.failedDesc, saved, def.needed);
    nextBtn.style.display = won ? 'inline-block' : 'none';
    nextBtn.textContent = victory
      ? nextBtn.dataset.playAgain || 'Play Again'
      : nextBtn.dataset.nextLevel || 'Next Level';
    retryBtn.style.display = won ? 'none' : 'inline-block';
    resultOverlay.style.display = 'flex';
    audio.playSfx(won ? 'score' : 'gameover');
    // Only the run-ending victory offers the arcade initials table.
    if (victory) board.show(cleared);
    else board.hide();
  }

  function update() {
    if (phase !== 'playing') return;

    if (nuking) {
      nukeTimer++;
      if (nukeTimer >= NUKE_INTERVAL) {
        nukeTimer = 0;
        const victim = critters.find(isActive);
        if (victim) {
          victim.alive = false;
          victim.state = 'splatted';
          spawnParticles(victim.x, victim.y - CRITTER_H / 2, '#f97316');
          audio.playSfx('hit');
        }
      }
    } else if (spawned < def.spawnCount) {
      spawnTimer--;
      if (spawnTimer <= 0) {
        critters.push(createCritter(nextId++, def.hatch.x, def.hatch.y, def.hatch.dir));
        spawned++;
        spawnTimer = spawnInterval();
      }
    }

    for (const c of critters) {
      if (!isActive(c)) continue;
      const wasAlive = c.alive;
      stepCritter(c, world);
      if (isActive(c) && atExit(c, def)) {
        c.state = 'exited';
        c.alive = false;
        saved++;
        audio.playSfx('score');
      } else if (wasAlive && c.state === 'splatted') {
        spawnParticles(c.x, c.y - CRITTER_H / 2, '#f43f5e', 6);
      }
    }

    // Retire fully-resolved critters (keep exited/splatted a moment via particles).
    critters = critters.filter(c => isActive(c));
    syncHud();

    const done = spawned >= def.spawnCount && critters.length === 0;
    if (done) finishLevel();
  }

  // --- Rendering ---

  function rebuildTerrain() {
    if (!terrainCtx || !terrainImage) return;
    const data = terrainImage.data;
    const cells = bmp.data;
    for (let i = 0; i < cells.length; i++) {
      const o = i * 4;
      const m = cells[i];
      if (m === AIR) {
        data[o + 3] = 0;
      } else if (m === EARTH) {
        data[o] = 96;
        data[o + 1] = 132;
        data[o + 2] = 74;
        data[o + 3] = 255;
      } else {
        // Builder bridge — warm timber.
        data[o] = 234;
        data[o + 1] = 179;
        data[o + 2] = 8;
        data[o + 3] = 255;
      }
    }
    terrainCtx.putImageData(terrainImage, 0, 0);
    terrainVersion = bmp.version;
  }

  function drawHatch() {
    const { x, y } = def.hatch;
    ctx.fillStyle = '#4b5563';
    ctx.fillRect(x - HATCH_W / 2, y - 8, HATCH_W, 6);
    ctx.fillStyle = '#1f2937';
    ctx.fillRect(x - HATCH_W / 2 + 2, y - 3, HATCH_W - 4, 3);
    ctx.fillStyle = '#f87171';
    ctx.fillRect(x - 1, y - 12, 2, 4);
  }

  function drawExit() {
    const { x, y } = def.exit;
    ctx.fillStyle = '#16a34a';
    ctx.fillRect(x - EXIT_HALF_W, y - EXIT_H, EXIT_HALF_W * 2, EXIT_H);
    ctx.fillStyle = '#052e16';
    ctx.fillRect(x - EXIT_HALF_W + 2, y - EXIT_H + 3, EXIT_HALF_W * 2 - 4, EXIT_H - 3);
    ctx.fillStyle = '#bbf7d0';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('▲', x, y - 6);
  }

  const SKILL_COLOR: Record<string, string> = {
    walker: '#a3e635',
    faller: '#a3e635',
    blocker: '#fb923c',
    digger: '#f59e0b',
    basher: '#f472b6',
    builder: '#fbbf24'
  };

  function drawCritter(c: Critter) {
    const top = c.y - CRITTER_H;
    const body = SKILL_COLOR[c.state] || '#a3e635';
    // Umbrella for floaters.
    if (c.floater) {
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(c.x, top - 1, 4, Math.PI, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(c.x, top - 1);
      ctx.lineTo(c.x, top + 1);
      ctx.stroke();
    }
    ctx.fillStyle = body;
    ctx.fillRect(c.x - 2, top + 1, 4, CRITTER_H - 1);
    // Head.
    ctx.fillStyle = '#065f46';
    ctx.fillRect(c.x - 1, top, 2, 2);
    if (c.state === 'blocker') {
      // Arms out to signal a wall.
      ctx.fillStyle = '#fed7aa';
      ctx.fillRect(c.x - 3, top + 2, 6, 1);
    } else {
      // Facing nub.
      ctx.fillStyle = '#ecfccb';
      ctx.fillRect(c.dir > 0 ? c.x + 2 : c.x - 3, top + 3, 1, 2);
    }
  }

  function render() {
    // Sky.
    const sky = ctx.createLinearGradient(0, 0, 0, LEVEL_H);
    sky.addColorStop(0, '#0b1120');
    sky.addColorStop(1, '#1e293b');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, LEVEL_W, LEVEL_H);

    if (bmp.version !== terrainVersion) rebuildTerrain();
    ctx.drawImage(terrainCanvas, 0, 0);

    drawExit();
    drawHatch();
    for (const c of critters) drawCritter(c);

    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 2));
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - 1, p.y - 1, 2, 2);
    }
    ctx.globalAlpha = 1;
  }

  function stepParticles() {
    const dt = 1 / 60;
    particles = particles.filter(p => {
      p.life -= dt;
      p.vy += 260 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      return p.life > 0;
    });
  }

  // --- Input ---

  function levelPoint(e: PointerEvent): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (LEVEL_W / rect.width),
      y: (e.clientY - rect.top) * (LEVEL_H / rect.height)
    };
  }

  canvas.addEventListener('pointerdown', e => {
    const p = levelPoint(e);
    applySkillAt(p.x, p.y);
    e.preventDefault();
  });

  skillButtons.forEach(btn => {
    btn.addEventListener('click', () => selectSkill(btn.dataset.skill as Skill));
  });

  nukeBtn.addEventListener('click', startNuke);

  function beginLevel(index: number) {
    loadLevel(index);
    phase = 'playing';
    spawnTimer = 30; // brief beat before the first critter drops
    startOverlay.style.display = 'none';
    resultOverlay.style.display = 'none';
    audio.start();
    syncToolbar();
  }

  startBtn.addEventListener('click', () => beginLevel(0));
  nextBtn.addEventListener('click', () => {
    const victory = levelIndex === LEVELS.length - 1 && saved >= def.needed;
    board.hide();
    if (victory) beginLevel(0);
    else beginLevel(Math.min(levelIndex + 1, LEVELS.length - 1));
  });
  retryBtn.addEventListener('click', () => beginLevel(levelIndex));

  // Idle backdrop behind the start overlay.
  loadLevel(0);
  createGameLoop(
    () => {
      update();
      stepParticles();
    },
    render
  ).start();
}
