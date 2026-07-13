/**
 * Critter Rescue — a pocket Lemmings.
 *
 * Pure rules live in bitmap.ts (per-pixel terrain), critter.ts (the FSM and the
 * five skills), levels.ts (vector level authoring), and score.ts (run points,
 * combos, and end-of-level bonuses); this module owns the canvas, the DOM
 * wiring, and the simulation loop. It runs on the shared fixed-timestep engine
 * loop because critter movement is per-tick. Level progress persists through
 * its own storage key (see progress.ts) while the shared scoreboard keeps the
 * top-10 run scores.
 *
 * It expects the markup defined in src/pages/[lang]/fun/lemmings.astro.
 */
import { createGameLoop, initScoreboard, createGameAudio, wireSoundButton } from '../engine';
import { TerrainBitmap, AIR, BRIDGE, STEEL } from './bitmap';
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
import {
  buildLevel,
  atExit,
  levelHatches,
  LEVELS,
  LEVEL_W,
  LEVEL_H,
  HATCH_W,
  EXIT_H,
  EXIT_HALF_W,
  type Hatch
} from './levels';
import { levelSelectItems, loadClearedLevels, saveClearedLevels } from './progress';
import { exitArrowAngle, rescueProgress } from './hud';
import { newCombo, comboOnRescue, rescuePoints, levelBonuses } from './score';

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

/** A floating score readout ("+125 ×3") that drifts up from a rescue. */
interface TextPop {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
}

/** Deterministic 2D value hash in [0, 1) — used for star fields and terrain grain. */
function hash2(x: number, y: number): number {
  let n = (Math.imul(x | 0, 73856093) ^ Math.imul(y | 0, 19349663)) >>> 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177) >>> 0;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

/** Nudges a `#rrggbb` colour lighter (+) or darker (−) and returns an `rgb()` string. */
function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const clamp = (v: number) => Math.max(0, Math.min(255, v + amt));
  return `rgb(${clamp((n >> 16) & 255)},${clamp((n >> 8) & 255)},${clamp(n & 255)})`;
}

/** Fills a rolling-hills silhouette across the width at the given ctx fill style. */
function drawHills(c: CanvasRenderingContext2D, w: number, h: number, baseY: number, amp: number, seed: number): void {
  c.beginPath();
  c.moveTo(0, h);
  for (let x = 0; x <= w; x += 3) {
    const y = baseY - Math.sin(x * 0.021 + seed) * amp * 0.5 - Math.sin(x * 0.006 + seed * 2) * amp * 0.5;
    c.lineTo(x, y);
  }
  c.lineTo(w, h);
  c.closePath();
  c.fill();
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
  const levelSelectOverlay = el('level-select-overlay');
  const levelGrid = el('level-grid');
  const startBtn = el('start-btn') as HTMLButtonElement;
  const levelSelectBtn = el('level-select-btn') as HTMLButtonElement;
  const levelBackBtn = el('level-back-btn') as HTMLButtonElement;
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
  const runScoreEl = el('run-score');
  const resultScoreVal = el('result-score-val');
  const bonusTimeRow = el('bonus-time-row');
  const bonusTimeVal = el('bonus-time-val');
  const bonusPerfectRow = el('bonus-perfect-row');
  const bonusPerfectVal = el('bonus-perfect-val');
  const bonusQuotaRow = el('bonus-quota-row');
  const bonusQuotaVal = el('bonus-quota-val');
  const progressBar = document.getElementById('progress-bar');
  const progressFill = document.getElementById('progress-fill');
  const levelNum = el('level-num');
  const bestLevel = el('best-level');
  const levelHint = el('level-hint');
  const skillButtons = Array.from(root.querySelectorAll<HTMLButtonElement>('.skill-btn'));

  const strings = {
    complete: root.dataset.tComplete || 'Level Complete!',
    failed: root.dataset.tFailed || 'Not Enough Rescued',
    timeUp: root.dataset.tTimeUp || 'Time Up!',
    victory: root.dataset.tVictory || 'Every Critter Home!',
    completeDesc: root.dataset.tCompleteDesc || 'You rescued {n} of {m}!',
    failedDesc: root.dataset.tFailedDesc || 'Only {n} of {m} made it. Try again!',
    victoryDesc: root.dataset.tVictoryDesc || 'You cleared every level!',
    level: root.dataset.tLevel || 'Level',
    locked: root.dataset.tLocked || 'Locked'
  };
  const fill = (tpl: string, n: number, m: number) =>
    tpl.replace('{n}', n.toString()).replace('{m}', m.toString());
  // Per-level hints the page resolved into `data-t-hint<index>` attributes
  // (e.g. `data-t-hint6` → `dataset.tHint6`); blank for levels without one.
  const hintFor = (index: number): string => root.dataset[`tHint${index}`] ?? '';

  canvas.width = LEVEL_W;
  canvas.height = LEVEL_H;

  // Offscreen terrain layer, rebuilt only when the bitmap changes version.
  const terrainCanvas = document.createElement('canvas');
  terrainCanvas.width = LEVEL_W;
  terrainCanvas.height = LEVEL_H;
  const terrainCtx = terrainCanvas.getContext('2d');
  const terrainImage = terrainCtx ? terrainCtx.createImageData(LEVEL_W, LEVEL_H) : null;
  let terrainVersion = -1;

  // A starfield + moon + distant hills, painted once (level dimensions are fixed).
  const bgCanvas = buildBackground();
  // Cached radial darkening for the screen edges.
  const vignette = ctx.createRadialGradient(
    LEVEL_W / 2,
    LEVEL_H / 2,
    LEVEL_H * 0.34,
    LEVEL_W / 2,
    LEVEL_H / 2,
    LEVEL_H * 0.78
  );
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(4,6,16,0.42)');
  let frame = 0;

  function buildBackground(): HTMLCanvasElement {
    const bg = document.createElement('canvas');
    bg.width = LEVEL_W;
    bg.height = LEVEL_H;
    const b = bg.getContext('2d');
    if (!b) return bg;
    // Night-sky gradient.
    const sky = b.createLinearGradient(0, 0, 0, LEVEL_H);
    sky.addColorStop(0, '#0a0a1c');
    sky.addColorStop(0.55, '#161638');
    sky.addColorStop(1, '#2b2350');
    b.fillStyle = sky;
    b.fillRect(0, 0, LEVEL_W, LEVEL_H);
    // Stars, thicker toward the top.
    for (let s = 0; s < 90; s++) {
      const x = Math.floor(hash2(s, 11) * LEVEL_W);
      const y = Math.floor(hash2(s, 23) * LEVEL_H * 0.72);
      const a = 0.25 + hash2(s, 31) * 0.7;
      b.fillStyle = `rgba(255,255,255,${a})`;
      b.fillRect(x, y, 1, 1);
      if (hash2(s, 47) > 0.9) {
        b.fillStyle = `rgba(190,205,255,${a * 0.45})`;
        b.fillRect(x - 1, y, 1, 1);
        b.fillRect(x + 1, y, 1, 1);
        b.fillRect(x, y - 1, 1, 1);
        b.fillRect(x, y + 1, 1, 1);
      }
    }
    // Moon with a soft halo.
    const mx = 272;
    const my = 38;
    const halo = b.createRadialGradient(mx, my, 2, mx, my, 42);
    halo.addColorStop(0, 'rgba(226,232,255,0.45)');
    halo.addColorStop(1, 'rgba(226,232,255,0)');
    b.fillStyle = halo;
    b.fillRect(mx - 42, my - 42, 84, 84);
    b.fillStyle = '#eef1ff';
    b.beginPath();
    b.arc(mx, my, 13, 0, Math.PI * 2);
    b.fill();
    b.fillStyle = 'rgba(178,188,220,0.5)';
    b.beginPath();
    b.arc(mx + 4, my - 3, 3, 0, Math.PI * 2);
    b.arc(mx - 4, my + 4, 2, 0, Math.PI * 2);
    b.arc(mx + 2, my + 5, 1.5, 0, Math.PI * 2);
    b.fill();
    // Two layers of distant hills near the horizon.
    b.fillStyle = '#241f43';
    drawHills(b, LEVEL_W, LEVEL_H, 150, 24, 3);
    b.fillStyle = '#1a1730';
    drawHills(b, LEVEL_W, LEVEL_H, 170, 30, 8);
    return bg;
  }

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
  let textPops: TextPop[] = [];
  let stock: Record<Skill, number> = blankStock();
  let selected: Skill | null = null;
  let spawned = 0;
  let saved = 0;
  let spawnTimer = 0;
  let nextId = 1;
  let phase: 'title' | 'playing' | 'result' = 'title';
  let nuking = false;
  let nukeTimer = 0;
  // Points accumulate across the levels of one run (a run ends on a failed
  // quota or the final victory); combo/tick state is per-level.
  let runScore = 0;
  let combo = newCombo();
  let levelTicks = 0;
  // Progress lives in its own key; older installs stored it as the table's
  // "score", which loadClearedLevels migrates on first read.
  let cleared = loadClearedLevels(board.top()?.score ?? 0, LEVELS.length);

  bestLevel.textContent = cleared.toString();

  function blankStock(): Record<Skill, number> {
    return { blocker: 0, digger: 0, basher: 0, builder: 0, floater: 0 };
  }

  function spawnInterval(): number {
    // Slider 1 (trickle) … 10 (flood) → ticks between spawns.
    const rate = parseInt(spawnSlider.value, 10) || 5;
    return (11 - rate) * 8;
  }

  // The world the FSM sees: terrain edits plus where blockers stand. The
  // edit calls double as juice hooks — every dig/bash kicks up earth-brown
  // debris and every tread laid puffs golden sawdust, so the terrain visibly
  // reacts without the FSM knowing particles exist.
  const world: CritterWorld = {
    width: LEVEL_W,
    height: LEVEL_H,
    solid: (x, y) => bmp.solid(x, y),
    erodible: (x, y) => bmp.erodible(x, y),
    eraseRect: (x, y, w, h) => {
      bmp.eraseRect(x, y, w, h);
      spawnParticles(x + w / 2, y + h / 2, '#a16207', 3);
    },
    buildRow: (x, y, w) => {
      bmp.buildRow(x, y, w);
      spawnParticles(x + w / 2, y, '#fbbf24', 2);
    },
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
    textPops = [];
    saved = 0;
    spawned = 0;
    spawnTimer = 0;
    nuking = false;
    combo = newCombo();
    levelTicks = 0;
    stock = blankStock();
    for (const key of SKILL_ORDER) stock[key] = def.stock[key] ?? 0;
    selected = SKILL_ORDER.find(s => stock[s] > 0) ?? null;
    levelNum.textContent = (index + 1).toString();
    neededCount.textContent = def.needed.toString();
    // Trickier levels carry a one-line hint, resolved into a data attribute on
    // the root by the page; show it under the field, hide it otherwise.
    const hint = hintFor(index);
    levelHint.textContent = hint;
    levelHint.hidden = !hint;
    syncHud();
    syncToolbar();
  }

  function syncHud() {
    savedCount.textContent = saved.toString();
    outCount.textContent = critters.filter(isActive).length.toString();
    runScoreEl.textContent = runScore.toString();
    bestLevel.textContent = cleared.toString();
    const progress = rescueProgress(saved, def.needed);
    if (progressFill) progressFill.style.width = `${(progress * 100).toFixed(1)}%`;
    if (progressBar) {
      // Keep the ARIA range valid: the max is at least 1 (quota-free levels read
      // as a filled bar) and valuenow never exceeds it when the crowd over-delivers.
      const goal = Math.max(1, def.needed);
      progressBar.setAttribute('aria-valuemax', goal.toString());
      progressBar.setAttribute('aria-valuenow', Math.min(Math.max(saved, 0), goal).toString());
      progressBar.classList.toggle('is-complete', saved >= def.needed);
    }
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

  function spawnTextPop(x: number, y: number, text: string, color: string) {
    // Keep the readout on screen when the rescue happens near an edge.
    textPops.push({
      x: Math.max(24, Math.min(LEVEL_W - 24, x)),
      y: Math.max(10, y),
      text,
      color,
      life: 1
    });
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

  /** Reveals a bonus row on the result overlay, or hides it for a zero bonus. */
  function setBonusRow(row: HTMLElement, val: HTMLElement, points: number) {
    row.hidden = points <= 0;
    val.textContent = `+${points}`;
  }

  /**
   * Ends the level. `timedOut` is the caller's verdict on *why* it ended (the
   * clock, rather than the crowd resolving) — finishLevel never re-derives it
   * from tick state, so a quota failure that merely coincides with the final
   * tick is not mislabelled as a timeout.
   */
  function finishLevel(timedOut = false) {
    if (phase === 'result') return;
    phase = 'result';
    syncToolbar();
    audio.stop();
    const won = saved >= def.needed;
    const last = levelIndex === LEVELS.length - 1;
    const bonuses = levelBonuses({
      saved,
      needed: def.needed,
      spawnCount: def.spawnCount,
      ticks: levelTicks,
      par: def.par
    });
    runScore += bonuses.total;
    setBonusRow(bonusTimeRow, bonusTimeVal, bonuses.time);
    setBonusRow(bonusPerfectRow, bonusPerfectVal, bonuses.perfect);
    setBonusRow(bonusQuotaRow, bonusQuotaVal, bonuses.overQuota);
    resultScoreVal.textContent = runScore.toString();
    if (won) {
      cleared = Math.max(cleared, levelIndex + 1);
      saveClearedLevels(cleared);
      bestLevel.textContent = cleared.toString();
      // Keep the run's points safe even if the tab closes mid-run.
      board.stash(runScore);
    }
    const victory = won && last;
    // One outcome chain sets both faces of the result, so emoji and title can
    // never drift apart. A quota missed on the clock gets its own framing —
    // the player should speed up, not rescue differently.
    let emoji = '💔';
    let title = strings.failed;
    if (victory) {
      emoji = '🏆';
      title = strings.victory;
    } else if (won) {
      emoji = '🎉';
      title = strings.complete;
    } else if (timedOut) {
      emoji = '⏰';
      title = strings.timeUp;
    }
    resultEmoji.textContent = emoji;
    resultTitle.textContent = title;
    // Describe the rescue out of the total crowd (the goal is on the HUD), so
    // an over-quota clear never reads oddly as "8 of 4".
    resultDesc.textContent = won
      ? victory
        ? strings.victoryDesc
        : fill(strings.completeDesc, saved, def.spawnCount)
      : fill(strings.failedDesc, saved, def.spawnCount);
    nextBtn.style.display = won ? 'inline-block' : 'none';
    nextBtn.textContent = victory
      ? nextBtn.dataset.playAgain || 'Play Again'
      : nextBtn.dataset.nextLevel || 'Next Level';
    retryBtn.style.display = won ? 'none' : 'inline-block';
    resultOverlay.style.display = 'flex';
    audio.playSfx(won ? 'score' : 'gameover');
    // A run ends on the final victory or a failed quota; either way the run's
    // points face the table. Mid-run level clears keep the board out of the way.
    if (victory || !won) board.show(runScore);
    else board.hide();
  }

  function update() {
    if (phase !== 'playing') return;
    levelTicks++;

    if (nuking) {
      nukeTimer++;
      if (nukeTimer >= NUKE_INTERVAL) {
        nukeTimer = 0;
        const victim = critters.find(isActive);
        if (victim) {
          victim.alive = false;
          victim.state = 'splatted';
          // Each detonation blows a real crater out of the terrain — the
          // bitmap's eraseCircle exists for exactly this — plus a two-tone
          // fireball so the chain-reaction reads as explosions, not fizzles.
          bmp.eraseCircle(victim.x, Math.round(victim.y - CRITTER_H / 2), 8);
          spawnParticles(victim.x, victim.y - CRITTER_H / 2, '#f97316', 14);
          spawnParticles(victim.x, victim.y - CRITTER_H / 2, '#fde047', 8);
          audio.playSfx('hit');
        }
      }
    } else if (spawned < def.spawnCount) {
      spawnTimer--;
      if (spawnTimer <= 0) {
        // With a second hatch present, spawns alternate between the two.
        const hatches = levelHatches(def);
        const h = hatches[spawned % hatches.length];
        critters.push(createCritter(nextId++, h.x, h.y, h.dir));
        spawned++;
        spawnTimer = spawnInterval();
      }
    }

    for (const c of critters) {
      if (!isActive(c)) continue;
      const wasAlive = c.alive;
      const wasFalling = c.state === 'faller';
      const fell = c.fallDist;
      stepCritter(c, world);
      // A survivable landing after a real drop kicks up a puff of dust.
      if (wasFalling && c.state === 'walker' && fell > 12) {
        spawnParticles(c.x, c.y, '#94a3b8', Math.min(8, 3 + fell / 20));
      }
      if (isActive(c) && atExit(c, def)) {
        c.state = 'exited';
        c.alive = false;
        saved++;
        combo = comboOnRescue(combo, levelTicks);
        const gained = rescuePoints(combo.streak);
        runScore += gained;
        spawnTextPop(
          c.x,
          c.y - CRITTER_H - 6,
          combo.streak > 1 ? `+${gained} ×${combo.streak}` : `+${gained}`,
          combo.streak > 1 ? '#fde047' : '#bbf7d0'
        );
        spawnParticles(c.x, c.y - CRITTER_H / 2, '#4ade80', combo.streak > 1 ? 14 : 8);
        audio.playSfx('rescue');
      } else if (wasAlive && c.state === 'splatted') {
        spawnParticles(c.x, c.y - CRITTER_H / 2, '#f43f5e', 6);
      }
    }

    // Retire fully-resolved critters (keep exited/splatted a moment via particles).
    critters = critters.filter(c => isActive(c));
    syncHud();

    // The level ends once everyone has emerged and no critter can still be
    // rescued: any stragglers are blockers, which never leave on their own and
    // — with no one else left to dig them free — are stuck for good. A timed
    // level also ends the moment its clock runs out, stranding whoever is
    // still in the field — except during a nuke: the player already conceded,
    // so the chain plays out and the result reads as the failure it is rather
    // than a timeout coaching them to speed up.
    const timedOut = !nuking && def.timeLimit !== undefined && levelTicks >= def.timeLimit;
    const done = spawned >= def.spawnCount && critters.every(c => c.state === 'blocker');
    if (done || timedOut) finishLevel(timedOut && !done);
  }

  // --- Rendering ---

  function rebuildTerrain() {
    if (!terrainCtx || !terrainImage) return;
    const data = terrainImage.data; // Uint8ClampedArray — assignments auto-clamp.
    const cells = bmp.data;
    const W = LEVEL_W;
    for (let i = 0; i < cells.length; i++) {
      const o = i * 4;
      const m = cells[i];
      if (m === AIR) {
        data[o + 3] = 0;
        continue;
      }
      const x = i % W;
      const y = (i / W) | 0;
      const openAbove = y === 0 || cells[i - W] === AIR;
      const grain = hash2(x, y);
      if (m === STEEL) {
        // Riveted steel plate: cool grey with seams every 8px, a rivet at each
        // plate centre, and a lighter top lip — visibly not diggable earth.
        const seam = x % 8 === 0 || y % 8 === 0 ? -20 : 0;
        const rivet = x % 8 === 4 && y % 8 === 4 ? 30 : 0;
        const lip = openAbove ? 26 : 0;
        data[o] = 118 + seam + rivet + lip;
        data[o + 1] = 128 + seam + rivet + lip;
        data[o + 2] = 146 + seam + rivet + lip;
        data[o + 3] = 255;
        continue;
      }
      if (m === BRIDGE) {
        // Timber planks: vertical seams every 6px, a grain line every 3rd row.
        const seam = x % 6 === 0 ? -34 : 0;
        const row = y % 3 === 0 ? -14 : 0;
        const lip = openAbove ? 30 : 0;
        data[o] = 216 + lip + seam * 0.5;
        data[o + 1] = 162 + lip * 0.7 + seam + row;
        data[o + 2] = 78 + seam + row;
        data[o + 3] = 255;
        continue;
      }
      // EARTH.
      if (openAbove) {
        // Grassy crown: bright, with a few taller blades from the grain.
        const blade = grain > 0.55 ? 26 : 0;
        data[o] = 118 + blade * 0.4;
        data[o + 1] = 192 + blade;
        data[o + 2] = 74 + blade * 0.3;
        data[o + 3] = 255;
        continue;
      }
      // Soil: darkens with depth below the crown, speckled with grit and pebbles.
      let depth = 1;
      while (depth < 20 && y - depth >= 0 && cells[i - depth * W] !== AIR) depth++;
      const t = Math.min(1, depth / 15);
      const speck = grain < 0.07 ? 30 : grain > 0.95 ? -24 : (grain - 0.5) * 14;
      const rim = depth === 1 ? -14 : 0; // shadow line just under the grass
      data[o] = 124 - t * 56 + speck + rim;
      data[o + 1] = 94 - t * 44 + speck + rim;
      data[o + 2] = 60 - t * 26 + speck + rim;
      data[o + 3] = 255;
    }
    terrainCtx.putImageData(terrainImage, 0, 0);
    terrainVersion = bmp.version;
  }

  function drawHatch(hatch: Hatch) {
    const { x, y } = hatch;
    const halfW = HATCH_W / 2;
    // Metal frame with a top lip.
    ctx.fillStyle = '#374151';
    ctx.fillRect(x - halfW - 1, y - 9, HATCH_W + 2, 7);
    ctx.fillStyle = '#6b7280';
    ctx.fillRect(x - halfW - 1, y - 9, HATCH_W + 2, 1);
    // Dark opening the critters drop from.
    ctx.fillStyle = '#0b1120';
    ctx.fillRect(x - halfW + 1, y - 3, HATCH_W - 2, 3);
    // Hazard stripes along the lintel.
    for (let s = 0; s < HATCH_W - 2; s += 3) {
      ctx.fillStyle = (s / 3) % 2 ? '#fbbf24' : '#1f2937';
      ctx.fillRect(x - halfW + 1 + s, y - 7, 2, 2);
    }
    // Rivets.
    ctx.fillStyle = '#9ca3af';
    ctx.fillRect(x - halfW, y - 8, 1, 1);
    ctx.fillRect(x + halfW - 1, y - 8, 1, 1);
  }

  function drawExit() {
    const { x, y } = def.exit;
    const cx = x;
    const cy = y - EXIT_H / 2;
    const pulse = 0.5 + 0.5 * Math.sin(frame * 0.09);
    // Portal glow.
    const glow = ctx.createRadialGradient(cx, cy, 2, cx, cy, 24 + pulse * 8);
    glow.addColorStop(0, `rgba(74,222,128,${0.35 + pulse * 0.28})`);
    glow.addColorStop(1, 'rgba(74,222,128,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(cx - 30, y - EXIT_H - 16, 60, EXIT_H + 30);
    // Door frame.
    ctx.fillStyle = '#14532d';
    ctx.fillRect(x - EXIT_HALF_W - 1, y - EXIT_H - 2, EXIT_HALF_W * 2 + 2, EXIT_H + 2);
    // Lit interior.
    const inner = ctx.createLinearGradient(0, y - EXIT_H, 0, y);
    inner.addColorStop(0, '#dcfce7');
    inner.addColorStop(1, '#22c55e');
    ctx.fillStyle = inner;
    ctx.fillRect(x - EXIT_HALF_W + 1, y - EXIT_H + 1, EXIT_HALF_W * 2 - 2, EXIT_H - 1);
    // Rising light motes.
    for (let k = 0; k < 3; k++) {
      const my = y - ((frame * 0.7 + k * 8) % EXIT_H);
      ctx.fillStyle = 'rgba(224,255,224,0.75)';
      ctx.fillRect(x - 3 + k * 3, my, 1, 2);
    }
    // Beckoning arrow.
    ctx.fillStyle = '#052e16';
    ctx.font = 'bold 9px monospace';
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

  function drawUmbrella(c: Critter, top: number) {
    const uy = top - 4;
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(c.x - 4, uy, 8, 1);
    ctx.fillStyle = '#0ea5e9';
    ctx.fillRect(c.x - 3, uy + 1, 6, 1);
    ctx.fillStyle = '#0284c7';
    ctx.fillRect(c.x - 1, uy + 2, 2, 1);
    // Bright panel tips.
    ctx.fillStyle = '#e0f2fe';
    ctx.fillRect(c.x - 4, uy, 1, 1);
    ctx.fillRect(c.x + 3, uy, 1, 1);
    // Shaft down to the body.
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(c.x, uy + 3, 1, top - (uy + 3) + 1);
  }

  function drawCritter(c: Critter) {
    const top = c.y - CRITTER_H;
    const body = SKILL_COLOR[c.state] || '#a3e635';
    // Contact shadow (skip while airborne).
    if (c.state !== 'faller') {
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.fillRect(c.x - 2, c.y, 4, 1);
    }
    if (c.floater) drawUmbrella(c, top);
    // Legs — a two-frame walk cycle, phased per critter so a crowd isn't in lockstep.
    if (c.state === 'walker') {
      const stride = (Math.floor(frame / 4) + c.id) % 2;
      ctx.fillStyle = '#3f6212';
      if (stride === 0) {
        ctx.fillRect(c.x - 2, c.y - 1, 1, 1);
        ctx.fillRect(c.x + 1, c.y - 1, 1, 1);
      } else {
        ctx.fillRect(c.x - 1, c.y - 1, 1, 1);
        ctx.fillRect(c.x, c.y - 1, 1, 1);
      }
    }
    // Body with top highlight and belly shadow for a bit of roundness.
    ctx.fillStyle = body;
    ctx.fillRect(c.x - 2, top + 2, 4, CRITTER_H - 3);
    ctx.fillStyle = shade(body, 34);
    ctx.fillRect(c.x - 2, top + 2, 4, 1);
    ctx.fillStyle = shade(body, -36);
    ctx.fillRect(c.x - 2, c.y - 2, 4, 1);
    // Head + hair tuft.
    ctx.fillStyle = '#e2f7c0';
    ctx.fillRect(c.x - 1, top, 2, 2);
    ctx.fillStyle = '#65a30d';
    ctx.fillRect(c.x - 1, top - 1, 2, 1);
    // Eye, on the leading side.
    ctx.fillStyle = '#0b1120';
    ctx.fillRect(c.dir > 0 ? c.x : c.x - 1, top + 1, 1, 1);
    // Per-skill flourishes.
    if (c.state === 'blocker') {
      ctx.fillStyle = '#fed7aa';
      ctx.fillRect(c.x - 3, top + 3, 6, 1); // arms thrown wide
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(c.x - 1, top - 1, 2, 1); // red hard hat
    } else if (c.state === 'digger') {
      ctx.fillStyle = '#fde68a';
      ctx.fillRect(c.x - 1, c.y - 1, 2, 1); // spade glint at its feet
    } else if (c.state === 'basher') {
      ctx.fillStyle = '#fbcfe8';
      ctx.fillRect(c.dir > 0 ? c.x + 2 : c.x - 3, top + 3, 1, 2); // outstretched fist
    } else if (c.state === 'builder') {
      ctx.fillStyle = '#fca5a5';
      ctx.fillRect(c.dir > 0 ? c.x + 2 : c.x - 3, top + 4, 1, 1); // brick in hand
    }
  }

  /**
   * A small destination arrow floating above a critter, pointing toward the
   * exit door so players can read where each one is headed. The heading comes
   * from the pure `exitArrowAngle` (measured from the critter's body centre to
   * the door's centre); this only paints it.
   */
  function drawExitArrow(c: Critter) {
    const angle = exitArrowAngle(
      { x: c.x, y: c.y - CRITTER_H / 2 },
      { x: def.exit.x, y: def.exit.y - EXIT_H / 2 }
    );
    ctx.save();
    ctx.translate(c.x, c.y - CRITTER_H - 6);
    ctx.rotate(angle);
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = '#bef264';
    // Arrowhead pointing along +x before rotation.
    ctx.beginPath();
    ctx.moveTo(4, 0);
    ctx.lineTo(-1, -2.5);
    ctx.lineTo(-1, 2.5);
    ctx.closePath();
    ctx.fill();
    // Short shaft behind the head.
    ctx.fillRect(-4, -0.5, 3, 1);
    // restore() also rolls back globalAlpha to its pre-save value.
    ctx.restore();
  }

  function render() {
    frame++;
    // Prebuilt night sky, stars, moon, and hills.
    ctx.drawImage(bgCanvas, 0, 0);

    if (bmp.version !== terrainVersion) rebuildTerrain();
    ctx.drawImage(terrainCanvas, 0, 0);

    drawExit();
    for (const h of levelHatches(def)) drawHatch(h);
    for (const c of critters) drawCritter(c);
    // Destination arrows sit on top of the critters, only while a level is live.
    if (phase === 'playing') {
      for (const c of critters) if (isActive(c)) drawExitArrow(c);
    }

    // Additive sparks glow against the dark.
    ctx.globalCompositeOperation = 'lighter';
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 2));
      ctx.fillStyle = p.color;
      const s = p.life > 0.3 ? 2 : 1;
      ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;

    // Floating score readouts, over everything else.
    ctx.font = 'bold 8px monospace';
    ctx.textAlign = 'center';
    for (const tp of textPops) {
      ctx.globalAlpha = Math.max(0, Math.min(1, tp.life * 2));
      ctx.fillStyle = '#0b1120';
      ctx.fillText(tp.text, tp.x + 1, tp.y + 1);
      ctx.fillStyle = tp.color;
      ctx.fillText(tp.text, tp.x, tp.y);
    }
    ctx.globalAlpha = 1;

    // Darken the edges for depth.
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, LEVEL_W, LEVEL_H);

    // Timed levels wear their clock top-centre, flashing red for the last 10s.
    if (phase === 'playing' && def.timeLimit !== undefined) {
      const remaining = Math.max(0, def.timeLimit - levelTicks);
      const secs = Math.ceil(remaining / 60);
      // Urgent from the moment the label first reads 10s (600 ticks) down.
      const urgent = remaining <= 600;
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      const label = `⏱ ${secs}s`;
      ctx.fillStyle = 'rgba(4,6,16,0.75)';
      ctx.fillText(label, LEVEL_W / 2 + 1, 13);
      ctx.fillStyle = urgent && frame % 30 < 15 ? '#f87171' : '#fde68a';
      ctx.fillText(label, LEVEL_W / 2, 12);
    }
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
    textPops = textPops.filter(tp => {
      tp.life -= dt * 0.8;
      tp.y -= 14 * dt;
      return tp.life > 0;
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
    levelSelectOverlay.style.display = 'none';
    resultOverlay.style.display = 'none';
    audio.start();
    syncToolbar();
  }

  /** Starts a fresh run (points back to zero) at the given level. */
  function startRun(index: number) {
    board.hide();
    runScore = 0;
    beginLevel(index);
  }

  // Level-select: jump to any level unlocked so far. Unlock state is derived
  // from `cleared` (the highest level cleared, the game's single progress
  // source of truth) — clearing a level opens the next, never a separate flag.
  function buildLevelGrid() {
    levelGrid.textContent = '';
    for (const item of levelSelectItems(LEVELS.length, cleared)) {
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'level-cell';
      cell.disabled = !item.unlocked;
      cell.setAttribute(
        'aria-label',
        `${strings.level} ${item.number}${item.unlocked ? '' : ` (${strings.locked})`}`
      );
      if (item.unlocked) {
        const num = document.createElement('span');
        num.textContent = item.number.toString();
        cell.appendChild(num);
        cell.addEventListener('click', () => startRun(item.index));
      } else {
        const lock = document.createElement('span');
        lock.className = 'level-lock';
        lock.textContent = '🔒';
        cell.appendChild(lock);
      }
      levelGrid.appendChild(cell);
    }
  }

  function openLevelSelect() {
    buildLevelGrid();
    startOverlay.style.display = 'none';
    levelSelectOverlay.style.display = 'flex';
  }

  function closeLevelSelect() {
    levelSelectOverlay.style.display = 'none';
    startOverlay.style.display = 'flex';
  }

  levelSelectBtn.addEventListener('click', openLevelSelect);
  levelBackBtn.addEventListener('click', closeLevelSelect);

  startBtn.addEventListener('click', () => startRun(0));
  nextBtn.addEventListener('click', () => {
    const victory = levelIndex === LEVELS.length - 1 && saved >= def.needed;
    board.hide();
    // A victory lap restarts as a fresh run; mid-run the points carry over.
    if (victory) startRun(0);
    else beginLevel(Math.min(levelIndex + 1, LEVELS.length - 1));
  });
  // A failed level already ended the run (and banked its score), so a retry
  // begins a new run from the same level.
  retryBtn.addEventListener('click', () => startRun(levelIndex));

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
