/**
 * Wires the HighScoreTable.astro panel to a game's run-end flow.
 *
 * A game calls `show(score)` from its game-over screen (after making the
 * overlay visible, so the input can take focus): if the score charts, the
 * "enter your initials" form appears; confirming writes the entry and
 * renders the top-10 with the new row lit up. A pending score is never
 * lost — restarting, navigating away, or closing the tab commits it with
 * the last-used initials.
 */
import {
  loadTable,
  qualifies,
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
    return { show() {}, hide() {}, top: () => null };
  }

  const form = panel.querySelector<HTMLFormElement>('.hs-entry');
  const input = panel.querySelector<HTMLInputElement>('.hs-input');
  const list = panel.querySelector<HTMLOListElement>('.hs-list');
  const empty = panel.querySelector<HTMLElement>('.hs-empty');

  let pendingScore: number | null = null;

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
    if (empty) empty.hidden = table.length > 0;
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
  // (tab close, back button, or an Astro ClientRouter navigation).
  const commitPending = () => commit(false);
  window.addEventListener('pagehide', commitPending);
  document.addEventListener('astro:before-swap', commitPending);

  return {
    show(score: number) {
      pendingScore = null;
      panel.hidden = false;
      const table = loadTable(gameId!);
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
      panel.hidden = true;
    },
    top: () => topEntry(gameId!)
  };
}
