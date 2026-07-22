/**
 * Snake — classic grid snake with smooth, interpolated movement.
 *
 * Pure rules live in logic.ts; this module owns DOM wiring, the fixed-step
 * loop, and canvas rendering. It expects the markup defined in
 * src/pages/[lang]/fun/snake.astro.
 */
import {
  createGameLoop,
  createStaticLayer,
  initScoreboard,
  setupHiDpiCanvas,
  createGameAudio,
  wireSoundButton,
  createEffects,
  hash01,
  shadeColor
} from '../engine';
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

  // The board (base fill, checkerboard, vignette) never changes, so it's
  // baked once per DPR change instead of re-filling the checker pattern and
  // a full-canvas radial gradient every frame.
  const boardLayer = createStaticLayer(WIDTH, HEIGHT, paintBoard);
  setupHiDpiCanvas(canvas, ctx, WIDTH, HEIGHT, { onApply: boardLayer.rebuild });

  let state: SnakeState = createSnakeState();
  let prevSnake: Vec[] = state.snake.map(s => ({ ...s }));
  let phase: Phase = 'idle';
  let paused = false;
  let moveTimer = 0;
  let deathTimer = 0;
  let clock = 0;
  let shake = 0;
  const fx = createEffects({
    floaterSize: 13,
    floaterRise: 28,
    floaterLife: 0.9
  });

  const syncHighScore = () => {
    highScoreEl.textContent = board.best().toString();
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
    // Snake's pops predate the shared radial burst: uniform 40–150 px/s
    // speeds, jittered lifetimes, drag instead of gravity, round dots —
    // the spawn math stays local and hands finished particles to emit().
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 110;
      fx.emit({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.45 + Math.random() * 0.3,
        maxLife: 0.75,
        color,
        size: 2.5,
        drag: 2.5,
        shape: 'circle'
      });
    }
  }

  const addFloater = fx.floater;

  function startGame() {
    state = createSnakeState();
    prevSnake = state.snake.map(s => ({ ...s }));
    phase = 'play';
    paused = false;
    moveTimer = 0;
    fx.clear();
    scoreEl.textContent = '0';
    overlay.style.display = 'none';
    gameOverOverlay.style.display = 'none';
    board.hide();
    // Snake ignores bank()'s newRecord (no record toast here), but the
    // per-run baseline still has to reset for its stash gate to work.
    board.beginRun();
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

    fx.update(dt);

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
        // The table commits only when initials land, so bank the score and
        // show the fresh best in the HUD ourselves meanwhile.
        const { best } = board.bank(state.score);
        board.show(state.score);
        highScoreEl.textContent = best.toString();
      }
    }
  }

  // --- Rendering ---

  function paintBoard(target: CanvasRenderingContext2D) {
    target.fillStyle = '#101613';
    target.fillRect(0, 0, WIDTH, HEIGHT);
    target.fillStyle = 'rgba(255, 255, 255, 0.025)';
    for (let y = 0; y < ROWS; y++) {
      for (let x = (y % 2); x < COLS; x += 2) {
        target.fillRect(x * CELL, y * CELL, CELL, CELL);
      }
    }
    // Mossy vignette pulls the eye to the centre of the garden.
    const vignette = target.createRadialGradient(
      WIDTH / 2, HEIGHT / 2, HEIGHT * 0.42,
      WIDTH / 2, HEIGHT / 2, HEIGHT * 0.85
    );
    vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vignette.addColorStop(1, 'rgba(2, 12, 6, 0.5)');
    target.fillStyle = vignette;
    target.fillRect(0, 0, WIDTH, HEIGHT);
  }


  /** Soft contact shadow under round pieces (apple, bonus, snake head). */
  function drawShadow(cx: number, cy: number, r: number) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + r * 0.75, r * 0.85, r * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // A short red palette so consecutive apples aren't stamped copies; the pick
  // is hashed off the fruit's board cell, so it's stable while the apple sits.
  const APPLE_REDS = ['#ef4444', '#e23a3a', '#f75555'];

  // Precomputed scale-dot shades (0.40–0.72 alpha) so the hashed per-segment
  // pick is an array index, not a per-frame string build.
  const SCALE_SHADES = [
    'rgba(6, 78, 59, 0.40)',
    'rgba(6, 78, 59, 0.48)',
    'rgba(6, 78, 59, 0.56)',
    'rgba(6, 78, 59, 0.64)',
    'rgba(6, 78, 59, 0.72)'
  ];

  function drawApple(cx: number, cy: number, seed: number) {
    const pulse = 1 + 0.07 * Math.sin(clock * 5);
    const r = (CELL / 2 - 3) * pulse;
    drawShadow(cx, cy, r + 2);
    const body = APPLE_REDS[Math.floor(hash01(seed, 1) * APPLE_REDS.length)];
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(cx, cy + 1, r, 0, Math.PI * 2);
    ctx.fill();
    // Dark grounding rim across the lower belly, for outline discipline.
    ctx.strokeStyle = shadeColor(body, 0.55);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy + 1, r - 0.75, 0.16 * Math.PI, 0.84 * Math.PI);
    ctx.stroke();
    // Leaf — hashed side and angle.
    const side = hash01(seed, 2) < 0.5 ? 1 : -1;
    const leafAngle = -0.6 * side + (hash01(seed, 4) - 0.5) * 0.5;
    ctx.fillStyle = '#4ade80';
    ctx.beginPath();
    ctx.ellipse(cx + 2.5 * side, cy - r, 3.5, 1.8, leafAngle, 0, Math.PI * 2);
    ctx.fill();
    // Shine — a main highlight plus a hashed second speck on some apples.
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.beginPath();
    ctx.arc(cx - r * 0.35, cy - r * 0.3, r * 0.22, 0, Math.PI * 2);
    ctx.fill();
    if (hash01(seed, 3) < 0.5) {
      ctx.beginPath();
      ctx.arc(cx + r * 0.22, cy - r * 0.42, r * 0.12, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawBonus(cx: number, cy: number, ticksLeft: number, seed: number) {
    const pulse = 1 + 0.12 * Math.sin(clock * 7);
    const r = (CELL / 2 - 2) * pulse;
    drawShadow(cx, cy, r + 1);
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
    // Dark grounding rim on the lower belly.
    ctx.strokeStyle = shadeColor('#facc15', 0.6);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, r - 0.75, 0.16 * Math.PI, 0.84 * Math.PI);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.beginPath();
    ctx.arc(cx - r * 0.3, cy - r * 0.3, r * 0.25, 0, Math.PI * 2);
    ctx.fill();
    // Hashed sparkle specks so each bonus twinkles differently.
    const sparkles = 2 + Math.floor(hash01(seed, 5) * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
    for (let k = 0; k < sparkles; k++) {
      const a = hash01(seed, k + 6) * Math.PI * 2;
      const rr = r * (0.35 + hash01(seed, k + 9) * 0.4);
      ctx.fillRect(cx + Math.cos(a) * rr - 0.5, cy + Math.sin(a) * rr - 0.5, 1, 1);
    }
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
      // Build the tube centreline once, then re-stroke it at each width — the
      // path persists across stroke() calls, so a long snake doesn't pay to
      // rebuild the polyline per layer.
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
      if (flash) {
        ctx.strokeStyle = '#fca5a5';
        ctx.lineWidth = CELL - 3;
        ctx.stroke();
        ctx.strokeStyle = '#fee2e2';
        ctx.lineWidth = CELL - 9;
        ctx.stroke();
      } else {
        // A dark→mid→lit width ramp: a grounding outline edge, the body, and a
        // lit core, so the tube reads with value contrast instead of two flats.
        ctx.strokeStyle = '#052e16';
        ctx.lineWidth = CELL - 1;
        ctx.stroke();
        ctx.strokeStyle = '#166534';
        ctx.lineWidth = CELL - 3;
        ctx.stroke();
        ctx.strokeStyle = '#22c55e';
        ctx.lineWidth = CELL - 8;
        ctx.stroke();
        // Scale banding: a chevron dot on every other segment, its shade hashed
        // off the head-distance index so the scales vary yet stay stable per
        // body position (anchored to the head, not crawling).
        for (let i = 2; i < points.length; i += 2) {
          ctx.fillStyle = SCALE_SHADES[Math.floor(hash01(i, 3) * SCALE_SHADES.length)];
          ctx.beginPath();
          ctx.arc(points[i].x, points[i].y, CELL / 2 - 7, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // Head with direction-facing eyes
    const head = points[0];
    const heading = state.direction;
    ctx.fillStyle = flash ? '#fff' : '#4ade80';
    ctx.beginPath();
    ctx.arc(head.x, head.y, CELL / 2 - 1, 0, Math.PI * 2);
    ctx.fill();
    if (!flash) {
      // Dark grounding ring + a crown highlight so the head sits proud of the
      // body instead of merging into the tube.
      ctx.strokeStyle = '#052e16';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(head.x, head.y, CELL / 2 - 1.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
      ctx.beginPath();
      ctx.arc(head.x - heading.x * 2, head.y - heading.y * 2 - 2, CELL / 2 - 5, 0, Math.PI * 2);
      ctx.fill();
    }

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
      // Whole-pixel jitter keeps the board blit on the device-pixel grid —
      // a fractional offset would bilinear-blur the baked layer.
      ctx.translate(
        Math.round((Math.random() - 0.5) * shake * 14),
        Math.round((Math.random() - 0.5) * shake * 14)
      );
    }

    boardLayer.draw(ctx);
    if (state.food.x >= 0) {
      drawApple(px(state.food.x), px(state.food.y), state.food.x * COLS + state.food.y);
    }
    if (state.bonus) {
      const { pos, ticksLeft } = state.bonus;
      drawBonus(px(pos.x), px(pos.y), ticksLeft, pos.x * COLS + pos.y);
    }

    const interval = stepInterval(state.foodsEaten);
    const t = phase === 'play' && !paused ? Math.min(1, moveTimer / interval) : 1;
    drawSnake(t);

    ctx.textAlign = 'center';
    fx.draw(ctx);

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
