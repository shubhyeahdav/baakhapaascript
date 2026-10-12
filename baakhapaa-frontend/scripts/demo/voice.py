"""Speak the demo's narration with Kokoro, locally.

Kokoro-82M, Apache 2.0, through ONNX Runtime — nothing is uploaded and no
service is signed into. The model and its venv already live at
C:\\addeity-video; this borrows the loader rather than installing a second
copy of a 300 MB model.

    C:/addeity-video/.venv-tts/Scripts/python.exe scripts/demo/voice.py

Writes one wav per beat to docs/demo-video/voice/ and a lines.json of
durations. THE PICTURE FOLLOWS THE VOICE: the assembler reads that json and
gives each beat the length its narration actually needs. A card timed by hand
is always either clipped or dead air at the end.

Then it transcribes every line back with onnx-asr and reports what moved.
Nobody here can listen to the output, so that check is the only thing between
a mispronounced figure and a pitch meeting. The first run of it earned its
keep: Kokoro said the product's own name as "baka padas", Devanagari as
"dave agri", Khalti as "quality" and eSewa as "esua" — four proper nouns, all
load-bearing, all wrong.
"""
import json
import os
import re
import sys

import numpy as np
import soundfile as sf

TOOLS = r"C:\addeity-video\tools"
sys.path.insert(0, TOOLS)
from kokoro_voice import voice_line, master, SR  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "..", "..", "docs", "demo-video", "voice")

VOICE = "af_heart"
SPEED = 1.0

# Proper nouns Kokoro cannot read, respelled for the mouth rather than the eye.
# `say` goes to the model; `shown` is what the cards print and what this file
# records as the truth. The ASR check knows the pair, so a respelling that
# stops working still reports rather than passing quietly.
SPOKEN = {
    "Baakhapaa":   "Bah-kha-pah",
    "Devanagari":  "Dayva-nahgaree",
    "Khalti":      "Kal-tee",
    "eSewa":       "ee-Sayva",
}

# One beat per entry, written to be SAID rather than read: short clauses, no
# brackets, no em dash doing a full stop's work.
#
# The moat argument is three numbers in a row and was one 23-second line. Split
# in two — the test, then the result — because that is two different claims and
# a listener needs the join.
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


def to_speak(text):
    for shown, say in SPOKEN.items():
        text = text.replace(shown, say)
    return text


# Whisper writes numbers as digits whatever Kokoro said, so comparing
# "forty five" against "45" reports a difference that is not one. These make
# both sides digits before comparing, which leaves the check reporting only
# words that actually moved.
_NUM = {
    "zero": "0", "one": "1", "two": "2", "three": "3", "four": "4",
    "five": "5", "six": "6", "seven": "7", "eight": "8", "nine": "9",
    "ten": "10", "sixteen": "16", "ninety": "90", "hundred": "100",
    "thousand": "1000",
}


def normalise(s):
    s = s.lower()
    # Whisper writes "16%" where Kokoro said "sixteen percent", so stripping
    # punctuation first deletes the word and the check reports a drop that
    # never happened. Same for the decimal point inside "0.898".
    s = s.replace("%", " percent ")
    s = re.sub(r"(\d)\.(\d)", r" point ", s)
    s = re.sub(r"[^a-z0-9 ]+", " ", s)
    words = [_NUM.get(w, w) for w in s.split()]
    return " ".join(words)


def main():
    os.makedirs(OUT, exist_ok=True)
    meta = {}

    for name, shown in LINES:
        said = to_speak(shown)
        x = voice_line(said, name=VOICE, speed=SPEED)
        # Mastered per line so no beat is quieter than its neighbour. -16 LUFS:
        # a voice-only track sits lower than a music mix and nothing is being
        # ducked under it.
        stereo = master(np.vstack([x, x]), target=-16.0)
        sf.write(os.path.join(OUT, f"{name}.wav"), stereo.T, SR)
        meta[name] = {"seconds": round(len(x) / SR, 3), "text": shown, "spoken": said}
        print(f"  {name:<14} {meta[name]['seconds']:>6.2f}s")

    with open(os.path.join(OUT, "lines.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=1, ensure_ascii=False)
    print(f"\n  narration total {sum(m['seconds'] for m in meta.values()):.1f}s")

    try:
        import onnx_asr
    except ImportError:
        print("\n  onnx-asr not installed; skipping the read-back check")
        return

    print("\nread-back (compared against what was SPOKEN, respellings and all):")
    asr = onnx_asr.load_model("whisper-base")
    for name, shown in LINES:
        heard = asr.recognize(os.path.join(OUT, f"{name}.wav"), channel="mean")
        want, got = normalise(to_speak(shown)), normalise(heard)
        if want == got:
            print(f"  {name:<14} OK")
            continue
        w, g = want.split(), got.split()
        missing = [x for x in w if x not in g]
        added = [x for x in g if x not in w]
        print(f"  {name:<14} DIFF")
        if missing:
            print(f"       not heard : {' '.join(missing)}")
        if added:
            print(f"       heard new : {' '.join(added)}")


if __name__ == "__main__":
    main()
