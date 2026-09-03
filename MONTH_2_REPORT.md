# Month 2 progress report

**Baakhapaa: AI-powered pre-production intelligence system**
Weeks 5 to 8 of 12. Reference: proposal §8.

All four modules the proposal scheduled for Month 2 were delivered early, in Month 1, and
were reported then. Month 2 was therefore spent on two things instead: testing the system
properly, and measuring how well its main feature works.

Two results stand out. The system ran against live AI providers for the first time. And
retrieval quality was measured for the first time, giving a baseline of 20%.

## 1. Month 2 deliverables

| Wk | Build focus | Deliverable | Status |
|----|-------------|-------------|--------|
| 5 | Storyboard generation | Shot types, camera notes, frame controls, regeneration | Delivered Month 1 |
| 6 | Collaboration and versions | Comment threads, roles, version history with diff | Delivered Month 1 |
| 7 | Export system | PDF, Word, Final Draft `.fdx`, production package | Delivered Month 1 |
| 8 | Subscription tiers | Free / Pro / Studio, three gateways, server-side gating | Delivered Month 1 |
| — | **Quality and measurement** | **Test coverage, retrieval evaluation, first live-key run** | **Done** |

The four scheduled deliverables were re-tested this month rather than rebuilt. The sections
below describe the work that filled the month.

![The editor](docs/screenshots/m2-04-script-editor.png)

**Figure 1.** The workspace at the end of Month 2. On the left is the panel holding four
views of the script and the scene index cards. In the middle is the screenplay page. On the
right is the assistant panel with craft recommendations. Above is the timeline.

### Week 5: Adding tests

Three parts of the backend had no tests at all. This mattered because those three parts
carry the most risk:

- The payment webhook is the only endpoint that grants a paid subscription without
  requiring a login.
- `updates.py` is the code that decides which fields a user is allowed to change.
- `rag.py` is the retrieval system. It returns an empty result on failure by design, so
  when it breaks, nothing reports an error.

104 new backend tests were written. All 26 frontend components that had no tests were
covered. The test suite now has **765 backend tests in 42 files** and **1,020 frontend
tests in 54 files**.

Two security problems were found and fixed while writing these tests.

The first was in `versions.py`. It checked the user's permission after checking for other
errors, not before. A logged-in user could therefore learn whether two script versions
existed and belonged to the same script, even without access to them. Every other route in
the system returns "not found" to prevent exactly this.

The second was in the command palette. It was hidden from logged-out visitors but still
sent a request to the server. The request failed with a 401 error, which logged the visitor
out and sent them to the login page.

### Week 6: Running with real API keys

The system had never been run against a real AI provider. This was done in Month 2, and two
problems were found.

**Problem 1: the test suite made real API calls.** The test configuration forces the tests
to use a mock database and to skip payment providers. It had never done the same for the AI
keys. This did not matter while no keys existed. Once real keys were added, the tests began
calling the live API, which costs money. The suite also took 26 minutes instead of a few
seconds, because the AI library retries a failed request several times.

The fix is worth recording. Deleting the environment variable does not work, because the
configuration loader fills in any variable that is missing. The variable must instead be set
to an invalid value, so that it exists but cannot be used.

**Problem 2: the cost estimate was wrong.** A storyboard image had been estimated at $0.040,
assuming the system used DALL-E 3. It does not. Measured against the model actually used,
one image costs $0.0033.

| Item | Estimated | Measured |
|------|-----------|----------|
| One storyboard frame | $0.040 | **$0.0033** |
| 24-frame storyboard | $0.96 | **$0.08** |
| One script with a storyboard | $1.32 | **~$0.44** |

This changes which cost matters. Images are about 18% of the cost of producing a script.
Text generation is about 82%. Reducing the length of generated text therefore saves more
than reducing the number of storyboard images.

### Week 7: Measuring retrieval quality

Retrieval is the system's main feature. It finds relevant screenwriting techniques and adds
them to the AI prompt. It had never been measured.

A test set of 34 cases was built from the existing craft library. Three standard measures
were used: precision@1 (whether the correct result came first), precision@3 (whether it was
in the top three), and mean reciprocal rank.

The first result was 82.4% precision@1. This number was misleading. The test set contained
two kinds of case, and one kind is much easier than the other:

    REAL QUERIES (what the editor actually sends, n=5)
      precision@1  20.0%
      precision@3  60.0%

    SANITY CHECK (an entry finds itself, n=29)
      precision@1  93.1%   <- should stay near 100%

The 29 easy cases search using text that was itself used to build the index, so a correct
result is almost guaranteed. Only the 5 remaining cases match what the application really
sends. Averaging all 34 together hid the real figure.

The test now reports the two groups separately. **The baseline is 20% precision@1.** This
agrees with four checks already built into the corpus loader, which had been reporting
success while ranking the wrong result first in three cases out of four.

![The craft panel](docs/screenshots/m2-09-craft.png)

**Figure 2.** The free-tier feedback panel. At the top, the rule-based checker reports that
nothing was flagged, and explains that this does not mean the draft is finished. Below it
are the draft's statistics. Below those is the corpus comparison, which does not report a
result until there is enough script to compare.

### Week 8: Streaming and character analysis

**Streaming.** Every AI request previously waited for the full response before showing
anything, so a writer asking for a scene saw a loading indicator for the whole time. Scene
generation and rewriting now stream the text as it is produced. Errors are sent inside the
stream, because once the response has started the HTTP status code can no longer be changed
to report a failure.

**Character analysis.** A new view called Cast was added. The existing tools examine
formatting, overall shape, or scene order. None of them help with a common problem: two
characters sounding the same. Cast lists each character's dialogue together, with three
measures:

- **Words per line** — how long their lines run.
- **Vocabulary** — how much of their wording is repeated.
- **Asks** — how often they ask a question instead of making a statement.

Measured on a short film written to test the feature:

| Character | Lines | Words per line | Vocabulary | Asks |
|-----------|-------|----------------|------------|------|
| AARATI | 30 | 4.1 | 0.65 | 0.17 |
| KANCHHA | 15 | 4.7 | 0.77 | **0.40** |
| BABA | 15 | 6.3 | 0.76 | **0.00** |

Kanchha asks a question in 40% of his lines. Baba never asks one. This is a measurable
difference in how two characters speak.

The view also shows the character description the writer entered when setting up the
project. That description was previously used only inside AI prompts and was never shown
back to the writer.

![Cast](docs/screenshots/m2-08-cast.png)

**Figure 3.** The Cast view with one character opened. Each line shows its line number in
the script, and clicking a line moves the cursor there. The script page stays visible.

## 2. Work beyond Month 2 scope

### 2.1 Faults found by writing a real screenplay

A complete short film was written inside the system and processed by its own tools. This
found five faults that test data had not.

1. **`FADE IN:` was counted as a scene.** A 16-scene script reported 17 scenes. This also
   affected the page statistics and the corpus comparison figures shown to the writer.
2. **The craft panel analysed the wrong text.** When a writer selected a problem category,
   the system analysed the category description instead of the writer's script, then
   reported the result as if it had been found in their draft.
3. **Renaming a scene had no effect on the scene list.** The timeline continued to show a
   scene heading that no longer existed in the script.
4. **Focus mode did not fill the screen.** The page was drawn 723 pixels tall on a
   1,274-pixel screen.
5. **The editor URL was inconsistent.** It was labelled as containing a project identifier
   but actually contained a script identifier.

### 2.2 Interface changes

| Area | Change |
|------|--------|
| Workspace | The four views moved into the left panel, so the script page stays visible while reorganising |
| Page | Page height now matches the pagination rule; standard screenplay margins applied |
| Timeline | Scene headings can be renamed directly; act durations can be edited |
| Writing | Typewriter scrolling, custom cursors, cursor hidden while typing |
| Import | Word `.docx` files can now be imported, alongside Final Draft, Fountain, text and PDF |

![Corkboard](docs/screenshots/m2-07-corkboard.png)

**Figure 4.** The corkboard now appears next to the script rather than replacing it. A
writer can reorder scenes while still reading the page.

### 2.3 Documentation and decisions

Three decisions that had been left open in the documentation were settled:

- Real-time collaborative editing was removed from scope. The system provides asynchronous
  collaboration: sharing, roles and comments.
- The claim about data encryption was corrected to describe what the system actually does.
- Subscription tier names were fixed as free, pro and studio.

The deployment guide was corrected. It described three database migrations; there are now
four. A project reference document described a data format the code no longer uses.

## 3. Verification status

The AI providers can be reached with live credentials. The image generation path has been
run end to end at real cost. The text generation path returns a billing error because the
account has no credit, so streaming and the paid generation features are still verified only
against the mock provider.

The system has not been deployed. It runs on a local database because no cloud database has
been created, which also means four schema migrations remain unapplied. No payment has been
processed.

These three items — a cloud database, a live server, and a first real payment — are the work
of Month 3. All remaining estimates depend on them.

All figures in this report were captured from the running system this month using
`baakhapaa-frontend/scripts/capture-screenshots.mjs`. This script signs in, enters a draft,
and photographs each screen in turn.
