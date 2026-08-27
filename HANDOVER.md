# Handover — 2026-08-27

Supersedes the 2026-08-19 handover. That file's environment notes and Windows
gotchas still hold; almost everything it says about test counts, collaboration
and open decisions does not.

| It said | Actually |
|---|---|
| "364 backend tests / 23 files" | **731 across 41 files** |
| "36 frontend tests / 3 files" | **995 across 54 files** — every component and page has one |
| "Two decisions cannot be resolved by building" (FR10, tier names) | **Both closed**, plus NFR03. See §4 |
| "invitations by email aren't built yet" | **Built.** Anyone can be invited; §3 |
| "`updates.py` and `rag.py` have no coverage at all" | **Both covered** |

**Read `ROADMAP.md` for the build queue** and `DATA_HANDLING.md` before touching
anything that stores or transmits script text. This file is the narrative.

---

## 1. Environment (unchanged — still demo mode)

All `.env` keys are placeholders, so the app runs on local **SQLite**, **mock
Claude**, **mock DALL-E**, **mock Stripe**. Embeddings are real, computed
locally by fastembed with no API key.

```
cd baakhapaa-backend && ./venv/Scripts/python -m uvicorn main:app --port 8000   # no --reload on Windows
cd baakhapaa-frontend && npm start
```

**Nothing has ever run with real keys.** This is still the single largest
unknown in the project and it has not moved. Every integration — Claude,
DALL·E, Supabase, all three payment gateways — is verified against demo or
sandbox paths only.

Two gotchas that cost time this session:

- **The backend does not hot-reload.** It is run without `--reload` (orphaned
  processes squat on port 8000 otherwise), so **a backend edit needs a manual
  restart**. A whole debugging detour went into an API that was serving old
  code because of this.
- **Vite's CSS hot-reload can silently serve a stale stylesheet.** A padding fix
  was correct on disk and measurably not applied in the browser. If a style
  change appears to do nothing, hard-reload (Ctrl+Shift+R) before investigating.

---

## 2. What changed this session

### Tests: 536 → 731 backend, 208 → 995 frontend

Six new backend files covering what had none:

| File | Why it mattered |
|---|---|
| `test_stripe_webhook.py` | The only unauthenticated endpoint that grants paid tiers, previously untested. Pins that the tier comes from our stored `payments` row and never from the webhook payload — a forged event claiming `studio` against a `pro` row grants `pro` |
| `test_field_whitelist.py` | `updates.py` is 6 lines standing between a client dict and two `PUT` handlers. `projects.user_id` and `storyboard_frames.scene_id` are the fields it protects |
| `test_diff.py` | FR11, which shipped broken once. Pins the moved-line case a set-based diff scored as "no change" |
| `test_export_ssrf.py` | The one place the server fetches an attacker-influenceable URL |
| `test_rag_retrieval.py` | The differentiator, and it fails *silently* by design — every path returns `[]` on error |
| `test_env_documentation.py` | Guard: every setting the app reads must be in `.env.example`. Ships with an empty exception list |
| `test_invites.py` | New in §3 |

All 26 untested frontend components and pages now have tests.

### Two security fixes

- **`versions.py` id-probing oracle.** `require_script_access` ran *after* the
  404 and the cross-script 400, so any logged-in user could learn whether two
  arbitrary version ids existed and shared a script. Access check moved first;
  proven by temporarily reverting it and watching the regression test fail.
- **`CommandPalette.jsx`** guarded only its render, so ⌘K while signed out still
  fired `GET /projects/`, 401'd, and bounced the visitor to `/login`.

### Legal and consent

`/terms` and `/privacy` are now **served** — they existed at the repo root and
were routed nowhere while the product collected accounts. Sign-up states what is
being agreed to and names the specific fact a screenwriter cares about: script
text is stored without application-level encryption and is sent to AI providers.

The markdown comes from the root files through a **build-time virtual module**
(`vite.config.js`), so there is no second copy to drift. Both documents are
still unreviewed templates and say so in a banner.

### The Pen guides onboarding

The biggest change in the session. Onboarding was four questions and a redirect
to a blank editor; the nineteen-lesson course sat behind a nav item nobody had
reason to press. **The best thing in the product was the thing nobody found.**

A guide character — `ThePen.jsx` — now asks the four questions and then teaches
lesson one *inside onboarding*. The writer produces a real scene heading and
action line, graded by the same craft linter that runs everywhere else, before
they have seen the editor. They arrive having already written something correct,
and the lesson counts: `completed_lessons` is written, so the Learn page opens
at 1/10 rather than 0.

**Deliberately not copied from Duolingo**, and worth defending in review:

- **No hearts or lives.** The course's own rule is "there is no penalty for
  trying", and punishing a wrong first slugline is exactly the wrong lesson for
  somebody who has never written one.
- **No streaks.** They suit daily drilling. A screenwriter who writes hard for
  three days and rests is not failing.
- **No points or XP.** This product's discipline is that it reports
  measurements, never scores.

The Pen is a **nib, not a creature**. Duolingo's owl works because language
learning is social; a cartoon congratulating a screenwriter on their craft reads
as condescension quickly. Mood changes the nib's angle and its ink — never adds
a face.

Answers are saved *before* the lesson, so the lesson is a gift rather than a
gate: closing the tab mid-exercise does not re-ask the four questions. A failed
grading check lets the writer through rather than trapping them behind our own
network.

### ...and then on the page itself

Onboarding alone would have made the Pen a thing that greets you once and is
never seen again. It is now present at the two later moments that need it:

- **The blank page** (`PenPrompt.jsx`). Because the wizard no longer generates a
  structure, a new project opens genuinely empty — the most stuck a writer is
  ever going to be in this product, and what met them there was a placeholder
  reading *"Type Scene Headings starting with INT. or EXT., and press TAB…"*:
  four pieces of vocabulary aimed at somebody with none. The Pen now offers one
  concrete line — `INT. CHIYA PASAL - DAY` — that inserts on click, and a way
  into the walkthrough. Clicking it starts the whole downstream chain: the scene
  card, the timeline, Act I, the sync indicator.
- **`GuidePanel`**, which is what the blank-page prompt hands off to. It had no
  Pen at all, so the handoff arrived at an anonymous panel. Its mood is driven by
  the step's existing `check` against the draft — pleased when the draft meets
  the step, nudging while it does not — so it is reading the page, not
  performing.

Three things here were found only by opening the browser, and are worth knowing
before touching this component:

1. **The prompt needs a `z-index`.** It is painted before the textarea and the
   screenplay page has an opaque background, so without one the component works
   perfectly and is completely invisible. It shipped that way for an hour.
2. **It sits on the paper, not on the app.** `inkSoft`/`inkMuted` are tuned for
   the near-black chrome and wash out to nearly nothing on a `#FAF9F6` page. The
   paper has its own light/dark themes, so `PenPrompt` takes `pageTheme` and
   picks page ink rather than inheriting app ink.
3. **`ThePen` takes a `decorative` prop.** Where the Pen is the speaker
   (onboarding) it earns an accessible name. Everywhere else it accompanies prose
   that already says the same thing, and announcing "The Pen, nudging" reads out
   an illustration and then repeats the sentence beside it.

The prompt appears only on an empty draft, never in focus mode, and its wrapper
is `pointer-events-none` — a writer who ignores it and types is never
interrupted, and there is nothing to dismiss.

### The course, in two tracks, in Nepali

`lessons.py` went from 14 lessons in four modules to **19 in two tracks**:

- **The Pen** (10) — the script page: format, action lines, dialogue, finishing.
- **The Story** (9) — what the page is for. Five new lessons drawn from the
  corpus playbook: cost of pursuit, the midpoint flip, progress-as-trap,
  detonating at a celebration, redefining victory.

All 19 are **translated into Nepali** (`lessons_ne.py`, 76 prose fields), served
on `?lang=`, with fallback **per field** so an untranslated lesson added later
still reads correctly. The interface had spoken Nepali for weeks; the course had
not, which was the least defensible English in a product that lints Nepali.

The login and register pages now carry a **language switcher** — it previously
lived only in the signed-in account menu, so a Nepali writer met an English
login page with no way out.

### Editor and UX

- **Structure suggests, it does not write.** The wizard used to generate a
  three-act structure right after creating a project, so a writer's first sight
  of a new script was a list of scenes nobody asked for. It now opens on a blank
  page; structure is requested from inside the editor.
- **Focus mode actually focuses.** It never hid the toolbar — it removed the
  timeline and scene rail and left thirteen controls above the page. The toolbar
  is now hidden, and the page carries a status line with page position, *this
  session's* word count, and save state. Hiding chrome hid the save indicator,
  and "is my work saved" is what breaks focus fastest.
- **Full page** added to the View menu — the browser's own fullscreen, which is
  a different wish from focus mode and composes with it.
- **The toolbar stopped crushing its own title.** `min-w-0` let flex shrink the
  title group to 24px — narrower than the Setup button inside it, which escaped
  its container and collided with the status, rendering as "SetuSYNCED".
- **Sharing moved onto the work.** A Share sheet in the editor mounts the same
  `TeamPanel` Settings does, scoped to the open project.
- The Learn nav tab highlights (it passed no `active` prop and lit up Projects).

### Pricing, corrected against the code

The pricing page was wrong in **both** directions. Studio advertised real-time
collaboration that had been descoped, a ten-seat cap nothing enforced, and
priority support with no channel. The free tier omitted the course, the linter,
the benchmark, version history and Final Draft export entirely — selling a
usable product as a trial.

Both fixed, and there are now tests pinning the specific untrue sentences so
restoring one is a decision made against a failing test.

---

## 3. Invitations — the new subsystem

`add_member` used to refuse an unknown address ("they need to register first"),
so collaboration could only ever start between two people who had *both* already
found the product. That made Studio's whole proposition unsellable.

**`invites.py`** now records an invitation for any address. The important
property, and the one to defend in review:

> **The link does not grant access.** It only describes the offer. Membership is
> granted when somebody registers with the invited address. If that inverts, the
> link becomes a bearer token in a forwarded WhatsApp message.

**No email is sent, deliberately.** There is no SMTP account, and `renewals.py`
already demonstrates the failure mode of pretending otherwise. The inviter gets
a link and passes it on themselves — in this market far more likely by WhatsApp
than mail. The UI says so rather than implying a message went out.

`project_invites` is a **new table** — see §5.

---

## 4. Decisions closed this session

| Decision | Resolution |
|---|---|
| FR10 live co-editing | **Descoped** to async collaboration. `PRD.md` US4 and both scope lists amended |
| NFR03 encryption claim | **Stated truthfully.** TLS in transit, provider disk encryption at rest, no application-level encryption. `PRD.md` §7 numbered; Privacy Policy says it plainly |
| Tier names | **free / pro / studio.** The proposal is what changes |
| Studio's differentiator | **Collaborator seats.** `membership.SEAT_LIMITS` — free 2, pro 5, studio unlimited, enforced against the project OWNER's plan. Previously `PAID_TIERS` held both paid tiers and *nothing* branched on studio |
| Free project cap | **1 → 3.** One collided with the course, which ends by asking for a complete short — finishing it spent the entire allowance |

---

## 5. What will bite you

1. **Four migrations now, not three.** `project_invites` joins the three already
   unapplied. `DEPLOYMENT.md` §1 has the order. The email-normalisation one is
   the only one that can fail on real data — run it first and merge duplicate
   addresses before retrying.
2. **The mock DB is schemaless.** It stores rows as flat JSON, so it accepts
   columns Postgres would reject. This has caused three schema-drift bugs
   already and is why a real Postgres in CI plus a migration tool is the right
   next infrastructure move.
3. **Restart the backend after editing it.** See §1.
4. **`ScriptEditor.jsx` is 1,587 lines** and owns the caret, autosave, AI panel,
   three views and the toolbar. Everything cheap to extract has been; what
   remains is genuinely interdependent. Expect the next serious regression here.
5. **CSS cannot be tested.** `vite.config.js` sets `css: false` for vitest, so
   style changes are verified in a browser or not at all.
6. **Test isolation:** the mock store is process-global and persists across
   tests in a session. Tests that *register* an address must generate a unique
   one — `tests/test_invites.py` has a `_address()` helper for exactly this,
   after a literal reused across two tests silently became a real account.

---

## 6. Next session — in order

1. **Run the system once with real keys.** One environment, real Claude, DALL·E
   and Supabase, and one walk from register → structure → write → storyboard →
   export. Apply the four migrations at the same time. Everything else on this
   list assumes a system that works, and that assumption is untested.
2. **Run the five-writer pilot.** `PILOT.md` specifies it and names what only a
   writer can settle. Cheaper than another quarter of guessing.
3. **Deploy** — Supabase, Railway, Vercel, in that order. `DEPLOYMENT.md` §1–3.
   Merchant accounts need a live URL, so they come after Vercel.
4. **Reconsider pricing before taking money.** The market review argues Rs 999
   is priced against Celtx while the market anchors on Netflix at Rs 499, and
   that Baakhapaa Pro costs the same per year as WriterDuet — which *has* the
   collaboration we descoped.
5. **An annual price.** Khalti and eSewa have no subscription primitive, so
   every month is a fresh chance to lapse. Annual turns twelve renewal risks
   into one.
6. **SMTP + cron for `renewals.py`.** Until then nothing renews on its own for
   Khalti or eSewa customers.

### Still open, smaller

- `PROJECT_PLAN.md` §6/§7 carry the changelog; `MONTH_1_REPORT.md` and
  `SESSION_SUMMARY.md` are historical records and were deliberately left as
  written.
- The corpus fingerprints task (E6) is still blocked — the script corpus is on
  another machine.
- A throwaway `ui-check@example.com` account and two test projects are in the
  local SQLite DB. Delete `baakhapaa_local.db` to reset.
