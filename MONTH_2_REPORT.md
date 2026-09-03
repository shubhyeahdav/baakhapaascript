# Month 2 progress report

**Baakhapaa: AI-powered pre-production intelligence system**
Weeks 5 to 8 of 12. Reference: proposal §8.

The four modules scheduled for Month 2 were finished ahead of schedule during Month 1 and
reported then. That left this month free for the work the schedule had no room for: proper
testing, and finding out how well the retrieval feature actually performs.

The system also ran against live AI providers for the first time, which surfaced two
problems that demo mode had been hiding.

## 1. Month 2 deliverables

| Wk | Build focus | Deliverable | Status |
|----|-------------|-------------|--------|
| 5 | Storyboard generation | Shot types, camera notes, frame controls, regeneration | Delivered Month 1 |
| 6 | Collaboration and versions | Comment threads, roles, version history with diff | Delivered Month 1 |
| 7 | Export system | PDF, Word, Final Draft `.fdx`, production package | Delivered Month 1 |
| 8 | Subscription tiers | Free / Pro / Studio, three gateways, server-side gating | Delivered Month 1 |
| — | **Quality and measurement** | **Test coverage, retrieval evaluation, first live-key run** | **Done** |

Each of the four was re-tested rather than rebuilt. What follows is the work that filled
the month instead.

![The editor](docs/screenshots/m2-04-script-editor.png)

**Figure 1.** The workspace at the end of Month 2. The left panel holds four views of the
script along with the scene index cards, the screenplay page sits in the middle, and the
assistant panel is on the right. The timeline runs across the top.

### Week 5: Adding tests

Three parts of the backend had no tests, and they happened to be three of the riskiest. The
payment webhook grants a paid subscription and is the only endpoint that does so without a
login. `updates.py` decides which fields a user is allowed to change. And `rag.py`, the
retrieval system, returns an empty result when it fails, so a fault there produces no error
message at all.

104 backend tests were written to cover them, and the 26 frontend components that had no
tests were covered as well. The suite now stands at **765 backend tests in 42 files** and
**1,020 frontend tests in 54 files**.

Writing them turned up two security faults.

In `versions.py`, the permission check ran after the other error checks rather than before.
A logged-in user could use the difference between the two error responses to work out
whether two script versions existed and belonged to the same script, without having access
to either. Everywhere else in the system returns "not found" precisely so this cannot
happen.

The second was smaller but more visible. The command palette hid itself from logged-out
visitors, but still sent its request to the server. That request failed with a 401, which
logged the visitor out and redirected them to the login page.

### Week 6: Running with real API keys

Everything up to this point had been verified against a mock provider. Running it for real
found two things.

The first was in the test suite rather than the product. Its configuration deliberately
forces a mock database and skips the payment providers, but nobody had done the same for
the AI keys, and while no keys existed there was nothing to notice. Once real keys were in
place the tests started calling the live API, at cost, and a suite that normally finishes in
seconds took 26 minutes because the AI library retries each failure several times.

The fix is less obvious than it looks. Deleting the environment variable does not help,
because the configuration loader fills in whatever is missing. The variable has to be set to
a value that is invalid, so that it exists and cannot be used.

The second was the cost model, which was wrong by a factor of twelve. A storyboard image had
been estimated at $0.040 on the assumption that the system used DALL-E 3. It does not, and
the model it actually calls costs $0.0033 an image.

| Item | Estimated | Measured |
|------|-----------|----------|
| One storyboard frame | $0.040 | **$0.0033** |
| 24-frame storyboard | $0.96 | **$0.08** |
| One script with a storyboard | $1.32 | **~$0.44** |

That changes which cost is worth controlling. Images account for roughly 18% of what a
script costs to produce and text generation for 82%, so shortening generated text saves far
more than capping the number of frames.

### Week 7: Measuring retrieval quality

Retrieval is the feature the product is built around. It searches a library of screenwriting
techniques and adds the closest matches to the AI prompt. Nobody had ever measured it.

A test set of 34 cases was assembled from the craft library itself, scored on precision@1
(whether the right answer came first), precision@3 (whether it appeared in the top three)
and mean reciprocal rank.

The first run reported 82.4% precision@1, which was encouraging and wrong. The test set
turned out to hold two kinds of case with very different difficulty:

    REAL QUERIES (what the editor actually sends, n=5)
      precision@1  20.0%
      precision@3  60.0%

    SANITY CHECK (an entry finds itself, n=29)
      precision@1  93.1%   <- should stay near 100%

Twenty-nine of the cases search using text that was itself used to build the index, so
finding the right answer is close to guaranteed. Only five resemble what the application
really sends. Averaged together, the easy majority hid the figure that mattered.

The two groups are now reported separately, and **the baseline is 20% precision@1**. It
matches what the corpus loader had been quietly showing all along: four built-in checks,
all reporting success, three of them ranking the wrong answer first.

![The craft panel](docs/screenshots/m2-09-craft.png)

**Figure 2.** The free-tier feedback panel. The rule-based checker reports that nothing was
flagged and explains that this is not the same as the draft being finished. The draft's own
statistics sit below it, and beneath those the corpus comparison, which declines to report a
result until there is enough script to compare.

### Week 8: Streaming and character analysis

AI requests used to wait for the entire response before showing anything, so a writer asking
for a scene watched a loading indicator for as long as it took. Scene generation and
rewriting now stream the text as it arrives. Errors travel inside the stream, since once a
response has started there is no longer an HTTP status code available to report a failure
with.

The other addition was a view called Cast. The existing tools look at formatting, at overall
shape, or at scene order, and none of them help with a problem writers hit constantly: two
characters who sound the same. Cast gathers each character's dialogue in one place and
reports three things about it — how long their lines run, how much of their wording repeats,
and how often they ask a question rather than make a statement.

Measured on a short film written to test the feature:

| Character | Lines | Words per line | Vocabulary | Asks |
|-----------|-------|----------------|------------|------|
| AARATI | 30 | 4.1 | 0.65 | 0.17 |
| KANCHHA | 15 | 4.7 | 0.77 | **0.40** |
| BABA | 15 | 6.3 | 0.76 | **0.00** |

Kanchha asks a question in 40% of his lines. Baba never asks one at all. The difference in
how the two men speak is visible as a number before it is visible on the page.

Alongside those figures, the view shows the character description the writer entered when
setting the project up. That description had only ever been used inside AI prompts; the
writer never saw it again after typing it.

![Cast](docs/screenshots/m2-08-cast.png)

**Figure 3.** The Cast view with one character opened. Every line carries its number in the
script, and clicking one moves the cursor there. The page stays visible throughout.

## 2. Work beyond Month 2 scope

### 2.1 Faults found by writing a real screenplay

A complete short film was written inside the system and put through its own tools. Five
faults came out of it that no test fixture had caught.

1. `FADE IN:` was being counted as a scene, so a 16-scene script reported 17. The error
   carried into the page statistics and into the corpus comparison figures shown to writers.
2. The craft panel analysed the wrong text. Choosing a problem category made the system
   examine the category's own description instead of the script, and then report the result
   as though it had been found in the writer's draft.
3. Renaming a scene had no effect on the scene list, so the timeline went on displaying a
   heading that no longer existed anywhere in the script.
4. Focus mode did not fill the screen. The page was drawn 723 pixels tall on a screen 1,274
   pixels high.
5. The editor URL was labelled as carrying a project identifier but actually carried a
   script identifier.

### 2.2 Interface changes

| Area | Change |
|------|--------|
| Workspace | The four views moved into the left panel, so the script stays visible while reorganising |
| Page | Page height now matches the pagination rule; standard screenplay margins applied |
| Timeline | Scene headings can be renamed directly; act durations can be edited |
| Writing | Typewriter scrolling, custom cursors, cursor hidden while typing |
| Import | Word `.docx` files can now be imported, alongside Final Draft, Fountain, text and PDF |

![Corkboard](docs/screenshots/m2-07-corkboard.png)

**Figure 4.** The corkboard now sits beside the script instead of replacing it, so scenes
can be reordered while the page is still being read.

### 2.3 Documentation and decisions

Three questions that had been left open in the documentation were settled this month.
Real-time collaborative editing was dropped from scope, leaving sharing, roles and comments
as what the system offers. The claim about data encryption was rewritten to describe what
the system actually does. And the subscription tiers were fixed as free, pro and studio.

The deployment guide was also corrected: it described three database migrations when there
are now four, and a reference document still described a data format the code had stopped
using.

## 3. Verification status

Both AI providers can be reached with live credentials, and the image generation path has
been run end to end at real cost. Text generation returns a billing error because the
account has no credit, so streaming and the paid generation features remain verified against
the mock provider only.

The system has not been deployed. It still runs on a local database because no cloud
database has been created, which also leaves four schema migrations unapplied, and no
payment has been processed through any gateway.

Those three — a cloud database, a live server, and a first real payment — are the work of
Month 3, and every estimate that remains depends on them.

All figures in this report were captured from the running system this month using
`baakhapaa-frontend/scripts/capture-screenshots.mjs`, which signs in, enters a draft and
photographs each screen in turn.
