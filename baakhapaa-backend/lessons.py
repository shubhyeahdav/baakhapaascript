"""The learning module — two tracks that end in a finished short.

The **pen** track (The page / The scene / Finish) teaches the script page
itself; the **story** track teaches what the page is for — storytelling
fundamentals distilled from the analysed corpus's technique playbook. The
split is deliberate: page craft and story craft fail independently, and a
writer whose pages are clean can still have no story.

Design rule, from SCRIPT_CORPUS_PLAN §4: **every lesson ends with the user
writing something the app can immediately respond to.** A course that only
presents information does not get finished by anyone, and a course whose
feedback is "well done!" teaches nothing.

So each exercise is graded by the craft linter that already exists. A lesson
that teaches "action lines contain only what the camera sees" is passed when
`unfilmable_interiority` stops firing on the user's own text — not when they
click Next. That makes the grading deterministic, free, and honest: the same
submission always gets the same verdict, and the verdict is about their writing
rather than about their attendance.

`corpus_proof` is a measurement, never a quotation. It is the one place the
script library is allowed to speak, and it speaks in numbers so that nothing
copyrighted is ever reproduced.
"""
from typing import List, Optional

import lessons_ne
import linter
import screenplay

# rule -> lesson it belongs to, so a flag can offer "learn this" in the editor.
#
# Two kinds of rule feed this map, and the asymmetry is the point.
#
# The craft linter (`linter.py`) reads the PAGE, so its rules map to pen-track
# lessons almost one to one — every rule was derived from a craft entry's
# `warning_sign` in the first place.
#
# `review.py` reads the SHAPE — act balance, runtime drift — and those are the
# only story-level problems this product can detect automatically. Nothing can
# check that a midpoint flips or that a protagonist chooses their own inciting
# incident; those are read, not measured. So the story track gets three routes
# in from here and is otherwise browsed, which is why `LearnPage` presents it
# as a track rather than waiting to be summoned by a flag.
RULE_TO_LESSON = {
    "unfilmable_interiority": "action-lines",
    "on_the_nose": "subtext",
    "directed_emotion": "emotion-objects",
    "dialogue_slab": "dialogue-page",
    "greeting_open": "enter-late",
    "farewell_close": "enter-late",
    "long_action_block": "action-lines",
    "malformed_slugline": "the-page",
    "consecutive_two_handers": "crossed-purposes",
    "every_line_closed": "dialogue-page",

    # --- from review.py, the structural pass -------------------------------
    "act_out_of_balance": "three-acts",
    "act_balance_unknown": "three-acts",
    "runtime_drift": "three-acts",
}


def _check_absent(*rules):
    """Pass when none of `rules` fire on the submission."""
    def check(text):
        hit = [f for f in linter.lint(text) if f["rule"] in rules]
        if hit:
            return False, [f"Line {f['line']}: {f['message']}" for f in hit]
        return True, []
    return check


def _check_min_scenes(n):
    """Count real scene headings, not `screenplay.scenes()`.

    `scenes()` wraps any content appearing before the first slugline in an
    "(untitled opening)" scene so nothing is silently dropped. That is right
    for the parser and wrong here: it means a submission with no slugline at
    all still counts as one scene, so the lesson that teaches slugline format
    would pass text that has none.
    """
    def check(text):
        got = len([e for e in screenplay.parse(text) if e.type == "scene_heading"])
        if got >= n:
            return True, []
        return False, [
            f"Found {got} scene heading(s); this exercise needs {n}. "
            "A heading looks like: INT. LOCATION - DAY"
        ]
    return check


def _check_min_dialogue(n):
    def check(text):
        got = len([e for e in screenplay.parse(text) if e.type == "dialogue"])
        return (got >= n, [] if got >= n else [f"Found {got} dialogue line(s); this exercise needs {n}."])
    return check


def _check_beat_outline(n, marker):
    """An outline of at least `n` non-empty lines carrying `marker` somewhere.

    Outline exercises cannot be graded by the linter — they are beats, not
    pages — so the check is structural: enough beats to be a real outline, and
    the one the lesson asked the writer to identify actually identified.
    """
    def check(text):
        beats = [l for l in (text or "").splitlines() if l.strip()]
        problems = []
        if len(beats) < n:
            problems.append(f"Write at least {n} beats, one per line.")
        if marker.upper() not in (text or "").upper():
            problems.append(f"Mark the pivot beat {marker}: so it is a decision, not an accident.")
        return (not problems), problems
    return check


def _check_all(*checks):
    def check(text):
        problems = []
        for c in checks:
            ok, why = c(text)
            if not ok:
                problems.extend(why)
        return (not problems, problems)
    return check


# --- the curriculum -------------------------------------------------------
#
# Two tracks, five modules. The **pen** track (The page, The scene, Finish)
# teaches the script page itself — format, action, dialogue, the mechanics a
# camera can obey. The **story** track teaches what the page is for —
# storytelling fundamentals, each one a technique from the analysed corpus's
# playbook. They are separate on purpose: page craft and story craft fail
# independently, and a writer whose pages are clean can still have no story,
# while a strong story typed wrong is unreadable to a crew. Order matters
# inside each track: every lesson's exercise assumes the previous lesson's
# skill.
#
# `track` is "pen" or "story". The Learn page splits on it.

LESSONS = [
    # --- Module 1: The page ----------------------------------------------
    {
        "id": "the-page",
        "module": "The page",
        "track": "pen",
        "title": "What a screenplay is",
        "concept": (
            "One page is roughly one minute on screen. That single fact governs "
            "everything else: it is why action lines are short, why description "
            "is ruthless, and why a four-line paragraph costs you four seconds "
            "of screen time you have not earned. A screenplay has six elements "
            "and no others: scene heading, action, character cue, parenthetical, "
            "dialogue, transition."
        ),
        "corpus_proof": "A page is about 55 lines. Your draft's page count is estimated from that.",
        "exercise": "Write one correctly formatted scene heading and one action line beneath it.",
        "starter": "INT. ",
        "check": _check_all(_check_min_scenes(1), _check_absent("malformed_slugline")),
        "technique": "Format basics",
    },
    {
        "id": "action-lines",
        "module": "The page",
        "track": "pen",
        "title": "Only what the camera sees",
        "concept": (
            "The camera cannot photograph a thought. 'She realises he is lying' "
            "gives an actor nothing to play and a director nothing to shoot. Ask "
            "instead: what would this person physically do while feeling that, "
            "given where they are? Prefer small task-based actions over "
            "expressions — someone re-taping a hand that is already fine tells "
            "you more than 'nervous but determined'."
        ),
        "corpus_proof": "Beginner drafts average several interiority verbs per page; produced scripts approach zero.",
        "exercise": (
            "Rewrite this as action we could film:\n"
            "  'Prerana realises she will never leave this shop, and feels trapped.'"
        ),
        "starter": "INT. FRAME SHOP - DAY\n\n",
        "check": _check_all(_check_absent("unfilmable_interiority", "long_action_block"), _check_min_scenes(1)),
        "technique": "Convert inner state into something the camera can see",
    },
    {
        "id": "dialogue-page",
        "module": "The page",
        "track": "pen",
        "title": "Dialogue on the page",
        "concept": (
            "Speech in film is shorter than speech in life. A character who talks "
            "for six uninterrupted lines is delivering a monologue nobody asked "
            "for. Interruption, fragments and unfinished sentences are how real "
            "conversation sounds — and every line ending in a full stop is a "
            "conversation where nobody is really listening."
        ),
        "corpus_proof": "Across analysed scripts the median dialogue block is well under 5 lines.",
        "exercise": "Write a six-line exchange between two characters. No speech longer than two lines.",
        "starter": "INT. KITCHEN - NIGHT\n\n",
        "check": _check_all(_check_min_dialogue(6), _check_absent("dialogue_slab")),
        "technique": "Restraint on the page",
    },
    # --- Module 2: The scene ---------------------------------------------
    {
        "id": "scene-is-change",
        "module": "The scene",
        "track": "pen",
        "title": "A scene is a change, not a conversation",
        "concept": (
            "Every scene must end on a different charge than it started. If the "
            "situation, a relationship, or what someone knows is identical at the "
            "end, the scene is a cut candidate no matter how well written. Name "
            "the start charge and the end charge before you write."
        ),
        "corpus_proof": "Scenes that change nothing are the most common cut in a second draft.",
        "exercise": "Write a scene that starts on one charge and ends on its opposite. Two characters, one page.",
        "starter": "INT. ",
        "check": _check_all(_check_min_scenes(1), _check_min_dialogue(4),
                            _check_absent("unfilmable_interiority")),
        "technique": "Every scene must end on a different charge than it started",
    },
    {
        "id": "enter-late",
        "module": "The scene",
        "track": "pen",
        "title": "Enter late, leave early",
        "concept": (
            "Start after the greeting and cut before the goodbye. The audience "
            "will assume the hello happened. Scenes that open on 'Namaste, kasto "
            "cha?' spend their most valuable seconds on information nobody needs."
        ),
        "corpus_proof": "Cutting the first and last third of a scene usually improves it. Try it before arguing.",
        "exercise": "Take your previous scene and cut its first and last third. Paste the survivor.",
        "starter": "",
        "check": _check_all(_check_min_scenes(1), _check_absent("greeting_open", "farewell_close")),
        "technique": "Enter late, leave early",
    },
    {
        "id": "crossed-purposes",
        "module": "The scene",
        "track": "pen",
        "title": "Crossed purposes",
        "concept": (
            "Two people who want the same thing produce a scene with no engine. "
            "Give each character an incompatible want and let neither of them "
            "state it. The friction writes itself."
        ),
        "corpus_proof": "Three consecutive scenes of two people alone talking is a rhythm flag, not a style.",
        "exercise": "Two characters, incompatible wants, one page. Neither may say what they want.",
        "starter": "INT. ",
        "check": _check_all(_check_min_dialogue(6), _check_absent("on_the_nose", "unfilmable_interiority")),
        "technique": "Crossed purposes",
    },
    {
        "id": "subtext",
        "module": "The scene",
        "track": "pen",
        "title": "Nobody says what they want",
        "concept": (
            "On-the-nose dialogue reads as a therapy transcript. Find the real "
            "grievance, forbid anyone from naming it, and give them a petty "
            "physically-present surrogate to fight about instead — an unlatched "
            "shutter, a crooked frame, a plate. Let the intensity be wildly "
            "disproportionate. Allow exactly one line to nearly touch the truth, "
            "then retreat."
        ),
        "corpus_proof": "'You never supported my dreams' and its variants are the single most flagged line shape.",
        "exercise": "Rewrite your crossed-purposes scene so the real issue is never named once.",
        "starter": "",
        "check": _check_all(_check_min_dialogue(6), _check_absent("on_the_nose", "directed_emotion")),
        "technique": "Let them fight about the small wrong thing",
    },
    # --- Module 3: Story --------------------------------------------------
    {
        "id": "want-need",
        "module": "Story",
        "track": "story",
        "title": "Want versus need",
        "concept": (
            "The want is what the character is chasing. The need is what would "
            "actually help them. Stories work when those two are not the same "
            "thing, and endings land when the character gets one and not the "
            "other."
        ),
        "corpus_proof": "Endings that grant both read as wish fulfilment; endings that grant neither read as bleak.",
        "exercise": "Write your protagonist's want and need as two sentences, then a scene where the want wins.",
        "starter": "",
        "check": _check_all(_check_min_scenes(1), _check_min_dialogue(4)),
        "technique": "Want versus need",
    },
    {
        "id": "inciting",
        "module": "Story",
        "track": "story",
        "title": "The inciting incident is a choice",
        "concept": (
            "If the story merely happens to your protagonist, the audience "
            "watches. If your protagonist chooses it — especially if they want it "
            "— the audience becomes complicit, and every later win raises the "
            "cost of exposure."
        ),
        "corpus_proof": "Passive inciting incidents are the most common structural note on first drafts.",
        "exercise": "Rewrite a passive opening event as something your protagonist actively chooses.",
        "starter": "",
        "check": _check_all(_check_min_scenes(1), _check_absent("unfilmable_interiority")),
        "technique": "Make the inciting opportunity something the protagonist wants",
    },
    {
        "id": "stakes-of-pursuit",
        "module": "Story",
        "track": "story",
        "title": "Every win must cost something",
        "concept": (
            "Stakes are not what a character could lose at the end — they are "
            "what pursuing the goal costs along the way. Each step toward the "
            "dream should spend something real: money the family needed, a "
            "friendship, a lie that now has to be maintained. When progress "
            "itself is expensive, the audience feels the pull of both sides, "
            "and the story stops being a queue of obstacles and becomes a bill "
            "coming due."
        ),
        "corpus_proof": "In the analysed underdog patterns every act of pursuit carries a material cost; free progress is the marker of a first draft.",
        "exercise": (
            "Write one scene where your protagonist gets a step closer to what "
            "they want — and pays for it with something the audience saw them "
            "value. The cost must be visible on screen, not narrated."
        ),
        "starter": "",
        "check": _check_all(_check_min_scenes(1), _check_min_dialogue(3),
                            _check_absent("on_the_nose", "unfilmable_interiority")),
        "technique": "Make each act of pursuing the goal cost something material",
    },
    {
        "id": "three-acts",
        "module": "Story",
        "track": "story",
        "title": "Three acts and where the walls fall",
        "concept": (
            "Roughly a third to set up, a third to complicate, a third to resolve. "
            "The proportions matter more than the labels: an act one running to "
            "40% of your runtime means your story starts late, whatever you call "
            "the sections."
        ),
        "corpus_proof": "This app splits 33/33/34 by default, and can benchmark your draft's real shape against the corpus.",
        "exercise": "Write an 8-beat outline for your short. One line per beat.",
        "starter": "",
        "check": lambda text: (len([l for l in text.splitlines() if l.strip()]) >= 8,
                               ["Write at least 8 beats, one per line."]),
        "technique": "Three-act proportion",
    },
    {
        "id": "midpoint-flip",
        "module": "Story",
        "track": "story",
        "title": "The midpoint flips the register",
        "concept": (
            "Middles sag when they repeat the same kind of scene at the same "
            "temperature. The fix is a pivot near the halfway mark that changes "
            "what kind of story this is: the comedy of sneaking around turns "
            "into the dread of being caught, the small lie becomes a structure "
            "that must be maintained. Nothing new needs to enter — the midpoint "
            "re-prices everything already on the table."
        ),
        "corpus_proof": "The analysed thriller patterns place a tonal descent at the midpoint: same goal, new register, compounding risk.",
        "exercise": (
            "Outline six beats for your middle act, one per line. Beats 1-3 "
            "before the flip, beats 4-6 after — the same pursuit at a new "
            "temperature. Mark the pivot beat FLIP:."
        ),
        "starter": "",
        "check": _check_beat_outline(6, "FLIP"),
        "technique": "Pivot the tonal register at the midpoint",
    },
    {
        "id": "progress-is-the-trap",
        "module": "Story",
        "track": "story",
        "title": "Progress is the trap",
        "concept": (
            "The strongest middles make the protagonist's own success the "
            "mechanism of their danger. Each small victory compounds the risk "
            "of exposure; the trail they are following tightens around them as "
            "it rewards them. Getting what you want, and having the getting of "
            "it make everything worse, is a scene an audience cannot look away "
            "from — because that is how ambition actually feels."
        ),
        "corpus_proof": "In the analysed revenge and infiltration patterns, the protagonist's progress IS the trap tightening — the two lines are one line.",
        "exercise": (
            "Write one scene where your protagonist gets exactly what they "
            "asked for — and the getting of it visibly tightens the trap. "
            "Nobody may say out loud that things are now worse."
        ),
        "starter": "",
        "check": _check_all(_check_min_scenes(1),
                            _check_absent("unfilmable_interiority", "on_the_nose")),
        "technique": "Let each victory compound the risk",
    },
    {
        "id": "antagonist",
        "module": "Story",
        "track": "story",
        "title": "Pressure, not villains",
        "concept": (
            "The Baakhapaa default: make the true antagonist institutional — "
            "family expectation, an education system, money, wedding season — so "
            "the individual people stay human and sometimes right. A father who "
            "is simply wrong is a cardboard obstacle. A father who is right about "
            "the shop's rent is a story."
        ),
        "corpus_proof": "Sympathetic-obstacle structures dominate the analysed South Asian corpus.",
        "exercise": "Give your blocking character one scene where they are clearly right.",
        "starter": "INT. ",
        "check": _check_all(_check_min_dialogue(4), _check_absent("on_the_nose", "directed_emotion")),
        "technique": "Make the pressure the villain, keep the people human",
    },
    {
        "id": "detonate-where-safe",
        "module": "Story",
        "track": "story",
        "title": "Break it where it is safest",
        "concept": (
            "A crisis lands hardest in the one place the characters believed "
            "nothing could go wrong: the wedding, the festival, the family "
            "dinner where everyone is performing happiness. The occasion does "
            "half the work — the audience already knows the rules of the room, "
            "so they feel exactly how badly the rules are being broken. And it "
            "forces the private conflict public, which is the moment it can no "
            "longer be managed."
        ),
        "corpus_proof": "Three separate analysed traditions detonate the climax at a celebration — the least safe of the safe places.",
        "exercise": (
            "Place your story's crisis inside an occasion — a festival, a "
            "puja, an engagement. Write the scene where the private problem "
            "goes public in front of everyone it was being hidden from."
        ),
        "starter": "",
        "check": _check_all(_check_min_scenes(1), _check_min_dialogue(4),
                            _check_absent("directed_emotion")),
        "technique": "Detonate the crisis at a celebration",
    },
    {
        "id": "redefine-victory",
        "module": "Story",
        "track": "story",
        "title": "Redefine what winning means",
        "concept": (
            "The ending that satisfies is rarely the one where the protagonist "
            "wins the surface contest. It is the one where the story has "
            "quietly changed what winning means — self-respect instead of the "
            "prize, the family understood instead of defeated — so the ending "
            "can land even when the audition is failed and the shop stays "
            "open. Total triumph and total tragedy both read as melodrama; the "
            "earned middle is where the audience lives."
        ),
        "corpus_proof": "The analysed endings that satisfy redefine victory as self-respect; endings granting the surface want unchanged read as wish fulfilment.",
        "exercise": (
            "Write your final scene so the protagonist loses the surface "
            "contest and the ending still satisfies. What they get instead "
            "must be something the story taught them to value."
        ),
        "starter": "",
        "check": _check_all(_check_min_scenes(1), _check_min_dialogue(2),
                            _check_absent("on_the_nose", "directed_emotion")),
        "technique": "Redefine victory as self-respect rather than winning",
    },
    # --- Module 4: Finish -------------------------------------------------
    {
        "id": "emotion-objects",
        "module": "Finish",
        "track": "pen",
        "title": "The object that carries the feeling",
        "concept": (
            "Choose one ordinary object touched by the relationship. Establish it "
            "early doing nothing special. At the emotional peak let it move — "
            "given, withheld, broken, returned — and cut the line you were going "
            "to write. The object says it better and cannot be over-acted."
        ),
        "corpus_proof": "Parentheticals like '(tearfully)' are flagged because they do the actor's job badly.",
        "exercise": "Plant an object in one scene, then move it at your emotional peak. No dialogue about it.",
        "starter": "",
        "check": _check_all(_check_min_scenes(2), _check_absent("directed_emotion", "unfilmable_interiority")),
        "technique": "Put the feeling into a physical thing that changes hands",
    },
    {
        "id": "write-the-draft",
        "module": "Finish",
        "track": "pen",
        "title": "Write the draft",
        "concept": (
            "Eight to twelve pages. Nothing here is new — this is every previous "
            "lesson at once. Write it badly and finish it; a finished bad draft "
            "can be fixed and an unfinished good one cannot."
        ),
        "corpus_proof": "Once you pass 8 scenes and 25 dialogue lines the benchmark opens on your own draft.",
        "exercise": "Write your complete short. Aim for 8+ scenes.",
        "starter": "",
        "check": _check_all(_check_min_scenes(8), _check_min_dialogue(25)),
        "technique": "Finishing",
    },
    {
        "id": "rewrite",
        "module": "Finish",
        "track": "pen",
        "title": "Rewrite: read aloud, cut ten percent",
        "concept": (
            "Read the whole thing out loud. Every place you stumble is a place an "
            "audience will. Then cut 10% of the length without removing a scene — "
            "it is almost always there, in the third lines of speeches and the "
            "second sentences of action."
        ),
        "corpus_proof": "The linter should get quieter between drafts. That delta is the measurable part of rewriting.",
        "exercise": "Submit your revised draft. It should be shorter and flag fewer problems than before.",
        "starter": "",
        "check": _check_all(_check_min_scenes(8),
                            _check_absent("unfilmable_interiority", "on_the_nose", "directed_emotion")),
        "technique": "Rewriting",
    },
]

LESSONS_BY_ID = {l["id"]: l for l in LESSONS}


# Translated fields, keyed by lesson id. Kept in its own module so this file
# stays the English source text — see `lessons_ne` for why.
TRANSLATIONS = {"ne": lessons_ne.LESSONS_NE}


def public_lesson(lesson: dict, completed_ids=(), lang: str = "en") -> dict:
    """A lesson without its check function, which is not serialisable and not
    the user's business.

    `lang` swaps the four prose fields for their translation. A missing
    translation falls through to English per field rather than per lesson, so a
    lesson added today still reads correctly before anyone has translated it —
    the alternative is a half-translated course that looks broken.
    """
    text = TRANSLATIONS.get(lang, {}).get(lesson["id"], {})

    def field(name):
        return text.get(name) or lesson[name]

    return {
        "id": lesson["id"],
        "module": lesson["module"],
        "track": lesson.get("track", "pen"),
        "title": field("title"),
        "concept": field("concept"),
        "corpus_proof": field("corpus_proof"),
        "exercise": field("exercise"),
        "starter": lesson.get("starter", ""),
        "technique": lesson["technique"],
        "completed": lesson["id"] in completed_ids,
    }


def curriculum(completed_ids=(), lang: str = "en") -> List[dict]:
    return [public_lesson(l, completed_ids, lang) for l in LESSONS]


def grade(lesson_id: str, text: str) -> Optional[dict]:
    """Run a submission against its lesson's check.

    Returns None for an unknown lesson id. Feedback is the linter's own
    messages, so a failed exercise tells the writer which line and why —
    the same words the editor would have shown them anyway.
    """
    lesson = LESSONS_BY_ID.get(lesson_id)
    if not lesson:
        return None

    passed, problems = lesson["check"](text or "")
    return {
        "lesson_id": lesson_id,
        "passed": passed,
        "problems": problems,
        "technique_unlocked": lesson["technique"] if passed else None,
        "statistics": screenplay.statistics(text or ""),
    }
