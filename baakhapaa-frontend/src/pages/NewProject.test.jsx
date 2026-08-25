import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

/**
 * The new-project form asked for seven decisions before a writer could type a
 * word — a wall at the widest part of the funnel, and every answer already had
 * a real default behind it.
 */

let mockNavigate;
jest.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
  Link: ({ children, ...p }) => <a {...p}>{children}</a>,
}));

jest.mock("../context/AuthContext", () => ({
  useAuth: () => ({ user: { name: "Mira", preferences: { genre: "Drama", tone: "Emotional", language: "Nepali" } } }),
}));

jest.mock("../components/TopNav", () => () => <nav />);

jest.mock("../services/api", () => ({
  projects: { create: jest.fn() },
  scripts: { generateStructure: jest.fn(), getByProject: jest.fn() },
}));

// eslint-disable-next-line import/first
import { projects, scripts } from "../services/api";
// eslint-disable-next-line import/first
import NewProject from "./NewProject";

beforeEach(() => {
  mockNavigate = jest.fn();
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
