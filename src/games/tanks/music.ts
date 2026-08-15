/**
 * Tank Duel's score: a brassy bouncing march in C major.
 *
 * The 2026-08-14 music round took it from 8 beats — two bars, back round every
 * four seconds — to a proper eight-bar march in two strains: a bugle call and
 * its answer (bars 1-4), then a higher second strain that walks home (bars
 * 5-8). It also gains a third voice. The old arrangement was a tune and an
 * oom-pah with nothing in between, which is why it read as thin; the horn line
 * fills that middle, holding one chord tone per bar and moving by the smallest
 * step it can (E-D-E-F-E-F-D-E), so the march has body without a second melody
 * competing with the lead.
 */
import { p, REST, type GameAudioOptions } from '../engine';

export const TANKS_MUSIC: GameAudioOptions = {
  tempo: 116,
  volume: 0.1,
  echo: { time: 0.16, feedback: 0.15, mix: 0.12 },
  tracks: [
    {
      // LEAD: brassy march. The A#4 chromatic lean in bar 3 is kept from the
      // original — it is the cheeky bit that gives the cabinet its character.
      wave: 'sawtooth',
      detune: 8,
      volume: 0.95,
      envelope: 'pluck',
      melody: [
        // Bar 1 — C, the call
        { freq: p('G4'), beats: 0.5 },
        { freq: p('G4'), beats: 0.25, gain: 0.7 },
        { freq: p('G4'), beats: 0.25, gain: 0.7 },
        { freq: p('C5'), beats: 0.75 },
        { freq: p('B4'), beats: 0.25, gain: 0.75 },
        { freq: p('C5'), beats: 0.5, gain: 0.9 },
        { freq: p('D5'), beats: 0.5, gain: 0.9 },
        { freq: p('E5'), beats: 1 },
        // Bar 2 — G, the answer
        { freq: p('D5'), beats: 0.5 },
        { freq: p('D5'), beats: 0.25, gain: 0.7 },
        { freq: p('D5'), beats: 0.25, gain: 0.7 },
        { freq: p('B4'), beats: 0.75 },
        { freq: p('C5'), beats: 0.25, gain: 0.75 },
        { freq: p('D5'), beats: 0.5, gain: 0.9 },
        { freq: p('E5'), beats: 0.5, gain: 0.9 },
        { freq: p('D5'), beats: 1 },
        // Bar 3 — C, with the chromatic lean
        { freq: p('E5'), beats: 0.75 },
        { freq: p('D5'), beats: 0.25, gain: 0.8 },
        { freq: p('C5'), beats: 0.5, gain: 0.9 },
        { freq: p('B4'), beats: 0.5, gain: 0.85 },
        { freq: p('A#4'), beats: 0.25, gain: 0.8 },
        { freq: p('B4'), beats: 0.25, gain: 0.8 },
        { freq: p('C5'), beats: 0.5, gain: 0.9 },
        { freq: p('E5'), beats: 1 },
        // Bar 4 — G7, cadence and a bar's breath
        { freq: p('D5'), beats: 0.5 },
        { freq: p('G4'), beats: 0.5, gain: 0.85 },
        { freq: p('B4'), beats: 0.5, gain: 0.85 },
        { freq: p('D5'), beats: 0.5, gain: 0.9 },
        { freq: p('G5'), beats: 1 },
        { freq: REST, beats: 1 },
        // Bar 5 — C, the second strain opens an octave up
        { freq: p('G5'), beats: 0.5 },
        { freq: p('G5'), beats: 0.25, gain: 0.7 },
        { freq: p('G5'), beats: 0.25, gain: 0.7 },
        { freq: p('E5'), beats: 0.75 },
        { freq: p('F5'), beats: 0.25, gain: 0.75 },
        { freq: p('G5'), beats: 0.5, gain: 0.9 },
        { freq: p('A5'), beats: 0.5, gain: 0.9 },
        { freq: p('G5'), beats: 1 },
        // Bar 6 — F
        { freq: p('A5'), beats: 0.5 },
        { freq: p('G5'), beats: 0.25, gain: 0.75 },
        { freq: p('F5'), beats: 0.25, gain: 0.75 },
        { freq: p('E5'), beats: 0.75 },
        { freq: p('F5'), beats: 0.25, gain: 0.75 },
        { freq: p('G5'), beats: 0.5, gain: 0.9 },
        { freq: p('F5'), beats: 0.5, gain: 0.85 },
        { freq: p('E5'), beats: 1 },
        // Bar 7 — G, a scale walk up and back
        { freq: p('D5'), beats: 0.5, gain: 0.85 },
        { freq: p('E5'), beats: 0.5, gain: 0.85 },
        { freq: p('F5'), beats: 0.5, gain: 0.9 },
        { freq: p('G5'), beats: 0.5, gain: 0.9 },
        { freq: p('A5'), beats: 0.75 },
        { freq: p('G5'), beats: 0.25, gain: 0.8 },
        { freq: p('F5'), beats: 0.5, gain: 0.85 },
        { freq: p('D5'), beats: 0.5, gain: 0.85 },
        // Bar 8 — home
        { freq: p('E5'), beats: 0.5, gain: 0.9 },
        { freq: p('D5'), beats: 0.5, gain: 0.9 },
        { freq: p('C5'), beats: 1 },
        { freq: p('G4'), beats: 1 },
        { freq: REST, beats: 1 }
      ]
    },
    {
      // BASS: oom-pah. The low root carries the accent and the mid fifth is
      // ducked hard under it — an even pair of thuds is a metronome, not a march.
      wave: 'square',
      volume: 0.78,
      envelope: 'pluck',
      melody: [
        // Bar 1 — C
        { freq: p('C2'), beats: 0.5 },
        { freq: p('G2'), beats: 0.5, gain: 0.55 },
        { freq: p('C2'), beats: 0.5, gain: 0.9 },
        { freq: p('G2'), beats: 0.5, gain: 0.55 },
        { freq: p('C2'), beats: 0.5 },
        { freq: p('G2'), beats: 0.5, gain: 0.55 },
        { freq: p('C2'), beats: 0.5, gain: 0.9 },
        { freq: p('G2'), beats: 0.5, gain: 0.55 },
        // Bar 2 — G
        { freq: p('G2'), beats: 0.5 },
        { freq: p('D3'), beats: 0.5, gain: 0.55 },
        { freq: p('G2'), beats: 0.5, gain: 0.9 },
        { freq: p('D3'), beats: 0.5, gain: 0.55 },
        { freq: p('G2'), beats: 0.5 },
        { freq: p('D3'), beats: 0.5, gain: 0.55 },
        { freq: p('G2'), beats: 0.5, gain: 0.9 },
        { freq: p('D3'), beats: 0.5, gain: 0.55 },
        // Bar 3 — C
        { freq: p('C2'), beats: 0.5 },
        { freq: p('G2'), beats: 0.5, gain: 0.55 },
        { freq: p('C2'), beats: 0.5, gain: 0.9 },
        { freq: p('G2'), beats: 0.5, gain: 0.55 },
        { freq: p('C2'), beats: 0.5 },
        { freq: p('G2'), beats: 0.5, gain: 0.55 },
        { freq: p('C2'), beats: 0.5, gain: 0.9 },
        { freq: p('G2'), beats: 0.5, gain: 0.55 },
        // Bar 4 — G7 (the F3 is the seventh, pulling the cadence home)
        { freq: p('G2'), beats: 0.5 },
        { freq: p('D3'), beats: 0.5, gain: 0.55 },
        { freq: p('G2'), beats: 0.5, gain: 0.9 },
        { freq: p('F3'), beats: 0.5, gain: 0.6 },
        { freq: p('G2'), beats: 0.5 },
        { freq: p('D3'), beats: 0.5, gain: 0.55 },
        { freq: p('G2'), beats: 0.5, gain: 0.9 },
        { freq: p('F3'), beats: 0.5, gain: 0.6 },
        // Bar 5 — C
        { freq: p('C2'), beats: 0.5 },
        { freq: p('G2'), beats: 0.5, gain: 0.55 },
        { freq: p('C2'), beats: 0.5, gain: 0.9 },
        { freq: p('G2'), beats: 0.5, gain: 0.55 },
        { freq: p('C2'), beats: 0.5 },
        { freq: p('G2'), beats: 0.5, gain: 0.55 },
        { freq: p('C2'), beats: 0.5, gain: 0.9 },
        { freq: p('G2'), beats: 0.5, gain: 0.55 },
        // Bar 6 — F
        { freq: p('F2'), beats: 0.5 },
        { freq: p('C3'), beats: 0.5, gain: 0.55 },
        { freq: p('F2'), beats: 0.5, gain: 0.9 },
        { freq: p('C3'), beats: 0.5, gain: 0.55 },
        { freq: p('F2'), beats: 0.5 },
        { freq: p('C3'), beats: 0.5, gain: 0.55 },
        { freq: p('F2'), beats: 0.5, gain: 0.9 },
        { freq: p('C3'), beats: 0.5, gain: 0.55 },
        // Bar 7 — G
        { freq: p('G2'), beats: 0.5 },
        { freq: p('D3'), beats: 0.5, gain: 0.55 },
        { freq: p('G2'), beats: 0.5, gain: 0.9 },
        { freq: p('D3'), beats: 0.5, gain: 0.55 },
        { freq: p('G2'), beats: 0.5 },
        { freq: p('D3'), beats: 0.5, gain: 0.55 },
        { freq: p('G2'), beats: 0.5, gain: 0.9 },
        { freq: p('D3'), beats: 0.5, gain: 0.55 },
        // Bar 8 — C, then a walk up that hands the loop back to the top
        { freq: p('C2'), beats: 0.5 },
        { freq: p('G2'), beats: 0.5, gain: 0.55 },
        { freq: p('C2'), beats: 0.5, gain: 0.9 },
        { freq: p('G2'), beats: 0.5, gain: 0.55 },
        { freq: p('C2'), beats: 0.5 },
        { freq: p('D2'), beats: 0.5, gain: 0.8 },
        { freq: p('E2'), beats: 0.5, gain: 0.85 },
        { freq: p('B2'), beats: 0.5, gain: 0.9 }
      ]
    },
    {
      // HORN: one sustained chord tone per bar, filling the gap between the
      // tune and the oom-pah. It moves by step or not at all, so it thickens
      // the march without ever reading as a second melody.
      wave: 'sawtooth',
      envelope: 'pad',
      detune: 9,
      volume: 0.32,
      melody: [
        { freq: p('E4'), beats: 4 }, // C
        { freq: p('D4'), beats: 4 }, // G
        { freq: p('E4'), beats: 4 }, // C
        { freq: p('F4'), beats: 4 }, // G7
        { freq: p('E4'), beats: 4 }, // C
        { freq: p('F4'), beats: 4 }, // F
        { freq: p('D4'), beats: 4 }, // G
        { freq: p('E4'), beats: 4 } // C
      ]
    }
  ]
};
