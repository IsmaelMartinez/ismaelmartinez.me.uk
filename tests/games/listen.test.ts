/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { listenUntilSwap } from '../../src/games/engine/listen';

// `document` and `window` outlive a ClientRouter swap, so a listener bound
// there must be retired on `astro:before-swap` or the next init stacks a
// second one. The capture-phase case is CALCIO's: `removeEventListener` only
// finds a capture listener when it is handed the same flag.

const swap = () => document.dispatchEvent(new Event('astro:before-swap'));
const key = (target: EventTarget) =>
  target.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', bubbles: true }));

afterEach(() => {
  vi.restoreAllMocks();
});

describe('listenUntilSwap', () => {
  it('hears the event until the swap and not after it', () => {
    const handler = vi.fn();
    listenUntilSwap(document, 'keydown', handler);
    key(document);
    expect(handler).toHaveBeenCalledTimes(1);
    swap();
    key(document);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('retires a window listener too', () => {
    const handler = vi.fn();
    listenUntilSwap(window, 'keyup', handler);
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'x' }));
    swap();
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'x' }));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('removes a capture-phase listener with the same flag it was added with', () => {
    const handler = vi.fn();
    const remove = vi.spyOn(window, 'removeEventListener');
    listenUntilSwap(window, 'keydown', handler, true);
    key(window);
    expect(handler).toHaveBeenCalledTimes(1);
    swap();
    key(window);
    // Behavioural: the listener is gone. Structural: it went with the flag,
    // which is the only way a capture listener can go.
    expect(handler).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith('keydown', handler, true);
  });

  it('retires each wiring only once, so two inits do not share a swap', () => {
    const first = vi.fn();
    const second = vi.fn();
    listenUntilSwap(document, 'keydown', first);
    swap();
    listenUntilSwap(document, 'keydown', second);
    key(document);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    swap();
    key(document);
    expect(second).toHaveBeenCalledTimes(1);
  });
});
