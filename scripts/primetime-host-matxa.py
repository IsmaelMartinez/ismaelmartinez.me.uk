#!/usr/bin/env python3
"""
Renders one Catalan line with Matxa-TTS v2 (Barcelona Supercomputing Center,
BSC-LT/matxa-tts-v2-ca-central-graphemes on Hugging Face), the end-to-end
ONNX export that carries its alVoCat vocoder, so the only runtime is
onnxruntime (which piper-tts already brings in). Called per line by
scripts/primetime-host-voice.mts; not a general tool.

    python3 -I scripts/primetime-host-matxa.py --model <onnx> --speaker 39 \
        --text "Molts diners" --length-scale 0.87 --out line.wav

The model reads graphemes against the symbol table below, copied verbatim
from the text front end in the BSC-LT/matxa-tts-v2 Space (Keith Ito's
Tacotron table under MIT plus the Catalan accented letters), with a blank
(id 0) interspersed between symbols as Matcha-TTS expects. Its `catalan_text`
cleaner lowercases, expands digits, abbreviations and all-caps initials, and
strips punctuation; the renderer hands over sentence-cased text with none of
the first three to expand, so what is vendored here is the part that applies,
lowercase and the same accepted-character filter, rather than importing
downloaded code at run time. Feed it a digit and it raises instead of
guessing.
"""
import argparse
import re
import wave

import numpy as np
import onnxruntime as ort

_PAD = "_"
_PUNCTUATION = ';:,.!?¡¿—…"«»“”()- '
_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
_LETTERS_IPA = (
    "ɑɐɒæɓʙβɔɕçɗɖðʤəɘɚɛɜɝɞɟʄɡɠɢʛɦɧħɥʜɨɪʝɭɬɫɮʟɱɯɰŋɳɲɴøɵɸθœɶʘɹɺɾɻʀʁɽʂʃʈʧʉʊʋⱱʌɣɤʍχʎʏʑʐʒʔʡʕʢǀǁǂǃˈˌːˑʼʴʰʱʲʷˠˤ˞↓↑→↗↘'̩'ᵻ"
)
_LETTERS_ACCENTED = "àáèéìíòóùú·üïöñ’#´"
SYMBOLS = [_PAD] + list(_PUNCTUATION) + list(_LETTERS) + list(_LETTERS_IPA) + list(_LETTERS_ACCENTED)
SYMBOL_TO_ID = {s: i for i, s in enumerate(SYMBOLS)}

ACCEPTED = set("abcdefghijklmnopqrstuvwxyz" + "àèìòùáéíóúäëïöüñçâêîôûæãẽĩõũ'· -")
SAMPLE_RATE = 22050


def clean(text: str) -> str:
    """BSC's `catalan_text` for text with nothing to expand: lowercase, drop punctuation, collapse spaces."""
    if any(ch.isdigit() for ch in text):
        raise SystemExit(f"digits must be written out before rendering: {text!r}")
    # The cleaner keeps an apostrophe between letters (m'encanta) and turns the others into quotes it then drops.
    text = re.sub(r"(?<=\w)’(?=\w)", "'", text)
    lowered = "".join(ch.lower() if ch.lower() in ACCEPTED else " " for ch in text)
    return re.sub(r"\s+", " ", lowered).strip()


def to_ids(cleaned: str) -> list[int]:
    ids = [SYMBOL_TO_ID[ch] for ch in cleaned if ch in SYMBOL_TO_ID]
    out = [0] * (len(ids) * 2 + 1)
    out[1::2] = ids
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True)
    ap.add_argument("--speaker", type=int, required=True)
    ap.add_argument("--text", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--length-scale", type=float, default=1.0)
    ap.add_argument("--temperature", type=float, default=0.667)
    args = ap.parse_args()

    seq = to_ids(clean(args.text))
    x = np.array(seq, dtype=np.int64)[None]
    sess = ort.InferenceSession(args.model, providers=["CPUExecutionProvider"])
    _, wav = sess.run(
        None,
        {
            "x": x,
            "x_lengths": np.array([x.shape[1]], dtype=np.int64),
            "scales": np.array([args.temperature, args.length_scale], dtype=np.float32),
            "spks": np.array([args.speaker], dtype=np.int64),
        },
    )
    wav = wav.squeeze(0).astype(np.float32)
    peak = float(np.abs(wav).max()) or 1.0
    pcm = (np.clip(wav / peak * 0.9, -1.0, 1.0) * 32767).astype(np.int16)
    with wave.open(args.out, "wb") as f:
        f.setnchannels(1)
        f.setsampwidth(2)
        f.setframerate(SAMPLE_RATE)
        f.writeframes(pcm.tobytes())


if __name__ == "__main__":
    main()
