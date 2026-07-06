# Handover — 2026-07-06

End-to-end test of the core creative flow, plus one bug fix found during testing.

## Environment under test
- **Demo mode** (no real keys): `.env` still has placeholder Anthropic / OpenAI /
  Supabase values, so the backend runs with the **Mock Supabase DB** and **Mock AI**.
  No external API credits were spent during this test.
- Backend: `uvicorn main:app` on `127.0.0.1:8000` (run **without** `--reload` per the
  Windows note in CLAUDE.md). Frontend: CRA dev server on `localhost:3001`.
- Reminder: the mock DB is **in-memory** — restarting the backend wipes all users,
  projects, and scripts (re-register after any restart).

## What was tested and confirmed working today

The full chain was exercised twice: once directly against the API (curl) and once
through the browser UI (register form → editor). Both passed.

| # | Step | Result |
|---|------|--------|
| 1 | **Register** a new account (`/register` form) | ✅ 200 — account created |
| 2 | **Login** / auto-login after register | ✅ 200 — JWT issued, redirect to `/dashboard` |
| 3 | **Create project** via the New Project form (title, genre, tone, audience, duration, language) | ✅ 200 — project persisted |
| 4 | **Generate three-act structure** (Claude, mocked) | ✅ 200 — 3 acts, 5 scenes returned and stored |
| 5 | **Open the script editor** (`GET /scripts/{id}`) | ✅ 200 — scenes load into the Scene Index Cards |
| 6 | **Generate a scene** with the AI Assistant (Generate mode) | ✅ 200 — screenplay text returned |
| 6b | **Accept** the AI output into the editor | ✅ inserted into the editor textarea (verified 629 chars) |

- Browser console during the flow: **no warnings or errors**.
- The three-act structure returned by the AI is: **Act 1 – Setup** (Morning at the
  Chiya Pasal, Dinner Expectations), **Act 2 – Confrontation** (The Secret Project,
  Found Out), **Act 3 – Resolution** (The Screening).

## Bug found and fixed in this pass

**Scene cards displayed in the wrong order in the editor (demo mode).**
- **Symptom:** after generating the structure, the editor's Scene Index Cards showed
  the scenes ordered by `order_index` only, ignoring `act_number` — so Act 3's
  "The Screening" appeared as scene 3, before Act 1's "Dinner Expectations".
  Displayed order was: Morning → The Secret Project → The Screening → Dinner
  Expectations → Found Out.
- **Root cause:** `baakhapaa-backend/database.py`, the mock Supabase client.
  `get_scenes_by_script()` calls `.order("act_number").order("order_index")`, expecting
  a compound sort (primary = act, secondary = order within act). The mock's `order()`
  sorted `filtered_records` in place on **each** call, so the second `.order()` fully
  re-sorted by `order_index` and discarded the act-level ordering. (Real Supabase treats
  chained `.order()` calls as a compound sort, so this only manifested in demo mode.)
- **Fix:** `order()` now **accumulates** `(field, desc)` specs and `execute()` applies
  them as a **stable compound sort** (least- to most-significant, so the first
  `.order()` is the primary key). Single-key ordering (projects list, version history)
  is unchanged.
- **Verified after fix** (backend restarted): both the API response and the browser
  Scene Index Cards now show the correct narrative order —
  **Morning at the Chiya Pasal → Dinner Expectations → The Secret Project → Found Out → The Screening.**

No other changes were made — scope was limited to the register → login → project →
structure → editor → scene chain.

## Issues noticed but NOT fixed (out of scope for this pass)

1. **Screenplay editor column looks very narrow** — the editor `<textarea>` renders in
   a thin column (its placeholder wraps one character per line, visible in a fresh, empty
   editor). Purely cosmetic CSS in the `.screenplay-page` / `.screenplay-container`
   layout; the editor is fully functional (typing, Tab/Enter formatting, and Accept-from-AI
   all work). Worth a styling look, but it is not part of the tested chain.
2. **Pre-existing security items from `AUDIT_REPORT.md` (S1–S4) still stand** and must be
   handled before any deploy: guessable `JWT_SECRET` fallback, no login rate limiting,
   the compiled-in mock test user (`test@example.com` / `password`), and localhost-only
   CORS. None are blockers for local demo use.
3. **Storyboard / export / finalize** steps were **not** part of the requested chain and
   were not re-tested here (they were covered in the 2026-07-05 audit).
4. **Environment noise (not an app issue):** the `claude-mem` plugin worker is unreachable
   and its hooks emit errors on most tool calls. It does not affect Baakhapaa.

## How to reproduce the test locally
1. Backend: `cd baakhapaa-backend && ./venv/Scripts/python -m uvicorn main:app --port 8000`
   (expect the three "Running with Mock ..." warnings).
2. Frontend: `cd baakhapaa-frontend && npm start` (opens on 3000/3001).
3. Register a new account → you land on the dashboard → **New Project** → fill the form →
   **Generate Project Structure** → you land in the editor with 5 scenes in act order →
   in the **AI Writer** panel, type a scene description → **Execute AI Action** → **Accept**.
