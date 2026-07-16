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
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}
