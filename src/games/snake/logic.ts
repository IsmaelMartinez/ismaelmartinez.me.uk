/**
 * Snake rules, DOM-free. Classic grid snake: the board is COLS×ROWS cells,
 * the snake advances one cell per step, eats apples to grow, and dies on the
 * edges, on a wall, or on itself. Every few apples a timed bonus apple
 * appears, Nokia-style, and every ARENA_EVERY apples the board itself closes
 * in another rung of the arena ladder.
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

/** Flat board index of a cell (index = y * COLS + x). */
export const cellIndex = (x: number, y: number): number => y * COLS + x;

/** The cells of a w×h block with its top-left corner at (x, y). */
function block(x: number, y: number, w: number, h: number): number[] {
  const cells: number[] = [];
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) cells.push(cellIndex(x + dx, y + dy));
  }
  return cells;
}

/** Apples between rungs of the arena ladder. */
export const ARENA_EVERY = 8;

/**
 * The walls each rung of the ladder *adds*. Rung 0 is the empty board every
 * run opens on, so a run's first stretch is the game Snake has always been;
 * later rungs only ever add, so the garden closes in and never re-opens. The
 * last rung lands at 32 apples, well past the point `stepInterval` reaches
 * its floor (22), which is where a run used to stop offering anything new.
 *
 * Authored light on purpose — short bars and posts, never a maze. Every rung
 * leaves the free cells mutually reachable; the test suite proves it rather
 * than trusting the eye.
 */
export const ARENA_WALLS: readonly (readonly number[])[] = [
  [],
  // Four corner posts.
  [
    ...block(4, 4, 2, 2),
    ...block(14, 4, 2, 2),
    ...block(4, 14, 2, 2),
    ...block(14, 14, 2, 2)
  ],
  // Lintels across the top and bottom approaches.
  [...block(8, 2, 4, 1), ...block(8, 17, 4, 1)],
  // Jambs down the left and right approaches.
  [...block(2, 8, 1, 4), ...block(17, 8, 1, 4)],
  // Four elbows crowding the centre, one gap per side.
  [
    ...block(7, 7, 2, 1),
    ...block(7, 8, 1, 1),
    ...block(11, 7, 2, 1),
    ...block(12, 8, 1, 1),
    ...block(7, 11, 1, 1),
    ...block(7, 12, 2, 1),
    ...block(12, 11, 1, 1),
    ...block(11, 12, 2, 1)
  ]
];

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
  /** Rung of the arena ladder the board has reached (index into ARENA_WALLS). */
  arena: number;
  /** Solid cells. The head dies on one. */
  walls: Set<number>;
  /**
   * Cells the ladder has claimed but that were still occupied when the rung
   * arrived. They stay passable and turn solid the moment they are vacated,
   * so a wall never materialises underneath the snake — the player watches
   * them close in instead of dying to geometry that appeared out of nowhere.
   */
  pendingWalls: Set<number>;
}

export type StepEvent = 'moved' | 'ate' | 'ate-bonus' | 'died';

function occupied(state: SnakeState, cell: Vec): boolean {
  const i = cellIndex(cell.x, cell.y);
  if (state.walls.has(i) || state.pendingWalls.has(i)) return true;
  if (state.snake.some(s => s.x === cell.x && s.y === cell.y)) return true;
  if (state.food.x === cell.x && state.food.y === cell.y) return true;
  if (state.bonus && state.bonus.pos.x === cell.x && state.bonus.pos.y === cell.y) return true;
  return false;
}

/** True while something still stands on the cell, so a claimed wall waits. */
function standingOn(state: SnakeState, i: number): boolean {
  if (state.snake.some(s => cellIndex(s.x, s.y) === i)) return true;
  if (cellIndex(state.food.x, state.food.y) === i) return true;
  if (state.bonus && cellIndex(state.bonus.pos.x, state.bonus.pos.y) === i) return true;
  return false;
}

/** Claims the walls of every rung the apple count has now reached. */
function advanceArena(state: SnakeState): void {
  const rung = Math.min(
    Math.floor(state.foodsEaten / ARENA_EVERY),
    ARENA_WALLS.length - 1
  );
  while (state.arena < rung) {
    state.arena++;
    for (const i of ARENA_WALLS[state.arena]) {
      if (state.walls.has(i)) continue;
      if (standingOn(state, i)) state.pendingWalls.add(i);
      else state.walls.add(i);
    }
  }
}

/** Turns claimed cells solid once whatever stood on them has moved off. */
function settleWalls(state: SnakeState): void {
  for (const i of state.pendingWalls) {
    if (standingOn(state, i)) continue;
    state.pendingWalls.delete(i);
    state.walls.add(i);
  }
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
    alive: true,
    arena: 0,
    walls: new Set<number>(),
    pendingWalls: new Set<number>()
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

  if (state.walls.has(cellIndex(head.x, head.y))) {
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

  let event: StepEvent = ateBonus ? 'ate-bonus' : 'moved';
  if (ate) {
    state.score += FOOD_POINTS;
    state.foodsEaten++;
    // The ladder claims its cells before anything respawns, so a fresh apple
    // or bonus can never land where a wall is about to stand.
    advanceArena(state);
    state.food = freeCell(state, random) ?? { x: -1, y: -1 };
    if (state.foodsEaten % BONUS_EVERY === 0 && !state.bonus) {
      const pos = freeCell(state, random);
      if (pos) state.bonus = { pos, ticksLeft: BONUS_TICKS };
    }
    event = 'ate';
  }

  settleWalls(state);
  return event;
}
