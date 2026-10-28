import { SECTION_GUIDE, guideFor } from "./sectionGuide";
import { ESSAY_KINDS, COURSE_KINDS } from "../utils/videoSections";

/**
 * One line per section kind, stating that section's JOB.
 *
 * The retrieved patterns answer "what technique helps". This answers "what is
 * this section for", which is the question a writer has before they know they
 * have a problem — and it must stay a job rather than becoming a second
 * linter.
 */

describe("coverage", () => {
  it("has a line for every essay kind", () => {
    for (const k of ESSAY_KINDS) expect(guideFor(k)).toBeTruthy();
  });

  it("has a line for every course kind", () => {
    for (const k of COURSE_KINDS) expect(guideFor(k)).toBeTruthy();
  });

  it("has nothing for a kind that does not exist", () => {
    expect(guideFor("chorus")).toBeNull();
    expect(guideFor(undefined)).toBeNull();
  });

  it("carries both a job and a line for each", () => {
    for (const [kind, g] of Object.entries(SECTION_GUIDE)) {
      expect(g.job, kind).toBeTruthy();
      expect(g.line, kind).toBeTruthy();
    }
  });
});

describe("it states a job, not a verdict", () => {
  it("never scores, warns or forbids", () => {
    // The same restraint SectionPacing and RetentionShape keep. A line that
    // warns turns this into a second linter that cannot see the draft.
    for (const [kind, g] of Object.entries(SECTION_GUIDE)) {
      const text = `${g.job} ${g.line}`.toLowerCase();
      for (const word of ["too long", "too short", "you must", "never write",
                          "wrong", "bad ", "fail", "error"]) {
        expect(text, `${kind}: ${word}`).not.toContain(word);
      }
    }
  });

  it("gives no durations, because those are not craft", () => {
    // "Hooks should be 15 seconds" is a number pretending to be craft, and
    // the product has enough numbers elsewhere.
    for (const [kind, g] of Object.entries(SECTION_GUIDE)) {
      expect(`${g.job} ${g.line}`, kind).not.toMatch(/\d+\s*(seconds?|minutes?|s\b|m\b)/i);
    }
  });
});

describe("PROOF states the rule", () => {
  // The one actual rule in the map, and the reason the task list singles it
  // out: a testimonial is not evidence.
  const proof = guideFor("proof");

  it("says proof is a measurement", () => {
    expect(proof.line.toLowerCase()).toContain("measurement");
  });

  it("says it is never a quotation", () => {
    expect(proof.line.toLowerCase()).toContain("never a quotation");
  });

  it("says what to go and find, not only what to avoid", () => {
    // The useful half. A prohibition on its own leaves the writer stuck.
    expect(proof.line.toLowerCase()).toMatch(/number|before-and-after|counted/);
  });
});
