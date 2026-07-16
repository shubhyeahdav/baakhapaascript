# Handover — 2026-07-14

Covers the work since the 2026-07-11 stock-take (11 commits). The previous
handover (2026-07-06, core-flow test) is superseded and its content now lives
in `PROJECT_PLAN.md` §1.

**Read `PROJECT_PLAN.md` first** — §6 is the changelog, §4 is the ordered
build queue. This file is the narrative: what was built, what's verified, and
what will bite you.

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

### 1. RAG script grounding (the big one)
Structure generation is no longer generic AI theory — it's grounded in real
analyzed patterns.

- `knowledge_base.json` — **15 structural analyses** (Parasite, Rocky, 3 Idiots,
  Kumbalangi Nights, Tokyo Story, Oldboy, Kota Factory, Panchayat, Fleabag,
  K-drama, plus shorts categories). Structural analysis only, never copyrighted
  text — the loader rejects fields over 600 chars as a guard.
- `rag.py` — `retrieve_relevant_patterns(genre, tone, theme, top_k=3)`.
  Embeddings via **fastembed** (`bge-small-en-v1.5`, 384-dim, local ONNX).
  Chosen because Claude has no embeddings API and OpenAI's key is a
  placeholder — this needs no key at all and works in demo mode.
- `load_knowledge_base.py` — one command: validate → embed → upsert (idempotent
  by `title_ref`), with canned retrieval probes as a spot-check.
- `pgvector_script_patterns.sql` — the real-Supabase table + HNSW index + RPC
  for when you outgrow fetch-and-rank (~500 entries).
- Retrieval is injected into `generate_structure`'s prompt (Stage 1 only, by
  design — see `GENERATION_ARCHITECTURE.md`).

**Proof it's semantic, not tag-matching:** a `genre="boxing underdog"` query —
a tag that exists nowhere in the library — returns **Rocky at 0.69**.

### 2. Freemium split — free tier costs zero Claude
| | Free | Pro / Studio |
|---|---|---|
| Pattern recommendations while writing | ✅ RAG, local, $0 | ✅ |
| Structure generation | ✅ RAG-built skeleton, no Claude | ✅ Claude |
| Scene generate / improve / suggest | ❌ 403 + upgrade message | ✅ Claude |

New `POST /scripts/recommendations` powers the editor's **Patterns** tab (the
free plan's AI feature). Verified: a secret-boxing-gym scene pulled
mentor-sacrifice underdog (60%), structural-obstacle slow burn (56%),
family-pressure antagonist (55%) — zero Claude tokens.

### 3. Editor UX (PR #1)
- **Account dropdown** — the avatar used to log you out on a single click.
- **2b timeline instrument** — the minimized structure panel now shows a
  timecode ruler, proportional scene blocks (solid = written, dashed = outline
  only), act dividers, gold playhead, "X written of Y".
- **Pattern recs made usable** — auto-load, focus chips, takeaway-first cards.
- **All four nav tabs work** — new `/storyboards` and `/exports` index pages;
  Team deep-links into Settings.

### 4. Settings page + JWT hardening
`/settings` exists (Account / Team Members / API Usage), and `JWT_SECRET` is
now mandatory — the backend refuses to boot without a strong one.

### 5. Two project skills (`.claude/skills/`)
Auto-load for any future session in this repo:
- **`script-rag`** — how to operate the pipeline (add analyses, reload, the
  invariants not to break).
- **`script-structure`** — the writing playbook: beat grammars for
  shorts/scene/web-series and a technique library indexed by the problem each
  solves, distilled from every analysis.

---

## Verified working (live, this session)

- Free user: recommendations 200 with on-theme patterns; generate/improve/
  suggest 403; structure returns a RAG skeleton. Pro user: generate-scene 200.
- RAG: 15 patterns loaded; loader idempotent; cross-genre retrieval lands.
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
5. **RAG differentiation is limited by library size.** With 15 entries a few
   sources dominate every query. This isn't a bug — it wants more analyses.
6. **Nothing has ever run with real keys.** Every verification to date is
   demo-mode. The real Claude/DALL-E/Supabase paths are the biggest unknown
   in the project (**A3**).
7. **NewProject still uses the old Sidebar** while everything else uses TopNav
   — the shell split is half-applied (**D2**).
8. **Screenplay column renders narrow** (**D1**, cosmetic, long-standing).

---

## Gotchas for whoever's next

- **Don't target `main`** on the remote — it holds an unrelated empty starter
  commit. The default branch is **`codebase`**. PR #1 is open against it.
- `gh` isn't installed; `git push` works via the credential helper but PRs
  must be opened in the browser (or install `gh`).
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
