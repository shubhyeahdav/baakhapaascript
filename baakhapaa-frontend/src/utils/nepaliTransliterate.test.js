import {
  transliterateWord,
  shouldConvert,
  convertWordBeforeCaret,
  transliterate,
} from "./nepaliTransliterate";

/**
 * The product instructed writers to write in Nepali, checked their Nepali
 * dialogue, and embedded a Devanagari font in the PDF — while offering no way
 * to type a single Devanagari character. These cover the scheme itself and,
 * just as importantly, everything it must leave alone.
 */

describe("the sounds of the language", () => {
  test.each([
    ["namaste", "नमस्ते"],
    ["timro", "तिम्रो"],
    ["kaam", "काम"],
    ["ghar", "घर"],
    ["bhaat", "भात"],
    ["dherai", "धेरै"],
    ["chha", "छ"],
    ["hunchha", "हुन्छ"],
    ["ma", "म"],
  ])("%s becomes %s", (roman, devanagari) => {
    expect(transliterateWord(roman)).toBe(devanagari);
  });

  test("a consonant keeps its inherent vowel at the end of a word", () => {
    // राम, not राम् — Devanagari is written this way even where the final
    // vowel is not pronounced.
    expect(transliterateWord("raam")).toBe("राम");
  });

  test("a consonant before another consonant loses it", () => {
    // The conjunct. Without this, timro would come out तिमरो.
    expect(transliterateWord("timro")).toContain("म्");
  });

  test("a word can open on an independent vowel", () => {
    expect(transliterateWord("aaja")).toBe("आज");
  });

  test("doubling a vowel lengthens it", () => {
    expect(transliterateWord("didii")).toBe("दिदी");
    expect(transliterateWord("paanii")).toBe("पानी");
  });

  test("capitals reach the retroflex series Roman Nepali normally drops", () => {
    expect(transliterateWord("miiTho")).toBe("मीठो");
  });
});

describe("what Nepali mode must not touch", () => {
  // A screenplay is structurally English even when its dialogue is not.
  test.each(["INT", "EXT", "CUT", "TO", "FADE", "SANJANA", "PRERANA"])(
    "%s is screenplay structure and stays as typed",
    (word) => {
      expect(shouldConvert(word)).toBe(false);
      expect(transliterateWord(word)).toBe(word);
    }
  );

  test("a lone A or I is an English word, not a vowel request", () => {
    expect(transliterateWord("A")).toBe("A");
    expect(transliterateWord("I")).toBe("I");
  });

  test("anything carrying a digit is left alone", () => {
    // Scene numbers and times.
    expect(shouldConvert("scene2")).toBe(false);
    expect(shouldConvert("5")).toBe(false);
  });

  test("text already in Devanagari is not re-processed", () => {
    expect(shouldConvert("नमस्ते")).toBe(false);
  });

  test("a slugline survives being typed in Nepali mode", () => {
    expect(transliterate("INT. CHIYA PASAL - DAY")).toBe("INT. CHIYA PASAL - DAY");
  });
});

describe("converting at the caret", () => {
  test("only the word just finished is rewritten", () => {
    const result = convertWordBeforeCaret("Sanjana says namaste", 20);
    expect(result.text).toBe("Sanjana says नमस्ते");
  });

  test("the caret lands after the converted word", () => {
    const result = convertWordBeforeCaret("namaste", 7);
    expect(result.caret).toBe(result.text.length);
  });

  test("nothing to convert returns null rather than an identical string", () => {
    // The editor rewrites the textarea only when this is non-null: rewriting
    // it with identical content would cost the writer their undo stack on
    // every press of the space bar.
    expect(convertWordBeforeCaret("SANJANA", 7)).toBeNull();
    expect(convertWordBeforeCaret("", 0)).toBeNull();
    expect(convertWordBeforeCaret("नमस्ते", 6)).toBeNull();
  });

  test("a caret in the middle of a line converts only what precedes it", () => {
    const text = "ma ghar jaanchhu";
    const result = convertWordBeforeCaret(text, 2);
    expect(result.text).toBe("म ghar jaanchhu");
  });
});

describe("whole passages", () => {
  test("a line of dialogue converts word by word", () => {
    expect(transliterate("timro naam ke ho")).toBe("तिम्रो नाम के हो");
  });

  test("punctuation and spacing survive", () => {
    expect(transliterate("ma ramro chha!")).toMatch(/!$/);
    expect(transliterate("ma, timro")).toContain(",");
  });
});

describe("the marks Nepali actually needs", () => {
  test("chandrabindu — without it you cannot spell the verb 'to be'", () => {
    // हुँ, छँ, गएँ. Nepali nasalises constantly and this was missing entirely.
    expect(transliterateWord("hu~")).toBe("हुँ");
    expect(transliterateWord("chha~")).toBe("छँ");
  });

  test("anusvara is a different sound and both are available", () => {
    expect(transliterateWord("hu~")).not.toBe(transliterateWord("huM"));
  });

  test("visarga", () => {
    expect(transliterateWord("duHkha")).toBe("दुःख");
  });

  test("an explicit halant can kill an inherent vowel", () => {
    expect(transliterateWord("chha_")).toBe("छ्");
  });

  test("vocalic r is reachable, and is not r + i", () => {
    expect(transliterateWord("kRiti")).toBe("कृति");
    expect(transliterateWord("kriti")).not.toBe("कृति");
  });

  test("a word carrying a mark still converts at the caret", () => {
    // The word pattern was [A-Za-z]+, so a word ending in a mark matched
    // nothing and silently refused to convert.
    const result = convertWordBeforeCaret("ma chha~", 8);
    expect(result).not.toBeNull();
    expect(result.text).toBe("ma छँ");
  });

  test("a full sentence of ordinary Nepali", () => {
    expect(transliterate("ma hu~ ra timii chha~")).toBe("म हुँ र तिमी छँ");
  });
});
