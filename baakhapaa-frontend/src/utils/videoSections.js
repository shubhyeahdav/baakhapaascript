/**
 * The section vocabulary, per mode — the JS side of `videoscript.py`.
 *
 * `SECTION_KINDS_BY_MODE` in the parser is the authority; this mirrors it so
 * the editor can offer a completion without a round trip on every keystroke.
 * The two lists are pinned against each other in `videoSections.contract.test.js`,
 * for the reason `export_parser_contract.py` already documents: two
 * implementations of one grammar, written in different languages, with nothing
 * connecting them but a test.
 *
 * Why a mode at all: a video essay is written for purchased attention and a
 * course lesson for committed attention. An essay opens on a hook because the
 * viewer has not yet agreed to watch; a lesson opens on an objective because
 * they have. Offering `## HOOK` to someone writing lesson four is not a
 * harmless extra option — it is the product telling them to write the wrong
 * thing at the one moment they asked for help.
 */

export const ESSAY_KINDS = ["hook", "promise", "segment", "payoff", "cta"];
export const COURSE_KINDS = ["objective", "concept", "proof", "exercise", "check"];

export const DEFAULT_MODE = "essay";

export const KINDS_BY_MODE = {
  essay: ESSAY_KINDS,
  course: COURSE_KINDS,
};

/**
 * Only `course` differs — the same rule as `videoscript.mode_of`.
 *
 * Everything else (essay, tutorial, documentary, commentary, vlog, and any
 * category a future version adds) is an essay, because a category nobody
 * recognised is far more likely to be watched than practised, and guessing
 * course would draw the wrong instrument.
 */
export const modeOf = (videoCategory) =>
  videoCategory === "course" ? "course" : DEFAULT_MODE;

/** Kinds for a mode, defaulting rather than throwing on an unknown mode. */
export const kindsFor = (mode) => KINDS_BY_MODE[mode] || KINDS_BY_MODE[DEFAULT_MODE];

/**
 * The synonyms the PARSER accepts, per mode. Mirrored here only so a
 * completion can resolve a heading a writer typed their own way — never to
 * suggest one. Offering a writer four names for the same section is a menu,
 * not help, so only the canonical name is ever completed.
 */
export const SYNONYMS_BY_MODE = {
  essay: {
    intro: "hook", introduction: "hook", "cold open": "hook",
    outro: "cta", "call to action": "cta", "wrap up": "cta",
    conclusion: "payoff", takeaway: "payoff",
  },
  course: {
    goal: "objective", outcome: "objective",
    idea: "concept", theory: "concept",
    evidence: "proof", measurement: "proof",
    practice: "exercise", task: "exercise",
    review: "check", feedback: "check",
  },
};

/**
 * Where an unrecognised heading lands, per mode — `videoscript`'s
 * `FALLBACK_KIND_BY_MODE`.
 *
 * Every section gets a kind; none is ever null. A writer inventing a section
 * name is writing, not erring, and a null here would have to be special-cased
 * by every consumer. Each mode falls through to its own body-content kind, so
 * a kind that leaves this module is always one of that mode's own.
 */
export const FALLBACK_KIND_BY_MODE = {
  essay: "segment",
  course: "concept",
};

/**
 * Which kind a heading name is, in this mode.
 *
 * Kinds match the FIRST WORD (so `## SEGMENT 2 - 3:00` is a segment) and
 * synonyms match the whole heading — `"CALL TO ACTION"` has no single word
 * that identifies it. That asymmetry is the parser's, and copying it is the
 * point: a heading the parser calls a segment must not read as unknown here.
 */
export function kindOf(name, mode = DEFAULT_MODE) {
  const whole = (name || "").trim().toLowerCase();
  const fallback = FALLBACK_KIND_BY_MODE[mode] || FALLBACK_KIND_BY_MODE[DEFAULT_MODE];
  if (!whole) return fallback;

  const synonyms = SYNONYMS_BY_MODE[mode] || {};
  if (synonyms[whole]) return synonyms[whole];

  const kinds = kindsFor(mode);
  const first = whole.split(/\s+/)[0];
  if (kinds.includes(first)) return first;

  return fallback;
}
