import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

/**
 * Pulling deliverables out of any project from one place.
 *
 * The decision worth pinning is which formats are free. **PDF and Final Draft
 * `.fdx` are free on purpose**: a writer who cannot get their script into Final
 * Draft, Celtx or Arc Studio has to retype it, and both PDF and Word are
 * read-only as far as screenplay structure goes. Putting `.fdx` behind the
 * paywall would make the free tier a place work goes in and cannot come out of,
 * which is a different product from the one this is meant to be.
 *
 * The second is that a locked format routes to pricing rather than firing a
 * request that 403s. The server gates these too — this is not the enforcement —
 * but a button that produces an error where the writer expected a file teaches
 * them the product is broken rather than that the feature is paid.
 *
 * Every export is named after the project, because all four used to download as
 * `script.pdf`; three exports into a session that is three files called
 * `script.pdf` in a downloads folder.
 */

const mockNavigate = vi.fn();
vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
  Link: ({ children, to, ...p }) => <a href={to} {...p}>{children}</a>,
}));

vi.mock("../services/api", () => ({
  projects: { getAll: vi.fn() },
  scripts: { getByProject: vi.fn() },
  exportApi: { pdf: vi.fn(), fdx: vi.fn(), word: vi.fn(), package: vi.fn() },
}));

vi.mock("../utils/download", () => ({
  downloadBlob: vi.fn(),
  safeFilename: (t, fallback = "script") =>
    (t || "").replace(/[^\w\- ]+/g, "").trim() || fallback,
}));

const mockAuth = { current: {} };
vi.mock("../context/AuthContext", () => ({ useAuth: () => mockAuth.current }));

vi.mock("../components/TopNav", () => ({ default: () => <nav /> }));

// eslint-disable-next-line import/first
import ExportsPage from "./ExportsPage";
// eslint-disable-next-line import/first
import { projects, scripts, exportApi } from "../services/api";
// eslint-disable-next-line import/first
import { downloadBlob } from "../utils/download";

const PROJECT = { id: "p1", title: "Sapana", genre: "Drama", duration_minutes: 15 };

beforeEach(() => {
  mockAuth.current = { user: { subscription_tier: "pro" } };
  projects.getAll.mockResolvedValue({ data: [PROJECT] });
  scripts.getByProject.mockResolvedValue({ data: { id: "s1" } });
  for (const fn of Object.values(exportApi)) fn.mockResolvedValue({ data: "bytes" });
  vi.spyOn(window, "alert").mockImplementation(() => {});
});

const asFree = () => { mockAuth.current = { user: { subscription_tier: "free" } }; };

describe("the list", () => {
  it("shows a skeleton while loading", () => {
    projects.getAll.mockReturnValue(new Promise(() => {}));
    const { container } = render(<ExportsPage />);

    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(3);
  });

  it("points an empty account at making something first", async () => {
    projects.getAll.mockResolvedValue({ data: [] });
    render(<ExportsPage />);

    expect(await screen.findByText(/NOTHING TO EXPORT YET/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Start a project/ }));
    expect(mockNavigate).toHaveBeenCalledWith("/projects/new");
  });

  it("lists each project with its details", async () => {
    render(<ExportsPage />);

    expect(await screen.findByText("Sapana")).toBeInTheDocument();
    expect(screen.getByText("Drama · 15 min")).toBeInTheDocument();
    expect(screen.getByText("ALL PROJECTS (1)")).toBeInTheDocument();
  });

  it("survives an unreachable projects endpoint", async () => {
    projects.getAll.mockRejectedValue(new Error("offline"));
    render(<ExportsPage />);

    expect(await screen.findByText(/NOTHING TO EXPORT YET/)).toBeInTheDocument();
  });
});

describe("what a free account can take with it", () => {
  it("leaves PDF and Final Draft unlocked", async () => {
    // The point: a free tier a script cannot leave is a trap. `.fdx` is the
    // only one of the four that another screenwriting tool can actually read.
    asFree();
    render(<ExportsPage />);
    await screen.findByText("Sapana");

    expect(screen.getByRole("button", { name: "PDF" })).toHaveAttribute("title", "Export PDF");
    expect(screen.getByRole("button", { name: "Final Draft" }))
      .toHaveAttribute("title", "Export Final Draft");
  });

  it("marks Word and Package as paid", async () => {
    asFree();
    render(<ExportsPage />);
    await screen.findByText("Sapana");

    expect(screen.getByRole("button", { name: /Word/ }))
      .toHaveAttribute("title", "Pro / Studio feature");
    expect(screen.getByRole("button", { name: /Package/ }))
      .toHaveAttribute("title", "Pro / Studio feature");
  });

  it("explains the mark rather than leaving a bare symbol", async () => {
    asFree();
    render(<ExportsPage />);

    expect(await screen.findByText(/Word and production-package exports are part of Pro and Studio/))
      .toBeInTheDocument();
  });

  it("offers the plan instead of firing a request that will 403", async () => {
    asFree();
    render(<ExportsPage />);
    await screen.findByText("Sapana");

    fireEvent.click(screen.getByRole("button", { name: /Word/ }));

    expect(mockNavigate).toHaveBeenCalledWith("/pricing");
    expect(exportApi.word).not.toHaveBeenCalled();
  });

  it("unlocks everything for a paid account", async () => {
    render(<ExportsPage />);
    await screen.findByText("Sapana");

    fireEvent.click(screen.getByRole("button", { name: "Word" }));

    await waitFor(() => expect(exportApi.word).toHaveBeenCalled());
    expect(mockNavigate).not.toHaveBeenCalledWith("/pricing");
  });

  it("treats a missing tier as free", async () => {
    mockAuth.current = { user: {} };
    render(<ExportsPage />);
    await screen.findByText("Sapana");

    expect(screen.getByRole("button", { name: /Word/ }))
      .toHaveAttribute("title", "Pro / Studio feature");
  });

  it("unlocks for studio as well as pro", async () => {
    mockAuth.current = { user: { subscription_tier: "studio" } };
    render(<ExportsPage />);
    await screen.findByText("Sapana");

    expect(screen.queryByText(/part of Pro and Studio/)).not.toBeInTheDocument();
  });
});

describe("downloading", () => {
  it("resolves the script from the project first", async () => {
    // Export routes take a SCRIPT id; the index only knows projects.
    render(<ExportsPage />);
    await screen.findByText("Sapana");

    fireEvent.click(screen.getByRole("button", { name: "PDF" }));

    await waitFor(() => expect(scripts.getByProject).toHaveBeenCalledWith("p1"));
    await waitFor(() => expect(exportApi.pdf).toHaveBeenCalledWith("s1"));
  });

  it("names the file after the project", async () => {
    // All four used to download as `script.pdf`.
    render(<ExportsPage />);
    await screen.findByText("Sapana");

    fireEvent.click(screen.getByRole("button", { name: "PDF" }));

    await waitFor(() => expect(downloadBlob).toHaveBeenCalledWith("bytes", "Sapana.pdf"));
  });

  it("gives each format its own extension", async () => {
    render(<ExportsPage />);
    await screen.findByText("Sapana");

    fireEvent.click(screen.getByRole("button", { name: "Final Draft" }));
    await waitFor(() => expect(downloadBlob).toHaveBeenCalledWith("bytes", "Sapana.fdx"));

    fireEvent.click(screen.getByRole("button", { name: "Word" }));
    await waitFor(() => expect(downloadBlob).toHaveBeenCalledWith("bytes", "Sapana.docx"));
  });

  it("gives the production package a pdf extension, since that is what it is", async () => {
    render(<ExportsPage />);
    await screen.findByText("Sapana");

    fireEvent.click(screen.getByRole("button", { name: "Package" }));

    await waitFor(() => expect(downloadBlob).toHaveBeenCalledWith("bytes", "Sapana.pdf"));
  });

  it("falls back to a usable name for a Devanagari title", async () => {
    projects.getAll.mockResolvedValue({ data: [{ ...PROJECT, title: "सपना" }] });
    render(<ExportsPage />);
    await screen.findByText("सपना");

    fireEvent.click(screen.getByRole("button", { name: "PDF" }));

    await waitFor(() => expect(downloadBlob).toHaveBeenCalledWith("bytes", "script.pdf"));
  });

  it("refuses a second export while one is running", async () => {
    let release;
    exportApi.pdf.mockReturnValue(new Promise((r) => { release = r; }));
    render(<ExportsPage />);
    await screen.findByText("Sapana");

    fireEvent.click(screen.getByRole("button", { name: "PDF" }));
    await waitFor(() => expect(exportApi.pdf).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "Final Draft" }));

    expect(exportApi.fdx).not.toHaveBeenCalled();
    release({ data: "bytes" });
  });

  it("reports why an export failed", async () => {
    exportApi.pdf.mockRejectedValue({
      response: { data: { detail: "Write something before exporting it." } },
    });
    render(<ExportsPage />);
    await screen.findByText("Sapana");

    fireEvent.click(screen.getByRole("button", { name: "PDF" }));

    await waitFor(() =>
      expect(window.alert).toHaveBeenCalledWith("Write something before exporting it."));
  });

  it("names the format when the server offers no reason", async () => {
    exportApi.word.mockRejectedValue(new Error("offline"));
    render(<ExportsPage />);
    await screen.findByText("Sapana");

    fireEvent.click(screen.getByRole("button", { name: "Word" }));

    await waitFor(() => expect(window.alert).toHaveBeenCalledWith("Could not export Word."));
  });

  it("frees the controls again after a failure", async () => {
    exportApi.pdf.mockRejectedValue(new Error("offline"));
    render(<ExportsPage />);
    await screen.findByText("Sapana");

    fireEvent.click(screen.getByRole("button", { name: "PDF" }));
    await waitFor(() => expect(window.alert).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: "Final Draft" }));
    await waitFor(() => expect(exportApi.fdx).toHaveBeenCalled());
  });
});
