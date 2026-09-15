# Chapter 4 — Screenplay Parsing and Scene Reconciliation

*Deep-dive chapter, Baakhapaa internship report*

---

## 4.1 Problem Statement

Baakhapaa stores a screenplay the way a writer types it: as plain text in a
single editor field. Everything else the product does, however, needs the
screenplay as **structured data** — a list of scenes, each with a location, a
time of day, a cast, a length, and a page number.

Five separate features depend on that structure:

| Feature | What it needs from the structure |
|---|---|
| Scene index / jump-to-scene | Scene headings and their line numbers |
| Corkboard (index cards) | One card per scene, in document order |
| Outline (act balance, runtime) | Scene lengths in pages and minutes |
| Storyboard generation | Location, time of day, cast, action description |
| Export (PDF / Word / Final Draft) | Element types — action vs dialogue vs heading |

The system therefore has to hold **two representations of the same story at
once**:

1. `scripts.content` — the screenplay as typed. The thing the writer edits.
2. `scenes` table rows — structured records. The only thing a storyboard frame
   can attach to, because `storyboard_frames.scene_id` is a foreign key to a
   scene row.

Before this work, nothing connected the two. A `scenes` row was written once,
at the moment a scene was added from the AI structure suggestion, and never
updated again. This produced three defects:

- A writer who typed a screenplay **by hand** had no scene rows at all. The
  editor showed an empty scene index, a dead timeline, and an empty corkboard,
  and "Finalize & Storyboard" led to a page whose only button returned 404.
- A writer who added structure scenes and then rewrote them got a storyboard
  illustrating the **original AI beat description**, not the scene actually on
  the page.
- The editor's index cards were read from the rows, while jump-to-scene counted
  sluglines in the draft. The two drifted apart the moment a slugline moved.

The objective of this module was to make the structured representation a
**faithful, continuously maintained projection of the written page**, without
ever destroying data that another table depends on.

---

## 4.2 Background: Screenplay Format

Screenplay format is a fixed industry convention. A page is 12pt Courier,
single spaced, inside one-inch margins on US Letter. Text is composed of six
classical element types:

```
scene_heading    INT. CHIYA PASAL, PATAN - MORNING
action           Steam rises from glasses of chiya.
character        SANJANA
parenthetical    (not looking up)
dialogue         Timro result aayo?
transition       CUT TO:
```

Three further types were added during the internship, each for a format the
product otherwise could not represent:

```
shot             ANGLE ON THE DOOR          (a camera instruction)
montage          MONTAGE / END OF MONTAGE   (a run of images, not a scene)
act_break        ACT ONE / COLD OPEN / TAG  (television structure)
```

The critical property of the format, from a parser's point of view, is that
**element type is not marked**. There are no tags in the text. A line's type
must be inferred from its shape — capitalisation, punctuation, position, and
what follows it.

---

## 4.3 Design Goals

Four goals were fixed before implementation, in priority order:

1. **One parser, several consumers.** The craft linter, the export layer, the
   statistics panel, and the storyboard generator must all read the script
   through the same code, or they will disagree about what a scene is.
2. **Tolerant of real writing.** Writers indent inconsistently and paste from
   other tools. Classification leans on shape, not on column counts.
3. **Never destructive.** Reconciliation may update and append rows. It may not
   delete them, because a storyboard frame holds a foreign key to a scene id.
4. **Format-extensible.** A second document format (long-form video) had to be
   addable without special-casing the reconciliation logic.

---

## 4.4 Architecture

The subsystem is two modules and four stages.

```
  scripts.content  (plain text)
          |
          v
  +--------------------+
  |  screenplay.py     |
  |                    |
  |  1. parse()        |  line  -> Element(type, text, line_number, character)
  |  2. scenes()       |  lines -> Scene(heading, elements)
  |  3. layout_rows()  |  text  -> printed rows -> page numbers, runtime
  |  4. scene_         |  text  -> [ {heading, location, time_of_day, cast,
  |     summaries()    |             page, minutes, ...} ]
  +--------------------+
          |
          v   list of summaries
  +--------------------+
  |  scene_sync.py     |
  |                    |
  |  5. _match_rows()  |  pair each summary with its existing DB row
  |  6. sync_from_     |  update / insert / mark-removed
  |     draft()        |
  +--------------------+
          |
          v
     scenes table  (structured rows)
```

`sync_from_draft()` runs on **every save**, **on load**, and before every
storyboard generation. Running it on load is what makes a hand-typed screenplay
storyboardable without the writer having to trigger a save first.

---

## 4.5 Stage 1 — Lexical Classification

`parse(text)` walks the draft line by line and assigns each non-blank line one
of the nine element types. Two aspects of this are worth describing in detail,
because both were sources of real defects.

### 4.5.1 The character-cue heuristic

A character cue is an all-caps name on its own line. So is a shouted action
line. The two are lexically identical:

```
SANJANA                  <- a character cue; dialogue follows
THE DOOR SLAMS.          <- an action line; nothing follows
```

Classification therefore uses a **lookahead**: a line is a character cue only
if the following line is non-blank. A shouted action line is followed by a
blank line; a cue is followed by dialogue or a parenthetical. Additional guards
reject candidates longer than 45 characters and candidates ending in sentence
punctuation, with an exception list for `JR.` and `SR.`

### 4.5.2 Test ordering is load-bearing

`shot`, `montage` and `act_break` are all written in capitals on their own
line — exactly the shape of a character cue. They are therefore tested
**before** the cue heuristic. Tested afterwards, each would be classified as a
speaker and would swallow the line beneath it as dialogue:

```
ANGLE ON THE DOOR        -> parsed as a character named "ANGLE ON THE DOOR"
Sanjana enters.          -> parsed as that character's dialogue
```

The same failure applied to television scripts, where `ACT TWO` became a
speaker and the scene heading below it became their dialogue. This illustrates
a general property of shape-based parsers: **the order of the tests is part of
the specification**, not an implementation detail.

### 4.5.3 Dialogue state

Dialogue is not identifiable in isolation — `Timro result aayo?` is just a line
of text. The parser therefore carries two state variables, `in_dialogue` and
`current_speaker`. Both are set by a character cue and cleared by a blank line,
a scene heading, a transition, or any of the three capitalised element types.
This is what lets a dialogue line be attributed to the character who speaks it,
which the `.fdx` export and the per-character voice analysis both require.

---

## 4.6 Stage 2 — Scene Grouping

`scenes(text)` groups the flat element list into `Scene` objects, opening a new
scene at each `scene_heading`.

One edge case required a named construct. Content appearing **before the first
slugline** — a title, a note, a stray paragraph — belongs to no scene. Dropping
it silently would lose the writer's text; attaching it to the first real scene
would misattribute it. It is instead collected into a scene with the reserved
heading `(untitled opening)`, which downstream consumers filter out explicitly.

Naming the case rather than handling it inline is what lets `scene_summaries()`
guarantee that **summary N always corresponds to slugline N** — a
correspondence both the scene index and the storyboard rely on. A stray note
above the first slugline would otherwise shift every scene by one.

---

## 4.7 Stage 3 — Page Geometry

The page is the fundamental unit of this craft: one page of screenplay is
conventionally one minute of screen time, and production scheduling and
budgeting are done in pages. Page numbers therefore have to be correct and,
more importantly, **consistent across the product**.

### 4.7.1 Three definitions became one

At the start of the work, three different definitions of a page existed in the
codebase:

| Consumer | Definition used |
|---|---|
| `statistics` | 55 non-blank lines |
| `review` | its own count of 55 |
| PDF export | 45 lines, blanks included |

All three were reachable from the same screen. The editor could report page 6
while the exported PDF put the same scene on page 7.

These were unified on a single shared constant, `screenplay.PAGE_LINES = 55`,
and a single layout function, `layout_rows()`, through which every page
calculation now passes.

### 4.7.2 The constant itself was wrong

The previous value of 45 was not merely inconsistent, it was incorrect. Nine
inches of text at twelve points per line is 54 lines, and the industry
convention quotes 55. A page defined as 45 lines makes a Baakhapaa page 83% of
a real one, which **inflated every page count and every runtime in the product
by approximately twenty per cent**. A ninety-page screenplay was reported as
108 pages and 108 minutes.

Because act balance, scene runtime, corpus percentile comparison, and the page
indicator beside the caret all derived from the same constant, they were wrong
*together* — which is precisely why none of them appeared wrong. Consistency
concealed the error.

This is the most transferable lesson recorded in this chapter: **a shared
constant makes a system coherent, but coherence is not correctness. A value
relied on everywhere must be verified against an external source, never against
the system's own outputs.**

### 4.7.3 Blank lines count

`layout_rows()` emits a row for every blank line as well as every element,
because a blank line occupies exactly as much of a printed page as a written
one. A screenplay is mostly white space. Measuring only typed lines had
undercounted every runtime in the product by roughly half, which is why the
editor's timeline displayed `0M` for scenes the writer had genuinely written.

Long lines are wrapped to their element's column measure before being counted,
so a scene written as three long unbroken paragraphs is not reported as three
lines of screen time.

---

## 4.8 Stage 4 — Reconciliation

`scene_sync.sync_from_draft(script_id, content)` folds the parser's view of the
draft onto the existing database rows. This is the part of the subsystem with
the most design content, because it must stay correct while the writer
reorders, renames, inserts, and deletes scenes.

### 4.8.1 The matching problem

Given N scene summaries from the page and M existing rows, each summary must be
paired with the row that represents it, if one exists.

Matching on **position alone** fails: inserting a scene in the middle of the
draft re-points every subsequent row at different content. Since storyboard
frames hang off rows, that silently moves a writer's storyboard frames onto the
wrong scenes.

Matching on **slugline alone** also fails: a row that has never been synced has
no stored heading, and repeated sluglines (`INT. OFFICE - DAY` appearing four
times) cannot be disambiguated by heading.

The implemented algorithm is therefore **slugline first, position second, in
two complete passes**:

```
pass 1:  for every summary, claim an unclaimed row whose stored heading
         matches this summary's heading exactly (case-normalised)

pass 2:  for every summary still unpaired, claim the row at its positional
         index, if that row is unclaimed
```

The two-pass structure is essential and was the subject of a specific defect.
Resolving each scene completely before moving to the next — trying heading,
then position, one summary at a time — allows an early positional guess to
claim a row that a **later** scene matches exactly. Every exact match must be
resolved before any positional guess is made.

### 4.8.2 Additive, never destructive

Rows are updated and appended. They are never deleted, because
`storyboard_frames.scene_id` references them, and deleting a row would orphan a
frame the user paid to generate.

This creates a classification problem at the end of the sync: rows with no
counterpart on the page. Two different things arrive there, and they must not
look the same to a reader:

- a **structure scene** that was suggested and added but never written — which
  is legitimately pending, and should still appear in the outline;
- a **ghost** — a scene that was written and has since been cut from the draft,
  which the corkboard would otherwise present as a live scene.

The presence of `draft_json` distinguishes them: it means the row was on the
page at some point. Ghosts are therefore **marked** (`draft_json.removed =
true`) rather than deleted — a non-destructive answer to what is, at bottom, a
bookkeeping problem.

### 4.8.3 Ownership of fields

Sync writes only fields derived from the draft. `title`, `description`,
`act_number`, `scene_type` and `time_allocation` originate from the structure
preview or from the writer, and sync has no authority over them. The draft's
own action text therefore lands in `draft_json.summary` rather than replacing
`description`.

One field required a conditional rule. When a writer renames a slugline, the
scene index should follow the rename — but only if nobody ever named the scene
themselves. A structure-authored title such as *"The confession"* is a
different thing from a slugline and must survive. The test applied is whether
the stored title still equals the heading the row was last synced from:

```python
was_derived = (row.get("title") or "") == (previous.get("heading") or "")
```

Derived titles follow the page; authored titles do not.

### 4.8.4 Write avoidance

Sync runs on every save. An unconditional update would issue one database write
per scene on every save. The computed payload is therefore compared against the
existing row, and the update is skipped when nothing has changed.

---

## 4.9 Format Extensibility

A second document format — long-form video, for 8–25 minute YouTube content —
was added later in the internship. It has no sluglines; it is delimited by
section headers such as `## HOOK - 0:15`.

Rather than branching inside the reconciliation logic, a parser registry was
introduced:

```python
_PARSERS = {"long_form": videoscript}

def parser_for(project_format):
    return _PARSERS.get(project_format or "", screenplay)
```

Both modules expose `scene_summaries(text) -> list[dict]` with identical keys,
which is what lets one sync function serve both formats with no special case.
Outline, corkboard, version history, comments, sharing and review all worked on
the new format untouched.

The default is deliberately the screenplay parser rather than an error: a typo
in a stored format value must not empty a writer's scene index. The same
defensive default appears in `_format_of()`, where a failed database lookup
returns `None` and falls through to the screenplay parser.

---

## 4.10 Testing

The parser is pure — text in, structures out, no I/O — which makes it
straightforwardly testable. `scene_sync` imports the database inside the
function body rather than at module scope specifically so that the matching
logic can be unit-tested without standing up a database.

Cases covered include: character cue versus shouted action line; the three
capitalised element types preceding the cue test; content before the first
slugline; repeated sluglines; a scene inserted mid-draft; a scene renamed; a
scene cut; an authored title preserved across a slugline rename; an empty
draft; and page numbers agreeing between the editor and the PDF export.

The project's backend suite is **907 tests across 55 files**; the frontend suite
is **1113 tests across 58 files**. Continuous integration runs linting, a
dependency audit, both suites, and a production build on every push and pull
request.

---

## 4.11 Results

- A hand-typed screenplay is now fully usable: scene index, corkboard, outline,
  timeline, and storyboard generation all work without the writer having to
  trigger a save first.
- The corkboard's drag-to-reorder moves the scene **in the script**, because
  order is derived from document position rather than stored separately. Any
  other reorder would have been undone by the next save.
- Page numbers are consistent between the editor's gutter, the statistics
  panel, the review module, and the exported PDF.
- Reported page counts and runtimes were corrected by approximately twenty per
  cent against the industry standard.
- Scene runtime is measured off the page, replacing a stored allocation of zero
  that had rendered a nine-scene screenplay as zero width in the timeline.
- A second document format was added with no change to the reconciliation
  logic.

---

## 4.12 Limitations and Future Work

- **Heading matching is exact and case-normalised only.** A writer who changes
  `INT. CHIYA PASAL - DAY` to `INT. CHIYA PASAL - MORNING` falls through to
  positional matching. Fuzzy matching on the location portion would be more
  forgiving, at the cost of new false-positive risk.
- **Ghost rows accumulate.** Marked-removed rows are never collected. A
  long-lived script that has been heavily rewritten will carry rows nothing
  references. A cleanup pass that deletes marked rows with no dependent
  storyboard frame is the obvious next step.
- **Sync is synchronous with save.** On a very long script the reconciliation
  cost is paid inside the save request. Moving it to a background task would
  require the editor to tolerate a briefly stale scene index.
- **Page geometry assumes US Letter and Courier.** A4 is common in the target
  market and would change the lines-per-page constant.

---

## Appendix 4A — Anticipated Examination Questions

**Why not store the structure instead of parsing it out of the text?**
Structure held beside the text cannot survive export, cannot be diffed by
version history, and drifts apart from the text on the first edit. Deriving it
means the page is always the single source of truth.

**Why is the character-cue test not simply "all capitals"?**
Because a shouted action line is also all capitals. The distinguishing feature
is what follows it: a cue is followed by dialogue, an action line by a blank.

**Why must `ANGLE ON` be tested before the character cue?**
It is an all-caps line followed by a non-blank line, so it satisfies the cue
heuristic. Tested later, it becomes a speaker and captures the next line as its
dialogue.

**Why are rows never deleted?**
`storyboard_frames.scene_id` is a foreign key to `scenes.id`. Deleting a scene
row would orphan generated storyboard frames. Removed scenes are marked instead.

**Why two passes in the matching algorithm rather than one?**
A single pass lets an early scene's positional guess claim a row that a later
scene matches exactly by heading. All exact matches must be resolved first.

**How do you know 55 is the right number of lines per page?**
It is derived, not assumed: nine inches of text at 12pt gives 54 lines, and the
industry convention is 55. The previous value of 45 had inflated every runtime
in the product by about twenty per cent.

**What is the time complexity of reconciliation?**
Parsing is linear in the number of lines. Matching is linear in the number of
scenes, because the heading pass uses a dictionary index built in a single pass
over the rows. The dominant cost in practice is database writes, which are
avoided when the computed payload is unchanged.
