/* Drawing the shape of a long-form video.
 *
 * The arithmetic is tested in `lib/retention.test.js`. This covers the parts
 * that only exist once it is on a screen — that a short section is still
 * reachable, that every block says what it is to a screen reader, and above all
 * that the thing states what it cannot know.
 */
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import RetentionShape from "./RetentionShape";

const SECTIONS = [
  { heading: "HOOK", section_kind: "hook", target_seconds: 30, written_seconds: 40 },
  { heading: "SEGMENT 1", section_kind: "segment", target_seconds: 240, written_seconds: 200 },
  { heading: "PAYOFF", section_kind: "payoff", target_seconds: 90, written_seconds: 0 },
];

describe("RetentionShape", () => {
  it("draws a block for every section", () => {
    render(<RetentionShape sections={SECTIONS} />);

    for (const s of SECTIONS) {
      // Two per section on purpose: the band, and a legend row that cannot
      // clip. See the comment on the legend in the component.
      expect(screen.getAllByRole("button", { name: new RegExp(s.heading, "i") }))
        .toHaveLength(2);
    }
  });

  it("shows the total runtime", () => {
    render(<RetentionShape sections={SECTIONS} />);

    expect(screen.getByText("6:00")).toBeInTheDocument();
  });

  it("opens the section when a block is pressed", () => {
    // The whole point is getting from "the payoff is tiny" to the payoff.
    const onOpen = vi.fn();
    render(<RetentionShape sections={SECTIONS} onOpen={onOpen} />);

    fireEvent.click(screen.getByRole("button", { name: /PAYOFF, 1:30/ }));

    expect(onOpen).toHaveBeenCalledWith(
      expect.objectContaining({ heading: "PAYOFF", kind: "payoff" }),
    );
  });

  it("names every block for a screen reader, not just by colour", () => {
    // The instrument's whole reading is carried in relative widths and colour,
    // which is exactly the reading somebody not looking at it cannot get.
    render(<RetentionShape sections={SECTIONS} />);

    expect(screen.getByRole("button", { name: /HOOK, 0:30/ })).toBeInTheDocument();
  });

  it("is announced as what it is", () => {
    render(<RetentionShape sections={SECTIONS} />);

    expect(screen.getByRole("region", { name: /shape of this video/i }))
      .toBeInTheDocument();
  });

  it("says the curve is a convention, not a measurement", () => {
    /* The load-bearing test in this file. Nothing here can observe a single
       real viewer — a writer's own analytics would be a measurement and this is
       not. An instrument that implies a precision it does not have is worse
       than no instrument, because it gets believed. */
    render(<RetentionShape sections={SECTIONS} />);

    expect(screen.getByText(/convention, not a measurement/i)).toBeInTheDocument();
    expect(screen.getByText(/your own analytics/i)).toBeInTheDocument();
  });

  it("never tells the writer their video is wrong", () => {
    /* The rule MilestoneNote already follows: it may show and point, it must
       not assert a fault it cannot check. A forty-second hook is wrong in most
       videos and exactly right in some, and nothing here can tell which. */
    const { container } = render(<RetentionShape sections={SECTIONS} />);

    expect(container.textContent).not.toMatch(/too (long|short|slow)/i);
    expect(container.textContent).not.toMatch(/should be/i);
  });

  it("shows nothing rather than an invented shape", () => {
    // A bar of equal grey blocks for an unplanned draft would be the instrument
    // showing a reading it does not have.
    render(<RetentionShape sections={[]} />);

    expect(screen.queryByRole("region", { name: /shape of this video/i }))
      .not.toBeInTheDocument();
    expect(screen.getByText(/and the shape of the video appears here/i))
      .toBeInTheDocument();
  });

  it("tells the writer how to get a reading", () => {
    // An empty state that only says "nothing here" makes the feature look
    // broken rather than unused.
    render(<RetentionShape sections={[]} />);

    expect(screen.getByText(/## HOOK - 0:15/)).toBeInTheDocument();
  });

  it("survives a draft with no targets at all", () => {
    // Written but unplanned — a writer who typed sections without deciding
    // lengths still gets a shape, from what exists.
    render(<RetentionShape sections={[
      { heading: "HOOK", section_kind: "hook", target_seconds: null, written_seconds: 30 },
    ]} />);

    expect(screen.getAllByRole("button", { name: /hook/i }).length).toBeGreaterThan(0);
  });

  it("gives every section a target a thumb can hit", () => {
    /* Measured at 320px before this: a fifteen-second hook rendered 7px wide,
       against the 24px floor WCAG 2.2 sets. `retention.MIN_SHARE` floors a
       section's SHARE of the bar and guarantees nothing in pixels.

       jsdom computes no layout, so what is asserted here is the pixel floor
       being declared and the legend existing as a second, unclippable route.
       The geometry was measured in a real engine against the built stylesheet. */
    const { container } = render(<RetentionShape sections={SECTIONS} />);

    const bands = [...container.querySelectorAll("button")]
      .filter((b) => b.className.includes("min-w-"));
    expect(bands.length).toBe(SECTIONS.length);
    for (const b of bands) expect(b.className).toMatch(/min-w-\[24px\]/);

    expect(screen.getByRole("button", { name: /Go to PAYOFF/ })).toBeInTheDocument();
  });
});
