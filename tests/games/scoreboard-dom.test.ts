/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { initScoreboard } from '../../src/games/engine/scoreboard';
import { fetchGlobal, submitGlobal } from '../../src/games/engine/globalScores';
import { bestKey } from '../../src/games/engine/highscores';
import { doneKey } from '../../src/games/engine/progress';
import { fullBoard } from './board-fixtures';

vi.mock('../../src/games/engine/globalScores', () => ({
  fetchGlobal: vi.fn(async () => null),
  submitGlobal: vi.fn(async () => ({ status: 'failed' }))
}));

/**
 * The runtime skeleton of HighScoreTable.astro's panel markup. Static test
 * fixture, parsed rather than assigned so no live node ever renders it.
 */
const PANEL_HTML = `
  <div class="hs-panel" id="highscores" data-hs-game="snake" hidden
       data-t-world-loading="Loading world board"
       data-t-world-unavailable="World board unavailable"
       data-t-world-rank="World rank #{rank}"
       data-t-score-not-saved="Score not saved. Try again later">
    <form class="hs-entry" hidden>
      <input class="hs-input" type="text" maxlength="3" />
      <button type="submit" class="hs-ok">OK</button>
    </form>
    <p class="hs-record" hidden>New personal best!</p>
    <ol class="hs-list"></ol>
    <p class="hs-empty" hidden></p>
    <p class="hs-note" hidden></p>
  </div>`;

function buildPanel(): HTMLElement {
  const parsed = new DOMParser().parseFromString(PANEL_HTML, 'text/html');
  document.body.replaceChildren(...parsed.body.children);
  return document.getElementById('highscores')!;
}

const flush = () => new Promise<void>(resolve => setTimeout(resolve, 0));

/**
 * Minimal in-memory localStorage stand-in, as in highscores.test.ts: Node's
 * own experimental `localStorage` global (undefined without
 * --localstorage-file) shadows jsdom's, so the real one is unreachable here.
 */
function installLocalStorage(): void {
  const store: Record<string, string> = {};
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => {
      store[k] = String(v);
    },
    removeItem: (k: string) => {
      delete store[k];
    },
    clear: () => {
      for (const k of Object.keys(store)) delete store[k];
    }
  });
}

beforeEach(() => {
  installLocalStorage();
  vi.clearAllMocks();
  vi.mocked(fetchGlobal).mockResolvedValue(null);
  vi.mocked(submitGlobal).mockResolvedValue({ status: 'failed' });
  // jsdom does not implement scrollIntoView; commit(true) calls it.
  Element.prototype.scrollIntoView = vi.fn();
});

describe('initScoreboard commit()', () => {
  it('offers the shown score to the world board and records it as a personal best', async () => {
    const board = initScoreboard(buildPanel());
    board.show(4210);

    const form = document.querySelector<HTMLFormElement>('.hs-entry')!;
    const input = document.querySelector<HTMLInputElement>('.hs-input')!;
    expect(form.hidden).toBe(false);

    input.value = 'IMR';
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();

    // The number submitted is exactly the number shown to the player.
    expect(submitGlobal).toHaveBeenCalledWith('snake', 'IMR', 4210);
    expect(localStorage.getItem(bestKey('snake'))).toBe('4210');
    expect(localStorage.getItem('arcade-initials')).toBe('IMR');
  });

  /**
   * The regression this change exists for. The panel used to keep a per-device
   * top ten and gate the world submission on the score charting *there*, so a
   * player whose own ten-row table had filled up stopped reaching the shared
   * board entirely — including, as here, with a run the shared board itself
   * had ample room for. Every finished run is offered now; charting only
   * decides whether the player is interrupted for initials.
   */
  it('submits a run that cannot chart, without prompting for initials', async () => {
    vi.mocked(fetchGlobal).mockResolvedValue({ snake: fullBoard() });
    const board = initScoreboard(buildPanel());
    await flush(); // let the init fetch land, so the board is known to be full

    board.show(5); // beaten by all ten rows
    const form = document.querySelector<HTMLFormElement>('.hs-entry')!;
    expect(form.hidden).toBe(true);

    board.hide();
    await flush();
    expect(submitGlobal).toHaveBeenCalledWith('snake', 'AAA', 5);
  });

  it('prompts for initials while the board still has room', async () => {
    vi.mocked(fetchGlobal).mockResolvedValue({ snake: [{ initials: 'AAA', score: 10 }] });
    const board = initScoreboard(buildPanel());
    await flush();

    board.show(5);
    expect(document.querySelector<HTMLFormElement>('.hs-entry')!.hidden).toBe(false);
  });

  it('gives an unreachable board the benefit of the doubt and still prompts', async () => {
    const board = initScoreboard(buildPanel());
    await flush(); // the init fetch resolves null
    board.show(5);
    expect(document.querySelector<HTMLFormElement>('.hs-entry')!.hidden).toBe(false);
  });

  it('never submits a scoreless run', async () => {
    const board = initScoreboard(buildPanel());
    board.show(0);
    board.hide();
    await flush();
    expect(submitGlobal).not.toHaveBeenCalled();
    // A scoreless run is not a finished run for the floor's unlock chain
    // either, matching the personal-best seed (which also needs a score).
    expect(localStorage.getItem(doneKey('snake'))).toBeNull();
  });

  it('records the finished run for the floor unlock chain', async () => {
    // The one place markDone is wired: every cabinet's run end passes through
    // commit(), so the floor needs no per-game wiring.
    const board = initScoreboard(buildPanel());
    board.show(4210);
    board.hide();
    await flush();
    expect(localStorage.getItem(doneKey('snake'))).toBe('1');
  });

  it('auto-commits a pending entry on pagehide with the last-used initials', async () => {
    localStorage.setItem('arcade-initials', 'ZZZ');
    const board = initScoreboard(buildPanel());
    board.show(900);
    window.dispatchEvent(new Event('pagehide'));
    await flush();

    expect(submitGlobal).toHaveBeenCalledWith('snake', 'ZZZ', 900);
  });

  it('commits at most once per shown score', async () => {
    const board = initScoreboard(buildPanel());
    board.show(500);
    const form = document.querySelector<HTMLFormElement>('.hs-entry')!;
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    window.dispatchEvent(new Event('pagehide'));
    board.hide();
    await flush();

    expect(submitGlobal).toHaveBeenCalledTimes(1);
  });
});

describe('initScoreboard board rendering', () => {
  it('fetches the board when the panel initialises', async () => {
    initScoreboard(buildPanel());
    expect(fetchGlobal).toHaveBeenCalledTimes(1);
    await flush();
    // The mock resolves null: the panel must say unavailable, not show an
    // empty board.
    const note = document.querySelector<HTMLElement>('.hs-note')!;
    expect(note.hidden).toBe(false);
    expect(note.textContent).toBe('World board unavailable');
  });

  it('refetches at every run end, which is what a player has instead of a refresh button', async () => {
    const board = initScoreboard(buildPanel());
    await flush();
    expect(fetchGlobal).toHaveBeenCalledTimes(1);

    board.show(100);
    await flush();
    expect(fetchGlobal).toHaveBeenCalledTimes(2);
  });

  it('renders rows from a fetched board', async () => {
    vi.mocked(fetchGlobal).mockResolvedValue({
      snake: [
        { initials: 'AAA', score: 9000 },
        { initials: 'BBB', score: 100 }
      ]
    });
    initScoreboard(buildPanel());
    await flush();

    const rows = [...document.querySelectorAll('.hs-row .hs-initials')].map(el =>
      el.textContent?.trim()
    );
    expect(rows).toEqual(['AAA', 'BBB']);
  });

  it('lights the submitted row and reports its rank', async () => {
    const onSave = vi.fn();
    vi.mocked(submitGlobal).mockResolvedValue({
      status: 'ok',
      rank: 2,
      table: [
        { initials: 'AAA', score: 9000 },
        { initials: 'IMR', score: 4210 }
      ]
    });
    const board = initScoreboard(buildPanel(), { onSave });
    board.show(4210);
    document.querySelector<HTMLInputElement>('.hs-input')!.value = 'IMR';
    document
      .querySelector<HTMLFormElement>('.hs-entry')!
      .dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();

    const row = document.querySelector('.hs-current');
    expect(row?.querySelector('.hs-score')?.textContent).toBe('004210');
    expect(row?.querySelector('.hs-initials')?.textContent?.trim()).toBe('IMR');
    expect(document.querySelector<HTMLElement>('.hs-note')!.textContent).toBe('World rank #2');
    expect(onSave).toHaveBeenCalledWith({ initials: 'IMR', score: 4210 }, 2);
  });

  /*
   * Removing the per-device table removed the fallback a failed submission
   * used to land on, so a run that does not reach the shared board now leaves
   * no trace at all. Saying nothing would mean a rate-limited or offline
   * player watches their score quietly disappear.
   */
  it('tells the player when a submission did not land', async () => {
    const board = initScoreboard(buildPanel());
    board.show(4210);
    board.hide();
    await flush();

    const note = document.querySelector<HTMLElement>('.hs-note')!;
    expect(note.hidden).toBe(false);
    expect(note.textContent).toBe('Score not saved. Try again later');
  });

  it('says nothing where a submission was never attempted', async () => {
    // Local dev and preview deployments read the real board but never write to
    // it, so reporting an unsaved score there would be a lie.
    vi.mocked(submitGlobal).mockResolvedValue({ status: 'skipped' });
    const board = initScoreboard(buildPanel());
    await flush();
    board.show(4210);
    board.hide();
    await flush();

    expect(document.querySelector<HTMLElement>('.hs-note')!.textContent).toBe(
      'World board unavailable'
    );
  });

  it('clears a previous run\'s failure notice when the next run ends', async () => {
    const board = initScoreboard(buildPanel());
    board.show(4210);
    board.hide();
    await flush();
    expect(document.querySelector<HTMLElement>('.hs-note')!.textContent).toBe(
      'Score not saved. Try again later'
    );

    vi.mocked(submitGlobal).mockResolvedValue({
      status: 'ok',
      rank: 1,
      table: [{ initials: 'IMR', score: 50 }]
    });
    board.show(50);
    await flush();
    expect(document.querySelector<HTMLElement>('.hs-note')!.textContent).not.toBe(
      'Score not saved. Try again later'
    );
  });

  /*
   * `onSave` is the hook a game refreshes its HUD from, so skipping it when
   * the network is down would leave the readout stale for the rest of the
   * session. A run that could not be saved is still a finished run.
   */
  it('reports every committed run to onSave, landed or not', async () => {
    const onSave = vi.fn();
    const board = initScoreboard(buildPanel(), { onSave });
    board.show(4210);
    board.hide();
    await flush();
    expect(onSave).toHaveBeenCalledWith({ initials: 'AAA', score: 4210 }, 0);
  });

  /*
   * Tank Duel never calls bank(), so before this the commit wrote the personal
   * best straight to storage and left the record's cached value behind until a
   * reload, leaving two answers to the same question inside one session.
   */
  it('keeps best() and stored best in step for a game that never banks', async () => {
    const board = initScoreboard(buildPanel());
    expect(board.best()).toBe(0);
    board.show(4210);
    board.hide();
    await flush();

    expect(board.best()).toBe(4210);
    expect(localStorage.getItem(bestKey('snake'))).toBe('4210');
  });

  /*
   * The regression behind issue #284. A record is most often beaten in the
   * same breath as the game-over overlay goes up, and the toast the cabinets
   * raise there is painted behind that overlay and spent — `newRecord` fires
   * once per run and never again. Raising the toast stack instead drops an
   * opaque pill on the overlay's own buttons, so the panel inside the overlay
   * says it.
   */
  const recordLine = () => document.querySelector<HTMLElement>('.hs-record')!;

  it('announces a beaten personal best on the panel the overlay carries', () => {
    localStorage.setItem(bestKey('snake'), '100');
    const board = initScoreboard(buildPanel());
    board.beginRun();
    // As a cabinet does it: bank the run, then raise the overlay and show.
    expect(board.bank(150).newRecord).toBe(true);
    board.show(150);
    expect(recordLine().hidden).toBe(false);
  });

  it('says nothing for a run that did not beat the best', () => {
    localStorage.setItem(bestKey('snake'), '100');
    const board = initScoreboard(buildPanel());
    board.beginRun();
    board.bank(90);
    board.show(90);
    expect(recordLine().hidden).toBe(true);
  });

  /*
   * The toast is one-shot and the panel is not: a record set in the first
   * minute of a long sim has to still be reported at the end of it, including
   * when the final score has fallen back under it (Syndicate banks takings
   * that can be spent again).
   */
  it('reports a record set earlier in the run, whatever the final score', () => {
    localStorage.setItem(bestKey('snake'), '100');
    const board = initScoreboard(buildPanel());
    board.beginRun();
    board.bank(500);
    board.bank(300);
    board.show(300);
    expect(recordLine().hidden).toBe(false);
  });

  it('clears the record line for the next run', () => {
    localStorage.setItem(bestKey('snake'), '100');
    const board = initScoreboard(buildPanel());
    board.beginRun();
    board.bank(150);
    board.show(150);
    board.hide();
    board.beginRun();
    board.bank(120); // under the 150 this run starts from
    board.show(120);
    expect(recordLine().hidden).toBe(true);
  });

  it('degrades to inert no-ops without a panel', () => {
    const board = initScoreboard(null);
    expect(board.best()).toBe(0);
    expect(() => {
      board.show(100);
      board.hide();
      board.beginRun();
      board.bank(10);
    }).not.toThrow();
    // The run record still tracks a best in memory, so a game's HUD keeps
    // working; what a panel-less board must not do is touch storage or the
    // network on the way there.
    expect(board.best()).toBe(10);
    expect(localStorage.getItem(bestKey('snake'))).toBeNull();
    expect(submitGlobal).not.toHaveBeenCalled();
    expect(fetchGlobal).not.toHaveBeenCalled();
  });
});
