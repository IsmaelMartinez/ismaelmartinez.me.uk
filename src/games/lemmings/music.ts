/**
 * Critter Rescue's score: a jaunty folk tune in C major.
 *
 * The 2026-08-14 music round took it from 16 beats to 48 — twelve bars in
 * three four-bar phrases, climbing to a peak in bar 7 and falling a full two
 * octaves home in bar 8, which is the moment the old loop never had. It also
 * gains a third voice: a soft counter-line in half notes that moves against
 * the lead rather than sitting on one note, because a folk tune wants
 * company, not a drone.
 */
import { p, REST, type GameAudioOptions } from '../engine';

export const LEMMINGS_MUSIC: GameAudioOptions = {
  tempo: 136,
  volume: 0.09,
  echo: { time: 0.24, feedback: 0.18, mix: 0.15 },
  tracks: [
    {
      // LEAD: skipping eighth-note melody. Each bar arpeggiates its chord up
      // and settles on a held note, and the pickups between are ducked so the
      // line skips rather than marches.
      wave: 'square',
      detune: 5,
      volume: 0.95,
      envelope: 'pluck',
      melody: [
        // Bar 1 — C
        { freq: p('C4'), beats: 0.5 },
        { freq: p('E4'), beats: 0.5, gain: 0.8 },
        { freq: p('G4'), beats: 0.5, gain: 0.85 },
        { freq: p('E4'), beats: 0.5, gain: 0.75 },
        { freq: p('C5'), beats: 0.5 },
        { freq: p('G4'), beats: 0.5, gain: 0.8 },
        { freq: p('E4'), beats: 1 },
        // Bar 2 — F
        { freq: p('F4'), beats: 0.5 },
        { freq: p('A4'), beats: 0.5, gain: 0.8 },
        { freq: p('C5'), beats: 0.5, gain: 0.85 },
        { freq: p('A4'), beats: 0.5, gain: 0.75 },
        { freq: p('F5'), beats: 0.5 },
        { freq: p('C5'), beats: 0.5, gain: 0.8 },
        { freq: p('A4'), beats: 1 },
        // Bar 3 — C
        { freq: p('G4'), beats: 0.5 },
        { freq: p('E4'), beats: 0.5, gain: 0.8 },
        { freq: p('C5'), beats: 0.5, gain: 0.85 },
        { freq: p('G4'), beats: 0.5, gain: 0.75 },
        { freq: p('E5'), beats: 0.5 },
        { freq: p('C5'), beats: 0.5, gain: 0.8 },
        { freq: p('G4'), beats: 1 },
        // Bar 4 — G
        { freq: p('D5'), beats: 0.5 },
        { freq: p('B4'), beats: 0.5, gain: 0.8 },
        { freq: p('G4'), beats: 0.5, gain: 0.85 },
        { freq: p('B4'), beats: 0.5, gain: 0.75 },
        { freq: p('D5'), beats: 0.5 },
        { freq: p('G5'), beats: 0.5, gain: 0.85 },
        { freq: p('D5'), beats: 1 },
        // Bar 5 — Am
        { freq: p('A4'), beats: 0.5 },
        { freq: p('C5'), beats: 0.5, gain: 0.8 },
        { freq: p('E5'), beats: 0.5, gain: 0.85 },
        { freq: p('C5'), beats: 0.5, gain: 0.75 },
        { freq: p('A5'), beats: 0.5 },
        { freq: p('E5'), beats: 0.5, gain: 0.8 },
        { freq: p('C5'), beats: 1 },
        // Bar 6 — F
        { freq: p('F5'), beats: 0.5 },
        { freq: p('C5'), beats: 0.5, gain: 0.8 },
        { freq: p('A4'), beats: 0.5, gain: 0.85 },
        { freq: p('C5'), beats: 0.5, gain: 0.75 },
        { freq: p('F5'), beats: 0.5 },
        { freq: p('A5'), beats: 0.5, gain: 0.85 },
        { freq: p('F5'), beats: 1 },
        // Bar 7 — G, the phrase's peak
        { freq: p('G5'), beats: 0.5 },
        { freq: p('D5'), beats: 0.5, gain: 0.85 },
        { freq: p('B4'), beats: 0.5, gain: 0.85 },
        { freq: p('D5'), beats: 0.5, gain: 0.85 },
        { freq: p('G5'), beats: 0.5 },
        { freq: p('B5'), beats: 0.5 },
        { freq: p('D6'), beats: 1 },
        // Bar 8 — C, and the whole two-octave fall home
        { freq: p('C6'), beats: 0.5 },
        { freq: p('G5'), beats: 0.5, gain: 0.9 },
        { freq: p('E5'), beats: 0.5, gain: 0.85 },
        { freq: p('C5'), beats: 0.5, gain: 0.85 },
        { freq: p('G4'), beats: 0.5, gain: 0.8 },
        { freq: p('E4'), beats: 0.5, gain: 0.8 },
        { freq: p('C4'), beats: 1 },
        // Bar 9 — C
        { freq: p('E4'), beats: 0.5, gain: 0.85 },
        { freq: p('G4'), beats: 0.5, gain: 0.8 },
        { freq: p('C5'), beats: 0.5, gain: 0.85 },
        { freq: p('G4'), beats: 0.5, gain: 0.75 },
        { freq: p('E5'), beats: 0.5, gain: 0.9 },
        { freq: p('C5'), beats: 0.5, gain: 0.8 },
        { freq: p('G4'), beats: 1 },
        // Bar 10 — Dm
        { freq: p('D5'), beats: 0.5 },
        { freq: p('F5'), beats: 0.5, gain: 0.8 },
        { freq: p('A5'), beats: 0.5, gain: 0.85 },
        { freq: p('F5'), beats: 0.5, gain: 0.75 },
        { freq: p('D5'), beats: 0.5 },
        { freq: p('A4'), beats: 0.5, gain: 0.8 },
        { freq: p('F4'), beats: 1 },
        // Bar 11 — G
        { freq: p('G4'), beats: 0.5 },
        { freq: p('B4'), beats: 0.5, gain: 0.8 },
        { freq: p('D5'), beats: 0.5, gain: 0.85 },
        { freq: p('G5'), beats: 0.5 },
        { freq: p('F5'), beats: 0.5, gain: 0.85 },
        { freq: p('D5'), beats: 0.5, gain: 0.8 },
        { freq: p('B4'), beats: 1 },
        // Bar 12 — C, and a beat of quiet before it comes round
        { freq: p('C5'), beats: 0.5 },
        { freq: p('E5'), beats: 0.5, gain: 0.85 },
        { freq: p('G5'), beats: 0.5, gain: 0.85 },
        { freq: p('E5'), beats: 0.5, gain: 0.8 },
        { freq: p('C5'), beats: 1 },
        { freq: REST, beats: 1 }
      ]
    },
    {
      // BASS: a walking quarter-note line. Beat 1 lands full, beat 3 a little
      // under it, and the passing beats duck — the shape that makes a walk walk.
      wave: 'triangle',
      volume: 0.7,
      envelope: 'pluck',
      melody: [
        // Bar 1 — C
        { freq: p('C2'), beats: 1 },
        { freq: p('E2'), beats: 1, gain: 0.65 },
        { freq: p('G2'), beats: 1, gain: 0.85 },
        { freq: p('E2'), beats: 1, gain: 0.65 },
        // Bar 2 — F
        { freq: p('F2'), beats: 1 },
        { freq: p('A2'), beats: 1, gain: 0.65 },
        { freq: p('C3'), beats: 1, gain: 0.85 },
        { freq: p('A2'), beats: 1, gain: 0.65 },
        // Bar 3 — C
        { freq: p('C2'), beats: 1 },
        { freq: p('G2'), beats: 1, gain: 0.65 },
        { freq: p('E2'), beats: 1, gain: 0.85 },
        { freq: p('G2'), beats: 1, gain: 0.65 },
        // Bar 4 — G
        { freq: p('G2'), beats: 1 },
        { freq: p('B2'), beats: 1, gain: 0.65 },
        { freq: p('D3'), beats: 1, gain: 0.85 },
        { freq: p('B2'), beats: 1, gain: 0.65 },
        // Bar 5 — Am
        { freq: p('A2'), beats: 1 },
        { freq: p('C3'), beats: 1, gain: 0.65 },
        { freq: p('E3'), beats: 1, gain: 0.85 },
        { freq: p('C3'), beats: 1, gain: 0.65 },
        // Bar 6 — F
        { freq: p('F2'), beats: 1 },
        { freq: p('A2'), beats: 1, gain: 0.65 },
        { freq: p('C3'), beats: 1, gain: 0.85 },
        { freq: p('A2'), beats: 1, gain: 0.65 },
        // Bar 7 — G (the F3 is the seventh, leaning into the resolution)
        { freq: p('G2'), beats: 1 },
        { freq: p('B2'), beats: 1, gain: 0.65 },
        { freq: p('D3'), beats: 1, gain: 0.85 },
        { freq: p('F3'), beats: 1, gain: 0.7 },
        // Bar 8 — C
        { freq: p('C2'), beats: 1 },
        { freq: p('G2'), beats: 1, gain: 0.65 },
        { freq: p('E2'), beats: 1, gain: 0.85 },
        { freq: p('C2'), beats: 1, gain: 0.65 },
        // Bar 9 — C
        { freq: p('C2'), beats: 1 },
        { freq: p('E2'), beats: 1, gain: 0.65 },
        { freq: p('G2'), beats: 1, gain: 0.85 },
        { freq: p('E2'), beats: 1, gain: 0.65 },
        // Bar 10 — Dm
        { freq: p('D2'), beats: 1 },
        { freq: p('F2'), beats: 1, gain: 0.65 },
        { freq: p('A2'), beats: 1, gain: 0.85 },
        { freq: p('F2'), beats: 1, gain: 0.65 },
        // Bar 11 — G
        { freq: p('G2'), beats: 1 },
        { freq: p('B2'), beats: 1, gain: 0.65 },
        { freq: p('D3'), beats: 1, gain: 0.85 },
        { freq: p('F3'), beats: 1, gain: 0.7 },
        // Bar 12 — C, walking up to hand the loop back to the top
        { freq: p('C2'), beats: 1 },
        { freq: p('E2'), beats: 1, gain: 0.65 },
        { freq: p('G2'), beats: 1, gain: 0.85 },
        { freq: p('B2'), beats: 1, gain: 0.75 }
      ]
    },
    {
      // COUNTER: two soft sustained chord tones per bar, moving against the
      // lead. Low in the mix — it is felt as warmth between the tune and the
      // walking bass rather than heard as a second part.
      wave: 'triangle',
      envelope: 'pad',
      detune: 7,
      volume: 0.33,
      melody: [
        { freq: p('E4'), beats: 2 }, // C
        { freq: p('G4'), beats: 2 },
        { freq: p('A4'), beats: 2 }, // F
        { freq: p('F4'), beats: 2 },
        { freq: p('G4'), beats: 2 }, // C
        { freq: p('E4'), beats: 2 },
        { freq: p('D4'), beats: 2 }, // G
        { freq: p('B3'), beats: 2 },
        { freq: p('C5'), beats: 2 }, // Am
        { freq: p('A4'), beats: 2 },
        { freq: p('A4'), beats: 2 }, // F
        { freq: p('C5'), beats: 2 },
        { freq: p('B4'), beats: 2 }, // G
        { freq: p('D5'), beats: 2 },
        { freq: p('C5'), beats: 2 }, // C
        { freq: p('G4'), beats: 2 },
        { freq: p('E4'), beats: 2 }, // C
        { freq: p('G4'), beats: 2 },
        { freq: p('F4'), beats: 2 }, // Dm
        { freq: p('A4'), beats: 2 },
        { freq: p('G4'), beats: 2 }, // G
        { freq: p('B4'), beats: 2 },
        { freq: p('C5'), beats: 2 }, // C
        { freq: p('G4'), beats: 2 }
      ]
    }
  ]
};
