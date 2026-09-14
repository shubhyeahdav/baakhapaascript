import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

/**
 * The new-project form asked for seven decisions before a writer could type a
 * word — a wall at the widest part of the funnel, and every answer already had
 * a real default behind it.
 */

let mockNavigate;
vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
  Link: ({ children, ...p }) => <a {...p}>{children}</a>,
}));

vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({ user: { name: "Mira", preferences: { genre: "Drama", tone: "Emotional", language: "Nepali" } } }),
}));

// Vitest wants the factory to return the module, not the default export.
// Jest inferred that; being explicit is the more honest shape anyway.
vi.mock("../components/TopNav", () => ({ default: () => <nav /> }));

vi.mock("../services/api", () => ({
  projects: { create: vi.fn() },
  scripts: { generateStructure: vi.fn(), getByProject: vi.fn() },
}));

// eslint-disable-next-line import/first
import { projects, scripts } from "../services/api";
// eslint-disable-next-line import/first
import NewProject, { FORMATS } from "./NewProject";

beforeEach(() => {
  mockNavigate = vi.fn();
  projects.create.mockResolvedValue({ data: { id: "p1" } });
  scripts.generateStructure.mockResolvedValue({ data: { script_id: "s1" } });
  scripts.getByProject.mockResolvedValue({ data: { id: "s1" } });
});

test("a first-time writer is asked for two things, not seven", () => {
  render(<NewProject />);
  expect(screen.getByLabelText(/project title/i)).toBeInTheDocument();
  expect(screen.getByText(/^format$/i)).toBeInTheDocument();

  // Genre, tone, audience, runtime and language are behind the disclosure.
  expect(screen.queryByLabelText(/target audience/i)).not.toBeVisible?.() ?? true;
});

test("the details are one click away, not gone", () => {
  render(<NewProject />);
  const summary = screen.getByText("Details");
  expect(summary).toBeInTheDocument();

  fireEvent.click(summary);
  expect(screen.getByLabelText(/genre/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/target audience/i)).toBeInTheDocument();
});

test("the summary shows what the defaults already are", () => {
  // Nothing is hidden that does not already have a real answer behind it, so
  // the writer can see the answers without opening anything.
  render(<NewProject />);
  expect(screen.getByText(/Drama · Emotional · Nepali/)).toBeInTheDocument();
});

test("a project can be created having answered only the title", async () => {
  render(<NewProject />);

  fireEvent.change(screen.getByLabelText(/project title/i), {
    target: { value: "Chiya Pasal" },
  });
  fireEvent.click(screen.getByRole("button", { name: /generate project structure/i }));

  await waitFor(() => expect(projects.create).toHaveBeenCalled());
  const payload = projects.create.mock.calls[0][0];
  expect(payload.title).toBe("Chiya Pasal");
  // The defaults travel with it rather than being left empty.
  expect(payload.genre).toBe("Drama");
  expect(payload.duration_minutes).toBeGreaterThan(0);
});

test("onboarding answers arrive pre-filled", async () => {
  render(<NewProject />);
  fireEvent.change(screen.getByLabelText(/project title/i), { target: { value: "T" } });
  fireEvent.click(screen.getByRole("button", { name: /generate project structure/i }));

  await waitFor(() => expect(projects.create).toHaveBeenCalled());
  expect(projects.create.mock.calls[0][0].language).toBe("Nepali");
});

describe("the wizard does not write the script for you", () => {
  /**
   * It used to generate a three-act structure straight after creating the
   * project, so a writer arrived in an editor already holding a list of scenes
   * somebody else had decided on — before they had typed a word. That is the
   * blank-page problem solved by taking the page away.
   *
   * The system suggests; it does not write. Structure is now asked for from
   * inside the editor, against whatever the writer has already put down — the
   * suggestion is better for having a draft to read, and a writer who never
   * wants one never has to dismiss one.
   */

  const submitValidForm = () => {
    render(<NewProject />);
    fireEvent.change(screen.getByLabelText(/project title/i), {
      target: { value: "Chiya Pasal" },
    });
    fireEvent.click(screen.getByRole("button", { name: /generate project structure/i }));
  };

  it("creates the project without generating anything", async () => {
    submitValidForm();

    await waitFor(() => expect(projects.create).toHaveBeenCalled());
    expect(scripts.generateStructure).not.toHaveBeenCalled();
  });

  it("opens the editor on the project's own script", async () => {
    submitValidForm();

    await waitFor(() => expect(scripts.getByProject).toHaveBeenCalled());
    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith(expect.stringMatching(/\/editor$/)));
  });

  it("does not flag a structure failure it never attempted", async () => {
    submitValidForm();

    await waitFor(() => expect(mockNavigate).toHaveBeenCalled());
    expect(mockNavigate).not.toHaveBeenCalledWith(expect.stringContaining("structure_failed"));
  });
});

describe("long-form video", () => {
  /* short_form is capped at 180 seconds and everything else is a screenplay
     measured in pages. A twelve-minute YouTube piece had no honest home: a
     writer had to force it through a three-act split or store it as a lie
     about its length. */

  it("is offered as a format", () => {
    const fmt = FORMATS.find((f) => f.key === "long_form");

    expect(fmt).toBeTruthy();
    expect(fmt.label).toMatch(/long-form/i);
  });

  it("is measured in minutes, not seconds", () => {
    // The bug this prevents: grouping it with short_form because both are
    // "social video" would cap a twelve-minute script at 180 seconds.
    const fmt = FORMATS.find((f) => f.key === "long_form");

    expect(fmt.unit).toBe("min");
    expect(fmt.max).toBeGreaterThanOrEqual(25);
  });

  it("is not treated as a screenplay length either", () => {
    // A feature runs to 600 minutes. A YouTube video does not, and a ceiling
    // that says otherwise makes the duration control useless for it.
    const long = FORMATS.find((f) => f.key === "long_form");
    const film = FORMATS.find((f) => f.key === "film");

    expect(long.max).toBeLessThan(film.max);
  });
});
