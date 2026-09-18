/* What the Pen offers on a blank page.
 *
 * This component had no test file. It was written when every project was a
 * screenplay, and it hardcodes one first line — so when `long_form` landed, a
 * writer creating a YouTube project met a guide character telling them to type
 * `INT. CHIYA PASAL - DAY`.
 *
 * That is worse than unhelpful. `videoscript.py` parses a slugline as
 * narration, so following the product's own advice produced a draft with **no
 * sections at all**: an empty Outline, an empty Corkboard, and no retention
 * shape. The one moment the product has a new writer's full attention, spent
 * teaching them the wrong format.
 */
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import PenPrompt, { FIRST_LINE } from "./PenPrompt";

describe("on a screenplay's blank page", () => {
  it("offers a slugline", () => {
    render(<PenPrompt onInsert={vi.fn()} onOpenGuide={vi.fn()} format="short" />);

    expect(screen.getByText("INT. CHIYA PASAL - DAY")).toBeInTheDocument();
  });

  it("inserts exactly what it showed", () => {
    // The button's label IS the promise. Inserting anything else would teach a
    // writer that the product's examples are decorative.
    const onInsert = vi.fn();
    render(<PenPrompt onInsert={onInsert} onOpenGuide={vi.fn()} format="film" />);

    fireEvent.click(screen.getByText("INT. CHIYA PASAL - DAY"));

    expect(onInsert).toHaveBeenCalledWith("INT. CHIYA PASAL - DAY");
  });

  it("is what an unknown format falls back to", () => {
    // Every project that existed before long_form is a screenplay, and a
    // format this does not recognise is far more likely to be one of those
    // than to be a video.
    render(<PenPrompt onInsert={vi.fn()} onOpenGuide={vi.fn()} />);

    expect(screen.getByText("INT. CHIYA PASAL - DAY")).toBeInTheDocument();
  });
});

describe("on a long-form video's blank page", () => {
  it("offers a section heading, not a slugline", () => {
    /* The bug. A slugline in a video script parses as narration, so the writer
       who does what they were told gets no sections — the Outline, the
       Corkboard and the retention shape are all empty and nothing says why. */
    render(<PenPrompt onInsert={vi.fn()} onOpenGuide={vi.fn()} format="long_form" />);

    expect(screen.getByText(FIRST_LINE.long_form)).toBeInTheDocument();
    expect(screen.queryByText("INT. CHIYA PASAL - DAY")).not.toBeInTheDocument();
  });

  it("offers a line videoscript can actually parse", () => {
    // Pinned against the parser's own syntax rather than a copy of it: a
    // heading that does not match `## NAME - M:SS` produces nothing, and this
    // is the one line the product puts in a writer's hands.
    expect(FIRST_LINE.long_form).toMatch(/^## [A-Z]+ - \d+:\d{2}$/);
  });

  it("names it as a section, not a scene", () => {
    render(<PenPrompt onInsert={vi.fn()} onOpenGuide={vi.fn()} format="long_form" />);

    expect(screen.queryByText(/what the camera sees/i)).not.toBeInTheDocument();
  });

  it("inserts the section heading", () => {
    const onInsert = vi.fn();
    render(<PenPrompt onInsert={onInsert} onOpenGuide={vi.fn()} format="long_form" />);

    fireEvent.click(screen.getByText(FIRST_LINE.long_form));

    expect(onInsert).toHaveBeenCalledWith(FIRST_LINE.long_form);
  });
});

describe("what both formats keep", () => {
  it("offers the walkthrough either way", () => {
    for (const format of ["short", "long_form"]) {
      const { unmount } = render(
        <PenPrompt onInsert={vi.fn()} onOpenGuide={vi.fn()} format={format} />,
      );
      expect(screen.getByRole("button", { name: /walk me through/i }))
        .toBeInTheDocument();
      unmount();
    }
  });

  it("takes its colours from the page in both", () => {
    // The app's ink tokens wash out on #FAF9F6 paper — a constraint this
    // component's docstring records from opening it on a real screen.
    for (const format of ["short", "long_form"]) {
      const { container, unmount } = render(
        <PenPrompt onInsert={vi.fn()} onOpenGuide={vi.fn()}
                   format={format} pageTheme="light" />,
      );
      expect(container.innerHTML).not.toMatch(/undefined/);
      unmount();
    }
  });
});

describe("the Pen itself is the affordance", () => {
  it("starts the writer off when clicked, like the button under it", () => {
    /* It was inert: a 44px mark directly above an invitation to start writing,
       with no cursor, no hover and no handler. It is the thing people reach
       for. */
    const onInsert = vi.fn();
    const { container } = render(<PenPrompt onInsert={onInsert} onOpenGuide={() => {}} />);

    fireEvent.click(container.querySelector(".the-pen").closest("button"));

    expect(onInsert).toHaveBeenCalledWith(FIRST_LINE.screenplay);
  });

  it("does not become a second tab stop for the same action", () => {
    /* A redundant POINTER affordance. The labelled button below already
       exposes this action, so adding a keyboard stop would put two identical
       controls in the tab order and announce the same sentence twice. */
    const { container } = render(<PenPrompt onInsert={() => {}} onOpenGuide={() => {}} />);
    const penButton = container.querySelector(".the-pen").closest("button");

    expect(penButton).toHaveAttribute("tabindex", "-1");
    expect(penButton).toHaveAttribute("aria-hidden", "true");
  });
});
