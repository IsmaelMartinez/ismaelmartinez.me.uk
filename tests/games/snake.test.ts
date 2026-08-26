import { describe, it, expect } from 'vitest';
import {
  COLS,
  ROWS,
  ARENA_EVERY,
  ARENA_WALLS,
  BONUS_EVERY,
  BONUS_TICKS,
  BONUS_POINTS,
  FOOD_POINTS,
  cellIndex,
  createSnakeState,
  queueDirection,
  step,
  stepInterval,
  WALL_GRACE_STEPS,
  type SnakeState,
  type StepEvent,
  type Vec
} from '../../src/games/snake/logic';
import { bfsFrom } from '../../src/games/engine/pathfind';
import { seededRandom } from './seeded-random';
import { meanT } from './paired-stats';

/** Drops the food right in front of the head so the next step eats it. */
function placeFoodAhead(state: SnakeState) {
  state.food = {
    x: state.snake[0].x + state.direction.x,
    y: state.snake[0].y + state.direction.y
  };
}

const TURNS: Vec[] = [
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 0, y: -1 }
];

/**
 * Eats one apple, steering to any legal cell and preferring straight on. The
 * apple is dropped exactly where the head is about to land, so every call
 * consumes one — which is what lets a test walk the arena ladder by eating.
 * Legality checks the whole snake, not the body-minus-tail the rules allow,
 * because an eating step never vacates its tail.
 */
function eatSafely(state: SnakeState, random: () => number): StepEvent {
  const legal = (d: Vec) => {
    const x = state.snake[0].x + d.x;
    const y = state.snake[0].y + d.y;
    if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return false;
    if (state.walls.has(cellIndex(x, y))) return false;
    return !state.snake.some(s => s.x === x && s.y === y);
  };
  const dir = [state.direction, ...TURNS].find(legal) ?? state.direction;
  state.food = { x: state.snake[0].x + dir.x, y: state.snake[0].y + dir.y };
  queueDirection(state, dir);
  return step(state, random);
}

/**
 * True when the head may move `d` this step: on the board, off the walls, and
 * clear of the body the tail is about to vacate. `ignoreWalls` lets a caller
 * ask the counterfactual — what would have been legal without those walls.
 */
function legalStep(state: SnakeState, d: Vec, ignoreWalls?: Set<number>): boolean {
  const x = state.snake[0].x + d.x;
  const y = state.snake[0].y + d.y;
  if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return false;
  const i = cellIndex(x, y);
  if (state.walls.has(i) && !ignoreWalls?.has(i)) return false;
  return !state.snake.slice(0, -1).some(s => s.x === x && s.y === y);
}

/**
 * Mirror of the rules' own `standingOn`: true while the snake, the apple or
 * the bonus sits on the cell. That is exactly the condition under which a
 * claimed cell's countdown restarts, so a test that tracks how long a ghost has
 * been *visible warning* has to restart on the same condition.
 */
function occupiedCell(state: SnakeState, i: number): boolean {
  if (state.snake.some(s => cellIndex(s.x, s.y) === i)) return true;
  if (cellIndex(state.food.x, state.food.y) === i) return true;
  if (state.bonus && cellIndex(state.bonus.pos.x, state.bonus.pos.y) === i) return true;
  return false;
}

/**
 * A novice's play: head for the apple, take any legal cell when that is
 * blocked, and dither one turn in twenty. Deliberately not a solver — the
 * point is to generate the ordinary mid-board traffic that walks into rungs.
 *
 * It does heed the one thing the game asks of a player: it stays off a
 * ghosting cell, and off any cell whose every way out is wall or ghost, when
 * it has somewhere else to go. The whole contract of the grace is that the
 * warning buys agency, so a run played by an actor that ignores every warning
 * would only ever prove the actor careless — the test below asserts that the
 * closing geometry cannot strand a player who *does* read it.
 */
function playNovice(state: SnakeState, random: () => number): void {
  const head = state.snake[0];
  const dx = state.food.x - head.x;
  const dy = state.food.y - head.y;
  const toward: Vec[] = [];
  if (dx) toward.push({ x: Math.sign(dx), y: 0 });
  if (dy) toward.push({ x: 0, y: Math.sign(dy) });
  if (Math.abs(dy) > Math.abs(dx)) toward.reverse();
  const options = [...toward, ...TURNS].filter(
    d => legalStep(state, d) && !(d.x === -state.direction.x && d.y === -state.direction.y)
  );
  /** True when the cell is somewhere the snake could still be next step. */
  const open = (x: number, y: number, body: Vec[]) => {
    if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return false;
    const i = cellIndex(x, y);
    if (state.walls.has(i) || state.pendingWalls.has(i)) return false;
    return !body.some(s => s.x === x && s.y === y);
  };
  const clear = options.filter(d => open(head.x + d.x, head.y + d.y, state.snake.slice(0, -1)));
  const pick =
    clear.find(d => {
      const c = { x: head.x + d.x, y: head.y + d.y };
      const body = state.snake.slice(0, -2);
      return TURNS.some(n => open(c.x + n.x, c.y + n.y, body));
    }) ??
    clear[0] ??
    options[0];
  if (pick && random() > 0.05) queueDirection(state, pick);
}

/** Fast-forwards the apple count so the next eat lands on `rung`. */
function primeRung(state: SnakeState, rung: number, random: () => number) {
  state.foodsEaten = rung * ARENA_EVERY - 1;
  placeFoodAhead(state);
  step(state, random);
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

  /*
   * The board's widest Manhattan span is 38 cells and the bonus only lives for
   * BONUS_TICKS, so a uniform pick over every free cell dangled a prize the
   * snake could not physically reach on about one spawn in a hundred (issue
   * #271). The bound is `<=`, not `<`: `step` checks the eat before it spends
   * the tick, so a bonus exactly BONUS_TICKS away is still edible.
   */
  it('never spawns a bonus further away than its clock allows', () => {
    let spawns = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const random = seededRandom(seed);
      const state = createSnakeState(random);
      for (let n = 0; n < BONUS_EVERY * 8 && state.alive; n++) {
        eatSafely(state, random);
        // A bonus on full ticks is one this step just placed; anything older
        // has been counted down at least once.
        if (!state.bonus || state.bonus.ticksLeft !== BONUS_TICKS) continue;
        spawns++;
        const head = state.snake[0];
        const distance =
          Math.abs(state.bonus.pos.x - head.x) + Math.abs(state.bonus.pos.y - head.y);
        expect(distance).toBeLessThanOrEqual(BONUS_TICKS);
        // Clearing it re-arms the spawn: this test eats an apple every step,
        // so a bonus left standing would block every later spawn on its clock.
        state.bonus = null;
      }
    }
    // Guards the assertion above against passing on an empty loop.
    expect(spawns).toBeGreaterThan(20);
  });

  it('still places a bonus when nothing at all is within reach', () => {
    const random = seededRandom(9);
    const state = createSnakeState(random);
    // Corner the snake, then wall off every cell the clock could reach from
    // where the head is about to land. The only free cells left are far ones,
    // and a distant bonus still beats no bonus at all.
    state.snake = [
      { x: 0, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: 2 }
    ];
    state.direction = { x: 1, y: 0 };
    state.foodsEaten = BONUS_EVERY - 1;
    state.food = { x: 1, y: 0 };
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (Math.abs(x - 1) + y > BONUS_TICKS) continue;
        if (x === 1 && y === 0) continue;
        if (state.snake.some(sq => sq.x === x && sq.y === y)) continue;
        state.walls.add(cellIndex(x, y));
      }
    }

    expect(step(state, random)).toBe('ate');
    expect(state.bonus).not.toBeNull();
    const head = state.snake[0];
    expect(Math.abs(state.bonus!.pos.x - head.x) + Math.abs(state.bonus!.pos.y - head.y))
      .toBeGreaterThan(BONUS_TICKS);
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

describe('the arena ladder', () => {
  it('opens on the empty board every run', () => {
    const state = createSnakeState(seededRandom());
    expect(state.arena).toBe(0);
    expect(state.walls.size).toBe(0);
    expect(state.pendingWalls.size).toBe(0);
    expect(ARENA_WALLS[0]).toHaveLength(0);
  });

  it('never seals the board: every rung leaves the free cells connected', () => {
    // Authoring proof. Walls only ever accumulate, so each rung is checked
    // against everything standing by the time it lands.
    const walls = new Set<number>();
    for (let rung = 0; rung < ARENA_WALLS.length; rung++) {
      for (const i of ARENA_WALLS[rung]) walls.add(i);
      const free: number[] = [];
      for (let i = 0; i < COLS * ROWS; i++) {
        if (!walls.has(i)) free.push(i);
      }
      const { dist } = bfsFrom(COLS, ROWS, i => !walls.has(i), free[0]);
      const stranded = free.filter(i => dist[i] === -1);
      expect(stranded).toEqual([]);
    }
  });

  it('advances a rung every ARENA_EVERY apples and stops at the last one', () => {
    const random = seededRandom(4);
    const state = createSnakeState(random);
    for (let rung = 1; rung < ARENA_WALLS.length; rung++) {
      state.foodsEaten = rung * ARENA_EVERY - 1;
      expect(state.arena).toBe(rung - 1);
      expect(eatSafely(state, random)).toBe('ate');
      expect(state.arena).toBe(rung);
    }
    // Past the top of the ladder the board holds.
    state.foodsEaten = 200;
    eatSafely(state, random);
    expect(state.arena).toBe(ARENA_WALLS.length - 1);
  });

  it('kills a head that runs into a wall', () => {
    const state = createSnakeState(seededRandom());
    const head = state.snake[0];
    state.walls.add(cellIndex(head.x + 1, head.y));
    state.food = { x: 0, y: 0 };
    expect(step(state, seededRandom())).toBe('died');
    expect(state.alive).toBe(false);
  });

  it('never drops a wall onto the snake: claimed cells wait to be vacated', () => {
    const random = seededRandom(11);
    const state = createSnakeState(random);
    // Park the snake across three of the first rung's corner-post cells,
    // heading out of the post along row 5.
    state.snake = [
      { x: 5, y: 5 },
      { x: 4, y: 5 },
      { x: 4, y: 4 }
    ];
    state.direction = { x: 1, y: 0 };
    state.foodsEaten = ARENA_EVERY - 1;
    state.food = { x: 6, y: 5 };
    expect(step(state, random)).toBe('ate');

    const under = [cellIndex(4, 4), cellIndex(4, 5), cellIndex(5, 5)];
    const clear = cellIndex(5, 4);
    expect(state.arena).toBe(1);
    expect(state.alive).toBe(true);
    // Nothing sets on the step the rung lands — the cell under the snake and
    // the free fourth cell of the post both start as ghosts.
    for (const i of [...under, clear]) {
      expect(state.pendingWalls.get(i)).toBe(WALL_GRACE_STEPS);
      expect(state.walls.has(i)).toBe(false);
    }

    // Walking away, the free cell sets as soon as its grace runs out; the
    // cells under the snake wait to be vacated and then serve their own.
    for (let n = 0; n < WALL_GRACE_STEPS; n++) {
      state.food = { x: 0, y: 0 };
      expect(step(state, random)).toBe('moved');
    }
    expect(state.walls.has(clear)).toBe(true);
    expect(state.pendingWalls.has(cellIndex(5, 5))).toBe(true);

    for (let n = 0; n < under.length; n++) {
      state.food = { x: 0, y: 0 };
      expect(step(state, random)).toBe('moved');
    }
    expect(state.alive).toBe(true);
    expect(state.pendingWalls.size).toBe(0);
    for (const i of under) expect(state.walls.has(i)).toBe(true);
  });

  it('never spawns an apple or a bonus on a wall, even on the full board', () => {
    const random = seededRandom(23);
    const state = createSnakeState(random);
    primeRung(state, ARENA_WALLS.length - 1, random);
    expect(state.arena).toBe(ARENA_WALLS.length - 1);
    expect(state.pendingWalls.size).toBeGreaterThan(0);

    for (let n = 0; n < 15; n++) {
      expect(eatSafely(state, random)).toBe('ate');
      expect(state.alive).toBe(true);
      const food = cellIndex(state.food.x, state.food.y);
      expect(state.walls.has(food)).toBe(false);
      expect(state.pendingWalls.has(food)).toBe(false);
      if (state.bonus) {
        const bonus = cellIndex(state.bonus.pos.x, state.bonus.pos.y);
        expect(state.walls.has(bonus)).toBe(false);
        expect(state.pendingWalls.has(bonus)).toBe(false);
      }
    }
    // The ghosts of that last rung have had every step of the loop to set.
    expect(state.walls.size).toBeGreaterThan(0);
  });

  it('leaves no dead ends and no sealed pockets at any cumulative rung', () => {
    // The other half of the authoring proof above: not only is every free cell
    // reachable, none of them is a cul-de-sac the snake can enter and not
    // leave. Cheap to state, and it is what makes the ladder survivable.
    const walls = new Set<number>();
    for (let rung = 0; rung < ARENA_WALLS.length; rung++) {
      for (const i of ARENA_WALLS[rung]) walls.add(i);
      const deadEnds: number[] = [];
      for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
          const i = cellIndex(x, y);
          if (walls.has(i)) continue;
          const exits = TURNS.filter(d => {
            const nx = x + d.x;
            const ny = y + d.y;
            if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) return false;
            return !walls.has(cellIndex(nx, ny));
          });
          if (exits.length < 2) deadEnds.push(i);
        }
      }
      expect(deadEnds).toEqual([]);
    }
  });
});

/**
 * Regression cover for #259: the ladder used to turn a claimed cell solid on
 * the spot whenever nothing stood on it, which could put a fresh wall in the
 * cell the head was one step from entering — 2.8% of rung transitions across
 * the August 2026 audit, and 0.04% of them with no legal move left at all.
 */
describe('the arena ladder gives warning before a wall sets', () => {
  it('ghosts the cell straight ahead rather than sealing it (issue #259 repro)', () => {
    const random = seededRandom(11);
    const state = createSnakeState(random);
    // The issue's deterministic case: the snake runs along row 4 into the
    // first rung's top-left corner post, and eats the apple that lands it.
    state.snake = [
      { x: 2, y: 4 },
      { x: 1, y: 4 },
      { x: 0, y: 4 }
    ];
    state.direction = { x: 1, y: 0 };
    state.foodsEaten = ARENA_EVERY - 1;
    state.food = { x: 3, y: 4 };
    expect(step(state, random)).toBe('ate');
    expect(state.arena).toBe(1);

    // (4,4) is the very next cell the head enters. It belongs to the rung, so
    // it is claimed — but as a ghost, not as geometry that kills the moment it
    // appears. It may still set there later, once its grace has run.
    const ahead = cellIndex(4, 4);
    expect(ARENA_WALLS[1]).toContain(ahead);
    expect(state.walls.has(ahead)).toBe(false);
    expect(state.pendingWalls.get(ahead)).toBe(WALL_GRACE_STEPS);

    // Before the fix this step was the death. Now the player crosses the ghost
    // and has WALL_GRACE_STEPS of it to steer away.
    state.food = { x: 0, y: 0 };
    expect(step(state, random)).toBe('moved');
    expect(state.alive).toBe(true);
    expect(state.snake[0]).toEqual({ x: 4, y: 4 });
  });

  it('never sets a wall without the full grace, nor seals the head in', () => {
    let rungs = 0;
    let steps = 0;
    /** Steps on which at least one claimed cell turned solid. */
    let promotions = 0;
    /** Steps a claimed cell spent waiting under the snake, apple or bonus. */
    let heldWhileOccupied = 0;
    /** Of those, the ones that threw away warning the player had already seen. */
    let gracesRestarted = 0;
    /** Walls that set in the cell the head was one step from entering. */
    let aheadOfHead = 0;
    /** Walls that set after having been covered — the restart does not starve. */
    let setAfterCover = 0;
    // Violations are counted rather than asserted per step: 1,200 runs is a
    // few hundred thousand steps, and one assertion each dominates the clock.
    const unwarned: string[] = [];
    const underSnake: string[] = [];
    const sealedTheHeadIn: string[] = [];

    for (let run = 0; run < 1200; run++) {
      const random = seededRandom(run * 7919 + 13);
      const state = createSnakeState(random);
      /**
       * *Consecutive* frames a cell has been drawn as a ghost the player could
       * see — which is what the grace promises, and not the same thing as the
       * countdown's own decrements. Counted from the rendered state after each
       * step rather than from the cells pending before it, for two reasons that
       * both hid a step's worth of warning. A cell this step's rung claims is
       * on screen as a ghost the moment the step ends, so that frame is the
       * first of its grace even though no countdown has visited it yet. And the
       * step that turns a cell solid renders it as a wall, not a ghost, so it
       * must not be credited as warning: the count stops at the last frame the
       * cell was still pending. Add those two together on the old counter and
       * they cancelled, which is exactly how it reported four for a vacated
       * cell the player saw ghost three times.
       */
      const ghostAge = new Map<number, number>();
      /** Claimed cells that have been hidden at least once since they were claimed. */
      const wasCovered = new Set<number>();

      for (let n = 0; n < 4000 && state.alive; n++) {
        playNovice(state, random);
        // Snapshotted rather than diffed by size: a wall that skips the ghost
        // stage entirely — the bug this test exists for — has to be visible
        // here even though nothing ever tracked it as pending.
        const wallsBefore = new Set(state.walls);
        const arenaBefore = state.arena;
        step(state, random);
        steps++;
        if (!state.alive) break;
        if (state.arena > arenaBefore) rungs++;

        // Read off the frame this step just produced: every cell still claimed
        // is drawn, and `game.ts` draws the ghosts under the food, the bonus
        // and the snake, so a covered one shows the player nothing at all.
        for (const i of state.pendingWalls.keys()) {
          if (occupiedCell(state, i)) {
            heldWhileOccupied++;
            if ((ghostAge.get(i) ?? 0) > 0) gracesRestarted++;
            ghostAge.set(i, 0);
            wasCovered.add(i);
            continue;
          }
          ghostAge.set(i, (ghostAge.get(i) ?? 0) + 1);
        }

        const head = state.snake[0];
        const ahead = cellIndex(head.x + state.direction.x, head.y + state.direction.y);
        const fresh =
          state.walls.size === wallsBefore.size
            ? []
            : [...state.walls].filter(i => !wallsBefore.has(i));

        for (const i of fresh) {
          // Every wall that sets has ghosted, in the clear and unbroken, for
          // its full grace first — including any that sets straight ahead.
          const age = ghostAge.get(i) ?? 0;
          if (age < WALL_GRACE_STEPS) unwarned.push(`run ${run} step ${n} cell ${i} age ${age}`);
          if (i === ahead) aheadOfHead++;
          if (wasCovered.has(i)) setAfterCover++;
          if (state.snake.some(s => cellIndex(s.x, s.y) === i)) {
            underSnake.push(`run ${run} step ${n} cell ${i}`);
          }
        }
        for (const i of fresh) {
          ghostAge.delete(i);
          wasCovered.delete(i);
        }

        // Checked where the walls *land*, not where the rung advances: with a
        // grace in front of every claim, a rung's cells set several steps
        // after the apple that claimed them, so gating this on the rung would
        // never look at the step that can actually do the harm. Geometry must
        // never be what takes the head's last move away — if it has none now,
        // it had none ignoring the walls that just set either.
        if (fresh.length) {
          promotions++;
          const ignore = new Set(fresh);
          const boxedIn = !TURNS.some(d => legalStep(state, d));
          if (boxedIn && TURNS.some(d => legalStep(state, d, ignore))) {
            sealedTheHeadIn.push(`run ${run} step ${n}: sealed by ${fresh.join(',')}`);
          }
        }
      }
    }

    // Guard against the runs dying too early to prove anything, and against
    // either check going vacuous: both read `fresh`, so a change that stopped
    // walls promoting would silently empty them.
    expect(steps).toBeGreaterThan(50_000);
    expect(rungs).toBeGreaterThan(500);
    expect(promotions).toBeGreaterThan(500);
    // …and the restarted countdown is genuinely exercised, so the age above is
    // measuring warning the player saw rather than steps on a clock. The second
    // floor is the one that makes it a *consecutive* count: without cells that
    // were covered after their warning had already started, resetting the age
    // and merely pausing it would assert exactly the same thing.
    expect(heldWhileOccupied).toBeGreaterThan(0);
    expect(gracesRestarted).toBeGreaterThan(0);
    // A restart is a delay, not a reprieve: cells that spent time hidden do
    // still set once they have been left alone for the grace. Without this the
    // frame count above could pass by never promoting a covered cell at all —
    // and that is the path whose count was one short.
    expect(setAfterCover).toBeGreaterThan(0);
    // The audit's own headline case does occur — walls do set right in front
    // of the head — but every one of them ghosted there first.
    expect(aheadOfHead).toBeGreaterThan(0);
    expect(unwarned).toEqual([]);
    expect(underSnake).toEqual([]);
    expect(sealedTheHeadIn).toEqual([]);
  });
});

/**
 * Issue #260: every cabinet needs at least one test that plays a full run
 * through the real rules and asserts a player-visible outcome rather than a
 * mechanical invariant. Snake had a whole-run harness already — the 1,200-run
 * sweep above — but every assertion in it is about the wall grace, and its
 * step and rung counters exist only to stop those checks going vacuous. It
 * never once asked what the run was worth or how it ended.
 *
 * The three tests below are the four acceptance criteria the issue names: a
 * run terminates, a competent policy scores above zero, a degenerate one does
 * not beat it, and the comparison is paired on common random numbers with its
 * t-statistic reported in the failure message.
 */
describe('headless playthrough (seeded, deterministic)', () => {
  /**
   * How long a run is allowed to go on before the harness stops it.
   *
   * Deliberately a bare number with no arithmetic in it. The whole defect this
   * issue exists to eliminate is a harness whose guard is derived from the
   * thing under test — Critter Rescue resolved its playthroughs on a
   * `levelTimeLimit` of at most 9,000 against a runaway guard of 12,000, so no
   * level could ever report "never ended" and every assertion passed
   * unconditionally. Nothing here may be spelled in terms of `ARENA_EVERY`,
   * `WALL_GRACE_STEPS`, `BONUS_TICKS` or `stepInterval`: retuning any of those
   * must be able to move a run against a fixed ceiling.
   *
   * At the speed floor of 70 ms a step this is close to twelve minutes of
   * play, and long enough that the competent policy below reaches its own
   * ending on 38 of 40 sweep seeds rather than being cut off here.
   */
  const STEP_CAP = 10_000;

  /** How a run stopped. `cap` is a valid ending; it is just not the game's. */
  type Ending = 'died' | 'cap';

  interface Played {
    state: SnakeState;
    steps: number;
    ending: Ending;
  }

  /** A player: it may buffer a turn each step, and nothing else. */
  type Policy = (state: SnakeState, roll: () => number) => void;

  /**
   * The competent player, and the oracle for "is this cabinet survivable".
   *
   * Route to the apple with the engine's shared BFS (`pathfind.ts`, the
   * required channel), take the first step of that route that still leaves the
   * head a way out, and settle for the roomiest cell when none does. Three
   * details are what make it play the cabinet rather than a simplified copy of
   * it:
   *
   * - The map it paths over blocks the *whole* snake, not the body minus its
   *   tail. A route through the cell the tail is vacating is a route through
   *   the snake's own wake: legal for exactly one step, and a lie for the rest
   *   of the path. Allowing it walked the bot into a closed ring of its own
   *   body that it then followed for thousands of steps without ever eating.
   * - Ghosting cells are treated as wall. That is what the grace is for, and a
   *   policy that ignored every warning would only ever prove itself careless.
   * - The way-out test is the head reaching its own tail, *or* opening onto at
   *   least as much space as the snake is long. Tail reachability alone is
   *   over-strict — it refuses a perfectly safe move into the open board
   *   whenever the tail happens to be boxed in by the snake's own turn — and
   *   the runs it produced stalled short of the ladder's top rung.
   *
   * It is competent, not perfect: it dies, which is the point. A policy that
   * could not be killed would certify a cabinet that had stopped being a game.
   */
  function chooseMove(state: SnakeState): Vec | null {
    const blocked = new Uint8Array(COLS * ROWS);
    for (const i of state.walls) blocked[i] = 1;
    for (const i of state.pendingWalls.keys()) blocked[i] = 1;
    for (const s of state.snake) blocked[cellIndex(s.x, s.y)] = 1;

    const head = state.snake[0];
    const length = state.snake.length;
    /** The cell the tail leaves this step, and the one it leaves next. */
    const last = cellIndex(state.snake[length - 1].x, state.snake[length - 1].y);
    const secondLast = cellIndex(state.snake[length - 2].x, state.snake[length - 2].y);

    const moves: { d: Vec; cell: number; eats: boolean }[] = [];
    for (const d of TURNS) {
      if (d.x === -state.direction.x && d.y === -state.direction.y) continue;
      const x = head.x + d.x;
      const y = head.y + d.y;
      if (x < 0 || x >= COLS || y < 0 || y >= ROWS) continue;
      const cell = cellIndex(x, y);
      if (state.walls.has(cell) || state.pendingWalls.has(cell)) continue;
      const eats = x === state.food.x && y === state.food.y;
      const body = eats ? state.snake : state.snake.slice(0, -1);
      if (body.some(s => s.x === x && s.y === y)) continue;
      moves.push({ d, cell, eats });
    }
    if (!moves.length) return null;

    const distancesTo = (goal: Vec) =>
      bfsFrom(COLS, ROWS, i => !blocked[i], cellIndex(goal.x, goal.y)).dist;

    let target = state.food;
    let distance = distancesTo(state.food);
    if (state.bonus) {
      const toBonus = distancesTo(state.bonus.pos);
      const nearest = Math.min(...moves.map(m => toBonus[m.cell]).filter(v => v !== -1));
      // Worth the detour only while it can still be reached before it expires.
      if (Number.isFinite(nearest) && nearest + 1 < state.bonus.ticksLeft) {
        target = state.bonus.pos;
        distance = toBonus;
      }
    }

    // Ties break toward the axis with the further to go, so two equal-length
    // routes cut across the board instead of hugging one edge until the snake
    // has folded itself into a U it cannot get out of.
    const dx = Math.abs(target.x - head.x);
    const dy = Math.abs(target.y - head.y);
    const offAxis = (d: Vec) => (dy > dx ? (d.y !== 0 ? 0 : 1) : d.x !== 0 ? 0 : 1);
    const ranked = moves
      .map(m => ({ ...m, goal: distance[m.cell], off: offAxis(m.d) }))
      .sort(
        (a, b) =>
          (a.goal === -1 ? 1 : 0) - (b.goal === -1 ? 1 : 0) || a.goal - b.goal || a.off - b.off
      );

    let roomiest: { d: Vec; room: number } | null = null;
    for (const m of ranked) {
      // The board as it stands *after* the move: the tail cell is empty, and
      // on a step that does not grow the snake so is the one behind it, which
      // is where the tail will be.
      const freed = m.eats ? [last] : [last, secondLast];
      for (const cell of freed) blocked[cell] = 0;
      const { dist } = bfsFrom(COLS, ROWS, i => !blocked[i], m.cell);
      for (const cell of freed) blocked[cell] = 1;

      let room = 0;
      for (const v of dist) if (v !== -1) room++;
      if (dist[m.eats ? last : secondLast] !== -1 || room >= length + (m.eats ? 1 : 0)) {
        return m.d;
      }
      if (!roomiest || room > roomiest.room) roomiest = { d: m.d, room };
    }
    return roomiest!.d;
  }

  const competent: Policy = state => {
    const d = chooseMove(state);
    if (d) queueDirection(state, d);
  };

  /** Press Start and walk away. */
  const idle: Policy = () => {};

  /** A direction at random every step: the degenerate baseline. */
  const masher: Policy = (state, roll) => {
    queueDirection(state, TURNS[Math.floor(roll() * TURNS.length)]);
  };

  /**
   * One seeded run. The policy rolls from its own generator so that the game's
   * stream is spent on the game alone: both arms of a pairing therefore open on
   * the same board and are served the same apples for as long as their play
   * agrees, which is the common-random-numbers half of the issue's fourth
   * criterion.
   */
  function playRun(policy: Policy, seed: number): Played {
    const random = seededRandom(seed);
    const roll = seededRandom(seed * 31 + 7);
    const state = createSnakeState(random);
    let steps = 0;
    for (; steps < STEP_CAP && state.alive; steps++) {
      policy(state, roll);
      step(state, random);
    }
    return { state, steps, ending: state.alive ? 'cap' : 'died' };
  }

  /** Spread wide: consecutive seeds barely move the LCG's first draw. */
  const seedAt = (n: number) => n * 7919 + 13;
  const SEEDS = [0, 1, 2, 3, 4, 5].map(seedAt);
  /** Matched pairs in the policy comparison below. */
  const PAIRS = 12;

  /** Every cell the ladder claims once the last rung has landed. */
  const LADDER_CELLS = new Set(ARENA_WALLS.flat()).size;

  it('a competent run walks the ladder to its last rung, banks a score, and ends', { timeout: 60000 }, () => {
    for (const seed of SEEDS) {
      const { state, steps, ending } = playRun(competent, seed);
      const where = `seed ${seed}: ${steps} steps, ${state.foodsEaten} apples, ${state.score} points, ended by ${ending}`;

      // 1. The run terminates, and on these seeds it is the game that ends it
      //    rather than the harness. Reaching STEP_CAP would be a valid ending
      //    too; needing it would mean the cabinet had become unloseable.
      expect(ending, where).toBe('died');

      // 2. It is worth something. The board only ever sees a finished run's
      //    number, so a cabinet a competent player finishes on nothing is a
      //    cabinet with no scoreboard.
      expect(state.score, where).toBeGreaterThan(0);
      // ...and more than the apples alone pay for, so the timed bonus is
      // reachable in play and not only in the unit tests that place it by hand.
      expect(state.score, where).toBeGreaterThan(FOOD_POINTS * state.foodsEaten);

      // 3. The arena ladder is not decoration: the run eats past the last rung
      //    and every cell it claims is standing by the end.
      expect(state.foodsEaten, where).toBeGreaterThan(ARENA_EVERY * (ARENA_WALLS.length - 1));
      expect(state.arena, where).toBe(ARENA_WALLS.length - 1);
      expect(state.walls.size, where).toBe(LADDER_CELLS);
    }
  });

  it('press Start and walk away: the run dies at the far wall with nothing on the board', { timeout: 60000 }, () => {
    // The idle degenerate, and Line Hold's `an idle run scores nothing` under
    // another name. Snake gives an idle player no rope at all: the opening
    // direction is east, so the head runs out of board in the width of it.
    const openingX = createSnakeState(seededRandom(1)).snake[0].x;
    for (const seed of SEEDS) {
      const { state, steps, ending } = playRun(idle, seed);
      const where = `seed ${seed}`;
      expect(ending, where).toBe('died');
      expect(steps, where).toBe(COLS - openingX);
      // Nothing reaches the board, on these seeds because the opening apple is
      // never in the lane the head walks down.
      expect(state.score, where).toBe(0);
      expect(state.foodsEaten, where).toBe(0);
    }
  });

  it('a masher never out-scores a competent player: paired seeds, t reported', { timeout: 60000 }, () => {
    // The issue's third and fourth criteria. Paired rather than two means: the
    // arms share a seed, so they open on the same board and are served the same
    // apples until their play parts, and the difference is per-run rather than
    // between two averages that each carry their own sampling error.
    const differences: number[] = [];
    let worstCompetent = Infinity;
    let bestMasher = 0;
    for (let n = 0; n < PAIRS; n++) {
      const seed = seedAt(n);
      const good = playRun(competent, seed).state.score;
      const bad = playRun(masher, seed).state.score;
      differences.push(good - bad);
      worstCompetent = Math.min(worstCompetent, good);
      bestMasher = Math.max(bestMasher, bad);
    }
    const { mean, t } = meanT(differences);
    const detail =
      `competent - masher: ${mean.toFixed(0)} points (t=${t.toFixed(2)}, n=${PAIRS}), ` +
      `worst competent ${worstCompetent}, best masher ${bestMasher}`;

    // Not one pairing goes the other way, so the claim is not an average
    // hiding a cabinet that rewards mashing on some boards.
    expect(Math.min(...differences), detail).toBeGreaterThan(0);
    expect(t, detail).toBeGreaterThan(5);
    expect(worstCompetent, detail).toBeGreaterThan(bestMasher);
  });
});
