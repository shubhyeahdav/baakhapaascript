# Work list — mobile, performance, structure

Written 2026-09-04, after measuring the codebase rather than guessing at it.

Every item below exists because a number said so. The measurements are in the
next section; each task names the one that produced it. Nothing here is a
refactor for its own sake, and two things I expected to find turned out to be
fine and are recorded as such.

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

Five times the next largest frontend file, and 19% of all frontend source. The
draft text lives in its state, so every keystroke re-renders the whole
component tree. In a product whose entire promise is keeping a writer in flow,
typing latency is not a cosmetic concern.

**The bundle is one chunk and nothing is lazy.**

    build/assets/index-*.js     476,682 bytes    (146 kB gzipped)
    build/assets/index-*.css     40,700 bytes
    React.lazy / dynamic import occurrences in src/: 0

Someone opening `/login` downloads the editor, the storyboard viewer, the
19-lesson course and the pricing page before they can type an email address. On
a 3G connection — which is the market this product is being built for — that is
several seconds of blank screen. This is the highest-value performance work
available and it is also among the cheapest.

### The editor header on a phone

Measured live at 375x812:

    header scrollWidth        1,040 px   in a 375 px viewport
    toolbar group               817 px   12 controls, one flex row
    "Open the assist panel"   left: 828  off-screen
    "Finalize & Storyboard"   left: 877  off-screen

The header is `overflow-x-auto`, so it does not break the layout — it scrolls
sideways for 2.7 screens. Two things are wrong with that. The primary action is
877px off-screen, and so is the assist toggle, which is the one control that
exists *only* on mobile. And because the header scrolls as a single unit,
reaching them pushes Back and the project title off the left edge.

`ToolbarMenu` already exists and its own docstring states the rule: "a control
stays on the surface if it is used *while writing*… everything used
occasionally goes behind a labelled menu." That rule was applied for desktop
and never extended down.

### What turned out to be fine

Recorded so nobody spends a day on them.

- **Backend request cost.** Retrieval ranks 39 rows in Python per request,
  which is microseconds, and switches to the pgvector RPC above 500 rows.
- **Storyboard generation.** Already parallel at six frames at a time as of
  `e664878`; a 24-frame board went from ~7.5 minutes to under 90 seconds.
- **Voice findings.** `collapsed_voices` is O(n²) over the cast. A cast is ten
  people. It is correct and it is not slow.

---

## Part A — Mobile

The thing that was asked for.

### A1 · Editor header

- [ ] Keep four controls visible below `lg`: Back, truncated title, save state, Assist
- [ ] Keep Finalize visible — it is the primary action and is currently 877px off-screen
- [ ] Move shortcuts, script toggle, Import, Share, Export, View, Structure and Setup into one `⋯` menu, reusing `ToolbarMenu`
- [ ] Drop `overflow-x-auto` below `lg` so the header cannot scroll sideways at all
- [ ] Leave the desktop header exactly as it is
- [ ] Add a test that the mobile header's scrollWidth equals its clientWidth

### A2 · The other pages

Not yet audited. One pass each at 375px, fixing whatever overflows or collides.

- [ ] Dashboard
- [ ] Settings
- [ ] Learn
- [ ] Pricing
- [ ] Storyboard view
- [ ] Exports and Storyboards index pages
- [ ] Project setup / New project
- [ ] Onboarding

### A3 · Verify on a real device

An emulated viewport is the weakest evidence there is for a layout claim. The
dev servers now bind to the LAN (`033ba20`), so this is available.

- [ ] Is 9.5px Courier readable at arm's length? The page fits all 61 screenplay columns now, and that is what made it small — if it is genuinely unreadable the trade needs revisiting
- [ ] Do the 44px hit areas feel right under a thumb?
- [ ] Does focus mode survive the address bar collapsing?
- [ ] Write down anything emulation got wrong, because that is the useful output of this task

---

## Part B — Performance

Higher user value than Part A, and less visible. Ordered so the measurement
comes before the work and again after it.

### B1 · Establish the baseline first

- [ ] Measure first contentful paint on a throttled 3G profile, cold cache
- [ ] Record time-to-interactive on `/login` and on the editor
- [ ] Commit both numbers, so B2 and B3 are a before-and-after rather than a hope

### B2 · Route-level code splitting

- [ ] `React.lazy` every route in `App.jsx` behind a `Suspense` boundary
- [ ] Give the boundary a real fallback, not a spinner on a blank page
- [ ] Confirm the login route no longer pulls the editor, the course or the storyboard viewer
- [ ] Re-measure against B1 — expect the initial chunk to more than halve
- [ ] Check the production build still passes and no route regressed

### B3 · Stop re-rendering 2,228 lines per keystroke

- [ ] Confirm the cost first: profile a typing session and record renders per keystroke
- [ ] Either uncontrol the textarea, or memoise the subtrees that do not depend on `content`
- [ ] Keep the undo stack working — `replaceRange` exists precisely because `setContent` discards it
- [ ] Keep autosave, page count and the craft panel in step with the draft
- [ ] Re-measure, and revert if the number did not move

---

## Part C — Structure

Only worth doing because it makes Part B possible, not for tidiness.

### C1 · Split ScriptEditor.jsx

- [ ] Extract the header, the assist panel and the page as three components
- [ ] Move the 47 pieces of state to whichever component actually owns each
- [ ] Keep every existing test passing without editing it — if a test needs changing, the split changed behaviour
- [ ] No behaviour change in this commit, so the diff is reviewable

### C2 · One database read per recommendations request

- [ ] `history`, `record` and `resolve` each fetch the same rows separately — three round trips where one would do
- [ ] Pass the rows through instead
- [ ] Confirm the 15 recommendation-loop tests still pass unchanged

---

## Part D — Blocked, and on what

Nothing in this section can be coded around.

- [ ] **Supabase project** — `SUPABASE_URL` and `SUPABASE_KEY` are unset, so every environment to date is the SQLite mock. This blocks the whole of Month 3 Week 1, the pgvector migration, and the four schema migrations. It is also what let the pgvector schema drift undetected until it was read by hand
- [ ] **Anthropic credit** — blocks the first real-key walk and the measured cost figure
- [ ] **Deployment** — blocks the merchant applications, which need a live URL and take days of human review
- [ ] **SMTP account** — blocks renewal emails; without it a lapsed Khalti or eSewa plan simply stops
- [ ] **Merge to `codebase`** — the branch is **45 commits ahead** and has never been merged. Deploying from a non-default branch is how the wrong thing gets deployed

---

## Order, and why

1. **B1** before anything else. Without a baseline, B2 and B3 are opinions.
2. **B2** next. It is the largest user-visible win, it is cheap, and it is
   independent of everything else here.
3. **A1**. The fastest fix in the list for the most obviously broken thing.
4. **A2**, then **A3**. Audit before device testing, so the device session is
   spent on what only a device can tell you.
5. **C1**, then **B3**. The split has to come first or the memoisation lands in
   a 2,228-line file and nobody can review it.
6. **C2** whenever. It is small.
7. **Part D** the moment the accounts exist. Everything there is calendar time
   rather than work, and it is already the critical path.

Two standing rules for this list, both learned this week. Measure before
changing anything whose point is a number — the retrieval work found that the
obvious fix was not the effective one, and that a larger embedding model bought
nothing at all. And when a measurement says a task is unnecessary, delete the
task and record the measurement, which is what the "turned out to be fine"
section above is for.
