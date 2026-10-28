import {
  ELEMENTS, elementOf, enterText, tabCycle, sectionAt,
} from "./videoFormat";

/**
 * The video grammar, as pure functions.
 *
 * Deliberately the same shape the backend parser uses, so the editor and
 * `videoscript.py` cannot disagree about what a line is -- a line the editor
 * treats as a cue but the parser reads as narration would corrupt every
 * runtime estimate in the format.
 */

describe("what a line is", () => {
  it("reads a section heading", () => {
    expect(elementOf("## HOOK - 0:15")).toBe(ELEMENTS.HEADING);
    expect(elementOf("## OBJECTIVE")).toBe(ELEMENTS.HEADING);
  });

  it("reads the two cue kinds apart", () => {
    expect(elementOf("[B-ROLL: empty hall]")).toBe(ELEMENTS.BROLL);
    expect(elementOf("[ON SCREEN: 72%]")).toBe(ELEMENTS.ON_SCREEN);
  });

  it("reads everything else as narration", () => {
    expect(elementOf("Nobody finishes a Nepali web series.")).toBe(ELEMENTS.NARRATION);
    // No column arithmetic in this format: an indented line is still narration.
    expect(elementOf("        Nobody finishes it.")).toBe(ELEMENTS.NARRATION);
    // An all-caps line is NOT a character cue here. There are no cues.
    expect(elementOf("SUNITA")).toBe(ELEMENTS.NARRATION);
  });
});

describe("what Enter does", () => {
  it("leaves a blank line after a heading", () => {
    expect(enterText("## HOOK - 0:15")).toBe("\n\n");
  });

  it("closes a cue and returns to narration", () => {
    expect(enterText("[B-ROLL: empty hall]")).toBe("\n\n");
  });

  it("is a plain newline inside narration", () => {
    expect(enterText("Nobody finishes it.")).toBe("\n");
  });
});

describe("what Tab does", () => {
  it("turns narration into a b-roll cue with the caret inside", () => {
    const { text, caretOffset } = tabCycle("");
    expect(text).toBe("[B-ROLL: ]");
    expect(caretOffset).toBe("[B-ROLL: ".length);
  });

  it("cycles b-roll to on-screen", () => {
    expect(tabCycle("[B-ROLL: ]").text).toBe("[ON SCREEN: ]");
  });

  it("cycles on-screen back to narration", () => {
    expect(tabCycle("[ON SCREEN: ]").text).toBe("");
  });

  it("leaves a heading alone", () => {
    // Tab does not produce headings; the scaffold and completions do.
    expect(tabCycle("## HOOK - 0:15").text).toBe("## HOOK - 0:15");
  });
});

describe("which section the caret is in", () => {
  const DRAFT = [
    "## HOOK - 0:15",            // line 1
    "",                          // 2
    "Nobody finishes it.",       // 3
    "",                          // 4
    "## PROMISE - 0:20",         // 5
    "",                          // 6
    "Three things kill it.",     // 7
  ].join("\n");

  it("finds the section the caret sits in", () => {
    expect(sectionAt(DRAFT, 3).name).toBe("HOOK");
    expect(sectionAt(DRAFT, 7).name).toBe("PROMISE");
  });

  it("reads the target off the heading", () => {
    expect(sectionAt(DRAFT, 3).targetSeconds).toBe(15);
    expect(sectionAt(DRAFT, 7).targetSeconds).toBe(20);
  });

  it("has no target when the heading gives none", () => {
    expect(sectionAt("## OBJECTIVE\n\nDo the thing.", 3).targetSeconds).toBeNull();
  });

  it("counts only the words that are spoken", () => {
    // Headings and bracketed cues are not read aloud. Nobody says
    // "[B-ROLL: a hall]".
    const d = "## HOOK\n\nOne two three.\n\n[B-ROLL: a hall]\n";
    expect(sectionAt(d, 3).wordsBefore).toBe(3);
  });

  it("returns null on an empty draft rather than a zeroed readout", () => {
    expect(sectionAt("", 1)).toBeNull();
    expect(sectionAt("   \n", 1)).toBeNull();
  });

  it("names the untitled opening when the caret is above the first heading", () => {
    const d = "Some stray narration.\n\n## HOOK\n\nWords.";
    expect(sectionAt(d, 1).name).toBe("(untitled opening)");
  });
});
