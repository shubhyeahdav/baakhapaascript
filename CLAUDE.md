# Baakhapaa

AI-powered pre-production system for screenwriting and storyboarding.

## Tech Stack
- **Backend**: FastAPI (Python), Supabase (Postgres) for data, JWT auth
- **AI**: Anthropic Claude API (script generation), OpenAI DALL-E 3 (storyboard images)
- **Frontend**: React 18, React Router, Tailwind CSS, axios

## Conventions
- All secrets (Anthropic key, OpenAI key, Supabase URL/key, JWT secret) live in `.env` files — never hardcode keys. Backend: `baakhapaa-backend/.env`. Frontend: `baakhapaa-frontend/.env`.
- Every backend endpoint that calls an external AI API wraps the call in try/except and raises `HTTPException(status_code=503, ...)` on failure — AI providers are unreliable, and callers need a clean error instead of a stack trace.
- Dark theme (cool indigo/slate; defined in `tailwind.config.js` + `index.css`).
  Tokens are aliased to legacy "gold*" names for compatibility — `gold` now = indigo `#6366F1`.
  - bg `#0B0F19`, surface `#141A29`, elevated `#1E2538`, border `rgba(148,163,184,0.12)`
  - accent/`gold` `#6366F1` (bright `#818CF8`), `skyAccent` `#38BDF8`
  - text: `ink #F8FAFC`, `inkSoft #E2E8F0`, `inkMuted #94A3B8`
  - Fonts: `Fraunces` (display serif), `Inter` (UI), `Courier New` (screenplay editor only)

## Running Locally

Backend:
```
cd baakhapaa-backend && uvicorn main:app --reload
```
Runs at http://localhost:8000 (docs at `/docs`, health check at `/health`).

Frontend:
```
cd baakhapaa-frontend && npm start
```
Runs at http://localhost:3000 (often **3001** locally when 3000 is taken; backend CORS allows both).

**Windows gotchas:**
- `uvicorn --reload` is unreliable here (orphaned processes squat on port 8000). Prefer running **without** `--reload` and restart manually after backend edits. Kill stragglers: `Get-Process python | Stop-Process -Force`.
- Backend venv is at `baakhapaa-backend/venv` (use `./venv/Scripts/python`). `bcrypt` is pinned to `4.0.1` — newer breaks passlib.
- Local demo DB now **persists to SQLite** (`baakhapaa-backend/baakhapaa_local.db`) — restarts keep users/projects. Delete the file to reset.

## Project docs (all at repo root)
Start with `ONBOARDING.md` (doc map + 15-min setup), then `WORKING_GUIDE.md`
(git topology, commit/push loop, copyright rules, Claude Code setup on another
machine). Then:
- `PRD.md` — product requirements (problem, users, scope, metrics)
- `TRD.md` — technical architecture, data model, API contract, deploy plan
- `LEARNING_GUIDE.md` — beginner full-stack walkthrough
- `AUDIT_REPORT.md` — security audit findings
- `HANDOVER.md` — latest session test results
- `UI_Inspiration.md` — dark-UI references (Linear/Cursor/etc.) for design prompts
- Legal (templates, unreviewed): `Terms_of_Use.md`, `Privacy_Policy.md`,
  `Data_Compliance_Checklist.md` (Nepal law), `Trademark_Check_Guide.md`

## Current State (verified 2026-07-11, updated 2026-07-14 — PROJECT_PLAN.md §6 has the changelog, HANDOVER.md the narrative)

**Working (every item re-tested live, demo mode):**
- Auth (register/login/JWT, protected routes; password strength rules are client-side only)
- Project CRUD (delete has no dashboard UI yet)
- Script structure — **two-step flow**: generate-structure returns a preview only
  (suggestions persisted on the script row), scenes added one at a time via
  `POST /scripts/add-scene`; StructureTimeline panel in the editor
- AI scene generation/improve/suggest (mock-verified; real Claude path never run)
- Storyboard generation (placeholder frames; frame edit/regenerate routes have no UI)
- Version history (auto-snapshot on save, restore, set-based diff) + Versions tab
- Comment threads (Notes tab; line number is manual, not anchored)
- Collaboration bar (presence; "Solo session" fallback — never tested against real Supabase)
- Script export PDF/Word/production package (⚠ PDF cannot render Devanagari — ReportLab Courier)
- Stripe Checkout for Pro/Studio (test/demo mode)
- **RAG craft grounding** — `knowledge_base.json` (**29 craft entries** across
  five levels: structure, scene, dialogue, character, image) →
  `load_knowledge_base.py` → `script_patterns`; `rag.retrieve_relevant_patterns()`
  injects the top-3 semantic matches into `generate_structure`. Retrieval embeds
  the entry's **problem** first, since writers arrive with a symptom, not a genre
  tag. Embeddings are local (fastembed `bge-small-en-v1.5`, 384-dim), so this
  needs no API key. Every `worked_example` is original prose — that's what keeps
  the corpus publishable by construction
- **Freemium split** — free tier runs on RAG only, zero Claude cost:
  `POST /scripts/recommendations` (all tiers) powers the editor's Patterns tab;
  `generate-scene`/`improve`/`suggest` are Pro/Studio (403 for free);
  `generate-structure` gives free users a RAG-grounded skeleton
- Settings page (`/settings`), account dropdown, all four nav tabs routing,
  `/storyboards` + `/exports` index pages
- Command palette (⌘K), bento dashboard, warm near-black + gold retheme
  (Spectral/Mukta/Courier Prime), clickable scene cards, and the 2b compact
  timeline instrument when the structure panel is minimized
- Demo mode: local SQLite DB + mock AI + placeholder storyboards + mock Stripe
  when `.env` has placeholder keys (test login: `test@example.com` / `password`)

**Not yet built / known broken:**
- Tier enforcement is **partial** — AI is gated, but the free project limit is
  unenforced and **Word/package export is gated in the UI only** (the API
  returns 200 for a free user)
- Devanagari in PDF exports (ReportLab Courier lacks the glyphs) — the last
  true blocker; narrow screenplay column CSS
- Login rate limiting + server-side password policy (client-side rules only)
- Custom user-added scenes UI (the API already supports it)
- NewProject still uses the old Sidebar — shell split half-applied
- Live cursor/co-editing (out of Phase-1 scope)
- Real API keys / real Supabase — **all verification to date is demo-mode**
- GENERATION_ARCHITECTURE.md: the RAG layer shipped; the 4-stage
  scaffold→expansion→critic→revision pipeline is still spec-only

**Project skills** (`.claude/skills/`, auto-load in this repo): `script-rag`
(operate the RAG pipeline), `script-structure` (beat grammars + the technique
playbook distilled from every analysis — use when writing or analyzing scripts).

**Repo:** `shubhyeahdav/baakhapaascript`, default branch **`codebase`**. This
working copy is **two nested repos** — the wrapper at `D:\AkxyaRup` (branch
`main`, holds `.claude/` + a gitlink) and this project repo (branch `master` →
`origin/codebase`). Don't target `main` with project work. Full explanation and
the push sequence: `WORKING_GUIDE.md` §1 and §3. PR #1 open.

**Copyright:** `raw_scripts_TEMP/` (117 screenplays, incl. a ~19MB
`knowledge_base.json` of full script text) is gitignored at the wrapper level
and must never be committed or published. Don't confuse it with the app's own
`baakhapaa-backend/knowledge_base.json` (~35KB, all original prose).

**Next priorities:** PROJECT_PLAN.md §4 (Blockers → Security → Incomplete → Polish).

## Security (see AUDIT_REPORT.md; re-checked in PROJECT_PLAN.md §3 + §6)
A full audit was done. All script-related endpoints enforce ownership via
`require_script_access()` in `auth.py` (returns 404 to avoid id probing) —
re-verified 2026-07-11. Project/frame updates use field whitelists.
**Fixed:** `JWT_SECRET` is now required — the backend refuses to boot on a
missing/short/default secret (`3b66222`).
**Still open before any deploy:** login rate limiting; a server-side password
policy (rules are client-side only, the API accepts a 1-char password);
tighten CORS from the dev any-localhost regex to a prod-domain allowlist;
move the compiled-in mock test user behind an explicit demo flag; and gate
Word/package export server-side (currently UI-only — the API returns 200 for
a free user).

## Session log (2026-07-05)
Built this session, each its own commit (`git log` for hashes):
1. Frontend redesign — split-screen login + richer dashboard (indigo cinematic theme)
2. Version History UI (Versions tab), Comment Threads UI (Notes tab)
3. Collaboration bar (Supabase presence, solo fallback), Pricing page `/pricing`
4. Demo mode — mock DB + mock AI + placeholder storyboards (no keys needed)
5. Fixes — invalid model id (`claude-sonnet-5`), login/bcrypt, opening projects
   (new `GET /scripts/project/{id}` get-or-create route), `.env` untracked + gitignored
6. Security audit → `AUDIT_REPORT.md` (ownership checks, mass-assignment whitelists,
   frontend error handling, dead-code removal)

**Design-sync (claude.ai/design):** attempted per user request to seed the theme as
design inspiration. **Blocked** — DesignSync needs interactive `/design-login` auth,
unavailable in this environment. This repo is a CRA app (no component-library `dist/`/
Storybook), so a full component sync isn't possible; only a theme/token seed would be.
Revisit from an interactive terminal or via Claude Design's "Send to Claude Code Web".
