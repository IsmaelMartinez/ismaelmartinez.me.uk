/**
 * Renders PRIME TIME's host lines to audio: one MP3 per host line per locale
 * under public/fun/primetime/host/<lang>/<line>.mp3, which `host.ts`'s
 * `sampleSpeaker` plays through the effects bus.
 *
 * Why files and not the browser's speech synthesis: the Web Speech API was the
 * cabinet's first voice (PR #464) and is silent on most phones, where an
 * utterance started outside a tap is dropped, and it sounds different on
 * every device. A file decoded into the arcade's own AudioContext, which the
 * Start tap already unlocked, plays everywhere the effects do.
 *
 * Why these voices: the arcade's own announcer recordings are Williams/Midway
 * property and are not used, and no real announcer's voice is cloned. The
 * lines are spoken by open voices picked for licence and for sounding like
 * one man across the three languages:
 *   en  Piper en_US-joe-medium      CC0            fine-tuned from the lessac base
 *   es  Piper es_ES-davefx-medium   CC0            fine-tuned from the same base
 *   ca  Matxa-TTS v2 "pau"          Apache-2.0     BSC's central Catalan model (#466)
 * Catalan first shipped on Piper's ca_ES-upc_pau-x_low, the project's one
 * male Catalan voice, which only exists at its lowest quality tier and was
 * heard as robotic; it is now rendered by the Barcelona Supercomputing
 * Center's Matxa-TTS v2 (BSC-LT/matxa-tts-v2-ca-central-graphemes, the
 * end-to-end ONNX export with its alVoCat vocoder, tagged Apache-2.0 on the
 * Hub) through scripts/primetime-host-matxa.py, speaking as "pau", the same
 * FestCat studio speaker the Piper voice was trained on, so the announcer
 * keeps his identity and gains the quality. Every line is then run through
 * one "arcade DAC" treatment (a slight pitch drop, scaled per voice since
 * "pau" already sits low, a 120 Hz to 5.5 kHz band, compression, a short
 * slap echo and loudness normalisation), which makes the three read as one
 * announcer and gives them the sampled-speech grain of a 1990 cabinet.
 * Per-line rate and pitch come from `DELIVERY` in host.ts, so the delivery
 * written there is what the files carry. The credits are written beside the
 * files as CREDITS.txt.
 *
 * Not in CI (needs Python's piper-tts, which brings onnxruntime and numpy,
 * ffmpeg, and a network for the first run, which downloads the voices into
 * scripts/.voices/, gitignored; the Matxa model is 270 MB):
 *
 *   pip install piper-tts
 *   node --experimental-strip-types scripts/primetime-host-voice.mts [en|es|cat ...]
 *
 * Re-run after changing a host string in translations.ts or a line's
 * delivery, naming the locales that changed (the neural voices sample, so a
 * re-render is never byte-identical and an untouched locale is best left
 * alone), and commit the files it rewrites.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { translations, localeMeta, type Locale } from '../src/i18n/translations.ts';
import { DELIVERY, HOST_AUDIO_BASE, HOST_LINES } from '../src/games/primetime/host.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VOICE_DIR = join(ROOT, 'scripts', '.voices');
const OUT_DIR = join(ROOT, 'public', HOST_AUDIO_BASE);
const HF = 'https://huggingface.co';
const RATE = 22050;

interface PiperVoice {
  engine: 'piper';
  name: string;
  path: string;
  licence: string;
  credit: string;
  /** How much of the standard pitch drop this voice takes (1 is all of it). */
  drop: number;
}

interface MatxaVoice {
  engine: 'matxa';
  repo: string;
  file: string;
  speaker: number;
  licence: string;
  credit: string;
  drop: number;
}

type Voice = PiperVoice | MatxaVoice;

const VOICES: Record<Locale, Voice> = {
  en: {
    engine: 'piper',
    name: 'en_US-joe-medium',
    path: 'rhasspy/piper-voices/resolve/main/en/en_US/joe/medium',
    licence: 'CC0',
    credit: 'Piper voice "joe" (US English)',
    drop: 1
  },
  es: {
    engine: 'piper',
    name: 'es_ES-davefx-medium',
    path: 'rhasspy/piper-voices/resolve/main/es/es_ES/davefx/medium',
    licence: 'CC0',
    credit: 'Piper voice "davefx" (Spanish)',
    drop: 1
  },
  cat: {
    engine: 'matxa',
    repo: 'BSC-LT/matxa-tts-v2-ca-central-graphemes',
    file: 'matxa_v2_graphemes_10_steps_wavenext.onnx',
    // "pau" in the model's speaker table: a FestCat studio speaker.
    speaker: 39,
    licence: 'Apache-2.0 (model, as tagged on the Hugging Face Hub)',
    credit:
      'Matxa-TTS v2 by the Barcelona Supercomputing Center (Projecte AINA), central Catalan, speaker "pau" from the UPC FestCat corpus (https://huggingface.co/BSC-LT/matxa-tts-v2-ca-central-graphemes), with its alVoCat vocoder',
    drop: 0.4
  }
};

function download(url: string, file: string): void {
  if (existsSync(file)) return;
  mkdirSync(dirname(file), { recursive: true });
  console.log(`downloading ${url}`);
  execFileSync('curl', ['-sSL', '--fail', '-o', file, url], { stdio: 'inherit' });
}

/** Fetches a voice's files if missing and returns the model path. */
function fetchVoice(voice: Voice): string {
  if (voice.engine === 'piper') {
    for (const ext of ['onnx', 'onnx.json']) download(`${HF}/${voice.path}/${voice.name}.${ext}`, join(VOICE_DIR, `${voice.name}.${ext}`));
    return join(VOICE_DIR, `${voice.name}.onnx`);
  }
  const model = join(VOICE_DIR, 'matxa', voice.file);
  download(`${HF}/${voice.repo}/resolve/main/${voice.file}`, model);
  return model;
}

/** The banners shout in capitals; the voice reads sentence case, with the show's name kept as a name. */
function spoken(text: string): string {
  const lower = text.toLowerCase();
  const cased = lower.replace(/(^|[.!?]\s+)([¡¿]?)(\p{L})/gu, (_m, lead: string, mark: string, letter: string) => lead + mark + letter.toUpperCase());
  return cased.replace(/prime time/gi, 'Prime Time');
}

function synthesize(voice: Voice, model: string, text: string, rate: number, wav: string): void {
  if (voice.engine === 'piper') {
    execFileSync('python3', ['-m', 'piper', '-m', model, '-f', wav, '--length-scale', String(1 / rate)], { input: text, stdio: ['pipe', 'ignore', 'inherit'] });
    return;
  }
  execFileSync(
    'python3',
    ['-I', join(ROOT, 'scripts', 'primetime-host-matxa.py'), '--model', model, '--speaker', String(voice.speaker), '--text', text, '--length-scale', String(1 / rate), '--out', wav],
    { stdio: 'inherit' }
  );
}

function render(voice: Voice, model: string, text: string, rate: number, pitch: number, out: string, tmp: string): void {
  const wav = join(tmp, 'line.wav');
  synthesize(voice, model, text, rate, wav);
  // The pitch drop: DELIVERY's 0.7 to 0.95 maps to a 7% to 4.5% lower voice
  // for a voice taking the whole drop, then the tempo is restored so the
  // drop costs no time.
  const factor = 1 - (1 - (0.86 + 0.1 * pitch)) * voice.drop;
  const filters = [
    // The voices do not share a sample rate, and `asetrate` relabels samples
    // rather than converting them, so everything is brought to RATE first or
    // a 16 kHz voice plays a quarter fast and sharp.
    `aresample=${RATE}`,
    `asetrate=${RATE}*${factor.toFixed(4)}`,
    `aresample=${RATE}`,
    `atempo=${(1 / factor).toFixed(4)}`,
    'highpass=f=120',
    'lowpass=f=5500',
    'compand=attacks=0.01:decays=0.15:points=-60/-60|-30/-18|-12/-6|0/-3',
    'aecho=0.8:0.5:55:0.22',
    'loudnorm=I=-16:TP=-1.5:LRA=7'
  ].join(',');
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', wav, '-af', filters, '-ac', '1', '-ar', String(RATE), '-c:a', 'libmp3lame', '-b:a', '48k', out], {
    stdio: 'inherit'
  });
}

const wanted = process.argv.slice(2) as Locale[];
const locales = (Object.keys(VOICES) as Locale[]).filter(l => wanted.length === 0 || wanted.includes(l));
if (locales.length === 0) throw new Error(`no such locale: ${wanted.join(', ')}`);

const tmp = mkdtempSync(join(tmpdir(), 'primetime-host-'));
try {
  for (const locale of locales) {
    const voice = VOICES[locale];
    const model = fetchVoice(voice);
    const dir = join(OUT_DIR, localeMeta[locale].tag);
    mkdirSync(dir, { recursive: true });
    for (const line of HOST_LINES) {
      const text = translations[locale][`fun.primetime.host.${line}` as keyof (typeof translations)[typeof locale]] as string;
      const { rate, pitch } = DELIVERY[line];
      const out = join(dir, `${line}.mp3`);
      render(voice, model, spoken(text), rate, pitch, out, tmp);
      console.log(`${localeMeta[locale].tag}/${line}.mp3  "${spoken(text)}"`);
    }
  }
  const credits = [
    "PRIME TIME's host lines, rendered by scripts/primetime-host-voice.mts.",
    '',
    'The voices are open text-to-speech voices:',
    ...(Object.keys(VOICES) as Locale[]).map(l => `  ${localeMeta[l].tag}: ${VOICES[l].credit}. Licence: ${VOICES[l].licence}.`),
    '',
    'Piper voices: https://github.com/rhasspy/piper, https://huggingface.co/rhasspy/piper-voices.',
    'The Catalan model was trained on the OpenSLR 69 (CC BY-SA 4.0) and FestCat (CC BY-SA 3.0, UPC / Col·lectivaT) corpora.',
    'No recording from the arcade game this cabinet homages is used.',
    ''
  ].join('\n');
  writeFileSync(join(OUT_DIR, 'CREDITS.txt'), credits);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
