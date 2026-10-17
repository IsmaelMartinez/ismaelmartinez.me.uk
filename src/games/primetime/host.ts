/**
 * PRIME TIME's host: the presenter's calls, spoken.
 *
 * The run already announces the show in text (`host` events, drawn as the
 * banner), and this module gives those lines a voice. The arcade's own
 * announcer recordings are Williams/Midway property and are not used; the
 * lines are rendered by `scripts/primetime-host-voice.mts` from open
 * text-to-speech voices into one MP3 per line per language under
 * `public/fun/primetime/host/`, credited in the CREDITS.txt beside them, and
 * `sampleSpeaker` plays them through the engine's effects bus. That bus is the
 * reason they are files: it follows the 🔊 toggle live and sits in the
 * AudioContext the Start tap unlocked, so the host sounds on a phone, where
 * the browser speech synthesis this module first used (PR #464) was dropped
 * for starting outside a tap, and sounds the same on every device.
 *
 * The lines come in from the page, already localized through `useTranslations`
 * like every other string, and the file played is the page's language's. What
 * this module decides on its own is delivery (`DELIVERY`, baked into the
 * files by the renderer): a game-show announcer sits low and quick, a boss
 * warning slows down, and every line carries a priority so a room-clear
 * catchphrase never cuts the boss warning or the car, while anything at least
 * as important as what is sounding cuts in. The decision is the pure
 * `hostDecision`, which the tests exercise with a fake speaker.
 *
 * Three pieces of bookkeeping came out of PR #464's review and still hold
 * for samples. A line is "sounding" from the moment it is handed over until
 * its own end callback fires, which for a file includes the fetch and decode
 * in front of it: a catchphrase arriving in that gap must not cut the boss
 * warning before it has begun. Each line carries a token so the late end of
 * a line that was cut cannot clear the one that cut it, and a line whose end
 * never arrives is given up after `MAX_LINE_MS`, not counting time paused.
 * And the effects button is read through `refresh()` from its click, which
 * cuts what is sounding when the toggle has just muted (the bus already
 * silences it; the cut frees the floor for the next line).
 */
import type { GameAudio } from '../engine';
import type { HostLine } from './run';

export interface Delivery {
  /** Speech rate, 1 being the voice's own pace. */
  rate: number;
  /** Speech pitch, 1 being the voice's own; lower is the announcer's chest voice. */
  pitch: number;
  /** A line cuts in on anything of equal or lower priority and is dropped under anything higher. */
  priority: number;
}

export const DELIVERY: Record<HostLine, Delivery> = {
  welcome: { rate: 1.05, pitch: 0.8, priority: 1 },
  bigMoney: { rate: 1.15, pitch: 0.8, priority: 1 },
  bigPrizes: { rate: 1.15, pitch: 0.8, priority: 1 },
  loveIt: { rate: 1.1, pitch: 0.85, priority: 1 },
  carnage: { rate: 1.05, pitch: 0.7, priority: 2 },
  extraLife: { rate: 1.1, pitch: 0.9, priority: 2 },
  noKeys: { rate: 1.0, pitch: 0.8, priority: 2 },
  newCar: { rate: 1.0, pitch: 0.95, priority: 3 },
  goodLuck: { rate: 0.9, pitch: 0.7, priority: 3 }
};

/** Every line the host has, in one place for the renderer and the preload. */
export const HOST_LINES = Object.keys(DELIVERY) as readonly HostLine[];

/** Where the rendered lines live, under `public/`; the language tag and `<line>.mp3` follow. */
export const HOST_AUDIO_BASE = '/fun/primetime/host/';

export function hostAudioUrl(lang: string, line: HostLine, base = HOST_AUDIO_BASE): string {
  return `${base}${lang}/${line}.mp3`;
}

export interface Utterance {
  line: HostLine;
  text: string;
  lang: string;
  rate: number;
  pitch: number;
}

/** What the host speaks through: the sample player, or a test's fake. */
export interface Speaker {
  /** Say the line; call `onDone` once when it has ended, failed or been cancelled. */
  speak(u: Utterance, onDone: () => void): void;
  cancel(): void;
  pause(): void;
  resume(): void;
}

export interface Host {
  /** Say a line, subject to the mute and to what is already being said. */
  call(line: HostLine): void;
  setPaused(on: boolean): void;
  /** Re-read the effects mute: cuts what is sounding when it has just muted. */
  refresh(): void;
  /** Cut whatever is sounding; the page is going away. */
  dispose(): void;
}

/** A line whose end callback never arrives is given up after this long. */
export const MAX_LINE_MS = 6000;

/** The voice over the stock effects: a touch above the bus's reference peak. */
const VOICE_GAIN = 1.2;

/** Whether `incoming` is spoken over `current` (null when nothing is sounding) or dropped. */
export function hostDecision(current: HostLine | null, incoming: HostLine): 'speak' | 'drop' {
  if (current === null) return 'speak';
  return DELIVERY[incoming].priority >= DELIVERY[current].priority ? 'speak' : 'drop';
}

type Fetch = (url: string) => Promise<{ ok: boolean; arrayBuffer(): Promise<ArrayBuffer> }>;

/**
 * Plays the rendered lines through the effects bus. The files are fetched at
 * creation (a few kilobytes each) and decoded on first play, once the bus
 * exists, since decoding needs the context the Start tap creates. A pause
 * cuts the line rather than holding it: a line is a second or two long, and a
 * buffer source cannot be paused. Everything that can fail (no `fetch` on
 * this platform, a relative URL outside a browser, a missing file, a decode
 * error, no audio) ends the line at once instead of throwing, so the host is
 * then silent and the banner still shows.
 */
export function sampleSpeaker(
  audio: Pick<GameAudio, 'effectsBus'>,
  lang: string,
  fetchImpl: Fetch | undefined = typeof fetch === 'function' ? url => fetch(url) : undefined
): Speaker {
  const bytes = new Map<HostLine, Promise<ArrayBuffer | null>>();
  const decoded = new Map<HostLine, AudioBuffer>();
  let playing: AudioBufferSourceNode | null = null;
  /** The end callback of the line in hand, loading or sounding; a cut completes it. */
  let pending: (() => void) | null = null;
  let token = 0;

  const load = (line: HostLine): Promise<ArrayBuffer | null> => {
    let p = bytes.get(line);
    if (!p) {
      p = (async () => {
        try {
          if (!fetchImpl) return null;
          const res = await fetchImpl(hostAudioUrl(lang, line));
          return res.ok ? await res.arrayBuffer() : null;
        } catch {
          return null;
        }
      })();
      bytes.set(line, p);
    }
    return p;
  };
  for (const line of HOST_LINES) void load(line);

  /**
   * Cut the line in hand and complete it: a cut line, sounding or still
   * loading, releases its priority at once rather than holding the floor until
   * `MAX_LINE_MS` runs out on a line nothing is playing.
   */
  function cut(): void {
    token++;
    const done = pending;
    pending = null;
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
    done?.();
  }

  return {
    speak(u, onDone) {
      cut();
      const mine = token;
      const bus = audio.effectsBus();
      if (!bus) {
        onDone();
        return;
      }
      pending = onDone;
      void (async () => {
        let buffer = decoded.get(u.line) ?? null;
        if (!buffer) {
          const data = await load(u.line);
          if (data) {
            try {
              // decodeAudioData detaches the buffer it is given; decode a copy so a replay can decode again.
              buffer = await bus.ctx.decodeAudioData(data.slice(0));
              decoded.set(u.line, buffer);
            } catch {
              buffer = null;
            }
          }
        }
        if (mine !== token) return; // Cut or replaced while loading: the cut already completed this line.
        if (!buffer) {
          pending = null;
          onDone();
          return;
        }
        const src = bus.ctx.createBufferSource();
        src.buffer = buffer;
        const gain = bus.ctx.createGain();
        gain.gain.value = Math.min(1, bus.level * VOICE_GAIN);
        src.connect(gain);
        gain.connect(bus.out);
        src.onended = () => {
          if (playing === src) playing = null;
          if (pending === onDone) pending = null;
          onDone();
        };
        playing = src;
        src.start();
      })();
    },
    cancel: cut,
    pause: cut,
    resume() {
      // Nothing to resume: a pause cuts the line.
    }
  };
}

export function createHost(
  audio: Pick<GameAudio, 'isSfxMuted' | 'effectsBus'>,
  lines: Readonly<Record<HostLine, string>>,
  lang: string,
  speaker: Speaker = sampleSpeaker(audio, lang),
  now: () => number = () => Date.now()
): Host {
  let current: HostLine | null = null;
  let token = 0;
  let startedAt = 0;
  let paused = false;
  /** The clock when the pause began; the give-up timer does not run while paused. */
  let pausedAt = 0;

  const sounding = (): HostLine | null => {
    if (current !== null && now() - startedAt > MAX_LINE_MS) current = null;
    return current;
  };

  /** Cut the line; a paused speaker is resumed so the cut lands and the next page is not left mute. */
  function cut(): void {
    speaker.cancel();
    if (paused) {
      speaker.resume();
      paused = false;
    }
    current = null;
  }

  return {
    call(line) {
      if (audio.isSfxMuted()) return;
      const text = lines[line];
      if (!text) return;
      if (hostDecision(sounding(), line) === 'drop') return;
      speaker.cancel();
      const d = DELIVERY[line];
      const mine = ++token;
      current = line;
      startedAt = now();
      speaker.speak({ line, text, lang, rate: d.rate, pitch: d.pitch }, () => {
        if (token === mine) current = null;
      });
    },
    setPaused(on) {
      if (on) {
        if (!paused) {
          speaker.pause();
          pausedAt = now();
        }
        paused = true;
      } else if (audio.isSfxMuted()) {
        // Muted while paused: the line must not come back with the game.
        cut();
      } else {
        if (paused) {
          speaker.resume();
          // The line was not sounding while paused, so that span does not count against it.
          startedAt += now() - pausedAt;
        }
        paused = false;
      }
    },
    refresh() {
      if (audio.isSfxMuted()) cut();
    },
    dispose: cut
  };
}
