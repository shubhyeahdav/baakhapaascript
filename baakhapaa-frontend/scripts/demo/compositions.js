/**
 * Which video is being built.
 *
 * Two so far, from one pipeline:
 *
 *   pitch   the investor demo — what the product is and why it is hard to copy
 *   update  a release note — what changed, for people who already use it
 *
 * The release note's cards are built with the motion-graphics engine
 * (`motion/clips/`, rendered frame-by-frame with motion blur) rather than
 * with `demo-motion.mjs`'s CSS keyframes. A beat marked `engine: true` takes
 * its card from `motion/out/<id>.mp4`. The two card systems coexist on
 * purpose: the engine gives a shape that morphs through states under a real
 * cursor, which is worth the extra authoring for a release note where the
 * change IS the content; the CSS cards remain the cheap option for a card
 * that only has to state something.
 *
 * They want opposite things from the same footage. A pitch needs the claim
 * first and the evidence under it; a release note needs the change first and
 * can assume the viewer knows what the product does. So the beats differ and
 * the narration differs, while the cards, the recorder and the cut are shared.
 *
 *   node scripts/demo-motion.mjs --comp=update
 *   node scripts/demo-assemble.mjs --comp=update
 */
import { BEATS as PITCH } from "./motion.js";

/**
 * The release note.
 *
 * Its last beat is the one that matters most and is the easiest to leave out:
 * none of this is deployed. Saying so is what makes the rest of it credible
 * to the people who would notice.
 */
export const UPDATE = [
  {
    id: "u01-intro",
    engine: true,
    voice: "u01-intro",
    kicker: "What changed",
    lines: ["Three things,", "and one caveat."],
  },
  {
    id: "u02-devanagari",
    engine: true,
    voice: "u02-devanagari",
    // The engine clip is 12.8s long, so that is the hold; the remaining ~4.6s
    // of the line goes to real footage of the Craft panel. Graphic explains,
    // application proves.
    hold: 12.8,
    clip: "02-linter",
    clipFrom: 11.5,
    kicker: "Fixed",
    lines: ["A Nepali screenplay", "now lints."],
    // The numbers are the whole point of this beat, and they are small enough
    // to read at a glance — which is what a release note gets, a glance.
    bars: {
      caption: "Craft findings on the same Devanagari scene",
      rows: [
        { label: "before", value: 3 / 6 },
        { label: "after", value: 1.0 },
      ],
      gap: "the three new ones only run on dialogue",
    },
  },
  {
    id: "u03-longform",
    voice: "u03-longform",
    hold: 4.0,
    clip: "05-video",
    kicker: "New",
    lines: ["Long-form video", "is its own format."],
    foot: "Sections live in the document, so they survive export, diff and reorder.",
  },
  {
    id: "u04-keys",
    voice: "u04-keys",
    hold: 3.5,
    clip: "u04-keys",
    kicker: "New",
    lines: ["The keys follow", "the format."],
    foot: "Tab opens a b-roll cue instead of a screenplay indent.",
  },
  {
    id: "u05-caveat",
    engine: true,
    voice: "u05-caveat",
    kicker: "Not yet shipped",
    lines: ["On a branch,", "with the tests green."],
    stats: [
      ["1,187", "backend tests"],
      ["1,422", "frontend tests"],
      ["0", "deployed"],
    ],
    foot: "The deployed build still has the Devanagari bug. This is what is waiting to go out.",
  },
];

/**
 * The tutorial: a new writer from a blank account to an exported page, in the
 * order they will meet it. TUTORIAL_VIDEO_PLAN.md has the script and the
 * reasons for what is left out.
 *
 * Each step is a short card and then the product doing the thing. The card's
 * `foot` names the physical action — the key to press — because most of this
 * will be watched with the sound off, and a tutorial that only works with the
 * sound on teaches nobody on a bus.
 *
 * "Step N" stays on the cards on purpose. A kicker that only decorates a
 * heading is noise; a step number in a tutorial is the information a viewer
 * needs to find their place again after pausing.
 */
const STEP_HOLD = 2.6;
const step = (n, id, lines, foot, clip, extra = {}) => ({
  id, voice: id, hold: STEP_HOLD, clip,
  kicker: `Step ${n}`, lines, foot, ...extra,
});

export const TUTORIAL = [
  { id: "t00-intro", voice: "t00-intro",
    kicker: "Baakhapaa", lines: ["In three minutes."],
    foot: "From a blank account to a finished page." },
  step(1, "t01-project", ["Start a project."],
       "Title  →  format  →  Create project", "t01-project"),
  step(2, "t02-heading", ["Your first", "scene heading."],
       "Type  i  then press Tab  →  INT.", "t02-heading"),
  step(3, "t03-dialogue", ["Characters", "and dialogue."],
       "Tab  →  character column     Enter  →  their line", "t03-dialogue"),
  step(4, "t04-nepali", ["Write in Nepali."],
       "Press अ   ·   type namaste  →  नमस्ते", "t04-nepali"),
  step(5, "t05-craft", ["The craft check."],
       "A dot in the margin marks a line worth a second look", "t05-craft"),
  step(6, "t06-assist", ["Help on a", "stuck scene."],
       "Assist  →  Read my page", "t06-assist"),
  step(7, "t07-views", ["See the", "whole script."],
       "Corkboard   ·   Outline", "t07-views"),
  step(8, "t08-export", ["Export."],
       "File  →  PDF   ·   Final Draft   ·   Word", "t08-export"),
  step(9, "t09-learn", ["Learn as you go."],
       "19 lessons, free on every plan", "t09-learn"),
  { id: "t10-close", voice: "t10-close",
    kicker: "", lines: ["Start writing."],
    end: "baakhapaascript.vercel.app" },
];

export const COMPOSITIONS = {
  pitch: { beats: PITCH, out: "baakhapaa-demo.mp4" },
  update: { beats: UPDATE, out: "baakhapaa-update.mp4" },
  tutorial: { beats: TUTORIAL, out: "baakhapaa-tutorial.mp4" },
};

/** `--comp=update` from argv, defaulting to the pitch. */
export function pickComposition(argv) {
  const arg = argv.find((a) => a.startsWith("--comp="));
  const name = arg ? arg.split("=")[1] : "pitch";
  const comp = COMPOSITIONS[name];
  if (!comp) {
    throw new Error(`no composition "${name}" — have: ${Object.keys(COMPOSITIONS).join(", ")}`);
  }
  return { name, ...comp };
}
