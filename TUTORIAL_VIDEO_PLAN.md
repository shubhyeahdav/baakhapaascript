# Tutorial video — "Baakhapaa in three minutes"

A voiced walkthrough for a writer opening the product for the first time. The
pitch and update videos are for people deciding whether to care. This one is
for someone who has already decided and wants to start writing.

## What it has to do

**Get a new writer from a blank account to an exported page, in the order they
will meet it.** Every step is filmed in the real product, using the
simplified editor shipped in `bd4d0a1`. Nothing is mocked.

Three rules, all learned from the earlier videos:

1. **Teach the key, not the feature.** "Press Tab" is something you can act on
   from the video. "Smart formatting" is a claim. Every chapter names the
   physical action.
2. **The voice is the clock.** Each segment lasts as long as its narration
   line. The pipeline already works this way (`demo-assemble.mjs`).
3. **Show the result on screen while the voice describes it.** The Assist-tab
   mistake from the pitch video, where the voice described one panel while
   another was showing, is checked by reading frames, not by trusting
   durations.

## Length and shape

About three minutes, in eleven beats. Each step is a short chapter card
(≈2.5 s) followed by footage for the rest of its line. A tutorial is watched
to be followed, so the card is the place to look away and pause.

## The script

| # | Chapter | Narration (spoken) | Footage |
|---|---|---|---|
| 0 | — | "Baakhapaa in three minutes. From a blank account to a finished page." | Title card |
| 1 | Start a project | "Start with a new project. Give it a title, pick a format — a short film here — and create it." | `/projects/new`: title typed, *Short Film* chosen, *Create project* |
| 2 | Your first scene heading | "Every scene starts with where we are. Type the letter i, and Baakhapaa offers INT. Press Tab to take it. Then the place, a dash, and the time of day." | Empty page; `i` → suggestion strip → Tab → location → `- d` → DAY |
| 3 | Characters and dialogue | "Press Enter for the action. Tab moves you to the character column. Type the name, press Enter, and you are writing their line. Enter again brings you back to the action." | Enter → action; Tab → `SITA`; Enter → dialogue; Enter → action |
| 4 | Writing in Nepali | "To write in Nepali, switch the keyboard to अ. Type it the way it sounds — namaste — and it becomes Devanagari." | `A` → `अ`; `namaste` → नमस्ते |
| 5 | The craft check | "As you write, the craft check reads the page. A dot in the margin marks a line worth a second look — a feeling stated instead of played. It reads Nepali too." | Margin dots; Craft tab with findings |
| 6 | Help on a stuck scene | "Stuck? Open Assist and press Read my page. It matches what you have written to a technique, and shows it on the page. To name the problem yourself, ask about something specific." | Assist → *Read my page* → pattern card; *Ask about something specific* opens |
| 7 | See the whole script | "The Corkboard shows every scene as a card. Drag one, and the scene moves in the script itself. The Outline shows where the time went." | Corkboard; Outline |
| 8 | Export | "When it is ready to leave, open File. PDF for reading, Final Draft for production, Word for editing." | *File* menu → *Export PDF* |
| 9 | Learn as you go | "And the course is free on every plan. Nineteen lessons, each one graded by the same craft check, in English or Nepali." | `/learn` |
| 10 | — | "That is everything you need to start. Your next script begins on a blank page." | Closing card |

### Why this order

It's the order a first session actually runs: make the thing, write a line,
write a scene, then get help, then see the shape, then get it out. The course
comes last because it's where a writer goes *after* they've found out they
want it. The front page already sells it to them before they arrive.

### What it deliberately leaves out

- **AI generation, storyboards, payments.** They're paid features, and there's
  no live backend to film them against honestly. A tutorial that shows a
  feature the viewer can't use on their plan is an ad.
- **Sharing and roles.** These are a second-session feature, and they'd add
  forty seconds for something a new writer doesn't need on day one.
- **Long-form video.** It's its own format with its own rules, and it deserves
  its own tutorial rather than a minute in this one.

## Production

| | |
|---|---|
| Voice | Kokoro-82M, `af_heart`, synthesised from phonemes so Nepali words and product names come out right (`scripts/demo/voice.py --comp=tutorial`) |
| Footage | Playwright recording the running app in demo mode: local SQLite, mock AI, nothing billed (`scripts/demo-video.mjs`) |
| Cards | The CSS motion cards (`scripts/demo-motion.mjs --comp=tutorial`) |
| Cut | `scripts/demo-assemble.mjs --comp=tutorial` → `docs/demo-video/baakhapaa-tutorial.mp4` |

## Checks before it ships

- [ ] Every Nepali word is checked in the phoneme printout, not by ear: *namaste*, the अ key, *Baakhapaa*
- [ ] Frames are sampled at every beat boundary, and each shows what its narration describes
- [ ] The footage shows the new header (File, View, Finalize), not the old thirteen controls
- [ ] No frame shows a real email, a real script, or anything outside demo mode
- [ ] It reads with the sound off. The chapter cards carry each step's action
