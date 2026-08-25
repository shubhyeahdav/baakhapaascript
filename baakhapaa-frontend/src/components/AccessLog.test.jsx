import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import AccessLog from "./AccessLog";
import { scripts } from "../services/api";

jest.mock("../services/api", () => ({ scripts: { accessLog: jest.fn() } }));

const entry = (over = {}) => ({
  action: "opened",
  at: new Date().toISOString(),
  name: "Mira Rai",
  email: "mira@studio.com",
  ...over,
});

beforeEach(() => jest.clearAllMocks());

test("it names who was here and what they did", async () => {
  scripts.accessLog.mockResolvedValue({ data: { entries: [entry()] } });
  render(<AccessLog scriptId="s1" />);

  expect(await screen.findByText("Mira Rai")).toBeInTheDocument();
  expect(screen.getByText(/opened it/i)).toBeInTheDocument();
});

test("taking a copy reads as taking a copy", async () => {
  // The event a writer most wants to know about.
  scripts.accessLog.mockResolvedValue({ data: { entries: [entry({ action: "exported" })] } });
  render(<AccessLog scriptId="s1" />);

  expect(await screen.findByText(/took a copy/i)).toBeInTheDocument();
});

test("an empty log says so plainly", async () => {
  scripts.accessLog.mockResolvedValue({ data: { entries: [] } });
  render(<AccessLog scriptId="s1" />);

  expect(await screen.findByText(/nobody but you has opened/i)).toBeInTheDocument();
});

test("a non-admin sees nothing at all", async () => {
  // A 403 is the designed answer, not a failure. Telling a collaborator "you
  // are not allowed" would advertise a log they have no business seeing.
  scripts.accessLog.mockRejectedValue({ response: { status: 403 } });
  const { container } = render(<AccessLog scriptId="s1" />);

  await waitFor(() => expect(scripts.accessLog).toHaveBeenCalled());
  expect(container).toBeEmptyDOMElement();
});

test("it states its own limits", async () => {
  // Both halves matter: that nobody else can see it, and that it records who
  // and when rather than what.
  scripts.accessLog.mockResolvedValue({ data: { entries: [entry()] } });
  render(<AccessLog scriptId="s1" />);

  const note = await screen.findByText(/only you can see this/i);
  expect(note).toHaveTextContent(/never what/i);
});
