import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";

/**
 * Project setup — the decisions that come before the page and stay changeable.
 *
 * The story bible lives here rather than in a tab beside the draft, and the
 * reason is worth keeping visible: it is setup, not feedback. A writer fills it
 * in once at the start and corrects it in week three, while the panel next to a
 * draft should hold only what helps with the line being written right now.
 *
 * One naming trap that a test can stop someone "fixing": the route parameter is
 * a SCRIPT id, not a project id, matching `/projects/:id/editor`. The bible is
 * stored on the script row and the URL word is historical. Passing the project's
 * id to `StoryBible` would save the bible against the wrong row.
 *
 * The format parameters are shown read-only on purpose — the writer should be
 * able to see what the generator is working from even though the create-project
 * endpoint has no update counterpart yet.
 */

const mockNavigate = vi.fn();
const mockParams = { current: { id: "script-1" } };
vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
  useParams: () => mockParams.current,
  Link: ({ children, to, ...p }) => <a href={to} {...p}>{children}</a>,
}));

vi.mock("../services/api", () => ({
  scripts: { getById: vi.fn() },
}));

vi.mock("../components/TopNav", () => ({ default: () => <nav /> }));

// StoryBible has its own file; here it only needs to report what it was given.
vi.mock("../components/StoryBible", () => ({
  default: ({ scriptId, initial }) => (
    <div data-testid="bible" data-script-id={scriptId}
         data-logline={initial?.logline ?? ""} />
  ),
}));

// eslint-disable-next-line import/first
import ProjectSetup from "./ProjectSetup";
// eslint-disable-next-line import/first
import { scripts } from "../services/api";

const SCRIPT = {
  id: "script-1",
  bible: { logline: "A shopkeeper's daughter wants out." },
  project: {
    title: "Sapana", format: "short film", genre: "Drama",
    tone: "Emotional", target_audience: "Youth",
  },
};

beforeEach(() => {
  mockParams.current = { id: "script-1" };
  scripts.getById.mockResolvedValue({ data: SCRIPT });
});

describe("loading", () => {
  it("says it is loading before the script arrives", () => {
    scripts.getById.mockReturnValue(new Promise(() => {}));
    render(<ProjectSetup />);

    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("fetches by the id in the route", async () => {
    render(<ProjectSetup />);

    expect(await screen.findByTestId("bible")).toBeInTheDocument();
    expect(scripts.getById).toHaveBeenCalledWith("script-1");
  });

  it("says so when the project cannot be opened", async () => {
    scripts.getById.mockRejectedValue(new Error("404"));
    render(<ProjectSetup />);

    expect(await screen.findByText("Could not open this project.")).toBeInTheDocument();
  });

  it("stops saying Loading once it has failed", async () => {
    scripts.getById.mockRejectedValue(new Error("404"));
    render(<ProjectSetup />);

    await screen.findByText("Could not open this project.");
    expect(screen.queryByText("Loading…")).not.toBeInTheDocument();
  });
});

describe("the header", () => {
  it("titles the page with the project", async () => {
    render(<ProjectSetup />);

    expect(await screen.findByRole("heading", { name: "Sapana" })).toBeInTheDocument();
  });

  it("falls back to a generic title before the project is known", () => {
    scripts.getById.mockReturnValue(new Promise(() => {}));
    render(<ProjectSetup />);

    expect(screen.getByRole("heading", { name: "Project setup" })).toBeInTheDocument();
  });

  it("says what this is for and that the editor reads it", async () => {
    render(<ProjectSetup />);

    expect(await screen.findByText(/every time it generates or improves a scene/))
      .toBeInTheDocument();
  });

  it("offers a way back to the projects list", async () => {
    render(<ProjectSetup />);

    expect((await screen.findByText("← Projects")).closest("a"))
      .toHaveAttribute("href", "/dashboard");
  });
});

describe("the format parameters", () => {
  it("shows what the generator is working from", async () => {
    render(<ProjectSetup />);

    expect(await screen.findByText("short film")).toBeInTheDocument();
    expect(screen.getByText("Drama")).toBeInTheDocument();
    expect(screen.getByText("Emotional")).toBeInTheDocument();
    expect(screen.getByText("Youth")).toBeInTheDocument();
  });

  it("shows a dash for a parameter that was never set", async () => {
    scripts.getById.mockResolvedValue({
      data: { ...SCRIPT, project: { ...SCRIPT.project, tone: null } },
    });
    render(<ProjectSetup />);

    expect(await screen.findByText("—")).toBeInTheDocument();
  });

  it("hides the section entirely when there is no project", async () => {
    scripts.getById.mockResolvedValue({ data: { id: "script-1" } });
    render(<ProjectSetup />);

    await screen.findByTestId("bible");
    expect(screen.queryByText("Format")).not.toBeInTheDocument();
  });
});

describe("the story bible", () => {
  it("is given the SCRIPT id, which is what the route parameter actually is", async () => {
    // The bible is stored on the script row; the "projects" in the URL is
    // historical. Handing it a project id would save against the wrong row.
    render(<ProjectSetup />);

    expect(await screen.findByTestId("bible")).toHaveAttribute("data-script-id", "script-1");
  });

  it("is seeded with the bible already on the script", async () => {
    render(<ProjectSetup />);

    expect(await screen.findByTestId("bible"))
      .toHaveAttribute("data-logline", "A shopkeeper's daughter wants out.");
  });

  it("starts empty on a script that has none", async () => {
    scripts.getById.mockResolvedValue({ data: { id: "script-1", project: SCRIPT.project } });
    render(<ProjectSetup />);

    expect(await screen.findByTestId("bible")).toHaveAttribute("data-logline", "");
  });

  it("is not rendered at all when the script could not be loaded", async () => {
    scripts.getById.mockRejectedValue(new Error("404"));
    render(<ProjectSetup />);

    await screen.findByText("Could not open this project.");
    expect(screen.queryByTestId("bible")).not.toBeInTheDocument();
  });
});

it("goes on to the script", async () => {
  render(<ProjectSetup />);
  await screen.findByTestId("bible");

  fireEvent.click(screen.getByRole("button", { name: "Go to the script" }));

  expect(mockNavigate).toHaveBeenCalledWith("/projects/script-1/editor");
});
