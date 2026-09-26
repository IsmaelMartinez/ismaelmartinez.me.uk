/**
 * Snake's round 13 score, frozen as it was before its round 2 rescore (#380),
 * for the engine suites that use it as their plain formless score:
 * `audio-form.test.ts` reads it as one pass of a loop with no form, and
 * `audio-timbre.test.ts` checks that `renderScore` schedules exactly the
 * notes the live engine plays for it. The rescore gave the live score a form,
 * a pulse duty, vibrato and a stinger, so it can no longer stand in for a
 * plain one; this copy keeps those tests measuring what they always measured.
 */
import { p, REST, type GameAudioOptions } from '../../src/games/engine';

export const SNAKE_ROUND13_MUSIC: GameAudioOptions = {
  tempo: 134,
  volume: 0.14,
  tracks: [
    {
      // LEAD: bright square bleeps, arpeggio-driven, one four-beat bar per chord.
      // Each bar leans on its downbeat and eases off the pickup notes after it,
      // which is what stops a run of even eighths sounding typed rather than played.
      wave: 'square',
      melody: [
        // Bar 1 — C
        { freq: p('G5'), beats: 0.5 },
        { freq: p('E5'), beats: 0.5, gain: 0.8 },
        { freq: p('C5'), beats: 0.5, gain: 0.8 },
        { freq: p('E5'), beats: 0.5, gain: 0.8 },
        { freq: p('G5'), beats: 1 },
        { freq: p('E5'), beats: 0.5, gain: 0.75 },
        { freq: p('G5'), beats: 0.5, gain: 0.75 },
        // Bar 2 — Am
        { freq: p('A5'), beats: 0.5 },
        { freq: p('E5'), beats: 0.5, gain: 0.8 },
        { freq: p('C5'), beats: 0.5, gain: 0.8 },
        { freq: p('E5'), beats: 0.5, gain: 0.8 },
        { freq: p('A5'), beats: 1 },
        { freq: p('A5'), beats: 0.5, gain: 0.75 },
        { freq: p('G5'), beats: 0.5, gain: 0.75 },
        // Bar 3 — F
        { freq: p('F5'), beats: 0.5 },
        { freq: p('A5'), beats: 0.5, gain: 0.8 },
        { freq: p('C6'), beats: 0.5, gain: 0.8 },
        { freq: p('A5'), beats: 0.5, gain: 0.8 },
        { freq: p('F5'), beats: 1 },
        { freq: p('E5'), beats: 0.5, gain: 0.75 },
        { freq: p('F5'), beats: 0.5, gain: 0.75 },
        // Bar 4 — G, then a bar's breath before the answer
        { freq: p('G5'), beats: 0.5 },
        { freq: p('B5'), beats: 0.5, gain: 0.8 },
        { freq: p('D6'), beats: 0.5, gain: 0.8 },
        { freq: p('B5'), beats: 0.5, gain: 0.8 },
        { freq: p('G5'), beats: 1 },
        { freq: REST, beats: 1 },
        // Bar 5 — C, the answer opens high and falls home
        { freq: p('C6'), beats: 0.5 },
        { freq: p('B5'), beats: 0.5, gain: 0.8 },
        { freq: p('G5'), beats: 0.5, gain: 0.8 },
        { freq: p('E5'), beats: 0.5, gain: 0.8 },
        { freq: p('C5'), beats: 1 },
        { freq: p('E5'), beats: 0.5, gain: 0.75 },
        { freq: p('G5'), beats: 0.5, gain: 0.75 },
        // Bar 6 — Em
        { freq: p('E5'), beats: 0.5 },
        { freq: p('G5'), beats: 0.5, gain: 0.8 },
        { freq: p('B5'), beats: 0.5, gain: 0.8 },
        { freq: p('G5'), beats: 0.5, gain: 0.8 },
        { freq: p('E5'), beats: 1 },
        { freq: p('D5'), beats: 0.5, gain: 0.75 },
        { freq: p('E5'), beats: 0.5, gain: 0.75 },
        // Bar 7 — F into G, two chords in the bar to push the cadence
        { freq: p('F5'), beats: 0.5 },
        { freq: p('A5'), beats: 0.5, gain: 0.8 },
        { freq: p('C6'), beats: 0.5, gain: 0.8 },
        { freq: p('A5'), beats: 0.5, gain: 0.8 },
        { freq: p('G5'), beats: 0.5 },
        { freq: p('B5'), beats: 0.5, gain: 0.8 },
        { freq: p('D6'), beats: 0.5, gain: 0.8 },
        { freq: p('B5'), beats: 0.5, gain: 0.8 },
        // Bar 8 — home
        { freq: p('C6'), beats: 1 },
        { freq: p('G5'), beats: 0.5, gain: 0.8 },
        { freq: p('E5'), beats: 0.5, gain: 0.8 },
        { freq: p('C5'), beats: 1 },
        { freq: REST, beats: 1 }
      ]
    },
    {
      // BASS: sparse triangle, root on the downbeat and fifth at the half bar.
      // The fifth is ducked so the bar has a pulse instead of two equal thuds.
      wave: 'triangle',
      volume: 0.9,
      melody: [
        { freq: p('C3'), beats: 2 }, // C
        { freq: p('G2'), beats: 2, gain: 0.6 },
        { freq: p('A2'), beats: 2 }, // Am
        { freq: p('E3'), beats: 2, gain: 0.6 },
        { freq: p('F2'), beats: 2 }, // F
        { freq: p('C3'), beats: 2, gain: 0.6 },
        { freq: p('G2'), beats: 2 }, // G
        { freq: p('D3'), beats: 2, gain: 0.6 },
        { freq: p('C3'), beats: 2 }, // C
        { freq: p('G2'), beats: 2, gain: 0.6 },
        { freq: p('E2'), beats: 2 }, // Em
        { freq: p('B2'), beats: 2, gain: 0.6 },
        { freq: p('F2'), beats: 2 }, // F
        { freq: p('G2'), beats: 2 }, // G — the cadence, so no duck
        { freq: p('C3'), beats: 2 }, // C
        { freq: p('G2'), beats: 2, gain: 0.6 }
      ]
    }
  ]
};
