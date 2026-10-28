import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";

vi.mock("../services/api", () => ({ scripts: { rhythm: vi.fn() } }));

// eslint-disable-next-line import/first
import { scripts } from "../services/api";
// eslint-disable-next-line import/first
import RhythmMeter, { DEBOUNCE_MS } from "./RhythmMeter";

const MEASURED = {
  word_count: 32, sentence_count: 5, sentence_length_sigma: 1.02,
  monotone_run: { sentences: 4, from_line: 3, to_line: 6 },
  estimated_seconds: 12.8, wpm: 150, attention_devices: [],
  observations: [{ rule: "single_device", message: "Nothing after the opening line asks a question or turns. The only attention device is at 0s." }],
};

async function settle() {
  await act(async () => { vi.advanceTimersByTime(DEBOUNCE_MS + 10); });
  await act(async () => {});
}

beforeEach(() => {
  vi.useFakeTimers();
  scripts.rhythm.mockReset();
});
afterEach(() => vi.useRealTimers());

it("renders nothing at all for an empty draft — not a row of zeros", async () => {
  const { container } = render(<RhythmMeter content="   " language="English" />);
  await settle();
  expect(container).toBeEmptyDOMElement();
  expect(scripts.rhythm).not.toHaveBeenCalled();
});

it("shows no spread for one sentence, rather than perfect monotony", async () => {
  scripts.rhythm.mockResolvedValue({ data: { ...MEASURED, sentence_count: 1,
    sentence_length_sigma: null, monotone_run: null, observations: [] } });
  render(<RhythmMeter content="One line, and only one." language="English" />);
  await settle();
  expect(screen.getByTestId("rhythm-meter")).toBeInTheDocument();
  expect(screen.queryByText(/vary by/)).toBeNull();
  expect(screen.queryByText(/0\.0/)).toBeNull();
});

it("names the flat run by where it is, and goes there", async () => {
  scripts.rhythm.mockResolvedValue({ data: MEASURED });
  const jump = vi.fn();
  render(<RhythmMeter content="draft" language="English" onJumpToLine={jump} />);
  await settle();
  fireEvent.click(screen.getByRole("button", { name: /4 sentences of similar length, from line 3/ }));
  expect(jump).toHaveBeenCalledWith(3);
});

it("reports and never judges — no score, no verdict words", async () => {
  scripts.rhythm.mockResolvedValue({ data: MEASURED });
  render(<RhythmMeter content="draft" language="English" />);
  await settle();
  const text = screen.getByTestId("rhythm-meter").textContent.toLowerCase();
  ["score", "good", "bad", "weak", "poor", "/10", "%"].forEach((w) => expect(text).not.toContain(w));
  expect(screen.getByText(/The only attention device is at 0s/)).toBeInTheDocument();
});

it("waits for the writer to pause before asking", async () => {
  scripts.rhythm.mockResolvedValue({ data: MEASURED });
  const { rerender } = render(<RhythmMeter content="a" language="English" />);
  rerender(<RhythmMeter content="ab" language="English" />);
  rerender(<RhythmMeter content="abc" language="English" />);
  await settle();
  expect(scripts.rhythm).toHaveBeenCalledTimes(1);
  expect(scripts.rhythm).toHaveBeenCalledWith({ text: "abc", language: "English" });
});

it("says nothing when it cannot measure, rather than showing a stale number", async () => {
  scripts.rhythm.mockRejectedValue(new Error("offline"));
  const { container } = render(<RhythmMeter content="draft" language="English" />);
  await settle();
  expect(container).toBeEmptyDOMElement();
});
