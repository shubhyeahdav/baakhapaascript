# PROJECT_PLAN — Full Stock-Take & Priority Plan

**Stock-take: 2026-07-11 · Last updated: 2026-07-14** (11 commits later — see
§6 for what changed since the stock-take; §1–§3 below remain accurate except
where §6 supersedes them).

Produced by a complete planning pass: every backend file and frontend page
read, full git history reviewed, and the entire flow re-tested end-to-end
against the running servers. No code was changed in the original pass.

**Test environment:** demo mode — local SQLite persistence, mock Claude, mock
DALL-E, mock Stripe (all `.env` keys are placeholders). Every HTTP result
below is from a live run, not assumption.

---

## 1. CURRENT STATE — verified feature by feature

Legend: ✅ fully working (verified today) · 🟡 partially built · ❌ not started

| Feature | Status | Verified today (live results) | Notes / where it breaks |
|---|---|---|---|
| **Auth** | ✅ | register 200, login 200, `/auth/me` 200, wrong password 401, expired/garbage token 401 | Strong-password rules are **client-side only** — the API itself accepts 1-char passwords |
| **Projects CRUD** | ✅ | create/list/get 200; ownership 404 for other users | Delete endpoint exists but has **no UI affordance** on the bento dashboard |
| **Script structure (two-step)** | ✅ | generate-structure 200 returns preview, **0 scenes persisted**; add-scene 200 saves exactly one; suggestions survive reload (`suggestions_json`) | New flow (commit `2a511e4`). Custom user-authored scenes (not from suggestions) have **no UI** yet — API supports it |
| **AI generation (scene/improve/suggest)** | ✅ | all three 200 (mock content) | Real-Claude path untested — never run with a real key |
| **Script save / auto-save** | ✅ | PUT 200; each save snapshots previous content as a version | Auto-save timer fires every 15 s in editor |
| **Storyboard** | ✅ | generate 200 (5 frames, placeholder images), get 200, regenerate + frame-update routes exist | Real DALL-E path untested; StoryboardView has no per-frame edit/regenerate UI (backend routes are orphaned) |
| **Version history** | ✅ | list 200 (2 versions after 2 saves), restore 200, diff/compare 200 | Diff is set-based (unordered, ignores duplicates) — crude output, known debt |
| **Comments** | ✅ | add 200, get 200, owner-only delete | Line number is a manually-typed field, not anchored to actual script lines — "inline comments" is a stretch |
| **Collaboration (presence)** | 🟡 | CollabBar renders "Solo session" fallback | Presence needs real Supabase realtime keys — **never tested live**. Live co-editing is explicitly out of Phase-1 scope |
| **Export** | 🟡 | PDF valid `%PDF`, Word 200, package valid `%PDF`; intruder gets 404 | **Bilingual gap:** ReportLab uses built-in Courier, which has no Devanagari glyphs → Nepali text in PDF/package exports will not render (untested but near-certain). Violates PRD §7 |
| **Subscription / payment** | 🟡 | checkout 200 (mock upgrades tier to pro), invalid tier 400, unauth 401, webhook signature-verified in real mode | Demo-mode only so far. **Tier limits are enforced nowhere** — free users get unlimited projects/AI/exports despite the pricing page promising "1 active project" |
| **Security (cross-user)** | ✅ | intruder read/export/add-scene against another user's script → all 404 | `require_script_access` holds across every script-scoped domain |

### Frontend shell state (verified in browser this session)

- **Rethemed** to warm near-black + gold (Spectral/Mukta/Courier Prime) across all pages.
- **Dashboard**: bento poster grid + TopNav + command palette (⌘K) — all working.
- **Editor**: clickable scene cards + timeline strip + structure-preview panel — working.
- **Inconsistencies found:**
  - `Sidebar` links to **`/settings` — no such route exists** (dead link). Sidebar is still used by NewProject only.
  - Only Dashboard uses the new TopNav; NewProject uses the old Sidebar shell; StoryboardView has an older header style. The "shell split" is half-applied.
  - Screenplay page renders in a **narrow column** (pre-existing CSS issue, still unfixed).
  - Command palette caches the project list on first open (stale after creating a project until reload) — minor.
  - Structure panel has no minimized/compact timeline state (was requested, interrupted mid-build).

### Undocumented-but-built (commits since CLAUDE.md's last session log)

`80c4da2` SQLite persistence · `dca0472` CORS localhost regex · `58454ac` Stripe
checkout · `c39490a` password rules + error messages · `d6bcb8a` retheme ·
`484d3e6` TopNav/pill buttons · `a86b2ef` bento dashboard + scene nav ·
`2fb4555` command palette · `2a511e4` two-step structure flow · `8730146`
GENERATION_ARCHITECTURE.md (spec only, nothing implemented).

---

## 2. GAPS AGAINST PRD (Phase 1 scope)

| PRD item | Status | Gap |
|---|---|---|
| US1 — three-act outline from genre/tone/duration | ✅ done (upgraded to preview + selective add) | — |
| US2 — AI write/improve scenes | ✅ done (mock verified) | Real-key path never exercised |
| US3 — automatic storyboard frames | ✅ core done | Frame edit/regenerate UI missing (backend ready) |
| US4 — real-time collaboration + version history | 🟡 | Versions ✅. Presence built but unverified without real Supabase; comments not truly line-anchored |
| US5 — one-click production package | ✅ | — |
| US6 — bilingual output (Nepali dialogue) | 🟡 | Editor/UI fine (Mukta covers Devanagari). **PDF/package export almost certainly cannot render Devanagari** (ReportLab font). Word export likely OK |
| Free/Creator/Pro tiers (UI built, payment not wired) | exceeded scope: Stripe checkout wired (test mode) | **Tier limits unenforced** — the actual product gating doesn't exist |
| §7 non-functional: bilingual rendering in editor **and exports** | 🟡 | Export side, as above |
| §7: ownership checks everywhere | ✅ verified today | — |
| Success metric: team completes one real script end-to-end | ❌ blocked externally | Requires real API keys + real Supabase — everything to date is demo-mode |

Explicitly out of Phase-1 scope (correctly absent): live co-editing cursors,
mobile app, video analysis, marketplace.

---

## 3. SECURITY STATUS — AUDIT_REPORT items re-checked today

| Item | Audit flag | Status now |
|---|---|---|
| **S1 JWT_SECRET fallback** | `"fallback-secret"` if env missing; guessable committed default | **STILL OPEN.** `auth.py:13` unchanged; `.env` still carries the original guessable value. Forgeable tokens if deployed as-is |
| **S2 Login rate limiting** | none | **STILL OPEN.** No limiter on `/auth/login`; brute-force possible |
| **S3 Mock test user** | compiled into database.py, pro tier | **PARTIALLY MITIGATED.** Now seeded only when the local DB is empty, and only in mock mode — real-Supabase deployments never see it. Code still ships the bcrypt hash |
| **S4 CORS** | localhost:3000/3001 only | **CHANGED — WIDER (dev-only by design).** Now a regex allowing any localhost/127.0.0.1 port (commit `dca0472`, needed for preview ports). Must be replaced with an explicit prod-domain allowlist before deploy — comment in `main.py` says so |
| B1/B2 ownership + whitelists | fixed in audit | **HOLDING.** Re-verified cross-user 404s today, including the new `/scripts/add-scene` |

**New surfaces since the audit (not previously reviewed):**
- `/subscription/webhook` — unauthenticated by design; protected by Stripe
  signature verification in real mode; inert in demo. Acceptable.
- `/subscription/checkout` — auth-gated, tier whitelist. OK.
- Password strength enforced **only in the React form** — the register API
  accepts anything. Needs a server-side rule to be meaningful.
- `suggestions_json` returned via `GET /scripts/{id}` — owner-only. OK.

---

## 4. REVISED PRIORITY PLAN

### A. Blockers (core flow breaks or product promise fails)

| # | Item | Size | Files |
|---|---|---|---|
| A1 | **Devanagari in PDF exports** — register a bundled Devanagari-capable TTF (e.g. Noto Sans Devanagari) with ReportLab and use it for script body text; verify Nepali content renders in PDF + package | **M** | `export_service.py`, add font asset |
| A2 ✅ done `85a1a9c` | **Dead `/settings` link** — either add a minimal Settings page+route or remove the link | **S** | `Sidebar.jsx`, `App.jsx` |
| A3 | **First real-keys smoke test** — run the whole flow once with real Claude + DALL-E + Supabase keys; fix whatever surfaces (real-AI JSON parsing, Supabase client differences vs mock, presence). Everything to date is mock-verified only | **M** (unknowns) | `.env`, potentially `script_engine.py`, `database.py`, `realtime.js` |

### B. Security-critical (before any real deployment)

| # | Item | Size | Files |
|---|---|---|---|
| B1 ✅ done `3b66222` | Require `JWT_SECRET` from env — remove the fallback, refuse to boot without it (or generate+persist one); set a strong value | **S** | `auth.py`, `.env` |
| B2 | Rate-limit `/auth/login` (and register) — e.g. slowapi, 5/min/IP | **S** | `main.py`, `auth.py`, `requirements.txt` |
| B3 | Server-side password policy mirroring the client rules (8+ chars, mixed classes) → clean 400 | **S** | `auth.py` or `models.py` (validator) |
| B4 | Production CORS allowlist swap (documented, gated on having a domain) | **S** | `main.py` |
| B5 | Strip the compiled-in test-user hash from non-mock builds (move seed behind explicit `DEMO_SEED=true`) | **S** | `database.py` |

### C. Incomplete features (partially built — finish next)

| # | Item | Size | Files |
|---|---|---|---|
| C1 🟡 **partly done** `297f9ed` | **Tier enforcement.** DONE: AI generation is gated — `generate-scene`/`improve`/`suggest` return 403 for free (`require_paid_tier`), `generate-structure` branches to a RAG-only skeleton, free tier gets RAG recommendations. **STILL OPEN:** (a) free project limit — `POST /projects/` returns 200 unlimited; (b) **Word/package export is gated in the UI only — `GET /export/script/word/{id}` returns 200 for a free user** (verified 2026-07-14). Server-side gate needed | **S** remaining | `projects.py`, `export.py` |
| C2 | **Custom user scenes** — UI to add a scene the AI didn't suggest (API already supports it); pending from an interrupted request | **S** | `ScriptEditor.jsx`, `StructureTimeline.jsx` |
| C3 ✅ done `a74822e` | **Structure panel minimized state** — compact act-timeline bar when collapsed. Built to design **2b** ("instrument, not diagram"): timecode ruler, proportional scene blocks, dashed outline-only blocks, gold playhead, "X written of Y" | **S** | `CompactTimeline.jsx`, `ScriptEditor.jsx` |
| C4 | **Storyboard frame editing UI** — per-frame regenerate (description + shot type) and camera-notes editing; backend routes exist unused | **M** | `StoryboardView.jsx` |
| C5 | **Real presence verification** — CollabBar against a live Supabase project (pairs with A3) | **S** after A3 | `realtime.js`, `CollabBar.jsx` |
| C6 | **Line-anchored comments** — pick line from the editor selection instead of a typed number | **M** | `CommentThreads.jsx`, `ScriptEditor.jsx` |
| C7 | Stripe real test-mode run — real `sk_test` keys, `stripe listen` webhook, verify tier updates via webhook (not the demo shortcut) | **S** | `.env`, no code expected |

### D. Polish & design (last)

| # | Item | Size | Files |
|---|---|---|---|
| D1 | Widen the screenplay page column (long-standing CSS issue) | **S** | `index.css` |
| D2 🟡 | Finish the shell split — TopNav on NewProject (+ editorial wizard styling per design 2d), consistent StoryboardView header, retire Sidebar or make it consistent. NOTE: nav tabs now all route (`d6b1e3c`), and new `/storyboards` + `/exports` index pages use TopNav; NewProject still uses the old Sidebar | **M** | `NewProject.jsx`, `StoryboardView.jsx`, `Sidebar.jsx` |
| D3 | Wizard "Skip — start blank" escape hatch (design item 9) | **S** | `NewProject.jsx` |
| D4 | Bilingual नेपाली/English/split reading toggle in editor (design item 6) | **M** | `ScriptEditor.jsx` |
| D5 | Command palette: refresh project list on open; add "jump to scene" action | **S** | `CommandPalette.jsx` |
| D6 | `difflib`-based ordered version diff + narrative timeline styling (design item 8) | **M** | `versions.py`, `VersionHistory.jsx` |
| D7 | Ordered-order_index for custom scenes; store suggestion `scene_number` on scenes so renames don't resurrect suggestion cards | **S** | `scripts.py`, `StructureTimeline.jsx` |
| D8 | Dashboard project delete affordance | **S** | `Dashboard.jsx` |
| D9 | Remaining premium design features (AI-provenance gutter, version-freshness indicator, presence-on-dashboard) — each **L**, spec'd in the design brief; sequence after A–C | **L** | multiple |

**RAG script engine:** no longer "not in this plan" — a first slice of
GENERATION_ARCHITECTURE.md shipped (`32d0956`, see §6). The remaining spec work
(4-stage scaffold→expansion→critic→revision pipeline) is still a separate track.

### Suggested order of attack (revised 2026-07-14)
1. **A1** Devanagari PDF font (last true blocker) →
2. **B2/B3** rate limit + server-side password policy (one short security pass) →
3. **C1 remainder** free project limit + server-side export gate (small, and the
   export gate is currently bypassable) →
4. **C2** custom scenes (finishes the last interrupted request) →
5. **A3 + C5 + C7** the real-keys milestone →
6. **C4, C6** → D-track.

---

## 5. Environment facts (for whoever picks this up)

- Demo mode persists to `baakhapaa-backend/baakhapaa_local.db` (SQLite) —
  **restarts no longer wipe data**; delete the file to reset. CLAUDE.md's old
  "in-memory" note was corrected in this pass.
- Backend must run **without** `--reload` on this Windows box; kill orphans via
  `Get-Process python | Stop-Process -Force`.
- Existing local test accounts: `test@example.com`/`password` (pro), plus
  various `*_@example.com` accounts created by automated tests. One junk
  project has a shell-mangled Devanagari title ("?????? WiFi") — data only.
- **CRA dev server wedged once** on this machine (hung pre-compile across
  restarts, cache clears, and killing 8 orphaned node processes).
  `npm run build` was unaffected; a reboot cleared it. If `npm start` hangs,
  that's the cause — not the code.
- `gh` is **not installed**; the git credential helper holds GitHub auth, so
  `git push` works but PRs must be opened in the browser. `winget install
  GitHub.cli && gh auth login` would remove that friction.

---

## 6. CHANGELOG SINCE THE STOCK-TAKE (2026-07-11 → 07-14)

11 commits. §1–§3 above are the 07-11 snapshot; where this section conflicts,
this section wins.

### Shipped

| Commit | What | Plan item |
|---|---|---|
| `85a1a9c` | Settings page (Account / Team Members / API Usage) — killed the dead `/settings` link | **A2 ✅** |
| `3b66222` | `JWT_SECRET` required — refuses to boot on missing/short/default secret; fresh 64-char value in `.env` | **B1 ✅** |
| `32d0956` | **RAG retrieval**: `knowledge_base.json` (15 structural analyses), `rag.py` (fastembed `bge-small-en-v1.5`, 384-dim, local — no API key), `load_knowledge_base.py` one-command loader, `pgvector_script_patterns.sql`, patterns injected into `generate_structure` | new track |
| `00918e5` `97f906c` | Two project skills: `script-rag` (how to operate the pipeline) and `script-structure` (the writing playbook + beat grammars distilled from all analyses) | — |
| `297f9ed` | **Freemium split**: `POST /scripts/recommendations` (all tiers, RAG-only, zero Claude cost); Claude endpoints gated to Pro/Studio; free `generate-structure` returns a RAG-grounded skeleton | **C1 🟡** |
| `4fa5d94` | Profile avatar opened → account dropdown instead of instant logout | — |
| `a74822e` | Minimized structure panel → 2b timeline instrument | **C3 ✅** |
| `c947116` | Pattern recs: real project genre/tone (was hardcoded Drama/Emotional), auto-load, focus chips, progressive-disclosure cards | — |
| `d6b1e3c` | All four nav tabs clickable; new `/storyboards` + `/exports` index pages; Team deep-links to Settings | **D2 🟡** |

### Bugs found and fixed along the way (not in the original plan)

- **Mock DB `delete()` ran eagerly before chained `.eq()` filters** — so
  `table.delete().eq(...)` wiped the **entire table** in demo mode. Affected
  project and comment deletes. Now deferred to `execute()` (`32d0956`).
- **Editor hardcoded `genre: "Drama", tone: "Emotional"`** on every AI call;
  the script API never exposed the project's real genre/tone. Fixed by
  embedding the parent project in `GET /scripts/{id}` (`c947116`). Same fix
  repaired the editor header, which showed "Workspace /" with no title.

### Corrections to §1–§3

- **Export tier gating is UI-only.** `GET /export/script/word/{id}` returns 200
  for a free user (verified 07-14). The Exports page hides it behind ✦, but the
  API doesn't enforce it. Folded into **C1**.
- **§1 "Structure panel has no minimized state"** — resolved (C3).
- **§1 "Sidebar links to /settings — no such route"** — resolved (A2).
- **§3 S1 (JWT fallback)** — resolved (B1). **S2/S4 still open. S3 unchanged.**
- The RAG library is **15 entries**; retrieval differentiation is genuinely
  limited at that size — a few sources dominate results. It sharpens as
  analyses are added (template in the `script-structure` skill).

### Repo / delivery

- Remote wired: `shubhyeahdav/baakhapaascript`, **default branch `codebase`**
  (the old `main` holds only an unrelated empty starter commit — don't target it).
- **PR #1** open: `editor-ux-and-nav-fixes` → `codebase` (4 commits, 8 files,
  +659/−99, mergeable clean).
