import React from "react";
import { render, screen } from "@testing-library/react";

/**
 * The page a stranger sees (Month 4, Day 16).
 *
 * What is pinned here is what the page is FOR: it renders without an account,
 * makes one claim, offers one action (twice), keeps the legal documents one
 * click away, and gets out of a signed-in writer's way.
 */

let mockAuth = { isAuthenticated: false, isLoading: false };
let mockLang = "en";

vi.mock("react-router-dom", () => ({
  Link: ({ to, children, ...rest }) => <a href={to} {...rest}>{children}</a>,
  Navigate: ({ to }) => <span data-testid="redirect" data-to={to} />,
}));
vi.mock("../context/AuthContext", () => ({ useAuth: () => mockAuth }));
vi.mock("../i18n", async () => {
  const { STRINGS } = await vi.importActual("../i18n/strings");
  return {
    useT: () => (key) => (STRINGS[mockLang] && STRINGS[mockLang][key]) || key,
    useLanguage: () => ({ lang: mockLang, setLang: () => {} }),
    LANGUAGES: [{ code: "en", label: "English" }, { code: "ne", label: "नेपाली" }],
  };
});

// eslint-disable-next-line import/first
import LandingPage, { HERO_FLAGS, HERO_SCENE } from "./LandingPage";

beforeEach(() => {
  mockAuth = { isAuthenticated: false, isLoading: false };
  mockLang = "en";
  window.localStorage.clear();
});

describe("for a stranger", () => {
  it("renders without an account, with one claim as the only h1", () => {
    render(<LandingPage />);
    const h1s = screen.getAllByRole("heading", { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveTextContent("Screenwriting software that reads Nepali.");
    expect(screen.queryByTestId("redirect")).toBeNull();
  });

  it("repeats one action — sign-up — and nothing competes with it", () => {
    render(<LandingPage />);
    const signups = screen.getAllByRole("link", { name: /Start writing — free/ });
    expect(signups.length).toBe(2);
    signups.forEach((a) => expect(a).toHaveAttribute("href", "/register"));
  });

  it("keeps Terms and Privacy reachable without opening a menu", () => {
    render(<LandingPage />);
    expect(screen.getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/terms");
    expect(screen.getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy");
  });

  it("states only numbers that trace to a measurement", () => {
    /* 91.3% is eval_retrieval.py on real queries; 19 is lessons.py; 0 is the
       linter calling no model. A new number here needs a source first. */
    render(<LandingPage />);
    ["91.3%", "19", "0"].forEach((n) => expect(screen.getByText(n)).toBeInTheDocument());
  });

  it("shows no testimonial, user count or logo wall", () => {
    /* There are none yet, and an invented one costs more than it earns. */
    render(<LandingPage />);
    expect(screen.queryByText(/writers use|trusted by|used by|“/i)).toBeNull();
  });
});

describe("the hero", () => {
  it("shows the linter's two flags beside the lines they name", () => {
    render(<LandingPage />);
    HERO_FLAGS.forEach((f) => {
      expect(screen.getByText(f.message)).toBeInTheDocument();
      expect(screen.getByText(`→ ${f.technique}`)).toBeInTheDocument();
    });
    const flagged = HERO_SCENE.filter((l) => l.flag != null).map((l) => l.text);
    expect(flagged).toEqual(["तिमीले कहिल्यै मेरो साथ दिएनौ।", "(रिसाएर)"]);
    flagged.forEach((t) => expect(screen.getByText(t)).toHaveClass("landing-flagged"));
  });

  it("says the output is real", () => {
    render(<LandingPage />);
    expect(screen.getAllByText("Real output from the linter on this scene.").length).toBeGreaterThan(0);
  });
});

describe("in Nepali", () => {
  it("makes the claim in Nepali", () => {
    mockLang = "ne";
    render(<LandingPage />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("नेपाली पढ्ने पटकथा सफ्टवेयर।");
    expect(screen.getAllByRole("link", { name: "निःशुल्क लेख्न सुरु गर्नुहोस्" })).toHaveLength(2);
  });
});

describe("for a signed-in writer", () => {
  it("goes straight to their projects", () => {
    mockAuth = { isAuthenticated: true, isLoading: false };
    render(<LandingPage />);
    expect(screen.getByTestId("redirect")).toHaveAttribute("data-to", "/dashboard");
  });

  it("does not flash the sales page while a stored token is checked", () => {
    window.localStorage.setItem("token", "t");
    mockAuth = { isAuthenticated: false, isLoading: true };
    render(<LandingPage />);
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
  });

  it("shows the page to a visitor with no token while auth settles", () => {
    mockAuth = { isAuthenticated: false, isLoading: true };
    render(<LandingPage />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
  });
});
