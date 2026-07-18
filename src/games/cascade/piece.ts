/**
 * The seven tetrominoes: rotation states, wall/floor kicks, and collision
 * against the well. Pure and DOM-free.
 *
 * Rotation states are computed once at module load by turning each spawn
 * shape clockwise inside its own bounding box ((x, y) → (box-1-y, x)), the
 * standard scheme, so the states can't drift out of sync with a hand-typed
 * table. Kicks are a compact ordered offset list rather than full SRS: try
 * in place, one step left/right, one step up (floor kick), then two steps
 * sideways (for I against a wall).
 */
import { WELL_W, WELL_H, type Well } from './well';

export type PieceId = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export const PIECE_IDS: readonly PieceId[] = [0, 1, 2, 3, 4, 5, 6];
export const PIECE_NAMES = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'] as const;

type Cell = readonly [number, number];

/** Spawn shapes in box coordinates (y down), box size per piece. */
const DEFS: ReadonlyArray<{ box: number; cells: readonly Cell[] }> = [
  { box: 4, cells: [[0, 1], [1, 1], [2, 1], [3, 1]] }, // I
  { box: 2, cells: [[0, 0], [1, 0], [0, 1], [1, 1]] }, // O
  { box: 3, cells: [[1, 0], [0, 1], [1, 1], [2, 1]] }, // T
  { box: 3, cells: [[1, 0], [2, 0], [0, 1], [1, 1]] }, // S
  { box: 3, cells: [[0, 0], [1, 0], [1, 1], [2, 1]] }, // Z
  { box: 3, cells: [[0, 0], [0, 1], [1, 1], [2, 1]] }, // J
  { box: 3, cells: [[2, 0], [0, 1], [1, 1], [2, 1]] }  // L
];

function rotateCw(cells: readonly Cell[], box: number): Cell[] {
  return cells.map(([x, y]) => [box - 1 - y, x] as const);
}

/** ROTATIONS[id][rot] = the piece's cells in box coordinates. */
export const ROTATIONS: ReadonlyArray<ReadonlyArray<readonly Cell[]>> = DEFS.map(def => {
  const states: Cell[][] = [def.cells.slice()];
  for (let r = 1; r < 4; r++) {
    states.push(rotateCw(states[r - 1], def.box));
  }
  return states;
});

/** Kick offsets tried in order on rotation; dy -1 lifts off the floor. */
export const KICKS: ReadonlyArray<Cell> = [
  [0, 0],
  [-1, 0],
  [1, 0],
  [0, -1],
  [-2, 0],
  [2, 0]
];

export interface ActivePiece {
  id: PieceId;
  /** Rotation state 0–3. */
  rot: number;
  /** Box origin in well coordinates; may sit above the well (negative y). */
  x: number;
  y: number;
}

export function cellsOf(piece: ActivePiece): Array<{ x: number; y: number }> {
  return ROTATIONS[piece.id][piece.rot].map(([cx, cy]) => ({
    x: piece.x + cx,
    y: piece.y + cy
  }));
}

/** True when every cell is inside the walls/floor and over empty ground.
 * Cells above the well (y < 0) are legal — pieces drop in from up there. */
export function fits(well: Well, piece: ActivePiece): boolean {
  for (const c of cellsOf(piece)) {
    if (c.x < 0 || c.x >= WELL_W || c.y >= WELL_H) return false;
    if (c.y >= 0 && well[c.y * WELL_W + c.x] !== 0) return false;
  }
  return true;
}

export function tryMove(well: Well, piece: ActivePiece, dx: number, dy: number): ActivePiece | null {
  const moved = { ...piece, x: piece.x + dx, y: piece.y + dy };
  return fits(well, moved) ? moved : null;
}

/** Rotate with kicks; dir +1 = clockwise, -1 = counter-clockwise. */
export function tryRotate(well: Well, piece: ActivePiece, dir: 1 | -1): ActivePiece | null {
  const rot = (piece.rot + dir + 4) % 4;
  for (const [kx, ky] of KICKS) {
    const kicked = { ...piece, rot, x: piece.x + kx, y: piece.y + ky };
    if (fits(well, kicked)) return kicked;
  }
  return null;
}

/** New piece centred at the top, lowest cells resting on row 0. */
export function spawnPiece(id: PieceId): ActivePiece {
  const def = DEFS[id];
  const bottom = Math.max(...def.cells.map(([, y]) => y));
  return {
    id,
    rot: 0,
    x: Math.floor((WELL_W - def.box) / 2),
    y: -bottom
  };
}
