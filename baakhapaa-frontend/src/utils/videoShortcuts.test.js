import { suggestForVideo, headingsFor, videoSuggesterFor, CUE_COMPLETIONS } from "./videoShortcuts";
import { ESSAY_KINDS, COURSE_KINDS } from "./videoSections";

/**
 * Completions for long-form video.
 *
 * Most of these are about what is NOT offered. The screenplay module decides
 * what to suggest from the caret's COLUMN and offers slugline prefixes from a
 * single letter at the start of a line; neither transfers to a format whose
 * body is prose. A writer typing "People keep asking me" must not be offered
 * `## PROMISE` on the P.
 */
const at = (line, opts) => suggestForVideo(line, line.length, opts);
const options = (line, opts) => at(line, opts)?.options ?? [];

describe("the trigger", () => {
  it("offers nothing on narration", () => {
    expect(at("People keep asking me why")).toBeNull();
  });

  it("offers nothing on an empty line", () => {
    // The scaffold and the Pen put the first heading in; a bare caret does not
    // need a menu.
    expect(at("")).toBeNull();
  });

  it("offers nothing on a line that merely starts with a letter", () => {
    for (const line of ["H", "P", "S", "C", "B", "O"]) {
      expect(at(line)).toBeNull();
    }
  });

  it("offers headings once ## is typed", () => {
    expect(options("##").length).toBe(ESSAY_KINDS.length);
  });

  it("offers cues once [ is typed", () => {
    expect(options("[")).toEqual(CUE_COMPLETIONS.map((c) => c.text));
  });
});

describe("the two vocabularies do not leak", () => {
  it("offers the essay headings in essay mode", () => {
    expect(options("##", { mode: "essay" }))
      .toEqual(["## HOOK", "## PROMISE", "## SEGMENT", "## PAYOFF", "## CTA"]);
  });

  it("offers the course headings in course mode", () => {
    expect(options("##", { mode: "course" }))
      .toEqual(["## OBJECTIVE", "## CONCEPT", "## PROOF", "## EXERCISE", "## CHECK"]);
  });

  it("never offers a course heading to an essay writer", () => {
    const offered = options("##", { mode: "essay" }).join(" ");
    for (const kind of COURSE_KINDS) {
      expect(offered).not.toContain(kind.toUpperCase());
    }
  });

  it("never offers HOOK to a course writer", () => {
    // The sharpest case. A lesson opens on an objective because the learner
    // has already committed; offering a hook is the product telling them to
    // write the wrong thing at the moment they asked for help.
    expect(options("## H", { mode: "course" })).toEqual([]);
  });

  it("filters by what has been typed", () => {
    expect(options("## P", { mode: "essay" })).toEqual(["## PROMISE", "## PAYOFF"]);
    expect(options("## PR", { mode: "essay" })).toEqual(["## PROMISE"]);
  });

  it("matches regardless of case", () => {
    expect(options("## pay", { mode: "essay" })).toEqual(["## PAYOFF"]);
  });
});

describe("cues, which both modes share", () => {
  it("offers both cues in course mode too", () => {
    // A lesson cuts to b-roll and puts text on screen for the same reasons an
    // essay does. Withholding them would be a distinction with no argument.
    expect(options("[", { mode: "course" })).toEqual(options("[", { mode: "essay" }));
  });

  it("filters cues by what has been typed", () => {
    expect(options("[B")).toEqual(["[B-ROLL: ]"]);
    expect(options("[ON")).toEqual(["[ON SCREEN: ]"]);
  });

  it("lands the caret inside the bracket, not after it", () => {
    // Without caretBack the writer's next keystroke goes after the `]` — the
    // same trap `tabCycle`'s caretOffset exists to avoid.
    expect(at("[")?.caretBack).toBe(1);
  });
});

describe("the fragment includes its trigger", () => {
  it("returns the whole typed fragment, so the replacement is not doubled", () => {
    // `applySuggestion` replaces exactly `fragment.length` characters before
    // the caret. A fragment of "H" instead of "## H" leaves the ## in place
    // and produces "## ## HOOK".
    expect(at("## H")?.fragment).toBe("## H");
    expect(at("[B")?.fragment).toBe("[B");
  });

  it("ignores leading whitespace in the fragment", () => {
    const out = suggestForVideo("   ## H", 7);
    expect(out?.fragment).toBe("## H");
  });
});

describe("the already-typed guard", () => {
  it("drops an option identical to what is typed", () => {
    // A word you have finished typing starts with itself, so a completed
    // heading offered itself back: with one option showing, Enter applied it,
    // the text did not change, and Enter was consumed forever.
    expect(options("## HOOK")).toEqual([]);
  });

  it("still offers the longer heading that shares a prefix", () => {
    expect(options("## PAYOFF")).toEqual([]);
    expect(options("## PAY")).toEqual(["## PAYOFF"]);
  });
});

describe("videoSuggesterFor", () => {
  it("binds the mode from the project's category", () => {
    expect(videoSuggesterFor("course")("##", 2).options)
      .toEqual(headingsFor("course"));
  });

  it("treats any non-course category as an essay", () => {
    for (const c of ["essay", "tutorial", "documentary", "vlog", undefined]) {
      expect(videoSuggesterFor(c)("##", 2).options).toEqual(headingsFor("essay"));
    }
  });
});
