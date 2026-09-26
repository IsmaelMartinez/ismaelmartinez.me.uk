/**
 * What the jukebox's adaptive controls (#367, over #371's engine API) mean
 * for a render, kept DOM-free so it can be unit-tested in node.
 *
 * The page renders a score one voice at a time and sums the voices (see
 * `renderMix` in `jukebox.astro` for why), so the chosen state has to be
 * expressed per voice: a voice that is switched off is simply left out of the
 * sum, and each voice's render starts in the same danger variant and at the
 * same section as the whole score would.
 */
import type { GameAudioOptions, Note, RenderState, Track } from '../games/engine/audio';

/** The adaptive controls on one score card, as the render reads them. */
export interface ControlState {
  /** Whether each voice sounds, in the order of `tracks`. */
  layers: boolean[];
  /** Start in the form's danger variant. */
  danger: boolean;
  /** Start at this section of the order; empty for the top (intro included). */
  section: string;
}

/** Whether a score has voices worth a layer toggle: a named one or one that starts silent. */
export function hasLayers(music: GameAudioOptions): boolean {
  return music.tracks.some(t => t.name !== undefined || t.startsMuted);
}

/** The label a voice's toggle and a file name use: its name, or its index. */
export function voiceLabel(track: Track, index: number): string {
  return track.name ?? String(index);
}

/**
 * The sections a picker can start from, in play order: the order's first,
 * then any the danger order adds, each name once.
 */
export function sectionNames(music: GameAudioOptions): string[] {
  const form = music.form;
  if (!form) return [];
  return [...new Set([...form.order, ...(form.danger?.order ?? [])])];
}

/** The controls as a score starts: each voice as its score says, outside danger, from the top. */
export function defaultControls(music: GameAudioOptions): ControlState {
  return {
    layers: music.tracks.map(t => !t.startsMuted),
    danger: false,
    section: ''
  };
}

/**
 * The same choice as a `RenderState`, for a whole-score `renderScore`: every
 * voice's layer by index, danger only where the score has a danger variant,
 * and the section only when one was picked.
 */
export function renderState(music: GameAudioOptions, control: ControlState): RenderState {
  const state: RenderState = {};
  if (hasLayers(music) || control.layers.some((on, t) => on !== !music.tracks[t]?.startsMuted)) {
    state.layers = Object.fromEntries(music.tracks.map((_, t) => [String(t), control.layers[t] ?? true]));
  }
  if (control.danger && music.form?.danger) state.danger = true;
  if (control.section) state.section = control.section;
  return state;
}

/**
 * The single-voice scores `renderMix` renders and sums, and the state each
 * one starts from. A voice that is off contributes silence, so it is left out
 * rather than rendered at zero; a voice that is on is rendered sounding even
 * if its score starts it muted. A form is cut down to the voice's own line in
 * every passage, because a form supplies one line per track by position and a
 * one-track score would otherwise play the first voice's line in every
 * voice's instrument.
 */
export function renderParts(
  music: GameAudioOptions,
  control: ControlState
): { parts: GameAudioOptions[]; from: RenderState } {
  const { layers: _layers, ...from } = renderState(music, control);
  const parts: GameAudioOptions[] = [];
  music.tracks.forEach((track, t) => {
    if (control.layers[t] === false) return;
    const own = (lines: Note[][]) => [lines[t] ?? []];
    const form = music.form && {
      ...music.form,
      intro: music.form.intro && own(music.form.intro),
      sections: Object.fromEntries(Object.entries(music.form.sections).map(([name, lines]) => [name, own(lines)]))
    };
    // Stingers are left off: a render never plays one, and without them a
    // voice that names no layer keeps the plain bus it has always rendered on.
    const { stingers: _stingers, ...rest } = music;
    parts.push({
      ...rest,
      tracks: [{ ...track, startsMuted: false }],
      ...(form && { form })
    });
  });
  return { parts, from };
}

/**
 * The WAV's file name, which says what state it was rendered in so two
 * renders of one score can sit side by side: `cascade.wav` for the score as
 * written, `cascade-danger-from-b-without-bass.wav` otherwise.
 */
export function renderFileName(name: string, music: GameAudioOptions, control: ControlState): string {
  const bits = [name];
  if (control.danger && music.form?.danger) bits.push('danger');
  if (control.section) bits.push(`from-${control.section}`);
  const differs = (on: boolean) =>
    music.tracks.flatMap((track, t) =>
      (control.layers[t] ?? true) === on && on === !!track.startsMuted ? [voiceLabel(track, t)] : []
    );
  const added = differs(true);
  const dropped = differs(false);
  if (added.length) bits.push(`with-${added.join('-')}`);
  if (dropped.length) bits.push(`without-${dropped.join('-')}`);
  return `${bits.join('-').replace(/[^\w.-]/g, '-')}.wav`;
}

const lineBeats = (line: Note[] | undefined) => (line ?? []).reduce((sum, n) => sum + n.beats, 0);

/** Beats in one loop: a pass of the first voice, or of the form's order (music.test.ts pins every voice equal). */
export function loopBeats(music: GameAudioOptions): number {
  const form = music.form;
  if (!form) return lineBeats(music.tracks[0]?.melody);
  return form.order.reduce((sum, name) => sum + lineBeats(form.sections[name]?.[0]), 0);
}

/** Beats in the form's once-only intro, 0 without one. */
export function introBeats(music: GameAudioOptions): number {
  return lineBeats(music.form?.intro?.[0]);
}
