"""Speak the demo's narration with Kokoro, locally, from phonemes.

Kokoro-82M, Apache 2.0, through ONNX Runtime — nothing is uploaded and no
service is signed into. The model and its venv already live at
another project's folder; this borrows them rather than installing a second copy of a
300 MB model.

    <kokoro-env>/Scripts/python.exe scripts/demo/voice.py

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

from kokoro_onnx import Kokoro
from kokoro_onnx.tokenizer import Tokenizer

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))

# SELF-CONTAINED SINCE 2026-10-29. This borrowed its model and its loudness
# helpers from a different project's folder, and when that
# folder disappeared every narration in this repository stopped being
# rebuildable. The model now lives in this repository's own `.tts/` (gitignored
# -- it is 310 MB) and the two helpers below are copied in.
#
#   .tts/venv/                       python -m venv .tts/venv
#   .tts/models/kokoro/kokoro-v1.0.onnx
#   .tts/models/kokoro/voices-v1.0.bin
#
# Run with `.tts/venv/Scripts/python.exe scripts/demo/voice.py --comp=tutorial`.
MODELS = os.environ.get("KOKORO_MODELS", os.path.join(REPO, ".tts", "models", "kokoro"))

SR = 48000


def lufs(x):
    """Integrated loudness (ITU-R BS.1770: K-weighting, 400 ms blocks, gated)
    of a (2, n) signal at 48 kHz."""
    b1, a1 = [1.53512485958697, -2.69169618940638, 1.19839281085285], [1.0, -1.69065929318241, 0.73248077421585]
    b2, a2 = [1.0, -2.0, 1.0], [1.0, -1.99004745483398, 0.99007225036621]
    y = signal.lfilter(b2, a2, signal.lfilter(b1, a1, x, axis=1), axis=1)
    blk, hop = int(0.4 * SR), int(0.1 * SR)
    ms = np.array([np.mean(y[:, i:i + blk] ** 2, axis=1).sum() for i in range(0, y.shape[1] - blk, hop)])
    ms = ms[-0.691 + 10 * np.log10(ms + 1e-12) > -70]
    rel = -0.691 + 10 * np.log10(ms.mean()) - 10
    ms = ms[-0.691 + 10 * np.log10(ms) > rel]
    return -0.691 + 10 * np.log10(ms.mean())


def master(mix, target=-14.0, ceiling_db=-1.5):
    """Bring a (2, n) mix to the target loudness under a gentle look-ahead
    limiter, so no line is louder or quieter than its neighbour."""
    ceiling = 10 ** (ceiling_db / 20)
    for _ in range(3):
        mix = mix * 10 ** ((target - lufs(mix)) / 20)
        peak = np.max(np.abs(mix), axis=0)
        win = int(0.005 * SR)
        env = signal.convolve(np.pad(peak, (win, win), mode="edge"),
                              np.ones(2 * win + 1) / (2 * win + 1), mode="valid")
        env = np.maximum(env, peak)
        g = np.minimum(1.0, ceiling / np.maximum(env, 1e-9))
        g = signal.sosfiltfilt(signal.butter(2, 25, "lowpass", fs=SR, output="sos"), g)
        mix = mix * np.minimum(g, ceiling / np.maximum(peak, 1e-9))
    return mix
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

# The tutorial (TUTORIAL_VIDEO_PLAN.md). Second person, one physical action per
# chapter: "press Tab" is something a viewer can do from the video, "smart
# formatting" is a claim.
TUTORIAL_LINES = [
    ("t00-intro",
     "Baakhapaa in three minutes. From a blank account to a finished page."),

    ("t01-project",
     "Start with a new project. Give it a title, pick a format, a short film here, "
     "and create it."),

    ("t02-heading",
     "Every scene starts with where we are. Type the letter i, and Baakhapaa offers "
     "the heading for an interior scene. Press Tab to take it. "
     "Then the place, a dash, and the time of day."),

    ("t03-dialogue",
     "Press Enter for the action. Tab moves you to the character column. "
     "Type the name, press Enter, and you are writing their line. "
     "Enter again brings you back to the action."),

    ("t04-nepali",
     "To write in Nepali, switch the keyboard with the Nepali key beside the A. "
     "Type a word the way it sounds, namaste, and it becomes Devanagari."),

    ("t05-craft",
     "As you write, the craft check reads the page. A dot in the margin marks a line "
     "worth a second look, a feeling stated instead of played. It reads Nepali too."),

    ("t06-assist",
     "Stuck? Open Assist and press Read my page. It matches what you have written to "
     "a technique, and shows it on the page. To name the problem yourself, "
     "ask about something specific."),

    ("t07-views",
     "The Corkboard shows every scene as a card. Drag one, and the scene moves in the "
     "script itself. The Outline shows where the time went."),

    ("t08-export",
     "When it is ready to leave, open File. PDF for reading, Final Draft for "
     "production, Word for editing."),

    ("t09-learn",
     "And the course is free on every plan. Nineteen lessons, each graded by the same "
     "craft check, in English or Nepali."),

    ("t10-close",
     "That is everything you need to start. Your next script begins on a blank page."),
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
def _model_file():
    for name in ("kokoro-v1.0.onnx", "kokoro-v1.0.fp16.onnx", "kokoro-v1.0.int8.onnx"):
        if os.path.exists(os.path.join(MODELS, name)):
            return os.path.join(MODELS, name)
    raise SystemExit(f"No Kokoro model in {MODELS}. See the comment at the top of this file.")


_kokoro = Kokoro(_model_file(),
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
    comps = {"pitch": LINES, "update": UPDATE_LINES, "tutorial": TUTORIAL_LINES}
    comp = next((a.split("=", 1)[1] for a in sys.argv if a.startswith("--comp=")), "pitch")
    if comp not in comps:
        raise SystemExit(f"no composition {comp!r}; have {', '.join(comps)}")
    lines = comps[comp]
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
