/**
 * Generate a deterministic CSS gradient from a seed string (e.g. article slug).
 * Used as a fallback hero when an article has no heroImage set.
 */
export function getArticleGradient(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(i);
    hash |= 0;
  }
  const hue1 = Math.abs(hash) % 360;
  const hue2 = (hue1 + 45) % 360;
  return `linear-gradient(135deg, hsl(${hue1}, 60%, 55%) 0%, hsl(${hue2}, 65%, 40%) 100%)`;
}
