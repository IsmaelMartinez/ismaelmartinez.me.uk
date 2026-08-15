/**
 * Note names to frequencies, for authoring the cabinets' music.
 *
 * The scores used to carry raw Hz with the note name in a trailing comment
 * (`{ freq: 523.25, beats: 0.5 }, // C5`). That is readable at a dozen notes and
 * a liability at several hundred: the comment is the only thing saying which
 * note was meant, so a mistyped digit is a wrong note that nothing catches and
 * no reviewer can hear. Naming the note directly makes the line the source of
 * truth and the frequency derived.
 */

/** Semitone offset of each natural within its octave. */
const NATURAL: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/**
 * Scientific pitch notation: a letter, an optional accidental, an octave.
 * Deliberately flat and anchored with no nested quantifiers, so matching is
 * linear in the input length.
 */
const NOTE_RE = /^([A-G])([#b]?)(-?\d{1,2})$/;

/**
 * Frequency in Hz of a note named in scientific pitch notation — `C4`, `A#3`,
 * `Eb5`. Equal temperament from A4 = 440 Hz.
 *
 * Throws on an unparseable name rather than returning a silent fallback. Be
 * precise about what that buys, because the cost is real: the scores are
 * module-level constants, so every call here runs at import time, and a typo
 * that shipped would throw inside the cabinet's client bundle before the game
 * ever initialises — a dead page, not one wrong note. `npm run build` does not
 * catch it (it bundles client scripts, it never executes them) and neither can
 * `typecheck`, which cannot look inside a string literal. The only gate is
 * `tests/games/music.test.ts`, which imports every `music.ts` it can find via
 * `import.meta.glob` precisely so that a new cabinet is covered without anyone
 * remembering to add it to a list.
 */
export function pitch(name: string): number {
  const m = name.match(NOTE_RE);
  if (!m) throw new Error(`Unparseable note name: ${name}`);
  const [, letter, accidental, octave] = m;
  const semitone = NATURAL[letter] + (accidental === '#' ? 1 : accidental === 'b' ? -1 : 0);
  // MIDI number, then equal temperament against A4 = MIDI 69 = 440 Hz.
  const midi = (Number(octave) + 1) * 12 + semitone;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Alias for terse score authoring: `p('C5')` reads cleanly inline in a melody. */
export const p = pitch;

/** A rest. Named so a silent beat reads as intent rather than a zero frequency. */
export const REST = 0;
