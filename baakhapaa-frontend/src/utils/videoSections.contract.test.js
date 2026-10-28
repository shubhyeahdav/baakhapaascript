import { kindOf, KINDS_BY_MODE, kindsFor, modeOf, DEFAULT_MODE } from "./videoSections";
import contract from "./parser-contract.json";

/**
 * The editor and the backend parser must agree what a section IS.
 *
 * `videoFormat.contract.test.js` pins the same agreement one level down, for
 * what a LINE is. This pins the level above it: given a heading, which of the
 * mode's kinds is it.
 *
 * Why it matters more than it looks: `section_kind` goes out on the
 * recommendations request, so the kind decides which craft a writer is shown
 * for the section they are in. A `## SEGMENT 2` the editor resolves
 * differently from the parser means the pacing readout and the craft panel
 * describe two different sections of the same draft.
 *
 * `parser-contract.json` is written by
 * `baakhapaa-backend/export_parser_contract.py`. Regenerate it after any
 * change to `videoscript._kind_of` and commit the diff: a change to the
 * fixture is a deliberate change to the contract.
 */

const modes = Object.keys(contract.section_kinds_by_mode);

test("the fixture carries both modes, so a stale export cannot pass as agreement", () => {
  // Without this, an export that dropped `kind_of` would make every loop below
  // iterate zero times and the suite would go green on no checks at all.
  expect(modes.length).toBeGreaterThanOrEqual(2);
  expect(modes).toContain("essay");
  expect(modes).toContain("course");
  for (const mode of modes) {
    expect(Object.keys(contract.kind_of[mode]).length).toBeGreaterThan(20);
  }
});

describe("the two kind lists are the same lists", () => {
  for (const mode of modes) {
    it(`${mode} holds exactly the kinds Python holds`, () => {
      expect(kindsFor(mode)).toEqual(contract.section_kinds_by_mode[mode]);
    });
  }

  it("has no mode on one side that the other does not have", () => {
    expect(Object.keys(KINDS_BY_MODE).sort()).toEqual([...modes].sort());
  });
});

describe("every heading resolves to the kind Python gives it", () => {
  for (const mode of modes) {
    for (const [name, pythonKind] of Object.entries(contract.kind_of[mode])) {
      it(`${mode}: ${JSON.stringify(name)} is ${pythonKind}`, () => {
        expect(kindOf(name, mode)).toBe(pythonKind);
      });
    }
  }
});

describe("the properties that make the kind safe to route craft on", () => {
  it("never returns a kind from the other mode's vocabulary", () => {
    // The whole reason the fallback is per mode. A course section resolving to
    // `segment` would draw a video essay's craft for a lesson.
    for (const mode of modes) {
      const mine = kindsFor(mode);
      for (const name of Object.keys(contract.kind_of[mode])) {
        expect(mine).toContain(kindOf(name, mode));
      }
    }
  });

  it("never returns null, so no consumer has to special-case a missing kind", () => {
    for (const name of ["", "   ", "SOMETHING NOBODY DEFINED", null, undefined]) {
      for (const mode of modes) {
        expect(kindsFor(mode)).toContain(kindOf(name, mode));
      }
    }
  });

  it("falls back to the essay vocabulary for a mode nobody recognised", () => {
    expect(kindOf("WHATEVER", "podcast")).toBe("segment");
    expect(kindsFor("podcast")).toEqual(kindsFor(DEFAULT_MODE));
  });
});

describe("the mode rule matches videoscript.mode_for", () => {
  it("treats only course as course", () => {
    expect(modeOf("course")).toBe("course");
  });

  it("treats every other category, known or not, as an essay", () => {
    for (const c of ["essay", "tutorial", "documentary", "commentary", "vlog",
                     "something_a_later_version_adds", "", null, undefined]) {
      expect(modeOf(c)).toBe("essay");
    }
  });
});
