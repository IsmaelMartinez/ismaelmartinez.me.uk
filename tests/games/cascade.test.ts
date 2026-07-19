import { describe, it, expect } from 'vitest';
import {
  WELL_W,
  WELL_H,
  createWell,
  fullRows,
  clearRows,
  cascadeGravity,
  resolveClears,
  type Well
} from '../../src/games/cascade/well';
import {
  PIECE_IDS,
  ROTATIONS,
  spawnPiece,
  cellsOf,
  fits,
  tryMove,
  tryRotate,
  type ActivePiece,
  type PieceId
} from '../../src/games/cascade/piece';
import { createBag } from '../../src/games/cascade/bag';
import {
  LOCK_DELAY,
  MAX_LOCK_RESETS,
  CLEAR_TIME,
  LINES_PER_LEVEL,
  gravityInterval,
  clearPoints,
  createRun,
  grounded,
  ghostPiece,
  tickRun,
  shift,
  rotate,
  setSoftDrop,
  hardDrop,
  type CascadeRun,
  type RunEvent
} from '../../src/games/cascade/run';
import { seededRandom } from './seeded-random';

function fill(well: Well, x: number, y: number, v = 1): void {
  well[y * WELL_W + x] = v;
}

function at(well: Well, x: number, y: number): number {
  return well[y * WELL_W + x];
}

function sortedCells(piece: ActivePiece): string {
  return cellsOf(piece)
    .map(c => `${c.x},${c.y}`)
    .sort()
    .join(' ');
}

describe('seven-bag randomiser', () => {
  it('deals every piece exactly once per bag of seven', () => {
    const draw = createBag(seededRandom(42));
    for (let bag = 0; bag < 10; bag++) {
      const seen = new Set<PieceId>();
      for (let i = 0; i < 7; i++) seen.add(draw());
      expect(seen.size).toBe(7);
    }
  });

  it('is uniform over many bags: 10 of each piece in 70 draws', () => {
    const draw = createBag(seededRandom(7));
    const counts = new Map<PieceId, number>();
    for (let i = 0; i < 70; i++) {
      const id = draw();
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    for (const id of PIECE_IDS) expect(counts.get(id)).toBe(10);
  });

  it('is deterministic for a given seed', () => {
    const a = createBag(seededRandom(99));
    const b = createBag(seededRandom(99));
    for (let i = 0; i < 30; i++) expect(a()).toBe(b());
  });
});

describe('pieces and rotation', () => {
  it('every piece has four cells in every rotation state', () => {
    for (const id of PIECE_IDS) {
      for (let rot = 0; rot < 4; rot++) {
        expect(ROTATIONS[id][rot]).toHaveLength(4);
      }
    }
  });

  it('four clockwise rotations return every piece to its spawn cells', () => {
    const well = createWell();
    for (const id of PIECE_IDS) {
      let piece: ActivePiece = { id, rot: 0, x: 4, y: 8 };
      const original = sortedCells(piece);
      for (let turn = 0; turn < 4; turn++) {
        const next = tryRotate(well, piece, 1);
        expect(next).not.toBeNull();
        piece = next!;
      }
      // Mid-air rotations need no kicks, so the cycle lands exactly home.
      expect(piece.rot).toBe(0);
      expect(sortedCells(piece)).toBe(original);
    }
  });

  it('spawns centred with its lowest cells resting on row 0', () => {
    for (const id of PIECE_IDS) {
      const cells = cellsOf(spawnPiece(id));
      expect(Math.max(...cells.map(c => c.y))).toBe(0);
      for (const c of cells) {
        expect(c.x).toBeGreaterThanOrEqual(3);
        expect(c.x).toBeLessThanOrEqual(6);
      }
    }
  });

  it('kicks a vertical I off the left wall to complete the rotation', () => {
    const well = createWell();
    // rot 1 puts the I's cells in box column 2, so x = -2 hugs the wall.
    const piece: ActivePiece = { id: 0, rot: 1, x: -2, y: 5 };
    expect(fits(well, piece)).toBe(true);
    const turned = tryRotate(well, piece, 1);
    expect(turned).not.toBeNull();
    // In place the horizontal I would poke through the wall; the [2,0]
    // kick slides it inside.
    expect(Math.min(...cellsOf(turned!).map(c => c.x))).toBeGreaterThanOrEqual(0);
    expect(cellsOf(turned!).every(c => c.x < WELL_W)).toBe(true);
  });

  it('floor-kicks a T resting on the bottom row', () => {
    const well = createWell();
    const piece: ActivePiece = { id: 2, rot: 0, x: 3, y: 18 };
    expect(fits(well, piece)).toBe(true);
    const turned = tryRotate(well, piece, 1);
    // Unkicked, the new state needs row 20; the [0,-1] kick lifts it clear.
    expect(turned).not.toBeNull();
    expect(Math.max(...cellsOf(turned!).map(c => c.y))).toBeLessThan(WELL_H);
  });

  it('refuses to rotate when the stack blocks every kick', () => {
    const well = createWell();
    well.fill(1);
    const piece: ActivePiece = { id: 2, rot: 0, x: 3, y: 10 };
    for (const c of cellsOf(piece)) fill(well, c.x, c.y, 0);
    expect(fits(well, piece)).toBe(true);
    expect(tryRotate(well, piece, 1)).toBeNull();
    expect(tryRotate(well, piece, -1)).toBeNull();
  });

  it('collides with walls, floor, and locked cells', () => {
    const well = createWell();
    const piece = spawnPiece(1); // O at x = 4
    expect(tryMove(well, piece, -5, 0)).toBeNull();
    expect(tryMove(well, piece, 5, 0)).toBeNull();
    expect(tryMove(well, piece, 0, WELL_H)).toBeNull();
    fill(well, 4, 1);
    expect(tryMove(well, piece, 0, 1)).toBeNull();
  });
});

describe('well: lines, cascade gravity, chains', () => {
  it('finds only completely filled rows', () => {
    const well = createWell();
    for (let x = 0; x < WELL_W; x++) fill(well, x, 19);
    for (let x = 0; x < WELL_W - 1; x++) fill(well, x, 18);
    expect(fullRows(well)).toEqual([19]);
  });

  it('cascade gravity drops every cell down its own column', () => {
    const well = createWell();
    fill(well, 3, 5, 4);
    fill(well, 3, 10, 2);
    fill(well, 7, 0, 6);
    expect(cascadeGravity(well)).toBe(true);
    expect(at(well, 3, 19)).toBe(2); // lower cell keeps the bottom slot
    expect(at(well, 3, 18)).toBe(4);
    expect(at(well, 7, 19)).toBe(6);
    expect(at(well, 3, 5)).toBe(0);
    // A settled well reports no movement.
    expect(cascadeGravity(well)).toBe(false);
  });

  it('resolves a two-link chain: the landslide completes a second row', () => {
    const well = createWell();
    for (let x = 0; x < WELL_W; x++) fill(well, x, 19); // full bottom row
    for (let x = 0; x < WELL_W - 1; x++) fill(well, x, 18); // gap at x=9
    fill(well, 9, 17); // the plug, hanging one row above the gap
    const steps = resolveClears(well);
    expect(steps.map(s => s.rows)).toEqual([[19], [19]]);
    // The second link consumed every remaining cell: 20 crafted − 2×10 cleared.
    expect(Array.from(well).every(v => v === 0)).toBe(true);
  });

  it('clearRows empties rows without collapsing (the flash frame)', () => {
    const well = createWell();
    for (let x = 0; x < WELL_W; x++) {
      fill(well, x, 19);
      fill(well, x, 17);
    }
    clearRows(well, [19]);
    expect(at(well, 0, 19)).toBe(0);
    expect(at(well, 0, 17)).toBe(1);
  });
});

describe('scoring math', () => {
  it('pays the classic line values scaled by level and chain link', () => {
    expect(clearPoints(1, 1, 1)).toBe(100);
    expect(clearPoints(2, 1, 1)).toBe(300);
    expect(clearPoints(3, 1, 1)).toBe(500);
    expect(clearPoints(4, 1, 1)).toBe(800);
    expect(clearPoints(4, 2, 1)).toBe(1600);
    expect(clearPoints(1, 1, 2)).toBe(200);
    expect(clearPoints(2, 3, 2)).toBe(1800);
  });

  it('keeps growing for cascade clears wider than four rows', () => {
    expect(clearPoints(5, 1, 1)).toBe(1000);
    expect(clearPoints(6, 1, 1)).toBe(1200);
  });

  it('gravity ramps with level and bottoms out', () => {
    expect(gravityInterval(1)).toBeCloseTo(0.8);
    expect(gravityInterval(2)).toBeLessThan(gravityInterval(1));
    expect(gravityInterval(10)).toBeLessThan(gravityInterval(5));
    expect(gravityInterval(50)).toBe(0.07);
  });
});

/** Grounded O piece on an empty floor, for lock-delay scenarios. */
function groundedRun(): CascadeRun {
  const run = createRun(seededRandom(1));
  run.piece = { id: 1, rot: 0, x: 4, y: 18 };
  run.gravityTimer = 0;
  run.lockTimer = LOCK_DELAY;
  run.lockResets = 0;
  return run;
}

describe('run: gravity, lock delay, drops', () => {
  it('applies gravity at the level interval', () => {
    const run = createRun(seededRandom(3));
    const y0 = run.piece!.y;
    tickRun(run, gravityInterval(1) * 0.9);
    expect(run.piece!.y).toBe(y0);
    tickRun(run, gravityInterval(1) * 0.2);
    expect(run.piece!.y).toBe(y0 + 1);
  });

  it('soft drop falls much faster than gravity', () => {
    const run = createRun(seededRandom(3));
    setSoftDrop(run, true);
    tickRun(run, 0.5);
    // 0.5s of soft drop crosses ≥12 rows; base gravity would move one.
    expect(run.piece!.y).toBeGreaterThan(10);
  });

  it('a grounded piece waits out the lock delay before locking', () => {
    const run = groundedRun();
    expect(grounded(run)).toBe(true);
    let events = tickRun(run, LOCK_DELAY * 0.8);
    expect(events).toEqual([]);
    expect(run.phase).toBe('falling');
    events = tickRun(run, LOCK_DELAY * 0.4);
    expect(events.some(e => e.type === 'lock')).toBe(true);
    expect(at(run.well, 4, 19)).toBe(2); // O locks with colour id+1
  });

  it('a successful nudge while grounded re-arms the lock delay', () => {
    const run = groundedRun();
    tickRun(run, LOCK_DELAY * 0.8);
    expect(shift(run, -1)).toBe(true);
    let events = tickRun(run, LOCK_DELAY * 0.8);
    expect(events).toEqual([]); // the shift bought a fresh delay
    expect(rotate(run, 1)).toBe(true); // O rotation is a no-op shape, still a nudge
    events = tickRun(run, LOCK_DELAY * 0.8);
    expect(events).toEqual([]);
    events = tickRun(run, LOCK_DELAY * 0.4);
    expect(events.some(e => e.type === 'lock')).toBe(true);
  });

  it('stops re-arming once the reset budget is spent', () => {
    const run = groundedRun();
    run.lockResets = MAX_LOCK_RESETS;
    tickRun(run, LOCK_DELAY * 0.8);
    expect(shift(run, -1)).toBe(true); // moves, but no longer resets the timer
    const events = tickRun(run, LOCK_DELAY * 0.4);
    expect(events.some(e => e.type === 'lock')).toBe(true);
  });

  it('cannot stall forever with floor-kick spin loops', () => {
    // The exploit: rotating a T on the floor kicks it up a row; it falls
    // back, and if that refilled the lock budget the piece could hover
    // indefinitely. Falling back to a visited depth must consume nudges.
    const run = createRun(seededRandom(21));
    run.piece = { id: 2, rot: 0, x: 3, y: 18 };
    run.lowestY = 18;
    run.gravityTimer = 0;
    run.lockTimer = LOCK_DELAY;
    run.lockResets = 0;
    let simTime = 0;
    while (simTime < 60 && Array.from(run.well).every(v => v === 0)) {
      rotate(run, 1);
      simTime += 0.12;
      tickRun(run, 0.12);
    }
    expect(Array.from(run.well).some(v => v !== 0)).toBe(true);
    expect(simTime).toBeLessThan(30);
  });

  it('hard drop locks on the ghost row immediately', () => {
    const run = createRun(seededRandom(5));
    const ghost = ghostPiece(run)!;
    const events = hardDrop(run);
    expect(events.some(e => e.type === 'lock')).toBe(true);
    for (const c of cellsOf(ghost)) {
      expect(at(run.well, c.x, c.y)).toBe(ghost.id + 1);
    }
    // No clear from a single piece on an empty floor: play continues.
    expect(run.phase).toBe('falling');
    expect(run.piece).not.toBeNull();
  });

  it('tops out when the stack reaches the sky', () => {
    const run = createRun(seededRandom(8));
    const events: RunEvent[] = [];
    for (let drops = 0; drops < 60 && run.phase !== 'over'; drops++) {
      events.push(...hardDrop(run));
      // Drain any (unlikely) clear phases so the next spawn happens.
      for (let t = 0; t < 10 && run.phase === 'clearing'; t++) {
        events.push(...tickRun(run, CLEAR_TIME + 0.01));
      }
    }
    expect(run.phase).toBe('over');
    expect(events.some(e => e.type === 'topOut')).toBe(true);
    // A dead run is inert.
    expect(tickRun(run, 1)).toEqual([]);
    expect(hardDrop(run)).toEqual([]);
    expect(shift(run, 1)).toBe(false);
  });
});

/** Drops a vertical I into the given column of `run`, from row `y`. */
function dropVerticalI(run: CascadeRun, column: number, y = 0): RunEvent[] {
  run.piece = { id: 0, rot: 1, x: column - 2, y };
  expect(fits(run.well, run.piece)).toBe(true);
  return hardDrop(run);
}

describe('run: clears, chains, and levels', () => {
  it('scores a clear, flashes it, then collapses and spawns', () => {
    const run = createRun(seededRandom(11));
    for (let x = 0; x < WELL_W - 1; x++) {
      fill(run.well, x, 18);
      fill(run.well, x, 19);
    }
    const events = dropVerticalI(run, 9);
    const clear = events.find(e => e.type === 'clear');
    expect(clear).toMatchObject({ rows: [18, 19], chain: 1, points: 300 });
    expect(run.phase).toBe('clearing');
    expect(run.score).toBe(300);
    expect(run.lines).toBe(2);

    // Mid-flash nothing moves.
    expect(tickRun(run, CLEAR_TIME * 0.5)).toEqual([]);
    expect(run.phase).toBe('clearing');

    const after = tickRun(run, CLEAR_TIME);
    expect(after).toEqual([]); // the I's leftovers complete nothing
    expect(run.phase).toBe('falling');
    // The two leftover I cells slid to the floor of column 9.
    expect(at(run.well, 9, 19)).toBe(1);
    expect(at(run.well, 9, 18)).toBe(1);
  });

  it('pays a cascade chain with a rising multiplier', () => {
    const run = createRun(seededRandom(13));
    // Bottom row one short at x=9; row 18 filled to x=7 with a plug for its
    // x=8 gap hanging at row 17 — the landslide will finish row 19 twice.
    for (let x = 0; x < WELL_W - 1; x++) fill(run.well, x, 19);
    for (let x = 0; x < WELL_W - 2; x++) fill(run.well, x, 18);
    fill(run.well, 8, 17);

    const first = dropVerticalI(run, 9).find(e => e.type === 'clear');
    expect(first).toMatchObject({ rows: [19], chain: 1, points: 100 });

    const second = tickRun(run, CLEAR_TIME + 0.01).find(e => e.type === 'clear');
    expect(second).toMatchObject({ rows: [19], chain: 2, points: 200 });

    const rest = tickRun(run, CLEAR_TIME + 0.01);
    expect(rest.find(e => e.type === 'clear')).toBeUndefined();
    expect(run.score).toBe(300);
    expect(run.lines).toBe(2);
    expect(run.phase).toBe('falling');
  });

  it('still pays rows completed by the lock that tops the stack out', () => {
    const run = createRun(seededRandom(19));
    // Row 2 is full except x=9; column 9 is a pillar from row 3 down, so a
    // vertical I dropped there rests with its top cell above the well while
    // its lower cells finish row 2.
    for (let x = 0; x < WELL_W - 1; x++) fill(run.well, x, 2);
    for (let y = 3; y < WELL_H; y++) fill(run.well, 9, y);
    const events = dropVerticalI(run, 9, -3);
    expect(events.find(e => e.type === 'topOut')).toBeDefined();
    const clear = events.find(e => e.type === 'clear');
    expect(clear).toMatchObject({ rows: [2], chain: 1, points: 100 });
    expect(run.score).toBe(100);
    expect(run.lines).toBe(1);
    expect(run.phase).toBe('over');
    // The paid row is actually gone from the final board.
    expect(fullRows(run.well)).toEqual([]);
  });

  it('levels up on the lines threshold, scoring the clear at the old level', () => {
    const run = createRun(seededRandom(17));
    run.lines = LINES_PER_LEVEL - 1;
    for (let x = 0; x < WELL_W - 1; x++) fill(run.well, x, 19);
    const events = dropVerticalI(run, 9);
    expect(events.find(e => e.type === 'clear')).toMatchObject({ points: 100 });
    expect(events.find(e => e.type === 'levelUp')).toMatchObject({ level: 2 });
    expect(run.level).toBe(2);
  });
});

describe('headless playthrough (seeded, deterministic)', () => {
  /** Greedy player: tries every rotation/column, drops on the placement that
   * clears most and buries fewest holes. Pure-module APIs only. */
  function playGame(seed: number, pieces: number) {
    const run = createRun(seededRandom(seed));
    const log: RunEvent[] = [];
    // Reads the phase without control-flow narrowing (hardDrop mutates it).
    const phase = () => run.phase;
    for (let n = 0; n < pieces && phase() === 'falling'; n++) {
      let best: { rot: number; x: number; value: number } | null = null;
      for (let rot = 0; rot < 4; rot++) {
        for (let x = -2; x < WELL_W; x++) {
          let cand: ActivePiece = { ...run.piece!, rot, x };
          if (!fits(run.well, cand)) continue;
          for (;;) {
            const below = tryMove(run.well, cand, 0, 1);
            if (!below) break;
            cand = below;
          }
          const trial = run.well.slice() as Well;
          let sunk = false;
          for (const c of cellsOf(cand)) {
            if (c.y < 0) sunk = true;
            else trial[c.y * WELL_W + c.x] = 1;
          }
          if (sunk) continue;
          const cleared = resolveClears(trial).reduce((sum, s) => sum + s.rows.length, 0);
          let holes = 0;
          let stack = 0;
          for (let cx = 0; cx < WELL_W; cx++) {
            let covered = false;
            for (let cy = 0; cy < WELL_H; cy++) {
              if (trial[cy * WELL_W + cx] !== 0) {
                covered = true;
                stack = Math.max(stack, WELL_H - cy);
              } else if (covered) holes++;
            }
          }
          const value = cleared * 1000 - holes * 60 - stack * 2;
          if (!best || value > best.value) best = { rot, x, value };
        }
      }
      if (best) run.piece = { ...run.piece!, rot: best.rot, x: best.x };
      log.push(...hardDrop(run));
      for (let t = 0; t < 30 && phase() === 'clearing'; t++) {
        log.push(...tickRun(run, CLEAR_TIME + 0.01));
      }
    }
    return { run, log };
  }

  it('stacks and clears lines without ever reaching an illegal state', () => {
    const { run, log } = playGame(1234, 80);
    const clears = log.filter(e => e.type === 'clear');
    expect(clears.length).toBeGreaterThan(0);
    expect(run.lines).toBeGreaterThan(0);
    expect(run.score).toBe(clears.reduce((sum, e) => sum + e.points, 0));
    expect(run.lines).toBe(clears.reduce((sum, e) => sum + e.rows.length, 0));
    // The well never holds a full (unresolved) row between pieces.
    expect(fullRows(run.well)).toEqual([]);
    // Locks equal the pieces played (80, or fewer if the run topped out).
    const locks = log.filter(e => e.type === 'lock').length;
    expect(locks).toBeGreaterThan(0);
    expect(locks).toBeLessThanOrEqual(80);
  });

  it('is reproducible: the same seed replays the same game', () => {
    const a = playGame(4321, 60);
    const b = playGame(4321, 60);
    expect(a.run.score).toBe(b.run.score);
    expect(a.run.lines).toBe(b.run.lines);
    expect(a.log).toEqual(b.log);
    expect(Array.from(a.run.well)).toEqual(Array.from(b.run.well));
  });
});
