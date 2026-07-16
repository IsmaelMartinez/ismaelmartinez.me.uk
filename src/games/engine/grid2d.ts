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

/**
 * Random-growth blob from a claimed seed tile: repeatedly picks a random
 * blob member and tries to claim a random orthogonal neighbour, until the
 * blob reaches `target` tiles. Growth can stall against edges or ineligible
 * ground, so attempts are bounded rather than looping forever. The caller
 * claims the seed before calling (it's already part of the blob). Used for
 * Pixel Park ponds and Microcity lakes.
 */
export function growBlob(
  seed: number,
  w: number,
  h: number,
  target: number,
  canClaim: (i: number) => boolean,
  claim: (i: number) => void,
  random: () => number
): void {
  const blob = [seed];
  for (let tries = 0; blob.length < target && tries < target * 8; tries++) {
    const from = blob[Math.floor(random() * blob.length)];
    const ns = gridNeighbours(from, w, h);
    const n = ns[Math.floor(random() * ns.length)];
    if (canClaim(n)) {
      claim(n);
      blob.push(n);
    }
  }
}

/**
 * Floods one board edge with a shoreline whose depth wanders between 1 and
 * `maxDepth` tiles (edge 0 = top, 1 = right, 2 = bottom, 3 = left; same
 * clockwise convention as direction indices elsewhere in the engine).
 * `paint` decides per tile whether the flood actually lands — generators
 * pass their own eligibility rules there. Used for Pixel Park and Microcity
 * coastlines.
 */
export function carveEdge(
  w: number,
  h: number,
  edge: number,
  maxDepth: number,
  paint: (x: number, y: number) => void,
  random: () => number
): void {
  const len = edge % 2 === 0 ? w : h;
  let depth = 1 + Math.floor(random() * 2);
  for (let k = 0; k < len; k++) {
    const drift = random();
    if (drift < 0.3) depth = Math.max(1, depth - 1);
    else if (drift > 0.7) depth = Math.min(maxDepth, depth + 1);
    for (let d = 0; d < depth; d++) {
      const x = edge % 2 === 0 ? k : edge === 1 ? w - 1 - d : d;
      const y = edge % 2 === 1 ? k : edge === 0 ? d : h - 1 - d;
      paint(x, y);
    }
  }
}
