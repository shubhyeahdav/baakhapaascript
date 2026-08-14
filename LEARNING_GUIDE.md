# Learning Guide — Understanding Baakhapaa

A beginner-friendly path to understanding this project. Assumes you know basic
coding (variables, functions, if/else) but are new to web apps. Work through it
top to bottom — don't skip to the exercises.

---

## 0. Run it first (see it alive before reading code)

Open two terminals.

**Backend:**
```
cd baakhapaa-backend
./venv/Scripts/python -m uvicorn main:app --port 8000
```
Then open http://localhost:8000/docs — an auto-generated page listing every
endpoint. You can click one, hit "Try it out", and run it live. This is the
single best tool for learning the backend.

**Frontend:**
```
cd baakhapaa-frontend
npm start
```
Open http://localhost:3000 (or :3001). Log in with `test@example.com` / `password`.

> The demo database is **SQLite on disk** (`baakhapaa-backend/baakhapaa_local.db`),
> so restarts keep your accounts and projects. Delete that file to reset.
> (An earlier version of this guide said in-memory — that changed in `80c4da2`.)

---

## 1. The mental model (read this twice)

A web app is three programs talking over the internet:

```
  BROWSER  ─── request ──►  SERVER  ─── query ──►  DATABASE
 (frontend)  ◄── answer ──  (backend) ◄── rows ──  (storage)
```

- **Frontend** (`baakhapaa-frontend/`) — what you see. Runs in the browser.
  Never touches the database directly.
- **Backend** (`baakhapaa-backend/`) — the rules. Checks "are you allowed?",
  talks to the database and AI, returns answers as JSON.
- **Database** — permanent storage (users, projects, scripts).

**Golden rule:** the browser can be tampered with, so every important check
(login, "is this your project?") lives in the **backend**, never the frontend.

A **request** is a message like `POST /auth/login`. A **response** comes back
with a status code: `200` = ok, `401` = not logged in, `404` = not found,
`503` = a service (like the AI) failed.

---

## 2. Folder map

**Backend** — one file per topic:
| File | What it does |
|---|---|
| `main.py` | Startup; connects all routes. The front door. |
| `auth.py` | Register, login, passwords, tokens, permission checks. |
| `models.py` | The *shape* of data (what a "project" looks like). |
| `database.py` | Reading/writing the database. |
| `projects.py` / `scripts.py` / `storyboard.py` / `versions.py` / `collaboration.py` / `export.py` | One topic of endpoints each. |
| `script_engine.py` / `storyboard_engine.py` | The AI calls (Claude, DALL·E). |
| `rag.py` | Semantic search over the craft library (local embeddings, no API key). |
| `screenplay.py` | Turns editor text into typed elements and scenes. The parser everything else reads. |
| `linter.py` | Deterministic craft diagnostics. **No AI at all** — pure rules. |
| `fingerprint.py` / `benchmark.py` | Measures a script; compares its shape to corpus percentiles. |
| `updates.py` / `rate_limit.py` | Small shared helpers (field whitelisting, per-IP limits). |

**Frontend** (`src/`):
| Folder/File | What it does |
|---|---|
| `pages/` | Full screens (LoginPage, Dashboard, ScriptEditor). |
| `components/` | Reusable pieces (Sidebar, ProjectCard, VersionHistory). |
| `services/api.js` | Every call to the backend lives here. |
| `context/AuthContext.jsx` | Remembers who is logged in, app-wide. |
| `App.jsx` | The map: which URL shows which page. |

---

## 3. Trace ONE feature across every layer

This is how you actually learn. Follow **"user logs in"** by opening files in
this exact order:

1. `src/pages/LoginPage.jsx` — the form. Find where "Sign In" calls `login()`.
2. `src/context/AuthContext.jsx` — `login()` calls the API and saves the token.
3. `src/services/api.js` — `auth.login()` sends `POST /auth/login`.
4. `baakhapaa-backend/auth.py` — the `login()` function receives it, checks the
   password with bcrypt, and returns a **JWT token** (a signed digital ID card).
5. Back in `AuthContext.jsx` — the token is saved in `localStorage` and attached
   to every future request (see the "interceptor" in `api.js`).
6. `auth.py` `get_current_user()` — reads that token on protected routes to know
   who you are.

Once this clicks, trace **"generate script"** the same way (NewProject.jsx →
api.js → scripts.py → script_engine.py). Every feature is this same pattern:
**page → api.js → backend route → check → data → response.**

---

## 4. Hands-on exercises (do these — don't just read)

For each: **change it → predict what happens → verify in the browser.**
After each experiment you can undo with `git checkout .` if needed.

**Exercise 1 — Frontend text (easiest).**
In `src/pages/LoginPage.jsx`, find the "Welcome back" heading and change the
text. Save. The browser auto-refreshes. *Predict: only the login page changes.*

**Exercise 2 — Follow data to the screen.**
In `src/pages/Dashboard.jsx`, find where it shows the project count. Add a new
`<Stat>` (copy an existing one). *Predict where the number comes from* — trace
it back to `projects.getAll()` in `api.js`.

**Exercise 3 — A backend rule.**
In `baakhapaa-backend/models.py`, the `UserCreate` model requires a password.
Open http://localhost:8000/docs, try `POST /auth/register` with a missing field,
and read the error. *Predict: the backend rejects it before any code runs* —
that's what `models.py` is for (input validation).

**Exercise 4 — Security check (most important concept).**
Read `require_script_access()` in `auth.py`. Then in `/docs`, log in as one user,
create a project, and try to open another user's script id. *Predict: 404.*
This is how the app stops users seeing each other's data.

---

## 5. From "works on my laptop" to production

**Production** = running for real users on the internet, reliably and safely.
Concepts this project already teaches:
- **Auth & security** — hashed passwords, JWT tokens, ownership checks (`auth.py`).
- **Separation of concerns** — frontend / backend / database, each one job.
- **Secrets in `.env`** — API keys never written in code.
- **Environments** — "demo mode" (fake data) vs real mode with keys.

**The gap to real production** is the checklist in `AUDIT_REPORT.md`:
- Real database + real API keys (currently mocked)
- Strong `JWT_SECRET`, login rate-limiting, correct CORS
- **Deployment** — frontend to Vercel, backend to Railway (per README), so it
  gets a public URL
- Logging/monitoring so you know when something breaks

---

## 6. Suggested study order (2–3 weeks, casually)

1. Learn what HTTP requests + JSON are (any short tutorial). ~1 day.
2. Read `main.py`, then `auth.py`, then `projects.py`. Notice the repeated shape.
3. Play with `/docs` — run every endpoint by hand.
4. Read `api.js`, then `Dashboard.jsx`.
5. Do the 4 exercises above.
6. Trace a second feature end-to-end on your own.
7. Read `AUDIT_REPORT.md` to see what "shipping for real" requires.

**Don't try to understand everything at once.** Master the login flow first —
it contains every concept. Everything else is a variation on it.
