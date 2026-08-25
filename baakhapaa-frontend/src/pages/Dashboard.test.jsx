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
  projects: { getAll: vi.fn(), delete: vi.fn() },
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
