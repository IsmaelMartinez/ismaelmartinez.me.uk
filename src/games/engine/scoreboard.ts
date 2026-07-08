/**
 * Wires the HighScoreTable.astro panel to a game's run-end flow.
 *
 * A game calls `show(score)` from its game-over screen (after making the
 * overlay visible, so the input can take focus): if the score charts, the
 * "enter your initials" form appears; confirming writes the entry and
 * renders the top-10 with the new row lit up. A score is never lost —
 * restarting, navigating away, or closing the tab commits a pending entry
 * with the last-used initials, and long-running games can `stash()` the
 * current run's best as they go so a mid-run tab close keeps it too.
 */
import {
  loadTable,
  saveTable,
  qualifies,
  insertScore,
  removeEntry,
  submitScore,
  topEntry,
  loadInitials,
  saveInitials,
  sanitizeInitials,
  filterInitials,
  formatScore,
  INITIALS_LENGTH,
  type ScoreEntry
} from './highscores';

export interface Scoreboard {
  /** Present a finished run's score on the game-over screen. */
  show(score: number): void;
  /** Hide the panel (call when a new game starts); commits any pending entry. */
  hide(): void;
  /**
   * Persist the current run's best immediately, as a provisional entry under
   * the last-used initials. Call whenever a long run's score grows (it
   * no-ops unless the score charts); the entry is upgraded in place as the
   * run continues and replaced by the final `show()`/commit entry, so a
   * mid-run tab close can't lose a record the HUD already displayed.
   */
  stash(score: number): void;
  /** Current #1 entry, for "best" HUD readouts. */
  top(): ScoreEntry | null;
}

export interface ScoreboardOptions {
  /** Called after an entry lands on the table (including auto-commits). */
  onSave?: (entry: ScoreEntry, rank: number) => void;
}

export function initScoreboard(
  panel: HTMLElement | null,
  options: ScoreboardOptions = {}
): Scoreboard {
  // Games stay functional if the panel (or its table identity) is missing.
  const gameId = panel?.dataset.hsGame;
  if (!panel || !gameId) {
    return { show() {}, hide() {}, stash() {}, top: () => null };
  }

  const form = panel.querySelector<HTMLFormElement>('.hs-entry');
  const input = panel.querySelector<HTMLInputElement>('.hs-input');
  const list = panel.querySelector<HTMLOListElement>('.hs-list');
  const empty = panel.querySelector<HTMLElement>('.hs-empty');

  let pendingScore: number | null = null;
  // This run's provisional entry already written to the table — kept whole
  // (not just the score) so it is still found if the saved initials change
  // in the meantime, e.g. via a commit in another tab.
  let stashed: ScoreEntry | null = null;

  /** Lifts this run's provisional entry back out of a loaded table. */
  function unstash(table: ScoreEntry[]): ScoreEntry[] {
    return stashed === null ? table : removeEntry(table, stashed.initials, stashed.score);
  }

  function renderTable(highlightRank = 0, table = loadTable(gameId!)) {
    if (!list) return;
    list.textContent = '';
    table.forEach((entry, i) => {
      const row = document.createElement('li');
      row.className = 'hs-row' + (i + 1 === highlightRank ? ' hs-current' : '');
      for (const [cls, text] of [
        ['hs-rank', `${i + 1}.`],
        ['hs-initials', entry.initials.padEnd(INITIALS_LENGTH, ' ')],
        ['hs-score', formatScore(entry.score)]
      ]) {
        const cell = document.createElement('span');
        cell.className = cls;
        cell.textContent = text;
        row.appendChild(cell);
      }
      list.appendChild(row);
    });
    // The "no scores yet" nudge makes no sense under an open initials form.
    if (empty) empty.hidden = table.length > 0 || !(form?.hidden ?? true);
  }

  function commit(focusResult: boolean) {
    if (pendingScore === null) return;
    const initials = sanitizeInitials(
      input && input.value.trim() ? input.value : loadInitials()
    );
    const score = pendingScore;
    const rank = submitScore(gameId!, initials, score);
    pendingScore = null;
    saveInitials(initials);
    if (form) form.hidden = true;
    renderTable(rank);
    if (focusResult) {
      const row = list?.querySelector<HTMLElement>('.hs-current');
      row?.scrollIntoView({ block: 'nearest' });
    }
    if (rank > 0) options.onSave?.({ initials, score }, rank);
  }

  if (form) {
    form.addEventListener('submit', e => {
      e.preventDefault();
      commit(true);
    });
  }

  if (input) {
    // Keep game-wide key handlers (WASD, arrows, pause) away from typing.
    input.addEventListener('keydown', e => e.stopPropagation());
    input.addEventListener('input', () => {
      const raw = input.value;
      const pos = input.selectionStart ?? raw.length;
      // Restore the caret relative to what survived the filter, so a
      // rejected character doesn't shove it one slot to the right.
      const caret = filterInitials(raw.slice(0, pos)).length;
      input.value = filterInitials(raw);
      input.setSelectionRange(caret, caret);
    });
  }

  // A pending score must survive leaving the page from the game-over screen
  // (tab close, back button, or an Astro ClientRouter navigation). A swap
  // replaces this board's DOM, so it also retires both listeners — otherwise
  // each visit to a game would leave a stale closure behind.
  const commitPending = () => commit(false);
  const onSwap = () => {
    commitPending();
    document.removeEventListener('astro:before-swap', onSwap);
    window.removeEventListener('pagehide', commitPending);
  };
  window.addEventListener('pagehide', commitPending);
  document.addEventListener('astro:before-swap', onSwap);

  return {
    stash(score: number) {
      if (stashed !== null && score <= stashed.score) return;
      const table = unstash(loadTable(gameId!));
      if (!qualifies(table, score)) return;
      const initials = loadInitials();
      saveTable(gameId!, insertScore(table, initials, score).table);
      stashed = { initials, score };
    },
    show(score: number) {
      pendingScore = null;
      panel.hidden = false;
      // The final entry replaces any provisional one from this run.
      const table = unstash(loadTable(gameId!));
      if (stashed !== null) saveTable(gameId!, table);
      stashed = null;
      if (qualifies(table, score) && form && input) {
        pendingScore = score;
        form.hidden = false;
        input.value = loadInitials();
        renderTable(0, table);
        input.focus();
        input.select();
      } else {
        if (form) form.hidden = true;
        renderTable(0, table);
      }
    },
    hide() {
      commit(false);
      // A provisional entry from the ending run stays in the table as-is;
      // the next run must not claim (and later replace) it.
      stashed = null;
      panel.hidden = true;
    },
    top: () => topEntry(gameId!)
  };
}
