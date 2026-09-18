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
// The route param. Usually the script's own id, because the dashboard resolves
// project -> script before navigating; a link built from the project list makes
// it a PROJECT id instead, which the editor tolerates and which used to break
// everything downstream of the load. Mutable so one test can be that link.
let mockParamId = "script-1";

vi.mock("react-router-dom", () => ({
  useParams: () => ({ id: mockParamId }),
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
  learn: { forRule: vi.fn(), forTechnique: vi.fn() },
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
import { scripts, versions, comments, learn, projects, streamSSE, exportApi } from "../services/api";
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
  // The common case: nineteen lessons cannot cover thirty-nine craft
  // entries, so most techniques have none and the panel shows nothing.
  learn.forTechnique.mockRejectedValue(new Error("no lesson"));
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
    mockParamId = "script-1";
    errors = [];
    vi.spyOn(console, "error").mockImplementation((...a) => errors.push(a.join(" ")));
  });

  it("loads the script without throwing", async () => {
    render(<ScriptEditor />);
    await waitFor(() => expect(editor()).toBeInTheDocument());
    expect(errors.join("\n")).not.toMatch(/is not defined|is not a function/);
  });

  it("sizes its shell to the dynamic viewport, not to 100vh", async () => {
    /* `h-screen` is `height: 100vh`, and on a phone 100vh is the LARGE
       viewport -- the height the page would have with the address bar
       collapsed. While the bar is showing, a 100vh shell overhangs the screen,
       and this shell is `overflow-hidden`, so the overhang cannot be scrolled
       to. `.screenplay-container` is flex-1 inside it and inherits the
       overhang, so `scrollCaretIntoView` can park the caret underneath the
       address bar: in view of the container, off the screen.

       `.zen-page` already used the vh/dvh fallback pair and said why. The box
       containing it did not, and fixing the inner element alone cannot help --
       its height resolves against this one.

       The suite cannot see the stylesheet (`vite.config.js` sets css:false),
       so this checks the class the shell asks for rather than the pixels it
       gets. The two declarations live in index.css beside `.zen-page`. */
    const { container } = render(<ScriptEditor />);
    await waitFor(() => expect(editor()).toBeInTheDocument());

    const shell = container.querySelector(".app-viewport");
    expect(shell).toBeTruthy();
    expect(shell.className).not.toMatch(/h-screen/);
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

  /* The editor's half of the ⌘K jump. The palette is mounted above the router
     and outlives every page under it, so it cannot import anything from here —
     the two talk over window events instead, and each side is tested where it
     lives. */
  it("announces its scenes so the palette can offer them", async () => {
    const heard = [];
    const onScenes = (e) => heard.push(e.detail.scenes);
    window.addEventListener("editor-scenes", onScenes);
    try {
      render(<ScriptEditor />);
      await waitFor(() => expect(editor()).toBeInTheDocument());

      typeInto(editor(), "INT. CHIYA PASAL - MORNING\n\nShe waits.\n\nEXT. PATAN - NIGHT\n");

      await waitFor(() => {
        const last = heard[heard.length - 1] || [];
        expect(last.map((sc) => sc.title)).toEqual([
          "INT. CHIYA PASAL - MORNING",
          "EXT. PATAN - NIGHT",
        ]);
      });
    } finally {
      window.removeEventListener("editor-scenes", onScenes);
    }
  });

  it("reads the sluglines from the draft, not from the saved scene rows", async () => {
    /* `goToScene` addresses the Nth slugline in the textarea. The saved rows
       lag the draft by however long a save takes, so offering those would send
       a writer to the wrong scene in exactly the moment they were typing. */
    const heard = [];
    const onScenes = (e) => heard.push(e.detail.scenes);
    window.addEventListener("editor-scenes", onScenes);
    try {
      render(<ScriptEditor />);
      await waitFor(() => expect(editor()).toBeInTheDocument());

      typeInto(editor(), "INT. UNSAVED AND ONLY ON THE PAGE - DAY\n");

      await waitFor(() => {
        const last = heard[heard.length - 1] || [];
        expect(last.map((sc) => sc.title)).toContain("INT. UNSAVED AND ONLY ON THE PAGE - DAY");
      });
    } finally {
      window.removeEventListener("editor-scenes", onScenes);
    }
  });

  it("moves the caret when the palette asks for a scene", async () => {
    render(<ScriptEditor />);
    await waitFor(() => expect(editor()).toBeInTheDocument());
    const draft = "INT. ONE - DAY\n\nA.\n\nINT. TWO - NIGHT\n\nB.\n";
    typeInto(editor(), draft);

    await act(async () => {
      window.dispatchEvent(new CustomEvent("jump-to-scene", { detail: { index: 1 } }));
    });

    // The caret sits at the start of the second slugline, not at the first.
    expect(editor().selectionStart).toBe(draft.indexOf("INT. TWO"));
  });

  it("stops listening once it is gone", async () => {
    // The palette clears its scenes on `editor-closed`; this is the event that
    // fires it. Without it the palette keeps offering scenes from a script the
    // writer has navigated away from.
    const gone = vi.fn();
    window.addEventListener("editor-closed", gone);
    try {
      const { unmount } = render(<ScriptEditor />);
      await waitFor(() => expect(editor()).toBeInTheDocument());

      unmount();

      expect(gone).toHaveBeenCalled();
    } finally {
      window.removeEventListener("editor-closed", gone);
    }
  });

  it("saves against the script's id, not the id in the URL", async () => {
    /* `/projects/:id/editor` is opened with a project id by anything that
       builds the URL from the project list rather than resolving the script
       first. The load effect handles that: `getById` 404s and `getByProject`
       returns the script. Everything AFTER the load used the route param
       anyway, so autosave PUT to `/scripts/{projectId}`, took a 404, and the
       editor went on looking like it was working while nothing reached the
       server. Confirmed in a browser before this was written: the typed text
       was simply gone.

       The load is deliberately left alone here — it is the one place the raw
       param is correct, because it is what resolves it. */
    mockParamId = "project-1";
    scripts.getById.mockRejectedValue({ response: { status: 404 } });
    scripts.getByProject.mockResolvedValue({ data: SCRIPT });
    scripts.save.mockResolvedValue({ data: { id: "script-1" } });

    try {
      render(<ScriptEditor />);
      await waitFor(() => expect(editor()).toBeInTheDocument());

      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      fireEvent.change(editor(), { target: { value: "INT. PASAL - DAY\n\nSteam rises.\n" } });
      await act(async () => { vi.advanceTimersByTime(16000); });
      vi.useRealTimers();

      expect(scripts.save).toHaveBeenCalled();
      expect(scripts.save.mock.calls[0][0]).toBe("script-1");
      // The whole point: never the thing that was in the URL.
      expect(scripts.save).not.toHaveBeenCalledWith("project-1", expect.anything());
    } finally {
      vi.useRealTimers();
    }
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

  it("refreshes the scene rail after a short typing pause", async () => {
    scripts.save.mockResolvedValue({
      data: { scenes: [{ id: "s1", title: "INT. PASAL - DAY", scene_type: "major", time_allocation: 1 }] },
    });
    render(<ScriptEditor />);
    await waitFor(() => expect(editor()).toBeInTheDocument());

    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    fireEvent.change(editor(), { target: { value: "INT. PASAL - DAY\n\nSteam rises.\n" } });
    await act(async () => { vi.advanceTimersByTime(1100); });
    vi.useRealTimers();

    expect(scripts.save).toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText("INT. PASAL - DAY")).toBeInTheDocument());
  });

  it("shows a newly typed scene before the network save returns", async () => {
    scripts.save.mockReturnValue(new Promise(() => {}));
    render(<ScriptEditor />);
    await waitFor(() => expect(editor()).toBeInTheDocument());

    fireEvent.change(editor(), { target: { value: "INT. PASAL - DAY\n\nSteam rises.\n" } });

    expect(screen.getByText("INT. PASAL - DAY")).toBeInTheDocument();
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
      // Both halves of what the mode now does: it holds the caret at the
      // middle AND fades what is not being written. A hint that promised only
      // the first would undersell the second to the person deciding whether to
      // turn it on.
      .toHaveTextContent(/Hold the caret at the middle, and fade the rest/);
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

  /**
   * Improving one line rather than the whole scene.
   *
   * A writer asking for a rewrite almost always means one line. Rewriting the
   * scene around it costs a full generation, takes back every other decision
   * they made in that scene, and hands them a wall of new text to diff in their
   * head. So a highlighted selection is sent, and the answer lands back exactly
   * where it came from.
   *
   * Two things have to hold or the feature is worse than not having it: the
   * replacement goes in the right place, and an ambiguous selection is refused
   * rather than guessed at.
   */
  const SCENE = "INT. PASAL - DAY\n\nRAAJA\nI am very sad.\n\nSANJANA\nI know.";

  const highlight = (el, text) => {
    const start = el.value.indexOf(text);
    el.setSelectionRange(start, start + text.length);
    fireEvent.select(el, {
      target: { selectionStart: start, selectionEnd: start + text.length,
                value: el.value },
    });
  };

  const improveWithSelection = async (scene, selected) => {
    stubApi();
    render(<ScriptEditor />);
    await waitFor(() => expect(editor()).toBeInTheDocument());
    fireEvent.change(editor(), { target: { value: scene } });
    if (selected) highlight(editor(), selected);
    fireEvent.click(screen.getByRole("button", { name: /^improve/i }));
    return editor();
  };

  it("sends the highlighted line, not just the scene", async () => {
    await improveWithSelection(SCENE, "I am very sad.");
    fireEvent.click(screen.getByRole("button", { name: /execute ai action/i }));

    await waitFor(() => expect(streamSSE).toHaveBeenCalled());
    expect(streamSSE.mock.calls[0][1].selection).toBe("I am very sad.");
    expect(streamSSE.mock.calls[0][1].scene_text).toContain("SANJANA");
  });

  it("sends no selection when nothing is highlighted", async () => {
    await improveWithSelection(SCENE, null);
    fireEvent.click(screen.getByRole("button", { name: /execute ai action/i }));

    await waitFor(() => expect(streamSSE).toHaveBeenCalled());
    expect(streamSSE.mock.calls[0][1].selection).toBe("");
  });

  it("says which one it is about to do", async () => {
    await improveWithSelection(SCENE, "I am very sad.");

    expect(screen.getByText(/rewriting your selection/i)).toBeInTheDocument();
  });

  it("offers the other option when nothing is highlighted", async () => {
    await improveWithSelection(SCENE, null);

    expect(screen.getByText(/rewriting the whole scene/i)).toBeInTheDocument();
    expect(screen.getByText(/highlight a line first/i)).toBeInTheDocument();
  });

  it("puts the rewrite back where the line was, leaving the rest alone", async () => {
    const ta = await improveWithSelection(SCENE, "I am very sad.");
    // After improveWithSelection, which calls stubApi and would otherwise
    // reinstate the default two-chunk scene.
    streamSSE.mockImplementation(async (_p, _b, onText) => {
      onText("Baba is dying.");
      return "Baba is dying.";
    });
    fireEvent.click(screen.getByRole("button", { name: /execute ai action/i }));
    await screen.findByText(/Baba is dying/);
    fireEvent.click(screen.getByRole("button", { name: /^accept$/i }));

    await waitFor(() => expect(ta.value).toContain("Baba is dying."));
    expect(ta.value).not.toContain("I am very sad.");
    // Everything the writer did not select is untouched — including the line
    // after it, which a whole-scene rewrite would have replaced.
    expect(ta.value).toContain("INT. PASAL - DAY");
    expect(ta.value).toContain("SANJANA");
    expect(ta.value).toContain("I know.");
  });

  it("refuses to guess when the selected words appear twice", async () => {
    /* "I know." is exactly the kind of short line a screenplay repeats.
       Picking the first occurrence would rewrite one the writer was not
       looking at, so this falls back to the whole scene instead. */
    const doubled = SCENE + "\n\nRAAJA\nI know.";
    await improveWithSelection(doubled, "I know.");

    expect(screen.getByText(/rewriting the whole scene/i)).toBeInTheDocument();
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

/**
 * The craft panel remembering what it already said.
 *
 * It had no memory. It recomputed three cards on every request with no idea it
 * had given the same three yesterday, or that the writer had acted on one of
 * them. Three pieces of advice of apparently equal weight is a menu, and a menu
 * is what a writer skips.
 */
describe("the craft panel leads with one card", () => {
  const CARD = (technique) => ({
    technique, craft_level: "scene", origin_tradition: "screen craft",
    how_to_apply: "Do this.", worked_example: "On the page.",
    warning_sign: "You need this if.",
  });

  const openPatterns = async (data) => {
    stubApi();
    scripts.recommendations.mockResolvedValue({ data });
    render(<ScriptEditor />);
    await waitFor(() => expect(editor()).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /^patterns/i }));
  };

  const THREE = {
    patterns: [CARD("Deny the scene privacy"), CARD("Cut the first line"),
               CARD("Start at the last moment")],
    diagnosed: [],
    source: "similarity",
    seen: {},
  };

  it("sends the script id, so the panel can have a memory at all", async () => {
    await openPatterns(THREE);

    await waitFor(() => expect(scripts.recommendations).toHaveBeenCalled());
    expect(scripts.recommendations.mock.calls[0][0]).toHaveProperty("script_id");
  });

  it("shows the strongest card and folds the rest away", async () => {
    await openPatterns(THREE);

    expect(await screen.findByText("Deny the scene privacy")).toBeInTheDocument();
    expect(screen.queryByText("Cut the first line")).toBeNull();
    expect(screen.getByRole("button", { name: /2 more patterns/i })).toBeInTheDocument();
  });

  it("unfolds the rest behind one control, and folds them back", async () => {
    await openPatterns(THREE);
    await screen.findByText("Deny the scene privacy");

    fireEvent.click(screen.getByRole("button", { name: /2 more patterns/i }));
    expect(screen.getByText("Cut the first line")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /show only the strongest/i }));
    expect(screen.queryByText("Cut the first line")).toBeNull();
  });

  it("offers no control when there is only one card to show", async () => {
    await openPatterns({ ...THREE, patterns: [CARD("Deny the scene privacy")] });
    await screen.findByText("Deny the scene privacy");

    expect(screen.queryByText(/more pattern/i)).toBeNull();
  });

  it("says when it has given the same advice before and it is still true", async () => {
    /* Naming the repetition is what makes it evidence. Saying the same thing
       silently for the third time is just noise. */
    await openPatterns({
      ...THREE,
      seen: { "Deny the scene privacy": { times_shown: 3, resolved: false } },
    });

    expect(
      await screen.findByText(/suggested 3 times.*still on the page/i),
    ).toBeInTheDocument();
  });

  it("says nothing extra the first time a card appears", async () => {
    await openPatterns({
      ...THREE,
      seen: { "Deny the scene privacy": { times_shown: 1, resolved: false } },
    });
    await screen.findByText("Deny the scene privacy");

    expect(screen.queryByText(/suggested/i)).toBeNull();
  });

  it("survives a response from before any of this existed", async () => {
    await openPatterns({ patterns: [CARD("Deny the scene privacy")],
                         diagnosed: [], source: "similarity" });

    expect(await screen.findByText("Deny the scene privacy")).toBeInTheDocument();
  });
});

/**
 * Escalating to a lesson, and only when the loop is real.
 *
 * Advice given twice and not taken is no longer a recommendation problem:
 * either the writer does not believe it or does not know how, and both of those
 * are what a lesson is for. A first showing never escalates — being sent to a
 * course the moment you are first told something reads as being told off.
 */
describe("escalating to a lesson", () => {
  const CARD = { technique: "Deny the scene privacy", craft_level: "scene" };
  const LESSON = { id: "crossed-purposes", title: "Crossed purposes",
                   concept: "Two people, two wants, one room." };

  const withHistory = async (times) => {
    stubApi();
    learn.forTechnique.mockResolvedValue({ data: LESSON });
    scripts.recommendations.mockResolvedValue({
      data: {
        patterns: [CARD], diagnosed: [], source: "similarity",
        seen: { "Deny the scene privacy": { times_shown: times, resolved: false } },
      },
    });
    render(<ScriptEditor />);
    await waitFor(() => expect(editor()).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /^patterns/i }));
    await screen.findByText("Deny the scene privacy");
  };

  it("offers the lesson once the same advice has come back", async () => {
    await withHistory(3);

    // The assist panel is mounted twice — a column on a laptop and a sheet
    // over the page on a phone — so every control in it has two nodes.
    expect(
      await screen.findAllByRole("button", { name: /there is a lesson on this/i }),
    ).not.toHaveLength(0);
  });

  it("does not escalate the first time", async () => {
    await withHistory(1);

    expect(screen.queryByRole("button", { name: /there is a lesson/i })).toBeNull();
    expect(learn.forTechnique).not.toHaveBeenCalled();
  });

  it("opens the lesson in place, without navigating away from the draft", async () => {
    await withHistory(2);
    const [offer] = await screen.findAllByRole(
      "button", { name: /there is a lesson on this/i },
    );
    fireEvent.click(offer);

    expect(screen.getAllByText("Crossed purposes")).not.toHaveLength(0);
    expect(screen.getAllByText(/two people, two wants/i)).not.toHaveLength(0);
    // Still on the page they were writing.
    expect(editor()).toBeInTheDocument();
  });

  it("shows nothing when no lesson covers the technique", async () => {
    /* The common case. Nineteen lessons cannot cover thirty-nine craft
       entries, and an empty box apologising for itself is worse than
       silence. */
    stubApi();
    scripts.recommendations.mockResolvedValue({
      data: {
        patterns: [CARD], diagnosed: [], source: "similarity",
        seen: { "Deny the scene privacy": { times_shown: 4, resolved: false } },
      },
    });
    render(<ScriptEditor />);
    await waitFor(() => expect(editor()).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /^patterns/i }));
    await screen.findByText("Deny the scene privacy");

    await waitFor(() => expect(learn.forTechnique).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: /there is a lesson/i })).toBeNull();
  });
});

/**
 * The header on a phone.
 *
 * It was a single flex row of twelve controls totalling 817px inside a 375px
 * viewport, set to `overflow-x-auto` — so it did not break, it scrolled
 * sideways for 2.7 screens. Finalize sat 877px off-screen and so did the assist
 * toggle, which is the one control that exists ONLY on mobile. Because the
 * header scrolled as one unit, reaching either pushed Back and the project
 * title off the left.
 *
 * What can be asserted here and what cannot: `vite.config.js` sets
 * `css: false`, so the breakpoint itself is not testable in jsdom — whether
 * `hidden lg:flex` actually hides anything was verified in a browser at 375px
 * (header scrollWidth 375, clientWidth 375, nothing scrolling). What IS
 * testable is the thing that would silently rot: that every control which left
 * the row still exists in the menu, and that the two which must never be
 * behind a menu are still rendered directly.
 */
describe("the phone header keeps everything reachable", () => {
  const openMore = async () => {
    stubApi();
    render(<ScriptEditor />);
    await waitFor(() => expect(editor()).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "⋯" }));
  };

  it("offers every control that left the row", async () => {
    await openMore();

    for (const label of [
      /story bible and format/i,
      /typing: english/i,
      /format shortcuts/i,
      /focus mode/i,
      /import a screenplay/i,
      /share this project/i,
      /export pdf/i,
      /export final draft/i,
      /export word/i,
      /export production package/i,
    ]) {
      expect(screen.getByRole("menuitem", { name: label })).toBeInTheDocument();
    }
  });

  it("exposes them as menu items, not as anonymous buttons", async () => {
    /* `role="menu"` requires its children to be menuitems. Getting that wrong
       gives a screen-reader user a menu whose contents do not announce as its
       contents — which matters more here than anywhere else in the app,
       because this menu is now the ONLY way to reach eight controls on a
       phone. */
    await openMore();

    expect(screen.getAllByRole("menuitem").length).toBeGreaterThanOrEqual(10);
  });

  it("names them, where the row showed unlabelled icons", async () => {
    /* The row had twelve controls, most of them icons, and a writer opening
       the page had no way to tell which were safe to press. A named menu item
       explains itself. */
    await openMore();

    expect(screen.getByRole("menuitem", { name: /import a screenplay/i }))
      .toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /export production package/i }))
      .toBeInTheDocument();
  });

  it("leaves Finalize out of the menu, because it is the primary action", async () => {
    /* The control that was furthest off-screen is the one the whole editor
       exists to reach. It must never be the thing that gets moved into a
       menu. */
    stubApi();
    render(<ScriptEditor />);
    await waitFor(() => expect(editor()).toBeInTheDocument());

    expect(screen.getAllByRole("button", { name: /finalize/i })).not.toHaveLength(0);
  });

  it("leaves the assist toggle out of the menu, because it only exists here", async () => {
    stubApi();
    render(<ScriptEditor />);
    await waitFor(() => expect(editor()).toBeInTheDocument());

    expect(screen.getByRole("button", { name: /open the assist panel/i }))
      .toBeInTheDocument();
  });

  it("opens the file picker from the menu, not a second Import button", async () => {
    /* Import owns a hidden file input and its own refusal message, so it is
       rendered once and opened through a ref. Rendering it twice would give a
       phone two file inputs and two places for an error to appear. */
    await openMore();
    const inputs = document.querySelectorAll('input[type="file"]');
    const clicked = vi.fn();
    inputs[0].addEventListener("click", clicked);

    fireEvent.click(screen.getByRole("menuitem", { name: /import a screenplay/i }));

    expect(inputs).toHaveLength(1);
    expect(clicked).toHaveBeenCalled();
  });

  it("toggles the script from the menu and remembers it", async () => {
    await openMore();

    fireEvent.click(screen.getByRole("menuitem", { name: /typing: english/i }));

    expect(window.localStorage.getItem("baakhapaa:nepali")).toBe("on");
  });
});

describe("the two terminal actions actually run", () => {
  /**
   * `stableExport` and `stableFinalize` read their implementations off a ref,
   * so the memoised header keeps a stable identity across keystrokes. The ref
   * was created with `useRef({})` and NEVER ASSIGNED — so
   * `latestHandlers.current.handleExport` was undefined and both threw a
   * TypeError on the first click. Export and Finalize, the two things a writer
   * does at the end of a script, from the day the header was memoised until
   * 2026-09-17.
   *
   * The other ninety-eight tests in this file passed throughout, because not
   * one of them opened the header’s Export menu. This one does.
   */
  const openEditor = async () => {
    stubApi();
    render(<ScriptEditor />);
    await waitFor(() => expect(editor()).toBeInTheDocument());
  };

  it("exports without throwing, and asks the API for the format chosen", async () => {
    await openEditor();

    fireEvent.click(screen.getByRole("button", { name: /^Export$/i }));
    fireEvent.click(await screen.findByText("PDF"));

    await waitFor(() => expect(exportApi.pdf).toHaveBeenCalled());
  });
});
