# Promotional motion graphics — what to make, how, and what not to claim

Written 2026-10-28. Companion to `DEMO_VIDEO_SCRIPT.md` (the 68-second investor
cut), which this extends from one investor film to the assets that sell the
product to writers. Research sources are at the end; where a source is a vendor
blog or a sponsored piece it is marked, and its number is not repeated here as a
fact.

---

## The short answer

**Keep the pipeline you already have.** `scripts/demo-motion.mjs` records
animated HTML cards with Playwright, `voice.py` narrates locally with Kokoro,
the voice sets the clock, ffmpeg cuts. That is the same idea the paid tools
sell — UI rebuilt as code and animated — at zero licence cost, already in the
brand tokens (`motion.js` `THEME`), and already holding the rule that makes
"premium" read as premium rather than as stock: *motion has a job; nothing
spins, bounces or slides in from off-screen.*

What "premium" means in practice for this product is four things, none of which
is a new tool:

1. **Real UI, not mockups.** The product is the hero. Every SaaS launch guide
   found agrees on this, and Baakhapaa's real UI is already dark-and-gold and
   looks finished.
2. **One idea per beat, lands in under 1.6 s, then holds.** Already the rule in
   `motion.js`.
3. **Typography doing the motion** — Spectral headlines whose words rise in
   reading order, numbers that count (16% → 90% retrieval is the best motion in
   the product because the movement *is* the argument).
4. **Sound-off first.** Most social video is watched muted, so every claim has to
   be readable on screen, in Nepali and English, without the narration.

---

## Made so far

**The English launch film** (asset 2, 2026-10-29) —
`docs/promo/baakhapaa-promo-en.mp4`, 67 s, 1920×1080, no audio track, with
`baakhapaa-promo-en-poster.jpg` beside it. Four chapters (Write, Read, Learn,
Plan), each a caption beside a replica of the real screen. It is made to be
read with the sound off.

- **Source:** `baakhapaa-frontend/scripts/promo/film.html`. Every frame is a
  function of one number, `seek(t)`, so the same file plays in a browser and
  renders exactly.
- **Render:** `node scripts/promo-render.mjs` steps that clock at 30 fps and
  encodes the frames with ffmpeg. This is the frame-accurate render the tools
  table below names Remotion for, without the dependency.
- **Check single frames:** `--stills 16,25,35` writes PNG stills before you
  spend the ~6 minutes on a full render.
- **What it shows:** the scene, both drafts, the linter's notes, lesson 1 and
  its grader text, and 91.3% — all the same sources the landing page and tour
  use.
- **What it does not show:** AI generation of any kind.
- **Not done yet:** a narrated version. `voice.py` needs the Kokoro model,
  which the cloud session cannot download.

## What to make, in order

| # | Asset | Length / shape | Where it lives | Blocks on |
|---|---|---|---|---|
| 1 | **Hero loop** | 8–12 s, 16:9 and 4:5, no audio track, seamless loop | Top of the home page at `/` | The home page (Month 4 Day 16) — `/` still redirects to login |
| 2 | **Launch film** | 45–60 s, 16:9, narrated + burned captions | Home page below the fold, YouTube, pinned post | Nothing |
| 3 | **Three verticals** | 15–20 s each, 9:16, captions burned in, Nepali first | Facebook / Instagram Reels, TikTok, YouTube Shorts | Nothing |
| 4 | **Pricing explainer** | 6–8 s loop, no audio | Pricing page, beside the credits line | Nothing |

### 1 · Hero loop — "the page reads Nepali"

No words spoken, one on screen. A Devanagari scene being typed in the editor at
real speed; the craft linter's flag slides into the margin on the line that
states a feeling; the line is rewritten; the flag clears. Loop.

That is the single thing no competitor does, and it is shown rather than said.

### 2 · Launch film — reuse the investor cut's structure, change the audience

The investor film argues *the company*. This one argues *the writer's evening*:

1. **Problem, not logo** (0–5 s): *"Your screenplay software doesn't read
   Nepali."* — the guides agree the first five seconds earn the rest.
2. **The page** (5–20 s): format as you type, the page counter, the Pen's first
   line on an empty draft.
3. **The craft panel** (20–35 s): a Devanagari draft, the linter's findings, the
   matched technique.
4. **The proof number** (35–45 s): retrieval counting 16.7% → 90.0% on Nepali
   complaints — the sourced figure from `eval_retrieval.py`.
5. **One call to action** (45–55 s): *"Free. Nineteen lessons. Start writing."*
   One CTA; a film with three has none.

### 3 · Verticals — one claim each

- **"It reads Devanagari."** The linter on a Nepali scene.
- **"A course that grades you."** A lesson, a wrong scene heading, the fix, the
  pass. Free on every plan.
- **"Plan your month."** The credits card: *600 credits — about 200 scenes.*
  This is the new one, and it answers the question a writer asks before paying.

Vertical framing for a desktop UI: crop to the panel that matters, scale it to
fill the width, and put the caption in the top third where platform chrome does
not cover it.

### 4 · Pricing explainer

The credits bar filling as three actions spend it — a scene (3), a rewrite (3),
a frame (1) — with "resets on the first." Reads in one loop, no narration.

---

## Tools — decided, with the alternatives

| Tool | Verdict | Why |
|---|---|---|
| **Existing HTML + Playwright + ffmpeg** | **Use** | Already built, free, brand tokens in place, real motion |
| **Remotion** (React → MP4) | **Next step if frame-accurate renders are needed** | Wall-clock Playwright recording can drop frames under load; Remotion renders frame by frame. Free for a for-profit company of up to 3 people; a company licence beyond that. Same React the frontend uses, so the editor's components could be rendered directly |
| **Jitter / Figma** | Optional, for one-off polish | Good for a designer without code; duplicates UI you can already render for real |
| **After Effects** | Only if hiring a motion designer | Expensive skill, slow to update when the UI changes — and this UI changes weekly |
| **Lottie / Rive** on the site | **Not yet** | Both are for interactive or vector animation inside the page. The hero is real footage; a muted `<video>` is simpler and smaller. No web benchmark found that settles Lottie vs Rive for a hero |

---

## Putting video on the site without slowing it

The home page is meant to be found by search and opened on Nepali mobile data,
so the hero loop has to cost almost nothing:

- `<video autoplay muted loop playsinline preload="metadata" poster="…">` —
  `muted` is what lets it autoplay; `playsinline` stops iOS going fullscreen.
- **Strip the audio track** from the file. Muted still downloads it.
- 1280×720, under ~1.5 MB, H.264 MP4 + a WebM. 8–12 s.
- **`prefers-reduced-motion: reduce` → show the poster, do not play.** The
  editor already respects the writer's eye; the home page should too.
- A visible pause control.
- Pause when the tab is hidden (`visibilitychange`).
- If `play()` is rejected (Data Saver, Low Power Mode), keep the poster and offer
  a play button rather than a black box.
- Lazy-load everything below the fold; the launch film loads on click.
- Add the poster frame to `prerender.mjs` output so a crawler sees an image,
  not an empty box.

---

## What none of these videos may say

Carried over from `DEMO_VIDEO_SCRIPT.md`, because a promo is where the
temptation is strongest:

- **No testimonials or user counts** until the five-writer pilot produces real
  ones. No invented quotes, no stock "writer" faces.
- **No AI-generation claims shown as live** until generation has run against the
  deployed backend with real credit. Footage of AI writing must come from a real
  run, or the beat is cut.
- **No "used by"** logos, festivals or studios.
- **No market-size numbers** — they have not been measured.
- Every on-screen number traces to a script in this repo (`eval_retrieval.py`,
  `check_docs.py`, `ai_budget.plans()`), the way the investor cut's do.

---

## Next steps

1. Build the home page (Month 4 Day 16) — the hero loop needs somewhere to live.
2. Add a `promo` composition set beside `scripts/demo/compositions.js`: the four
   assets above, sharing `THEME` and the beat format.
3. Add a 9:16 and a 4:5 output size to `demo-motion.mjs` (it is fixed at
   1920×1080 today).
4. Burn captions from `voice/lines.json` — the narration text and timings are
   already there, so captions cost no extra transcription.
5. Record the credits card and the pricing explainer — the only footage that
   does not exist yet.

---

## Sources

Length, structure and CTA guidance (vendor and agency blogs — directional, not
measured):
- [Flowjam — SaaS Launch Video: The Complete 2026 Guide](https://www.flowjam.com/blog/saas-launch-video)
- [Atlassian / Loom — product launch video](https://www.atlassian.com/blog/loom/product-launch-video)
- [Atomik Growth — best SaaS launch videos of 2026](https://www.atomikgrowth.com/blog/best-saas-product-launch-videos-of-2026-with-actionable-tips-real-examples)
- [Superside — SaaS video examples](https://www.superside.com/blog/saas-video-examples)
- [Blue Carrot — SaaS demo videos](https://bluecarrot.io/blog/saas-demo-videos-effective-examples-and-best-practices/)

Style reference:
- [Kinetic product motion for Raycast (fan-made case study, Jitter + Resolve)](https://contra.com/p/llNMeeMX-kinetic-product-motion-for-raycast-making-a-ui-feel-alive)

Tools and licensing:
- [Remotion licence](https://github.com/remotion-dev/remotion/blob/main/LICENSE.md) ·
  [pricing](https://www.remotion.dev/docs/pricing) ·
  [licence FAQ](https://www.remotion.dev/docs/license/faq)
- [LottieFiles — Lottie or Rive (vendor)](https://lottiefiles.com/blog/lottie-animations/lottiefiles-or-rive) ·
  [Callstack — Lottie vs Rive, mobile benchmark](https://callstack.com/blog/lottie-vs-rive-optimizing-mobile-app-animation)

Sound-off viewing (sponsored — the 75% figure is not independently sourced):
- [Digiday — 75% of people watch mobile videos on mute](https://digiday.com/sponsored/75-percent-of-people-watch-mobile-videos-on-mute/)

Hero video on the web:
- [MDN — video performance](https://developer.mozilla.org/docs/Learn_web_development/Extensions/Performance/video)
- [Mux — background video performance](https://www.mux.com/articles/add-background-video-website-hls-performance)
- [Swisscom design system — motion accessibility](https://sdx.swisscom.com/latest/foundations/motion-and-transitions/accessibility-VzFzCggM-VzFzCggM)
- [Cloudinary — video autoplay in HTML](https://cloudinary.com/guides/video-effects/video-autoplay-in-html)
