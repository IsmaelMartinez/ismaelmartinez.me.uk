/**
 * Wires a shared 🔊/🔇 mute toggle button to a GameAudio instance.
 *
 * Kept separate from audio.ts so the synth core stays DOM-free and testable.
 * The button reflects the current muted state and updates its label / aria
 * using strings the page exposes via data attributes:
 *   data-sound-on  / data-sound-off  (aria-label text)
 */
import type { GameAudio } from './audio';

export function wireSoundButton(button: HTMLElement | null, audio: GameAudio): void {
  if (!button) return;
  const onLabel = button.dataset.soundOn || 'Sound on';
  const offLabel = button.dataset.soundOff || 'Sound off';

  function render(): void {
    if (!button) return;
    const muted = audio.isMuted();
    button.textContent = muted ? '🔇' : '🔊';
    button.setAttribute('aria-label', muted ? offLabel : onLabel);
    button.setAttribute('aria-pressed', String(!muted));
  }

  button.addEventListener('click', () => {
    audio.toggleMute();
    render();
  });

  render();
}
