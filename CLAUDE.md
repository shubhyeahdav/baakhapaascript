# Baakhapaa

AI-powered pre-production system for screenwriting and storyboarding.

## Tech Stack
- **Backend**: FastAPI (Python), Supabase (Postgres) for data, JWT auth
- **AI**: Anthropic Claude API (script generation), OpenAI DALL-E 3 (storyboard images)
- **Frontend**: React 18, React Router, Tailwind CSS, axios

## Conventions
- All secrets (Anthropic key, OpenAI key, Supabase URL/key, JWT secret) live in `.env` files — never hardcode keys. Backend: `baakhapaa-backend/.env`. Frontend: `baakhapaa-frontend/.env`.
- Every backend endpoint that calls an external AI API wraps the call in try/except and raises `HTTPException(status_code=503, ...)` on failure — AI providers are unreliable, and callers need a clean error instead of a stack trace.
- Dark theme colors (defined in `tailwind.config.js` and `index.css`):
  - Background: `#0A0A0A`
  - Surface: `#141414`
  - Elevated: `#1C1C1C`
  - Border: `#2A2A2A`
  - Gold accent: `#D4A843` (hover: `#E5BC5A`)

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
Runs at http://localhost:3000.

## Current State

**Working:**
- Auth (register/login/JWT, protected routes)
- Project CRUD
- Script generation (3-act structure, scene generation/improve/suggest via Claude)
- Storyboard generation (DALL-E 3 frames per scene)
- Script export (PDF, Word, production package)

**Backend routes exist but have no frontend UI yet:**
- Real-time collaboration (comments — `collaboration.py`)
- Version history (save/restore/diff — `versions.py`)
- Subscriptions/payments (`subscriptions` table exists, no routes or UI)
