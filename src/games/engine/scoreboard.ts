/**
 * Wires the HighScoreTable.astro panel to a game's run-end flow.
 *
 * There is one board: the shared one every visitor sees, served by
 * `api/scores.ts` through `globalScores.ts`. The panel used to show a second,
 * per-device table behind a pair of tabs, and gate the world submission on the
 * score charting *there* — so once a player's own ten-row table filled up,
 * their later runs stopped reaching the shared board entirely, however good
 * they were. Removing the device table removes that gate with it: every
 * finished run worth more than nothing is now offered to the world board.
 *
 * A score is never lost on the way there. Restarting, navigating away, or
 * closing the tab commits a pending run with the last-used initials, so the
 * only thing the initials form decides is whether the player is interrupted
 * to type them — never whether the run counts.
 *
 * The board is refetched when the panel initialises and again at every run
 * end, which is what a player has instead of a refresh button.
 */
import {
  qualifies,
  loadBest,
  saveBest,
  loadInitials,
  saveInitials,
  sanitizeInitials,
  filterInitials,
  formatScore,
  INITIALS_LENGTH,
  type ScoreEntry
} from './highscores';
import { fetchGlobal, submitGlobal } from './globalScores';

export interface Scoreboard {
  /** Present a finished run's score on the game-over screen. */
  show(score: number): void;
  /** Hide the panel (call when a new game starts); commits any pending entry. */
  hide(): void;
  /**
   * Snapshot the current best as the starting run's baseline and re-arm the
   * one-time record celebration. Call from the game's startRun.
   */
  beginRun(): void;
  /**
   * Bank a run's score as it grows: keep it (a closed tab keeps it), fold it
   * into the tracked best, and report whether the run just beat its baseline.
   * `best` drives the HUD "Best" readout; `newRecord` is true exactly once per
   * run — never for a zero baseline, since a first-ever score is not a beaten
   * record — and drives the one-time record toast.
   */
  bank(score: number): RunRecordBank;
  /** Current personal best, for init-time HUD seeding. */
  best(): number;
}

export interface RunRecordBank {
  best: number;
  newRecord: boolean;
}

/**
 * Pure run-record state machine behind `beginRun`/`bank`/`best`, kept separate
 * from the DOM wiring so it can be unit-tested. `stash` is the injected
 * storage seam and is the only write path to the persisted best, so the number
 * in memory and the one on disk cannot drift apart.
 *
 * It is invoked exactly when the best actually moves. That is also the only
 * time it could achieve anything: the persisted value is a maximum, so
 * stashing anything lower is a no-op that costs a storage round trip, and
 * long-running cabinets bank on every gain.
 */
export function createRunRecord(
  initialBest: number,
  stash: (score: number) => void
): Pick<Scoreboard, 'beginRun' | 'bank' | 'best'> {
  let best = initialBest;
  let baseline = 0;
  // Armed by beginRun; banking before the first run never celebrates.
  let celebrated = true;
  return {
    beginRun() {
      baseline = best;
      celebrated = false;
    },
    bank(score: number): RunRecordBank {
      if (score > best) {
        best = score;
        stash(score);
      }
      const newRecord = !celebrated && baseline > 0 && score > baseline;
      if (newRecord) celebrated = true;
      return { best, newRecord };
    },
    best: () => best
  };
}

/** The text templates the panel's status line draws from. */
export interface WorldNoteText {
  loading: string;
  unavailable: string;
  rank: string;
  notSaved: string;
  rateLimited: string;
}

/**
 * The panel's status line, kept pure so it can be unit-tested apart from the
 * DOM wiring. Five states: a run refused for being over the submission rate
 * limit, a run whose submission otherwise did not land, a board still
 * loading, a board that could not be reached, or a placed rank.
 *
 * A failed or rate-limited submission speaks first and regardless of the
 * board's own state, because it is the only thing on this panel the player
 * might act on. It is also the only trace such a run leaves: with no
 * per-device table behind it any more, a score that does not reach the shared
 * board is gone, so saying nothing would mean a rate-limited or offline player
 * simply watching their run disappear. The two are kept apart rather than
 * sharing `notSaved`'s copy: a rate limit means "try again later", not
 * "something is broken", and a grinding session can hit the API's hourly cap
 * well before ten distinct scores have charted, long before anything is
 * actually wrong.
 *
 * The rank is shown only when it points at a real row of the board being drawn
 * (`count`). A submission sets the rank alongside the board it charted on, but
 * a later refetch can swap in a CDN-cached read taken before that score
 * propagated — a board that no longer holds the entry, often empty — while the
 * rank stays put. Drawing "World rank #1" over that board is the bug where the
 * panel reads "No scores yet" and "World rank #1" at once, so a rank past the
 * board's end is treated as no placement rather than a claim about an absent
 * row.
 */
export function worldNoteText(
  state: {
    loaded: boolean;
    pending: boolean;
    rank: number;
    count: number;
    failed: boolean;
    rateLimited: boolean;
  },
  text: WorldNoteText
): string {
  if (state.rateLimited) return text.rateLimited;
  if (state.failed) return text.notSaved;
  if (!state.loaded) return state.pending ? text.loading : text.unavailable;
  return state.rank > 0 && state.rank <= state.count
    ? text.rank.replace('{rank}', String(state.rank))
    : '';
}

export interface ScoreboardOptions {
  /** Called after a finished run has been committed, with its world rank. */
  onSave?: (entry: ScoreEntry, rank: number) => void;
}

export function initScoreboard(
  panel: HTMLElement | null,
  options: ScoreboardOptions = {}
): Scoreboard {
  // Games stay functional if the panel (or its board identity) is missing.
  const hsGame = panel?.dataset.hsGame;
  if (!panel || !hsGame) {
    return {
      show() {},
      hide() {},
      ...createRunRecord(0, () => {})
    };
  }
  // Narrowed once here, so the closures below need no non-null assertions.
  const gameId: string = hsGame;

  const form = panel.querySelector<HTMLFormElement>('.hs-entry');
  const input = panel.querySelector<HTMLInputElement>('.hs-input');
  const list = panel.querySelector<HTMLOListElement>('.hs-list');
  const empty = panel.querySelector<HTMLElement>('.hs-empty');
  const note = panel.querySelector<HTMLElement>('.hs-note');
  // Runtime-composed strings ride in on data attributes, the repo's channel
  // for copy that server-side `useTranslations` cannot render.
  const worldText = {
    loading: panel.dataset.tWorldLoading ?? '',
    unavailable: panel.dataset.tWorldUnavailable ?? '',
    rank: panel.dataset.tWorldRank ?? '',
    notSaved: panel.dataset.tScoreNotSaved ?? '',
    rateLimited: panel.dataset.tScoreRateLimited ?? ''
  };

  // Declared up here because `commit` records a finished run through the
  // record rather than writing storage behind its back: the personal best the
  // HUD reads and the one on disk are then the same number by construction.
  // `bank` is the only way in, so there is no second write path to keep honest.
  const runRecord = createRunRecord(loadBest(gameId), score => saveBest(gameId, score));

  let pendingScore: number | null = null;
  // The board as last known. Empty until a fetch or a submission answers,
  // which is why `loaded` exists separately: "not loaded" and "loaded and
  // empty" look identical in the data and must not read the same on screen.
  let table: ScoreEntry[] = [];
  let loaded = false;
  let fetching = false;
  // Generation of the newest board that has landed. Only a submission's own
  // reply bumps it, because that is the one answer guaranteed to include the
  // score just written; a fetch is served from whatever the CDN holds and so
  // can be older than the moment it was issued. Both paths note the generation
  // when they start and stand down if it moved while they were out, so an
  // overtaken or out-of-order reply can never put an older board back.
  let worldGen = 0;
  let rank = 0;
  // Bumped by every `show()`. A submission can still be in flight when the
  // next run ends (the POST allows five seconds, a short run takes less), and
  // without this its reply would pin the previous run's rank onto the current
  // one. Responses can also arrive out of order, so the check is against the
  // token the submit was issued under, not a plain "is newer".
  let runToken = 0;
  // Set when this run's submission was attempted and did not land. Cleared by
  // the next run and by any submission that succeeds.
  let failed = false;
  // Set when this run's submission was refused for being over the rate limit,
  // as opposed to any other failure. Cleared the same way as `failed`.
  let rateLimited = false;

  function render() {
    if (!list) return;
    list.textContent = '';
    table.forEach((entry, i) => {
      const row = document.createElement('li');
      row.className = 'hs-row' + (i + 1 === rank ? ' hs-current' : '');
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
    // nor on a board that has not answered yet: the note speaks there.
    if (empty) {
      empty.hidden = !loaded || table.length > 0 || !(form?.hidden ?? true);
    }
    if (note) {
      // The rank rides on the board actually drawn, so a stale refetch that
      // empties the board can't leave "World rank #1" over it.
      const message = worldNoteText(
        { loaded, pending: fetching, rank, count: table.length, failed, rateLimited },
        worldText
      );
      note.textContent = message;
      note.hidden = message === '';
    }
  }

  /**
   * Fetches the shared board. Runs at init and again at every run end, so the
   * board a player is shown after a game is the board as it stood then, not a
   * snapshot from whenever the page happened to load.
   */
  function loadWorld() {
    if (fetching) return;
    fetching = true;
    const gen = worldGen;
    render();
    fetchGlobal().then(boards => {
      fetching = false;
      // A submission that landed while this was in flight has already written
      // a fresher board, so this reply is dropped rather than applied. Reads
      // are CDN-cached for half a minute, which is easily long enough for the
      // answer here to predate the score the player just posted, and applying
      // it would take their own entry back off the board in front of them.
      if (gen !== worldGen) return;
      // A refresh that fails keeps whatever was already on screen: a flaky
      // network should not turn a loaded board into "unavailable". The first
      // fetch has nothing to keep, so a failure there still reads as one.
      if (boards) {
        table = boards[gameId] ?? [];
        loaded = true;
      }
      render();
    });
  }

  function commit(focusResult: boolean) {
    if (pendingScore === null) return;
    const initials = sanitizeInitials(
      input && input.value.trim() ? input.value : loadInitials()
    );
    const score = pendingScore;
    pendingScore = null;
    saveInitials(initials);
    // A finished run is a personal-best candidate even in a game that never
    // banks mid-run, so the attract-screen readouts stay honest. Routed
    // through the record so `best()` cannot fall behind what is on disk.
    runRecord.bank(score);
    if (form) form.hidden = true;
    failed = false;
    rateLimited = false;
    render();

    const token = runToken;
    const gen = worldGen;
    // `submitGlobal` never rejects; it reports whether the score landed, was
    // refused, or was deliberately never offered.
    submitGlobal(gameId, initials, score).then(result => {
      // Two runs can have submissions out at once (five seconds are allowed
      // for one and a short run ends well inside that), and replies can arrive
      // in either order. A newer one landing first has already put a board on
      // screen that this older answer predates, so it stands down. Binding the
      // value rather than a flag keeps the narrowing below.
      const fresh = result.status === 'ok' && gen === worldGen ? result : null;
      if (fresh) {
        // The freshest board there is: it came back from the write itself, so
        // it supersedes any fetch still in flight too.
        worldGen++;
        table = fresh.table;
        loaded = true;
      }
      // The board lands whichever run it came from; the rank and the failure
      // notice belong to one run and are dropped once that run is past.
      if (token === runToken) {
        if (fresh) rank = fresh.rank;
        else if (result.status === 'limited') rateLimited = true;
        else if (result.status === 'failed') failed = true;
      }
      render();
      if (fresh && focusResult && token === runToken && rank > 0) {
        const row = list?.querySelector<HTMLElement>('.hs-current');
        row?.scrollIntoView({ block: 'nearest' });
      }
      // Fires once per committed run whatever became of it, which is the
      // contract: a run that could not be saved is still a finished run, and
      // a consumer refreshing a HUD from it must not be skipped just because
      // the network was down. Rank 0 means "did not chart", including when
      // there was no answer to chart against.
      options.onSave?.({ initials, score }, result.status === 'ok' ? result.rank : 0);
    });
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

  loadWorld();

  return {
    ...runRecord,
    show(score: number) {
      panel.hidden = false;
      rank = 0;
      failed = false;
      rateLimited = false;
      runToken++;
      // Every run counts, whether or not the player is asked for initials:
      // an unanswered form is committed with the remembered ones.
      pendingScore = score > 0 ? score : null;
      // Interrupt for initials only when the run would actually chart. A board
      // that has not loaded gets the benefit of the doubt, since guessing
      // wrong here costs nothing but a prompt.
      const charts = pendingScore !== null && (!loaded || qualifies(table, score));
      if (charts && form && input) {
        form.hidden = false;
        input.value = loadInitials();
        render();
        input.focus();
        input.select();
      } else {
        if (form) form.hidden = true;
        render();
      }
      // Refreshed after rendering, so the panel appears instantly with the
      // board it already had rather than blanking while the fetch is out.
      loadWorld();
    },
    hide() {
      commit(false);
      panel.hidden = true;
    }
  };
}
