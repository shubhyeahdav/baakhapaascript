import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import CoveragePanel from "./CoveragePanel";
import { scripts } from "../services/api";

jest.mock("../services/api", () => ({ scripts: { coverage: jest.fn() } }));

const REPORT = {
  title: "Chiya Pasal",
  premise: { logline: "A girl waits for a result.", dramatic_question: "", theme: "" },
  runtime: { pages: 12.4, minutes: 12.4, planned_minutes: 15, scenes: 9, speaking_characters: 4 },
  structure: { findings: [], counts: { high: 1, medium: 2, low: 0 } },
  craft: { total: 5, counts: {}, by_confidence: { mechanical: 2, convention: 1, judgement: 2 } },
  shape: [{ metric: "interiors", value: 0.95, reading: "Almost entirely interior. Cheap to shoot." }],
  comparison: { cohort_size: 42, notes: [{ metric: "scene_count", percentile: 0.8, message: "Longer scenes than most." }] },
  shape_ready: true,
  next_steps: [{ from: "craft", note: "Line 12: the camera cannot photograph a realisation." }],
  no_verdict: "This is a measurement, not a judgement.",
};

beforeEach(() => jest.clearAllMocks());

test("it does not run until asked", () => {
  // A report that reappears on every open reads as a score that keeps
  // changing, and a writer mid-scene does not need a verdict on the script.
  render(<CoveragePanel scriptId="s1" />);
  expect(scripts.coverage).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: /read my draft/i })).toBeInTheDocument();
});

test("it says it is free before asking you to run it", () => {
  render(<CoveragePanel scriptId="s1" />);
  expect(screen.getByText(/uses no AI/i)).toBeInTheDocument();
});

test("running it shows the report", async () => {
  scripts.coverage.mockResolvedValue({ data: REPORT });
  render(<CoveragePanel scriptId="s1" />);

  fireEvent.click(screen.getByRole("button", { name: /read my draft/i }));

  expect(await screen.findByText("Chiya Pasal")).toBeInTheDocument();
  expect(screen.getByText("A girl waits for a result.")).toBeInTheDocument();
});

test("a missing logline is named as the fastest thing to fix", async () => {
  scripts.coverage.mockResolvedValue({
    data: { ...REPORT, premise: { logline: "", dramatic_question: "", theme: "" } },
  });
  render(<CoveragePanel scriptId="s1" />);
  fireEvent.click(screen.getByRole("button", { name: /read my draft/i }));

  expect(await screen.findByText(/no logline yet/i)).toBeInTheDocument();
});

test("craft notes are split by how arguable they are", async () => {
  // "A camera cannot photograph this" and "I read this as on the nose" must
  // not arrive wearing the same authority.
  scripts.coverage.mockResolvedValue({ data: REPORT });
  render(<CoveragePanel scriptId="s1" />);
  fireEvent.click(screen.getByRole("button", { name: /read my draft/i }));

  expect(await screen.findByText(/cannot be filmed/i)).toBeInTheDocument();
  expect(screen.getByText(/a reading/i)).toBeInTheDocument();
});

test("a shape note shows the reading, not just the number", async () => {
  scripts.coverage.mockResolvedValue({ data: REPORT });
  render(<CoveragePanel scriptId="s1" />);
  fireEvent.click(screen.getByRole("button", { name: /read my draft/i }));

  expect(await screen.findByText(/almost entirely interior/i)).toBeInTheDocument();
});

test("a short draft is told why there is no comparison yet", async () => {
  scripts.coverage.mockResolvedValue({
    data: { ...REPORT, comparison: null, shape_ready: false },
  });
  render(<CoveragePanel scriptId="s1" />);
  fireEvent.click(screen.getByRole("button", { name: /read my draft/i }));

  expect(await screen.findByText(/opens once there are eight scenes/i)).toBeInTheDocument();
});

test("the report says it is not a verdict", async () => {
  // Every competing tool's coverage ends in RECOMMEND or PASS, so a reader
  // will look for one here.
  scripts.coverage.mockResolvedValue({ data: REPORT });
  render(<CoveragePanel scriptId="s1" />);
  fireEvent.click(screen.getByRole("button", { name: /read my draft/i }));

  expect(await screen.findByText(/measurement, not a judgement/i)).toBeInTheDocument();
});

test("a failure is announced rather than left blank", async () => {
  scripts.coverage.mockRejectedValue({ response: { status: 500, data: {} } });
  render(<CoveragePanel scriptId="s1" />);
  fireEvent.click(screen.getByRole("button", { name: /read my draft/i }));

  expect(await screen.findByRole("alert")).toBeInTheDocument();
});
