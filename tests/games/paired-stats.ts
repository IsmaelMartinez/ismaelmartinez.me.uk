/**
 * The mean and t-statistic of a set of *paired* differences, shared by every
 * suite that compares two policies on common random numbers.
 *
 * It lives here rather than in any one cabinet's harness for the reason
 * `football-paired.ts` gives for existing at all: two copies of a comparison
 * method is how two suites end up disagreeing about what they measured. Issue
 * #260 asks every cabinet's policy comparison to report a t, so the arithmetic
 * behind that number has to be one function.
 *
 * Paired is the whole point. An unpaired comparison of two policies carries
 * sampling error of the same order as the effects being argued about, and a
 * previous football round spent itself chasing a difference that was 0.09
 * sigma. Feed this the per-seed difference, never two separate means.
 */
export function meanT(xs: number[]): { mean: number; t: number } {
  const mean = xs.reduce((sum, x) => sum + x, 0) / xs.length;
  const variance =
    xs.reduce((sum, x) => sum + (x - mean) * (x - mean), 0) / Math.max(1, xs.length - 1);
  const se = Math.sqrt(variance / xs.length);
  return { mean, t: se > 0 ? mean / se : 0 };
}
