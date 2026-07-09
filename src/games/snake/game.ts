/**
 * Snake — classic grid snake with smooth, interpolated movement.
 *
 * Pure rules live in logic.ts; this module owns DOM wiring, the fixed-step
 * loop, and canvas rendering. It expects the markup defined in
 * src/pages/[lang]/fun/snake.astro.
 */
import { createGameLoop, initScoreboard, createGameAudio, wireSoundButton } from '../engine';
import {
  COLS,
  ROWS,
  BONUS_TICKS,
  BONUS_POINTS,
  FOOD_POINTS,
  createSnakeState,
  queueDirection,
  step,
  stepInterval,
  type SnakeState,
  type Vec
} from './logic';

const CELL = 20;
const WIDTH = COLS * CELL;
const HEIGHT = ROWS * CELL;
const DEATH_DELAY = 0.9; // seconds between dying and the game-over overlay

const DIRECTIONS: Record<string, Vec> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 }
};

const KEY_DIRECTIONS: Record<string, Vec> = {
  ArrowUp: DIRECTIONS.up,
  w: DIRECTIONS.up,
  W: DIRECTIONS.up,
  ArrowDown: DIRECTIONS.down,
  s: DIRECTIONS.down,
  S: DIRECTIONS.down,
  ArrowLeft: DIRECTIONS.left,
  a: DIRECTIONS.left,
  A: DIRECTIONS.left,
  ArrowRight: DIRECTIONS.right,
  d: DIRECTIONS.right,
  D: DIRECTIONS.right
};

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
}

interface Floater {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
}

type Phase = 'idle' | 'play' | 'dying' | 'over';

const px = (cell: number) => cell * CELL + CELL / 2;

export function initSnakeGame(): void {
  // The root check keeps this init from grabbing another arcade page's
  // #game-canvas when the after-swap listener fires on a non-Snake page.
  const root = document.getElementById('snake-root');
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;
  if (!root || !canvas) return;
  // A ClientRouter swap brings a fresh, unwired root; the flag only blocks
  // re-entry on a root this module has already wired.
  if (root.dataset.gameWired) return;
  const context = canvas.getContext('2d');
  if (!context) return;
  const ctx: CanvasRenderingContext2D = context;
  // Stamped only once wiring is certain to proceed — a root marked wired on
  // a failed getContext would block the after-swap retry for good.
  root.dataset.gameWired = 'true';

  const el = (id: string) => document.getElementById(id) as HTMLElement;
  const overlay = el('game-overlay');
  const gameOverOverlay = el('game-over-overlay');
  const startBtn = el('start-btn');
  const restartBtn = el('restart-btn');
  const scoreEl = el('score');
  const highScoreEl = el('high-score');
  const finalScoreEl = el('final-score');

  canvas.width = WIDTH;
  canvas.height = HEIGHT;

  let state: SnakeState = createSnakeState();
  let prevSnake: Vec[] = state.snake.map(s => ({ ...s }));
  let phase: Phase = 'idle';
  let paused = false;
  let moveTimer = 0;
  let deathTimer = 0;
  let clock = 0;
  let shake = 0;
  let particles: Particle[] = [];
  let floaters: Floater[] = [];

  const syncHighScore = () => {
    highScoreEl.textContent = (board.top()?.score ?? 0).toString();
  };
  const board = initScoreboard(document.getElementById('highscores'), {
    onSave: syncHighScore
  });
  syncHighScore();

  // Upbeat, slithery chiptune loop in C major.
  const audio = createGameAudio({
    tempo: 132,
    wave: 'square',
    melody: [
      { freq: 523.25, beats: 0.5 },
      { freq: 659.25, beats: 0.5 },
      { freq: 783.99, beats: 0.5 },
      { freq: 659.25, beats: 0.5 },
      { freq: 587.33, beats: 0.5 },
      { freq: 698.46, beats: 0.5 },
      { freq: 880.0, beats: 0.5 },
      { freq: 0, beats: 0.5 }
    ]
  });
  wireSoundButton(document.getElementById('sound-btn'), audio);

  function burst(x: number, y: number, color: string, count: number) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 110;
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.45 + Math.random() * 0.3,
        maxLife: 0.75,
        color
      });
    }
  }

  function addFloater(x: number, y: number, text: string, color: string) {
    floaters.push({ x, y, text, color, life: 0.9 });
  }

  function startGame() {
    state = createSnakeState();
    prevSnake = state.snake.map(s => ({ ...s }));
    phase = 'play';
    paused = false;
    moveTimer = 0;
    particles = [];
    floaters = [];
    scoreEl.textContent = '0';
    overlay.style.display = 'none';
    gameOverOverlay.style.display = 'none';
    board.hide();
    audio.start();
  }

  function die() {
    phase = 'dying';
    deathTimer = 0;
    shake = 0.4;
    const head = state.snake[0];
    burst(px(head.x), px(head.y), '#f87171', 26);
    audio.playSfx('gameover');
    audio.stop();
  }

  function advance() {
    prevSnake = state.snake.map(s => ({ ...s }));
    const foodBefore = state.food;
    const event = step(state);
    const head = state.snake[0];
    if (event === 'died') {
      die();
    } else if (event === 'ate') {
      scoreEl.textContent = state.score.toString();
      audio.playSfx('score');
      burst(px(foodBefore.x), px(foodBefore.y), '#f87171', 10);
      addFloater(px(foodBefore.x), px(foodBefore.y) - 6, `+${FOOD_POINTS}`, '#4ade80');
    } else if (event === 'ate-bonus') {
      scoreEl.textContent = state.score.toString();
      audio.playSfx('score');
      burst(px(head.x), px(head.y), '#facc15', 18);
      addFloater(px(head.x), px(head.y) - 6, `+${BONUS_POINTS}`, '#facc15');
    }
  }

  function update(dt: number) {
    clock += dt;
    shake = Math.max(0, shake - dt);

    particles = particles.filter(p => {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 1 - 2.5 * dt;
      p.vy *= 1 - 2.5 * dt;
      return p.life > 0;
    });
    floaters = floaters.filter(f => {
      f.life -= dt;
      f.y -= 28 * dt;
      return f.life > 0;
    });

    if (phase === 'play' && !paused) {
      moveTimer += dt;
      const interval = stepInterval(state.foodsEaten);
      while (moveTimer >= interval && phase === 'play') {
        moveTimer -= interval;
        advance();
      }
    }

    if (phase === 'dying') {
      deathTimer += dt;
      if (deathTimer >= DEATH_DELAY) {
        phase = 'over';
        finalScoreEl.textContent = state.score.toString();
        gameOverOverlay.style.display = 'flex';
        board.show(state.score);
        // The table commits only when initials land, so show the fresh best
        // in the HUD ourselves meanwhile.
        highScoreEl.textContent = Math.max(board.top()?.score ?? 0, state.score).toString();
      }
    }
  }

  // --- Rendering ---

  function drawBoard() {
    ctx.fillStyle = '#101613';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.025)';
    for (let y = 0; y < ROWS; y++) {
      for (let x = (y % 2); x < COLS; x += 2) {
        ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
      }
    }
  }

  function drawApple(cx: number, cy: number) {
    const pulse = 1 + 0.07 * Math.sin(clock * 5);
    const r = (CELL / 2 - 3) * pulse;
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(cx, cy + 1, r, 0, Math.PI * 2);
    ctx.fill();
    // Leaf
    ctx.fillStyle = '#4ade80';
    ctx.beginPath();
    ctx.ellipse(cx + 2.5, cy - r, 3.5, 1.8, -0.6, 0, Math.PI * 2);
    ctx.fill();
    // Shine
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.beginPath();
    ctx.arc(cx - r * 0.35, cy - r * 0.3, r * 0.22, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawBonus(cx: number, cy: number, ticksLeft: number) {
    const pulse = 1 + 0.12 * Math.sin(clock * 7);
    const r = (CELL / 2 - 2) * pulse;
    // Timer ring counts down the bonus lifetime
    ctx.strokeStyle = 'rgba(250, 204, 21, 0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, CELL / 2 + 2, -Math.PI / 2, -Math.PI / 2 + (ticksLeft / BONUS_TICKS) * Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.beginPath();
    ctx.arc(cx - r * 0.3, cy - r * 0.3, r * 0.25, 0, Math.PI * 2);
    ctx.fill();
  }

  /** Interpolated pixel centre of segment i between the last two steps. */
  function segmentPos(i: number, t: number): { x: number; y: number } {
    const cur = state.snake[i];
    const prev = prevSnake[Math.min(i, prevSnake.length - 1)] ?? cur;
    return {
      x: px(prev.x) + (px(cur.x) - px(prev.x)) * t,
      y: px(prev.y) + (px(cur.y) - px(prev.y)) * t
    };
  }

  function drawSnake(t: number) {
    const points = state.snake.map((_, i) => segmentPos(i, t));
    const flash = phase === 'dying' && Math.floor(deathTimer * 12) % 2 === 0;

    if (points.length > 1) {
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
      ctx.strokeStyle = flash ? '#fca5a5' : '#15803d';
      ctx.lineWidth = CELL - 3;
      ctx.stroke();
      ctx.strokeStyle = flash ? '#fee2e2' : '#22c55e';
      ctx.lineWidth = CELL - 9;
      ctx.stroke();
    }

    // Head with direction-facing eyes
    const head = points[0];
    const heading = state.direction;
    ctx.fillStyle = flash ? '#fff' : '#4ade80';
    ctx.beginPath();
    ctx.arc(head.x, head.y, CELL / 2 - 1, 0, Math.PI * 2);
    ctx.fill();

    const side = { x: -heading.y, y: heading.x };
    const eyeForward = 3.5;
    const eyeSide = 4.5;
    ctx.fillStyle = '#052e16';
    for (const dir of [1, -1]) {
      ctx.beginPath();
      ctx.arc(
        head.x + heading.x * eyeForward + side.x * eyeSide * dir,
        head.y + heading.y * eyeForward + side.y * eyeSide * dir,
        2.4,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }
  }

  function render() {
    ctx.save();
    if (shake > 0) {
      ctx.translate((Math.random() - 0.5) * shake * 14, (Math.random() - 0.5) * shake * 14);
    }

    drawBoard();
    if (state.food.x >= 0) drawApple(px(state.food.x), px(state.food.y));
    if (state.bonus) drawBonus(px(state.bonus.pos.x), px(state.bonus.pos.y), state.bonus.ticksLeft);

    const interval = stepInterval(state.foodsEaten);
    const t = phase === 'play' && !paused ? Math.min(1, moveTimer / interval) : 1;
    drawSnake(t);

    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    ctx.font = 'bold 13px monospace';
    ctx.textAlign = 'center';
    for (const f of floaters) {
      ctx.globalAlpha = Math.max(0, Math.min(1, f.life / 0.4));
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;

    if (paused && phase === 'play') {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.fillRect(WIDTH / 2 - 14, HEIGHT / 2 - 18, 9, 36);
      ctx.fillRect(WIDTH / 2 + 5, HEIGHT / 2 - 18, 9, 36);
    }

    ctx.restore();
  }

  // --- Input wiring ---

  const gameKeys = new Set(Object.keys(KEY_DIRECTIONS));

  const onKeydown = (e: KeyboardEvent) => {
    if (gameKeys.has(e.key)) e.preventDefault();
    if (phase !== 'play') return;
    if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
      paused = !paused;
      return;
    }
    if (paused) return;
    const dir = KEY_DIRECTIONS[e.key];
    if (dir) queueDirection(state, dir);
  };
  document.addEventListener('keydown', onKeydown);
  // Document-level listeners outlive a ClientRouter swap; each wiring retires
  // its own handler so re-inits don't stack keyboard handlers forever.
  document.addEventListener(
    'astro:before-swap',
    () => document.removeEventListener('keydown', onKeydown),
    { once: true }
  );

  document.querySelectorAll<HTMLElement>('.control-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (phase !== 'play' || paused) return;
      const dir = btn.dataset.dir && DIRECTIONS[btn.dataset.dir];
      if (dir) queueDirection(state, dir);
    });
  });

  // Swipe controls; scrolling is suppressed on the board but not the overlays
  let touchStartX = 0;
  let touchStartY = 0;
  const gameArea = document.querySelector('.game-area');
  if (gameArea) {
    const onOverlay = (e: TouchEvent) =>
      e.target instanceof HTMLElement && !!e.target.closest('.game-overlay');

    gameArea.addEventListener(
      'touchstart',
      ev => {
        const e = ev as TouchEvent;
        if (onOverlay(e)) return;
        e.preventDefault();
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
      },
      { passive: false }
    );
    gameArea.addEventListener(
      'touchmove',
      ev => {
        if (!onOverlay(ev as TouchEvent)) ev.preventDefault();
      },
      { passive: false }
    );
    gameArea.addEventListener('touchend', ev => {
      const e = ev as TouchEvent;
      if (onOverlay(e) || phase !== 'play' || paused) return;
      e.preventDefault();
      const dx = e.changedTouches[0].clientX - touchStartX;
      const dy = e.changedTouches[0].clientY - touchStartY;
      if (Math.abs(dx) < 12 && Math.abs(dy) < 12) return;
      const dir =
        Math.abs(dx) > Math.abs(dy)
          ? dx > 0
            ? DIRECTIONS.right
            : DIRECTIONS.left
          : dy > 0
            ? DIRECTIONS.down
            : DIRECTIONS.up;
      queueDirection(state, dir);
    });
  }

  startBtn.addEventListener('click', startGame);
  restartBtn.addEventListener('click', startGame);

  createGameLoop(update, render).start();
}
