import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("../services/api", () => ({
  shorts: { outliers: vi.fn(), addOutlier: vi.fn(), addResult: vi.fn(), results: vi.fn() },
}));

// eslint-disable-next-line import/first
import { shorts } from "../services/api";
// eslint-disable-next-line import/first
import ShortsPanel from "./ShortsPanel";

const MEASURED = {
  id: "o1", platform: "youtube", video_id: "abc123XYZ",
  numbers: { status: "measured", hook_seconds: 3, first_rehook_seconds: 6,
             sentence_length_sigma: 2.4, words_per_second: 2.8, outlier_ratio: 20 },
};
const MISSING = {
  id: "o2", platform: null, video_id: null,
  numbers: { status: "missing", reason: "The transcript carried no timings, so nothing was measured.",
             hook_seconds: null, first_rehook_seconds: null, sentence_length_sigma: null,
             words_per_second: null, outlier_ratio: null },
};

beforeEach(() => {
  Object.values(shorts).forEach((f) => f.mockReset());
  shorts.outliers.mockResolvedValue({ data: { outliers: [] } });
  shorts.results.mockResolvedValue({ data: { results_logged: 0, comparisons: [], min_per_group: 5 } });
});

it("shows an outlier's numbers beside the draft's own", async () => {
  shorts.outliers.mockResolvedValue({ data: { outliers: [MEASURED] } });
  render(<ShortsPanel scriptId="s1" rhythm={{ sentence_length_sigma: 1.2, attention_devices: [9.5] }} />);
  expect(await screen.findByText("youtube · abc123XYZ")).toBeInTheDocument();
  expect(screen.getByText("6s")).toBeInTheDocument();
  expect(screen.getByText(/yours ~9.5s/)).toBeInTheDocument();
  expect(screen.getByText(/yours 1.2/)).toBeInTheDocument();
});

it("says a measurement is missing rather than showing a zero", async () => {
  shorts.outliers.mockResolvedValue({ data: { outliers: [MISSING] } });
  render(<ShortsPanel scriptId="s1" />);
  expect(await screen.findByText(/not measured/)).toBeInTheDocument();
  expect(screen.queryByText("0s")).toBeNull();
  expect(screen.queryByText(/^0$/)).toBeNull();
});

it("sends the transcript once and keeps nothing of it on screen", async () => {
  shorts.addOutlier.mockResolvedValue({ data: MEASURED });
  render(<ShortsPanel scriptId="s1" />);
  fireEvent.click(screen.getByRole("button", { name: "Compare an outlier" }));
  fireEvent.change(screen.getByLabelText("Transcript"), { target: { value: "0:00\nhello there." } });
  fireEvent.click(screen.getByRole("button", { name: "Measure" }));
  await waitFor(() => expect(shorts.addOutlier).toHaveBeenCalledWith("s1",
    expect.objectContaining({ transcript: "0:00\nhello there." })));
  await waitFor(() => expect(screen.queryByLabelText("Transcript")).toBeNull());
});

it("reports a failed save without implying the draft was touched", async () => {
  shorts.addResult.mockRejectedValue({ response: { data: { detail: "Measured, but it could not be saved. Your draft is untouched." } } });
  render(<ShortsPanel scriptId="s1" />);
  fireEvent.click(screen.getByRole("button", { name: "Log how it did" }));
  fireEvent.change(screen.getByLabelText("Views"), { target: { value: "500" } });
  fireEvent.click(screen.getByRole("button", { name: "Save result" }));
  expect(await screen.findByText(/Your draft is untouched/)).toBeInTheDocument();
});

it("says nothing about results below the floor — only how many are logged", async () => {
  shorts.results.mockResolvedValue({ data: { results_logged: 3, comparisons: [], min_per_group: 5 } });
  render(<ShortsPanel scriptId="s1" />);
  expect(await screen.findByText("3 results logged")).toBeInTheDocument();
  expect(screen.queryByLabelText("What your results show")).toBeNull();
});

it("prints the sample size beside every comparison", async () => {
  shorts.results.mockResolvedValue({ data: { results_logged: 11, min_per_group: 5, comparisons: [
    { split: "opens_on_question", label: "Opens on a question",
      with: { n: 5, median_ratio: 3 }, without: { n: 6, median_ratio: 1 } }] } });
  render(<ShortsPanel scriptId="s1" />);
  const item = await screen.findByText(/Opens on a question/);
  expect(item.textContent).toMatch(/n=5/);
  expect(item.textContent).toMatch(/n=6/);
  expect(item.textContent).toMatch(/not a rule/);
});
