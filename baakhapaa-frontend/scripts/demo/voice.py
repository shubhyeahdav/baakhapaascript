"""Speak the demo's narration with Kokoro, locally, from phonemes.

Kokoro-82M, Apache 2.0, through ONNX Runtime — nothing is uploaded and no
service is signed into. The model and its venv already live at
C:\\addeity-video; this borrows them rather than installing a second copy of a
300 MB model.

    C:/addeity-video/.venv-tts/Scripts/python.exe scripts/demo/voice.py

Writes one wav per beat to docs/demo-video/voice/ and a lines.json of
durations. THE PICTURE FOLLOWS THE VOICE: the assembler reads that json and
gives each beat the length its narration actually needs.

WHY PHONEMES RATHER THAN RESPELLINGS
------------------------------------
The first version fed Kokoro respelled words — "Kal-tee" for Khalti,
"Bah-kha-pah" for Baakhapaa — chosen because an automatic transcription came
back wrong. That was the wrong diagnosis, and two of the four "fixes" made
things worse.

Phonemising the words shows what the model is actually told to say:

    Baakhapaa   ->  bˈɑːkhɐpˌɑː      already right
    Devanagari  ->  dˌeɪvənˈɑːɡɚɹi   already right
    Khalti      ->  kˈɑːlti          KAAL-tee; should be KHUL-tee
    eSewa       ->  ˈiː sˈuːə        "ee SOO-uh"; should be eh-SAY-wah

Two were right all along — Whisper simply cannot transcribe an unfamiliar
proper noun — and the respelling "Bah-kha-pah" phonemises to bˈɑːkˈɑːpˈɑː,
dropping the aspirated kh that is in the name.

So: correct the two that are wrong, in IPA, leave the two that are right. The
phoneme string is printed on every run, which makes what the model is told
inspectable rather than inferred from a transcription of its output.
"""
import json
import os
import re
import sys

import numpy as np
import soundfile as sf
from scipy import signal

TOOLS = r"C:\addeity-video\tools"
MODELS = r"C:\addeity-video\models\kokoro"
sys.path.insert(0, TOOLS)
from kokoro_voice import master, SR  # noqa: E402  (loudness helpers only)

from kokoro_onnx import Kokoro  # noqa: E402
from kokoro_onnx.tokenizer import Tokenizer  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "..", "..", "docs", "demo-video", "voice")

VOICE = "af_heart"
SPEED = 1.0
LANG = "en-us"

# Only the two espeak gets wrong. Keyed by the phoneme string it produces
# rather than by the English spelling, so a word that already phonemises
# correctly is never touched.
#
#   Khalti  खल्ती   KHUL-tee — short vowel, as in "hull", not "hall"
#   eSewa   इसेवा   eh-SAY-wah
PHONEME_FIXES = {
    "kˈɑːlti": "kˈʌlti",
    "ˈiː sˈuːə": "ɛsˈeɪwɑː",
}

# The release note's narration. Separate from the pitch's because the two
# videos want opposite things: a pitch states the claim and then shows it, a
# release note states the change and assumes the viewer knows the product.
UPDATE_LINES = [
    ("u01-intro",
     "Three things changed, and one thing has not."),

    ("u02-devanagari",
     "A screenplay written in Devanagari now lints. "
     "The craft rules always read Nepali. "
     "The parser feeding them did not, "
     "so a script with Nepali character names produced no dialogue at all, "
     "and three of the checks could never fire. "
     "On this scene it finds six problems now, where it found three."),

    ("u03-longform",
     "Long-form video is a format of its own. "
     "Sections live in the document, so they survive export and reorder. "
     "Runtime comes from words and a speaking rate, not from page count."),

    ("u04-keys",
     "And the keys follow the format. "
     "In a video script, tab opens a b-roll cue "
     "instead of a screenplay indent."),

    ("u05-caveat",
     "None of this is deployed. "
     "It is on a branch with the tests green. "
     "The live build still has the Devanagari bug."),
]

LINES = [
    ("01-gap",
     "Nepal writes. Its writing tools do not read Nepali."),

    ("02-linter",
     "Baakhapaa does. The craft linter reads Devanagari. "
     "It finds the line that states a feeling instead of playing it, "
     "and it does that without a single AI call."),

    ("03-craft",
     "Craft comes from a library of forty five techniques, "
     "matched to the page by meaning. "
     "The embeddings run on this machine. No API key, nothing per query."),

    ("04-moat-test",
     "The obvious fix was to add a Nepali field to that library. "
     "We tested the model first. "
     "On two sentences in Devanagari it scores zero point eight nine eight "
     "for the same meaning, and zero point eight seven seven for different ones. "
     "A gap of zero point zero two. It cannot read the script at all."),

    ("04-moat-fix",
     "Translating out of Nepali before embedding "
     "lifted retrieval accuracy from sixteen percent to ninety percent."),

    ("05-economics",
     "So the free tier costs nothing to serve. "
     "And it takes Khalti and eSewa, "
     "because Stripe cannot collect from most Nepali cards."),

    ("06-standing",
     "It is deployed, with two and a half thousand tests behind it. "
     "No completed payment yet, and no writer trial. "
     "That is what we are raising for."),
]

_tok = Tokenizer()
_kokoro = Kokoro(os.path.join(MODELS, "kokoro-v1.0.onnx"),
                 os.path.join(MODELS, "voices-v1.0.bin"))


def phonemes_for(sentence):
    """IPA for one sentence, with the two known-wrong words corrected."""
    ipa = _tok.phonemize(sentence, lang=LANG)
    for wrong, right in PHONEME_FIXES.items():
        ipa = ipa.replace(wrong, right)
    return ipa


def say(text):
    """One line, synthesised sentence by sentence from phonemes.

    Per sentence rather than all at once: `is_phonemes=True` skips the
    sentence splitting that would otherwise put a breath between them, and a
    paragraph read as one unbroken clause is what makes synthetic speech
    sound synthetic.
    """
    chunks, ipas = [], []
    for sentence in re.split(r"(?<=[.!?])\s+", text.strip()):
        if not sentence:
            continue
        ipa = phonemes_for(sentence)
        ipas.append(ipa)
        audio, sr = _kokoro.create(ipa, voice=VOICE, speed=SPEED,
                                   lang=LANG, is_phonemes=True)
        chunks.append(signal.resample_poly(audio, SR, sr))
        chunks.append(np.zeros(int(0.26 * SR)))      # the breath between sentences
    x = np.concatenate(chunks[:-1]) if chunks else np.zeros(1)

    db = 20 * np.log10(np.abs(x) + 1e-9)
    on = np.where(db > -42)[0]
    if len(on):
        x = x[max(0, on[0] - int(0.025 * SR)):min(len(x), on[-1] + int(0.025 * SR))]
    return x, " ".join(ipas)


def normalise(s):
    s = s.lower().replace("%", " percent ")
    s = re.sub(r"(\d)\.(\d)", r"\1 point \2", s)
    s = re.sub(r"[^a-z0-9 ]+", " ", s)
    num = {"zero": "0", "one": "1", "two": "2", "three": "3", "four": "4",
           "five": "5", "six": "6", "seven": "7", "eight": "8", "nine": "9",
           "ten": "10", "sixteen": "16", "ninety": "90", "thousand": "1000"}
    return " ".join(num.get(w, w) for w in s.split())


def main():
    """`--comp=update` speaks the release note; the default is the pitch.

    Both write into the same lines.json, keyed by beat id, because the two
    compositions never share a beat id and the assembler only ever looks up
    the ids its own beats name.
    """
    os.makedirs(OUT, exist_ok=True)
    lines = UPDATE_LINES if "--comp=update" in sys.argv else LINES
    existing = {}
    path = os.path.join(OUT, "lines.json")
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            existing = json.load(f)
    meta = dict(existing)

    print("what the model is told to say:")
    for word in ("Baakhapaa", "Devanagari", "Khalti", "eSewa", "Nepali"):
        raw, fixed = _tok.phonemize(word, lang=LANG), phonemes_for(word)
        note = "" if raw == fixed else f"   <- corrected from  {raw}"
        print(f"  {word:<12} {fixed}{note}")

    print("\nlines:")
    for name, text in lines:
        x, ipa = say(text)
        sf.write(os.path.join(OUT, f"{name}.wav"),
                 master(np.vstack([x, x]), target=-16.0).T, SR)
        meta[name] = {"seconds": round(len(x) / SR, 3), "text": text, "ipa": ipa}
        print(f"  {name:<14} {meta[name]['seconds']:>6.2f}s")

    with open(os.path.join(OUT, "lines.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=1, ensure_ascii=False)
    print(f"\n  narration total {sum(meta[n]['seconds'] for n, _ in lines):.1f}s")

    # Secondary only. It cannot judge a proper noun — Whisper does not know
    # these words — but it still catches a line that came out mangled.
    try:
        import onnx_asr
    except ImportError:
        print("\n  onnx-asr not installed; skipping the read-back")
        return
    print("\nread-back (ordinary words only; the proper nouns are judged by the IPA above):")
    asr = onnx_asr.load_model("whisper-base")
    skip = {"baakhapaa", "devanagari", "khalti", "esewa", "nepali", "nepal"}
    for name, text in lines:
        heard = asr.recognize(os.path.join(OUT, f"{name}.wav"), channel="mean")
        want = [w for w in normalise(text).split() if w not in skip]
        got = set(normalise(heard).split())
        missing = [w for w in want if w not in got]
        print(f"  {name:<14} {'OK' if not missing else 'missing: ' + ' '.join(missing)}")


if __name__ == "__main__":
    main()
