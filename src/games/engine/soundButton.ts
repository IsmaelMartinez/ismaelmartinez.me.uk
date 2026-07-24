/**
 * Wires arcade audio toggle buttons to a GameAudio instance.
 *
 * Kept separate from audio.ts so the synth core stays DOM-free and testable.
 * Buttons reflect the current muted state and read their label / aria text and
 * glyphs from data attributes the page exposes.
 */
import type { GameAudio } from './audio';

/**
 * Wires one channel toggle (music or effects). The button carries:
 *   data-glyph-on / data-glyph-off            (icon swapped on toggle)
 *   data-music-on / data-music-off  OR  data-sfx-on / data-sfx-off  (aria-label)
 * When muted it also gains a `.muted` class so CSS can dim it.
 */
export function wireChannelButton(
  button: HTMLElement | null,
  audio: GameAudio,
  channel: 'music' | 'sfx'
): void {
  if (!button) return;
  const onLabel =
    (channel === 'music' ? button.dataset.musicOn : button.dataset.sfxOn) ||
    (channel === 'music' ? 'Music on' : 'Sound effects on');
  const offLabel =
    (channel === 'music' ? button.dataset.musicOff : button.dataset.sfxOff) ||
    (channel === 'music' ? 'Music off' : 'Sound effects off');
  const glyphOn = button.dataset.glyphOn || (channel === 'music' ? '🎵' : '🔊');
  const glyphOff = button.dataset.glyphOff || (channel === 'music' ? '🎵' : '🔇');

  const isMuted = (): boolean => (channel === 'music' ? audio.isMusicMuted() : audio.isSfxMuted());
  const toggle = (): void => {
    if (channel === 'music') audio.toggleMusicMute();
    else audio.toggleSfxMute();
  };

  function render(): void {
    if (!button) return;
    const muted = isMuted();
    button.textContent = muted ? glyphOff : glyphOn;
    button.classList.toggle('muted', muted);
    button.setAttribute('aria-label', muted ? offLabel : onLabel);
    button.setAttribute('aria-pressed', String(!muted));
  }

  button.addEventListener('click', () => {
    toggle();
    render();
  });

  render();
}

/**
 * @deprecated Migration scaffold: wires a single 🔊/🔇 button that mutes music
 * and effects together (the pre-split behaviour). Cabinets move to two
 * wireChannelButton toggles; removed once all have.
 */
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
