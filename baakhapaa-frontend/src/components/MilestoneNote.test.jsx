/* The saying of a mid-draft note.
 *
 * When it fires is tested in `lib/milestones.test.js`. This covers the
 * rendering, and mostly the parts that would make it an interruption rather
 * than a note: that it can be dismissed, that it is announced as what it is,
 * and that it says nothing at all when there is nothing to say.
 */
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import MilestoneNote from "./MilestoneNote";
import { MILESTONES, readFacts } from "../lib/milestones";

const midpoint = MILESTONES.find((m) => m.key === "midpoint-flip");
const unmarked = MILESTONES.find((m) => m.key === "scenes-unmarked");

describe("MilestoneNote", () => {
  it("renders nothing when there is no milestone", () => {
    // The common case by a wide margin — most renders of the editor have
    // nothing due, and this component is mounted on all of them.
    const { container } = render(<MilestoneNote milestone={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("says the milestone's lead and body", () => {
    render(<MilestoneNote milestone={midpoint} facts={readFacts()} />);

    expect(screen.getByText(/middle of the script/i)).toBeInTheDocument();
    expect(screen.getByText(/register is supposed to change/i)).toBeInTheDocument();
  });

  it("fills the lead from the draft's own numbers", () => {
    // "7 scenes" rather than "some scenes": the note is only worth reading
    // because it is about this script.
    render(
      <MilestoneNote
        milestone={unmarked}
        facts={readFacts({ scenes: Array.from({ length: 7 }, () => ({})) })}
      />,
    );

    expect(screen.getByText(/7 scenes/)).toBeInTheDocument();
  });

  it("hands the milestone back when its one button is pressed", () => {
    const onAct = vi.fn();
    render(<MilestoneNote milestone={midpoint} facts={readFacts()} onAct={onAct} />);

    fireEvent.click(screen.getByRole("button", { name: midpoint.cta.label }));

    expect(onAct).toHaveBeenCalledWith(midpoint);
  });

  it("can be dismissed", () => {
    /* PenPrompt needs no dismissal — it vanishes on the first keystroke.
       This one is anchored to a moment in the script rather than to an empty
       page, so a writer who does not want to be spoken to needs a way to say
       so that the product remembers. */
    const onDismiss = vi.fn();
    render(
      <MilestoneNote milestone={midpoint} facts={readFacts()} onDismiss={onDismiss} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /dismiss/i }));

    expect(onDismiss).toHaveBeenCalledWith(midpoint);
  });

  it("the dismiss is big enough to press with a thumb", () => {
    /* `tap` stretches VERTICALLY only — its overlay keeps the element's own
       width so it cannot steal a neighbour's clicks. So `tap` alone was not
       enough here: at px-1.5 this measured 22px wide, still 2px under the 24px
       floor. The padding carries the width, `tap` carries the height, and both
       have to stay. */
    render(<MilestoneNote milestone={midpoint} facts={readFacts()} onDismiss={vi.fn()} />);

    const close = screen.getByRole("button", { name: /dismiss/i });
    const classes = close.className.split(/\s+/);
    expect(classes).toContain("tap");
    expect(classes).toContain("px-2");
  });

  it("is announced as a note, not as an alert", () => {
    // It is an aside with a name. A live region would interrupt a screen
    // reader mid-sentence to deliver something that is not urgent, which is
    // the audible version of the thing this design is avoiding.
    render(<MilestoneNote milestone={midpoint} facts={readFacts()} />);

    const note = screen.getByRole("complementary", { name: /note from the pen/i });
    expect(note).toBeInTheDocument();
    expect(note).not.toHaveAttribute("aria-live");
  });

  it("takes its colours from the page, not from the app", () => {
    /* The app's ink tokens are tuned for near-black chrome and wash out on
       #FAF9F6 paper — the constraint PenPrompt documents from opening the page
       on a real screen. Both themes must produce a real class, not undefined. */
    const { container: light } = render(
      <MilestoneNote milestone={midpoint} facts={readFacts()} pageTheme="light" />,
    );
    const { container: dark } = render(
      <MilestoneNote milestone={midpoint} facts={readFacts()} pageTheme="dark" />,
    );

    expect(light.innerHTML).not.toBe(dark.innerHTML);
    expect(light.innerHTML).not.toMatch(/undefined/);
    expect(dark.innerHTML).not.toMatch(/undefined/);
  });

  it("falls back to the light page for an unknown theme", () => {
    const { container } = render(
      <MilestoneNote milestone={midpoint} facts={readFacts()} pageTheme="sepia" />,
    );
    expect(container.innerHTML).not.toMatch(/undefined/);
  });
});
