import { createVideoKeyHandler } from "./videoKeymap";

/**
 * The second factory `screenplayKeymap.js` asks for in its own header.
 *
 * It takes the SAME option object as the screenplay one, so `ScriptEditor`
 * chooses between them with a single expression and neither knows the other
 * exists. Most of these tests are about what the video keymap does NOT do: a
 * screenplay page has columns because a crew reads it, and a video script is
 * prose read aloud by one person.
 */
function harness(value, caret, selectionEnd = caret) {
  const replaceRange = vi.fn();
  const el = {
    value,
    selectionStart: caret,
    selectionEnd,
    setSelectionRange: vi.fn(),
  };
  const handler = createVideoKeyHandler({
    nepaliMode: false,
    transliterateBehindCaret: vi.fn(),
    replaceRange,
    scrollCaretIntoView: vi.fn(),
    typewriter: false,
    zenMode: false,
  });
  return { handler, replaceRange, el };
}

const key = (k, el) => ({
  key: k,
  currentTarget: el,
  target: el,
  preventDefault: vi.fn(),
  shiftKey: false,
});

describe("Enter", () => {
  it("leaves a blank line after a section heading", () => {
    const draft = "## HOOK - 0:15";
    const { handler, replaceRange, el } = harness(draft, draft.length);

    handler(key("Enter", el));

    expect(replaceRange).toHaveBeenCalledWith(draft.length, draft.length, "\n\n");
  });

  it("closes a cue and returns to narration", () => {
    const draft = "[B-ROLL: empty hall]";
    const { handler, replaceRange, el } = harness(draft, draft.length);

    handler(key("Enter", el));

    expect(replaceRange).toHaveBeenCalledWith(draft.length, draft.length, "\n\n");
  });

  it("closes a cue from INSIDE the bracket, where Tab leaves the caret", () => {
    /* The test above presses Enter after the `]`. Tab lands the caret before
       it, so this is the common case — and it used to split the cue in two. */
    const draft = "[B-ROLL: empty hall]";
    const caret = draft.indexOf("]");
    const { handler, replaceRange, el } = harness(draft, caret);
    const raf = vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => cb());

    handler(key("Enter", el));

    expect(replaceRange).toHaveBeenCalledWith(draft.length, draft.length, "\n\n");
    expect(el.setSelectionRange).toHaveBeenCalledWith(draft.length + 2, draft.length + 2);
    raf.mockRestore();
  });

  it("closes an on-screen cue the same way", () => {
    const draft = "[ON SCREEN: 91%]";
    const { handler, replaceRange, el } = harness(draft, 12);

    handler(key("Enter", el));

    expect(replaceRange).toHaveBeenCalledWith(draft.length, draft.length, "\n\n");
  });

  it("is a plain newline inside narration", () => {
    const draft = "Nobody finishes it.";
    const { handler, replaceRange, el } = harness(draft, draft.length);

    handler(key("Enter", el));

    expect(replaceRange).toHaveBeenCalledWith(draft.length, draft.length, "\n");
  });
});

describe("Tab", () => {
  it("turns an empty line into a b-roll cue", () => {
    const { handler, replaceRange, el } = harness("", 0);

    handler(key("Tab", el));

    expect(replaceRange).toHaveBeenCalledWith(0, 0, "[B-ROLL: ]");
  });

  it("lands the caret inside the cue it just opened", async () => {
    const { handler, el } = harness("", 0);

    handler(key("Tab", el));
    await new Promise((r) => requestAnimationFrame(r));

    // "[B-ROLL: " is nine characters; the caret belongs after them, not after
    // the closing bracket.
    expect(el.setSelectionRange).toHaveBeenCalledWith(9, 9);
  });

  it("cycles a b-roll cue to an on-screen one", () => {
    const draft = "[B-ROLL: ]";
    const { handler, replaceRange, el } = harness(draft, draft.length);

    handler(key("Tab", el));

    expect(replaceRange).toHaveBeenCalledWith(0, draft.length, "[ON SCREEN: ]");
  });

  it("cycles an on-screen cue back to narration", () => {
    const draft = "[ON SCREEN: ]";
    const { handler, replaceRange, el } = harness(draft, draft.length);

    handler(key("Tab", el));

    expect(replaceRange).toHaveBeenCalledWith(0, draft.length, "");
  });

  it("leaves a section heading alone", () => {
    // Tab never produces a heading. Inventing a structural boundary the writer
    // did not ask for is worse than requiring two more keystrokes.
    const draft = "## HOOK - 0:15";
    const { handler, replaceRange, el } = harness(draft, draft.length);

    handler(key("Tab", el));

    expect(replaceRange).toHaveBeenCalledWith(0, draft.length, draft);
  });
});

describe("what the screenplay keymap does and this one must not", () => {
  it("never indents an all-caps line to a character column", () => {
    // On a screenplay page this is a speaker and Enter gives the next line a
    // dialogue indent. Here it is narration.
    const draft = "SUNITA";
    const { handler, replaceRange, el } = harness(draft, draft.length);

    handler(key("Enter", el));

    expect(replaceRange).toHaveBeenCalledWith(draft.length, draft.length, "\n");
  });

  it("never treats a slugline as a scene opening", () => {
    const draft = "INT. CHIYA PASAL - DAY";
    const { handler, replaceRange, el } = harness(draft, draft.length);

    handler(key("Enter", el));

    expect(replaceRange).toHaveBeenCalledWith(draft.length, draft.length, "\n");
  });

  it("produces no leading whitespace at all, on any key", () => {
    // The strongest form of the rule: if any inserted text ever begins with a
    // space, a column has crept back in.
    for (const line of ["", "SUNITA", "Narration.", "## HOOK", "[B-ROLL: ]"]) {
      for (const k of ["Enter", "Tab"]) {
        const { handler, replaceRange, el } = harness(line, line.length);
        handler(key(k, el));
        for (const call of replaceRange.mock.calls) {
          expect(String(call[2]).startsWith(" ")).toBe(false);
        }
      }
    }
  });
});

describe("safety", () => {
  it("leaves a selection alone rather than deleting it", () => {
    // Tab with a selection would silently replace the writer's highlighted
    // text, which is the kind of loss only noticed later.
    const draft = "Nobody finishes a Nepali web series.";
    const { handler, replaceRange, el } = harness(draft, 7, 15);

    handler(key("Tab", el));

    expect(replaceRange).not.toHaveBeenCalled();
  });

  it("ignores keys it has no rule for", () => {
    const { handler, replaceRange, el } = harness("Narration.", 10);

    handler(key("a", el));

    expect(replaceRange).not.toHaveBeenCalled();
  });
});
