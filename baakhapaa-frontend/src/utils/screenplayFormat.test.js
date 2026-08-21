import { enterText, nextLine } from "./screenplayFormat";

/**
 * What Enter does. This runs on every line a writer types, and it shipped
 * inserting a bare newline everywhere — so the writer had to press Enter twice
 * all day, and a page typed the natural way came out as one solid block that
 * the parser, the page count and the exports each read differently from how it
 * looked on screen.
 */

const CUE = " ".repeat(22);
const DIALOGUE = " ".repeat(10);
const PAREN = " ".repeat(15);

describe("a blank line goes between elements", () => {
  it("after a slugline", () => {
    expect(enterText("INT. CHIYA PASAL - MORNING")).toBe("\n\n");
  });

  it("after an action line", () => {
    expect(enterText("Steam rises from the glasses.")).toBe("\n\n");
  });

  it("after dialogue, returning to action", () => {
    expect(enterText(`${DIALOGUE}Timro result aayo?`)).toBe("\n\n");
  });

  it("after a transition", () => {
    expect(enterText("CUT TO:")).toBe("\n\n");
  });
});

describe("a cue and its dialogue are set solid", () => {
  it("dialogue follows a cue with no blank line", () => {
    expect(enterText(`${CUE}SANJANA`)).toBe(`\n${DIALOGUE}`);
  });

  it("dialogue follows a parenthetical with no blank line", () => {
    expect(enterText(`${PAREN}(beat)`)).toBe(`\n${DIALOGUE}`);
  });

  it("a cue typed without indenting is still a cue", () => {
    expect(nextLine("SANJANA")).toEqual({ indent: 10, blankLine: false });
  });
});

describe("what is not a cue", () => {
  it("an all-caps action line ending in a full stop", () => {
    // "THE DOOR SLAMS." is action shouted, not somebody about to speak.
    expect(nextLine("THE DOOR SLAMS.")).toEqual({ indent: 0, blankLine: true });
  });

  it("a slugline, which is also all caps", () => {
    expect(nextLine("EXT. ROOFTOP - NIGHT")).toEqual({ indent: 0, blankLine: true });
  });

  it("a long all-caps line", () => {
    const long = "A".repeat(60);
    expect(nextLine(long).blankLine).toBe(true);
  });
});

describe("no white space the writer did not ask for", () => {
  it("splitting a line from the middle adds no blank line", () => {
    expect(enterText("Steam rises from the glasses.", false)).toBe("\n");
  });

  it("Enter on an already empty line adds no blank line", () => {
    expect(enterText("")).toBe("\n");
  });

  it("Enter on a whitespace-only line adds no blank line", () => {
    expect(enterText("          ")).toBe("\n");
  });
});

describe("indentation carries", () => {
  it("action stays at the left margin", () => {
    expect(nextLine("She does not look up.").indent).toBe(0);
  });

  it("a cue leads to the dialogue column", () => {
    expect(nextLine(`${CUE}RAAJA`).indent).toBe(10);
  });
});
