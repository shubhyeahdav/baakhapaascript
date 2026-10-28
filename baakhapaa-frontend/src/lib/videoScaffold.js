/**
 * A section spine, from the runtime the writer already chose.
 *
 * `PROJECT_PLAN` calls the structure wizard's removal "structure suggests, it
 * does not write" — a new project opens genuinely empty, and that is right for
 * a screenplay, where the first thing on the page is a scene a human invents.
 *
 * Long-form video is not that. The format's sections are not invented per
 * project: a video essay has a hook, a promise, some segments, a payoff and a
 * call to action, and the writer's actual question is "how long should each
 * one be for a twelve-minute video". That is arithmetic, and making a writer
 * do it by hand is how you get the format's most common failure — a
 * forty-second hook and a twenty-second payoff, which is what
 * `RetentionShape` was built to show.
 *
 * So this offers a spine with TIMES in it, and nothing else. No prose, no
 * placeholder narration, nothing a writer has to delete. The headings are
 * real `videoscript.py` syntax, so the Outline, the Corkboard and the
 * retention shape all populate the moment it is inserted.
 *
 * ON THE SHARES BEING A CONVENTION: they are. They come from the shape of the
 * format as it is practised, not from anything measured on this corpus — the
 * same honesty `RetentionShape` prints on its own face. Nothing here warns,
 * scores or blocks; a writer who deletes the times has a valid draft.
 */
import { modeOf } from "../utils/videoSections";

/**
 * The hook is capped in ABSOLUTE seconds rather than taken as a share.
 *
 * `script_engine.HOOK_MAX_SECONDS` does the same thing for short form, for the
 * same reason: the window in which a viewer decides to keep watching is about
 * as long whether the video runs eight minutes or twenty-five. A share would
 * give a twenty-five-minute essay a forty-five-second hook, which is a
 * different mistake from the one the share was protecting against.
 */
export const HOOK_SECONDS = 15;

/** Share of what is left after the hook. Segments take the remainder. */
export const SHARES = {
  promise: 0.08,
  payoff: 0.15,
  cta: 0.04,
};

/**
 * How many body segments a runtime gets.
 *
 * One segment per four minutes, floored at two and capped at five. Two is the
 * fewest that can be called a run of segments; past five the sections get
 * shorter than the time it takes to make one point, and the writer is better
 * served nesting inside a segment than adding another.
 */
export const SEGMENTS_PER_MINUTES = 4;
export const MIN_SEGMENTS = 2;
export const MAX_SEGMENTS = 5;

export const segmentCount = (minutes) =>
  Math.max(MIN_SEGMENTS, Math.min(MAX_SEGMENTS, Math.round((minutes || 0) / SEGMENTS_PER_MINUTES)));

/** `0:15`, `3:00` — the parser's own `M:SS`. */
export function clock(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * The essay spine for a runtime, in minutes.
 *
 * Returns `[{ name, kind, seconds }]`. The LAST section absorbs the rounding
 * so the targets sum to exactly the runtime the writer chose — the same rule
 * `script_engine.shorts_structure` follows. Without it a twelve-minute video
 * gets a spine adding to 11:58, and the Outline then reports a drift the
 * writer did not cause.
 */
export function essaySpine(minutes) {
  const total = Math.max(1, Math.round((minutes || 0) * 60));
  const hook = Math.min(HOOK_SECONDS, total);
  const rest = Math.max(0, total - hook);

  const n = segmentCount(minutes);
  const promise = Math.round(rest * SHARES.promise);
  const payoff = Math.round(rest * SHARES.payoff);
  const cta = Math.round(rest * SHARES.cta);
  const body = Math.max(0, rest - promise - payoff - cta);
  const perSegment = Math.round(body / n);

  const rows = [
    { name: "HOOK", kind: "hook", seconds: hook },
    { name: "PROMISE", kind: "promise", seconds: promise },
  ];
  for (let i = 1; i <= n; i += 1) {
    rows.push({ name: `SEGMENT ${i}`, kind: "segment", seconds: perSegment });
  }
  rows.push({ name: "PAYOFF", kind: "payoff", seconds: payoff });
  rows.push({ name: "CTA", kind: "cta", seconds: cta });

  // Give the remainder to the payoff rather than the CTA. The CTA is a few
  // seconds long, so absorbing a 20-second rounding error there would double
  // it; the payoff is the longest section after the segments and can carry it
  // without changing shape.
  const assigned = rows.reduce((sum, r) => sum + r.seconds, 0);
  const payoffRow = rows.find((r) => r.kind === "payoff");
  payoffRow.seconds = Math.max(0, payoffRow.seconds + (total - assigned));

  return rows;
}

/**
 * The course spine. Five sections, and NO durations, ever.
 *
 * A lesson has no runtime target to drift from. `videoscript` leaves
 * `time_allocation` null in course mode for the same reason, and
 * `RetentionShape` is suppressed there: a learner who has already committed is
 * not deciding second by second whether to stay, so a target would be a number
 * invented to fill a column.
 */
export const COURSE_SPINE = [
  { name: "OBJECTIVE", kind: "objective", seconds: null },
  { name: "CONCEPT", kind: "concept", seconds: null },
  { name: "PROOF", kind: "proof", seconds: null },
  { name: "EXERCISE", kind: "exercise", seconds: null },
  { name: "CHECK", kind: "check", seconds: null },
];

export const courseSpine = () => COURSE_SPINE.map((s) => ({ ...s }));

/**
 * The spine as draft text, ready to insert.
 *
 * A blank line after each heading because that is where the writing goes, and
 * because `enterText` puts one there anyway — a scaffold that did not would
 * read as differently spaced from everything typed after it.
 */
export function spineText(rows) {
  return rows
    .map((r) => (r.seconds === null ? `## ${r.name}` : `## ${r.name} - ${clock(r.seconds)}`))
    .join("\n\n") + "\n\n";
}

/**
 * The spine for a project, or null if the project does not get one.
 *
 * Null for every format but `long_form`: a screenplay's first scene is a
 * human's invention and the wizard was deliberately stopped from guessing it.
 */
export function scaffoldFor({ format, videoCategory, durationMinutes } = {}) {
  if (format !== "long_form") return null;
  const mode = modeOf(videoCategory);
  const rows = mode === "course" ? courseSpine() : essaySpine(durationMinutes);
  // `minutes` only so the offer can name the runtime it is laying out. It is
  // null in course mode, where there is no runtime and the copy does not
  // mention one.
  const minutes = mode === "course" ? null : Math.max(1, Math.round(durationMinutes || 0));
  return { mode, rows, minutes, text: spineText(rows) };
}
