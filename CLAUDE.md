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
- Mock DB is **in-memory**: restarting the backend wipes all data (re-register/login).

## Project docs (all at repo root)
Start with `ONBOARDING.md` (doc map + 15-min setup). Then:
- `PRD.md` — product requirements (problem, users, scope, metrics)
- `TRD.md` — technical architecture, data model, API contract, deploy plan
- `LEARNING_GUIDE.md` — beginner full-stack walkthrough
- `AUDIT_REPORT.md` — security audit findings
- `HANDOVER.md` — latest session test results
- `UI_Inspiration.md` — dark-UI references (Linear/Cursor/etc.) for design prompts
- Legal (templates, unreviewed): `Terms_of_Use.md`, `Privacy_Policy.md`,
  `Data_Compliance_Checklist.md` (Nepal law), `Trademark_Check_Guide.md`

## Current State

**Working:**
- Auth (register/login/JWT, protected routes)
- Project CRUD
- Script generation (3-act structure, scene generation/improve/suggest via Claude)
- Storyboard generation (DALL-E 3 frames per scene)
- Script export (PDF, Word, production package)
- Version history UI (Versions tab in script editor)
- Comment threads UI (Notes tab in script editor)
- Real-time collaboration bar (Supabase presence; "Solo session" fallback without keys)
- Pricing page at `/pricing` (three tiers; payments not wired)
- Demo mode: mock database, mock AI, and placeholder storyboards when `.env` has placeholder keys
  (test login: `test@example.com` / `password`)

**Not yet built:**
- Payment processing (pricing page CTAs route to register/dashboard)
- Live cursor/co-editing (presence bar shows who's online only)
- Real API keys / real Supabase (still placeholders → demo mode is active)

## Security (see AUDIT_REPORT.md)
A full audit was done. All script-related endpoints now enforce ownership via
`require_script_access()` in `auth.py` (returns 404 to avoid id probing). Project/
frame updates use field whitelists. **Still needs the owner's review before any
deploy:** set a strong `JWT_SECRET` (has a guessable fallback), add login rate
limiting, remove the compiled-in mock test user, and widen CORS to the prod domain.

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
