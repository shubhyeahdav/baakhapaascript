# Baakhapaa

AI-powered pre-production system for screenwriting and storyboarding.

## Tech Stack
- **Backend**: FastAPI (Python), Supabase (Postgres) for data, JWT auth
- **AI**: Anthropic Claude API (script generation), OpenAI DALL-E 3 (storyboard images)
- **Frontend**: React 18, React Router, Tailwind CSS, axios

## Conventions
- All secrets (Anthropic key, OpenAI key, Supabase URL/key, JWT secret) live in `.env` files — never hardcode keys. Backend: `baakhapaa-backend/.env`. Frontend: `baakhapaa-frontend/.env`.
- Every backend endpoint that calls an external AI API wraps the call in try/except and raises `HTTPException(status_code=503, ...)` on failure — AI providers are unreliable, and callers need a clean error instead of a stack trace.
- Dark theme (**warm near-black + true gold**; defined in `tailwind.config.js` + `index.css`).
  - bg `#0B0B0A`, bgDeep `#080807`, surface `#141311`, elevated `#191813`,
    border `rgba(255,255,255,0.08)`
  - `gold` `#D4A843` (bright `#E4BE64`, hover `#C79A35`). `accent` and
    `skyAccent` are aliases of the same gold — the token names survive from the
    indigo system so components did not need editing
  - text: `ink #EDEAE3`, `inkSoft #9B968A`, `inkMuted #7E7A6F`
  - Fonts: `Spectral` (display serif), `Mukta` (UI), `Courier Prime` (screenplay editor only)

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
- `docs/CURRENT_STATE.md` — **what is built, what is not, and how each feature works**. Read the part you are changing before changing a feature
- `PRD.md` — product requirements (problem, users, scope, metrics)
- `TRD.md` — technical architecture, data model, API contract, deploy plan
- `LEARNING_GUIDE.md` — beginner full-stack walkthrough
- `AUDIT_REPORT.md` — security audit findings
- `DATA_HANDLING.md` — **where script text actually goes**: what is stored, what
  leaves the server and to whom, what deletion now removes, and what is still
  open. Rewrite `Privacy_Policy.md` from this, not from the template
- `ROADMAP.md` — the remaining six weeks and the decisions that block them
- `PILOT.md` — the five-writer pilot protocol: what only a writer can settle,
  what to measure rather than ask, and what counts as a failed pilot
- `HYPOTHESES.md` — what we believe and have not checked, each with the number
  that would prove it wrong, written before the test. Holds the six beliefs
  nothing currently measures (retention, free→paid, the untested price) and the
  weekly review template. `PILOT.md`'s four kill criteria are not repeated there
- `LEGAL_REVIEW.md` — what was factually wrong in the Terms and Privacy Policy
  (fixed), and what still needs a Nepal-qualified lawyer
- `DEPLOYMENT.md` — **the deploy runbook**: order of operations, the boot checks
  that now enforce production config, and how the three payment gateways work
- `HANDOVER.md` — latest session test results
- `FEATURE_SUGGESTIONS.md` — the build queue, ordered by evidence, with
  the two business decisions that block pricing stated as options rather
  than guessed at
- `UI_Inspiration.md` — dark-UI references (Linear/Cursor/etc.) for design prompts
- Legal (templates, unreviewed): `Terms_of_Use.md`, `Privacy_Policy.md`,
  `Data_Compliance_Checklist.md` (Nepal law), `Trademark_Check_Guide.md`

## Current State

The full feature list, known gaps and history moved to `docs/CURRENT_STATE.md`.
When a feature ships or a gap closes, update that file, not this one. The
numbers below are counted by `check_docs.py`, not typed.

> **Read `HANDOVER.md` first.** Two things reliably waste a session's first hour:
> `script_patterns` is often **empty** in the local DB (run
> `load_knowledge_base.py`, then **restart the backend** — the mock DB caches at
> startup), and the **script corpus is not on this machine** (no
> `raw_scripts_TEMP/`, no `D:\AkxyaRup`; this is a single repo at
> `C:\baakhapaa` on branch `codebase`).
>
> **THIS MACHINE IS LIVE, NOT IN DEMO MODE (2026-09-09).** `.env` holds real
> Anthropic, OpenAI and Supabase keys, so `database.use_mock` is False and
> `script_engine.PROVIDER` is `anthropic`: reads and writes go to the real
> Postgres, and a generation call is billed. `baakhapaa_local.db` is stale and
> no longer the store. Check before you test anything against a running server:
>
> ```
> ./venv/Scripts/python -c "import database,script_engine as s;
> print(database.use_mock, s.PROVIDER)"
> ```
>
> The known fault in this mode is `httpx.RemoteProtocolError: Server
> disconnected` on the first request after an idle gap — a pooled connection
> Supabase has already closed. See `HANDOVER.md`.
>
> Backend tests: **1319 across 87 files**, `./venv/Scripts/python -m pytest`.
> Frontend tests: **1597 across 80 files**, `npm run test:ci`.
> Craft corpus: `knowledge_base.json` (**47 craft entries**).
>
> **The backend suite takes about TWENTY minutes on this machine, not the 3.5
> this file claimed until 2026-09-16.** That is not the old hang and nothing is
> calling out: `conftest.py` pins the providers, the ten slowest tests total 22
> seconds, and the time is spread thin across the whole suite rather than
> stuck in a few tests. Budget for it; it is
> unexplained, not broken.
>
> **A slow run and a hung run look identical, and that is a tooling trap rather
> than a fact about the suite.** `pytest -q | tail` prints nothing at all until
> it finishes, so twenty minutes of silence is what BOTH look like. Run it
> unpiped, or with `-u`, when you need to tell them apart.
>
> **`conftest.py` stops the run if a live provider is active.** Keep that check;
> the reason is in `.claude/rules/backend-tests.md`.
>
> **CI runs lint, dependency audit, both suites and the production build** on
> push and PR (`.github/workflows/ci.yml`), on Linux with
> `REQUIRE_SHIPPABLE_FONT=true` — the only place the Devanagari font gate is
> meaningful, since this Windows box always has Nirmala to fall back on. A
> third job runs the two checks no suite can perform: `responsive-audit.mjs`
> (no test in this repo can see a layout — `vite.config.js` sets `css: false`)
> and `editor-load-race.mjs`. Both scripts WRITE — they register an account and
> create a project — so both now refuse unless `/health` reports `demo: true`.
> On this machine they would land in production Supabase; `--allow-live` is the
> deliberate override. A third, `page-layout-check.mjs`, needs no server at all
> and measures geometry the suite structurally cannot see.
>
> **CI does not run on a feature branch.** The workflow watches `push` to
> `codebase`/`main` plus any `pull_request`, so pushing a branch proves nothing
> — open a PR, or the layout job stays unexercised.
> Config is documented in `baakhapaa-backend/.env.example`.
>
> **Tooling** (`requirements-dev.txt`, kept out of the runtime install):
> `ruff` (config in `ruff.toml` — a narrow, chosen rule set: defects, not style,
> so a failure always means something is wrong), `pip-audit`, `bandit`,
> `vulture`. Run: `python -m ruff check .` and
> `python -m pip_audit --ignore-vuln PYSEC-2026-1325`.

**Project skills** (`.claude/skills/`, auto-load in this repo): `script-rag`
(operate the RAG pipeline), `script-structure` (beat grammars + the technique
playbook distilled from every analysis — use when writing or analyzing scripts).

**Repo:** `shubhyeahdav/baakhapaascript`, default branch **`codebase`**. This
working copy is one repo at `C:\baakhapaa`. The push sequence is in `WORKING_GUIDE.md` §3.

**Copyright:** `raw_scripts_TEMP/` (117 screenplays, incl. a ~19MB
`knowledge_base.json` of full script text) is gitignored at the wrapper level
and must never be committed or published. Don't confuse it with the app's own
`baakhapaa-backend/knowledge_base.json` (~35KB, all original prose).

**DEPLOYED 2026-09-15.** Frontend `https://baakhapaascript.vercel.app`
(Vercel), backend `https://akchhyarup.up.railway.app` (Railway), real Supabase.
The runbook and its env-var traps are in `DEPLOYMENT.md`.

**Next priorities:** `ROADMAP.md`. The short version: no AI generation and no
storyboard has run against the deployed backend, no real money has moved,
nothing renews on its own, and the legal documents are unreviewed templates.
None of those are feature work.

## Security
All script endpoints enforce ownership through `require_script_access()` in `auth.py`.
Full notes load from `.claude/rules/backend-security.md` when working in the backend.
