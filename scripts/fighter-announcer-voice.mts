/**
 * Renders STREET CHAMPION's announcer to audio: one MP3 per line under
 * public/fun/fighter/announcer/<line>.mp3, which `announcer.ts`'s
 * `createAnnouncer` plays through the effects bus.
 *
 * One language only, on purpose: Street Fighter II's announcer is the same
 * deep English voice in every region, so the English files are played in all
 * three locales and the banners carry the translation.
 *
 * Why this voice: Capcom's recordings are not used and no real announcer's
 * voice is cloned. The lines are spoken by Piper's en_US-joe-medium, a US
 * English male voice released CC0 (fine-tuned from the lessac base), the
 * same open voice PRIME TIME's English host starts from; this cabinet's much
 * deeper treatment below keeps the two announcers apart. Three other voices
 * were tried and rejected: en_US-ryan-high on licence (its dataset is
 * CC BY-NC-SA 4.0), and the public-domain LibriVox voices en_US-norman-medium
 * and en_US-john-medium on stability, since on one-word shouts ("Fight!",
 * "Perfect!") norman babbled a second, phantom word after a long gap and john
 * trailed off into noise, while joe says the word and stops.
 *
 * Every line then gets one "arcade announcer" treatment in ffmpeg:
 *   - pitched down by `DROP` semitones (resampled, then the tempo restored
 *     only part of the way, so the voice is deeper and a touch more
 *     deliberate),
 *   - band-limited like a 1991 ADPCM sample played by an OKI MSM6295 at
 *     about 7.8 kHz: a 3.8 kHz low-pass, a round trip through 8 kHz and a
 *     light bit-crush for the grain,
 *   - compressed hard so every word lands at the same weight,
 *   - a short hall (three echo taps, with a padded tail to ring into) so
 *     "Fight!" booms,
 *   - loudness-normalised, mono, 22.05 kHz, 48 kbps.
 * Per-line pace comes from `LINES` below: the shouts are drawn out slightly
 * for weight, and "K.O." is spelled the way it is said, "Kay oh!", which the phonemizer
 * reads as two stressed syllables (spelled "K.O." it de-stresses the K).
 *
 * Not in CI (needs Python's piper-tts, ffmpeg, and a network for the first
 * run, which downloads the voice into scripts/.voices/, gitignored):
 *
 *   pip install piper-tts
 *   node --experimental-strip-types scripts/fighter-announcer-voice.mts [line ...]
 *
 * With no arguments every line is rendered; name line ids to re-render only
 * those (the neural voice samples, so a re-render is never byte-identical and
 * an untouched line is best left alone). Commit the files it rewrites.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ANNOUNCER_AUDIO_BASE, ANNOUNCER_LINES, type AnnouncerLine } from '../src/games/fighter/announcer.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VOICE_DIR = join(ROOT, 'scripts', '.voices');
const OUT_DIR = join(ROOT, 'public', ANNOUNCER_AUDIO_BASE);
const HF = 'https://huggingface.co';
const RATE = 22050;

const VOICE = {
  name: 'en_US-joe-medium',
  path: 'rhasspy/piper-voices/resolve/main/en/en_US/joe/medium',
  credit: 'Piper voice "joe" (US English, medium quality, fine-tuned from the lessac voice)',
  licence: 'CC0'
};

/** How far the voice is pitched down, in semitones. */
const DROP = 3.5;

/** What each line says and how slowly (1 is the voice's own pace, above 1 slower). */
const LINES: Record<AnnouncerLine, { text: string; slow: number }> = {
  round1: { text: 'Round one.', slow: 1.1 },
  round2: { text: 'Round two.', slow: 1.1 },
  round3: { text: 'Round three.', slow: 1.1 },
  round4: { text: 'Round four.', slow: 1.1 },
  finalRound: { text: 'Final round.', slow: 1.15 },
  fight: { text: 'Fight!', slow: 1.2 },
  ko: { text: 'Kay oh!', slow: 1.25 },
  youWin: { text: 'You win.', slow: 1.1 },
  youLose: { text: 'You lose.', slow: 1.15 },
  perfect: { text: 'Perfect!', slow: 1.15 },
  doubleKo: { text: 'Double kay oh.', slow: 1.15 },
  timeOver: { text: 'Time over.', slow: 1.1 },
  drawGame: { text: 'Draw game.', slow: 1.1 },
  challenger: { text: 'Here comes a new challenger!', slow: 1.0 },
  gameOver: { text: 'Game over.', slow: 1.15 },
  congratulations: { text: 'Congratulations!', slow: 1.05 }
};

function download(url: string, file: string): void {
  if (existsSync(file)) return;
  mkdirSync(dirname(file), { recursive: true });
  console.log(`downloading ${url}`);
  execFileSync('curl', ['-sSL', '--fail', '-o', file, url], { stdio: 'inherit' });
}

function fetchVoice(): string {
  for (const ext of ['onnx', 'onnx.json']) download(`${HF}/${VOICE.path}/${VOICE.name}.${ext}`, join(VOICE_DIR, `${VOICE.name}.${ext}`));
  return join(VOICE_DIR, `${VOICE.name}.onnx`);
}

function render(model: string, text: string, slow: number, out: string, tmp: string): void {
  const wav = join(tmp, 'line.wav');
  execFileSync('python3', ['-m', 'piper', '-m', model, '-f', wav, '--length-scale', String(slow)], { input: text, stdio: ['pipe', 'ignore', 'inherit'] });
  const factor = Math.pow(2, -DROP / 12);
  // Restore only most of the tempo the drop costs: the last 30% is left in as weight.
  const tempo = 1 / factor / (1 + (1 / factor - 1) * 0.3);
  const filters = [
    `aresample=${RATE}`,
    `asetrate=${RATE}*${factor.toFixed(4)}`,
    `aresample=${RATE}`,
    `atempo=${tempo.toFixed(4)}`,
    'highpass=f=90',
    'lowpass=f=3800',
    // The ADPCM round trip: down to the sample chip's rate, a light crush, back up.
    'aresample=8000',
    'acrusher=bits=10:mix=0.35:mode=log',
    `aresample=${RATE}`,
    'lowpass=f=3900',
    'equalizer=f=160:t=q:w=1:g=4',
    'acompressor=threshold=-22dB:ratio=6:attack=4:release=120:makeup=6',
    'apad=pad_dur=0.45',
    'aecho=0.85:0.6:70|140|230:0.32|0.22|0.12',
    'loudnorm=I=-14:TP=-1.5:LRA=6',
    'silenceremove=stop_periods=-1:stop_duration=0.25:stop_threshold=-55dB'
  ].join(',');
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', wav, '-af', filters, '-ac', '1', '-ar', String(RATE), '-c:a', 'libmp3lame', '-b:a', '48k', out], {
    stdio: 'inherit'
  });
}

const wanted = process.argv.slice(2);
const unknown = wanted.filter(w => !ANNOUNCER_LINES.includes(w as AnnouncerLine));
if (unknown.length > 0) throw new Error(`no such line: ${unknown.join(', ')}`);
const lines = ANNOUNCER_LINES.filter(l => wanted.length === 0 || wanted.includes(l));

const tmp = mkdtempSync(join(tmpdir(), 'fighter-announcer-'));
try {
  const model = fetchVoice();
  mkdirSync(OUT_DIR, { recursive: true });
  for (const line of lines) {
    const { text, slow } = LINES[line];
    render(model, text, slow, join(OUT_DIR, `${line}.mp3`), tmp);
    console.log(`${line}.mp3  "${text}"`);
  }
  const credits = [
    "STREET CHAMPION's announcer lines, rendered by scripts/fighter-announcer-voice.mts.",
    '',
    'The voice is an open text-to-speech voice, played in every locale:',
    `  en: ${VOICE.credit}. Licence: ${VOICE.licence}.`,
    '',
    `Each line is pitched down ${DROP} semitones and band-limited, compressed and given a short hall in ffmpeg.`,
    'Piper voices: https://github.com/rhasspy/piper, https://huggingface.co/rhasspy/piper-voices.',
    'No recording from the arcade game this cabinet homages is used, and no real voice is cloned.',
    ''
  ].join('\n');
  writeFileSync(join(OUT_DIR, 'CREDITS.txt'), credits);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
