# Long-form video as a fourth format — design

**Status:** phases 1-2 implemented 2026-09-14 — the format exists and the
page parses. Phases 3 (the retention instrument) and 4 (the craft layer)
are NOT built and each needs its own plan.

## The gap

`PROJECT_FORMATS` is `("short_form", "short", "film", "web_series")`. `short_form`
is vertical social video measured in seconds and capped at `MAX_DURATION_SECONDS
= 180`; everything else is narrative screenwriting measured in pages. So there is
reels at one end and film at the other, and **nothing for a twelve-minute YouTube
piece**, which is neither.

A writer with a video essay today has two bad options: force it through a
three-act screenplay built for drama, or call it a 180-second reel and lie about
the length. Both make the tool feel wrong for work its users actually do.

## What is being built

A fourth format, `long_form`: a standalone project type for 8–25 minute YouTube
content — video essay, tutorial, documentary, commentary, vlog — written
section-first, with a retention instrument and format-aware craft guidance.

## Decisions taken, and what was rejected

| Decision | Taken | Rejected, and why |
|---|---|---|
| What the writer produces | A standalone long-form script type | Repurposing an existing screenplay into social cuts — a different product, and it needs this one to exist first |
| Page shape | Section-first: chapters as the primary unit, each holding narration with a target duration | Two-column A/V (heaviest build, needs a second editor); free narration with inline cues (no structure to show); keeping the screenplay page (forces talking-head through a drama format) |
| Craft guidance | New corpus entries carrying a `format` field, with a retrieval filter | Deterministic checks alone (says nothing about whether the writing is good); reusing the drama corpus unchanged (its `problem` statements are phrased for screenplays, so it would answer a YouTube complaint in film vocabulary) |
| Storage | Sections in the existing `scenes` table, video fields in `draft_json` | A separate `sections` table (clean, but duplicates versions/comments/sharing/export or forces a generalisation refactor first — roughly 3x the build and two editors to keep in step) |
| Visual | One instrument: proportional sections with conventional drop-off bands overlaid | Building the duration timeline and the retention curve as two components — the timeline is the retention shape's substrate, so they are one thing |

## Architecture

### The seam

`scene_sync.sync_from_draft` calls `screenplay.scene_summaries(content)` at
`scene_sync.py:151`. That single call is the switch point. A new module
`videoscript.py` exposes the same interface, and `sync_from_draft` chooses on
`project.format`.

Everything downstream — Outline, Corkboard, version history, comments, sharing,
review, the craft panel — reads `scenes` rows and `draft_json`, so it keeps
working with no changes. That reuse is the whole argument for this approach.

### `videoscript.py`

Parallel to `screenplay.py`, same shape:

```
parse(text)             -> [Element]     section headers, narration, cues
sections(text)          -> [Section]     the structural unit
scene_summaries(text)   -> [dict]        SAME KEY CONTRACT as screenplay's
runtime_seconds(text)   -> float         words / speaking rate, not pages
```

`scene_summaries` keeps the screenplay key contract — `index`, `heading`,
`line_number`, `characters`, `action`, `estimated_minutes`, `line_count` — so
`_match_rows` and the row-matching logic need no special case.

Keys with no meaning for video are returned as `None` rather than faked:
`location`, `time_of_day`, `interior`, and **`page`**. A video script has no
printed pages, and returning 1 for every section would put a wrong number in the
editor's gutter and the scene index. Consumers that read `page` must tolerate
`None`, which is a real change to check rather than assume — it is on the test
list below.

**Section syntax in the draft**, delimited the way sluglines delimit scenes:

```
## HOOK — 0:15
Narration here, ordinary prose.
[B-ROLL: Kathmandu traffic at dawn]
[ON SCREEN: 47%]

## SEGMENT 1 — 3:00
...
```

The structure lives **in the document**, not beside it. That is deliberate: the
alternative — sections as metadata in a side panel — cannot survive export,
cannot be diffed, and drifts from the text on the first edit. It re-creates the
exact bug `scene_sync` was written to fix.

### Runtime

Screenplay runtime is pages: `PAGE_LINES = 55`, one page ≈ one minute. That
convention does not apply to narration read aloud.

Long-form runtime is **words ÷ speaking rate**. The rate is a real constant and
is currently unknown:

- English narration is conventionally ~150 wpm
- Nepali differs, and the product is bilingual (`LANGUAGES` includes `Nepali`
  and `Bilingual`)

**It gets measured, not asserted.** Counted against `docs/samples/` and any
Nepali sample available, per language, and exposed as configuration
(`SPEAKING_WPM_EN`, `SPEAKING_WPM_NE`) with the measurement written into the
docstring. Bracketed cues are excluded from the word count — nobody reads
`[B-ROLL: ...]` aloud, and counting it inflates every estimate.

### Storage, and the overload

Sections are `scenes` rows. Video-specific fields go in `draft_json`, which is
what that column exists for (`suggestions_json`, `bible_json`,
`preferences_json` are the same convention).

**A section is not a scene, and this must be written down rather than hidden.**
`scenes` carries `act_number`, `time_allocation` and INT/EXT, none of which a
section uses. The rule: shared columns are used honestly or left null, and never
repurposed to mean something else. `scene_type` (`major`/`minor`) is left alone —
a section's kind lives in `draft_json.section_kind`.

If sections and scenes later diverge far enough that this hurts, the parser seam
is already the boundary to split on, which is the second reason for this
approach.

## The retention instrument

One component. Sections drawn proportionally across the runtime, coloured by
kind (hook / segment / payoff / CTA), with the conventional attention drop-offs
overlaid as bands.

It answers the most common long-form failure at a glance: a forty-second hook
and a twenty-second payoff.

**It states that the curve is convention.** The drop-off shape is a widely-cited
convention, not something this repository can measure — a writer's own analytics
would be a measurement and this is not. The rule is the one `MilestoneNote`
already follows: it may show and point, it must not assert a fault it cannot
check. A test pins that the component never claims otherwise.

Follows `CompactTimeline`'s existing pattern rather than inventing one.

## Craft

### Corpus

A `format` field on every entry in `knowledge_base.json`, and a matching column
in `script_patterns` (both the mock and `pgvector_script_patterns.sql` — which
has drifted from the loader once already; `tests/test_pattern_schema.py` exists
to catch exactly that).

Existing entries are tagged for narrative formats. New video entries cover the
failures long-form actually has: a hook that takes too long to arrive, the
30–60 second retention dip, open loops left unclosed, a payoff that does not
match the promise, and a CTA that has not been earned.

### The risk, stated plainly

**Retrieval is at 90.0% real-query p@1 and a format filter shrinks the candidate
pool.** That can move the number in either direction and nothing currently would
notice.

Mitigations, all of them measurements rather than intentions:

- Golden-set queries are added **per format**, and `eval_retrieval.py` reports
  and gates per format, not only combined.
- A screenplay query returning video advice, or the reverse, is a test — not a
  hope.
- The existing combined floor (`--min-p1 0.85` in CI) stays; a per-format floor
  is added beside it.

### Video linter

Deterministic, zero AI cost, works on a partial draft — the same contract
`linter.py` already has:

- hook longer than its target
- a section running well over or under its planned duration
- a promise made in the hook with no matching payoff section
- no CTA section

## Out of scope

Deliberately, and each for a reason:

- **Storyboard generation per section** — up to 24 billed images for a
  talking-head piece is expensive and near-useless
- **Two-column A/V export** — the heaviest build here, and useful to a crew
  rather than to the writer this format serves
- **Content calendars and upload tracking** — a different product
- **Repurposing an existing screenplay into social content** — needs this format
  to exist first

**Tier placement stays open.** Built tier-agnostic, so the pricing decision in
`FEATURE_SUGGESTIONS.md` §A remains the owner's call rather than being settled
by implementation.

## How this lands

Too large for one change. Four phases, each shippable and each leaving the
product working:

1. **The format exists.** `long_form` in `PROJECT_FORMATS`, `video_category`,
   the wizard path, `hook_type` reused. A project can be created and opened; it
   writes a plain draft. No parser yet.
2. **The page parses.** `videoscript.py`, the runtime constant measured, the
   `scene_sync` switch. Sections appear in Outline and Corkboard because those
   already read `scenes` rows. **The gate for this phase is that a screenplay
   project is byte-identical to today** — that is what makes the switch safe.
3. **The instrument.** The retention component, reading section durations that
   phase 2 now produces.
4. **The craft layer.** The corpus `format` field, the retrieval filter with
   per-format measurement, the video entries, the video linter. Last on purpose:
   it is the phase that can move the existing 90.0% p@1, and it should land
   against a format that already works rather than alongside one being built.

Phase 1 is worth shipping alone — a writer can keep a long-form project in the
product before any of the craft layer exists.

## Testing

| Area | What is pinned |
|---|---|
| `videoscript` parser | Section delimiting, cue extraction, a draft with no sections, a cue spanning lines, Devanagari narration |
| Runtime | Words-per-minute per language; cues excluded from the count; the measured constant recorded in a docstring |
| `scene_sync` | A `long_form` project parses with `videoscript`; a `short`/`film` project is byte-identical to today — the property that makes this safe to land |
| Storage | Screenplay-only keys are null, not faked; `scene_type` untouched; every consumer of `summary["page"]` tolerates `None` |
| Retrieval | Per-format p@1 in `eval_retrieval.py`; a screenplay query never returns video advice and vice versa; combined floor unmoved |
| Video linter | One test per rule, plus a clean draft producing no findings |
| Retention instrument | Renders from section durations; asserts no unmeasurable claim; hit targets ≥24px; measured for layout out of band, since `vite.config.js` sets `css: false` and no test here can see a layout |

## Open numbers

1. **Speaking rate**, per language. Measured before use.
2. **Per-format retrieval floors** — cannot be set until the format filter is
   built and measured once.
3. **Section spine per `video_category`** — how many segments an essay wants
   versus a tutorial. A convention; a pilot question, not a measurement.
