import { harvestVocabulary, suggestFor } from "./FormatShortcuts";

const EMPTY = { locations: [], characters: [] };
const offered = (line, col, vocab = EMPTY) => suggestFor(line, col, vocab)?.options || [];

describe("harvestVocabulary", () => {
  const DRAFT = [
    "INT. CHIYA PASAL, PATAN - MORNING",
    "",
    "Steam rises from the glasses.",
    "",
    "                      SANJANA",
    "          Timro result aayo?",
    "",
    "EXT. ROOFTOP - NIGHT",
    "",
    "                      RAAJA (V.O.)",
    "          Aayo.",
    "",
    "CUT TO:",
  ].join("\n");

  it("pulls locations out of sluglines, without the time of day", () => {
    const { locations } = harvestVocabulary(DRAFT);
    expect(locations).toContain("CHIYA PASAL, PATAN");
    expect(locations).toContain("ROOFTOP");
    expect(locations.join(" ")).not.toContain("MORNING");
  });

  it("pulls character names and strips the cue extension", () => {
    const { characters } = harvestVocabulary(DRAFT);
    expect(characters).toEqual(expect.arrayContaining(["SANJANA", "RAAJA"]));
    expect(characters).not.toContain("RAAJA (V.O.)");
  });

  it("does not mistake a transition for a character", () => {
    expect(harvestVocabulary(DRAFT).characters).not.toContain("CUT TO:");
  });

  it("does not mistake a shouted action line for a character", () => {
    // Ends in punctuation, so it is action, not a cue.
    const { characters } = harvestVocabulary("THE DOOR SLAMS SHUT.\n");
    expect(characters).toEqual([]);
  });

  it("survives empty input", () => {
    expect(harvestVocabulary("")).toEqual({ locations: [], characters: [] });
    expect(harvestVocabulary(null)).toEqual({ locations: [], characters: [] });
  });
});

describe("suggestFor — line start", () => {
  it("expands a single letter into a slugline prefix", () => {
    expect(offered("i", 1)).toContain("INT. ");
    expect(offered("e", 1)).toContain("EXT. ");
  });

  it("offers transitions", () => {
    expect(offered("c", 1)).toContain("CUT TO:");
    expect(offered("f", 1)).toEqual(expect.arrayContaining(["FADE IN:", "FADE OUT."]));
  });

  it("is case-insensitive", () => {
    expect(offered("I", 1)).toContain("INT. ");
  });

  it("offers nothing on a blank line", () => {
    // An empty line still needs Tab to cycle the indent, so a suggestion here
    // would hijack the key for no benefit.
    expect(suggestFor("", 0, EMPTY)).toBeNull();
  });
});

describe("suggestFor — inside a slugline", () => {
  const vocab = { locations: ["CHIYA PASAL", "COLLEGE GATE"], characters: [] };

  it("offers locations from the draft after the prefix", () => {
    expect(offered("INT. C", 6, vocab)).toEqual(["CHIYA PASAL", "COLLEGE GATE"]);
  });

  it("narrows as more is typed", () => {
    expect(offered("INT. CH", 7, vocab)).toEqual(["CHIYA PASAL"]);
  });

  it("switches to times of day after the dash", () => {
    const opts = offered("INT. CHIYA PASAL - d", 20, vocab);
    expect(opts).toEqual(expect.arrayContaining(["DAY", "DAWN", "DUSK"]));
    expect(opts).not.toContain("CHIYA PASAL");
  });

  it("offers NIGHT for n and MORNING for m", () => {
    expect(offered("EXT. ROOFTOP - n", 16, vocab)).toContain("NIGHT");
    expect(offered("EXT. ROOFTOP - m", 16, vocab)).toContain("MORNING");
  });
});

describe("suggestFor — character column", () => {
  const vocab = { locations: [], characters: ["SANJANA", "SITA", "RAAJA"] };
  const CUE_COL = " ".repeat(22);

  it("offers matching names", () => {
    expect(offered(`${CUE_COL}s`, 23, vocab)).toEqual(["SANJANA", "SITA"]);
  });

  it("offers cue extensions once the name is complete", () => {
    const opts = offered(`${CUE_COL}SANJANA`, 29, vocab);
    expect(opts).toEqual(expect.arrayContaining(["(V.O.)", "(O.S.)", "(CONT'D)"]));
  });

  it("offers nothing before anything is typed", () => {
    expect(suggestFor(`${CUE_COL}`, 22, vocab)).toBeNull();
  });
});

describe("suggestFor — dialogue is left alone", () => {
  it("never interrupts prose", () => {
    // Dialogue sits at column 10. Completions there would fire on ordinary
    // words, which is the one place they would be an interruption.
    expect(suggestFor(`${" ".repeat(10)}i`, 11, EMPTY)).toBeNull();
    expect(suggestFor(`${" ".repeat(10)}Timro result`, 22, EMPTY)).toBeNull();
  });
});

describe("suggestFor — parenthetical column", () => {
  it("offers stock parentheticals", () => {
    const opts = offered(`${" ".repeat(15)}b`, 16, EMPTY);
    expect(opts).toContain("(beat)");
  });
});
