# TRD — Baakhapaa Technical Requirements Document

**Version 1.0 | Last updated: [DATE] | Owner: Shubham**

*Companion to PRD.md — this covers the how, PRD covers the what/why.*

## 1. Architecture Overview

```
React (Tailwind) ──HTTP──► FastAPI ──► Supabase (Postgres + Auth + Realtime)
                                  │
                                  ├──► Anthropic Claude API (script gen)
                                  └──► OpenAI DALL-E API (storyboard gen)
```

Frontend and backend are fully decoupled — frontend never talks to
Supabase, Claude, or OpenAI directly; everything routes through the
FastAPI backend so auth and ownership checks are centrally enforced.

## 2. Tech Stack (locked for Phase 1)

| Layer | Technology | Why |
|---|---|---|
| Backend | Python FastAPI | Async, auto-docs, fast to iterate solo |
| Frontend | React + Tailwind CSS | Component reuse, rapid styling |
| Database | Supabase (Postgres) | Managed Postgres + Auth + Realtime in one |
| AI — text | Anthropic Claude API | Best bilingual + structured creative writing |
| AI — images | OpenAI DALL-E 3 | Reliable text-to-image for storyboards |
| Auth | JWT (python-jose) + bcrypt | Simple, stateless, well-understood |
| Hosting (planned) | Vercel (frontend) / Railway (backend) | Free tiers, zero-config deploy |

## 3. Data Model

Core tables: `users`, `projects`, `scripts`, `scenes`, `storyboard_frames`,
`versions`, `comments`, `subscriptions`. Full schema in
`supabase_schema.sql`. Key relationships:

```
users 1──* projects 1──1 scripts 1──* scenes 1──* storyboard_frames
scripts 1──* versions
scripts 1──* comments
users 1──* subscriptions
```

## 4. API Contract (summary — see /docs for live spec)

| Domain | Base path | Key endpoints |
|---|---|---|
| Auth | `/auth` | register, login, me |
| Projects | `/projects` | CRUD |
| Scripts | `/scripts` | generate-structure, generate-scene, improve, suggest, save, finalize |
| Storyboard | `/storyboard` | generate, regenerate, get |
| Versions | `/versions` | save, list, restore, diff |
| Collaboration | `/collaboration` | comments CRUD |
| Export | `/export` | script/pdf, script/word, package |

Full interactive spec always available at `localhost:8000/docs` (Swagger,
auto-generated from FastAPI).

## 5. Security Requirements (see AUDIT_REPORT.md for current status)

- Every script-scoped endpoint MUST call `require_script_access()` before
  touching data — resolves script → project → owner, returns 404 (not 403)
  on mismatch to avoid ID enumeration
- Passwords: bcrypt hash only, never logged, never in any response model
- JWT: signed with a strong random secret (⚠ currently has an insecure
  fallback — must fix before deploy), 7-day expiry
- Rate limiting required on `/auth/login` before public launch
- CORS: explicit origin allowlist, update for production domain only
- All updatable fields use whitelists (no raw dict mass-assignment)

## 6. AI Integration Details

**Script generation system prompt** (Baakhapaa style guide) is injected on
every Claude call — see `script_engine.py` `BAAKHAPAA_STYLE` constant.
Covers: tone, youth-focused characters, Nepali/English dialogue mixing,
avoiding melodrama/cliche.

**Three-act structure formula:** Act 1 = duration × 0.33, Act 2 = duration
× 0.33, Act 3 = remainder (~0.34). Scenes tagged `major` (turning point) or
`minor` (transition), each with its own time allocation.

**Storyboard shot-type auto-assignment logic** (in `storyboard_engine.py`):
first/last scene → Wide Shot; Act 2 climax → Close Up; major scene → Medium
Shot; minor → Medium Wide Shot.

**Failure handling:** every AI call wrapped in try/except → `HTTPException
(503, ...)` on failure, never a raw stack trace to the client. Malformed AI
JSON output uses `.get()` with defaults rather than direct key indexing.

## 7. Environments

| Env | AI/DB behavior |
|---|---|
| **Demo mode** (current, placeholder `.env` keys) | Mock in-memory DB, mock AI responses, placeholder storyboard images — zero API cost, resets on backend restart |
| **Dev (real keys)** | Real Supabase, real Claude/DALL-E calls, costs apply |
| **Production (future)** | Real keys + deployed on Railway/Vercel + production CORS/JWT secret |

## 8. Deployment Plan (when ready)

1. Provision real Supabase project, run `supabase_schema.sql`
2. Set real `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `SUPABASE_URL`,
   `SUPABASE_KEY`, strong `JWT_SECRET` in Railway env vars
3. Deploy backend to Railway (`railway up`)
4. Deploy frontend to Vercel (`vercel --prod`), set
   `REACT_APP_API_URL` to the live Railway URL
5. Update backend CORS to allow the live Vercel domain
6. Smoke-test full flow against production before sharing the URL

## 9. Known Technical Debt

- Version diff is set-based (should move to `difflib` for ordered,
  duplicate-aware diffing)
- Screenplay editor column CSS needs a width/layout fix
- Realtime presence untested against a live (non-mock) Supabase project
- No automated test suite yet — all testing has been manual/exploratory

## 10. Related Documents

PRD.md, CLAUDE.md, AUDIT_REPORT.md, HANDOVER.md, supabase_schema.sql
