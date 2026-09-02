import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";

/**
 * The compact act/scene strip the structure panel collapses into.
 *
 * Three bugs live in this component's history and each has a test below.
 *
 * Reading `time_allocation` alone gave a nine-scene hand-typed screenplay a
 * total runtime of 0:00, crushing every written block to a sliver while the
 * unwritten outline took the whole bar — nothing had ever *allocated* those
 * scenes anything, because nobody generated them.
 *
 * The playhead was computed from raw minutes while the blocks were laid out at
 * `max(mins, MIN_WEIGHT)`, so the marker drifted away from the block it was
 * meant to mark — worst on exactly the short scenes the floor exists to keep
 * clickable.
 *
 * And short-form projects returned null, leaving the minimized strip blank for
 * every reel and short in the product; they have beats rather than acts, so they
 * collapse to a beat bar instead.
 */

// eslint-disable-next-line import/first
import CompactTimeline from "./CompactTimeline";

const scene = (over = {}) => ({
  id: "sc1", title: "The shop", act_number: 1,
  time_allocation: 2, draft_json: { minutes: 2 }, ...over,
});

const onSceneClick = vi.fn();
const onExpand = vi.fn();

const show = (props = {}) =>
  render(<CompactTimeline scenes={[]} activeScene={0}
                          onSceneClick={onSceneClick} onExpand={onExpand} {...props} />);

const blockFor = (label) =>
  screen.getAllByRole("button").find((b) => b.textContent.includes(label));

describe("when there is nothing to draw", () => {
  it("renders nothing with no scenes and no suggestions", () => {
    const { container } = show();

    expect(container).toBeEmptyDOMElement();
  });
});

describe("runtime measured off the page", () => {
  it("uses what is written over what was planned", () => {
    show({ scenes: [scene({ time_allocation: 10, draft_json: { minutes: 3 } })] });

    expect(screen.getByText(/3:00 written of 3:00/)).toBeInTheDocument();
  });

  it("falls back to the plan for a scene not yet written", () => {
    show({ scenes: [scene({ time_allocation: 4, draft_json: null })] });

    expect(screen.getByText(/0:00 written of 4:00/)).toBeInTheDocument();
  });

  it("gives a hand-typed screenplay a real total, not 0:00", () => {
    // The bug: every scene parsed off a hand-typed page is planned-zero,
    // because nothing ever allocated it anything.
    const typed = [
      scene({ id: "a", title: "One", time_allocation: 0, draft_json: { minutes: 2 } }),
      scene({ id: "b", title: "Two", time_allocation: 0, draft_json: { minutes: 3 } }),
    ];
    show({ scenes: typed });

    expect(screen.getByText(/5:00 written of 5:00/)).toBeInTheDocument();
  });

  it("reads draft_json when it arrives as a string from Postgres", () => {
    show({ scenes: [scene({ time_allocation: 0, draft_json: JSON.stringify({ minutes: 2 }) })] });

    expect(screen.getByText(/2:00 written of 2:00/)).toBeInTheDocument();
  });

  it("survives unparseable draft_json", () => {
    show({ scenes: [scene({ time_allocation: 3, draft_json: "{not json" })] });

    expect(screen.getByText(/0:00 written of 3:00/)).toBeInTheDocument();
  });
});

describe("the blocks", () => {
  it("draws a written scene as a clickable block", () => {
    show({ scenes: [scene({ title: "The shop" })] });

    fireEvent.click(blockFor("The shop"));

    expect(onSceneClick).toHaveBeenCalledWith(0);
  });

  it("numbers written blocks by script position", () => {
    show({ scenes: [scene({ id: "a", title: "One" }), scene({ id: "b", title: "Two" })] });

    expect(blockFor("Two").textContent).toContain("2 Two");
  });

  it("sizes blocks in proportion to runtime", () => {
    show({ scenes: [
      scene({ id: "a", title: "Short", draft_json: { minutes: 1 } }),
      scene({ id: "b", title: "Long", draft_json: { minutes: 3 } }),
    ] });

    expect(blockFor("Short").style.flex).toBe("1 1 0%");
    expect(blockFor("Long").style.flex).toBe("3 1 0%");
  });

  it("keeps a very short scene clickable rather than collapsing it to nothing", () => {
    show({ scenes: [scene({ title: "Blink", time_allocation: 0, draft_json: { minutes: 0.1 } })] });

    // MIN_WEIGHT, not 0.1.
    expect(blockFor("Blink").style.flex).toBe("0.4 1 0%");
  });

  it("marks the active scene and shows its runtime", () => {
    show({ scenes: [
      scene({ id: "a", title: "One" }),
      scene({ id: "b", title: "Two", draft_json: { minutes: 4 } }),
    ], activeScene: 1 });

    expect(blockFor("Two").className).toContain("border-gold");
    expect(blockFor("Two").textContent).toContain("4:00");
  });

  it("draws an unadded suggestion as an outline that opens the panel", () => {
    show({
      scenes: [],
      suggestions: { acts: [{ act_number: 1, name: "Setup",
                             scenes: [{ title: "Unwritten", time_allocation: 2 }] }] },
    });

    const outline = blockFor("Unwritten");
    expect(outline.className).toContain("border-dashed");

    fireEvent.click(outline);
    expect(onExpand).toHaveBeenCalled();
  });

  it("drops a suggestion once its scene has been added", () => {
    show({
      scenes: [scene({ title: "Added", act_number: 1 })],
      suggestions: { acts: [{ act_number: 1, name: "Setup",
                             scenes: [{ title: "Added", time_allocation: 2 },
                                      { title: "Still pending", time_allocation: 2 }] }] },
    });

    expect(screen.getAllByRole("button").filter((b) => b.textContent.includes("Added")))
      .toHaveLength(1);
    expect(blockFor("Still pending")).toBeTruthy();
  });
});

describe("the playhead", () => {
  it("sits at the start of the active scene's block", () => {
    const { container } = show({ scenes: [
      scene({ id: "a", title: "One", draft_json: { minutes: 1 } }),
      scene({ id: "b", title: "Two", draft_json: { minutes: 3 } }),
    ], activeScene: 1 });

    // One is 1 of 4 layout units, so Two begins at 25%.
    expect(container.querySelector(".bg-gold.pointer-events-none").style.left).toBe("25%");
  });

  it("is measured with the same floor the blocks are laid out with", () => {
    // The drift bug: a playhead computed from raw minutes lands somewhere the
    // block is not, and worst on the short scenes the floor exists to protect.
    const { container } = show({ scenes: [
      scene({ id: "a", title: "Blink", time_allocation: 0, draft_json: { minutes: 0.1 } }),
      scene({ id: "b", title: "Two", time_allocation: 0, draft_json: { minutes: 0.4 } }),
    ], activeScene: 1 });

    // Both floor to 0.4, so the second block begins at exactly half.
    expect(container.querySelector(".bg-gold.pointer-events-none").style.left).toBe("50%");
  });

  it("is absent when the active scene is not on the strip", () => {
    const { container } = show({ scenes: [scene()], activeScene: 9 });

    expect(container.querySelector(".bg-gold.pointer-events-none")).toBeNull();
  });
});

describe("act labels", () => {
  it("names each act over its own blocks, not spread evenly", () => {
    // `justify-between` put ACT II above whatever happened to sit in the
    // middle, which is only ever right by accident.
    show({
      scenes: [scene({ id: "a", act_number: 1, title: "One" }),
               scene({ id: "b", act_number: 2, title: "Two" })],
      suggestions: { acts: [{ act_number: 1, name: "Setup" },
                            { act_number: 2, name: "Confrontation" }] },
    });

    expect(screen.getByText("ACT I — SETUP")).toBeInTheDocument();
    expect(screen.getByText("ACT II — CONFRONTATION")).toBeInTheDocument();
  });

  it("names an act with no planned name by its numeral alone", () => {
    show({ scenes: [scene({ act_number: 1 })] });

    expect(screen.getByText("ACT I")).toBeInTheDocument();
  });

  it("sizes each label to its act's share of the strip", () => {
    const { container } = show({
      scenes: [scene({ id: "a", act_number: 1, draft_json: { minutes: 1 } }),
               scene({ id: "b", act_number: 2, draft_json: { minutes: 3 } })],
    });

    // Buttons now, not spans: double-clicking an act label edits how long that
    // act is planned to run, so the label had to become something clickable.
    const labels = Array.from(container.querySelectorAll("button[style*='flex']"))
      .filter((b) => /^ACT /.test(b.textContent));
    expect(labels.map((l) => l.style.flex)).toEqual(["1 1 0%", "3 1 0%"]);
  });
});

describe("the ruler", () => {
  it("draws one label per tick", () => {
    show({ scenes: [scene({ draft_json: { minutes: 6 } })] });

    expect(screen.getByText("0:00")).toBeInTheDocument();
    expect(screen.getByText("3:00")).toBeInTheDocument();
  });

  it("draws one division per label, so marks and labels agree", () => {
    // This drew 12 divisions under 7 labels, so the ruler disagreed with its
    // own marks everywhere except the left edge.
    const { container } = show({ scenes: [scene()] });

    const strip = container.querySelector("[style*='repeating-linear-gradient']");
    expect(strip.style.background).toContain(`${100 / 6}%`);
  });
});

describe("short form", () => {
  const SHORT = {
    short_form: true, category: "reel_hook", total_seconds: 40,
    beats: [
      { beat_number: 1, name: "Hook", duration_seconds: 10 },
      { beat_number: 2, name: "Turn", duration_seconds: 20 },
      { beat_number: 3, name: "Payoff", duration_seconds: 10 },
    ],
  };

  it("collapses to a beat bar rather than going blank", () => {
    // Returning null left the minimized strip empty for every reel and short.
    show({ suggestions: SHORT });

    expect(screen.getByText(/reel hook · 3 beats/)).toBeInTheDocument();
  });

  it("shows the total in seconds, which is the unit short form thinks in", () => {
    show({ suggestions: SHORT });

    expect(screen.getByText("40s")).toBeInTheDocument();
  });

  it("sizes each beat by its share of the runtime", () => {
    const { container } = show({ suggestions: SHORT });

    const widths = Array.from(container.querySelectorAll("[style*='width']"))
      .map((n) => n.style.width);
    expect(widths).toEqual(["25%", "50%", "25%"]);
  });

  it("names each beat in its tooltip", () => {
    show({ suggestions: SHORT });

    expect(screen.getByTitle("Hook · 10s")).toBeInTheDocument();
  });

  it("expands the beat sheet on click", () => {
    show({ suggestions: SHORT });

    fireEvent.click(screen.getByTitle("Expand the beat sheet"));

    expect(onExpand).toHaveBeenCalled();
  });

  it("does not divide by zero when the total is missing", () => {
    show({ suggestions: { ...SHORT, total_seconds: 0 } });

    expect(screen.getByText(/3 beats/)).toBeInTheDocument();
  });
});


/**
 * A crowded strip.
 *
 * The timeline is one row of fixed width. Past a dozen scenes each block gets
 * about fifty pixels, and the heading truncated to "1 INT. CL9" reads as
 * damage rather than as a label — so beyond that point the number alone is the
 * honest thing to draw. The full heading stays in the title attribute and on
 * the index cards.
 */
describe("when there are too many scenes to label", () => {
  const many = (n) =>
    Array.from({ length: n }, (_, i) =>
      scene({ id: `s${i}`, title: `INT. LOCATION ${i} - DAY`, act_number: 1,
              draft_json: { minutes: 1 } }));

  it("still labels a strip that has room", () => {
    show({ scenes: many(5) });

    expect(screen.getByText(/INT\. LOCATION 0 - DAY/)).toBeInTheDocument();
  });

  it("drops to numbers once the blocks are too narrow to read", () => {
    show({ scenes: many(20) });

    // The block's own text, not a search: with twenty scenes every heading is
    // gone from the strip and only the ordinal is drawn.
    const first = screen.getAllByRole("button")
      .find((b) => (b.getAttribute("title") || "").includes("INT. LOCATION 0 - DAY"));
    // The ordinal survives (and the active block still shows its timecode);
    // the heading is what goes.
    expect(first.textContent).not.toContain("LOCATION");
    expect(first.textContent).toContain("1");
  });

  it("keeps the heading reachable on hover", () => {
    show({ scenes: many(20) });

    const block = screen.getAllByRole("button")
      .find((b) => (b.getAttribute("title") || "").includes("INT. LOCATION 0 - DAY"));
    expect(block).toBeTruthy();
  });
});
