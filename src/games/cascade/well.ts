/**
 * Cascade's well: a flat 10×20 grid of coloured cells (0 = empty, 1–7 = the
 * locking piece's colour) plus the rules that give the game its name — when
 * rows clear, every remaining cell falls straight down its own column, and
 * any rows completed by that landslide clear again as a chain.
 *
 * Pure and DOM-free; index = y * WELL_W + x, y grows downward.
 */

export const WELL_W = 10;
export const WELL_H = 20;

export type Well = Uint8Array;

export function createWell(): Well {
  return new Uint8Array(WELL_W * WELL_H);
}

/** Rows (top to bottom) with no empty cell. */
export function fullRows(well: Well): number[] {
  const rows: number[] = [];
  for (let y = 0; y < WELL_H; y++) {
    let full = true;
    for (let x = 0; x < WELL_W; x++) {
      if (well[y * WELL_W + x] === 0) {
        full = false;
        break;
      }
    }
    if (full) rows.push(y);
  }
  return rows;
}

/** Empties the given rows in place (the collapse comes separately, so the
 * cleared rows can flash on screen before the landslide). */
export function clearRows(well: Well, rows: number[]): void {
  for (const y of rows) {
    well.fill(0, y * WELL_W, (y + 1) * WELL_W);
  }
}

/**
 * Instant cascade settle: every cell drops straight down its own column until
 * it rests on the floor or another cell, in one shot. Unlike classic Tetris
 * row-shifting, this fills covered holes. Kept as the fast fixpoint form (and
 * for callers that don't need to watch the fall); the interactive run and
 * `resolveClears` settle one row at a time via `settleStep` so a landslide can
 * complete rows *mid-fall*, which is what makes deep (×3+) chains reachable.
 * Returns whether anything moved.
 */
export function cascadeGravity(well: Well): boolean {
  let moved = false;
  for (let x = 0; x < WELL_W; x++) {
    let write = WELL_H - 1;
    for (let y = WELL_H - 1; y >= 0; y--) {
      const cell = well[y * WELL_W + x];
      if (cell === 0) continue;
      if (write !== y) {
        well[write * WELL_W + x] = cell;
        well[y * WELL_W + x] = 0;
        moved = true;
      }
      write--;
    }
  }
  return moved;
}

/**
 * One tick of gravity: every floating cell drops by exactly one row (if the
 * cell below it is empty). Returns whether anything moved. Iterating this to a
 * fixpoint equals `cascadeGravity`, but stepping it one row at a time lets the
 * caller re-check for full rows between steps — a plug falling past a gap can
 * complete a row at an *intermediate* height that the instant settle skips
 * straight past, which is exactly how a cascade chains beyond ×2.
 */
export function settleStep(well: Well): boolean {
  let moved = false;
  for (let x = 0; x < WELL_W; x++) {
    // Bottom-up so each cell is considered once and drops at most one row.
    for (let y = WELL_H - 2; y >= 0; y--) {
      const i = y * WELL_W + x;
      if (well[i] !== 0 && well[i + WELL_W] === 0) {
        well[i + WELL_W] = well[i];
        well[i] = 0;
        moved = true;
      }
    }
  }
  return moved;
}

export interface ClearStep {
  /** Rows that were full at this step of the chain (chain index = position + 1). */
  rows: number[];
}

/**
 * Resolves the well to a stable state and returns one step per chain link.
 * Clears full rows, then settles the landslide **one row at a time**, checking
 * for newly completed rows after every drop — so a plug tumbling past a gap can
 * finish a row mid-fall and keep the chain going (this is what lifts chains
 * past ×2; the old instant-settle form capped them at 2). The interactive run
 * mirrors this loop with a timer per flash/settle so the cascade is watchable.
 */
export function resolveClears(well: Well): ClearStep[] {
  const steps: ClearStep[] = [];
  for (;;) {
    const rows = fullRows(well);
    if (rows.length > 0) {
      steps.push({ rows });
      clearRows(well, rows);
      continue;
    }
    // No full row right now: let the landslide fall a single row and look
    // again. When nothing can fall either, the well is stable.
    if (!settleStep(well)) return steps;
  }
}
