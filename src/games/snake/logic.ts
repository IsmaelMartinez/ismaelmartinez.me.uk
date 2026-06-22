/**
 * Snake rules, DOM-free. Classic grid snake: the board is COLS×ROWS cells,
 * the snake advances one cell per step, eats apples to grow, and dies on
 * walls or itself. Every few apples a timed bonus apple appears, Nokia-style.
 */

export const COLS = 20;
export const ROWS = 20;

export const FOOD_POINTS = 10;
export const BONUS_POINTS = 50;
/** A bonus apple appears after every N normal apples… */
export const BONUS_EVERY = 5;
/** …and stays on the board for this many snake steps. */
export const BONUS_TICKS = 30;

/** Seconds between steps: starts leisurely, tightens as you eat. */
export function stepInterval(foodsEaten: number): number {
  return Math.max(0.07, 0.16 - foodsEaten * 0.004);
}

export interface Vec {
  x: number;
  y: number;
}

export interface SnakeState {
  /** Head first. */
  snake: Vec[];
  direction: Vec;
  /** Buffered turns (max 2) so quick double-taps corner cleanly. */
  inputQueue: Vec[];
  food: Vec;
  bonus: { pos: Vec; ticksLeft: number } | null;
  foodsEaten: number;
  score: number;
  alive: boolean;
}

export type StepEvent = 'moved' | 'ate' | 'ate-bonus' | 'died';

function occupied(state: SnakeState, cell: Vec): boolean {
  if (state.snake.some(s => s.x === cell.x && s.y === cell.y)) return true;
  if (state.food.x === cell.x && state.food.y === cell.y) return true;
  if (state.bonus && state.bonus.pos.x === cell.x && state.bonus.pos.y === cell.y) return true;
  return false;
}

/** A uniformly random free cell, or null when the board is full. */
function freeCell(state: SnakeState, random: () => number): Vec | null {
  const free: Vec[] = [];
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (!occupied(state, { x, y })) free.push({ x, y });
    }
  }
  if (!free.length) return null;
  return free[Math.floor(random() * free.length)];
}

export function createSnakeState(random: () => number = Math.random): SnakeState {
  const state: SnakeState = {
    snake: [
      { x: 10, y: 10 },
      { x: 9, y: 10 },
      { x: 8, y: 10 }
    ],
    direction: { x: 1, y: 0 },
    inputQueue: [],
    food: { x: -1, y: -1 },
    bonus: null,
    foodsEaten: 0,
    score: 0,
    alive: true
  };
  state.food = freeCell(state, random) ?? { x: 15, y: 10 };
  return state;
}

/**
 * Buffers a turn. Reversals (relative to the last buffered direction, or the
 * current one) are ignored, as are duplicates and over-full queues.
 */
export function queueDirection(state: SnakeState, dir: Vec): void {
  const last = state.inputQueue[state.inputQueue.length - 1] ?? state.direction;
  if (dir.x === -last.x && dir.y === -last.y) return;
  if (dir.x === last.x && dir.y === last.y) return;
  if (state.inputQueue.length >= 2) return;
  state.inputQueue.push(dir);
}

/** Advances the snake one cell. */
export function step(state: SnakeState, random: () => number = Math.random): StepEvent {
  if (!state.alive) return 'died';

  const queued = state.inputQueue.shift();
  if (queued) state.direction = queued;

  const head = {
    x: state.snake[0].x + state.direction.x,
    y: state.snake[0].y + state.direction.y
  };

  if (head.x < 0 || head.x >= COLS || head.y < 0 || head.y >= ROWS) {
    state.alive = false;
    return 'died';
  }

  const ate = head.x === state.food.x && head.y === state.food.y;
  const ateBonus =
    !!state.bonus && head.x === state.bonus.pos.x && head.y === state.bonus.pos.y;

  // The tail cell is vacated this step, so moving into it is legal — unless
  // the snake is about to grow and the tail stays put.
  const body = ate ? state.snake : state.snake.slice(0, -1);
  if (body.some(s => s.x === head.x && s.y === head.y)) {
    state.alive = false;
    return 'died';
  }

  state.snake.unshift(head);
  if (!ate) state.snake.pop();

  if (state.bonus) {
    state.bonus.ticksLeft--;
    if (ateBonus) {
      state.score += BONUS_POINTS;
      state.bonus = null;
    } else if (state.bonus.ticksLeft <= 0) {
      state.bonus = null;
    }
  }

  if (ate) {
    state.score += FOOD_POINTS;
    state.foodsEaten++;
    state.food = freeCell(state, random) ?? { x: -1, y: -1 };
    if (state.foodsEaten % BONUS_EVERY === 0 && !state.bonus) {
      const pos = freeCell(state, random);
      if (pos) state.bonus = { pos, ticksLeft: BONUS_TICKS };
    }
    return 'ate';
  }

  return ateBonus ? 'ate-bonus' : 'moved';
}
