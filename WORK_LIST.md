# Work list — mobile, performance, structure

Written 2026-09-04. Five working days, ordered so the measurement that judges a
change comes before the change.

Companion to `MONTH_3_TASKS.md`, which is the month plan and stands at 82 of 200
done. This is the narrower list that came out of measuring the frontend rather
than guessing at it, and it should be worked first: two of the items here are
worth more to a real user than anything left in Month 3 that is not blocked.

Every task exists because a number said so. The numbers are below, and each day
names the one that produced it. Two things I expected to be problems turned out
to be fine and are recorded as fine, so nobody spends a day on them.

---

## What the measurements say

### Size

| | Source | Tests |
|---|---|---|
| Backend (Python, excl. venv) | 11,564 | 10,595 |
| Frontend (JSX/JS, excl. node_modules) | 11,877 | 10,831 |
| **Total** | **23,441** | **21,426** |

44,867 lines, near 1:1 test to source. That ratio is the healthiest number in
this project and nothing below should be allowed to spend it.

### The two real inefficiencies

**One file holds a fifth of the frontend.**

    ScriptEditor.jsx    2,228 lines    47 useState    76 hooks total

Five times the next largest frontend file. The draft text lives in its state, so
every keystroke re-renders the whole tree. In a product whose promise is keeping
a writer in flow, typing latency is not cosmetic.

**The bundle is one chunk and nothing is lazy.**

    build/assets/index-*.js     476,682 bytes   (146 kB gzipped)
    React.lazy / dynamic imports in src/: 0

Opening `/login` downloads the editor, the storyboard viewer and the 19-lesson
course before you can type an email address. On the 3G connections this product
is being built for, that is several seconds of blank screen. Highest-value
performance work available, and among the cheapest.

### The editor header on a phone

Measured live at 375x812:

    header scrollWidth        1,040 px   in a 375 px viewport
    toolbar group               817 px   12 controls, one flex row
    "Open the assist panel"   left: 828  off-screen
    "Finalize & Storyboard"   left: 877  off-screen

`overflow-x-auto` means it scrolls rather than breaks — sideways, for 2.7
screens. The primary action is off-screen, and so is the assist toggle, which is
the one control that exists *only* on mobile. Because the header scrolls as one
unit, reaching them pushes Back and the title off the left.

`ToolbarMenu` already exists and states the rule in its own docstring: a control
stays on the surface if it is used *while writing*, everything occasional goes
behind a labelled menu. Applied for desktop, never extended down.

### What turned out to be fine

- **Backend request cost.** 39 rows ranked in Python per request is
  microseconds, and it switches to the pgvector RPC above 500 rows.
- **Storyboard generation.** Already parallel at six frames (`e664878`); a
  24-frame board went from ~7.5 minutes to under 90 seconds.
- **Voice findings.** `collapsed_voices` is O(n²) over a cast of ten. Correct,
  and not slow.

---

## Day 1 · Measure, then split the bundle

The biggest user-visible win in the list, and it comes first because it is
independent of everything else. The baseline comes before it because without one
the rest of the day is an opinion.

- [ ] Measure first contentful paint on a throttled 3G profile, cold cache — *not done: the browser tooling here does not throttle reliably, and a fabricated number is worse than none. Bytes over the wire is the exact proxy and was used instead.*
- [ ] Record time-to-interactive on `/login` and on the editor — *not done, same reason. Carried to Day 5, on the real device.*
- [x] Record the initial JS transferred on each of those two routes
- [x] Commit all three numbers before changing anything — *one of the three: bytes. `docs/perf/baseline-2026-09-04.md`.*
- [x] Wrap every route in `App.jsx` in `React.lazy`
- [x] Add one `Suspense` boundary with a real fallback, not a spinner on a blank page
- [x] Confirm `/login` no longer pulls the editor, the course or the storyboard viewer
- [x] Re-measure against the baseline and commit the comparison
- [x] Run the production build and confirm no route regressed
- [x] Run the frontend suite

## Day 2 · The editor header on a phone

The fastest fix in the list for the most obviously broken thing.

- [x] Keep four controls visible below `lg`: Back, truncated title, save state, Assist
- [x] Keep Finalize visible — it is the primary action and is currently 877px off-screen
- [x] Move shortcuts and the script toggle into a `⋯` menu
- [x] Move Import, Share, Export and View into the same menu
- [x] Move Structure and Setup into it as well
- [x] Reuse `ToolbarMenu` rather than writing a second dropdown
- [x] Drop `overflow-x-auto` below `lg` so the header cannot scroll sideways at all
- [x] Leave the desktop header exactly as it is, and prove it with the existing tests
- [ ] Add a test asserting the mobile header's scrollWidth equals its clientWidth — *not possible: `vite.config.js` sets `css: false`, so breakpoints do not exist in jsdom. Verified in a browser at 375px (scrollWidth 375, clientWidth 375); the unit tests pin the menu's contents instead.*
- [x] Check the menu itself fits on a 375px screen and does not run off the right edge

## Day 3 · The other eight pages

Not yet audited. One pass each at 375px, fixing whatever overflows or collides.
The last two tasks are the ones that stop this being a one-off.

Report: `baakhapaa-frontend/docs/responsive/audit-2026-09-08.md`.

- [x] Dashboard
- [x] Settings
- [x] Learn
- [x] Pricing
- [x] Storyboard view
- [x] Exports and Storyboards index pages
- [x] Project setup and New project
- [x] Onboarding
- [x] Write one reusable check that reports horizontal overflow and sub-24px tap targets on any page
- [x] Run it across all nine routes and commit the report as the record of what was fixed — *fourteen routes, and at 375, 360 and 320. All clean.*

Three things worth carrying forward:

- **The script's first run measured nothing.** A freshly-registered account has
  not answered onboarding, so every protected route redirected and the audit
  read the same wizard nine times while printing eight other route names. It
  reported faults, so it did not look broken. It answers onboarding now.
- **360px, not 375.** Both auth pages scrolled sideways at 360 and 320 and were
  clean at 375, because a flex panel with the default `min-width:auto` sat at a
  constant 368px. 360 is the common low-end Android width and is most of this
  market; a pass at one width finds one width's bugs.
- **The runtime slider on `/projects/new` was undraggable on a phone** — a 2px
  element with a 12px thumb drawn overflowing it. Found by the target check, not
  by looking, and it would not have been found by looking.

## Day 4 · Split the editor, then stop the re-render

The split has to come first, or the memoisation lands in a 2,228-line file and
nobody can review it.

Done in two commits: `b0597dc` the split, `59646e5` the memoisation. The file
was 2,397 lines by the time it was opened, and is 1,511 now.

- [x] Extract the header as its own component — `EditorHeader.jsx`, 399 lines
- [x] Extract the assist panel as its own component — `AssistPanel.jsx`, 515 lines
- [x] Extract the page and its status line as its own component — `ScriptPage.jsx`, 183 lines
- [ ] Move each of the 47 pieces of state to whichever component actually owns it — **not possible, and measured rather than assumed.** Of the fifteen candidates in the assist panel, every one is also read outside it: by `handleAI`, `acceptAI`, `loadPatterns` and three effects, all of which reach for the caret, the textarea and the draft. The panel takes forty-odd props because its state stayed behind. The prop list is now the written record of that coupling instead of it being invisible inside one file
- [x] Keep every existing test passing without editing it — a test that needs changing means the split changed behaviour — *92 ScriptEditor tests, untouched*
- [x] Commit the split on its own, with no behaviour change, so the diff is reviewable
- [x] Profile a typing session and record renders per keystroke
- [x] Either uncontrol the textarea or memoise the subtrees that do not depend on `content`
- [x] Confirm the undo stack, autosave, page count and craft panel all still work — `replaceRange` exists because `setContent` discards undo — *verified in a browser, which is the only place it can be*
- [x] Re-measure renders per keystroke, and revert if the number did not move

### The number

Typing 22 characters into an empty draft, with a counter in each component:

    ScriptEditor   4.68/key  ->  4.68/key
    EditorHeader   2.64/key  ->  0
    ScriptPage     2.64/key  ->  2.64/key
    AssistPanel    2.64/key  ->  2.64/key

StrictMode double-invokes render in dev, so the real commit counts are half
these. The comparison is what matters and both runs are the same build.

`memo()` was not what did it. The header calls `handleExport`, which closes over
the project title, and `handleFinalize`, which closes over `saveContent`, which
closes over the draft — so both were new functions on every keystroke and memo
would never have hit. Neither is ever *read*, only called from a click, so a ref
holding the latest version is exact rather than a cache.

The other two did not move and should not have: both take `content` by
necessity. ScriptEditor's own 4.68 is about two commits per keystroke, because
the change event and the caret-tracking event are separate DOM events — React
batches within each and not across them. Merging them would mean routing arrow
keys and clicks through `onChange`, which is a behaviour change, not a
memoisation.

## Day 5 · A real device, and the numbers again

An emulated viewport is the weakest evidence there is for a layout claim. The
dev servers bind to the LAN as of `033ba20`, so this is available.

**Partly done, and it paid for itself in the first ten minutes.** Five faults
came off the phone, four of them invisible to every check in this repo.
`61e44ae`.

- [x] Open the editor on the actual phone and write for ten minutes
- [x] Is 9.5px Courier readable at arm's length? — **no**
- [x] If it is not readable, decide the trade — floor raised to 12px, about 49 columns instead of 61. The cost is that on-screen wraps no longer match the PDF's; page numbering counts hard newlines, so `p. N / M` and the export are unaffected. `--page-font-min` is the one number to change
- [ ] Do the 44px hit areas feel right under a thumb? — not reported either way
- [ ] Does focus mode survive the address bar collapsing? — not reached
- [ ] Check the craft panel sheet and the corkboard on the device, not just the editor — not reached
- [x] Write down everything emulation got wrong — below, and it is the useful output of the day
- [x] Collapse the three separate database reads in `recommendation_log` into one per request — `4b36ba6`. A test counts the reads, and it was proven to fail when the change is reverted
- [x] Re-run both suites and the production build — **backend 869 across 51 files, frontend 1061 across 54, build clean.** The backend count had been recorded as 731/41 since the 27th and nobody had counted since
- [ ] Re-measure first paint on 3G and record the closing number against Day 1 — still blocked for Day 1's reason

### What emulation got wrong

1. **The assist panel was covering the page on every phone and tablet.** It is a
   sheet parked off-canvas with `translate-x-full`, and it was not parked: the
   same element carried `animate-fade-up`, which ends on `transform:
   translateY(0)` with `animation-fill-mode: both`, and an animated transform
   outranks a declared one, permanently. At 375px it covered the toolbar and
   every line of the script; at 820px it cut action lines off mid-word. **The
   responsive audit passed this route fourteen times** — a fixed overlay does
   not overflow anything. That script checks two properties and this was
   neither.
2. **The caret sat before `INT.`** A textarea starts every session with
   `selectionStart` at 0, so any focus carrying no position — a phone keyboard
   opening — put the insertion point in front of the first slugline. Open
   yesterday's script, the keyboard comes up, type, and the words land before
   the scene heading. Tap placement was measured first and is exact.
3. **The script was too small to write in**, and deliberately so. See above.
4. **The course had no sidebar on a phone.** The two-column grid collapses to
   one, so all nineteen lesson titles sat above the lesson, and every lesson
   after the first began with a scroll past the table of contents.
5. **The new-project Details row broke in two ways.** The summary wrapped
   instead of truncating, so "Bilingual" landed outside the row; and Genre and
   Tone side by side clipped their own values — the Tone field read "Emotion",
   which is a different word.

### Found on the device, and since fixed

Both closed 2026-09-09, each confirmed by a measurement first and each fix
checked by reverting it and watching the check fail.

- **"Could not load this script."** — `e96fc1f`. Measured at **7 in 20**, not
  the 1 in 8 first guessed; **0 in 20** with the `live` guard. StrictMode fires
  two identical loads, the loser returns a bare network error with no response
  on it, and `loadError` was never cleared again. That is also the shape of a
  dropped request on a flaky connection, which is the connection this product is
  for. `scripts/editor-load-race.mjs` is the measurement, kept — a unit test
  cannot reach a race between two mounts and a real network stack.
- **Autosave was silently losing work** — `80407b8`, and worse than the one log
  line suggested. Opening the editor from a link built out of the project list
  put *every* request after the load against a script that does not exist, while
  the page went on showing a save indicator. Confirmed by typing a marker,
  forcing a save, and reading the script back from the API: not there. Fifteen
  call sites now use `script.id`. This one is pinned in jsdom.
- Serving to the phone needs the dev-server proxy (`f0a50fa`), not a second hole
  in the firewall: this machine's Ethernet is a **Public** network on which
  `node.exe` has an inbound allow rule and the backend's venv Python does not.
- The LAN servers died once mid-session and the phone got nothing until they
  were restarted. Check `/api/health` before blaming the app.

---

## Blocked, and on what

Nothing here can be coded around, and all of it is calendar time rather than
work. It is already the critical path.

- [ ] **Supabase project** — `SUPABASE_URL` and `SUPABASE_KEY` are unset, so every environment to date is the SQLite mock. Blocks all of Month 3 Week 1, the pgvector migration and the four schema migrations. It is also what let the pgvector schema drift undetected until it was read by hand
- [ ] **Anthropic credit** — blocks the first real-key walk and the measured cost figure
- [ ] **Deployment** — blocks the Khalti and eSewa applications, which need a live URL and take days of human review
- [ ] **SMTP account** — blocks renewal emails; without it a lapsed Khalti or eSewa plan simply stops working
- [ ] **Merge to `codebase`** — the branch has never been merged. Deploying from a non-default branch is how the wrong thing gets deployed

---

## Two standing rules

Both learned this week, both expensive to relearn.

**Measure before changing anything whose point is a number.** The retrieval work
found that the obvious fix was not the effective one — the defect was in the
query, not the corpus — and that a larger embedding model bought nothing at all
for 4.6x the cost. Neither would have been visible without a baseline.

**When a measurement says a task is unnecessary, delete the task and keep the
measurement.** That is what the "turned out to be fine" section above is for,
and it is worth more than the tasks it replaced.
