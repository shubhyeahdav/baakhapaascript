# Month 2 progress report

**Baakhapaa: AI-powered pre-production intelligence system**
Weeks 5 to 8 of 12. Reference: proposal §8.

Every module the proposal scheduled for Month 2 was already delivered in Month 1 and
reported as such. Month 2 was therefore spent on the two things that decide whether any of
it survives contact with a user: proving the system works when it is not being demonstrated,
and measuring the one capability the product is sold on. The system ran outside demo mode
for the first time. Retrieval was measured for the first time, and the first honest number
was worse than the first flattering one.

## 1. Month 2 deliverables

| Wk | Build focus | Deliverable | Status |
|----|-------------|-------------|--------|
| 5 | Storyboard generation | Shot types, camera notes, frame controls, regeneration | Delivered Month 1 |
| 6 | Collaboration and versions | Comment threads, roles, version history with diff | Delivered Month 1 |
| 7 | Export system | PDF, Word, Final Draft `.fdx`, production package | Delivered Month 1 |
| 8 | Subscription tiers | Free / Pro / Studio, three gateways, server-side gating | Delivered Month 1 |
| — | **Quality and measurement** | **Test coverage, retrieval evaluation, first live-key run** | **Done** |

The four scheduled deliverables were verified again this month rather than rebuilt. What
follows is the work that filled the month instead.

### Week 5: Coverage of the parts that fail quietly

Three backend modules had no test at all, and the ones without coverage were close to the
inverse of where coverage should have been: the Stripe webhook is the only unauthenticated
endpoint that grants a paid tier, `updates.py` is six lines standing between a client
dictionary and two write handlers, and `rag.py` — the differentiator — returns an empty list
on every error by design, so it fails silently.

104 backend tests were added across six new files, and all 26 untested frontend components
and pages were covered. The suite now stands at **765 backend tests across 42 files** and
**1,020 frontend tests across 54 files**.

Two security defects were found and closed in the process. `versions.py` ran its access check
*after* its error branches, so any signed-in user could learn whether two arbitrary version
identifiers existed and belonged to the same script — every other route in the system returns
404 precisely to prevent that. And the command palette guarded only its render, so pressing
Cmd-K while signed out issued an authenticated request, received a 401 and ejected the
visitor to the login page.

### Week 6: Running outside demo mode

The system had never been executed against a real provider. It was this month, and the run
produced more information than a successful one would have.

The first finding was in the test suite rather than the product. `conftest.py` deliberately
forces the mock database and pins payments offline, but had never done the same for the AI
keys — which did not matter while those keys were absent. On the day real keys were added the
suite began making live, billed API calls, and hung for twenty-six minutes retrying a provider
error. The subtlety worth recording is that removing the variables does not fix it:
`load_dotenv()` declines to overwrite a variable that already exists and happily fills in one
that does not, so popping the key invites the real one straight back.

The second was the cost model. A storyboard frame was estimated at $0.040 on the assumption
of DALL-E 3. Measured against the model the system actually calls, one frame is **$0.0033** —
a factor of twelve. This inverts the pricing lever: images are roughly 18% of the cost of a
script and generation tokens are 82%, so the control that matters is output length, not the
frame cap.

| Measured | Estimated | Actual |
|----------|-----------|--------|
| One storyboard frame | $0.040 | **$0.0033** |
| 24-frame storyboard | $0.96 | **$0.08** |
| One script with a board | $1.32 | **~$0.44** |

### Week 7: Measuring retrieval

The retrieval layer is what the product is sold on and nothing had ever measured it. An
evaluation harness was built: 34 golden cases mined from the corpus itself rather than
invented, scored on precision@1, precision@3 and mean reciprocal rank.

The first result was 82.4% precision@1, which looked like good news and was not. The golden
set mixes two populations of very different difficulty, and averaging them buried the one
that matters:

    REAL QUERIES (what the editor actually sends, n=5)
      precision@1  20.0%
      precision@3  60.0%

    SANITY CHECK (an entry finds itself, n=29)
      precision@1  93.1%   <- should stay near 100%

Self-retrieval is nearly free — the query *is* the text that was embedded — so 29 easy cases
drowned five real ones. The harness now reports the two apart and leads with the real
queries. **20% is the committed baseline**, and it agrees with what the corpus loader's own
probes had been printing as passes all along: three of its four rank the wrong craft level
first.

That result is the most useful thing produced this month. It is also the reason the number is
trusted: the measurement caught an error in its own design before it caught one in the system.

### Week 8: Craft features and production readiness

Generation now streams. Every AI call blocked until the whole response was composed, so a
writer asked for a scene and watched a spinner while two thousand tokens were assembled
elsewhere. Server-sent events replace that for scene generation and rewriting, with a provider
failure arriving inside the stream — once the first byte is sent the status is already 200, so
an error has to be a message the client can read rather than a dropped connection.

**Cast** was added: the reading the system did not have. The linter reads a page, the benchmark
reads a shape, the corkboard reads an order, and none of them answers the question a writer
arrives with around page thirty. Reading one character's lines end to end, with three measures
chosen to be actionable rather than scored, does. Run against a short film written to test it:

| Character | Lines | Words per line | Vocabulary | Asks |
|-----------|-------|----------------|------------|------|
| AARATI | 30 | 4.1 | 0.65 | 0.17 |
| KANCHHA | 15 | 4.7 | 0.77 | **0.40** |
| BABA | 15 | 6.3 | 0.76 | **0.00** |

Kanchha asks a question in forty percent of his lines and Baba in none of them. That is
characterisation, visible as a number, and it is the fastest way to see two voices collapsing
into one. The story bible — which the writer fills in and which had been spent on prompts and
shown back to them nowhere — now sits beside it, so the voice they described is next to the
voice they wrote.

## 2. Work beyond Month 2 scope

### 2.1 Defects found by using the product as a writer would

A full short film was written inside the system and run through its own tools. This found what
synthetic fixtures had not: `statistics` counted `FADE IN:` as a scene, so a 16-scene script
reported 17, a phantom of 0.04 pages led the scene-length curve, and every corpus percentile
shown to a writer was computed partly against a scene nobody wrote.

Four further defects were found the same way. The craft panel diagnosed the *question* a writer
clicked rather than their draft, and reported the result as "found in your draft, line 1" — a
line of a sentence they had never typed. Renaming a scene heading never reached the scene
index, so the timeline kept showing a line no longer in the script. Focus mode drew a
723-pixel page on a 1,274-pixel screen. And the editor's route claimed to carry a project
identifier while carrying a script one.

### 2.2 Interface work

| Area | Change |
|------|--------|
| Workspace | Script, Corkboard, Outline and Cast moved into the left rail; the page is never taken away to reorganise it |
| Page | Card height derived from the pagination rule, so one card is one page; screenplay-standard margins |
| Timeline | Scene headings renameable in place, act durations editable, labels dropped when blocks are too narrow to read |
| Writing | Typewriter mode, gold caret, nib and ring pointers, pointer hidden while typing |
| Import | Word `.docx` added alongside Final Draft, Fountain, plain text and PDF |

### 2.3 Documentation and decisions

Three decisions the documents recorded but never settled were closed: live co-editing descoped
to asynchronous collaboration, the encryption claim stated truthfully, and tier naming fixed at
free / pro / studio. The deploy runbook was corrected — it described three migrations and there
are now four. A project skill documented a data schema the code had abandoned, which would have
produced entries that half-worked in a way nobody would notice.

## 3. Verification status

Everything above runs. The AI providers are reachable with live credentials and the OpenAI path
has been exercised end to end at real cost; the Anthropic path returns a billing error pending
account credit, so streaming and the paid generation routes remain verified against the mock
path only.

The system has still never been deployed. It runs on local SQLite because no Supabase project
exists yet, which also means the four schema migrations remain unapplied. No money has moved
through any payment gateway. Those three — a real database, a live host, and a first real
payment — are the work of Month 3, and every remaining estimate depends on them.

Screenshots are carried over from Month 1 where the screen is unchanged. The editor, corkboard
and craft panel have all changed materially and need recapturing before this report is
submitted.
