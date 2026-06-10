/**
 * Helpers for games built on a flat W×H tile grid (index = y * w + x).
 * First piece of the shared grid-sim core used by Pixel Park and Microcity.
 */

/** 4-directional neighbour indices, respecting grid edges. */
export function gridNeighbours(i: number, w: number, h: number): number[] {
  const x = i % w;
  const y = Math.floor(i / w);
  const out: number[] = [];
  if (x > 0) out.push(i - 1);
  if (x < w - 1) out.push(i + 1);
  if (y > 0) out.push(i - w);
  if (y < h - 1) out.push(i + w);
  return out;
}

/** Chebyshev (chessboard) distance between two tile indices. */
export function chebyshev(a: number, b: number, w: number): number {
  return Math.max(Math.abs((a % w) - (b % w)), Math.abs(Math.floor(a / w) - Math.floor(b / w)));
}
