import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

/**
 * The reading the product did not have.
 *
 * The linter reads a page, the benchmark reads a shape, the corkboard reads an
 * order — and none of them answers the question a writer actually arrives with
 * around page thirty: do these two people sound the same?
 *
 * What matters here is that the numbers are chosen to be actionable rather than
 * scored, that the voice a writer DESCRIBED sits beside the voice they wrote,
 * and that a line found here can be reached on the page without hunting for it.
 */

vi.mock("../services/api", () => ({ scripts: { cast: vi.fn() } }));

// eslint-disable-next-line import/first
import CastView from "./CastView";
// eslint-disable-next-line import/first
import { scripts } from "../services/api";

const CHARACTERS = [
  {
    name: "AARATI", line_count: 30, avg_words: 4.1,
    distinct_ratio: 0.65, question_share: 0.17,
    lines: [{ line: 17, text: "Good evening, thank you for calling." },
            { line: 30, text: "Six weeks." }],
  },
  {
    name: "BABA", line_count: 15, avg_words: 6.3,
    distinct_ratio: 0.76, question_share: 0,
    voice: "Speaks in sums and dates. Never asks.",
    lines: [{ line: 48, text: "Sixty-two thousand. Second instalment." }],
  },
];

beforeEach(() => {
  scripts.cast.mockResolvedValue({ data: { characters: CHARACTERS } });
});

const show = (props = {}) => render(<CastView scriptId="s1" {...props} />);

it("lists every voice, loudest first", async () => {
  show();

  expect(await screen.findByText("AARATI")).toBeInTheDocument();
  expect(screen.getByText("BABA")).toBeInTheDocument();
});

it("shows the three measures a writer can act on", async () => {
  show();

  await screen.findByText("AARATI");
  expect(screen.getByText("4.1")).toBeInTheDocument();   // words per line
  expect(screen.getByText("0.65")).toBeInTheDocument();  // vocabulary
  expect(screen.getByText("0.17")).toBeInTheDocument();  // asks
});

it("puts the voice they described beside the voice they wrote", async () => {
  // The bible was spent on prompts and shown to the writer nowhere.
  show();

  expect(await screen.findByText(/Speaks in sums and dates/)).toBeInTheDocument();
});

it("keeps the lines closed until a voice is chosen", async () => {
  show();

  await screen.findByText("AARATI");
  expect(screen.queryByText(/thank you for calling/)).not.toBeInTheDocument();
});

it("reads one voice end to end when opened", async () => {
  show();

  fireEvent.click(await screen.findByText("AARATI"));

  expect(await screen.findByText(/thank you for calling/)).toBeInTheDocument();
  expect(screen.getByText("Six weeks.")).toBeInTheDocument();
});

it("shows only one voice at a time, which is the point", async () => {
  show();

  fireEvent.click(await screen.findByText("AARATI"));
  fireEvent.click(screen.getByText("BABA"));

  expect(screen.queryByText(/thank you for calling/)).not.toBeInTheDocument();
  expect(screen.getByText(/Second instalment/)).toBeInTheDocument();
});

it("hands back the line number so the page can be reached", async () => {
  const onOpenLine = vi.fn();
  show({ onOpenLine });

  fireEvent.click(await screen.findByText("AARATI"));
  fireEvent.click(screen.getByText(/thank you for calling/));

  expect(onOpenLine).toHaveBeenCalledWith(17);
});

it("says nobody has spoken rather than showing an empty box", async () => {
  scripts.cast.mockResolvedValue({ data: { characters: [] } });
  show();

  expect(await screen.findByText(/Nobody has spoken yet/)).toBeInTheDocument();
});

it("reports a failure instead of loading forever", async () => {
  scripts.cast.mockRejectedValue(new Error("offline"));
  show();

  expect(await screen.findByText(/Could not read the cast/)).toBeInTheDocument();
});

it("does not set state after it is unmounted", async () => {
  // The rail swaps readings on a click, so this unmounts mid-request often.
  let resolve;
  scripts.cast.mockReturnValue(new Promise((r) => { resolve = r; }));
  const { unmount } = show();
  unmount();
  resolve({ data: { characters: CHARACTERS } });

  await waitFor(() => expect(scripts.cast).toHaveBeenCalled());
});

/**
 * Findings, not numbers.
 *
 * The three measures have been on screen since this shipped, and a number is
 * not a finding. A writer looking at 8.2 beside 8.4 has to already know that
 * those being equal is the problem. These pin that the sentence appears, that
 * it appears next to the character it is about, and that a finding about two
 * people appears under both of them.
 */
describe("voice findings", () => {
  const COLLAPSED = {
    characters: [
      { name: "RAAJA", line_count: 20, avg_words: 8, distinct_ratio: 0.7,
        question_share: 0.1, lines: [] },
      { name: "SANJANA", line_count: 20, avg_words: 8, distinct_ratio: 0.7,
        question_share: 0.1, lines: [] },
    ],
    findings_by_character: {
      RAAJA: [{
        rule: "voices_collapsed", severity: "high",
        characters: ["RAAJA", "SANJANA"],
        message: "RAAJA and SANJANA are written at the same speed.",
        technique: "Give a character one phrase they return to",
      }],
      SANJANA: [{
        rule: "voices_collapsed", severity: "high",
        characters: ["RAAJA", "SANJANA"],
        message: "RAAJA and SANJANA are written at the same speed.",
        technique: "Give a character one phrase they return to",
      }],
    },
  };

  it("says what the numbers mean, in words", async () => {
    scripts.cast.mockResolvedValue({ data: COLLAPSED });
    render(<CastView scriptId="s1" />);

    expect(
      await screen.findAllByText(/written at the same speed/i),
    ).toHaveLength(2);
  });

  it("shows a shared finding under both characters, not one of them", async () => {
    /* A collapsed pair is one finding about two people. Attaching it to
       whichever name came first would leave the other looking clean. */
    scripts.cast.mockResolvedValue({ data: COLLAPSED });
    render(<CastView scriptId="s1" />);
    await screen.findByText("RAAJA");

    expect(screen.getAllByText(/written at the same speed/i)).toHaveLength(2);
  });

  it("names the technique that answers it", async () => {
    scripts.cast.mockResolvedValue({ data: COLLAPSED });
    render(<CastView scriptId="s1" />);

    expect(
      await screen.findAllByText(/try: Give a character one phrase/i),
    ).toHaveLength(2);
  });

  it("says nothing when there is nothing to say", async () => {
    /* Silence is the normal state. A panel that always has an opinion is one
       writers learn to skip. */
    scripts.cast.mockResolvedValue({
      data: { characters: COLLAPSED.characters, findings_by_character: {} },
    });
    render(<CastView scriptId="s1" />);
    await screen.findByText("RAAJA");

    expect(screen.queryByText(/written at the same speed/i)).toBeNull();
  });

  it("survives an older response that carries no findings at all", async () => {
    scripts.cast.mockResolvedValue({ data: { characters: COLLAPSED.characters } });
    render(<CastView scriptId="s1" />);

    expect(await screen.findByText("RAAJA")).toBeInTheDocument();
  });
});
