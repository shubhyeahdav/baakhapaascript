# Handover — 2026-09-08, extended 09-09

Supersedes the 2026-08-27 handover. Its environment notes and Windows gotchas
still hold and are repeated below; its test counts and its "next session" list
do not.

| It said | Actually |
|---|---|
| "731 backend / 995 frontend tests" | **869 backend across 51 files**, **1060 frontend across 54**. The backend number had been stale for a while — nobody had counted since the 27th |
| "Next session: run with real keys, deploy, pilot" | **None of it moved.** All six items are blocked on credentials or calendar time, and were blocked for this whole session too |
| "`ScriptEditor.jsx` is 1,587 lines … expect the next serious regression here" | It had grown to **2,397**. Now **1,511**, split into three components |
| — | The app has now been **opened on a real phone**, which is new, and it found five faults in ten minutes |

**Read `WORK_LIST.md` for the build queue.** Days 1–4 are done, Day 5 is half
done and the remaining half needs the device again. This file is the narrative.

---

## 1. Environment — NOT demo mode any more

This changed under the documentation, and the documentation did not notice.
`.env` now holds real Anthropic, OpenAI and Supabase credentials. Asked
directly, the app says:

    LLM provider   : anthropic | MOCK_AI = False | model claude-sonnet-5
    storyboard     : MOCK = False
    database       : REAL Supabase

So reads and writes go to the real Postgres, and a generation call is billed to
a real account. `baakhapaa_local.db` was last written on **7 September** and is
no longer the store — which means two days of responsive-audit and probe runs
created accounts and projects in the **real** database while every doc in the
repo said they were going into a local file. Delete those before a pilot:
`probe-1@example.com`, `local-deploy@example.com`, and several
`audit-*@example.com`.

Check the mode before testing against a running server, rather than trusting
this file:

    ./venv/Scripts/python -c "import database,script_engine as s; print(database.use_mock, s.PROVIDER)"

**Payments are the one thing still unproven.** Sandbox and demo paths only, no
real money has moved. Embeddings were always real — fastembed, local, no key.

### The first thing real Supabase broke

Opening a script 500'd about one request in eight, with
`httpx.RemoteProtocolError: Server disconnected` underneath it. The editor fires
eight requests at once on open — the script, versions, comments, the access log,
the lint, the benchmark — and any of them could be the one that failed.

Two likelier explanations were tested and were wrong. A 30-request burst down
one connection never failed. Idle gaps of 30, 45, 60, 75, 90 and 120 seconds
never failed either — httpx already expires a kept-alive connection after five
seconds, so there is no stale connection to hit. **Only concurrency reproduced
it**, at 8 failures in 64.

supabase-py builds its httpx client with `http2=True`, and many streams
multiplexed onto one h2 connection all die together when the server closes it.
`database.py` now gives PostgREST an HTTP/1.1 client, so each request takes its
own connection out of the pool and one closing takes nothing else with it.
Nothing is lost: these are small sequential queries from a server, not a browser
fetching a hundred assets. **0 failures in 96** after.

`supabase_concurrency_check.py` is that measurement, kept. The suite cannot
cover this — `tests/conftest.py` sets placeholder Supabase credentials before
the app is imported, precisely so tests never connect out, so the real-client
branch of `database.py` never executes there. Run the script after anything that
touches the client construction.

```
cd baakhapaa-backend && ./venv/Scripts/python -m uvicorn main:app --port 8000   # no --reload on Windows
cd baakhapaa-frontend && npm start
```

**The first real-key walk still has not been done.** Having the keys is not the
same as having walked register → structure → write → storyboard → export with
them, and that walk is what turns "configured" into "works". It is also already
failing at step zero: see the connection fault below.

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

## 2. What changed on the 8th

Six commits on `fix/craft-and-patterns-ux`. Four more followed on the 9th and
are in §3.

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

## 3. Closed on 2026-09-09

All three of the previous day's open items, in order. Each was confirmed with a
measurement before being touched, and each fix was checked by reverting it and
watching the check fail.

1. **"Could not load this script."** — `e96fc1f`. StrictMode fires two identical
   loads; the loser returns a bare network error with no `response` on it, and
   `loadError` was never cleared again, so a script that had loaded perfectly
   showed an error screen permanently. Measured at **7 in 20**, not the 1 in 8
   first guessed. With the `live` guard: **0 in 20**.
   `baakhapaa-frontend/scripts/editor-load-race.mjs` is that measurement, kept —
   a unit test cannot reach a race between two mounts and a real network stack.
2. **Autosave was silently losing work** — `80407b8`, and it was worse than the
   single log line suggested. Opening the editor from a link built out of the
   project list meant every request after the load addressed a script that does
   not exist: autosave PUT to `/scripts/{projectId}`, took a 404, and the page
   went on showing a save indicator. Confirmed by typing a marker, forcing a
   save and reading the script back from the API — not there. Fifteen call sites
   now use `script.id`. Pinned in jsdom, which this one does reach.
3. **The `recommendation_log` read collapse** — `4b36ba6`. Backend suite run:
   **869 across 51 files**, all passing.

### Still open

- **18 throwaway accounts are in the real database**, all `@example.com`, all
  created on 8 September by the responsive-audit and probe scripts while every
  doc said they were going into a local SQLite file. Five real accounts sit
  beside them. They should go before a pilot; the command is in §5.
- Nothing else from the device session. What remains is the half of Day 5 that
  was never reached — see `WORK_LIST.md` — and it needs the phone, not the repo.

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

1. **Delete the test accounts from the real database.** Eighteen
   `@example.com` rows; the five real accounts must not be touched. Dry run
   first — it prints what it would remove and changes nothing:

   ```
   cd baakhapaa-backend
   ./venv/Scripts/python purge_test_accounts.py          # lists them
   ./venv/Scripts/python purge_test_accounts.py --delete # removes them
   ```

2. **Finish Day 5 on the device**: the 44px hit areas under a thumb, focus mode
   against the collapsing address bar, and the craft panel sheet and corkboard —
   none of which was reached. Also whether 12px in the script tab is now right;
   that number was a judgement, not a measurement. Seven faults have come off
   this phone in two days, every one of them past two green suites.
3. **Run the system once with real keys.** One environment, real Claude, DALL·E
   and Supabase, and one walk from register → structure → write → storyboard →
   export. Apply the four migrations at the same time. Everything below assumes
   a system that works, and that assumption is still untested.
4. **Run the five-writer pilot** (`PILOT.md`).
5. **Deploy** — Railway, then Vercel (`DEPLOYMENT.md` §1–3). Supabase is
   already real.
   Merchant accounts need a live URL, so they come after Vercel.
6. **Reconsider pricing before taking money**, and add an annual price: Khalti
   and eSewa have no subscription primitive, so every month is a fresh chance to
   lapse.
7. **SMTP + cron for `renewals.py`.**

### Still open, smaller

- `PROJECT_PLAN.md` §6/§7 carry the changelog; `MONTH_1_REPORT.md` and
  `SESSION_SUMMARY.md` are historical records, deliberately left as written.
- The corpus fingerprints task (E6) is still blocked — the corpus is on another
  machine.
- The branch has never been merged to `codebase`. Deploying from a non-default
  branch is how the wrong thing gets deployed.
- Throwaway accounts (`ui-check@`, `probe-1@`, several `audit-*@`) and their
  projects are in the local SQLite DB. Delete `baakhapaa_local.db` to reset.
