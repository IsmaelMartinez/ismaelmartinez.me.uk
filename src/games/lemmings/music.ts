/**
 * Critter Rescue's scores: a tune per act, rotated as the player progresses.
 *
 * Lemmings rotated short arrangements of public-domain tunes as levels were
 * beaten, so getting further was rewarded with something new to hear, and
 * this cabinet does the same with its four acts (`ACT_STARTS` in levels.ts).
 * Each act is its own `GameAudioOptions`, played by its own audio instance:
 * the engine takes one score per `createGameAudio`, and a form's order always
 * runs on into its next section, so four acts sharing one form would play into
 * each other. `game.ts` swaps the instance when play crosses into a new act and
 * otherwise leaves it running, so a retry or the next level of the same act
 * carries on where the music is, after Celeste, instead of starting bar 1 again.
 *
 * - Act I, teaching (levels 1-6): "Oh! Susanna" (Stephen Foster, 1848), C major, 120 bpm.
 * - Act II, skill chains (7-13): "Camptown Races" (Foster, 1850), G major, 124 bpm.
 * - Act III, rule twists (14-19): "In the Hall of the Mountain King" (Grieg,
 *   Peer Gynt, 1875), A minor, 112 bpm.
 * - Act IV, endgame (20-25): "When the Saints Go Marching In" (traditional), F major, 126 bpm.
 *
 * All four are in the public domain; each is arranged rather than transcribed,
 * the break sections after each tune's own material are original, and every
 * score shares one shape. Six four-bar sections make a 24-bar pass: the tune
 * (in two sections), an eight-bar break that borrows from the parallel minor
 * (bVI, bVII and iv, or the Neapolitan in the Grieg), and the tune's return,
 * whose last bar sits on V or bVII so the pass hands back to the top on a half
 * cadence rather than a V to I. One pass is 96 beats: 48.0 s in Act I, 46.5 s
 * in Act II, 51.4 s in Act III and 45.7 s in Act IV, none of which ramps.
 * After every second pass there are eight beats of rest.
 *
 * Three voices each: the lead, a pulse wave with a singer's vibrato on its
 * held notes; a triangle counter-line in the tenor, an octave or more under
 * the lead so it no longer masks it; and a plucked triangle bass that plays
 * root and fifth and walks into the cadences.
 *
 * Session and load (ADR 003): a level runs 40 to 90 seconds and a whole run
 * of twenty-five levels can pass thirty minutes, so this is a long-session
 * cabinet (a 45 s floor), and the cognitive load is moderate: a puzzle
 * played against a slow crowd, where the music should be company rather than
 * a clock.
 *
 * Adaptive hooks, all driven from `game.ts`:
 * - Act rotation: a new score, from its top, when play crosses into a new act.
 * - `setDanger`: Acts III and IV hold the only timed levels, and their scores
 *   carry a `danger` variant, the busiest material at a faster tempo, which a
 *   timed level switches to for its last ten seconds (while its clock flashes
 *   red) and releases when the level ends.
 * - Stingers: `cleared` on a level cleared, `perfect` on one cleared with the
 *   perfect bonus, each in the act's key.
 * - `setPaused`: a failed level's result screen muffles the music rather than
 *   stopping it, and a retry lifts it with the score still in its place.
 */
import { p, REST, type GameAudioOptions, type MusicProfile, type Note, type Track } from '../engine';

/** A run is up to twenty-five levels, over thirty minutes, under these scores. */
export const MUSIC_PROFILE: MusicProfile = {
  session: 'long'
};

/**
 * A line from a compact string: space-separated `name:beats` tokens, with
 * `r` for a rest and an optional `@gain`, and `|` between bars for the reader.
 * A bad name throws through `p()`, and so does a length that is not positive,
 * so `music.test.ts` catches either at import.
 */
function line(src: string): Note[] {
  return src
    .trim()
    .split(/\s+/)
    .filter(token => token !== '|')
    .map(token => {
      const [body, gain] = token.split('@');
      const [name, length] = body.split(':');
      const beats = Number(length);
      if (!(beats > 0)) throw new Error(`score: bad length in "${token}"`);
      const note: Note = { freq: name === 'r' ? REST : p(name), beats };
      if (gain !== undefined) note.gain = Number(gain);
      return note;
    });
}

/** A section: the lead, the counter-line and the bass, in track order. */
function section(lead: string, counter: string, bass: string): Note[][] {
  return [line(lead), line(counter), line(bass)];
}

/** Moves every note of a stinger by `semitones`, so one pair of stingers serves every key. */
function transpose(lines: Note[][], semitones: number): Note[][] {
  const ratio = Math.pow(2, semitones / 12);
  return lines.map(l => l.map(n => ({ ...n, freq: n.freq > 0 ? n.freq * ratio : n.freq })));
}

/**
 * The two stingers, written in C major and moved into each act's key. Both
 * rise to the tonic, which a stinger may do: it lands over the loop rather
 * than closing it.
 */
const STINGERS_IN_C: Record<string, Note[][]> = {
  cleared: [
    line('G4:.25 C5:.25 E5:.25 G5:1'),
    line('E4:1.75'),
    line('C3:.5 G2:.25 C3:1')
  ],
  perfect: [
    line('G4:.25 C5:.25 E5:.25 G5:.25 E5:.25 G5:.25 C6:1.5'),
    line('C4:.75 E4:.75 G4:1.5'),
    line('C3:.75 G2:.75 C3:1.5')
  ]
};

function stingersIn(semitones: number): Record<string, Note[][]> {
  return Object.fromEntries(
    Object.entries(STINGERS_IN_C).map(([name, lines]) => [name, transpose(lines, semitones)])
  );
}

/** The three instruments, shared by every act so a stinger sounds like the act it lands in. */
function tracks(leadWave: Track['wave']): Track[] {
  return [
    // LEAD: vibrato only reaches notes held past 0.4 s, so it colours the
    // long notes and leaves the quick ones straight.
    { name: 'lead', wave: leadWave, volume: 0.9, envelope: 'pluck', detune: 5, vibrato: 8 },
    // COUNTER: sustained, soft, in the tenor, felt between the tune and the bass.
    { name: 'counter', wave: 'triangle', volume: 0.36, envelope: 'pad', detune: 7 },
    // BASS: root and fifth, the passing beats ducked so the line walks.
    { name: 'bass', wave: 'triangle', volume: 0.7, envelope: 'pluck' }
  ];
}

/** Every act: sits politely under play, with the echo the cabinet has always had. */
const MIX = { volume: 0.09, echo: { time: 0.24, feedback: 0.18, mix: 0.15 } };

/** Eight beats of quiet after every second pass: a run is long, and the gap helps. */
const REST_PASSES = { after: 2, beats: 8 };

/**
 * Act I, "Oh! Susanna", C major. The verse and chorus as Foster wrote them,
 * with the chorus's "Su-san-na" pushed across the beat; the break sequences
 * that motif through Ab, Bb and F minor before a half cadence on G, and the
 * pass ends on the chorus with its last bar turned onto G.
 */
export const ACT_I_MUSIC: GameAudioOptions = {
  tempo: 120,
  tonic: p('C4'),
  ...MIX,
  tracks: tracks('pulse25'),
  form: {
    order: ['verse', 'chorus', 'break', 'break-answer', 'verse', 'chorus-open'],
    rest: REST_PASSES,
    sections: {
      verse: section(
        `E5:.5 G5:.5 G5:.75 A5:.25 G5:.5 E5:.5 C5:.75 D5:.25 |
         E5:.5 E5:.5 D5:.5 C5:.5 D5:1 C5:.5 D5:.5 |
         E5:.5 G5:.5 G5:.75 A5:.25 G5:.5 E5:.5 C5:.75 D5:.25 |
         E5:.5 E5:.5 D5:.5 D5:.5 C5:2`,
        `E4:1.5 D4:.5 C4:2 | E4:2 D4:1 B3:1 | C4:1.5 D4:.5 E4:2 | F4:2 E4:2`,
        `C2:1 G2:1@.7 E2:1@.85 G2:1@.7 | C2:1 G2:1@.7 G2:1 D2:1@.7 |
         C2:1 G2:1@.7 E2:1@.85 G2:1@.7 | G2:1 D2:1@.7 C2:1 G2:1@.7`
      ),
      chorus: section(
        `F5:1 F5:.5 A5:1 A5:1.5 |
         G5:.5 G5:.5 E5:.5 C5:.5 D5:1 C5:.5 D5:.5 |
         E5:.5 G5:.5 G5:.75 A5:.25 G5:.5 E5:.5 C5:.75 D5:.25 |
         E5:.5 E5:.5 D5:.5 D5:.5 C5:1 r:1`,
        `A3:2 C4:1 A3:1 | G3:2 B3:2 | C4:2 E4:2 | D4:1 F4:1 E4:2`,
        `F2:1 C3:1@.7 A2:1@.85 C3:1@.7 | C2:1 G2:1@.7 G2:1 D2:1@.7 |
         C2:1 G2:1@.7 E2:1@.85 G2:1@.7 | G2:1 D2:1@.7 C2:1 G2:1@.7`
      ),
      break: section(
        `Eb5:1 Eb5:.5 Ab5:1 Ab5:1.5 |
         F5:.5 F5:.5 D5:.5 Bb4:.5 C5:1 D5:.5 Eb5:.5 |
         F5:.5 Ab5:.5 Ab5:.75 Bb5:.25 Ab5:.5 F5:.5 C5:.75 D5:.25 |
         G5:.5 F5:.5 D5:.5 B4:.5 D5:2`,
        `C4:2 Eb4:2 | D4:2 F4:1 D4:1 | C4:2 Ab3:2 | B3:2 D4:2`,
        `Ab2:1 Eb2:1@.7 C3:1@.85 Eb2:1@.7 | Bb2:1 F2:1@.7 D3:1@.85 F2:1@.7 |
         F2:1 C3:1@.7 Ab2:1@.85 C3:1@.7 | G2:1 D2:1@.7 B2:1@.85 D3:1@.7`
      ),
      'break-answer': section(
        `C6:1 Ab5:.5 Eb5:1 F5:1.5 |
         E5:.5 G5:.5 C6:1 B5:.5 A5:.5 E5:1 |
         F5:.5 A5:.5 C6:.75 A5:.25 Ab5:1 F5:1 |
         E5:.5 D5:.5 B4:.5 G4:.5 D5:1 C5:.5 D5:.5`,
        `C4:2 D4:2 | E4:2 C4:2 | A3:2 Ab3:2 | G3:2 B3:1 D4:1`,
        `Ab2:1 Eb2:1@.7 Bb2:1 F2:1@.7 | C2:1 G2:1@.7 A2:1 E2:1@.7 |
         F2:1 C3:1@.7 F2:1 Ab2:1@.7 | G2:1 D2:1@.7 B2:1@.85 D3:1@.7`
      ),
      'chorus-open': section(
        `F5:1 F5:.5 A5:1 A5:1.5 |
         G5:.5 G5:.5 E5:.5 C5:.5 D5:1 C5:.5 D5:.5 |
         E5:.5 G5:.5 G5:.75 A5:.25 G5:.5 E5:.5 C5:.75 D5:.25 |
         F5:.5 E5:.5 D5:.5 B4:.5 G4:1 C5:.5 D5:.5`,
        `A3:2 C4:1 A3:1 | G3:2 B3:2 | C4:2 E4:2 | F4:2 D4:2`,
        `F2:1 C3:1@.7 A2:1@.85 C3:1@.7 | C2:1 G2:1@.7 G2:1 D2:1@.7 |
         C2:1 G2:1@.7 E2:1@.85 G2:1@.7 | G2:1 D2:1@.7 G2:1 B2:1@.8`
      )
    }
  },
  stingers: stingersIn(0)
};

/**
 * Act II, "Camptown Races", G major. The verse with its "doo-dah" pushed off
 * the beat, the chorus's run up the G arpeggio, and a break that sequences
 * that run onto Eb and through C minor to a half cadence on D; the pass ends
 * on the chorus turned onto D.
 */
export const ACT_II_MUSIC: GameAudioOptions = {
  tempo: 124,
  tonic: p('G3'),
  ...MIX,
  tracks: tracks('pulse12'),
  form: {
    order: ['verse', 'chorus', 'break', 'break-answer', 'verse', 'chorus-open'],
    rest: REST_PASSES,
    sections: {
      verse: section(
        `D5:.5 D5:.5 B4:.5 D5:.5 E5:.5 D5:.5 B4:1 |
         B4:.5 A4:1.5 B4:.5 A4:1.5 |
         D5:.5 D5:.5 B4:.5 D5:.5 E5:.5 D5:.5 B4:1 |
         A4:1 B4:.5 A4:.5 G4:2`,
        `B3:2 D4:2 | A3:2 F#3:2 | G3:2 B3:2 | C4:1 A3:1 B3:2`,
        `G2:1 D2:1@.7 B2:1@.85 D2:1@.7 | D2:1 A2:1@.7 F#2:1@.85 A2:1@.7 |
         G2:1 D2:1@.7 B2:1@.85 D2:1@.7 | D2:1 A2:1@.7 G2:1 D2:1@.7`
      ),
      chorus: section(
        `G4:.5 G4:.5 B4:.5 D5:.5 G5:2 |
         E5:.5 E5:.5 G5:.5 E5:.5 D5:2 |
         D5:.5 D5:.5 B4:.5 B4:.5 D5:.5 D5:.5 B4:1 |
         A4:.5 A4:.5 B4:.5 A4:1 G4:1.5`,
        `D4:2 B3:2 | C4:2 B3:2 | B3:2 D4:2 | C4:2 B3:2`,
        `G2:1 D2:1@.7 B2:1@.85 D2:1@.7 | C2:1 G2:1@.7 G2:1 D2:1@.7 |
         G2:1 D2:1@.7 B2:1@.85 D2:1@.7 | D2:1 A2:1@.7 G2:1 D2:1@.7`
      ),
      break: section(
        `G4:.5 G4:.5 Bb4:.5 Eb5:.5 G5:2 |
         A4:.5 C5:.5 F5:1 E5:.5 D5:.5 C5:1 |
         Eb5:.5 Eb5:.5 C5:.5 C5:.5 Eb5:.5 G5:1 Eb5:.5 |
         D5:.5 C5:.5 A4:.5 F#4:.5 A4:2`,
        `Bb3:2 G3:2 | A3:2 C4:2 | Eb4:2 C4:2 | C4:2 F#3:2`,
        `Eb2:1 Bb2:1@.7 G2:1@.85 Bb2:1@.7 | F2:1 C3:1@.7 A2:1@.85 C3:1@.7 |
         C2:1 G2:1@.7 Eb2:1@.85 G2:1@.7 | D2:1 A2:1@.7 F#2:1@.85 A2:1@.7`
      ),
      'break-answer': section(
        `G5:1 Eb5:.5 Bb4:1 C5:1.5 |
         B4:.5 D5:.5 G5:1 F#5:.5 E5:.5 B4:1 |
         C5:.5 E5:.5 G5:.75 E5:.25 Eb5:1 C5:1 |
         D5:.5 C5:.5 A4:.5 F#4:.5 A4:1 r:1`,
        `G3:2 A3:2 | B3:2 G3:2 | E4:2 Eb4:2 | D4:2 C4:2`,
        `Eb2:1 Bb2:1@.7 F2:1 C3:1@.7 | G2:1 D2:1@.7 E2:1 B2:1@.7 |
         C2:1 G2:1@.7 C2:1 Eb2:1@.7 | D2:1 A2:1@.7 F#2:1@.85 A2:1@.7`
      ),
      'chorus-open': section(
        `G4:.5 G4:.5 B4:.5 D5:.5 G5:2 |
         E5:.5 E5:.5 G5:.5 E5:.5 D5:2 |
         D5:.5 D5:.5 B4:.5 B4:.5 D5:.5 D5:.5 B4:1 |
         A4:.5 A4:.5 B4:.5 A4:1 F#4:1.5`,
        `D4:2 B3:2 | C4:2 B3:2 | B3:2 D4:2 | C4:2 A3:2`,
        `G2:1 D2:1@.7 B2:1@.85 D2:1@.7 | C2:1 G2:1@.7 G2:1 D2:1@.7 |
         G2:1 D2:1@.7 B2:1@.85 D2:1@.7 | D2:1 A2:1@.7 D2:1 F#2:1@.8`
      )
    }
  },
  stingers: stingersIn(-5)
};

/**
 * Act III, "In the Hall of the Mountain King", A minor. Grieg's theme, with
 * its bar-4 answer limping across the beat, answered a fifth up in E minor
 * and closing on D (bVII of E); the middle is an original troll march on F,
 * G and E. The danger variant is the Grieg's own idea: the theme again, faster,
 * over a bass pumping in eighths.
 */
const MOUNTAIN_THEME = `
  A4:.5 B4:.5 C5:.5 D5:.5 E5:.5 C5:.5 E5:1 |
  D#5:.5 B4:.5 D#5:1 D5:.5 Bb4:.5 D5:1 |
  A4:.5 B4:.5 C5:.5 D5:.5 E5:.5 C5:.5 E5:.5 A5:.5 |
  G5:.5 E5:.5 C5:.5 E5:1 G5:1.5`;
const MOUNTAIN_THEME_UP = `
  E5:.5 F#5:.5 G5:.5 A5:.5 B5:.5 G5:.5 B5:1 |
  A#5:.5 F#5:.5 A#5:1 A5:.5 F5:.5 A5:1 |
  E5:.5 F#5:.5 G5:.5 A5:.5 B5:.5 G5:.5 B5:.5 E6:.5 |
  D6:.5 B5:.5 G5:.5 B5:1 D6:1.5`;
const MOUNTAIN_COUNTER = 'E4:2 C4:2 | D#4:2 D4:2 | C4:2 E4:2 | D4:2 B3:2';
const MOUNTAIN_COUNTER_UP = 'B3:2 G3:2 | A#3:2 A3:2 | G3:2 B3:2 | A3:2 F#3:2';

export const ACT_III_MUSIC: GameAudioOptions = {
  tempo: 112,
  tonic: p('A3'),
  ...MIX,
  tracks: tracks('pulse50'),
  form: {
    order: ['theme', 'theme-up', 'march', 'march-answer', 'theme', 'theme-up'],
    rest: REST_PASSES,
    danger: { order: ['frenzy', 'frenzy-up'], tempo: 156 },
    sections: {
      theme: section(
        MOUNTAIN_THEME,
        MOUNTAIN_COUNTER,
        `A2:1 E2:1@.7 A2:1@.85 E2:1@.7 | B2:1 F#2:1@.7 Bb2:1 F2:1@.7 |
         A2:1 E2:1@.7 A2:1@.85 E2:1@.7 | G2:1 D2:1@.7 G2:1@.85 D2:1@.7`
      ),
      'theme-up': section(
        MOUNTAIN_THEME_UP,
        MOUNTAIN_COUNTER_UP,
        `E2:1 B2:1@.7 E2:1@.85 B2:1@.7 | F#2:1 C#3:1@.7 F2:1 C3:1@.7 |
         E2:1 B2:1@.7 E2:1@.85 B2:1@.7 | D2:1 A2:1@.7 D2:1@.85 A2:1@.7`
      ),
      march: section(
        `A5:1 F5:.5 C5:1 A4:1.5 |
         B4:.5 D5:.5 G5:1 F5:.5 D5:.5 B4:1 |
         A4:.5 C5:.5 F5:1 E5:.5 D5:.5 G#4:1 |
         A4:1 C5:.5 E5:1 B4:1.5`,
        `A3:2 C4:2 | B3:2 D4:2 | C4:2 B3:2 | C4:2 G#3:2`,
        `F2:1 C3:1@.7 F2:1@.85 C3:1@.7 | G2:1 D2:1@.7 G2:1@.85 D2:1@.7 |
         F2:1 C3:1@.7 E2:1 B2:1@.7 | A2:1 E2:1@.7 E2:1 B2:1@.7`
      ),
      'march-answer': section(
        `C6:1 A5:.5 F5:1 C5:1.5 |
         D5:.5 G5:.5 B5:1 A5:.5 G5:.5 D5:1 |
         C5:.5 F5:.5 A5:1 G#5:.5 E5:.5 B4:1 |
         F5:.5 E5:.5 D5:.5 A4:.5 G#4:1 B4:1`,
        `A3:2 C4:2 | B3:2 D4:2 | C4:2 B3:2 | A3:2 G#3:2`,
        `F2:1 C3:1@.7 F2:1@.85 C3:1@.7 | G2:1 D2:1@.7 G2:1@.85 D2:1@.7 |
         F2:1 C3:1@.7 E2:1 B2:1@.7 | D2:1 A2:1@.7 E2:1 G#2:1@.7`
      ),
      frenzy: section(
        MOUNTAIN_THEME,
        MOUNTAIN_COUNTER,
        `A2:.5 A3:.5@.6 A2:.5 A3:.5@.6 E2:.5 E3:.5@.6 E2:.5 E3:.5@.6 |
         B2:.5 B3:.5@.6 B2:.5 B3:.5@.6 Bb2:.5 Bb3:.5@.6 Bb2:.5 Bb3:.5@.6 |
         A2:.5 A3:.5@.6 A2:.5 A3:.5@.6 E2:.5 E3:.5@.6 E2:.5 E3:.5@.6 |
         G2:.5 G3:.5@.6 G2:.5 G3:.5@.6 D2:.5 D3:.5@.6 D2:.5 D3:.5@.6`
      ),
      'frenzy-up': section(
        MOUNTAIN_THEME_UP,
        MOUNTAIN_COUNTER_UP,
        `E2:.5 E3:.5@.6 E2:.5 E3:.5@.6 B2:.5 B3:.5@.6 B2:.5 B3:.5@.6 |
         F#2:.5 F#3:.5@.6 F#2:.5 F#3:.5@.6 F2:.5 F3:.5@.6 F2:.5 F3:.5@.6 |
         E2:.5 E3:.5@.6 E2:.5 E3:.5@.6 B2:.5 B3:.5@.6 B2:.5 B3:.5@.6 |
         D2:.5 D3:.5@.6 D2:.5 D3:.5@.6 E2:.5 E3:.5@.6 E2:.5 E3:.5@.6`
      )
    }
  },
  // A major: the level is won, so the troll act's stingers take the Picardy third.
  stingers: stingersIn(-3)
};

/**
 * Act IV, "When the Saints Go Marching In", F major, the march home. The
 * tune's held notes are anticipated off the beat as a Dixieland band plays
 * them, the counter-line walks under them like a trombone, and the fourth line
 * takes the traditional iv (Bb minor) under "want to be in that number". The
 * stomp that follows is original, riffing through Db and Eb to a C7 half
 * cadence, and it is also the danger variant, played faster.
 */
const SAINTS_STOMP = section(
  `r:.5 Ab4:.5 Db5:.5 F5:1 Db5:.5 Ab4:1 |
   r:.5 Bb4:.5 Eb5:.5 G5:1 Eb5:.5 Bb4:1 |
   C5:.5 F5:.5 A5:.5 C6:1 A5:.5 F5:1 |
   Bb5:.5 G5:.5 E5:.5 C5:.5 E5:2`,
  'Ab3:2 F3:2 | Bb3:2 G3:2 | A3:2 C4:2 | Bb3:2 G3:2',
  `Db2:1 F2:1@.7 Ab2:1@.85 F2:1@.7 | Eb2:1 G2:1@.7 Bb2:1@.85 G2:1@.7 |
   F2:1 A2:1@.7 C3:1@.85 A2:1@.7 | C2:1 E2:1@.7 G2:1@.85 Bb2:1@.7`
);
const SAINTS_STOMP_ANSWER = section(
  `Ab5:1 F5:.5 Db5:1 Eb5:1.5 |
   C5:.5 F5:.5 A5:1 F5:.5 D5:.5 A4:1 |
   Bb4:.5 D5:.5 F5:1 Db5:1 Bb4:1 |
   E5:.5 C5:.5 Bb4:.5 G4:.5 C5:2`,
  'Ab3:2 G3:2 | A3:2 F3:2 | D4:2 Db4:2 | E3:2 Bb3:2',
  `Db2:1 Ab2:1@.7 Eb2:1 Bb2:1@.7 | F2:1 C3:1@.7 D2:1 A2:1@.7 |
   Bb2:1 F2:1@.7 Bb2:1 Db3:1@.7 | C2:1 G2:1@.7 C3:1@.85 E2:1@.7`
);

export const ACT_IV_MUSIC: GameAudioOptions = {
  tempo: 126,
  tonic: p('F3'),
  ...MIX,
  tracks: tracks('pulse25'),
  form: {
    order: ['saints-1', 'saints-2', 'saints-3', 'saints-4', 'stomp', 'stomp-answer'],
    rest: REST_PASSES,
    danger: { order: ['stomp', 'stomp-answer'], tempo: 152 },
    sections: {
      'saints-1': section(
        `r:1 F4:1 A4:1 Bb4:.5 C5:4.5 | r:1 F4:1 A4:1 Bb4:1 | C5:2 r:.5 A4:.5 Bb4:.5 C5:.5`,
        'F3:2 A3:2 | C4:1 A3:1 Bb3:1 B3:1 | C4:2 A3:2 | F3:1 G3:1 A3:1 C4:1',
        'F2:2 C2:2@.8 | F2:2 C2:2@.8 | F2:2 C2:2@.8 | F2:2 A2:2@.8'
      ),
      'saints-2': section(
        `r:1 F4:1 A4:1 Bb4:.5 C5:2.5 A4:2 | F4:1.5 A4:2.5 | G4:4`,
        'A3:2 C4:2 | F3:2 A3:2 | C4:2 A3:2 | Bb3:2 G3:2',
        'F2:2 C2:2@.8 | F2:2 C2:2@.8 | F2:2 C2:2@.8 | C2:2 G2:2@.8'
      ),
      'saints-3': section(
        `r:1 A4:1 A4:1 G4:1 | F4:3 F4:1 | Bb4:2 D5:2 | C5:1.5 Bb4:2.5`,
        'A3:2 C4:2 | A3:2 Eb4:2 | D4:2 Bb3:2 | D4:2 Db4:2',
        'F2:2 C2:2@.8 | F2:2 Eb2:2@.8 | Bb2:2 F2:2@.8 | Bb2:2 F2:2@.8'
      ),
      'saints-4': section(
        `r:2 A4:1 Bb4:1 | C5:2 A4:2 | F4:2 G4:2 | F4:4`,
        'C4:2 A3:2 | A3:2 C4:2 | A3:2 Bb3:2 | A3:4',
        'F2:2 C2:2@.8 | F2:2 C2:2@.8 | F2:2 C2:2@.8 | F2:2 C2:1@.8 E2:1@.8'
      ),
      stomp: SAINTS_STOMP,
      'stomp-answer': SAINTS_STOMP_ANSWER
    }
  },
  stingers: stingersIn(5)
};

/** The acts' scores, in act order; `game.ts` plays `ACT_MUSIC[actOf(level)]`. */
export const ACT_MUSIC: readonly GameAudioOptions[] = [ACT_I_MUSIC, ACT_II_MUSIC, ACT_III_MUSIC, ACT_IV_MUSIC];
