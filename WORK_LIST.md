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

- [ ] Extract the header as its own component
- [ ] Extract the assist panel as its own component
- [ ] Extract the page and its status line as its own component
- [ ] Move each of the 47 pieces of state to whichever component actually owns it
- [ ] Keep every existing test passing without editing it — a test that needs changing means the split changed behaviour
- [ ] Commit the split on its own, with no behaviour change, so the diff is reviewable
- [ ] Profile a typing session and record renders per keystroke
- [ ] Either uncontrol the textarea or memoise the subtrees that do not depend on `content`
- [ ] Confirm the undo stack, autosave, page count and craft panel all still work — `replaceRange` exists because `setContent` discards undo
- [ ] Re-measure renders per keystroke, and revert if the number did not move

## Day 5 · A real device, and the numbers again

An emulated viewport is the weakest evidence there is for a layout claim. The
dev servers bind to the LAN as of `033ba20`, so this is available.

- [ ] Open the editor on the actual phone and write for ten minutes
- [ ] Is 9.5px Courier readable at arm's length? The page fits all 61 screenplay columns now, and that is what made it small
- [ ] If it is not readable, decide the trade: horizontal-scroll page, or a reduced-indent mobile mode
- [ ] Do the 44px hit areas feel right under a thumb?
- [ ] Does focus mode survive the address bar collapsing?
- [ ] Check the craft panel sheet and the corkboard on the device, not just the editor
- [ ] Write down everything emulation got wrong — that list is the useful output of this day
- [ ] Collapse the three separate database reads in `recommendation_log` into one per request
- [ ] Re-run both suites and the production build
- [ ] Re-measure first paint on 3G and record the closing number against Day 1

---

## Blocked, and on what

Nothing here can be coded around, and all of it is calendar time rather than
work. It is already the critical path.

- [ ] **Supabase project** — `SUPABASE_URL` and `SUPABASE_KEY` are unset, so every environment to date is the SQLite mock. Blocks all of Month 3 Week 1, the pgvector migration and the four schema migrations. It is also what let the pgvector schema drift undetected until it was read by hand
- [ ] **Anthropic credit** — blocks the first real-key walk and the measured cost figure
- [ ] **Deployment** — blocks the Khalti and eSewa applications, which need a live URL and take days of human review
- [ ] **SMTP account** — blocks renewal emails; without it a lapsed Khalti or eSewa plan simply stops working
- [ ] **Merge to `codebase`** — the branch is **45 commits ahead** and has never been merged. Deploying from a non-default branch is how the wrong thing gets deployed

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
