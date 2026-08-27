import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

/**
 * The storyboard workspace (proposal FR09).
 *
 * All four of FR09's controls — regenerate, shot-type override, camera notes,
 * reorder — had backend routes from the first storyboard commit and nothing
 * called them for months. The board was a read-only grid of "Frame 1 · Wide
 * Shot" with no way to tell which scene a frame belonged to, which is also why
 * reordering was meaningless. These tests exist so all four stay wired.
 *
 * Two behaviours carry real weight. The scene label is what lets a board be
 * matched back to the script, on set or anywhere else, so it must fall back
 * through slugline → title → location rather than ever rendering blank.
 *
 * And camera notes commit on blur. Saving each keystroke would be a request per
 * character; saving only on an explicit button is how notes get lost when
 * somebody clicks away. The blur handler also has to stay quiet when nothing
 * changed, or every click through the board writes every note back.
 */

const mockNavigate = vi.fn();
vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
  useParams: () => ({ id: "s1" }),
}));

vi.mock("../services/api", () => ({
  storyboard: {
    getAll: vi.fn(), generate: vi.fn(), shotTypes: vi.fn(),
    update: vi.fn(), regenerate: vi.fn(),
  },
}));

// eslint-disable-next-line import/first
import StoryboardView from "./StoryboardView";
// eslint-disable-next-line import/first
import { storyboard } from "../services/api";

const frame = (over = {}) => ({
  id: "f1", order_index: 0, shot_type: "Wide Shot", camera_notes: "",
  image_url: "https://placehold.co/800x450/png",
  scene: { slugline: "INT. PASAL - DAY", act_number: 1, characters: ["MIRA"] },
  ...over,
});

const FRAMES = [
  frame({ id: "f1", order_index: 0 }),
  frame({ id: "f2", order_index: 1, scene: { slugline: "EXT. BUS - NIGHT", act_number: 2 } }),
];

beforeEach(() => {
  storyboard.getAll.mockResolvedValue({ data: FRAMES });
  storyboard.shotTypes.mockResolvedValue({ data: { shot_types: ["Wide Shot", "Close Up"] } });
  storyboard.generate.mockResolvedValue({});
  storyboard.update.mockImplementation((id, patch) => Promise.resolve({ data: patch }));
  storyboard.regenerate.mockResolvedValue({ data: { image_url: "https://new/png" } });
});

const ready = () => screen.findByText("INT. PASAL - DAY");

describe("an empty board", () => {
  beforeEach(() => { storyboard.getAll.mockResolvedValue({ data: [] }); });

  it("explains where frames come from", async () => {
    render(<StoryboardView />);

    expect(await screen.findByText("No storyboard frames yet")).toBeInTheDocument();
    expect(screen.getByText(/write a scene heading \(INT.\/EXT.\)/)).toBeInTheDocument();
  });

  it("offers to generate", async () => {
    render(<StoryboardView />);
    await screen.findByText("No storyboard frames yet");

    fireEvent.click(screen.getAllByRole("button", { name: /Generate Storyboard/ })[0]);

    await waitFor(() => expect(storyboard.generate).toHaveBeenCalledWith("s1"));
  });

  it("refetches after generating, so frames arrive with their scene attached", async () => {
    render(<StoryboardView />);
    await screen.findByText("No storyboard frames yet");

    fireEvent.click(screen.getAllByRole("button", { name: /Generate Storyboard/ })[0]);

    await waitFor(() => expect(storyboard.getAll).toHaveBeenCalledTimes(2));
  });

  it("reports why generation failed", async () => {
    storyboard.generate.mockRejectedValue({
      response: { data: { detail: "Storyboard generation is a Pro feature." } },
    });
    render(<StoryboardView />);
    await screen.findByText("No storyboard frames yet");

    fireEvent.click(screen.getAllByRole("button", { name: /Generate Storyboard/ })[0]);

    expect(await screen.findByText("Storyboard generation is a Pro feature."))
      .toBeInTheDocument();
  });

  it("lets the error be dismissed", async () => {
    storyboard.generate.mockRejectedValue(new Error("offline"));
    render(<StoryboardView />);
    await screen.findByText("No storyboard frames yet");
    fireEvent.click(screen.getAllByRole("button", { name: /Generate Storyboard/ })[0]);
    await screen.findByText("Storyboard generation failed.");

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));

    expect(screen.queryByText("Storyboard generation failed.")).not.toBeInTheDocument();
  });

  it("shows an empty board rather than an error when the fetch fails", async () => {
    storyboard.getAll.mockRejectedValue(new Error("offline"));
    render(<StoryboardView />);

    expect(await screen.findByText("No storyboard frames yet")).toBeInTheDocument();
  });
});

describe("a board with frames", () => {
  it("offers to redraw the whole board rather than generate it", async () => {
    render(<StoryboardView />);
    await ready();

    expect(screen.getByRole("button", { name: /Regenerate Board/ })).toBeInTheDocument();
  });

  it("names the scene each frame belongs to", async () => {
    // Without this the board cannot be matched back to the script.
    render(<StoryboardView />);

    expect(await ready()).toBeInTheDocument();
    expect(screen.getByText("EXT. BUS - NIGHT")).toBeInTheDocument();
  });

  it("falls back through title and location before giving up", async () => {
    storyboard.getAll.mockResolvedValue({ data: [
      frame({ id: "a", scene: { title: "The argument" } }),
      frame({ id: "b", scene: { location: "CHIYA PASAL" } }),
      frame({ id: "c", scene: {} }),
    ] });
    render(<StoryboardView />);

    expect(await screen.findByText("The argument")).toBeInTheDocument();
    expect(screen.getByText("CHIYA PASAL")).toBeInTheDocument();
    expect(screen.getByText("Unassigned scene")).toBeInTheDocument();
  });

  it("shows the act and the cast", async () => {
    render(<StoryboardView />);
    await ready();

    expect(screen.getByText("Act 1")).toBeInTheDocument();
    expect(screen.getByText("MIRA")).toBeInTheDocument();
  });

  it("says when a frame has no image, which is normal for an expired board", async () => {
    // DALL-E URLs expire after about an hour.
    storyboard.getAll.mockResolvedValue({ data: [frame({ image_url: null })] });
    render(<StoryboardView />);

    expect(await screen.findByText("No Frame Image")).toBeInTheDocument();
  });

  it("goes back to the script", async () => {
    render(<StoryboardView />);
    await ready();

    fireEvent.click(screen.getByRole("button", { name: /Back to Script/ }));

    expect(mockNavigate).toHaveBeenCalledWith(-1);
  });
});

describe("shot type", () => {
  it("offers the server's list", async () => {
    render(<StoryboardView />);
    await ready();

    const select = screen.getByLabelText("Shot type for frame 1");
    expect(Array.from(select.options).map((o) => o.value))
      .toEqual(["Wide Shot", "Close Up"]);
  });

  it("falls back to a built-in list when the server will not say", async () => {
    storyboard.shotTypes.mockRejectedValue(new Error("offline"));
    render(<StoryboardView />);
    await ready();

    expect(screen.getByLabelText("Shot type for frame 1").options.length)
      .toBeGreaterThan(5);
  });

  it("keeps a frame's current shot type even if it is off the list", async () => {
    // Otherwise the select silently shows a different shot than the frame has.
    storyboard.getAll.mockResolvedValue({ data: [frame({ shot_type: "Dutch Angle" })] });
    render(<StoryboardView />);
    await ready();

    expect(Array.from(screen.getByLabelText("Shot type for frame 1").options)
      .map((o) => o.value)).toContain("Dutch Angle");
  });

  it("saves an override", async () => {
    render(<StoryboardView />);
    await ready();

    fireEvent.change(screen.getByLabelText("Shot type for frame 1"),
                     { target: { value: "Close Up" } });

    await waitFor(() =>
      expect(storyboard.update).toHaveBeenCalledWith("f1", { shot_type: "Close Up" }));
  });

  it("reports a refused change", async () => {
    storyboard.update.mockRejectedValue({
      response: { data: { detail: "This script is finalized." } },
    });
    render(<StoryboardView />);
    await ready();

    fireEvent.change(screen.getByLabelText("Shot type for frame 1"),
                     { target: { value: "Close Up" } });

    expect(await screen.findByText("This script is finalized.")).toBeInTheDocument();
  });
});

describe("camera notes", () => {
  const notes = () => screen.getByLabelText("Camera notes for frame 1");

  it("commits on blur, not on every keystroke", async () => {
    // A request per character on one side, notes lost on a click-away on the
    // other. Blur is the middle.
    render(<StoryboardView />);
    await ready();

    fireEvent.change(notes(), { target: { value: "Push in slowly." } });
    expect(storyboard.update).not.toHaveBeenCalled();

    fireEvent.blur(notes());

    await waitFor(() =>
      expect(storyboard.update).toHaveBeenCalledWith("f1", { camera_notes: "Push in slowly." }));
  });

  it("writes nothing when the note was never touched", async () => {
    // Otherwise clicking through the board rewrites every note it passes.
    render(<StoryboardView />);
    await ready();

    fireEvent.blur(notes());

    expect(storyboard.update).not.toHaveBeenCalled();
  });

  it("writes nothing when the note is unchanged apart from whitespace", async () => {
    storyboard.getAll.mockResolvedValue({ data: [frame({ camera_notes: "Push in." })] });
    render(<StoryboardView />);
    await ready();

    fireEvent.change(notes(), { target: { value: "  Push in.  " } });
    fireEvent.blur(notes());

    expect(storyboard.update).not.toHaveBeenCalled();
  });

  it("shows the note the server already has", async () => {
    storyboard.getAll.mockResolvedValue({ data: [frame({ camera_notes: "Handheld." })] });
    render(<StoryboardView />);
    await ready();

    expect(notes()).toHaveValue("Handheld.");
  });
});

describe("reordering", () => {
  it("cannot move the first frame earlier or the last later", async () => {
    render(<StoryboardView />);
    await ready();

    expect(screen.getByLabelText("Move frame 1 earlier")).toBeDisabled();
    expect(screen.getByLabelText("Move frame 2 later")).toBeDisabled();
  });

  it("swaps two frames' order indices", async () => {
    render(<StoryboardView />);
    await ready();

    fireEvent.click(screen.getByLabelText("Move frame 1 later"));

    await waitFor(() => expect(storyboard.update).toHaveBeenCalledTimes(2));
    expect(storyboard.update).toHaveBeenNthCalledWith(1, "f1", { order_index: 1 });
    expect(storyboard.update).toHaveBeenNthCalledWith(2, "f2", { order_index: 0 });
  });

  it("refetches after a swap, rather than trusting a half-applied move", async () => {
    render(<StoryboardView />);
    await ready();

    fireEvent.click(screen.getByLabelText("Move frame 1 later"));

    await waitFor(() => expect(storyboard.getAll).toHaveBeenCalledTimes(2));
  });

  it("puts the board back in step with the server when a swap half-fails", async () => {
    // The second write is the dangerous one: one frame has already moved.
    storyboard.update
      .mockResolvedValueOnce({ data: {} })
      .mockRejectedValueOnce({ response: { data: { detail: "Could not reorder the frames." } } });
    render(<StoryboardView />);
    await ready();

    fireEvent.click(screen.getByLabelText("Move frame 1 later"));

    expect(await screen.findByText("Could not reorder the frames.")).toBeInTheDocument();
    await waitFor(() => expect(storyboard.getAll).toHaveBeenCalledTimes(2));
  });
});

describe("redrawing one frame", () => {
  it("regenerates with the frame's current shot type", async () => {
    render(<StoryboardView />);
    await ready();

    fireEvent.click(screen.getAllByRole("button", { name: /Redraw/ })[0]);

    await waitFor(() =>
      expect(storyboard.regenerate).toHaveBeenCalledWith("f1", { shotType: "Wide Shot" }));
  });

  it("folds the new image into the board", async () => {
    render(<StoryboardView />);
    await ready();

    fireEvent.click(screen.getAllByRole("button", { name: /Redraw/ })[0]);

    await waitFor(() =>
      expect(screen.getByAltText("Frame 1")).toHaveAttribute("src", "https://new/png"));
  });

  it("locks that frame while it works", async () => {
    storyboard.regenerate.mockReturnValue(new Promise(() => {}));
    render(<StoryboardView />);
    await ready();

    fireEvent.click(screen.getAllByRole("button", { name: /Redraw/ })[0]);

    expect(await screen.findByRole("button", { name: "Working…" })).toBeDisabled();
  });

  it("reports a failed redraw", async () => {
    storyboard.regenerate.mockRejectedValue({
      response: { data: { detail: "Image generation is unavailable." } },
    });
    render(<StoryboardView />);
    await ready();

    fireEvent.click(screen.getAllByRole("button", { name: /Redraw/ })[0]);

    expect(await screen.findByText("Image generation is unavailable.")).toBeInTheDocument();
  });
});
