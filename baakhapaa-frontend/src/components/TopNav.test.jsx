import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";

/**
 * The app shell's one navigation bar.
 *
 * Most of what is worth testing here is the account dropdown, and the reason is
 * in the component's own comment: the avatar used to log you out on a single
 * click. It is now a menu, which means it has the three behaviours every menu
 * needs and any of them can regress silently — opens, closes on an outside
 * click, closes on Escape. A menu that will not close is a menu that covers the
 * page.
 *
 * The other pinned detail is that `active` is matched against untranslated
 * English labels while the rendered text is translated. Matching on the
 * translated string would break the highlight the moment somebody switched to
 * Nepali — which is the language half this product exists for.
 */

const mockNavigate = vi.fn();
vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
  Link: ({ children, to, ...p }) => <a href={to} {...p}>{children}</a>,
}));

const mockAuth = { current: {} };
vi.mock("../context/AuthContext", () => ({
  useAuth: () => mockAuth.current,
}));

// PlanNotice renders above the nav and pulls in its own auth + Link. It has its
// own test file; here it is noise, so it is stubbed out entirely.
vi.mock("./PlanNotice", () => ({ default: () => null }));

// eslint-disable-next-line import/first
import TopNav from "./TopNav";

const logout = vi.fn();

beforeEach(() => {
  // Implementations must be installed here, not in the vi.mock factory:
  // `mockReset: true` in vite.config.js wipes them between tests.
  mockAuth.current = {
    user: { name: "Mira Shrestha", email: "mira@example.com", subscription_tier: "pro" },
    logout,
  };
});

// Found by its menu semantics rather than by the initials, so a test that
// changes the user's name does not have to change how the menu is opened.
const openMenu = () => {
  fireEvent.click(screen.getByRole("button", { expanded: false, hasPopup: "menu" }));
};

describe("the section highlight", () => {
  it("marks the active section", () => {
    render(<TopNav active="Learn" />);

    expect(screen.getByText("Learn").className).toContain("border-gold");
  });

  it("leaves the other sections unmarked", () => {
    render(<TopNav active="Learn" />);

    expect(screen.getByText("Projects").className).not.toContain("border-gold");
  });

  it("defaults to Projects", () => {
    render(<TopNav />);

    expect(screen.getByText("Projects").className).toContain("border-gold");
  });
});

describe("the account button", () => {
  it("shows the user's initials", () => {
    render(<TopNav />);

    expect(screen.getByRole("button", { name: "MS" })).toBeInTheDocument();
  });

  it("falls back to a question mark when there is no name", () => {
    mockAuth.current = { user: { email: "x@y.z" }, logout };
    render(<TopNav />);

    expect(screen.getByRole("button", { name: "?" })).toBeInTheDocument();
  });

  it("takes at most two initials", () => {
    mockAuth.current = { user: { name: "Ram Bahadur Kumar Thapa" }, logout };
    render(<TopNav />);

    expect(screen.getByRole("button", { name: "RB" })).toBeInTheDocument();
  });

  it("opens a menu rather than acting immediately", () => {
    render(<TopNav />);
    const button = screen.getByRole("button", { name: "MS" });

    expect(button).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(button);

    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(logout).not.toHaveBeenCalled();
  });
});

describe("closing the menu", () => {
  it("closes on a click outside it", () => {
    render(<TopNav />);
    openMenu();

    fireEvent.mouseDown(document.body);

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("stays open on a click inside it", () => {
    render(<TopNav />);
    openMenu();

    fireEvent.mouseDown(screen.getByRole("menu"));

    expect(screen.getByRole("menu")).toBeInTheDocument();
  });

  it("closes on Escape", () => {
    render(<TopNav />);
    openMenu();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("ignores other keys", () => {
    render(<TopNav />);
    openMenu();

    fireEvent.keyDown(document, { key: "a" });

    expect(screen.getByRole("menu")).toBeInTheDocument();
  });
});

describe("what the menu offers", () => {
  it("shows who is signed in", () => {
    render(<TopNav />);
    openMenu();

    expect(screen.getByText("Mira Shrestha")).toBeInTheDocument();
    expect(screen.getByText("mira@example.com")).toBeInTheDocument();
  });

  it("shows the current plan", () => {
    render(<TopNav />);
    openMenu();

    expect(screen.getByText("pro plan")).toBeInTheDocument();
  });

  it("says free when no tier is set, rather than showing nothing", () => {
    mockAuth.current = { user: { name: "New Person" }, logout };
    render(<TopNav />);
    openMenu();

    expect(screen.getByText("free plan")).toBeInTheDocument();
  });

  it("navigates to settings and closes", () => {
    render(<TopNav />);
    openMenu();

    fireEvent.click(screen.getByRole("menuitem", { name: "Settings" }));

    expect(mockNavigate).toHaveBeenCalledWith("/settings");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("navigates to pricing", () => {
    render(<TopNav />);
    openMenu();

    fireEvent.click(screen.getByRole("menuitem", { name: /Pricing/ }));

    expect(mockNavigate).toHaveBeenCalledWith("/pricing");
  });

  it("signs out only from the menu item", () => {
    render(<TopNav />);
    openMenu();

    fireEvent.click(screen.getByRole("menuitem", { name: "Sign out" }));

    expect(logout).toHaveBeenCalled();
  });
});

describe("language", () => {
  it("marks the current language as pressed", () => {
    render(<TopNav />);
    openMenu();

    // useLanguage degrades to "en" with no provider, which is the default.
    const english = screen.getByRole("button", { name: "English" });
    expect(english).toHaveAttribute("aria-pressed", "true");
  });

  it("offers Nepali by its own name, not the English word for it", () => {
    render(<TopNav />);
    openMenu();

    expect(screen.getByRole("button", { name: "नेपाली" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Nepali" })).not.toBeInTheDocument();
  });
});

describe("the right-hand region", () => {
  it("asks the command palette to open", () => {
    const listener = vi.fn();
    window.addEventListener("open-command-palette", listener);
    render(<TopNav />);

    fireEvent.click(screen.getByTitle(/Search/));

    expect(listener).toHaveBeenCalled();
    window.removeEventListener("open-command-palette", listener);
  });

  it("starts a new project", () => {
    render(<TopNav />);

    fireEvent.click(screen.getByRole("button", { name: "New project" }));

    expect(mockNavigate).toHaveBeenCalledWith("/projects/new");
  });

  it("hands the whole region over when `right` is given", () => {
    // The editor and storyboard screens pass their own dense toolbar.
    render(<TopNav right={<button>Export</button>} />);

    expect(screen.getByRole("button", { name: "Export" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "New project" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "MS" })).not.toBeInTheDocument();
  });
});
