/* The one structural rule the screenplay page has, and how it was broken.
 *
 * `.screenplay-container` is `display:flex` with `justify-content:center` and
 * the default ROW direction, so every direct child becomes a column beside the
 * page. `PenPrompt` is absolutely positioned across the container and centres
 * itself *there* rather than on the paper — which is correct only while the
 * container has exactly ONE in-flow child, because that is the only case where
 * the paper's centre and the container's centre are the same point.
 *
 * The mid-draft note shipped as a second child. Measured in a real browser at
 * 1100px: the paper's centre moved from 550 to 283, a 267px drift, and 224px
 * of the Pen's prompt hung off the right edge of the paper onto the app
 * background. It looked like a PenPrompt bug and was a flex-direction one.
 *
 * `vite.config.js` sets `css: false`, so no test here can see any of that.
 * What a test CAN see is the structure that causes it, which is what this
 * asserts. The geometry itself is measured by `scripts/page-layout-check.mjs`
 * in a real engine — the two together are the regression test.
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import ScriptPage from "./ScriptPage";

vi.mock("../services/api", () => ({ learn: { forTechnique: vi.fn() }, scripts: {} }));

function page(over = {}) {
  const props = {
    content: "",
    setContent: vi.fn(),
    textareaRef: { current: null },
    handleKeyDown: vi.fn(),
    trackCaret: vi.fn(),
    updateCaretPage: vi.fn(),
    scrollCaretIntoView: vi.fn(),
    insertAtPosition: vi.fn(),
    selection: "",
    setSelection: vi.fn(),
    suggest: null,
    setSuggest: vi.fn(),
    suggestIndex: 0,
    dismissed: false,
    setDismissed: vi.fn(),
    applySuggestion: vi.fn(),
    view: "script",
    saving: false,
    caretPage: 1,
    pageCount: 1,
    sessionStart: null,
    script: { id: "s1", scenes: [] },
    user: { id: "u1" },
    zenMode: false,
    setZenMode: vi.fn(),
    pageTheme: "light",
    typewriter: false,
    cursor: "bar",
    resting: false,
    setResting: vi.fn(),
    focus: "scene",
    setPanelOpen: vi.fn(),
    setPanelTab: vi.fn(),
    setScript: vi.fn(),
    milestone: null,
    milestoneFacts: {},
    onMilestoneAct: vi.fn(),
    onMilestoneDismiss: vi.fn(),
    ...over,
  };
  const utils = render(<ScriptPage {...props} />);
  const container = utils.container.querySelector(".screenplay-container");
  return { ...utils, container };
}

/* Children that are taken OUT of flow by `position:absolute` do not become
   flex items, so they cannot shift the page. The rule is about in-flow ones.
   Identified by the class that positions them, since jsdom computes no
   styles. */
const inFlow = (container) =>
  [...container.children].filter((el) => !el.className.includes("absolute")
                                      && !el.className.includes("zen-hint"));

describe("the screenplay container holds exactly one column", () => {
  it("on a blank page, where the Pen's prompt is showing", () => {
    // The exact case in the screenshot: empty draft, so PenPrompt renders.
    const { container } = page({ content: "" });

    expect(inFlow(container)).toHaveLength(1);
  });

  it("with a draft written", () => {
    const { container } = page({ content: "INT. CHIYA PASAL - DAY\n\nShe wipes the counter." });

    expect(inFlow(container)).toHaveLength(1);
  });

  it("with a mid-draft note showing", () => {
    /* The regression itself. The note was a sibling of the page wrapper; it is
       now inside it. If someone moves it back out, this fails here rather than
       on somebody's screen. */
    const { container } = page({
      content: "INT. CHIYA PASAL - DAY",
      milestone: {
        key: "x",
        lead: () => "A note",
        body: "Something worth saying about the draft.",
        cta: { label: "Do the thing", action: "corkboard" },
      },
      milestoneFacts: { sceneCount: 4 },
    });

    expect(inFlow(container)).toHaveLength(1);
  });

  it("in focus mode", () => {
    const { container } = page({ zenMode: true, content: "INT. SOMEWHERE - DAY" });

    expect(inFlow(container)).toHaveLength(1);
  });
});

describe("what shares the page's column", () => {
  it("the mid-draft note sits under the paper, not beside it", () => {
    const { container } = page({
      content: "INT. CHIYA PASAL - DAY",
      milestone: {
        key: "x",
        lead: () => "A note",
        body: "Something worth saying about the draft.",
        cta: { label: "Do the thing", action: "corkboard" },
      },
      milestoneFacts: { sceneCount: 4 },
    });

    const column = inFlow(container)[0];
    const paper = container.querySelector(".screenplay-page");
    const note = container.querySelector('[aria-label="A note from The Pen"]');

    expect(note).toBeTruthy();
    expect(column.contains(paper)).toBe(true);
    expect(column.contains(note)).toBe(true);
    // Under, not beside: the note must not be inside the row that holds the
    // textarea, or it becomes a column next to the paper one level down.
    expect(paper.parentElement.contains(note)).toBe(false);
  });

  it("the Pen's blank-page prompt stays out of flow", () => {
    /* It is `position:absolute` on purpose — it floats over the paper rather
       than pushing it down. An edit that made it an ordinary child would move
       the page instead, and nothing else would notice. */
    const { container } = page({ content: "" });

    const absolute = [...container.children]
      .filter((el) => el.className.includes("absolute"));
    expect(absolute.length).toBeGreaterThanOrEqual(1);
  });
});

describe("what the blank page offers", () => {
  /* A writer creating a YouTube project met the guide telling them to type
     `INT. CHIYA PASAL - DAY`. `videoscript.py` parses a slugline as narration,
     so doing what the product said produced a draft with NO SECTIONS — an
     empty Outline, an empty Corkboard, no retention shape, and nothing saying
     why.

     The component knowing both formats is worth nothing if the format never
     reaches it, which is what these cover. */

  it("offers a slugline on a screenplay", () => {
    page({ content: "", script: { id: "s1", scenes: [], project: { format: "short" } } });

    expect(screen.getByText("INT. CHIYA PASAL - DAY")).toBeInTheDocument();
  });

  it("offers a section heading on a long-form video", () => {
    page({ content: "", script: { id: "s1", scenes: [], project: { format: "long_form" } } });

    expect(screen.getByText("## HOOK - 0:15")).toBeInTheDocument();
    expect(screen.queryByText("INT. CHIYA PASAL - DAY")).not.toBeInTheDocument();
  });

  it("reads the format off the project, not off the script row", () => {
    // `script.project` is a field SUBSET — CLAUDE.md records it having no
    // `id`, which cost a bug once. `format` is on it; this pins that.
    page({ content: "", script: { id: "s1", scenes: [], project: { format: "long_form" } } });

    expect(screen.getByText("## HOOK - 0:15")).toBeInTheDocument();
  });
});
