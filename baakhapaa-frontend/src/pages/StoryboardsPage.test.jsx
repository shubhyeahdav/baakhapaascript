import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

/**
 * The index that gets you into a storyboard.
 *
 * Storyboards are per project, but the storyboard route takes a SCRIPT id — so
 * every row here has to resolve one before it can navigate. That indirection is
 * the whole of this page's logic, and the two things that can go wrong with it
 * are: navigating to a project id (a dead route), and letting a second click
 * start a second resolution while the first is still in flight.
 */

const mockNavigate = vi.fn();
vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
  Link: ({ children, to, ...p }) => <a href={to} {...p}>{children}</a>,
}));

vi.mock("../services/api", () => ({
  projects: { getAll: vi.fn() },
  scripts: { getByProject: vi.fn() },
}));

vi.mock("../components/TopNav", () => ({ default: () => <nav /> }));

// eslint-disable-next-line import/first
import StoryboardsPage from "./StoryboardsPage";
// eslint-disable-next-line import/first
import { projects, scripts } from "../services/api";

const PROJECTS = [
  { id: "p1", title: "Sapana", genre: "Drama", language: "Bilingual" },
  { id: "p2", title: "Bahini", genre: "Comedy", language: "Nepali" },
];

beforeEach(() => {
  projects.getAll.mockResolvedValue({ data: PROJECTS });
  scripts.getByProject.mockResolvedValue({ data: { id: "s1" } });
  vi.spyOn(window, "alert").mockImplementation(() => {});
});

const row = (title) => screen.getByText(title).closest("button");

describe("the list", () => {
  it("shows a skeleton while loading", () => {
    projects.getAll.mockReturnValue(new Promise(() => {}));
    const { container } = render(<StoryboardsPage />);

    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(3);
  });

  it("says a storyboard starts with a script when there is nothing", async () => {
    projects.getAll.mockResolvedValue({ data: [] });
    render(<StoryboardsPage />);

    expect(await screen.findByText(/NOTHING TO BOARD YET/)).toBeInTheDocument();
    expect(screen.getByText(/Storyboards start/)).toBeInTheDocument();
  });

  it("offers a way out of the empty state", async () => {
    projects.getAll.mockResolvedValue({ data: [] });
    render(<StoryboardsPage />);

    fireEvent.click(await screen.findByRole("button", { name: /Start a project/ }));

    expect(mockNavigate).toHaveBeenCalledWith("/projects/new");
  });

  it("lists every project with its details", async () => {
    render(<StoryboardsPage />);

    expect(await screen.findByText("Sapana")).toBeInTheDocument();
    expect(screen.getByText("Drama · Bilingual")).toBeInTheDocument();
    expect(screen.getByText("ALL PROJECTS (2)")).toBeInTheDocument();
  });

  it("numbers the rows with a leading zero", async () => {
    render(<StoryboardsPage />);

    expect(await screen.findByText("01")).toBeInTheDocument();
    expect(screen.getByText("02")).toBeInTheDocument();
  });

  it("survives an unreachable projects endpoint", async () => {
    projects.getAll.mockRejectedValue(new Error("offline"));
    render(<StoryboardsPage />);

    expect(await screen.findByText(/NOTHING TO BOARD YET/)).toBeInTheDocument();
  });
});

describe("opening a board", () => {
  it("resolves the script id before navigating", async () => {
    // The storyboard route takes a script id; navigating with the project id
    // would land on a route that does not exist.
    render(<StoryboardsPage />);
    await screen.findByText("Sapana");

    fireEvent.click(row("Sapana"));

    await waitFor(() => expect(scripts.getByProject).toHaveBeenCalledWith("p1"));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/projects/s1/storyboard"));
  });

  it("says which row is opening", async () => {
    scripts.getByProject.mockReturnValue(new Promise(() => {}));
    render(<StoryboardsPage />);
    await screen.findByText("Sapana");

    fireEvent.click(row("Sapana"));

    expect(await screen.findByText("opening…")).toBeInTheDocument();
  });

  it("ignores a click on another row while one is resolving", async () => {
    scripts.getByProject.mockReturnValue(new Promise(() => {}));
    render(<StoryboardsPage />);
    await screen.findByText("Sapana");

    fireEvent.click(row("Sapana"));
    await screen.findByText("opening…");
    fireEvent.click(row("Bahini"));

    expect(scripts.getByProject).toHaveBeenCalledTimes(1);
  });

  it("reports why a board could not be opened", async () => {
    scripts.getByProject.mockRejectedValue({
      response: { data: { detail: "You do not have access to this project." } },
    });
    render(<StoryboardsPage />);
    await screen.findByText("Sapana");

    fireEvent.click(row("Sapana"));

    await waitFor(() =>
      expect(window.alert).toHaveBeenCalledWith("You do not have access to this project."));
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("has a message of its own when the server offers none", async () => {
    scripts.getByProject.mockRejectedValue(new Error("offline"));
    render(<StoryboardsPage />);
    await screen.findByText("Sapana");

    fireEvent.click(row("Sapana"));

    await waitFor(() =>
      expect(window.alert).toHaveBeenCalledWith("Could not open this storyboard."));
  });

  it("lets the writer try again after a failure", async () => {
    scripts.getByProject.mockRejectedValue(new Error("offline"));
    render(<StoryboardsPage />);
    await screen.findByText("Sapana");

    fireEvent.click(row("Sapana"));
    await waitFor(() => expect(window.alert).toHaveBeenCalled());

    fireEvent.click(row("Bahini"));

    await waitFor(() => expect(scripts.getByProject).toHaveBeenCalledWith("p2"));
  });
});
