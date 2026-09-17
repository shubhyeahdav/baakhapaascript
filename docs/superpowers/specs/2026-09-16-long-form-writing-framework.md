# The writing framework for a long-form video script

What a creator writes *against* on the script page: the five sections, what each
one owes the viewer, and which of those obligations a machine can check.

The companion to `2026-09-14-long-form-video-design.md`, which covers the
architecture — the parser, the seam at `scene_sync.parser_for`, storage. This
covers the craft the page is teaching. It is the source for the guide-section
copy and for what the left rail labels; the rail is not designed here.

## The rule this document is held to

**The framework is a convention, not a measurement.** Nothing in this
repository observes how anyone watches a video. `lib/retention.js` already
states this about its own attention marks and refuses to assert a fault it
cannot check, and `MilestoneNote` follows the same rule. This document is built
on top of those marks, so it is a convention resting on a convention, and it
inherits the rule twice over.

That has a concrete consequence for the page: a section that misses its target
is **described, never accused**. A forty-second hook is wrong in most videos and
exactly right in some, and the page has no way to tell which one it is looking
at.

## The vocabulary, and where it comes from

`videoscript.SECTION_KINDS` is `("hook", "promise", "segment", "payoff", "cta")`.
`videoscript._kind_of` lowercases a heading and matches its **first word**
against that tuple; anything else parses as `segment`, because a writer naming
their own section is writing, not erring.

```
## HOOK - 0:15
## PROMISE - 0:30
## SEGMENT 1 - 3:00
## PAYOFF - 1:00
## CTA - 0:20
```

The `- M:SS` target is optional. A writer sketching an outline should not have
to decide every section's length before writing a word of it.

**Sharp edge worth knowing before the rail is built:** the match is on the first
word and there are no synonyms. `## CTA` resolves; `## CALL TO ACTION`,
`## OUTRO` and `## INTRO` all fall through to `segment`. The rail will
therefore mislabel a writer who reaches for the ordinary English phrase. Either
the guide teaches the five literal words or `_kind_of` learns the synonyms —
that is a decision, not an oversight, and it is open.

## The five sections

Each section below carries the craft entry that owns it. Those six entries are
already in `knowledge_base.json` with `applies_to: ["video"]`, and each one's
`warning_sign` is already what the linter reads.

### HOOK — ends before 0:30

**Owes the viewer:** something, before it asks for anything.

The steepest fall in most videos is inside the first half minute
(`ATTENTION_MARKS.opening`). An introduction spends that half minute asking a
viewer to pay attention on the promise of a payoff. The craft entry —
*"Open on the consequence, then go back for the cause"* — reverses the trade:
lead with the payoff's consequence, unexplained, and the explanation becomes
the thing they stay for rather than the toll they pay to arrive.

**Warning sign:** your first thirty seconds could be deleted and the video would
still make sense.

*Default scaffold target 0:15. That number is a starting point, not a finding —
the grounded part is the 0:30 boundary, not where inside it the hook should
land.*

### PROMISE — ends before 1:00

**Owes the viewer:** the contract, in the nouns it will be held to.

Whoever is still watching at a minute usually stays a good while
(`ATTENTION_MARKS.settled`), so this is the last section that is still
negotiating. The craft entry that governs it is the *payoff's* —
*"Pay off the exact promise the opening made, in the words it made it"* —
because a promise and a payoff are one obligation written down twice, and the
promise is the half that is usually a guess.

**Warning sign:** the subject of your first sentence does not appear in your
last one.

*Default scaffold target 0:30.*

### SEGMENT — the body, and the only repeatable kind

**Owes the viewer:** a reason to still be here at the next seam.

Two entries govern the middle, and they are the two that answer the format's
most common failure — a retention graph that falls steadily with nothing
individually wrong:

- *"Close every loop you open, and open the next one before you close the last"*
  — a viewer stays for an unanswered question, not for interesting material. A
  section that both raises and answers its own question leaves a gap at its
  seam, and a steady fall is what a run of small gaps looks like from a
  distance.
- *"Let the middle change what the opening meant"* — a list has no reason to be
  watched in order. The segment nearest the **midpoint mark** carries the fact
  that most complicates the opening claim, and the segments after it are about
  what that costs.

**Warning signs:** every section of your script both raises and answers its own
question; your sections could be reordered and the video would be equally
coherent.

*Three to five segments in an 8–25 minute video. That range is a convention
borrowed from the format, not something this repository has counted.*

### PAYOFF

**Owes the viewer:** the promise, answered in its own words.

Paired with PROMISE above; the check runs across the two of them, not on either
alone. An ending that answers a nearby question satisfies the maker, who knows
the journey, and not the viewer, who is checking a receipt.

### CTA — after the payoff, never before

**Owes the viewer:** nothing. It is the ask, and its placement is the whole
craft.

*"Ask only for what the video has already made worth doing"* — a request reads
as payment for what came before. Asked before the value has landed it reframes
everything preceding it as the price; asked after, and phrased as what a person
who just agreed with you would want next, it reads as help.

**Warning sign:** your call to action would read identically at the top of the
video as at the bottom.

**Structural, therefore checkable:** a `cta` section appearing before the
`payoff` section in document order is a position, and position is something the
parser already knows.

## What goes on the page inside a section

`videoscript.ELEMENT_TYPES` is `("section_heading", "narration", "broll",
"on_screen")`. Three of those a writer types:

| what you type | parses as | counted in runtime |
|---|---|---|
| anything unbracketed | `narration` | **yes** |
| `[B-ROLL: a hand turning the tap off]` | `broll` | no |
| `[ON SCREEN: 4,200 litres]` | `on_screen` | no |

Cues are excluded from runtime because nobody reads them aloud, and counting
them inflates every estimate in the format (`videoscript.spoken_words`).

The sixth craft entry is the one that lives at this level rather than at the
section level — *"Give every claim something the screen can show while it is
said"*. Narration and image compete for the same attention when they carry the
same content, and a talking head saying what the screen already shows is the
most redundant arrangement available.

**Warning sign:** whole pages of your script have no bracketed visual note at
all. This is the most mechanically checkable rule in the framework: it is a
count of `CUE_RE` matches against a span of narration.

## Runtime, and why the page indicator stays a page indicator

Runtime is `spoken_words / SPEAKING_WPM * 60` — words over a speaking rate, not
lines over `PAGE_LINES`. The same words written as one paragraph or as ten short
lines take the same time to say, which is not true of a screenplay page.

`SPEAKING_WPM_NE` is **not measured**. It is currently the English figure, and
there is no Nepali narration sample on this machine to count against. A
different invented number would be worse than a borrowed one: a wrong estimate
that looks specific is harder to doubt. This is a pilot question.

The left rail's position indicator stays a **page number**, not a start
timecode. It is a document position and must never feed runtime or review —
that separation is what keeps an unmeasured speaking rate from leaking into a
number the writer trusts. A timecode in the gutter would be exactly that leak.

## What a machine can check, and what only a reader can

This is the line that decides what belongs in the rail and what belongs in the
guide panel, so it is worth stating flatly. **Two of the seven warning signs are
mechanically checkable. Five are not.**

**Checkable — may surface as a flag:**
- a span of narration with no bracketed cue in it (count)
- a `cta` section positioned before the `payoff` section (order)
- a section running long or short against its own stated `- M:SS` (arithmetic,
  and *described*, never accused)

**Not checkable — belongs in the guide panel as a question the writer answers:**
- could your first thirty seconds be deleted?
- does the subject of your first sentence appear in your last?
- does every section both raise and answer its own question?
- could your sections be reordered without anything breaking?
- would your CTA read identically at the top of the video?

A guide section that presents the second list as a flag would be asserting a
fault it cannot check, which is the one thing `retention.js` and `MilestoneNote`
are both built to refuse. They are prompts, and they read as prompts.

## The scaffold a new long-form draft opens with

Structure suggests, it does not write — the wizard stopped generating content on
2026-08-26 and this must not quietly undo that. The scaffold is **five headings
and nothing else**: no narration, no placeholder sentences, nothing a writer has
to delete before they can start.

```
## HOOK - 0:15

## PROMISE - 0:30

## SEGMENT 1 - 3:00

## SEGMENT 2 - 3:00

## PAYOFF - 1:00

## CTA - 0:20
```

Every one of those targets is editable and every one is a convention. A writer
who deletes the lot and types their own headings is using the format correctly,
and the rail must keep working for them — `_kind_of` already falls through to
`segment` rather than failing.

## The second mode: a course lesson

Everything above describes **one** kind of long-form writing. `long_form` also
covers scripting for the courses module, and that is a different craft wearing
the same format. Writing a course lesson against the framework above would be
the same mistake as forcing a fifteen-second vertical video through a three-act
split — which `models.py` already names, in the comment that separates
`short_form` from `short`, as the fastest way to make the tool useless for it.

### Why the retention framework does not transfer

**The two modes fail in opposite directions.**

A video essay is written for *purchased* attention. The viewer can leave at any
second and owes you nothing, so the opening buys the right to continue and the
failure is **they left**. Every boundary in the framework above — the 0:30
hook, the 1:00 promise — exists to answer that failure.

A course lesson is written for *committed* attention. The learner has already
enrolled, often paid, and sat down on purpose. They are not going to bounce at
0:30, and a lesson that spends its first half-minute buying attention it already
has is wasting the one advantage the format holds. The failure is **they stayed,
finished, and still cannot do the thing**.

So `ATTENTION_MARKS` must not be drawn over a course lesson. The retention
instrument is honest about being a convention; applied here it would be a
convention borrowed from the wrong format, which is worse than no instrument at
all. The Outline's shape for a course lesson is a different instrument, and it
is not designed in this document.

### The grammar already exists — in `lessons.py`

This is the useful discovery. The courses module is not a blank page needing a
structure invented for it; it has carried one since it shipped. Every entry in
`lessons.LESSONS` has the same five fields, and they *are* the section grammar:

| `lessons.py` field | section | what it owes the learner |
|---|---|---|
| `title` / `technique` | `## OBJECTIVE` | one thing they will be able to **do** |
| `concept` | `## CONCEPT` | the idea, and why it governs the rest |
| `corpus_proof` | `## PROOF` | a **measurement** that the idea is real |
| `exercise` + `starter` | `## EXERCISE` | the thing to do, and a way in |
| `check` | `## CHECK` | how both of you know it landed |

Reusing the module's own field names is not tidiness. It is the `scene_sync`
argument again: a script written in a parallel vocabulary and mapped onto
lessons afterwards drifts from them on the first edit. If the page writes the
same five names the module reads, a lesson script *is* a lesson rather than
being converted into one.

### The rule the courses module already enforces, and the page must not lose

From `lessons.py`, quoting its own design rule out of SCRIPT_CORPUS_PLAN §4:
**every lesson ends with the user writing something the app can immediately
respond to.** The comment states the reason in both directions — a course that
only presents information does not get finished by anyone, and a course whose
feedback is "well done!" teaches nothing.

That makes `## EXERCISE` and `## CHECK` **mandatory** sections, which is a
stronger claim than anything in the video framework, where every section is a
convention. A course-lesson script missing either one is not a stylistic choice;
it is a lesson that cannot be graded, and the module has no way to present it.

This is the framework's only genuinely checkable structural rule, in either
mode: the two sections are present or they are not.

### `## PROOF` carries the copyright rule

`corpus_proof` is described in `lessons.py` as *a measurement, never a
quotation* — "the one place the script library is allowed to speak, and it
speaks in numbers so that nothing copyrighted is ever reproduced."

That constraint travels with the section. A `## PROOF` section is for a counted
figure, not for an excerpt, and this matters more on the writing page than it
does inside the module: a writer typing a course lesson has the whole corpus in
mind and no field validator standing between them and a quoted page. The guide
copy for this section has to say so, and it is the one place in either mode
where the guide is stating a rule rather than offering a prompt.

### What a course lesson does with runtime

Runtime still means `spoken_words / SPEAKING_WPM`, unchanged — a lesson is read
aloud like any other narration. What changes is that **there is no target to
drift from**. A lesson is as long as the demonstration takes. The `- M:SS`
suffix stays available and stays optional, and the page should not offer a
default one, because a suggested duration on a teaching script is an invitation
to pad or to cut the practice.

### The parser does not know any of this yet

None of the five course sections resolve today. Confirmed against
`videoscript._kind_of`:

```
'## OBJECTIVE'  -> segment
'## CONCEPT'    -> segment
'## PROOF'      -> segment
'## EXERCISE'   -> segment
'## CHECK'      -> segment
```

They fall through to `segment`, which is the safe failure — the text is kept and
nothing breaks — but the rail would label a whole course lesson as five
undifferentiated body segments, and the mandatory-sections check above could not
run at all.

This is the **same fix** as the `## CALL TO ACTION` synonym problem in the open
questions: `SECTION_KINDS` is a flat tuple with no notion of which mode a
project is in. Both modes want it to become mode-aware, keyed off the project's
`video_category`, so that `## HOOK` means something in an essay and `## CHECK`
means something in a course without either vocabulary leaking into the other.
That is one change, not two, and it is the first thing to build.

### Whose courses: creators selling their own (decided 2026-09-16)

`VIDEO_CATEGORIES` is currently `("essay", "tutorial", "documentary",
"commentary", "vlog")`. `tutorial` is the nearest thing and it is **not** the
same shape, because a tutorial is watched and a course is practised — that is
the whole distinction `## EXERCISE` and `## CHECK` exist to hold.

So `course` becomes a **sixth category**, and this is a product feature rather
than internal tooling: a Nepali creator scripting a course they intend to sell.
Authoring Baakhapaa's own 19 lessons on the same surface is a possible later
consumer of the identical grammar and is explicitly not being built for now —
the section names match `lessons.py`'s fields so that it stays possible, at no
cost today.

One consequence worth stating because it is easy to miss: this puts the format
in front of a writer whose output is a **paid product of their own**. Two
existing rules sharpen under that. `## PROOF` must be a measurement and not a
quotation, because a creator selling a course has a commercial motive to quote
material this product must never help them reproduce. And the framework's
"describe, never accuse" rule matters more, not less — telling someone their
saleable work is wrong, on a convention borrowed from YouTube, is a worse error
here than on a draft nobody is paying for.

### The change this implies, concretely

The first buildable piece, and a prerequisite for the left rail rather than part
of it:

1. `models.VIDEO_CATEGORIES` gains `"course"`. It is validated by
   `_video_category`, so nothing else has to change to accept it.
2. `videoscript.SECTION_KINDS` becomes **mode-aware** — one vocabulary for
   `essay`/`tutorial`/`documentary`/`commentary`/`vlog`, another for `course`,
   selected by the project's `video_category`. `_kind_of` takes the category and
   still falls through to `segment` for anything unrecognised, so a writer
   inventing a heading is still writing rather than erring.
3. The essay vocabulary gains the synonyms it should always have had
   (`CALL TO ACTION` → `cta`, `OUTRO` → `cta`, `INTRO` → `promise`), which is
   open question 1 and is the same edit.
4. The only structural check in either mode: a `course` script missing
   `## EXERCISE` or `## CHECK` is reported. Present or absent — no judgement
   about quality, which nothing here can assess.

What it must not do is let one vocabulary leak into the other. `## HOOK` means
something in an essay and nothing in a course; `## CHECK` is the reverse. A flat
tuple that accepted both would quietly re-create the failure this whole document
exists to prevent — a grammar borrowed from the wrong craft.

## Open questions

1. **Mode-aware `SECTION_KINDS`.** One flat tuple serves two grammars today, so
   `## CALL TO ACTION` parses as a segment in an essay and all five course
   sections parse as segments in a lesson. Keying the vocabulary off
   `video_category` fixes both. First thing to build; spelled out above.
2. ~~**Whose courses.**~~ **Settled 2026-09-16: creators selling their own**, as
   a sixth `video_category`. Authoring the in-app lessons on the same surface is
   deliberately deferred, not designed out.
3. **`SPEAKING_WPM_NE`.** Unmeasured. Needs a Nepali narration sample counted
   against a stopwatch — a pilot task, not a code task.
4. **The segment count range.** Three to five is borrowed, not counted. It
   should either be measured against real videos or stated in the UI as
   borrowed.
5. **The course-lesson instrument.** The Outline draws `RetentionShape` for an
   essay. A course lesson needs something else or nothing; drawing the retention
   curve over it would be worse than leaving the panel empty.
