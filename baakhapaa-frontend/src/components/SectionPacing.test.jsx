import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import SectionPacing, { spokenSeconds } from "./SectionPacing";

/**
 * The status line for a format that has no pages.
 *
 * Most of this is about what it does NOT do. The readout reports numbers and
 * never judges: no badge when a section runs long, no colour change, no
 * warning, nothing blocked. `RetentionShape` and `MilestoneNote` follow the
 * same rule and each has a test pinning it, because this is exactly the kind
 * of restraint a later change erodes by adding "just one" warning.
 */

const DRAFT = [
  "## HOOK - 0:15",            // line 1
  "",
  "Nobody finishes a Nepali web series.",   // line 3
  "",
  "## PAYOFF - 2:40",          // line 5
  "",
  "Move the answer to episode two.",        // line 7
].join("\n");

const show = (props) =>
  render(<SectionPacing content={DRAFT} speakingWpm={150} {...props} />);

describe("which section the caret is in", () => {
  it("names the section above the caret", () => {
    show({ caretLine: 3 });
    expect(screen.getByTestId("section-pacing").textContent).toMatch(/HOOK/);
  });

  it("moves to the next section once the caret passes its heading", () => {
    show({ caretLine: 7 });
    expect(screen.getByTestId("section-pacing").textContent).toMatch(/PAYOFF/);
  });

  it("renders nothing on an empty draft", () => {
    // The Pen is what meets a writer on an empty page; a readout of zero
    // would just be chrome under it.
    render(<SectionPacing content="" caretLine={1} speakingWpm={150} />);
    expect(screen.queryByTestId("section-pacing")).toBeNull();
  });
});

describe("the target", () => {
  it("shows written against target in essay mode", () => {
    show({ caretLine: 3, videoCategory: "essay" });
    expect(screen.getByTestId("section-pacing").textContent).toMatch(/of 0:15/);
  });

  it("shows no target in course mode", () => {
    // A lesson has no runtime to drift from. `videoscript` leaves
    // `time_allocation` null there and `RetentionShape` is suppressed for the
    // same reason.
    show({ caretLine: 3, videoCategory: "course" });
    const text = screen.getByTestId("section-pacing").textContent;
    expect(text).not.toMatch(/of \d/);
    expect(text).toMatch(/written/);
  });

  it("shows no target when the writer did not set one", () => {
    render(
      <SectionPacing content={"## HOOK\n\nSome narration."} caretLine={3} speakingWpm={150} />,
    );
    expect(screen.getByTestId("section-pacing").textContent).toMatch(/written/);
  });
});

describe("it reports and never judges", () => {
  // A section at triple its target must read exactly like one under it.
  const OVER = ["## HOOK - 0:05", "", "word ".repeat(400)].join("\n");

  it("says nothing about running long", () => {
    render(<SectionPacing content={OVER} caretLine={3} speakingWpm={150} />);
    const text = screen.getByTestId("section-pacing").textContent.toLowerCase();
    for (const word of ["over", "long", "warning", "too", "!", "exceeds", "trim", "cut"]) {
      expect(text).not.toContain(word);
    }
  });

  it("uses the same markup over target as under it", () => {
    const under = render(<SectionPacing content={DRAFT} caretLine={3} speakingWpm={150} />);
    const a = under.getByTestId("section-pacing").className;
    under.unmount();
    const over = render(<SectionPacing content={OVER} caretLine={3} speakingWpm={150} />);
    expect(over.getByTestId("section-pacing").className).toBe(a);
  });

  it("carries no role that would announce it as a problem", () => {
    render(<SectionPacing content={OVER} caretLine={3} speakingWpm={150} />);
    const el = screen.getByTestId("section-pacing");
    expect(el.getAttribute("role")).toBeNull();
    expect(el.closest("[role='alert']")).toBeNull();
  });
});

describe("spokenSeconds", () => {
  it("is words over a speaking rate, not pages", () => {
    expect(spokenSeconds(150, 150)).toBe(60);
    expect(spokenSeconds(75, 150)).toBe(30);
  });

  it("falls back to a rate rather than dividing by zero", () => {
    expect(Number.isFinite(spokenSeconds(150, 0))).toBe(true);
    expect(Number.isFinite(spokenSeconds(150, undefined))).toBe(true);
  });

  it("counts an empty section as nothing", () => {
    expect(spokenSeconds(0, 150)).toBe(0);
  });
});
