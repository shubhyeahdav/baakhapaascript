import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

/**
 * Deleting a project takes its script, scenes, storyboard frames and version
 * history with it. `DELETE /projects/{id}` existed from the first CRUD pass and
 * nothing called it, which on the free plan (one project) meant a writer whose
 * first attempt was a false start could never begin a second one.
 *
 * So these tests cover both halves: that the affordance exists at all, and that
 * it cannot fire from a single stray click on a tile someone meant to open.
 */

const PROJECTS = [
  { id: "p1", title: "Seto Bagh", genre: "Drama", language: "English", duration_minutes: 15, status: "draft", created_at: "2026-08-18T09:00:00" },
  { id: "p2", title: "Second Story", genre: "Thriller", language: "Nepali", duration_minutes: 22, status: "draft", created_at: "2026-08-17T09:00:00" },
];

const mockNavigate = vi.fn();

vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
  Link: ({ children, ...p }) => <a {...p}>{children}</a>,
}));

vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({ user: { name: "Board", subscription_tier: "pro" } }),
}));

// Vitest wants the factory to return the module, not the default export.
// Jest inferred that; being explicit is the more honest shape anyway.
vi.mock("../components/TopNav", () => ({ default: () => <nav /> }));

vi.mock("../services/api", () => ({
  projects: { getAll: vi.fn(), delete: vi.fn(), quick: vi.fn() },
  scripts: { getByProject: vi.fn() },
}));

// eslint-disable-next-line import/first
import { projects, scripts } from "../services/api";
// eslint-disable-next-line import/first
import Dashboard from "./Dashboard";

describe("Dashboard project delete", () => {
  beforeEach(() => {
    projects.getAll.mockResolvedValue({ data: PROJECTS });
    projects.delete.mockResolvedValue({ data: { success: true } });
  });

  const tiles = async () => {
    render(<Dashboard />);
    await waitFor(() => expect(screen.getByText("Seto Bagh")).toBeInTheDocument());
  };

  it("offers a delete control on every project", async () => {
    await tiles();
    expect(screen.getByLabelText("Delete Seto Bagh")).toBeInTheDocument();
    expect(screen.getByLabelText("Delete Second Story")).toBeInTheDocument();
  });

  it("does not delete on the first click", async () => {
    await tiles();
    fireEvent.click(screen.getByLabelText("Delete Seto Bagh"));

    expect(projects.delete).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("deletes once confirmed, and drops the tile", async () => {
    await tiles();
    fireEvent.click(screen.getByLabelText("Delete Seto Bagh"));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(projects.delete).toHaveBeenCalledWith("p1"));
    await waitFor(() => expect(screen.queryByText("Seto Bagh")).not.toBeInTheDocument());
    expect(screen.getByText("Second Story")).toBeInTheDocument();
  });

  it("backs out cleanly on cancel", async () => {
    await tiles();
    fireEvent.click(screen.getByLabelText("Delete Second Story"));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(projects.delete).not.toHaveBeenCalled();
    expect(screen.getByText("Second Story")).toBeInTheDocument();
    expect(screen.getByLabelText("Delete Second Story")).toBeInTheDocument();
  });

  it("keeps the project and explains itself when the server refuses", async () => {
    projects.delete.mockRejectedValue({ response: { data: { detail: "Nope." } } });
    await tiles();
    fireEvent.click(screen.getByLabelText("Delete Seto Bagh"));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(screen.getByText("Nope.")).toBeInTheDocument());
    expect(screen.getByText("Seto Bagh")).toBeInTheDocument();
  });

  it("opening a project still works with the delete control present", async () => {
    scripts.getByProject.mockResolvedValue({ data: { id: "s1" } });
    await tiles();

    fireEvent.click(screen.getByLabelText("Open Seto Bagh"));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/projects/s1/editor"));
  });
});

describe("starting to write without answering anything", () => {
  /* Every route into the product went through the new-project wizard, and
     `title` was required — so a writer with a thought at eleven at night had to
     name it before they could write it. The backend was never what stood in
     the way: measured across the whole writing path it answers in 2 to 20ms.
     It was the questions. */

  beforeEach(() => {
    projects.getAll.mockResolvedValue({ data: PROJECTS });
    projects.quick.mockResolvedValue({
      data: { project: { id: "np" }, script: { id: "ns" } },
    });
  });

  it("offers a way straight to the page", async () => {
    render(<Dashboard />);

    expect(await screen.findByRole("button", { name: /start writing/i }))
      .toBeInTheDocument();
  });

  it("asks nothing", async () => {
    // The moment this needs an argument it stops being quicker than the wizard.
    render(<Dashboard />);
    fireEvent.click(await screen.findByRole("button", { name: /start writing/i }));

    await waitFor(() => expect(projects.quick).toHaveBeenCalledWith());
  });

  it("opens the SCRIPT, not the project", async () => {
    /* The editor's route reads `/projects/:id/editor` and that param is in
       practice a script id — the `/projects/` is historical. Navigating with
       the project id instead put every later request against a script that does
       not exist, which is how autosave silently lost work once already. */
    render(<Dashboard />);
    fireEvent.click(await screen.findByRole("button", { name: /start writing/i }));

    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith("/projects/ns/editor"));
  });

  it("says why when a free writer is at their allowance", async () => {
    // A 402 here is a real answer, not a failure. "Something went wrong" would
    // hide the one thing the writer can act on.
    projects.quick.mockRejectedValue({
      response: { status: 402, data: { detail: "The free plan includes 3 active projects." } },
    });
    render(<Dashboard />);

    fireEvent.click(await screen.findByRole("button", { name: /start writing/i }));

    expect(await screen.findByText(/free plan includes 3 active projects/i))
      .toBeInTheDocument();
  });

  it("becomes pressable again after a failure", async () => {
    // A button stuck on "Opening…" after a dropped request is the shape of a
    // broken page, and this product is built for a connection that drops.
    projects.quick.mockRejectedValue({ response: { status: 500, data: {} } });
    render(<Dashboard />);

    fireEvent.click(await screen.findByRole("button", { name: /start writing/i }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /start writing/i })).toBeEnabled());
  });

  it("leaves the wizard where it was", async () => {
    // Quick capture is for when you do not yet know what you are making. The
    // wizard is still the right door when you do.
    render(<Dashboard />);

    expect(await screen.findByRole("button", { name: /new project/i }))
      .toBeInTheDocument();
  });
});
