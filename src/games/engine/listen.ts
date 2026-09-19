/**
 * Adds a keyboard listener on `document` or `window` and retires it on the
 * next `astro:before-swap`. Those two targets outlive a ClientRouter swap even
 * though the page's DOM does not, so a listener bound there by one init would
 * stack on the next re-init forever unless each wiring retires its own. Five
 * cabinets carried this pairing by hand before it lived here.
 *
 * `options` is passed to the removal too: a capture-phase listener (CALCIO's,
 * which must beat the layout's own Konami handler) is only found again by
 * `removeEventListener` with the same flag.
 */
export function listenUntilSwap<K extends keyof WindowEventMap>(
  target: Window | Document,
  type: K,
  handler: (e: WindowEventMap[K]) => void,
  options?: boolean | AddEventListenerOptions
): void {
  const t: EventTarget = target;
  t.addEventListener(type, handler as EventListener, options);
  document.addEventListener(
    'astro:before-swap',
    () => t.removeEventListener(type, handler as EventListener, options),
    { once: true }
  );
}
