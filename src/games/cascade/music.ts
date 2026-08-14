/**
 * Cascade's score: a driving Korobeiniki-style loop in E minor that the game
 * winds up level by level through `setTempo`.
 *
 * The 2026-08-14 music round took it from 14 beats to a full 32 — the folk
 * tune's whole A section and a brighter B answer, rather than the half-phrase
 * it used to cycle — and added a low pad under the lead and bass. The pad is
 * what gives the well its weight: at speed the two plucked voices alone thin
 * out into clatter, and a sustained chord bed underneath holds the harmony
 * together as the tempo climbs.
 */
import { p, REST, type GameAudioOptions } from '../engine';

/** Starting tempo. The per-level ramp in `game.ts` winds up from here. */
export const BASE_TEMPO = 126;

export const CASCADE_MUSIC: GameAudioOptions = {
  tempo: BASE_TEMPO,
  volume: 0.11,
  tracks: [
    {
      // LEAD — square, energetic. Eight bars: A (bars 1-4) states the tune,
      // B (bars 5-8) answers it up an octave and falls home to a held tonic.
      wave: 'square',
      volume: 1.0,
      melody: [
        // Bar 1 — Em
        { freq: p('E5'), beats: 0.5 },
        { freq: p('B4'), beats: 0.5, gain: 0.8 },
        { freq: p('C5'), beats: 0.5, gain: 0.85 },
        { freq: p('D5'), beats: 0.5, gain: 0.85 },
        { freq: p('C5'), beats: 0.5, gain: 0.8 },
        { freq: p('B4'), beats: 0.5, gain: 0.8 },
        { freq: p('A4'), beats: 1 },
        // Bar 2 — Am
        { freq: p('A4'), beats: 0.5 },
        { freq: p('C5'), beats: 0.5, gain: 0.85 },
        { freq: p('E5'), beats: 1 },
        { freq: p('D5'), beats: 0.5, gain: 0.85 },
        { freq: p('C5'), beats: 0.5, gain: 0.8 },
        { freq: p('B4'), beats: 1 },
        // Bar 3 — Em
        { freq: p('B4'), beats: 0.5 },
        { freq: p('C5'), beats: 0.5, gain: 0.85 },
        { freq: p('D5'), beats: 1 },
        { freq: p('E5'), beats: 0.5 },
        { freq: p('C5'), beats: 0.5, gain: 0.85 },
        { freq: p('A4'), beats: 1 },
        // Bar 4 — Am into B7; the D#5 is the harmonic-minor leading tone that
        // makes the turn back to the top feel like a cadence, not a rewind.
        { freq: p('A4'), beats: 1 },
        { freq: REST, beats: 0.5 },
        { freq: p('B4'), beats: 0.5, gain: 0.8 },
        { freq: p('C5'), beats: 0.5, gain: 0.85 },
        { freq: p('D#5'), beats: 0.5, gain: 0.9 },
        { freq: p('E5'), beats: 1 },
        // Bar 5 — D
        { freq: p('D5'), beats: 0.5 },
        { freq: p('F5'), beats: 0.5, gain: 0.85 },
        { freq: p('A5'), beats: 1 },
        { freq: p('G5'), beats: 0.5, gain: 0.85 },
        { freq: p('F5'), beats: 0.5, gain: 0.8 },
        { freq: p('E5'), beats: 1 },
        // Bar 6 — C
        { freq: p('C5'), beats: 0.5 },
        { freq: p('E5'), beats: 0.5, gain: 0.85 },
        { freq: p('G5'), beats: 1 },
        { freq: p('F5'), beats: 0.5, gain: 0.85 },
        { freq: p('E5'), beats: 0.5, gain: 0.8 },
        { freq: p('D5'), beats: 1 },
        // Bar 7 — B7
        { freq: p('B4'), beats: 0.5 },
        { freq: p('D#5'), beats: 0.5, gain: 0.85 },
        { freq: p('F#5'), beats: 1 },
        { freq: p('E5'), beats: 0.5, gain: 0.85 },
        { freq: p('D#5'), beats: 0.5, gain: 0.8 },
        { freq: p('B4'), beats: 1 },
        // Bar 8 — Em, a run down onto a held tonic
        { freq: p('B5'), beats: 0.5 },
        { freq: p('A5'), beats: 0.5, gain: 0.9 },
        { freq: p('G5'), beats: 0.5, gain: 0.85 },
        { freq: p('F#5'), beats: 0.5, gain: 0.85 },
        { freq: p('E5'), beats: 2 }
      ]
    },
    {
      // BASS — warm triangle, pumping eighths. The per-bar accent shape
      // (strong, weak, medium, weak…) is what makes it drive rather than tick.
      wave: 'triangle',
      volume: 0.8,
      melody: [
        // Bar 1 — Em
        { freq: p('E2'), beats: 0.5 },
        { freq: p('B2'), beats: 0.5, gain: 0.6 },
        { freq: p('E3'), beats: 0.5, gain: 0.8 },
        { freq: p('B2'), beats: 0.5, gain: 0.6 },
        { freq: p('E2'), beats: 0.5, gain: 0.85 },
        { freq: p('B2'), beats: 0.5, gain: 0.6 },
        { freq: p('E3'), beats: 0.5, gain: 0.8 },
        { freq: p('B2'), beats: 0.5, gain: 0.6 },
        // Bar 2 — Am
        { freq: p('A2'), beats: 0.5 },
        { freq: p('E3'), beats: 0.5, gain: 0.6 },
        { freq: p('A3'), beats: 0.5, gain: 0.8 },
        { freq: p('E3'), beats: 0.5, gain: 0.6 },
        { freq: p('A2'), beats: 0.5, gain: 0.85 },
        { freq: p('E3'), beats: 0.5, gain: 0.6 },
        { freq: p('A3'), beats: 0.5, gain: 0.8 },
        { freq: p('E3'), beats: 0.5, gain: 0.6 },
        // Bar 3 — Em
        { freq: p('E2'), beats: 0.5 },
        { freq: p('B2'), beats: 0.5, gain: 0.6 },
        { freq: p('E3'), beats: 0.5, gain: 0.8 },
        { freq: p('B2'), beats: 0.5, gain: 0.6 },
        { freq: p('E2'), beats: 0.5, gain: 0.85 },
        { freq: p('B2'), beats: 0.5, gain: 0.6 },
        { freq: p('E3'), beats: 0.5, gain: 0.8 },
        { freq: p('B2'), beats: 0.5, gain: 0.6 },
        // Bar 4 — B7 (the A3 is the chord's seventh, pulling back to Em)
        { freq: p('B2'), beats: 0.5 },
        { freq: p('F#3'), beats: 0.5, gain: 0.6 },
        { freq: p('B3'), beats: 0.5, gain: 0.8 },
        { freq: p('F#3'), beats: 0.5, gain: 0.6 },
        { freq: p('B2'), beats: 0.5, gain: 0.85 },
        { freq: p('F#3'), beats: 0.5, gain: 0.6 },
        { freq: p('A3'), beats: 0.5, gain: 0.8 },
        { freq: p('F#3'), beats: 0.5, gain: 0.6 },
        // Bar 5 — D
        { freq: p('D2'), beats: 0.5 },
        { freq: p('A2'), beats: 0.5, gain: 0.6 },
        { freq: p('D3'), beats: 0.5, gain: 0.8 },
        { freq: p('A2'), beats: 0.5, gain: 0.6 },
        { freq: p('D2'), beats: 0.5, gain: 0.85 },
        { freq: p('A2'), beats: 0.5, gain: 0.6 },
        { freq: p('D3'), beats: 0.5, gain: 0.8 },
        { freq: p('A2'), beats: 0.5, gain: 0.6 },
        // Bar 6 — C
        { freq: p('C2'), beats: 0.5 },
        { freq: p('G2'), beats: 0.5, gain: 0.6 },
        { freq: p('C3'), beats: 0.5, gain: 0.8 },
        { freq: p('G2'), beats: 0.5, gain: 0.6 },
        { freq: p('C2'), beats: 0.5, gain: 0.85 },
        { freq: p('G2'), beats: 0.5, gain: 0.6 },
        { freq: p('C3'), beats: 0.5, gain: 0.8 },
        { freq: p('G2'), beats: 0.5, gain: 0.6 },
        // Bar 7 — B7
        { freq: p('B2'), beats: 0.5 },
        { freq: p('F#3'), beats: 0.5, gain: 0.6 },
        { freq: p('B3'), beats: 0.5, gain: 0.8 },
        { freq: p('F#3'), beats: 0.5, gain: 0.6 },
        { freq: p('B2'), beats: 0.5, gain: 0.85 },
        { freq: p('F#3'), beats: 0.5, gain: 0.6 },
        { freq: p('A3'), beats: 0.5, gain: 0.8 },
        { freq: p('F#3'), beats: 0.5, gain: 0.6 },
        // Bar 8 — Em
        { freq: p('E2'), beats: 0.5 },
        { freq: p('B2'), beats: 0.5, gain: 0.6 },
        { freq: p('E3'), beats: 0.5, gain: 0.8 },
        { freq: p('B2'), beats: 0.5, gain: 0.6 },
        { freq: p('E2'), beats: 0.5, gain: 0.85 },
        { freq: p('B2'), beats: 0.5, gain: 0.6 },
        { freq: p('E2'), beats: 0.5, gain: 0.8 },
        { freq: p('B2'), beats: 0.5, gain: 0.6 }
      ]
    },
    {
      // PAD — one sustained chord root per bar, low in the mix. Holds the
      // harmony together once the tempo ramp thins the plucked voices out.
      wave: 'triangle',
      envelope: 'pad',
      detune: 6,
      volume: 0.35,
      melody: [
        { freq: p('E3'), beats: 4 }, // Em
        { freq: p('A3'), beats: 4 }, // Am
        { freq: p('E3'), beats: 4 }, // Em
        { freq: p('B2'), beats: 4 }, // B7
        { freq: p('D3'), beats: 4 }, // D
        { freq: p('C3'), beats: 4 }, // C
        { freq: p('B2'), beats: 4 }, // B7
        { freq: p('E3'), beats: 4 } // Em
      ]
    }
  ]
};
