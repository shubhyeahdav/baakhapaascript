import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

/**
 * The ⌘K palette.
 *
 * It is mounted globally, which makes its invisible states the ones that matter.
 * It must render nothing for a signed-out visitor — the login page has a ⌘K
 * keystroke too, and a palette that opened there would list projects belonging
 * to whoever was signed in last. And it must not fetch the project list until it
 * is first opened, so mounting the app shell costs no request.
 *
 * The keyboard contract is the other half: ⌘K toggles rather than only opening,
 * Escape closes, and the arrow keys move a selection that Enter acts on. A
 * palette you can open but not close with the same key is a palette people stop
 * reaching for.
 */

const mockNavigate = vi.fn();
vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
}));

const mockAuth = { current: { isAuthenticated: true } };
vi.mock("../context/AuthContext", () => ({
  useAuth: () => mockAuth.current,
}));

vi.mock("../services/api", () => ({
  projects: { getAll: vi.fn() },
  scripts: { getByProject: vi.fn() },
}));

// eslint-disable-next-line import/first
import CommandPalette from "./CommandPalette";
// eslint-disable-next-line import/first
import { projects, scripts } from "../services/api";

const PROJECTS = [
  { id: "p1", title: "Sapana", genre: "Drama", language: "Bilingual" },
  { id: "p2", title: "Bahini", genre: "Comedy", language: "Nepali" },
];

beforeEach(() => {
  mockAuth.current = { isAuthenticated: true };
  projects.getAll.mockResolvedValue({ data: PROJECTS });
  scripts.getByProject.mockResolvedValue({ data: { id: "s1" } });
});

const commandKey = () =>
  fireEvent.keyDown(window, { key: "k", metaKey: true });

const openPalette = async () => {
  render(<CommandPalette />);
  act(() => { commandKey(); });
  return screen.findByPlaceholderText(/Search projects/);
};

const search = (text) =>
  fireEvent.change(screen.getByPlaceholderText(/Search projects/), { target: { value: text } });

describe("when it stays out of the way", () => {
  it("renders nothing before it is opened", () => {
    const { container } = render(<CommandPalette />);

    expect(container).toBeEmptyDOMElement();
  });

  it("fetches nothing until it is opened", () => {
    // Mounted on every page of the app shell; a request here would be paid on
    // every navigation for a panel nobody asked for.
    render(<CommandPalette />);

    expect(projects.getAll).not.toHaveBeenCalled();
  });

  it("shows nothing to a signed-out visitor", () => {
    // The login page has this keystroke too, and the list would otherwise show
    // whoever was signed in last.
    mockAuth.current = { isAuthenticated: false };
    const { container } = render(<CommandPalette />);

    act(() => { commandKey(); });

    expect(container).toBeEmptyDOMElement();
  });

  it("fetches nothing for a signed-out visitor", () => {
    // The guard used to be on the RENDER only, so `open` still flipped and the
    // effect fired GET /projects/ for somebody with no token. That 401s, and
    // the api client answers a 401 by clearing the token and redirecting to
    // /login — a wasted round trip at best, and a bounce at worst. The effect
    // is now guarded too.
    mockAuth.current = { isAuthenticated: false };
    render(<CommandPalette />);

    act(() => { commandKey(); });

    expect(projects.getAll).not.toHaveBeenCalled();
  });
});

describe("opening and closing", () => {
  it("opens on ⌘K", async () => {
    await openPalette();

    expect(screen.getByPlaceholderText(/Search projects/)).toBeInTheDocument();
  });

  it("opens on Ctrl-K, for everyone not on a Mac", async () => {
    render(<CommandPalette />);

    act(() => { fireEvent.keyDown(window, { key: "K", ctrlKey: true }); });

    expect(await screen.findByPlaceholderText(/Search projects/)).toBeInTheDocument();
  });

  it("closes on the same key, rather than only opening", async () => {
    await openPalette();

    act(() => { commandKey(); });

    expect(screen.queryByPlaceholderText(/Search projects/)).not.toBeInTheDocument();
  });

  it("closes on Escape", async () => {
    await openPalette();

    act(() => { fireEvent.keyDown(window, { key: "Escape" }); });

    expect(screen.queryByPlaceholderText(/Search projects/)).not.toBeInTheDocument();
  });

  it("opens on the app-wide event the nav bar dispatches", async () => {
    render(<CommandPalette />);

    act(() => { window.dispatchEvent(new Event("open-command-palette")); });

    expect(await screen.findByPlaceholderText(/Search projects/)).toBeInTheDocument();
  });

  it("closes on a click outside the panel", async () => {
    await openPalette();

    fireEvent.mouseDown(document.querySelector(".fixed.inset-0"));

    expect(screen.queryByPlaceholderText(/Search projects/)).not.toBeInTheDocument();
  });

  it("loads the project list once, not on every open", async () => {
    await openPalette();
    await waitFor(() => expect(projects.getAll).toHaveBeenCalledTimes(1));

    act(() => { commandKey(); });
    act(() => { commandKey(); });

    await waitFor(() => expect(screen.getByPlaceholderText(/Search projects/)).toBeInTheDocument());
    expect(projects.getAll).toHaveBeenCalledTimes(1);
  });

  it("forgets the previous query on reopen", async () => {
    await openPalette();
    search("Sapana");

    act(() => { commandKey(); });
    act(() => { commandKey(); });

    expect(screen.getByPlaceholderText(/Search projects/)).toHaveValue("");
  });
});

describe("what it offers", () => {
  it("lists the quick actions and every project", async () => {
    await openPalette();

    expect(await screen.findByText("Sapana")).toBeInTheDocument();
    expect(screen.getByText("Bahini")).toBeInTheDocument();
    expect(screen.getByText("New project")).toBeInTheDocument();
    expect(screen.getByText("Go to dashboard")).toBeInTheDocument();
  });

  it("filters projects by title", async () => {
    await openPalette();
    await screen.findByText("Sapana");

    search("bahini");

    expect(screen.getByText("Bahini")).toBeInTheDocument();
    expect(screen.queryByText("Sapana")).not.toBeInTheDocument();
  });

  it("finds a project by genre or language too", async () => {
    await openPalette();
    await screen.findByText("Sapana");

    search("comedy");

    expect(screen.getByText("Bahini")).toBeInTheDocument();
  });

  it("filters the actions as well", async () => {
    await openPalette();

    search("dashboard");

    expect(screen.getByText("Go to dashboard")).toBeInTheDocument();
    expect(screen.queryByText("New project")).not.toBeInTheDocument();
  });

  it("says so when nothing matches", async () => {
    await openPalette();
    await screen.findByText("Sapana");

    search("zzzz");

    expect(screen.getByText("No matches.")).toBeInTheDocument();
  });

  it("says it is loading rather than No matches before the list arrives", async () => {
    projects.getAll.mockReturnValue(new Promise(() => {}));
    await openPalette();
    search("zzzz");

    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("carries on with an unreachable projects endpoint", async () => {
    projects.getAll.mockRejectedValue(new Error("offline"));
    await openPalette();

    expect(await screen.findByText("New project")).toBeInTheDocument();
  });
});

describe("choosing something", () => {
  const input = () => screen.getByPlaceholderText(/Search projects/);

  it("runs an action on click and closes", async () => {
    await openPalette();

    fireEvent.click(screen.getByText("New project"));

    expect(mockNavigate).toHaveBeenCalledWith("/projects/new");
    expect(screen.queryByPlaceholderText(/Search projects/)).not.toBeInTheDocument();
  });

  it("opens a project's editor, resolving its script first", async () => {
    await openPalette();
    await screen.findByText("Sapana");

    fireEvent.click(screen.getByText("Sapana"));

    await waitFor(() => expect(scripts.getByProject).toHaveBeenCalledWith("p1"));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/projects/s1/editor"));
  });

  it("closes without navigating when the script cannot be resolved", async () => {
    scripts.getByProject.mockRejectedValue(new Error("gone"));
    await openPalette();
    await screen.findByText("Sapana");

    fireEvent.click(screen.getByText("Sapana"));

    await waitFor(() =>
      expect(screen.queryByPlaceholderText(/Search projects/)).not.toBeInTheDocument());
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("acts on the first item when Enter is pressed straight away", async () => {
    await openPalette();

    fireEvent.keyDown(input(), { key: "Enter" });

    expect(mockNavigate).toHaveBeenCalledWith("/projects/new");
  });

  it("moves the selection down and acts on it", async () => {
    await openPalette();

    fireEvent.keyDown(input(), { key: "ArrowDown" });
    fireEvent.keyDown(input(), { key: "Enter" });

    expect(mockNavigate).toHaveBeenCalledWith("/dashboard");
  });

  it("will not move above the first item", async () => {
    await openPalette();

    fireEvent.keyDown(input(), { key: "ArrowUp" });
    fireEvent.keyDown(input(), { key: "Enter" });

    expect(mockNavigate).toHaveBeenCalledWith("/projects/new");
  });

  it("will not move past the last item", async () => {
    await openPalette();
    await screen.findByText("Sapana");

    for (let i = 0; i < 20; i += 1) {
      fireEvent.keyDown(input(), { key: "ArrowDown" });
    }
    fireEvent.keyDown(input(), { key: "Enter" });

    await waitFor(() => expect(scripts.getByProject).toHaveBeenCalledWith("p2"));
  });

  it("resets the selection when the query changes", async () => {
    // Otherwise Enter acts on whatever happened to sit at the old index in a
    // completely different list.
    await openPalette();
    await screen.findByText("Sapana");
    fireEvent.keyDown(input(), { key: "ArrowDown" });

    search("new");
    fireEvent.keyDown(input(), { key: "Enter" });

    expect(mockNavigate).toHaveBeenCalledWith("/projects/new");
  });
});
