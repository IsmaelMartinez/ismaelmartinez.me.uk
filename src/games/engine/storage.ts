/**
 * localStorage-backed score persistence shared by arcade games.
 * All access is guarded so games still work where storage is unavailable
 * (private browsing, blocked cookies, SSR).
 */
export function loadScore(key: string): number {
  try {
    return parseInt(localStorage.getItem(key) || '0', 10) || 0;
  } catch {
    return 0;
  }
}

export function saveScore(key: string, value: number): void {
  try {
    localStorage.setItem(key, value.toString());
  } catch {
    // Storage unavailable; score simply won't persist.
  }
}

/** Persists `score` only if it beats the stored value. Returns the current high score. */
export function recordHighScore(key: string, score: number): number {
  const high = loadScore(key);
  if (score > high) {
    saveScore(key, score);
    return score;
  }
  return high;
}
