/**
 * Deterministic LCG random source for seeding the games' pure generators in
 * tests. Shared so every suite exercises the same generator instead of
 * maintaining its own copy.
 *
 * Caveat: the first draw barely varies across small consecutive seeds
 * (state = seed * 1664525 + 1013904223 moves the first output by only
 * ~0.0004 per seed step), so tests sweeping seeds to hit probability
 * branches must spread them — e.g. multiply by a large prime — or every
 * "different" seed rolls the same first branch.
 */
export function seededRandom(seed = 42): () => number {
  // `>>> 0` keeps the state a uint32 so negative or fractional seeds can't
  // produce negative/non-integer states (`%` preserves sign in JS). For the
  // usual non-negative integer seeds it yields the exact same sequence as
  // the old `% 4294967296`: every intermediate value stays below 2^53, so
  // ToUint32's mod-2^32 is exact.
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}
