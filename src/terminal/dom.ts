/**
 * Wires the hero's static terminal into a live one.
 *
 * The server renders the terminal as plain markup plus a JSON island of
 * `TerminalData`, so without JavaScript it is the static panel it always was.
 * This module adds the prompt, keeps the history, prints `run`'s lines and
 * performs its effects; the interpreter itself is the pure `commands.ts`.
 */

import { run, complete, type Effect, type Line, type Segment, type TerminalData } from './commands';
import { completedGames, visibleCabinets } from '../games/engine/progress';

const HISTORY_LIMIT = 50;

function renderSegment(segment: Segment): HTMLElement {
  const node = segment.href ? document.createElement('a') : document.createElement('span');
  node.textContent = segment.text;
  if (segment.tone && segment.tone !== 'out') node.className = `term-${segment.tone}`;
  if (node instanceof HTMLAnchorElement && segment.href) {
    node.href = segment.href;
    if (segment.external) {
      node.target = '_blank';
      node.rel = 'noopener noreferrer';
    }
  }
  return node;
}

function renderLine(line: Line): HTMLElement {
  const row = document.createElement('p');
  row.className = 'term-line';
  row.append(...line.map(renderSegment));
  return row;
}

/**
 * Appends lines to the log. Consecutive lines of cells with the same column
 * count share one grid, so their columns line up (help, article listings).
 */
function appendLines(log: HTMLElement, lines: Line[]): void {
  let grid: HTMLElement | null = null;
  for (const line of lines) {
    if (!line.some(segment => segment.cell)) {
      grid = null;
      log.append(renderLine(line));
      continue;
    }
    const columns = String(line.length);
    if (grid?.dataset.columns !== columns) {
      grid = document.createElement('div');
      grid.className = 'term-line term-grid';
      grid.dataset.columns = columns;
      log.append(grid);
    }
    grid.append(...line.map(renderSegment));
  }
}

function effectiveTheme(): 'dark' | 'light' {
  const set = document.documentElement.getAttribute('data-theme');
  if (set === 'dark' || set === 'light') return set;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Switches theme through the nav's own toggle, so its storage and sweep stay the one path. */
function applyTheme(mode: 'dark' | 'light' | 'toggle'): void {
  if (mode !== 'toggle' && mode === effectiveTheme()) return;
  document.getElementById('theme-toggle')?.click();
}

/** `navigate` is a seam for tests: jsdom implements no page navigation. */
export function initTerminal(
  root: ParentNode = document,
  navigate: (href: string) => void = href => window.location.assign(href),
): void {
  const terminal = root.querySelector<HTMLElement>('[data-terminal]');
  if (!terminal || terminal.dataset.terminalWired === 'true') return;
  const island = terminal.querySelector('script[data-terminal-data]');
  const body = terminal.querySelector<HTMLElement>('.terminal-body');
  if (!island?.textContent || !body) return;
  const data = JSON.parse(island.textContent) as TerminalData;
  terminal.dataset.terminalWired = 'true';

  // The floor is read per command, so a cabinet unlocked in another tab shows
  // up at once. The chain is the released one the server composed, so an
  // unreleased cabinet is never on the floor even once this device has
  // finished the one before it.
  const currentFloor = () => visibleCabinets(data.games, completedGames(data.games));

  const log = document.createElement('div');
  log.className = 'term-log';
  log.setAttribute('aria-live', 'polite');
  log.append(renderLine([{ text: data.strings.hint, tone: 'muted' }]));

  const form = document.createElement('form');
  form.className = 'term-input-row';
  const label = document.createElement('label');
  label.className = 'term-sr';
  label.htmlFor = 'term-input';
  label.textContent = data.strings.inputLabel;
  const prompt = document.createElement('span');
  prompt.className = 'prompt';
  prompt.setAttribute('aria-hidden', 'true');
  prompt.textContent = '$';
  const input = document.createElement('input');
  input.id = 'term-input';
  input.className = 'term-input';
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.setAttribute('autocapitalize', 'off');
  input.setAttribute('enterkeyhint', 'go');
  input.placeholder = 'help';
  form.append(label, prompt, input);
  body.append(log, form);
  body.scrollTop = body.scrollHeight;
  terminal.classList.add('is-live');

  const history: string[] = [];
  let cursor = 0;

  const print = (lines: Line[]) => {
    appendLines(log, lines);
    body.scrollTop = body.scrollHeight;
  };

  const perform = (effect: Effect | undefined) => {
    if (!effect) return;
    switch (effect.kind) {
      case 'navigate':
        navigate(effect.href);
        break;
      case 'external':
        window.open(effect.href, '_blank', 'noopener,noreferrer');
        break;
      case 'clear':
        // The static intro goes too: a cleared screen is an empty screen.
        for (const child of [...body.children]) if (child !== log && child !== form) child.remove();
        log.replaceChildren();
        break;
      case 'theme':
        applyTheme(effect.mode);
        break;
    }
  };

  form.addEventListener('submit', event => {
    event.preventDefault();
    const value = input.value;
    input.value = '';
    print([[{ text: '$ ', tone: 'accent' }, { text: value }]]);
    if (value.trim()) {
      if (history[history.length - 1] !== value) history.push(value);
      if (history.length > HISTORY_LIMIT) history.shift();
    }
    cursor = history.length;
    const result = run(value, data, currentFloor());
    print(result.lines);
    perform(result.effect);
  });

  input.addEventListener('keydown', event => {
    if (event.key === 'ArrowUp' && cursor > 0) {
      event.preventDefault();
      input.value = history[--cursor];
    } else if (event.key === 'ArrowDown' && cursor < history.length) {
      event.preventDefault();
      cursor += 1;
      input.value = history[cursor] ?? '';
    } else if (event.key === 'Tab' && input.value.trim() !== '' && !event.shiftKey) {
      // Only a non-empty line claims Tab, so keyboard users can still tab out of an empty prompt.
      event.preventDefault();
      const completion = complete(input.value, data, currentFloor());
      input.value = completion.value;
      if (completion.options.length > 0) print([[{ text: completion.options.join('  '), tone: 'muted' }]]);
    } else if (event.key === 'l' && event.ctrlKey) {
      event.preventDefault();
      perform({ kind: 'clear' });
    }
  });

  // Clicking anywhere in the screen focuses the prompt, as a real terminal does,
  // except on a link or while selecting text to copy.
  body.addEventListener('click', event => {
    if ((event.target as HTMLElement).closest('a')) return;
    if (window.getSelection()?.toString()) return;
    input.focus({ preventScroll: true });
  });
}
