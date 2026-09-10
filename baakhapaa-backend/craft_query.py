"""Turn a writer's complaint into words the craft corpus was embedded in.

The corpus is English. `rag.EMBED_MODEL_NAME` is `bge-small-en-v1.5`, an
English model, and every `problem` statement in `knowledge_base.json` is
English prose. A writer in Kathmandu does not type English prose. So the one
part of this product that is genuinely differentiated — a craft library that
answers the complaint you actually have — was answering it worst for the people
it was built for.

WHAT WAS MEASURED, before any of this was written
-------------------------------------------------
Cosine similarity between pairs, using the model retrieval actually runs:

    romanised <-> romanised, same meaning        0.817
    romanised <-> romanised, DIFFERENT meaning   0.635
    romanised <-> its own English translation    0.586   <-- lower than a miss

    devanagari <-> devanagari, same meaning      0.898
    devanagari <-> devanagari, DIFFERENT meaning 0.877   <-- a 0.02 gap

Two conclusions, and they point at different fixes:

  * A romanised query is closer to an unrelated romanised sentence than to its
    own English translation. Cross-language matching is not weak here, it is
    below noise. Nothing that leaves the query in Nepali can work.

  * Devanagari does not separate at all. Same meaning and different meaning are
    0.02 apart, which is the model failing to read the script rather than
    reading it badly — byte-fallback tokens carry no semantics. This rules out
    the fix that looked obvious and was written down as the plan in
    `eval_retrieval.py`: a **Nepali gloss field embedded alongside the English
    problem statement**. A romanised gloss would have worked (0.817 vs 0.635 is
    usable). A Devanagari one cannot, because the two things being compared are
    both unreadable to the model. That plan was right about half the problem.

So the query is translated OUT of Nepali before it is embedded, rather than the
corpus being translated into it. That also happens to be the cheap direction:
one lexicon, no re-embedding, no second copy of the corpus to keep in step.

WHY A LEXICON AND NOT A TRANSLATOR
----------------------------------
This does not need to translate Nepali. It needs to recognise the forty-odd
words people use to say what is wrong with a script — sounds the same, drags,
too much talking, nothing happens, nobody cares — and put the English craft
term next to them. That is small enough to read in one sitting, costs no API
call, cannot fail at runtime, and is reviewable in a diff, which a translation
service is not.

Glosses are APPENDED, never substituted. A query with no Nepali in it comes
back byte-identical, so the English and romanised-with-English-loanwords cases
cannot regress — `test_craft_query.py` pins that, because it is the property
that makes this safe to put in front of every retrieval call in the product.
"""
import re

# concept -> (english glosses, devanagari stems, romanised forms)
#
# Devanagari matches as a substring: the language is agglutinative and inflects
# the verb ending, so सुनिन्छ and सुनिन्छन् differ by a suffix and a word-boundary
# match would catch neither reliably. Romanised matches on word boundaries,
# because Latin-script fragments collide with English far too easily.
#
# Romanised Nepali is already part English — a real complaint reads "mero
# character haru sabai eutai jasto sunincha", where `character` needs no help.
# That is exactly why romanised scores 69% and Devanagari 17%. The work here is
# the Nepali connective tissue: the verbs and the qualifiers.
NEPALI_COMPLAINTS = (
    # --- the things being complained about --------------------------------
    ("character characters", ("पात्र", "चरित्र"), ("patra", "patraharu")),
    ("dialogue lines", ("संवाद",), ("samvad", "sambad", "samwad")),
    ("scene", ("दृश्य",), ("drishya",)),
    ("story", ("कथा",), ("katha", "kathako")),
    ("protagonist hero main character", ("नायक", "नायिका"), ("nayak", "nayika")),
    ("emotion feeling", ("भावना",), ("bhavana", "bhawana")),
    ("screen on screen", ("पर्दा",), ("parda",)),
    ("act", ("अंक", "अङ्क"), ()),
    ("backstory", ("पछाडिको कथा",), ()),
    ("camera action lines", ("क्यामेरा",), ()),
    ("audience", ("दर्शक",), ("darshak",)),

    # --- what is wrong with them ------------------------------------------
    # NOT in this list, deliberately: सबै/sabai (all), धेरै/dherai (too much),
    # मात्र/matra (only), आफ्नो/aafno (their own). They are function words, and a
    # gloss should name a craft symptom rather than translate a word — the same
    # dilution `rag.pattern_to_text` documents about `how_it_works`.
    #
    # Removing them did NOT move any score: combined p@1 stayed at 87.2% and
    # every per-level figure was identical. They are out on the principle, not
    # on evidence, and the honest reading is that this lexicon has more entries
    # than it needs and no test can currently tell which. Quantity survives
    # where it is part of the complaint itself ("talk too much"), not alone.
    ("sound the same identical voice", ("सुनिन्छ", "सुनिन्च"), ("sunincha", "suninchha")),
    ("the same identical no difference", ("उस्तै", "एउटै", "एकै"), ("ustai", "eutai", "ekai")),
    ("talk too much overwritten long speeches", ("धेरै बोल्छ", "धेरै बोल्न"),
     ("dherai bolcha", "dherai bolchan", "dherai boldachan")),
    ("talk speak say", ("बोल्छ", "बोल्न", "भन्छ"),
     ("bolcha", "bolchan", "boldachan", "bhanchan", "bhancha")),
    ("long overlong", ("लामो",), ("lamo",)),
    ("short too short", ("छोटो",), ("chhoto", "chhota", "choto")),
    ("drags sags slow loses momentum", ("सुस्त",), ("sustaucha", "susta", "sustauchha")),
    ("the middle sags", ("बीच",), ("beech ma", "bich ma", "bichma")),
    ("ending does not land", ("अन्त्य",), ("anta",)),
    ("boring flat unengaging", ("बोरिङ",), ()),
    ("nothing happens nothing changes", ("केही हुँदैन", "केही हुन्न", "केहि हुँदैन"),
     ("kehi hunna", "kehi hundaina")),
    ("does not happen", ("हुँदैन", "हुन्न"), ("hunna", "hundaina")),
    ("is not shown not visible cannot be seen", ("देखिँदैन", "देखिन्न"),
     ("dekhindaina", "dekhinna")),
    ("nobody cares no one is interested", ("मतलब छैन", "चासो छैन"),
     ("matlab chaina", "chaso chaina", "matlab chhaina", "kasailai matlab chaina")),
    ("false fake unearned", ("झुटो", "नक्कली"), ("jhuto", "nakkali")),
    ("hollow empty", ("खाली",), ("khali",)),
    ("predictable", ("अनुमान",), ("anuman",)),
    ("on the nose states it outright too direct", ("सिधा", "सोझो"),
     ("seedha", "sidha", "sojho")),
    ("explains states the feeling outright", ("व्याख्या", "बुझाउँछ"),
     ("bujhaidincha", "bujhaudacha", "bhanidincha")),
    ("does not balance uneven", ("मिलेन", "मिल्दैन"), ("milena", "mildaina")),
    ("kills the momentum", ("मार्छ",), ("marcha", "marchha")),
    ("turns up only when needed exists to serve the plot", (), ("kaam pare",)),
    ("nothing of their own", ("केही छैन",), ("kehi chaina", "kehi chhaina")),
    ("boring to read", ("पढ्न",), ("padhna",)),
    ("wins gets what they wanted", ("जित्छ",), ("jitcha", "jitchha")),
    ("quiet room two people alone", ("शान्त कोठा",), ("shanta kotha",)),
)


def _compile():
    """One regex per concept for the romanised half; plain substrings for the
    Devanagari half. Built once at import — retrieval calls this per request."""
    out = []
    for glosses, deva, roman in NEPALI_COMPLAINTS:
        pattern = None
        if roman:
            # Longest first, so "dherai bolcha" wins over "bolcha" and the more
            # specific gloss is the one that lands.
            alts = sorted((re.escape(r) for r in roman), key=len, reverse=True)
            pattern = re.compile(r"\b(?:" + "|".join(alts) + r")\b", re.IGNORECASE)
        out.append((glosses, tuple(deva), pattern))
    return tuple(out)


_LEXICON = _compile()

# The Devanagari block. Presence of any of it is what makes a query "Nepali
# script"; used only to report which path a query took.
_DEVANAGARI = re.compile(r"[ऀ-ॿ]")


def normalise(query: str):
    """Return `(text_to_embed, glosses_added)`.

    `text_to_embed` is the original query with English craft vocabulary
    appended for every Nepali complaint term recognised in it. A query with no
    recognised Nepali comes back **unchanged and identical**, which is the
    property that lets this sit in front of every retrieval call without
    putting the English scores at risk.

    The glosses come back separately because a caller that wants to tell a
    writer why they got these three cards needs to know the query was
    rewritten. Silently changing what somebody asked and then explaining the
    answer in terms of the rewrite is how a search box loses trust.
    """
    if not query or not query.strip():
        return query, []

    found = []
    for glosses, deva, pattern in _LEXICON:
        hit = any(d in query for d in deva) or bool(pattern and pattern.search(query))
        if hit and glosses not in found:
            found.append(glosses)

    if not found:
        return query, []
    return f"{query} {' '.join(found)}", found


def looks_nepali(query: str) -> bool:
    """Devanagari present, or enough romanised Nepali to be sure.

    One romanised word is not enough — `matra` and `katha` turn up in English
    sentences written about Nepali films. Two independent concepts is.
    """
    if not query:
        return False
    if _DEVANAGARI.search(query):
        return True
    return len(normalise(query)[1]) >= 2
