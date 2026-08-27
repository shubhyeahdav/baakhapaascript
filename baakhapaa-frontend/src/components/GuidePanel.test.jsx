import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import GuidePanel from "./GuidePanel";
import { GUIDES, guideProgress } from "../utils/guides";

/**
 * The guide exists because the product's own pitch is that it walks a writer
 * through the decisions a blank page does not — and it shipped a blank page
 * with a line of formatting jargon on it. So the tests that matter are: is it
 * reachable at any time, does it teach in the writer's own draft, and does it
 * know when the writer has actually done the thing.
 */

test("every major part of the job has a guide", () => {
  const ids = GUIDES.map((g) => g.id);
  for (const topic of [
    "first-scene",
    "sluglines",
    "action",
    "dialogue",
    "scene-shape",
    "structure",
    "nepali",
    "hooks",
    "notes",
    "finish",
  ]) {
    expect(ids).toContain(topic);
  }
});

test("guides open from a shelf, not a forced sequence", () => {
  render(<GuidePanel content="" />);
  expect(screen.getByText("Write your first scene")).toBeInTheDocument();
  expect(screen.getByText("Hooks for short-form")).toBeInTheDocument();
  expect(screen.getByText("Writing in Nepali")).toBeInTheDocument();
});

test("starting a guide shows its first step", () => {
  render(<GuidePanel content="" />);
  fireEvent.click(screen.getByText("Write your first scene"));
  expect(screen.getByText(/say where we are/i)).toBeInTheDocument();
});

test("a step waits for the draft, not for a Next button", () => {
  render(<GuidePanel content="" />);
  fireEvent.click(screen.getByText("Write your first scene"));
  expect(screen.getByText(/waiting for a slugline/i)).toBeInTheDocument();
});

test("the step completes when the writer actually writes the thing", () => {
  render(<GuidePanel content="INT. CHIYA PASAL - MORNING" />);
  fireEvent.click(screen.getByText("Write your first scene"));
  expect(screen.getByText(/done — a slugline/i)).toBeInTheDocument();
});

test("it advances by itself once the step is satisfied", async () => {
  render(<GuidePanel content="INT. CHIYA PASAL - MORNING" />);
  fireEvent.click(screen.getByText("Write your first scene"));

  // Waiting on Next after the work is already done makes it feel like
  // paperwork.
  await waitFor(
    () => expect(screen.getByText(/show one thing the camera can see/i)).toBeInTheDocument(),
    { timeout: 3000 }
  );
});

test("an example can be put in the script but is never written for you", () => {
  const onInsert = vi.fn();
  render(<GuidePanel content="" onInsert={onInsert} />);
  fireEvent.click(screen.getByText("Write your first scene"));

  fireEvent.click(screen.getByText(/put this in my script/i));
  expect(onInsert).toHaveBeenCalledWith(expect.stringMatching(/^INT\./));
});

test("you can leave a guide and come back to the shelf", () => {
  render(<GuidePanel content="" />);
  fireEvent.click(screen.getByText("Writing in Nepali"));
  fireEvent.click(screen.getByText(/all guides/i));
  expect(screen.getByText("Hooks for short-form")).toBeInTheDocument();
});

describe("progress reads the real draft", () => {
  test("an empty draft satisfies nothing", () => {
    const guide = GUIDES.find((g) => g.id === "first-scene");
    expect(guideProgress(guide, "").done).toBe(0);
  });

  test("a written scene satisfies the whole first-scene guide", () => {
    const guide = GUIDES.find((g) => g.id === "first-scene");
    const draft = [
      "INT. CHIYA PASAL, PATAN - MORNING",
      "",
      "Steam rises. Sanjana wipes the counter.",
      "",
      "SANJANA",
      "Timro result aayo?",
    ].join("\n");
    const progress = guideProgress(guide, draft);
    expect(progress.done).toBe(progress.total);
  });

  test("the Nepali guide notices Devanagari on the page", () => {
    const guide = GUIDES.find((g) => g.id === "nepali");
    expect(guideProgress(guide, "INT. GHAR - DAY").done).toBe(0);
    expect(guideProgress(guide, "नमस्ते").done).toBe(1);
  });
});

/**
 * The Pen in the panel. It is the same character as onboarding and the blank
 * page, and the blank-page prompt hands off to here — so what these pin is
 * that it is present at the handoff and that its mood is read from the draft
 * rather than decorative.
 */
describe("the guide has a face on it", () => {
  test("the shelf carries the Pen, so the handoff from the blank page lands somewhere familiar", () => {
    const { container } = render(<GuidePanel content="" />);
    expect(container.querySelector(".the-pen")).toBeTruthy();
  });

  test("the Pen nudges while a step is unmet and is pleased once the draft meets it", () => {
    const { container, rerender } = render(<GuidePanel content="" />);
    fireEvent.click(screen.getByText("Write your first scene"));
    expect(container.querySelector(".the-pen--nudging")).toBeTruthy();

    rerender(<GuidePanel content="INT. CHIYA PASAL - DAY" />);
    expect(container.querySelector(".the-pen--pleased")).toBeTruthy();
  });

  test("the Pen beside text that already says the same thing is not announced twice", () => {
    // Both placements accompany prose; only onboarding's Pen is the speaker.
    const { container } = render(<GuidePanel content="" />);
    expect(container.querySelector(".the-pen")).toHaveAttribute("aria-hidden", "true");
    expect(screen.queryByRole("img", { name: /The Pen/ })).toBeNull();
  });
});
