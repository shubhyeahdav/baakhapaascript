"""Does each character sound like themselves — and unlike everyone else?

The Cast view already shows three numbers per character. Numbers are not a
finding: a writer looking at `avg_words 8.2` next to `avg_words 8.4` has to
know that those being equal is the problem, and nobody arrives knowing that.
This turns the measurements into the sentences a script editor would say.

Everything here is arithmetic over `screenplay.cast_lines`. No AI call, so it
runs on every tier, on a partial draft, and instantly.

Two design rules carried over from `linter.py`, for the same reasons:

  * **Conservative thresholds.** A check that fires constantly gets switched
    off, and a false positive on somebody's deliberate choice costs more trust
    than a missed flag costs quality. Every rule here needs a minimum number of
    lines before it will say anything, because two characters with four lines
    each SHOULD look similar and saying otherwise is noise.
  * **Every finding names the technique that fixes it**, by the exact
    `technique` string in `knowledge_base.json`, so the craft panel can attach
    the worked example without a second lookup.

What this deliberately does NOT do is judge whether a voice is good. It reports
where two voices have converged, where one has narrowed, and where the page
disagrees with what the writer said in the story bible. A writer can act on all
three. "This dialogue is weak" is not something a computer should say.
"""
import re

# Below this, the measures are noise. Six lines of dialogue is not a voice yet.
MIN_LINES = 6

# Two characters count as having collapsed into one voice when all three
# measures sit inside these margins. All three, not any one: people legitimately
# share a speech length or a question rate, and it is the combination that says
# nobody would be able to tell them apart with the character names removed.
SAME_LENGTH = 1.0        # words per line
SAME_QUESTIONS = 0.08    # share of lines ending in a question mark
SAME_VOCABULARY = 0.06   # distinct words as a share of words spoken

# A character repeating the same words. Set low on purpose: screenplay dialogue
# is repetitive by nature, and this should fire on a tic, not on plain speech.
NARROW_VOCABULARY = 0.45
NARROW_MIN_LINES = 10

# Asking rather than telling. A character who ends half their lines in a
# question is being used to prompt somebody else's answers.
MOSTLY_ASKS = 0.5
ASKS_MIN_LINES = 8

# What the writer said in the story bible, matched loosely. The point is not to
# understand the sentence — it is to catch the two descriptions that are
# checkable against a word count, and say nothing about the rest.
TERSE = re.compile(
    r"\b(terse|clipped|blunt|curt|quiet|sparing|monosyllabic|laconic|"
    r"few words|short sentences|says little|does not talk|doesn't talk)\b",
    re.IGNORECASE,
)
TALKATIVE = re.compile(
    r"\b(talkative|verbose|rambles?|rambling|chatty|garrulous|long-winded|"
    r"never stops talking|talks a lot|over-?explains?)\b",
    re.IGNORECASE,
)
TERSE_IS_NOT = 12.0      # words per line above which "clipped" is not true
TALKATIVE_IS_NOT = 5.0   # and below which "rambling" is not true


def _finding(names, kind, message, technique, severity="medium"):
    return {
        "characters": names,
        "rule": kind,
        "message": message,
        "technique": technique,
        "severity": severity,
    }


def collapsed_voices(characters):
    """Pairs of characters the page cannot tell apart.

    Compared pairwise rather than against a corpus average, because "sounds the
    same" is a relation between two people. An average would flag a whole cast
    of similar characters as individually normal.
    """
    eligible = [c for c in characters if c.get("line_count", 0) >= MIN_LINES]
    out = []
    for i, a in enumerate(eligible):
        for b in eligible[i + 1:]:
            if (abs(a["avg_words"] - b["avg_words"]) <= SAME_LENGTH
                    and abs(a["question_share"] - b["question_share"]) <= SAME_QUESTIONS
                    and abs(a["distinct_ratio"] - b["distinct_ratio"]) <= SAME_VOCABULARY):
                out.append(_finding(
                    [a["name"], b["name"]],
                    "voices_collapsed",
                    f"{a['name']} and {b['name']} are written at the same speed, "
                    f"ask questions at the same rate, and draw on the same width "
                    f"of vocabulary. Cover the character names and you could not "
                    f"say which of them is speaking.",
                    "Give a character one phrase they return to, and change its meaning",
                    severity="high",
                ))
    return out


def narrow_vocabulary(characters):
    """A character saying the same words over and over."""
    out = []
    for c in characters:
        if c.get("line_count", 0) < NARROW_MIN_LINES:
            continue
        if c["distinct_ratio"] <= NARROW_VOCABULARY:
            out.append(_finding(
                [c["name"]],
                "narrow_vocabulary",
                f"{c['name']} says {c['line_count']} lines out of a small pool of "
                f"words. Repetition can be a voice, but it has to be one phrase "
                f"doing deliberate work, not the whole part.",
                "Give a character one phrase they return to, and change its meaning",
            ))
    return out


def mostly_asks(characters):
    """A character used as a way of getting somebody else to explain."""
    out = []
    for c in characters:
        if c.get("line_count", 0) < ASKS_MIN_LINES:
            continue
        if c["question_share"] >= MOSTLY_ASKS:
            out.append(_finding(
                [c["name"]],
                "mostly_asks",
                f"{c['name']} ends {int(c['question_share'] * 100)}% of their "
                f"lines in a question. They are prompting the scene rather than "
                f"being in it, which usually means the information is theirs to "
                f"collect rather than theirs to want.",
                "Make one character already know it and resent hearing it again",
            ))
    return out


def contradicts_the_bible(characters):
    """The page against what the writer said the character sounds like.

    Only two descriptions are checkable against a word count, and only those two
    are checked. This says nothing about a `voice` field describing warmth,
    class, region or humour — not because those do not matter, but because a
    word count cannot see them, and guessing would make every other finding here
    less believable.
    """
    out = []
    for c in characters:
        described = (c.get("voice") or "").strip()
        if not described or c.get("line_count", 0) < MIN_LINES:
            continue
        if TERSE.search(described) and c["avg_words"] >= TERSE_IS_NOT:
            out.append(_finding(
                [c["name"]],
                "bible_disagrees",
                f"You described {c['name']} as speaking sparingly, but their "
                f"lines average {c['avg_words']} words. Either the page or the "
                f"story bible is out of date.",
                "Cut the first and last line of every speech",
                severity="high",
            ))
        elif TALKATIVE.search(described) and c["avg_words"] <= TALKATIVE_IS_NOT:
            out.append(_finding(
                [c["name"]],
                "bible_disagrees",
                f"You described {c['name']} as talkative, but their lines average "
                f"{c['avg_words']} words — shorter than most of the cast. Either "
                f"the page or the story bible is out of date.",
                "Cut the first and last line of every speech",
                severity="high",
            ))
    return out


RULES = (collapsed_voices, narrow_vocabulary, mostly_asks, contradicts_the_bible)


def findings(characters):
    """Every voice finding for a cast, most serious first.

    `characters` is what `screenplay.cast_lines` returns, optionally with the
    story bible's `voice` folded in — which is exactly what
    `GET /scripts/{id}/cast` already assembles.
    """
    out = []
    for rule in RULES:
        out.extend(rule(characters or []))
    order = {"high": 0, "medium": 1, "low": 2}
    out.sort(key=lambda f: (order.get(f["severity"], 3), f["characters"]))
    return out


def by_character(characters):
    """The same findings, indexed by name, for a per-character panel."""
    out = {}
    for f in findings(characters):
        for name in f["characters"]:
            out.setdefault(name, []).append(f)
    return out
