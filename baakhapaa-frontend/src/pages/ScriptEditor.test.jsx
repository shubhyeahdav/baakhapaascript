import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

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

jest.mock("react-router-dom", () => ({
  useParams: () => ({ id: "script-1" }),
  useNavigate: () => jest.fn(),
  Link: ({ children, ...p }) => <a {...p}>{children}</a>,
}));

jest.mock("../context/AuthContext", () => ({
  useAuth: () => ({ user: { subscription_tier: "pro", preferences: {} } }),
}));

jest.mock("../services/api", () => ({
  scripts: {
    getById: jest.fn(), save: jest.fn(), saveBible: jest.fn(),
    lint: jest.fn(), benchmark: jest.fn(), recommendations: jest.fn(),
    addScene: jest.fn(), generateScene: jest.fn(), improve: jest.fn(),
    suggest: jest.fn(), finalize: jest.fn(),
  },
  exportApi: { pdf: jest.fn(), word: jest.fn(), package: jest.fn() },
}));

// eslint-disable-next-line import/first
import { scripts } from "../services/api";
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
    errors = [];
    jest.spyOn(console, "error").mockImplementation((...a) => errors.push(a.join(" ")));
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

    for (const label of ["AI", "Story", "Craft", "Versions", "Notes"]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
  });

  it("opens the Story tab without throwing", async () => {
    render(<ScriptEditor />);
    await waitFor(() => expect(editor()).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Story" }));

    await waitFor(() => expect(screen.getByDisplayValue("PRERANA")).toBeInTheDocument());
    expect(errors.join("\n")).not.toMatch(/is not defined|is not a function/);
  });

  it("opens the shortcuts dropdown", async () => {
    render(<ScriptEditor />);
    await waitFor(() => expect(editor()).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /shortcuts/i }));

    expect(screen.getByText(/Type the letter/i)).toBeInTheDocument();
  });
});
