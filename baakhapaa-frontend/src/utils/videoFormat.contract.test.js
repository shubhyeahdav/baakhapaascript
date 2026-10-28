import { elementOf, ELEMENTS } from "./videoFormat";
import contract from "./parser-contract.json";

/**
 * The editor and the backend parser must agree about what a line IS.
 *
 * They are two implementations of one grammar, written in different languages
 * months apart, with nothing connecting them. A line the editor treats as a
 * cue but the parser reads as narration corrupts every runtime estimate in the
 * format — the cue is not spoken, so the word count is wrong, so the section's
 * duration is wrong, so the retention shape is drawn against a runtime nobody
 * has. The failure has no symptom until a writer notices their twelve-minute
 * video is reported as nine.
 *
 * `parser-contract.json` is written by
 * `baakhapaa-backend/export_parser_contract.py` from the Python parser's own
 * verdicts. Regenerate it after any change to `videoscript.parse` and commit
 * the diff: a change to the fixture is a deliberate change to the contract.
 *
 * The cases were chosen for where the two could plausibly diverge, not for
 * coverage of the happy path.
 */

// Python's element names are the contract. The JS side uses the same strings,
// and this map exists so a rename on either side fails here loudly rather than
// quietly comparing two things that were never the same vocabulary.
const PY_TO_JS = {
  section_heading: ELEMENTS.HEADING,
  narration: ELEMENTS.NARRATION,
  broll: ELEMENTS.BROLL,
  on_screen: ELEMENTS.ON_SCREEN,
};

const entries = Object.entries(contract.verdicts);

test("the fixture is not empty, so a broken export cannot pass as agreement", () => {
  // Without this, deleting the fixture's contents would make every assertion
  // below vacuous and the suite would go green on no checks at all.
  expect(entries.length).toBeGreaterThan(15);
});

describe("the editor agrees with the backend parser", () => {
  for (const [line, pythonVerdict] of entries) {
    // A blank line is dropped by the Python parser, which has no JS
    // equivalent: the editor never asks what an empty line is.
    if (pythonVerdict === "dropped") continue;

    const label = JSON.stringify(line);
    it(`reads ${label} as ${pythonVerdict}`, () => {
      const expected = PY_TO_JS[pythonVerdict];
      expect(expected, `unknown python element type ${pythonVerdict}`).toBeDefined();
      expect(elementOf(line)).toBe(expected);
    });
  }
});

describe("the cases that would catch a borrowed screenplay rule", () => {
  // These are the ones worth naming. On a screenplay page an all-caps line is
  // a character cue and a slugline opens a scene; here both are plain
  // narration. If the video parser ever inherits the screenplay grammar, this
  // is where it shows.
  it("an all-caps line is narration, not a speaker", () => {
    expect(elementOf("SUNITA")).toBe(ELEMENTS.NARRATION);
  });

  it("a slugline is narration, because this format has no scenes", () => {
    expect(elementOf("INT. CHIYA PASAL - DAY")).toBe(ELEMENTS.NARRATION);
  });

  it("an indented line is narration, because this format has no columns", () => {
    expect(elementOf("        indented like a dialogue block")).toBe(ELEMENTS.NARRATION);
  });

  it("a transition is narration", () => {
    expect(elementOf("FADE IN:")).toBe(ELEMENTS.NARRATION);
  });
});
