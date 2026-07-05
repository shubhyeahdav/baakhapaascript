# Audit Report — 2026-07-05

Full audit pass of backend + frontend before new feature work.
Every issue below was **fixed in this pass** unless marked otherwise.
Items tagged **⚠ REVIEW** touch auth/data-access — double-check these yourself.

---

## 1. Backend

### 🔴 Critical — fixed, ⚠ REVIEW

**B1. Missing ownership checks on almost every script-related endpoint.**
Any authenticated user could read, edit, finalize, export, comment on, restore
versions of, or generate storyboards for *any other user's* script just by
guessing/knowing a script id. Affected: `scripts.py` (get/save/finalize/
generate-structure), `versions.py` (all four routes), `collaboration.py`
(add/get comments), `storyboard.py` (all four routes), `export.py` (all three).
Only `projects.py` was safe.
**Fix:** new `require_script_access(script_id, user_id)` helper in `auth.py`
(resolves script → project → owner via `database.get_script_owner`), applied to
every affected route. Returns **404 (not 403)** so ids can't be probed for
existence. Storyboard frame routes resolve frame → scene → script first
(`database.get_frame_script_id`).
**Verified:** cross-user test — user B gets 404 reading/editing/exporting user
A's script and versions; user A still gets 200.

**B2. Mass-assignment in `PUT /projects/{id}` and `PUT /storyboard/{frame_id}`.**
Both accepted a raw `dict` and wrote it straight to the DB — a client could
overwrite `user_id`, `id`, or any column.
**Fix:** whitelists (`PROJECT_UPDATE_FIELDS`, `FRAME_UPDATE_FIELDS`); unknown
fields are dropped, empty updates get 400.

### 🟠 Bugs — fixed

**B3. `GET /versions/diff/compare` crashed with 500** (`IndexError`) when either
version id didn't exist. Now returns 404, and both versions must belong to the
caller's script (⚠ REVIEW — part of B1 surface).

**B4. `generate-structure` could 500 on malformed AI output** — scene inserts
indexed required keys (`scene["title"]` etc.) directly. Now uses `.get()` with
defaults so one incomplete scene can't crash the request.

**B5. Register endpoint could 500 on insert failure** (e.g. unique-email race
against the DB constraint). Now wrapped, returns a clean 400.

**B6. Export endpoints crashed if `content` was NULL** — `None.split()`.
Now coerced to `""`.

### ✅ Checked clean

- **SQL injection:** none possible — all queries go through the Supabase client
  builder (parameterized); no raw SQL anywhere.
- **Passwords:** bcrypt-hashed on register; never logged; never included in any
  response model (`UserResponse` has no hash field); login errors don't reveal
  whether email exists.
- **JWT:** `jose.jwt.decode` verifies signature and expiry; expired/garbage
  tokens correctly get 401 (tested). 7-day expiry per convention.

### ⚠ Security concerns for YOUR attention (not fully fixable by me)

- **S1. `JWT_SECRET` fallback:** `auth.py` falls back to `"fallback-secret"` if
  the env var is missing, and the committed-then-untracked `.env` used a
  guessable default. **Before any deployment: set a long random `JWT_SECRET`.**
  Anyone knowing the secret can forge tokens for any user.
- **S2. No rate limiting** on `/auth/login` — brute-force is possible. Fine for
  local dev; add rate limiting (or Supabase Auth) before going public.
- **S3. Mock-mode test user** (`test@example.com` / `password`, pro tier) is
  compiled into `database.py`. It only exists when Supabase env vars are
  placeholders, but make sure real deployments always have real keys.
- **S4. CORS** allows localhost:3000/3001 only — remember to update for the
  production domain (and nothing wider).

---

## 2. Frontend

### 🟠 Bugs — fixed

**F1. Failed login wiped its own error message.** The axios 401 interceptor
redirected (full page reload) to `/login` on *any* 401 — including a wrong
password on the login page itself. Fix: interceptor now skips `/auth/*` calls.

**F2. Unhandled promise rejections** in `ScriptEditor` (auto-save,
finalize, export had no catch) and `StoryboardView` (initial frame load).
All wrapped; finalize/export show an alert, auto-save logs to console,
frame-load failure falls back to empty state.

**F3. Editor hung forever on load failure** (fixed just before this audit,
commit `88fa3db`): load errors now show a message + "Back to Dashboard".

**F4. Register allowed 1-character passwords** — added `minLength={6}`
(bcrypt hashing was never the issue; this is UX-level validation).
Existing validations confirmed: email format (`type=email`), required fields,
confirm-password match.

**F5. Console noise:** React Router v7 future-flag warnings on every
navigation — enabled `v7_startTransition` + `v7_relativeSplatPath` flags.
After the sweep (login, register, pricing, dashboard, editor, storyboard):
**zero console errors**.

### ✅ Checked clean

- **Token handling:** missing token → clean redirect to login; corrupted token →
  `/auth/me` 401 → token removed → login (verified). No crash paths found.

---

## 3. Run & test results

- Both servers start clean (backend prints expected demo-mode warnings).
- **Full flow tested end-to-end via API:** register → login → create project →
  generate structure (3 acts / 5 scenes) → generate storyboard (5 frames) →
  export PDF (valid `%PDF` file). All 200.
- **Browser flow:** login → dashboard → open project card → editor → storyboard,
  no console errors.
- **Security regression suite:** 6/6 pass (see B1).

## 4. Code quality

- Removed dead models `ProjectResponse`, `SceneCreate` and unused `Optional`
  import (`models.py`).
- Removed unused dependency `python-multipart` from `requirements.txt`; all
  `package.json` deps confirmed in use.
- Deduplicated `userLabel`/`formatTime` helpers (VersionHistory +
  CommentThreads) into `src/utils/format.js`.
- Error message format standardized: backend raises `HTTPException(status, detail)`
  everywhere; frontend surfaces `err.response?.data?.detail` with a fallback.

## Known limitations (not bugs)

- Mock DB is in-memory: data resets on backend restart.
- Demo AI/storyboard content until real API keys are set.
- Supabase realtime presence untested against a live project.
- `versions.py` diff is set-based (unordered, ignores duplicates) — crude but
  functional; consider `difflib` if diff quality matters.

---

**Verdict:** all found issues fixed; items S1–S4 and the B1/B2 access-control
changes need your explicit review before any public deployment.
