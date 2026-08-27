import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

/**
 * The course: fourteen lessons ending in a finished short.
 *
 * The design decision this page holds is that every lesson ends in the writer
 * producing something, and the submission is graded by the craft linter rather
 * than by a Next button. Feedback that says "line 3, and here is why" teaches;
 * feedback that says "well done" does not. So a failed attempt has to name the
 * problems, say they are the same checks the editor runs, and carry no penalty —
 * all three, or the page quietly becomes a slideshow.
 *
 * Two smaller behaviours matter as much and are easier to lose. Arriving from a
 * linter flag opens *that* lesson, which is the whole point of the link — and
 * arriving cold resumes at the first unfinished one, because resuming beats
 * re-choosing. And switching lessons must not carry the previous answer across;
 * a writer who sees their last exercise in the new box will assume the page is
 * broken.
 */

const mockQuery = { current: {} };
// One stable object, deliberately. `load` is a useCallback over `params`, so a
// fresh object per render would change its identity, re-run its effect, and
// refetch the course on a loop. Real useSearchParams is stable across renders.
const stableParams = [{ get: (k) => mockQuery.current[k] ?? null }];
vi.mock("react-router-dom", () => ({
  useSearchParams: () => stableParams,
}));

vi.mock("../services/api", () => ({
  learn: { lessons: vi.fn(), submit: vi.fn() },
}));

const navActive = { current: null };
vi.mock("../components/TopNav", () => ({
  default: ({ active }) => {
    navActive.current = active;
    return <nav />;
  },
}));

// eslint-disable-next-line import/first
import LearnPage from "./LearnPage";
// eslint-disable-next-line import/first
import { learn } from "../services/api";

const lesson = (over = {}) => ({
  id: "l1", module: "The page", title: "Write a slugline",
  concept: "A slugline says where and when.", corpus_proof: "Present in 100% of the corpus.",
  exercise: "Write three sluglines.", starter: "INT. ", completed: false, ...over,
});

const LESSONS = [
  lesson({ id: "l1", title: "Write a slugline", completed: true }),
  lesson({ id: "l2", title: "Write an action line", starter: "" }),
  lesson({ id: "l3", module: "Dialogue", title: "Write a subtext line", starter: "" }),
];

beforeEach(() => {
  mockQuery.current = {};
  learn.lessons.mockResolvedValue({ data: { lessons: LESSONS, completed: ["l1"] } });
  learn.submit.mockResolvedValue({ data: { passed: true, technique_unlocked: "Show, don't tell" } });
});

const textarea = () => screen.getByPlaceholderText("Write here…");
const type = (text) => fireEvent.change(textarea(), { target: { value: text } });

describe("arriving", () => {
  it("resumes at the first unfinished lesson", async () => {
    // Resuming beats re-choosing.
    render(<LearnPage />);

    expect(await screen.findByRole("heading", { name: "Write an action line" }))
      .toBeInTheDocument();
  });

  it("opens the exact lesson a linter flag asked for", async () => {
    // The whole point of "Learn this" on a flag: land on the thing that
    // explains the flag, not wherever the writer happened to leave off.
    mockQuery.current = { lesson: "l3" };
    render(<LearnPage />);

    expect(await screen.findByRole("heading", { name: "Write a subtext line" }))
      .toBeInTheDocument();
  });

  it("ignores a requested lesson that does not exist", async () => {
    mockQuery.current = { lesson: "no-such-lesson" };
    render(<LearnPage />);

    expect(await screen.findByRole("heading", { name: "Write an action line" }))
      .toBeInTheDocument();
  });

  it("falls back to the first lesson when everything is finished", async () => {
    learn.lessons.mockResolvedValue({
      data: { lessons: LESSONS.map((l) => ({ ...l, completed: true })), completed: ["l1", "l2", "l3"] },
    });
    render(<LearnPage />);

    expect(await screen.findByRole("heading", { name: "Write a slugline" }))
      .toBeInTheDocument();
  });

  it("says so when the course cannot be loaded", async () => {
    learn.lessons.mockRejectedValue(new Error("offline"));
    render(<LearnPage />);

    expect(await screen.findByText("Could not load the course.")).toBeInTheDocument();
  });
});

describe("the curriculum", () => {
  it("groups lessons by module", async () => {
    render(<LearnPage />);

    await screen.findByRole("heading", { name: "Write an action line" });
    // "The page" is both a module heading in the nav and the open lesson's own
    // module label, so both modules are matched as groups.
    expect(screen.getAllByText("The page").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Dialogue").length).toBeGreaterThan(0);
  });

  it("marks what is finished", async () => {
    render(<LearnPage />);

    await screen.findByRole("heading", { name: "Write an action line" });
    expect(screen.getByText("✓")).toBeInTheDocument();
    expect(screen.getAllByText("○")).toHaveLength(2);
  });

  it("tracks progress across the whole course", async () => {
    render(<LearnPage />);

    expect(await screen.findByText("1/3")).toBeInTheDocument();
  });

  it("switches lessons on click", async () => {
    render(<LearnPage />);
    await screen.findByRole("heading", { name: "Write an action line" });

    fireEvent.click(screen.getByRole("button", { name: /Write a subtext line/ }));

    expect(screen.getByRole("heading", { name: "Write a subtext line" }))
      .toBeInTheDocument();
  });

  it("does not carry the previous answer into the next lesson", async () => {
    // A writer who sees their last exercise in the new box will assume the
    // page is broken.
    render(<LearnPage />);
    await screen.findByRole("heading", { name: "Write an action line" });
    type("My answer to the last one.");

    fireEvent.click(screen.getByRole("button", { name: /Write a subtext line/ }));

    expect(textarea()).toHaveValue("");
  });

  it("seeds the box with the lesson's own starter", async () => {
    mockQuery.current = { lesson: "l1" };
    render(<LearnPage />);

    await screen.findByRole("heading", { name: "Write a slugline" });
    expect(textarea()).toHaveValue("INT. ");
  });
});

describe("the lesson", () => {
  it("teaches the concept before asking for anything", async () => {
    render(<LearnPage />);

    expect(await screen.findByText("A slugline says where and when.")).toBeInTheDocument();
    expect(screen.getByText("Write three sluglines.")).toBeInTheDocument();
  });

  it("speaks for the corpus in numbers, never in quotation", async () => {
    // The only place the script library speaks at all, and it says a
    // measurement — which is what keeps the corpus unpublishable-safe.
    render(<LearnPage />);

    await screen.findByRole("heading", { name: "Write an action line" });
    expect(screen.getByText("From the corpus")).toBeInTheDocument();
    expect(screen.getByText("Present in 100% of the corpus.")).toBeInTheDocument();
  });

  it("marks a completed lesson as completed", async () => {
    mockQuery.current = { lesson: "l1" };
    render(<LearnPage />);

    expect(await screen.findByText("· completed")).toBeInTheDocument();
  });
});

describe("submitting", () => {
  it("will not submit an empty answer", async () => {
    render(<LearnPage />);
    await screen.findByRole("heading", { name: "Write an action line" });

    expect(screen.getByRole("button", { name: "Check my work" })).toBeDisabled();
  });

  it("will not submit whitespace", async () => {
    render(<LearnPage />);
    await screen.findByRole("heading", { name: "Write an action line" });

    type("   ");

    expect(screen.getByRole("button", { name: "Check my work" })).toBeDisabled();
  });

  it("sends the answer against the open lesson", async () => {
    render(<LearnPage />);
    await screen.findByRole("heading", { name: "Write an action line" });
    type("She counts the till without looking up.");

    fireEvent.click(screen.getByRole("button", { name: "Check my work" }));

    await waitFor(() => expect(learn.submit).toHaveBeenCalledWith(
      "l2", "She counts the till without looking up."));
  });

  it("names the technique a pass unlocked", async () => {
    render(<LearnPage />);
    await screen.findByRole("heading", { name: "Write an action line" });
    type("She counts the till.");

    fireEvent.click(screen.getByRole("button", { name: "Check my work" }));

    expect(await screen.findByText("Passed.")).toBeInTheDocument();
    expect(screen.getByText("Show, don't tell")).toBeInTheDocument();
  });

  it("reloads progress after a pass", async () => {
    render(<LearnPage />);
    await screen.findByRole("heading", { name: "Write an action line" });
    type("She counts the till.");

    fireEvent.click(screen.getByRole("button", { name: "Check my work" }));

    await waitFor(() => expect(learn.lessons).toHaveBeenCalledTimes(2));
  });

  it("offers the next lesson only once the current one passed", async () => {
    render(<LearnPage />);
    await screen.findByRole("heading", { name: "Write an action line" });
    type("She counts the till.");
    expect(screen.queryByText(/^Next:/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Check my work" }));

    expect(await screen.findByText(/Next: Write a subtext line/)).toBeInTheDocument();
  });

  it("moves on to the next lesson", async () => {
    render(<LearnPage />);
    await screen.findByRole("heading", { name: "Write an action line" });
    type("She counts the till.");
    fireEvent.click(screen.getByRole("button", { name: "Check my work" }));

    fireEvent.click(await screen.findByText(/Next: Write a subtext line/));

    expect(screen.getByRole("heading", { name: "Write a subtext line" }))
      .toBeInTheDocument();
  });

  it("names what is wrong rather than just saying no", async () => {
    // "line 3, and here is why" teaches. "Try again" does not.
    learn.submit.mockResolvedValue({
      data: { passed: false, problems: ["Line 2 states the feeling instead of showing it."] },
    });
    render(<LearnPage />);
    await screen.findByRole("heading", { name: "Write an action line" });
    type("She was sad.");

    fireEvent.click(screen.getByRole("button", { name: "Check my work" }));

    expect(await screen.findByText("Not yet.")).toBeInTheDocument();
    expect(screen.getByText(/Line 2 states the feeling instead of showing it/))
      .toBeInTheDocument();
  });

  it("says there is no penalty for trying, and that these are the editor's checks", async () => {
    learn.submit.mockResolvedValue({ data: { passed: false, problems: ["Too on the nose."] } });
    render(<LearnPage />);
    await screen.findByRole("heading", { name: "Write an action line" });
    type("She was sad.");

    fireEvent.click(screen.getByRole("button", { name: "Check my work" }));

    expect(await screen.findByText(/same checks that run in the editor/)).toBeInTheDocument();
    expect(screen.getByText(/no penalty for trying/)).toBeInTheDocument();
  });

  it("does not reload progress on a failure", async () => {
    learn.submit.mockResolvedValue({ data: { passed: false, problems: ["Nope."] } });
    render(<LearnPage />);
    await screen.findByRole("heading", { name: "Write an action line" });
    type("She was sad.");

    fireEvent.click(screen.getByRole("button", { name: "Check my work" }));

    await screen.findByText("Not yet.");
    expect(learn.lessons).toHaveBeenCalledTimes(1);
  });

  it("reports an unreachable server as a problem, not as a pass", async () => {
    learn.submit.mockRejectedValue(new Error("offline"));
    render(<LearnPage />);
    await screen.findByRole("heading", { name: "Write an action line" });
    type("She counts the till.");

    fireEvent.click(screen.getByRole("button", { name: "Check my work" }));

    expect(await screen.findByText(/Could not reach the server/)).toBeInTheDocument();
    expect(screen.queryByText("Passed.")).not.toBeInTheDocument();
  });

  it("says it is checking while it waits", async () => {
    learn.submit.mockReturnValue(new Promise(() => {}));
    render(<LearnPage />);
    await screen.findByRole("heading", { name: "Write an action line" });
    type("She counts the till.");

    fireEvent.click(screen.getByRole("button", { name: "Check my work" }));

    expect(await screen.findByRole("button", { name: "Checking…" })).toBeDisabled();
  });

  it("clears the previous verdict when the lesson changes", async () => {
    render(<LearnPage />);
    await screen.findByRole("heading", { name: "Write an action line" });
    type("She counts the till.");
    fireEvent.click(screen.getByRole("button", { name: "Check my work" }));
    await screen.findByText("Passed.");

    const nav = screen.getAllByRole("button", { name: /Write a subtext line/ });
    fireEvent.click(nav[0]);

    expect(screen.queryByText("Passed.")).not.toBeInTheDocument();
  });
});

describe("the two tracks", () => {
  // The Pen teaches the script page; The Story teaches what the page is for.
  // Separate tracks on purpose — page craft and story craft fail
  // independently, and a writer whose pages are clean can still have no story.
  const TRACKED = [
    lesson({ id: "p1", track: "pen", module: "The page", title: "Write a slugline", completed: true }),
    lesson({ id: "p2", track: "pen", module: "The page", title: "Write an action line", starter: "" }),
    lesson({ id: "s1", track: "story", module: "Story", title: "Want versus need", starter: "" }),
    lesson({ id: "s2", track: "story", module: "Story", title: "Redefine what winning means", starter: "" }),
  ];

  beforeEach(() => {
    learn.lessons.mockResolvedValue({ data: { lessons: TRACKED, completed: ["p1"] } });
  });

  it("offers both tracks, named for what they teach", async () => {
    render(<LearnPage />);
    await screen.findByRole("heading", { name: "Write an action line" });

    expect(screen.getByRole("tab", { name: /The Pen/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /The Story/ })).toBeInTheDocument();
    expect(screen.getByText("the script page")).toBeInTheDocument();
    expect(screen.getByText("what the page is for")).toBeInTheDocument();
  });

  it("shows only the open track's curriculum", async () => {
    render(<LearnPage />);
    await screen.findByRole("heading", { name: "Write an action line" });

    expect(screen.getByRole("button", { name: /Write a slugline/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Want versus need/ })).not.toBeInTheDocument();
  });

  it("switches curricula on the track tab", async () => {
    render(<LearnPage />);
    await screen.findByRole("heading", { name: "Write an action line" });

    fireEvent.click(screen.getByRole("tab", { name: /The Story/ }));

    expect(screen.getByRole("button", { name: /Want versus need/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Write a slugline/ })).not.toBeInTheDocument();
  });

  it("follows a deep link into the story track", async () => {
    // A linter flag's "Learn this" can point at a story lesson; the nav must
    // never show a list the open lesson is not in.
    mockQuery.current = { lesson: "s2" };
    render(<LearnPage />);

    expect(await screen.findByRole("heading", { name: "Redefine what winning means" }))
      .toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /The Story/ }))
      .toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("button", { name: /Want versus need/ })).toBeInTheDocument();
  });

  it("counts progress per track, not across the whole course", async () => {
    render(<LearnPage />);
    await screen.findByRole("heading", { name: "Write an action line" });

    expect(screen.getByText("1/2")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /The Story/ }));

    expect(screen.getByText("0/2")).toBeInTheDocument();
  });

  it("keeps Next inside the track", async () => {
    // Crossing tracks on Next would yank a writer from a story exercise into
    // a formatting one mid-thought.
    mockQuery.current = { lesson: "s1" };
    render(<LearnPage />);
    await screen.findByRole("heading", { name: "Want versus need" });
    type("She wants the audition. She needs to tell Baba.\nINT. PASAL - DAY\nMIRA\nMa jaanchhu.");

    fireEvent.click(screen.getByRole("button", { name: "Check my work" }));

    expect(await screen.findByText(/Next: Redefine what winning means/)).toBeInTheDocument();
  });

  it("treats a lesson with no track as pen, so old data keeps rendering", async () => {
    learn.lessons.mockResolvedValue({
      data: { lessons: [lesson({ id: "old", title: "Trackless lesson", track: undefined, starter: "" })], completed: [] },
    });
    render(<LearnPage />);

    expect(await screen.findByRole("heading", { name: "Trackless lesson" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Trackless lesson/ })).toBeInTheDocument();
  });
});

describe("switching track moves the open lesson with it", () => {
  // Regression: switching the nav alone left the pane showing a lesson from
  // the other track, so the curriculum said Story while the exercise on screen
  // was a formatting one. Found by opening the page, not by a test — which is
  // why it is a test now.
  const TRACKED = [
    lesson({ id: "p1", track: "pen", module: "The page", title: "Write a slugline", completed: true }),
    lesson({ id: "p2", track: "pen", module: "The page", title: "Write an action line", starter: "" }),
    lesson({ id: "s1", track: "story", module: "Story", title: "Want versus need", starter: "" }),
    lesson({ id: "s2", track: "story", module: "Story", title: "Redefine what winning means", starter: "" }),
  ];

  beforeEach(() => {
    learn.lessons.mockResolvedValue({ data: { lessons: TRACKED, completed: ["p1"] } });
  });

  it("opens the new track's first unfinished lesson", async () => {
    render(<LearnPage />);
    await screen.findByRole("heading", { name: "Write an action line" });

    fireEvent.click(screen.getByRole("tab", { name: /The Story/ }));

    expect(screen.getByRole("heading", { name: "Want versus need" })).toBeInTheDocument();
  });

  it("never leaves the pane on a lesson the nav is not showing", async () => {
    render(<LearnPage />);
    await screen.findByRole("heading", { name: "Write an action line" });

    fireEvent.click(screen.getByRole("tab", { name: /The Story/ }));

    // The open lesson must appear in the visible curriculum.
    const heading = screen.getByRole("heading", { level: 2 }).textContent;
    expect(screen.getByRole("button", { name: new RegExp(heading) })).toBeInTheDocument();
  });

  it("skips a finished lesson when resuming a track", async () => {
    learn.lessons.mockResolvedValue({
      data: {
        lessons: TRACKED.map((l) => (l.id === "s1" ? { ...l, completed: true } : l)),
        completed: ["p1", "s1"],
      },
    });
    render(<LearnPage />);
    await screen.findByRole("heading", { name: "Write an action line" });

    fireEvent.click(screen.getByRole("tab", { name: /The Story/ }));

    expect(screen.getByRole("heading", { name: "Redefine what winning means" }))
      .toBeInTheDocument();
  });

  it("leaves the open lesson alone when it already belongs to that track", async () => {
    // Clicking the track you are already on must not throw away your place.
    mockQuery.current = { lesson: "s2" };
    render(<LearnPage />);
    await screen.findByRole("heading", { name: "Redefine what winning means" });

    fireEvent.click(screen.getByRole("tab", { name: /The Story/ }));

    expect(screen.getByRole("heading", { name: "Redefine what winning means" }))
      .toBeInTheDocument();
  });
});

describe("the track tabs are a real tab widget", () => {
  // `role="tab"` promises a keyboard contract. Declaring the role without
  // honouring it is worse than plain buttons: a screen-reader user is told to
  // expect arrow-key navigation and finds none.
  beforeEach(() => {
    learn.lessons.mockResolvedValue({
      data: {
        lessons: [
          lesson({ id: "p1", track: "pen", module: "The page", title: "Write a slugline", starter: "" }),
          lesson({ id: "s1", track: "story", module: "Story", title: "Want versus need", starter: "" }),
        ],
        completed: [],
      },
    });
  });

  const tabs = () => screen.getAllByRole("tab");

  it("names each tab", async () => {
    render(<LearnPage />);
    await screen.findByRole("heading", { name: "Write a slugline" });

    expect(screen.getByRole("tab", { name: /The Pen/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /The Story/ })).toBeInTheDocument();
  });

  it("points each tab at the curriculum panel it controls", async () => {
    render(<LearnPage />);
    await screen.findByRole("heading", { name: "Write a slugline" });

    const panel = screen.getByRole("tabpanel");
    for (const t of tabs()) {
      expect(t).toHaveAttribute("aria-controls", panel.id);
    }
  });

  it("labels the panel with whichever tab is selected", async () => {
    render(<LearnPage />);
    await screen.findByRole("heading", { name: "Write a slugline" });

    expect(screen.getByRole("tabpanel"))
      .toHaveAttribute("aria-labelledby", screen.getByRole("tab", { name: /The Pen/ }).id);
  });

  it("keeps one tab stop for the whole list", async () => {
    // Roving tabindex: Tab reaches the tablist once, arrows move inside it.
    render(<LearnPage />);
    await screen.findByRole("heading", { name: "Write a slugline" });

    expect(screen.getByRole("tab", { name: /The Pen/ })).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("tab", { name: /The Story/ })).toHaveAttribute("tabindex", "-1");
  });

  it("moves between tracks on the arrow keys", async () => {
    render(<LearnPage />);
    await screen.findByRole("heading", { name: "Write a slugline" });

    fireEvent.keyDown(screen.getByRole("tab", { name: /The Pen/ }), { key: "ArrowRight" });

    expect(screen.getByRole("tab", { name: /The Story/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("heading", { name: "Want versus need" })).toBeInTheDocument();
  });

  it("wraps around at the ends", async () => {
    render(<LearnPage />);
    await screen.findByRole("heading", { name: "Write a slugline" });

    fireEvent.keyDown(screen.getByRole("tab", { name: /The Pen/ }), { key: "ArrowLeft" });

    expect(screen.getByRole("tab", { name: /The Story/ })).toHaveAttribute("aria-selected", "true");
  });

  it("jumps to the ends on Home and End", async () => {
    render(<LearnPage />);
    await screen.findByRole("heading", { name: "Write a slugline" });

    fireEvent.keyDown(screen.getByRole("tab", { name: /The Pen/ }), { key: "End" });
    expect(screen.getByRole("tab", { name: /The Story/ })).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(screen.getByRole("tab", { name: /The Story/ }), { key: "Home" });
    expect(screen.getByRole("tab", { name: /The Pen/ })).toHaveAttribute("aria-selected", "true");
  });

  it("ignores keys that are not navigation", async () => {
    render(<LearnPage />);
    await screen.findByRole("heading", { name: "Write a slugline" });

    fireEvent.keyDown(screen.getByRole("tab", { name: /The Pen/ }), { key: "a" });

    expect(screen.getByRole("tab", { name: /The Pen/ })).toHaveAttribute("aria-selected", "true");
  });
});

it("highlights Learn in the nav", async () => {
  // It rendered <TopNav /> with no `active`, which defaults to "Projects" —
  // so opening the course lit up the wrong tab. Every other page passes one.
  render(<LearnPage />);
  await screen.findByRole("heading", { name: "Write an action line" });

  expect(navActive.current).toBe("Learn");
});

describe("the ?track= deep link", () => {
  // The editor's craft panel points here. It is pointing at a course rather
  // than at the answer to one flag, so it names a track and lets the page pick
  // where in it the writer left off.
  const TRACKED = [
    lesson({ id: "p1", track: "pen", module: "The page", title: "Write a slugline", starter: "" }),
    lesson({ id: "s1", track: "story", module: "Story", title: "Want versus need", completed: true, starter: "" }),
    lesson({ id: "s2", track: "story", module: "Story", title: "Redefine what winning means", starter: "" }),
  ];

  beforeEach(() => {
    learn.lessons.mockResolvedValue({ data: { lessons: TRACKED, completed: ["s1"] } });
  });

  it("opens the named track", async () => {
    mockQuery.current = { track: "story" };
    render(<LearnPage />);

    await screen.findByRole("heading", { level: 2 });
    expect(screen.getByRole("tab", { name: /The Story/ })).toHaveAttribute("aria-selected", "true");
  });

  it("resumes at that track's first unfinished lesson", async () => {
    mockQuery.current = { track: "story" };
    render(<LearnPage />);

    expect(await screen.findByRole("heading", { name: "Redefine what winning means" }))
      .toBeInTheDocument();
  });

  it("still lets ?lesson= win, since it names one exact thing", async () => {
    mockQuery.current = { track: "story", lesson: "p1" };
    render(<LearnPage />);

    expect(await screen.findByRole("heading", { name: "Write a slugline" })).toBeInTheDocument();
  });

  it("falls back to the whole course for a track that does not exist", async () => {
    mockQuery.current = { track: "nonsense" };
    render(<LearnPage />);

    expect(await screen.findByRole("heading", { level: 2 })).toBeInTheDocument();
  });
});
