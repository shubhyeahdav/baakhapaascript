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
from typing import List, Optional

_SENTENCE_END = re.compile(r"[.!?]+")
_WORD = re.compile(r"[^\W\d_]+", re.UNICODE)

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
    for prev, cur in zip(lengths, lengths[1:]):
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
