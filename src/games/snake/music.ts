/**
 * Snake's score: a lean Nokia-era chiptune loop in C major.
 *
 * This cabinet is deliberately the minimal one — two voices, no pad, no echo —
 * and stays that way. What changed in the 2026-08-14 music round is length and
 * harmony: the old loop was a single 8-beat bar of C-Am-G-C that came round
 * every 3.6 seconds, which is what made it nag. It is now 32 beats (eight bars,
 * A then a B answer) over a progression that actually travels — C Am F G, then
 * C Em F-G C — so the tune resolves rather than restarts.
 */
import { p, REST, type GameAudioOptions } from '../engine';

export const SNAKE_MUSIC: GameAudioOptions = {
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
