const KEY = "the-beginning-of-crazy-animals-highscore";
// Previous key, kept so existing players don't lose their best on the rename.
const LEGACY_KEY = "crazy-animal-galaxy-highscore";

export function getHighScore(): number {
  try {
    const raw = localStorage.getItem(KEY) ?? localStorage.getItem(LEGACY_KEY);
    const n = raw ? parseInt(raw, 10) : 0;
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

// Stores the score if it beats the stored best. Returns the (possibly new) best.
export function submitScore(score: number): number {
  const best = getHighScore();
  if (score > best) {
    try {
      localStorage.setItem(KEY, String(score));
    } catch {
      // ignore (e.g. private mode) — just don't persist
    }
    return score;
  }
  return best;
}
