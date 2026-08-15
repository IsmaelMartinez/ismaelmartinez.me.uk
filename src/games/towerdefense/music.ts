/**
 * Line Hold's score: a resolute defensive march in A minor.
 *
 * The 2026-08-14 music round took it from 16 beats to 48. The point of the
 * rewrite is the shape: twelve bars that climb, with the highest notes of the
 * whole loop in bars 9-11 and the resolution held back until bar 12. The old
 * four-bar loop had a drone that descended and a lead that resolved home every
 * eight seconds, which is a lullaby's shape, not a siege's.
 *
 * The G# is the load-bearing note. It is the harmonic-minor leading tone under
 * the E major chord in bars 7 and 11, and it is the only thing in the key that
 * genuinely wants to resolve — which is what makes those two bars read as
 * pressure rather than colour.
 */
import { p, type GameAudioOptions } from '../engine';

export const TOWERDEFENSE_MUSIC: GameAudioOptions = {
  tempo: 136,
  volume: 0.12,
  echo: { time: 0.28, feedback: 0.25, mix: 0.2 },
  tracks: [
    {
      // DRONE: a low sustained bed, one chord root per bar.
      wave: 'sawtooth',
      envelope: 'pad',
      volume: 0.45,
      melody: [
        { freq: p('A2'), beats: 4 }, // Am
        { freq: p('A2'), beats: 4 }, // Am
        { freq: p('F2'), beats: 4 }, // F
        { freq: p('G2'), beats: 4 }, // G
        { freq: p('A2'), beats: 4 }, // Am
        { freq: p('D2'), beats: 4 }, // Dm
        { freq: p('E2'), beats: 4 }, // E
        { freq: p('A2'), beats: 4 }, // Am
        { freq: p('F2'), beats: 4 }, // F
        { freq: p('G2'), beats: 4 }, // G
        { freq: p('E2'), beats: 4 }, // E
        { freq: p('A2'), beats: 4 } // Am
      ]
    },
    {
      // LEAD: a dotted march figure, one per bar — long, short, then two even
      // steps. Its level rises through the loop and peaks in bars 9-11.
      wave: 'square',
      volume: 0.9,
      melody: [
        // Bar 1 — Am
        { freq: p('A4'), beats: 1.5, gain: 0.85 },
        { freq: p('A4'), beats: 0.5, gain: 0.7 },
        { freq: p('C5'), beats: 1, gain: 0.8 },
        { freq: p('E5'), beats: 1, gain: 0.8 },
        // Bar 2 — Am
        { freq: p('D5'), beats: 1.5, gain: 0.85 },
        { freq: p('C5'), beats: 0.5, gain: 0.7 },
        { freq: p('B4'), beats: 1, gain: 0.8 },
        { freq: p('A4'), beats: 1, gain: 0.8 },
        // Bar 3 — F
        { freq: p('F5'), beats: 1.5, gain: 0.9 },
        { freq: p('E5'), beats: 0.5, gain: 0.75 },
        { freq: p('D5'), beats: 1, gain: 0.85 },
        { freq: p('C5'), beats: 1, gain: 0.85 },
        // Bar 4 — G
        { freq: p('B4'), beats: 1.5, gain: 0.9 },
        { freq: p('D5'), beats: 0.5, gain: 0.75 },
        { freq: p('G5'), beats: 1, gain: 0.85 },
        { freq: p('D5'), beats: 1, gain: 0.85 },
        // Bar 5 — Am
        { freq: p('E5'), beats: 1.5, gain: 0.9 },
        { freq: p('E5'), beats: 0.5, gain: 0.75 },
        { freq: p('A5'), beats: 1, gain: 0.9 },
        { freq: p('G5'), beats: 1, gain: 0.85 },
        // Bar 6 — Dm
        { freq: p('F5'), beats: 1.5, gain: 0.9 },
        { freq: p('E5'), beats: 0.5, gain: 0.8 },
        { freq: p('D5'), beats: 1, gain: 0.85 },
        { freq: p('A4'), beats: 1, gain: 0.85 },
        // Bar 7 — E, the leading tone arrives
        { freq: p('G#5'), beats: 1.5, gain: 0.95 },
        { freq: p('B5'), beats: 0.5, gain: 0.85 },
        { freq: p('E5'), beats: 1, gain: 0.9 },
        { freq: p('B4'), beats: 1, gain: 0.85 },
        // Bar 8 — Am
        { freq: p('A5'), beats: 1.5, gain: 0.95 },
        { freq: p('G5'), beats: 0.5, gain: 0.85 },
        { freq: p('E5'), beats: 1, gain: 0.9 },
        { freq: p('C5'), beats: 1, gain: 0.85 },
        // Bar 9 — F, the climb into the loop's ceiling
        { freq: p('F5'), beats: 1.5 },
        { freq: p('A5'), beats: 0.5, gain: 0.9 },
        { freq: p('C6'), beats: 1 },
        { freq: p('A5'), beats: 1, gain: 0.9 },
        // Bar 10 — G, the highest bar
        { freq: p('G5'), beats: 1.5 },
        { freq: p('B5'), beats: 0.5, gain: 0.9 },
        { freq: p('D6'), beats: 1 },
        { freq: p('B5'), beats: 1, gain: 0.9 },
        // Bar 11 — E, held back on the leading tone
        { freq: p('E5'), beats: 1.5 },
        { freq: p('G#5'), beats: 0.5, gain: 0.9 },
        { freq: p('B5'), beats: 1 },
        { freq: p('G#5'), beats: 1, gain: 0.95 },
        // Bar 12 — Am, finally home
        { freq: p('A5'), beats: 1.5 },
        { freq: p('E5'), beats: 0.5, gain: 0.85 },
        { freq: p('C5'), beats: 1, gain: 0.9 },
        { freq: p('A4'), beats: 1, gain: 0.85 }
      ]
    },
    {
      // BASS: a marching pulse, one note to the beat, in accented pairs.
      wave: 'triangle',
      volume: 0.75,
      melody: [
        // Bar 1 — Am
        { freq: p('A2'), beats: 1, gain: 0.85 },
        { freq: p('A2'), beats: 1, gain: 0.6 },
        { freq: p('E2'), beats: 1, gain: 0.75 },
        { freq: p('E2'), beats: 1, gain: 0.6 },
        // Bar 2 — Am
        { freq: p('A2'), beats: 1, gain: 0.85 },
        { freq: p('A2'), beats: 1, gain: 0.6 },
        { freq: p('E2'), beats: 1, gain: 0.75 },
        { freq: p('E2'), beats: 1, gain: 0.6 },
        // Bar 3 — F
        { freq: p('F2'), beats: 1, gain: 0.9 },
        { freq: p('F2'), beats: 1, gain: 0.6 },
        { freq: p('C3'), beats: 1, gain: 0.8 },
        { freq: p('C3'), beats: 1, gain: 0.6 },
        // Bar 4 — G
        { freq: p('G2'), beats: 1, gain: 0.9 },
        { freq: p('G2'), beats: 1, gain: 0.6 },
        { freq: p('D3'), beats: 1, gain: 0.8 },
        { freq: p('D3'), beats: 1, gain: 0.6 },
        // Bar 5 — Am
        { freq: p('A2'), beats: 1, gain: 0.9 },
        { freq: p('A2'), beats: 1, gain: 0.65 },
        { freq: p('E2'), beats: 1, gain: 0.8 },
        { freq: p('E2'), beats: 1, gain: 0.65 },
        // Bar 6 — Dm
        { freq: p('D2'), beats: 1, gain: 0.9 },
        { freq: p('D2'), beats: 1, gain: 0.65 },
        { freq: p('A2'), beats: 1, gain: 0.8 },
        { freq: p('A2'), beats: 1, gain: 0.65 },
        // Bar 7 — E
        { freq: p('E2'), beats: 1, gain: 0.95 },
        { freq: p('E2'), beats: 1, gain: 0.7 },
        { freq: p('B2'), beats: 1, gain: 0.85 },
        { freq: p('B2'), beats: 1, gain: 0.7 },
        // Bar 8 — Am
        { freq: p('A2'), beats: 1, gain: 0.95 },
        { freq: p('A2'), beats: 1, gain: 0.7 },
        { freq: p('E2'), beats: 1, gain: 0.85 },
        { freq: p('E2'), beats: 1, gain: 0.7 },
        // Bar 9 — F
        { freq: p('F2'), beats: 1 },
        { freq: p('F2'), beats: 1, gain: 0.75 },
        { freq: p('C3'), beats: 1, gain: 0.9 },
        { freq: p('C3'), beats: 1, gain: 0.75 },
        // Bar 10 — G
        { freq: p('G2'), beats: 1 },
        { freq: p('G2'), beats: 1, gain: 0.75 },
        { freq: p('D3'), beats: 1, gain: 0.9 },
        { freq: p('D3'), beats: 1, gain: 0.75 },
        // Bar 11 — E, walking up onto the leading tone
        { freq: p('E2'), beats: 1 },
        { freq: p('E2'), beats: 1, gain: 0.75 },
        { freq: p('G#2'), beats: 1, gain: 0.9 },
        { freq: p('B2'), beats: 1, gain: 0.9 },
        // Bar 12 — Am
        { freq: p('A2'), beats: 1 },
        { freq: p('A2'), beats: 1, gain: 0.7 },
        { freq: p('E2'), beats: 1, gain: 0.85 },
        { freq: p('A2'), beats: 1, gain: 0.7 }
      ]
    }
  ]
};
