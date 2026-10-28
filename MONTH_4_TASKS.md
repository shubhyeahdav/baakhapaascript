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
- [x] Review Task 6 — it is committed and unreviewed, and came back at 249 lines against ~110 planned — *reviewed 2026-10-28 (now 106 lines). One defect: Enter with the caret INSIDE a cue — where Tab leaves it — split `[B-ROLL: city|]` into two narration lines. Fixed in `videoKeymap.js`; the two new tests fail without the fix*
- [x] Cross-check the JS parser against `videoscript.py` on the same input — *`1f2b345`: `export_parser_contract.py` + `videoFormat.contract.test.js`*
- [x] `videoKeymap.js` — the second factory the keymap header asks for — *`cea8cdb`*
- [x] Choose the handler by format at the single call site — *`cea8cdb`, with three tests on the switch itself*
- [x] Confirm no column arithmetic survives in the video path — *a test asserts no inserted text ever begins with a space, across every key and line type*
- [x] Tab cycles narration → `[B-ROLL: ]` → `[ON SCREEN: ]`, caret inside the bracket
- [x] Enter after a heading leaves a blank line; inside a cue, closes it — *the "inside a cue" half only became true with the fix above*
- [x] Run the screenplay keymap tests as the regression gate — *whole frontend suite, 1530 passing*
- [x] Commit

### Day 3 · Completions and the scaffold

- [x] Video completions in `FormatShortcuts` — `## HOOK` … `## CTA` — *`4824b78`*
- [x] Course completions — `## OBJECTIVE` … `## CHECK`
- [x] Keep the two vocabularies from leaking into each other — *`## H` in course mode offers nothing; tested*
- [x] `[B-ROLL: ` and `[ON SCREEN: ` complete in both modes
- [x] `videoScaffold.js` — essay spine expanded from the project's runtime
- [x] Course scaffold — five sections, no durations, ever
- [x] Hang the scaffold off `PenPrompt`, which already shows only on an empty draft
- [x] Thread `duration` and `videoCategory` to the prompt
- [x] Test the essay targets sum to the runtime chosen — *twelve runtimes*
- [x] Commit

### Day 4 · The in-section layer

- [x] `sectionAt` wired to the caret — *`9fa043d`; `caretLine` had been frozen at 0*
- [x] Pacing readout in the status line — section name, written, target — *`SectionPacing`*
- [x] No target shown in course mode, because there is none to drift from
- [x] Nothing warns, badges or blocks when a section runs long — *a test renders triple the target and asserts identical markup*
- [x] `section_kind` on the recommendations request
- [x] Seed retrieval from the caret's section rather than a typed complaint
- [x] Guide copy per section kind — *`sectionGuide.js`*
- [x] `## PROOF` states the rule — a measurement, never a quotation
- [x] Run the retrieval eval; confirm both floors still clear — *91.3% combined / 90.0% screenplay, recorded in `9fa043d`. Not re-run on 2026-10-28: the cloud box cannot download the embedding model*
- [x] Commit

### Day 5 · The page

- [x] `.video-page` — proportional type, prose measure, same paper — *`1dee6c9`*
- [x] Apply it only when the format is `long_form`
- [x] Verify the typewriter band against wrapped proportional text, in a browser — *`typewriter-band-check.mjs`, re-run 2026-10-28: 0.0 lines out on the video page, where counting newlines would be 6.1*
- [x] Suppress the retention overlay in course mode
- [x] Keep the section list visible without it — *`OutlineView.test.jsx`*
- [x] Add a video-page case to `page-layout-check.mjs` — *it measured the letter "x" in the system fallback and read 52 characters, failing on Linux. Now measured in Mukta on a sentence of narration: 71 characters, inside 66-75*
- [x] Run the contrast check
- [x] Run both suites and the production build
- [x] Recount the documentation numbers with `check_docs.py`
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
- [x] Decide: fold into Baakhapaa's `short_form`, or keep standalone — *folded in: `rhythm.py`, `outlier.py`; moving them found two Nepali defects (matras split words; the danda ended no sentence)*
- [x] Write that decision down with its reason — *`docs/SHORTS_RESEARCH.md`*

### Day 7 · The rhythm meter in the editor

- [x] Expose `measure_draft` through an endpoint, or compute client-side — *endpoint: `POST /scripts/rhythm`*
- [x] Decide which, on the same one-source-of-truth rule as the speaking rate — *server: one implementation needs no contract test*
- [x] Render sigma and the monotone run in the short-form editor — *`RhythmMeter`*
- [x] Report, never judge — no score, no colour that implies failure — *a test bans verdict words and percentages*
- [x] Show the run's location, not only its length — *by line; click jumps there*
- [x] Update live as the writer types, debounced — *900 ms; a stale answer never overwrites a newer draft*
- [x] Test that an empty draft renders nothing rather than zeros
- [x] Test that one sentence shows no rhythm rather than perfect monotony
- [x] Check it on a phone-width viewport — *375px, demo backend: no horizontal scroll. The walk also found that opening the editor by PROJECT id loaded a script with no project, so every format feature was off and the title read "Untitled"; fixed and pinned*
- [x] Commit

### Day 8 · The beat spine, reworked

- [x] Read `SHORT_FORM_BEATS` — one hook at second zero, then a linear body
- [x] Add rehook points so an attention device lands every 5–8 seconds — *`rehook_points`: every gap in 5-8s on runtimes 20s-3min*
- [x] Keep it deterministic — grammar, not generation, no AI call
- [x] Preserve the existing hook types; add nothing unproven — *ticks, not beats; the beat list is unchanged and tested so*
- [x] A rehook check: a short whose only device is at 0s is reported — *`rhythm.observations`*
- [x] Phrase it as an observation, like every other finding
- [x] Test the beats still sum to the runtime asked for
- [x] Test the check is silent on a short that already rehooks
- [x] Update `ShortFormTimeline` to draw the new beats — *gold ticks on the bar*
- [x] Commit

### Day 9 · Paste an outlier

- [x] Accept a pasted video URL in the short-form editor — *kept as platform + id only*
- [x] Decide the measurement source — pasted transcript, or a vendor later — *pasted transcript; written in `docs/SHORTS_RESEARCH.md`*
- [x] Measure it with `measure.py` — *now `outlier.py`*
- [x] Show the outlier's numbers beside the draft's — *"yours" beside spread and first turn*
- [x] Store numbers only; a test proves no text is kept — *`test_shorts.py` reads the stored rows*
- [x] Handle a failed measurement without losing the draft
- [x] Say when a measurement is missing rather than showing a zero
- [x] Test the record shape is identical when measurement fails
- [x] Check the comparison reads clearly at 375px
- [x] Commit

### Day 10 · The loop that compounds

- [x] A place for the creator to enter views and retention after posting — *"Log how it did"*
- [x] Store it against the draft that produced it — *the draft's hook shape at logging time, as numbers*
- [x] Correlate hook shape against result — *two splits, median outlier ratio*
- [x] Attach the sample size to every correlation, always
- [x] Say nothing at all below a sample that means nothing
- [x] Decide that floor deliberately and write the number down — *five a side; `shorts.MIN_PER_GROUP` and the research doc*
- [x] Test that a single data point produces no claim
- [x] Test that the sample size is never omitted
- [x] Draw it where the writer already looks, not in a new tab — *under the rhythm meter*
- [x] Commit

---

## Week 15 — Nepali, the course, and the craft

### Day 11 · The language toggle

- [x] `LanguageToggle` is mounted on login and register only — a signed-in writer cannot switch — *half true by 2026-10-28: `TopNav`'s dropdown had a hand-copied switch (the drift `LanguageToggle` exists to prevent), and the EDITOR, which has no dropdown, had none at all. Both fixed*
- [x] Put it in the account dropdown — *`TopNav` now mounts `LanguageToggle`; the editor gets "Interface: English / नेपाली" in View and ⋯, apart from the Typing switch*
- [x] Confirm the preference persists, as `baakhapaa:lang` already does — *existing test*
- [x] Confirm the course re-fetches on change — `LearnPage` already depends on `lang` — *now pinned by a test*
- [x] Check every nav label has a Nepali string — *every `t()` key in TopNav and EditorHeader checked by script: none missing*
- [x] Check the editor toolbar does — *it did not: the whole toolbar was hard-coded English, as were the rail's view tabs and the panel's four tabs. All through `t()` now*
- [x] Test the toggle changes what the course returns
- [x] Test an unknown stored language falls back rather than blanking
- [x] Check both languages at 375px — *and 1280, dashboard / both editors / course. Nepali at 375 pushed Finalize 8px off the video editor; Back is now an arrow below `sm`*
- [x] Commit

### Day 12 · Finish the course's Nepali

- [x] `lessons_ne.py` carries no `group` field — the section headers render English — *the headers are the lessons' `module` names; `lessons_ne.MODULES_NE` now translates all four, applied in `public_lesson`*
- [x] Translate the three group headers — *four: पाना, दृश्य, पूरा गर्ने, कथा. The Guide panel's five group headers too; the guides under them are still English, and that is written down as open*
- [x] `FROM THE CORPUS`, `EXERCISE`, `CHECK MY WORK` are hardcoded in `LearnPage` — *as were "Passed.", "Not yet.", the no-penalty note, the placeholder, "Next" and the label*
- [x] Move them into `strings.js`
- [x] Confirm the per-field fallback still works for an untranslated lesson — *tested, module included*
- [x] Walk all nineteen lessons in Nepali — *every field and module header Devanagari, against the running server, plus a failing and a starter submission each: clean*
- [x] Walk all nineteen in English — *clean*
- [x] Test a lesson with a missing translation reads correctly
- [x] Re-check the grading messages in both languages — *they were English only: a Nepali writer passed in Nepali and failed in English. `lessons_ne.problem_ne` renders all nine linter rules and the four grader templates; a test runs the REAL linter so a reworded rule fails instead of silently falling back*
- [x] Commit

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
- [x] Re-run the layout check — *passes after the Mukta measurement fix (Day 5)*
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

**118 of these 200 are already complete** (counted, not typed). Days 2 to 5 finish a format that is
two-thirds built; Week 14 is the only genuinely new product surface.
