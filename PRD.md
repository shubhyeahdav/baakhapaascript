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
4. As a team, we want to collaborate on the same script in real time with
   version history, so nothing gets lost and everyone stays in sync.
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
- Version history with restore
- Inline comments
- Real-time presence (who's online) — not full live co-editing yet
- Export: PDF, Word, combined production package
- Free/Creator/Pro subscription tiers (UI built; payment not yet wired)

**Out of scope for Phase 1:**
- Live simultaneous co-editing with cursors (presence only for now)
- Payment processing (Stripe/Khalti integration)
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

- Page loads under 2 seconds on standard connections
- AI generation responds within 10 seconds for scene-level requests
- 99% uptime target once live
- All user data access enforces ownership checks (no cross-user data leaks)
- Bilingual text rendering (Devanagari + Latin script) works correctly in
  editor and exports

## 8. Open Questions / Decisions Needed

- [ ] Final pricing confirmation for Creator/Pro tiers (NPR and USD)
- [ ] Which payment gateway for Nepal (Khalti vs eSewa vs both)
- [ ] Whether Phase 2 external launch is invite-only/waitlist or open
- [ ] Data retention period after account deletion (see Data Compliance doc)

## 9. Related Documents

- TRD.md — technical architecture and implementation detail
- CLAUDE.md — current build state and dev conventions
- AUDIT_REPORT.md — security status
- Terms_of_Use.md / Privacy_Policy.md / Data_Compliance_Checklist.md
