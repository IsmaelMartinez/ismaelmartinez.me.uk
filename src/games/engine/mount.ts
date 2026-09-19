/**
 * The shared opening of every cabinet's `init<Game>()`: find the page's root
 * and canvas, refuse to wire a root twice, and take a 2D context before the
 * root is marked. Nine cabinets carried this block verbatim before it lived
 * here, comments included.
 */
export interface Cabinet {
  root: HTMLElement;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  /**
   * An element the page's markup promises. The markup is the contract, so a
   * miss is a bug in the page rather than a state to handle at every call.
   */
  el: (id: string) => HTMLElement;
}

/**
 * Returns null, and wires nothing, when the page is not this cabinet's (the
 * `astro:after-swap` listener fires on every navigation, so an init must not
 * grab another arcade page's `#game-canvas`), when this root is already wired
 * (a ClientRouter swap brings a fresh, unwired root; the flag only blocks
 * re-entry on one this module has already wired), or when the canvas gives no
 * context. The root is stamped only once wiring is certain to proceed: a root
 * marked wired on a failed `getContext` would block the after-swap retry for
 * good.
 */
export function mountCabinet(rootId: string): Cabinet | null {
  const root = document.getElementById(rootId);
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;
  if (!root || !canvas) return null;
  if (root.dataset.gameWired) return null;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  root.dataset.gameWired = 'true';
  return { root, canvas, ctx, el: id => document.getElementById(id) as HTMLElement };
}
