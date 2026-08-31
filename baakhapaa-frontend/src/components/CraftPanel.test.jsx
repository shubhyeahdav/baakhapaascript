import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

/**
 * The free tier's craft feedback: deterministic lint flags plus a corpus
 * benchmark. Neither costs an AI call, which is what lets it exist on the free
 * plan at all.
 *
 * The behaviour worth defending hardest is the confidence badge. "The camera
 * cannot show this" and "I read this as on the nose" must not arrive wearing the
 * same authority — writing is subjective, and a tool that pretends otherwise
 * gets switched off by the writers worth keeping. Severity says what a problem
 * costs; confidence says how sure the rule is that it *is* one. Both are shown,
 * and a flag with no confidence shows no badge rather than defaulting to the
 * most certain one.
 *
 * Second: the benchmark's not-ready state is a feature, not a placeholder. It
 * says when the report opens rather than inventing a percentile from two scenes,
 * which is the honest thing to do and the thing most likely to be "improved"
 * away.
 *
 * Third: it runs once on open and then only on request. Feedback that reshuffles
 * while you type reads as noise, and a writer mid-sentence is the worst possible
 * moment to be told the sentence is wrong.
 */

vi.mock("../services/api", () => ({
  scripts: { lint: vi.fn(), benchmark: vi.fn() },
  learn: { forRule: vi.fn() },
}));

// eslint-disable-next-line import/first
import CraftPanel from "./CraftPanel";
// eslint-disable-next-line import/first
import { scripts, learn } from "../services/api";

const flag = (over = {}) => ({
  rule: "on_the_nose", line: 12, severity: "medium", confidence: "judgement",
  message: "This line states the feeling instead of showing it.", ...over,
});

const EMPTY_LINT = { by_craft_level: {}, counts: {} };

beforeEach(() => {
  scripts.lint.mockResolvedValue({ data: EMPTY_LINT });
  scripts.benchmark.mockResolvedValue({ data: null });
  learn.forRule.mockResolvedValue({
    data: { technique: "Show, don't tell", concept: "Let the behaviour carry it." },
  });
});

const show = (props = {}) =>
  render(<CraftPanel content="INT. PASAL - DAY" genre="Drama" tone="Emotional" {...props} />);

describe("when it runs", () => {
  it("checks the draft once as soon as it opens", async () => {
    show();

    await waitFor(() => expect(scripts.lint).toHaveBeenCalledTimes(1));
    expect(scripts.benchmark).toHaveBeenCalledTimes(1);
  });

  it("sends the draft with its genre and tone", async () => {
    show();

    await waitFor(() => expect(scripts.lint).toHaveBeenCalledWith({
      scene_text: "INT. PASAL - DAY", genre: "Drama", tone: "Emotional",
    }));
  });

  it("sends an empty string rather than undefined for a blank draft", async () => {
    show({ content: null });

    await waitFor(() => expect(scripts.lint).toHaveBeenCalledWith(
      expect.objectContaining({ scene_text: "" })));
  });

  it("does not re-run while the writer types", async () => {
    // Feedback that reshuffles mid-sentence reads as noise.
    const { rerender } = show();
    await waitFor(() => expect(scripts.lint).toHaveBeenCalledTimes(1));

    rerender(<CraftPanel content="INT. PASAL - DAY\n\nShe waits." genre="Drama" tone="Emotional" />);

    expect(scripts.lint).toHaveBeenCalledTimes(1);
  });

  it("re-runs on request", async () => {
    show();
    await waitFor(() => expect(scripts.lint).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: /Re-check/ }));

    await waitFor(() => expect(scripts.lint).toHaveBeenCalledTimes(2));
  });

  it("shows a skeleton on the first read only", async () => {
    scripts.lint.mockReturnValue(new Promise(() => {}));
    const { container } = show();

    await waitFor(() => expect(container.querySelectorAll(".animate-pulse").length).toBe(3));
  });

  it("says it is reading and locks the button", async () => {
    scripts.lint.mockReturnValue(new Promise(() => {}));
    show();

    expect(await screen.findByRole("button", { name: "Reading…" })).toBeDisabled();
  });

  it("reports why the check failed", async () => {
    scripts.lint.mockRejectedValue({
      response: { data: { detail: "This script is too long to analyse." } },
    });
    show();

    expect(await screen.findByText("This script is too long to analyse."))
      .toBeInTheDocument();
  });

  it("has a message of its own when the server offers none", async () => {
    scripts.lint.mockRejectedValue(new Error("offline"));
    show();

    expect(await screen.findByText("Could not analyse the draft.")).toBeInTheDocument();
  });
});

describe("the flags", () => {
  const withFlags = (byLevel, counts = {}) => {
    scripts.lint.mockResolvedValue({ data: { by_craft_level: byLevel, counts } });
    return show();
  };

  it("says nothing tripped, and says what that does not mean", async () => {
    // Silence is not the same as "the draft is finished", and the copy has to
    // carry that or the panel over-claims.
    show();

    const box = await screen.findByText("Nothing tripped these checks.");
    expect(box).toBeInTheDocument();
    expect(screen.getByText(/silence is not a verdict/)).toBeInTheDocument();
    // Not green. Green is the colour of a pass, and the sentence beneath
    // it says the opposite.
    expect(box.className).not.toMatch(/emerald/);
  });

  it("groups flags by craft level, using the writer's own taxonomy", async () => {
    withFlags({ dialogue: [flag()], structure: [flag({ rule: "act_balance", line: 1 })] });

    expect(await screen.findByText("Dialogue")).toBeInTheDocument();
    expect(screen.getByText("Structure")).toBeInTheDocument();
  });

  it("falls back to the raw level name for one it does not know", async () => {
    withFlags({ pacing: [flag()] });

    expect(await screen.findByText("pacing")).toBeInTheDocument();
  });

  it("shows the line number and the note", async () => {
    withFlags({ dialogue: [flag()] });

    expect(await screen.findByText("L12")).toBeInTheDocument();
    expect(screen.getByText(/states the feeling instead of showing it/))
      .toBeInTheDocument();
  });

  it("counts the severities", async () => {
    withFlags({ dialogue: [flag()] }, { high: 2, medium: 1 });

    expect(await screen.findByText("2 high")).toBeInTheDocument();
    expect(screen.getByText("1 medium")).toBeInTheDocument();
  });

  it("omits a severity nothing scored", async () => {
    withFlags({ dialogue: [flag()] }, { high: 2, medium: 0 });

    expect(await screen.findByText("2 high")).toBeInTheDocument();
    expect(screen.queryByText(/0 medium/)).not.toBeInTheDocument();
  });

  it("names the technique that fixes it", async () => {
    withFlags({ dialogue: [flag({ technique: "Show, don't tell" })] });

    expect(await screen.findByText("→ Show, don't tell")).toBeInTheDocument();
  });
});

describe("how sure a flag is", () => {
  const withConfidence = (confidence) => {
    scripts.lint.mockResolvedValue({
      data: { by_craft_level: { dialogue: [flag({ confidence })] }, counts: {} },
    });
    return show();
  };

  it("says a mechanical flag cannot be filmed", async () => {
    withConfidence("mechanical");

    expect(await screen.findByText("can't be filmed")).toBeInTheDocument();
  });

  it("calls a mechanical flag a property of the medium, not an opinion", async () => {
    withConfidence("mechanical");

    expect(await screen.findByText("can't be filmed"))
      .toHaveAttribute("title", "A property of the medium, not an opinion.");
  });

  it("marks a convention as breakable, knowingly", async () => {
    withConfidence("convention");

    expect(await screen.findByText("convention"))
      .toHaveAttribute("title", "Professional consensus. Break it knowingly.");
  });

  it("calls a judgement a reading rather than a verdict", async () => {
    // The badge that keeps the tool honest: a subjective note must not arrive
    // wearing the authority of a mechanical one.
    withConfidence("judgement");

    expect(await screen.findByText("a reading")).toBeInTheDocument();
  });

  it("shows no badge at all for a flag with no confidence", async () => {
    // Rather than defaulting to the most certain reading.
    withConfidence(undefined);

    await screen.findByText("L12");
    expect(screen.queryByText("can't be filmed")).not.toBeInTheDocument();
    expect(screen.queryByText("a reading")).not.toBeInTheDocument();
  });
});

describe("why this matters", () => {
  const withFlag = () => {
    scripts.lint.mockResolvedValue({
      data: { by_craft_level: { dialogue: [flag()] }, counts: {} },
    });
    return show();
  };

  it("teaches in the draft rather than throwing the writer onto another screen", async () => {
    // The draft is the entire context that makes the answer make sense.
    withFlag();

    fireEvent.click(await screen.findByRole("button", { name: "Why this matters" }));

    expect(await screen.findByText("Let the behaviour carry it.")).toBeInTheDocument();
    // The lesson is fetched in the language the writer is reading the app in —
    // a Nepali interface answering "why this matters" in English is the gap
    // this product can least afford. `useLanguage` degrades to "en" with no
    // provider, which is what this test renders in.
    expect(learn.forRule).toHaveBeenCalledWith("on_the_nose", "en");
  });

  it("names the technique", async () => {
    withFlag();

    fireEvent.click(await screen.findByRole("button", { name: "Why this matters" }));

    expect(await screen.findByText("Show, don't tell")).toBeInTheDocument();
  });

  it("shows the corpus evidence when there is some", async () => {
    learn.forRule.mockResolvedValue({
      data: { technique: "T", concept: "C", corpus_proof: "Seen in 82% of the corpus." },
    });
    withFlag();

    fireEvent.click(await screen.findByRole("button", { name: "Why this matters" }));

    expect(await screen.findByText("Seen in 82% of the corpus.")).toBeInTheDocument();
  });

  it("fetches the lesson once, not on every toggle", async () => {
    withFlag();
    fireEvent.click(await screen.findByRole("button", { name: "Why this matters" }));
    await screen.findByText("Let the behaviour carry it.");

    fireEvent.click(screen.getByRole("button", { name: "Hide" }));
    fireEvent.click(screen.getByRole("button", { name: "Why this matters" }));

    expect(learn.forRule).toHaveBeenCalledTimes(1);
  });

  it("closes again", async () => {
    withFlag();
    fireEvent.click(await screen.findByRole("button", { name: "Why this matters" }));
    await screen.findByText("Let the behaviour carry it.");

    fireEvent.click(screen.getByRole("button", { name: "Hide" }));

    expect(screen.queryByText("Let the behaviour carry it.")).not.toBeInTheDocument();
  });

  it("says softly that no lesson covers this rule, rather than showing an error", async () => {
    // Not every rule has a written lesson, and that is not worth a red box.
    learn.forRule.mockRejectedValue(new Error("404"));
    withFlag();

    fireEvent.click(await screen.findByRole("button", { name: "Why this matters" }));

    expect(await screen.findByText(/No written lesson for this one yet/))
      .toBeInTheDocument();
  });

  it("announces its expanded state", async () => {
    withFlag();
    const toggle = await screen.findByRole("button", { name: "Why this matters" });

    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: "Hide" })).toHaveAttribute("aria-expanded", "true");
  });
});

describe("the benchmark", () => {
  const withBench = (data) => {
    scripts.benchmark.mockResolvedValue({ data });
    return show();
  };

  it("shows nothing at all when there is no benchmark", async () => {
    withBench(null);

    expect(await screen.findByText("Shape vs corpus")).toBeInTheDocument();
    expect(screen.queryByText(/median/)).not.toBeInTheDocument();
  });

  it("says when the report opens rather than inventing a percentile", async () => {
    // The progress message IS the feature. A percentile from two scenes would
    // be a number with nothing behind it.
    withBench({
      ready: false,
      reason: "A few more scenes and this opens.",
      progress: { scenes: 2, scenes_needed: 8, dialogue_lines: 10, dialogue_lines_needed: 40 },
    });

    expect(await screen.findByText("A few more scenes and this opens.")).toBeInTheDocument();
    expect(screen.getByText("2 / 8")).toBeInTheDocument();
    expect(screen.getByText("10 / 40")).toBeInTheDocument();
  });

  it("draws the progress proportionally", async () => {
    const { container } = withBench({
      ready: false, reason: "Keep going.",
      progress: { scenes: 2, scenes_needed: 8, dialogue_lines: 40, dialogue_lines_needed: 40 },
    });

    await screen.findByText("Keep going.");
    // Neutral, not gold: gold is this product's colour for a result, and a
    // filling gold bar reads as progress toward a score rather than as the
    // threshold the benchmark needs before it can say anything at all.
    const widths = Array.from(
      container.querySelectorAll(".bg-inkMuted\\/50")
    ).map((n) => n.style.width);
    expect(widths).toEqual(["25%", "100%"]);
    expect(container.querySelector(".bg-gold\\/60")).toBeNull();
  });

  it("does not divide by zero on a missing target", async () => {
    withBench({ ready: false, reason: "Keep going.", progress: {} });

    expect(await screen.findByText("Keep going.")).toBeInTheDocument();
  });

  it("explains why a ready benchmark is still unavailable", async () => {
    withBench({ ready: true, benchmark: { available: false, reason: "No corpus for this genre." } });

    expect(await screen.findByText("No corpus for this genre.")).toBeInTheDocument();
  });

  it("names the cohort it is comparing against", async () => {
    withBench({
      ready: true,
      benchmark: { available: true, cohort: "Nepali drama", cohort_size: 34, notes: [] },
    });

    expect(await screen.findByText("vs Nepali drama · n=34")).toBeInTheDocument();
  });

  it("says a draft inside the norm is inside the norm", async () => {
    withBench({
      ready: true,
      benchmark: { available: true, cohort: "Drama", cohort_size: 34, notes: [] },
    });

    expect(await screen.findByText(/sits inside the corpus norm/)).toBeInTheDocument();
  });

  it("reports each note with the numbers behind it", async () => {
    withBench({
      ready: true,
      benchmark: {
        available: true, cohort: "Drama", cohort_size: 34,
        notes: [{
          metric: "dialogue_ratio", observation: "Your dialogue runs heavier than most.",
          your_value: 0.71, corpus_median: 0.52, percentile: 0.88,
        }],
      },
    });

    expect(await screen.findByText("Your dialogue runs heavier than most.")).toBeInTheDocument();
    expect(screen.getByText(/you 0.71 · median 0.52 · 88th pct/)).toBeInTheDocument();
  });
});

describe("the statistics strip", () => {
  it("shows the counts when the linter returns them", async () => {
    scripts.lint.mockResolvedValue({
      data: {
        ...EMPTY_LINT,
        statistics: { scene_count: 9, estimated_pages: 14, character_count: 4, dialogue_action_ratio: 0.6 },
      },
    });
    show();

    expect(await screen.findByText("Scenes")).toBeInTheDocument();
    expect(screen.getByText("9")).toBeInTheDocument();
    expect(screen.getByText("0.6")).toBeInTheDocument();
  });

  it("omits the ratio when there is none to report", async () => {
    scripts.lint.mockResolvedValue({
      data: {
        ...EMPTY_LINT,
        statistics: { scene_count: 9, estimated_pages: 14, character_count: 4, dialogue_action_ratio: null },
      },
    });
    show();

    await screen.findByText("Scenes");
    expect(screen.queryByText(/dialogue per action/i)).not.toBeInTheDocument();
  });

  it("says 'under 1' rather than 0.24 of a page", async () => {
    // A page is the unit of screen time in this craft, and nobody counts it in
    // hundredths. The raw float implied a precision a line-count estimate does
    // not have.
    scripts.lint.mockResolvedValue({
      data: {
        ...EMPTY_LINT,
        statistics: { scene_count: 1, estimated_pages: 0.24, character_count: 2, dialogue_action_ratio: 2 },
      },
    });
    show();

    expect(await screen.findByText("under 1")).toBeInTheDocument();
    expect(screen.queryByText("0.24")).not.toBeInTheDocument();
  });

  it("keeps a real page count readable", async () => {
    scripts.lint.mockResolvedValue({
      data: {
        ...EMPTY_LINT,
        statistics: { scene_count: 9, estimated_pages: 14.4, character_count: 4, dialogue_action_ratio: 0.6 },
      },
    });
    show();

    expect(await screen.findByText("14")).toBeInTheDocument();
  });

  it("shows nothing when the linter returns no statistics", async () => {
    show();

    await screen.findByText("Nothing tripped these checks.");
    expect(screen.queryByText("Scenes")).not.toBeInTheDocument();
  });
});

describe("the way into the story track", () => {
  it("says plainly what these checks cannot see", async () => {
    // A tool whose silence implied the story was fine would be lying. The
    // linter reads pages; nothing here can tell a writer their midpoint does
    // not flip.
    show();

    expect(await screen.findByText(/cannot see whether the story works/))
      .toBeInTheDocument();
  });

  it("links to the story track, not to the course in general", async () => {
    show();

    const link = (await screen.findByText(/The Story track/)).closest("a");
    expect(link).toHaveAttribute("href", "/learn?track=story");
  });
});
