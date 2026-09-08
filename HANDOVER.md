# Handover — 2026-09-08

Supersedes the 2026-08-27 handover. Its environment notes and Windows gotchas
still hold and are repeated below; its test counts and its "next session" list
do not.

| It said | Actually |
|---|---|
| "731 backend / 995 frontend tests" | Frontend is **1060 across 54 files**. Backend is still **731 plus one uncommitted new test** — the suite has not been run since |
| "Next session: run with real keys, deploy, pilot" | **None of it moved.** All six items are blocked on credentials or calendar time, and were blocked for this whole session too |
| "`ScriptEditor.jsx` is 1,587 lines … expect the next serious regression here" | It had grown to **2,397**. Now **1,511**, split into three components |
| — | The app has now been **opened on a real phone**, which is new, and it found five faults in ten minutes |

**Read `WORK_LIST.md` for the build queue.** Days 1–4 are done, Day 5 is half
done and the remaining half needs the device again. This file is the narrative.

---

## 1. Environment (unchanged — still demo mode)

All `.env` keys are placeholders, so the app runs on local **SQLite**, **mock
Claude**, **mock DALL-E**, **mock Stripe**. Embeddings are real, computed
locally by fastembed with no API key.

```
cd baakhapaa-backend && ./venv/Scripts/python -m uvicorn main:app --port 8000   # no --reload on Windows
cd baakhapaa-frontend && npm start
```

**Nothing has ever run with real keys.** Still the largest unknown in the
project, and it has not moved for three sessions.

Three gotchas, the first two carried forward and still true:

- **The backend does not hot-reload.** It runs without `--reload`, so a backend
  edit needs a manual restart.
- **Vite's CSS hot-reload can serve a stale stylesheet.** Hard-reload
  (Ctrl+Shift+R) before investigating a style change that appears to do nothing.
- **`test@example.com` / `password` does not exist in this database.** The demo
  seed only runs on an *empty* one (`database.py`, the `if not
  data_store.get("users")` guard) and this DB has accounts. Delete
  `baakhapaa_local.db` to get it back, or use a throwaway registration.

### Serving to a phone

New this session, and there is a trap in it. `--host` publishes the dev server
on the LAN, but the app then still called the backend on its own port and its
own address. This machine's Ethernet is classified a **Public** network, where
`node.exe` has an inbound firewall allow rule and the backend's venv Python does
not — so the page loaded on the phone and every request from it failed. The app
running, and nothing in it working.

The dev server now proxies `/api` to the backend over loopback (`f0a50fa`), so
only one port has to be reachable and there is no CORS at all. Launch entries
`backend-lan-8001` and `frontend-lan-3001`; the odd ports are only because 8000
and 3000 were taken.

    http://192.168.1.85:3001        the phone's URL
    http://192.168.1.85:3001/api/health   check this first

The LAN servers died once mid-session and the phone simply got nothing. Check
`/api/health` before blaming the app.

---

## 2. What changed this session

Six commits on `fix/craft-and-patterns-ux`.

### Every page now fits a phone (`05539c5`)

Day 2 had fixed the editor header by hand and left eight pages nobody had
looked at. `baakhapaa-frontend/scripts/responsive-audit.mjs` now walks all
fourteen routes at any width, reporting horizontal overflow and targets under
WCAG 2.2's 24px floor. Clean at 375, 360 and 320. The report is
`baakhapaa-frontend/docs/responsive/audit-2026-09-08.md`.

**Its first run found nothing, and that was the first bug.** Every protected
route reported the same two faults — a 20px "Back" and "Skip for now" — which
exist on none of those pages. A freshly-registered account has not answered
onboarding, so `ProtectedRoute` redirected all nine and the audit read the same
wizard nine times while printing eight other route names beside it. It reported
faults, so it did not look broken.

What the real run found: one shared header at 610px in a 343px budget, of which
129px was a wordmark linking to `/dashboard` — which the `Projects` tab beside
it already does; a runtime slider whose *element* was 2px tall with a 12px thumb
drawn overflowing it, so it could not be dragged with a thumb at all; eleven
controls under 24px; and both auth pages scrolling sideways at 360 and 320 while
clean at 375, because a flex panel with the default `min-width: auto` sat at a
constant 368px.

**360px, not 375.** That is the common low-end Android width and most of this
market. A pass at one width finds one width's bugs.

### The editor is three files (`b0597dc`, `59646e5`)

`ScriptEditor.jsx` had grown to 2,397 lines. It is 1,511, plus `EditorHeader`
(399), `AssistPanel` (515), `ScriptPage` (183) and `utils/draft.js` (47). Every
one of the 92 ScriptEditor tests passes **unedited**, which was the standard set
for the split.

The half that did not happen is the more useful half. The plan said to move each
piece of state to whichever component owns it. Measured: of the fifteen
candidates in the assist panel, every one is also read outside it, by
`handleAI`, `acceptAI`, `loadPatterns` and three effects — all of which reach
for the caret, the textarea and the draft. The panel takes forty-odd props
because its state stayed behind, and the prop list is now the written record of
that coupling rather than something invisible inside one file.

Then the toolbar stopped re-rendering on every keystroke: 2.64 renders per
character to zero. `memo()` was not what did it — the header's two handlers
close over the draft and were new functions every keystroke, so memo would never
have hit. Neither is ever read, only called from a click, so a ref holding the
latest version is exact rather than a cache. The numbers are in `WORK_LIST.md`.

### A phone found five things in ten minutes (`61e44ae`)

This is the part worth reading. Four of the five were invisible to every check
in this repo.

**The assist panel was covering the page on every phone and tablet.** It is a
sheet parked off-canvas with `translate-x-full`, and it was not parked: the same
element carried `animate-fade-up`, which ends on `transform: translateY(0)` with
`animation-fill-mode: both`. An animated transform outranks a declared one,
permanently. At 375px it covered the toolbar and every line of the script; at
820px it cut action lines off mid-word. It reads as a z-index bug and is a
specificity one — and **the responsive audit had passed that route fourteen
times**, because a fixed overlay does not overflow anything.

**The caret sat before `INT.`** A textarea starts every session with
`selectionStart` at 0, so any focus carrying no position — a phone keyboard
opening — put the insertion point in front of the first slugline. Open
yesterday's script, the keyboard comes up, type, and the words go in before the
scene heading. It is now parked at the end of the draft on load, once, in an
effect after the commit that put it there. Nothing is focused; tap placement was
measured first (off by zero) and is untouched.

**The script was too small to write in, and deliberately so.** The font is sized
so all 61 screenplay columns fit, which at 375px means 9.5px. The floor is now
12px, about 49 columns. The whole cost is that on-screen wraps no longer match
the PDF's — page numbering counts hard newlines, not visual wraps, so `p. N / M`
and the export are unaffected. `--page-font-min` in `index.css` is the one
number to change if 12px is still wrong.

**The course had no sidebar on a phone.** The two-column grid collapses to one,
so all nineteen lesson titles sat above the lesson and every lesson after the
first began with a scroll past the table of contents. It is a disclosure below
`lg` now. All 51 Learn tests pass unedited.

**The new-project Details row broke twice.** The summary wrapped instead of
truncating, dropping "Bilingual" outside the row; and Genre and Tone side by
side clipped their own values, so the Tone field read "Emotion" — a different
word.

### Serving the production build locally (`c0dcb63`)

`npm start` serves modules through Vite and is not the artifact that ships.
`frontend-preview` serves `build/` on 4173, which is where Day 1's route
splitting is observable and where an SPA deep link either falls back to
`index.html` or 404s. Verified end to end against the backend.

---

## 3. Open, and known

Three things were found and not closed. None is speculative; each has a trace
behind it.

1. **"Could not load this script." on roughly one open in eight.** StrictMode
   fires two identical loads; the loser comes back as a bare network error with
   no response on it, and `loadError` was never cleared again — so a script that
   had loaded perfectly showed an error screen, permanently. That is also the
   shape of every dropped request on a flaky connection, which is the connection
   this product is for. A `live` guard plus clearing the error on entry is **in
   the working tree, unverified and uncommitted.**
2. **Autosave failed with "Script not found"** in one trace where the editor was
   opened by *project* id rather than script id. `scripts.save` puts to
   `/scripts/{id}` using the route param, and the load path deliberately accepts
   either kind of id — so when it falls back, every later call using that param
   is addressing the wrong resource. Observed once. Not confirmed, not fixed,
   and worth confirming first: if it is real, a shared editor link silently
   stops saving.
3. **The `recommendation_log` read collapse is uncommitted.** Three identical
   SELECTs per craft-panel request became one; a test counts the reads and was
   proven to fail when the change is reverted. **The full backend suite has not
   been run against it.** That is the first thing to do next session.

---

## 4. What will bite you

Carried forward, still true, plus what this session added.

1. **Four migrations, not three.** `project_invites` joins the three already
   unapplied. `DEPLOYMENT.md` §1 has the order. The email-normalisation one is
   the only one that can fail on real data.
2. **The mock DB is schemaless.** It stores rows as flat JSON, so it accepts
   columns Postgres would reject. Three schema-drift bugs so far.
3. **Restart the backend after editing it.** See §1.
4. ~~`ScriptEditor.jsx` is 1,587 lines~~ — split, §2. What remains genuinely is
   interdependent: the draft is read by the scene sync, the pagination, the
   linter, the benchmark and the exports.
5. **CSS cannot be tested.** `vite.config.js` sets `css: false` for vitest, so
   every breakpoint is verified in a browser or not at all. This is not a
   footnote: **four of the five faults the phone found were CSS**, and the two
   automated suites are both green through all of them.
6. **Test isolation:** the mock store is process-global. Tests that register an
   address must generate a unique one — `tests/test_invites.py` has a
   `_address()` helper.
7. **An audit that passes is not a page that works.** `responsive-audit.mjs`
   checks two properties: horizontal overflow and target size. It has nothing to
   say about a fixed overlay, contrast, or text too small to read — and it
   passed the editor while the assist panel was sitting on top of it.

---

## 5. Next session — in order

1. **Run the backend suite** and commit the `recommendation_log` change, or
   revert it. Leaving it in the tree is the worst of both.
2. **Confirm or dismiss the autosave/project-id bug** in §3.2. It is cheap to
   check and expensive to ship.
3. **Finish Day 5 on the device**: the 44px hit areas under a thumb, focus mode
   against the collapsing address bar, and the craft panel sheet and corkboard —
   none of which was reached. The five faults already found are the argument for
   doing the rest.
4. **Run the system once with real keys.** One environment, real Claude, DALL·E
   and Supabase, and one walk from register → structure → write → storyboard →
   export. Apply the four migrations at the same time. Everything below assumes
   a system that works, and that assumption is still untested.
5. **Run the five-writer pilot** (`PILOT.md`).
6. **Deploy** — Supabase, Railway, Vercel, in that order (`DEPLOYMENT.md` §1–3).
   Merchant accounts need a live URL, so they come after Vercel.
7. **Reconsider pricing before taking money**, and add an annual price: Khalti
   and eSewa have no subscription primitive, so every month is a fresh chance to
   lapse.
8. **SMTP + cron for `renewals.py`.**

### Still open, smaller

- `PROJECT_PLAN.md` §6/§7 carry the changelog; `MONTH_1_REPORT.md` and
  `SESSION_SUMMARY.md` are historical records, deliberately left as written.
- The corpus fingerprints task (E6) is still blocked — the corpus is on another
  machine.
- The branch has never been merged to `codebase`. Deploying from a non-default
  branch is how the wrong thing gets deployed.
- Throwaway accounts (`ui-check@`, `probe-1@`, several `audit-*@`) and their
  projects are in the local SQLite DB. Delete `baakhapaa_local.db` to reset.
