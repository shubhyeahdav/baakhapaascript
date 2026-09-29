# The long-form writing surface — design

**Status:** design approved 2026-09-29. Not yet implemented.

Supersedes nothing. Builds on `2026-09-14-long-form-video-design.md` (the format
and its parser) and `2026-09-16-long-form-writing-framework.md` (the craft, in
both modes). Those two decided *what a long-form script is*. This one decides
*what happens when someone types one*.

## The gap

`long_form` exists as a stored format and is parsed correctly, but the editor
has never been told about it. `long_form` reaches `OutlineView`, `PenPrompt`,
`NewProject` and `Onboarding` — and **not** `screenplayKeymap.js`,
`FormatShortcuts.jsx`, or the page's typography.

So a video writer typing narration today gets screenplay rules applied to it:
TAB walks the action/character/parenthetical/dialogue indent cycle, an all-caps
line is treated as a character cue and indented to column 22, and Enter follows
`utils/screenplayFormat`. None of that exists in this format. The editor is
enforcing the grammar of a different craft.

`screenplayKeymap.js` already names the fix, in its own header:

> The rules themselves are screenplay rules — the indent cycle is
> action/character/parenthetical/dialogue, and Enter follows
> `utils/screenplayFormat`. **A second format needs a second factory beside this
> one, not a flag inside it.**

## Scope

One coherent writing experience for `long_form`, covering both modes the
framework defines — the **video essay** (purchased attention) and the **course
lesson** (committed attention).

The two modes are built together because they share one mechanism: a mode
switch keyed off `video_category`. Building the essay mode first and the course
mode later means building that switch twice, and the second build would have to
retrofit the first.

Four things change for the writer:

1. Typing rules follow the format
2. The structure is scaffolded rather than typed from memory
3. The section the caret is in drives what the editor shows
4. The page sets as prose

## Decisions taken

| Decision | Taken | Rejected, and why |
|---|---|---|
| Typing rules | A second factory (`videoKeymap.js` + `videoFormat.js`) beside the screenplay pair | A mode flag inside `screenplayKeymap` — rejected by that file's own header, and it would put every screenplay regression one branch away from a video edit |
| Where the structure comes from | A deterministic template expanded from the project's `duration_minutes` | Presets per video type (commits to a taxonomy with nothing behind it); AI-generated structure (billed, non-deterministic, and the free tier could not have it); no scaffold at all (a blank page is the problem the scaffold exists to solve) |
| In-section behaviour | Pacing readout + that section kind's craft entry | Warnings when a section runs long — breaks the product's report-never-block rule, which `review.py`, `benchmark.py` and `RetentionShape` all follow; and a hook running long is sometimes the right call |
| Page typography | Proportional prose on the same paper, one font for the whole textarea | Per-line decoration (headings ruled, cues as pills) — a `<textarea>` takes one font for the element, so this needs CodeMirror or a shadow-div mirror, and `ScriptPage.jsx:178` records that the mirror has gone wrong here twice |
| Course vs essay | One format, two modes, switched on `video_category` | A separate `course` format — duplicates the parser, the sync seam, and every downstream reader, to express a difference that is entirely about section vocabulary and defaults |

### The page: why B-lite and not the drawn mockup

The design was presented as a mockup with ruled headings carrying right-aligned
targets and cues as tinted pills. **A `<textarea>` cannot render that.** It
takes one font, one size, one weight for the whole element; styling individual
lines requires either replacing it or mirroring its text into a shadow div
beneath it, and `ScriptPage.jsx:178` states the cost of the second:

> a textarea has one continuous flow ... The usual alternative — mirroring the
> text into a shadow div — means re-solving wrapping, font metrics and scroll
> sync for a gradient, and this page has been bitten by overlay bugs twice
> already.

What *is* available is changing the font of the whole element. So the page sets
in proportional Mukta at a prose measure on the same cream paper, and section
headings and cues remain the literal text the writer typed. Quieter than the
mockup, real, and it ships without a second editor implementation.

CodeMirror is the correct long-term answer and is explicitly **out of scope
here**. It should be decided on evidence from using this, not from a mockup.

## Architecture

### The mode switch

`video_category` already exists on the project and is already validated.
`course` becomes a sixth value:

```python
VIDEO_CATEGORIES = ("essay", "tutorial", "documentary", "commentary", "vlog", "course")
```

`tutorial` is the nearest existing value and is **not** the same shape: a
tutorial is watched, a course is practised. That distinction is exactly what
`## EXERCISE` and `## CHECK` exist to hold.

`SECTION_KINDS` becomes mode-aware rather than a flat tuple:

```python
SECTION_KINDS_BY_MODE = {
    "essay":  ("hook", "promise", "segment", "payoff", "cta"),
    "course": ("objective", "concept", "proof", "exercise", "check"),
}
```

Every non-course category maps to `essay`. `course` maps to `course`.

This one change also closes the parked synonym problem: `_kind_of` matches the
**first word only**, so `## CALL TO ACTION` and `## OUTRO` both parse as
`segment` today. Synonyms are declared per mode alongside the kinds, so
`## OUTRO` resolves to `cta` in an essay without leaking that vocabulary into a
course.

**Unknown headings still resolve to `segment`.** A writer inventing their own
section name is writing, not erring — that rule is unchanged and applies in
both modes.

### Course mode differs in four places, and only four

1. **Section vocabulary** — the five names above.
2. **No target durations.** The scaffold writes `## OBJECTIVE` with no `- M:SS`
   suffix. The framework's reason: a lesson is as long as the demonstration
   takes, and a suggested duration on a teaching script is an invitation to pad
   or to cut the practice. The suffix stays *available*; it is never *offered*.
3. **No retention shape.** `ATTENTION_MARKS` is a convention drawn from
   purchased attention. A learner has already enrolled and will not bounce at
   0:30. Drawing that curve over a lesson is a convention borrowed from the
   wrong format, which is worse than no instrument at all. The Outline shows the
   section list without the overlay.
4. **Two sections are mandatory.** `## EXERCISE` and `## CHECK` are present or
   they are not. This is the only genuinely checkable structural rule in either
   mode, and it comes from `lessons.py`'s own design rule: every lesson ends
   with the user writing something the app can immediately respond to.

Everything else — parsing, sync, runtime, versions, comments, sharing, export —
is identical between the modes and untouched by this work.

### Why the course section names match `lessons.py`

The five names are the field names the courses module already reads:

| `lessons.py` field | Section |
|---|---|
| `title` / `technique` | `## OBJECTIVE` |
| `concept` | `## CONCEPT` |
| `corpus_proof` | `## PROOF` |
| `exercise` + `starter` | `## EXERCISE` |
| `check` | `## CHECK` |

This is the `scene_sync` argument again: a script written in a parallel
vocabulary and mapped onto lessons afterwards drifts from them on the first
edit. Matching the names costs nothing today and keeps it possible later to
author Baakhapaa's own 19 lessons on this surface. **That is not being built
now.**

### `## PROOF` carries the copyright rule

`corpus_proof` is described in `lessons.py` as *a measurement, never a
quotation*. On the writing page there is no field validator between a writer and
a pasted page, and the audience for course mode is a creator scripting something
they intend to **sell** — which is a commercial motive to quote material this
product must never help reproduce.

So the guide copy for `## PROOF` states the rule rather than offering a prompt.
It is the only place in either mode where the guide is prescriptive.

### New frontend modules

```
src/utils/videoFormat.js    enterText(), tabCycle(), sectionAt(), element detection
src/editor/videoKeymap.js   createVideoKeyHandler()
src/lib/videoScaffold.js    scaffold(durationMinutes, mode) -> string
```

Parallel to `screenplayFormat.js` / `screenplayKeymap.js`, same shape, no shared
branches. `ScriptEditor.jsx:1290` is the single call site that chooses:

```js
const makeHandler = format === "long_form"
  ? createVideoKeyHandler
  : createScreenplayKeyHandler;
```

The screenplay path is untouched, so its tests keep meaning what they meant.

### Typing rules in video mode

- **TAB** cycles `narration → [B-ROLL: ] → [ON SCREEN: ]`, caret placed inside
  the bracket. These are three of the four element types `videoscript.py`
  already parses; the fourth is the section heading, which TAB does not produce.
- **Enter** after a section heading leaves a blank line and returns to
  narration. Enter inside a cue closes the bracket and returns to narration.
- **No column arithmetic anywhere.** No 22-space cue column, no 10-space
  dialogue indent. That absence is the fix, not an omission.

`FormatShortcuts.jsx` takes the same switch: `## HOOK`, `## PROMISE`,
`## SEGMENT`, `## PAYOFF`, `## CTA` in essay mode; `## OBJECTIVE`, `## CONCEPT`,
`## PROOF`, `## EXERCISE`, `## CHECK` in course mode; `[B-ROLL: ` and
`[ON SCREEN: ` in both.

### The scaffold, and where it lives

`scaffold(durationMinutes, mode)` is pure and deterministic.

**Essay mode** — hook, promise, payoff and CTA take fixed absolute targets; the
remainder divides into segments. A 12-minute video gets four segments, a
25-minute one more.

**Course mode** — the five course sections, no targets, in order.

It hangs off `PenPrompt`, which already exists for exactly this: it shows only
on an empty draft, never in focus mode, and its `long_form` entry currently
inserts the single line `## HOOK - 0:15`. That becomes the full scaffold. No new
surface, and the "never interrupt a writer who is already writing" rule comes
for free. `PenPrompt` needs `duration` and `videoCategory` alongside the
`format` it already receives.

### The in-section layer

`sectionAt(content, caretLine)` returns the section's kind, name, target and
written runtime.

**Runtime has one source of truth.** Written runtime is words ÷ speaking rate,
and the backend owns `SPEAKING_WPM_EN` / `SPEAKING_WPM_NE`. Copying that
constant into the client gives two numbers that will drift. Instead the script
payload exposes the rate and the client computes from it — one source, a live
number, and no lag waiting for autosave.

The readout lands in the status line `ScriptPage` already renders. In course
mode it shows the section name and written runtime with **no target**, because
there is none to drift from.

Section craft: `POST /scripts/recommendations` takes an optional `section_kind`.
When present on a `long_form` project, retrieval seeds from that kind instead of
a typed complaint, through the `craft_for_format` filter already at
`scripts.py:385`. Zero AI cost, works offline.

### The page

A `.video-page` variant beside `.screenplay-page` in `index.css`: proportional
Mukta, ~46ch measure, looser leading, the same cream and dark paper tokens.
`ScriptPage` applies it when the format is `long_form`.

**One risk to verify rather than assume:** the typewriter focus band computes
`--focus-y` from `padTop + line * lineHeight - scrollTop`. Line height stays
uniform under a proportional font, but wrapping changes, so the visual-line
count shifts. The band must be checked against a wrapped video draft in a
browser, not reasoned about.

## Error handling

- **A malformed or empty draft** parses to zero sections. `sectionAt` returns
  null and the status line shows nothing rather than a zeroed readout — the same
  rule the Corkboard follows for an unparseable `draft_json`.
- **A caret before the first heading** sits in `UNTITLED_SECTION`, which the
  parser already produces. The readout names it and shows no target.
- **An unknown `video_category`** (a value written before this change, or by a
  future one) falls back to essay mode. A stored value nobody recognises is far
  more likely to be an essay than a course.
- **The scaffold never overwrites.** `PenPrompt` renders only on an empty draft,
  so there is no path where it can replace written work.
- **A missing speaking rate in the payload** falls back to the conventional
  English figure, and the readout is shown regardless. A missing number must not
  remove the status line a writer is relying on for save state.

## Testing

| What | How |
|---|---|
| `videoFormat` — TAB cycle, Enter after a heading, cue closing | Unit, mirroring `screenplayFormat.test.js` |
| `videoScaffold` — proportions at 8 and 25 minutes; course mode emits no durations | Unit |
| `sectionAt` — caret in each section, before the first, in an empty draft | Unit |
| Handler selection — `long_form` gets the video handler, every other format the screenplay one | Unit |
| Mode-aware `SECTION_KINDS` — essay and course vocabularies do not leak; unknown headings still resolve to `segment`; `## OUTRO` resolves to `cta` in essay mode only | Backend unit |
| Mandatory sections — a course draft missing `## EXERCISE` or `## CHECK` is reported | Backend unit |
| `course` category accepted, and rejected values still rejected | Backend unit |
| The page's geometry and measure | `page-layout-check.mjs` — no test in this repo can see a layout, `vite.config.js` sets `css: false` |
| The typewriter band against wrapped proportional text | Browser, by hand — this is the risk named above |

## Explicitly not in scope

- **CodeMirror**, and per-line typography of any kind.
- **Presets by video type.** The taxonomy has no evidence behind it yet.
- **AI-generated structure.** Billed, non-deterministic, and unavailable to the
  free tier.
- **Any warning or block** when a section runs over, in either mode.
- **The structure rail.** The status line carries pacing for now; the rail can
  be decided on evidence from using this.
- **Authoring Baakhapaa's own 19 lessons on this surface.** The section names
  make it possible later, at no cost today.
- **A course-specific Outline instrument.** Course mode suppresses the retention
  overlay; what should replace it is not designed here and the section list
  alone is honest in the meantime.
