/**
 * Pixel Park's score: a fairground carousel waltz in G major, 3/4.
 *
 * The 2026-08-14 music round doubled it, from eight bars to sixteen: the
 * original waltz is kept as the A strain (bars 1-8) and answered by a new B
 * strain (bars 9-16) that turns to E minor and reaches the loop's top note
 * before coming home. A carousel tune that repeats every nine seconds is a
 * fairground organ stuck on one roll; a sixteen-bar waltz with two strains is
 * what one actually sounds like.
 *
 * The cabinet is parked (see CLAUDE.md), so this is not currently reachable in
 * the arcade. It is kept in step with the rest so a revival is a page rename
 * and nothing else.
 */
import { p, type GameAudioOptions } from '../engine';

export const PARK_MUSIC: GameAudioOptions = {
  tempo: 156,
  volume: 0.12,
  echo: { time: 0.26, feedback: 0.25, mix: 0.22 },
  tracks: [
    {
      // LEAD: bright, lilting waltz melody. The downbeat of each bar carries
      // the accent and beats 2 and 3 sit under it — the lilt is in that dip.
      wave: 'square',
      envelope: 'pluck',
      detune: 7,
      volume: 1.0,
      melody: [
        // A strain, bar 1 — G
        { freq: p('G5'), beats: 1 },
        { freq: p('B5'), beats: 1, gain: 0.8 },
        { freq: p('A5'), beats: 1, gain: 0.8 },
        // Bar 2 — D
        { freq: p('A5'), beats: 1 },
        { freq: p('F#5'), beats: 1, gain: 0.8 },
        { freq: p('D5'), beats: 1, gain: 0.8 },
        // Bar 3 — C
        { freq: p('E5'), beats: 1 },
        { freq: p('G5'), beats: 1, gain: 0.8 },
        { freq: p('C6'), beats: 1, gain: 0.85 },
        // Bar 4 — D, with a flourish
        { freq: p('B5'), beats: 1 },
        { freq: p('A5'), beats: 0.5, gain: 0.8 },
        { freq: p('F#5'), beats: 0.5, gain: 0.8 },
        { freq: p('A5'), beats: 1, gain: 0.85 },
        // Bar 5 — G
        { freq: p('G5'), beats: 1 },
        { freq: p('B5'), beats: 1, gain: 0.8 },
        { freq: p('A5'), beats: 1, gain: 0.8 },
        // Bar 6 — D
        { freq: p('A5'), beats: 1 },
        { freq: p('F#5'), beats: 1, gain: 0.8 },
        { freq: p('D5'), beats: 1, gain: 0.8 },
        // Bar 7 — C
        { freq: p('E5'), beats: 1 },
        { freq: p('C5'), beats: 1, gain: 0.8 },
        { freq: p('G5'), beats: 1, gain: 0.8 },
        // Bar 8 — D resolving to G
        { freq: p('F#5'), beats: 1 },
        { freq: p('A5'), beats: 1, gain: 0.85 },
        { freq: p('G5'), beats: 1, gain: 0.85 },
        // B strain, bar 9 — Em, the turn to minor
        { freq: p('E5'), beats: 1 },
        { freq: p('G5'), beats: 1, gain: 0.85 },
        { freq: p('B5'), beats: 1, gain: 0.85 },
        // Bar 10 — C
        { freq: p('C6'), beats: 1 },
        { freq: p('B5'), beats: 0.5, gain: 0.8 },
        { freq: p('A5'), beats: 0.5, gain: 0.8 },
        { freq: p('G5'), beats: 1, gain: 0.85 },
        // Bar 11 — G
        { freq: p('D6'), beats: 1 },
        { freq: p('B5'), beats: 1, gain: 0.85 },
        { freq: p('G5'), beats: 1, gain: 0.85 },
        // Bar 12 — D
        { freq: p('A5'), beats: 1 },
        { freq: p('C6'), beats: 1, gain: 0.85 },
        { freq: p('A5'), beats: 1, gain: 0.8 },
        // Bar 13 — Em
        { freq: p('B5'), beats: 1 },
        { freq: p('G5'), beats: 1, gain: 0.85 },
        { freq: p('E5'), beats: 1, gain: 0.8 },
        // Bar 14 — C, the top of the whole loop
        { freq: p('C6'), beats: 1 },
        { freq: p('E6'), beats: 1 },
        { freq: p('C6'), beats: 1, gain: 0.9 },
        // Bar 15 — D, walking down
        { freq: p('D6'), beats: 1 },
        { freq: p('C6'), beats: 0.5, gain: 0.85 },
        { freq: p('B5'), beats: 0.5, gain: 0.85 },
        { freq: p('A5'), beats: 1, gain: 0.85 },
        // Bar 16 — G, home
        { freq: p('G5'), beats: 1 },
        { freq: p('B5'), beats: 1, gain: 0.85 },
        { freq: p('G5'), beats: 1, gain: 0.8 }
      ]
    },
    {
      // BASS: oom-pah-pah. The low root takes the accent and the two lighter
      // mid tones after it duck hard; that ratio is the entire waltz feel.
      wave: 'triangle',
      envelope: 'pluck',
      volume: 0.75,
      melody: [
        // Bar 1 — G
        { freq: p('G2'), beats: 1 },
        { freq: p('B2'), beats: 1, gain: 0.5 },
        { freq: p('D3'), beats: 1, gain: 0.55 },
        // Bar 2 — D
        { freq: p('D2'), beats: 1 },
        { freq: p('A2'), beats: 1, gain: 0.5 },
        { freq: p('D3'), beats: 1, gain: 0.55 },
        // Bar 3 — C
        { freq: p('C2'), beats: 1 },
        { freq: p('E2'), beats: 1, gain: 0.5 },
        { freq: p('G2'), beats: 1, gain: 0.55 },
        // Bar 4 — D
        { freq: p('D2'), beats: 1 },
        { freq: p('A2'), beats: 1, gain: 0.5 },
        { freq: p('D3'), beats: 1, gain: 0.55 },
        // Bar 5 — G
        { freq: p('G2'), beats: 1 },
        { freq: p('B2'), beats: 1, gain: 0.5 },
        { freq: p('D3'), beats: 1, gain: 0.55 },
        // Bar 6 — D
        { freq: p('D2'), beats: 1 },
        { freq: p('A2'), beats: 1, gain: 0.5 },
        { freq: p('D3'), beats: 1, gain: 0.55 },
        // Bar 7 — C
        { freq: p('C2'), beats: 1 },
        { freq: p('E2'), beats: 1, gain: 0.5 },
        { freq: p('G2'), beats: 1, gain: 0.55 },
        // Bar 8 — D
        { freq: p('D2'), beats: 1 },
        { freq: p('A2'), beats: 1, gain: 0.5 },
        { freq: p('F#3'), beats: 1, gain: 0.6 },
        // Bar 9 — Em
        { freq: p('E2'), beats: 1 },
        { freq: p('B2'), beats: 1, gain: 0.5 },
        { freq: p('E3'), beats: 1, gain: 0.55 },
        // Bar 10 — C
        { freq: p('C2'), beats: 1 },
        { freq: p('G2'), beats: 1, gain: 0.5 },
        { freq: p('C3'), beats: 1, gain: 0.55 },
        // Bar 11 — G
        { freq: p('G2'), beats: 1 },
        { freq: p('B2'), beats: 1, gain: 0.5 },
        { freq: p('D3'), beats: 1, gain: 0.55 },
        // Bar 12 — D
        { freq: p('D2'), beats: 1 },
        { freq: p('A2'), beats: 1, gain: 0.5 },
        { freq: p('D3'), beats: 1, gain: 0.55 },
        // Bar 13 — Em
        { freq: p('E2'), beats: 1 },
        { freq: p('B2'), beats: 1, gain: 0.5 },
        { freq: p('E3'), beats: 1, gain: 0.55 },
        // Bar 14 — C
        { freq: p('C2'), beats: 1 },
        { freq: p('G2'), beats: 1, gain: 0.5 },
        { freq: p('C3'), beats: 1, gain: 0.55 },
        // Bar 15 — D
        { freq: p('D2'), beats: 1 },
        { freq: p('A2'), beats: 1, gain: 0.5 },
        { freq: p('D3'), beats: 1, gain: 0.55 },
        // Bar 16 — G
        { freq: p('G2'), beats: 1 },
        { freq: p('D3'), beats: 1, gain: 0.5 },
        { freq: p('B2'), beats: 1, gain: 0.55 }
      ]
    },
    {
      // BED: sustained organ pad holding each bar's chord root.
      wave: 'sine',
      envelope: 'pad',
      volume: 0.4,
      melody: [
        { freq: p('G4'), beats: 3 },
        { freq: p('D4'), beats: 3 },
        { freq: p('C4'), beats: 3 },
        { freq: p('D4'), beats: 3 },
        { freq: p('G4'), beats: 3 },
        { freq: p('D4'), beats: 3 },
        { freq: p('C4'), beats: 3 },
        { freq: p('D4'), beats: 3 },
        { freq: p('E4'), beats: 3 },
        { freq: p('C4'), beats: 3 },
        { freq: p('G4'), beats: 3 },
        { freq: p('D4'), beats: 3 },
        { freq: p('E4'), beats: 3 },
        { freq: p('C4'), beats: 3 },
        { freq: p('D4'), beats: 3 },
        { freq: p('G4'), beats: 3 }
      ]
    }
  ]
};
