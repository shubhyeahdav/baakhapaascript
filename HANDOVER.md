# Handover — 2026-08-13

Supersedes the 2026-08-04 handover, which had gone **stale on five items**: it
still listed rate limiting, the server-side password policy and export tier
gating as open. All three had shipped. If you read that file, ignore its
"Issues noticed but NOT fixed" §1, §2 and §4.

**Read `PROJECT_PLAN.md` §4 for the build queue** and
`RECOMMENDATION_ARCHITECTURE.md` for why the recommendation system is shaped the
way it is. This file is the narrative of what changed and what will bite you.

---

## Environment (unchanged — still demo mode)

All `.env` keys are placeholders, so the app runs on local **SQLite**, **mock
Claude**, **mock DALL-E**, **mock Stripe**. Embeddings are real, computed locally
by fastembed with no API key.

```
cd baakhapaa-backend && ./venv/Scripts/python -m uvicorn main:app --port 8000   # no --reload on Windows
cd baakhapaa-frontend && npm start
```

Test login: `test@example.com` / `password` (pro tier).

There is also `.claude/launch.json`, so Claude Code can start both servers
directly by name (`backend`, `frontend`).

**Two environment facts that cost time this session:**

1. **`script_patterns` was empty** in the local DB. Retrieval returned `[]` and
   looked broken while being perfectly correct. Run
   `./venv/Scripts/python load_knowledge_base.py` — and then **restart the
   backend**, because the mock DB caches rows at startup.
2. **The 1000-script corpus is not on this machine.** No `raw_scripts_TEMP/`, no
   `D:\AkxyaRup` (D: holds 0.2 GB). CLAUDE.md's two-nested-repo topology
   describes a *different* machine; here the project lives at `C:\baakhapaa` as a
   single repo on branch `codebase`. All corpus tooling was therefore written to
   run elsewhere and verified against a synthetic corpus.

---

## What changed this session

### 1. Codebase refactor — eight duplications collapsed

| Duplication | Copies | Now |
|---|---|---|
| Project ownership check | **5** | `auth.require_project_access()` |
| `except RuntimeError → 503` | **4** | `scripts.ai_unavailable_as_503()` |
| `StreamingResponse` download boilerplate | **4** | `export._download()` |
| Frame → script → 404 → access | **2** | `storyboard.require_frame_access()` |
| Whitelist + "no valid fields" 400 | **2** | new `updates.apply_whitelist()` |
| 33/33/34 act arithmetic | **3** | `script_engine._act_split()` |
| `("pro","studio")` literal | **5** | `auth.PAID_TIERS` / `is_paid_tier()` |
| Function-body `from database import …` | **6** | hoisted |

**`database.py` imports only `os` and `dotenv` — there was never a circular
import.** Every deferred import was cargo cult; one in `scripts.py` re-imported a
name already bound at module level.

The ownership check being copy-pasted five times was a *security* shape, not just
noise — five chances to invert a comparison or return 403 and leak id existence.

**A real bug fell out of it:** `ScriptEditor`'s blob download never called
`revokeObjectURL`, so every export from the editor leaked its blob for the life
of the tab. `ExportsPage` had the revoke; the editor didn't. Both now use
`utils/download.js`.

### 2. Measurement layer — the corpus finally has somewhere to go

`screenplay.statistics()` already promised "the same vocabulary as the corpus
fingerprints." The measuring tape for a user's draft existed; **the ruler to
compare against did not**. Now it does:

- **`fingerprint.py`** — measures one screenplay, building on
  `screenplay.statistics()` rather than forking it
- **`benchmark.py`** — fingerprints → percentile verdicts, genre-conditioned
- **`build_fingerprints.py`** — CLI over a corpus directory
- **`POST /scripts/benchmark`** — all tiers, gated on draft size

```bash
python build_fingerprints.py path/to/extracted_scripts -o corpus_fingerprints.json
```

Organise as `corpus/<genre>/film.txt` for genre cohorts. **Output holds
measurements only — no screenplay text** — so it is safe to commit even though
the corpus never is.

Design rules worth not undoing: percentile rather than pass/fail; **silence is a
result** (only the outer 10% produce a note); never compare a short to a feature
(only length-independent ratios); always report `n`, and suppress cohorts under
12.

**Act breaks are deliberately NOT inferred.** Without labels it is guesswork, and
a confident wrong boundary is worse than none. `scene_length_curve` compares
shape without the claim.

### 3. Recommendations — diagnosis before similarity

The old `/scripts/recommendations` queried the pattern library with the last 1500
characters of raw draft prose. But `rag.pattern_to_text()` embeds each entry's
**problem**. Querying diagnoses with prose compares two different registers, and
what survives is surface topic — a chiya pasal scene retrieved entries about tea.

Since every linter rule was derived from a craft entry's `warning_sign`, **a flag
already names the technique that fixes it.** So:

1. **Exact** — `rag.get_patterns_by_technique()`, no embedding at all
2. **Semantic** — fills remaining slots, querying with flag *messages* (symptom
   register) rather than draft prose
3. **Fallback** — no flags → the original last-1500-chars behaviour

The response now carries `diagnosed[]` and `source` (`"diagnosis"` /
`"similarity"`), so the UI can say *why*. Verified live:

```
source: diagnosis
  line 3  unfilmable_interiority -> Convert inner state into something the camera can see
  line 7  on_the_nose            -> Let them fight about the small wrong thing
  line 6  directed_emotion       -> Put the feeling into a physical thing that changes hands
```

`/scripts/lint` also now returns `by_craft_level`, grouping flags the way writers
manually group notes.

### 4. Storyboard spend hole — closed

**This was live and serious.** `POST /storyboard/generate/{id}` was gated by
`get_current_user` only — **no tier check** — and the engine looped over *every*
scene at `dall-e-3` `1792x1024`. A free user with a 40-scene script triggered
~$3.20 of image generation on one click, repeatable, plus unlimited
`regenerate_frame`. Pro is NPR 999 ≈ $7.15/month.

Inert in demo mode (placeholders), and it would have gone live the moment a real
`OPENAI_API_KEY` was added — i.e. during A3.

Now: `require_tier` on generate and regenerate, plus `MAX_STORYBOARD_FRAMES`
(default 24, env-tunable). The response reports `truncated`. **Viewing and
editing existing frames stay free** — gate the spend, not the access, so a
downgraded user still sees the board they paid for.

### 5. Three features removed

| Cut | Why |
|---|---|
| **ZenAudio** + `ambientAudio.js` | Ambient focus audio. No research pain point touches it, and it was built while Devanagari export stayed broken. Also removed 72 lines of dead `.zen-audio` CSS. |
| **CollabBar** + `realtime.js` | `realtimeClient` is null without Supabase keys, so **every user saw "Solo session."** Live co-editing is out of Phase 1. Removing it made `@supabase/supabase-js` unused — dropped from package.json, `npm install` pruned 8 packages. |
| Command palette | Kept the file, stopped investing. `FREE_PROJECT_LIMIT = 1` means it switches between one project for most users. |

Snapshots of all four deleted files are in the session scratchpad; `CollabBar.jsx`
and `realtime.js` are also recoverable from git history. **`ZenAudio.jsx` and
`ambientAudio.js` were untracked — git cannot restore those.**

**This is a PRD change, not just a cleanup.** PRD US4 lists real-time
collaboration as in scope. Seven docs still describe presence as a feature:
`PRD.md`, `TRD.md`, `AUDIT_REPORT.md`, `MONTH_1_REPORT.md`, `SESSION_SUMMARY.md`,
and older sections of `PROJECT_PLAN.md`/`CLAUDE.md`. Decide whether presence is
deferred or dropped, then reconcile those.

---

## Verified

- **120 backend tests pass** (was 93 at session start), ~24 s, no API keys needed
- **pyflakes clean** across all backend modules
- Frontend compiles clean from a **cold start** after the dependency removal
- Live: ownership 200/404, all four export formats with correct filenames,
  benchmark gating, diagnosis-driven retrieval, editor loads with zero console
  errors, Zen mode intact with `zenAudioNodes: 0`

**Test suite is now 12 files / 120 tests** — both older handovers said 37, which
was stale by more than 3×.

---

## Issues noticed but NOT fixed

1. **A1 Devanagari is still the blocker.** Code is done; the font asset is not.
   `baakhapaa-backend/assets/` **does not exist**. It currently falls back to
   Microsoft's Nirmala (dev-only). Drop `NotoSansDevanagari-Regular.ttf`
   (SIL OFL) into `baakhapaa-backend/assets/` before any deploy or Linux hosts
   render blank boxes. **Add a test asserting the file exists** — the current
   test covers font *selection*, so A1 passes CI today and still fails in
   production.
2. **Frontend has zero tests.** `npm run test:ci` carries `--passWithNoTests`, so
   it exits green having run nothing. It looks like CI coverage and isn't.
3. **`rag.py` retrieval quality has no automated test** — deliberate (the suite
   avoids the embedding model), but it means corpus-quality claims are manual
   one-offs no test re-checks.
4. **Nothing has ever run with real keys.** Still the biggest unknown (A3).
5. **CRA hot-reload websocket fails in the Claude Code browser pane**
   (`ws://localhost:3000/ws`). Dev-only: edits still recompile server-side, but
   the browser won't auto-refresh — reload manually. Not caused by any app code.
6. **NewProject still uses the old Sidebar** while everything else uses TopNav.
7. **35 npm vulnerabilities** reported at install (10 low, 7 moderate, 18 high).
   Not triaged; `npm audit fix --force` may break CRA.

---

## Gotchas

### Copyright — still the one that matters
The script corpus must never be committed or published. Fingerprint **output**
is safe (measurements only, no text) — that distinction is the whole reason
`build_fingerprints.py` exists in the shape it does.

### Installers in the repo root
~298 MB of `.exe` installers were sitting untracked in the project root
(VSCode 232 MB, starc 52 MB, comet 14 MB). Now covered by `*.exe` in
`.gitignore`. Check before committing that nothing else large slipped in.

### Windows
Backend without `--reload`; kill orphans with
`Get-Process python | Stop-Process -Force`. `npm install` can leave an empty
`node_modules/@supabase` directory behind — harmless.

---

## Suggested next step

`PROJECT_PLAN.md` §4. In order: **A1 font asset** (small, still the only true
blocker) → **corpus fingerprints** on the machine that has the scripts →
**A3 real-keys smoke test**, which is now materially cheaper and lower-risk
because storyboards are gated and can be deferred, so A3 needs only Claude +
Supabase rather than DALL-E too.
