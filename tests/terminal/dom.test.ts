/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { initTerminal } from '../../src/terminal/dom';
import { doneKey } from '../../src/games/engine/progress';
import { installLocalStorage } from '../games/dom-helpers';
import { data } from './fixture';

function mount(): HTMLElement {
  document.body.innerHTML = `
    <div class="terminal" data-terminal>
      <script type="application/json" data-terminal-data>${JSON.stringify(data)}</script>
      <div class="terminal-body">
        <p class="terminal-cmd">$ whoami</p>
        <p>Ada Example</p>
      </div>
    </div>`;
  return document.querySelector('[data-terminal]')!;
}

const input = () => document.querySelector<HTMLInputElement>('.term-input')!;
const logText = () => [...document.querySelectorAll('.term-log .term-line')].map(line => line.textContent);

function type(command: string): void {
  input().value = command;
  input().form!.requestSubmit();
}

function key(name: string): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true });
  input().dispatchEvent(event);
  return event;
}

describe('initTerminal', () => {
  let navigate: ReturnType<typeof vi.fn<(href: string) => void>>;

  beforeEach(() => {
    installLocalStorage();
    navigate = vi.fn<(href: string) => void>();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('adds a labelled prompt and the hint below the static intro', () => {
    const terminal = mount();
    initTerminal(document, navigate);
    expect(terminal.classList.contains('is-live')).toBe(true);
    expect(document.querySelector('label[for="term-input"]')?.textContent).toBe('[inputLabel]');
    expect(logText()).toEqual(['[hint]']);
    expect(terminal.querySelector('.terminal-body')!.textContent).toContain('Ada Example');
  });

  it('wires once, however many times the page swap calls it', () => {
    mount();
    initTerminal(document, navigate);
    initTerminal(document, navigate);
    expect(document.querySelectorAll('.term-input')).toHaveLength(1);
  });

  it('echoes the command, prints its output and keeps the output region polite', () => {
    mount();
    initTerminal(document, navigate);
    type('whoami');
    expect(logText().slice(-2)).toEqual(['$ whoami', 'Ada Example']);
    expect(input().value).toBe('');
    expect(document.querySelector('.term-log')!.getAttribute('aria-live')).toBe('polite');
  });

  it('puts every help row in one grid so the descriptions line up', () => {
    mount();
    initTerminal(document, navigate);
    type('help');
    const grids = document.querySelectorAll('.term-log .term-grid');
    expect(grids).toHaveLength(1);
    expect(grids[0].children).toHaveLength(18);
    type('help');
    expect(document.querySelectorAll('.term-log .term-grid')).toHaveLength(2);
  });

  it('gives article rows their own three-column grid, apart from the hint under them', () => {
    mount();
    initTerminal(document, navigate);
    type('ls articles');
    const grid = document.querySelector<HTMLElement>('.term-log .term-grid')!;
    expect(grid.dataset.columns).toBe('3');
    expect(grid.children).toHaveLength(9);
    expect(logText().at(-1)).toBe('[listHint]');
  });

  it('renders links as real anchors, external ones in a new tab', () => {
    mount();
    initTerminal(document, navigate);
    type('ls projects');
    const link = document.querySelector<HTMLAnchorElement>('.term-log a[href="https://example.com/repo-butler"]')!;
    expect(link.target).toBe('_blank');
    expect(link.rel).toBe('noopener noreferrer');
  });

  it('walks back and forward through history with the arrow keys', () => {
    mount();
    initTerminal(document, navigate);
    type('whoami');
    type('ls');
    expect(key('ArrowUp').defaultPrevented).toBe(true);
    expect(input().value).toBe('ls');
    key('ArrowUp');
    expect(input().value).toBe('whoami');
    key('ArrowDown');
    key('ArrowDown');
    expect(input().value).toBe('');
  });

  it('completes on Tab but lets Tab leave an empty prompt', () => {
    mount();
    initTerminal(document, navigate);
    input().value = 'sea';
    expect(key('Tab').defaultPrevented).toBe(true);
    expect(input().value).toBe('search ');
    input().value = '';
    expect(key('Tab').defaultPrevented).toBe(false);
  });

  it('clears the whole screen, static intro included, and keeps the prompt', () => {
    mount();
    initTerminal(document, navigate);
    type('whoami');
    type('clear');
    const body = document.querySelector('.terminal-body')!;
    expect(body.textContent).not.toContain('Ada Example');
    expect(logText()).toEqual([]);
    expect(body.querySelector('.term-input')).not.toBeNull();
  });

  it('navigates when a command opens something', () => {
    mount();
    initTerminal(document, navigate);
    type('open 2');
    expect(navigate).toHaveBeenCalledWith('/en/articles/the-ai-automation-trap');
  });

  it('reads the arcade floor at the moment of the command, not at page load', () => {
    const store = installLocalStorage();
    mount();
    initTerminal(document, navigate);
    type('play snake');
    expect(navigate).not.toHaveBeenCalled();
    store[doneKey('tanks')] = '1';
    type('play snake');
    expect(navigate).toHaveBeenCalledWith('/en/fun/snake');
  });

  it('leaves a terminal without its data island as the static panel', () => {
    document.body.innerHTML = '<div class="terminal" data-terminal><div class="terminal-body"></div></div>';
    initTerminal(document, navigate);
    expect(document.querySelector('.term-input')).toBeNull();
  });
});
