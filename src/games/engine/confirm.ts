/**
 * A yes/no prompt over a live run: Microcity's Retire and Line Hold's Stand
 * Down (the voluntary doors to the board that issue #261 made a convention).
 * The game keeps ownership of its phase through the callbacks; this owns the
 * overlay, the focus moves, the key trap and its retirement, which the two
 * cabinets carried as identical fifty-line blocks.
 */
export interface ConfirmPromptOptions {
  /** The overlay shown over the play area while the question is open. */
  overlay: HTMLElement;
  /** The control that asks the question; focus returns to it on cancel. */
  opener: HTMLElement;
  confirm: HTMLButtonElement;
  cancel: HTMLButtonElement;
  /** Whether the run is in a state the question may be asked from. */
  canOpen: () => boolean;
  /** Whether the question is the live phase right now. */
  isOpen: () => boolean;
  /** The game moves its phase to the prompt. */
  onOpen: () => void;
  /** The game hands the run back. */
  onCancel: () => void;
  /** The game takes its terminal path; it should call `dismiss()` on the way. */
  onConfirm: () => void;
}

export interface ConfirmPrompt {
  open(): void;
  cancel(): void;
  /**
   * Hides the overlay and lifts the key trap without touching the phase: for
   * the terminal path, which leaves the prompt without going through cancel,
   * and for a run reset.
   */
  dismiss(): void;
}

/**
 * Focus moves to Cancel rather than Confirm on open, so the keyboard's own
 * default answer, the one Enter reaches, is the one that keeps the run.
 *
 * Escape is the expected way out of a prompt, and the Tab cycle keeps a
 * keyboard user among the two answers while it is open. A courtesy, not a
 * claim: the prompt covers only the play area, so the controls and the site
 * chrome behind it stay pointer-reachable and the markup declares no
 * `aria-modal` (see the note in the cabinet's page). Trapping the keys is
 * still the kinder default, since Tabbing blind out of a visible dialog is
 * how a keyboard user gets stranded.
 *
 * The trap is bound on `document`, because focus can leave the game root
 * entirely while the prompt is open (a click on the toolbar, the header or
 * the page background does it) and a root-scoped listener never sees the keys
 * that follow. It is attached only while the prompt is open and lifted on
 * every way out, so no handler outlives the dialog it belongs to; a
 * ClientRouter swap that tears the page out from under an open prompt is
 * neither close path, so the `astro:before-swap` retirement below covers it,
 * as everywhere else a listener reaches past the game root.
 */
export function createConfirmPrompt(o: ConfirmPromptOptions): ConfirmPrompt {
  const onKeydown = (e: KeyboardEvent) => {
    if (!o.isOpen()) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
      return;
    }
    if (e.key !== 'Tab') return;
    e.preventDefault();
    // Two answers, so a Tab in either direction is the same toggle between
    // them; from anywhere else it re-enters the dialog at the safe answer.
    (document.activeElement === o.cancel ? o.confirm : o.cancel).focus();
  };

  function open(): void {
    if (!o.canOpen()) return;
    o.onOpen();
    o.overlay.style.display = 'flex';
    document.addEventListener('keydown', onKeydown);
    o.cancel.focus();
  }

  function dismiss(): void {
    o.overlay.style.display = 'none';
    document.removeEventListener('keydown', onKeydown);
  }

  function cancel(): void {
    if (!o.isOpen()) return;
    o.onCancel();
    dismiss();
    o.opener.focus();
  }

  o.opener.addEventListener('click', open);
  o.cancel.addEventListener('click', cancel);
  // Guarded on the phase as well as the button's disabled attribute: a
  // confirm outside the prompt would take the terminal path from a stale run.
  o.confirm.addEventListener('click', () => {
    if (o.isOpen()) o.onConfirm();
  });
  const onSwap = () => {
    document.removeEventListener('keydown', onKeydown);
    document.removeEventListener('astro:before-swap', onSwap);
  };
  document.addEventListener('astro:before-swap', onSwap);

  return { open, cancel, dismiss };
}
