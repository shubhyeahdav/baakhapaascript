# UI Inspiration — Baakhapaa

Real, current (2026) references to study — not generic mood-boarding.
Each entry says exactly *what* to study, not just "this looks nice."

## Products to Study Directly

**Linear** (linear.app)
Study: restraint. Near-black surfaces, muted borders, a single accent
color. Proof that great dark design is mostly about contrast and
hierarchy, not decoration. This is the closest reference to what your
Script Editor should feel like — a tool for long focused sessions, not a
marketing page.

**PostHog** (posthog.com)
Study: data density done right. Packs a lot into a dark UI while keeping
charts/tables legible. Relevant for your future analytics/API-usage
Settings tab — dense information that still reads clearly in dark mode.
Also a counter-example worth knowing: they deliberately reject the
"generic AI SaaS" look with personality and illustration — a reminder
that dark + minimal isn't the only path to feeling premium.

**Cursor** (cursor.com)
Study: developer-tool polish. Since Baakhapaa is also a "professional
tool for makers," not a consumer app, Cursor's restraint and focus on the
actual work surface (not chrome/decoration) is directly relevant.

**Resend** (resend.com)
Study: elegant, minimal dark theme matched precisely to a technical
audience. Good reference for your Pricing and marketing/landing pages
specifically — clean, confident, not over-designed.

## Design Principles for 2026 Dark UI (apply these)

- **Never use pure black.** Use `#121212` to `#1C1C1E` range instead — pure
  black causes harsh contrast and halation around text. (Your current
  `#0A0A0A` background is close to fine, but test it against real content,
  not empty screens — very common mistake.)
- **Off-white text, not pure white**, on dark surfaces — reduces glare/eye
  strain over long sessions (relevant since your users write for hours).
- **One accent color, used sparingly** — not multiple competing accents.
  Your gold `#D4A843` is a good single-accent choice; resist adding a
  second "highlight" color later without a strong reason.
- **WCAG contrast minimums:** 4.5:1 for body text, 3:1 for large text/UI
  components — check this specifically once your final palette is locked,
  especially any muted-gray text on dark surfaces.
- **Dark-as-default with one focused accent** is literally the dominant
  2026 SaaS pattern right now (Linear-purple, Cursor-cyan, etc. style) —
  your gold-accent approach is already aligned with what's currently
  working in the market, not dated.

## What NOT to Copy

- **Bento-grid marketing pages with heavy animation** (Ramp-style) — this
  is a 2026 marketing-site trend, not appropriate for your actual
  in-product screens (Script Editor, Dashboard) where users need to focus,
  not be visually entertained.
- **Illustration-heavy/mascot-driven design** (PostHog's hedgehog) — fun,
  but wrong tone for a professional filmmaking tool; would undercut the
  "premium, serious craft tool" positioning you want.
- **Multi-color feature cards** — fine for marketing pages, wrong for your
  actual working screens where visual noise competes with the user's
  script content.

## Where to Actually Browse More (do this yourself, 20 min)

- **saaspo.com/style/dark-mode** — curated live dark-mode SaaS sites,
  good for landing page inspiration specifically
- **muz.li/inspiration/dark-mode** — broader UI pattern inspiration,
  good for individual component ideas (buttons, cards, modals)

## How to Use This With Claude Design / Antigravity

When you prompt Claude Design or Antigravity for screen designs, reference
this doc directly:

```
Study Linear's approach to dark UI restraint and PostHog's data density 
handling. Apply similar principles to [screen name] — near-black surface, 
single gold accent, off-white (not pure white) text, WCAG-compliant 
contrast. Avoid decorative illustration or multi-color accents — this is 
a professional tool for long focused writing sessions, not a marketing page.
```

This gives it concrete, current references instead of vague "make it look
nice" instructions.
