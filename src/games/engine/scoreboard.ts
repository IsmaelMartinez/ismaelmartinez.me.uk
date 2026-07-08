/**
 * Wires the HighScoreTable.astro panel to a game's run-end flow.
 *
 * A game calls `show(score)` from its game-over screen: if the score charts,
 * the "enter your initials" form appears; confirming (or restarting — the
 * pending score is committed with the last-used initials so it is never
 * lost) writes the entry and renders the top-10 with the new row lit up.
 */
import {
  loadTable,
  qualifies,
  submitScore,
  topEntry,
  loadInitials,
  saveInitials,
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

const formatScore = (score: number): string => score.toString().padStart(6, '0');

export function initScoreboard(
  panel: HTMLElement | null,
  options: ScoreboardOptions = {}
): Scoreboard {
  // Games stay functional if the panel is missing from the page.
  if (!panel) {
    return { show() {}, hide() {}, top: () => null };
  }

  const gameId = panel.dataset.hsGame || '';
  const form = panel.querySelector<HTMLFormElement>('.hs-entry');
  const input = panel.querySelector<HTMLInputElement>('.hs-input');
  const list = panel.querySelector<HTMLOListElement>('.hs-list');
  const empty = panel.querySelector<HTMLElement>('.hs-empty');

  let pendingScore: number | null = null;

  function renderTable(highlightRank = 0) {
    if (!list) return;
    const table = loadTable(gameId);
    list.textContent = '';
    table.forEach((entry, i) => {
      const row = document.createElement('li');
      row.className = 'hs-row' + (i + 1 === highlightRank ? ' hs-current' : '');
      for (const [cls, text] of [
        ['hs-rank', `${i + 1}.`],
        ['hs-initials', entry.initials.padEnd(INITIALS_LENGTH, ' ')],
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
    const initials = input && input.value.trim() ? input.value : loadInitials();
    const rank = submitScore(gameId, initials, pendingScore);
    pendingScore = null;
    saveInitials(initials);
    if (form) form.hidden = true;
    renderTable(rank);
    if (focusResult) {
      const row = list?.querySelector<HTMLElement>('.hs-current');
      row?.scrollIntoView({ block: 'nearest' });
    }
    const saved = rank > 0 ? loadTable(gameId)[rank - 1] : null;
    if (saved) options.onSave?.(saved, rank);
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
      const pos = input.selectionStart;
      input.value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (pos !== null) input.setSelectionRange(pos, pos);
    });
  }

  return {
    show(score: number) {
      pendingScore = null;
      panel.hidden = false;
      if (qualifies(loadTable(gameId), score) && form && input) {
        pendingScore = score;
        form.hidden = false;
        input.value = loadInitials();
        renderTable();
        input.focus();
        input.select();
      } else {
        if (form) form.hidden = true;
        renderTable();
      }
    },
    hide() {
      commit(false);
      panel.hidden = true;
    },
    top: () => topEntry(gameId)
  };
}
