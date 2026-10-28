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

export const COMPOSITIONS = {
  pitch: { beats: PITCH, out: "baakhapaa-demo.mp4" },
  update: { beats: UPDATE, out: "baakhapaa-update.mp4" },
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
