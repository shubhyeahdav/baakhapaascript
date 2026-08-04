# Handover — 2026-08-04

Covers the 8 commits since `origin/codebase` (`4fa5d94` → `a6b9e9f`). Supersedes
the 2026-07-14 handover, whose content is folded in below — that version went
stale three commits after it was written (it still described a 15-entry
structure-only knowledge base, which no longer exists).

**Read `PROJECT_PLAN.md` first** — §6 is the changelog, §4 is the ordered
build queue. This file is the narrative: what was built, what's verified, and
what will bite you.

New since the last handover: **`WORKING_GUIDE.md`** — the day-to-day working
loop, the two-repo git topology, and the Claude Code setup for a second
machine. Read it before your first commit or push.

---

## Environment (unchanged, still demo mode)

All `.env` keys are placeholders, so the app runs on: local **SQLite**
(`baakhapaa-backend/baakhapaa_local.db`, persists across restarts — delete to
reset), **mock Claude**, **mock DALL-E**, **mock Stripe**. Embeddings are the
exception — they're **real**, computed locally by fastembed with no API key.

```
cd baakhapaa-backend && ./venv/Scripts/python -m uvicorn main:app --port 8000   # no --reload on Windows
cd baakhapaa-frontend && npm start                                              # 3000/3001
```

Test login: `test@example.com` / `password` (pro tier).

---

## What was built

### 1. RAG craft library — rebuilt, not extended (`33c46d9`)
This is the headline change and it **replaced** the previous knowledge base
rather than growing it.

The old corpus was 15 structure-level aphorisms. Asking for help with a
scene-level problem — *"a daughter tells her father she is quitting medical
school"* — returned *"ground each episode in one mundane student problem"*: an
episode-structure observation, useless for writing that scene. RAG output is
capped by corpus quality, and the corpus was thin abstractions.

- **Corpus** (`knowledge_base.json`): **15 → 29 entries**, re-scoped from
  structure-only to **five craft levels** (structure, scene, dialogue,
  character, image).
- **New schema per entry**: `technique`, `problem`, `how_it_works`,
  `how_to_apply`, `worked_example`, `warning_sign`.
- **Every worked example is original prose** in Baakhapaa's Kathmandu idiom.
  This is deliberate: it's immediately applicable *and* contains no
  copyrighted text by construction. Keep this property.
- **Retrieval** (`rag.py`) now embeds the **problem first** (repeated for
  weight), because writers arrive with a symptom ("this feels flat"), not a
  genre tag. Returns the full craft payload; legacy `one_line_takeaway` is
  aliased so old rows and callers keep working.
- **Editor cards** lead with the technique and unfold into DO THIS / ON THE
  PAGE / YOU NEED THIS IF. Focus chips are now writing problems (Feels flat,
  On the nose, Thin character, Structure, Melodramatic).
- **Free-tier structure**: each of the five beats queries the library for the
  problem *that beat* solves, so guidance is beat-appropriate (opening →
  introduce under pressure, inciting → complicity engine, crisis →
  displacement argument) instead of three tips applied off-by-one.
- **Loader** validates the new schema + `craft_level`; the copyright guard now
  covers **all** prose fields.

**Proof it works end to end:** a deliberately melodramatic draft containing
*"you never supported my dreams!"* returns *"Let them fight about the small
wrong thing"* at **75%**, whose `warning_sign` names that exact line.

Earlier proof that retrieval is semantic and not tag-matching still holds: a
`genre="boxing underdog"` query — a tag that exists nowhere in the library —
returns **Rocky at 0.69**.

### 2. Two planning docs (`2440e9c`, `a6b9e9f`) — planning only, no code
- **`LEARN_SCREENWRITING.md`** — a 28-day curriculum built on the local script
  library: the two-pass reading method, reverse beat-sheeting, a five-rung
  craft ladder mapped to specific scripts, ending in a finished 8–12 page
  short.
- **`SCRIPT_CORPUS_PLAN.md`** — how the 117-script corpus could feed the
  system. The corpus was **measured, not assumed**: 77 scripts parse cleanly,
  5 partially, 35 are scans/prose (including `3_Idiots`, which turns out to be
  a published novelisation, not a screenplay) — **82 usable**. Proposes three
  data layers instead of "put scripts in RAG": computed structural
  fingerprints (free, factual), Claude-assisted craft techniques growing the
  corpus 29 → ~150 (~$5–15 one-time, never full text), and course content
  derived from both. Also proposes a deterministic **craft linter** built from
  the `warning_sign` field every entry already has — zero-cost feedback that
  works on the free tier.

Neither is implemented. Both are proposals with effort estimates and open
decisions.

### 3. Freemium split — free tier costs zero Claude
| | Free | Pro / Studio |
|---|---|---|
| Pattern recommendations while writing | ✅ RAG, local, $0 | ✅ |
| Structure generation | ✅ RAG-built skeleton, no Claude | ✅ Claude |
| Scene generate / improve / suggest | ❌ 403 + upgrade message | ✅ Claude |

`POST /scripts/recommendations` powers the editor's **Patterns** tab (the free
plan's AI feature).

### 4. Editor UX (`4fa5d94`, `a74822e`, `c947116`, `d6b1e3c`)
- **Account dropdown** — the avatar used to log you out on a single click.
- **2b timeline instrument** — the minimized structure panel now shows a
  timecode ruler, proportional scene blocks (solid = written, dashed = outline
  only), act dividers, gold playhead, "X written of Y".
- **Relevance fixed at the source** — `GET /scripts/{id}` embeds its parent
  project, so every AI call uses the project's real genre/tone/language
  instead of hardcoded `Drama`/`Emotional`. Also fixed the editor header,
  which showed "Workspace /" with no title.
- **All four nav tabs work** — new `/storyboards` and `/exports` index pages;
  Team deep-links into Settings via `?tab=`.

### 5. Settings page + JWT hardening
`/settings` exists (Account / Team Members / API Usage), and `JWT_SECRET` is
now mandatory — the backend refuses to boot without a strong one.

### 6. Two project skills (`.claude/skills/`)
Auto-load for any session working under `baakhapaa/`:
- **`script-rag`** — how to operate the pipeline (add analyses, reload, the
  invariants not to break).
- **`script-structure`** — beat grammars for shorts/scene/web-series and a
  technique library indexed by the problem each solves.

See `WORKING_GUIDE.md` for how to get these loading on another machine.

---

## Verified working (live)

- Free user: recommendations 200 with on-theme patterns; generate/improve/
  suggest 403; structure returns a RAG skeleton. Pro user: generate-scene 200.
- RAG: 29 craft entries loaded; loader idempotent by `title_ref`; loader
  probes restated as writing problems hit **4/4**; the melodrama probe above
  lands at 75%.
- Focus chips return genuinely different sets (an earlier bug where every chip
  returned the same three patterns is fixed — mixing the chip phrase with the
  scene text let the long text swamp the short phrase in the embedding, so a
  chip now queries the problem alone).
- Editor: timeline solid/dashed states, playhead sync, toggle round-trip.
- Nav: all four tabs route with correct active state; `/exports` PDF download
  returns a valid 2.2 KB `%PDF`.
- Cross-user security still holds (404s on other users' scripts).
- No console or server errors anywhere.

---

## Issues noticed but NOT fixed — read this part

1. **Export tier gating is UI-only.** `GET /export/script/word/{id}` returns
   **200 for a free user**. The Exports page hides Word/Package behind ✦, but
   the API doesn't enforce it. Anyone with the URL bypasses it. (PROJECT_PLAN
   **C1**, small fix.)
2. **Free project limit unenforced** — `POST /projects/` is unlimited despite
   the pricing page promising "1 active project". (Also C1.)
3. **Devanagari still can't render in PDF exports** — ReportLab's built-in
   Courier has no Devanagari glyphs, so Nepali dialogue silently won't appear.
   This breaks a PRD promise and is the **last true blocker** (**A1**).
4. **Login rate limiting + server-side password policy still open** (**B2/B3**).
   Password rules are enforced in the React form only; the API accepts a
   1-char password.
5. **RAG differentiation is still library-size-bound.** 29 entries is a real
   improvement on 15, but a few sources still dominate some queries.
   `SCRIPT_CORPUS_PLAN.md` is the plan to fix this properly.
6. **Nothing has ever run with real keys.** Every verification to date is
   demo-mode. The real Claude/DALL-E/Supabase paths are the biggest unknown
   in the project (**A3**).
7. **NewProject still uses the old Sidebar** while everything else uses TopNav
   — the shell split is half-applied (**D2**).
8. **Screenplay column renders narrow** (**D1**, cosmetic, long-standing).

---

## Gotchas for whoever's next

### Copyright — the one that actually matters
`raw_scripts_TEMP/` holds **117 copyrighted screenplays**, including a ~19MB
`knowledge_base.json` of full script text. It is **gitignored at the wrapper
repo level** and must never be committed, pushed, or published.

Note the collision: there are **two** files named `knowledge_base.json`.

| File | Size | Contents | Publish? |
|---|---|---|---|
| `baakhapaa-backend/knowledge_base.json` | ~35 KB | 29 original craft entries | ✅ yes, this is the app's |
| `raw_scripts_TEMP/knowledge_base.json` | ~19 MB | full copyrighted script text | ❌ **never** |

Reading those scripts to learn from is fine. Distributing them is not. The
loader's copyright guard (rejecting overlong prose fields) is a backstop, not
the primary defence — the primary defence is that every entry's prose is
written original.

### Git topology — surprising, read before pushing
This is **two nested repos**, not one, and both point at the same GitHub
remote. Full explanation and the exact push sequence are in
`WORKING_GUIDE.md`. The short version:

- `D:\AkxyaRup` (wrapper) → branch `main`, tracks only `.claude/`,
  `.gitignore`, and a **gitlink** to `baakhapaa`
- `D:\AkxyaRup\baakhapaa` (the actual project) → branch `master`, pushes to
  **`origin/codebase`**

**Don't target `main` with project work** — on the remote it holds the wrapper,
not the app. The app's default branch is **`codebase`**.

### Everything else
- `gh` isn't installed, so PRs must be opened in the browser. Git pushes need
  the credential helper to prompt interactively — a non-interactive shell
  (including an agent session) **cannot** authenticate. See `WORKING_GUIDE.md`.
- The mock DB's `delete()` is **deliberately deferred** to `execute()` so
  `table.delete().eq(...)` matches real Supabase. Reverting it to eager
  deletion wipes whole tables in demo mode.
- Test data is messy: ~11 projects from automated runs, one with a
  shell-mangled Devanagari title ("?????? WiFi"). Harmless; delete the SQLite
  file for a clean slate.
- The CRA dev server wedged once (hung pre-compile, survived cache clears and
  killing orphaned node processes). `npm run build` was fine; a reboot fixed
  it.

---

## Suggested next step

`PROJECT_PLAN.md` §4: **A1** (Devanagari font) → **B2/B3** (security pass) →
**C1 remainder** (the export gate above is bypassable today) → **C2** (custom
scenes) → **A3** (the real-keys milestone, the biggest de-risker).

If picking up the corpus work instead, `SCRIPT_CORPUS_PLAN.md` phase P1
(structural fingerprints) is free, factual, and unblocks the rest.
