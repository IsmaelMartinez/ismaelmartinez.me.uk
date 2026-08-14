/**
 * Syndicate's score: Blade-Runner dread in E minor, slow and cinematic.
 *
 * The 2026-08-14 music round tripled it, 16 beats to 48. This is the cabinet
 * that gains most from length: at 88 bpm the old loop came round every eleven
 * seconds, which turns dread into a nag. Forty-eight beats is over half a
 * minute, long enough that the harmony can move — Em, Cmaj7, Am, B7 — without
 * the player ever quite catching where it starts.
 *
 * The ad-screen voice is deliberately in irregular lengths that do not divide
 * the bar, so a blip never lands twice in the same place against the pad. That
 * is the whole trick: something in the mix that refuses to be on the grid.
 *
 * The cabinet is parked (see CLAUDE.md), so this is not currently reachable in
 * the arcade. It is kept in step with the rest so a revival is a page rename
 * and nothing else.
 */
import { p, REST, type GameAudioOptions } from '../engine';

export const SYNDICATE_MUSIC: GameAudioOptions = {
  tempo: 88,
  volume: 0.1,
  echo: { time: 0.33, feedback: 0.38, mix: 0.32 },
  tracks: [
    {
      // DRONE: sustained sawtooth bed, one chord root per bar.
      wave: 'sawtooth',
      envelope: 'pad',
      detune: 10,
      volume: 0.4,
      melody: [
        { freq: p('E2'), beats: 4 }, // Em
        { freq: p('E2'), beats: 4 }, // Em
        { freq: p('C3'), beats: 4 }, // Cmaj7
        { freq: p('A2'), beats: 4 }, // Am
        { freq: p('E2'), beats: 4 }, // Em
        { freq: p('C3'), beats: 4 }, // Cmaj7
        { freq: p('A2'), beats: 4 }, // Am
        { freq: p('B2'), beats: 4 }, // B7
        { freq: p('E2'), beats: 4 }, // Em
        { freq: p('C3'), beats: 4 }, // C
        { freq: p('B2'), beats: 4 }, // B7
        { freq: p('E2'), beats: 4 } // Em
      ]
    },
    {
      // LEAD: sparse and spacious. More silence than notes — the rests are the
      // instrument here, and the delay tail fills them.
      wave: 'sawtooth',
      detune: 6,
      volume: 0.9,
      melody: [
        { freq: p('E4'), beats: 2, gain: 0.8 },
        { freq: REST, beats: 2 },
        { freq: p('G4'), beats: 1, gain: 0.75 },
        { freq: p('E4'), beats: 1, gain: 0.7 },
        { freq: REST, beats: 2 },
        { freq: p('B4'), beats: 2, gain: 0.85 },
        { freq: REST, beats: 2 },
        { freq: p('A4'), beats: 1, gain: 0.75 },
        { freq: p('G4'), beats: 1, gain: 0.7 },
        { freq: REST, beats: 2 },
        // The line lifts an octave here and the loop finds its ceiling
        { freq: p('E5'), beats: 2 },
        { freq: REST, beats: 2 },
        { freq: p('D5'), beats: 1, gain: 0.8 },
        { freq: p('B4'), beats: 1, gain: 0.75 },
        { freq: REST, beats: 2 },
        { freq: p('C5'), beats: 2, gain: 0.9 },
        { freq: p('A4'), beats: 2, gain: 0.8 },
        { freq: p('B4'), beats: 2, gain: 0.8 },
        { freq: REST, beats: 2 },
        { freq: p('E5'), beats: 1, gain: 0.85 },
        { freq: p('D5'), beats: 1, gain: 0.8 },
        { freq: p('B4'), beats: 2, gain: 0.75 },
        { freq: p('G4'), beats: 2, gain: 0.7 },
        { freq: REST, beats: 2 },
        // D#5 is the leading tone over B7 — the coldest note in the loop
        { freq: p('F#4'), beats: 1, gain: 0.7 },
        { freq: p('D#5'), beats: 1, gain: 0.9 },
        { freq: REST, beats: 2 },
        { freq: p('E4'), beats: 4, gain: 0.7 }
      ]
    },
    {
      // AD SCREEN: mostly silence, an occasional high square blip. The rest
      // lengths are deliberately off the bar so the blips never settle into a
      // pattern the ear can predict.
      wave: 'square',
      volume: 0.5,
      melody: [
        { freq: REST, beats: 5 },
        { freq: p('C6'), beats: 0.5 },
        { freq: REST, beats: 7 },
        { freq: p('G5'), beats: 0.5, gain: 0.8 },
        { freq: REST, beats: 3 },
        { freq: REST, beats: 6.5 },
        { freq: p('A5'), beats: 0.5, gain: 0.7 },
        { freq: REST, beats: 9 },
        { freq: p('E6'), beats: 0.5 },
        { freq: REST, beats: 3.5 },
        { freq: REST, beats: 4 },
        { freq: p('C6'), beats: 0.5, gain: 0.6 },
        { freq: REST, beats: 2 },
        { freq: p('C6'), beats: 0.5, gain: 0.85 },
        { freq: REST, beats: 5 }
      ]
    }
  ]
};
