/**
 * Calcio '90's score: a terrace anthem in D major.
 *
 * The cabinet is an Italia '90 homage, so the tune is the thing a tournament
 * theme is: massed brass over a stadium backbeat, major key, sung rather than
 * played. That is what separates it from the arcade's other march. Tank Duel is
 * a bouncy eight-bar oom-pah with the weight on beats 1 and 3; this one puts
 * every accent on 2 and 4, where a terrace claps, and hangs long held notes
 * over the top of it. The echo is the other half of the identity — a long wash
 * rather than Tank Duel's tight slap, which is what an open stand sounds like.
 *
 * Form is twelve bars in three four-bar phrases: a call (bars 1-4), an answer
 * that lifts and leaps away at the end (bars 5-8), and a chorus (bars 9-12)
 * that carries the loop's top note and finally comes home. Harmony is plain on
 * purpose, I-IV-V with one turn to the relative minor: D G A D | Bm G A D |
 * G D A7 D. An anthem is meant to be singable on the second hearing.
 *
 * This module exists because the cabinet was written before the 2026-08-14
 * music round and was the last one still holding its score inline in `game.ts`.
 * That audit also found a real bug, not a style point: the old voices ran 11,
 * 8 and 8 beats. Voices advance on independent cursors, so unequal lines do not
 * drift and recover — the lead's downbeat landed on a different bass note every
 * time round, and never came back. All three voices are 48 beats here, which
 * `tests/games/music.test.ts` now pins.
 */
import { p, REST, type GameAudioOptions } from '../engine';

/**
 * The score's own tempo, the pace it was written at and the one the group
 * stage plays. It lives here and not in `game.ts` for the same reason
 * Cascade's does: it is a property of the arrangement, whereas how far a run
 * winds it up is policy about the game. `stageTempo()` keeps the ramp.
 *
 * A stage change is safe mid-loop: the engine's `setTempo` rescales every
 * pending cursor by the tempo ratio, so the voices re-time together instead of
 * the sustained pad sliding behind the plucked ones.
 */
export const BASE_TEMPO = 132;

export const FOOTBALL_MUSIC: GameAudioOptions = {
  tempo: BASE_TEMPO,
  volume: 0.1,
  // A long wash, around a dotted eighth at base tempo, fed back hard enough to
  // leave a tail under the next phrase. It falls off the grid as the knockout
  // stages wind the tempo up, which is wanted: the wash should read as a room,
  // not as a fourth voice keeping time.
  echo: { time: 0.3, feedback: 0.28, mix: 0.24 },
  tracks: [
    {
      // LEAD — massed brass. The wide detune is the point: a single sawtooth is
      // one trumpet, a detuned pair is a section, and the tune is written to be
      // sung along with. Long notes on the downbeats, short steps between them.
      wave: 'sawtooth',
      volume: 0.95,
      detune: 12,
      melody: [
        // Bar 1 — D. The call, off a two-note pickup.
        { freq: p('A4'), beats: 0.5, gain: 0.75 },
        { freq: p('A4'), beats: 0.5, gain: 0.7 },
        { freq: p('D5'), beats: 1.5 },
        { freq: p('E5'), beats: 0.5, gain: 0.85 },
        { freq: p('F#5'), beats: 1 },
        // Bar 2 — G
        { freq: p('E5'), beats: 1.5, gain: 0.9 },
        { freq: p('F#5'), beats: 0.5, gain: 0.8 },
        { freq: p('G5'), beats: 1 },
        { freq: p('E5'), beats: 1, gain: 0.85 },
        // Bar 3 — A
        { freq: p('F#5'), beats: 1.5, gain: 0.9 },
        { freq: p('E5'), beats: 0.5, gain: 0.8 },
        { freq: p('D5'), beats: 1, gain: 0.85 },
        { freq: p('E5'), beats: 1, gain: 0.85 },
        // Bar 4 — D. A held tonic and a bar's breath; the terrace answers here.
        { freq: p('D5'), beats: 2, gain: 0.9 },
        { freq: REST, beats: 1 },
        { freq: p('A4'), beats: 1, gain: 0.75 },
        // Bar 5 — Bm, the answer phrase, same shape a third lower.
        { freq: p('B4'), beats: 0.5, gain: 0.75 },
        { freq: p('B4'), beats: 0.5, gain: 0.7 },
        { freq: p('F#5'), beats: 1.5 },
        { freq: p('E5'), beats: 0.5, gain: 0.85 },
        { freq: p('D5'), beats: 1, gain: 0.85 },
        // Bar 6 — G
        { freq: p('G5'), beats: 1.5, gain: 0.9 },
        { freq: p('F#5'), beats: 0.5, gain: 0.8 },
        { freq: p('E5'), beats: 1, gain: 0.85 },
        { freq: p('D5'), beats: 1, gain: 0.85 },
        // Bar 7 — A. The C#5 is the leading tone, leaning back to the tonic.
        { freq: p('C#5'), beats: 1.5, gain: 0.9 },
        { freq: p('D5'), beats: 0.5, gain: 0.8 },
        { freq: p('E5'), beats: 1, gain: 0.85 },
        { freq: p('F#5'), beats: 1, gain: 0.9 },
        // Bar 8 — D, then the octave leap that launches the chorus.
        { freq: p('D5'), beats: 2, gain: 0.9 },
        { freq: REST, beats: 0.5 },
        { freq: p('A5'), beats: 1.5 },
        // Bar 9 — G. The chorus, the whole loop's loudest phrase.
        { freq: p('B5'), beats: 1.5 },
        { freq: p('A5'), beats: 0.5, gain: 0.9 },
        { freq: p('G5'), beats: 1, gain: 0.95 },
        { freq: p('A5'), beats: 1, gain: 0.95 },
        // Bar 10 — D. The D6 is the ceiling of the arrangement, hit once.
        { freq: p('F#5'), beats: 1.5 },
        { freq: p('A5'), beats: 0.5, gain: 0.9 },
        { freq: p('D6'), beats: 1 },
        { freq: p('A5'), beats: 1, gain: 0.95 },
        // Bar 11 — A7, walking down off the top
        { freq: p('B5'), beats: 1.5 },
        { freq: p('A5'), beats: 0.5, gain: 0.9 },
        { freq: p('G5'), beats: 1, gain: 0.95 },
        { freq: p('F#5'), beats: 1, gain: 0.9 },
        // Bar 12 — D, home on a long tonic and one beat of air before the top.
        { freq: p('E5'), beats: 0.5, gain: 0.85 },
        { freq: p('F#5'), beats: 0.5, gain: 0.9 },
        { freq: p('D5'), beats: 2.5 },
        { freq: REST, beats: 0.5 }
      ]
    },
    {
      // BASS — the terrace backbeat. Two low eighths and then the accent on the
      // fifth, twice a bar: boom-boom-clap. The accent deliberately lands on
      // beats 2 and 4, not on 1 and 3 — that displacement is what makes it read
      // as a crowd rather than as a marching band, and it is the one thing that
      // most separates this cabinet from Tank Duel's oom-pah.
      wave: 'triangle',
      volume: 0.85,
      melody: [
        // Bar 1 — D
        { freq: p('D2'), beats: 0.5, gain: 0.8 },
        { freq: p('D2'), beats: 0.5, gain: 0.6 },
        { freq: p('A2'), beats: 1 },
        { freq: p('D2'), beats: 0.5, gain: 0.8 },
        { freq: p('D2'), beats: 0.5, gain: 0.6 },
        { freq: p('A2'), beats: 1 },
        // Bar 2 — G
        { freq: p('G2'), beats: 0.5, gain: 0.8 },
        { freq: p('G2'), beats: 0.5, gain: 0.6 },
        { freq: p('D3'), beats: 1 },
        { freq: p('G2'), beats: 0.5, gain: 0.8 },
        { freq: p('G2'), beats: 0.5, gain: 0.6 },
        { freq: p('D3'), beats: 1 },
        // Bar 3 — A
        { freq: p('A2'), beats: 0.5, gain: 0.8 },
        { freq: p('A2'), beats: 0.5, gain: 0.6 },
        { freq: p('E3'), beats: 1 },
        { freq: p('A2'), beats: 0.5, gain: 0.8 },
        { freq: p('A2'), beats: 0.5, gain: 0.6 },
        { freq: p('E3'), beats: 1 },
        // Bar 4 — D
        { freq: p('D2'), beats: 0.5, gain: 0.8 },
        { freq: p('D2'), beats: 0.5, gain: 0.6 },
        { freq: p('A2'), beats: 1 },
        { freq: p('D2'), beats: 0.5, gain: 0.8 },
        { freq: p('D2'), beats: 0.5, gain: 0.6 },
        { freq: p('A2'), beats: 1 },
        // Bar 5 — Bm
        { freq: p('B2'), beats: 0.5, gain: 0.8 },
        { freq: p('B2'), beats: 0.5, gain: 0.6 },
        { freq: p('F#3'), beats: 1 },
        { freq: p('B2'), beats: 0.5, gain: 0.8 },
        { freq: p('B2'), beats: 0.5, gain: 0.6 },
        { freq: p('F#3'), beats: 1 },
        // Bar 6 — G
        { freq: p('G2'), beats: 0.5, gain: 0.8 },
        { freq: p('G2'), beats: 0.5, gain: 0.6 },
        { freq: p('D3'), beats: 1 },
        { freq: p('G2'), beats: 0.5, gain: 0.8 },
        { freq: p('G2'), beats: 0.5, gain: 0.6 },
        { freq: p('D3'), beats: 1 },
        // Bar 7 — A
        { freq: p('A2'), beats: 0.5, gain: 0.8 },
        { freq: p('A2'), beats: 0.5, gain: 0.6 },
        { freq: p('E3'), beats: 1 },
        { freq: p('A2'), beats: 0.5, gain: 0.8 },
        { freq: p('A2'), beats: 0.5, gain: 0.6 },
        { freq: p('E3'), beats: 1 },
        // Bar 8 — D
        { freq: p('D2'), beats: 0.5, gain: 0.8 },
        { freq: p('D2'), beats: 0.5, gain: 0.6 },
        { freq: p('A2'), beats: 1 },
        { freq: p('D2'), beats: 0.5, gain: 0.8 },
        { freq: p('D2'), beats: 0.5, gain: 0.6 },
        { freq: p('A2'), beats: 1 },
        // Bar 9 — G, the chorus: the low eighths come up with the lead.
        { freq: p('G2'), beats: 0.5, gain: 0.9 },
        { freq: p('G2'), beats: 0.5, gain: 0.7 },
        { freq: p('D3'), beats: 1 },
        { freq: p('G2'), beats: 0.5, gain: 0.9 },
        { freq: p('G2'), beats: 0.5, gain: 0.7 },
        { freq: p('D3'), beats: 1 },
        // Bar 10 — D
        { freq: p('D2'), beats: 0.5, gain: 0.9 },
        { freq: p('D2'), beats: 0.5, gain: 0.7 },
        { freq: p('A2'), beats: 1 },
        { freq: p('D2'), beats: 0.5, gain: 0.9 },
        { freq: p('D2'), beats: 0.5, gain: 0.7 },
        { freq: p('A2'), beats: 1 },
        // Bar 11 — A7 (the G3 is the seventh, pulling the cadence home)
        { freq: p('A2'), beats: 0.5, gain: 0.9 },
        { freq: p('A2'), beats: 0.5, gain: 0.7 },
        { freq: p('E3'), beats: 1 },
        { freq: p('A2'), beats: 0.5, gain: 0.9 },
        { freq: p('A2'), beats: 0.5, gain: 0.7 },
        { freq: p('G3'), beats: 1 },
        // Bar 12 — D, ending on the leading tone so the loop hands itself back
        // to the top rather than stopping dead on the tonic.
        { freq: p('D2'), beats: 0.5, gain: 0.8 },
        { freq: p('D2'), beats: 0.5, gain: 0.6 },
        { freq: p('A2'), beats: 1 },
        { freq: p('D2'), beats: 0.5, gain: 0.8 },
        { freq: p('D2'), beats: 0.5, gain: 0.6 },
        { freq: p('C#3'), beats: 1 }
      ]
    },
    {
      // CHOIR — one sustained chord tone a bar under the call and answer, then
      // moving in halves through the chorus so the last phrase lifts rather
      // than sitting still. It moves by step wherever it can, so it thickens
      // the harmony without ever becoming a second tune. Its levels climb
      // across the loop: that arc is the pad's whole job, and it is why the
      // chorus sounds bigger than the call while both play the same brass.
      wave: 'sawtooth',
      envelope: 'pad',
      detune: 7,
      volume: 0.34,
      melody: [
        { freq: p('F#3'), beats: 4, gain: 0.6 }, // D
        { freq: p('G3'), beats: 4, gain: 0.65 }, // G
        { freq: p('E3'), beats: 4, gain: 0.65 }, // A
        { freq: p('F#3'), beats: 4, gain: 0.7 }, // D
        { freq: p('F#3'), beats: 4, gain: 0.75 }, // Bm
        { freq: p('G3'), beats: 4, gain: 0.8 }, // G
        { freq: p('A3'), beats: 4, gain: 0.85 }, // A
        { freq: p('F#3'), beats: 4, gain: 0.85 }, // D
        { freq: p('B3'), beats: 2, gain: 0.95 }, // G
        { freq: p('G3'), beats: 2, gain: 0.95 },
        { freq: p('A3'), beats: 2 }, // D
        { freq: p('F#3'), beats: 2 },
        { freq: p('G3'), beats: 2 }, // A7, the seventh again
        { freq: p('E3'), beats: 2, gain: 0.95 },
        { freq: p('F#3'), beats: 2, gain: 0.85 }, // D
        { freq: p('D3'), beats: 2, gain: 0.75 }
      ]
    }
  ]
};
