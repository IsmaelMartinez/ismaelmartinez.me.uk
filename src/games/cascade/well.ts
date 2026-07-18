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
 * The cascade rule: every cell falls straight down its own column until it
 * rests on the floor or another cell. Unlike classic Tetris row-shifting,
 * this fills covered holes — which is exactly what makes chains possible.
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

export interface ClearStep {
  /** Rows that were full at this step of the chain (chain index = position + 1). */
  rows: number[];
}

/**
 * Resolves the well to a stable state: clear full rows, cascade, and repeat
 * while the landslide completes new rows. Returns one step per chain link.
 * The interactive run steps through this with a timer per link so each flash
 * is visible; this all-at-once form drives the tests and hard headless play.
 */
export function resolveClears(well: Well): ClearStep[] {
  const steps: ClearStep[] = [];
  for (;;) {
    const rows = fullRows(well);
    if (rows.length === 0) return steps;
    steps.push({ rows });
    clearRows(well, rows);
    cascadeGravity(well);
  }
}
