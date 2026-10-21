/**
 * STREET CHAMPION's announcer: the round calls, spoken.
 *
 * Street Fighter II's announcer is one deep, booming English voice in every
 * region, so there is one set of files, English, played in all three locales;
 * the on-screen banners stay localized through `useTranslations` as usual.
 * Capcom's recordings are not used and no real voice is cloned: the lines are
 * rendered by `scripts/fighter-announcer-voice.mts` from an open
 * text-to-speech voice, given an "arcade announcer" treatment (pitched down,
 * band-limited like a 1991 ADPCM sample, compressed, a short hall), and
 * written to one MP3 per line under `public/fun/fighter/announcer/`, credited
 * in the CREDITS.txt beside them.
 *
 * Playback follows PRIME TIME's `sampleSpeaker` (src/games/primetime/host.ts)
 * and plays through the engine's effects bus for the same reasons: the bus
 * follows the 🔊 toggle live and lives in the AudioContext the Start tap
 * unlocked, so the voice sounds on a phone. It is simpler than the host in one
 * respect. Announcer lines are short and strictly sequential ("Round one",
 * then "Fight!"), so there is no priority table: the newest line always cuts
 * whatever is sounding or still loading, and a token keeps a cut line's late
 * load or late end from touching the one that replaced it.
 *
 * Nothing touches the DOM or the audio graph at import, and every failure (no
 * `fetch`, a missing file, a decode error, no audio context) leaves the
 * announcer silent rather than throwing, so the banners carry the fight.
 */
import type { GameAudio } from '../engine';

export type AnnouncerLine =
  | 'round1'
  | 'round2'
  | 'round3'
  | 'round4'
  | 'finalRound'
  | 'fight'
  | 'ko'
  | 'youWin'
  | 'youLose'
  | 'perfect'
  | 'doubleKo'
  | 'timeOver'
  | 'drawGame'
  | 'challenger'
  | 'gameOver'
  | 'congratulations';

/** Every line the announcer has, in one place for the renderer, the preload and the tests. */
export const ANNOUNCER_LINES: readonly AnnouncerLine[] = [
  'round1',
  'round2',
  'round3',
  'round4',
  'finalRound',
  'fight',
  'ko',
  'youWin',
  'youLose',
  'perfect',
  'doubleKo',
  'timeOver',
  'drawGame',
  'challenger',
  'gameOver',
  'congratulations'
];

/** Where the rendered lines live, under `public/` (and so under the site root); `<line>.mp3` follows. */
export const ANNOUNCER_AUDIO_BASE = 'fun/fighter/announcer';

/** The URL a line is fetched from; `root` is the site's base path, `/` as the site is served today. */
export function announcerAudioUrl(line: AnnouncerLine, root = '/'): string {
  const r = root.endsWith('/') ? root : `${root}/`;
  return `${r}${ANNOUNCER_AUDIO_BASE}/${line}.mp3`;
}

export interface Announcer {
  /** Say a line, cutting whatever is sounding. Silent while effects are muted, paused or disposed. */
  say(line: AnnouncerLine): void;
  /** Fetch every line's file now (the first `say` does this too). */
  preload(): void;
  /** A pause cuts the line (a buffer source cannot be held) and holds back new ones until it lifts. */
  setPaused(on: boolean): void;
  /** Re-read the effects mute: cuts what is sounding when the toggle has just muted. */
  refresh(): void;
  /** Cut whatever is sounding and say nothing more; the page is going away. */
  dispose(): void;
}

type Fetch = (url: string) => Promise<{ ok: boolean; arrayBuffer(): Promise<ArrayBuffer> }>;

/** The announcer over the stock effects: he is the loudest thing in the cabinet, as in the arcade. */
const VOICE_GAIN = 1.4;

export function createAnnouncer(
  audio: Pick<GameAudio, 'isSfxMuted' | 'effectsBus'>,
  fetchImpl: Fetch | undefined = typeof fetch === 'function' ? url => fetch(url) : undefined,
  root = '/'
): Announcer {
  const bytes = new Map<AnnouncerLine, Promise<ArrayBuffer | null>>();
  const decoded = new Map<AnnouncerLine, AudioBuffer>();
  let playing: AudioBufferSourceNode | null = null;
  let token = 0;
  let paused = false;
  let disposed = false;

  const load = (line: AnnouncerLine): Promise<ArrayBuffer | null> => {
    let p = bytes.get(line);
    if (!p) {
      p = (async () => {
        try {
          if (!fetchImpl) return null;
          const res = await fetchImpl(announcerAudioUrl(line, root));
          return res.ok ? await res.arrayBuffer() : null;
        } catch {
          return null;
        }
      })();
      bytes.set(line, p);
    }
    return p;
  };

  function preload(): void {
    for (const line of ANNOUNCER_LINES) void load(line);
  }

  /** Cut the line in hand, sounding or still loading. */
  function cut(): void {
    token++;
    if (playing) {
      const src = playing;
      playing = null;
      src.onended = null;
      try {
        src.stop();
      } catch {
        // Already ended.
      }
    }
  }

  return {
    say(line) {
      if (disposed || paused || audio.isSfxMuted()) return;
      preload();
      cut();
      const mine = token;
      const bus = audio.effectsBus();
      if (!bus) return;
      void (async () => {
        let buffer = decoded.get(line) ?? null;
        if (!buffer) {
          const data = await load(line);
          if (!data) return;
          try {
            // decodeAudioData detaches the buffer it is given; decode a copy so a failed or raced decode can be retried.
            buffer = await bus.ctx.decodeAudioData(data.slice(0));
            decoded.set(line, buffer);
          } catch {
            return;
          }
        }
        if (mine !== token) return; // Cut or replaced while loading.
        try {
          const src = bus.ctx.createBufferSource();
          src.buffer = buffer;
          const gain = bus.ctx.createGain();
          gain.gain.value = Math.min(1, bus.level * VOICE_GAIN);
          src.connect(gain);
          gain.connect(bus.out);
          src.onended = () => {
            if (playing === src) playing = null;
          };
          playing = src;
          src.start();
        } catch {
          playing = null;
        }
      })();
    },
    preload,
    setPaused(on) {
      if (on) cut();
      paused = on;
    },
    refresh() {
      if (audio.isSfxMuted()) cut();
    },
    dispose() {
      cut();
      disposed = true;
    }
  };
}
