import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";

/**
 * The script as an act → scene tree.
 *
 * This is the view that answers "is my second act twice as long as my first",
 * which is the question the three-act model exists to make askable. Two things
 * make that answer honest, and both are easy to get subtly wrong.
 *
 * The act share is computed against what is actually WRITTEN, not against what
 * was planned. Using the plan as the denominator would make every act read as
 * perfectly balanced regardless of the draft, because the plan is the thing
 * being checked — it cannot also be the yardstick.
 *
 * And written runtime comes from `draft_json.minutes` while planned runtime
 * comes from `time_allocation`. Showing both is what lets an act be on-plan and
 * badly under-written at the same time, which is a real and common state.
 *
 * The inline slugline composer exists because `window.prompt` is blocked in some
 * embedded browsers — and is the wrong affordance regardless.
 */

// eslint-disable-next-line import/first
import OutlineView from "./OutlineView";

const scene = (over = {}) => ({
  id: "sc1", title: "INT. PASAL - DAY", act_number: 1,
  draft_json: { minutes: 2, page: 1 }, ...over,
});

const SCENES = [
  scene({ id: "a", title: "INT. PASAL - DAY", act_number: 1, draft_json: { minutes: 2, page: 1 } }),
  scene({ id: "b", title: "EXT. BUS - NIGHT", act_number: 2, draft_json: { minutes: 6, page: 3 } }),
];

const SUGGESTIONS = {
  acts: [
    { act_number: 1, name: "Setup", duration_minutes: 5 },
    { act_number: 2, name: "Confrontation", duration_minutes: 5 },
  ],
};

const onOpen = vi.fn();
const onAdd = vi.fn();

const show = (props = {}) =>
  render(<OutlineView scenes={SCENES} suggestions={SUGGESTIONS} activeScene={0}
                      onOpen={onOpen} onAdd={onAdd} adding={null} {...props} />);

/** The collapse toggle for one act. Matched on text content rather than on the
 *  accessible name: the header packs the act, its scene count and two runtimes
 *  into a single button, and the separators do not survive name normalisation. */
const actHeader = (roman) =>
  screen.getAllByRole("button")
    // `Act I` runs straight into the scene count when the act has no planned
    // name, so anchor on the numeral not being followed by another one.
    .find((b) => new RegExp(`^▶Act ${roman}(?![IVX])`).test(b.textContent));

describe("the header", () => {
  it("totals what is written across the script", () => {
    show();

    expect(screen.getByText(/8:00 written across 2 scenes/)).toBeInTheDocument();
  });

  it("uses the singular for one scene", () => {
    show({ scenes: [SCENES[0]] });

    expect(screen.getByText(/across 1 scene$/)).toBeInTheDocument();
  });

  it("reads 0:00 on an empty script", () => {
    show({ scenes: [], suggestions: null });

    expect(screen.getByText(/0:00 written across 0 scenes/)).toBeInTheDocument();
  });
});

describe("act balance", () => {
  it("shares out what is written, not what was planned", () => {
    // 2 of 8 minutes in act one, 6 of 8 in act two. If the plan were the
    // denominator both would read 50% and the view would be useless.
    show();

    expect(screen.getByText("25%")).toBeInTheDocument();
    expect(screen.getByText("75%")).toBeInTheDocument();
  });

  it("shows written against planned, so an act can be on-plan and under-written", () => {
    show();

    // "2:00" is both the scene's runtime and act one's total.
    expect(screen.getAllByText("2:00").length).toBe(2);
    expect(screen.getAllByText(/\/ 5:00/).length).toBe(2);
  });

  it("omits the planned side when nothing was planned", () => {
    show({ suggestions: null });

    expect(screen.queryByText(/\/ 5:00/)).not.toBeInTheDocument();
  });

  it("reads 0% rather than dividing by zero on an unwritten script", () => {
    show({ scenes: [scene({ draft_json: null })] });

    // Both acts read 0%: nothing is written, so nothing has a share.
    expect(screen.getAllByText("0%").length).toBeGreaterThan(0);
  });

  it("draws the balance as a bar, since the model is a claim about balance", () => {
    const { container } = show();

    const widths = Array.from(container.querySelectorAll(".bg-gold\\/70"))
      .map((n) => n.style.width);
    expect(widths).toEqual(["25%", "75%"]);
  });
});

describe("the tree", () => {
  it("names acts in roman numerals with their planned name", () => {
    show();

    expect(actHeader("I")).toBeTruthy();
    expect(screen.getByText("· Setup")).toBeInTheDocument();
  });

  it("shows an act that exists only as a suggestion", () => {
    show({ scenes: [SCENES[0]] });

    expect(actHeader("II")).toBeTruthy();
    expect(screen.getByText("Nothing written in this act yet.")).toBeInTheDocument();
  });

  it("numbers scenes by their position in the whole script", () => {
    show();

    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("shows each scene's page and runtime", () => {
    show();

    expect(screen.getByText("p.1")).toBeInTheDocument();
    expect(screen.getAllByText("6:00").length).toBe(2);
  });

  it("omits the page marker on a scene that has none", () => {
    show({ scenes: [scene({ draft_json: { minutes: 2 } })], suggestions: null });

    expect(screen.queryByText(/^p\./)).not.toBeInTheDocument();
  });

  it("opens a scene by its script-wide index", () => {
    show();

    fireEvent.click(screen.getByText("EXT. BUS - NIGHT"));

    expect(onOpen).toHaveBeenCalledWith(1);
  });

  it("marks the active scene", () => {
    show({ activeScene: 1 });

    expect(screen.getByText("EXT. BUS - NIGHT").closest("button").className)
      .toContain("bg-goldDim");
  });

  it("collapses and expands an act", () => {
    show();

    fireEvent.click(actHeader("I"));

    expect(screen.queryByText("INT. PASAL - DAY")).not.toBeInTheDocument();
    expect(screen.getByText("EXT. BUS - NIGHT")).toBeInTheDocument();
  });

  it("puts a scene with no act number in act one", () => {
    show({ scenes: [scene({ act_number: null })], suggestions: null });

    expect(actHeader("I")).toBeTruthy();
  });

  it("survives unparseable draft_json without taking the outline down", () => {
    show({ scenes: [scene({ draft_json: "{not json" })], suggestions: null });

    expect(screen.getByText("INT. PASAL - DAY")).toBeInTheDocument();
  });
});

describe("adding a scene inline", () => {
  const composer = () => screen.getByDisplayValue("INT. LOCATION - DAY");

  it("offers to add to each act by name", () => {
    show();

    expect(screen.getByText("+ Add a scene to Act I")).toBeInTheDocument();
    expect(screen.getByText("+ Add a scene to Act II")).toBeInTheDocument();
  });

  it("opens a composer seeded with a usable slugline", () => {
    // Not window.prompt: blocked in some embedded browsers, and the wrong
    // affordance regardless.
    show();

    fireEvent.click(screen.getByText("+ Add a scene to Act I"));

    expect(composer()).toBeInTheDocument();
  });

  it("adds the slugline to the act it was opened from", () => {
    show();
    fireEvent.click(screen.getByText("+ Add a scene to Act II"));

    fireEvent.change(composer(), { target: { value: "EXT. ROOFTOP - NIGHT" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(onAdd).toHaveBeenCalledWith(2, "EXT. ROOFTOP - NIGHT");
  });

  it("upper-cases the slugline, because that is the format", () => {
    show();
    fireEvent.click(screen.getByText("+ Add a scene to Act I"));

    fireEvent.change(composer(), { target: { value: "ext. rooftop - night" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(onAdd).toHaveBeenCalledWith(1, "EXT. ROOFTOP - NIGHT");
  });

  it("trims it", () => {
    show();
    fireEvent.click(screen.getByText("+ Add a scene to Act I"));

    fireEvent.change(composer(), { target: { value: "  EXT. ROOFTOP - NIGHT  " } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(onAdd).toHaveBeenCalledWith(1, "EXT. ROOFTOP - NIGHT");
  });

  it("submits on Enter, since the writer is already typing", () => {
    show();
    fireEvent.click(screen.getByText("+ Add a scene to Act I"));

    const input = composer();
    fireEvent.change(input, { target: { value: "EXT. ROOFTOP - NIGHT" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onAdd).toHaveBeenCalledWith(1, "EXT. ROOFTOP - NIGHT");
  });

  it("backs out on Escape", () => {
    show();
    fireEvent.click(screen.getByText("+ Add a scene to Act I"));

    fireEvent.keyDown(composer(), { key: "Escape" });

    expect(screen.queryByDisplayValue("INT. LOCATION - DAY")).not.toBeInTheDocument();
  });

  it("backs out on Cancel", () => {
    show();
    fireEvent.click(screen.getByText("+ Add a scene to Act I"));

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onAdd).not.toHaveBeenCalled();
  });

  it("refuses an empty slugline", () => {
    show();
    fireEvent.click(screen.getByText("+ Add a scene to Act I"));

    fireEvent.change(screen.getByDisplayValue("INT. LOCATION - DAY"), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(onAdd).not.toHaveBeenCalled();
  });

  it("resets the composer after a successful add", () => {
    show();
    fireEvent.click(screen.getByText("+ Add a scene to Act I"));
    fireEvent.change(composer(), { target: { value: "EXT. ROOFTOP - NIGHT" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    fireEvent.click(screen.getByText("+ Add a scene to Act I"));

    expect(screen.getByDisplayValue("INT. LOCATION - DAY")).toBeInTheDocument();
  });

  it("locks the add controls while one is in flight", () => {
    show({ adding: "1" });

    expect(screen.getByText("+ Add a scene to Act I").closest("button")).toBeDisabled();
  });

  it("survives having no onAdd at all", () => {
    show({ onAdd: undefined });
    fireEvent.click(screen.getByText("+ Add a scene to Act I"));

    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(screen.queryByDisplayValue("INT. LOCATION - DAY")).not.toBeInTheDocument();
  });
});
