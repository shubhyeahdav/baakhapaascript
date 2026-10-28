"""What an outlier short actually does, as numbers.

This is the core of the product and the only part that is worth owning. Anyone
can buy the same scraped data; the value is in what gets measured from it and
in the rule that nothing else survives the measuring.

THE RULE: a record produced here contains NO TRANSCRIPT TEXT. Not the hook, not
a sample line, not "the first sentence for reference". Transcripts are other
people's creative work, bought from a vendor under terms that permit analysis
rather than redistribution, and a corpus of them could not be shipped, shown to
a reviewer, or published. A corpus of measurements can be all three.

That is the same rule Baakhapaa runs on 117 screenplays: the analysed corpus
ships as numbers and original prose, and the raw text never leaves the machine
it was read on. It worked there and it is why that corpus is publishable by
construction.

`measured_at` and the input hashes are kept so a record can be traced back to
the video it came from without carrying a word of it.
"""
from __future__ import annotations

import math
import re
from dataclasses import dataclass
from typing import List, Optional

# A phrase-level chunk as the transcript vendor returns it: start, end, text.
@dataclass(frozen=True)
class Segment:
    start: float
    end: float
    text: str


# A sentence ends at one of these. Deliberately crude: transcripts are speech,
# and speech punctuation comes from the transcription model rather than from
# the speaker, so a clever parser would be inventing precision that is not in
# the input.
_SENTENCE_END = re.compile(r"[.!?]+")

# A rehook opens a new loop. Without a language model the honest proxy is the
# markers that actually carry one in speech -- a question, or a turn against
# what was just said. Named here rather than inlined so the list is arguable,
# which it should be: this is the one measurement in the file that is a
# judgement rather than a count.
_REHOOK_MARKERS = (
    "but ", "but,", "however", "except", "the problem", "here's the thing",
    "turns out", "and that's", "so why", "which is why", "what if",
    "the catch", "actually", "nobody tells you", "that's when",
)

_WORD = re.compile(r"[^\W\d_]+", re.UNICODE)


def words(text: str) -> int:
    """Spoken words. Digits are excluded because a transcription model writes
    "2024" as one token and "twenty twenty four" as four, and a rhythm measure
    that swings on that is measuring the vendor, not the writer."""
    return len(_WORD.findall(text or ""))


def sentences(segments: List[Segment]) -> List[str]:
    """Segments rejoined and re-split on sentence ends.

    Vendors segment on pauses, not on grammar, so a sentence routinely spans
    several segments and a segment occasionally holds two. Measuring rhythm on
    raw segments would measure the speaker's breathing.
    """
    joined = " ".join(s.text.strip() for s in segments if s.text and s.text.strip())
    parts = [p.strip() for p in _SENTENCE_END.split(joined)]
    return [p for p in parts if p]


def hook_seconds(segments: List[Segment]) -> Optional[float]:
    """When the first sentence closes.

    For a short, the hook is whatever has to land before the viewer decides.
    Taking it as the first completed sentence is a definition rather than a
    discovery, and it is stated here so a later disagreement is with the
    definition rather than with the number.
    """
    if not segments:
        return None
    running = ""
    for seg in segments:
        running = f"{running} {seg.text}".strip()
        if _SENTENCE_END.search(running):
            return round(seg.end, 2)
    # Never punctuated: the whole transcript is one breath. The last segment's
    # end is the honest answer, not None -- the hook did end, at the end.
    return round(segments[-1].end, 2)


def first_rehook_seconds(segments: List[Segment]) -> Optional[float]:
    """Where the second loop opens, by marker.

    A PROXY, and labelled one. Kallaway's structure is set-up -> rehook
    repeated, and the interval is the thing worth knowing; this finds the
    earliest point after the hook where the speech turns against itself or asks
    something. It will miss a rehook carried entirely by image, which is a
    known blind spot of measuring audio.
    """
    hook_end = hook_seconds(segments)
    if hook_end is None:
        return None
    for seg in segments:
        if seg.start <= hook_end:
            continue
        low = (seg.text or "").lower()
        if "?" in low or any(m in low for m in _REHOOK_MARKERS):
            return round(seg.start, 2)
    return None


def sentence_length_sigma(segments: List[Segment]) -> Optional[float]:
    """Standard deviation of sentence length, in words.

    The one number that makes a craft claim checkable. Varying sentence length
    is named as a retention device and monotony as a killer; this is what that
    looks like as a measurement. One sentence has no variance and returns None
    rather than 0.0, because they mean different things and a zero would pull
    every average it entered.
    """
    lengths = [words(s) for s in sentences(segments)]
    lengths = [n for n in lengths if n > 0]
    if len(lengths) < 2:
        return None
    mean = sum(lengths) / len(lengths)
    var = sum((n - mean) ** 2 for n in lengths) / len(lengths)
    return round(math.sqrt(var), 2)


def words_per_second(segments: List[Segment], duration_seconds: float) -> Optional[float]:
    """Delivery speed. Platform-native pacing is a stated retention factor, and
    this is the only part of it that survives into text."""
    if not duration_seconds or duration_seconds <= 0:
        return None
    total = sum(words(s.text) for s in segments)
    return round(total / duration_seconds, 2) if total else None


def front_load(segments: List[Segment], seconds: float = 3.0) -> Optional[float]:
    """Share of all spoken words delivered in the opening seconds.

    Three seconds because that is the window every short-form guide agrees on,
    and because it is the one span where a measurement can be compared across
    niches without arguing about the format.
    """
    total = sum(words(s.text) for s in segments)
    if not total:
        return None
    early = sum(words(s.text) for s in segments if s.start < seconds)
    return round(early / total, 3)


def opens_on_question(segments: List[Segment]) -> Optional[bool]:
    if not segments:
        return None
    first = sentences(segments)[:1]
    if not first:
        return None
    joined = " ".join(s.text for s in segments)
    idx = joined.find(first[0])
    tail = joined[idx + len(first[0]):idx + len(first[0]) + 1]
    return tail == "?"


def outlier_ratio(views: int, channel_median_views: float) -> Optional[float]:
    """Views against the channel's OWN median.

    The whole definition of an outlier, and the reason raw view count is not
    it: raw views find big channels, this finds a video that beat the person
    who made it. A hook can be credited with the second and cannot be credited
    with the first.
    """
    if not channel_median_views or channel_median_views <= 0:
        return None
    if views is None or views < 0:
        return None
    return round(views / channel_median_views, 2)


def measure(
    segments: List[Segment],
    duration_seconds: float,
    views: Optional[int] = None,
    channel_median_views: Optional[float] = None,
) -> dict:
    """Every measurement, and nothing else.

    The return value is checked by `tests/test_no_text_escapes.py`: every value
    must be a number, a bool or None. If a future measurement wants to carry a
    phrase back with it, that test fails, which is the point.
    """
    return {
        "duration_seconds": round(duration_seconds, 2) if duration_seconds else None,
        "segment_count": len(segments),
        "sentence_count": len(sentences(segments)),
        "word_count": sum(words(s.text) for s in segments),
        "hook_seconds": hook_seconds(segments),
        "first_rehook_seconds": first_rehook_seconds(segments),
        "sentence_length_sigma": sentence_length_sigma(segments),
        "words_per_second": words_per_second(segments, duration_seconds),
        "front_load_3s": front_load(segments),
        "opens_on_question": opens_on_question(segments),
        "outlier_ratio": outlier_ratio(views, channel_median_views),
    }
