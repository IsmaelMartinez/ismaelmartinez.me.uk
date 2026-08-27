/** Clamp a number to the inclusive [min, max] range. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Deterministic 32-bit LCG (Numerical Recipes constants). A run seeded with the
 * same number replays exactly, which is the only way to test something that is
 * otherwise random — and, for Line Hold, the only way to offer per-run variety
 * without making the shared score board incomparable between players.
 *
 * It lives here rather than in a cabinet because two of them now seed from it.
 */
export function seededRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}
