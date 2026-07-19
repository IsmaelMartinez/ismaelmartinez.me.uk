/**
 * Shared arcade toast channel: transient text notices stacked in a game's
 * toast area (announcements, record celebrations, sim events).
 *
 * Behaviour matches the per-game copies it replaced: append to the area,
 * cap the visible stack at 3 (oldest removed first), auto-remove each toast
 * after `durationMs`. A null area yields a no-op toaster so games stay
 * functional without the DOM. Pending removal timers are cleared on an
 * Astro ClientRouter swap so a navigation can't fire callbacks into a dead
 * DOM. Like soundButton.ts this is thin DOM glue — covered by browser
 * smoke checks rather than unit tests.
 */

export interface Toaster {
  show(text: string): void;
}

export interface ToasterOptions {
  /** Auto-remove delay per toast, in milliseconds. */
  durationMs?: number;
}

const MAX_VISIBLE = 3;
const DEFAULT_DURATION_MS = 2400;

export function createToaster(
  area: HTMLElement | null,
  options: ToasterOptions = {}
): Toaster {
  if (!area) return { show() {} };
  const durationMs = options.durationMs ?? DEFAULT_DURATION_MS;
  const timers = new Set<ReturnType<typeof setTimeout>>();

  const onSwap = () => {
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
    document.removeEventListener('astro:before-swap', onSwap);
  };
  document.addEventListener('astro:before-swap', onSwap);

  return {
    show(text: string) {
      const toast = document.createElement('div');
      toast.className = 'toast';
      toast.textContent = text;
      area.appendChild(toast);
      while (area.children.length > MAX_VISIBLE) area.firstElementChild?.remove();
      const timer = setTimeout(() => {
        timers.delete(timer);
        toast.remove();
      }, durationMs);
      timers.add(timer);
    }
  };
}
