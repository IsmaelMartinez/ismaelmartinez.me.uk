/**
 * PRIME TIME's host: the presenter's calls, spoken.
 *
 * The run already announces the show in text (`host` events, drawn as the
 * banner), and this module gives those lines a voice. There is no legal
 * source for the arcade's samples and a WebAudio "voice" is not intelligible,
 * so the host speaks through the browser's own speech synthesis, the one
 * voice a cabinet can have without shipping audio files. It is not WebAudio,
 * so nothing here goes through `effectsBus()`: the module reads the effects
 * toggle itself (`isSfxMuted()`) before every line, pauses with the game, and
 * is cancelled on the page swap, so a line never outlives the cabinet.
 *
 * The lines come in from the page, already localized through `useTranslations`
 * like every other string, and are spoken in the page's language. What this
 * module decides on its own is delivery (`DELIVERY`): a game-show announcer
 * sits low and quick, a boss warning slows down, and every line carries a
 * priority so a room-clear catchphrase never cuts the boss warning or the car,
 * while anything at least as important as what is sounding cuts in. The
 * decision is the pure `hostDecision`, which the tests exercise with a fake
 * speaker; the real one is `browserSpeaker`, null wherever the API is missing
 * (jsdom included), and the host is then silent and never throws.
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

export interface VoiceSettings {
  lang: string;
  rate: number;
  pitch: number;
}

/** What the host speaks through: the browser's synthesis, or a test's fake. */
export interface Speaker {
  speak(text: string, voice: VoiceSettings): void;
  cancel(): void;
  pause(): void;
  resume(): void;
  speaking(): boolean;
}

export interface Host {
  /** Say a line, subject to the mute and to what is already being said. */
  call(line: HostLine): void;
  setPaused(on: boolean): void;
  /** Cut whatever is sounding; the page is going away. */
  dispose(): void;
}

/** Whether `incoming` is spoken over `current` (null when nothing is sounding) or dropped. */
export function hostDecision(current: HostLine | null, incoming: HostLine): 'speak' | 'drop' {
  if (current === null) return 'speak';
  return DELIVERY[incoming].priority >= DELIVERY[current].priority ? 'speak' : 'drop';
}

/** The Web Speech API, or null where there is none. */
export function browserSpeaker(): Speaker | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') return null;
  const synth = window.speechSynthesis;
  if (!synth) return null;
  return {
    speak(text, voice) {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = voice.lang;
      u.rate = voice.rate;
      u.pitch = voice.pitch;
      // The voice list fills asynchronously in some browsers; when it has a
      // voice in the page's language, use it, else the utterance's `lang`
      // lets the browser pick.
      const match = synth.getVoices().find(v => v.lang.toLowerCase().startsWith(voice.lang.toLowerCase()));
      if (match) u.voice = match;
      synth.speak(u);
    },
    cancel: () => synth.cancel(),
    pause: () => synth.pause(),
    resume: () => synth.resume(),
    speaking: () => synth.speaking
  };
}

export function createHost(
  audio: Pick<GameAudio, 'isSfxMuted'>,
  lines: Readonly<Record<HostLine, string>>,
  lang: string,
  speaker: Speaker | null = browserSpeaker()
): Host {
  let current: HostLine | null = null;
  const sounding = (): HostLine | null => (current !== null && speaker?.speaking() ? current : (current = null));

  return {
    call(line) {
      if (!speaker || audio.isSfxMuted()) return;
      const text = lines[line];
      if (!text) return;
      if (hostDecision(sounding(), line) === 'drop') return;
      speaker.cancel();
      const d = DELIVERY[line];
      speaker.speak(text, { lang, rate: d.rate, pitch: d.pitch });
      current = line;
    },
    setPaused(on) {
      if (!speaker) return;
      if (on) speaker.pause();
      else speaker.resume();
    },
    dispose() {
      speaker?.cancel();
      current = null;
    }
  };
}
