import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";

/**
 * The three-act structure preview.
 *
 * Structure generation is a two-step flow on purpose: generating returns a
 * *preview*, and nothing becomes part of the script until the writer adds it one
 * scene at a time. This panel is the preview half, so the property it has to
 * hold is that suggestions are inert — the only thing that reaches the script is
 * an explicit click on Add Scene.
 *
 * The second behaviour is that the panel shrinks as the work gets done. An added
 * suggestion collapses to a single line, because a panel that stays as tall at
 * the end of the writing as at the start is a panel occupying a third of the
 * screen to say nothing. That is a deliberate design decision and cheap to undo
 * by accident, so it is pinned here.
 */

// eslint-disable-next-line import/first
import StructureTimeline from "./StructureTimeline";

const STRUCTURE = {
  acts: [
    {
      act_number: 1, name: "Setup", duration_minutes: 5, percentage: 33,
      scenes: [
        { title: "The shop at dusk", description: "She counts the till.", scene_type: "major", time_allocation: 3 },
        { title: "The bus home", description: "Nobody speaks.", scene_type: "minor", time_allocation: 2 },
      ],
    },
    {
      act_number: 2, name: "Confrontation", duration_minutes: 5, percentage: 34,
      scenes: [{ title: "The argument", description: "It comes out wrong.", scene_type: "major", time_allocation: 5 }],
    },
    { act_number: 3, name: "Resolution", duration_minutes: 5, percentage: 33, scenes: [] },
  ],
};

const onAdd = vi.fn();

const show = (props = {}) =>
  render(
    <StructureTimeline structure={STRUCTURE} addedKeys={new Set()}
                       onAdd={onAdd} adding={null} {...props} />
  );

describe("when there is nothing to preview", () => {
  it("renders nothing without a structure", () => {
    const { container } = render(
      <StructureTimeline structure={null} addedKeys={new Set()} onAdd={onAdd} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing for a structure with no acts", () => {
    const { container } = render(
      <StructureTimeline structure={{ acts: [] }} addedKeys={new Set()} onAdd={onAdd} />);

    expect(container).toBeEmptyDOMElement();
  });
});

describe("the act bar", () => {
  it("names each act with its share of the runtime", () => {
    show();

    expect(screen.getByText("Act 1 · Setup")).toBeInTheDocument();
    expect(screen.getByText("Act 2 · Confrontation")).toBeInTheDocument();
    // Acts 1 and 3 share "5m · 33%", so match on the pair that is unique.
    expect(screen.getByText("5m · 34%")).toBeInTheDocument();
    expect(screen.getAllByText("5m · 33%")).toHaveLength(2);
  });

  it("sizes each act in proportion to its duration", () => {
    const { container } = render(
      <StructureTimeline
        structure={{ acts: [
          { act_number: 1, name: "A", duration_minutes: 3, percentage: 30, scenes: [] },
          { act_number: 2, name: "B", duration_minutes: 7, percentage: 70, scenes: [] },
        ] }}
        addedKeys={new Set()} onAdd={onAdd} />
    );

    const widths = Array.from(container.querySelectorAll("[style*='width']"))
      .map((n) => n.style.width);
    expect(widths).toEqual(["30%", "70%"]);
  });

  it("does not divide by zero when every act is zero minutes", () => {
    const { container } = render(
      <StructureTimeline
        structure={{ acts: [{ act_number: 1, name: "A", duration_minutes: 0, percentage: 0, scenes: [] }] }}
        addedKeys={new Set()} onAdd={onAdd} />
    );

    expect(container.querySelector("[style*='width']").style.width).toBe("0%");
  });

  it("totals the runtime across the acts", () => {
    show();

    expect(screen.getByText("15 min total")).toBeInTheDocument();
  });
});

describe("the pending count", () => {
  it("counts every unadded suggestion", () => {
    show();

    expect(screen.getByText(/3 pending/)).toBeInTheDocument();
  });

  it("drops as scenes are added", () => {
    show({ addedKeys: new Set(["1:The shop at dusk"]) });

    expect(screen.getByText(/2 pending/)).toBeInTheDocument();
  });

  it("reaches zero when everything has been added", () => {
    show({ addedKeys: new Set(["1:The shop at dusk", "1:The bus home", "2:The argument"]) });

    expect(screen.getByText(/0 pending/)).toBeInTheDocument();
  });
});

describe("a suggestion that has not been added", () => {
  it("shows its title, description, type and time", () => {
    show();

    expect(screen.getByText("The shop at dusk")).toBeInTheDocument();
    expect(screen.getByText("She counts the till.")).toBeInTheDocument();
    expect(screen.getAllByText("major").length).toBeGreaterThan(0);
    expect(screen.getByText("3m")).toBeInTheDocument();
  });

  it("offers to add it", () => {
    show();

    expect(screen.getAllByRole("button", { name: "+ Add Scene" })).toHaveLength(3);
  });

  it("adds it with its act and index, and nothing else", () => {
    // The inert-preview property: only this click puts a scene in the script.
    show();

    fireEvent.click(screen.getAllByRole("button", { name: "+ Add Scene" })[1]);

    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({ title: "The bus home" }), 1, 1);
  });

  it("disables only the one being added", () => {
    show({ adding: "1:The shop at dusk" });

    expect(screen.getByRole("button", { name: "Adding…" })).toBeDisabled();
    expect(screen.getAllByRole("button", { name: "+ Add Scene" })).toHaveLength(2);
  });
});

describe("a suggestion that has been added", () => {
  it("collapses to one line and gets out of the way", () => {
    // The panel should shrink as the script gets written, not stay as tall at
    // the end of the work as at the start.
    show({ addedKeys: new Set(["1:The shop at dusk"]) });

    expect(screen.getByText("✓")).toBeInTheDocument();
    expect(screen.queryByText("She counts the till.")).not.toBeInTheDocument();
  });

  it("keeps its title and runtime, so the act still reads", () => {
    show({ addedKeys: new Set(["1:The shop at dusk"]) });

    expect(screen.getByText("The shop at dusk")).toBeInTheDocument();
    expect(screen.getByText("3m")).toBeInTheDocument();
  });

  it("cannot be added twice", () => {
    show({ addedKeys: new Set(["1:The shop at dusk"]) });

    const buttons = screen.getAllByRole("button", { name: "+ Add Scene" });
    expect(buttons).toHaveLength(2);
  });

  it("matches on act and title together, not title alone", () => {
    // Two acts can each hold a scene called "The argument"; keying on the title
    // alone would strike both off when one was added.
    const structure = {
      acts: [
        { act_number: 1, name: "A", duration_minutes: 5, percentage: 50,
          scenes: [{ title: "The argument", description: "First.", scene_type: "major", time_allocation: 2 }] },
        { act_number: 2, name: "B", duration_minutes: 5, percentage: 50,
          scenes: [{ title: "The argument", description: "Again.", scene_type: "major", time_allocation: 2 }] },
      ],
    };
    render(<StructureTimeline structure={structure} addedKeys={new Set(["1:The argument"])}
                              onAdd={onAdd} adding={null} />);

    expect(screen.getByText("Again.")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "+ Add Scene" })).toHaveLength(1);
  });
});

it("draws an act with no suggestions without falling over", () => {
  show();

  expect(screen.getByText("Act 3 · Resolution")).toBeInTheDocument();
});
