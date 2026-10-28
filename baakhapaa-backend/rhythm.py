"""Measure a draft a writer is still typing.

`measure.py` reads a FINISHED video: it has timestamps, because a vendor
transcribed real speech. A draft has no timestamps — nobody has said it out
loud yet — so the two cannot share a function, and pretending they could would
mean inventing timings and then reporting them as if they were observed.

What survives without timings is the thing the craft actually turns on:
rhythm. Varying sentence length is named as a retention device and monotony as
a killer, and both are countable from text alone. That makes this the one
measurement in the whole product that needs no data source, no vendor and no
API key — it works on the first sentence a writer types.

Everything here is a MEASUREMENT, never a verdict. No function returns "good"
or "bad". The product reports what is on the page and leaves the judgement with
the person who wrote it, which is the same rule the rest of the craft layer
follows.
"""
from __future__ import annotations

import math
import re
from typing import List, Optional, Tuple

from outlier import _REHOOK_MARKERS

# The danda (।) and double danda (॥) end a Devanagari sentence the way a full
# stop ends a Latin one. Without them a Nepali draft read as one sentence.
_SENTENCE_END = re.compile(r"[.!?।॥]+")
# A word is a whitespace-separated token holding at least one letter. Not
# `[^\W\d_]+`: Devanagari vowel signs are combining marks, which `\w` does
# not match, so that pattern cut "कहिल्यै" into pieces and counted a five-word
# Nepali sentence as twelve. Digit-only tokens still do not count.
_WORD = re.compile(r"\S*[^\W\d_]\S*", re.UNICODE)

# Conventional English narration rate. It is a CONVENTION, not a measurement,
# and `estimate_seconds` says so in its docstring rather than letting a precise
# looking number imply otherwise.
DEFAULT_WPM = 150.0

# Two sentences count as the same length within this many words. One word of
# slack, because "nine words then ten words" reads as identical rhythm to an
# ear and a stricter rule would report monotony that nobody can hear.
MONOTONE_TOLERANCE = 1


def sentences(text: str) -> List[str]:
    parts = [p.strip() for p in _SENTENCE_END.split(text or "")]
    return [p for p in parts if p]


def words(text: str) -> int:
    return len(_WORD.findall(text or ""))


def sentence_lengths(text: str) -> List[int]:
    return [n for n in (words(s) for s in sentences(text)) if n > 0]


def sigma(text: str) -> Optional[float]:
    """Standard deviation of sentence length, in words.

    None for a single sentence rather than 0.0: one sentence has no rhythm to
    vary, and a zero would read as perfect monotony and drag every average it
    entered.
    """
    lengths = sentence_lengths(text)
    if len(lengths) < 2:
        return None
    mean = sum(lengths) / len(lengths)
    var = sum((n - mean) ** 2 for n in lengths) / len(lengths)
    return round(math.sqrt(var), 2)


def longest_monotone_run(text: str) -> int:
    """The longest stretch of consecutive sentences of near-identical length.

    This is the actionable half of the rhythm measurement. A sigma tells a
    writer their rhythm is flat across the whole script, which is true and
    useless; a run tells them WHERE, and a run is what an ear actually
    notices. Returns a count of sentences, so 1 means no run at all.
    """
    lengths = sentence_lengths(text)
    if not lengths:
        return 0
    best = run = 1
    for prev, cur in zip(lengths, lengths[1:], strict=False):
        run = run + 1 if abs(cur - prev) <= MONOTONE_TOLERANCE else 1
        best = max(best, run)
    return best


def estimate_seconds(text: str, wpm: float = DEFAULT_WPM) -> Optional[float]:
    """Spoken length at a conventional narration rate.

    A CONVENTION, not a measurement. The rate is the usual English figure and
    nobody has checked it against the writer, the language or the delivery. It
    is useful for "this is nearer sixty seconds than thirty" and should never
    be presented to the nearest second as though it had been timed.
    """
    n = words(text)
    if not n or wpm <= 0:
        return None
    return round(n / wpm * 60, 1)


def opens_on_question(text: str) -> Optional[bool]:
    first = sentences(text)[:1]
    if not first:
        return None
    idx = (text or "").find(first[0])
    return (text or "")[idx + len(first[0]):idx + len(first[0]) + 1] == "?"


def measure_draft(text: str, wpm: float = DEFAULT_WPM) -> dict:
    """Everything measurable from an untimed draft.

    Numbers and booleans only, same rule as `measure.measure`: a draft belongs
    to the writer, and this module has no business keeping a copy of it.
    """
    return {
        "word_count": words(text),
        "sentence_count": len(sentences(text)),
        "sentence_length_sigma": sigma(text),
        "longest_monotone_run": longest_monotone_run(text),
        "estimated_seconds": estimate_seconds(text, wpm),
        "opens_on_question": opens_on_question(text),
    }


# --- the draft as the editor holds it ---------------------------------------
#
# Everything above takes clean prose. A draft in the editor is not that: it
# carries `## HOOK` headings, `[B-ROLL: ...]` cues, and on a short written in
# screenplay grammar, sluglines, character cues and parentheticals. None of
# those is spoken, and a slugline has no full stop, so left in it would fuse
# with the next sentence and invent a twenty-word line nobody says.

_STRUCTURAL = re.compile(
    r"^\s*(##\s|\[[A-Z][A-Z\s-]*:|(INT|EXT|INT\./EXT|I/E)[.\s]|\(.*\)\s*$)",
    re.IGNORECASE,
)


def _is_cue_name(line: str) -> bool:
    """An all-caps short line is a character cue on a screenplay-grammar short.
    Devanagari has no case, so a Nepali line is never mistaken for one."""
    t = line.strip()
    return bool(t) and len(t) <= 30 and t.upper() == t and any(c.isalpha() for c in t) \
        and t.upper() != t.lower()


def spoken_lines(text: str) -> List[Tuple[int, str]]:
    """(1-based line number, text) for every line that is read aloud."""
    out = []
    for i, line in enumerate((text or "").split("\n"), start=1):
        if not line.strip() or _STRUCTURAL.match(line) or _is_cue_name(line):
            continue
        out.append((i, line.strip()))
    return out


def spoken_text(text: str) -> str:
    return " ".join(t for _, t in spoken_lines(text))


def _sentence_spans(text: str) -> List[Tuple[int, int]]:
    """(line where the sentence starts, its length in words), in order."""
    lines = spoken_lines(text)
    joined, starts = "", []
    for no, t in lines:
        starts.append((len(joined), no))
        joined += t + " "
    out, pos = [], 0
    for m in list(_SENTENCE_END.finditer(joined)) + [None]:
        end = m.start() if m else len(joined)
        chunk = joined[pos:end]
        n = words(chunk)
        if n:
            first = pos + (len(chunk) - len(chunk.lstrip()))
            line = max((no for off, no in starts if off <= first), default=1)
            out.append((line, n))
        pos = m.end() if m else end
    return out


def monotone_run_span(text: str) -> Optional[dict]:
    """WHERE the longest run of same-length sentences is, not only how long.

    A length tells a writer something is flat; a line number tells them where
    to look. None below a run of three — two sentences of similar length is
    ordinary prose, and reporting it would be noise the writer learns to skip.
    """
    spans = _sentence_spans(text)
    if len(spans) < 3:
        return None
    best = (1, 0)                       # (length, start index)
    run, start = 1, 0
    for i in range(1, len(spans)):
        if abs(spans[i][1] - spans[i - 1][1]) <= MONOTONE_TOLERANCE:
            run += 1
        else:
            run, start = 1, i
        if run > best[0]:
            best = (run, start)
    length, at = best
    if length < 3:
        return None
    return {"sentences": length, "from_line": spans[at][0],
            "to_line": spans[at + length - 1][0]}


def _is_device(sentence: str) -> bool:
    low = sentence.lower()
    return "?" in sentence or any(m in low for m in _REHOOK_MARKERS)


def attention_devices(text: str, wpm: float = DEFAULT_WPM) -> List[float]:
    """Estimated seconds at which each sentence AFTER the opening one asks a
    question or turns against what came before — the same markers `outlier.py`
    uses on a transcript, so a draft and an outlier are read by one rule.

    Estimated, from words at a conventional rate: a draft has not been spoken.
    """
    joined = spoken_text(text)
    pieces = re.split(r"(?<=[.!?।॥])\s+", joined)
    seconds, spoken = [], 0
    for idx, piece in enumerate(p for p in pieces if p.strip()):
        if idx > 0 and _is_device(piece):
            seconds.append(round(spoken / wpm * 60, 1))
        spoken += words(piece)
    return seconds


def observations(text: str, wpm: float = DEFAULT_WPM) -> List[dict]:
    """Things worth noticing, phrased as observations — never as faults.

    One today: a short whose only attention device is the opening line. The
    craft says a device lands every five to eight seconds; a draft past ten
    seconds with nothing after its first sentence has its only one at 0s.
    Silent on a short that already reopens, and silent on a draft too short to
    owe a second device.
    """
    out = []
    secs = estimate_seconds(spoken_text(text), wpm) or 0
    if secs > 10 and len(sentences(spoken_text(text))) >= 2 and not attention_devices(text, wpm):
        out.append({
            "rule": "single_device",
            "message": "Nothing after the opening line asks a question or turns. "
                       "The only attention device is at 0s.",
        })
    return out


def meter(text: str, wpm: float = DEFAULT_WPM) -> dict:
    """What the editor's rhythm meter shows, measured on the spoken lines only.

    Numbers, booleans, line numbers and fixed observation sentences — never a
    copy of the draft. `tests/test_rhythm.py` holds that the way
    `test_outlier.py` holds it for transcripts.
    """
    spoken = spoken_text(text)
    out = measure_draft(spoken, wpm)
    out["monotone_run"] = monotone_run_span(text)
    out["attention_devices"] = attention_devices(text, wpm)
    out["observations"] = observations(text, wpm)
    out["wpm"] = wpm
    return out
