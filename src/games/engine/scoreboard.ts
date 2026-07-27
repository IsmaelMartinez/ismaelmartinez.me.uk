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
 *
 * The panel shows two boards through one list: the device table above, and
 * the board every visitor shares behind the World tab. The world board is
 * fetched lazily (nobody pays for it until they ask) and every committed
 * score is offered to it, so the two tabs are written by the same commit.
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
import { fetchGlobal, submitGlobal } from './globalScores';

/** Which board the panel is currently drawing into its single list. */
type Scope = 'device' | 'world';

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
  /**
   * Snapshot the current best as the starting run's baseline and re-arm the
   * one-time record celebration. Call from the game's startRun.
   */
  beginRun(): void;
  /**
   * Bank a run's score as it grows: stash it (a closed tab keeps it), fold
   * it into the tracked best, and report whether the run just beat its
   * baseline. `best` drives the HUD "Best" readout; `newRecord` is true
   * exactly once per run — never for a zero baseline, since a first-ever
   * score is not a beaten record — and drives the one-time record toast.
   */
  bank(score: number): RunRecordBank;
  /** Stash-aware current best, for init-time HUD seeding. */
  best(): number;
}

export interface RunRecordBank {
  best: number;
  newRecord: boolean;
}

/**
 * Pure run-record state machine behind `beginRun`/`bank`/`best`, kept
 * separate from the DOM wiring so it can be unit-tested. `stash` is only
 * invoked when the run's own best grows (stashing a non-improved score is
 * a no-op anyway, and the guard spares a table load per bank call).
 */
export function createRunRecord(
  initialBest: number,
  stash: (score: number) => void
): Pick<Scoreboard, 'beginRun' | 'bank' | 'best'> {
  let best = initialBest;
  let baseline = 0;
  // Armed by beginRun; banking before the first run never celebrates.
  let celebrated = true;
  let runBest = 0;
  return {
    beginRun() {
      baseline = best;
      celebrated = false;
      runBest = 0;
    },
    bank(score: number): RunRecordBank {
      if (score > runBest) {
        runBest = score;
        stash(score);
      }
      if (score > best) best = score;
      const newRecord = !celebrated && baseline > 0 && score > baseline;
      if (newRecord) celebrated = true;
      return { best, newRecord };
    },
    best: () => best
  };
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
    return {
      show() {},
      hide() {},
      stash() {},
      top: () => null,
      ...createRunRecord(0, () => {})
    };
  }

  const form = panel.querySelector<HTMLFormElement>('.hs-entry');
  const input = panel.querySelector<HTMLInputElement>('.hs-input');
  const list = panel.querySelector<HTMLOListElement>('.hs-list');
  const empty = panel.querySelector<HTMLElement>('.hs-empty');
  const note = panel.querySelector<HTMLElement>('.hs-note');
  const tabs = [...panel.querySelectorAll<HTMLButtonElement>('.hs-tab')];
  // Runtime-composed strings ride in on data attributes, the repo's channel
  // for copy that server-side `useTranslations` cannot render.
  const worldText = {
    loading: panel.dataset.tWorldLoading ?? '',
    unavailable: panel.dataset.tWorldUnavailable ?? '',
    rank: panel.dataset.tWorldRank ?? ''
  };

  let pendingScore: number | null = null;
  let scope: Scope = 'device';
  // Null until a world fetch resolves. Null after a failed one too, which is
  // why `worldPending` exists: "not loaded" and "unreachable" look the same
  // in the data and must not read the same on screen.
  let world: Record<string, ScoreEntry[]> | null = null;
  let worldPending = false;
  // Bumped by every world fetch and by every landed submission, so a reply
  // that has been overtaken can tell and stand down.
  let worldFetch = 0;
  // Kept per scope so switching tabs highlights the row that scope ranked.
  let deviceRank = 0;
  let worldRank = 0;
  // Bumped by every `show()`. A global submit can still be in flight when the
  // next run ends (the POST allows five seconds, a short run takes less), and
  // without this its reply would pin the previous run's world rank onto the
  // current one. Responses can also arrive out of order, so the check is
  // against the token the submit was issued under, not a plain "is newer".
  let runToken = 0;
  // This run's provisional entry already written to the table — kept whole
  // (not just the score) so it is still found if the saved initials change
  // in the meantime, e.g. via a commit in another tab.
  let stashed: ScoreEntry | null = null;

  /** Lifts this run's provisional entry back out of a loaded table. */
  function unstash(table: ScoreEntry[]): ScoreEntry[] {
    return stashed === null ? table : removeEntry(table, stashed.initials, stashed.score);
  }

  /** The world tab's status line: loading, unreachable, or a placed rank. */
  function noteText(): string {
    if (scope !== 'world') return '';
    if (!world) return worldPending ? worldText.loading : worldText.unavailable;
    return worldRank > 0 ? worldText.rank.replace('{rank}', String(worldRank)) : '';
  }

  /**
   * Draws the active scope into the one list. `deviceTable` lets `show()`
   * hand over the table it has already unstashed rather than re-reading it.
   */
  function render(deviceTable?: ScoreEntry[]) {
    if (!list) return;
    const worldScope = scope === 'world';
    const table = worldScope ? (world?.[gameId!] ?? []) : (deviceTable ?? loadTable(gameId!));
    const highlightRank = worldScope ? worldRank : deviceRank;
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
    // The "no scores yet" nudge makes no sense under an open initials form,
    // nor on a world board that has not answered yet: the note speaks there.
    if (empty) {
      empty.hidden = (worldScope && !world) || table.length > 0 || !(form?.hidden ?? true);
    }
    if (note) {
      const message = noteText();
      note.textContent = message;
      note.hidden = message === '';
    }
  }

  function syncTabs() {
    for (const tab of tabs) {
      tab.setAttribute('aria-selected', String((tab.dataset.hsScope ?? 'device') === scope));
    }
  }

  /** One fetch per panel, on the first visit to the World tab. */
  function loadWorld() {
    if (worldPending) return;
    worldPending = true;
    const token = ++worldFetch;
    render();
    fetchGlobal().then(boards => {
      worldPending = false;
      // A submission that landed while this was in flight has already written
      // a fresher board, so this reply is dropped rather than applied. Reads
      // are CDN-cached for half a minute, which is easily long enough for the
      // answer here to predate the score the player just posted, and applying
      // it would take their own entry back off the board in front of them.
      if (token !== worldFetch) return;
      world = boards;
      render();
    });
  }

  for (const tab of tabs) {
    tab.addEventListener('click', () => {
      const next: Scope = tab.dataset.hsScope === 'world' ? 'world' : 'device';
      if (next === scope) return;
      scope = next;
      syncTabs();
      if (scope === 'world' && !world) loadWorld();
      render();
    });
  }

  function commit(focusResult: boolean) {
    if (pendingScore === null) return;
    const initials = sanitizeInitials(
      input && input.value.trim() ? input.value : loadInitials()
    );
    const score = pendingScore;
    const rank = submitScore(gameId!, initials, score);
    pendingScore = null;
    deviceRank = rank;
    saveInitials(initials);
    if (form) form.hidden = true;
    render();
    if (focusResult) {
      const row = list?.querySelector<HTMLElement>('.hs-current');
      row?.scrollIntoView({ block: 'nearest' });
    }
    if (rank > 0) options.onSave?.({ initials, score }, rank);
    // Offered to the world board even when it missed the device top ten: a
    // device already holding ten better runs can still take a world place,
    // so global submission is gated on the score existing, not on its rank.
    // `submitGlobal` no-ops away from production and never rejects.
    if (score > 0) {
      const token = runToken;
      submitGlobal(gameId!, initials, score).then(result => {
        if (!result) return;
        // The board itself is never stale, so it lands whichever run it came
        // from; only the rank belongs to one run and is dropped once past.
        world = { ...world, [gameId!]: result.table };
        // Supersede any fetch already in flight: its reply can only be older
        // than this one, which came back from the write itself.
        worldFetch++;
        if (token !== runToken) return;
        worldRank = result.rank;
        render();
      });
    }
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

  function stash(score: number) {
    if (stashed !== null && score <= stashed.score) return;
    const table = unstash(loadTable(gameId!));
    if (!qualifies(table, score)) return;
    const initials = loadInitials();
    saveTable(gameId!, insertScore(table, initials, score).table);
    stashed = { initials, score };
  }

  return {
    stash,
    ...createRunRecord(topEntry(gameId)?.score ?? 0, stash),
    show(score: number) {
      pendingScore = null;
      panel.hidden = false;
      // A finished run always lands on the device tab: that is where the
      // initials form sits and where the freshly lit row will appear.
      scope = 'device';
      deviceRank = 0;
      worldRank = 0;
      runToken++;
      syncTabs();
      // The final entry replaces any provisional one from this run.
      const table = unstash(loadTable(gameId!));
      if (stashed !== null) saveTable(gameId!, table);
      stashed = null;
      if (qualifies(table, score) && form && input) {
        pendingScore = score;
        form.hidden = false;
        input.value = loadInitials();
        render(table);
        input.focus();
        input.select();
      } else {
        if (form) form.hidden = true;
        render(table);
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
