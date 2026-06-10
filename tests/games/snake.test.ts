import { describe, it, expect } from 'vitest';
import {
  COLS,
  ROWS,
  BONUS_EVERY,
  BONUS_TICKS,
  BONUS_POINTS,
  FOOD_POINTS,
  createSnakeState,
  queueDirection,
  step,
  stepInterval,
  type SnakeState
} from '../../src/games/snake/logic';

function seededRandom(seed = 42): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

/** Drops the food right in front of the head so the next step eats it. */
function placeFoodAhead(state: SnakeState) {
  state.food = {
    x: state.snake[0].x + state.direction.x,
    y: state.snake[0].y + state.direction.y
  };
}

describe('snake state', () => {
  it('starts alive, moving right, with food on a free cell', () => {
    const state = createSnakeState(seededRandom());
    expect(state.alive).toBe(true);
    expect(state.direction).toEqual({ x: 1, y: 0 });
    expect(state.snake).toHaveLength(3);
    expect(state.snake.some(s => s.x === state.food.x && s.y === state.food.y)).toBe(false);
  });

  it('moves one cell per step and keeps its length', () => {
    const state = createSnakeState(seededRandom());
    state.food = { x: 0, y: 0 };
    const headBefore = { ...state.snake[0] };
    expect(step(state, seededRandom())).toBe('moved');
    expect(state.snake[0]).toEqual({ x: headBefore.x + 1, y: headBefore.y });
    expect(state.snake).toHaveLength(3);
  });

  it('grows and scores when eating', () => {
    const state = createSnakeState(seededRandom());
    placeFoodAhead(state);
    expect(step(state, seededRandom())).toBe('ate');
    expect(state.snake).toHaveLength(4);
    expect(state.score).toBe(FOOD_POINTS);
    expect(state.foodsEaten).toBe(1);
  });

  it('respawns food on a free cell after eating', () => {
    const random = seededRandom(7);
    const state = createSnakeState(random);
    for (let i = 0; i < 10; i++) {
      placeFoodAhead(state);
      // Steer away from walls before each bite
      if (state.snake[0].x > COLS - 4) queueDirection(state, { x: 0, y: state.snake[0].y > ROWS / 2 ? -1 : 1 });
      step(state, random);
      if (!state.alive) break;
      expect(state.food.x).toBeGreaterThanOrEqual(0);
      expect(state.food.x).toBeLessThan(COLS);
      expect(state.snake.some(s => s.x === state.food.x && s.y === state.food.y)).toBe(false);
    }
  });

  it('dies on walls', () => {
    const state = createSnakeState(seededRandom());
    state.food = { x: 0, y: 0 };
    for (let i = 0; i < COLS; i++) step(state, seededRandom());
    expect(state.alive).toBe(false);
  });

  it('dies when running into its own body', () => {
    const state = createSnakeState(seededRandom());
    state.snake = [
      { x: 5, y: 5 },
      { x: 4, y: 5 },
      { x: 4, y: 6 },
      { x: 5, y: 6 },
      { x: 6, y: 6 }
    ];
    state.direction = { x: 1, y: 0 };
    state.food = { x: 0, y: 0 };
    queueDirection(state, { x: 0, y: 1 }); // turn down into the body at (5,6)
    expect(step(state, seededRandom())).toBe('died');
    expect(state.alive).toBe(false);
  });

  it('allows moving into the cell the tail is vacating', () => {
    // 2×2 loop: head chases its own tail, which is legal in classic snake
    const state = createSnakeState(seededRandom());
    state.snake = [
      { x: 5, y: 5 },
      { x: 6, y: 5 },
      { x: 6, y: 6 },
      { x: 5, y: 6 }
    ];
    state.direction = { x: 0, y: 1 };
    state.food = { x: 0, y: 0 };
    expect(step(state, seededRandom())).toBe('moved');
    expect(state.alive).toBe(true);
  });
});

describe('input queue', () => {
  it('ignores reversals', () => {
    const state = createSnakeState(seededRandom());
    queueDirection(state, { x: -1, y: 0 });
    expect(state.inputQueue).toHaveLength(0);
  });

  it('ignores reversals against an already-queued turn', () => {
    const state = createSnakeState(seededRandom());
    queueDirection(state, { x: 0, y: -1 });
    queueDirection(state, { x: 0, y: 1 });
    expect(state.inputQueue).toEqual([{ x: 0, y: -1 }]);
  });

  it('buffers two turns so quick corners work', () => {
    const state = createSnakeState(seededRandom());
    state.food = { x: 0, y: 0 };
    queueDirection(state, { x: 0, y: -1 });
    queueDirection(state, { x: -1, y: 0 });
    queueDirection(state, { x: 0, y: 1 }); // third is dropped
    expect(state.inputQueue).toHaveLength(2);
    step(state, seededRandom());
    expect(state.direction).toEqual({ x: 0, y: -1 });
    step(state, seededRandom());
    expect(state.direction).toEqual({ x: -1, y: 0 });
  });
});

describe('bonus apples', () => {
  function eat(state: SnakeState, random: () => number) {
    placeFoodAhead(state);
    // Zig-zag within the board so the test snake never hits a wall
    if (state.snake[0].x >= COLS - 3) {
      queueDirection(state, { x: 0, y: 1 });
      step(state, random);
      queueDirection(state, { x: -1, y: 0 });
      placeFoodAhead(state);
    }
    step(state, random);
  }

  it('spawns a timed bonus after every few apples', () => {
    const random = seededRandom(3);
    const state = createSnakeState(random);
    for (let i = 0; i < BONUS_EVERY; i++) eat(state, random);
    expect(state.alive).toBe(true);
    expect(state.bonus).not.toBeNull();
    expect(state.bonus!.ticksLeft).toBe(BONUS_TICKS);
  });

  it('expires the bonus after its ticks run out', () => {
    const random = seededRandom(3);
    const state = createSnakeState(random);
    for (let i = 0; i < BONUS_EVERY; i++) eat(state, random);
    state.bonus!.pos = { x: 0, y: 0 };
    state.food = { x: 0, y: 1 };
    // March in place (down/up the same column is impossible; circle instead)
    for (let i = 0; i < BONUS_TICKS + 4 && state.alive; i++) {
      const head = state.snake[0];
      if (head.x >= COLS - 2 && state.direction.x === 1) queueDirection(state, { x: 0, y: 1 });
      else if (head.y >= ROWS - 2 && state.direction.y === 1) queueDirection(state, { x: -1, y: 0 });
      else if (head.x <= 1 && state.direction.x === -1) queueDirection(state, { x: 0, y: -1 });
      else if (head.y <= 1 && state.direction.y === -1) queueDirection(state, { x: 1, y: 0 });
      step(state, random);
    }
    expect(state.alive).toBe(true);
    expect(state.bonus).toBeNull();
  });

  it('awards bonus points when collected', () => {
    const random = seededRandom(3);
    const state = createSnakeState(random);
    for (let i = 0; i < BONUS_EVERY; i++) eat(state, random);
    const scoreBefore = state.score;
    state.bonus!.pos = {
      x: state.snake[0].x + state.direction.x,
      y: state.snake[0].y + state.direction.y
    };
    state.food = { x: 0, y: 0 };
    expect(step(state, random)).toBe('ate-bonus');
    expect(state.score).toBe(scoreBefore + BONUS_POINTS);
    expect(state.bonus).toBeNull();
  });
});

describe('pacing', () => {
  it('speeds up with food but never below the floor', () => {
    expect(stepInterval(0)).toBeGreaterThan(stepInterval(10));
    expect(stepInterval(1000)).toBe(0.07);
  });
});
