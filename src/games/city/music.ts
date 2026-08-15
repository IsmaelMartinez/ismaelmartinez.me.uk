/**
 * Microcity's score: an unhurried, warm bed in C major for a builder sim.
 *
 * The 2026-08-14 music round tripled it, from a four-chord I-vi-IV-V vamp of 16
 * beats to a twelve-bar journey of 48 that leaves home and comes back:
 * C Am F G, then C Em Dm G through the middle, then Am F G C down to the
 * tonic. A sim is played for half an hour at a stretch, so the loop that
 * matters is the long one — at 104 bpm this is nearly half a minute, and the
 * Em and Dm in the middle are the only reason it reads as going somewhere.
 *
 * The bell lead keeps its rests. A voice that breathes is the whole character
 * of this cabinet, so bars mostly place three chord tones and then leave a beat
 * alone; only the middle four bars fill in, which is what makes them the peak.
 */
import { p, REST, type GameAudioOptions } from '../engine';

export const CITY_MUSIC: GameAudioOptions = {
  tempo: 104,
  volume: 0.12,
  echo: { time: 0.3, feedback: 0.2, mix: 0.18 },
  tracks: [
    {
      // PAD: sustained warm chord roots, a soft bed under everything.
      wave: 'triangle',
      envelope: 'pad',
      detune: 6,
      volume: 0.45,
      melody: [
        { freq: p('C4'), beats: 4 }, // I
        { freq: p('A3'), beats: 4 }, // vi
        { freq: p('F3'), beats: 4 }, // IV
        { freq: p('G3'), beats: 4 }, // V
        { freq: p('C4'), beats: 4 }, // I
        { freq: p('E4'), beats: 4 }, // iii
        { freq: p('D4'), beats: 4 }, // ii
        { freq: p('G3'), beats: 4 }, // V
        { freq: p('A3'), beats: 4 }, // vi
        { freq: p('F3'), beats: 4 }, // IV
        { freq: p('G3'), beats: 4 }, // V
        { freq: p('C4'), beats: 4 } // I
      ]
    },
    {
      // LEAD: light bell arpeggio tracing each chord, with rests for air.
      wave: 'sine',
      envelope: 'pluck',
      volume: 0.85,
      melody: [
        // Bars 1-4 — the opening statement, low and spacious
        { freq: p('C5'), beats: 1 },
        { freq: p('E5'), beats: 1, gain: 0.9 },
        { freq: p('G5'), beats: 1, gain: 0.9 },
        { freq: REST, beats: 1 },
        { freq: p('A4'), beats: 1 },
        { freq: p('C5'), beats: 1, gain: 0.9 },
        { freq: p('E5'), beats: 1, gain: 0.9 },
        { freq: REST, beats: 1 },
        { freq: p('F5'), beats: 1 },
        { freq: p('A5'), beats: 1, gain: 0.9 },
        { freq: p('C6'), beats: 1, gain: 0.85 },
        { freq: REST, beats: 1 },
        { freq: p('B4'), beats: 1 },
        { freq: p('D5'), beats: 1, gain: 0.9 },
        { freq: p('G5'), beats: 1, gain: 0.9 },
        { freq: REST, beats: 1 },
        // Bars 5-8 — the middle fills in and climbs; this is the phrase's peak
        { freq: p('E5'), beats: 1 },
        { freq: p('G5'), beats: 1 },
        { freq: p('C6'), beats: 1 },
        { freq: p('G5'), beats: 1, gain: 0.9 },
        { freq: p('G5'), beats: 1 },
        { freq: p('B5'), beats: 1 },
        { freq: p('E6'), beats: 0.5 },
        { freq: p('D6'), beats: 0.5, gain: 0.9 },
        { freq: p('B5'), beats: 1, gain: 0.9 },
        { freq: p('A5'), beats: 1 },
        { freq: p('F5'), beats: 1, gain: 0.9 },
        { freq: p('D5'), beats: 1, gain: 0.9 },
        { freq: REST, beats: 1 },
        { freq: p('D5'), beats: 1 },
        { freq: p('G5'), beats: 1, gain: 0.95 },
        { freq: p('B5'), beats: 1, gain: 0.95 },
        { freq: p('D6'), beats: 1 },
        // Bars 9-12 — the descent home, easing off as it goes
        { freq: p('C6'), beats: 1, gain: 0.9 },
        { freq: p('A5'), beats: 1, gain: 0.85 },
        { freq: p('E5'), beats: 1, gain: 0.85 },
        { freq: REST, beats: 1 },
        { freq: p('A5'), beats: 1, gain: 0.85 },
        { freq: p('F5'), beats: 1, gain: 0.8 },
        { freq: p('C5'), beats: 1, gain: 0.8 },
        { freq: REST, beats: 1 },
        { freq: p('B4'), beats: 1, gain: 0.8 },
        { freq: p('D5'), beats: 1, gain: 0.8 },
        { freq: p('G5'), beats: 1, gain: 0.8 },
        { freq: p('F5'), beats: 1, gain: 0.75 },
        { freq: p('E5'), beats: 1, gain: 0.75 },
        { freq: p('C5'), beats: 1, gain: 0.7 },
        { freq: REST, beats: 2 }
      ]
    },
    {
      // BASS: one slow root per bar. Its level swells gently into the middle
      // bars and settles again, so the twelve-bar arc is felt and not just heard.
      wave: 'triangle',
      volume: 0.7,
      melody: [
        { freq: p('C2'), beats: 4, gain: 0.9 },
        { freq: p('A2'), beats: 4, gain: 0.9 },
        { freq: p('F2'), beats: 4, gain: 0.95 },
        { freq: p('G2'), beats: 4, gain: 0.95 },
        { freq: p('C2'), beats: 4 },
        { freq: p('E2'), beats: 4 },
        { freq: p('D2'), beats: 4 },
        { freq: p('G2'), beats: 4 },
        { freq: p('A2'), beats: 4, gain: 0.9 },
        { freq: p('F2'), beats: 4, gain: 0.85 },
        { freq: p('G2'), beats: 4, gain: 0.85 },
        { freq: p('C2'), beats: 4, gain: 0.8 }
      ]
    }
  ]
};
