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
 * claimed cell's countdown pauses, so a test that tracks how long a ghost has
 * been *visible warning* has to pause on the same condition.
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
  it('does not seal the cell straight ahead of the head (issue #259 repro)', () => {
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
    // it is claimed — but as a ghost, never as geometry that kills on contact.
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
    /** Walls that set in the cell the head was one step from entering. */
    let aheadOfHead = 0;
    // Violations are counted rather than asserted per step: 1,200 runs is a
    // few hundred thousand steps, and one assertion each dominates the clock.
    const unwarned: string[] = [];
    const underSnake: string[] = [];
    const sealedTheHeadIn: string[] = [];

    for (let run = 0; run < 1200; run++) {
      const random = seededRandom(run * 7919 + 13);
      const state = createSnakeState(random);
      /**
       * Steps a cell has ghosted *in the clear* — the warning the player can
       * actually act on. Counted the way the rules count it: a cell claimed
       * before this step gets one step of grace off this step only when
       * nothing stood on it, so a cell that spends its wait under the snake
       * ages not at all and still owes its full grace once it is vacated.
       */
      const ghostAge = new Map<number, number>();

      for (let n = 0; n < 4000 && state.alive; n++) {
        playNovice(state, random);
        // Snapshotted rather than diffed by size: a wall that skips the ghost
        // stage entirely — the bug this test exists for — has to be visible
        // here even though nothing ever tracked it as pending.
        const wallsBefore = new Set(state.walls);
        const arenaBefore = state.arena;
        // The cells whose countdown this step will visit. Cells the step's own
        // rung claims are deliberately not among them: they are claimed after
        // the countdown runs, so this step is none of their grace.
        const claimedBefore = [...state.pendingWalls.keys()];
        step(state, random);
        steps++;
        if (!state.alive) break;
        if (state.arena > arenaBefore) rungs++;

        // Nothing between the countdown and here moves the snake or the bonus,
        // and neither a respawned apple nor a fresh bonus may land on a claimed
        // cell, so occupancy read now is occupancy as the countdown saw it.
        for (const i of claimedBefore) {
          if (occupiedCell(state, i)) {
            heldWhileOccupied++;
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
          // Every wall that sets has ghosted, in the clear, for its full grace
          // first — including any that sets in the cell straight ahead.
          const age = ghostAge.get(i) ?? 0;
          if (age < WALL_GRACE_STEPS) unwarned.push(`run ${run} step ${n} cell ${i} age ${age}`);
          if (i === ahead) aheadOfHead++;
          if (state.snake.some(s => cellIndex(s.x, s.y) === i)) {
            underSnake.push(`run ${run} step ${n} cell ${i}`);
          }
        }
        for (const i of fresh) ghostAge.delete(i);

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
    // …and the paused countdown is genuinely exercised, so the age above is
    // measuring warning the player saw rather than steps on a clock.
    expect(heldWhileOccupied).toBeGreaterThan(0);
    // The audit's own headline case does occur — walls do set right in front
    // of the head — but every one of them ghosted there first.
    expect(aheadOfHead).toBeGreaterThan(0);
    expect(unwarned).toEqual([]);
    expect(underSnake).toEqual([]);
    expect(sealedTheHeadIn).toEqual([]);
  });
});
