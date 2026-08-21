import { suggestFor } from "./FormatShortcuts";

/**
 * The completion that completes nothing.
 *
 * Every branch of `suggestFor` filters a vocabulary by "starts with what you
 * typed", and a finished word starts with itself — so typing MORNING in full
 * offered you MORNING. That was not merely noise. With exactly one option
 * showing, Enter used to apply it, the text did not change, the identical
 * suggestion came straight back, and Enter was consumed again. A writer who
 * typed a complete slugline could not reach the next line at all without
 * pressing Escape first.
 *
 * These pin the fix at the source: an option that equals the fragment is not a
 * completion, in any of the four places completions are offered.
 */

const VOCAB = { locations: ["CHIYA PASAL", "ROOFTOP"], characters: ["SANJANA", "RAAJA"] };
const offered = (line, col = line.length, vocab = VOCAB) =>
  suggestFor(line, col, vocab)?.options || [];

describe("a finished word offers no completion", () => {
  it("time of day", () => {
    expect(offered("INT. CHIYA PASAL - MORNING")).not.toContain("MORNING");
  });

  it("location", () => {
    expect(offered("INT. CHIYA PASAL")).not.toContain("CHIYA PASAL");
  });

  it("character cue", () => {
    // A completed name offers the extensions that follow one, never the name.
    expect(offered("                      SANJANA")).not.toContain("SANJANA");
  });

  it("slugline prefix", () => {
    expect(offered("INT.")).not.toContain("INT.");
  });

  it("transition", () => {
    expect(offered("CUT TO:")).not.toContain("CUT TO:");
  });
});

describe("partial words still complete", () => {
  it("completes a time of day from a prefix", () => {
    expect(offered("INT. CHIYA PASAL - MOR")).toContain("MORNING");
  });

  it("completes a location from a prefix", () => {
    expect(offered("INT. CH")).toContain("CHIYA PASAL");
  });

  it("completes a character from a prefix", () => {
    expect(offered("                      SANJ")).toContain("SANJANA");
  });

  it("offers cue extensions once a name is complete", () => {
    expect(offered("                      SANJANA")).toContain("(V.O.)");
  });

  it("still offers the other matches when one is exhausted", () => {
    // DAY is complete, but DAWN and DAYBREAK-style siblings should survive if
    // the vocabulary has them — the filter must drop the exact match only.
    const options = offered("INT. ROOFTOP - DA");
    expect(options).toContain("DAY");
    expect(options.length).toBeGreaterThan(1);
  });
});

describe("nothing is offered where nothing helps", () => {
  it("dialogue is free prose", () => {
    expect(suggestFor("          Timro result aayo?", 28, VOCAB)).toBeNull();
  });

  it("an empty line offers nothing", () => {
    expect(suggestFor("", 0, VOCAB)).toBeNull();
  });
});
