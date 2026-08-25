import React from "react";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";

/**
 * Regression cover for the class of bug that removing the format guide caused:
 * `trackCaret` kept calling a setter whose state had been deleted, so it threw
 * inside an event handler. Nothing surfaced it — the editor still rendered, the
 * console error scrolled past in a dev session, and every completion silently
 * stopped working. A render-and-type test catches it; a pure-function test on
 * `suggestFor` cannot, because `suggestFor` was never broken.
 *
 * So these tests deliberately exercise the *wiring*: mount the real component,
 * type into the real textarea, and assert both that nothing threw and that the
 * effect the handler is responsible for actually happened.
 */

const SCRIPT = {
  id: "script-1",
  content: "",
  scenes: [],
  suggestions_json: null,
  bible: {
    logline: "", dramatic_question: "", theme: "", notes: "",
    characters: [{ name: "PRERANA", age: "24", want: "", need: "", wound: "", voice: "", notes: "" }],
    locations: ["FRAME SHOP, PATAN"],
  },
  project: { title: "Tehro", genre: "Drama", tone: "Emotional", language: "Bilingual", format: "short" },
};

// `mock`-prefixed so babel-plugin-jest-hoist allows the factories to close over
// them; both are read at render time, not when the factory runs.
const mockNavigate = vi.fn();
let mockQuery = {};
let mockTier = "pro";

vi.mock("react-router-dom", () => ({
  useParams: () => ({ id: "script-1" }),
  useNavigate: () => mockNavigate,
  useSearchParams: () => [{ get: (key) => mockQuery[key] ?? null }],
  Link: ({ children, ...p }) => <a {...p}>{children}</a>,
}));

vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({ user: { subscription_tier: mockTier, preferences: {} } }),
}));

vi.mock("../services/api", () => ({
  scripts: {
    getById: vi.fn(), save: vi.fn(), saveBible: vi.fn(),
    lint: vi.fn(), benchmark: vi.fn(), recommendations: vi.fn(),
    coverage: vi.fn(), accessLog: vi.fn(),
    addScene: vi.fn(), generateScene: vi.fn(), improve: vi.fn(),
    suggest: vi.fn(), finalize: vi.fn(),
  },
  exportApi: { pdf: vi.fn(), word: vi.fn(), package: vi.fn() },
  // The History tab mounts both of these, so the mock has to carry them or the
  // tab throws on open — which is exactly what this suite is here to catch.
  versions: { getAll: vi.fn(), restore: vi.fn(), diff: vi.fn() },
  comments: { getAll: vi.fn(), add: vi.fn(), remove: vi.fn() },
  // AccessLog and CoveragePanel both mount under History/Craft.
  scriptsExtra: {},
  learn: { forRule: vi.fn() },
}));

// eslint-disable-next-line import/first
import { scripts, versions, comments, learn } from "../services/api";
// eslint-disable-next-line import/first
import ScriptEditor from "./ScriptEditor";

/**
 * CRA sets `resetMocks: true`, which clears implementations between tests —
 * so they are installed per-test rather than in the module factory.
 */
function stubApi() {
  scripts.getById.mockResolvedValue({ data: SCRIPT });
  scripts.save.mockResolvedValue({ data: {} });
  scripts.saveBible.mockResolvedValue({ data: {} });
  scripts.lint.mockResolvedValue({
    data: { flags: [], by_craft_level: {}, counts: {}, statistics: {} },
  });
  scripts.benchmark.mockResolvedValue({ data: { ready: false, progress: {} } });
  scripts.recommendations.mockResolvedValue({
    data: { patterns: [], diagnosed: [], source: "similarity" },
  });
  // Both mount under the History tab. CRA's jest config sets resetMocks, so an
  // implementation given in the vi.mock factory is gone by the first test —
  // these have to be stubbed per test, not once.
  versions.getAll.mockResolvedValue({ data: [] });
  comments.getAll.mockResolvedValue({ data: [] });
  learn.forRule.mockRejectedValue(new Error("no lesson"));
  scripts.accessLog.mockRejectedValue(new Error("not an admin"));
  scripts.coverage.mockResolvedValue({ data: {} });
}

const editor = () => screen.getByPlaceholderText(/Type Scene Headings/i);

/** Type into the textarea the way the component expects (value + caret). */
function typeInto(el, value, caret = value.length) {
  fireEvent.change(el, { target: { value } });
  el.setSelectionRange(caret, caret);
  fireEvent.keyUp(el, { key: value.slice(-1) || "a" });
}

describe("ScriptEditor", () => {
  let errors;
  beforeEach(() => {
    stubApi();
    mockQuery = {};
    mockTier = "pro";
    errors = [];
    vi.spyOn(console, "error").mockImplementation((...a) => errors.push(a.join(" ")));
  });

  it("loads the script without throwing", async () => {
    render(<ScriptEditor />);
    await waitFor(() => expect(editor()).toBeInTheDocument());
    expect(errors.join("\n")).not.toMatch(/is not defined|is not a function/);
  });

  it("offers a completion when a letter is typed — the trackCaret regression", async () => {
    render(<ScriptEditor />);
    await waitFor(() => expect(editor()).toBeInTheDocument());

    typeInto(editor(), "i");

    // The handler ran to completion and set state. When trackCaret threw, this
    // assertion failed while the editor itself still rendered fine.
    await waitFor(() => expect(screen.getByText("INT.")).toBeInTheDocument());
    expect(errors.join("\n")).not.toMatch(/is not defined|is not a function/);
  });

  it("offers a bible character before they appear in the draft", async () => {
    render(<ScriptEditor />);
    await waitFor(() => expect(editor()).toBeInTheDocument());

    // No character cue anywhere in the text — PRERANA can only come from the
    // story bible, which is the whole point of merging it into the vocabulary.
    typeInto(editor(), `${" ".repeat(22)}p`);

    await waitFor(() => expect(screen.getByText("PRERANA")).toBeInTheDocument());
  });

  it("does not offer completions inside dialogue", async () => {
    render(<ScriptEditor />);
    await waitFor(() => expect(editor()).toBeInTheDocument());

    typeInto(editor(), `${" ".repeat(10)}i`);

    await waitFor(() => expect(screen.queryByText("INT.")).not.toBeInTheDocument());
  });

  it("renders every panel tab", async () => {
    render(<ScriptEditor />);
    await waitFor(() => expect(editor()).toBeInTheDocument());

    for (const label of ["Assist", "Craft", "History"]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
  });

  it("no longer carries the story bible or a separate versions tab", async () => {
    // The bible is setup, not feedback, and moved to /projects/:id/setup. The
    // panel beside a draft should hold only what helps with the line being
    // written right now.
    render(<ScriptEditor />);
    await waitFor(() => expect(editor()).toBeInTheDocument());

    for (const gone of ["Story", "Versions", "Notes"]) {
      expect(screen.queryByRole("button", { name: gone })).not.toBeInTheDocument();
    }
  });

  it("offers a way back to project setup", async () => {
    render(<ScriptEditor />);
    await waitFor(() => expect(editor()).toBeInTheDocument());

    expect(screen.getByRole("button", { name: /setup/i })).toBeInTheDocument();
  });

  it("opens the History tab without throwing", async () => {
    render(<ScriptEditor />);
    await waitFor(() => expect(editor()).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "History" }));

    expect(errors.join("\n")).not.toMatch(/is not defined|is not a function/);
  });

  it("opens the shortcuts dropdown", async () => {
    render(<ScriptEditor />);
    await waitFor(() => expect(editor()).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /shortcuts/i }));

    expect(screen.getByText(/Type the letter/i)).toBeInTheDocument();
  });

  it("shows a notice when the wizard could not generate a structure", async () => {
    mockQuery = { structure_failed: "1" };
    render(<ScriptEditor />);
    await waitFor(() => expect(editor()).toBeInTheDocument());

    expect(screen.getByText(/structure suggestion didn't come back/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /dismiss/i }));
    expect(screen.queryByText(/structure suggestion didn't come back/i)).not.toBeInTheDocument();
  });

  it("refreshes the scene cards from what a save returns", async () => {
    // The server reconciles scene rows with the draft on save. If the editor
    // ignored the response, the index cards described a draft two edits old.
    scripts.save.mockResolvedValue({
      data: { id: "script-1", scenes: [{ id: "s1", title: "Morning at the Pasal", scene_type: "major", time_allocation: 3 }] },
    });
    try {
      // Mount on the real clock. `waitFor` schedules its retries with
      // setTimeout, so under a frozen clock it never runs a second attempt and
      // hangs until the test times out.
      render(<ScriptEditor />);
      await waitFor(() => expect(editor()).toBeInTheDocument());

      // Freeze it only to jump the 15s autosave, and fake only the two
      // functions that interval uses — faking queueMicrotask as well would
      // stall the `await` inside `act`.
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      fireEvent.change(editor(), { target: { value: "INT. PASAL - DAY\n\nSteam rises.\n" } });
      await act(async () => { vi.advanceTimersByTime(16000); });
      vi.useRealTimers();

      expect(scripts.save).toHaveBeenCalled();
      await waitFor(() =>
        expect(screen.getByText("Morning at the Pasal")).toBeInTheDocument()
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("inserts an accepted AI scene at the caret, not at the end", async () => {
    // Appending put a scene written for act 1 after act 3.
    scripts.generateScene.mockResolvedValue({
      data: { scene_text: "INT. ROOFTOP - DUSK\n\nInserted here." },
    });
    render(<ScriptEditor />);
    await waitFor(() => expect(editor()).toBeInTheDocument());

    fireEvent.change(editor(), { target: { value: "ACT ONE\n\nACT THREE\n" } });
    editor().setSelectionRange(9, 9); // start of the "ACT THREE" line

    fireEvent.click(screen.getByRole("button", { name: /^generate/i }));
    fireEvent.change(screen.getByPlaceholderText(/Describe the scene action/i), {
      target: { value: "a rooftop scene" },
    });
    fireEvent.click(screen.getByRole("button", { name: /execute ai action/i }));

    await waitFor(() => expect(screen.getByRole("button", { name: /accept/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /accept/i }));

    await waitFor(() => expect(editor().value).toMatch(/ROOFTOP/));
    const value = editor().value;
    expect(value.indexOf("ROOFTOP")).toBeLessThan(value.indexOf("ACT THREE"));
  });

  describe("on the free plan", () => {
    beforeEach(() => { mockTier = "free"; });

    it("offers the plan instead of a dead Execute button", async () => {
      render(<ScriptEditor />);
      await waitFor(() => expect(editor()).toBeInTheDocument());

      // Free lands on Patterns; the paid tabs are still reachable to read about.
      fireEvent.click(screen.getByRole("button", { name: /^generate/i }));

      expect(screen.getByRole("button", { name: /see plans/i })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /execute ai action/i })).not.toBeInTheDocument();
    });

    it("routes to pricing from the offer", async () => {
      render(<ScriptEditor />);
      await waitFor(() => expect(editor()).toBeInTheDocument());

      fireEvent.click(screen.getByRole("button", { name: /^improve/i }));
      fireEvent.click(screen.getByRole("button", { name: /see plans/i }));

      expect(mockNavigate).toHaveBeenCalledWith("/pricing");
    });
  });
});
