import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";

/**
 * The story bible, and its debounced autosave.
 *
 * The autosave is what makes this worth testing. The bible is written in bursts
 * between scenes, so saving per keystroke would be noise and an explicit Save
 * button would lose work when the writer navigates away mid-thought. What sits
 * between those is an 800 ms debounce — and a debounce has exactly two failure
 * modes, both silent. Fire on mount and every editor that opens the panel writes
 * the bible back unchanged. Fail to reset the timer and a burst of typing saves
 * once per keystroke after all.
 *
 * The bible also matters beyond itself: character names typed here feed the
 * editor's type-ahead, and both the bible and its characters are loaded
 * server-side into the AI prompts. A save that quietly fails takes the grounding
 * with it, which is why "Could not save" is a state and not a swallowed error.
 *
 * MECHANICS. `Field` renders its label without `htmlFor`, and the inputs carry
 * no id, so `getByLabelText` finds nothing here — every query below goes through
 * the placeholder or through DOM position. Timers are faked for the debounce.
 */

vi.mock("../services/api", () => ({
  scripts: { saveBible: vi.fn() },
}));

// eslint-disable-next-line import/first
import StoryBible from "./StoryBible";
// eslint-disable-next-line import/first
import { scripts } from "../services/api";

const onChange = vi.fn();

beforeEach(() => {
  scripts.saveBible.mockResolvedValue({});
});

/** Let the debounce elapse and any resulting promise settle. */
const settle = async (ms = 900) => {
  await act(async () => { vi.advanceTimersByTime(ms); });
};

const withFakeTimers = (fn) => async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  try {
    await fn();
  } finally {
    vi.useRealTimers();
  }
};

const logline = () => screen.getByPlaceholderText(/One sentence: who wants what/);

describe("what it starts with", () => {
  it("takes the bible it is given", () => {
    render(<StoryBible scriptId="s1" initial={{
      logline: "A shopkeeper's daughter wants out.", characters: [], locations: [],
    }} />);

    expect(logline()).toHaveValue("A shopkeeper's daughter wants out.");
  });

  it("starts empty when given nothing", () => {
    render(<StoryBible scriptId="s1" />);

    expect(logline()).toHaveValue("");
  });

  it("explains what the character list is for while it is empty", () => {
    render(<StoryBible scriptId="s1" />);

    expect(screen.getByText(/offered by the editor's type-ahead/)).toBeInTheDocument();
  });

  it("keeps want and need as separate questions", () => {
    // Two halves of a character that make an ending land. A single "goal" box
    // collapses them, which is the whole reason these are distinct fields.
    render(<StoryBible scriptId="s1" initial={{
      characters: [{ name: "SANJANA" }], locations: [],
    }} />);

    expect(screen.getByText("Wants")).toBeInTheDocument();
    expect(screen.getByText("Needs")).toBeInTheDocument();
  });
});

describe("the debounced autosave", () => {
  it("does not save on mount", withFakeTimers(async () => {
    // Otherwise every editor that opens the panel writes the bible straight
    // back, and the version history fills with saves nobody made.
    render(<StoryBible scriptId="s1" initial={{ logline: "Existing.", characters: [], locations: [] }} />);

    await settle();

    expect(scripts.saveBible).not.toHaveBeenCalled();
  }));

  it("saves after the writer stops typing", withFakeTimers(async () => {
    render(<StoryBible scriptId="s1" onChange={onChange} />);

    fireEvent.change(logline(), { target: { value: "She wants out." } });
    await settle();

    expect(scripts.saveBible).toHaveBeenCalledWith(
      "s1", expect.objectContaining({ logline: "She wants out." }));
  }));

  it("does not save while the writer is still typing", withFakeTimers(async () => {
    render(<StoryBible scriptId="s1" />);

    fireEvent.change(logline(), { target: { value: "She" } });
    await act(async () => { vi.advanceTimersByTime(400); });

    expect(scripts.saveBible).not.toHaveBeenCalled();
  }));

  it("collapses a burst of typing into one save", withFakeTimers(async () => {
    render(<StoryBible scriptId="s1" />);

    fireEvent.change(logline(), { target: { value: "She" } });
    await act(async () => { vi.advanceTimersByTime(300); });
    fireEvent.change(logline(), { target: { value: "She wants" } });
    await act(async () => { vi.advanceTimersByTime(300); });
    fireEvent.change(logline(), { target: { value: "She wants out." } });
    await settle();

    expect(scripts.saveBible).toHaveBeenCalledTimes(1);
    expect(scripts.saveBible).toHaveBeenCalledWith(
      "s1", expect.objectContaining({ logline: "She wants out." }));
  }));

  it("reports each stage of the save", withFakeTimers(async () => {
    let resolve;
    scripts.saveBible.mockReturnValue(new Promise((r) => { resolve = r; }));
    render(<StoryBible scriptId="s1" />);

    fireEvent.change(logline(), { target: { value: "x" } });
    await settle();
    expect(screen.getByText("Saving…")).toBeInTheDocument();

    await act(async () => { resolve({}); });
    expect(screen.getByText("Saved")).toBeInTheDocument();
  }));

  it("says so when the save fails", withFakeTimers(async () => {
    scripts.saveBible.mockRejectedValue(new Error("offline"));
    render(<StoryBible scriptId="s1" onChange={onChange} />);

    fireEvent.change(logline(), { target: { value: "x" } });
    await settle();

    expect(screen.getByText("Could not save")).toBeInTheDocument();
  }));

  it("tells the editor only about a save that landed", withFakeTimers(async () => {
    // The editor caches the bible for its type-ahead. Telling it about a save
    // that failed would leave the two out of step with no way to notice.
    scripts.saveBible.mockRejectedValue(new Error("offline"));
    render(<StoryBible scriptId="s1" onChange={onChange} />);

    fireEvent.change(logline(), { target: { value: "x" } });
    await settle();

    expect(onChange).not.toHaveBeenCalled();
  }));

  it("hands the saved bible to the editor", withFakeTimers(async () => {
    render(<StoryBible scriptId="s1" onChange={onChange} />);

    fireEvent.change(logline(), { target: { value: "She wants out." } });
    await settle();

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ logline: "She wants out." }));
  }));

  it("survives having no onChange at all", withFakeTimers(async () => {
    render(<StoryBible scriptId="s1" />);

    fireEvent.change(logline(), { target: { value: "x" } });
    await settle();

    expect(screen.getByText("Saved")).toBeInTheDocument();
  }));
});

describe("characters", () => {
  const addOne = () => fireEvent.click(screen.getByRole("button", { name: "+ Add" }));

  it("adds one and opens it", () => {
    render(<StoryBible scriptId="s1" />);

    addOne();

    expect(screen.getByPlaceholderText("SANJANA")).toBeInTheDocument();
  });

  it("shows Unnamed until a name is typed", () => {
    render(<StoryBible scriptId="s1" />);

    addOne();

    expect(screen.getByText("Unnamed")).toBeInTheDocument();
  });

  it("opens the character that was just added, not a stale index", () => {
    // `addCharacter` reads `bible.characters.length` from the closure while
    // updating state functionally. With one character already present the new
    // one is at index 1, and opening index 1 is what the writer expects — they
    // just asked for it.
    render(<StoryBible scriptId="s1" initial={{
      characters: [{ ...{ name: "FIRST" } }], locations: [],
    }} />);

    addOne();

    // The open panel is the new one, so its name field is empty rather than FIRST.
    expect(screen.getByPlaceholderText("SANJANA")).toHaveValue("");
  });

  it("collapses an open character on a second click", () => {
    render(<StoryBible scriptId="s1" initial={{
      characters: [{ name: "SANJANA" }], locations: [],
    }} />);

    fireEvent.click(screen.getByRole("button", { name: /SANJANA/ }));

    expect(screen.queryByPlaceholderText("SANJANA")).not.toBeInTheDocument();
  });

  it("edits a character in place", () => {
    render(<StoryBible scriptId="s1" initial={{
      characters: [{ name: "" }], locations: [],
    }} />);

    fireEvent.change(screen.getByPlaceholderText("SANJANA"), { target: { value: "PRERANA" } });

    expect(screen.getByText("PRERANA")).toBeInTheDocument();
  });

  it("removes the right one", () => {
    render(<StoryBible scriptId="s1" initial={{
      characters: [{ name: "FIRST" }, { name: "SECOND" }], locations: [],
    }} />);

    fireEvent.click(screen.getAllByTitle("Remove character")[0]);

    expect(screen.queryByText("FIRST")).not.toBeInTheDocument();
    expect(screen.getByText("SECOND")).toBeInTheDocument();
  });

  it("saves a character edit like any other change", withFakeTimers(async () => {
    render(<StoryBible scriptId="s1" initial={{ characters: [{ name: "" }], locations: [] }} />);

    fireEvent.change(screen.getByPlaceholderText("SANJANA"), { target: { value: "PRERANA" } });
    await settle();

    expect(scripts.saveBible).toHaveBeenCalledWith("s1", expect.objectContaining({
      characters: [expect.objectContaining({ name: "PRERANA" })],
    }));
  }));
});

describe("locations", () => {
  const field = () => screen.getByPlaceholderText(/CHIYA PASAL, PATAN/);

  it("shows one per line", () => {
    render(<StoryBible scriptId="s1" initial={{
      characters: [], locations: ["CHIYA PASAL", "FAMILY KITCHEN"],
    }} />);

    expect(field()).toHaveValue("CHIYA PASAL\nFAMILY KITCHEN");
  });

  it("stores them back as a list", withFakeTimers(async () => {
    render(<StoryBible scriptId="s1" />);

    fireEvent.change(field(), { target: { value: "CHIYA PASAL\nROOFTOP" } });
    await settle();

    expect(scripts.saveBible).toHaveBeenCalledWith("s1", expect.objectContaining({
      locations: ["CHIYA PASAL", "ROOFTOP"],
    }));
  }));

  it("does not fall over when the bible has no locations key", () => {
    render(<StoryBible scriptId="s1" initial={{ characters: [] }} />);

    expect(field()).toHaveValue("");
  });
});
