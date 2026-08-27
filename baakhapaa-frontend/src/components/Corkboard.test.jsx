import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";

/**
 * Index cards for the whole script.
 *
 * The decision this component exists to hold: dragging a card moves the scene in
 * the *screenplay*, not in a parallel list. `scene_sync` derives every row's
 * order from document position, so a corkboard that reordered rows on their own
 * would be silently undone by the next save — a writer would watch their
 * restructure evaporate. `onMove(from, to)` is therefore an instruction to edit
 * the draft, and the tests below pin exactly when it fires and when it must not
 * (a card dropped on itself, or a drag that ended over nothing).
 *
 * Two display rules are also load-bearing. A scene cut from the draft is *marked*
 * rather than removed — its row survives because a storyboard frame points at it,
 * and presenting it as a live scene would be a lie. And the card carries the
 * production metadata (INT/EXT, time of day, cast) that was already parsed off
 * the page and previously shown nowhere; that is what makes an index card useful
 * to a 1st AD and not only to the writer.
 */

// eslint-disable-next-line import/first
import Corkboard from "./Corkboard";

const scene = (over = {}) => ({
  id: "sc1", title: "INT. PASAL - DAY", scene_type: "major", time_allocation: 3,
  draft_json: { minutes: 2, page: 1 }, ...over,
});

const SCENES = [
  scene({ id: "a", title: "INT. PASAL - DAY" }),
  scene({ id: "b", title: "EXT. BUS - NIGHT", draft_json: { minutes: 1.5, page: 3 } }),
];

const onOpen = vi.fn();
const onMove = vi.fn();
const onAdd = vi.fn();

const show = (props = {}) =>
  render(<Corkboard scenes={SCENES} activeScene={0} onOpen={onOpen}
                    onMove={onMove} onAdd={onAdd} adding={null} {...props} />);

const card = (title) => screen.getByText(title).closest("[draggable]");

describe("the board", () => {
  it("counts the scenes", () => {
    show();

    expect(screen.getByText(/Corkboard — 2 scenes/)).toBeInTheDocument();
  });

  it("uses the singular for one", () => {
    show({ scenes: [SCENES[0]] });

    expect(screen.getByText(/Corkboard — 1 scene$/)).toBeInTheDocument();
  });

  it("says what dragging does, because it is not the obvious thing", () => {
    show();

    expect(screen.getByText("drag a card to move the scene in the script"))
      .toBeInTheDocument();
  });

  it("numbers the cards from one", () => {
    show();

    expect(screen.getByText("Scene 1")).toBeInTheDocument();
    expect(screen.getByText("Scene 2")).toBeInTheDocument();
  });

  it("opens a scene on click", () => {
    show();

    fireEvent.click(card("EXT. BUS - NIGHT"));

    expect(onOpen).toHaveBeenCalledWith(1);
  });

  it("marks the active card", () => {
    show({ activeScene: 1 });

    expect(card("EXT. BUS - NIGHT").className).toContain("border-gold/60");
  });
});

describe("what a card carries", () => {
  it("shows the written summary", () => {
    show({ scenes: [scene({ draft_json: { minutes: 2, summary: "She counts the till." } })] });

    expect(screen.getByText("She counts the till.")).toBeInTheDocument();
  });

  it("falls back to the planned description", () => {
    show({ scenes: [scene({ draft_json: {}, description: "A planned beat." })] });

    expect(screen.getByText("A planned beat.")).toBeInTheDocument();
  });

  it("says a scene is not written yet rather than showing an empty card", () => {
    show({ scenes: [scene({ draft_json: {}, description: null })] });

    expect(screen.getByText("Not written yet")).toBeInTheDocument();
  });

  it("shows interior or exterior", () => {
    // Parsed off the page already; the board is the first place it is shown.
    show({ scenes: [scene({ draft_json: { interior: true } })] });

    expect(screen.getByText("INT")).toBeInTheDocument();
  });

  it("distinguishes exterior from an unknown one", () => {
    show({ scenes: [scene({ draft_json: { interior: false } })] });

    expect(screen.getByText("EXT")).toBeInTheDocument();
  });

  it("shows neither when the draft does not say", () => {
    show({ scenes: [scene({ draft_json: { minutes: 1 } })] });

    expect(screen.queryByText("INT")).not.toBeInTheDocument();
    expect(screen.queryByText("EXT")).not.toBeInTheDocument();
  });

  it("shows time of day and cast size", () => {
    show({ scenes: [scene({
      draft_json: { time_of_day: "DAY", characters: ["MIRA", "BABA"] },
    }) ] });

    expect(screen.getByText("DAY")).toBeInTheDocument();
    expect(screen.getByText("2 cast")).toBeInTheDocument();
  });

  it("names the cast in the tooltip, since the card has no room for it", () => {
    show({ scenes: [scene({ draft_json: { characters: ["MIRA", "BABA"] } })] });

    expect(screen.getByText("2 cast")).toHaveAttribute("title", "MIRA, BABA");
  });

  it("omits the cast chip when nobody is in the scene", () => {
    show({ scenes: [scene({ draft_json: { characters: [] } })] });

    expect(screen.queryByText(/cast/)).not.toBeInTheDocument();
  });

  it("shows written against planned", () => {
    // A scene running well over or under its allocation is the most useful
    // thing an index card can tell a writer.
    show({ scenes: [scene({ time_allocation: 3, draft_json: { minutes: 2 } })] });

    expect(screen.getByText("2:00")).toBeInTheDocument();
    expect(screen.getByText("/ 3:00")).toBeInTheDocument();
  });

  it("shows a dash for an unwritten scene rather than 0:00", () => {
    show({ scenes: [scene({ time_allocation: 3, draft_json: {} })] });

    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("omits the planned side when nothing was planned", () => {
    show({ scenes: [scene({ time_allocation: 0, draft_json: { minutes: 2 } })] });

    expect(screen.queryByText(/^\/ /)).not.toBeInTheDocument();
  });

  it("degrades gracefully on unparseable draft_json", () => {
    show({ scenes: [scene({ draft_json: "{not json", description: "A planned beat." })] });

    expect(screen.getByText("A planned beat.")).toBeInTheDocument();
  });
});

describe("a scene cut from the draft", () => {
  it("is marked rather than presented as live", () => {
    // The row survives because a storyboard frame points at it. Showing it as
    // a normal scene would be a lie about what is in the script.
    show({ scenes: [scene({ draft_json: { removed: true } })] });

    expect(screen.getByText("cut from script")).toBeInTheDocument();
  });

  it("is drawn differently from a live card", () => {
    show({ scenes: [scene({ draft_json: { removed: true } })] });

    expect(card("INT. PASAL - DAY").className).toContain("border-dashed");
  });

  it("shows no page number, since it is not on a page any more", () => {
    show({ scenes: [scene({ draft_json: { removed: true, page: 4 } })] });

    expect(screen.queryByText("p.4")).not.toBeInTheDocument();
  });
});

describe("dragging a card", () => {
  it("moves the scene in the script", () => {
    show();

    fireEvent.dragStart(card("INT. PASAL - DAY"));
    fireEvent.dragOver(card("EXT. BUS - NIGHT"));
    fireEvent.drop(card("EXT. BUS - NIGHT"));

    expect(onMove).toHaveBeenCalledWith(0, 1);
  });

  it("does nothing when a card is dropped on itself", () => {
    show();

    fireEvent.dragStart(card("INT. PASAL - DAY"));
    fireEvent.dragOver(card("INT. PASAL - DAY"));
    fireEvent.drop(card("INT. PASAL - DAY"));

    expect(onMove).not.toHaveBeenCalled();
  });

  it("does nothing when a drag ends over no card at all", () => {
    show();

    fireEvent.dragStart(card("INT. PASAL - DAY"));
    fireEvent.dragEnd(card("INT. PASAL - DAY"));

    expect(onMove).not.toHaveBeenCalled();
  });

  it("commits a drag that ends without a drop", () => {
    show();

    fireEvent.dragStart(card("INT. PASAL - DAY"));
    fireEvent.dragOver(card("EXT. BUS - NIGHT"));
    fireEvent.dragEnd(card("INT. PASAL - DAY"));

    expect(onMove).toHaveBeenCalledWith(0, 1);
  });

  it("survives having no onMove", () => {
    show({ onMove: undefined });

    fireEvent.dragStart(card("INT. PASAL - DAY"));
    fireEvent.dragOver(card("EXT. BUS - NIGHT"));
    fireEvent.drop(card("EXT. BUS - NIGHT"));

    expect(screen.getByText("INT. PASAL - DAY")).toBeInTheDocument();
  });
});

describe("adding a scene", () => {
  const composer = () => screen.getByDisplayValue("INT. LOCATION - DAY");

  it("offers a new scene card", () => {
    show();

    expect(screen.getByText("New scene")).toBeInTheDocument();
  });

  it("composes the slugline in place rather than through a browser prompt", () => {
    // Some embedded browsers refuse window.prompt outright, and no
    // professional tool would ask for a slugline that way regardless.
    show();

    fireEvent.click(screen.getByText("New scene"));

    expect(composer()).toBeInTheDocument();
    expect(screen.getByText("Scene heading")).toBeInTheDocument();
  });

  it("adds an upper-cased, trimmed slugline to act one", () => {
    show();
    fireEvent.click(screen.getByText("New scene"));

    fireEvent.change(composer(), { target: { value: "  ext. rooftop - night  " } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(onAdd).toHaveBeenCalledWith(1, "EXT. ROOFTOP - NIGHT");
  });

  it("submits on Enter", () => {
    show();
    fireEvent.click(screen.getByText("New scene"));
    const input = composer();

    fireEvent.change(input, { target: { value: "EXT. ROOFTOP - NIGHT" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onAdd).toHaveBeenCalledWith(1, "EXT. ROOFTOP - NIGHT");
  });

  it("backs out on Escape", () => {
    show();
    fireEvent.click(screen.getByText("New scene"));

    fireEvent.keyDown(composer(), { key: "Escape" });

    expect(screen.queryByDisplayValue("INT. LOCATION - DAY")).not.toBeInTheDocument();
  });

  it("backs out on Cancel", () => {
    show();
    fireEvent.click(screen.getByText("New scene"));

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onAdd).not.toHaveBeenCalled();
  });

  it("refuses an empty slugline", () => {
    show();
    fireEvent.click(screen.getByText("New scene"));

    fireEvent.change(composer(), { target: { value: "  " } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(onAdd).not.toHaveBeenCalled();
  });

  it("locks the control while an add is in flight", () => {
    show({ adding: "1" });

    expect(screen.getByText("Adding…").closest("button")).toBeDisabled();
  });
});
