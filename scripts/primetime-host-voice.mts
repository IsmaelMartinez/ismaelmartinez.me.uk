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
 * lines are spoken by open voices from the Piper project (rhasspy/piper-voices
 * on Hugging Face), picked for licence and for sounding like one man across
 * the three languages:
 *   en  en_US-joe-medium        CC0            fine-tuned from the lessac base
 *   es  es_ES-davefx-medium     CC0            fine-tuned from the same base
 *   ca  ca_ES-upc_pau-x_low     CC BY-SA 3.0   FestCat corpus, UPC / Col·lectivaT
 * The Catalan voice is the one male Catalan voice Piper has and is lower
 * quality, so every line is then run through one "arcade DAC" treatment
 * (a slight pitch drop, a 120 Hz to 5.5 kHz band, compression, a short slap
 * echo and loudness normalisation), which makes the three read as one
 * announcer and gives them the sampled-speech grain of a 1990 cabinet.
 * Per-line rate and pitch come from `DELIVERY` in host.ts, so the delivery
 * written there is what the files carry. The credits are written beside the
 * files as CREDITS.txt, which is what CC BY-SA asks for.
 *
 * Not in CI (needs Python's piper-tts, ffmpeg and a network for the first
 * run, which downloads the voices into scripts/.piper-voices/, gitignored):
 *
 *   pip install piper-tts
 *   node --experimental-strip-types scripts/primetime-host-voice.mts
 *
 * Re-run after changing a host string in translations.ts or a line's
 * delivery, and commit the files it rewrites.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { translations, localeMeta, type Locale } from '../src/i18n/translations.ts';
import { DELIVERY, HOST_AUDIO_BASE, HOST_LINES } from '../src/games/primetime/host.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VOICE_DIR = join(ROOT, 'scripts', '.piper-voices');
const OUT_DIR = join(ROOT, 'public', HOST_AUDIO_BASE);
const HF = 'https://huggingface.co/rhasspy/piper-voices/resolve/main';
const RATE = 22050;

interface Voice {
  name: string;
  path: string;
  licence: string;
  credit: string;
}

const VOICES: Record<Locale, Voice> = {
  en: { name: 'en_US-joe-medium', path: 'en/en_US/joe/medium', licence: 'CC0', credit: 'Piper voice "joe" (US English)' },
  es: { name: 'es_ES-davefx-medium', path: 'es/es_ES/davefx/medium', licence: 'CC0', credit: 'Piper voice "davefx" (Spanish)' },
  cat: {
    name: 'ca_ES-upc_pau-x_low',
    path: 'ca/ca_ES/upc_pau/x_low',
    licence: 'CC BY-SA 3.0 ES',
    credit: 'Piper voice "upc_pau" (Catalan), trained on the UPC FestCat corpus published by Col·lectivaT (https://collectivat.cat/asr#upc-festcat-tts-corpora)'
  }
};

function fetchVoice(voice: Voice): string {
  mkdirSync(VOICE_DIR, { recursive: true });
  const model = join(VOICE_DIR, `${voice.name}.onnx`);
  for (const ext of ['onnx', 'onnx.json']) {
    const file = join(VOICE_DIR, `${voice.name}.${ext}`);
    if (existsSync(file)) continue;
    console.log(`downloading ${voice.name}.${ext}`);
    execFileSync('curl', ['-sSL', '--fail', '-o', file, `${HF}/${voice.path}/${voice.name}.${ext}`], { stdio: 'inherit' });
  }
  return model;
}

/** The banners shout in capitals; the voice reads sentence case, with the show's name kept as a name. */
function spoken(text: string): string {
  const lower = text.toLowerCase();
  const cased = lower.replace(/(^|[.!?]\s+)([¡¿]?)(\p{L})/gu, (_m, lead: string, mark: string, letter: string) => lead + mark + letter.toUpperCase());
  return cased.replace(/prime time/gi, 'Prime Time');
}

function render(model: string, text: string, rate: number, pitch: number, out: string, tmp: string): void {
  const wav = join(tmp, 'line.wav');
  execFileSync('python3', ['-m', 'piper', '-m', model, '-f', wav, '--length-scale', String(1 / rate)], { input: text, stdio: ['pipe', 'ignore', 'inherit'] });
  // The pitch drop: DELIVERY's 0.7 to 0.95 maps to a 7% to 4.5% lower voice,
  // then the tempo is restored so the drop costs no time.
  const factor = 0.86 + 0.1 * pitch;
  const filters = [
    // The voices do not share a sample rate (the Catalan one is 16 kHz), and
    // `asetrate` relabels samples rather than converting them, so everything
    // is brought to RATE first or a 16 kHz voice plays a quarter fast and sharp.
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

const tmp = mkdtempSync(join(tmpdir(), 'primetime-host-'));
try {
  for (const locale of Object.keys(VOICES) as Locale[]) {
    const voice = VOICES[locale];
    const model = fetchVoice(voice);
    const dir = join(OUT_DIR, localeMeta[locale].tag);
    mkdirSync(dir, { recursive: true });
    for (const line of HOST_LINES) {
      const text = translations[locale][`fun.primetime.host.${line}` as keyof (typeof translations)[typeof locale]] as string;
      const { rate, pitch } = DELIVERY[line];
      const out = join(dir, `${line}.mp3`);
      render(model, spoken(text), rate, pitch, out, tmp);
      console.log(`${localeMeta[locale].tag}/${line}.mp3  "${spoken(text)}"`);
    }
  }
  const credits = [
    "PRIME TIME's host lines, rendered by scripts/primetime-host-voice.mts.",
    '',
    'The voices are open text-to-speech voices from the Piper project',
    '(https://github.com/rhasspy/piper, voices at https://huggingface.co/rhasspy/piper-voices):',
    ...(Object.keys(VOICES) as Locale[]).map(l => `  ${localeMeta[l].tag}: ${VOICES[l].credit}. Licence: ${VOICES[l].licence}.`),
    '',
    'The Catalan files are derived from a CC BY-SA 3.0 ES voice and are shared under the same licence.',
    'No recording from the arcade game this cabinet homages is used.',
    ''
  ].join('\n');
  writeFileSync(join(OUT_DIR, 'CREDITS.txt'), credits);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
