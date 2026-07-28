/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { initScoreboard } from '../../src/games/engine/scoreboard';
import { fetchGlobal, submitGlobal } from '../../src/games/engine/globalScores';
import { tableKey } from '../../src/games/engine/highscores';

vi.mock('../../src/games/engine/globalScores', () => ({
  fetchGlobal: vi.fn(async () => null),
  submitGlobal: vi.fn(async () => null)
}));

/**
 * The runtime skeleton of HighScoreTable.astro's panel markup. Static test
 * fixture, parsed rather than assigned so no live node ever renders it.
 */
const PANEL_HTML = `
  <div class="hs-panel" id="highscores" data-hs-game="snake" hidden
       data-t-world-loading="Loading world board"
       data-t-world-unavailable="World board unavailable"
       data-t-world-rank="World rank #{rank}">
    <form class="hs-entry" hidden>
      <input class="hs-input" type="text" maxlength="3" />
      <button type="submit" class="hs-ok">OK</button>
    </form>
    <div class="hs-tabs">
      <button type="button" class="hs-tab" data-hs-scope="device" aria-selected="true">This device</button>
      <button type="button" class="hs-tab" data-hs-scope="world" aria-selected="false">World</button>
    </div>
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
  // jsdom does not implement scrollIntoView; commit(true) calls it.
  Element.prototype.scrollIntoView = vi.fn();
});

describe('initScoreboard commit()', () => {
  it('writes the device table and offers the shown score to the world board', async () => {
    const onSave = vi.fn();
    const board = initScoreboard(buildPanel(), { onSave });
    board.show(4210);

    const form = document.querySelector<HTMLFormElement>('.hs-entry')!;
    const input = document.querySelector<HTMLInputElement>('.hs-input')!;
    expect(form.hidden).toBe(false);

    input.value = 'IMR';
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();

    expect(JSON.parse(localStorage.getItem(tableKey('snake'))!)).toEqual([
      { initials: 'IMR', score: 4210 }
    ]);
    expect(onSave).toHaveBeenCalledWith({ initials: 'IMR', score: 4210 }, 1);
    // The number submitted globally is exactly the number shown to the player.
    expect(submitGlobal).toHaveBeenCalledWith('snake', 'IMR', 4210);
    const row = document.querySelector('.hs-current');
    expect(row?.querySelector('.hs-score')?.textContent).toBe('004210');
    expect(row?.querySelector('.hs-initials')?.textContent?.trim()).toBe('IMR');
  });

  it('auto-commits a pending entry on pagehide with the last-used initials', async () => {
    localStorage.setItem('arcade-initials', 'ZZZ');
    const board = initScoreboard(buildPanel());
    board.show(900);
    window.dispatchEvent(new Event('pagehide'));
    await flush();

    expect(JSON.parse(localStorage.getItem(tableKey('snake'))!)).toEqual([
      { initials: 'ZZZ', score: 900 }
    ]);
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

    expect(JSON.parse(localStorage.getItem(tableKey('snake'))!)).toHaveLength(1);
    expect(submitGlobal).toHaveBeenCalledTimes(1);
  });

  it('fetches the world board lazily on the first World-tab visit', async () => {
    initScoreboard(buildPanel());
    expect(fetchGlobal).not.toHaveBeenCalled();

    const worldTab = document.querySelector<HTMLButtonElement>('[data-hs-scope="world"]')!;
    worldTab.click();
    expect(fetchGlobal).toHaveBeenCalledTimes(1);
    await flush();
    // The mock resolves null: the panel must say unavailable, not show an
    // empty board.
    const note = document.querySelector<HTMLElement>('.hs-note')!;
    expect(note.hidden).toBe(false);
    expect(note.textContent).toBe('World board unavailable');
  });

  it('renders world rows from a fetched board', async () => {
    vi.mocked(fetchGlobal).mockResolvedValueOnce({
      snake: [
        { initials: 'AAA', score: 9000 },
        { initials: 'BBB', score: 100 }
      ]
    });
    initScoreboard(buildPanel());
    document.querySelector<HTMLButtonElement>('[data-hs-scope="world"]')!.click();
    await flush();

    const rows = [...document.querySelectorAll('.hs-row .hs-initials')].map(
      el => el.textContent?.trim()
    );
    expect(rows).toEqual(['AAA', 'BBB']);
  });

  it('degrades to inert no-ops without a panel', () => {
    const board = initScoreboard(null);
    expect(() => {
      board.show(100);
      board.hide();
      board.stash(50);
      board.beginRun();
      board.bank(10);
    }).not.toThrow();
    expect(board.top()).toBeNull();
    expect(submitGlobal).not.toHaveBeenCalled();
  });
});
