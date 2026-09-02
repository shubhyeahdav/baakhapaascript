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
  // `project` is a whitelisted subset of project FIELDS and carries no id —
  // the id is top-level, which is what the share sheet scopes on.
  project_id: "project-1",
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
    getById: vi.fn(), getByProject: vi.fn(), save: vi.fn(), saveBible: vi.fn(),
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
  // The share sheet mounts TeamPanel, which reaches for these. Without them
  // the panel degrades through its own try/catch and the test passes without
  // exercising anything — the failure mode this suite exists to catch.
  projects: {
    getAll: vi.fn(), members: vi.fn(),
    addMember: vi.fn(), setMemberRole: vi.fn(), removeMember: vi.fn(),
  },
  streamSSE: vi.fn(),
}));

// eslint-disable-next-line import/first
import { scripts, versions, comments, learn, projects, streamSSE } from "../services/api";
// eslint-disable-next-line import/first
import ScriptEditor from "./ScriptEditor";

/**
 * CRA sets `resetMocks: true`, which clears implementations between tests —
 * so they are installed per-test rather than in the module factory.
 */
function stubApi() {
  streamSSE.mockImplementation(async (_path, _body, onText) => {
    // Two pieces, because a stub that calls back once cannot catch a
    // component that only renders the final chunk.
    const whole = "INT. CHIYA PASAL - DAY\n\nSanjana wipes the counter.";
    onText(whole.slice(0, 24));
    onText(whole);
    return whole;
  });
  scripts.getById.mockResolvedValue({ data: SCRIPT });
  scripts.getByProject.mockResolvedValue({ data: SCRIPT });
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
  projects.getAll.mockResolvedValue({ data: [] });
  projects.members.mockResolvedValue({
    data: { members: [], your_role: "admin" },
  });
}

// By its accessible name, not its placeholder: a placeholder vanishes once
// there is text, and it is copy that should be free to change.
const editor = () => screen.getByLabelText("Screenplay");

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
    // Generation streams now, so the answer arrives through streamSSE
    // rather than as a resolved response body.
    streamSSE.mockImplementation(async (_p, _b, onText) => {
      const whole = "INT. ROOFTOP - DUSK\n\nInserted here.";
      onText(whole);
      return whole;
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

describe("focus mode", () => {
  /**
   * Hiding the chrome hides the save indicator with it, and "is my work saved"
   * is the anxiety that pulls a writer out of focus faster than any toolbar
   * would. So focus mode keeps exactly three facts: where you are in the
   * script, what you have written since you started, and whether it is safe.
   *
   * The word count is a SESSION count, reset each time focus mode is entered.
   * "You have written 400 words today" is a fact a writer acts on; "your script
   * is 4,000 words" is one they already knew.
   */
  beforeEach(() => {
    stubApi();
    mockQuery = {};
    mockTier = "pro";
  });

  const enterFocus = async () => {
    render(<ScriptEditor />);
    await waitFor(() => expect(editor()).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /View/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Focus mode/ }));
  };

  it("reports whether the work is saved", async () => {
    await enterFocus();

    expect(await screen.findByText("Saved")).toBeInTheDocument();
  });

  it("keeps the page position visible", async () => {
    // The page is the unit of screen time; losing it in focus mode would
    // remove the one number a screenplay note is ever written in.
    await enterFocus();

    // Exactly one: the toolbar's own indicator goes with the toolbar.
    expect(screen.getAllByText(/^p\. \d+ \/ \d+$/)).toHaveLength(1);
  });

  it("hides the toolbar, which is what makes it a focus mode", async () => {
    // It did not. "Focus mode" removed the timeline and the scene rail and left
    // thirteen controls sitting above the page — most of the chrome and all of
    // the visual noise still there.
    await enterFocus();

    expect(screen.queryByRole("button", { name: /Export/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Back/ })).not.toBeInTheDocument();
  });

  it("offers a way out that does not require knowing about Esc", async () => {
    // The toggle lived in the toolbar this mode now hides, so Esc would
    // otherwise be the only exit — fine for anyone who knows, a trap otherwise.
    await enterFocus();

    fireEvent.click(screen.getByRole("button", { name: "Esc to leave" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Export/ })).toBeInTheDocument());
  });

  it("counts this session's words, not the script's total", async () => {
    await enterFocus();

    expect(await screen.findByText(/^\+\d+ words$/)).toBeInTheDocument();
    expect(screen.getByText("+0 words")).toBeInTheDocument();
  });

  it("grows the count as the writer writes", async () => {
    await enterFocus();

    typeInto(editor(), "INT. PASAL - DAY\n\nShe counts the till twice.");

    await waitFor(() => expect(screen.queryByText("+0 words")).not.toBeInTheDocument());
  });

  it("still says how to leave", async () => {
    await enterFocus();

    expect(screen.getByText("Esc to leave")).toBeInTheDocument();
  });

  it("announces changes politely rather than interrupting", async () => {
    await enterFocus();

    expect(screen.getByText("Esc to leave").closest("[aria-live]"))
      .toHaveAttribute("aria-live", "polite");
  });

  it("shows none of it outside focus mode", async () => {
    render(<ScriptEditor />);
    await waitFor(() => expect(editor()).toBeInTheDocument());

    expect(screen.queryByText("Esc to leave")).not.toBeInTheDocument();
  });
});

describe("sharing from inside the script", () => {
  /**
   * Sharing belongs on the work. It lived only under Settings → Team Members,
   * which asked a writer already inside a script to leave it, find a tab, and
   * re-pick the project they were looking at.
   */
  beforeEach(() => {
    stubApi();
    mockQuery = {};
    mockTier = "pro";
  });

  const openShare = async () => {
    render(<ScriptEditor />);
    await waitFor(() => expect(editor()).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
  };

  it("opens a share sheet", async () => {
    await openShare();

    expect(screen.getByRole("dialog", { name: "Share this project" })).toBeInTheDocument();
  });

  it("does not ask which project the writer means", async () => {
    // `script.project` is a whitelisted subset of project FIELDS and carries no
    // id; the id is top-level `project_id`. Passing the wrong one handed the
    // panel `undefined` and it fell back to its picker.
    await openShare();

    await waitFor(() =>
      expect(screen.queryByLabelText("Project")).not.toBeInTheDocument());
  });

  it("closes again", async () => {
    await openShare();

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("focus mode takes the whole screen", () => {
  /**
   * These were two menu entries: one hid what the APP draws, the other what the
   * BROWSER draws. A true distinction, and one nobody standing at this menu
   * wants to make — a writer asking for fewer things on screen means all of
   * them. One control now does both.
   *
   * The browser owns fullscreen (Esc and F11 change it without telling us), so
   * it is read back from the document rather than assumed. A toggle that claims
   * success when the request was refused is worse than one that does nothing.
   */
  beforeEach(() => {
    stubApi();
    mockQuery = {};
    mockTier = "pro";
    document.exitFullscreen = vi.fn().mockResolvedValue(undefined);
    document.documentElement.requestFullscreen = vi.fn().mockResolvedValue(undefined);
  });

  const openView = async () => {
    render(<ScriptEditor />);
    await waitFor(() => expect(editor()).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /View/ }));
  };

  it("offers one control, not two", async () => {
    await openView();

    expect(screen.getByRole("menuitem", { name: /Focus mode/ })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /Full page/ })).not.toBeInTheDocument();
  });

  it("asks the browser for the whole screen on the way in", async () => {
    await openView();

    fireEvent.click(screen.getByRole("menuitem", { name: /Focus mode/ }));

    await waitFor(() =>
      expect(document.documentElement.requestFullscreen).toHaveBeenCalled());
  });

  it("hides the toolbar as well, which is the app's half of the same wish", async () => {
    await openView();

    fireEvent.click(screen.getByRole("menuitem", { name: /Focus mode/ }));

    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /Export/ })).not.toBeInTheDocument());
  });

  it("survives a browser that refuses fullscreen", async () => {
    // An iframe without the permission, or a browser setting. Focus mode still
    // works — the app's own chrome is ours to hide either way.
    document.documentElement.requestFullscreen = vi.fn().mockRejectedValue(new Error("denied"));
    await openView();

    fireEvent.click(screen.getByRole("menuitem", { name: /Focus mode/ }));

    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /Export/ })).not.toBeInTheDocument());
    expect(screen.getByLabelText("Screenplay")).toBeInTheDocument();
  });
});

describe("the toolbar does not crush its own title", () => {
  /**
   * `min-w-0` let flex shrink the title group to 24px — narrower than the
   * Setup button inside it, which then escaped its container and collided with
   * the SYNCED / page-number status, rendering as "SetuSYNCED".
   */
  beforeEach(() => {
    stubApi();
    mockQuery = {};
    mockTier = "pro";
  });

  it("keeps the project title and Setup in one group that does not collapse", async () => {
    render(<ScriptEditor />);
    await waitFor(() => expect(editor()).toBeInTheDocument());

    // The button's accessible name is its text, "Setup"; "Story bible…" is the
    // tooltip.
    const group = screen.getByRole("button", { name: "Setup" }).parentElement;
    expect(group.className).toContain("shrink-0");
    expect(group.className).not.toContain("min-w-0");
  });

  it("truncates a long title rather than letting it push the toolbar", async () => {
    render(<ScriptEditor />);
    await waitFor(() => expect(editor()).toBeInTheDocument());

    const title = screen.getByText("Tehro");
    expect(title.className).toContain("truncate");
    expect(title.className).toMatch(/max-w-/);
  });

  it("keeps the full title reachable on hover once truncated", async () => {
    render(<ScriptEditor />);
    await waitFor(() => expect(editor()).toBeInTheDocument());

    expect(screen.getByText("Tehro")).toHaveAttribute("title", "Tehro");
  });
});

describe("the Pen on a blank page", () => {
  /**
   * `GuidePanel`'s own docstring says the product "shipped a blank page with a
   * line of formatting jargon on it" — and that was still true of the editor
   * after the guide was built, because it lives behind a tab in a four-tab
   * panel and a first-time writer has no reason to press it.
   *
   * The wizard no longer generates a structure, so a new project opens
   * genuinely empty. That is the most stuck a writer will ever be here, and the
   * one moment worth spending a character on.
   *
   * The rules are all about not becoming a mascot: appears only on an empty
   * draft, never in focus mode, never blocks the textarea, and vanishes on the
   * first keystroke rather than waiting to be dismissed.
   */
  beforeEach(() => {
    stubApi();
    mockQuery = {};
    mockTier = "pro";
  });

  it("offers a concrete first line instead of vocabulary", async () => {
    render(<ScriptEditor />);
    await waitFor(() => expect(editor()).toBeInTheDocument());

    expect(screen.getByText(/Every scene starts by saying where we are/))
      .toBeInTheDocument();
    expect(screen.getByRole("button", { name: "INT. CHIYA PASAL - DAY" }))
      .toBeInTheDocument();
  });

  it("writes that line into the draft when taken up", async () => {
    render(<ScriptEditor />);
    await waitFor(() => expect(editor()).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "INT. CHIYA PASAL - DAY" }));

    await waitFor(() => expect(editor().value).toContain("INT. CHIYA PASAL - DAY"));
  });

  it("gets out of the way as soon as there is writing", async () => {
    // Nothing here waits for a dismissal — anything a writer has to close is
    // something we made them do.
    render(<ScriptEditor />);
    await waitFor(() => expect(editor()).toBeInTheDocument());

    typeInto(editor(), "INT. PASAL - DAY");

    await waitFor(() =>
      expect(screen.queryByText(/Every scene starts by saying/)).not.toBeInTheDocument());
  });

  it("treats whitespace as still blank", async () => {
    render(<ScriptEditor />);
    await waitFor(() => expect(editor()).toBeInTheDocument());

    typeInto(editor(), "   \n  ");

    expect(screen.getByText(/Every scene starts by saying/)).toBeInTheDocument();
  });

  it("does not show for a script that already has a draft", async () => {
    scripts.getById.mockResolvedValue({
      data: { ...SCRIPT, content: "INT. PASAL - DAY\n\nShe waits.\n" },
    });
    render(<ScriptEditor />);
    await waitFor(() => expect(editor()).toBeInTheDocument());

    expect(screen.queryByText(/Every scene starts by saying/)).not.toBeInTheDocument();
  });

  it("hands off to the walkthrough that already exists", async () => {
    // The guide was built and then left behind a tab. This is the route in.
    render(<ScriptEditor />);
    await waitFor(() => expect(editor()).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /walk me through a whole scene/ }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Guide" }).className).toMatch(/gold|text-ink/));
  });

  it("stays away in focus mode", async () => {
    // That mode's whole promise is that nothing is on the page but the page.
    render(<ScriptEditor />);
    await waitFor(() => expect(editor()).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /View/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Focus mode/ }));

    expect(screen.queryByText(/Every scene starts by saying/)).not.toBeInTheDocument();
  });

  it("never intercepts a click meant for the page", async () => {
    // A writer who ignores it entirely and just starts typing is not interrupted.
    const { container } = render(<ScriptEditor />);
    await waitFor(() => expect(editor()).toBeInTheDocument());

    const wrapper = screen.getByText(/Every scene starts by saying/).closest(".pointer-events-none");
    expect(wrapper).toBeTruthy();
    expect(container).toBeTruthy();
  });

  it("shows nothing on the corkboard or outline", async () => {
    render(<ScriptEditor />);
    await waitFor(() => expect(editor()).toBeInTheDocument());

    fireEvent.click(screen.getByRole("tab", { name: "Corkboard" }));

    expect(screen.queryByText(/Every scene starts by saying/)).not.toBeInTheDocument();
  });


  /**
   * The Patterns tab, from the writer's side.
   *
   * This is the only AI-shaped surface that is free on every tier, costs no API
   * call and works with no keys configured — the craft library is retrieved with
   * local embeddings. Everything pinned here is a usability decision that a
   * refactor could silently undo.
   */
  describe("the patterns tab reads as advice, not as a measurement", () => {
    const PATTERN = {
      technique: "Every scene must end on a different charge than it started",
      craft_level: "scene",
      origin_tradition: "screen craft",
      similarity: 0.78,
      how_to_apply: "Label the charge in one word at the top and bottom.",
    };

    it("opens on Patterns, because Generate is paid and needs typing first", async () => {
      render(<ScriptEditor />);
      await waitFor(() => expect(editor()).toBeInTheDocument());

      // No tab click. The panel's own default has to land here.
      await waitFor(() => expect(scripts.recommendations).toHaveBeenCalled());
      expect(screen.getByRole("button", { name: /read my page/i })).toBeInTheDocument();
    });

    it("shows no similarity percentage — it is a cosine distance a writer cannot act on", async () => {
      scripts.recommendations.mockResolvedValue({
        data: { patterns: [PATTERN], diagnosed: [], source: "similarity" },
      });
      render(<ScriptEditor />);
      await waitFor(() => expect(screen.getByText(PATTERN.technique)).toBeInTheDocument());

      expect(screen.queryByText(/^\d{1,3}%$/)).not.toBeInTheDocument();
      expect(screen.queryByText("78%")).not.toBeInTheDocument();
    });

    it("gives that slot to the line number when the linter actually diagnosed one", async () => {
      scripts.recommendations.mockResolvedValue({
        data: {
          patterns: [PATTERN],
          diagnosed: [{ technique: PATTERN.technique, line: 12 }],
          source: "diagnosed",
        },
      });
      render(<ScriptEditor />);
      await waitFor(() => expect(screen.getByText("line 12")).toBeInTheDocument());
    });

    it("hides the filler tradition and keeps a real one", async () => {
      scripts.recommendations.mockResolvedValue({
        data: { patterns: [PATTERN], diagnosed: [], source: "similarity" },
      });
      const { unmount } = render(<ScriptEditor />);
      await waitFor(() => expect(screen.getByText(PATTERN.technique)).toBeInTheDocument());
      // "screen craft" is filler on 17 of 29 entries — a category-shaped word
      // carrying nothing.
      expect(screen.queryByText(/screen craft/i)).not.toBeInTheDocument();
      unmount();

      scripts.recommendations.mockResolvedValue({
        data: {
          patterns: [{ ...PATTERN, origin_tradition: "Malayalam" }],
          diagnosed: [],
          source: "similarity",
        },
      });
      render(<ScriptEditor />);
      // A named cinema is the reason the field exists — keep it.
      await waitFor(() => expect(screen.getByText(/Malayalam/)).toBeInTheDocument());
    });
  });
});


/**
 * The route says `/projects/:id/editor` and the id in it is a SCRIPT id — the
 * dashboard resolves project -> script before navigating. So a URL built
 * honestly from a project id used to 404 with "Script not found", which is a
 * trap for shared links and for anything constructed off the project list.
 */
describe("opening the editor by either id", () => {
  it("loads a script id directly, without asking for the project", async () => {
    stubApi();
    render(<ScriptEditor />);

    await screen.findByLabelText("Screenplay");
    expect(scripts.getById).toHaveBeenCalledWith("script-1");
    expect(scripts.getByProject).not.toHaveBeenCalled();
  });

  it("falls back to the project's script when the id is a project id", async () => {
    stubApi();
    scripts.getById.mockRejectedValueOnce({ response: { status: 404 } });
    render(<ScriptEditor />);

    await waitFor(() => expect(scripts.getByProject).toHaveBeenCalledWith("script-1"));
    expect(await screen.findByLabelText("Screenplay")).toBeInTheDocument();
  });

  it("still reports a real failure rather than retrying forever", async () => {
    stubApi();
    scripts.getById.mockRejectedValueOnce({
      response: { status: 500, data: { detail: "Database is down." } },
    });
    render(<ScriptEditor />);

    expect(await screen.findByText("Database is down.")).toBeInTheDocument();
    expect(scripts.getByProject).not.toHaveBeenCalled();
  });
});


/**
 * Typewriter mode.
 *
 * The caret holds its line near the middle of the page and the text moves
 * under it, instead of the caret walking to the bottom edge and staying there.
 * Both halves of this — the centring and the gold caret — already existed, but
 * only inside focus mode, so the nicest detail in the editor was invisible
 * unless you had found a mode most writers never open.
 *
 * The bottom padding is the mechanism, not decoration: with nothing below the
 * last line there is nowhere to scroll INTO, so the final lines can never reach
 * the middle however the scroll maths is written.
 */
describe("typewriter mode", () => {
  const openView = async () => {
    stubApi();
    render(<ScriptEditor />);
    await waitFor(() => expect(editor()).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /View/ }));
  };

  it("is offered, and says what it does", async () => {
    await openView();

    expect(screen.getByRole("menuitem", { name: /Typewriter mode/ }))
      .toHaveTextContent(/Hold the caret at the middle of the page/);
  });

  it("is off until asked for", async () => {
    await openView();

    expect(editor().className).not.toMatch(/typewriter-page/);
  });

  it("gives the page room to scroll into once turned on", async () => {
    await openView();
    fireEvent.click(screen.getByRole("menuitem", { name: /Typewriter mode/ }));

    expect(editor().className).toMatch(/typewriter-page/);
  });

  it("reports that it is on, so the menu is not a guess", async () => {
    await openView();
    fireEvent.click(screen.getByRole("menuitem", { name: /Typewriter mode/ }));
    fireEvent.click(screen.getByRole("button", { name: /View/ }));

    expect(screen.getByRole("menuitem", { name: /Typewriter mode: on/ }))
      .toBeInTheDocument();
  });

  it("turns back off", async () => {
    await openView();
    fireEvent.click(screen.getByRole("menuitem", { name: /Typewriter mode/ }));
    fireEvent.click(screen.getByRole("button", { name: /View/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Typewriter mode: on/ }));

    expect(editor().className).not.toMatch(/typewriter-page/);
  });

  it("leaves the padding to focus mode's own rule when both are on", async () => {
    // zen-page already carries the padding it needs. Stacking typewriter-page
    // on top would fight it with a second bottom value.
    await openView();
    fireEvent.click(screen.getByRole("menuitem", { name: /Typewriter mode/ }));
    fireEvent.click(screen.getByRole("button", { name: /View/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Focus mode/ }));

    expect(editor().className).toMatch(/zen-page/);
    expect(editor().className).not.toMatch(/typewriter-page/);
  });
});


/**
 * Streaming generation.
 *
 * The point is not speed - the model takes as long either way - it is that a
 * writer sees words instead of a spinner. So what these pin is that partial
 * text actually reaches the screen, and that a failure mid-stream still says
 * something useful rather than leaving half an answer sitting there.
 */
describe("generation streams", () => {
  const ask = async (mode) => {
    stubApi();
    render(<ScriptEditor />);
    await waitFor(() => expect(editor()).toBeInTheDocument());
    fireEvent.change(editor(), { target: { value: "INT. PASAL - DAY" } });
    fireEvent.click(screen.getByRole("button", { name: new RegExp("^" + mode, "i") }));
    fireEvent.click(screen.getByRole("button", { name: /execute ai action/i }));
  };

  it("asks the streaming route, not the blocking one", async () => {
    await ask("generate");

    await waitFor(() => expect(streamSSE).toHaveBeenCalled());
    expect(streamSSE.mock.calls[0][0]).toBe("/scripts/generate-scene/stream");
    expect(scripts.generateScene).not.toHaveBeenCalled();
  });

  it("shows the partial answer, not only the finished one", async () => {
    stubApi();
    let emit;
    streamSSE.mockImplementation((_p, _b, onText) => {
      emit = onText;
      return new Promise(() => {});        // never settles: mid-stream
    });
    render(<ScriptEditor />);
    await waitFor(() => expect(editor()).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /^generate/i }));
    fireEvent.click(screen.getByRole("button", { name: /execute ai action/i }));

    await waitFor(() => expect(emit).toBeDefined());
    act(() => emit("INT. ROOFTOP - DUSK"));

    expect(await screen.findByText(/INT. ROOFTOP - DUSK/)).toBeInTheDocument();
  });

  it("streams a rewrite from the improve route", async () => {
    await ask("improve");

    await waitFor(() => expect(streamSSE).toHaveBeenCalled());
    expect(streamSSE.mock.calls[0][0]).toBe("/scripts/improve/stream");
  });

  it("reports a failure that happens mid-stream", async () => {
    stubApi();
    streamSSE.mockRejectedValue({
      response: { data: { detail: "Claude API error: credit balance too low" } },
    });
    render(<ScriptEditor />);
    await waitFor(() => expect(editor()).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /^generate/i }));
    fireEvent.click(screen.getByRole("button", { name: /execute ai action/i }));

    expect(await screen.findByText(/credit balance too low/)).toBeInTheDocument();
  });

  it("still offers the plan when a free user is refused", async () => {
    // Tier is decided before the first byte, so this arrives as a status.
    stubApi();
    streamSSE.mockRejectedValue({ response: { status: 403, data: {} } });
    render(<ScriptEditor />);
    await waitFor(() => expect(editor()).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /^generate/i }));
    fireEvent.click(screen.getByRole("button", { name: /execute ai action/i }));

    await waitFor(() =>
      expect(screen.queryByText(/Error:/)).not.toBeInTheDocument());
  });
});


/**
 * The pointer over the page.
 *
 * The nib is already this product's character — it teaches onboarding, meets
 * you on a blank page, sits in the guide panel — so it is what floats over the
 * page too. One cycling menu entry rather than three, because the View menu
 * was just cut from four items to three and adding three more would undo that.
 *
 * The part that matters more than the shape: it gets out of the way while you
 * type. A pointer parked in the middle of the sentence you are writing is the
 * oldest small annoyance in word processing.
 */
describe("the pointer over the page", () => {
  const openView = async () => {
    stubApi();
    render(<ScriptEditor />);
    await waitFor(() => expect(editor()).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /View/ }));
  };

  it("is the nib to begin with", async () => {
    await openView();

    expect(editor().className).toMatch(/cursor-pen/);
  });

  it("cycles rather than offering three separate entries", async () => {
    await openView();
    expect(screen.getByRole("menuitem", { name: /Cursor: Pen/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("menuitem", { name: /Cursor: Pen/ }));

    expect(editor().className).toMatch(/cursor-ring/);
  });

  it("comes back round to the system pointer, and then to the nib", async () => {
    await openView();
    fireEvent.click(screen.getByRole("menuitem", { name: /Cursor: Pen/ }));
    fireEvent.click(screen.getByRole("button", { name: /View/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Cursor: Ring/ }));

    // "Default" draws no class of ours — it is the browser's own.
    expect(editor().className).not.toMatch(/cursor-pen|cursor-ring/);

    fireEvent.click(screen.getByRole("button", { name: /View/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Cursor: Default/ }));
    expect(editor().className).toMatch(/cursor-pen/);
  });

  it("gets out of the way on the first keystroke", async () => {
    stubApi();
    render(<ScriptEditor />);
    await waitFor(() => expect(editor()).toBeInTheDocument());

    fireEvent.keyDown(editor(), { key: "a" });

    expect(editor().className).toMatch(/cursor-resting/);
  });

  it("comes back the moment the mouse moves", async () => {
    stubApi();
    render(<ScriptEditor />);
    await waitFor(() => expect(editor()).toBeInTheDocument());
    fireEvent.keyDown(editor(), { key: "a" });

    fireEvent.mouseMove(window);

    await waitFor(() => expect(editor().className).not.toMatch(/cursor-resting/));
  });

  it("stays hidden on a click that did not move the mouse", async () => {
    // A trackpad brushed while typing should not bring it back.
    stubApi();
    render(<ScriptEditor />);
    await waitFor(() => expect(editor()).toBeInTheDocument());
    fireEvent.keyDown(editor(), { key: "a" });

    fireEvent.click(editor());

    expect(editor().className).toMatch(/cursor-resting/);
  });
});
