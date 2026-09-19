/**
 * Deterministic LCG random source for seeding the games' pure generators in
 * tests. Shared so every suite exercises the same generator instead of
 * maintaining its own copy.
 *
 * It is the engine's own `seededRng` under the name the suites have always
 * imported, with the default seed kept. The two were separate copies of the
 * same Numerical Recipes LCG (one multiplying in doubles, one through
 * `Math.imul`) and are bit-identical: the state stays below 2^32, so the double
 * product stays below 2^53 and is exact, and both reduce mod 2^32. Checked
 * against 1000 draws each for ten seeds (0, 1, 42, 1337, 4242, 12345, 2376782,
 * 2^32-1, -5, 3.7) before the copy was retired.
 *
 * Caveat: the first draw barely varies across small consecutive seeds
 * (state = seed * 1664525 + 1013904223 moves the first output by only
 * ~0.0004 per seed step), so tests sweeping seeds to hit probability
 * branches must spread them — e.g. multiply by a large prime — or every
 * "different" seed rolls the same first branch.
 */
import { seededRng } from '../../src/games/engine/math';

export const seededRandom = (seed = 42): (() => number) => seededRng(seed);
