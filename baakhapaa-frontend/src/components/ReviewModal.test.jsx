import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";

/**
 * What the review found, before finalizing.
 *
 * The design principle this component exists to hold is that it reports and
 * never blocks. A writer is allowed to finalize a script the tool disagrees
 * with — timing heuristics and act-balance ratios are conventions, not laws,
 * and a tool that holds the door shut on them will be worked around rather than
 * listened to. So both buttons stay live, neither is disabled by a finding, and
 * the copy says out loud that these are checks rather than rules.
 *
 * That is easy to erode: the obvious "improvement" is to disable Finalize while
 * a high-severity finding stands. The tests below are what make that a
 * deliberate change instead of a quiet one.
 */

// eslint-disable-next-line import/first
import ReviewModal from "./ReviewModal";

const finding = (over = {}) => ({
  rule: "scene_timing", severity: "medium",
  message: "Scene 4 runs three times its allotted time.",
  detail: "Allotted 1:00, written 3:12.", ...over,
});

const onKeepWriting = vi.fn();
const onFinalizeAnyway = vi.fn();

const show = (review) =>
  render(
    <ReviewModal review={review} onKeepWriting={onKeepWriting}
                 onFinalizeAnyway={onFinalizeAnyway} />
  );

it("renders nothing at all without a review", () => {
  const { container } = show(null);

  expect(container).toBeEmptyDOMElement();
});

it("lists what was found", () => {
  show({ counts: { high: 0 }, findings: [finding()] });

  expect(screen.getByText("Scene 4 runs three times its allotted time."))
    .toBeInTheDocument();
  expect(screen.getByText("Allotted 1:00, written 3:12.")).toBeInTheDocument();
});

it("omits the detail line when there is none", () => {
  show({ counts: { high: 0 }, findings: [finding({ detail: null })] });

  expect(screen.getByText("Scene 4 runs three times its allotted time."))
    .toBeInTheDocument();
});

it("sharpens the heading when something serious was found", () => {
  show({ counts: { high: 2 }, findings: [finding({ severity: "high" })] });

  expect(screen.getByText("Worth a look before you finalize")).toBeInTheDocument();
});

it("softens it when nothing was", () => {
  show({ counts: { high: 0 }, findings: [finding()] });

  expect(screen.getByText("A few things to consider")).toBeInTheDocument();
});

it("treats a missing counts object as nothing serious", () => {
  show({ findings: [finding()] });

  expect(screen.getByText("A few things to consider")).toBeInTheDocument();
});

it("opens on a review with no findings at all", () => {
  show({ counts: { high: 0 } });

  expect(screen.getByRole("button", { name: "Finalize anyway" })).toBeInTheDocument();
});

it("says plainly that these are checks and not rules", () => {
  show({ counts: { high: 0 }, findings: [finding()] });

  expect(screen.getByText(/checks, not\s+rules/)).toBeInTheDocument();
});

it("distinguishes severities visually", () => {
  const { container } = show({
    counts: { high: 1 },
    findings: [
      finding({ severity: "high", message: "High one" }),
      finding({ severity: "medium", message: "Medium one" }),
      finding({ severity: "low", message: "Low one" }),
    ],
  });

  expect(container.querySelector(".bg-red-400")).toBeTruthy();
  expect(container.querySelector(".bg-amber-400")).toBeTruthy();
  expect(container.querySelector(".bg-sky-400")).toBeTruthy();
});

it("lets the writer go back to work", () => {
  show({ counts: { high: 0 }, findings: [finding()] });

  fireEvent.click(screen.getByRole("button", { name: "Keep writing" }));

  expect(onKeepWriting).toHaveBeenCalled();
});

it("lets the writer finalize anyway", () => {
  show({ counts: { high: 0 }, findings: [finding()] });

  fireEvent.click(screen.getByRole("button", { name: "Finalize anyway" }));

  expect(onFinalizeAnyway).toHaveBeenCalled();
});

it("never blocks finalizing, however bad the findings are", () => {
  // The principle. Disabling this button while a high-severity finding stands
  // is the obvious "improvement" and it is the wrong one — a tool that holds
  // the door shut on a convention gets worked around, not listened to.
  show({
    counts: { high: 5 },
    findings: [
      finding({ severity: "high", message: "Act one is twice its share." }),
      finding({ severity: "high", message: "Two characters are near-duplicates." }),
    ],
  });

  const finalize = screen.getByRole("button", { name: "Finalize anyway" });
  expect(finalize).toBeEnabled();

  fireEvent.click(finalize);
  expect(onFinalizeAnyway).toHaveBeenCalled();
});
