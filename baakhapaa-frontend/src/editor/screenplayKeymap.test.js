/* The keyboard rules, tested directly for the first time.
 *
 * These 118 lines lived inside ScriptEditor.jsx and ran on every keystroke a
 * writer makes — the most-used logic in the product, and the only way to reach
 * it was to mount the whole editor. So it had no direct coverage at all.
 *
 * Lifting it out was a pure move; these tests are written against the moved
 * code to pin what it already did, so the behaviour has a description before
 * a second format is added beside it.
 */
import { describe, it, expect, vi } from "vitest";
import { createScreenplayKeyHandler, WORD_BOUNDARY_KEYS } from "./screenplayKeymap";

/* A textarea, near enough. The handler reads `value`, the selection, and calls
   `setSelectionRange`; it never touches the DOM otherwise. */
function field(value, caret = value.length) {
  return {
    value,
    selectionStart: caret,
    selectionEnd: caret,
    setSelectionRange: vi.fn(),
    focus: vi.fn(),
  };
}

function press(key, target, over = {}) {
  const deps = {
    nepaliMode: false,
    transliterateBehindCaret: vi.fn(),
    replaceRange: vi.fn(),
    suggest: null,
    dismissed: false,
    setDismissed: vi.fn(),
    applySuggestion: vi.fn(),
    suggestIndex: 0,
    setSuggestIndex: vi.fn(),
    scrollCaretIntoView: vi.fn(),
    typewriter: false,
    zenMode: false,
    ...over,
  };
  const event = {
    key,
    target,
    currentTarget: target,
    preventDefault: vi.fn(),
  };
  createScreenplayKeyHandler(deps)(event);
  return { deps, event };
}

/* What `replaceRange` was asked to write. */
const written = (deps) => deps.replaceRange.mock.calls[0]?.[2];

describe("Tab cycles the element under the caret", () => {
  /* The screenplay grammar as columns: action is flush left, a character cue
     sits at 22, a parenthetical at 15, dialogue at 10. Tab means "make this
     line the right kind of thing", which is why it is the key screenwriters
     already reach for. */
  it.each([
    ["action to character", "SARITA", " ".repeat(22) + "SARITA"],
    ["character to parenthetical", " ".repeat(22) + "SARITA", " ".repeat(15) + "SARITA"],
    ["parenthetical to dialogue", " ".repeat(15) + "SARITA", " ".repeat(10) + "SARITA"],
    ["dialogue back to action", " ".repeat(10) + "SARITA", "SARITA"],
  ])("%s", (_name, line, expected) => {
    const { deps, event } = press("Tab", field(line));

    expect(event.preventDefault).toHaveBeenCalled();
    expect(written(deps)).toBe(expected);
  });

  it("keeps an unrecognised indent from trapping the writer", () => {
    /* Anything not on the cycle returns to action rather than sticking. A
       pasted line with seven leading spaces must not be a dead end. */
    const { deps } = press("Tab", field("       SARITA"));

    expect(written(deps)).toBe("SARITA");
  });

  it("cycles the line the caret is on, not the last line of the draft", () => {
    const draft = "INT. CHIYA PASAL - DAY\nSARITA\nShe waits.";
    const caretOnSecondLine = draft.indexOf("SARITA") + 3;

    const { deps } = press("Tab", field(draft, caretOnSecondLine));

    expect(written(deps)).toBe(" ".repeat(22) + "SARITA");
  });
});

describe("Tab and Enter while a suggestion is showing", () => {
  const suggest = { options: ["DAY", "DUSK", "DAWN"] };

  it("Tab takes the completion instead of cycling the indent", () => {
    const { deps, event } = press("Tab", field("INT. PASAL - D"), { suggest });

    expect(event.preventDefault).toHaveBeenCalled();
    expect(deps.applySuggestion).toHaveBeenCalledWith(0);
    expect(deps.replaceRange).not.toHaveBeenCalled();
  });

  it("Enter never takes the completion", () => {
    /* This cost a writer the one key they cannot do without. Enter used to
       apply whenever exactly one option showed: finishing a slugline offered
       the word already typed, Enter "applied" it, nothing changed, the same
       suggestion came back, and the line break never happened. The strip has
       always said Tab. */
    const { deps } = press("Enter", field("INT. PASAL - DAY"), {
      suggest: { options: ["DAY"] },
    });

    expect(deps.applySuggestion).not.toHaveBeenCalled();
    expect(deps.setDismissed).toHaveBeenCalledWith(true);
  });

  it("arrows move through the options and wrap", () => {
    const down = press("ArrowDown", field("x"), { suggest, suggestIndex: 2 });
    expect(down.deps.setSuggestIndex).toHaveBeenCalled();
    expect(down.deps.setSuggestIndex.mock.calls[0][0](2)).toBe(0);

    const up = press("ArrowUp", field("x"), { suggest, suggestIndex: 0 });
    expect(up.deps.setSuggestIndex.mock.calls[0][0](0)).toBe(2);
  });

  it("Escape puts the strip away without touching the draft", () => {
    const { deps } = press("Escape", field("INT. PASAL - D"), { suggest });

    expect(deps.setDismissed).toHaveBeenCalledWith(true);
    expect(deps.replaceRange).not.toHaveBeenCalled();
  });

  it("a dismissed suggestion lets Tab go back to cycling the indent", () => {
    const { deps } = press("Tab", field("SARITA"), { suggest, dismissed: true });

    expect(deps.applySuggestion).not.toHaveBeenCalled();
    expect(written(deps)).toBe(" ".repeat(22) + "SARITA");
  });
});

describe("writing Nepali", () => {
  it.each(WORD_BOUNDARY_KEYS)("converts the word behind the caret on %j", (key) => {
    const { deps } = press(key, field("timro "), { nepaliMode: true });

    expect(deps.transliterateBehindCaret).toHaveBeenCalled();
  });

  it("leaves the boundary character itself to be typed", () => {
    /* Not prevented: the space still gets typed, after the word in front of it
       has become Devanagari. */
    const { event } = press(" ", field("timro"), { nepaliMode: true });

    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it("types a danda for the pipe key", () => {
    /* Devanagari ends a sentence with a danda, not a full stop, and `|` is the
       convention romanised Nepali already uses. Typing a pipe into dialogue is
       not otherwise a thing anyone does. */
    const { event } = press("|", field("timro naam"), { nepaliMode: true });

    expect(event.preventDefault).toHaveBeenCalled();
  });

  it("does nothing Nepali when the mode is off", () => {
    const { deps } = press(" ", field("timro"), { nepaliMode: false });

    expect(deps.transliterateBehindCaret).not.toHaveBeenCalled();
  });
});

describe("Enter follows the screenplay's own rule", () => {
  it("writes through replaceRange so the browser's undo still works", () => {
    /* Rewriting the whole value with setContent discards the undo stack, and
       Enter runs on every line of a screenplay. */
    const { deps, event } = press("Enter", field("INT. CHIYA PASAL - DAY"));

    expect(event.preventDefault).toHaveBeenCalled();
    expect(deps.replaceRange).toHaveBeenCalled();
    expect(written(deps)).toContain("\n");
  });

  it("gives a character cue its dialogue indent on the next line", () => {
    const { deps } = press("Enter", field(" ".repeat(22) + "SARITA"));

    expect(written(deps)).toBe("\n" + " ".repeat(10));
  });
});

describe("keys it must leave alone", () => {
  it.each(["a", "Backspace", "ArrowLeft", "Shift"])("%s", (key) => {
    const { deps, event } = press(key, field("SARITA"));

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(deps.replaceRange).not.toHaveBeenCalled();
  });
});
