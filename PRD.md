# PRD — Baakhapaa AI Pre-Production Intelligence System

**Version 1.0 | Last updated: [DATE] | Owner: Shubham**

## 1. Problem Statement

Content creators and filmmakers — especially in Nepal and similar
underserved markets — lack an accessible tool that actively guides them
through pre-production. Existing tools (Final Draft, Celtx, StudioBinder)
provide formatting containers but assume the user already knows story
structure. There is no tool that combines AI-guided screenwriting,
automated storyboarding, and bilingual (Nepali/English) support in one
system.

## 2. Goal

Build a web application that takes a creator from a raw idea to a
production-ready package (script + storyboard + shot list) with AI
actively guiding structure, writing, and visual planning — not just
formatting what the user already knows how to write.

## 3. Target Users

**Primary (Phase 1):** Baakhapaa's internal content team — the CEO and
future hires producing platform content.

**Secondary (Phase 2, post-launch):** External creators — Nepali content
creators moving from short-form to narrative content, film students,
independent filmmakers in Nepal and similar markets who can't afford
StudioBinder's price point or learning curve.

## 4. Core User Stories

1. As a creator, I want to input a genre, tone, and duration and get a
   structured three-act outline, so I don't start from a blank page.
2. As a creator, I want AI to write or improve individual scenes based on
   my brief, so I can move faster than writing every line manually.
3. As a creator, I want automatic storyboard frames generated from my
   finalized script, so I don't need a separate illustrator for pre-viz.
4. As a team, we want to work on the same script together with version
   history, so nothing gets lost and everyone stays in sync — sharing a
   project, roles that decide who can write and who can only read, and
   comments anchored to the line they are about. *(Amended 2026-08-26: this
   story said "in real time" until then. Live co-editing with visible cursors
   is not built and is out of scope for Phase 1 — see below.)*
5. As a creator, I want to export a complete production package (script +
   storyboard + shot list) in one click, so I can hand it directly to a
   production team.
6. As a Nepali creator, I want bilingual output (Nepali dialogue, English
   action lines), so the tool actually fits how scripts are written here.

## 5. Scope — Phase 1 (Current Build)

**In scope:**
- Auth (register/login/JWT)
- Project creation with genre/tone/duration/language parameters
- AI three-act structure generation (33/33/34% time allocation)
- AI scene generation, improvement, and suggestion modes
- Storyboard frame generation (DALL-E) with auto shot-type assignment
- Version history with restore, and a line-by-line diff between any two
  snapshots (FR11)
- Inline comments, anchored to a line and attributed to their author
- Project sharing with per-project roles: Admin / Editor / Viewer (FR12)
- Export: PDF, Word, Final Draft `.fdx`, combined production package
- free / pro / studio subscription tiers, with payment through Stripe, Khalti
  and eSewa

**Out of scope for Phase 1:**
- **Live simultaneous co-editing with visible cursors (FR10).** Descoped
  2026-08-26. Collaboration in this build is asynchronous: sharing, roles and
  attributed line-anchored comments all work. The presence bar that shipped
  earlier was removed on 2026-08-13 because it needed a real Supabase project
  and showed "Solo session" to every user — a promise the build could not
  keep. Real-time editing needs that Supabase project and a conflict-resolution
  design, and was deliberately not faked a second time
- Mobile app (web-responsive only, desktop-first)
- Video analysis / product-tagging module (mentioned in original CEO brief,
  deferred to Phase 3)
- Public marketplace / template sharing between users

## 6. Success Metrics (Phase 1)

- Baakhapaa's internal team completes at least one real production script
  end-to-end using the tool (register → structure → scenes → storyboard →
  export) without needing to fall back to manual methods
- Script generation reduces time-to-first-draft by a target of 60%+
  compared to fully manual writing (self-reported by CEO/team)
- Zero critical security issues open at launch (per AUDIT_REPORT.md)

## 7. Non-Functional Requirements

- **NFR01** — Page loads under 2 seconds on standard connections
- **NFR02** — AI generation responds within 10 seconds for scene-level requests
- **NFR03 (amended 2026-08-26)** — Script data is encrypted **in transit** via
  TLS, and **at rest** by the database provider's disk-level encryption. There
  is **no application-level encryption of `scripts.content`**: anyone holding
  database credentials can read every script, and so can the AI providers a
  generation request is sent to. The original wording of this requirement —
  "all user data encrypted at rest and in transit" — was true of the transit
  half and misleading about the rest half, which is the half a screenwriter
  worried about their unproduced script actually cares about. Stated plainly
  here so the Privacy Policy can be written from something accurate.
  `DATA_HANDLING.md` is the full account of where script text goes.
  Application-level encryption of script bodies remains a design decision, not
  a shipped feature — and it has to be designed before launch rather than
  retrofitted after, because it changes what search, diffing and export can do
- **NFR04** — 99% uptime target once live
- **NFR05** — All user data access enforces ownership checks (no cross-user
  data leaks), and an inaccessible id returns 404 rather than confirming it
  exists
- **NFR06** — Bilingual text rendering (Devanagari + Latin script) works
  correctly in editor and exports

## 8. Open Questions / Decisions Needed

- [x] **Tier names — decided 2026-08-20: `free` / `pro` / `studio`.** These are
      the values stored in `users.subscription_tier` and enforced throughout the
      backend. The proposal's "Free / Creator / Pro" is what gets amended; the
      code and its stored values do not change
- [x] **Pricing — decided: Rs 999 Pro, Rs 2,499 Studio, per month.** Not yet
      checked against the cost model, which is a separate question from naming
- [x] **Payment gateway for Nepal — decided: both, plus Stripe.** Khalti and
      eSewa are chosen per checkout on the pricing page; Stripe stays for
      international cards. Only Stripe has a subscription primitive, so plans
      bought through Khalti or eSewa are time-boxed to 30 days and lapse
- [ ] Whether Phase 2 external launch is invite-only/waitlist or open
- [ ] Data retention period after account deletion (see Data Compliance doc)

## 9. Related Documents

- TRD.md — technical architecture and implementation detail
- CLAUDE.md — current build state and dev conventions
- AUDIT_REPORT.md — security status
- Terms_of_Use.md / Privacy_Policy.md / Data_Compliance_Checklist.md
