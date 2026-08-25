import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import ErrorBoundary from "./ErrorBoundary";
import { saveRescue } from "../utils/draftRescue";

/**
 * The failure being covered: React unmounts the entire tree when a render
 * throws with no boundary above it. That showed a white page — and the draft
 * the writer was typing was still unsaved inside the component that died.
 */

function Boom() {
  throw new Error("render exploded");
}

let consoleError;
beforeEach(() => {
  window.localStorage.clear();
  // React logs the caught error itself; silence it so a passing run is readable.
  consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => consoleError.mockRestore());

test("renders its children when nothing throws", () => {
  render(
    <ErrorBoundary>
      <p>the editor</p>
    </ErrorBoundary>
  );
  expect(screen.getByText("the editor")).toBeInTheDocument();
});

test("a thrown render shows a recovery screen instead of a blank page", () => {
  render(
    <ErrorBoundary>
      <Boom />
    </ErrorBoundary>
  );
  expect(screen.getByText(/something broke/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /reload the page/i })).toBeInTheDocument();
});

test("the writer's unsaved draft survives the crash and is offered back", () => {
  saveRescue("42", "INT. CHIYA PASAL - MORNING\n\nSteam rises.");
  render(
    <ErrorBoundary>
      <Boom />
    </ErrorBoundary>
  );
  expect(screen.getByText(/recovered your draft/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /download my draft/i })).toBeInTheDocument();
});

test("says so plainly when there is no draft to recover", () => {
  render(
    <ErrorBoundary>
      <Boom />
    </ErrorBoundary>
  );
  expect(screen.getByText(/no unsaved draft was found/i)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /download my draft/i })).not.toBeInTheDocument();
});

test("copying the recovered draft puts the real text on the clipboard", async () => {
  const writeText = jest.fn().mockResolvedValue(undefined);
  Object.assign(navigator, { clipboard: { writeText } });
  saveRescue("7", "FADE IN:");

  render(
    <ErrorBoundary>
      <Boom />
    </ErrorBoundary>
  );
  fireEvent.click(screen.getByRole("button", { name: /copy to clipboard/i }));
  expect(writeText).toHaveBeenCalledWith("FADE IN:");
});
