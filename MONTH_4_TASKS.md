# Month 4 — feature work

**Baakhapaa** · Weeks 13 to 16 · 20 days, 10 tasks each

Building only. Purchases, merchant applications, the lawyer and the pilot are
deliberately absent — not because they stopped mattering, but because none of
them is work that can be done at a keyboard, and a plan that mixes the two
reports a blocked month as a failed one.

`[x]` is done. Where a task was completed before this plan was written, the
commit or the measurement is named, because a tick with nothing behind it is
the thing `check_docs.py` exists to prevent.

---

## Week 13 — Finish the long-form format

### Day 1 · The format's backend

- [x] Mode-aware section kinds — essay and course vocabularies, per project
- [x] Synonyms per mode, so `## OUTRO` means CTA in an essay and nothing in a course
- [x] Bind the project's category to the parser without widening the shared interface
- [x] Wire the category through all six `sync_from_draft` call sites
- [x] `course` as a sixth video category, validator intact
- [x] Mandatory-section finding — a course script with no `## EXERCISE` or `## CHECK`
- [x] Wire that finding into the review orchestrator, double-gated
- [x] Speaking rate sent to the client, one source of truth
- [x] `wpm_for` extracted so the payload and `runtime_seconds` cannot disagree
- [x] Thread the project language into `check_total_runtime`

### Day 2 · The video grammar

- [x] `videoFormat.js` — element detection, Enter, Tab cycle, `sectionAt`
- [ ] Review Task 6 — it is committed and unreviewed, and came back at 249 lines against ~110 planned
- [ ] Cross-check the JS parser against `videoscript.py` on the same input
- [ ] `videoKeymap.js` — the second factory the keymap header asks for
- [ ] Choose the handler by format at the single call site
- [ ] Confirm no column arithmetic survives in the video path
- [ ] Tab cycles narration → `[B-ROLL: ]` → `[ON SCREEN: ]`, caret inside the bracket
- [ ] Enter after a heading leaves a blank line; inside a cue, closes it
- [ ] Run the screenplay keymap tests as the regression gate
- [ ] Commit

### Day 3 · Completions and the scaffold

- [ ] Video completions in `FormatShortcuts` — `## HOOK` … `## CTA`
- [ ] Course completions — `## OBJECTIVE` … `## CHECK`
- [ ] Keep the two vocabularies from leaking into each other
- [ ] `[B-ROLL: ` and `[ON SCREEN: ` complete in both modes
- [ ] `videoScaffold.js` — essay spine expanded from the project's runtime
- [ ] Course scaffold — five sections, no durations, ever
- [ ] Hang the scaffold off `PenPrompt`, which already shows only on an empty draft
- [ ] Thread `duration` and `videoCategory` to the prompt
- [ ] Test the essay targets sum to the runtime chosen
- [ ] Commit

### Day 4 · The in-section layer

- [ ] `sectionAt` wired to the caret
- [ ] Pacing readout in the status line — section name, written, target
- [ ] No target shown in course mode, because there is none to drift from
- [ ] Nothing warns, badges or blocks when a section runs long
- [ ] `section_kind` on the recommendations request
- [ ] Seed retrieval from the caret's section rather than a typed complaint
- [ ] Guide copy per section kind
- [ ] `## PROOF` states the rule — a measurement, never a quotation
- [ ] Run the retrieval eval; confirm both floors still clear
- [ ] Commit

### Day 5 · The page

- [ ] `.video-page` — proportional type, prose measure, same paper
- [ ] Apply it only when the format is `long_form`
- [ ] Verify the typewriter band against wrapped proportional text, in a browser
- [ ] Suppress the retention overlay in course mode
- [ ] Keep the section list visible without it
- [ ] Add a video-page case to `page-layout-check.mjs`
- [ ] Run the contrast check
- [ ] Run both suites and the production build
- [ ] Recount the documentation numbers with `check_docs.py`
- [ ] Merge the branch

---

## Week 14 — The scripting system

### Day 6 · What is already built

- [x] `measure.py` — hook close, first rehook, delivery speed, front-load
- [x] Outlier ratio against the channel's own median, never raw views
- [x] A test that two million views on a two-million channel scores 1.0
- [x] `draft.py` — rhythm on untimed text a writer is still typing
- [x] `longest_monotone_run` — where the rhythm is flat, not just that it is
- [x] A test that no output key may be a verdict
- [x] A test that no transcript word reaches a record
- [x] `RESEARCH.md` — how the competitors work and where they stop
- [ ] Decide: fold into Baakhapaa's `short_form`, or keep standalone
- [ ] Write that decision down with its reason

### Day 7 · The rhythm meter in the editor

- [ ] Expose `measure_draft` through an endpoint, or compute client-side
- [ ] Decide which, on the same one-source-of-truth rule as the speaking rate
- [ ] Render sigma and the monotone run in the short-form editor
- [ ] Report, never judge — no score, no colour that implies failure
- [ ] Show the run's location, not only its length
- [ ] Update live as the writer types, debounced
- [ ] Test that an empty draft renders nothing rather than zeros
- [ ] Test that one sentence shows no rhythm rather than perfect monotony
- [ ] Check it on a phone-width viewport
- [ ] Commit

### Day 8 · The beat spine, reworked

- [ ] Read `SHORT_FORM_BEATS` — one hook at second zero, then a linear body
- [ ] Add rehook points so an attention device lands every 5–8 seconds
- [ ] Keep it deterministic — grammar, not generation, no AI call
- [ ] Preserve the existing hook types; add nothing unproven
- [ ] A rehook check: a short whose only device is at 0s is reported
- [ ] Phrase it as an observation, like every other finding
- [ ] Test the beats still sum to the runtime asked for
- [ ] Test the check is silent on a short that already rehooks
- [ ] Update `ShortFormTimeline` to draw the new beats
- [ ] Commit

### Day 9 · Paste an outlier

- [ ] Accept a pasted video URL in the short-form editor
- [ ] Decide the measurement source — pasted transcript, or a vendor later
- [ ] Measure it with `measure.py`
- [ ] Show the outlier's numbers beside the draft's
- [ ] Store numbers only; a test proves no text is kept
- [ ] Handle a failed measurement without losing the draft
- [ ] Say when a measurement is missing rather than showing a zero
- [ ] Test the record shape is identical when measurement fails
- [ ] Check the comparison reads clearly at 375px
- [ ] Commit

### Day 10 · The loop that compounds

- [ ] A place for the creator to enter views and retention after posting
- [ ] Store it against the draft that produced it
- [ ] Correlate hook shape against result
- [ ] Attach the sample size to every correlation, always
- [ ] Say nothing at all below a sample that means nothing
- [ ] Decide that floor deliberately and write the number down
- [ ] Test that a single data point produces no claim
- [ ] Test that the sample size is never omitted
- [ ] Draw it where the writer already looks, not in a new tab
- [ ] Commit

---

## Week 15 — Nepali, the course, and the craft

### Day 11 · The language toggle

- [ ] `LanguageToggle` is mounted on login and register only — a signed-in writer cannot switch
- [ ] Put it in the account dropdown
- [ ] Confirm the preference persists, as `baakhapaa:lang` already does
- [ ] Confirm the course re-fetches on change — `LearnPage` already depends on `lang`
- [ ] Check every nav label has a Nepali string
- [ ] Check the editor toolbar does
- [ ] Test the toggle changes what the course returns
- [ ] Test an unknown stored language falls back rather than blanking
- [ ] Check both languages at 375px
- [ ] Commit

### Day 12 · Finish the course's Nepali

- [ ] `lessons_ne.py` carries no `group` field — the section headers render English
- [ ] Translate the three group headers
- [ ] `FROM THE CORPUS`, `EXERCISE`, `CHECK MY WORK` are hardcoded in `LearnPage`
- [ ] Move them into `strings.js`
- [ ] Confirm the per-field fallback still works for an untranslated lesson
- [ ] Walk all nineteen lessons in Nepali
- [ ] Walk all nineteen in English
- [ ] Test a lesson with a missing translation reads correctly
- [ ] Re-check the grading messages in both languages
- [ ] Commit

### Day 13 · The on-the-nose rule

- [ ] `linter.py:64` is a fixed phrase list — it misses a character stating their feelings plainly
- [ ] Collect the misses from a real draft rather than inventing them
- [ ] Decide whether to widen the list or accept the gap as the paid tier's job
- [ ] Write that decision down either way
- [ ] If widening: add Nepali and romanised forms together, never English alone
- [ ] Re-run the craft linter tests
- [ ] Confirm no existing finding changed severity
- [ ] Check the flags still group by craft level
- [ ] Measure how many flags a real draft now produces — a linter that flags everything gets switched off
- [ ] Commit

### Day 14 · The structure rail

- [ ] `SceneRail.scenePage()` computes a page number for a video section, which `videoscript` deliberately returns as null
- [ ] Stop fabricating it
- [ ] Draw section kind where a scene shows its page
- [ ] Show target against written per section
- [ ] Keep the rail silent in course mode about durations
- [ ] Test a section card carries no page number
- [ ] Test a scene card still does
- [ ] Check the rail at 375px in all four views
- [ ] Re-run the responsive audit
- [ ] Commit

### Day 15 · Craft and corpus

- [ ] Add the rehook craft entry to `knowledge_base.json` — original prose, as every entry is
- [ ] Add the rhythm entry
- [ ] Mark both `('video',)` so they stay out of screenplay results
- [ ] Reload the corpus and confirm 47 rows
- [ ] Re-run the retrieval eval
- [ ] Confirm screenplay p@1 is unchanged — that property is the whole point of the one-way exclusion
- [ ] Add the new queries to the golden set
- [ ] Confirm both CI floors still clear
- [ ] Record the before and after in the commit
- [ ] Commit

---

## Week 16 — The page a stranger sees

### Day 16 · The landing page

- [x] `/` redirects to `/dashboard`, which bounces to `/login` — a stranger meets a password field — *`/` is now `LandingPage`; `App.test.jsx` pins that it is public and no longer a redirect*
- [x] Build a real page at `/` — *`src/pages/LandingPage.jsx`*
- [x] One claim above the fold, and the proof directly under it — *the h1, and beside it the linter's real output on a Devanagari scene; `tests/test_landing_hero.py` lints the same scene and fails if the page and the linter disagree*
- [x] Use a number you can defend — 91.3% retrieval, nineteen free lessons, a linter that reads Nepali — *91.3% / 19 / 0 AI calls, each sourced in a comment; no testimonials, which a test also pins*
- [x] Nepali and English — *every string through `t()`; letter-spaced capitals switched off under `lang=ne` because spacing breaks Devanagari conjuncts*
- [x] Terms and Privacy reachable without opening a menu — *footer*
- [x] One action, repeated — the existing sign-up — *twice, both to `/register`*
- [x] Test the route renders without authentication
- [x] Test a signed-in visitor still lands on the dashboard — *and does not see the page flash past while a stored token is checked*
- [x] Commit

### Day 17 · Make it fast and findable

- [x] Measure the page's first paint on a throttled connection — *884 ms FCP on Slow 4G at 375px, `scripts/landing-check.mjs`, budget 3000 ms, now a CI step*
- [x] Check the static meta tags a non-rendering crawler sees — *prerendered `/` carries its own description, canonical and og tags*
- [x] Confirm the structured data still validates — *`staticFiles.test.js` parses the JSON-LD; unchanged*
- [x] Add the landing page to `prerender.mjs` — *33 → 1,552 crawler-visible characters on `/`. The SPA fallback moved to `app.html`, because Vercel serves `index.html` for `/` before any rewrite*
- [x] Check it at 375px — *and 320 and 768; no horizontal scroll*
- [x] Check it at 1440px — *flags measured beside the page, not on it*
- [x] Run the contrast check over any new colour — *no new palette colour; check passes*
- [ ] Run the responsive audit
- [ ] Re-run the layout check
- [x] Commit

### Day 18 · Close the open defects

- [ ] `runtime_seconds` is annotated `str` but receives `None`
- [ ] `_kind_of` falls back inconsistently on an unknown mode
- [ ] Synonym coverage is partial — course synonyms untested
- [ ] One course gate test cannot fail for the gate it names
- [ ] Triage the deferred-minor list in the SDD ledger
- [ ] Fix what a reviewer would call a defect; write down what you keep
- [ ] Re-run both suites
- [ ] Run `ruff` and `npm run lint`
- [ ] Confirm CI green
- [ ] Commit

### Day 19 · Walk it

- [ ] Take one screenplay from blank page to export, without touching code
- [ ] Take one long-form video from scaffold to export
- [ ] Take one course lesson through the mandatory-section check
- [ ] Take one short through the rhythm meter
- [ ] Write down every confusion, in order, fixing nothing yet
- [ ] Triage into fix-now and write-down
- [ ] Add a test for each fix before fixing it
- [ ] Fix only what stops someone finishing
- [ ] Re-run both suites
- [ ] Commit

### Day 20 · Close the month

- [ ] Recapture the figures with `capture-screenshots.mjs`
- [ ] Check each image shows what its caption claims — the m3 run captured the wrong panel once
- [ ] Re-run the retrieval eval and record the closing number
- [ ] Recount with `check_docs.py`
- [ ] Update CLAUDE.md's Current State
- [ ] Write the Month 4 report against `MONTH_4_PROPOSAL.md`
- [ ] Render it to PDF and verify every figure embedded
- [ ] State plainly what is still built-but-unproven
- [ ] Merge everything to `codebase`
- [ ] Confirm the deployed site matches

---

## Deliberately not here

Purchases, merchant applications, the legal review and the five-writer pilot.
They are in `MONTH_4_PROPOSAL.md`, and they are what decides whether the month
*mattered* — this file only decides whether the building got done.

**19 of these 200 are already complete** (counted, not typed). Days 2 to 5 finish a format that is
two-thirds built; Week 14 is the only genuinely new product surface.
