/**
 * Cascade — the arcade's falling-block cabinet.
 *
 * Pure rules live in well.ts / piece.ts / bag.ts / run.ts; this module owns
 * DOM wiring, input (keyboard DAS + touch hold-buttons), and canvas
 * rendering. It expects the markup defined in
 * src/pages/[lang]/fun/cascade.astro.
 *
 * Rendering splits two ways: the cosmos backdrop, the well slab (lit edges,
 * inner pit shadow, column guides) and the side panel are baked once into a
 * static layer; every tile, ghost, flash, particle, and popup draws per
 * frame on top.
 */
import {
  createGameLoop,
  createStaticLayer,
  initScoreboard,
  setupHiDpiCanvas,
  shadeColor,
  createGameAudio,
  wireSoundButton,
  hash01 as hash
} from '../engine';
import { WELL_W, WELL_H } from './well';
import { cellsOf, ROTATIONS, type PieceId } from './piece';
import {
  createRun,
  tickRun,
  shift,
  rotate,
  setSoftDrop,
  hardDrop,
  ghostPiece,
  type CascadeRun,
  type RunEvent
} from './run';

const TILE = 24;
const WELL_X = 20;
const WELL_Y = 40;
const PIT_W = WELL_W * TILE;
const PIT_H = WELL_H * TILE;
/** Slab thickness around the pit. */
const RIM = 12;
const PANEL_X = 288;
const PANEL_W = 128;
const CANVAS_W = 432;
const CANVAS_H = WELL_Y + PIT_H + RIM + 16;

/** Face colour per stored cell value (piece id + 1). */
const CELL_COLORS = [
  '',
  '#22d3ee', // I
  '#facc15', // O
  '#a855f7', // T
  '#4ade80', // S
  '#f43f5e', // Z
  '#3b82f6', // J
  '#fb923c' // L
];
// Bevel shades precomputed per palette entry: shadeColor's hex-parse +
// string build is too much to repeat for every tile at 60fps.
const CELL_LIT = CELL_COLORS.map(c => (c ? shadeColor(c, 1.45) : ''));
const CELL_DARK = CELL_COLORS.map(c => (c ? shadeColor(c, 0.55) : ''));
const CELL_GHOST = CELL_COLORS.map(c => (c ? shadeColor(c, 0.4) : ''));

/** Spawn-state bounding box per piece, for centring the next preview. */
const PREVIEW_BOUNDS = ROTATIONS.map(states => {
  const cells = states[0];
  return {
    minX: Math.min(...cells.map(([x]) => x)),
    maxX: Math.max(...cells.map(([x]) => x)),
    minY: Math.min(...cells.map(([, y]) => y)),
    maxY: Math.max(...cells.map(([, y]) => y))
  };
});

/** Keyboard auto-shift: initial delay then repeat rate, in seconds. */
const DAS_DELAY = 0.17;
const DAS_REPEAT = 0.05;

const BASE_TEMPO = 126;
const TEMPO_PER_LEVEL = 9;
const MAX_TEMPO = 240;

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  gravity: number;
  glow: boolean;
}

interface Floater {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  /** Font px; big popups announce chains and level-ups. */
  size: number;
}

type Phase = 'idle' | 'play' | 'over';

export function initCascadeGame(): void {
  const root = document.getElementById('cascade-root');
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
  const finalScoreEl = el('final-score');
  const scoreEl = el('score');
  const linesEl = el('lines');
  const levelEl = el('level');
  const recordEl = el('record');
  const toastArea = el('toast-area');

  const s = (key: string, fallback: string) => root.dataset[key] || fallback;
  const strings = {
    title: s('tTitle', 'Cascade'),
    next: s('tNext', 'Next'),
    chain: s('tChain', 'Chain ×{n}'),
    levelUp: s('tLevelUp', 'Level {n}'),
    newRecord: s('tNewRecord', 'New record!')
  };

  // --- Static backdrop bake -----------------------------------------------
  const ground = createStaticLayer(CANVAS_W, CANVAS_H, target => {
    // Deep-space gradient with a scatter of stars and two faint nebulae.
    const sky = target.createLinearGradient(0, 0, 0, CANVAS_H);
    sky.addColorStop(0, '#0b1020');
    sky.addColorStop(0.6, '#131a30');
    sky.addColorStop(1, '#1a1330');
    target.fillStyle = sky;
    target.fillRect(0, 0, CANVAS_W, CANVAS_H);
    for (const [nx, ny, nr, colour] of [
      [CANVAS_W * 0.82, CANVAS_H * 0.2, 90, 'rgba(168, 85, 247, 0.08)'],
      [CANVAS_W * 0.15, CANVAS_H * 0.85, 110, 'rgba(34, 211, 238, 0.07)']
    ] as const) {
      const glow = target.createRadialGradient(nx, ny, 0, nx, ny, nr);
      glow.addColorStop(0, colour);
      glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      target.fillStyle = glow;
      target.fillRect(nx - nr, ny - nr, nr * 2, nr * 2);
    }
    for (let star = 0; star < 90; star++) {
      target.globalAlpha = 0.2 + hash(star, 1) * 0.6;
      target.fillStyle = hash(star, 2) < 0.15 ? '#c4b5fd' : '#dbeafe';
      target.fillRect(
        hash(star, 3) * CANVAS_W,
        hash(star, 4) * CANVAS_H,
        hash(star, 5) < 0.2 ? 2 : 1,
        1
      );
    }
    target.globalAlpha = 1;

    // The well: a metal slab with lit top/left edges, holding a dark pit.
    const fx = WELL_X - RIM;
    const fy = WELL_Y - RIM;
    const fw = PIT_W + RIM * 2;
    const fh = PIT_H + RIM * 2;
    const slab = target.createLinearGradient(fx, fy, fx + fw, fy + fh);
    slab.addColorStop(0, '#3d4762');
    slab.addColorStop(0.5, '#2b3247');
    slab.addColorStop(1, '#1f2436');
    target.fillStyle = slab;
    target.fillRect(fx, fy, fw, fh);
    // Bevel: light where the light hits, dark where it doesn't.
    target.fillStyle = 'rgba(190, 210, 255, 0.35)';
    target.fillRect(fx, fy, fw, 2);
    target.fillRect(fx, fy, 2, fh);
    target.fillStyle = 'rgba(0, 0, 0, 0.45)';
    target.fillRect(fx, fy + fh - 2, fw, 2);
    target.fillRect(fx + fw - 2, fy, 2, fh);
    // Corner rivets.
    target.fillStyle = '#8fa3c8';
    for (const [rx, ry] of [
      [fx + 5, fy + 5],
      [fx + fw - 5, fy + 5],
      [fx + 5, fy + fh - 5],
      [fx + fw - 5, fy + fh - 5]
    ]) {
      target.beginPath();
      target.arc(rx, ry, 2.2, 0, Math.PI * 2);
      target.fill();
    }

    // Pit interior: darker toward the floor, like a real shaft.
    const pit = target.createLinearGradient(0, WELL_Y, 0, WELL_Y + PIT_H);
    pit.addColorStop(0, '#0d1120');
    pit.addColorStop(1, '#05070e');
    target.fillStyle = pit;
    target.fillRect(WELL_X, WELL_Y, PIT_W, PIT_H);
    // Column guides so a piece can be lined up at a glance.
    target.strokeStyle = 'rgba(148, 163, 184, 0.07)';
    target.lineWidth = 1;
    for (let x = 1; x < WELL_W; x++) {
      target.beginPath();
      target.moveTo(WELL_X + x * TILE + 0.5, WELL_Y);
      target.lineTo(WELL_X + x * TILE + 0.5, WELL_Y + PIT_H);
      target.stroke();
    }
    for (let y = 1; y < WELL_H; y++) {
      target.beginPath();
      target.moveTo(WELL_X, WELL_Y + y * TILE + 0.5);
      target.lineTo(WELL_X + PIT_W, WELL_Y + y * TILE + 0.5);
      target.stroke();
    }
    // Inner rim shadows: the pit walls have depth.
    const lshadow = target.createLinearGradient(WELL_X, 0, WELL_X + 10, 0);
    lshadow.addColorStop(0, 'rgba(0, 0, 0, 0.55)');
    lshadow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    target.fillStyle = lshadow;
    target.fillRect(WELL_X, WELL_Y, 10, PIT_H);
    const rshadow = target.createLinearGradient(WELL_X + PIT_W, 0, WELL_X + PIT_W - 10, 0);
    rshadow.addColorStop(0, 'rgba(0, 0, 0, 0.55)');
    rshadow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    target.fillStyle = rshadow;
    target.fillRect(WELL_X + PIT_W - 10, WELL_Y, 10, PIT_H);
    const tshadow = target.createLinearGradient(0, WELL_Y, 0, WELL_Y + 12);
    tshadow.addColorStop(0, 'rgba(0, 0, 0, 0.6)');
    tshadow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    target.fillStyle = tshadow;
    target.fillRect(WELL_X, WELL_Y, PIT_W, 12);

    // Side panel: the NEXT window and the cascade lamps, same slab finish.
    const panel = (py: number, ph: number) => {
      const face = target.createLinearGradient(PANEL_X, py, PANEL_X + PANEL_W, py + ph);
      face.addColorStop(0, '#343d56');
      face.addColorStop(1, '#222941');
      target.fillStyle = face;
      target.fillRect(PANEL_X, py, PANEL_W, ph);
      target.fillStyle = 'rgba(190, 210, 255, 0.3)';
      target.fillRect(PANEL_X, py, PANEL_W, 2);
      target.fillRect(PANEL_X, py, 2, ph);
      target.fillStyle = 'rgba(0, 0, 0, 0.4)';
      target.fillRect(PANEL_X, py + ph - 2, PANEL_W, 2);
      target.fillRect(PANEL_X + PANEL_W - 2, py, 2, ph);
    };
    panel(WELL_Y - RIM, 128);
    target.fillStyle = '#93c5fd';
    target.font = 'bold 12px monospace';
    target.textAlign = 'center';
    target.textBaseline = 'middle';
    target.fillText(strings.next.toUpperCase(), PANEL_X + PANEL_W / 2, WELL_Y + 4);
    target.fillStyle = 'rgba(0, 0, 0, 0.45)';
    target.fillRect(PANEL_X + 10, WELL_Y + 16, PANEL_W - 20, 88);

    panel(WELL_Y + 140, 78);
    target.fillStyle = '#93c5fd';
    target.fillText(strings.title.toUpperCase(), PANEL_X + PANEL_W / 2, WELL_Y + 156);
    // Lamp sockets; render lights them while a chain is running.
    for (let lamp = 0; lamp < 4; lamp++) {
      const lx = PANEL_X + 24 + lamp * 27;
      const ly = WELL_Y + 186;
      target.fillStyle = '#10131f';
      target.beginPath();
      target.arc(lx, ly, 8, 0, Math.PI * 2);
      target.fill();
      target.strokeStyle = 'rgba(148, 163, 184, 0.35)';
      target.stroke();
      target.fillStyle = '#475569';
      target.font = 'bold 8px monospace';
      target.fillText(`×${lamp + 2}`, lx, ly + 16);
      target.font = 'bold 12px monospace';
    }
  });
  // No pointer math needed (a board tap just rotates), so the handle is unused.
  setupHiDpiCanvas(canvas, ctx, CANVAS_W, CANVAS_H, { onApply: ground.rebuild });

  // The danger glow's gradient never changes shape — only its strength does.
  const dangerGradient = ctx.createLinearGradient(0, WELL_Y, 0, WELL_Y + 70);
  dangerGradient.addColorStop(0, 'rgba(248, 113, 113, 1)');
  dangerGradient.addColorStop(1, 'rgba(248, 113, 113, 0)');

  // --- Game state ----------------------------------------------------------
  let phase: Phase = 'idle';
  let run: CascadeRun = createRun(Math.random);
  let clock = 0;
  let particles: Particle[] = [];
  let floaters: Floater[] = [];
  /** Seconds left on the big centre banner (level-ups). */
  let bannerTimer = 0;
  let bannerText = '';
  /** Highest chain link hit during the current cascade, for the lamps. */
  let chainGlow = 0;
  let chainGlowTimer = 0;
  /** Last values written to the HUD, so render skips redundant DOM writes. */
  const hud = { score: -1, lines: -1, level: -1 };

  const board = initScoreboard(document.getElementById('highscores'));
  let record = board.top()?.score ?? 0;
  let runStartRecord = 0;
  let recordCelebrated = false;
  recordEl.textContent = `${record}`;

  // A driving minor-key loop that setTempo() winds up level by level.
  const audio = createGameAudio({
    tempo: BASE_TEMPO,
    wave: 'square',
    volume: 0.11,
    melody: [
      { freq: 164.81, beats: 0.5 },
      { freq: 164.81, beats: 0.5 },
      { freq: 246.94, beats: 0.5 },
      { freq: 164.81, beats: 0.5 },
      { freq: 261.63, beats: 0.5 },
      { freq: 246.94, beats: 0.5 },
      { freq: 196.0, beats: 0.5 },
      { freq: 220.0, beats: 0.5 },
      { freq: 164.81, beats: 0.5 },
      { freq: 164.81, beats: 0.5 },
      { freq: 293.66, beats: 0.5 },
      { freq: 261.63, beats: 0.5 },
      { freq: 246.94, beats: 0.5 },
      { freq: 220.0, beats: 0.5 },
      { freq: 196.0, beats: 0.5 },
      { freq: 146.83, beats: 0.5 }
    ]
  });
  wireSoundButton(document.getElementById('sound-btn'), audio);

  function showToast(text: string) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = text;
    toastArea.appendChild(toast);
    while (toastArea.children.length > 3) toastArea.firstElementChild?.remove();
    setTimeout(() => toast.remove(), 2400);
  }

  const cellPx = (cx: number, cy: number) => ({
    x: WELL_X + cx * TILE,
    y: WELL_Y + cy * TILE
  });

  function spawnBurst(
    sx: number,
    sy: number,
    count: number,
    color: string,
    opts: { speed?: number; life?: number; size?: number; gravity?: number; glow?: boolean } = {}
  ) {
    const speed = opts.speed ?? 70;
    for (let n = 0; n < count; n++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.6);
      particles.push({
        x: sx,
        y: sy,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - (opts.gravity ? 40 : 0),
        life: opts.life ?? 0.5,
        maxLife: opts.life ?? 0.5,
        size: opts.size ?? 2,
        color,
        gravity: opts.gravity ?? 0,
        glow: opts.glow ?? false
      });
    }
  }

  function addFloater(x: number, y: number, text: string, color: string, size = 13) {
    floaters.push({ x, y, text, color, life: size > 13 ? 1.5 : 1.1, size });
  }

  /** Announces (once per run) that the score beat the table's best. */
  function celebrateRecord() {
    if (recordCelebrated || runStartRecord <= 0) return;
    if (run.score <= runStartRecord) return;
    recordCelebrated = true;
    showToast(`🏅 ${strings.newRecord}`);
  }

  /** Celebrates, banks the run's best into the HUD, and stashes it. */
  function bankScore() {
    celebrateRecord();
    board.stash(run.score);
    record = Math.max(record, run.score);
    recordEl.textContent = `${record}`;
  }

  function applyTempo() {
    audio.setTempo(Math.min(MAX_TEMPO, BASE_TEMPO + (run.level - 1) * TEMPO_PER_LEVEL));
  }

  function startRun() {
    run = createRun(Math.random);
    particles = [];
    floaters = [];
    bannerTimer = 0;
    chainGlow = 0;
    chainGlowTimer = 0;
    runStartRecord = record;
    recordCelebrated = false;
    held.left = held.right = false;
    dasDir = 0;
    phase = 'play';
    applyTempo();
    audio.start();
  }

  function endRun() {
    phase = 'over';
    setSoftDrop(run, false);
    audio.playSfx('gameover');
    audio.stop();
    bankScore();
    finalScoreEl.textContent = `${run.score}`;
    overOverlay.style.display = 'flex';
    // After the overlay is visible, so the initials input can take focus.
    board.show(run.score);
  }

  function handleEvents(events: RunEvent[]) {
    for (const event of events) {
      if (event.type === 'clear') {
        const midRow = event.rows[Math.floor(event.rows.length / 2)];
        const cy = WELL_Y + midRow * TILE + TILE / 2;
        // Burst a spray from every cleared cell in its own colour.
        for (const row of event.rows) {
          for (let x = 0; x < WELL_W; x++) {
            const colour = CELL_COLORS[run.well[row * WELL_W + x]] || '#e2e8f0';
            const p = cellPx(x + 0.5, row + 0.5);
            spawnBurst(p.x, p.y, 2, colour, { speed: 90, life: 0.55, gravity: 1, glow: true });
          }
        }
        if (event.chain > 1) {
          // The cascade pays: big popup, lamp, and the bright bell run.
          chainGlow = Math.max(chainGlow, event.chain);
          chainGlowTimer = 1.6;
          addFloater(
            WELL_X + PIT_W / 2,
            cy - 26,
            strings.chain.replace('{n}', String(event.chain)),
            '#f0abfc',
            22
          );
          audio.playSfx('rescue');
        } else {
          audio.playSfx('score');
        }
        addFloater(WELL_X + PIT_W / 2, cy, `+${event.points}`, '#fbbf24', event.chain > 1 ? 18 : 14);
        // Bank the run as it grows so a closed tab keeps the record.
        bankScore();
      } else if (event.type === 'levelUp') {
        bannerText = strings.levelUp.replace('{n}', String(event.level));
        bannerTimer = 1.6;
        applyTempo();
        // A flourish of sparks around the well rim.
        for (let n = 0; n < 26; n++) {
          const along = Math.random();
          const side = Math.random() < 0.5;
          spawnBurst(
            side ? WELL_X + along * PIT_W : Math.random() < 0.5 ? WELL_X : WELL_X + PIT_W,
            side ? (Math.random() < 0.5 ? WELL_Y : WELL_Y + PIT_H) : WELL_Y + along * PIT_H,
            1,
            '#facc15',
            { speed: 55, life: 0.8, glow: true }
          );
        }
      } else if (event.type === 'topOut') {
        endRun();
      }
    }
  }

  // --- Input ----------------------------------------------------------------
  const held = { left: false, right: false };
  /** Direction DAS is currently driving: the most recent still-held press. */
  let dasDir: -1 | 0 | 1 = 0;
  let dasTimer = 0;
  let arrTimer = 0;

  function startDas(dir: -1 | 1) {
    dasDir = dir;
    dasTimer = 0;
    arrTimer = 0;
  }

  function press(dir: -1 | 1) {
    const key = dir < 0 ? 'left' : 'right';
    if (held[key]) return;
    held[key] = true;
    startDas(dir);
    if (phase === 'play') shift(run, dir);
  }

  function release(dir: -1 | 1) {
    held[dir < 0 ? 'left' : 'right'] = false;
    if (dasDir !== dir) return;
    // Fall back to the other, still-physically-held key (its OS repeats are
    // suppressed, so DAS must pick it back up or it goes dead).
    if (held.left) startDas(-1);
    else if (held.right) startDas(1);
    else dasDir = 0;
  }

  function doRotate(dir: 1 | -1) {
    if (phase !== 'play') return;
    if (rotate(run, dir)) audio.playSfx('blip');
  }

  function doHardDrop() {
    if (phase !== 'play' || !run.piece) return;
    const landing = ghostPiece(run);
    const events = hardDrop(run);
    handleEvents(events);
    // A drop that tops out already played its defeat jingle in endRun —
    // don't thud and kick dust over the game-over screen.
    if (events.some(e => e.type === 'topOut')) return;
    audio.playSfx('hit');
    if (landing) {
      for (const c of cellsOf(landing)) {
        if (c.y < 0) continue;
        const p = cellPx(c.x + 0.5, c.y + 1);
        spawnBurst(p.x, p.y, 2, '#94a3b8', { speed: 35, life: 0.3, size: 1.4 });
      }
    }
  }

  const GAME_KEYS = new Set([
    'ArrowLeft',
    'ArrowRight',
    'ArrowDown',
    'ArrowUp',
    ' ',
    'z',
    'Z',
    'x',
    'X'
  ]);

  const onKeydown = (e: KeyboardEvent) => {
    if (phase !== 'play') return;
    if (GAME_KEYS.has(e.key)) e.preventDefault();
    if (e.repeat) return; // DAS handles repeats at a steady, framerate-safe rate
    switch (e.key) {
      case 'ArrowLeft':
        press(-1);
        break;
      case 'ArrowRight':
        press(1);
        break;
      case 'ArrowDown':
        setSoftDrop(run, true);
        break;
      case 'ArrowUp':
      case 'x':
      case 'X':
        doRotate(1);
        break;
      case 'z':
      case 'Z':
        doRotate(-1);
        break;
      case ' ':
        doHardDrop();
        break;
    }
  };
  const onKeyup = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft') release(-1);
    else if (e.key === 'ArrowRight') release(1);
    else if (e.key === 'ArrowDown') setSoftDrop(run, false);
  };
  document.addEventListener('keydown', onKeydown);
  document.addEventListener('keyup', onKeyup);
  // Document-level listeners outlive a ClientRouter swap; each wiring retires
  // its own handlers so re-inits don't stack keyboard handlers forever.
  document.addEventListener(
    'astro:before-swap',
    () => {
      document.removeEventListener('keydown', onKeydown);
      document.removeEventListener('keyup', onKeyup);
    },
    { once: true }
  );

  // Touch pads: hold-to-repeat for shift and soft drop, taps for the rest.
  // `tap` is the single-step action for keyboard/AT activation — those fire
  // click (with detail 0), never pointerdown, so without it the aria-labelled
  // buttons would be announced but dead to a switch or keyboard user.
  function wireHoldButton(id: string, down: () => void, up?: () => void, tap?: () => void) {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.addEventListener('pointerdown', e => {
      e.preventDefault();
      down();
    });
    for (const evt of ['pointerup', 'pointercancel', 'pointerleave'] as const) {
      btn.addEventListener(evt, () => up?.());
    }
    btn.addEventListener('click', e => {
      if (e.detail === 0) (tap ?? down)();
    });
  }
  wireHoldButton(
    'btn-left',
    () => press(-1),
    () => release(-1),
    () => phase === 'play' && shift(run, -1)
  );
  wireHoldButton(
    'btn-right',
    () => press(1),
    () => release(1),
    () => phase === 'play' && shift(run, 1)
  );
  wireHoldButton(
    'btn-down',
    () => phase === 'play' && setSoftDrop(run, true),
    () => setSoftDrop(run, false),
    () => {
      // One keyboard activation = a short soft-drop pulse. Capture the run
      // so the delayed release can't touch a successor run's state.
      if (phase !== 'play') return;
      const target = run;
      setSoftDrop(target, true);
      setTimeout(() => setSoftDrop(target, false), 150);
    }
  );
  wireHoldButton('btn-rotate', () => doRotate(1));
  wireHoldButton('btn-drop', () => doHardDrop());

  // Tapping the board spins the piece — the natural mobile gesture.
  canvas.addEventListener('click', () => doRotate(1));

  // --- Update ----------------------------------------------------------------

  function update(dt: number) {
    clock += dt;
    bannerTimer = Math.max(0, bannerTimer - dt);
    chainGlowTimer = Math.max(0, chainGlowTimer - dt);
    if (chainGlowTimer === 0 && run.phase !== 'clearing') chainGlow = 0;
    floaters = floaters.filter(f => {
      f.life -= dt;
      f.y -= (f.size > 13 ? 10 : 22) * dt;
      return f.life > 0;
    });
    particles = particles.filter(part => {
      part.life -= dt;
      part.x += part.vx * dt;
      part.y += part.vy * dt;
      part.vy += part.gravity * 260 * dt;
      return part.life > 0;
    });
    if (phase !== 'play') return;

    // Delayed auto-shift while a direction is held.
    if (dasDir !== 0) {
      const prev = dasTimer;
      dasTimer += dt;
      if (dasTimer >= DAS_DELAY) {
        // Credit the repeat clock only with time past the delay threshold,
        // so the first repeat doesn't land up to a frame early.
        arrTimer += dasTimer - Math.max(prev, DAS_DELAY);
        while (arrTimer >= DAS_REPEAT) {
          arrTimer -= DAS_REPEAT;
          shift(run, dasDir);
        }
      }
    }

    handleEvents(tickRun(run, dt));
  }

  // --- Rendering ---------------------------------------------------------------

  /** A bevelled tile face: lit from the top-left, glossed, outlined.
   * Takes the palette index (cell value) so the shades come precomputed. */
  function drawTile(px: number, py: number, v: number, size = TILE) {
    const bevel = Math.max(2, size * 0.14);
    ctx.fillStyle = CELL_COLORS[v];
    ctx.fillRect(px, py, size, size);
    // Lit top and left edges.
    ctx.fillStyle = CELL_LIT[v];
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + size, py);
    ctx.lineTo(px + size - bevel, py + bevel);
    ctx.lineTo(px + bevel, py + bevel);
    ctx.lineTo(px + bevel, py + size - bevel);
    ctx.lineTo(px, py + size);
    ctx.closePath();
    ctx.fill();
    // Shaded bottom and right edges.
    ctx.fillStyle = CELL_DARK[v];
    ctx.beginPath();
    ctx.moveTo(px + size, py + size);
    ctx.lineTo(px, py + size);
    ctx.lineTo(px + bevel, py + size - bevel);
    ctx.lineTo(px + size - bevel, py + size - bevel);
    ctx.lineTo(px + size - bevel, py + bevel);
    ctx.lineTo(px + size, py);
    ctx.closePath();
    ctx.fill();
    // Gloss speck in the lit corner.
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.fillRect(px + bevel + 1, py + bevel + 1, Math.max(2, size * 0.12), Math.max(2, size * 0.12));
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(px + 0.5, py + 0.5, size - 1, size - 1);
  }

  // The ghost only moves when the piece does, and the well can't change
  // under an in-flight piece — tryMove returns a fresh object on every
  // successful move, so piece identity is a complete cache key. Recomputing
  // per frame would walk the whole drop height in allocations.
  let ghostFor: typeof run.piece = null;
  let ghostCached: typeof run.piece = null;
  function currentGhost() {
    if (run.piece !== ghostFor) {
      ghostFor = run.piece;
      ghostCached = run.piece ? ghostPiece(run) : null;
    }
    return ghostCached;
  }

  function drawGhost() {
    if (run.phase !== 'falling') return;
    const ghost = currentGhost();
    const piece = run.piece;
    if (!ghost || !piece || ghost.y === piece.y) return;
    for (const c of cellsOf(ghost)) {
      if (c.y < 0) continue;
      const p = cellPx(c.x, c.y);
      ctx.fillStyle = CELL_GHOST[piece.id + 1];
      ctx.globalAlpha = 0.28;
      ctx.fillRect(p.x + 2, p.y + 2, TILE - 4, TILE - 4);
      ctx.globalAlpha = 0.75;
      ctx.strokeStyle = CELL_COLORS[piece.id + 1];
      ctx.lineWidth = 1.5;
      ctx.strokeRect(p.x + 2.5, p.y + 2.5, TILE - 5, TILE - 5);
      ctx.globalAlpha = 1;
    }
  }

  function drawNextPreview() {
    const id: PieceId = run.nextId;
    const size = 18;
    const b = PREVIEW_BOUNDS[id];
    const ox = PANEL_X + PANEL_W / 2 - ((b.maxX - b.minX + 1) * size) / 2 - b.minX * size;
    const oy = WELL_Y + 60 - ((b.maxY - b.minY + 1) * size) / 2 - b.minY * size;
    for (const [cx, cy] of ROTATIONS[id][0]) {
      drawTile(ox + cx * size, oy + cy * size, id + 1, size);
    }
  }

  function drawChainLamps() {
    for (let lamp = 0; lamp < 4; lamp++) {
      if (chainGlow < lamp + 2) continue;
      const lx = PANEL_X + 24 + lamp * 27;
      const ly = WELL_Y + 186;
      const pulse = 0.6 + 0.4 * Math.sin(clock * 8 + lamp);
      ctx.save();
      ctx.shadowColor = '#f0abfc';
      ctx.shadowBlur = 8 * pulse;
      ctx.fillStyle = `rgba(240, 171, 252, ${0.55 + 0.45 * pulse})`;
      ctx.beginPath();
      ctx.arc(lx, ly, 6.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function render() {
    ground.draw(ctx);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Locked stack; rows mid-flash burn white before the landslide.
    const clearing = new Set(run.phase === 'clearing' ? run.clearingRows : []);
    for (let y = 0; y < WELL_H; y++) {
      for (let x = 0; x < WELL_W; x++) {
        const v = run.well[y * WELL_W + x];
        if (v === 0) continue;
        const p = cellPx(x, y);
        drawTile(p.x, p.y, v);
        if (clearing.has(y)) {
          const flash = 0.5 + 0.45 * Math.sin(clock * 26);
          ctx.fillStyle = `rgba(255, 255, 255, ${flash})`;
          ctx.fillRect(p.x, p.y, TILE, TILE);
        }
      }
    }

    drawGhost();

    if (run.piece) {
      for (const c of cellsOf(run.piece)) {
        if (c.y < 0) continue;
        const p = cellPx(c.x, c.y);
        drawTile(p.x, p.y, run.piece.id + 1);
      }
    }

    // Danger glow when the stack crowds the spawn rows.
    let stackTop = WELL_H;
    for (let i = 0; i < run.well.length; i++) {
      if (run.well[i] !== 0) {
        stackTop = Math.floor(i / WELL_W);
        break;
      }
    }
    if (stackTop <= 4 && phase === 'play') {
      // Hoisted gradient, alpha-modulated per frame (the sims' sky trick).
      ctx.globalAlpha = (0.22 + 0.12 * Math.sin(clock * 6)) * (1 - stackTop / 5);
      ctx.fillStyle = dangerGradient;
      ctx.fillRect(WELL_X, WELL_Y, PIT_W, 70);
      ctx.globalAlpha = 1;
    }

    drawNextPreview();
    drawChainLamps();

    for (const part of particles) {
      ctx.globalAlpha = Math.max(0, part.life / part.maxLife);
      if (part.glow) {
        ctx.save();
        ctx.shadowColor = part.color;
        ctx.shadowBlur = 5;
        ctx.fillStyle = part.color;
        ctx.beginPath();
        ctx.arc(part.x, part.y, part.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else {
        ctx.fillStyle = part.color;
        ctx.fillRect(part.x - part.size, part.y - part.size, part.size * 2, part.size * 2);
      }
    }
    ctx.globalAlpha = 1;

    for (const f of floaters) {
      ctx.globalAlpha = Math.max(0, Math.min(1, f.life / 0.4));
      ctx.font = `bold ${f.size}px monospace`;
      if (f.size > 13) {
        ctx.save();
        ctx.shadowColor = f.color;
        ctx.shadowBlur = 10;
        ctx.fillStyle = f.color;
        ctx.fillText(f.text, f.x, f.y);
        ctx.restore();
      } else {
        ctx.fillStyle = f.color;
        ctx.fillText(f.text, f.x, f.y);
      }
    }
    ctx.globalAlpha = 1;

    if (bannerTimer > 0) {
      const a = Math.min(1, bannerTimer / 0.4) * Math.min(1, (1.6 - bannerTimer) / 0.25 + 0.2);
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, a));
      ctx.shadowColor = '#facc15';
      ctx.shadowBlur = 14;
      ctx.fillStyle = '#fde047';
      ctx.font = 'bold 26px monospace';
      ctx.fillText(bannerText.toUpperCase(), WELL_X + PIT_W / 2, WELL_Y + PIT_H * 0.3);
      ctx.restore();
    }

    // These only change on clear events; skip the DOM writes otherwise.
    if (hud.score !== run.score) {
      hud.score = run.score;
      scoreEl.textContent = `${run.score}`;
    }
    if (hud.lines !== run.lines) {
      hud.lines = run.lines;
      linesEl.textContent = `${run.lines}`;
    }
    if (hud.level !== run.level) {
      hud.level = run.level;
      levelEl.textContent = `${run.level}`;
    }
  }

  startBtn.addEventListener('click', () => {
    startOverlay.style.display = 'none';
    startRun();
  });

  againBtn.addEventListener('click', () => {
    overOverlay.style.display = 'none';
    board.hide();
    startRun();
  });

  // Cheat-mode handle, only when the page is opened with #dev: exposes the
  // live run and the real input paths so a bot (or a curious player) can
  // drive full games in a real browser — how the cabinet gets playtested.
  // Retired with the page it drives, so a ClientRouter swap can't leave the
  // global pointing at a dead board.
  if (window.location.hash === '#dev') {
    const devWindow = window as unknown as Record<string, unknown>;
    devWindow.cascadeDev = {
      getRun: () => run,
      shift: (dir: -1 | 1) => shift(run, dir),
      rotate: (dir: 1 | -1) => doRotate(dir),
      hardDrop: () => doHardDrop(),
      softDrop: (on: boolean) => setSoftDrop(run, on)
    };
    document.addEventListener('astro:before-swap', () => delete devWindow.cascadeDev, {
      once: true
    });
  }

  createGameLoop(update, render).start();
}
