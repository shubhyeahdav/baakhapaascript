# Handover — 2026-08-19

Supersedes the 2026-08-13 handover, which is now **stale on four items**. If you
read that file, correct it as follows:

| It said | Actually |
|---|---|
| "A1 Devanagari is still the blocker… `assets/` does not exist" | **Closed.** The OFL font is bundled and its test no longer skips |
| "Frontend has zero tests" | **36 tests across 3 files** |
| "35 npm vulnerabilities, not triaged" | **Triaged.** 34 were build toolchain; the one that shipped is fixed |
| "12 files / 120 tests" | **23 files / 364 tests** |

Its §5 (CRA hot-reload websocket) and §6 (NewProject still on the old Sidebar)
are still true.

**Read `ROADMAP.md` for the build queue** — it replaces `PROJECT_PLAN.md` §4 as
the live plan — and `DATA_HANDLING.md` before touching anything that stores or
transmits script text. This file is the narrative of what changed and what will
bite you.

---

## Environment (unchanged — still demo mode)

All `.env` keys are placeholders, so the app runs on local **SQLite**, **mock
Claude**, **mock DALL-E**, **mock Stripe**. Embeddings are real, computed locally
by fastembed with no API key.

```
cd baakhapaa-backend && ./venv/Scripts/python -m uvicorn main:app --port 8000   # no --reload on Windows
cd baakhapaa-frontend && npm start
```

Test login: `test@example.com` / `password` (pro tier), and only while
`DEMO_SEED=true`.

**Every environment variable is now documented in `baakhapaa-backend/.env.example`**
— 25 of them, previously undocumented anywhere. Read it before deploying;
several have defaults that are wrong for production (`CORS_ORIGINS`,
`REQUIRE_SHIPPABLE_FONT`).

`script_patterns` had 29 rows in the local DB throughout this session. If
retrieval returns `[]` it is probably empty again: run
`./venv/Scripts/python load_knowledge_base.py`, then **restart the backend** —
the mock DB caches rows at startup.

---

## What changed this session

Ordered by how much it matters, not chronologically.

### 1. The scene table and the written draft now describe the same story

`scene_sync.py` is new and is the largest structural change. Previously `scenes`
rows were written once, when a structure suggestion was added, and never updated.
Three consequences, all now gone:

- a writer who typed their screenplay by hand had **no scene rows**, so
  "Finalize & Storyboard" led to a page whose only button returned 404
- a rewritten scene was storyboarded from the **beat description it started as**
- the editor's index cards came from rows while jump-to-scene counted sluglines
  in the text, so the two drifted apart as soon as a slugline moved

Rows are matched **by slugline first, position second**, in two passes. Matching
on position alone re-points every later row the moment a scene is inserted
mid-draft — and frames hang off rows, so that silently moves somebody's
storyboard onto the wrong scenes. Rows are updated and appended, **never
deleted**: a frame FKs to a scene id.

### 2. The deliverables were mostly unreachable

Six things existed as working backend code that nothing called:

| FR | Was | Now |
|---|---|---|
| FR13 | Package had no storyboard; the shot list read `Scene 1 \| Wide Shot` | Real shot list (slugline, cast, beat, action, camera) + embedded frames |
| FR08 | `camera_notes` written as `""` on every frame ever generated | Derived per frame; deterministic, no API cost |
| FR09 | Routes shipped with the first storyboard commit, never called | Shot-type override, camera notes, reorder, redraw |
| FR07 | `review_script()` wired to nothing | `review.py` — timing, character names, act balance; shown before finalizing |
| FR11 | Diff route existed; UI only restored | Ordered difflib hunks with line numbers; the old diff was **set-based** and reported a moved line as no change |
| — | No project delete anywhere | Two-step confirm on the dashboard tile |
| — | `.fdx` built free, unreachable | In the editor toolbar and the Exports page |

Every export was also titled "Baakhapaa Script" and downloaded as `script.pdf`,
whatever the project was called.

### 3. FR06 Devanagari — the long-standing blocker is closed

`assets/NotoSansDevanagari-Regular.ttf` (SIL OFL) is bundled, with provenance in
`assets/README.md`. Verified: 128/128 Devanagari codepoints, `FontFile2`
embedded, the bundled face winning over Nirmala, and 44 Devanagari characters
extracted back out of a rendered PDF. `tests/test_font_asset.py` **no longer
skips** — its job flipped from "warn it's missing" to "fail if anyone removes it".

### 4. FR12 roles — `membership.py`

Admin / Editor / Viewer, **per project**, not global: a person is usually a
writer on their own work and a reader on someone else's. The owner is an admin
implicitly, so no data migration was needed.

`require_script_access` / `require_project_access` take a `minimum` that
**defaults to editor**. That direction is deliberate: forgetting to mark a route
costs a viewer a read, never grants a write.

### 5. Privacy — see `DATA_HANDLING.md`

Four real problems, one of which was introduced earlier the same day:

- **Deleting a project did not delete the script.** Postgres cascades; the local
  mock has no relationships, so the full draft and every version snapshot stayed
  on disk — in the mode every developer and every test runs in.
- **No way to delete an account.** `DELETE /auth/me` now erases everything the
  user owns; projects shared *with* them stay theirs.
- **A missing `ANTHROPIC_API_KEY` silently rerouted scripts to Groq.** One fumbled
  key and every draft went to a company the privacy policy does not name. Now
  requires an explicit `LLM_PROVIDER=groq`.
- **SSRF in the package export.** `image_url` was client-writable and fetched
  server-side, so an editor could aim it at cloud metadata or the private
  network. No longer client-writable; private/loopback refused; redirects not
  followed.

Also added: token revocation. JWTs carry a generation number checked per request,
so `POST /auth/sign-out-everywhere` ends every session and a deleted account's
token stops authenticating immediately.

### 6. The story craft layer now reaches the model

The Story Bible collected a logline, a dramatic question, a theme, and per
character a want, a need, a wound and a voice — and **not one field ever reached
a prompt**. `character_names` was accepted by `generate_scene` and never sent by
the editor. The craft library grounded `generate_structure` and then vanished at
exactly the point the writer was writing.

All three are wired. The bible is loaded **server-side from `script_id`**, never
trusted from the client. `improve` grounds diagnosis-first: the linter names
what is wrong, and that technique leads the prompt.

**The craft linter now reads Nepali** — Devanagari and romanised — for
on-the-nose dialogue, emotional parentheticals and greetings. It was English-only
regex in a product that instructs writers to put their dialogue in Nepali, which
left the differentiator silent on exactly the writing it exists for.

Each flag also now carries a **`confidence`** separate from `severity`:
`mechanical` (a camera cannot photograph a realisation), `convention`
(professional consensus), `judgement` (a reading). `on_the_nose` was carrying the
same authority as "this cannot be filmed" while being regex over literal phrases.

### 7. Tooling and CI

- `.github/workflows/ci.yml` — lint, dependency audit, both suites, production
  build. On Linux with `REQUIRE_SHIPPABLE_FONT=true`, which is the **only** place
  the font gate means anything, since this Windows box always has Nirmala.
- `ruff.toml` — a narrow, chosen rule set: defects, not style. Ruff's defaults
  surfaced 117 findings here and ~100 were import ordering and annotation
  modernisation. Those are a separate pass, in their own commit.
- `requirements-dev.txt` — ruff, bandit, vulture, pip-audit.
- `cryptography` and `h2` upgraded against CVEs and pinned.

---

## Verified

- **364 backend tests pass** (was 202 at session start), 23 files, ~105 s
- **36 frontend tests** across 3 files (was 25 across 2)
- **ruff clean**, **pip-audit clean** (one documented ignore), production build clean
- Live, against the running server: hand-typed draft → 2 storyboard frames (was
  404); 5 saves → 1 version row (was 5); viewer 403 on write with the draft
  provably unchanged; stranger 404; project delete 2 → 1 with no console errors;
  package PDF containing `Cast: SANJANA` and a real `Camera:` line; Devanagari
  PDF with the bundled font embedded
- Browser-verified: react-router v7 upgrade, the panel tab overflow, and caret
  scrolling at 1280×800

---

## Issues noticed but NOT fixed

1. **The mock database is the top structural risk.** It is a hand-rolled store
   with no relationships, constraints or transactions, and **every test runs
   against it**. It has now produced **three schema-drift bugs**, two of them
   introduced this session and caught only by reading the schema by hand:
   `token_version` was added to `users` in code and not to
   `supabase_schema.sql`, so `sign-out-everywhere` would have 500'd on real
   Postgres. Green tests cannot catch this class. **Get a real Postgres into CI
   and adopt a migration tool** — everything else here is tractable; this
   silently invalidates the safety net.
2. **Nothing has ever run with real keys.** Still the biggest unknown. `.env`
   held only `JWT_SECRET` and `DEMO_SEED` at the end of this session.
3. **No transactions anywhere.** `purge_projects` deletes across seven tables in
   a loop; a failure halfway orphans rows — in the erasure path, where partial
   failure is least acceptable.
4. **The PDF export is not professional screenplay format.** It is **A4, not US
   Letter**; page breaks orphan a character cue from its dialogue with no
   `(MORE)` / `(CONT'D)`; `line[:90]` silently truncates long action lines in the
   deliverable; there are no scene numbers. These are the four things a producer
   notices before reading a word.
5. **There is no way to type Nepali in the product.** Onboarding asks for
   Devanagari in three places and nothing anywhere explains how to enter it. The
   linter now accepts romanised Nepali, so that path works — but phonetic
   transliteration in the editor is the highest-value remaining feature for a
   Nepali-first product.
6. **No access audit log.** With sharing live, "who read my draft" has no answer.
7. **Encryption at rest is Supabase's, not ours.** NFR03 claims otherwise.
   Anyone with database credentials can read every script.
8. **`ScriptEditor.jsx` is ~1,200 lines** and holds editor state, the AI panel,
   the review modal, the structure panel and type-ahead.
9. **No React error boundary.** One thrown render shows a white page with the
   writer's unsaved draft in it.
10. **CRA is deprecated**, which is why 33 unfixable advisories remain in
    `npm audit`. All build toolchain; none ship. Vite migration is a real task.
11. **`PYSEC-2026-1325` (ecdsa) is ignored by ID in CI.** It does not apply —
    tokens are signed HS256, so the ECDSA path never runs. **Re-check if
    `ALGORITHM` in `auth.py` ever changes.**

---

## Gotchas

### Copyright — still the one that matters
The script corpus must never be committed or published. Fingerprint **output**
is safe (measurements only, no text).

### The linter collapses nearby flags
`_collapse_runs` merges same-rule flags within 3 lines into one. Two on-the-nose
lines exactly 3 apart produce a single flag reporting it covers 2 lines. This is
deliberate — five identical flags on one paragraph trains a writer to dismiss the
panel — but it looks like a missed detection when you are testing by hand.

### The editor's scroll has two layers
The textarea is a fixed 1056px "page" inside a container that scrolls. On a
laptop the writer sees ~650px of it, so the caret can be inside the textarea's
own box while below the container's fold. `scrollCaretIntoView` handles both;
if you touch it, test at 1280×800, not on a tall monitor.

### Windows
Backend without `--reload`; kill orphans with
`Get-Process python | Stop-Process -Force`. Console output cannot print
Devanagari (cp1252) — set `PYTHONIOENCODING=utf-8` when debugging Nepali.

---

## Suggested next step

`ROADMAP.md`, which orders the remaining six weeks so that everything only
discoverable in production comes first. The short version:

1. **Real Postgres in CI + a migration tool** (issue 1 above) — do this before
   anything that touches the schema
2. **A3 real-keys smoke test** — expect breakage in the real-Claude JSON path and
   in Supabase client behaviour the mock does not reproduce
3. **Deploy + set `CORS_ORIGINS`, `--proxy-headers`, `REQUIRE_SHIPPABLE_FONT`**
4. **Payments for Nepal** — Stripe cannot collect from most Nepali cards, which
   puts the proposal's own open question on the critical path

Two decisions that cannot be resolved by building: whether FR10 live co-editing
is built or descoped, and whether the tier names are Free/Creator/Pro (the
proposal) or free/pro/studio (the code).
