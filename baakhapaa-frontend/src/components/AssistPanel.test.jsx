/* How a writer asks the craft library a question.
 *
 * `AssistPanel` had no test file at all, which is worth stating plainly
 * because CLAUDE.md claims every component has one — it was extracted from
 * ScriptEditor after the sweep that made that true, and nothing covered it
 * afterwards. These tests cover the part being changed rather than the whole
 * 40-prop surface: the chips and the Ask box, which are the two ways anyone
 * reaches the pattern library.
 *
 * The panel takes forty-odd props, so `panel()` below supplies only the ones
 * the patterns tab actually reads and lets the rest default to undefined. A
 * fixture that filled in all forty would hide exactly the coupling the
 * component's own docstring calls "the finding".
 */
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import AssistPanel, { FOCUSES } from "./AssistPanel";

vi.mock("../services/api", () => ({
  learn: { forTechnique: vi.fn(() => new Promise(() => {})) },
  scripts: {},
}));

function panel(overrides = {}) {
  const props = {
    panelOpen: true,
    setPanelOpen: vi.fn(),
    panelTab: "ai",
    setPanelTab: vi.fn(),
    aiMode: "patterns",
    setAiMode: vi.fn(),
    aiLocked: false,
    genre: "Drama",
    tone: "Emotional",
    patterns: [],
    patternsLoading: false,
    loadPatterns: vi.fn(),
    patternSource: "similarity",
    diagnosed: [],
    focus: "scene",
    setFocus: vi.fn(),
    setOpenPattern: vi.fn(),
    showAllPatterns: false,
    setShowAllPatterns: vi.fn(),
    seen: {},
    dismissed: [],
    t: (s) => s,
    ...overrides,
  };
  return { props, ...render(<AssistPanel {...props} />) };
}

describe("the focus chips", () => {
  it("offers one chip per focus", () => {
    panel();
    for (const f of FOCUSES) {
      expect(screen.getByRole("button", { name: f.label })).toBeInTheDocument();
    }
  });

  it("asks the library for that focus, not for the draft", () => {
    // The chip's key goes to loadPatterns; ScriptEditor turns it into the
    // query. Passing the label or the query string from here instead would
    // put the same text in two files and let them drift.
    const { props } = panel();

    fireEvent.click(screen.getByRole("button", { name: "Feels flat" }));

    expect(props.setFocus).toHaveBeenCalledWith("flat");
    expect(props.loadPatterns).toHaveBeenCalledWith("flat");
  });

  it("keeps the voice complaint separate from the thin-character one", () => {
    /* These were one chip, and its query opened with "my characters sound the
       same" — verbatim the `problem` field of a DIALOGUE entry. Retrieval
       returned that dialogue entry and was right to; the chip was asking a
       dialogue question under a character label, so it could only ever be half
       answered. Measured at p@1 0 for that case across every change made to
       retrieval. This test pins the split rather than the wording: a future
       edit may rewrite either query, but merging them back re-creates the bug. */
    const character = FOCUSES.find((f) => f.key === "character");
    const voice = FOCUSES.find((f) => f.key === "voice");

    expect(voice).toBeTruthy();
    expect(voice.query).toMatch(/sound the same/i);
    expect(character.query).not.toMatch(/sound the same/i);
  });

  it("every chip but the draft one names a problem to match against", () => {
    // `scene` is the one focus that deliberately sends an empty query: it
    // means "read what I have written", not "no query".
    for (const f of FOCUSES) {
      if (f.key === "scene") expect(f.query).toBe("");
      else expect(f.query.length).toBeGreaterThan(20);
    }
  });
});

describe("asking in your own words", () => {
  /* The chips reach at most three entries each, over a corpus of thirty-nine.
     More than half the library had no door in the interface: a writer whose
     problem was "my flashback kills the momentum" could press every button and
     never be asked what was actually wrong. */

  it("sends what the writer typed", () => {
    const { props } = panel();

    fireEvent.change(screen.getByLabelText(/describe what is wrong/i), {
      target: { value: "my flashback kills the momentum" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Ask" }));

    expect(props.loadPatterns).toHaveBeenCalledWith(
      "asked",
      "my flashback kills the momentum",
    );
  });

  it("takes Nepali, which is the point of it", () => {
    // Retrieval normalises Nepali out of the query before embedding
    // (`craft_query.normalise`), so this box is the first place in the product
    // where a writer can state a craft problem in their own language and be
    // answered. The panel itself must not filter or transliterate — it passes
    // the string through untouched.
    const { props } = panel();
    const nepali = "मेरो नायक बोरिङ छ";

    fireEvent.change(screen.getByLabelText(/describe what is wrong/i), {
      target: { value: nepali },
    });
    fireEvent.click(screen.getByRole("button", { name: "Ask" }));

    expect(props.loadPatterns).toHaveBeenCalledWith("asked", nepali);
  });

  it("trims, so a stray space is not a different question", () => {
    const { props } = panel();

    fireEvent.change(screen.getByLabelText(/describe what is wrong/i), {
      target: { value: "  the middle sags  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Ask" }));

    expect(props.loadPatterns).toHaveBeenCalledWith("asked", "the middle sags");
  });

  it("does nothing on an empty box", () => {
    // Submitting empty would re-run whichever chip was last selected, which
    // reads as the button being broken rather than as a no-op.
    const { props } = panel();

    fireEvent.click(screen.getByRole("button", { name: "Ask" }));

    expect(props.loadPatterns).not.toHaveBeenCalled();
  });

  it("refresh re-runs the typed question, not the last chip", () => {
    /* Refresh read `focus` alone, and a typed question has no chip behind it.
       Without the query the panel would answer a question the writer had not
       asked, using the label of one they had. */
    const { props } = panel({ focus: "asked" });

    fireEvent.change(screen.getByLabelText(/describe what is wrong/i), {
      target: { value: "my side characters are furniture" },
    });
    fireEvent.click(screen.getByRole("button", { name: /refresh/i }));

    expect(props.loadPatterns).toHaveBeenCalledWith(
      "asked",
      "my side characters are furniture",
    );
  });

  it("refresh on a chip sends no query, so the chip's own text is used", () => {
    const { props } = panel({ focus: "flat" });

    fireEvent.click(screen.getByRole("button", { name: /refresh/i }));

    expect(props.loadPatterns).toHaveBeenCalledWith("flat", undefined);
  });
});
