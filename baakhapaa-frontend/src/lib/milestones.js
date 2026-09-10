/**
 * What to say to a writer in the middle of a draft.
 *
 * The product speaks at two moments and is silent between them. `PenPrompt`
 * meets a writer on an empty page and vanishes on the first keystroke.
 * `review.py` speaks at finalize. Everything in between — which is where a
 * screenplay actually gets written, over weeks — has nothing: the craft panel
 * and the Story track are both behind tabs a writer has no reason to press.
 *
 * CLAUDE.md states the gap outright: `review.py`'s structural findings are
 * "the only automatic route into Story, and the craft panel links the rest of
 * that track by hand". This is a second automatic route.
 *
 * WHAT THIS IS NOT
 * ----------------
 * Not a nag, not a streak, not a timer. The same reasoning that kept hearts and
 * points out of The Pen applies harder here: a screenwriter who spends a week
 * on one scene is working, not failing, and a product that interrupts them to
 * say so has misunderstood the craft. So:
 *
 *   - At most one note, ever, at a time.
 *   - Each fires once and is dismissible for good, per script.
 *   - Page-position notes have a WINDOW. A midpoint note that is still on the
 *     page at page 80 is not a prompt, it is furniture.
 *   - Nothing fires in focus mode, and nothing blocks the page.
 *
 * ON THE THRESHOLDS, HONESTLY
 * ---------------------------
 * `scenes-unmarked` is measured fact: the writer has written scenes and marked
 * none of them, and three things in the product read that field. It needs no
 * threshold and no theory.
 *
 * The three page-position notes are a convention, not a measurement. Twelve
 * percent for the inciting incident and fifty for the midpoint are the shape
 * the corpus's own Story lessons teach, and they are roughly where feature
 * screenwriting handbooks put them — but no check in this repository can tell
 * a writer their midpoint does not flip, and this one does not claim to. Each
 * one asks a question and links the lesson; none of them asserts a fault.
 * Whether writers find them useful or patronising is a pilot question, which
 * is why `PILOT.md` is where they should be settled and why they are cheap to
 * remove: delete an entry from the array.
 */

// One page is roughly one minute of screen time. That equivalence is already
// load-bearing elsewhere — `screenplay.PAGE_LINES` lays out the PDF with it and
// OutlineView compares written minutes against planned ones — so planned
// minutes convert straight to planned pages.
export const MINUTES_PER_PAGE = 1;

export const MILESTONES = [
  {
    key: "scenes-unmarked",
    // The only note here that reports something rather than asking something.
    // The scene rail counts majors, the outline reads act balance from them,
    // and the storyboard picks a shot type from them — so a draft with no
    // major scene is not a neutral state, it is three features reading zero.
    // Until the corkboard badge became a control there was no way to fix it,
    // which is why this note could not have existed before now.
    lead: (f) =>
      `${f.sceneCount} scenes, and none of them is marked a turning point.`,
    body:
      "The scene rail, the outline's act balance and the storyboard all read " +
      "that mark. Press a scene's badge on the corkboard to set it.",
    cta: { label: "Open the corkboard", action: "corkboard" },
    due: (f) => f.sceneCount >= 3 && f.majorCount === 0,
  },
  {
    key: "inciting",
    at: 0.12,
    lesson: "inciting",
    lead: () => "Around here, something should have forced a choice.",
    body:
      "Not an event that happens to your protagonist — a moment that makes " +
      "them decide. The lesson is nine minutes.",
    cta: { label: "The inciting incident is a choice", action: "lesson" },
  },
  {
    key: "midpoint-flip",
    at: 0.5,
    lesson: "midpoint-flip",
    lead: () => "You are at the middle of the script.",
    body:
      "This is where the register is supposed to change — the thing they " +
      "wanted stops being the thing the story is about.",
    cta: { label: "The midpoint flips the register", action: "lesson" },
  },
  {
    key: "redefine-victory",
    at: 0.88,
    lesson: "redefine-victory",
    lead: () => "The ending is close.",
    body:
      "Getting what they wanted is rarely the ending. Winning usually has to " +
      "mean something different by now than it did on page one.",
    cta: { label: "Redefine what winning means", action: "lesson" },
  },
];

// How far past its threshold a page-position note stays relevant. Eight percent
// of a 90-page feature is about seven pages — a sitting or two. Past that the
// moment has gone and saying so is just clutter.
const WINDOW = 0.08;

/**
 * The facts a milestone is allowed to see.
 *
 * Deliberately narrow. A milestone that could read the draft text would drift
 * into being a second linter, and there is already a linter that does that job
 * properly and deterministically.
 */
export function readFacts({ pageCount = 0, scenes = [], suggestions = null } = {}) {
  const acts = Array.isArray(suggestions?.acts) ? suggestions.acts : [];
  const plannedMinutes = acts.reduce(
    (n, a) => n + (Number(a?.duration_minutes) || 0),
    0,
  );
  const plannedPages = plannedMinutes / MINUTES_PER_PAGE;
  return {
    pageCount,
    plannedPages,
    // `progress` is null, not 0, when nothing is planned. Zero would read as
    // "at the very start" and fire the inciting note on every draft that has
    // never been through the structure step, which is most of them.
    progress: plannedPages > 0 ? pageCount / plannedPages : null,
    sceneCount: scenes.length,
    majorCount: scenes.filter((s) => s?.scene_type === "major").length,
  };
}

/**
 * The one note to show, or null.
 *
 * Later milestones win. A writer at the midpoint who never marked a scene has
 * two due at once, and the midpoint is the more timely thing to say — the
 * unmarked-scenes note will still be true, and still due, tomorrow.
 */
export function milestoneFor(facts, dismissedKeys = []) {
  const dismissed = new Set(dismissedKeys);
  let found = null;
  for (const m of MILESTONES) {
    if (dismissed.has(m.key)) continue;
    if (m.due) {
      if (m.due(facts)) found = m;
      continue;
    }
    // A page-position note, which needs a plan to be a position in.
    const p = facts.progress;
    if (p === null) continue;
    if (p >= m.at && p < m.at + WINDOW) found = m;
  }
  return found;
}

// Dismissals are per script: the same writer opening a different screenplay is
// at a different point in a different story. Kept in the browser rather than on
// the row because it is a preference about being spoken to, not a fact about
// the work — and losing it costs a writer one note they can dismiss again.
export const dismissKey = (scriptId) => `baakhapaa:milestones:${scriptId}`;
